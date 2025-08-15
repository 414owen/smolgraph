// Utilities
const SVG_NS = "http://www.w3.org/2000/svg";

const KEY_BAR_WIDTH = 24;
const KEY_BAR_PADDING = 8;
const KEY_BAR_HEIGHT = 3;
const CLASS_NAME = "smolgraph";
const LINE_WIDTH = 1;

// Minification-aware renaming
const VISIBILITY = "visibility";
const VISIBLE = "visible";
const MIDDLE = "middle";
const CLIENT_X = "clientX";
const CLIENT_Y = "clientY";
const TRANSFORM = "transform";
const M = Math;
const { abs, min, max, pow, floor} = M;
const len = a => a.length;
const isInt = n => Number.isInteger(n);
const flatmap = (arr, f) => arr.flatMap(f);
const map = (arr, f) => arr.map(f);
const push = (arr, el) => arr.push(el);
const doc = document;

const zip = (...args) =>
  map(args[0], (_, i) =>
    map(args, arg => arg[i])
  );

const unzip = arrs => zip(...arrs);

const formatTrackerLabel = (x, y) =>
    `(${formatTickValue(x)}, ${formatTickValue(y)})`;

const calculateNiceScale = (values, maxTicks = 10) => {
  if (len(values) === 0) {
    return { min: 0, max: 0, tickStep: 1, ticks: [0] };
  }

  const dataMin = min(...values);
  const dataMax = max(...values);
  const range = dataMax - dataMin;
  const roughStep = range / maxTicks;

  const exponent = floor(M.log10(roughStep));
  const fraction = roughStep / pow(10, exponent);

  const niceFraction = fraction <= 1 ? 1 : fraction <= 2 ? 2 : fraction <= 5 ? 5 : 10;
  const niceStep = niceFraction * pow(10, exponent);

  const niceMin = floor(dataMin / niceStep) * niceStep;
  const niceMax = M.ceil(dataMax / niceStep) * niceStep;

  const ticks = [];
  for (let t = niceMin; t <= niceMax + 1e-9; t += niceStep) {
    push(ticks, parseFloat(t.toFixed(12)));
  }

  return { min: niceMin, max: niceMax, tickStep: niceStep, ticks };
};

const setAttr = (el, k, v) => {
  el.setAttribute(k, v);
};

const setAttrs = (el, attrs) => {
  for (const k in attrs) {
    setAttr(el, k, attrs[k]);
  }
};

const addChild = (el, child) => {
  el.appendChild(child);
};

const addChildren = (el, children) => {
  for (const child of children) {
    addChild(el, child);
  }
};

const el = (tag, attrs = {}, children = []) => {
  const el = doc.createElementNS(SVG_NS, tag);
  setAttrs(el, attrs);
  addChildren(el, children);
  return el;
}

const text = (content, attrs = {}) => {
  const res = el("text", attrs);
  res.textContent = content;
  return res;
};

const createScale = (domainMin, domainMax, rangeMin, rangeMax) =>
  (value) => rangeMin + ((value - domainMin) / (domainMax - domainMin)) * (rangeMax - rangeMin);

const isStr = a => typeof a === "string";

const formatTickValue = value => isStr(value) ? value :
  (isInt(value) ? `${value}` : `${value.toFixed(3)}`);

const mkTickLine = (x1, y1, x2, y2) =>
  el('line', {
    class: 'tick',
    x1, y1, x2, y2,
  });

const mkTickLabel = (textValue, x, y, anchor) =>
  text(textValue, {
    class: 'tick-label',
    x, y,
    'text-anchor': anchor,
  });

const genColors = data => map(data, (_, n) => `hsl(${n * 360 / len(data) + 80},40%,60%)`);

const rect = (x, y, width, height, rest = {}) =>
  el("rect", {x, y, width, height, ...rest});

const boundData = (origData, minX, maxX, xIsStringy) =>
  map(structuredClone(origData), ({data,label}) => ({
    label,
    data: xIsStringy
      ? data.slice(minX, maxX)
      : data.filter(([x, _]) => x >= minX && x <= maxX)
  }));

const addEv = (el, name, handler) => {
  el.addEventListener(name, e => {
    handler(e);
    e.preventDefault();
    e.stopPropagation();
  }, { passive: false });
};

