"use client";

import { useState } from "react";
import { cx } from "@/lib/format";
import type { AuditorBlock } from "@/lib/magazine";
import { DECISION_ORDER, decisionText, money, type AuditDebrief, type AuditState, type Decision } from "@/lib/auditor";
import {
  AGREEMENT,
  COMPARABILITY,
  EXPLANATION_ELEMENTS,
  LINE_KINDS,
  MAX_OVERHEAD_PERCENT,
  priceView,
  type ExplanationElement,
  type FollowUp,
  type VettingPrice,
} from "@/lib/auditorVetting";
import { AidSection } from "../playbooks/AidSection";
import { Icon } from "../Icon";

/*
  The Contractor Vetting Card's own parts (docs/document-auditor.md), used by DocumentAuditor: the participant's
  request and the workers, the price panel (supplier cost, the permitted overhead, the participant price and the
  agreement, with the benchmark as context), what the learner asks for and tells the participant, and the debrief's
  checks, consequences, corrected pack and renewal. Statuses are words with an icon, never colour alone.
*/

const box = "rounded-2xl bg-bg p-4 ring-1 ring-line";
const input = "min-h-11 w-full rounded-xl border border-line-strong bg-bg px-3 py-2 text-base";
const secondary =
  "inline-flex min-h-11 items-center justify-center gap-2 rounded-full border border-line-strong bg-surface px-4 font-semibold hover:bg-muted disabled:cursor-not-allowed disabled:opacity-60";
const primary =
  "inline-flex min-h-11 items-center justify-center gap-2 rounded-full bg-action px-5 font-semibold text-on-action hover:opacity-90 disabled:cursor-not-allowed disabled:opacity-60";
const warn = "rounded-2xl bg-[#fff1cc] p-4 text-[#4a3400] dark:bg-[#3d2f08] dark:text-[#ffd97a]";
const good = "rounded-2xl bg-[#e3f4ea] p-4 text-[#0f5b3a] dark:bg-[#12392a] dark:text-[#8fe0b5]";
const bad = "rounded-2xl bg-[#fde2e0] p-4 text-[#5c1410] dark:bg-[#3d1512] dark:text-[#ffb4ab]";

type Signal = (name: string, ref?: string) => void;
type Vetting = NonNullable<AuditorBlock["vetting"]>;

/** The participant's request, first: what they want, from whom, by when. Then who is actually going to do the work. */
export function ParticipantCard({ b }: { b: AuditorBlock }) {
  const v = b.vetting!;
  const fieldName = (id: string) => {
    for (const d of b.docs) {
      const f = d.fields.find((x) => x.id === id);
      if (f) return `${d.title}: ${f.label}`;
    }
    return id;
  };
  return (
    <div className="mt-3 grid gap-3 lg:grid-cols-2">
      <section className={box} aria-label={`${v.participant.name}’s request`}>
        <h4 className="flex items-center gap-2 font-semibold">
          <Icon name="info" className="size-4 text-accent" /> {v.participant.name}’s request
        </h4>
        <dl className="mt-2 flex flex-col gap-2">
          {(
            [
              ["Goal", v.participant.goal],
              ["Preferred worker", v.participant.preferredWorker],
              ["Desired start", v.participant.desiredStart],
              ["Approved service", v.participant.approvedService],
              ["Arrangement", v.participant.arrangement],
            ] as const
          )
            .filter(([, x]) => x)
            .map(([k, x]) => (
              <div key={k}>
                <dt className="text-sm font-semibold text-ink-muted">{k}</dt>
                <dd>{x}</dd>
              </div>
            ))}
        </dl>
      </section>
      <section className={box} aria-label="Who does the work">
        <h4 className="flex items-center gap-2 font-semibold">
          <Icon name="shield" className="size-4 text-accent" /> Who does the work
        </h4>
        <p className="text-sm text-ink-muted">The business and the person are checked separately: an active ABN says nothing about the worker.</p>
        <ul className="mt-2 flex flex-col gap-2">
          {v.workers.map((w) => (
            <li key={w.id}>
              <p className="font-semibold">{w.label}</p>
              <p className="text-sm">{w.role}</p>
              {w.fieldIds.length > 0 && <p className="text-sm text-ink-muted">In the pack: {w.fieldIds.map(fieldName).join("; ")}</p>}
            </li>
          ))}
        </ul>
      </section>
    </div>
  );
}

