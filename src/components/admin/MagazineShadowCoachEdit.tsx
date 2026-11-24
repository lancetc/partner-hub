"use client";

import { cx } from "@/lib/format";
import type { ShadowCoachBlock } from "@/lib/magazine";
import {
  APPROVAL_ROLES,
  caseProblems,
  CLASSES,
  CODES,
  CRITICAL,
  MAX_SCORE,
  PLAN_KINDS,
  shadowApproved,
  signOffProblems,
  STAGES,
  type ShadowData,
} from "@/lib/shadowCoach";
import { sourceById } from "@/lib/shadowCoachSources";
import { SHADOW_CASES } from "@/content/shadowCoachCases";
import { SEED_SNIPPETS } from "@/content/playbooks";
import { Field, input } from "./ui";
import { JsonEdit } from "./MagazineIntakeEdit";
import type { Update } from "./MagazineEditParts";
import { Icon } from "../Icon";

/*
  The editor for a First 100 Days: Shadow & Coach block (docs/shadow-and-coach.md). Plain fields for the frame (title,
  the manager, the unnamed coordinator, the participant, mode, Job Aid, the Learning Designer's rationale, sign-off);
  a JSON edit per scenario (artefacts with line ids, findings, first actions, coaching replies and pushback, plan
  suggestions, the second sample), as the sibling labs' editors do.

  The case check runs as you type. The reviewer view puts every finding and first action beside its source, with what
  it's worth, and lists the content each plan suggestion points at (resolved against the live catalogue on the server
  when a learner plans). Preview plays any episode locally. AI coaching and AI drafting are a disabled stub.
*/

const group = "flex flex-col gap-3 rounded-2xl bg-muted p-3";
const okTone = "bg-[#e3f4ea] text-[#0f5b3a] dark:bg-[#12392a] dark:text-[#8fe0b5]";
const warnTone = "bg-[#fff1cc] text-[#4a3400] dark:bg-[#3d2f08] dark:text-[#ffd97a]";
const RATIONALE: [Exclude<keyof ShadowData["rationale"], "decision">, string, string][] = [
  ["signal", "Verified signal", "A manager capability gap from onboarding QA, repeat corrections or delayed escalations. Never a participant’s details."],
  ["behaviour", "Target manager behaviour", ""],
  ["barrier", "Underlying barrier", ""],
  ["why", "Why this block was selected", ""],
  ["alternatives", "Alternatives, such as a process change", "A broken script, unclear labels or workload pressure go to their owner, not to more training."],
  ["measure", "Outcome measure (owned separately)", "Denominator, baseline and review date. Never inferred from completion."],
];

