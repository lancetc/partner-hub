"use client";

import { cx } from "@/lib/format";
import type { NetworkBlock } from "@/lib/magazine";
import { benchApproved, caseProblems, CODES, CRITICAL, inputsAt, MAX_SCORE, totals, type NetworkData } from "@/lib/networkBench";
import { calculate } from "@/lib/suburbCoverage";
import { NETWORK_CASES } from "@/content/networkCases";
import { SEED_SNIPPETS } from "@/content/playbooks";
import { Field, input } from "./ui";
import { JsonEdit } from "./MagazineIntakeEdit";
import type { Update } from "./MagazineEditParts";
import { Icon } from "../Icon";

/*
  The editor for a Build Your Local Bench block (docs/network-builder.md). Plain fields for the frame (title, story,
  mode, Job Aid, rationale, sign-off); JSON edits for the case itself (the Local Coverage inputs, the cards' evidence,
  the decisions, the reveal, the requirement profiles, the outreach template, the scorecard and the branches), as the
  sibling labs' editors do.

  The case check runs as you type, and the branch table plays every branch through the same coverage model: the gap
  as written, after the reveal, and in each variation (the chosen worker approved or declined, stale availability, no
  suitable supplier, a quality concern). The Preview plays any branch. Nothing here is generated: AI drafting is a
  disabled stub in this release, and a scenario never reads a real supplier, worker or participant record.
*/

const group = "flex flex-col gap-3 rounded-2xl bg-muted p-3";
const okTone = "bg-[#e3f4ea] text-[#0f5b3a] dark:bg-[#12392a] dark:text-[#8fe0b5]";
const warnTone = "bg-[#fff1cc] text-[#4a3400] dark:bg-[#3d2f08] dark:text-[#ffd97a]";
const SIGNOFF: [Exclude<keyof NetworkData["approval"], "approvedOn" | "reviewBy" | "scenarioReviewed">, string][] = [
  ["owner", "Owner (Partner Enablement)"],
  ["operations", "Operations (process, contingency and start rules)"],
  ["onboarding", "Supplier and contractor onboarding owner (pipeline states and checklists)"],
  ["quality", "Quality and worker screening, with clinical governance for regulated roles"],
  ["partnerships", "Partnerships (role labels, co-branding and outreach)"],
  ["finance", "Finance / procurement (rate and price language)"],
  ["privacy", "Privacy / security (contact data, scorecard visibility)"],
  ["learning", "Learning reviewer (rubric and accessibility)"],
];
const RATIONALE: [Exclude<keyof NetworkData["rationale"], "decision">, string, string][] = [
  ["signal", "Problem signal", "From verified complaints or operational data. Never copy a participant’s or contractor’s details here."],
  ["behaviour", "Target behaviour", ""],
  ["evidence", "Evidence quality", ""],
  ["whyFit", "Why this block", ""],
  ["existing", "Existing relevant content", ""],
  ["systemFix", "Non-learning fixes", "A slow verification queue or an unclear supplier agreement needs a process fix, not more leads."],
  ["owner", "Owner", ""],
  ["measure", "Outcome measure (owned separately)", "Denominator, baseline and review date. Never inferred from completion."],
];
const isArr = (v: unknown) => Array.isArray(v);
const isObj = (v: unknown) => Boolean(v) && typeof v === "object" && !Array.isArray(v);

