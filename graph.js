// SPDX-License-Identifier: MIT

// Utilities
const SVG_NS = "http://www.w3.org/2000/svg";

const KEY_BAR_WIDTH = 8;
const KEY_BAR_RPAD = 8;
const KEY_BAR_HEIGHT = 3;
const SMOLGRAPH = "smolgraph";
const LINE_WIDTH = 1;

// Minification-aware renaming
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
const { abs, min, max, pow, floor} = Math;
const len = a => a.length;
const flatmap = (arr, f) => arr.flatMap(f);
const map = (arr, f) => arr.map(f);
const push = (arr, el) => arr.push(el);
const isInt = n => Number.isInteger(n);

// Global mutable state. Sue me.
// We need to differentiate these IDs between calls.
let clipPathCounter = 0;

const zip = (...args) =>
  map(args[0], (_, i) =>
    map(args, arg => arg[i])
  );

const unzip = arrs => zip(...arrs);

const isStr = a => typeof a === "string";

const formatTickValue = value => isStr(value) ? value :
  (isStr(value) || isInt(value) ? `${value}` : `${Number(value.toFixed(3))}`);

const formatTrackerLabel = (x, y) =>
    `(${formatTickValue(x)}, ${formatTickValue(y)})`;

const twoargs = f => (a, b) => f(a, b);
const maximum = arr => arr.reduce(twoargs(max));
const bounds = arr => [arr.reduce(twoargs(min)), maximum(arr)];

const calculateNiceScale = (values, maxTicks = 10) => {
  if (len(values) === 0) {
    return { min: 0, max: 0, tickStep: 1, ticks: [0] };
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
    push(ticks, parseFloat(t.toFixed(12)));
  }

  return { min: niceMin, max: niceMax, tickStep: niceStep, ticks };
};

const setAttr = (el, k, v) => {
  el.setAttribute(k, v);
};

const setAttrs = (el, attrs) => {
  for (const [k, v] of Object.entries(attrs)) {
    setAttr(el, k, v);
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
  const elem = document.createElementNS(SVG_NS, tag);
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
    class: "tick",
    x1, y1, x2, y2,
  });

const mkTickLabel = (textValue, x, y, anchor) =>
  text(textValue, {
    class: "tick-label",
    x, y,
    "text-anchor": anchor,
  });

const genColors = data => map(data, (_, n) => `hsl(${n * 360 / len(data) + 80},40%,60%)`);

const rect = (x, y, width, height, rest = {}) =>
  el("rect", {x, y, width, height, ...rest});

const boundData = (origData, minX, maxX, xIsStringy) =>
  map(structuredClone(origData), ({data,label}) => ({
    label,
    data: xIsStringy ?
      data.slice(max(0, minX), max(0, max(minX, maxX))) :
      data.filter(([x]) => x >= minX && x <= maxX)
  }));

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

const justClass = className => ({"class": className});

