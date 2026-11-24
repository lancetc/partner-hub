"use client";

import { cx } from "@/lib/format";
import type { CoverageBlock } from "@/lib/magazine";
import { caseProblems, labApproved, updatedInputs, type CoverageLabData } from "@/lib/coverageLab";
import {
  calculate,
  CAPABILITIES,
  fmtUnits,
  SERVICE_HINTS,
  SERVICE_ORDER,
  SERVICES,
  STATE_HINTS,
  STATE_ORDER,
  SUPPLY_STATES,
  TAXONOMY_VERSION,
  validateInputs,
} from "@/lib/suburbCoverage";
import { COVERAGE_CASES } from "@/content/coverageCases";
import { Field, input } from "./ui";
import { JsonEdit } from "./MagazineIntakeEdit";
import type { Update } from "./MagazineEditParts";
import { Icon } from "../Icon";

/*
  The editor for a Local Coverage Comparison block ("Is this suburb ready for growth?", docs/suburb-growth.md). The
  frame has plain fields; the story, the areas, needs and supply, the cards, the decisions, the explanations, the
  story update and the follow-up each have an advanced JSON edit, as the growth readiness and Workload Lens editors do,
  because the case is easier to inspect as text than as a hundred small inputs. The service taxonomy and supply states
  are shared and versioned (standing in for the Contractor Network Builder's): shown here for reference, never
  rewritten for an article. The case check lists anything that would mislead a learner. The AI selection rationale
  (PRD section 11) is recorded and versioned with the story, and the author accepts, edits or rejects it. Nothing here
  is generated. Use Preview to play it.
*/

const group = "flex flex-col gap-3 rounded-2xl bg-muted p-3";
const SIGNOFF: [keyof CoverageLabData["approval"], string][] = [
  ["owner", "Owner (Partner Enablement)"],
  ["operations", "Care Partner Operations (service and escalation logic)"],
  ["onboarding", "Supplier onboarding (readiness states)"],
  ["quality", "Quality / clinical governance (continuity and escalation)"],
  ["partnerships", "Partnerships (business wording)"],
  ["policy", "Policy owner (regulatory claims)"],
  ["privacy", "Privacy and security (aggregate data, small cells)"],
  ["pilot", "Pilot group of Care Partner principals"],
];
const RATIONALE: [Exclude<keyof CoverageLabData["rationale"], "decision">, string, string][] = [
  ["theme", "Verified problem", "What was seen (repeated delayed starts, local no-shows, referrals outpacing supply), and where it came from."],
  ["themeOwner", "Problem owner", "Who owns that evidence."],
  ["audience", "Audience", ""],
  ["behaviour", "Target behaviour", ""],
  ["whyFit", "Why a multi-area comparison fits", ""],
  ["reuse", "Related content to reuse", ""],
  ["systemFix", "Alternative process actions also needed", "An article can’t fix a stale supplier register or invisible approval states."],
  [
    "measure",
    "Linked scored outcomes and work data (owned separately)",
    "Approved unfilled units by area and time, time to first suitable visit, backup coverage.",
  ],
];

