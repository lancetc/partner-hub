"use client";

import { useEffect, useRef, useState } from "react";
import { cx } from "@/lib/format";

/*
  The Problem desk's charts (docs/learning-designer.md). Hand-drawn SVG, one y-axis per chart: two measures of
  different scale get two charts on the same months, never two axes. Each series has its own colour and its own
  marker shape, a legend when there's more than one, a tooltip for the month under the pointer, and the same
  figures as a table underneath. A gap in the line is a month nobody measured, which is not zero.
*/

export type ChartSeries = {
  key: string;
  name: string;
  /** 1 to 3: the fixed colour and marker order. */
  slot: 1 | 2 | 3;
  values: (number | null)[];
  /** Months whose figure rests on a small sample: drawn hollow. */
  thin?: boolean[];
};
export type ChartMarker = { bucket: string; label: string };

const COLOR = { 1: "var(--viz-1)", 2: "var(--viz-2)", 3: "var(--viz-3)" } as const;
export const monthLabel = (bucket: string, long = false) =>
  new Date(`${bucket}-01T00:00:00Z`).toLocaleDateString(
    "en-AU",
    long ? { month: "long", year: "numeric", timeZone: "UTC" } : { month: "short", timeZone: "UTC" },
  );

/** A round number at or above the largest value, and the three steps up to it. */
function scale(max: number) {
  if (max <= 2) return { top: 2, ticks: [0, 1, 2] };
  if (max <= 4) return { top: 4, ticks: [0, 2, 4] };
  const pow = 10 ** Math.floor(Math.log10(max));
  const top = [1, 2, 4, 5, 8, 10].map((m) => m * pow).find((v) => v >= max) ?? max;
  return { top, ticks: [0, top / 2, top] };
}

function Mark({ slot, x, y, hollow }: { slot: 1 | 2 | 3; x: number; y: number; hollow?: boolean }) {
  const p = { fill: hollow ? "var(--surface)" : COLOR[slot], stroke: hollow ? COLOR[slot] : "var(--surface)", strokeWidth: 2 };
  if (slot === 1) return <circle cx={x} cy={y} r={4.5} {...p} />;
  if (slot === 2) return <rect x={x - 4} y={y - 4} width={8} height={8} {...p} />;
  return <path d={`M${x} ${y - 5.5}L${x + 5.5} ${y}L${x} ${y + 5.5}L${x - 5.5} ${y}Z`} {...p} />;
}

function Swatch({ slot }: { slot: 1 | 2 | 3 }) {
  return (
    <svg width="14" height="14" viewBox="-7 -7 14 14" aria-hidden className="shrink-0">
      <Mark slot={slot} x={0} y={0} />
    </svg>
  );
}

