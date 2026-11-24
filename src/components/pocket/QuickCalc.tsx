"use client";

import { useEffect, useMemo, useRef, useState } from "react";
import { CURRENT_RULE_SET, QUICK_CALC_RULE_SETS } from "@/content/quickCalcRules";
import { cx } from "@/lib/format";
import {
  blankInput,
  CALC_STATE,
  PRICE_STATUS,
  quickCalc,
  RATE_STATUS,
  RULE_SET_STATUS,
  ruleSetFor,
  SPECIAL,
  type CalcInput,
  type PriceStatus,
  type RateStatus,
  type Special,
} from "@/lib/quickCalc";
import { aud } from "@/lib/sahRules";
import { Icon } from "../Icon";
import { pocketEvent } from "./pocketApi";
import { RouteText } from "./PocketTool";

/*
  Tool A, the contribution Quick-Calc (docs/pocket-playbook.md). Everything typed here lives only in this
  component's memory: no storage, no URL, no Favourite and no event ever holds it, and closing the drawer or pressing
  Clear removes it. A complete calculation from typed values is an Estimate, never Confirmed.

  Three separate views: the estimate, interim funding (an allocation while waiting for full funding) and an interim
  contribution (a rate not yet notified). They are never merged into one "bridging" figure.
*/

type View = "estimate" | "funding" | "interim";
const VIEWS: { key: View; label: string }[] = [
  { key: "estimate", label: "Contribution estimate" },
  { key: "funding", label: "Interim funding" },
  { key: "interim", label: "Rate not yet notified" },
];
const STATE_TONE = {
  confirmed: "border-success bg-success/10",
  estimate: "border-action bg-tealtint",
  needs_verification: "border-[#b7791f] bg-[#fff1cc] text-[#4a3400] dark:border-[#ffd97a] dark:bg-[#3d2f08] dark:text-[#ffd97a]",
} as const;
const field = "min-h-12 w-full rounded-xl border border-line-strong bg-surface px-3 text-base";
const label = "flex flex-col gap-1 text-sm font-semibold";

