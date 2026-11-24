"use client";

import { cx } from "@/lib/format";
import type { ReliabilityBlock } from "@/lib/magazine";
import { caseProblems, labApproved, type ReliabilityLabData } from "@/lib/reliabilityLab";
import {
  calculate,
  DEFINITIONS_VERSION,
  hrs,
  money,
  OUTCOME_HINTS,
  OUTCOME_ORDER,
  OUTCOMES,
  REASON_HINTS,
  REASON_ORDER,
  REASONS,
  validateInputs,
} from "@/lib/serviceReliability";
import { RELIABILITY_CASES } from "@/content/reliabilityCases";
import { Field, input } from "./ui";
import { JsonEdit } from "./MagazineIntakeEdit";
import type { Update } from "./MagazineEditParts";
import { Icon } from "../Icon";

/*
  The editor for a Service Reliability Calculator block ("What does a missed service cost?", docs/service-reliability.md).
  The frame has plain fields; the story, the month's visits and costs, the questions, the log cards (with their reviewed
  classification and feedback), the repair-work lines, the decisions and the placeholders each have an advanced JSON
  edit, as the sibling calculators' editors do, because the case is easier to inspect as text than as a hundred small
  inputs. The event definitions are shared and versioned: shown here for reference, never regenerated per article. The
  case check lists anything that would mislead a learner. The AI selection rationale (PRD section 11) is recorded and
  versioned with the story, and the author accepts, edits or rejects it. Nothing here is generated. Use Preview to play it.
*/

const group = "flex flex-col gap-3 rounded-2xl bg-muted p-3";
const SIGNOFF: [Exclude<keyof ReliabilityLabData["approval"], "approvedOn" | "effectiveFrom" | "reviewBy">, string][] = [
  ["owner", "Owner (Partner Enablement)"],
  ["operations", "Care Coordination Operations (incident causes and recovery)"],
  ["quality", "Quality / complaints (participant communication and escalation)"],
  ["clinical", "Clinical governance (essential services)"],
  ["supplier", "Supplier management (reliability evidence and correction routes)"],
  ["finance", "Finance / commercial agreement owner (cost treatment)"],
  ["policy", "Policy owner (cancellation and claim wording)"],
  ["partnerships", "Partnerships (business-owner language)"],
  ["privacy", "Privacy and security (private mode)"],
];
const RATIONALE: [Exclude<keyof ReliabilityLabData["rationale"], "decision">, string, string][] = [
  ["theme", "Problem evidence", "Verified complaints, repeat no-shows or coordinator rework, and where they came from."],
  ["themeOwner", "Evidence owner", "Who owns that evidence."],
  ["audience", "Audience", ""],
  ["behaviour", "Target behaviour", ""],
  ["whyFit", "Why a calculation and a story fit", ""],
  ["reuse", "Existing content to reuse", ""],
  ["systemFix", "Operations or supplier fix also needed", "Learning alone can’t fix a supplier’s roster."],
  ["measure", "Linked scored outcomes and operational data (owned separately)", ""],
];

