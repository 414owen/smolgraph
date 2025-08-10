// Utilities
const SVG_NS = "http://www.w3.org/2000/svg";

const KEY_BAR_WIDTH = 24;
const KEY_BAR_PADDING = 8;
const KEY_BAR_HEIGHT = 3;
const CLASS_NAME = "smolgraph";
const LINE_WIDTH = 1;
const FONT = "monospace";

// Minification-aware renaming
const M = Math;
const { min, max, floow, pow, floor} = M;
const doc = document;
const VISIBILITY = "visibility";
const VISIBLE = "visible";
const MIDDLE = "middle";
const FILL = "fill";
const len = a => a.length;
const flatmap = (arr, f) => arr.flatMap(f);
const map = (arr, f) => arr.map(f);
const isInt = n => Number.isInteger(n);

const zip = (...args) =>
  map(args[0], (_, i) => 
    map(args, arg => arg[i])
  );

const unzip = arrs => zip(...arrs);

let formatTrackerLabel = (x, y) =>
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
    ticks.push(parseFloat(t.toFixed(12)));
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

const boundData = (origData, minX, maxX, xIsStringy) => {
  let data = structuredClone(origData);
  for (const series of data) {
    if (xIsStringy) {
      series.data = series.data.slice(minX, maxX);
    } else {
      series.data = series.data.filter(([x, _]) => x >= minX && x <= maxX);
    }
  }
  return data;
};

const addEv = (el, name, handler) => {
  el.addEventListener(name, e => {
    handler(e);
    e.stopPropagation();
  });
};

export const drawGraph = (config) => {
  const { data } = config;
  const {
    width = 800,
    height = 500,
    lineColors = genColors(data),
    maxTicks = {x: 15, y: 10},
    onSelect = async (minX, maxX) => boundData(data, minX, maxX, xIsStringy),
    axisLabels = {x: "X", y: "Y"},
    fontSize,
  } = config;

  const svg = el("svg", {
    xmlns: SVG_NS,
    width,
    height,
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
  const xIsStringy = typeof(data[0].data[0][0]) === "string";

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

  const zoomOutButton = text("reset zoom", {
    "class": "zoom-out",
  });

  addEv(zoomOutButton, "click", () => {
    dataStack.splice(1);
    drawGraphData();
  });

  const drawGraphData = () => {
    svg.innerHTML = "";

    const data = dataStack.at(-1);
    const lineLabels = map(data, d => d.label);

    let xValues;
    if (xIsStringy) {
      xValues = map(data[0].data, (_, i) => i);
      xValues.sort((a, b) => a - b);
    } else {
       xValues = [...new Set(flatmap(data, d => map(d.data, a => a[0])))];
    }

    let firstSeries = data[0].data;
    const xLabel = xValue => xIsStringy
      ? (xValue < len(firstSeries) && isInt(xValue)
        ? firstSeries[xValue][0]
        : "")
      : xValue;
    
    const ySeries = map(data, d => map(d.data, a => a[1]));
    const yValues = ySeries.flat();

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

    const trackerLayer = el('g', {"class": "tracker"});
    const trackerRect = rect(0, marginTop, 0, innerHeight);
    addChild(trackerLayer, trackerRect);
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
        transform: `translate(${x},${y}) rotate(-90)`
      }))
    }

    // Draw data lines
    data.forEach(({data: points}, idx) => {
      const [x, y] = points[0];
      const initial = `M${scaleX(x, 0)},${scaleY(y)}`;
      const rest = map(points.slice(1), ([x, y], i) => `L${scaleX(x, i + 1)},${scaleY(y)}`);
      const linePath = initial + rest.join('');
      addChild(svg, el('path', {
        d: linePath, [FILL]: 'none', stroke: lineColors[idx % len(lineColors)], 'stroke-width': LINE_WIDTH
      }));
    });

    // Implement hover interaction
    const overlay = rect(
      0, marginTop, width, innerHeight,
      {"class": "overlay"}
    );
    overlay.focus();

    const hideTrackers = () => {
      for (const child of trackerLayer.children) {
        hide(child);
      }
    };

    const overlayEv = (name, handler) => addEv(overlay, name, handler);

    let mouseDownPosition = null;

    const limitX = x => min(max(x, marginLeft), marginLeft + innerWidth);

    // Gets the X position, limited to the graphing area...
    const getScreenPosition = event => {
      const domPoint = new DOMPointReadOnly(event.clientX, event.clientY)
      return limitX(domPoint.matrixTransform(svg.getScreenCTM().inverse()).x)
    };

    const xToPoint = x => 
      xScaleData.min + (x - marginLeft) / innerWidth * (xScaleData.max - xScaleData.min);

    overlayEv("mousedown", event => {
      // If someone just clicks on a spot, then we won't rerender,
      // we'll just store the position for a two-click zoom.
      if (mouseDownPosition === null) {
        mouseDownPosition = getScreenPosition(event);
      }
    });

    overlayEv("mouseup", async event => {
      let mouseX = getScreenPosition(event);
      let [mn, mx] = order(xToPoint(mouseDownPosition), xToPoint(mouseX));
      let newData = await onSelect(mn, mx);
      if (len(newData[0].data) < 2) {
        return;
      }
      dataStack.push(newData);
      drawGraphData();
      mouseDownPosition = null;
    });

    overlayEv('mousemove', (event) => {
      hideTrackers();
      let mouseX = getScreenPosition(event);

      if (mouseDownPosition !== null) {
        let [mn, mx] = order(mouseDownPosition, mouseX);
        setAttrs(trackerRect, {
          x: mn,
          width: mx - mn
        });
        show(trackerRect);
      }

      const xValue = xToPoint(mouseX);

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
          diff(xValue, prevValue) < diff(xValue, nextValue)
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
          [VISIBILITY]: VISIBLE,
        });

        positions.push([nearestValue, points[nearestIndex][1]]);
      }

      updateKeyWithPositions(positions);
    });

    overlayEv('mouseout', () => {
      hideTrackers();
      updateKey(lineLabels);
    });

    let keyRect = rect(
      marginLeft,
      marginTop,
      0,
      KEY_VSPACE * (len(lineLabels) + 0.5),
      {class: "key"}
    );

    const keyTexts = []
    const keyLayer = el("g", {"class": "key"}, [
      keyRect,
      ...flatmap(lineLabels, (keyLabel, i) => {
        const y = marginTop + KEY_VSPACE * (i + 1);
        const textEl = text(keyLabel, {
          y,
          x: marginLeft + KEY_BAR_WIDTH,
        });
        keyTexts.push(textEl);
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
      keyRect.setAttribute("width", KEY_BAR_WIDTH + KEY_BAR_PADDING/2 + CHAR_WIDTH * maxKeyChars);
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

const order = (a, b) => [min(a, b), max(a, b)];

const hide = el => {
  setAttr(el, VISIBILITY, "hidden");
};

const show = el => {
  setAttr(el, VISIBILITY, VISIBLE);
};

const diff = (x, y) => M.abs(x - y);

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
