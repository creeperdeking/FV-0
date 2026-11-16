import React, { useMemo, useState } from "react";

type Series = {
  name: string;
  color: string;
  values: number[];
};

type Props = {
  x: number[];
  series: Series[];
  xLabel: string;
  xUnit: string;
  yUnit: string;
  title: string;
  yLog?: boolean;
  formatY?: (value: number) => string;
};

const WIDTH = 640;
const HEIGHT = 280;
const LEFT = 52;
const RIGHT = 16;
const TOP = 22;
const BOTTOM = 42;
const plotWidth = WIDTH - LEFT - RIGHT;
const plotHeight = HEIGHT - TOP - BOTTOM;

function nice(value: number): string {
  const abs = Math.abs(value);
  if (abs >= 100) return value.toFixed(0);
  if (abs >= 10) return value.toFixed(1);
  if (abs >= 1) return value.toFixed(2);
  return value.toFixed(3);
}

function niceStep(span: number, count: number): number {
  const rough = span / Math.max(count, 1);
  const power = 10 ** Math.floor(Math.log10(Math.max(rough, 1e-12)));
  const normalized = rough / power;
  const step = normalized <= 1.5 ? 1 : normalized <= 3 ? 2 : normalized <= 7 ? 5 : 10;
  return step * power;
}

function ticks(min: number, max: number, count: number): number[] {
  if (!(max > min)) return [min];
  const step = niceStep(max - min, count);
  const start = Math.ceil(min / step) * step;
  const values: number[] = [];
  for (let value = start; value <= max + step * 1e-9; value += step) {
    values.push(Number(value.toPrecision(12)));
  }
  return values.length > 0 ? values : [min, max];
}

function logTicks(min: number, max: number): number[] {
  const start = Math.floor(Math.log10(min));
  const end = Math.ceil(Math.log10(max));
  const values: number[] = [];
  for (let exp = start; exp <= end; exp += 1) {
    const tick = 10 ** exp;
    if (tick >= min * 0.999 && tick <= max * 1.001) values.push(tick);
  }
  return values.length > 0 ? values : [min, max];
}

function nearestIndex(values: number[], target: number): number {
  let best = 0;
  let distance = Infinity;
  for (let index = 0; index < values.length; index += 1) {
    const gap = Math.abs((values[index] ?? 0) - target);
    if (gap < distance) {
      distance = gap;
      best = index;
    }
  }
  return best;
}

