import './index.css';
import "../../../graph.css";
import { drawGraph, type DrawGraphConfig, type Series } from "../../../graph.js";

const rootEl = document.querySelector('#root');

const LONDON_LAT = 51.507351;
const LONDON_LON = -0.127758;

const MELBOURNE_LAT = -37.813629;
const MELBOURNE_LON = 144.963058;

const mkUrl = (lat: number, lon: number): string =>
  `https://api.open-meteo.com/v1/forecast?latitude=${lat}&longitude=${lon}&hourly=temperature_2m`;

const getDataForCoords = (lat: number, lon: number) =>
  fetch(mkUrl(lat, lon))
    .then(res => res.json());

const getData = (): Promise<object> => {
  const getLondon = getDataForCoords(LONDON_LAT, LONDON_LON);
  const getMelbourne = getDataForCoords(MELBOURNE_LAT, MELBOURNE_LON);
  return Promise.all([getLondon, getMelbourne]);
};

const zip = (a, b) => a.map((k, i) => [k, b[i]]);


const toSeries = (label: string, data: object): Series => {
  const {time, temperature_2m} = data.hourly;
  return {
    label,
    data: zip(time.map(t => t.slice(5).replace('-', '/').replace('T', ' ')), temperature_2m)
  };
};

getData().then(([london, melbourne]) => {
  const config: DrawGraphConfig = {
    data: [
      toSeries("London", london),
      toSeries("Melbourne", melbourne)
    ],
    axisLabels: { x: "Time", y: "Temperature" },
    maxTicks: {x: 5}
  };
  rootEl.appendChild(drawGraph(config));
});
