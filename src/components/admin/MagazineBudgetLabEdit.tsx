"use client";

import { cx } from "@/lib/format";
import type { BudgetLabBlock } from "@/lib/magazine";
import { caseProblems, defensibleEndings, FLAG_SOURCES, FLAGS, labApproved, startProjection, type BudgetLabData, type Question } from "@/lib/budgetLab";
import { BASES, money, type Basis } from "@/lib/quarterBudget";
import { QUARTER_RULES, quarterRules, ruleStatus, sourceTitle } from "@/lib/quarterEndRules";
import { BUDGET_LAB_CASES } from "@/content/budgetLabCases";
import { Field, input } from "./ui";
import { JsonEdit } from "./MagazineIntakeEdit";
import type { Update } from "./MagazineEditParts";
import { Icon } from "../Icon";
import { useHydrated } from "@/lib/store";

/*
  The editor for a Quarterly Budget Decision Lab block (docs/budget-decision-lab.md). The figures have plain fields and
  are checked as you type (they reconcile, the dates fall in the quarter, care management is deducted once, a displayed
  contribution has its rate); the story, services, schedule and the choices with their feedback have advanced JSON
  edits, as the sibling calculators' editors do. The case check plays every defensible ending strongly and shows its
  projection, so the author sees the feedback supports each one. The reviewer view lists the rule source beside each
  consequential feedback line. The AI selection rationale is recorded and versioned with the scenario: the author
  accepts, edits or rejects it. Nothing here is generated, and no AI sets a figure or a rate. Use Preview (desktop and
  phone) to play it.
*/

const group = "flex flex-col gap-3 rounded-2xl bg-muted p-3";
const SIGNOFF: [Exclude<keyof BudgetLabData["approval"], "approvedOn" | "effectiveFrom" | "reviewBy" | "ruleSetReviewed">, string][] = [
  ["owner", "Owner (Partner Enablement)"],
  ["operations", "Operations/Finance (figures, prices, contribution basis and process)"],
  ["policy", "Support at Home policy owner (rules and rule set)"],
  ["quality", "Quality (client-facing practice language)"],
  ["learning", "Learning reviewer (rubric and accessibility)"],
];
const RATIONALE: [Exclude<keyof BudgetLabData["rationale"], "decision">, string, string][] = [
  ["theme", "Problem evidence", "Link to the authorised theme, never a copied complaint."],
  ["themeId", "Problem desk theme id (optional)", "Links the lab to the theme’s response decision in the register."],
  ["themeOwner", "Evidence owner", ""],
  ["behaviour", "Target behaviour", ""],
  ["barrier", "Likely barrier (a hypothesis until checked)", ""],
  ["whyFit", "Why this block", ""],
  ["evidence", "Evidence of practice", ""],
  ["measure", "Work measure (owned separately)", "Baseline, denominator and review date. Never inferred from completion."],
  ["systemFix", "Process or work tool fix also needed", ""],
];
const cents = (v: string) => Math.max(0, Math.round(Number(v.replace(/[$,]/g, "")) * 100) || 0);
const dollars = (c: number) => (c / 100).toFixed(2);
const isObj = (v: unknown) => Boolean(v) && typeof v === "object" && !Array.isArray(v);
const isQuestion = (v: unknown) => isObj(v) && Array.isArray((v as Question).options);

