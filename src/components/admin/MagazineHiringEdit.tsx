"use client";

import { cx } from "@/lib/format";
import type { HiringBlock } from "@/lib/magazine";
import { dollars, forecast, HORIZON, type Adjustment, type HiringOption } from "@/lib/hiringModel";
import {
  ACTIONS,
  BAND_LABELS,
  caseProblems,
  compareOptions,
  DIM_ORDER,
  DIMENSIONS,
  expectedCase,
  freshHiringLab,
  INPUTS,
  labApproved,
  modelFixturesPass,
  noneOption,
  planForecast,
  planSummary,
  type BandKey,
  type EvidenceCard,
  type FigureKey,
  type InputKey,
} from "@/lib/hiringRunway";
import { HIRING_CASES } from "@/content/hiringCases";
import { btn, Field, input } from "./ui";
import type { Update } from "./MagazineEditParts";
import { Icon } from "../Icon";

/*
  The editor for a Hiring Runway Decision Lab (docs/hiring-runway-lab.md). Every case fact, story line, evidence card,
  option, growth case, the new information, the rubric and the governance record is written here by hand; nothing is
  generated. The check panel reconciles every evidence figure with the model and shows what each option and reviewed
  plan works out to, so an author sees the exact numbers learners will. Use Preview to walk through it as a learner,
  before and after the new information.
*/

const group = "flex flex-col gap-3 rounded-2xl bg-muted p-3";
const area = cx(input, "min-h-20 py-2");
const num = (v: string) => (v.trim() === "" ? Number.NaN : Number(v));
const csv = (v: string) =>
  v
    .split(",")
    .map((x) => x.trim())
    .filter(Boolean)
    .slice(0, 30);
const FIGURE_KEYS: FigureKey[] = [
  ...(Object.keys(BAND_LABELS) as BandKey[]).flatMap((b) => [`band.${b}.count`, `band.${b}.hours`] as FigureKey[]),
  ...(Object.keys(INPUTS) as InputKey[]),
];
const figureLabel = (k: FigureKey) =>
  k.startsWith("band.") ? `${BAND_LABELS[k.split(".")[1] as BandKey]}: ${k.endsWith("count") ? "participants" : "hours each"}` : INPUTS[k as InputKey].label;
const months = (n: number) => `${n} ${n === 1 ? "month" : "months"}`;
const TOKENS = "{none.firstPressure} {window} {plan.monthsAbove} {plan.lowestCash} {plan.lowestCashMonth} {plan.operating12} {reserve} {character}";

function NumberField({
  label,
  unit,
  value,
  onChange,
  step = 1,
}: {
  label: string;
  unit?: string;
  value: number;
  onChange: (v: number) => void;
  step?: number;
}) {
  return (
    <Field label={label} hint={unit}>
      <input
        type="number"
        step={step}
        className={cx(input, !Number.isFinite(value) && "border-[#a12d31]")}
        value={Number.isFinite(value) ? value : ""}
        onChange={(e) => onChange(num(e.target.value))}
      />
    </Field>
  );
}