const debounce = (f, timeout) => {
  let timer;
  return (...args) => {
    clearTimeout(timer)
    timer = setTimeout(() => {
    	f.apply(this, args)
    }, timeout);
  };
};

const justClass = className => ({"class": className});

export const drawGraph = (config) => {
  const { data } = config;

  const xIsStringy = isStr(data[0].data[0][0]);

  const {
    width = 800,
    height = 500,
    lineColors = genColors(data),
    maxTicks = {x: 15, y: 10},
    loadData,
    axisLabels = {x: "X", y: "Y"},
    fontSize,
  } = config;

  const svg = el("svg", {
    xmlns: SVG_NS,
    viewBox: `0 0 ${width} ${height}`,
    "class": CLASS_NAME
  });

  // So we can use getBBox
  addChild(doc.body, svg);

  const testText = text("test");
  addChild(svg, testText);
  const {width: testTextWidth, height: CHAR_HEIGHT } = testText.getBBox();
  const CHAR_WIDTH = testTextWidth/4;
  const KEY_VSPACE = CHAR_HEIGHT * 1.4;
  const TEXT_CENTER_OFFSET = CHAR_HEIGHT * 0.3;
  const TEXT_TOP_OFFSET = CHAR_HEIGHT * 0.8;

  const dataStack = [data];
  const tickWidth = tick => CHAR_WIDTH * len(formatTickValue(tick));

  const projectLink = el('a', {
      href: "https://github.com/414owen/smolgraph"
    }, [
      text("smolgraph", {
        x: CHAR_WIDTH,
        y: height - CHAR_WIDTH
      })
    ]
  );

  addEv(svg, "dblclick", (ev) => {
    if (len(dataStack) > 1) {
      dataStack.pop()
    }
    drawGraphData();
  });

  const zoomOutButton = text("reset zoom", justClass("zoom-out"));

  addEv(zoomOutButton, "click", () => {
    dataStack.splice(1);
    drawGraphData();
  });

  const drawGraphData = () => {
    svg.innerHTML = "";

    const data = dataStack.at(-1);
    const dataSeries = map(data, d => d.data);
    const lineLabels = map(data, d => d.label);

    let xValues;
    if (xIsStringy) {
      xValues = map(dataSeries[0], (_, i) => i);
      xValues.sort((a, b) => a - b);
    } else {
       xValues = [...new Set(flatmap(dataSeries, d => map(d, a => a[0])))];
    }

    const firstSeries = dataSeries[0];
    const xLabel = xValue => xIsStringy
      ? (xValue < len(firstSeries) && isInt(xValue)
        ? firstSeries[xValue][0]
        : "")
      : xValue;

    const ySeries = map(dataSeries, d => map(d, a => a[1]));
    const yValues = ySeries.flat();
    const minX = min(...map(dataSeries, a => a[0]));
    const maxX = max(...map(dataSeries, a => a.at(-1)));

    // Calculate scales
    const xScaleData = calculateNiceScale(xValues, maxTicks.x);
    if (xIsStringy) {
      xScaleData.ticks = map(xScaleData.ticks, xLabel);
    }
    const yMin = min(...yValues);
    const yMax = max(...yValues);
    const yScaleData = calculateNiceScale([yMin, yMax], maxTicks.y);

    const marginLeft = CHAR_HEIGHT + CHAR_WIDTH * 3 + max(tickWidth(yScaleData.min), tickWidth(yScaleData.max));
    const marginRight = tickWidth(xLabel(xScaleData.max)) / 2 + CHAR_WIDTH;
    const marginTop = CHAR_HEIGHT/2 + CHAR_WIDTH;
    const marginBottom = CHAR_HEIGHT * 2 + CHAR_WIDTH * 3;

    const innerWidth = width - marginLeft - marginRight;
    const innerHeight = height - marginTop - marginBottom;

    const scaleXNum = createScale(xScaleData.min, xScaleData.max, marginLeft, marginLeft + innerWidth);
    const scaleX = xIsStringy ? ((x, i) => scaleXNum(i)) : scaleXNum;
    const scaleY = createScale(yScaleData.min, yScaleData.max, marginTop + innerHeight, marginTop);

    setAttrs(zoomOutButton, {
      x: marginLeft + innerWidth - CHAR_WIDTH,
      y: marginTop + CHAR_HEIGHT
    });

    const trackerLayer = el('g', justClass("tracker"));
    const trackerEls = map(data, () => {
      const line = el('line');
      const dot = el('circle', {
        r: 4,
      });
      addChildren(trackerLayer, [line, dot]);
      return {line, dot};
    });

    const [hlines, hlabels] = unzip(map(yScaleData.ticks, tick => {
      const y = scaleY(tick);
      const line = mkTickLine(marginLeft, y, marginLeft + innerWidth, y);

      const label = formatTickValue(tick);
      const labelEl = mkTickLabel(label, marginLeft - CHAR_WIDTH, y + TEXT_CENTER_OFFSET, 'end');
      return [line, labelEl];
    }));


    const [vlines, vlabels] = unzip(map(xScaleData.ticks, (tick, i) => {
      const x = scaleX(tick, i * xScaleData.tickStep);
      const line = mkTickLine(x, marginTop, x, marginTop + innerHeight);

      const label = formatTickValue(tick);
      const labelEl = mkTickLabel(label, x, TEXT_TOP_OFFSET + marginTop + innerHeight + CHAR_WIDTH, MIDDLE);
      return [line, labelEl];
    }));

    addChildren(svg, vlines);
    addChildren(svg, hlines);
    addChildren(svg, vlabels);
    addChildren(svg, hlabels);

    // Draw axis labels
    const textAnchor = MIDDLE;
    addChild(svg, text(axisLabels.x, {
      x: marginLeft + innerWidth / 2,
      // y: height - CHAR_WIDTH,
      y: marginTop + TEXT_TOP_OFFSET + innerHeight + CHAR_WIDTH * 2 + CHAR_HEIGHT,
      textAnchor,
    }));
    {
      const x = 20;
      const y = marginTop + innerHeight / 2;
      addChild(svg, text(axisLabels.y, {
        textAnchor,
        [TRANSFORM]: `translate(${x},${y}) rotate(-90)`
      }))
    }

    // Draw data lines
    const pathGroup = el("g", justClass("paths"), data.map(({data: points}, idx) => {
      const [x, y] = points[0];
      const initial = `M${scaleX(x, 0)},${scaleY(y)}`;
      const rest = map(points.slice(1), ([x, y], i) => `L${scaleX(x, i + 1)},${scaleY(y)}`);
      const linePath = initial + rest.join('');
      return el('path', {
        d: linePath, fill: 'none', stroke: lineColors[idx % len(lineColors)], 'stroke-width': LINE_WIDTH
      });
    }));

    addChild(svg, el("g", {
      "clip-path": `inset(${marginTop} ${marginRight} ${marginBottom} ${marginLeft}) view-box`,
    }, [pathGroup]));

    // Implement hover interaction

    const applyTransform = () => {
      setAttrs(pathGroup, {
        [TRANSFORM]: `scale(${currentScale} 1) translate(${currentXOffset} 0)`
      });
    };

    const zoomAt = (focalScreenX, nextScale) => {
      const oldX = focalScreenX / currentScale;
      currentScale = nextScale;
      const newX = focalScreenX / currentScale;
      currentXOffset += newX - oldX;
      applyTransform();
      loadNewData();
    };
    const clamp = (v, min, max) => Math.max(min, Math.min(max, v));
    const clampScale = s => clamp(s, 0.05, 200);

    const overlay = rect(
      0, marginTop, width, innerHeight,
      justClass("overlay")
    );
    overlay.focus();

    const hideTrackers = () => {
      for (const child of trackerLayer.children) {
        hide(child);
      }
    };

    const overlayEv = (name, handler) => addEv(overlay, name, handler);

    const limitX = x => min(max(x, marginLeft), marginLeft + innerWidth);

    // Gets the X position, limited to the graphing area...
    const getScreenPosition = event => {
      const domPoint = new DOMPointReadOnly(event[CLIENT_X], event[CLIENT_Y])
      return limitX(domPoint.matrixTransform(svg.getScreenCTM().inverse()).x)
    };

    const xToPoint = x =>
      xScaleData.min + (x - marginLeft) / innerWidth * (xScaleData.max - xScaleData.min);

    let xScreenPos = marginLeft;
    let currentScale = 1;
    let currentXOffset = 0;
    let timesScaled = 0;

    const loadNewData = debounce(async () => {
      const rightScreenX = marginLeft + innerWidth;

      // Invert element transform (scale(...) translate(...)):
      const leftUntransformed  = (marginLeft / currentScale) - currentXOffset;
      const rightUntransformed = (rightScreenX / currentScale) - currentXOffset;

      // Convert SVG x’s to data-domain values
      const minXVisible = xToPoint(leftUntransformed);
      const maxXVisible = xToPoint(rightUntransformed);

      const expectedTimesScaled = timesScaled;

      const boundedData = boundData(data, minXVisible, maxXVisible, xIsStringy)
      if (expectedTimesScaled !== timesScaled || len(boundedData[0].data) < 2) return;
      push(dataStack, boundedData);
      drawGraphData();

      if (!loadData) return;
      const newData = await loadData(minXVisible, maxXVisible);
      if (expectedTimesScaled !== timesScaled || len(newData[0].data) < 2) return;
      push(dataStack, newData);
      drawGraphData();
    }, 300);

    // Mobile support
    let gestureStartScale = null;
    let gestureFocalX = null;

    overlayEv("gesturestart", e => {
      gestureStartScale = currentScale;
      gestureFocalX = getScreenPosition(e);
    });

    overlayEv("gesturechange", e => {
      if (gestureStartScale == null) return;
      const next = clampScale(gestureStartScale * e.scale);
      zoomAt(gestureFocalX, next);
    });

    overlayEv("gestureend", () => {
      gestureStartScale = null;
      gestureFocalX = null;
    });


    let touchStateActive = false;
    let touchStateStartDist = 0;
    let touchStateStartScale = 1;
    let touchStateFocalX = 0;

    const touchDistance = (t0, t1) => {
      const dx = t0[CLIENT_X] - t1[CLIENT_X];
      const dy = t0[CLIENT_Y] - t1[CLIENT_Y];
      return Math.hypot(dx, dy);
    };

    const touchCenterX = (t0, t1) => (t0[CLIENT_X] + t1[CLIENT_X]) / 2;

    overlayEv("touchstart", e => {
      const touches = e.touches;
      if (len(touches) === 2) {
        touchStateActive = true;
        touchStateStartDist = touchDistance(touches[0], touches[1]);
        touchStateStartScale = currentScale;
        touchStateFocalX = getScreenPosition({
          [CLIENT_X]: touchCenterX(touches[0], touches[1]),
          [CLIENT_Y]: (touches[0][CLIENT_Y] + touches[1][CLIENT_Y]) / 2
        });
      }
    });

    overlayEv("touchmove", e => {
      const touches = e.touches;
      if (touchStateActive && len(touches) === 2) {
        const dist = touchDistance(touches[0], touches[1]);
        const factor = dist / touchStateStartDist;
        const next = clampScale(touchStateStartScale * factor);
        zoomAt(touchStateFocalX, next);
      }
    });

    overlayEv("touchend", (e) => {
      if (e.touches.length < 2) {
        touchStateActive = false;
      }
    });

    overlayEv("touchcancel", () => {
      touchStateActive = false;
    });

    // Scroll support
    overlayEv("wheel", async event => {
      timesScaled += 1;
      updateTracker(event);
      xScreenPos = getScreenPosition(event);

      const zoomFactor = 1.15;
      const oldX = xScreenPos / currentScale;
      if (event.wheelDelta > 0) {
        currentScale *= zoomFactor;
      } else {
        currentScale /= zoomFactor;
      }
      const newX = xScreenPos / currentScale;
      currentXOffset += newX - oldX;
      setAttr(
        pathGroup,
        TRANSFORM,
        `scale(${currentScale} 1) translate(${currentXOffset} 0)`
      );
      loadNewData();
    });

    const updateTracker = (event, ...args) => {
      hideTrackers();
      xScreenPos = getScreenPosition(event);

      const xValue = xToPoint(xScreenPos);

      const xLines = new Set();
      const positions = [];
      for (let i = 0; i < len(data); i++) {
        const {data: points} = data[i];
        const {line, dot} = trackerEls[i];

        const prevIndex = xIsStringy
          ? min(floor(xValue), len(firstSeries) - 1)
          : binarySearch(points, ([x]) => x - xValue);
        const nextIndex = min(len(points) - 1, prevIndex + 1);

        const [prevValue, nextValue] = xIsStringy
          ? [prevIndex, nextIndex]
          : [points[prevIndex][0], points[nextIndex][0]];

        const [nearestIndex, nearestValue] =
          abs(xValue - prevValue) < abs(xValue - nextValue)
          ? [prevIndex, prevValue]
          : [nextIndex, nextValue];

        const xPos = scaleX(points[nearestIndex][0], nearestIndex);
        const yPos = scaleY(points[nearestIndex][1]);

        if (xLines.has(xPos)) {
          hide(line);
        } else {
          setAttrs(line, {
            x1: xPos,
            y1: marginTop,
            x2: xPos,
            y2: marginTop + innerHeight,
            [VISIBILITY]: VISIBLE,
          });
          xLines.add(xPos);
        }

        setAttrs(dot, {
          cx: xPos,
          cy: yPos,
        });
        showhide(dot, !timesScaled);

        push(positions, [nearestValue, points[nearestIndex][1]]);
      }

      updateKeyWithPositions(positions);
    };

    overlayEv('mousemove', updateTracker);

    overlayEv('mouseout', () => {
      hideTrackers();
      updateKey(lineLabels);
    });

    const keyRect = rect(
      marginLeft,
      marginTop,
      0,
      KEY_VSPACE * (len(lineLabels) + 0.5),
      justClass("key")
    );

    const keyTexts = []
    const keyLayer = el("g", justClass("key"), [
      keyRect,
      ...flatmap(lineLabels, (keyLabel, i) => {
        const y = marginTop + KEY_VSPACE * (i + 1);
        const textEl = text(keyLabel, {
          y,
          x: marginLeft + KEY_BAR_WIDTH,
        });
        push(keyTexts, textEl);
        return [
          textEl,
          rect(
            marginLeft + KEY_BAR_PADDING / 2,
            y - CHAR_HEIGHT / 3 - KEY_BAR_HEIGHT / 2,
            KEY_BAR_WIDTH - KEY_BAR_PADDING,
            KEY_BAR_HEIGHT,
            {fill: lineColors[i]}
          )
        ];
      }),
    ]);

    const updateKeyRect = (maxKeyChars) => {
      setAttr(keyRect, "width", KEY_BAR_WIDTH + KEY_BAR_PADDING/2 + CHAR_WIDTH * maxKeyChars);
    };

    const maxLabelLen = max(...map(lineLabels, k => len(k)));
    const updateKey = keyLabels => {
      for (const [el, label] of zip(keyTexts, keyLabels)) {
        el.textContent = label;
      }
      updateKeyRect(maxLabelLen);
    };
    updateKeyRect(maxLabelLen);

    const keyWithPositions = (positions) =>
      map(
        zip(lineLabels, positions),
        ([label, [x, y]]) => `${label.padEnd(maxLabelLen)}  ${formatTrackerLabel(xLabel(x), y)}`
      );

    // With tracker positions
    const updateKeyWithPositions = positions => {
      updateKey(keyWithPositions(positions));
      updateKeyRect(max(...map(keyTexts, el => el.getNumberOfChars())));
    };

    addChildren(svg, [trackerLayer, keyLayer, overlay, projectLink, zoomOutButton]);
    hideTrackers();
  };
  drawGraphData();

  svg.remove();

  return svg;
};

const hide = el => {
  setAttr(el, VISIBILITY, "hidden");
};

const show = el => {
  setAttr(el, VISIBILITY, VISIBLE);
};

const showhide = (el, visible) => {
  if (visible) {
    show(el);
  } else {
    hide(el);
  }
};

const binarySearch = (values, f) => {
  const l = len(values);
  let pos = 0;
  let step = l;
  while (step > 0) {
    while (pos + step < l && f(values[pos + step]) < 0) {
      pos += step;
    }
    step = floor(step / 2);
  }
  return pos;
};