const LineChart: React.FC<Props> = ({ x, series, xLabel, xUnit, yUnit, title, yLog = false, formatY = nice }) => {
  const [cursor, setCursor] = useState<number | null>(null);
  const geometry = useMemo(() => {
    const ys = series.flatMap((item) => item.values);
    const xMin = Math.min(...x);
    const xMax = Math.max(...x);
    if (yLog) {
      const positive = ys.filter((value) => value > 0);
      const rawMin = positive.length > 0 ? Math.min(...positive) : 1e-3;
      const rawMax = positive.length > 0 ? Math.max(...positive) : 1;
      const yMin = rawMin / 1.5;
      const yMax = rawMax * 1.5;
      return {
        xMin,
        xMax,
        yMin,
        yMax,
        xTicks: ticks(xMin, xMax, 5),
        yTicks: logTicks(yMin, yMax),
      };
    }
    let yMin = Math.min(0, ...ys);
    let yMax = Math.max(...ys);
    if (yMax === yMin) yMax = yMin + 1;
    const pad = (yMax - yMin) * 0.08;
    yMin -= pad;
    yMax += pad;
    return {
      xMin,
      xMax,
      yMin,
      yMax,
      xTicks: ticks(xMin, xMax, 5),
      yTicks: ticks(yMin, yMax, 5),
    };
  }, [series, x, yLog]);

  const sx = (value: number) => LEFT + ((value - geometry.xMin) / (geometry.xMax - geometry.xMin)) * plotWidth;
  const sy = (value: number) => {
    if (yLog) {
      const clamped = Math.max(value, geometry.yMin);
      const t =
        (Math.log10(clamped) - Math.log10(geometry.yMin)) /
        (Math.log10(geometry.yMax) - Math.log10(geometry.yMin));
      return TOP + (1 - t) * plotHeight;
    }
    return TOP + (1 - (value - geometry.yMin) / (geometry.yMax - geometry.yMin)) * plotHeight;
  };
  const hovered = cursor === null ? null : nearestIndex(x, cursor);
  const hoveredX = hovered === null ? null : (x[hovered] ?? null);
  const hoveredValues =
    hovered === null
      ? []
      : series.map((item) => ({
          name: item.name,
          color: item.color,
          value: item.values[hovered] ?? 0,
        }));
  const anchorY =
    hoveredValues.length === 0 ? null : Math.min(...hoveredValues.map((item) => sy(Math.max(item.value, geometry.yMin))));

  const move = (event: React.PointerEvent<SVGSVGElement>) => {
    const bounds = event.currentTarget.getBoundingClientRect();
    const localX = ((event.clientX - bounds.left) / bounds.width) * WIDTH;
    const value = geometry.xMin + ((localX - LEFT) / plotWidth) * (geometry.xMax - geometry.xMin);
    const next = x[nearestIndex(x, value)] ?? null;
    setCursor((current) => (current === next ? current : next));
  };

  return (
    <figure className="mb-0">
      <figcaption className="fw-semibold mb-2">{title}</figcaption>
      <div className="line-chart-plot">
        <svg
          viewBox={`0 0 ${WIDTH} ${HEIGHT}`}
          role="img"
          aria-label={title}
          onPointerMove={move}
          onPointerLeave={() => setCursor(null)}
        >
          <text x={LEFT} y={14} fill="#6d7f79" fontSize="12">
            {yUnit}
            {yLog ? " (log)" : ""}
          </text>
          {geometry.yTicks.map((tick) => (
            <g key={`y-${tick}`}>
              <line x1={LEFT} x2={WIDTH - RIGHT} y1={sy(tick)} y2={sy(tick)} stroke="#e4ece8" />
              <text x={LEFT - 8} y={sy(tick)} textAnchor="end" dominantBaseline="middle" fill="#6d7f79" fontSize="12">
                {formatY(tick)}
              </text>
            </g>
          ))}
          {geometry.xTicks.map((tick) => (
            <g key={`x-${tick}`}>
              <line x1={sx(tick)} x2={sx(tick)} y1={TOP} y2={HEIGHT - BOTTOM} stroke="#e4ece8" />
              <text x={sx(tick)} y={HEIGHT - 22} textAnchor="middle" fill="#6d7f79" fontSize="12">
                {nice(tick)}
              </text>
            </g>
          ))}
          <text x={LEFT + plotWidth / 2} y={HEIGHT - 6} textAnchor="middle" fill="#6d7f79" fontSize="12">
            {xLabel} ({xUnit})
          </text>
          <rect x={LEFT} y={TOP} width={plotWidth} height={plotHeight} fill="transparent" />
          {series.map((item) => {
            const d = item.values
              .map((value, index) => `${index === 0 ? "M" : "L"}${sx(x[index] ?? 0).toFixed(1)} ${sy(value).toFixed(1)}`)
              .join("");
            return <path key={item.name} d={d} fill="none" stroke={item.color} strokeWidth={2.5} strokeLinejoin="round" strokeLinecap="round" />;
          })}
          {hoveredX !== null ? (
            <g>
              <line x1={sx(hoveredX)} x2={sx(hoveredX)} y1={TOP} y2={HEIGHT - BOTTOM} stroke="#c5d4ce" />
              {hoveredValues.map((item) => (
                <circle key={item.name} cx={sx(hoveredX)} cy={sy(Math.max(item.value, geometry.yMin))} r="4.5" fill={item.color} />
              ))}
            </g>
          ) : null}
        </svg>
        {hoveredX !== null && anchorY !== null ? (
          <div
            className={`line-chart-tooltip${sx(hoveredX) > WIDTH * 0.72 ? " is-left" : ""}`}
            style={{ left: `${(sx(hoveredX) / WIDTH) * 100}%`, top: `${(anchorY / HEIGHT) * 100}%` }}
          >
            <div>
              {xLabel} {nice(hoveredX)} {xUnit}
            </div>
            {hoveredValues.map((item) => (
              <div key={item.name} style={{ color: item.color }}>
                {item.name} {formatY(item.value)}
              </div>
            ))}
          </div>
        ) : null}
      </div>
      <div className="d-flex gap-3 small mt-2">
        {series.map((item) => (
          <span key={item.name} className="line-chart-key">
            <i style={{ background: item.color }} /> {item.name}
          </span>
        ))}
      </div>
    </figure>
  );
};

export default LineChart;
