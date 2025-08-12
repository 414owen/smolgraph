import { drawGraph } from "./graph.js";

// Simple seeded PRNG (Mulberry32)
const mulberry32 = seed => () => {
  let t = seed += 0x6D2B79F5;
  t = Math.imul(t ^ (t >>> 15), t | 1);
  t ^= t + Math.imul(t ^ (t >>> 7), t | 61);
  return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
};

// Generate smooth noise using a seeded PRNG
const generateSmoothNoiseData = (nPoints, noiseLevel, seed) => {
  const rand = mulberry32(seed);
  const data = [];
  let y = 0;

  for (let i = 0; i < nPoints; i++) {
    data.push([i, y]);
    y += (rand() - 0.5) * noiseLevel;
  }

  return data;
};

let seed = 934.414183493471
const gen = () => generateSmoothNoiseData(1000, 2, seed += 10);
const nextChar = c => String.fromCharCode(c.charCodeAt(0) + 1);

const graphConfig = numLines => {
  const data = [];
  let c = nextChar('a');
  while (numLines--) {
    data.push({label: c, data: gen()});
    c = nextChar(c);
  }
  return { data };
};

const app = document.getElementById("app");
const numLines = document.getElementById("num-lines");

let svg;
const run = () => {
  console.log(`Seed: ${seed}`);
  svg = drawGraph(graphConfig(numLines.value));
  app.insertBefore(svg, app.firstChild);
};
run();

const button = document.getElementById("regen");

button.onclick = () => {
  seed = Math.random() * 1000;
  svg.remove();
  run();
};
