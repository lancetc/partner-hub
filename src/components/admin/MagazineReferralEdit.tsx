"use client";

import { cx } from "@/lib/format";
import type { ReferralBlock } from "@/lib/magazine";
import { caseProblems, labApproved, updatedInputs, type ReferralLabData } from "@/lib/referralLab";
import {
  calculate,
  EVENTS,
  periodLabel,
  SOURCE_HINTS,
  SOURCE_ORDER,
  SOURCES,
  STAGE_HINTS,
  STAGE_MODEL_VERSION,
  STAGE_ORDER,
  STAGES,
  validateInputs,
} from "@/lib/referralJourney";
import { REFERRAL_CASES } from "@/content/referralCases";
import { Field, input } from "./ui";
import { JsonEdit } from "./MagazineIntakeEdit";
import type { Update } from "./MagazineEditParts";
import { Icon } from "../Icon";

/*
  The editor for a Referral Journey Calculator block ("Which referrals become active clients?",
  docs/referral-journey.md). The frame has plain fields; the story, the enquiries and effort, the stage cards, each
  question, the actions, the conclusions and the return visit each have an advanced JSON edit, as the growth
  readiness, Workload Lens and Local Coverage editors do, because a cohort is easier to inspect as text than as a
  hundred small inputs. The stage model is shared and versioned (standing in for the Local Referral Studio's): shown
  here for reference, never rewritten for an article. The case check lists anything that would mislead a learner. The
  AI selection rationale (PRD section 10) is recorded and versioned with the story, and the author accepts, edits or
  rejects it. Nothing here is generated. Use Preview to play every stage.
*/

const group = "flex flex-col gap-3 rounded-2xl bg-muted p-3";
const SIGNOFF: [Exclude<keyof ReferralLabData["approval"], "approvedOn" | "effectiveFrom" | "reviewBy">, string][] = [
  ["owner", "Owner (Partner Enablement)"],
  ["pathway", "Referral pathway owner (stage and event definitions)"],
  ["intake", "Intake owner (stage and event definitions)"],
  ["partnerships", "Partnerships / Business Development (relationship language)"],
  ["operations", "Care Partner Operations"],
  ["quality", "Quality (urgent handoffs)"],
  ["privacy", "Privacy and security (private mode data handling)"],
  ["pilot", "Pilot group of Care Partner principals"],
];
const RATIONALE: [Exclude<keyof ReferralLabData["rationale"], "decision">, string, string][] = [
  [
    "theme",
    "Verified problem",
    "What was seen (lots of referrals but few starts, an apparently underperforming relationship, slow handoffs), and where it came from.",
  ],
  ["themeOwner", "Problem owner", "Who owns that evidence."],
  ["audience", "Audience", ""],
  ["behaviour", "Target behaviour", ""],
  ["whyFit", "Why a cohort calculator fits", ""],
  ["reuse", "Related content to reuse", ""],
  ["systemFix", "A non-learning process cause to investigate", "An article can’t fix a funding queue, an unclear consent process or a supply gap."],
  [
    "measure",
    "Linked scored learning results and operational data (owned separately)",
    "Authorised introductions, allocation-to-contact time, agreement-to-service time, starts reaching the observation point.",
  ],
];