/**
  The price, with its parts kept apart: the supplier's quote to Trilogy Care, the permitted self-managed overhead, the
  price the participant pays and whether they've agreed it. The benchmark is context, never a cap.
*/
export function PricePanel({ price, who, signal, heading = "The price" }: { price: VettingPrice; who: string; signal?: Signal; heading?: string }) {
  const p = priceView(price);
  const b = price.benchmark;
  return (
    <section className={cx(box, "mt-4")} aria-label={heading}>
      <h4 className="flex items-center gap-2 font-semibold">
        <Icon name="list" className="size-4 text-accent" /> {heading}
      </h4>
      <p className="text-sm text-ink-muted">
        Practice figures. The supplier’s quote and {who}’s price are different numbers, worked out and agreed separately.
      </p>
      <div className="mt-3 grid gap-3 lg:grid-cols-2">
        <details className="rounded-xl bg-surface p-3 ring-1 ring-line" onToggle={(e) => e.currentTarget.open && signal?.("price_breakdown_checked")}>
          <summary className="min-h-11 cursor-pointer py-2 font-semibold">
            1. Supplier cost to Trilogy Care: {money(p.supplierCostCents)}
            {price.participantUnit ? ` ${price.participantUnit}` : ""}
          </summary>
          <table className="mt-2 w-full text-left text-sm">
            <caption className="sr-only">The supplier’s quote, line by line</caption>
            <thead>
              <tr className="border-b border-line">
                <th scope="col" className="py-1 pr-2">
                  Line
                </th>
                <th scope="col" className="py-1 pr-2">
                  Units × rate
                </th>
                <th scope="col" className="py-1 text-right">
                  Total
                </th>
              </tr>
            </thead>
            <tbody>
              {p.lines.map((l) => (
                <tr key={l.id} className="border-b border-line align-top">
                  <th scope="row" className="py-1 pr-2 font-normal">
                    {l.label} <span className="text-ink-muted">({LINE_KINDS[l.kind]})</span>
                    {l.note && <span className="block text-xs text-ink-muted">{l.note}</span>}
                  </th>
                  <td className="py-1 pr-2">
                    {l.qty} {l.unit} × {money(l.rateCents)}
                  </td>
                  <td className="py-1 text-right">{money(l.totalCents)}</td>
                </tr>
              ))}
            </tbody>
          </table>
          {p.passThrough.length > 0 && (
            <p className="mt-2 text-sm">
              {p.passThrough.map((l) => l.label).join(" and ")}: lines from the supplier to Trilogy Care. Ask what they are and how the contract treats them.
              They’re not separate fees to {who}: anything accepted goes into one agreed price.
            </p>
          )}
        </details>
        <dl className="flex flex-col gap-2 rounded-xl bg-surface p-3 ring-1 ring-line">
          <div>
            <dt className="text-sm font-semibold text-ink-muted">2. Provider overhead</dt>
            <dd>
              {price.selfManaged ? (
                <>
                  Up to {MAX_OVERHEAD_PERCENT}% of the actual third-party cost under self-management: at most {money(p.overheadMaxCents ?? 0)}.{" "}
                  {price.overheadPercent === null ? "Not worked out yet." : `Proposed: ${price.overheadPercent}% (${money(p.overheadCents ?? 0)}).`}
                </>
              ) : (
                "Not a self-managed arrangement: no overhead applies here."
              )}
            </dd>
          </div>
          <div>
            <dt className="text-sm font-semibold text-ink-muted">3. {who}’s price</dt>
            <dd className="font-semibold">
              {p.participantPriceCents === null
                ? "Not set yet"
                : `${money(p.participantPriceCents)}${price.participantUnit ? ` ${price.participantUnit}` : ""}`}
            </dd>
            {p.ceilingCents !== null && (
              <dd className="text-sm">
                The most it can be: the supplier cost plus {MAX_OVERHEAD_PERCENT}%, {money(p.ceilingCents)}.
              </dd>
            )}
          </div>
          <div>
            <dt className="text-sm font-semibold text-ink-muted">4. {who}’s agreement</dt>
            <dd className="flex items-center gap-2">
              <Icon name={price.agreement === "agreed_in_writing" ? "check" : "alert"} className="size-4 shrink-0" />
              {AGREEMENT[price.agreement].replace("the participant", who)}
            </dd>
          </div>
          {price.contribution && <p className="text-sm text-ink-muted">{price.contribution}</p>}
        </dl>
      </div>
      {b && (
        <details className="mt-3 rounded-xl bg-surface p-3 ring-1 ring-line" onToggle={(e) => e.currentTarget.open && signal?.("benchmark_context_checked")}>
          <summary className="min-h-11 cursor-pointer py-2 font-semibold">Benchmark context (not a cap)</summary>
          <p className="mt-2">{p.benchmarkText}</p>
          <dl className="mt-2 grid gap-x-4 gap-y-1 text-sm sm:grid-cols-2">
            <div>
              <dt className="font-semibold">Source and date</dt>
              <dd>
                {b.url ? (
                  <a href={b.url} target="_blank" rel="noreferrer" className="text-accent underline">
                    {b.source}
                  </a>
                ) : (
                  b.source
                )}
                , as at {b.asAt}
              </dd>
            </div>
            <div>
              <dt className="font-semibold">What it measures</dt>
              <dd>{b.measures}</dd>
            </div>
            {b.region && (
              <div>
                <dt className="font-semibold">Region</dt>
                <dd>{b.region}</dd>
              </div>
            )}
            {b.category && (
              <div>
                <dt className="font-semibold">Service category</dt>
                <dd>{b.category}</dd>
              </div>
            )}
            <div>
              <dt className="font-semibold">Comparability</dt>
              <dd>{COMPARABILITY[b.comparable]}</dd>
            </div>
            {b.notes && (
              <div>
                <dt className="font-semibold">Notes</dt>
                <dd>{b.notes}</dd>
              </div>
            )}
          </dl>
        </details>
      )}
    </section>
  );
}