export function QuickCalc({ toolId, place, contact }: { toolId: string; place: string; contact: { label: string; route: string } | null }) {
  const [view, setView] = useState<View>("estimate");
  const [input, setInput] = useState<CalcInput>(blankInput);
  const [copied, setCopied] = useState(false);
  const touched = useRef(false);
  const result = useMemo(() => quickCalc(input, QUICK_CALC_RULE_SETS), [input]);
  const set = (k: keyof CalcInput) => (e: React.ChangeEvent<HTMLInputElement | HTMLSelectElement>) => {
    touched.current = true;
    setCopied(false);
    setInput((i) => ({ ...i, [k]: e.target.value }));
  };
  const rs = ruleSetFor(QUICK_CALC_RULE_SETS, input.date) ?? CURRENT_RULE_SET;
  const services = CURRENT_RULE_SET.services;

  // One event when the answer settles into a state (an estimate, or needs verification), with the rule set it ran on.
  // The state and the version only: never a figure.
  const lastSent = useRef("");
  useEffect(() => {
    if (!touched.current) return;
    const sig = `${result.state}:${result.ruleSet?.number ?? 0}`;
    if (sig === lastSent.current) return;
    const t = window.setTimeout(() => {
      lastSent.current = sig;
      pocketEvent({
        event: result.state === "estimate" ? "calculator_estimate_run" : "calculator_needs_verification",
        toolId,
        ruleSet: result.ruleSet?.number ?? 0,
        place,
      });
    }, 1200);
    return () => window.clearTimeout(t);
  }, [result.state, result.ruleSet?.number, toolId, place]);

  const openView = (v: View) => {
    setView(v);
    if (v === "funding") pocketEvent({ event: "funding_view_opened", toolId, place });
    if (v === "interim") pocketEvent({ event: "interim_contribution_view_opened", toolId, place });
  };

  return (
    <div>
      <div role="group" aria-label="Quick-Calc views" className="flex flex-wrap gap-1 rounded-2xl bg-muted p-1">
        {VIEWS.map((v) => (
          <button
            key={v.key}
            type="button"
            aria-pressed={view === v.key}
            onClick={() => openView(v.key)}
            className={cx("min-h-11 flex-1 rounded-xl px-3 text-sm font-semibold", view === v.key ? "bg-surface shadow-sm" : "text-ink-muted")}
          >
            {v.label}
          </button>
        ))}
      </div>

      {view === "funding" && <Explainer kind="funding" />}
      {view === "interim" && <Explainer kind="interim" contact={contact} />}

      {view === "estimate" && (
        <div role="region" aria-label="Contribution estimate" className="mt-4">
          {/* The answer, its status and the next action first, so it's in view during a call. Announced when it changes. */}
          <section aria-live="polite" aria-atomic="true" className={cx("rounded-2xl border-2 p-4", STATE_TONE[result.state])}>
            <p className="flex items-center gap-2 font-mulish text-xs font-extrabold uppercase tracking-[0.12em]">
              <Icon name={result.state === "estimate" ? "info" : "alert"} className="size-4" /> {CALC_STATE[result.state]}
            </p>
            <p className="mt-1 font-serif text-2xl font-semibold">
              {result.state === "estimate" && result.participantCents !== null
                ? `Estimated participant contribution: ${aud(result.participantCents)}`
                : "Cannot calculate yet"}
            </p>
            {result.state === "needs_verification" && result.missing[0] && (
              <p className="mt-1">
                <span className="font-semibold">Missing:</span> {result.missing[0]}
              </p>
            )}
            <p className="mt-1 text-sm">
              <span className="font-semibold">Next:</span> {result.next[0]}
            </p>
          </section>

          <p className="mt-3 text-sm text-ink-muted">
            Type the facts from the participant’s agreement and notice. Nothing you enter is saved, sent or kept: Clear or closing removes it. No names, please.
          </p>

          <div className="mt-3 grid gap-3 sm:grid-cols-2">
            <label className={label}>
              Service
              <select className={field} value={input.service} onChange={set("service")}>
                <option value="">Choose the approved service</option>
                {services.map((s) => (
                  <option key={s.id} value={s.id}>
                    {s.label}
                  </option>
                ))}
              </select>
            </label>
            <label className={label}>
              Service date
              <span className="flex gap-2">
                <input type="date" className={field} value={input.date} onChange={set("date")} autoComplete="off" />
                <button
                  type="button"
                  className="min-h-12 shrink-0 rounded-xl border border-line-strong px-3 font-semibold hover:bg-muted"
                  onClick={() => {
                    touched.current = true;
                    const d = new Date();
                    const date = [d.getFullYear(), d.getMonth() + 1, d.getDate()].map((n) => String(n).padStart(2, "0")).join("-");
                    setInput((i) => ({ ...i, date }));
                  }}
                >
                  Today
                </button>
              </span>
            </label>
            <label className={label}>
              Agreed price per {services.find((s) => s.id === input.service)?.unit ?? "unit"} ($)
              <input inputMode="decimal" className={field} value={input.unitPrice} onChange={set("unitPrice")} autoComplete="off" placeholder="e.g. 67.45" />
            </label>
            <label className={label}>
              Quantity ({services.find((s) => s.id === input.service)?.units ?? "units"})
              <input inputMode="decimal" className={field} value={input.units} onChange={set("units")} autoComplete="off" placeholder="e.g. 1.5" />
            </label>
            <label className={cx(label, "sm:col-span-2")}>
              Where the price comes from
              <select className={field} value={input.priceStatus} onChange={set("priceStatus")}>
                <option value="">Choose</option>
                {(Object.keys(PRICE_STATUS) as Exclude<PriceStatus, "">[]).map((k) => (
                  <option key={k} value={k}>
                    {PRICE_STATUS[k]}
                  </option>
                ))}
              </select>
            </label>
            <label className={label}>
              Contribution rate status
              <select className={field} value={input.rateStatus} onChange={set("rateStatus")}>
                <option value="">Choose</option>
                {(Object.keys(RATE_STATUS) as Exclude<RateStatus, "">[]).map((k) => (
                  <option key={k} value={k}>
                    {RATE_STATUS[k]}
                  </option>
                ))}
              </select>
            </label>
            {(input.rateStatus === "confirmed" || input.rateStatus === "agreed_interim") && (
              <label className={label}>
                {input.rateStatus === "agreed_interim" ? "Agreed interim rate (%)" : "Notified rate for this category (%)"}
                <input inputMode="decimal" className={field} value={input.rate} onChange={set("rate")} autoComplete="off" />
              </label>
            )}
            <label className={cx(label, "sm:col-span-2")}>
              Hardship, exemption or lifetime cap
              <select className={field} value={input.special} onChange={set("special")}>
                <option value="">Choose</option>
                {(Object.keys(SPECIAL) as Exclude<Special, "">[]).map((k) => (
                  <option key={k} value={k}>
                    {SPECIAL[k]}
                  </option>
                ))}
              </select>
            </label>
          </div>
          <button
            type="button"
            onClick={() => {
              setInput(blankInput());
              setCopied(false);
            }}
            className="mt-3 inline-flex min-h-11 items-center gap-2 rounded-full border border-line-strong px-4 font-semibold hover:bg-muted"
          >
            <Icon name="trash" className="size-4" /> Clear everything
          </button>

          {result.missing.length > 1 && (
            <section className="mt-4">
              <h3 className="font-semibold">Still needed before a figure</h3>
              <ul className="mt-1 list-disc pl-5">
                {result.missing.map((m) => (
                  <li key={m}>{m}</li>
                ))}
              </ul>
            </section>
          )}

          {result.lines.length > 0 && (
            <section className="mt-4">
              <h3 className="font-semibold">How it’s worked out</h3>
              <table className="mt-1 w-full text-left text-sm">
                <thead className="sr-only">
                  <tr>
                    <th>Item</th>
                    <th>Value</th>
                    <th>Where it comes from</th>
                  </tr>
                </thead>
                <tbody>
                  {result.lines.map((l) => (
                    <tr key={l.label} className="border-t border-line align-top">
                      <th scope="row" className="py-1.5 pr-2 font-semibold">
                        {l.label}
                      </th>
                      <td className="py-1.5 pr-2 tabular-nums">{l.value}</td>
                      <td className="py-1.5 text-ink-muted">{l.provenance}</td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </section>
          )}

          <section className="mt-4 rounded-2xl bg-muted p-4">
            <h3 className="font-semibold">What to say</h3>
            <p className="mt-1">{result.say}</p>
            <button
              type="button"
              onClick={async () => {
                try {
                  await navigator.clipboard.writeText(`${result.sayTemplate}\n\nVerify before use: check the participant’s notice and agreement.`);
                  setCopied(true);
                } catch {
                  setCopied(false);
                }
              }}
              className="mt-2 inline-flex min-h-11 items-center gap-2 rounded-full border border-line-strong bg-surface px-4 font-semibold hover:bg-muted"
            >
              <Icon name="copy" className="size-4" /> Copy the wording, with placeholders
            </button>
            <p role="status" className="mt-1 min-h-5 text-sm">
              {copied ? "Copied with [placeholders], not the figures. Fill them in yourself, and verify before use." : ""}
            </p>
          </section>

          <section className="mt-4">
            <h3 className="font-semibold">What to check next</h3>
            <ul className="mt-1 list-disc pl-5">
              {result.next.map((n) => (
                <li key={n}>{n}</li>
              ))}
            </ul>
            {contact && (
              <p className="mt-2 text-sm">
                {contact.label}:{" "}
                {contact.route ? <RouteText route={contact.route} /> : <span className="text-ink-muted">route not set up yet (awaiting Finance)</span>}
              </p>
            )}
          </section>

          <RuleSource rs={rs} />
        </div>
      )}
    </div>
  );
}

function RuleSource({ rs }: { rs: (typeof QUICK_CALC_RULE_SETS)[number] }) {
  return (
    <section className="mt-4 border-t border-line pt-3 text-sm text-ink-muted">
      <p>
        <span className="font-semibold text-ink">Rule set {rs.number}</span> ({rs.id}) · {RULE_SET_STATUS[rs.status]} · for services from {rs.effectiveFrom}
        {rs.effectiveTo ? ` to ${rs.effectiveTo}` : ""}. Rounding: {rs.rounding.note}
      </p>
      <ul className="mt-1 flex flex-col gap-0.5">
        {rs.sources.map((s) => (
          <li key={s.href}>
            <a href={s.href} target="_blank" rel="noreferrer" className="inline-flex min-h-11 items-center underline underline-offset-2">
              {s.label}
            </a>
            : {s.section}
          </li>
        ))}
      </ul>
    </section>
  );
}

/** The two waiting states, each on its own: reviewed words, what to check, and who follows up. No figures to type. */
function Explainer({ kind, contact }: { kind: "funding" | "interim"; contact?: { label: string; route: string } | null }) {
  const rs = CURRENT_RULE_SET;
  const funding = kind === "funding";
  const say = funding ? rs.interimFunding.say : rs.interimContribution.say;
  const check = funding ? rs.interimFunding.check : rs.interimContribution.check;
  return (
    <div role="region" aria-label={funding ? "Interim funding" : "Rate not yet notified"} className="mt-4">
      <section className="rounded-2xl border-2 border-line-strong p-4">
        <p className="font-mulish text-xs font-extrabold uppercase tracking-[0.12em] text-accent">
          {funding ? "Interim funding: an allocation while waiting" : "Interim contribution: the rate isn’t notified yet"}
        </p>
        <p className="mt-1">
          {funding
            ? "The participant has part of their Support at Home funding while they wait for the rest. Use only the allocation on their notice. This isn’t their contribution rate."
            : "Services Australia hasn’t notified the participant’s assessed contribution rate. Any amount agreed meanwhile is interim, not their final rate."}
        </p>
      </section>
      <section className="mt-4 rounded-2xl bg-muted p-4">
        <h3 className="font-semibold">What to say</h3>
        <p className="mt-1">{say}</p>
      </section>
      <section className="mt-4">
        <h3 className="font-semibold">Check before you say it</h3>
        <ul className="mt-1 list-disc pl-5">
          {check.map((c) => (
            <li key={c}>{c}</li>
          ))}
        </ul>
        {funding ? (
          <p className="mt-2 text-sm text-ink-muted">{rs.interimFunding.note}</p>
        ) : (
          <p className="mt-2">
            <span className="font-semibold">Who follows up:</span> {rs.interimContribution.followUp}
            {contact && (
              <>
                {" "}
                {contact.label}:{" "}
                {contact.route ? <RouteText route={contact.route} /> : <span className="text-ink-muted">route not set up yet (awaiting Finance)</span>}
              </>
            )}
          </p>
        )}
      </section>
      <p className="mt-4 text-sm text-ink-muted">
        {funding
          ? "Don’t work out a date for the rest of the funding, and don’t treat the unallocated part as spendable."
          : "Don’t describe an interim amount as the final assessed rate, and don’t estimate a rate from income or pension status."}
      </p>
      <RuleSource rs={rs} />
    </div>
  );
}
