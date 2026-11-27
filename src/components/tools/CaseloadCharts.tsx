"use client";

import { useId, useState } from "react";
import { dollars, type Forecast } from "@/lib/hiringModel";
import { cx } from "@/lib/format";

/*
  The Caseload-to-Margin charts (components/tools/CaseloadPlanner). Thin marks, one y-axis each, recessive grid, a
  hover/focus tooltip per month, and a table view of exactly the same numbers. Colours were validated for colour-vision
  differences in light and dark (current team orange, selected option teal); the current team is also dashed and both
  lines are labelled, so identity is never colour alone.
*/

const W = 640;
const H = 240;
const PAD = { l: 52, r: 16, t: 16, b: 30 };
const plotW = W - PAD.l - PAD.r;
const plotH = H - PAD.t - PAD.b;
const xAt = (m: number, n: number) => PAD.l + (n <= 1 ? plotW / 2 : ((m - 1) / (n - 1)) * plotW);

function niceMax(v: number) {
  if (v <= 0) return 1;
  const p = 10 ** Math.floor(Math.log10(v));
  return Math.ceil(v / p / 0.5) * 0.5 * p;
}

/** A month-by-month tooltip: hover anywhere over a month, or tab to it. */
function useHover() {
  const [at, setAt] = useState<number | null>(null);
  return { at, setAt };
}

function Tooltip({ x, lines }: { x: number; lines: string[] }) {
  const left = `${(x / W) * 100}%`;
  return (
    <div
      role="status"
      className="pointer-events-none absolute top-2 z-10 -translate-x-1/2 whitespace-nowrap rounded-xl border border-line bg-surface px-3 py-2 text-sm shadow-lg"
      style={{ left }}
    >
      {lines.map((l, i) => (
        <p key={i} className={i === 0 ? "font-semibold" : "tabular-nums text-ink-muted"}>
          {l}
        </p>
      ))}
    </div>
  );
}

function MonthTargets({ n, onAt, labelFor }: { n: number; onAt: (m: number | null) => void; labelFor: (m: number) => string }) {
  const step = n > 1 ? plotW / (n - 1) : plotW;
  return (
    <g>
      {Array.from({ length: n }, (_, i) => {
        const m = i + 1;
        const x = xAt(m, n);
        return (
          <rect
            key={m}
            x={x - step / 2}
            y={PAD.t}
            width={step}
            height={plotH}
            fill="transparent"
            tabIndex={0}
            aria-label={labelFor(m)}
            className="outline-none focus-visible:fill-[#0e7c7b]/10"
            onMouseEnter={() => onAt(m)}
            onFocus={() => onAt(m)}
            onMouseLeave={() => onAt(null)}
            onBlur={() => onAt(null)}
          />
        );
      })}
    </g>
  );
}

function XAxis({ n }: { n: number }) {
  return (
    <g className="fill-ink-muted text-xs">
      {Array.from({ length: n }, (_, i) => (
        <text key={i} x={xAt(i + 1, n)} y={H - 10} textAnchor="middle">
          M{i + 1}
        </text>
      ))}
    </g>
  );
}

const pctLabel = (u: number | null) => (u === null ? "No available capacity" : `${Math.round(u * 100)}%`);