export function HiringLabEdit({ block: b, update }: { block: HiringBlock; update: Update }) {
  const set = (fn: (x: HiringBlock) => void, tag?: string) => update<HiringBlock>(b.id, fn, tag && `${b.id}:${tag}`);
  const problems = caseProblems(b);
  const fixtures = modelFixturesPass();
  const signed = labApproved(b);
  return (
    <div className="w-full rounded-3xl border border-line-strong bg-surface p-5 shadow-sm sm:p-7">
      <p className="mb-2 flex items-center gap-2 font-mulish text-sm font-extrabold uppercase tracking-[0.12em] text-accent">
        <Icon name="people" className="size-5" /> Hiring Runway Decision Lab
      </p>
      <p
        role="status"
        className={cx(
          "rounded-2xl px-4 py-3 text-sm font-semibold",
          signed && fixtures && !problems.length
            ? "bg-[#e3f4ea] text-[#0f5b3a] dark:bg-[#12392a] dark:text-[#8fe0b5]"
            : "bg-[#fff1cc] text-[#4a3400] dark:bg-[#3d2f08] dark:text-[#ffd97a]",
        )}
      >
        {!fixtures
          ? "The hiring model’s reviewed fixtures don’t pass: nothing can be published."
          : problems.length
            ? `The case isn’t complete yet (${problems.length} to fix below). It can’t be published until it reconciles.`
            : signed
              ? "Complete, reconciled and signed off: this lab can be published."
              : "A draft: it can’t be published until the owner, Finance, Operations/Quality, Partnerships and privacy sign-off is recorded below."}
      </p>

      <div className="mt-3 grid gap-3 sm:grid-cols-2">
        <Field label="Start from a case">
          <select
            className={input}
            value=""
            onChange={(e) => {
              const c = HIRING_CASES.find((x) => x.id === e.target.value);
              if (c && window.confirm(`Replace this lab with “${c.label}”? What’s written here now is replaced.`))
                set((x) => void Object.assign(x, freshHiringLab(c.data)));
            }}
          >
            <option value="">Choose…</option>
            {HIRING_CASES.map((c) => (
              <option key={c.id} value={c.id}>
                {c.label}
              </option>
            ))}
          </select>
        </Field>
        <Field label="Title">
          <input className={input} value={b.title} maxLength={120} onChange={(e) => set((x) => void (x.title = e.target.value), "title")} />
        </Field>
        <Field label="Introduction" className="sm:col-span-2">
          <textarea className={area} value={b.intro} maxLength={400} onChange={(e) => set((x) => void (x.intro = e.target.value), "intro")} />
        </Field>
        <Field label="Story version" hint="Change it whenever a fact changes, so earlier attempts stay interpretable.">
          <input className={input} value={b.storyVersion} maxLength={40} onChange={(e) => set((x) => void (x.storyVersion = e.target.value), "version")} />
        </Field>
        <Field label="Assessment" hint="Formative by default. Assessed records each person’s first finished attempt.">
          <select
            className={input}
            value={b.assessment}
            onChange={(e) => set((x) => void (x.assessment = e.target.value === "assessed" ? "assessed" : "formative"))}
          >
            <option value="formative">Formative: practice with feedback</option>
            <option value="assessed">Assessed with the rubric</option>
          </select>
        </Field>
      </div>

      <h4 className="mt-5 font-serif text-lg font-semibold">Identity</h4>
      <div className="mt-2 grid gap-3 sm:grid-cols-2">
        {(
          [
            ["audience", "Audience and role"],
            ["owner", "Owner"],
            ["objective", "Learning objective"],
            ["behaviour", "Intended behaviour"],
          ] as const
        ).map(([k, label]) => (
          <Field key={k} label={label}>
            <input className={input} value={b.identity[k]} onChange={(e) => set((x) => void (x.identity[k] = e.target.value), `id-${k}`)} />
          </Field>
        ))}
      </div>

      <h4 className="mt-5 font-serif text-lg font-semibold">Story</h4>
      <div className="mt-2 grid gap-3 sm:grid-cols-2">
        <Field label="Character" hint="Kept in the character library, so a later chapter can return to her.">
          <input className={input} value={b.story.character} onChange={(e) => set((x) => void (x.story.character = e.target.value), "char")} />
        </Field>
        <Field label="Who they are">
          <input className={input} value={b.story.role} onChange={(e) => set((x) => void (x.story.role = e.target.value), "role")} />
        </Field>
        <Field label="The situation" className="sm:col-span-2">
          <textarea className={area} value={b.story.situation} onChange={(e) => set((x) => void (x.story.situation = e.target.value), "situation")} />
        </Field>
        <Field label="Their question">
          <input className={input} value={b.story.dilemma} onChange={(e) => set((x) => void (x.story.dilemma = e.target.value), "dilemma")} />
        </Field>
        <Field label="Follow-up chapter">
          <input className={input} value={b.story.followUp} onChange={(e) => set((x) => void (x.story.followUp = e.target.value), "follow")} />
        </Field>
      </div>

      <h4 className="mt-5 font-serif text-lg font-semibold">Evidence cards</h4>
      <p className="text-sm text-ink-muted">Each figure a card states is checked against the case inputs below. They must match before the lab can publish.</p>
      <div className="mt-2 flex flex-col gap-3">
        {b.cards.map((c, ci) => (
          <EvidenceEdit key={c.id} c={c} set={(fn) => set((x) => fn(x.cards[ci]), `card-${ci}`)} remove={() => set((x) => void x.cards.splice(ci, 1))} />
        ))}
        <button
          type="button"
          className={cx(btn.secondary, "self-start")}
          onClick={() =>
            set(
              (x) =>
                void x.cards.push({
                  id: `card-${Math.random().toString(36).slice(2, 7)}`,
                  title: "",
                  kind: "other",
                  source: "",
                  establishes: "",
                  body: "",
                  figures: [],
                }),
            )
          }
        >
          <Icon name="plus" className="size-4" /> Add a card
        </button>
      </div>

      <h4 className="mt-5 font-serif text-lg font-semibold">Case inputs (fictional)</h4>
      <div className="mt-2 grid gap-3 sm:grid-cols-3">
        {(Object.keys(BAND_LABELS) as BandKey[]).map((k) => (
          <div key={k} className={group}>
            <p className="font-semibold">{BAND_LABELS[k]}</p>
            <NumberField label="Participants" value={b.inputs.bands[k].count} onChange={(v) => set((x) => void (x.inputs.bands[k].count = v), `band-${k}-c`)} />
            <NumberField
              label="Hours each a month"
              step={0.1}
              value={b.inputs.bands[k].hours}
              onChange={(v) => set((x) => void (x.inputs.bands[k].hours = v), `band-${k}-h`)}
            />
          </div>
        ))}
      </div>
      <div className="mt-3 grid gap-3 sm:grid-cols-3">
        {(Object.keys(INPUTS) as InputKey[]).map((k) => (
          <NumberField
            key={k}
            label={INPUTS[k].label}
            unit={INPUTS[k].unit}
            step={["availability", "productive", "threshold"].includes(k) ? 0.01 : 1}
            value={b.inputs[k]}
            onChange={(v) => set((x) => void (x.inputs[k] = v), `in-${k}`)}
          />
        ))}
      </div>

      <h4 className="mt-5 font-serif text-lg font-semibold">What learners can change while exploring</h4>
      <div className="mt-2 flex flex-col gap-2">
        {b.editable.map((e, i) => (
          <div key={i} className="grid items-end gap-2 sm:grid-cols-[1fr_6rem_6rem_6rem_auto]">
            <Field label="Assumption">
              <select className={input} value={e.key} onChange={(ev) => set((x) => void (x.editable[i].key = ev.target.value as InputKey))}>
                {(Object.keys(INPUTS) as InputKey[]).map((k) => (
                  <option key={k} value={k}>
                    {INPUTS[k].label}
                  </option>
                ))}
              </select>
            </Field>
            <NumberField label="Lowest" step={0.01} value={e.min} onChange={(v) => set((x) => void (x.editable[i].min = v), `ed-${i}-min`)} />
            <NumberField label="Highest" step={0.01} value={e.max} onChange={(v) => set((x) => void (x.editable[i].max = v), `ed-${i}-max`)} />
            <NumberField label="Step" step={0.01} value={e.step} onChange={(v) => set((x) => void (x.editable[i].step = v), `ed-${i}-step`)} />
            <button type="button" className={btn.quiet} aria-label="Remove this assumption" onClick={() => set((x) => void x.editable.splice(i, 1))}>
              <Icon name="trash" className="size-4" />
            </button>
          </div>
        ))}
        {b.editable.length < 8 && (
          <button
            type="button"
            className={cx(btn.secondary, "self-start")}
            onClick={() => set((x) => void x.editable.push({ key: "newPerMonth", min: 0, max: 10, step: 1 }))}
          >
            <Icon name="plus" className="size-4" /> Add an assumption
          </button>
        )}
      </div>

      <h4 className="mt-5 font-serif text-lg font-semibold">Options</h4>
      <div className="mt-2 grid gap-3 md:grid-cols-2">
        {b.options.map((o, i) => (
          <OptionEdit key={i} o={o} set={(fn) => set((x) => fn(x.options[i]), `opt-${i}`)} remove={() => set((x) => void x.options.splice(i, 1))} />
        ))}
      </div>
      {b.options.length < 8 && (
        <button
          type="button"
          className={cx(btn.secondary, "mt-2")}
          onClick={() =>
            set(
              (x) =>
                void x.options.push({
                  id: `option-${x.options.length + 1}`,
                  label: "New option",
                  kind: "hire",
                  fte: 0.5,
                  startMonth: 1,
                  leadMonths: 2,
                  rampMonths: 2,
                  oneOffCost: 0,
                  savingShare: 0,
                  savingFromMonth: 1,
                }),
            )
          }
        >
          <Icon name="plus" className="size-4" /> Add an option
        </button>
      )}

      <h4 className="mt-5 font-serif text-lg font-semibold">Growth cases</h4>
      <p className="text-sm text-ink-muted">Keep one with the id “expected” that uses the case as entered. Learners see each case’s description.</p>
      <div className="mt-2 grid gap-3 md:grid-cols-3">
        {b.growth.map((g, i) => (
          <div key={i} className={group}>
            <Field label="Name">
              <input className={input} value={g.label} onChange={(e) => set((x) => void (x.growth[i].label = e.target.value), `g-${i}-l`)} />
            </Field>
            <Field label="Id">
              <input className={input} value={g.id} onChange={(e) => set((x) => void (x.growth[i].id = e.target.value), `g-${i}-id`)} />
            </Field>
            <NumberField
              label="New participants"
              unit="more or fewer a month"
              value={g.newDelta}
              onChange={(v) => set((x) => void (x.growth[i].newDelta = v), `g-${i}-n`)}
            />
            <NumberField
              label="Exits"
              unit="more or fewer a month"
              value={g.exitDelta}
              onChange={(v) => set((x) => void (x.growth[i].exitDelta = v), `g-${i}-e`)}
            />
            <NumberField
              label="Recurring work"
              unit="× (1 is as entered)"
              step={0.05}
              value={g.complexity}
              onChange={(v) => set((x) => void (x.growth[i].complexity = v), `g-${i}-c`)}
            />
            <Field label="What learners read">
              <input className={input} value={g.describe} onChange={(e) => set((x) => void (x.growth[i].describe = e.target.value), `g-${i}-d`)} />
            </Field>
          </div>
        ))}
      </div>

      <h4 className="mt-5 font-serif text-lg font-semibold">The learner’s actions</h4>
      <div className="mt-2 grid gap-3 md:grid-cols-3">
        <div className={group}>
          <p className="font-semibold">{ACTIONS.temporary}</p>
          <Field label="Label">
            <input className={input} value={b.actions.temporary.label} onChange={(e) => set((x) => void (x.actions.temporary.label = e.target.value), "t-l")} />
          </Field>
          <NumberField label="From month" value={b.actions.temporary.fromMonth} onChange={(v) => set((x) => void (x.actions.temporary.fromMonth = v), "t-f")} />
          <NumberField label="For months" value={b.actions.temporary.months} onChange={(v) => set((x) => void (x.actions.temporary.months = v), "t-m")} />
          <NumberField label="Hours a month" value={b.actions.temporary.hours} onChange={(v) => set((x) => void (x.actions.temporary.hours = v), "t-h")} />
          <NumberField
            label="Cost a month"
            unit="$"
            value={b.actions.temporary.cost}
            onChange={(v) => set((x) => void (x.actions.temporary.cost = v), "t-c")}
          />
        </div>
        <div className={group}>
          <p className="font-semibold">{ACTIONS.pace}</p>
          <Field label="Label">
            <input className={input} value={b.actions.pace.label} onChange={(e) => set((x) => void (x.actions.pace.label = e.target.value), "p-l")} />
          </Field>
          <NumberField label="From month" value={b.actions.pace.fromMonth} onChange={(v) => set((x) => void (x.actions.pace.fromMonth = v), "p-f")} />
          <NumberField
            label="New participants"
            unit="change a month (negative)"
            value={b.actions.pace.extraNew}
            onChange={(v) => set((x) => void (x.actions.pace.extraNew = v), "p-n")}
          />
        </div>
        <div className={group}>
          <p className="font-semibold">{ACTIONS.workflow}</p>
          <Field label="Label">
            <input className={input} value={b.actions.workflow.label} onChange={(e) => set((x) => void (x.actions.workflow.label = e.target.value), "w-l")} />
          </Field>
          <NumberField label="From month" value={b.actions.workflow.fromMonth} onChange={(v) => set((x) => void (x.actions.workflow.fromMonth = v), "w-f")} />
          <NumberField
            label="Recurring hours saved"
            unit="share (0.15 is 15%)"
            step={0.01}
            value={b.actions.workflow.share}
            onChange={(v) => set((x) => void (x.actions.workflow.share = v), "w-s")}
          />
          <NumberField
            label="Setup cost"
            unit="$, the month before"
            value={b.actions.workflow.setupCost}
            onChange={(v) => set((x) => void (x.actions.workflow.setupCost = v), "w-c")}
          />
        </div>
      </div>

      <h4 className="mt-5 font-serif text-lg font-semibold">The new information</h4>
      <p className="text-sm text-ink-muted">Shown only after a learner commits a first plan.</p>
      <div className="mt-2 grid gap-3 sm:grid-cols-2">
        <Field label="Title">
          <input className={input} value={b.event.title} onChange={(e) => set((x) => void (x.event.title = e.target.value), "ev-t")} />
        </Field>
        <Field label="Where it comes from">
          <input className={input} value={b.event.source} onChange={(e) => set((x) => void (x.event.source = e.target.value), "ev-s")} />
        </Field>
        <Field label="The story" hint="A blank line starts a new paragraph." className="sm:col-span-2">
          <textarea className={cx(area, "min-h-32")} value={b.event.story} onChange={(e) => set((x) => void (x.event.story = e.target.value), "ev-story")} />
        </Field>
        <Field label="What changed, in words" hint="One per line." className="sm:col-span-2">
          <textarea
            className={area}
            value={b.event.changed.join("\n")}
            onChange={(e) => set((x) => void (x.event.changed = e.target.value.split("\n").slice(0, 8)), "ev-ch")}
          />
        </Field>
        <Field label="Words that show a revision engaged with it" hint="Separated by commas." className="sm:col-span-2">
          <input className={input} value={b.event.keywords.join(", ")} onChange={(e) => set((x) => void (x.event.keywords = csv(e.target.value)), "ev-k")} />
        </Field>
      </div>
      <div className="mt-2 flex flex-col gap-2">
        {b.event.adjustments.map((a, i) => (
          <AdjustmentEdit
            key={i}
            a={a}
            set={(next) => set((x) => void (x.event.adjustments[i] = next), `adj-${i}`)}
            remove={() => set((x) => void x.event.adjustments.splice(i, 1))}
          />
        ))}
        <button
          type="button"
          className={cx(btn.secondary, "self-start")}
          onClick={() => set((x) => void x.event.adjustments.push({ kind: "leave", month: 4, hours: 40 }))}
        >
          <Icon name="plus" className="size-4" /> Add a change
        </button>
      </div>

      <h4 className="mt-5 font-serif text-lg font-semibold">Rubric and feedback</h4>
      <p className="text-sm text-ink-muted">
        Feedback can quote calculated values: {TOKENS}. Ratings come from these words, the learner’s structured choices and the calculated plan, never an AI
        score.
      </p>
      <div className="mt-2 flex flex-col gap-3">
        {DIM_ORDER.map((k) => (
          <details key={k} className={group}>
            <summary className="min-h-11 cursor-pointer font-semibold">{DIMENSIONS[k]}</summary>
            <Field label="Words to look for" hint="Separated by commas.">
              <input
                className={input}
                value={b.feedback.dimensions[k].keywords.join(", ")}
                onChange={(e) => set((x) => void (x.feedback.dimensions[k].keywords = csv(e.target.value)), `fb-${k}-k`)}
              />
            </Field>
            {(["strong", "partly", "weak"] as const).map((level) => (
              <Field key={level} label={level === "strong" ? "Strong" : level === "partly" ? "Partly there" : "Worth another look"}>
                <textarea
                  className={area}
                  value={b.feedback.dimensions[k][level]}
                  onChange={(e) => set((x) => void (x.feedback.dimensions[k][level] = e.target.value), `fb-${k}-${level}`)}
                />
              </Field>
            ))}
          </details>
        ))}
        <Field label="Next step" hint="A Job Aid or lesson to suggest after the debrief.">
          <input className={input} value={b.feedback.nextStep} onChange={(e) => set((x) => void (x.feedback.nextStep = e.target.value), "fb-next")} />
        </Field>
      </div>
      <h5 className="mt-3 font-semibold">Reviewed plans (shown in the debrief as defensible alternatives)</h5>
      <div className="mt-2 grid gap-3 md:grid-cols-2">
        {b.feedback.alternatives.map((a, i) => (
          <div key={a.id} className={group}>
            <Field label="Label">
              <input className={input} value={a.label} onChange={(e) => set((x) => void (x.feedback.alternatives[i].label = e.target.value), `alt-${i}-l`)} />
            </Field>
            {(Object.keys(ACTIONS) as (keyof typeof ACTIONS)[]).map((act) => (
              <label key={act} className="flex min-h-10 items-center gap-2 text-sm">
                <input
                  type="checkbox"
                  className="size-5"
                  checked={a.plan[act]}
                  onChange={(e) => set((x) => void (x.feedback.alternatives[i].plan[act] = e.target.checked))}
                />
                {ACTIONS[act]}
              </label>
            ))}
            {a.plan.recruit && (
              <div className="grid grid-cols-2 gap-2">
                <Field label="Hire">
                  <select
                    className={input}
                    value={a.plan.optionId}
                    onChange={(e) => set((x) => void (x.feedback.alternatives[i].plan.optionId = e.target.value))}
                  >
                    <option value="">Choose…</option>
                    {b.options
                      .filter((o) => o.kind === "hire")
                      .map((o) => (
                        <option key={o.id} value={o.id}>
                          {o.label}
                        </option>
                      ))}
                  </select>
                </Field>
                <NumberField
                  label="Start month"
                  value={a.plan.startMonth}
                  onChange={(v) => set((x) => void (x.feedback.alternatives[i].plan.startMonth = v), `alt-${i}-m`)}
                />
              </div>
            )}
            <Field label="Why it’s defensible">
              <textarea className={area} value={a.why} onChange={(e) => set((x) => void (x.feedback.alternatives[i].why = e.target.value), `alt-${i}-w`)} />
            </Field>
            <button type="button" className={cx(btn.quiet, "self-start")} onClick={() => set((x) => void x.feedback.alternatives.splice(i, 1))}>
              <Icon name="trash" className="size-4" /> Remove
            </button>
          </div>
        ))}
      </div>
      {b.feedback.alternatives.length < 4 && (
        <button
          type="button"
          className={cx(btn.secondary, "mt-2")}
          onClick={() =>
            set(
              (x) =>
                void x.feedback.alternatives.push({
                  id: `alt-${Math.random().toString(36).slice(2, 7)}`,
                  label: "",
                  plan: { recruit: false, optionId: "", startMonth: 1, temporary: false, pace: false, workflow: false, monitor: true },
                  why: "",
                }),
            )
          }
        >
          <Icon name="plus" className="size-4" /> Add a reviewed plan
        </button>
      )}

      <Checks b={b} problems={problems} />

      <h4 className="mt-5 font-serif text-lg font-semibold">Governance</h4>
      <p className="text-sm text-ink-muted">
        Why this block, for whom, and how it will be judged. The verified signal records its cohort, denominator and period.
      </p>
      <div className="mt-2 grid gap-3 sm:grid-cols-2">
        {(
          [
            ["signal", "Verified signal"],
            ["whySimulation", "Why a simulation"],
            ["whyNow", "Why this block now"],
            ["alternatives", "Alternatives considered"],
            ["evaluation", "Evaluation"],
            ["measure", "Related operational measure"],
          ] as const
        ).map(([k, label]) => (
          <Field key={k} label={label}>
            <textarea className={area} value={b.governance[k]} onChange={(e) => set((x) => void (x.governance[k] = e.target.value), `gv-${k}`)} />
          </Field>
        ))}
      </div>
      <div className="mt-3 grid gap-3 sm:grid-cols-3">
        {(
          [
            ["owner", "Content owner"],
            ["finance", "Finance reviewer"],
            ["operations", "Operations/Quality reviewer"],
            ["partnerships", "Partnerships reviewer"],
            ["privacy", "Privacy reviewer"],
          ] as const
        ).map(([k, label]) => (
          <Field key={k} label={label}>
            <input className={input} value={b.governance[k]} onChange={(e) => set((x) => void (x.governance[k] = e.target.value), `gv-${k}`)} />
          </Field>
        ))}
        {(
          [
            ["approvedOn", "Approved on"],
            ["effectiveFrom", "Effective from"],
            ["reviewBy", "Review by"],
          ] as const
        ).map(([k, label]) => (
          <Field key={k} label={label}>
            <input type="date" className={input} value={b.governance[k]} onChange={(e) => set((x) => void (x.governance[k] = e.target.value))} />
          </Field>
        ))}
      </div>
    </div>
  );
}