export function LineChart({
  title,
  note,
  unit,
  buckets,
  series,
  markers = [],
  height = 220,
  empty = "Not measured yet.",
}: {
  title: string;
  note?: string;
  /** What the numbers are, for the axis and the table: "cases", "per 100". */
  unit: string;
  buckets: string[];
  series: ChartSeries[];
  /** Dated changes to show against the trend: a line and a number, listed under the chart. */
  markers?: ChartMarker[];
  height?: number;
  empty?: string;
}) {
  const box = useRef<HTMLDivElement>(null);
  const [width, setWidth] = useState(640);
  const [hover, setHover] = useState<number | null>(null);
  useEffect(() => {
    const el = box.current;
    if (!el) return;
    const ro = new ResizeObserver((e) => setWidth(Math.max(260, Math.round(e[0].contentRect.width))));
    ro.observe(el);
    return () => ro.disconnect();
  }, []);

  const any = series.some((s) => s.values.some((v) => v !== null));
  const pad = { l: 34, r: 12, t: 16, b: 26 };
  const w = width - pad.l - pad.r;
  const h = height - pad.t - pad.b;
  const { top, ticks } = scale(Math.max(1, ...series.flatMap((s) => s.values.map((v) => v ?? 0))));
  const x = (i: number) => pad.l + (buckets.length > 1 ? (i * w) / (buckets.length - 1) : w / 2);
  const y = (v: number) => pad.t + h - (v / top) * h;
  const every = Math.ceil(buckets.length / Math.max(2, Math.floor(w / 44)));
  const shown = markers.map((m, n) => ({ ...m, n: n + 1, i: buckets.indexOf(m.bucket) })).filter((m) => m.i >= 0);
  const fmt = (v: number | null) => (v === null ? "Not measured" : String(Math.round(v * 10) / 10));

  return (
    <figure className="min-w-0 rounded-2xl border border-line bg-surface p-4">
      <figcaption>
        <p className="font-semibold">{title}</p>
        {note && <p className="mt-0.5 text-sm text-ink-muted">{note}</p>}
      </figcaption>
      {series.length > 1 && (
        <ul className="mt-2 flex flex-wrap gap-x-4 gap-y-1 text-sm">
          {series.map((s) => (
            <li key={s.key} className="flex items-center gap-1.5">
              <Swatch slot={s.slot} /> {s.name}
            </li>
          ))}
        </ul>
      )}
      <div ref={box} className="relative mt-2">
        {!any ? (
          <p className="flex items-center justify-center rounded-xl bg-muted px-3 text-center text-sm text-ink-muted" style={{ height }}>
            {empty}
          </p>
        ) : (
          <>
            <svg
              width={width}
              height={height}
              role="img"
              aria-label={`${title}. The figures are in the table below.`}
              onPointerMove={(e) => {
                const r = e.currentTarget.getBoundingClientRect();
                const i = buckets.length > 1 ? Math.round(((e.clientX - r.left - pad.l) / w) * (buckets.length - 1)) : 0;
                setHover(Math.min(buckets.length - 1, Math.max(0, i)));
              }}
              onPointerLeave={() => setHover(null)}
              className="block touch-pan-y"
            >
              {ticks.map((t) => (
                <g key={t}>
                  <line x1={pad.l} x2={width - pad.r} y1={y(t)} y2={y(t)} stroke="var(--ink-muted)" strokeOpacity={t === 0 ? 0.5 : 0.18} />
                  <text x={pad.l - 6} y={y(t) + 4} textAnchor="end" fontSize="11" fill="var(--ink-muted)">
                    {t}
                  </text>
                </g>
              ))}
              {buckets.map((b, i) =>
                i % every === 0 ? (
                  <text key={b} x={x(i)} y={height - 8} textAnchor="middle" fontSize="11" fill="var(--ink-muted)">
                    {monthLabel(b)}
                  </text>
                ) : null,
              )}
              {shown.map((m) => (
                <g key={`${m.n}-${m.bucket}`}>
                  <line x1={x(m.i)} x2={x(m.i)} y1={pad.t - 4} y2={pad.t + h} stroke="var(--ink)" strokeOpacity={0.55} strokeDasharray="3 3" />
                  <circle cx={x(m.i)} cy={pad.t - 6} r={7.5} fill="var(--surface)" stroke="var(--ink)" strokeOpacity={0.7} />
                  <text x={x(m.i)} y={pad.t - 2.5} textAnchor="middle" fontSize="10" fontWeight="700" fill="var(--ink)">
                    {m.n}
                  </text>
                </g>
              ))}
              {hover !== null && <line x1={x(hover)} x2={x(hover)} y1={pad.t} y2={pad.t + h} stroke="var(--ink)" strokeOpacity={0.35} />}
              {series.map((s) => {
                // Break the line where a month wasn't measured.
                const runs: string[] = [];
                let run = "";
                s.values.forEach((v, i) => {
                  if (v === null) {
                    if (run) runs.push(run);
                    run = "";
                  } else run += `${run ? "L" : "M"}${x(i)} ${y(v)}`;
                });
                if (run) runs.push(run);
                return (
                  <g key={s.key}>
                    {runs.map((d, n) => (
                      <path key={n} d={d} fill="none" stroke={COLOR[s.slot]} strokeWidth={2} strokeLinejoin="round" strokeLinecap="round" />
                    ))}
                    {s.values.map((v, i) => (v === null ? null : <Mark key={i} slot={s.slot} x={x(i)} y={y(v)} hollow={s.thin?.[i]} />))}
                  </g>
                );
              })}
            </svg>
            {hover !== null && (
              <div
                className={cx(
                  "pointer-events-none absolute top-1 z-10 w-max max-w-56 rounded-xl border border-line-strong bg-surface px-3 py-2 text-sm shadow-lg",
                )}
                style={x(hover) > width / 2 ? { right: width - x(hover) + 10 } : { left: x(hover) + 10 }}
              >
                <p className="font-semibold">{monthLabel(buckets[hover], true)}</p>
                {series.map((s) => (
                  <p key={s.key} className="flex items-center gap-1.5">
                    <Swatch slot={s.slot} />
                    <span className="text-ink-muted">{series.length > 1 ? s.name : unit}</span>
                    <span className="ml-auto pl-3 font-semibold tabular-nums">{fmt(s.values[hover])}</span>
                  </p>
                ))}
                {series.some((s) => s.thin?.[hover]) && <p className="mt-1 text-xs text-ink-muted">Small sample: read with care.</p>}
                {shown
                  .filter((m) => m.i === hover)
                  .map((m) => (
                    <p key={m.n} className="mt-1 text-xs text-ink-muted">
                      {m.n}. {m.label}
                    </p>
                  ))}
              </div>
            )}
          </>
        )}
      </div>
      {any && shown.length > 0 && (
        <ol className="mt-2 flex flex-col gap-0.5 text-sm text-ink-muted">
          {shown.map((m) => (
            <li key={`${m.n}-${m.bucket}`}>
              <span className="font-semibold text-ink">{m.n}.</span> {monthLabel(m.bucket, true)}: {m.label}
            </li>
          ))}
        </ol>
      )}
      {any && (
        <details className="mt-2 text-sm">
          <summary className="cursor-pointer font-medium text-ink-muted hover:text-ink">Show the figures as a table</summary>
          <div className="mt-2 overflow-x-auto">
            <table className="w-full min-w-72 border-collapse text-left tabular-nums">
              <caption className="sr-only">
                {title} ({unit})
              </caption>
              <thead>
                <tr className="border-b border-line-strong">
                  <th scope="col" className="py-1 pr-3 font-semibold">
                    Month
                  </th>
                  {series.map((s) => (
                    <th key={s.key} scope="col" className="py-1 pr-3 font-semibold">
                      {series.length > 1 ? s.name : unit}
                    </th>
                  ))}
                </tr>
              </thead>
              <tbody>
                {buckets.map((b, i) => (
                  <tr key={b} className="border-b border-line">
                    <th scope="row" className="py-1 pr-3 font-normal">
                      {monthLabel(b, true)}
                    </th>
                    {series.map((s) => (
                      <td key={s.key} className="py-1 pr-3">
                        {fmt(s.values[i])}
                        {s.thin?.[i] ? " (small sample)" : ""}
                      </td>
                    ))}
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </details>
      )}
    </figure>
  );
}

/** One measure across a few named things: a bar each, longest first, with its number written out. */
export function BarList({
  title,
  note,
  unit,
  one,
  rows,
}: {
  title: string;
  note?: string;
  unit: string;
  /** The unit for exactly one, if it reads differently: "case". */
  one?: string;
  rows: { key: string; label: string; value: number; href?: string; detail?: string }[];
}) {
  const max = Math.max(1, ...rows.map((r) => r.value));
  const sorted = [...rows].sort((a, b) => b.value - a.value);
  return (
    <figure className="min-w-0 rounded-2xl border border-line bg-surface p-4">
      <figcaption>
        <p className="font-semibold">{title}</p>
        {note && <p className="mt-0.5 text-sm text-ink-muted">{note}</p>}
      </figcaption>
      {!sorted.length ? (
        <p className="mt-3 rounded-xl bg-muted p-3 text-sm text-ink-muted">Nothing to show yet.</p>
      ) : (
        <ul className="mt-3 flex flex-col gap-2.5">
          {sorted.map((r) => (
            <li key={r.key} title={`${r.label}: ${r.value} ${r.value === 1 && one ? one : unit}${r.detail ? `, ${r.detail}` : ""}`}>
              <div className="flex items-baseline justify-between gap-3 text-sm">
                {r.href ? (
                  <a href={r.href} className="min-w-0 truncate font-medium underline-offset-2 hover:underline">
                    {r.label}
                  </a>
                ) : (
                  <span className="min-w-0 truncate font-medium">{r.label}</span>
                )}
                <span className="shrink-0 tabular-nums">
                  <span className="font-semibold">{r.value}</span> <span className="text-ink-muted">{r.value === 1 && one ? one : unit}</span>
                </span>
              </div>
              <div className="mt-1 h-2.5 rounded-r bg-muted">
                <div className="h-full rounded-r" style={{ width: `${Math.max(2, (r.value / max) * 100)}%`, background: "var(--viz-1)" }} />
              </div>
              {r.detail && <p className="mt-0.5 text-xs text-ink-muted">{r.detail}</p>}
            </li>
          ))}
        </ul>
      )}
    </figure>
  );
}