const hide = elem => {
  setAttr(elem, VISIBILITY, HIDDEN);
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

export const drawGraph = config => {
  const { data: allData } = config;
  const {
    width = 800,
    height = 500,
    lineColors = genColors(allData),
    maxTicks = {x: 15, y: 10},
    loadData,
    axisLabels = {x: "X", y: "Y"},
    onClick,
  } = config;

  const svg = el("svg", {
    xmlns: SVG_NS,
    viewBox: `0 0 ${width} ${height}`,
    "class": SMOLGRAPH
  });

  // So we can use getBBox
  addChild(document.body, svg);

  const testText = text("test");
  addChild(svg, testText);
  const {width: testTextWidth, height: CHAR_HEIGHT } = testText.getBBox();
  const CHAR_WIDTH = testTextWidth/4;
  const KEY_PAD = CHAR_HEIGHT / 2;
  const TEXT_CENTER_OFFSET = CHAR_HEIGHT * 0.3;

  // Estimate of the height of capital letters...
  const TEXT_TOP_OFFSET = CHAR_HEIGHT * 0.6;

  const dataStack = [allData];
  const tickWidth = tick => CHAR_WIDTH * len(formatTickValue(tick));

  const projectLink = el("a", {
      href: `https://github.com/414owen/${SMOLGRAPH}`
    }, [
      text(SMOLGRAPH, {
        x: CHAR_WIDTH,
        y: height - CHAR_WIDTH
      })
    ]
  );

  const zoomOutButton = text("reset zoom", justClass("zoom-out"));

  // Subsequent data loads shouldn't overwrite each other.
  // We make sure the last request sent out for new data is the only
  // one that actually gets rendered, by incrementing this before sending a request.
  // And making sure it's the right value before rendering.
  let dataLoadSentinel = 0;

  const drawGraphData = (data = dataStack.at(-1)) => {
    const dataSeries = map(data, d => d.data);
    const lineLabels = map(data, d => d.label);

    const xIsStringy = isStr(dataSeries[0][0][0]);

    let xValues;
    if (xIsStringy) {
      xValues = map(dataSeries[0], (_, i) => i);
      xValues.sort((a, b) => a - b);
    } else {
       xValues = [...new Set(flatmap(dataSeries, d => map(d, a => a[0])))];
    }

    // Zoomed in/out too far, can't guarantee correctness.
    if (abs(xValues[0] - xValues.at(-1)) < 1e-10 ||
      abs(xValues[0] - xValues.at(-1)) > 1e12) {
      return;
    }

    const firstSeries = dataSeries[0];
    const xLabel = xValue => xIsStringy ?
      (xValue < len(firstSeries) && isInt(xValue) ?
        firstSeries[xValue][0] :
        "") :
      xValue;

    const ySeries = map(dataSeries, d => map(d, a => a[1]));
    const yValues = ySeries.flat();

    svg.innerHTML = "";

    // Calculate scales
    const xScaleData = calculateNiceScale(xValues, maxTicks.x);
    if (!xScaleData) {return;}
    if (xIsStringy) {
      xScaleData.ticks = map(xScaleData.ticks, xLabel);
    }
    const yScaleData = calculateNiceScale(bounds(yValues), maxTicks.y);

    const marginLeft = CHAR_HEIGHT + CHAR_WIDTH * 3 +
      maximum(map(yScaleData.ticks, tickWidth));
    const marginRight = tickWidth(xLabel(xScaleData.max)) / 2 + CHAR_WIDTH;

    const marginTop = CHAR_HEIGHT/2 + CHAR_WIDTH;
    const marginBottom = CHAR_HEIGHT * 2 + CHAR_WIDTH * 3;

    const innerWidth = width - marginLeft - marginRight;
    const innerHeight = height - marginTop - marginBottom;

    const chartRight = marginLeft + innerWidth;
    const chartBottom = marginTop + innerHeight;

    const scaleXNum = createScale(xScaleData.min, xScaleData.max, marginLeft, chartRight);
    const scaleX = xIsStringy ? ((x, i) => scaleXNum(i)) : scaleXNum;
    const scaleY = createScale(yScaleData.min, yScaleData.max, chartBottom, marginTop);

    setAttrs(zoomOutButton, {
      x: chartRight - CHAR_WIDTH,
      y: marginTop + CHAR_HEIGHT
    });

    const trackerLayer = el("g", justClass("tracker"));
    const trackerEls = map(data, () => {
      const line = el("line");
      const dot = el("circle", {
        r: 4,
      });
      addChildren(trackerLayer, [line, dot]);
      return {line, dot};
    });

    const mkTicks = (
      ticks,
      scaleFn,
      lineCoordsFn,
      labelPosFn,
      anchor
    ) =>
      unzip(map(ticks, (tick, i) => {
        const pos = scaleFn(tick, i);
        const line = mkTickLine(...lineCoordsFn(pos));
        const label = mkTickLabel(
          formatTickValue(tick),
          ...labelPosFn(pos),
          anchor
        );
        return [line, label];
      }));

    {
      const TICK_Y = chartBottom + TEXT_TOP_OFFSET + CHAR_WIDTH;
      const [hlines, hlabels] = mkTicks(
        yScaleData.ticks,
        tick => scaleY(tick),
        y => [marginLeft, y, chartRight, y],
        y => [marginLeft - CHAR_WIDTH, y + TEXT_CENTER_OFFSET],
        "end"
      );

      const [vlines, vlabels] = mkTicks(
        xScaleData.ticks,
        (tick, i) => scaleX(tick, i * xScaleData.tickStep),
        x => [x, marginTop, x, chartBottom],
        x => [x, TICK_Y],
        MIDDLE
      );

      addChildren(svg, vlines);
      addChildren(svg, hlines);
      addChildren(svg, vlabels);
      addChildren(svg, hlabels);

      // Draw axis labels
      {
        addChild(svg, text(axisLabels.x, {
          x: marginLeft + innerWidth / 2,
          y: TICK_Y + CHAR_WIDTH + CHAR_HEIGHT,
          "text-anchor": MIDDLE,
        }));
        {
          const y = marginTop + innerHeight / 2;
          addChild(svg, text(axisLabels.y, {
            "text-anchor": MIDDLE,
            [TRANSFORM]: `translate(${CHAR_HEIGHT},${y}) rotate(-90)`
          }));
        }
      }
    }

    // Draw data lines
    const pathGroup = el("g", justClass("paths"), map(data, ({data: points}, idx) => {
      const [firstX, firstY] = points[0];
      const initial = `M${scaleX(firstX, 0)},${scaleY(firstY)}`;
      const rest = map(points.slice(1), ([x, y], i) => `L${scaleX(x, i + 1)},${scaleY(y)}`);
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
        el("clipPath", {id: `${SMOLGRAPH}-chart-clip-${clipPathCounter}`}, [
          el("path", {
            d: `M${marginLeft},${marginTop}h${innerWidth}v${innerHeight}h-${innerWidth}`
          })
        ])
      ]),
      el("g", {
        "clip-path": `url(#${SMOLGRAPH}-chart-clip-${clipPathCounter++})`,
      }, [pathGroup])
    ]);

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

    const limitX = x => min(max(x, marginLeft), chartRight);

    // Gets the X position, limited to the graphing area...
    const getScreenPosition = event => {
      const domPoint = new DOMPointReadOnly(event[CLIENT_X], event[CLIENT_Y]);
      return limitX(domPoint.matrixTransform(svg.getScreenCTM().inverse()).x);
    };

    const xToPoint = x =>
      xScaleData.min + (x - marginLeft) / innerWidth * (xScaleData.max - xScaleData.min);

    let xScreenPos = marginLeft;
    let timesScaled = 0;

    // Assumes an up-to-date xScreenPos
    /** @returns An index per data series */
    const getNearestIndices = () => {
      const xValue = xToPoint(xScreenPos);
      return map(dataSeries, (points) => {
        const prevIndex = xIsStringy ?
          min(floor(xValue), len(firstSeries) - 1) :
          binarySearch(points, ([x]) => x - xValue);
        const nextIndex = min(len(points) - 1, prevIndex + 1);

        const [prevX, nextX] = xIsStringy ?
          [prevIndex, nextIndex] :
          [points[prevIndex][0], points[nextIndex][0]];

        return abs(xValue - prevX) < abs(xValue - nextX) ?
          prevIndex :
          nextIndex;
      });
    };

    const keyRect = rect(
      marginLeft,
      marginTop,
      0,
      KEY_PAD * 2 + TEXT_TOP_OFFSET + CHAR_HEIGHT * (len(lineLabels) - 1),
      justClass("key")
    );

    const updateKeyRect = (maxKeyChars) => {
      setAttr(keyRect, "width", KEY_PAD * 2 + KEY_BAR_WIDTH + KEY_BAR_RPAD + CHAR_WIDTH * maxKeyChars);
    };

    const maxLabelLen = max(...map(lineLabels, k => len(k)));
    const keyTexts = [];

    const updateKey = keyLabels => {
      for (const [elem, label] of zip(keyTexts, keyLabels)) {
        elem.textContent = label;
      }
      updateKeyRect(maxLabelLen);
    };

    // With tracker positions
    const updateKeyWithPositions = positions => {
      updateKey(map(zip(lineLabels, positions),
        ([label, [x, y]]) =>
          `${label.padEnd(maxLabelLen)}  ${formatTrackerLabel(xIsStringy ? x : xLabel(x), y)}`
      ));
      updateKeyRect(max(...map(keyTexts, elem => elem.getNumberOfChars())));
    };

     const updateTracker = event => {
       hideTrackers();
       xScreenPos = getScreenPosition(event);

       const xLines = new Set();
       const positions = [];
       const tups = zip(dataSeries, trackerEls, getNearestIndices());
       for (const [series, {line, dot}, nearestIndex] of tups) {

         const xPos = scaleX(series[nearestIndex][0], nearestIndex);
         const yPos = scaleY(series[nearestIndex][1]);

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

    // These blocks aren't necessary, but help with minification
    {
      let currentScale = 1;
      let currentXOffset = 0;

      const loadNewData = debounce(async () => {

        // Invert element transform (scale(...) translate(...)):
        const leftUntransformed  = (marginLeft / currentScale) - currentXOffset;
        const rightUntransformed = (chartRight / currentScale) - currentXOffset;

        // Convert SVG x’s to data-domain values
        const minXVisible = xToPoint(leftUntransformed);
        const maxXVisible = xToPoint(rightUntransformed);

        const expectedTimesScaled = timesScaled;

        const boundedData = boundData(
          loadData ? data : dataStack[0],
          minXVisible,
          maxXVisible,
          xIsStringy
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

      // Mobile support
      {
        let gestureStartScale = null;
        let gestureFocalX = null;

        const zoomAt = (focalScreenX, nextScale) => {
          const oldX = focalScreenX / currentScale;
          currentScale = nextScale;
          const newX = focalScreenX / currentScale;
          currentXOffset += newX - oldX;
          setAttrs(pathGroup, {
            [TRANSFORM]: `scale(${currentScale} 1) translate(${currentXOffset} 0)`
          });
          loadNewData();
        };
        const clamp = (v, mn, mx) => max(mn, min(mx, v));
        const clampScale = s => clamp(s, 0.05, 200);

        overlayEv(`${GESTURE}start`, e => {
          gestureStartScale = currentScale;
          gestureFocalX = getScreenPosition(e);
        });

        overlayEv(`${GESTURE}change`, e => {
          if (gestureStartScale === null) {
            return;
          }
          const next = clampScale(gestureStartScale * e.scale);
          zoomAt(gestureFocalX, next);
        });

        overlayEv(`${GESTURE}end`, () => {
          gestureStartScale = null;
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
            const next = clampScale(touchStateStartScale * factor);
            zoomAt(touchStateFocalX, next);
          }
        });

        overlayEv(`${TOUCH}end`, (e) => {
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

      // Scroll support
      overlayEv("wheel", async event => {
        timesScaled += 1;
        updateTracker(event);
        xScreenPos = getScreenPosition(event);

        const delta = event.wheelDelta;
        const zoomFactor = 1 + abs(delta) / 900;
        const oldX = xScreenPos / currentScale;
        if (delta > 0) {
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
    }

    overlayEv("mousemove", updateTracker);

    overlayEv("mouseout", () => {
      hideTrackers();
      updateKey(lineLabels);
    });

    const keyLayer = el("g", justClass("key"), [
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
            marginLeft + KEY_PAD ,
            y - CHAR_HEIGHT / 4 - KEY_BAR_HEIGHT / 2,
            KEY_BAR_WIDTH,
            KEY_BAR_HEIGHT,
            {fill: lineColors[i]}
          )
        ];
      }),
    ]);

    updateKeyRect(maxLabelLen);

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

  svg.remove();

  return svg;
};