function EvidenceEdit({ c, set, remove }: { c: EvidenceCard; set: (fn: (x: EvidenceCard) => void) => void; remove: () => void }) {
  return (
    <details className="rounded-2xl bg-muted p-3">
      <summary className="flex min-h-11 cursor-pointer items-center justify-between gap-2 font-semibold">
        {c.title || "Untitled card"} <span className="text-xs font-normal text-ink-muted">{c.figures.length} figures</span>
      </summary>
      <div className="mt-2 grid gap-3 sm:grid-cols-2">
        <Field label="Title">
          <input className={input} value={c.title} onChange={(e) => set((x) => void (x.title = e.target.value))} />
        </Field>
        <Field label="Kind">
          <select className={input} value={c.kind} onChange={(e) => set((x) => void (x.kind = e.target.value as EvidenceCard["kind"]))}>
            <option value="agreement">Agreement excerpt</option>
            <option value="workload">Workload sample</option>
            <option value="cash">Cost and cash sheet</option>
            <option value="other">Other</option>
          </select>
        </Field>
        <Field label="Source label">
          <input className={input} value={c.source} onChange={(e) => set((x) => void (x.source = e.target.value))} />
        </Field>
        <Field label="What it establishes">
          <input className={input} value={c.establishes} onChange={(e) => set((x) => void (x.establishes = e.target.value))} />
        </Field>
        <Field label="What learners read" hint="One point per line." className="sm:col-span-2">
          <textarea className={cx(area, "min-h-32")} value={c.body} onChange={(e) => set((x) => void (x.body = e.target.value))} />
        </Field>
      </div>
      <p className="mt-2 text-sm font-semibold">Figures it states</p>
      {c.figures.map((f, i) => (
        <div key={i} className="mt-1 grid items-end gap-2 sm:grid-cols-[1fr_8rem_auto]">
          <Field label="Model figure">
            <select className={input} value={f.key} onChange={(e) => set((x) => void (x.figures[i].key = e.target.value as FigureKey))}>
              {FIGURE_KEYS.map((k) => (
                <option key={k} value={k}>
                  {figureLabel(k)}
                </option>
              ))}
            </select>
          </Field>
          <NumberField label="Value on the card" step={0.01} value={f.value} onChange={(v) => set((x) => void (x.figures[i].value = v))} />
          <button type="button" className={btn.quiet} aria-label="Remove this figure" onClick={() => set((x) => void x.figures.splice(i, 1))}>
            <Icon name="trash" className="size-4" />
          </button>
        </div>
      ))}
      <div className="mt-2 flex gap-2">
        <button type="button" className={btn.secondary} onClick={() => set((x) => void x.figures.push({ key: "incomePerClient", value: 0 }))}>
          <Icon name="plus" className="size-4" /> Add a figure
        </button>
        <button type="button" className={btn.quiet} onClick={remove}>
          <Icon name="trash" className="size-4" /> Remove the card
        </button>
      </div>
    </details>
  );
}