export function ReliabilityEdit({ block: b, update }: { block: ReliabilityBlock; update: Update }) {
  const set = (fn: (x: ReliabilityBlock) => void, tag?: string) => update<ReliabilityBlock>(b.id, fn, tag && `${b.id}:${tag}`);
  const problems = caseProblems(b);
  const signed = labApproved(b);
  const r = validateInputs(b.inputs).length ? null : calculate(b.inputs);
  return (
    <div className="w-full rounded-3xl border border-line-strong bg-surface p-5 shadow-sm sm:p-7">
      <p className="mb-2 flex items-center gap-2 font-mulish text-sm font-extrabold uppercase tracking-[0.12em] text-accent">
        <Icon name="calendar" className="size-5" /> Service Reliability Calculator
      </p>
      <p
        role="status"
        className={cx(
          "rounded-2xl px-4 py-3 text-sm font-semibold",
          signed && !problems.length
            ? "bg-[#e3f4ea] text-[#0f5b3a] dark:bg-[#12392a] dark:text-[#8fe0b5]"
            : "bg-[#fff1cc] text-[#4a3400] dark:bg-[#3d2f08] dark:text-[#ffd97a]",
        )}
      >
        {problems.length
          ? `The case check finds ${problems.length} ${problems.length === 1 ? "problem" : "problems"} (below). It can’t be published until it passes.`
          : signed
            ? "The case check passes and the sign-off is recorded: this block can be published."
            : "A draft: the case check passes, but it can’t be published until every reviewer’s sign-off is recorded below."}
      </p>

      <div className="mt-3 grid gap-3 sm:grid-cols-2">
        <Field label="Start from a case">
          <select
            className={input}
            value=""
            onChange={(e) => {
              const c = RELIABILITY_CASES.find((x) => x.id === e.target.value);
              if (c && window.confirm(`Replace this block with “${c.label}”? What’s written here now is replaced.`))
                set((x) => void Object.assign(x, structuredClone(c.data)));
            }}
          >
            <option value="">Choose…</option>
            {RELIABILITY_CASES.map((c) => (
              <option key={c.id} value={c.id}>
                {c.label}
              </option>
            ))}
          </select>
        </Field>
        <Field
          label="Story version"
          hint="Change it when the story, figures or feedback change: attempts record the version they used, and dependent cases are marked for recheck."
        >
          <input className={input} value={b.storyVersion} onChange={(e) => set((x) => void (x.storyVersion = e.target.value), "version")} />
        </Field>
        <Field label="Title">
          <input className={input} value={b.title} onChange={(e) => set((x) => void (x.title = e.target.value), "title")} />
        </Field>
        <Field label="Introduction">
          <input className={input} value={b.intro} onChange={(e) => set((x) => void (x.intro = e.target.value), "intro")} />
        </Field>
      </div>

      <section className={cx(group, "mt-4")}>
        <h4 className="font-semibold">The case, as written</h4>
        {r ? (
          <p className="text-sm">
            {r.scheduled} scheduled visits; verified supplier misses {r.supplierRate.text}; {r.outcomes.missed} missed in all; restored within the window{" "}
            {r.recovery.withinWindow.text}; {r.recovery.booked + r.recovery.unresolved} still open. {hrs(r.effort.hours)} of unique recovery work
            {r.effort.unmeasured ? ` (${r.effort.unmeasured} not measured)` : ""}; observed direct cost {money(r.cost.observedDirect)}.
          </p>
        ) : (
          <p className="text-sm">The figures don’t validate yet, so there’s no result.</p>
        )}
        <JsonEdit
          label="Story (principal, participant, situation, Ava’s transmission, the beats, the participant’s own words)"
          value={b.story}
          onApply={(v) => set((x) => void (x.story = v as ReliabilityLabData["story"]))}
          check={(v) => isObj(v)}
        />
        <JsonEdit
          label="The month (visits, grouped routine visits, issue groups, recovery tasks, costs, actions, the referral push, guardrails)"
          value={b.inputs}
          onApply={(v) => set((x) => void (x.inputs = v as ReliabilityLabData["inputs"]))}
          check={(v) => isObj(v) && Array.isArray((v as Record<string, unknown>).occurrences)}
        />
        <JsonEdit
          label="Immediate response (prompt and options, with feedback, levels and flags)"
          value={b.response}
          onApply={(v) => set((x) => void (x.response = v as ReliabilityLabData["response"]))}
          check={(v) => isObj(v)}
        />
        <JsonEdit
          label="First guess (prompts, options; likely: true marks the expected answer)"
          value={b.prediction}
          onApply={(v) => set((x) => void (x.prediction = v as ReliabilityLabData["prediction"]))}
          check={(v) => isObj(v)}
        />
        <JsonEdit
          label="Log cards (each names a visit, with its reviewed classification, urgency and feedback)"
          value={b.cards}
          onApply={(v) => set((x) => void (x.cards = v as ReliabilityLabData["cards"]))}
          check={Array.isArray}
        />
        <JsonEdit
          label="The repair work (lines of the coordinator’s records; duplicate: true marks a repeat of a task)"
          value={b.log}
          onApply={(v) => set((x) => void (x.log = v as ReliabilityLabData["log"]))}
          check={(v) => isObj(v)}
        />
        <JsonEdit
          label="The repeat question"
          value={b.repeat}
          onApply={(v) => set((x) => void (x.repeat = v as ReliabilityLabData["repeat"]))}
          check={(v) => isObj(v)}
        />
        <JsonEdit
          label="Explanations of the trade-off"
          value={b.explanations}
          onApply={(v) => set((x) => void (x.explanations = v as ReliabilityLabData["explanations"]))}
          check={Array.isArray}
        />
        <JsonEdit
          label="Decisions (with feedback, outcome, levels and flags)"
          value={b.decisions}
          onApply={(v) => set((x) => void (x.decisions = v as ReliabilityLabData["decisions"]))}
          check={Array.isArray}
        />
        <JsonEdit
          label="The later check"
          value={b.later}
          onApply={(v) => set((x) => void (x.later = v as ReliabilityLabData["later"]))}
          check={(v) => isObj(v)}
        />
        <JsonEdit
          label="Placeholders for Work Tools not in the Hub yet (28-Day Trust Check, Contractor Network Builder)"
          value={b.placeholders}
          onApply={(v) => set((x) => void (x.placeholders = v as ReliabilityLabData["placeholders"]))}
          check={(v) => isObj(v)}
        />
        <JsonEdit
          label="Links (related articles and tools)"
          value={b.links}
          onApply={(v) => set((x) => void (x.links = v as ReliabilityLabData["links"]))}
          check={Array.isArray}
        />
        <JsonEdit
          label="Policy references"
          value={b.sources}
          onApply={(v) => set((x) => void (x.sources = v as ReliabilityLabData["sources"]))}
          check={Array.isArray}
        />
        <Field label="Debrief summary" hint="Shown once the attempt is finished.">
          <textarea className={cx(input, "min-h-24 py-2")} value={b.debrief} onChange={(e) => set((x) => void (x.debrief = e.target.value), "debrief")} />
        </Field>
        <Field label="Four weeks later" hint="The return visit. Shown in the debrief.">
          <textarea className={cx(input, "min-h-20 py-2")} value={b.followUp} onChange={(e) => set((x) => void (x.followUp = e.target.value), "follow")} />
        </Field>
      </section>

      <details className={cx(group, "mt-4")}>
        <summary className="cursor-pointer font-semibold">
          The shared event definitions ({b.definitionsVersion || DEFINITIONS_VERSION})
          {b.definitionsVersion !== DEFINITIONS_VERSION && " · the case uses an earlier version"}
        </summary>
        <p className="text-sm text-ink-muted">
          Every Service Reliability block uses the same outcomes and reasons; recovery tasks use the Workload Lens’s categories and cause tags. To change one,
          change the definitions (with Operations and the policy owner) and their version, not this article.
        </p>
        <dl className="grid gap-2 text-sm sm:grid-cols-2">
          {OUTCOME_ORDER.map((o) => (
            <div key={o}>
              <dt className="font-semibold">{OUTCOMES[o]}</dt>
              <dd className="text-ink-muted">{OUTCOME_HINTS[o]}</dd>
            </div>
          ))}
          {REASON_ORDER.map((k) => (
            <div key={k}>
              <dt className="font-semibold">{REASONS[k]}</dt>
              <dd className="text-ink-muted">{REASON_HINTS[k]}</dd>
            </div>
          ))}
        </dl>
      </details>

      <section className={cx(group, "mt-4")}>
        <h4 className="font-semibold">Why this block (selection rationale)</h4>
        <p className="text-sm text-ink-muted">
          Recorded with the story version. Accept it, edit it, or reject it if a calculator isn’t the right fix. AI may explain a result; it never invents a
          delivered visit, blames a worker, decides a claim or declares an action successful.
        </p>
        <div className="grid gap-3 sm:grid-cols-2">
          {RATIONALE.map(([k, label, hint]) => (
            <Field key={k} label={label} hint={hint || undefined}>
              <textarea
                className={cx(input, "min-h-16 py-2")}
                value={b.rationale[k]}
                onChange={(e) => set((x) => void (x.rationale[k] = e.target.value), `ra-${k}`)}
              />
            </Field>
          ))}
          <Field label="Author’s decision">
            <select
              className={input}
              value={b.rationale.decision}
              onChange={(e) => set((x) => void (x.rationale.decision = e.target.value as ReliabilityLabData["rationale"]["decision"]))}
            >
              <option value="">Not decided</option>
              <option value="accepted">Accepted</option>
              <option value="edited">Accepted with edits</option>
              <option value="rejected">Rejected</option>
            </select>
          </Field>
        </div>
      </section>

      <section className={cx(group, "mt-4")}>
        <h4 className="font-semibold">Case check</h4>
        {problems.length ? (
          <ul className="list-disc pl-5 text-sm">
            {problems.map((p) => (
              <li key={p}>{p}</li>
            ))}
          </ul>
        ) : (
          <p className="text-sm">
            Passes: the figures validate, every card names a visit, the log has a supplier failure, a participant’s cancellation, a booking error and an urgent
            entry, the repair work has a repeat line, there’s a recurring issue with both a restored and an open visit, and every question has a strong,
            unflagged answer.
          </p>
        )}
      </section>

      <section className={cx(group, "mt-4")}>
        <h4 className="font-semibold">Sign-off</h4>
        <p className="text-sm text-ink-muted">
          Partner Enablement drafts; each reviewer below checks their part. The Hub owner then publishes a version with effective and review dates.
        </p>
        <div className="grid gap-3 sm:grid-cols-2">
          {SIGNOFF.map(([k, label]) => (
            <Field key={k} label={label}>
              <input className={input} value={b.approval[k]} onChange={(e) => set((x) => void (x.approval[k] = e.target.value), `ap-${k}`)} />
            </Field>
          ))}
          <Field label="Approved on">
            <input type="date" className={input} value={b.approval.approvedOn} onChange={(e) => set((x) => void (x.approval.approvedOn = e.target.value))} />
          </Field>
          <Field label="Effective from">
            <input
              type="date"
              className={input}
              value={b.approval.effectiveFrom}
              onChange={(e) => set((x) => void (x.approval.effectiveFrom = e.target.value))}
            />
          </Field>
          <Field label="Review by" hint="After this date it can’t be published until it’s reviewed again.">
            <input type="date" className={input} value={b.approval.reviewBy} onChange={(e) => set((x) => void (x.approval.reviewBy = e.target.value))} />
          </Field>
        </div>
      </section>
    </div>
  );
}

const isObj = (v: unknown) => Boolean(v) && typeof v === "object" && !Array.isArray(v);