export function CoverageEdit({ block: b, update }: { block: CoverageBlock; update: Update }) {
  const set = (fn: (x: CoverageBlock) => void, tag?: string) => update<CoverageBlock>(b.id, fn, tag && `${b.id}:${tag}`);
  const problems = caseProblems(b);
  const signed = labApproved(b);
  const r = validateInputs(b.inputs).length ? null : calculate(b.inputs);
  const after = validateInputs(updatedInputs(b)).length ? null : calculate(updatedInputs(b));
  return (
    <div className="w-full rounded-3xl border border-line-strong bg-surface p-5 shadow-sm sm:p-7">
      <p className="mb-2 flex items-center gap-2 font-mulish text-sm font-extrabold uppercase tracking-[0.12em] text-accent">
        <Icon name="pin" className="size-5" /> Local Coverage Comparison
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
              const c = COVERAGE_CASES.find((x) => x.id === e.target.value);
              if (c && window.confirm(`Replace this block with “${c.label}”? What’s written here now is replaced.`))
                set((x) => void Object.assign(x, structuredClone(c.data)));
            }}
          >
            <option value="">Choose…</option>
            {COVERAGE_CASES.map((c) => (
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
          <ul className="list-disc pl-5 text-sm">
            {r.cells.map((c) => (
              <li key={c.id}>
                {c.label}: {fmtUnits(c.gap, c.unit)} current gap, {fmtUnits(c.spare, c.unit)} usable spare ({c.status === "gap" ? "a current gap" : c.status})
                {after && after.cells.find((x) => x.id === c.id)?.gap !== c.gap
                  ? `; after the story update, ${fmtUnits(after.cells.find((x) => x.id === c.id)!.gap, c.unit)}`
                  : ""}
                .
              </li>
            ))}
          </ul>
        ) : (
          <p className="text-sm">The figures don’t validate yet, so there’s no result.</p>
        )}
        <JsonEdit
          label="Story (principal, situation, Ava’s transmission, a client voice, the fragile plan and its absent worker, dilemma)"
          value={b.story}
          onApply={(v) => set((x) => void (x.story = v as CoverageLabData["story"]))}
          check={(v) => isObj(v)}
        />
        <JsonEdit
          label="Areas, needs and supply (as-of date, horizon, freshness rule, lead time; fictional areas; needs by service and window; supply rows with state and availability)"
          value={b.inputs}
          onApply={(v) => set((x) => void (x.inputs = v as CoverageLabData["inputs"]))}
          check={(v) => isObj(v) && Array.isArray((v as Record<string, unknown>).demand)}
        />
        <JsonEdit
          label="Prediction (prompt, options; likely: true marks what the comparison shows)"
          value={b.prediction}
          onApply={(v) => set((x) => void (x.prediction = v as CoverageLabData["prediction"]))}
          check={(v) => isObj(v)}
        />
        <JsonEdit
          label="Supply cards to tag (each names a supply row and a need; the answer is the model’s own reading)"
          value={b.cards}
          onApply={(v) => set((x) => void (x.cards = v as CoverageLabData["cards"]))}
          check={Array.isArray}
        />
        <JsonEdit
          label="Immediate actions (with feedback, outcome, levels and flags)"
          value={b.immediate}
          onApply={(v) => set((x) => void (x.immediate = v as CoverageLabData["immediate"]))}
          check={Array.isArray}
        />
        <JsonEdit
          label="Network priorities (with feedback, outcome, levels and flags)"
          value={b.network}
          onApply={(v) => set((x) => void (x.network = v as CoverageLabData["network"]))}
          check={Array.isArray}
        />
        <JsonEdit
          label="Evidence explanations (with feedback, levels and flags)"
          value={b.explanations}
          onApply={(v) => set((x) => void (x.explanations = v as CoverageLabData["explanations"]))}
          check={Array.isArray}
        />
        <JsonEdit
          label="Story update (title, text, as-of date, supply rows it replaces or adds)"
          value={b.update}
          onApply={(v) => set((x) => void (x.update = v as CoverageLabData["update"]))}
          check={(v) => isObj(v) && Array.isArray((v as Record<string, unknown>).supply)}
        />
        <JsonEdit
          label="Follow-up (prompt, options with feedback, levels and flags)"
          value={b.followUp}
          onApply={(v) => set((x) => void (x.followUp = v as CoverageLabData["followUp"]))}
          check={(v) => isObj(v)}
        />
        <JsonEdit
          label="Links (Can we take on the next 10 clients? and other articles)"
          value={b.links}
          onApply={(v) => set((x) => void (x.links = v as CoverageLabData["links"]))}
          check={Array.isArray}
        />
        <JsonEdit label="Sources" value={b.sources} onApply={(v) => set((x) => void (x.sources = v as CoverageLabData["sources"]))} check={Array.isArray} />
        <div className="grid gap-3 sm:grid-cols-2">
          <Field label="Next step: label" hint="The Contractor Network Builder Work Tool isn’t in the Hub yet: it shows as a labelled placeholder.">
            <input className={input} value={b.handoff.label} onChange={(e) => set((x) => void (x.handoff.label = e.target.value), "handoff-label")} />
          </Field>
          <Field label="Next step: note">
            <textarea
              className={cx(input, "min-h-20 py-2")}
              value={b.handoff.note}
              onChange={(e) => set((x) => void (x.handoff.note = e.target.value), "handoff-note")}
            />
          </Field>
        </div>
        <Field label="Debrief summary" hint="Shown once the learner’s decisions are in.">
          <textarea className={cx(input, "min-h-24 py-2")} value={b.debrief} onChange={(e) => set((x) => void (x.debrief = e.target.value), "debrief")} />
        </Field>
      </section>

      <details className={cx(group, "mt-4")}>
        <summary className="cursor-pointer font-semibold">
          The shared service taxonomy and supply states ({b.taxonomyVersion || TAXONOMY_VERSION})
          {b.taxonomyVersion !== TAXONOMY_VERSION && " · the case uses an earlier version"}
        </summary>
        <p className="text-sm text-ink-muted">
          Every Local Coverage block uses the same services, capabilities and supply states, so a state means the same thing across articles. They stand in for
          the Contractor Network Builder’s, which isn’t in the Hub yet. To change one, change the taxonomy (with a reviewed definition) and its version, not
          this article.
        </p>
        <dl className="grid gap-2 text-sm sm:grid-cols-2">
          {SERVICE_ORDER.map((s) => (
            <div key={s}>
              <dt className="font-semibold">{SERVICES[s]}</dt>
              <dd className="text-ink-muted">{SERVICE_HINTS[s]}</dd>
            </div>
          ))}
        </dl>
        <p className="text-sm">
          <strong>Capabilities:</strong> {Object.values(CAPABILITIES).join(", ")}.
        </p>
        <dl className="grid gap-2 text-sm sm:grid-cols-2">
          {STATE_ORDER.map((s) => (
            <div key={s}>
              <dt className="font-semibold">{SUPPLY_STATES[s]}</dt>
              <dd className="text-ink-muted">{STATE_HINTS[s]}</dd>
            </div>
          ))}
        </dl>
      </details>

      <section className={cx(group, "mt-4")}>
        <h4 className="font-semibold">Why this block (selection rationale)</h4>
        <p className="text-sm text-ink-muted">
          Recorded with the story version. Accept it, edit it, or reject it if a multi-area comparison isn’t the right fix. It never replaces the operational
          measure.
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
              onChange={(e) => set((x) => void (x.rationale.decision = e.target.value as CoverageLabData["rationale"]["decision"]))}
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
            Passes: the figures validate (and still do after the story update), there’s a current gap to act on and some cover to set it against, the cards span
            at least three supply readings, and there’s a strong, unflagged answer for each choice.
          </p>
        )}
      </section>

      <section className={cx(group, "mt-4")}>
        <h4 className="font-semibold">Sign-off</h4>
        <p className="text-sm text-ink-muted">
          Partner Enablement drafts; Quality/Operations approve the service and escalation logic, supplier onboarding the readiness states, Partnerships the
          business wording and the policy owner any regulatory claim; then the Hub owner publishes a version.
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
