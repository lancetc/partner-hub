"use client";

import { cx } from "@/lib/format";
import type { WorkloadBlock } from "@/lib/magazine";
import { caseProblems, labApproved, type WorkloadLabData } from "@/lib/workloadLab";
import { calculate, CATEGORIES, CATEGORY_HINTS, CATEGORY_ORDER, CAUSES, round1, TAXONOMY_VERSION, validateInputs } from "@/lib/workloadLens";
import { WORKLOAD_CASES } from "@/content/workloadCases";
import { Field, input } from "./ui";
import { JsonEdit } from "./MagazineIntakeEdit";
import type { Update } from "./MagazineEditParts";
import { Icon } from "../Icon";

/*
  The editor for a Workload Lens block ("Where does a coordinator’s week go?", docs/workload-lens.md). The frame has
  plain fields; the story, the observed weeks and plan, the prediction, the events (with their reviewed tags and
  feedback), the explanations and the decisions each have an advanced JSON edit, as the growth readiness editor does,
  because the case is easier to inspect as text than as a hundred small inputs. The task taxonomy is shared and
  versioned: it's shown here for reference, never regenerated for an article. The case check lists anything that would
  mislead a learner. The AI selection rationale (PRD section 10) is recorded and versioned with the story, and the
  author accepts, edits or rejects it. Nothing here is generated. Use Preview to play it.
*/

const group = "flex flex-col gap-3 rounded-2xl bg-muted p-3";
const SIGNOFF: [keyof WorkloadLabData["approval"], string][] = [
  ["owner", "Owner (Partner Enablement)"],
  ["operations", "Care Coordination operations (workflow and duties)"],
  ["quality", "Quality / clinical governance (escalation and continuity)"],
  ["partnerships", "Partnerships (business-role language)"],
  ["privacy", "Privacy and security (fair use, no surveillance)"],
  ["pilot", "Pilot group of Care Partner principals and coordinators"],
];
const RATIONALE: [Exclude<keyof WorkloadLabData["rationale"], "decision">, string, string][] = [
  ["theme", "Verified feedback or QA theme", "What was seen, and where it came from."],
  ["themeOwner", "Theme owner", "Who owns that evidence."],
  ["audience", "Audience", ""],
  ["behaviour", "Behaviour to change", ""],
  ["whyFit", "Why a time-map exercise fits", ""],
  ["reuse", "What existing article, Job Aid or calculator is reused", ""],
  ["systemFix", "Process, policy or system fix also needed", "Learning alone can’t fix a broken handoff or system."],
  ["measure", "Linked operational measure (owned separately)", "The learning outcomes are scored here; the operational measure is owned elsewhere."],
];