export function NetworkEdit({ block: b, update }: { block: NetworkBlock; update: Update }) {
  const set = (fn: (x: NetworkBlock) => void, tag?: string) => update<NetworkBlock>(b.id, fn, tag && `${b.id}:${tag}`);
  const problems = caseProblems(b);
  const signed = benchApproved(b);
  const branches = problems.length
    ? []
    : [{ id: "", label: "As written" }, ...b.variations.map((v) => ({ id: v.id, label: v.label }))].map((v) => ({
        ...v,
        before: totals(calculate(b.inputs)),
        after: totals(calculate(inputsAt(b, { variation: v.id }, true))),
        endings: [...new Set(b.steps.flatMap((s) => s.options.filter((o) => o.ending && (!o.only || o.only === v.id)).map((o) => o.ending!)))],
      }));
  const json = (label: string, key: keyof NetworkData, check: (v: unknown) => boolean) => (
    <JsonEdit label={label} value={b[key]} check={check} onApply={(v) => set((x) => void Object.assign(x, { [key]: v }))} />
  );
  return (
    <div className="w-full rounded-3xl border border-line-strong bg-surface p-5 shadow-sm sm:p-7">
      <p className="mb-2 flex items-center gap-2 font-mulish text-sm font-extrabold uppercase tracking-[0.12em] text-accent">
        <Icon name="people" className="size-5" /> Build Your Local Bench
      </p>
      <p role="status" className={cx("rounded-2xl px-4 py-3 text-sm font-semibold", signed && !problems.length ? okTone : warnTone)}>
        {problems.length
          ? `The case check finds ${problems.length} ${problems.length === 1 ? "problem" : "problems"} (below). It can’t be published until it passes.`
          : signed
            ? "The case check passes and the sign-off is recorded."
            : "A draft: the case check passes, but it can’t be published until every reviewer’s sign-off is recorded below."}
      </p>
      <p className="mt-2 text-sm text-ink-muted">
        Fictional data only. Nothing a learner does approves a contractor, sends a message, books a service or changes a supplier record. A score is practice
        evidence, not proof of real coverage. Editing the case never shows a real supplier’s screening record: the case holds only what’s typed here.
      </p>

      <div className="mt-3 grid gap-3 sm:grid-cols-2">
        <Field label="Start from a case">
          <select
            className={input}
            value=""
            onChange={(e) => {
              const c = NETWORK_CASES.find((x) => x.id === e.target.value);
              if (c && window.confirm(`Replace this block with “${c.label}”? What’s written here now is replaced.`))
                set((x) => void Object.assign(x, structuredClone(c.data)));
            }}
          >
            <option value="">Choose…</option>
            {NETWORK_CASES.map((c) => (
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
        <Field label="The principal (a library character)" hint="Use a name already in the character library, so publishing doesn’t queue a new portrait.">
          <input className={input} value={b.story.character} onChange={(e) => set((x) => void (x.story.character = e.target.value), "char")} />
        </Field>
        <Field label="Their role">
          <input className={input} value={b.story.role} onChange={(e) => set((x) => void (x.story.role = e.target.value), "role")} />
        </Field>
        <Field label="The situation">
          <textarea
            className={cx(input, "min-h-24 py-2")}
            value={b.story.situation}
            onChange={(e) => set((x) => void (x.story.situation = e.target.value), "sit")}
          />
        </Field>
        <Field label="The dilemma">
          <input className={input} value={b.story.dilemma} onChange={(e) => set((x) => void (x.story.dilemma = e.target.value), "dil")} />
        </Field>
        <Field label="The map’s headline" hint="The tempting count the case starts with.">
          <input className={input} value={b.headline} onChange={(e) => set((x) => void (x.headline = e.target.value), "head")} />
        </Field>
        <Field
          label="Job Aid in the outreach kit and the debrief"
          hint="Shown with a Save to Favourites action. Learners don’t see it until its first release is approved."
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
          Demand and supply are Local Coverage inputs, and each card’s evidence uses the Contractor Vetting Card’s checks and states. An approved card needs
          every required check resolved; the check below enforces it.
        </p>
        {json("Need slots, supply rows and areas (Local Coverage inputs)", "inputs", isObj)}
        {json("Contractor cards (arrangement, profile, evidence, scope, claim, travel)", "cards", isArr)}
        {json("Participant labels outreach must never carry", "people", isArr)}
        {json("Decisions (phase, prompt, options with levels, codes, endings)", "steps", isArr)}
        {json("The second reveal", "later", isObj)}
        {json("Role requirement profiles (the checklists)", "profiles", isArr)}
        {json("Outreach template (locked claims and local fields)", "outreach", isObj)}
        {json("Quality scorecard", "scorecard", isObj)}
        {json("Branches (retry variations)", "variations", isArr)}
        {json("Endings", "endings", isObj)}
        {json("Related links", "related", isArr)}
        <Field label="Why it matters (debrief)">
          <textarea className={cx(input, "min-h-20 py-2")} value={b.debrief} onChange={(e) => set((x) => void (x.debrief = e.target.value), "debrief")} />
        </Field>
      </section>

      <section className={cx(group, "mt-4")}>
        <h4 className="font-semibold">Case check and branch table</h4>
        {problems.length ? (
          <ul className="list-disc pl-5 text-sm">
            {problems.map((x) => (
              <li key={x}>{x}</li>
            ))}
          </ul>
        ) : (
          <div className="overflow-x-auto">
            <table className="w-full text-left text-sm">
              <caption className="text-left text-ink-muted">Every branch through the coverage model (hours a week). Use Preview to play one.</caption>
              <thead>
                <tr className="border-b border-line">
                  <th scope="col" className="py-1 pr-2">
                    Branch
                  </th>
                  <th scope="col" className="py-1 pr-2">
                    Unfilled at the start
                  </th>
                  <th scope="col" className="py-1 pr-2">
                    Still unfilled after the reveal
                  </th>
                  <th scope="col" className="py-1">
                    Endings it can reach
                  </th>
                </tr>
              </thead>
              <tbody>
                {branches.map((r) => (
                  <tr key={r.id || "base"} className="border-b border-line">
                    <th scope="row" className="py-1 pr-2">
                      {r.label}
                    </th>
                    <td className="py-1 pr-2">{r.before.gap}</td>
                    <td className="py-1 pr-2">{r.after.gap}</td>
                    <td className="py-1">{r.endings.join(", ")}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
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
                  ) as NetworkData["rationale"]["decision"]),
              )
            }
          >
            <option value="">Not decided</option>
            <option value="accepted">Accepted</option>
            <option value="edited">Accepted with edits</option>
            <option value="rejected">Rejected</option>
          </select>
        </Field>
        <p className="text-sm text-ink-muted">
          AI drafting of outreach copy or explanations: off in this release (no paid calls). Everything here is written by a person.
        </p>
      </section>

      <section className={cx(group, "mt-4")}>
        <h4 className="font-semibold">Sign-off</h4>
        <p className="text-sm text-ink-muted">
          It can’t be published until each reviewer is recorded, with the date and the scenario version they reviewed. The checklist profiles need their own
          review dates, and the outreach template its approval.
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