/** Utilisation each month: the current team, and the selected option, against the planning threshold. */
export function CapacityChart({
  current,
  selected,
  selectedLabel,
  threshold,
}: {
  current: Forecast;
  selected: Forecast | null;
  selectedLabel: string;
  threshold: number;
}) {
  const id = useId();
  const { at, setAt } = useHover();
  const n = current.months.length;
  const vals = [...current.months, ...(selected?.months ?? [])].map((m) => m.utilisation ?? 0);
  const max = niceMax(Math.max(threshold * 1.15, ...vals, 1));
  const y = (u: number) => PAD.t + plotH - (u / max) * plotH;
  const path = (f: Forecast) =>
    f.months
      .map((m, i) =>
        m.utilisation === null
          ? null
          : `${i === 0 || f.months[i - 1].utilisation === null ? "M" : "L"}${xAt(m.month, n).toFixed(1)},${y(m.utilisation).toFixed(1)}`,
      )
      .filter(Boolean)
      .join(" ");
  const ticks = [0, max / 2, max];
  const last = (f: Forecast) => [...f.months].reverse().find((m) => m.utilisation !== null);
  const lc = last(current);
  const ls = selected ? last(selected) : undefined;
  return (
    <figure className="relative">
      <svg viewBox={`0 0 ${W} ${H}`} className="block h-auto w-full" role="img" aria-labelledby={`${id}-t`}>
        <title id={`${id}-t`}>
          Utilisation by month: current team{selected ? ` and ${selectedLabel}` : ""}, against a {Math.round(threshold * 100)}% planning threshold.
        </title>
        {ticks.map((t) => (
          <g key={t}>
            <line x1={PAD.l} x2={W - PAD.r} y1={y(t)} y2={y(t)} className="stroke-line" strokeWidth={1} />
            <text x={PAD.l - 8} y={y(t) + 4} textAnchor="end" className="fill-ink-muted text-xs">
              {Math.round(t * 100)}%
            </text>
          </g>
        ))}
        <line x1={PAD.l} x2={W - PAD.r} y1={y(threshold)} y2={y(threshold)} className="stroke-ink" strokeWidth={1.5} strokeDasharray="2 4" />
        <text x={W - PAD.r} y={y(threshold) - 6} textAnchor="end" className="fill-ink text-xs font-semibold">
          Threshold {Math.round(threshold * 100)}%
        </text>
        <path d={path(current)} fill="none" strokeWidth={2} strokeDasharray="6 4" strokeLinecap="round" className="stroke-[#c0562c] dark:stroke-[#d4703d]" />
        {selected && <path d={path(selected)} fill="none" strokeWidth={2} strokeLinecap="round" className="stroke-[#00918a] dark:stroke-[#2aa8a6]" />}
        {current.months.map((m) =>
          m.noCapacity ? (
            <text key={m.month} x={xAt(m.month, n)} y={PAD.t + 12} textAnchor="middle" className="fill-ink text-[12px] font-bold" aria-hidden>
              ×
            </text>
          ) : null,
        )}
        {at !== null && <line x1={xAt(at, n)} x2={xAt(at, n)} y1={PAD.t} y2={PAD.t + plotH} className="stroke-ink-muted" strokeWidth={1} />}
        {at !== null &&
          [current, selected].map((f, k) => {
            const m = f?.months[at - 1];
            return m && m.utilisation !== null ? (
              <circle
                key={k}
                cx={xAt(at, n)}
                cy={y(m.utilisation)}
                r={4.5}
                strokeWidth={2}
                className={cx("stroke-surface", k === 0 ? "fill-[#c0562c] dark:fill-[#d4703d]" : "fill-[#00918a] dark:fill-[#2aa8a6]")}
              />
            ) : null;
          })}
        <XAxis n={n} />
        <MonthTargets
          n={n}
          onAt={setAt}
          labelFor={(m) =>
            `Month ${m}: current team ${pctLabel(current.months[m - 1].utilisation)}${selected ? `, ${selectedLabel} ${pctLabel(selected.months[m - 1].utilisation)}` : ""}`
          }
        />
      </svg>
      {at !== null && (
        <Tooltip
          x={xAt(at, n)}
          lines={[
            `Month ${at}`,
            `Current team: ${pctLabel(current.months[at - 1].utilisation)}`,
            ...(selected ? [`${selectedLabel}: ${pctLabel(selected.months[at - 1].utilisation)}`] : []),
          ]}
        />
      )}
      {/* The legend, with each line's last value: identity is never colour alone. */}
      <figcaption className="mt-2 flex flex-wrap gap-x-5 gap-y-1 text-sm">
        <span className="inline-flex items-center gap-2">
          <svg width="26" height="8" aria-hidden>
            <line x1="1" x2="25" y1="4" y2="4" strokeWidth="2" strokeDasharray="6 4" className="stroke-[#c0562c] dark:stroke-[#d4703d]" />
          </svg>
          Current team{lc ? ` · Month ${lc.month}: ${pctLabel(lc.utilisation)}` : ""}
        </span>
        {selected && (
          <span className="inline-flex items-center gap-2">
            <svg width="26" height="8" aria-hidden>
              <line x1="1" x2="25" y1="4" y2="4" strokeWidth="2" className="stroke-[#00918a] dark:stroke-[#2aa8a6]" />
            </svg>
            {selectedLabel}
            {ls ? ` · Month ${ls.month}: ${pctLabel(ls.utilisation)}` : ""}
          </span>
        )}
        <span className="inline-flex items-center gap-2 text-ink-muted">
          <svg width="26" height="8" aria-hidden>
            <line x1="1" x2="25" y1="4" y2="4" strokeWidth="1.5" strokeDasharray="2 4" className="stroke-ink" />
          </svg>
          Planning threshold
        </span>
        {current.months.some((m) => m.noCapacity) && <span>× No available capacity</span>}
      </figcaption>
    </figure>
  );
}