export function ReferralEdit({ block: b, update }: { block: ReferralBlock; update: Update }) {
  const set = (fn: (x: ReferralBlock) => void, tag?: string) => update<ReferralBlock>(b.id, fn, tag && `${b.id}:${tag}`);
  const problems = caseProblems(b);
  const signed = labApproved(b);
  const ok = !validateInputs(b.inputs).length;
  const r = ok ? calculate(b.inputs, { months: b.period }) : null;
  const u = updatedInputs(b);
  const after = !validateInputs(u).length ? calculate(u, { months: b.period }) : null;
  return (
    <div className="w-full rounded-3xl border border-line-strong bg-surface p-5 shadow-sm sm:p-7">
      <p className="mb-2 flex items-center gap-2 font-mulish text-sm font-extrabold uppercase tracking-[0.12em] text-accent">
        <Icon name="route" className="size-5" /> Referral Journey Calculator
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
              const c = REFERRAL_CASES.find((x) => x.id === e.target.value);
              if (c && window.confirm(`Replace this block with “${c.label}”? What’s written here now is replaced.`))
                set((x) => void Object.assign(x, structuredClone(c.data)));
            }}
          >
            <option value="">Choose…</option>
            {REFERRAL_CASES.map((c) => (
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
        <Field label="Cohort months compared" hint="YYYY-MM, separated by commas. The return visit names its own later months.">
          <input
            className={input}
            value={b.period.join(", ")}
            onChange={(e) =>
              set(
                (x) =>
                  void (x.period = e.target.value
                    .split(/[\s,]+/)
                    .map((m) => m.trim())
                    .filter((m) => /^\d{4}-\d{2}$/.test(m))),
                "period",
              )
            }
          />
        </Field>
      </div>

      <section className={cx(group, "mt-4")}>
        <h4 className="font-semibold">The case, as written</h4>
        {r ? (
          <>
            <p className="text-sm">
              {r.period}, as of {r.asOf}: {r.all.enquiries} enquiries, {r.all.funnel.started.count} first services, {r.all.open} open. Comparison age{" "}
              {r.matureAge} days, observation point {r.observationDays} days, {r.minSample} mature enquiries to rank.
            </p>
            <ul className="list-disc pl-5 text-sm">
              {r.sources
                .filter((s) => s.enquiries > 0)
                .map((s) => {
                  const later = after?.sources.find((x) => x.source === s.source);
                  return (
                    <li key={s.source}>
                      {s.label}: {s.enquiries} {s.enquiries === 1 ? "enquiry" : "enquiries"}, first services {s.startRate.text}, relationship effort{" "}
                      {s.effort.perStart.text}, active at {s.continuity.days} days {s.continuity.rate.text}
                      {s.tooEarly ? " (too early to rank)" : ""}
                      {later && later.startRate.text !== s.startRate.text ? `; at the return visit, ${later.startRate.text}` : ""}.
                    </li>
                  );
                })}
            </ul>
            {r.warnings.length > 0 && <p className="text-sm text-ink-muted">{r.warnings.join(" ")}</p>}
          </>
        ) : (
          <p className="text-sm">The figures don’t validate yet, so there’s no result.</p>
        )}
        <JsonEdit
          label="Story (principal, situation, Ava’s optional question, the three relationships by generic label, the older person’s voice at a handoff, the dilemma)"
          value={b.story}
          onApply={(v) => set((x) => void (x.story = v as ReferralLabData["story"]))}
          check={(v) => isObj(v)}
        />
        <JsonEdit
          label="Enquiries and effort (mode “records”; as-of date; observation point; comparison age; smallest sample to rank; areas; de-identified enquiries with opaque ids, contacts, stage at first contact and event dates; effort by source and month)"
          value={b.inputs}
          onApply={(v) => set((x) => void (x.inputs = v as ReferralLabData["inputs"]))}
          check={(v) => isObj(v) && Array.isArray((v as Record<string, unknown>).records)}
        />
        <JsonEdit
          label="Prediction from enquiry counts alone (prompt, options; likely: true marks what the cohort shows)"
          value={b.prediction}
          onApply={(v) => set((x) => void (x.prediction = v as ReferralLabData["prediction"]))}
          check={(v) => isObj(v)}
        />
        <JsonEdit
          label="Stage cards (each names an enquiry; the answer is its own stage at first contact)"
          value={b.cards}
          onApply={(v) => set((x) => void (x.cards = v as ReferralLabData["cards"]))}
          check={Array.isArray}
        />
        {(
          [
            ["denominator", "The cohort funnel: the denominator question"],
            ["timing", "Time to start: reading open and delayed enquiries"],
            ["choice", "The handoff: the older person’s choice"],
            ["revise", "The revised reading"],
            ["dataPoints", "The data point that could change it"],
            ["followUp", "The return-visit question"],
          ] as const
        ).map(([k, label]) => (
          <JsonEdit
            key={k}
            label={`${label} (prompt, options with feedback, levels and flags)`}
            value={b[k]}
            onApply={(v) => set((x) => void (x[k] = v as ReferralLabData[typeof k]))}
            check={(v) => isObj(v) && Array.isArray((v as Record<string, unknown>).options)}
          />
        ))}
        <JsonEdit
          label="Relationship actions (with feedback, outcome, levels, flags and next: studio, coverage or intake)"
          value={b.relationship}
          onApply={(v) => set((x) => void (x.relationship = v as ReferralLabData["relationship"]))}
          check={Array.isArray}
        />
        <JsonEdit
          label="Operational steps (with feedback, outcome, levels, flags and next)"
          value={b.operational}
          onApply={(v) => set((x) => void (x.operational = v as ReferralLabData["operational"]))}
          check={Array.isArray}
        />
        <JsonEdit
          label="Conclusions (with feedback, levels and flags)"
          value={b.explanations}
          onApply={(v) => set((x) => void (x.explanations = v as ReferralLabData["explanations"]))}
          check={Array.isArray}
        />
        <JsonEdit
          label="Return visit (title, text, as-of date, the later cohort months, enquiries and effort rows it replaces or adds)"
          value={b.update}
          onApply={(v) => set((x) => void (x.update = v as ReferralLabData["update"]))}
          check={(v) => isObj(v) && Array.isArray((v as Record<string, unknown>).records)}
        />
        <JsonEdit
          label="Links (Is this suburb ready for growth?, Can we take on the next 10 clients?)"
          value={b.links}
          onApply={(v) => set((x) => void (x.links = v as ReferralLabData["links"]))}
          check={Array.isArray}
        />
        <JsonEdit label="Sources" value={b.sources} onApply={(v) => set((x) => void (x.sources = v as ReferralLabData["sources"]))} check={Array.isArray} />
        <div className="grid gap-3 sm:grid-cols-2">
          <Field label="Next step: label" hint="The Local Referral Studio Work Tool isn’t in the Hub yet: it shows as a labelled placeholder.">
            <input className={input} value={b.studio.label} onChange={(e) => set((x) => void (x.studio.label = e.target.value), "studio-label")} />
          </Field>
          <Field label="Next step: note">
            <textarea
              className={cx(input, "min-h-20 py-2")}
              value={b.studio.note}
              onChange={(e) => set((x) => void (x.studio.note = e.target.value), "studio-note")}
            />
          </Field>
        </div>
        <Field label="Debrief summary" hint="Shown once the learner’s decisions are in. Fictional, illustrative feedback: never a claim about real sources.">
          <textarea className={cx(input, "min-h-24 py-2")} value={b.debrief} onChange={(e) => set((x) => void (x.debrief = e.target.value), "debrief")} />
        </Field>
        {after && (
          <p className="text-xs text-ink-muted">
            Return visit: {periodLabel(b.update.period)} added, as of {b.update.asOf}.
          </p>
        )}
      </section>

      <details className={cx(group, "mt-4")}>
        <summary className="cursor-pointer font-semibold">
          The shared stage model ({b.stageModelVersion || STAGE_MODEL_VERSION})
          {b.stageModelVersion !== STAGE_MODEL_VERSION && " · the case uses an earlier version"}
        </summary>
        <p className="text-sm text-ink-muted">
          Every Referral Journey block uses the same stages, events and sources, so a stage means the same thing across articles. They stand in for the Local
          Referral Studio’s approved stage model and claim register, which isn’t in the Hub yet. The referral pathway and intake owners approve them; to change
          one, change the model (with a reviewed definition) and its version, not this article.
        </p>
        <dl className="grid gap-2 text-sm sm:grid-cols-2">
          {STAGE_ORDER.map((s) => (
            <div key={s}>
              <dt className="font-semibold">Stage at first contact: {STAGES[s]}</dt>
              <dd className="text-ink-muted">{STAGE_HINTS[s]}</dd>
            </div>
          ))}
          {Object.values(EVENTS).map((e) => (
            <div key={e.label}>
              <dt className="font-semibold">{e.label}</dt>
              <dd className="text-ink-muted">{e.hint}</dd>
            </div>
          ))}
          {SOURCE_ORDER.map((s) => (
            <div key={s}>
              <dt className="font-semibold">Source: {SOURCES[s]}</dt>
              <dd className="text-ink-muted">{SOURCE_HINTS[s]}</dd>
            </div>
          ))}
        </dl>
      </details>

      <section className={cx(group, "mt-4")}>
        <h4 className="font-semibold">Why this block (selection rationale)</h4>
        <p className="text-sm text-ink-muted">
          Recorded with the story version. Accept it, edit it, or reject it if a cohort calculator isn’t the right fix. AI may later explain verified results in
          words; it can’t invent a start, an allocation, an endorsement or a cause. It never replaces the operational measure.
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
              onChange={(e) => set((x) => void (x.rationale.decision = e.target.value as ReferralLabData["rationale"]["decision"]))}
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
            Passes: the enquiries validate (and still do at the return visit), at least two relationships differ in starting stage or have people waiting for
            funding, some starts are old enough for continuity, the cards span at least three stages, and there’s a strong, unflagged answer for each choice.
          </p>
        )}
      </section>

      <section className={cx(group, "mt-4")}>
        <h4 className="font-semibold">Sign-off</h4>
        <p className="text-sm text-ink-muted">
          Partner Enablement drafts; the referral pathway and intake owners approve the stage and event definitions, Partnerships the relationship language,
          Quality the urgent handoffs and privacy the private mode; then the Hub owner publishes a version with an effective date.
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
          <Field label="Effective from" hint="The date this version takes effect for learners.">
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