export function BudgetLabEdit({ block: b, update }: { block: BudgetLabBlock; update: Update }) {
  const set = (fn: (x: BudgetLabBlock) => void, tag?: string) => update<BudgetLabBlock>(b.id, fn, tag && `${b.id}:${tag}`);
  const problems = caseProblems(b);
  const signed = labApproved(b);
  // The review date is checked once the page is in the browser, so the server and the browser draw the same thing first.
  const hydrated = useHydrated();
  const status = hydrated ? ruleStatus(b.ruleSetId, new Date().toISOString().slice(0, 10)) : "current";
  const rules = quarterRules(b.ruleSetId);
  const p = startProjection(b);
  const endings = problems.length ? [] : defensibleEndings(b);
  const f = b.figures;
  const money$ = (label: string, value: number, apply: (x: BudgetLabBlock, c: number) => void, hint?: string) => (
    <Field label={label} hint={hint}>
      <input key={value} className={input} inputMode="decimal" defaultValue={dollars(value)} onBlur={(e) => set((x) => apply(x, cents(e.target.value)))} />
    </Field>
  );
  const questions: [string, Question][] = [
    ...b.read.map((q, i) => [`Figures ${i + 1}`, q] as [string, Question]),
    ["Conversation", b.conversation],
    ["Equipment", b.equipment],
    ["Explanation", b.explanation],
    ["Next step", b.nextStep],
  ];
  return (
    <div className="w-full rounded-3xl border border-line-strong bg-surface p-5 shadow-sm sm:p-7">
      <p className="mb-2 flex items-center gap-2 font-mulish text-sm font-extrabold uppercase tracking-[0.12em] text-accent">
        <Icon name="money" className="size-5" /> Quarterly Budget Decision Lab
      </p>
      <p
        role="status"
        className={cx(
          "rounded-2xl px-4 py-3 text-sm font-semibold",
          signed && !problems.length && status === "current"
            ? "bg-[#e3f4ea] text-[#0f5b3a] dark:bg-[#12392a] dark:text-[#8fe0b5]"
            : "bg-[#fff1cc] text-[#4a3400] dark:bg-[#3d2f08] dark:text-[#ffd97a]",
        )}
      >
        {status !== "current"
          ? `Review required: the rule set is ${status === "withdrawn" ? "withdrawn" : "due for review or changed"}. It can’t be published until it’s reviewed.`
          : problems.length
            ? `The case check finds ${problems.length} ${problems.length === 1 ? "problem" : "problems"} (below). It can’t be published until it passes.`
            : signed
              ? "The case check passes and the sign-off is recorded: this block can be published."
              : "A draft: the case check passes, but it can’t be published until every reviewer’s sign-off is recorded below."}
      </p>
      <p className="mt-2 text-sm text-ink-muted">
        Practice with synthetic data: it never books, claims, invoices or changes a care plan, and a learner’s score is practice evidence, not performance.
      </p>

      <div className="mt-3 grid gap-3 sm:grid-cols-2">
        <Field label="Start from a scenario">
          <select
            className={input}
            value=""
            onChange={(e) => {
              const c = BUDGET_LAB_CASES.find((x) => x.id === e.target.value);
              if (c && window.confirm(`Replace this block with “${c.label}”? What’s written here now is replaced.`))
                set((x) => void Object.assign(x, structuredClone(c.data)));
            }}
          >
            <option value="">Choose…</option>
            {BUDGET_LAB_CASES.map((c) => (
              <option key={c.id} value={c.id}>
                {c.label}
              </option>
            ))}
          </select>
        </Field>
        <Field label="Scenario version" hint="Change it when the figures, story or feedback change: every attempt records the version it used.">
          <input className={input} value={b.scenarioVersion} onChange={(e) => set((x) => void (x.scenarioVersion = e.target.value), "version")} />
        </Field>
        <Field label="Title">
          <input className={input} value={b.title} onChange={(e) => set((x) => void (x.title = e.target.value), "title")} />
        </Field>
        <Field label="Introduction">
          <input className={input} value={b.intro} onChange={(e) => set((x) => void (x.intro = e.target.value), "intro")} />
        </Field>
        <Field
          label="Rule set"
          hint={
            rules
              ? `Effective ${rules.effectiveFrom}, checked ${rules.checkedOn}, review by ${rules.reviewBy}. Its rules are in lib/quarterEndRules, for Finance and policy review.`
              : ""
          }
        >
          <select className={input} value={b.ruleSetId} onChange={(e) => set((x) => void (x.ruleSetId = e.target.value))}>
            {QUARTER_RULES.map((r) => (
              <option key={r.id} value={r.id}>
                {r.label}
              </option>
            ))}
          </select>
        </Field>
        <Field label="Mode" hint="Formative by default. Assessed needs an approved programme decision, a pass mark and the Question Pool’s retry policy.">
          <select
            className={input}
            value={b.assessment.mode}
            onChange={(e) => set((x) => void (x.assessment.mode = e.target.value === "assessed" ? "assessed" : "formative"))}
          >
            <option value="formative">Formative practice</option>
            <option value="assessed">Assessed (approved programme only)</option>
          </select>
        </Field>
        {b.assessment.mode === "assessed" && (
          <Field label="Pass mark (out of 15)" hint="And no critical error.">
            <input
              type="number"
              min={1}
              max={15}
              className={input}
              value={b.assessment.passMark}
              onChange={(e) => set((x) => void (x.assessment.passMark = Math.max(1, Math.min(15, Math.round(Number(e.target.value)) || 1))))}
            />
          </Field>
        )}
      </div>

      <section className={cx(group, "mt-4")}>
        <h4 className="font-semibold">The figures (fictional, in dollars)</h4>
        <div className="grid gap-3 sm:grid-cols-3">
          <Field label="Classification label">
            <input className={input} value={f.classificationLabel} onChange={(e) => set((x) => void (x.figures.classificationLabel = e.target.value))} />
          </Field>
          {money$("Quarterly budget, including supplements", f.quarterlyBudgetCents, (x, c) => void (x.figures.quarterlyBudgetCents = c))}
          {money$("Of which supplements", f.supplementsCents, (x, c) => void (x.figures.supplementsCents = c))}
          <Field label="Care management and the displayed balance" className="sm:col-span-2">
            <select className={input} value={f.basis} onChange={(e) => set((x) => void (x.figures.basis = e.target.value as Basis))}>
              {(Object.keys(BASES) as Basis[]).map((k) => (
                <option key={k} value={k}>
                  {BASES[k]}
                </option>
              ))}
            </select>
          </Field>
          {money$(
            "Care management still in the displayed balance",
            f.careManagementDeductedCents,
            (x, c) => void (x.figures.careManagementDeductedCents = c),
            "Zero when the balance already accounts for it.",
          )}
          {money$("Displayed balance on the snapshot date", f.currentBalanceCents, (x, c) => void (x.figures.currentBalanceCents = c))}
          {(["start", "end"] as const).map((k) => (
            <Field key={k} label={`Quarter ${k}`}>
              <input type="date" className={input} value={f.quarter[k]} onChange={(e) => set((x) => void (x.figures.quarter[k] = e.target.value))} />
            </Field>
          ))}
          <Field label="Snapshot (“today” in the story)">
            <input type="date" className={input} value={f.snapshot} onChange={(e) => set((x) => void (x.figures.snapshot = e.target.value))} />
          </Field>
          {(["independence", "everyday"] as const).map((k) => (
            <Field key={k} label={`${k === "everyday" ? "Everyday Living" : "Independence"} rate (%)`} hint="Blank means “needs checking”, never zero.">
              <input
                className={input}
                inputMode="decimal"
                value={b.rates[k] === null ? "" : String(b.rates[k]! / 100)}
                onChange={(e) => set((x) => void (x.rates[k] = e.target.value.trim() === "" ? null : Math.round(Number(e.target.value) * 100) || 0))}
              />
            </Field>
          ))}
          <Field label="Where the rates come from, and their effective date" className="sm:col-span-3">
            <input className={input} value={b.ratesBasis} onChange={(e) => set((x) => void (x.ratesBasis = e.target.value), "rates")} />
          </Field>
        </div>
        <p className="text-sm" role="status">
          As written: current {money(p.actualAvailableCents)}, booked {money(p.bookedEstimateCents)}, projected {money(p.projectedBalanceCents)}; threshold{" "}
          {p.threshold.text}; {money(p.projectedAboveThresholdCents)} projected above it. Contributions on the bookings{" "}
          {p.contribution.complete ? money(p.contribution.knownCents) : "need checking"}. {p.days.left} days left after the snapshot.
        </p>
      </section>

      <section className={cx(group, "mt-4")}>
        <h4 className="font-semibold">The case, as written</h4>
        <JsonEdit
          label="Story (participant, about, who decides, the supporter’s request, goals, the reply, the equipment)"
          value={b.story}
          onApply={(v) => set((x) => void (x.story = v as BudgetLabData["story"]))}
          check={isObj}
        />
        <JsonEdit
          label="Services (price, units, category, approval, funding route, supplier dates, the participant’s view)"
          value={b.services}
          onApply={(v) => set((x) => void (x.services = v as BudgetLabData["services"]))}
          check={Array.isArray}
        />
        <JsonEdit
          label="Booked sessions for the days left"
          value={b.booked}
          onApply={(v) => set((x) => void (x.booked = v as BudgetLabData["booked"]))}
          check={Array.isArray}
        />
        <JsonEdit
          label="Documents (care plan, Notice of Decision and case note excerpts)"
          value={b.documents}
          onApply={(v) => set((x) => void (x.documents = v as BudgetLabData["documents"]))}
          check={Array.isArray}
        />
        <JsonEdit
          label="Questions about the figures (option text can use {current}, {booked}, {projected}, {threshold}, {above}, {budget}, {percent}, {minimum}, {name})"
          value={b.read}
          onApply={(v) => set((x) => void (x.read = v as BudgetLabData["read"]))}
          check={Array.isArray}
        />
        <JsonEdit
          label="Conversation approaches"
          value={b.conversation}
          onApply={(v) => set((x) => void (x.conversation = v as Question))}
          check={isQuestion}
        />
        <JsonEdit label="Equipment route" value={b.equipment} onApply={(v) => set((x) => void (x.equipment = v as Question))} check={isQuestion} />
        <JsonEdit label="Explanations" value={b.explanation} onApply={(v) => set((x) => void (x.explanation = v as Question))} check={isQuestion} />
        <JsonEdit label="Next steps" value={b.nextStep} onApply={(v) => set((x) => void (x.nextStep = v as Question))} check={isQuestion} />
        <JsonEdit
          label="Phrases to avoid in a reason"
          value={b.avoid}
          onApply={(v) => set((x) => void (x.avoid = v as BudgetLabData["avoid"]))}
          check={Array.isArray}
        />
        <JsonEdit
          label="Endings’ feedback (added, review, unchanged)"
          value={b.endings}
          onApply={(v) => set((x) => void (x.endings = v as BudgetLabData["endings"]))}
          check={isObj}
        />
        <JsonEdit
          label="Variations for a retry (cancelled bookings, changed supplier dates)"
          value={b.twists}
          onApply={(v) => set((x) => void (x.twists = v as BudgetLabData["twists"]))}
          check={Array.isArray}
        />
        <JsonEdit
          label="Policy sources"
          value={b.sources}
          onApply={(v) => set((x) => void (x.sources = v as BudgetLabData["sources"]))}
          check={Array.isArray}
        />
        <Field label="Debrief summary" hint="Shown with the consequences.">
          <textarea className={cx(input, "min-h-20 py-2")} value={b.debrief} onChange={(e) => set((x) => void (x.debrief = e.target.value), "debrief")} />
        </Field>
        <div className="grid gap-3 sm:grid-cols-2">
          <Field
            label="Job Aid (Work Tools id)"
            hint="The canonical Quarterly Budget Check: shown in the feedback, with Save to Favourites, once its release is approved."
          >
            <input className={input} value={b.jobAid.snippetId} onChange={(e) => set((x) => void (x.jobAid.snippetId = e.target.value.trim()), "aid")} />
          </Field>
          <Field label="Why the Job Aid belongs here">
            <input className={input} value={b.jobAid.why} onChange={(e) => set((x) => void (x.jobAid.why = e.target.value), "aidwhy")} />
          </Field>
        </div>
      </section>

      <section className={cx(group, "mt-4")}>
        <h4 className="font-semibold">Case check</h4>
        {problems.length ? (
          <ul className="list-disc pl-5 text-sm">
            {problems.map((x) => (
              <li key={x}>{x}</li>
            ))}
          </ul>
        ) : (
          <>
            <p className="text-sm">
              Passes: the figures reconcile, the dates fall in the quarter, care management is deducted once, every service has a route and approval state, and
              every defensible ending, played strongly, gets full feedback with no flag:
            </p>
            <ul className="list-disc pl-5 text-sm">
              {endings.map((e) => (
                <li key={e.label}>
                  {e.label} ({e.ending}): projected {money(e.projected)}, {e.score}/15
                </li>
              ))}
            </ul>
          </>
        )}
      </section>

      <details className={cx(group, "mt-4")}>
        <summary className="cursor-pointer font-semibold">Reviewer view: each consequential feedback line and its rule source</summary>
        <div className="overflow-x-auto">
          <table className="w-full min-w-[40rem] text-left text-sm">
            <thead>
              <tr className="border-b border-line-strong">
                <th className="py-1 pr-2">Where</th>
                <th className="py-1 pr-2">Option and feedback</th>
                <th className="py-1 pr-2">Codes</th>
                <th className="py-1">Rule source</th>
              </tr>
            </thead>
            <tbody>
              {questions.flatMap(([where, q]) =>
                q.options.map((o) => (
                  <tr key={`${q.id}-${o.id}`} className="border-b border-line align-top">
                    <td className="py-1 pr-2">{where}</td>
                    <td className="py-1 pr-2">
                      <span className="font-semibold">{o.text}</span>
                      <span className="block text-ink-muted">{o.feedback || "No feedback yet"}</span>
                    </td>
                    <td className="py-1 pr-2">{o.flags.map((x) => FLAGS[x]).join("; ") || "None"}</td>
                    <td className="py-1">{rules ? [...new Set(o.flags.map((x) => sourceTitle(rules, FLAG_SOURCES[x])))].join("; ") || "—" : "—"}</td>
                  </tr>
                )),
              )}
              {p.checks.map((c) => (
                <tr key={c.code} className="border-b border-line align-top">
                  <td className="py-1 pr-2">Calculation</td>
                  <td className="py-1 pr-2">{c.text}</td>
                  <td className="py-1 pr-2">{c.code}</td>
                  <td className="py-1">{rules ? sourceTitle(rules, c.sourceId) : "—"}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      </details>

      <section className={cx(group, "mt-4")}>
        <h4 className="font-semibold">Why this block (selection rationale)</h4>
        <p className="text-sm text-ink-muted">
          Recorded with the scenario version. Accept it, edit it, or reject it if a lab isn’t the right fix. AI may phrase feedback from approved facts; it
          never supplies a rule, a rate or the authoritative answer.
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
              onChange={(e) => set((x) => void (x.rationale.decision = e.target.value as BudgetLabData["rationale"]["decision"]))}
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
        <h4 className="font-semibold">Sign-off</h4>
        <p className="text-sm text-ink-muted">
          Operations/Finance approve the figures and process, the policy owner the rules, Quality the client-facing language, and a learning reviewer the rubric
          and accessibility. The Hub owner then publishes the version.
        </p>
        <div className="grid gap-3 sm:grid-cols-2">
          {SIGNOFF.map(([k, label]) => (
            <Field key={k} label={label}>
              <input className={input} value={b.approval[k]} onChange={(e) => set((x) => void (x.approval[k] = e.target.value), `ap-${k}`)} />
            </Field>
          ))}
          <Field label="Rule set reviewed" hint={`The rule set the reviewers checked. It must match the block’s (${b.ruleSetId}).`}>
            <input
              className={input}
              value={b.approval.ruleSetReviewed}
              onChange={(e) => set((x) => void (x.approval.ruleSetReviewed = e.target.value.trim()), "ap-rules")}
            />
          </Field>
          {(["approvedOn", "effectiveFrom", "reviewBy"] as const).map((k) => (
            <Field key={k} label={k === "approvedOn" ? "Approved on" : k === "effectiveFrom" ? "Effective from" : "Review by"}>
              <input type="date" className={input} value={b.approval[k]} onChange={(e) => set((x) => void (x.approval[k] = e.target.value))} />
            </Field>
          ))}
        </div>
      </section>
    </div>
  );
}
