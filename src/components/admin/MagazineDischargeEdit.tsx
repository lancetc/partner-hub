"use client";

import { cx } from "@/lib/format";
import type { DischargeBlock } from "@/lib/magazine";
import {
  CODES,
  CRITICAL,
  DIMENSIONS,
  ENDINGS,
  LANES,
  MAX_SCORE,
  playPath,
  pivotApproved,
  RELIABILITY,
  scenarioProblems,
  sourceProblems,
  sourcesOf,
  type DischargeData,
} from "@/lib/dischargePivot";
import { dischargeSource, dischargeSourceStatus } from "@/lib/dischargeSources";
import { DISCHARGE_CASES } from "@/content/dischargeCases";
import { SEED_SNIPPETS } from "@/content/playbooks";
import { useHydrated } from "@/lib/store";
import { Field, input } from "./ui";
import { JsonEdit } from "./MagazineIntakeEdit";
import type { Update } from "./MagazineEditParts";
import { Icon } from "../Icon";

/*
  The editor for a 72-Hour Discharge Pivot block (docs/discharge-pivot.md). Plain fields for the frame (title, people,
  clock, mode, Job Aid, rationale, sign-off); JSON edits for the scenario itself (the record, alerts, cards, gates,
  handover questions, rubric, endings, variations and authored paths), as the sibling labs' editors do.

  The scenario check runs as you type: references, reachability, the rule that no learner's click can confirm a
  service, and every authored path played through the engine to its ending (the branch preview, unsafe shortcuts
  included). The reviewer view puts each consequential feedback line beside its source and marks the critical ones.
  Nothing here is generated: the AI assistance section is a disabled stub in this release.
*/

const group = "flex flex-col gap-3 rounded-2xl bg-muted p-3";
const okTone = "bg-[#e3f4ea] text-[#0f5b3a] dark:bg-[#12392a] dark:text-[#8fe0b5]";
const warnTone = "bg-[#fff1cc] text-[#4a3400] dark:bg-[#3d2f08] dark:text-[#ffd97a]";
const SIGNOFF: [Exclude<keyof DischargeData["approval"], "approvedOn" | "effectiveFrom" | "reviewBy" | "scenarioReviewed">, string][] = [
  ["owner", "Owner (Partner Enablement)"],
  ["clinical", "Clinical governance / Quality (every clinical line, critical errors and thresholds)"],
  ["operations", "Care Partner operations (workflow, suppliers, contacts)"],
  ["policy", "Support at Home policy owner (AT–HM, TCP, Restorative Care, reviews)"],
  ["process", "Owner of the discharge and escalation processes"],
  ["learning", "Learning reviewer (rubric and accessibility)"],
];
const RATIONALE: [Exclude<keyof DischargeData["rationale"], "decision">, string, string][] = [
  ["theme", "Problem evidence", "Link to the human-verified theme. Never copy a client narrative here."],
  ["themeId", "Problem desk theme id (optional)", "Links the block to the theme’s response decision in the register."],
  ["themeOwner", "Evidence owner", ""],
  ["behaviour", "Target behaviour", ""],
  ["barrier", "Possible barrier (validate with workers)", ""],
  ["whyFit", "Why this block", ""],
  ["evidence", "Evidence of practice", ""],
  ["measure", "Work measure (owned separately)", "Denominator, baseline and review date. Never inferred from completion."],
  ["systemFix", "Process, capacity or Job Aid fix also needed", "One simulation can’t fix missing clinical capacity or a defective handover form."],
];
const isArr = (v: unknown) => Array.isArray(v);
const isObj = (v: unknown) => Boolean(v) && typeof v === "object" && !Array.isArray(v);

