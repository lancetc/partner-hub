"use client";

import { cx } from "@/lib/format";
import type { TrustCheckBlock } from "@/lib/magazine";
import { QUARTER_RULES } from "@/lib/quarterEndRules";
import { caseProblems, CODES, CRITICAL, ENDINGS, MAX_SCORE, playPath, trustApproved, trustSignOffProblems, type TrustData } from "@/lib/trustCheck";
import { TRUST_CASES } from "@/content/trustCases";
import { SEED_SNIPPETS } from "@/content/playbooks";
import { Field, input } from "./ui";
import { JsonEdit } from "./MagazineIntakeEdit";
import type { Update } from "./MagazineEditParts";
import { Icon } from "../Icon";

/*
  The editor for a 28-Day Trust Check block (docs/trust-check.md). Plain fields for the frame (title, story, people,
  mode, rule set, follow-up window, Job Aid, rationale, sign-off); JSON edits for the case itself (sharing preferences,
  signals, decisions, the plan builder, variations, authored paths, endings and sources), as the sibling labs' editors
  do.

  The case check runs as you type, and the branch preview plays every authored path through the same engine the
  server uses: a false balance (the pause), a family-permission issue (the shortcut), a transfer, a safety escalation
  and the no-action ending, with each one's ending, score and critical errors. Preview plays any branch. Nothing here is
  generated: AI dialogue and drafting are a disabled stub in this release, and a case never reads a real record.
*/

const group = "flex flex-col gap-3 rounded-2xl bg-muted p-3";
const okTone = "bg-[#e3f4ea] text-[#0f5b3a] dark:bg-[#12392a] dark:text-[#8fe0b5]";
const warnTone = "bg-[#fff1cc] text-[#4a3400] dark:bg-[#3d2f08] dark:text-[#ffd97a]";
const SIGNOFF: [Exclude<keyof TrustData["approval"], "approvedOn" | "reviewBy" | "scenarioReviewed">, string][] = [
  ["owner", "Owner (Partner Enablement)"],
  ["operations", "Care Coordination operations (cadence, booking escalation, owners)"],
  ["quality", "Quality / complaints (complaint, transfer and safeguarding pathways)"],
  ["policy", "Support at Home policy and budgets (carryover, AT–HM, statements)"],
  ["finance", "Finance / billing (statement and invoice examples)"],
  ["clinical", "Clinical governance (the safety branch, AT–HM examples)"],
  ["partnerships", "Partnerships (Care Partner role and delegation)"],
  ["privacy", "Privacy / security (contact and sharing preferences)"],
  ["learning", "Learning reviewer (rubric and accessibility)"],
];
const RATIONALE: [Exclude<keyof TrustData["rationale"], "decision">, string, string][] = [
  ["signal", "Problem signal", "From verified Problem desk themes. Never copy a participant’s details here."],
  ["themeId", "Problem desk theme ID", ""],
  ["behaviour", "Target behaviour", ""],
  ["nonLearning", "Possible non-learning causes", "A missing worker or a broken billing feed goes to Operations or Finance, not to more learning."],
  ["whyFit", "Why a multi-step case", ""],
  ["existing", "Existing relevant content", ""],
  ["reviewer", "Reviewer", ""],
  ["measure", "Outcome measure (owned separately)", "Denominator, baseline and review date. Never inferred from completion."],
];
const isArr = (v: unknown) => Array.isArray(v);
const isObj = (v: unknown) => Boolean(v) && typeof v === "object" && !Array.isArray(v);

