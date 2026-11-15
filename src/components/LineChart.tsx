import React from "react";

type Series = {
  name: string;
  color: string;
  values: number[];
};

type Props = {
  x: number[];
  series: Series[];
  xLabel: string;
  title: string;
};

const WIDTH = 640;
const HEIGHT = 280;
const LEFT = 58;
const RIGHT = 16;
const TOP = 16;
const BOTTOM = 36;

function nice(value: number): string {
  const abs = Math.abs(value);
  if (abs >= 100) return value.toFixed(0);
  if (abs >= 10) return value.toFixed(1);
  return value.toFixed(2);
}

const LineChart: React.FC<Props> = ({ x, series, xLabel, title }) => {
  const ys = series.flatMap((item) => item.values);
  const xMin = Math.min(...x);
  const xMax = Math.max(...x);
  let yMin = Math.min(0, ...ys);
  let yMax = Math.max(...ys);
  if (yMax === yMin) yMax = yMin + 1;
  const pad = (yMax - yMin) * 0.08;
  yMin -= pad;
  yMax += pad;
  const sx = (value: number) => LEFT + ((value - xMin) / (xMax - xMin)) * (WIDTH - LEFT - RIGHT);
  const sy = (value: number) => TOP + (1 - (value - yMin) / (yMax - yMin)) * (HEIGHT - TOP - BOTTOM);
  const zero = sy(0);

  return (
    <figure className="mb-0">
      <figcaption className="fw-semibold mb-2">{title}</figcaption>
      <svg viewBox={`0 0 ${WIDTH} ${HEIGHT}`} role="img" aria-label={title} className="w-100">
        <line x1={LEFT} y1={zero} x2={WIDTH - RIGHT} y2={zero} stroke="#d5d0c8" />
        {series.map((item) => {
          const d = item.values.map((value, index) => `${index === 0 ? "M" : "L"}${sx(x[index] ?? 0).toFixed(1)},${sy(value).toFixed(1)}`).join(" ");
          return <path key={item.name} d={d} fill="none" stroke={item.color} strokeWidth={2} />;
        })}
        <text x={LEFT} y={14} fontSize={12} fill="#5c6560">
          {nice(yMax)}
        </text>
        <text x={LEFT} y={HEIGHT - 8} fontSize={12} fill="#5c6560">
          {xLabel}: {nice(xMin)} to {nice(xMax)}
        </text>
      </svg>
      <div className="d-flex gap-3 small">
        {series.map((item) => (
          <span key={item.name}>
            <span style={{ color: item.color }}>●</span> {item.name}
          </span>
        ))}
      </div>
    </figure>
  );
};

export default LineChart;