export function WorkloadEdit({ block: b, update }: { block: WorkloadBlock; update: Update }) {
  const set = (fn: (x: WorkloadBlock) => void, tag?: string) => update<WorkloadBlock>(b.id, fn, tag && `${b.id}:${tag}`);
  const problems = caseProblems(b);
  const signed = labApproved(b);
  const r = validateInputs(b.inputs).length ? null : calculate(b.inputs);
  return (
    <div className="w-full rounded-3xl border border-line-strong bg-surface p-5 shadow-sm sm:p-7">
      <p className="mb-2 flex items-center gap-2 font-mulish text-sm font-extrabold uppercase tracking-[0.12em] text-accent">
        <Icon name="clock" className="size-5" /> Workload Lens
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
              const c = WORKLOAD_CASES.find((x) => x.id === e.target.value);
              if (c && window.confirm(`Replace this block with “${c.label}”? What’s written here now is replaced.`))
                set((x) => void Object.assign(x, structuredClone(c.data)));
            }}
          >
            <option value="">Choose…</option>
            {WORKLOAD_CASES.map((c) => (
              <option key={c.id} value={c.id}>
                {c.label}
              </option>
            ))}
          </select>
        </Field>
        <Field label="Story version" hint="Change it when the story, figures or feedback change: attempts record the version they used.">
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
            {r.weeks
              .map((w) => `${w.label}: ${round1(w.observed)} h observed of ${round1(w.capacity)} h available (${round1(w.reworkTagged)} h reviewed rework)`)
              .join("; ")}
            . The forward plan has {round1(r.plan.headroom)} h of headroom. {r.sample} {r.sample === 1 ? "week" : "weeks"}:{" "}
            {r.evidence === "single" ? "an illustration" : "a comparison"}.
          </p>
        ) : (
          <p className="text-sm">The figures don’t validate yet, so there’s no result.</p>
        )}
        <JsonEdit
          label="Story (principal, coordinator, situation, Ava’s transmission, the two views, Friday, dilemma)"
          value={b.story}
          onApply={(v) => set((x) => void (x.story = v as WorkloadLabData["story"]))}
          check={(v) => isObj(v)}
        />
        <JsonEdit
          label="The weeks and the plan (observed tasks, the forward plan, changes to test, guardrails)"
          value={b.inputs}
          onApply={(v) => set((x) => void (x.inputs = v as WorkloadLabData["inputs"]))}
          check={(v) => isObj(v) && Array.isArray((v as Record<string, unknown>).weeks)}
        />
        <JsonEdit
          label="Prediction (prompt, options; likely: true marks the constraint the case shows)"
          value={b.prediction}
          onApply={(v) => set((x) => void (x.prediction = v as WorkloadLabData["prediction"]))}
          check={(v) => isObj(v)}
        />
        <JsonEdit
          label="Events (each names a task in the first week, with its reviewed tags and feedback)"
          value={b.events}
          onApply={(v) => set((x) => void (x.events = v as WorkloadLabData["events"]))}
          check={Array.isArray}
        />
        <JsonEdit
          label="Explanations to compare (with feedback, levels and flags)"
          value={b.explanations}
          onApply={(v) => set((x) => void (x.explanations = v as WorkloadLabData["explanations"]))}
          check={Array.isArray}
        />
        <JsonEdit
          label="Decisions (with feedback, outcome, levels and flags)"
          value={b.decisions}
          onApply={(v) => set((x) => void (x.decisions = v as WorkloadLabData["decisions"]))}
          check={Array.isArray}
        />
        <JsonEdit
          label="Links (Hiring Runway and other tools)"
          value={b.links}
          onApply={(v) => set((x) => void (x.links = v as WorkloadLabData["links"]))}
          check={Array.isArray}
        />
        <JsonEdit label="Sources" value={b.sources} onApply={(v) => set((x) => void (x.sources = v as WorkloadLabData["sources"]))} check={Array.isArray} />
        <Field label="Debrief summary" hint="Shown once the learner’s decision is in.">
          <textarea className={cx(input, "min-h-24 py-2")} value={b.debrief} onChange={(e) => set((x) => void (x.debrief = e.target.value), "debrief")} />
        </Field>
        <Field label="The following week" hint="What happens next in the story. Shown in the debrief.">
          <textarea
            className={cx(input, "min-h-20 py-2")}
            value={b.followingWeek}
            onChange={(e) => set((x) => void (x.followingWeek = e.target.value), "following")}
          />
        </Field>
      </section>

      <details className={cx(group, "mt-4")}>
        <summary className="cursor-pointer font-semibold">
          The shared task taxonomy ({b.taxonomyVersion || TAXONOMY_VERSION}){b.taxonomyVersion !== TAXONOMY_VERSION && " · the case uses an earlier version"}
        </summary>
        <p className="text-sm text-ink-muted">
          Every Workload Lens uses the same categories and causes, so tags mean the same thing across articles. To add a category, change the taxonomy (with a
          reviewed definition) and its version, not this article.
        </p>
        <dl className="grid gap-2 text-sm sm:grid-cols-2">
          {CATEGORY_ORDER.map((c) => (
            <div key={c}>
              <dt className="font-semibold">{CATEGORIES[c]}</dt>
              <dd className="text-ink-muted">{CATEGORY_HINTS[c]}</dd>
            </div>
          ))}
        </dl>
        <p className="text-sm">
          <strong>Causes (an overlay, never added to the total):</strong> {Object.values(CAUSES).join(", ")}.
        </p>
      </details>

      <section className={cx(group, "mt-4")}>
        <h4 className="font-semibold">Why this block (selection rationale)</h4>
        <p className="text-sm text-ink-muted">
          Recorded with the story version. Accept it, edit it, or reject it if a time map isn’t the right fix. It never replaces the operational measure.
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
              onChange={(e) => set((x) => void (x.rationale.decision = e.target.value as WorkloadLabData["rationale"]["decision"]))}
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
            Passes: the figures validate and partition exactly, every event names a task, there’s reviewed rework for a change to test, and there’s at least one
            strong, unflagged explanation and decision.
          </p>
        )}
      </section>

      <section className={cx(group, "mt-4")}>
        <h4 className="font-semibold">Sign-off</h4>
        <p className="text-sm text-ink-muted">
          Partner Enablement drafts; each reviewer below checks their part, including the fictional workflow and any statement of duty; then it can be published
          as a version.
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
          <Field label="Review by" hint="After this date it can’t be published until it’s reviewed again.">
            <input type="date" className={input} value={b.approval.reviewBy} onChange={(e) => set((x) => void (x.approval.reviewBy = e.target.value))} />
          </Field>
        </div>
      </section>
    </div>
  );
}

const isObj = (v: unknown) => Boolean(v) && typeof v === "object" && !Array.isArray(v);