function OptionEdit({ o, set, remove }: { o: HiringOption; set: (fn: (x: HiringOption) => void) => void; remove: () => void }) {
  return (
    <div className={group}>
      <div className="grid grid-cols-2 gap-2">
        <Field label="Label">
          <input className={input} value={o.label} onChange={(e) => set((x) => void (x.label = e.target.value))} />
        </Field>
        <Field label="Id">
          <input className={input} value={o.id} onChange={(e) => set((x) => void (x.id = e.target.value))} />
        </Field>
      </div>
      <Field label="Kind">
        <select className={input} value={o.kind} onChange={(e) => set((x) => void (x.kind = e.target.value as HiringOption["kind"]))}>
          <option value="none">Keep current team</option>
          <option value="hire">Hire</option>
          <option value="workflow">Workflow change</option>
        </select>
      </Field>
      {o.kind === "hire" && (
        <div className="grid grid-cols-2 gap-2">
          <NumberField label="FTE added" step={0.1} value={o.fte} onChange={(v) => set((x) => void (x.fte = v))} />
          <NumberField label="Recruitment starts" unit="month" value={o.startMonth} onChange={(v) => set((x) => void (x.startMonth = v))} />
          <NumberField label="Recruitment lead" unit="months" value={o.leadMonths} onChange={(v) => set((x) => void (x.leadMonths = v))} />
          <NumberField label="Ramp to full" unit="months" value={o.rampMonths} onChange={(v) => set((x) => void (x.rampMonths = v))} />
        </div>
      )}
      {o.kind === "workflow" && (
        <div className="grid grid-cols-2 gap-2">
          <NumberField label="Recurring hours saved" unit="share" step={0.01} value={o.savingShare} onChange={(v) => set((x) => void (x.savingShare = v))} />
          <NumberField label="From month" value={o.savingFromMonth} onChange={(v) => set((x) => void (x.savingFromMonth = v))} />
        </div>
      )}
      {o.kind !== "none" && (
        <NumberField label="One-off cost" unit="$, in the start month" value={o.oneOffCost} onChange={(v) => set((x) => void (x.oneOffCost = v))} />
      )}
      <button type="button" className={cx(btn.quiet, "self-start")} onClick={remove}>
        <Icon name="trash" className="size-4" /> Remove
      </button>
    </div>
  );
}

