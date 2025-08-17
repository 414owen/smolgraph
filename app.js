import { drawGraph } from "./graph.js";

let seed = 934.414183493471

const nextChar = c => String.fromCharCode(c.charCodeAt(0) + 1);

// Deterministic fractal random walk (sampling-invariant).
// Always returns 500 [x, y] points over [minX, maxX].
const generateFractalWalkData = (minX, maxX, noiseLevel = 1, seed = 1, 
  scale = 0.1,      // world units per base scale; larger => broader features
  H = 0.001,        // 0..0.5 recommended; lower => rougher, faster divergence
  fineLevels = 100, // # of fine dyadic levels (fixed for determinism)
  coarseLevels = 12 // # of coarse dyadic levels (adds long-range drift)
) => {
  const POINTS = 500;
  const step = (maxX - minX) / (POINTS - 1) || 0;

  // Fast 32-bit hash -> [0,1)
  const hash01 = (k, n, s) => {
    let h = (s|0) ^ Math.imul(k|0, 374761393) ^ Math.imul(n|0, 668265263);
    h ^= h >>> 13; h = Math.imul(h, 1274126177); h ^= h >>> 16;
    return (h >>> 0) / 4294967296;
  };

  // Single coefficient ~[-1,1] (uniform is fine here)
  const coef = (k, n, s) => hash01(k, n, s) * 2 - 1;

  // Triangular "pyramid" bump Λ(u) on [0,1]: rise to 1 at 0.5, then fall
  const pyramid = (u) => 1 - Math.abs(u * 2 - 1);

  const fBmSchauder = (x, s) => {
    const u = x / scale; // dimensionless coord (global!)
    let y = 0;
    for (let k = -coarseLevels; k <= fineLevels; k++) {
      const sk = Math.pow(2, k);
      const t = u * sk;
      const n = Math.floor(t);
      const frac = t - n;        // in [0,1)
      const a = Math.pow(2, -(H + 0.5) * k); // amplitude per level
      y += a * coef(k, n, s) * pyramid(frac);
    }
    return y;
  };

  const out = [];
  for (let j = 0; j < POINTS; j++) {
    const x = minX + j * step;
    const y = fBmSchauder(x, seed | 0) * noiseLevel;
    out.push([x, y]);
  }
  return out;
};

const graphConfig = numLines => {
  const loadData = (minX, maxX) => {

    minX = Math.max(minX, 0);
    maxX = Math.min(maxX, 10000);
    let s = seed;
    let c = nextChar('a');

    const gen = () => generateFractalWalkData(minX, maxX, 2, s);
    const data = [];
    for (let i = 0; i < numLines; i++) {
      data.push({label: c, data: gen()});
      s += 10;
      c = nextChar(c);
    }
    return data;
  };
  return {
    data: loadData(0, 1000),
    loadData: loadData
  };
};

const app = document.getElementById("app");
const numLines = document.getElementById("num-lines");

let svg;
const run = () => {
  console.log(`Seed: ${seed}`);
  svg = drawGraph(graphConfig(numLines.value));
  app.appendChild(svg);
};
run();

const button = document.getElementById("regen");

button.onclick = () => {
  seed = Math.random() * 1000;
  svg.remove();
  run();
};