export function ShadowCoachEdit({ block: b, update }: { block: ShadowCoachBlock; update: Update }) {
  const set = (fn: (x: ShadowCoachBlock) => void, tag?: string) => update<ShadowCoachBlock>(b.id, fn, tag && `${b.id}:${tag}`);
  const problems = caseProblems(b);
  const signed = shadowApproved(b);
  const held = signOffProblems(b, "").filter((p) => !/Sign-off still needed|Record the date|review date|scenario version/.test(p));
  return (
    <div className="w-full rounded-3xl border border-line-strong bg-surface p-5 shadow-sm sm:p-7">
      <p className="mb-2 flex items-center gap-2 font-mulish text-sm font-extrabold uppercase tracking-[0.12em] text-accent">
        <Icon name="people" className="size-5" /> First 100 Days: Shadow & Coach
      </p>
      <p role="status" className={cx("rounded-2xl px-4 py-3 text-sm font-semibold", signed && !problems.length && !held.length ? okTone : warnTone)}>
        {problems.length
          ? `The case check finds ${problems.length} ${problems.length === 1 ? "problem" : "problems"} (below). It can’t be published until it passes.`
          : signed && !held.length
            ? "The case check passes and the sign-off is recorded."
            : "A draft: the case check passes, but it can’t be published until Trilogy Care’s procedures replace the placeholders and every reviewer signs off."}
      </p>
      <p className="mt-2 text-sm text-ink-muted">
        Fictional manager practice. The coordinator is a role, never a named person; nothing a learner does reports an incident, corrects a bill, assigns real
        learning or creates an HR record. A score is simulation evidence, never a judgement of a real employee, and nobody is ranked.
      </p>

      <div className="mt-3 grid gap-3 sm:grid-cols-2">
        <Field label="Start from a case">
          <select
            className={input}
            value=""
            onChange={(e) => {
              const c = SHADOW_CASES[Number(e.target.value)];
              if (c && window.confirm(`Replace this block with “${c.label}”? What’s written here now is replaced.`))
                set((x) => void Object.assign(x, structuredClone(c.data)));
            }}
          >
            <option value="">Choose…</option>
            {SHADOW_CASES.map((c, i) => (
              <option key={c.label} value={i}>
                {c.label}
              </option>
            ))}
          </select>
        </Field>
        <Field label="Scenario version" hint="Change it whenever a sample, a rule or feedback changes: every attempt freezes the version it used.">
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
        <Field label="The manager (a library character)" hint="Use a name already in the character library, so publishing doesn’t queue a new portrait.">
          <input className={input} value={b.manager.name} onChange={(e) => set((x) => void (x.manager.name = e.target.value), "mg")} />
        </Field>
        <Field label="The manager’s situation">
          <textarea
            className={cx(input, "min-h-16 py-2")}
            value={b.manager.situation}
            onChange={(e) => set((x) => void (x.manager.situation = e.target.value), "mgs")}
          />
        </Field>
        <Field label="The new coordinator (a role, never a name)" hint="Naming her would queue a paid portrait, and invite a real person’s name.">
          <input className={input} value={b.coordinator.label} onChange={(e) => set((x) => void (x.coordinator.label = e.target.value), "cd")} />
        </Field>
        <Field label="About her">
          <textarea
            className={cx(input, "min-h-16 py-2")}
            value={b.coordinator.about}
            onChange={(e) => set((x) => void (x.coordinator.about = e.target.value), "cda")}
          />
        </Field>
        <Field label="The participant (a library character)">
          <input className={input} value={b.participant.name} onChange={(e) => set((x) => void (x.participant.name = e.target.value), "pt")} />
        </Field>
        <Field label="Job Aid in the debrief" hint="Shown with Save to Favourites. Learners don’t see it until its first release is approved.">
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
        <h4 className="font-semibold">Episodes (advanced)</h4>
        <p className="text-sm text-ink-muted">
          Each episode is one scenario in her first 100 days. Lines need ids; a finding can point at “omit:&lt;line id&gt;” for something missing. A
          contribution episode’s claims are checked against the Hub’s rule set on its date. The second sample must differ from the first.
        </p>
        <JsonEdit
          label={`Scenarios (${b.scenarios.length})`}
          value={b.scenarios}
          check={(v) => Array.isArray(v)}
          onApply={(v) => set((x) => void (x.scenarios = v as ShadowData["scenarios"]))}
        />
      </section>

      <section className={cx(group, "mt-4")}>
        <h4 className="font-semibold">Case check and reviewer view</h4>
        {problems.length > 0 && (
          <ul className="list-disc pl-5 text-sm">
            {problems.map((x) => (
              <li key={x}>{x}</li>
            ))}
          </ul>
        )}
        {b.scenarios.map((sc) => (
          <details key={sc.id} className="rounded-xl bg-surface p-3">
            <summary className="min-h-11 cursor-pointer font-semibold">
              {sc.title} <span className="font-normal text-ink-muted">({STAGES[sc.stage]})</span>
            </summary>
            <p className="mt-2 text-sm font-semibold">Findings</p>
            <ul className="list-disc pl-5 text-sm">
              {sc.findings.map((f) => (
                <li key={f.id}>
                  {f.label} — {f.classes.map((c) => CLASSES[c]).join(" or ")}
                  {f.urgent ? " · urgent" : ""}
                  {f.misclassCode ? ` · “no issue” is ${CODES[f.misclassCode].toLowerCase()}` : ""}
                  <span className="text-ink-muted"> · {sourceById(f.source)?.title ?? "no source"}</span>
                </li>
              ))}
            </ul>
            <p className="mt-2 text-sm font-semibold">First actions</p>
            <ul className="list-disc pl-5 text-sm">
              {sc.actions.map((a) => (
                <li key={a.id}>
                  {a.label} — {a.verdict}
                  {a.when !== "either" ? `, ${a.when}` : ""}
                  {a.code ? ` · ${CODES[a.code]}` : ""}
                </li>
              ))}
            </ul>
            <p className="mt-2 text-sm font-semibold">Plan suggestions and the content they point at</p>
            <ul className="list-disc pl-5 text-sm">
              {sc.suggestions.map((x) => (
                <li key={x.id}>
                  {PLAN_KINDS[x.kind]}: {x.label}
                  {x.ref ? ` → ${x.ref.type} “${x.ref.id}”` : ""}
                  {x.fit === "risk" ? " · a distractor" : ""}
                </li>
              ))}
            </ul>
            <p className="mt-1 text-xs text-ink-muted">
              Availability is checked on the server when a learner plans: only a published Topic or Magazine page, or an approved Job Aid in effect, can be
              assigned. Anything else becomes an author review request.
            </p>
          </details>
        ))}
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
                  ) as ShadowData["rationale"]["decision"]),
              )
            }
          >
            <option value="">Not decided</option>
            <option value="accepted">Accepted</option>
            <option value="edited">Accepted with edits</option>
            <option value="rejected">Rejected: route to a process change instead</option>
          </select>
        </Field>
        <p className="text-sm text-ink-muted">
          AI coaching for the fictional coordinator and AI drafting of plans: off in this release (no paid calls). The coordinator’s replies are authored, the
          coaching words are read by reviewed rules, and anything they can’t settle goes to a human reviewer.
        </p>
      </section>

      <section className={cx(group, "mt-4")}>
        <h4 className="font-semibold">Sign-off</h4>
        <p className="text-sm text-ink-muted">
          It can’t be published until each reviewer is recorded, with the date and the scenario version they reviewed, and the placeholder procedures are
          replaced.
        </p>
        <div className="grid gap-3 sm:grid-cols-2">
          {(Object.keys(APPROVAL_ROLES) as (keyof typeof APPROVAL_ROLES)[]).map((k) => (
            <Field key={k} label={APPROVAL_ROLES[k]}>
              <input className={input} value={b.approval[k]} onChange={(e) => set((x) => void (x.approval[k] = e.target.value), `ap-${k}`)} />
            </Field>
          ))}
          <Field label="Approved on">
            <input type="date" className={input} value={b.approval.approvedOn} onChange={(e) => set((x) => void (x.approval.approvedOn = e.target.value))} />
          </Field>
          <Field label="Review by">
            <input type="date" className={input} value={b.approval.reviewBy} onChange={(e) => set((x) => void (x.approval.reviewBy = e.target.value))} />
          </Field>
          <Field label="Scenario version reviewed" hint="A different version on the block means review required.">
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