/** Operating result each month as bars, or closing cash as a line against the reserve. One series, so no legend box. */
export function FinanceChart({ f, view, reserve }: { f: Forecast; view: "operating" | "cash"; reserve: number }) {
  const id = useId();
  const { at, setAt } = useHover();
  const n = f.months.length;
  const vals = f.months.map((m) => (view === "cash" ? m.closingCash : m.operating));
  const hi = niceMax(Math.max(0, ...vals, view === "cash" ? reserve : 0) * 1.05);
  const lowest = Math.min(0, ...vals);
  const lo = lowest < 0 ? -niceMax(-lowest * 1.05) : 0;
  const y = (v: number) => PAD.t + plotH - ((v - lo) / (hi - lo)) * plotH;
  const ticks = lo < 0 ? [lo, 0, hi] : [0, hi / 2, hi];
  const step = n > 1 ? plotW / (n - 1) : plotW;
  const barW = Math.max(6, Math.min(26, step * 0.55));
  return (
    <figure className="relative">
      <svg viewBox={`0 0 ${W} ${H}`} className="block h-auto w-full" role="img" aria-labelledby={`${id}-t`}>
        <title id={`${id}-t`}>{view === "cash" ? `Closing cash by month, against a ${dollars(reserve)} reserve.` : "Operating result by month."}</title>
        {ticks.map((t) => (
          <g key={t}>
            <line x1={PAD.l} x2={W - PAD.r} y1={y(t)} y2={y(t)} className={t === 0 ? "stroke-ink-muted" : "stroke-line"} strokeWidth={1} />
            {/* The lowest label gives way when it would sit on the zero line's. */}
            {!(t < 0 && Math.abs(y(t) - y(0)) < 14) && (
              <text x={PAD.l - 8} y={y(t) + 4} textAnchor="end" className="fill-ink-muted text-xs">
                {Math.abs(t) >= 1000 ? `${t < 0 ? "−" : ""}$${Math.round(Math.abs(t) / 1000)}k` : dollars(t)}
              </text>
            )}
          </g>
        ))}
        {view === "operating" &&
          f.months.map((m) => {
            const top = y(Math.max(0, m.operating));
            const h = Math.max(1, Math.abs(y(m.operating) - y(0)));
            return (
              <rect
                key={m.month}
                x={xAt(m.month, n) - barW / 2}
                y={top}
                width={barW}
                height={h}
                rx={3}
                className={m.operating < 0 ? "fill-[#c0562c] dark:fill-[#d4703d]" : "fill-[#00918a] dark:fill-[#2aa8a6]"}
              />
            );
          })}
        {view === "cash" && (
          <>
            <line x1={PAD.l} x2={W - PAD.r} y1={y(reserve)} y2={y(reserve)} className="stroke-ink" strokeWidth={1.5} strokeDasharray="2 4" />
            <text x={W - PAD.r} y={y(reserve) - 6} textAnchor="end" className="fill-ink text-xs font-semibold">
              Reserve {dollars(reserve)}
            </text>
            <path
              d={f.months.map((m, i) => `${i ? "L" : "M"}${xAt(m.month, n).toFixed(1)},${y(m.closingCash).toFixed(1)}`).join(" ")}
              fill="none"
              strokeWidth={2}
              strokeLinecap="round"
              className="stroke-[#00918a] dark:stroke-[#2aa8a6]"
            />
            {f.months
              .filter((m) => m.reserveBreach)
              .map((m) => (
                <circle
                  key={m.month}
                  cx={xAt(m.month, n)}
                  cy={y(m.closingCash)}
                  r={4.5}
                  strokeWidth={2}
                  className="fill-[#c0562c] stroke-surface dark:fill-[#d4703d]"
                />
              ))}
          </>
        )}
        {at !== null && <line x1={xAt(at, n)} x2={xAt(at, n)} y1={PAD.t} y2={PAD.t + plotH} className="stroke-ink-muted" strokeWidth={1} />}
        <XAxis n={n} />
        <MonthTargets
          n={n}
          onAt={setAt}
          labelFor={(m) =>
            view === "cash"
              ? `Month ${m}: closing cash ${dollars(f.months[m - 1].closingCash)}${f.months[m - 1].reserveBreach ? ", below reserve" : ""}`
              : `Month ${m}: operating result ${dollars(f.months[m - 1].operating)}`
          }
        />
      </svg>
      {at !== null && (
        <Tooltip
          x={xAt(at, n)}
          lines={
            view === "cash"
              ? [`Month ${at}`, `Closing cash: ${dollars(f.months[at - 1].closingCash)}`, ...(f.months[at - 1].reserveBreach ? ["Below reserve"] : [])]
              : [`Month ${at}`, `Operating result: ${dollars(f.months[at - 1].operating)}`, `Earned: ${dollars(f.months[at - 1].earned)}`]
          }
        />
      )}
      {view === "cash" && f.months.some((m) => m.reserveBreach) && (
        <figcaption className="mt-2 text-sm">
          <span aria-hidden className="mr-1.5 inline-block size-2.5 rounded-full bg-[#c0562c] align-middle dark:bg-[#d4703d]" />
          Marked months are below the reserve.
        </figcaption>
      )}
      {view === "operating" && f.months.some((m) => m.operating < 0) && (
        <figcaption className="mt-2 text-sm">Bars below the zero line are months with a negative operating result.</figcaption>
      )}
    </figure>
  );
}