export function DischargeEdit({ block: b, update }: { block: DischargeBlock; update: Update }) {
  const set = (fn: (x: DischargeBlock) => void, tag?: string) => update<DischargeBlock>(b.id, fn, tag && `${b.id}:${tag}`);
  // Source review dates are checked once the page is in the browser, so the server and the browser draw the same thing first.
  const hydrated = useHydrated();
  const today = hydrated ? new Date().toISOString().slice(0, 10) : "2000-01-01";
  const problems = scenarioProblems(b);
  const srcProblems = sourceProblems(b, today);
  const signed = pivotApproved(b);
  const paths = problems.length ? [] : b.paths.map((p) => ({ p, r: playPath(b, p) }));
  const json = (label: string, key: keyof DischargeData, check: (v: unknown) => boolean) => (
    <JsonEdit label={label} value={b[key]} check={check} onApply={(v) => set((x) => void Object.assign(x, { [key]: v }))} />
  );
  return (
    <div className="w-full rounded-3xl border border-line-strong bg-surface p-5 shadow-sm sm:p-7">
      <p className="mb-2 flex items-center gap-2 font-mulish text-sm font-extrabold uppercase tracking-[0.12em] text-accent">
        <Icon name="clipboard" className="size-5" /> 72-Hour Discharge Pivot
      </p>
      <p role="status" className={cx("rounded-2xl px-4 py-3 text-sm font-semibold", signed && !problems.length && !srcProblems.length ? okTone : warnTone)}>
        {problems.length
          ? `The scenario check finds ${problems.length} ${problems.length === 1 ? "problem" : "problems"} (below). It can’t be published until it passes.`
          : srcProblems.length
            ? `The scenario check passes, but ${srcProblems.length} ${srcProblems.length === 1 ? "source holds" : "sources hold"} publishing: placeholders for Trilogy Care’s own procedures, or sources under review.`
            : signed
              ? "The scenario check passes, its sources are current and the sign-off is recorded: this block can be published."
              : "A draft: the scenario check passes, but it can’t be published until every reviewer’s sign-off is recorded below."}
      </p>
      <p className="mt-2 text-sm text-ink-muted">
        Fictional data only. Nothing a learner does books a service, messages a hospital or family, orders equipment, submits a review, makes a claim or changes
        a record. A score is practice evidence, not proof a real discharge was safe.
      </p>

      <div className="mt-3 grid gap-3 sm:grid-cols-2">
        <Field label="Start from a scenario">
          <select
            className={input}
            value=""
            onChange={(e) => {
              const c = DISCHARGE_CASES.find((x) => x.id === e.target.value);
              if (c && window.confirm(`Replace this block with “${c.label}”? What’s written here now is replaced.`))
                set((x) => void Object.assign(x, structuredClone(c.data)));
            }}
          >
            <option value="">Choose…</option>
            {DISCHARGE_CASES.map((c) => (
              <option key={c.id} value={c.id}>
                {c.label}
              </option>
            ))}
          </select>
        </Field>
        <Field
          label="Scenario version"
          hint="Change it whenever the story, alerts, cards, gates or feedback change: every attempt freezes the version it used."
        >
          <input className={input} value={b.scenarioVersion} onChange={(e) => set((x) => void (x.scenarioVersion = e.target.value), "version")} />
        </Field>
        <Field label="Title">
          <input className={input} value={b.title} onChange={(e) => set((x) => void (x.title = e.target.value), "title")} />
        </Field>
        <Field label="Introduction">
          <textarea className={cx(input, "min-h-16 py-2")} value={b.intro} onChange={(e) => set((x) => void (x.intro = e.target.value), "intro")} />
        </Field>
        <Field label="Mode" hint="Formative by default. Assessed uses the pass mark below, and any critical error prevents a pass.">
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
        <Field label="Participant (a library character)" hint="Use a name already in the character library, so publishing doesn’t queue a new portrait.">
          <input className={input} value={b.participant.name} onChange={(e) => set((x) => void (x.participant.name = e.target.value), "pname")} />
        </Field>
        <Field label="About them">
          <textarea
            className={cx(input, "min-h-16 py-2")}
            value={b.participant.about}
            onChange={(e) => set((x) => void (x.participant.about = e.target.value), "pabout")}
          />
        </Field>
        <Field label="Who decides">
          <input className={input} value={b.decisionMaker} onChange={(e) => set((x) => void (x.decisionMaker = e.target.value), "decides")} />
        </Field>
        <Field
          label="Supporter’s name and relation"
          hint="Registered supporter, substitute decision-maker, or a relative who’s simply involved: say which below."
        >
          <div className="flex gap-2">
            <input
              className={input}
              value={b.supporter.name}
              onChange={(e) => set((x) => void (x.supporter.name = e.target.value), "sname")}
              aria-label="Supporter’s name"
            />
            <input
              className={input}
              value={b.supporter.relation}
              onChange={(e) => set((x) => void (x.supporter.relation = e.target.value), "srel")}
              aria-label="Supporter’s relation"
            />
          </div>
        </Field>
        <Field label="Supporter’s status">
          <input className={input} value={b.supporter.status} onChange={(e) => set((x) => void (x.supporter.status = e.target.value), "sstatus")} />
        </Field>
        <Field label="Story clock: starts" hint="Minute 0 of the story.">
          <div className="flex gap-2">
            <select className={input} value={b.clock.startDay} onChange={(e) => set((x) => void (x.clock.startDay = e.target.value))} aria-label="Start day">
              {["Monday", "Tuesday", "Wednesday", "Thursday", "Friday", "Saturday", "Sunday"].map((d) => (
                <option key={d}>{d}</option>
              ))}
            </select>
            <input
              type="time"
              className={input}
              value={b.clock.startTime}
              onChange={(e) => set((x) => void (x.clock.startTime = e.target.value))}
              aria-label="Start time"
            />
          </div>
        </Field>
        <Field
          label="Proposed discharge (story minutes from the start)"
          hint="The desk closes then. It’s the hospital’s decision point, not a programme deadline."
        >
          <input
            className={input}
            inputMode="numeric"
            value={b.clock.discharge}
            onChange={(e) => set((x) => void (x.clock.discharge = Math.max(1, Math.floor(Number(e.target.value) || 1))), "discharge")}
          />
        </Field>
        <Field label="What the learner is told about the discharge time">
          <input className={input} value={b.clock.dischargeText} onChange={(e) => set((x) => void (x.clock.dischargeText = e.target.value), "dtext")} />
        </Field>
        <Field label="Job Aid after the debrief" hint="Shown with a Save to Favourites action. Learners don’t see it until its first release is approved.">
          <select className={input} value={b.jobAid.snippetId} onChange={(e) => set((x) => void (x.jobAid.snippetId = e.target.value))}>
            <option value="">None</option>
            {SEED_SNIPPETS.map((s) => (
              <option key={s.id} value={s.id}>
                {s.data.title}
              </option>
            ))}
          </select>
        </Field>
        <Field label="Why the Job Aid belongs here">
          <input className={input} value={b.jobAid.why} onChange={(e) => set((x) => void (x.jobAid.why = e.target.value), "jawhy")} />
        </Field>
      </div>

      <section className={cx(group, "mt-4")}>
        <h4 className="font-semibold">The scenario (advanced)</h4>
        <p className="text-sm text-ink-muted">
          A learner’s own card can only set a field to requested, pending, recorded or agreed. Only an alert from a verified source can confirm, approve, book
          or deliver anything. The check below enforces it.
        </p>
        {json("Handover record fields", "facts", isArr)}
        {json("Alerts (source, reliability, access, release conditions, effects)", "alerts", isArr)}
        {json("Action cards (owner, dependency, time, effects, codes, feedback, source)", "actions", isArr)}
        {json("Readiness gates", "gates", isArr)}
        {json("Handover questions", "questions", isArr)}
        {json("Rubric criteria by dimension", "rubric", isObj)}
        {json("Endings", "endings", isObj)}
        {json("The essential-service gap and the note on order", "gap", isObj)}
        {json("Retry variations", "variations", isArr)}
        {json("Authored paths (the branch preview)", "paths", isArr)}
        <Field label="Why it matters (debrief)">
          <textarea className={cx(input, "min-h-20 py-2")} value={b.debrief} onChange={(e) => set((x) => void (x.debrief = e.target.value), "debrief")} />
        </Field>
      </section>

      <section className={cx(group, "mt-4")}>
        <h4 className="font-semibold">Scenario check and branch preview</h4>
        {problems.length ? (
          <ul className="list-disc pl-5 text-sm">
            {problems.map((x) => (
              <li key={x}>{x}</li>
            ))}
          </ul>
        ) : (
          <>
            <p className="text-sm">
              Passes: every reference resolves, every card and alert can come up, no card can confirm a service, and each authored path ends where it says.
            </p>
            <ul className="flex flex-col gap-2 text-sm">
              {paths.map(({ p, r }) => (
                <li key={p.id} className="rounded-xl bg-surface p-2 ring-1 ring-line">
                  <p className="font-semibold">{p.label}</p>
                  <p>
                    {p.mode === "untimed" ? "Untimed" : "Timed"}
                    {p.variation ? `, variation “${b.variations.find((v) => v.id === p.variation)?.label ?? p.variation}”` : ""}: {ENDINGS[r.debrief.ending]} ·{" "}
                    {r.debrief.score}/{MAX_SCORE}
                    {r.debrief.critical.length ? ` · critical: ${r.debrief.critical.map((c) => c.label.toLowerCase()).join("; ")}` : ""}
                    {` · ${r.debrief.finishedAt}, ${r.state.taken.length} decisions`}
                  </p>
                </li>
              ))}
            </ul>
          </>
        )}
      </section>

      <details className={cx(group, "mt-4")}>
        <summary className="cursor-pointer font-semibold">Reviewer view: each claim beside its source, and which choices are critical errors</summary>
        <div className="overflow-x-auto">
          <table className="w-full min-w-[44rem] text-left text-sm">
            <thead>
              <tr className="border-b border-line-strong">
                <th className="py-1 pr-2">Where</th>
                <th className="py-1 pr-2">Text and feedback</th>
                <th className="py-1 pr-2">Codes</th>
                <th className="py-1">Source</th>
              </tr>
            </thead>
            <tbody>
              {b.alerts.map((a) => (
                <tr key={a.id} className="border-b border-line align-top">
                  <td className="py-1 pr-2">Alert · {RELIABILITY[a.reliability]}</td>
                  <td className="py-1 pr-2">
                    <span className="font-semibold">{a.from}</span>
                    <span className="block text-ink-muted">{a.body}</span>
                  </td>
                  <td className="py-1 pr-2">{a.confirms ? "Confirms a service" : "—"}</td>
                  <td className="py-1">{dischargeSource(a.source)?.title ?? (a.source || "—")}</td>
                </tr>
              ))}
              {b.actions.map((a) => (
                <tr key={a.id} className="border-b border-line align-top">
                  <td className="py-1 pr-2">Card · {LANES[a.lane]}</td>
                  <td className="py-1 pr-2">
                    <span className="font-semibold">{a.label}</span>
                    <span className="block text-ink-muted">{a.feedback || "No feedback yet"}</span>
                  </td>
                  <td className="py-1 pr-2">{a.codes.map((c) => (CRITICAL.includes(c) ? `Critical: ${CODES[c]}` : CODES[c])).join("; ") || "None"}</td>
                  <td className="py-1">{dischargeSource(a.source)?.title ?? (a.source || "—")}</td>
                </tr>
              ))}
              {b.gates.map((g) => (
                <tr key={g.id} className="border-b border-line align-top">
                  <td className="py-1 pr-2">Gate{g.essential ? " (essential)" : ""}</td>
                  <td className="py-1 pr-2">{g.label}</td>
                  <td className="py-1 pr-2">—</td>
                  <td className="py-1">{dischargeSource(g.source)?.title ?? (g.source || "—")}</td>
                </tr>
              ))}
              {b.questions.flatMap((q) =>
                q.options.map((o) => (
                  <tr key={`${q.id}-${o.id}`} className="border-b border-line align-top">
                    <td className="py-1 pr-2">Handover question</td>
                    <td className="py-1 pr-2">
                      <span className="font-semibold">{o.text}</span>
                      <span className="block text-ink-muted">{o.feedback}</span>
                    </td>
                    <td className="py-1 pr-2">{o.codes.map((c) => (CRITICAL.includes(c) ? `Critical: ${CODES[c]}` : CODES[c])).join("; ") || "None"}</td>
                    <td className="py-1">—</td>
                  </tr>
                )),
              )}
            </tbody>
          </table>
        </div>
        <p className="text-sm">
          Rubric: {Object.values(DIMENSIONS).join(", ")}, 0 to 3 each. Critical errors (no pass in assessed mode):{" "}
          {CRITICAL.map((c) => CODES[c].toLowerCase()).join("; ")}.
        </p>
      </details>

      <section className={cx(group, "mt-4")}>
        <h4 className="font-semibold">Sources</h4>
        <ul className="flex flex-col gap-1 text-sm">
          {sourcesOf(b).map((id) => {
            const s = dischargeSource(id);
            const st = dischargeSourceStatus(id, today);
            return (
              <li key={id}>
                <span className="font-semibold">{s?.title ?? id}</span>
                {s?.owner ? ` · owner: ${s.owner}` : ""} · {s?.placeholder ? "placeholder: replace before publishing" : st.replace("-", " ")}
                {s?.checked ? ` · checked ${s.checked}` : ""}
              </li>
            );
          })}
        </ul>
        {srcProblems.length > 0 && (
          <ul className="list-disc pl-5 text-sm">
            {srcProblems.map((x) => (
              <li key={x}>{x}</li>
            ))}
          </ul>
        )}
      </section>

      <section className={cx(group, "mt-4")}>
        <h4 className="font-semibold">Why this block (selection rationale)</h4>
        <p className="text-sm text-ink-muted">Recorded with the scenario version. Accept it, edit it, or reject it if a simulation isn’t the right fix.</p>
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
              onChange={(e) => set((x) => void (x.rationale.decision = e.target.value as DischargeData["rationale"]["decision"]))}
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
        <h4 className="font-semibold">AI assistance (not available in this release)</h4>
        <p className="text-sm text-ink-muted">
          Later, AI may draft fictional dialogue for Dot or Fiona, suggest a branch, spot missing handover fields or draft plain-language feedback from approved
          sources, for an author to review. It will never make a clinical assessment, invent a wound-care order, decide fitness for discharge, classify a
          pathway as approved, change the scenario’s state or decide a pass. The deterministic scenario and rubric above govern every consequence, and approved
          feedback works without it.
        </p>
        <div className="flex flex-wrap gap-2">
          <button type="button" disabled className="inline-flex min-h-11 items-center rounded-full border border-line-strong px-4 font-semibold opacity-60">
            Draft character dialogue
          </button>
          <button type="button" disabled className="inline-flex min-h-11 items-center rounded-full border border-line-strong px-4 font-semibold opacity-60">
            Suggest a branch
          </button>
        </div>
      </section>

      <section className={cx(group, "mt-4")}>
        <h4 className="font-semibold">Sign-off</h4>
        <p className="text-sm text-ink-muted">
          Clinical governance/Quality verify every clinical line and critical error; Care Partner operations the workflow and contacts; the Support at Home
          policy owner the funding and pathway statements; the process owner the discharge and escalation route; a learning reviewer the rubric and
          accessibility.
        </p>
        <div className="grid gap-3 sm:grid-cols-2">
          {SIGNOFF.map(([k, label]) => (
            <Field key={k} label={label}>
              <input className={input} value={b.approval[k]} onChange={(e) => set((x) => void (x.approval[k] = e.target.value), `ap-${k}`)} />
            </Field>
          ))}
          <Field label="Scenario version reviewed" hint={`It must match the block’s (${b.scenarioVersion || "none yet"}).`}>
            <input
              className={input}
              value={b.approval.scenarioReviewed}
              onChange={(e) => set((x) => void (x.approval.scenarioReviewed = e.target.value.trim()), "ap-scenario")}
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
