"use client";

import { useId, useState } from "react";
import { cx } from "@/lib/format";
import { dollars } from "@/lib/hiringModel";
import { monthWord, recruitText, type DecisionWindow, type sensitivity } from "@/lib/hiringWindow";
import { Icon } from "../Icon";

/*
  The decision window (lib/hiringWindow), shared by the Hiring Runway lab and the Plan my business Work Tool, so the
  fictional case and a real plan read the same way: the suggestion and why, the pressure and recruitment windows,
  capacity, margin and cash side by side for every option, the alternatives that need judgement, the assumptions and
  unknowns, and a one-at-a-time sensitivity table. Risks are words with an icon, never colour alone; every figure is a
  table cell; nothing animates.
*/

type Sensitivity = ReturnType<typeof sensitivity>;
const scroll = "overflow-x-auto";
const th = "py-2 pr-3 text-left align-bottom font-semibold";
const td = "py-1.5 pr-3 align-top tabular-nums";

const KIND_ICON = {
  "hold-monitor": "check",
  watch: "info",
  "plan-recruitment": "calendar",
  "begin-recruiting": "arrow-right",
  "interim-and-recruit": "alert",
  conflict: "alert",
  "no-hire-option": "info",
} as const;

export function DecisionWindowPanel({
  dw,
  getSensitivity,
  onView,
  note,
  level = 2,
  className,
}: {
  dw: DecisionWindow;
  /** Worked out only when the table is opened. */
  getSensitivity?: () => Sensitivity;
  onView?: (v: "sensitivity" | "basis") => void;
  /** A provenance note: fictional, or illustrative until the income is verified. */
  note?: string;
  level?: 2 | 4;
  className?: string;
}) {
  const id = useId();
  const [sens, setSens] = useState<Sensitivity | null>(null);
  const H = level === 2 ? "h2" : "h4";
  const Sub = level === 2 ? "h3" : "h5";
  const r = dw.recommendation;
  const base = dw.cases.find((c) => c.id === dw.baseId);
  const hires = dw.options.filter((o) => o.kind === "hire");
  const money = (v: number) => (dw.revenueKnown ? dollars(v) : "Revenue unknown");
  const cash = (v: number) => (dw.moneyKnown ? dollars(v) : "Not checked");

  return (
    <section aria-labelledby={`${id}-h`} className={cx("rounded-3xl border-2 border-action bg-surface p-4 sm:p-5", className)}>
      <p className="font-mulish text-xs font-extrabold uppercase tracking-[0.12em] text-accent">Decision window · across {dw.cases.length} growth cases</p>
      <H id={`${id}-h`} className="mt-1 flex flex-wrap items-center gap-2 font-serif text-xl font-semibold sm:text-2xl">
        <Icon name={KIND_ICON[r.kind]} className="size-5 shrink-0" />
        {r.label}
      </H>
      <p className="mt-1" aria-live="polite">
        {r.headline}
      </p>
      {note && <p className="mt-2 rounded-xl bg-muted px-3 py-2 text-sm">{note}</p>}

      {/* Capacity, recruitment and cash: the three questions side by side. */}
      <dl className="mt-3 grid gap-2 sm:grid-cols-3">
        <div className="rounded-2xl bg-muted p-3">
          <dt className="text-sm font-semibold">Likely pressure window</dt>
          <dd className="mt-1 font-serif text-lg font-semibold">
            {dw.pressure
              ? dw.pressure.from === dw.pressure.to
                ? `Month ${dw.pressure.from}`
                : `Month ${dw.pressure.from} to ${dw.pressure.to}`
              : "None in 12 months"}
          </dd>
          <dd className="text-xs text-ink-muted">
            {dw.cases.map((c) => `${c.label}: ${c.capacityMonth === null ? "none" : `Month ${c.capacityMonth}`}`).join(" · ")}
          </dd>
        </div>
        <div className="rounded-2xl bg-muted p-3">
          <dt className="text-sm font-semibold">Recruitment start window</dt>
          <dd className="mt-1 font-serif text-lg font-semibold">{recruitText(dw)}</dd>
          <dd className="text-xs text-ink-muted">
            {dw.hire ? `${dw.lead}-month search (±${dw.leadSpread}) and ${dw.ramp}-month ramp, for ${dw.hire.label}` : "No hire option to time"}
            {base?.startBy !== null && base?.startBy !== undefined ? ` · base case: start by ${monthWord(base.startBy)}` : ""}
          </dd>
        </div>
        <div className="rounded-2xl bg-muted p-3">
          <dt className="text-sm font-semibold">Cash runway with a hire</dt>
          {!dw.moneyKnown ? (
            <dd className="mt-1">
              {dw.revenueKnown ? "Not checked: costs or cash are blank." : "Revenue unknown: enter your agreement terms or seek authorised confirmation."}
            </dd>
          ) : (
            hires.map((h) => (
              <dd key={h.id} className="mt-1 text-sm">
                <span className="font-semibold">{h.label}:</span> low {dollars(h.lowestCash)} (Month {h.lowestCashMonth}){" "}
                {h.firstReserveBreach !== null ? (
                  <span className="font-semibold">
                    <Icon name="alert" className="inline size-4" /> below reserve from Month {h.firstReserveBreach}
                  </span>
                ) : (
                  "above reserve"
                )}
              </dd>
            ))
          )}
        </div>
      </dl>

      <Sub className="mt-4 font-semibold">Capacity, margin and cash side by side</Sub>
      <p className="text-sm text-ink-muted">
        The base case, for 12 months.
        {dw.timedStart !== null && ` Hires are costed from recruitment starting in Month ${dw.timedStart}, the base case’s start-by.`} Operating result always
        includes owner remuneration.
      </p>
      <div className={scroll} role="region" aria-label="Options compared" tabIndex={0}>
        <table className="mt-1 w-full min-w-[34rem] text-sm">
          <caption className="sr-only">Each option’s capacity, margin and cash in the base case</caption>
          <thead>
            <tr className="border-b border-line-strong">
              <th className={th}>Option</th>
              <th className={th}>Months above threshold</th>
              <th className={th}>Contribution margin</th>
              <th className={th}>Before owner pay</th>
              <th className={th}>Operating result</th>
              <th className={th}>Back above zero</th>
              <th className={th}>Lowest cash</th>
              <th className={th}>Risks, in words</th>
            </tr>
          </thead>
          <tbody>
            {dw.options.map((o) => (
              <tr key={o.id} className="border-b border-line">
                <th scope="row" className={cx(td, "text-left font-semibold")}>
                  {o.label}
                  {o.hypothetical && <span className="block text-xs font-normal">Hypothetical: not checked</span>}
                </th>
                <td className={td}>{o.monthsAbove}</td>
                <td className={td}>{money(o.contribution12)}</td>
                <td className={td}>{money(o.operatingBeforeOwner12)}</td>
                <td className={td}>{money(o.operating12)}</td>
                <td className={td}>{!dw.revenueKnown ? "Revenue unknown" : o.breakEven === null ? "Not in 12 months" : `Month ${o.breakEven}`}</td>
                <td className={td}>
                  {cash(o.lowestCash)}
                  {dw.moneyKnown && <span className="block text-xs">Worst case: {dollars(o.worstCash)}</span>}
                </td>
                <td className={cx(td, "min-w-[12rem]")}>
                  {[
                    o.serviceRisk && `Service risk from Month ${o.firstPressure}`,
                    o.cashRisk && `Below reserve from Month ${o.firstReserveBreach}`,
                    dw.moneyKnown && o.negativeCash && "Cash goes negative",
                    o.pressureCases.length > 0 && !o.serviceRisk && `Over threshold if ${o.pressureCases.join(" or ").toLowerCase()}`,
                    dw.moneyKnown && o.reserveCases.length > 0 && !o.cashRisk && `Below reserve if ${o.reserveCases.join(" or ").toLowerCase()}`,
                  ]
                    .filter(Boolean)
                    .join(". ") || "None in this case"}
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>

      {r.factors.length > 0 && (
        <>
          <Sub className="mt-4 font-semibold">Why</Sub>
          <ul className="mt-1 flex flex-col gap-1.5">
            {r.factors.map((f) => (
              <li key={f} className="flex gap-2">
                <Icon name="arrow-right" className="mt-1 size-4 shrink-0 text-accent" />
                <span>{f}</span>
              </li>
            ))}
          </ul>
        </>
      )}
      {r.alternatives.length > 0 && (
        <>
          <Sub className="mt-4 font-semibold">Other ways to protect participants</Sub>
          <ul className="mt-1 list-disc pl-5">
            {r.alternatives.map((a) => (
              <li key={a}>{a}</li>
            ))}
          </ul>
          <p className="mt-1 text-sm text-ink-muted">Each needs a person’s judgement and a service-quality review. None is decided here.</p>
        </>
      )}

      <details className="mt-4 rounded-2xl bg-muted p-3" onToggle={(e) => (e.currentTarget as HTMLDetailsElement).open && onView?.("basis")}>
        <summary className="flex min-h-11 cursor-pointer items-center font-semibold">Assumptions, unknowns and calculation basis</summary>
        <ul className="mt-2 list-disc pl-5 text-sm">
          {dw.assumptions.map((a) => (
            <li key={a}>{a}</li>
          ))}
        </ul>
        <p className="mt-2 text-sm">
          <span className="font-semibold">Still unknown:</span> {dw.unknowns.join("; ")}.
        </p>
        <p className="mt-2 text-sm">
          Capacity date: the first month required hours pass the threshold × available hours. Start by: capacity date − search − ramp + 1. Contribution margin:
          earned income − staff costs (recruitment included) − per-participant costs. Back above zero: the first month from which every month’s operating result
          is at least zero. Rules {dw.version}.
        </p>
      </details>

      {getSensitivity && (
        <details
          className="mt-2 rounded-2xl bg-muted p-3"
          onToggle={(e) => {
            if (!(e.currentTarget as HTMLDetailsElement).open) return;
            if (!sens) setSens(getSensitivity());
            onView?.("sensitivity");
          }}
        >
          <summary className="flex min-h-11 cursor-pointer items-center font-semibold">Sensitivity: change one assumption at a time</summary>
          {sens && (
            <div className={scroll} role="region" aria-label="Sensitivity table" tabIndex={0}>
              <table className="mt-2 w-full min-w-[36rem] text-sm">
                <caption className="sr-only">How the window and cash move when one assumption changes, in the base case</caption>
                <thead>
                  <tr className="border-b border-line-strong">
                    <th className={th}>If…</th>
                    <th className={th}>Pressure</th>
                    <th className={th}>Start by</th>
                    <th className={th}>{sens.hire ? `Lowest cash, ${sens.hire}` : "Lowest cash"}</th>
                    <th className={th}>What moved</th>
                  </tr>
                </thead>
                <tbody>
                  {[sens.base, ...sens.rows].map((x) => (
                    <tr key={x.id} className="border-b border-line">
                      <th scope="row" className={cx(td, "text-left font-normal")}>
                        {x.label}
                      </th>
                      <td className={td}>{x.capacityMonth === null ? "None" : `Month ${x.capacityMonth}`}</td>
                      <td className={td}>{x.startBy === null ? "–" : monthWord(x.startBy)}</td>
                      <td className={td}>{sens.moneyKnown ? dollars(x.lowestCash) : "Not checked"}</td>
                      <td className={td}>{x.moved.join(". ")}</td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          )}
        </details>
      )}
      <p className="mt-3 text-sm text-ink-muted">{dw.caveat}</p>
    </section>
  );
}
