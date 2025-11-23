// SPDX-License-Identifier: MIT

// Minification-aware renaming
const SMOLGRAPH = "smolgraph";
const CLICK = "click";
const GESTURE = "gesture";
const TOUCH = "touch";
const VISIBILITY = "visibility";
const VISIBLE = "visible";
const MIDDLE = "middle";
const CLIENT_X = "clientX";
const CLIENT_Y = "clientY";
const TRANSFORM = "transform";
const HIDDEN = "hidden";
const CLASS = "class";

// Utilities
const { abs, min, max, pow, floor} = Math;
const len = a => a.length;
const flatmap = (arr, f) => arr.flatMap(f);
const map = (arr, f) => arr.map(f);
const push = (arr, el) => arr.push(el);
const isInt = n => Number.isInteger(n);
const id = a => a;

const zip = (...args) =>
  map(args[0], (_, i) =>
    map(args, arg => arg[i])
  );

const unzip = arrs => zip(...arrs);

const isStr = a => typeof a === "string";

const formatTickValue = value => isStr(value) ? value :
  (isInt(value) ? `${value}` : `${+value.toFixed(3)}`);

const formatTrackerLabel = (point, formatXValue) =>
    `(${formatTickValue(formatXValue(point.x))}, ${formatTickValue(point.y)})`;

const maximum = arr => arr.reduce((a, b) => max(a, b));
const bounds = arr => [arr.reduce((a, b) => min(a, b)), maximum(arr)];

const calculateNiceScale = (values, maxTicks = 10) => {
  if (len(values) === 0) {
    return { minimum: 0, maximum: 0, tickStep: 1, ticks: [0] };
  }

  const [dataMin, dataMax] = bounds(values);
  const range = dataMax - dataMin;
  const roughStep = range / maxTicks;

  const exponent = floor(Math.log10(roughStep));
  const fraction = roughStep / pow(10, exponent);

  const niceFraction = fraction <= 1 ?
    1 :
    fraction <= 2 ?
      2 :
      fraction <= 5 ?
        5 :
        10;

  const niceStep = niceFraction * pow(10, exponent);

  if (niceStep === 0) {
    return;
  }

  const niceMin = floor(dataMin / niceStep) * niceStep;
  const niceMax = Math.ceil(dataMax / niceStep) * niceStep;

  const ticks = [];
  for (let t = niceMin; t <= niceMax + 1e-9; t += niceStep) {
    push(ticks, +t.toFixed(12));
  }

  return { minimum: niceMin, maximum: niceMax, tickStep: niceStep, ticks };
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
  const elem = document.createElementNS("http://www.w3.org/2000/svg", tag);
  setAttrs(elem, attrs);
  addChildren(elem, children);
  return elem;
};

const text = (content, attrs = {}) => {
  const res = el("text", attrs);
  res.textContent = content;
  return res;
};

const createScale = (domainMin, domainMax, rangeMin, rangeMax) => value =>
  rangeMin + ((value - domainMin) / (domainMax - domainMin)) * (rangeMax - rangeMin);

const mkTickLine = (x1, y1, x2, y2) =>
  el("line", {
    [CLASS]: "tick",
    x1, y1, x2, y2,
  });

const mkTickLabel = (textValue, x, y, anchor, axis) =>
  text(textValue, {
    [CLASS]: `tick-label ${axis}`,
    x, y,
    "text-anchor": anchor,
  });

const genColors = data => map(data, (_, n) => `hsl(${n * 360 / len(data) + 80},40%,60%)`);

const rect = (x, y, width, height, rest = {}) =>
  el("rect", {x, y, width, height, ...rest});

const boundData = (origData, minX, maxX) => {
  const bounded = map(origData, ({data, label}) => ({
    label,
    data: data.filter(({x}) => x >= minX && x <= maxX)
  }));
  bounded.visibleMin = minX;
  bounded.visibleMax = maxX;
  return bounded;
};

const addEv = (elem, name, handler) => {
  elem.addEventListener(name, e => {
    handler(e);
    e.preventDefault();
    e.stopPropagation();
  }, { passive: false });
};

const debounce = (f, timeout) => {
  let timer;
  return (...args) => {
    clearTimeout(timer);
    timer = setTimeout(() => {
    	f.apply(this, args);
    }, timeout);
  };
};