export function TrustCheckEdit({ block: b, update }: { block: TrustCheckBlock; update: Update }) {
  const set = (fn: (x: TrustCheckBlock) => void, tag?: string) => update<TrustCheckBlock>(b.id, fn, tag && `${b.id}:${tag}`);
  const problems = caseProblems(b);
  const signed = trustApproved(b);
  // What holds publication besides the reviewers' names: the placeholders and the Job Aid (dates are checked at publishing, on the server).
  const held = trustSignOffProblems(b, "").filter((p) => !/record the owner|due for review|rule set/.test(p));
  const paths = problems.length
    ? []
    : b.paths.map((p) => {
        const r = playPath(b, p);
        return {
          p,
          ending: r.debrief.ending,
          score: r.debrief.score,
          critical: r.debrief.critical.map((c) => c.text),
          ok: r.debrief.ending === p.expect && !r.problems.length,
        };
      });
  const json = (label: string, key: keyof TrustData, check: (v: unknown) => boolean) => (
    <JsonEdit label={label} value={b[key]} check={check} onApply={(v) => set((x) => void Object.assign(x, { [key]: v }))} />
  );
  return (
    <div className="w-full rounded-3xl border border-line-strong bg-surface p-5 shadow-sm sm:p-7">
      <p className="mb-2 flex items-center gap-2 font-mulish text-sm font-extrabold uppercase tracking-[0.12em] text-accent">
        <Icon name="calendar" className="size-5" /> 28-Day Trust Check
      </p>
      <p role="status" className={cx("rounded-2xl px-4 py-3 text-sm font-semibold", signed && !problems.length && !held.length ? okTone : warnTone)}>
        {problems.length
          ? `The case check finds ${problems.length} ${problems.length === 1 ? "problem" : "problems"} (below). It can’t be published until it passes.`
          : signed && !held.length
            ? "The case check passes and the sign-off is recorded."
            : "A draft: the case check passes, but it can’t be published until Trilogy Care’s procedures replace the placeholders and every reviewer signs off."}
      </p>
      <p className="mt-2 text-sm text-ink-muted">
        Fictional data only. Nothing a learner does sends a message, books a service, lodges a complaint or starts a transfer. A score is practice evidence,
        never a retention figure, and there is no churn score anywhere.
      </p>

      <div className="mt-3 grid gap-3 sm:grid-cols-2">
        <Field label="Start from a case">
          <select
            className={input}
            value=""
            onChange={(e) => {
              const c = TRUST_CASES.find((x) => x.id === e.target.value);
              if (c && window.confirm(`Replace this block with “${c.label}”? What’s written here now is replaced.`))
                set((x) => void Object.assign(x, structuredClone(c.data)));
            }}
          >
            <option value="">Choose…</option>
            {TRUST_CASES.map((c) => (
              <option key={c.id} value={c.id}>
                {c.label}
              </option>
            ))}
          </select>
        </Field>
        <Field label="Scenario version" hint="Change it whenever the case, decisions or feedback change: every attempt freezes the version it used.">
          <input className={input} value={b.scenarioVersion} onChange={(e) => set((x) => void (x.scenarioVersion = e.target.value), "version")} />
        </Field>
        <Field label="Title">
          <input className={input} value={b.title} onChange={(e) => set((x) => void (x.title = e.target.value), "title")} />
        </Field>
        <Field label="Introduction">
          <textarea className={cx(input, "min-h-16 py-2")} value={b.intro} onChange={(e) => set((x) => void (x.intro = e.target.value), "intro")} />
        </Field>
        <Field label="Mode" hint="Formative by default. Assessed uses the pass mark, and any critical error prevents a pass.">
          <select className={input} value={b.mode} onChange={(e) => set((x) => void (x.mode = e.target.value === "assessed" ? "assessed" : "formative"))}>
            <option value="formative">Formative practice</option>
            <option value="assessed">Assessed (an approved programme only)</option>
          </select>
        </Field>
        <Field label={`Pass mark (of ${MAX_SCORE})`}>
          <input
            className={input}
            inputMode="numeric"
            value={b.passMark}
            onChange={(e) => set((x) => void (x.passMark = Math.max(0, Math.min(MAX_SCORE, Math.floor(Number(e.target.value) || 0)))), "pass")}
          />
        </Field>
        <Field label="Budget rule set" hint="The Quarterly Budget Decision Lab’s effective-dated rules: the carryover threshold and the AT–HM boundary.">
          <select className={input} value={b.ruleSetId} onChange={(e) => set((x) => void (x.ruleSetId = e.target.value))}>
            {QUARTER_RULES.map((r) => (
              <option key={r.id} value={r.id}>
                {r.label}
              </option>
            ))}
          </select>
        </Field>
        <Field label="Follow-up window (days)" hint="An internal, configurable window. Never a statutory period, and never a hold on an urgent issue.">
          <input
            className={input}
            inputMode="numeric"
            value={b.windowDays}
            onChange={(e) => set((x) => void (x.windowDays = Math.max(1, Math.min(90, Math.floor(Number(e.target.value) || 28)))), "window")}
          />
        </Field>
        <Field label="The participant (a library character)" hint="Use a name already in the character library, so publishing doesn’t queue a new portrait.">
          <input className={input} value={b.participant.name} onChange={(e) => set((x) => void (x.participant.name = e.target.value), "pt")} />
        </Field>
        <Field label="Their goal">
          <input className={input} value={b.participant.goal} onChange={(e) => set((x) => void (x.participant.goal = e.target.value), "goal")} />
        </Field>
        <Field label="The supporter (a library character)">
          <input className={input} value={b.supporter.name} onChange={(e) => set((x) => void (x.supporter.name = e.target.value), "sup")} />
        </Field>
        <Field label="The supporter’s role">
          <input className={input} value={b.supporter.status} onChange={(e) => set((x) => void (x.supporter.status = e.target.value), "supst")} />
        </Field>
        <Field label="Setting">
          <input className={input} value={b.story.setting} onChange={(e) => set((x) => void (x.story.setting = e.target.value), "setting")} />
        </Field>
        <Field label="The learner’s role">
          <textarea className={cx(input, "min-h-16 py-2")} value={b.story.role} onChange={(e) => set((x) => void (x.story.role = e.target.value), "role")} />
        </Field>
        <Field label="The situation">
          <textarea
            className={cx(input, "min-h-24 py-2")}
            value={b.story.situation}
            onChange={(e) => set((x) => void (x.story.situation = e.target.value), "sit")}
          />
        </Field>
        <Field label="The tempting first move" hint="The PRD’s ‘use the budget’ shortcut, named so the learner can resist it.">
          <textarea
            className={cx(input, "min-h-16 py-2")}
            value={b.story.temptation}
            onChange={(e) => set((x) => void (x.story.temptation = e.target.value), "tempt")}
          />
        </Field>
        <Field
          label="Job Aid in the debrief and the Work Tool"
          hint="Shown with Save to Favourites. Learners don’t see it until its first release is approved."
        >
          <select className={input} value={b.jobAid.snippetId} onChange={(e) => set((x) => void (x.jobAid.snippetId = e.target.value))}>
            <option value="">None</option>
            {SEED_SNIPPETS.map((s) => (
              <option key={s.id} value={s.id}>
                {s.data.title}
              </option>
            ))}
          </select>
        </Field>
      </div>

      <section className={cx(group, "mt-4")}>
        <h4 className="font-semibold">The case (advanced)</h4>
        <p className="text-sm text-ink-muted">
          Sharing preferences use the Tough Family Call’s model (topic, allowed, detail). Missed visits use the Service Reliability Calculator’s outcomes and
          reasons. A learner’s own choice never confirms a delivery: only a checkpoint record does, and only when it’s chosen as evidence.
        </p>
        {json("Sharing preferences (topic by topic)", "sharing", isArr)}
        {json("Signal cards and checkpoint records", "signals", isArr)}
        {json("Decisions (phase, prompt, options with levels, codes, replies, evidence, endings, variation overrides)", "steps", isArr)}
        {json("The plan builder (actions, updates, contingencies, checks)", "plan", isObj)}
        {json("Variations (retries and preview branches)", "variations", isArr)}
        {json("Authored paths (played by the case check)", "paths", isArr)}
        {json("Endings", "endings", isObj)}
        {json("Sources (a placeholder holds publishing)", "sources", isArr)}
        {json("Related links", "related", isArr)}
        <Field label="Why it matters (debrief)">
          <textarea className={cx(input, "min-h-20 py-2")} value={b.debrief} onChange={(e) => set((x) => void (x.debrief = e.target.value), "debrief")} />
        </Field>
      </section>

      <section className={cx(group, "mt-4")}>
        <h4 className="font-semibold">Case check and branch preview</h4>
        {problems.length ? (
          <ul className="list-disc pl-5 text-sm">
            {problems.map((x) => (
              <li key={x}>{x}</li>
            ))}
          </ul>
        ) : (
          <div className="overflow-x-auto">
            <table className="w-full text-left text-sm">
              <caption className="text-left text-ink-muted">Every authored path, played through the engine. Use Preview to play a branch yourself.</caption>
              <thead>
                <tr className="border-b border-line">
                  <th scope="col" className="py-1 pr-2">
                    Path
                  </th>
                  <th scope="col" className="py-1 pr-2">
                    Branch
                  </th>
                  <th scope="col" className="py-1 pr-2">
                    Ending
                  </th>
                  <th scope="col" className="py-1 pr-2">
                    Score
                  </th>
                  <th scope="col" className="py-1">
                    Critical errors
                  </th>
                </tr>
              </thead>
              <tbody>
                {paths.map((r) => (
                  <tr key={r.p.id} className="border-b border-line align-top">
                    <th scope="row" className="py-1 pr-2 font-normal">
                      {r.p.label}
                    </th>
                    <td className="py-1 pr-2">{b.variations.find((v) => v.id === r.p.variation)?.label ?? "As written"}</td>
                    <td className="py-1 pr-2">
                      {ENDINGS[r.ending]}
                      {!r.ok && <span className="block font-semibold">Expected: {ENDINGS[r.p.expect]}</span>}
                    </td>
                    <td className="py-1 pr-2">
                      {r.score}/{MAX_SCORE}
                    </td>
                    <td className="py-1">{r.critical.join("; ") || "None"}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
        {held.length > 0 && (
          <>
            <p className="text-sm font-semibold">Also holding publication:</p>
            <ul className="list-disc pl-5 text-sm">
              {held.map((x) => (
                <li key={x}>{x}</li>
              ))}
            </ul>
          </>
        )}
        <p className="text-sm text-ink-muted">Critical flags (no total can cancel one): {CRITICAL.map((c) => CODES[c]).join("; ")}.</p>
      </section>

      <section className={cx(group, "mt-4")}>
        <h4 className="font-semibold">Why this block (the Learning Designer’s card)</h4>
        {RATIONALE.map(([k, label, hint]) => (
          <Field key={k} label={label} hint={hint || undefined}>
            <input className={input} value={b.rationale[k]} onChange={(e) => set((x) => void (x.rationale[k] = e.target.value), `ra-${k}`)} />
          </Field>
        ))}
        <Field label="Author’s decision on the recommendation">
          <select
            className={input}
            value={b.rationale.decision}
            onChange={(e) =>
              set(
                (x) =>
                  void (x.rationale.decision = (
                    ["accepted", "edited", "rejected"].includes(e.target.value) ? e.target.value : ""
                  ) as TrustData["rationale"]["decision"]),
              )
            }
          >
            <option value="">Not decided</option>
            <option value="accepted">Accepted</option>
            <option value="edited">Accepted with edits</option>
            <option value="rejected">Rejected: route to Operations instead</option>
          </select>
        </Field>
        <p className="text-sm text-ink-muted">
          AI dialogue for Mrs Patel and AI drafting of check-in plans: off in this release (no paid calls). Everything here is written by a person, and the
          scoring is deterministic.
        </p>
      </section>

      <section className={cx(group, "mt-4")}>
        <h4 className="font-semibold">Sign-off</h4>
        <p className="text-sm text-ink-muted">
          It can’t be published until each reviewer is recorded, with the date and the scenario version they reviewed, the placeholder procedures are replaced,
          and the budget rule set is current.
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
          <Field label="Review by">
            <input type="date" className={input} value={b.approval.reviewBy} onChange={(e) => set((x) => void (x.approval.reviewBy = e.target.value))} />
          </Field>
          <Field label="Scenario version reviewed" hint="A different version on the block means Review required.">
            <input
              className={input}
              value={b.approval.scenarioReviewed}
              onChange={(e) => set((x) => void (x.approval.scenarioReviewed = e.target.value), "ap-sv")}
            />
          </Field>
        </div>
      </section>
    </div>
  );
}