/** What the learner asks for, and what they tell the participant. Nothing here is checked until submitting. */
export function RequestsAndMessage({ b, s, change }: { b: AuditorBlock; s: AuditState; change: (fn: (prev: AuditState) => Partial<AuditState>) => void }) {
  const v = b.vetting!;
  const name = v.participant.name || "the participant";
  const toggle = <T extends string>(list: T[], x: T) => (list.includes(x) ? list.filter((y) => y !== x) : [...list, x]);
  return (
    <>
      <fieldset className="mt-3">
        <legend className="font-semibold">What will you ask for, and from whom?</legend>
        <p className="text-sm text-ink-muted">Tick only what this pack needs. Asking for more than it needs delays the start too.</p>
        <div className="mt-2 flex flex-col gap-1">
          {v.requests.map((r) => (
            <label
              key={r.id}
              className="flex min-h-11 items-start gap-3 rounded-xl px-2 py-2 ring-1 ring-line has-[:checked]:bg-tealtint has-[:checked]:ring-action"
            >
              <input
                type="checkbox"
                className="mt-1 size-5 shrink-0"
                checked={s.requests.includes(r.id)}
                onChange={() => change((prev) => ({ requests: toggle(prev.requests, r.id) }))}
              />
              <span>
                {r.label}
                {r.owner && <span className="block text-sm text-ink-muted">From: {r.owner}</span>}
              </span>
            </label>
          ))}
        </div>
      </fieldset>
      <label className="mt-3 flex flex-col gap-1">
        <span className="font-semibold">Your message to {name}</span>
        <span className="text-sm text-ink-muted">
          What’s been checked, what’s outstanding, whether the worker can start yet, who owns the next step, and how {name}’s choice is being respected. It
          stays in your attempt: it isn’t sent anywhere.
        </span>
        <textarea
          className={cx(input, "min-h-28")}
          maxLength={1500}
          value={s.explanation.text}
          onChange={(e) => change((prev) => ({ explanation: { ...prev.explanation, text: e.target.value } }))}
        />
      </label>
      <fieldset className="mt-3">
        <legend className="font-semibold">Can the worker start on the date {name} wants?</legend>
        <div className="mt-2 flex flex-wrap gap-2">
          {(
            [
              ["yes", "Yes, they can start"],
              ["not_yet", "Not yet"],
            ] as const
          ).map(([k, label]) => (
            <label
              key={k}
              className={cx(
                "flex min-h-11 items-center gap-2 rounded-full px-4 ring-1",
                s.explanation.startNow === k ? "bg-tealtint font-semibold ring-action" : "ring-line",
              )}
            >
              <input
                type="radio"
                name={`${b.id}-start`}
                className="size-5"
                checked={s.explanation.startNow === k}
                onChange={() => change((prev) => ({ explanation: { ...prev.explanation, startNow: k } }))}
              />
              {label}
            </label>
          ))}
        </div>
      </fieldset>
      <fieldset className="mt-3">
        <legend className="font-semibold">My message covers…</legend>
        <div className="mt-1 flex flex-col">
          {(Object.keys(EXPLANATION_ELEMENTS) as ExplanationElement[]).map((k) => (
            <label key={k} className="flex min-h-11 items-center gap-3 text-sm">
              <input
                type="checkbox"
                className="size-5 shrink-0"
                checked={s.explanation.covered.includes(k)}
                onChange={() => change((prev) => ({ explanation: { ...prev.explanation, covered: toggle(prev.explanation.covered, k) } }))}
              />
              {EXPLANATION_ELEMENTS[k]}
            </label>
          ))}
        </div>
      </fieldset>
    </>
  );
}