const ADJUSTMENTS: Record<Adjustment["kind"], string> = {
  leave: "Leave (hours lost in a month)",
  intake: "Intake (more or fewer new participants)",
  paymentDelay: "Payments arrive later",
  temporary: "Temporary help",
  saving: "Workflow saving",
};
function AdjustmentEdit({ a, set, remove }: { a: Adjustment; set: (a: Adjustment) => void; remove: () => void }) {
  const fresh = (kind: Adjustment["kind"]): Adjustment =>
    kind === "leave"
      ? { kind, month: 4, hours: 40 }
      : kind === "intake"
        ? { kind, fromMonth: 4, extraNew: 1 }
        : kind === "paymentDelay"
          ? { kind, fromMonth: 4, extraMonths: 1 }
          : kind === "temporary"
            ? { kind, fromMonth: 4, months: 2, hours: 20, cost: 1_500 }
            : { kind, fromMonth: 4, share: 0.1, setupCost: 1_000 };
  const field = (label: string, key: string, unit?: string, step = 1) => (
    <NumberField
      key={key}
      label={label}
      unit={unit}
      step={step}
      value={(a as unknown as Record<string, number>)[key]}
      onChange={(v) => set({ ...a, [key]: v } as Adjustment)}
    />
  );
  return (
    <div className="grid items-end gap-2 rounded-2xl bg-muted p-3 sm:grid-cols-[14rem_repeat(4,minmax(0,1fr))_auto]">
      <Field label="Change">
        <select className={input} value={a.kind} onChange={(e) => set(fresh(e.target.value as Adjustment["kind"]))}>
          {Object.entries(ADJUSTMENTS).map(([k, label]) => (
            <option key={k} value={k}>
              {label}
            </option>
          ))}
        </select>
      </Field>
      {a.kind === "leave" && [field("Month", "month"), field("Hours lost", "hours", "participant-work hours", 0.1)]}
      {a.kind === "intake" && [field("From month", "fromMonth"), field("New participants", "extraNew", "change a month")]}
      {a.kind === "paymentDelay" && [field("From month", "fromMonth"), field("Later by", "extraMonths", "months")]}
      {a.kind === "temporary" && [
        field("From month", "fromMonth"),
        field("For months", "months"),
        field("Hours a month", "hours"),
        field("Cost a month", "cost", "$"),
      ]}
      {a.kind === "saving" && [field("From month", "fromMonth"), field("Saving", "share", "share", 0.01), field("Setup cost", "setupCost", "$")]}
      <button type="button" className={btn.quiet} aria-label="Remove this change" onClick={remove}>
        <Icon name="trash" className="size-4" />
      </button>
    </div>
  );
}