const hide = elem => {
  setAttr(elem, VISIBILITY, HIDDEN);
};

const binarySearch = (values, f) => {
  const l = len(values);
  let pos = 0;
  for (let step = l; step > 0; step = floor(step / 2)) {
    while (pos + step < l && f(values[pos + step]) < 0) {
      pos += step;
    }
  }
  return pos;
};

// If x is stringy, sets x to a number
// returns the label accessor for x
const normalizeData = data => {
  const isStringy = isStr(data[0].data[0].x);
  if (!isStringy) {
    return id;
  }

  const xLabels = [];

  for (const series of data) {
    let i = 0;
    for (const point of series.data) {
      if (i >= len(xLabels)) {
        xLabels[i] = point.x;
      }
      point.x = i++;
    }
  }

  return value => xLabels[value] || "";
};

// Global mutable state. Sue me.
// We need to differentiate these IDs between calls.
let clipPathCounter = 0;
let dataLoadSentinel = 0;

export const drawGraph = config => {
  const data = structuredClone(config.data);

  const {
    width = 800,
    height = 500,
    lineColors = genColors(data),
    maxTicks = {x: 15, y: 10},
    loadData,
    axisLabels = {x: "X", y: "Y"},
    onClick,
    KEY_BAR_WIDTH = 8,
    KEY_BAR_RPAD = 8,
    KEY_BAR_HEIGHT = 3,
    LINE_WIDTH = 1,
  } = config;

  const formatXValue = normalizeData(data);

  const svg = el("svg", {
    viewBox: `0 0 ${width} ${height}`,
    [CLASS]: SMOLGRAPH
  });

  // So we can use getBBox
  addChild(document.body, svg);

  const testText = text("test");
  addChild(svg, testText);
  const {width: testTextWidth, height: CHAR_HEIGHT } = testText.getBBox();

  // Try to prevent further layout calls
  svg.remove();
  const CHAR_WIDTH = testTextWidth/4;
  const KEY_PAD = CHAR_HEIGHT / 2;
  const TEXT_CENTER_OFFSET = CHAR_HEIGHT * 0.3;

  // Estimate of the height of capital letters...
  const TEXT_TOP_OFFSET = CHAR_HEIGHT * 0.6;

  const dataStack = [data];
  const tickWidth = tick => CHAR_WIDTH * len(formatTickValue(tick));

  const zoomOutButton = text("reset zoom", {[CLASS]: "zoom-out"});

  const clamp = (value, low, high) => min(max(value, low), high);
  const drawGraphData = (data = dataStack.at(-1)) => {
    const projectLink = el("a", {
        href: `https://github.com/414owen/${SMOLGRAPH}`
      }, [
        text(SMOLGRAPH, {
          x: CHAR_WIDTH,
          y: height - CHAR_WIDTH
        })
      ]
    );

    const [lineLabels, dataSeries] = unzip(map(data, d => [d.label, d.data]));

    const xValues = [...new Set(flatmap(dataSeries, d => map(d, a => a.x)))];

    const yValues = flatmap(dataSeries, d => map(d, a => a.y));

    const xScaleData = calculateNiceScale(xValues, maxTicks.x);
    if (!xScaleData) {
      return;
    }
    const yScaleData = calculateNiceScale(yValues, maxTicks.y);

    const marginLeft = CHAR_HEIGHT + CHAR_WIDTH * 3 +
      maximum(map(yScaleData.ticks, tickWidth));
    const marginRight = tickWidth(formatXValue(xScaleData.maximum)) / 2 + CHAR_WIDTH;

    const marginTop = CHAR_HEIGHT / 2 + CHAR_WIDTH;
    const marginBottom = CHAR_HEIGHT * 2 + CHAR_WIDTH * 3;

    const innerWidth = width - marginLeft - marginRight;
    const innerHeight = height - marginTop - marginBottom;

    const chartRight = marginLeft + innerWidth;
    const chartBottom = marginTop + innerHeight;

    const scaleX = createScale(xScaleData.minimum, xScaleData.maximum, marginLeft, chartRight);
    const scaleY = createScale(yScaleData.minimum, yScaleData.maximum, chartBottom, marginTop);



    // Zoomed in/out too far, can't guarantee correctness.
    if (abs(xValues[0] - xValues.at(-1)) < 1e-10 ||
      abs(xValues[0] - xValues.at(-1)) > 1e12) {
      return;
    }

    svg.innerHTML = "";

    {
      const mkTicks = (
        ticks,
        tickLabel,
        scaleFn,
        lineCoordsFn,
        labelPosFn,
        anchor,
        axis
      ) =>
        unzip(map(ticks, (tick, i) => {
          const pos = scaleFn(tick, i);
          const line = mkTickLine(...lineCoordsFn(pos));
          const label = mkTickLabel(
            formatTickValue(tickLabel(tick)),
            ...labelPosFn(pos),
            anchor,
            axis
          );
          return [line, label];
        }));

      const TICK_Y = chartBottom + TEXT_TOP_OFFSET + CHAR_WIDTH;
      const [ylines, ylabels] = mkTicks(
        yScaleData.ticks,
        id,
        tick => scaleY(tick),
        y => [marginLeft, y, chartRight, y],
        y => [marginLeft - CHAR_WIDTH, y + TEXT_CENTER_OFFSET],
        "end",
        "y"
      );

      const [xlines, xlabels] = mkTicks(
        xScaleData.ticks,
        formatXValue,
        tick => scaleX(tick),
        x => [x, marginTop, x, chartBottom],
        x => [x, TICK_Y],
        MIDDLE,
        "x"
      );

      addChildren(svg, xlines);
      addChildren(svg, ylines);
      addChildren(svg, xlabels);
      addChildren(svg, ylabels);

      // Draw axis labels
      const y = marginTop + innerHeight / 2;
      addChildren(svg, [
        text(axisLabels.x, {
          x: marginLeft + innerWidth / 2,
          y: TICK_Y + CHAR_WIDTH + CHAR_HEIGHT,
          "text-anchor": MIDDLE,
        }), 
        text(axisLabels.y, {
          "text-anchor": MIDDLE,
          [TRANSFORM]: `translate(${CHAR_HEIGHT},${y}) rotate(-90)`
        })
      ]);
    }

    setAttrs(zoomOutButton, {
      x: chartRight - CHAR_WIDTH,
      y: marginTop + CHAR_HEIGHT
    });

    const trackerLayer = el("g", {[CLASS]: "tracker"});
    const trackerEls = map(data, () => {
      const line = el("line");
      const dot = el("circle", {
        r: 4,
      });
      addChildren(trackerLayer, [line, dot]);
      return {line, dot};
    });

    const pathGroup = el("g", {[CLASS]: "paths"}, map(dataSeries, (points, idx) => {
      const {x: firstX, y: firstY} = points[0];
      const initial = `M${scaleX(firstX)},${scaleY(firstY)}`;
      const rest = map(points.slice(1), ({x, y}) => `L${scaleX(x)},${scaleY(y)}`);
      const linePath = initial + rest.join("");
      return el("path", {
        d: linePath,
        fill: "none",
        stroke: lineColors[idx % len(lineColors)],
        "stroke-width": LINE_WIDTH
      });
    }));

    addChildren(svg, [
      el("defs", {}, [
        el("clipPath", {id: `${SMOLGRAPH}-clip-${clipPathCounter}`}, [
          el("path", {
            d: `M${marginLeft},${marginTop}h${innerWidth}v${innerHeight}h-${innerWidth}`
          })
        ])
      ]),
      el("g", {
        "clip-path": `url(#${SMOLGRAPH}-clip-${clipPathCounter++})`,
      }, [pathGroup])
    ]);

    const overlay = rect(
      0, marginTop, width, innerHeight,
      {[CLASS]: "overlay"}
    );

    const hideTrackers = () => {
      for (const child of trackerLayer.children) {
        hide(child);
      }
    };

    const keyRect = rect(
      marginLeft,
      marginTop,
      0,
      KEY_PAD * 2 + TEXT_TOP_OFFSET + CHAR_HEIGHT * (len(lineLabels) - 1),
      {[CLASS]: "key"}
    );

    const updateKeyRect = (maxKeyChars) => {
      setAttr(keyRect, "width", KEY_PAD * 2 + KEY_BAR_WIDTH + KEY_BAR_RPAD + CHAR_WIDTH * maxKeyChars);
    };

    const maxLabelLen = max(...map(lineLabels, len));
    const keyTexts = [];

    const updateKey = keyLabels => {
      for (const [elem, label] of zip(keyTexts, keyLabels)) {
        elem.textContent = label;
      }
      updateKeyRect(maxLabelLen);
    };

    const updateKeyWithPositions = positions => {
      const labels = map(zip(lineLabels, positions),
        ([label, pt]) =>
          `${label.padEnd(maxLabelLen)}  ${formatTrackerLabel(pt, formatXValue)}`
      );
      updateKey(labels);
      updateKeyRect(max(...map(labels, len)));
    };

    const keyLayer = el("g", {[CLASS]: "key"}, [
      keyRect,
      ...flatmap(lineLabels, (keyLabel, i) => {
        const y = marginTop + KEY_PAD + TEXT_TOP_OFFSET + CHAR_HEIGHT * i;
        const textEl = text(keyLabel, {
          y,
          x: marginLeft + KEY_PAD + KEY_BAR_WIDTH + KEY_BAR_RPAD,
        });
        push(keyTexts, textEl);
        return [
          textEl,
          rect(
            marginLeft + KEY_PAD,
            y - CHAR_HEIGHT / 4 - KEY_BAR_HEIGHT / 2,
            KEY_BAR_WIDTH,
            KEY_BAR_HEIGHT,
            {fill: lineColors[i]}
          )
        ];
      }),
    ]);

    updateKeyRect(maxLabelLen);

    const overlayEv = (name, handler) => addEv(overlay, name, handler);

    const limitX = x => clamp(x, marginLeft, chartRight);

    const getScreenPosition = event => {
      const domPoint = new DOMPointReadOnly(event[CLIENT_X], event[CLIENT_Y]);
      return limitX(domPoint.matrixTransform(svg.getScreenCTM().inverse()).x);
    };

    const xToPoint = x =>
      xScaleData.minimum + (x - marginLeft) / innerWidth * (xScaleData.maximum - xScaleData.minimum);

    let xScreenPos = marginLeft;
    let timesScaled = 0;

    const getNearestIndices = () => {
      const xValue = xToPoint(xScreenPos);
      return map(dataSeries, (points) => {
        const prevIndex = binarySearch(points, ({x}) => x - xValue);
        const nextIndex = min(len(points) - 1, prevIndex + 1);

        const prevX = points[prevIndex].x;
        const nextX = points[nextIndex].x;

        return abs(xValue - prevX) < abs(xValue - nextX) ?
          prevIndex :
          nextIndex;
      });
    };

    const updateTracker = event => {
      hideTrackers();
      xScreenPos = getScreenPosition(event);

      const xLines = new Set();
      const positions = [];
      const tups = zip(dataSeries, trackerEls, getNearestIndices());
      for (const [series, {line, dot}, nearestIndex] of tups) {

        const xPos = scaleX(series[nearestIndex].x);
        const yPos = scaleY(series[nearestIndex].y);

        if (xLines.has(xPos)) {
          hide(line);
        } else {
          setAttrs(line, {
            x1: xPos,
            y1: marginTop,
            x2: xPos,
            y2: chartBottom,
            [VISIBILITY]: VISIBLE,
          });
          xLines.add(xPos);
        }

        setAttrs(dot, {
          cx: xPos,
          cy: yPos,
          [VISIBILITY]: timesScaled ? HIDDEN : VISIBLE,
        });

        push(positions, series[nearestIndex]);
      }

      updateKeyWithPositions(positions);
    };

    let currentScale = 1;
    let currentXOffset = 0;

    const loadNewData = debounce(async () => {
      const leftUntransformed  = (marginLeft / currentScale) - currentXOffset;
      const rightUntransformed = (chartRight / currentScale) - currentXOffset;

      const minXVisible = xToPoint(leftUntransformed);
      const maxXVisible = xToPoint(rightUntransformed);

      const expectedTimesScaled = timesScaled;

      const boundedData = boundData(
        loadData ? data : dataStack[0],
        minXVisible,
        maxXVisible
      );
      if (
        expectedTimesScaled === timesScaled &&
        len(boundedData[0].data) >= 2 &&
        (!loadData || len(boundedData[0].data) < len(data[0].data))
      ) {
        drawGraphData(boundedData);
      }

      if (!loadData) {
        push(dataStack, boundedData);
        return;
      }
      let expectedDataLoadSentinel = ++dataLoadSentinel;
      const newData = await loadData(minXVisible, maxXVisible);
      if (dataLoadSentinel !== expectedDataLoadSentinel ||
          expectedTimesScaled !== timesScaled ||
          len(newData[0].data) < 2) {
        return;
      }
      push(dataStack, newData);
      drawGraphData();
    }, 300);

    /// Helper used by touch and wheel events
    const zoomAt = (focalScreenX, nextScale) => {
      const oldX = focalScreenX / currentScale;
      currentScale = nextScale;
      const newX = focalScreenX / currentScale;
      currentXOffset += newX - oldX;
      setAttr(pathGroup, TRANSFORM, `scale(${currentScale} 1) translate(${currentXOffset} 0)`);
      loadNewData();
    };

    {
      let gestureStartScale = null;
      let gestureFocalX = null;

      overlayEv(`${GESTURE}start`, e => {
        gestureStartScale = currentScale;
        gestureFocalX = getScreenPosition(e);
      });

      overlayEv(`${GESTURE}change`, e => {
        if (gestureStartScale === null) {
          return;
        }
        const next = clamp(gestureStartScale * e.scale, 0.05, 200);
        zoomAt(gestureFocalX, next);
      });

      overlayEv(`${GESTURE}end`, () => {
        gestureStartScale = null;
      });


      const touchDistance = (t0, t1) => {
        const dx = t0[CLIENT_X] - t1[CLIENT_X];
        const dy = t0[CLIENT_Y] - t1[CLIENT_Y];
        return Math.hypot(dx, dy);
      };

      const touchCenterX = (t0, t1) => (t0[CLIENT_X] + t1[CLIENT_X]) / 2;

      let touchStateActive = false;
      let touchStateStartDist = 0;
      let touchStateStartScale = 1;
      let touchStateFocalX = 0;

      overlayEv(`${TOUCH}start`, e => {
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

      overlayEv(`${TOUCH}move`, e => {
        const touches = e.touches;
        if (touchStateActive && len(touches) === 2) {
          const dist = touchDistance(touches[0], touches[1]);
          const factor = dist / touchStateStartDist;
          const next = clamp(touchStateStartScale * factor, 0.05, 200);
          zoomAt(touchStateFocalX, next);
        }
      });

      overlayEv(`${TOUCH}end`, e => {
        if (len(e.touches) < 2) {
          touchStateActive = false;
        }
      });

      overlayEv(`${TOUCH}cancel`, () => {
        touchStateActive = false;
      });
    }

    if (onClick) {
      overlayEv(CLICK, event => {
        xScreenPos = getScreenPosition(event);
        const xValue = xToPoint(xScreenPos);
        let points = map(
          zip(dataSeries, getNearestIndices()),
          ([series, index]) => series[index]
        );
        onClick(event, xValue, points);
      });
    }

    overlayEv("wheel", async event => {
      timesScaled += 1;
      updateTracker(event);
      xScreenPos = getScreenPosition(event);

      const delta = event.wheelDelta;
      const zoomFactor = 1 + abs(delta) / 900;
      const nextScale = delta > 0 ? currentScale * zoomFactor : currentScale / zoomFactor;

      zoomAt(xScreenPos, nextScale);
    });

    overlayEv("mousemove", updateTracker);

    overlayEv("mouseout", () => {
      hideTrackers();
      updateKey(lineLabels);
    });

    addChildren(svg, [trackerLayer, keyLayer, overlay, projectLink, zoomOutButton]);
    hideTrackers();
  };

  addEv(svg, "dblclick", () => {
    if (len(dataStack) > 1) {
      dataStack.pop();
    }
    drawGraphData();
  });

  addEv(zoomOutButton, CLICK, () => {
    dataStack.splice(1);
    drawGraphData();
  });

  drawGraphData();

  return svg;
};