type VetDebrief = NonNullable<AuditDebrief["vetting"]>;

const STATE_ICON = { resolved: "check", open: "alert" } as const;
/** The checks behind an outcome: business and worker apart, each state in words with who owns it. */
export function AxisTable({ rows, caption }: { rows: VetDebrief["axes"]; caption: string }) {
  return (
    <div className="overflow-x-auto">
      <table className="w-full min-w-[34rem] text-left text-sm">
        <caption className="sr-only">{caption}</caption>
        <thead>
          <tr className="border-b border-line-strong">
            <th scope="col" className="py-1 pr-2">
              Part
            </th>
            <th scope="col" className="py-1 pr-2">
              Check
            </th>
            <th scope="col" className="py-1 pr-2">
              State
            </th>
            <th scope="col" className="py-1">
              Why, and who owns it
            </th>
          </tr>
        </thead>
        <tbody>
          {rows.map((r) => (
            <tr key={r.axis} className="border-b border-line align-top">
              <td className="py-1 pr-2 text-ink-muted">{r.side}</td>
              <th scope="row" className="py-1 pr-2 font-semibold">
                {r.label}
              </th>
              <td className="py-1 pr-2">
                <span className="inline-flex items-center gap-1 font-semibold">
                  <Icon name={STATE_ICON[r.resolved ? "resolved" : "open"]} className="size-4 shrink-0" />
                  {r.stateLabel}
                  {r.barrier ? " (a barrier)" : ""}
                </span>
              </td>
              <td className="py-1">
                {r.note}
                {r.owner && <span className="block text-ink-muted">Owner: {r.owner}</span>}
              </td>
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  );
}

/** The debrief's vetting part: what the checks say, the errors to watch, the evidence asked for, the message, and why both wrong directions matter. */
export function VettingDebrief({ b, d, who, preview, place }: { b: AuditorBlock; d: VetDebrief; who: string; preview?: boolean; place: string }) {
  const v = b.vetting as Vetting;
  return (
    <>
      <section className={box} aria-label="What the checks say">
        <h5 className="font-semibold">What the checks say: {d.outcome.label}</h5>
        <p className="mt-1 text-sm">
          {d.outcome.escalateToo ? "Ask for the evidence, and send the price or owner question to its accountable reviewer alongside. " : ""}
          Each check has its own state; none of them is a score. A training status, not an onboarding approval.
        </p>
        <div className="mt-2">
          <AxisTable rows={d.axes} caption="Each check behind the outcome" />
        </div>
      </section>
      {d.codes.length > 0 && (
        <section className={d.codes.some((c) => c.critical) ? bad : warn} aria-label="What to watch">
          <h5 className="font-semibold">What to watch next time</h5>
          <ul className="mt-1 list-disc pl-5">
            {[...d.codes]
              .sort((p, q) => Number(q.critical) - Number(p.critical))
              .map((c) => (
                <li key={c.code}>
                  {c.critical ? "Critical: " : ""}
                  {c.label}
                </li>
              ))}
          </ul>
        </section>
      )}
      <section className={box} aria-label="The evidence you asked for">
        <h5 className="font-semibold">The evidence you asked for</h5>
        <ul className="mt-2 flex flex-col gap-2">
          {d.requests.map((r) => (
            <li key={r.id} className="text-sm">
              <span className="inline-flex items-center gap-1 font-semibold">
                <Icon name={r.asked === r.needed ? "check" : r.needed ? "close" : "alert"} className="size-4 shrink-0" />
                {r.asked ? (r.needed ? "Asked, and needed" : "Asked, but not needed") : r.needed ? "Needed, not asked" : "Not needed: you left it"}
              </span>{" "}
              · {r.label}
              {r.owner && <span className="text-ink-muted"> ({r.owner})</span>}
              <span className="block">{r.why}</span>
            </li>
          ))}
        </ul>
      </section>
      <section className={d.startNow.right ? good : bad} aria-label={`What you told ${who}`}>
        <h5 className="font-semibold">
          You said the worker {d.startNow.said === "yes" ? "can start" : "can’t start yet"}:{" "}
          {d.startNow.right ? "right" : d.startNow.canStart ? "the checks are complete, so they can" : "not yet: a check is still open"}.
        </h5>
        {d.explanation.yours && <p className="mt-2 whitespace-pre-line">Your message: “{d.explanation.yours}”</p>}
        <p className="mt-2 text-sm">
          You said it covers:{" "}
          {d.explanation.covered
            .filter((x) => x.covered)
            .map((x) => x.label.toLowerCase())
            .join("; ") || "none of the five"}
          . Missing:{" "}
          {d.explanation.covered
            .filter((x) => !x.covered)
            .map((x) => x.label.toLowerCase())
            .join("; ") || "nothing"}
          .
        </p>
        {d.explanation.model && (
          <details className="mt-2">
            <summary className="min-h-11 cursor-pointer py-2 font-semibold">A reviewed example</summary>
            <p className="mt-1 whitespace-pre-line">{d.explanation.model}</p>
          </details>
        )}
      </section>
      <section className="grid gap-3 sm:grid-cols-2" aria-label="Why both directions matter">
        <div className={box}>
          <h5 className="font-semibold">If it went ahead now</h5>
          <p className="mt-1 text-sm">{d.consequences.unsafe}</p>
        </div>
        <div className={box}>
          <h5 className="font-semibold">If it were refused</h5>
          <p className="mt-1 text-sm">{d.consequences.unnecessary}</p>
        </div>
      </section>
      {d.passed !== null && (
        <p className={d.passed ? good : warn} role="status">
          {d.passed ? "Assessed: passed." : "Assessed: not passed this time. Try again with the changed facts."}
        </p>
      )}
      {v.jobAid.snippetId && <AidSection snippetId={v.jobAid.snippetId} why={v.jobAid.why} preview={preview} place={place} />}
      <p className="text-sm text-ink-muted">
        For a line-by-line look at a quote or invoice, the Invoice X-Ray block goes deeper. If {who} is upset by a delay, the Tough Phone Call block practises
        that conversation.
      </p>
    </>
  );
}

/** The corrected pack, then the renewal: each a short new decision on changed facts, with its own version. */
export function FollowUps({
  b,
  d,
  busy,
  signal,
  onAnswer,
}: {
  b: AuditorBlock;
  d: VetDebrief;
  busy: boolean;
  signal: Signal;
  onAnswer: (kind: "corrected" | "renewal", decision: Decision, renew: string[], newAgreement: "yes" | "no" | "") => void;
}) {
  const v = b.vetting as Vetting;
  const [renewalOpen, setRenewalOpen] = useState(Boolean(d.renewal?.answered));
  const who = v.participant.name || "the participant";
  const showRenewal = v.renewal && (!v.corrected || d.corrected?.answered);
  return (
    <>
      {v.corrected && d.corrected && <Stage f={v.corrected} r={d.corrected} b={b} who={who} busy={busy} onAnswer={onAnswer} kind="corrected" signal={signal} />}
      {showRenewal &&
        d.renewal &&
        (renewalOpen ? (
          <Stage f={v.renewal!} r={d.renewal} b={b} who={who} busy={busy} onAnswer={onAnswer} kind="renewal" signal={signal} />
        ) : (
          <section className={box} aria-label="Renewal">
            <h5 className="font-semibold">{v.renewal!.title}</h5>
            <p className="mt-1">{v.renewal!.intro}</p>
            <button
              type="button"
              className={cx(secondary, "mt-2")}
              onClick={() => {
                setRenewalOpen(true);
                signal("renewal_variant_started");
              }}
            >
              <Icon name="refresh" className="size-4" /> Start the renewal check
            </button>
          </section>
        ))}
    </>
  );
}

function Stage({
  f,
  r,
  b,
  who,
  busy,
  kind,
  signal,
  onAnswer,
}: {
  f: FollowUp;
  r: NonNullable<VetDebrief["corrected"]>;
  b: AuditorBlock;
  who: string;
  busy: boolean;
  kind: "corrected" | "renewal";
  signal: Signal;
  onAnswer: (kind: "corrected" | "renewal", decision: Decision, renew: string[], newAgreement: "yes" | "no" | "") => void;
}) {
  const [decision, setDecision] = useState<Decision | "">("");
  const [renew, setRenew] = useState<string[]>([]);
  const [agree, setAgree] = useState<"yes" | "no" | "">("");
  const ready = decision && (kind === "corrected" || f.newAgreement === null || agree);
  return (
    <section className={box} aria-label={f.title}>
      <h5 className="font-semibold">{f.title}</h5>
      <p className="text-xs text-ink-muted">Pack version {f.version}</p>
      {f.intro && <p className="mt-1">{f.intro}</p>}
      {f.previously.length > 0 && (
        <>
          <p className="mt-2 text-sm font-semibold">Checked before</p>
          <ul className="list-disc pl-5 text-sm">
            {f.previously.map((x) => (
              <li key={x}>{x}</li>
            ))}
          </ul>
        </>
      )}
      {f.changes.length > 0 && (
        <>
          <p className="mt-2 text-sm font-semibold">What’s changed</p>
          <ul className="list-disc pl-5 text-sm">
            {f.changes.map((x) => (
              <li key={x}>{x}</li>
            ))}
          </ul>
        </>
      )}
      {f.price && <PricePanel price={f.price} who={who} heading={kind === "renewal" ? "The proposed new price" : "The price now"} signal={signal} />}
      {r.answered ? (
        <>
          <p className={cx(r.right ? good : warn, "mt-3")}>
            <span className="font-semibold">
              {r.right ? "Yes: " : "The reviewed answer: "}
              {r.decision}.
            </span>{" "}
            {r.why}
          </p>
          {r.renew.length > 0 && (
            <ul className="mt-2 flex flex-col gap-1 text-sm">
              {r.renew.map((x) => (
                <li key={x.id}>
                  <span className="font-semibold">
                    {x.chosen === x.needed ? "Right: " : "Not quite: "}
                    {x.label}
                  </span>{" "}
                  ({x.needed ? "needed" : "not needed"}). {x.why}
                </li>
              ))}
            </ul>
          )}
          {r.newAgreement && (
            <p className="mt-2 text-sm">
              <span className="font-semibold">
                A new agreement with {who}: {r.newAgreement.right ? "needed" : "not needed"}
                {r.newAgreement.said ? ` (you said ${r.newAgreement.said === "yes" ? "it is" : "it isn’t"})` : ""}.
              </span>{" "}
              {r.newAgreement.why}
            </p>
          )}
          {r.axes.length > 0 && (
            <details className="mt-2">
              <summary className="min-h-11 cursor-pointer py-2.5 text-sm font-semibold">The checks now</summary>
              <AxisTable rows={r.axes} caption={`${f.title}: each check`} />
            </details>
          )}
        </>
      ) : (
        <div className="mt-3">
          {f.renew.length > 0 && (
            <fieldset>
              <legend className="font-semibold">What has to be renewed now?</legend>
              {f.renew.map((x) => (
                <label key={x.id} className="flex min-h-11 items-center gap-3 text-sm">
                  <input
                    type="checkbox"
                    className="size-5 shrink-0"
                    checked={renew.includes(x.id)}
                    onChange={() => setRenew((p) => (p.includes(x.id) ? p.filter((y) => y !== x.id) : [...p, x.id]))}
                  />
                  {x.label}
                </label>
              ))}
            </fieldset>
          )}
          {kind === "renewal" && (
            <fieldset className="mt-2">
              <legend className="font-semibold">Does {who} need to agree a new price before the change?</legend>
              <div className="mt-1 flex flex-wrap gap-2">
                {(["yes", "no"] as const).map((k) => (
                  <label
                    key={k}
                    className={cx(
                      "flex min-h-11 items-center gap-2 rounded-full px-4 ring-1",
                      agree === k ? "bg-tealtint font-semibold ring-action" : "ring-line",
                    )}
                  >
                    <input type="radio" name={`${b.id}-${kind}-agree`} className="size-5" checked={agree === k} onChange={() => setAgree(k)} />
                    {k === "yes" ? "Yes" : "No"}
                  </label>
                ))}
              </div>
            </fieldset>
          )}
          <fieldset className="mt-2">
            <legend className="font-semibold">Your recommendation now</legend>
            <div className="mt-1 grid gap-2 sm:grid-cols-2">
              {DECISION_ORDER.map((k) => (
                <label
                  key={k}
                  className={cx(
                    "flex min-h-11 items-center gap-2 rounded-2xl px-3 py-2 ring-1",
                    decision === k ? "bg-tealtint font-semibold ring-action" : "ring-line",
                  )}
                >
                  <input type="radio" name={`${b.id}-${kind}-decision`} className="size-5" checked={decision === k} onChange={() => setDecision(k)} />
                  {decisionText(b.mode, k).label}
                </label>
              ))}
            </div>
          </fieldset>
          <button type="button" className={cx(primary, "mt-3")} disabled={busy || !ready} onClick={() => decision && onAnswer(kind, decision, renew, agree)}>
            Record my answer
          </button>
        </div>
      )}
    </section>
  );
}