/** What learners will see, worked out: each option under each growth case, and each reviewed plan with the new information. */
function Checks({ b, problems }: { b: HiringBlock; problems: string[] }) {
  const ok = !problems.length;
  return (
    <section className="mt-5 rounded-2xl border border-line-strong p-4">
      <h4 className="font-serif text-lg font-semibold">Check the case</h4>
      {ok ? (
        <p className="mt-1 text-sm font-semibold text-[#0f5b3a] dark:text-[#8fe0b5]">Complete, and every evidence figure matches the model.</p>
      ) : (
        <ul className="mt-1 list-disc pl-5 text-sm text-[#a12d31]">
          {problems.map((p) => (
            <li key={p}>{p}</li>
          ))}
        </ul>
      )}
      {ok && (
        <>
          <div className="mt-3 overflow-x-auto">
            <table className="w-full min-w-[40rem] text-sm">
              <caption className="text-left font-semibold">
                Each option, by growth case: months over threshold · lowest cash · 12-month operating result
              </caption>
              <thead>
                <tr className="text-left text-ink-muted">
                  <th scope="col" className="px-2 py-1">
                    Option
                  </th>
                  {b.growth.map((g) => (
                    <th key={g.id} scope="col" className="px-2 py-1">
                      {g.label}
                    </th>
                  ))}
                </tr>
              </thead>
              <tbody>
                {b.options.map((o) => (
                  <tr key={o.id} className="border-t border-line">
                    <th scope="row" className="px-2 py-1 text-left">
                      {o.label}
                    </th>
                    {b.growth.map((g) => {
                      const f = compareOptions(b, g.id).find((c) => c.option.id === o.id)!.f;
                      return (
                        <td key={g.id} className="px-2 py-1">
                          {f.monthsAbove} · {dollars(f.lowestCash)} · {dollars(f.operating12)}
                        </td>
                      );
                    })}
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
          <p className="mt-2 text-sm">
            Current team, expected case:{" "}
            {(() => {
              const f = forecast(b.inputs, noneOption(b), expectedCase(b));
              return f.firstPressure ? `over the threshold from Month ${f.firstPressure} of ${HORIZON}` : "under the threshold all year";
            })()}
            .
          </p>
          {b.feedback.alternatives.length > 0 && (
            <ul className="mt-2 list-disc pl-5 text-sm">
              {b.feedback.alternatives.map((a) => {
                const before = planForecast(b, a.plan);
                const after = planForecast(b, a.plan, undefined, true);
                return (
                  <li key={a.id}>
                    <strong>{a.label || planSummary(b, a.plan)}</strong>: before the new information {months(before.monthsAbove)} over, lowest cash{" "}
                    {dollars(before.lowestCash)}; after, {months(after.monthsAbove)} over, lowest cash {dollars(after.lowestCash)}.
                  </li>
                );
              })}
            </ul>
          )}
        </>
      )}
    </section>
  );
}
