"use client";

import Link from "next/link";
import { useRouter } from "next/navigation";
import { useState } from "react";
import { api } from "@/lib/api";
import { cx } from "@/lib/format";
import { BARRIERS, PLAN_STEPS } from "@/lib/blockRegistry";
import {
  ACTION_KINDS,
  ACTION_STATUS,
  LEARNING_DECISIONS,
  months,
  RESULTS,
  REVIEW_DECISIONS,
  SMALL_SAMPLE,
  type ActionKind,
  type ActionStatus,
  type LearningDecision,
  type ResponseData,
  type ReviewDecision,
} from "@/lib/problemDesk";
import { Badge, btn, Field, input } from "../ui";
import { Icon } from "../../Icon";
import { LineChart, monthLabel } from "./ProblemCharts";
import type { TabProps } from "./ProblemTheme";
import { area, box, dateText, Section } from "./problemUi";

type Action = TabProps["d"]["actions"][number];
const resultTone = (r: string) => (r === "improved" ? "good" : r === "mixed" ? "warn" : r === "no_change" ? "bad" : "neutral");
const markersOf = (d: TabProps["d"]) => d.actions.filter((a) => a.on && a.status === "done").map((a) => ({ bucket: a.on.slice(0, 7), label: a.title }));

// ---------------------------------------------------------------------------------------------
// 4. What's been tried
// ---------------------------------------------------------------------------------------------

const blankAction = (prior: boolean) => ({
  actionId: "",
  prior,
  kind: "process" as ActionKind,
  title: "",
  owner: "",
  audience: "",
  assetKind: "",
  assetRef: "",
  assetVersion: "",
  intended: "",
  on: "",
  due: "",
  status: (prior ? "done" : "planned") as ActionStatus,
  result: "",
  interpretation: "",
  snapshot: "",
  snapshotAt: "",
  workLink: "",
});

function ActionCard({ a, onEdit }: { a: Action; onEdit: () => void }) {
  return (
    <li className={box}>
      <div className="flex flex-wrap items-center gap-2">
        <Badge>{ACTION_KINDS[a.kind]}</Badge>
        <Badge tone={a.status === "done" ? "good" : a.status === "dropped" ? "bad" : "info"}>{ACTION_STATUS[a.status]}</Badge>
        {a.result ? <Badge tone={resultTone(a.result)}>{RESULTS[a.result]}</Badge> : a.prior ? <Badge tone="warn">Result not assessed</Badge> : null}
        <span className="text-sm text-ink-muted">{a.on ? dateText(a.on) : a.due ? `Due ${dateText(a.due)}` : "No date"}</span>
      </div>
      <p className="mt-1.5 font-semibold">{a.title}</p>
      <dl className="mt-1 grid gap-x-6 gap-y-1 text-sm sm:grid-cols-2">
        <div>
          <dt className="inline text-ink-muted">Owner: </dt>
          <dd className="inline">{a.owner || "None named"}</dd>
        </div>
        {a.audience && (
          <div>
            <dt className="inline text-ink-muted">Audience: </dt>
            <dd className="inline">{a.audience}</dd>
          </div>
        )}
        {a.intended && (
          <div className="sm:col-span-2">
            <dt className="inline text-ink-muted">Meant to change: </dt>
            <dd className="inline">{a.intended}</dd>
          </div>
        )}
        {a.snapshot && (
          <div className="sm:col-span-2">
            <dt className="inline text-ink-muted">What was seen{a.snapshotAt ? ` (as at ${dateText(a.snapshotAt)})` : ""}: </dt>
            <dd className="inline">{a.snapshot}</dd>
          </div>
        )}
        {a.interpretation && (
          <div className="sm:col-span-2">
            <dt className="inline text-ink-muted">Reading of it: </dt>
            <dd className="inline">{a.interpretation}</dd>
          </div>
        )}
      </dl>
      <div className="mt-2 flex flex-wrap items-center gap-x-4 gap-y-1 text-sm">
        {a.assetLink && (
          <Link href={a.assetLink} className="font-medium underline underline-offset-2">
            Open the {a.assetKind === "topic" ? "Topic" : "course"}
            {a.assetVersion ? ` (${a.assetVersion})` : ""}
          </Link>
        )}
        {a.reportLink ? (
          <Link href={a.reportLink} className="font-medium underline underline-offset-2">
            Scored outcomes report
          </Link>
        ) : a.assetRef ? (
          <span className="text-ink-muted">No linked report yet</span>
        ) : null}
        {a.workLink && (
          <a href={a.workLink} target="_blank" rel="noreferrer" className="font-medium underline underline-offset-2">
            Work data
          </a>
        )}
        <button type="button" className={btn.quiet} onClick={onEdit}>
          <Icon name="pen" className="size-4" /> Edit
        </button>
      </div>
    </li>
  );
}

export function ResponsesTab({ d, act, busy }: TabProps) {
  const [form, setForm] = useState<ReturnType<typeof blankAction> | null>(null);
  const edit = (a: Action) =>
    setForm({
      ...blankAction(a.prior),
      ...a,
      actionId: a.id,
      assetKind: a.assetKind,
      assetRef: a.assetRef,
      result: a.result,
      on: a.on,
      due: a.due,
      snapshotAt: a.snapshotAt,
      workLink: a.workLink,
    });
  const prior = d.actions.filter((a) => a.prior);
  const current = d.actions.filter((a) => !a.prior);

  return (
    <>
      <Section
        title="Tried before"
        hint="Everything already done about this problem: process and portal changes, notes, job aids, coaching and learning alike. If the same kind of thing has been tried and work didn’t change, more of it is unlikely to help."
        aside={
          <button type="button" className={btn.secondary} onClick={() => setForm(blankAction(true))}>
            <Icon name="plus" className="size-4" /> Add something tried before
          </button>
        }
      >
        <ul className="flex flex-col gap-3">
          {prior.map((a) => (
            <ActionCard key={a.id} a={a} onEdit={() => edit(a)} />
          ))}
          {!prior.length && <li className={cx(box, "text-ink-muted")}>Nothing recorded. If this really is the first response, say so in the decision.</li>}
        </ul>
        <p className="mt-3 flex items-start gap-2 rounded-xl bg-muted p-3 text-sm">
          <Icon name="info" className="mt-0.5 size-4 shrink-0" /> A practice or quiz result shows what people did in the learning. It isn’t proof that work
          improved: that needs the work measure, on the Measures step.
        </p>
      </Section>

      <Section
        title="Part of this response"
        hint="The actions in the current response, each with an owner. Learning is one kind among several, and there doesn’t have to be any."
        aside={
          <button type="button" className={btn.secondary} onClick={() => setForm(blankAction(false))}>
            <Icon name="plus" className="size-4" /> Add an action
          </button>
        }
      >
        <ul className="flex flex-col gap-3">
          {current.map((a) => (
            <ActionCard key={a.id} a={a} onEdit={() => edit(a)} />
          ))}
          {!current.length && (
            <li className={cx(box, "text-ink-muted")}>No actions yet. A response needs at least one, with an owner, before it can be approved.</li>
          )}
        </ul>
      </Section>

      {form && (
        <Section title={form.actionId ? "Edit the action" : form.prior ? "Something tried before" : "A new action"}>
          <form
            className={cx(box, "grid gap-3 sm:grid-cols-2")}
            onSubmit={async (e) => {
              e.preventDefault();
              if (await act({ action: "save-action", id: d.theme.id, ...form })) setForm(null);
            }}
          >
            <Field label="Kind">
              <select className={input} value={form.kind} onChange={(e) => setForm({ ...form, kind: e.target.value as ActionKind })}>
                {Object.entries(ACTION_KINDS).map(([k, v]) => (
                  <option key={k} value={k}>
                    {v}
                  </option>
                ))}
              </select>
            </Field>
            <Field label="Status">
              <select className={input} value={form.status} onChange={(e) => setForm({ ...form, status: e.target.value as ActionStatus })}>
                {Object.entries(ACTION_STATUS).map(([k, v]) => (
                  <option key={k} value={k}>
                    {v}
                  </option>
                ))}
              </select>
            </Field>
            <Field label="What it is" className="sm:col-span-2">
              <input className={input} value={form.title} onChange={(e) => setForm({ ...form, title: e.target.value })} required minLength={4} />
            </Field>
            <Field label="Owner">
              <input className={input} value={form.owner} onChange={(e) => setForm({ ...form, owner: e.target.value })} required={!form.prior} />
            </Field>
            <Field label="Who it reaches">
              <input className={input} value={form.audience} onChange={(e) => setForm({ ...form, audience: e.target.value })} />
            </Field>
            <Field label="What it’s meant to change" className="sm:col-span-2">
              <input className={input} value={form.intended} onChange={(e) => setForm({ ...form, intended: e.target.value })} />
            </Field>
            <Field label="Date it happened">
              <input type="date" className={input} value={form.on} onChange={(e) => setForm({ ...form, on: e.target.value })} />
            </Field>
            <Field label="Due">
              <input type="date" className={input} value={form.due} onChange={(e) => setForm({ ...form, due: e.target.value })} />
            </Field>
            <Field label="Hub item, if it is one">
              <select className={input} value={form.assetKind} onChange={(e) => setForm({ ...form, assetKind: e.target.value })}>
                <option value="">Not a Hub item</option>
                <option value="topic">Topic</option>
                <option value="course">Magazine course</option>
              </select>
            </Field>
            <Field label="Its slug or ID" hint="A Topic’s slug links its scored outcomes report.">
              <input className={input} value={form.assetRef} onChange={(e) => setForm({ ...form, assetRef: e.target.value })} disabled={!form.assetKind} />
            </Field>
            <Field label="Result">
              <select className={input} value={form.result} onChange={(e) => setForm({ ...form, result: e.target.value })}>
                <option value="">Not assessed</option>
                {Object.entries(RESULTS).map(([k, v]) => (
                  <option key={k} value={k}>
                    {v}
                  </option>
                ))}
              </select>
            </Field>
            <Field label="Link to the work data" hint="An https address, or a Hub path.">
              <input className={input} value={form.workLink} onChange={(e) => setForm({ ...form, workLink: e.target.value })} />
            </Field>
            <Field label="What was seen" hint="A dated, aggregate snapshot: no names." className="sm:col-span-2">
              <input className={input} value={form.snapshot} onChange={(e) => setForm({ ...form, snapshot: e.target.value })} />
            </Field>
            <Field label="How to read it" hint="What it does and doesn’t show." className="sm:col-span-2">
              <textarea className={area} value={form.interpretation} onChange={(e) => setForm({ ...form, interpretation: e.target.value })} />
            </Field>
            <div className="flex flex-wrap gap-2 sm:col-span-2">
              <button className={btn.primary} disabled={busy}>
                Save
              </button>
              <button type="button" className={btn.quiet} onClick={() => setForm(null)}>
                Cancel
              </button>
              {form.actionId && (
                <button
                  type="button"
                  className={cx(btn.quiet, "ml-auto")}
                  disabled={busy}
                  onClick={async () => {
                    if (
                      window.confirm("Remove this action from the record?") &&
                      (await act({ action: "remove-action", id: d.theme.id, actionId: form.actionId }))
                    )
                      setForm(null);
                  }}
                >
                  <Icon name="trash" className="size-4" /> Remove
                </button>
              )}
            </div>
          </form>
        </Section>
      )}
    </>
  );
}

// ---------------------------------------------------------------------------------------------
// 5. Response decision
// ---------------------------------------------------------------------------------------------

export function DecisionTab({ d, act, busy }: TabProps) {
  const router = useRouter();
  const [r, setR] = useState<ResponseData>(d.response.data);
  const dirty = JSON.stringify(r) !== JSON.stringify(d.response.data);
  const approved = d.response.status === "approved";
  const hours = r.audienceSize && r.effort.learnerMinutes ? Math.round((r.audienceSize * r.effort.learnerMinutes) / 6) / 10 : null;
  const n = (v: string) => (v === "" ? 0 : Math.max(0, Number(v) || 0));
  const canBuild = approved && (r.learning === "new" || r.learning === "role_section");

  return (
    <form
      onSubmit={(e) => {
        e.preventDefault();
        void act({ action: "save-response", id: d.theme.id, data: r });
      }}
    >
      <div className="flex flex-wrap items-center gap-2">
        {approved ? (
          <Badge tone="good">Approved {d.response.approvedAt ? dateText(d.response.approvedAt) : ""}</Badge>
        ) : (
          <Badge tone="warn">{d.response.status === "draft" ? "Draft" : "Not started"}</Badge>
        )}
        {!d.diagnosis.verified && <Badge tone="warn">Built on an unconfirmed diagnosis</Badge>}
        {approved && <span className="text-sm text-ink-muted">Changing anything here returns it to draft.</span>}
      </div>

      <Section title="The problem and the people" hint="One page an owner can approve: what’s wrong, who it affects, what they should do instead.">
        <div className={cx(box, "grid gap-3 sm:grid-cols-2")}>
          <Field label="The problem, and the evidence for it" className="sm:col-span-2">
            <textarea className={area} value={r.problem} onChange={(e) => setR({ ...r, problem: e.target.value })} />
          </Field>
          <Field label="Who is affected">
            <input className={input} value={r.audience} onChange={(e) => setR({ ...r, audience: e.target.value })} />
          </Field>
          <Field label="How many people" hint="Only those who actually meet this task.">
            <input
              className={input}
              inputMode="numeric"
              value={r.audienceSize ?? ""}
              onChange={(e) => setR({ ...r, audienceSize: e.target.value ? Math.round(n(e.target.value)) || null : null })}
            />
          </Field>
          <Field label="The behaviour wanted" className="sm:col-span-2">
            <textarea className={area} value={r.desired} onChange={(e) => setR({ ...r, desired: e.target.value })} />
          </Field>
          <Field label="The barrier, and how sure anyone is" className="sm:col-span-2">
            <textarea className={area} value={r.barrierSummary} onChange={(e) => setR({ ...r, barrierSummary: e.target.value })} />
          </Field>
        </div>
      </Section>

      <Section
        title="What to do about learning"
        hint="The actions themselves are on “What’s been tried”. Here, decide only whether learning is part of the response. “No learning item” is a complete answer."
      >
        <div className={cx(box, "grid gap-3 sm:grid-cols-2")}>
          <Field label="Learning decision">
            <select className={input} value={r.learning} onChange={(e) => setR({ ...r, learning: e.target.value as LearningDecision | "" })}>
              <option value="">Not decided</option>
              {Object.entries(LEARNING_DECISIONS).map(([k, v]) => (
                <option key={k} value={k}>
                  {v}
                </option>
              ))}
            </select>
          </Field>
          <Field label="Response owner">
            <input className={input} value={r.owner} onChange={(e) => setR({ ...r, owner: e.target.value })} />
          </Field>
          <Field label="Why this response, and not something lighter or heavier" className="sm:col-span-2">
            <textarea className={area} value={r.why} onChange={(e) => setR({ ...r, why: e.target.value })} />
          </Field>
        </div>
      </Section>

      <Section
        title="How anyone will know"
        hint="Name the work measure before building anything. If it can’t be measured yet, say how a baseline will be collected."
      >
        <div className={cx(box, "grid gap-3 sm:grid-cols-2")}>
          <Field label="Work measure">
            <input className={input} value={r.measure.name} onChange={(e) => setR({ ...r, measure: { ...r.measure, name: e.target.value } })} />
          </Field>
          <Field label="Who owns the data">
            <input className={input} value={r.measure.owner} onChange={(e) => setR({ ...r, measure: { ...r.measure, owner: e.target.value } })} />
          </Field>
          <Field label="How it’s counted" hint="Numerator, denominator and what’s left out." className="sm:col-span-2">
            <textarea className={area} value={r.measure.definition} onChange={(e) => setR({ ...r, measure: { ...r.measure, definition: e.target.value } })} />
          </Field>
          <Field label="Baseline window">
            <input className={input} value={r.baseline.window} onChange={(e) => setR({ ...r, baseline: { ...r.baseline, window: e.target.value } })} />
          </Field>
          <Field label="Baseline, or the plan to collect one">
            <input className={input} value={r.baseline.note} onChange={(e) => setR({ ...r, baseline: { ...r.baseline, note: e.target.value } })} />
          </Field>
          <Field label="How long before a change could show">
            <input className={input} value={r.lag} onChange={(e) => setR({ ...r, lag: e.target.value })} />
          </Field>
          <Field label="What else could move the number" hint="Other changes going on at the same time.">
            <input className={input} value={r.competing} onChange={(e) => setR({ ...r, competing: e.target.value })} />
          </Field>
          <Field label="Review date">
            <input type="date" className={input} value={r.reviewOn} onChange={(e) => setR({ ...r, reviewOn: e.target.value })} />
          </Field>
        </div>
      </Section>

      <Section title="What it costs" hint="Learner time is real work time. Count it before asking for it.">
        <div className={cx(box, "grid gap-3 sm:grid-cols-2 lg:grid-cols-4")}>
          <Field label="Learner minutes each">
            <input
              className={input}
              inputMode="numeric"
              value={r.effort.learnerMinutes || ""}
              onChange={(e) => setR({ ...r, effort: { ...r.effort, learnerMinutes: Math.round(n(e.target.value)) } })}
            />
          </Field>
          <Field label="Author hours">
            <input
              className={input}
              inputMode="decimal"
              value={r.effort.authorHours || ""}
              onChange={(e) => setR({ ...r, effort: { ...r.effort, authorHours: n(e.target.value) } })}
            />
          </Field>
          <Field label="Review hours">
            <input
              className={input}
              inputMode="decimal"
              value={r.effort.reviewHours || ""}
              onChange={(e) => setR({ ...r, effort: { ...r.effort, reviewHours: n(e.target.value) } })}
            />
          </Field>
          <Field label="Support hours">
            <input
              className={input}
              inputMode="decimal"
              value={r.effort.supportHours || ""}
              onChange={(e) => setR({ ...r, effort: { ...r.effort, supportHours: n(e.target.value) } })}
            />
          </Field>
          <Field label="Upkeep" hint="What has to be kept current, and by whom." className="sm:col-span-2 lg:col-span-4">
            <input className={input} value={r.effort.maintenance} onChange={(e) => setR({ ...r, effort: { ...r.effort, maintenance: e.target.value } })} />
          </Field>
          <p className="rounded-xl bg-tealtint p-3 sm:col-span-2 lg:col-span-4">
            {hours === null ? (
              "Give the number of people and the minutes each, and the total learner time shows here."
            ) : (
              <>
                <span className="font-serif text-2xl font-semibold tabular-nums">{hours.toLocaleString("en-AU")}</span> learner hours in total (
                {r.audienceSize?.toLocaleString("en-AU")} people × {r.effort.learnerMinutes} minutes). Is the problem worth that much of their time?
              </>
            )}
          </p>
        </div>
      </Section>

      <Section
        title="Assignment"
        hint="Nothing is assigned from here. This records the intent, so that whoever assigns it later can see who it was meant for and why."
      >
        <div className={cx(box, "grid gap-3 sm:grid-cols-2")}>
          <label className="flex items-start gap-2 sm:col-span-2">
            <input
              type="checkbox"
              className="mt-1 size-4"
              checked={r.assignment.required}
              onChange={(e) => setR({ ...r, assignment: { ...r.assignment, required: e.target.checked } })}
            />
            <span>
              <span className="font-semibold">This should be required for some people</span>
              <span className="block text-sm text-ink-muted">Required learning needs the roles and the reason. Recommended is the default.</span>
            </span>
          </label>
          <Field label="Which roles">
            <input className={input} value={r.assignment.roles} onChange={(e) => setR({ ...r, assignment: { ...r.assignment, roles: e.target.value } })} />
          </Field>
          <Field label="Due">
            <input
              type="date"
              className={input}
              value={r.assignment.due}
              onChange={(e) => setR({ ...r, assignment: { ...r.assignment, due: e.target.value } })}
            />
          </Field>
          <Field label="Why them" className="sm:col-span-2">
            <input className={input} value={r.assignment.reason} onChange={(e) => setR({ ...r, assignment: { ...r.assignment, reason: e.target.value } })} />
          </Field>
        </div>
      </Section>

      <Section title="Approve">
        {d.response.problems.length > 0 && !dirty && (
          <ul className="mb-3 list-disc rounded-2xl border border-gold bg-gold/10 p-4 pl-8 text-sm">
            {d.response.problems.map((x) => (
              <li key={x}>{x}</li>
            ))}
          </ul>
        )}
        <div className="flex flex-wrap items-center gap-2">
          <button className={btn.primary} disabled={busy || !dirty}>
            Save draft
          </button>
          <button
            type="button"
            className={btn.secondary}
            disabled={busy || dirty || approved || d.response.status === "none" || d.response.problems.length > 0}
            onClick={() => act({ action: "approve-response", id: d.theme.id })}
          >
            <Icon name="circle-check" className="size-4" /> Approve this response
          </button>
          {dirty && <span className="text-sm text-ink-muted">Save before approving.</span>}
        </div>
        {canBuild && (
          <div className={cx(box, "mt-4")}>
            {d.response.guide ? (
              <p>
                The Magazine draft for this response:{" "}
                <Link href={`/admin/magazine/${d.response.guide.id}`} className="font-semibold underline underline-offset-2">
                  {d.response.guide.title}
                </Link>
              </p>
            ) : (
              <>
                <p className="text-sm text-ink-muted">
                  Starts an ordinary Magazine draft, linked to this decision. Nothing is published or assigned, and the usual review still applies.
                </p>
                <button
                  type="button"
                  className={cx(btn.secondary, "mt-2")}
                  disabled={busy}
                  onClick={async () => {
                    const out = await act({ action: "create-course", id: d.theme.id });
                    if (out?.guideId) router.push(`/admin/magazine/${String(out.guideId)}`);
                  }}
                >
                  <Icon name="magazine" className="size-4" /> Start the Magazine draft
                </button>
              </>
            )}
          </div>
        )}
      </Section>
    </form>
  );
}

// ---------------------------------------------------------------------------------------------
// 6. Learning plan
// ---------------------------------------------------------------------------------------------

const WHY: [keyof TabProps["d"]["plan"]["steps"][number]["rationale"], string][] = [
  ["behaviour", "Behaviour it targets"],
  ["barrier", "Barrier it addresses"],
  ["mechanism", "What the learner does"],
  ["evidence", "Evidence it produces"],
  ["needs", "What it needs from you"],
  ["proportionate", "Time"],
  ["uncertain", "What isn’t certain"],
];

export function PlanTab({ d, act, busy }: TabProps) {
  const [note, setNote] = useState("");
  const [swap, setSwap] = useState<{ stepId: string; blockType: string; reason: string } | null>(null);
  const [add, setAdd] = useState({ blockType: "", step: "practise", reason: "", q: "" });
  const router = useRouter();
  const r = d.response.data;
  const cov = d.plan.coverage;
  const steps = d.plan.steps;
  const planned = r.effort.learnerMinutes || 10;
  const found = d.blocks.filter((b) => !add.q.trim() || `${b.label} ${b.purpose}`.toLowerCase().includes(add.q.trim().toLowerCase()));
  const picked = d.blocks.find((b) => b.type === add.blockType);

  return (
    <>
      {r.learning === "none" && (
        <p className="mb-4 rounded-2xl bg-tealtint p-4">
          The decision for this theme is no learning item. There’s nothing to plan here, and that’s a complete answer.
        </p>
      )}
      <Section
        title="The brief"
        hint="The plan is built from the diagnosis and the decision. Change those, then suggest again: steps you’ve accepted or changed are kept."
        aside={
          <button
            type="button"
            className={btn.primary}
            disabled={busy}
            onClick={async () => {
              const out = await act({ action: "plan-generate", id: d.theme.id });
              setNote(typeof out?.note === "string" ? out.note : "");
            }}
          >
            <Icon name="refresh" className="size-4" /> {steps.length ? "Suggest again" : "Suggest a plan"}
          </button>
        }
      >
        <dl className={cx(box, "grid gap-x-6 gap-y-2 text-sm sm:grid-cols-2")}>
          <div className="sm:col-span-2">
            <dt className="text-ink-muted">Behaviour</dt>
            <dd className="font-medium">{d.diagnosis.desired || r.desired || "Not stated yet"}</dd>
          </div>
          <div>
            <dt className="text-ink-muted">Barriers</dt>
            <dd>
              {d.diagnosis.barriers.length
                ? d.diagnosis.barriers.map((b) => `${b.text || BARRIERS[b.barrier].label} (${b.confidence})`).join("; ")
                : "None diagnosed yet"}
            </dd>
          </div>
          <div>
            <dt className="text-ink-muted">Learner time</dt>
            <dd>
              About {planned} minutes{r.effort.learnerMinutes ? "" : " (default: set it in the decision)"}
            </dd>
          </div>
        </dl>
        <div className={cx(box, "mt-3 flex flex-col gap-2")}>
          <p className="text-sm font-semibold">What can it be built from?</p>
          {(
            [
              ["hasArtefact", "There’s a realistic, fictional artefact to work on (an invoice, a form, a note)"],
              ["hasSource", "There’s an approved source for the rule or procedure"],
              ["assessed", "People must show it against a criterion, not just practise"],
            ] as const
          ).map(([k, label]) => (
            <label key={k} className="flex items-start gap-2">
              <input
                type="checkbox"
                className="mt-1 size-4"
                checked={r.brief[k]}
                disabled={busy}
                onChange={(e) => act({ action: "save-response", id: d.theme.id, data: { ...r, brief: { ...r.brief, [k]: e.target.checked } } })}
              />
              <span>{label}</span>
            </label>
          ))}
          {d.response.status === "approved" && <p className="text-xs text-ink-muted">Changing these returns the response decision to draft.</p>}
        </div>
        {(note || (!steps.length && d.plan.preview?.note)) && (
          <p className="mt-3 flex items-start gap-2 rounded-xl bg-gold/15 p-3 text-sm">
            <Icon name="info" className="mt-0.5 size-4 shrink-0" /> {note || d.plan.preview?.note}
          </p>
        )}
      </Section>

      {r.learning !== "none" && (
        <div className={cx(box, "mt-3 flex flex-wrap items-center gap-3")}>
          <p className="min-w-0 flex-1 basis-72 text-sm">
            <span className="font-semibold">Would a story help?</span> A Story Plan works out who this is happening to and which decision the learner makes,
            before any blocks are chosen. It’s optional, and it starts from the behaviour and barrier recorded here.
          </p>
          <button
            type="button"
            className={btn.secondary}
            disabled={busy}
            onClick={async () => {
              const out = await api<{ id?: string }>("/api/admin/story", { body: { action: "plan-from-theme", themeId: d.theme.id } }).catch(() => null);
              if (out?.id) router.push(`/admin/characters/plans/${out.id}`);
            }}
          >
            <Icon name="book" className="size-4" /> Plan a story
          </button>
        </div>
      )}

      <Section
        title="The plan"
        hint="Each step says why it’s there. Suggestions come from rules over the block registry, not from a model: accept, swap or remove them."
      >
        <ol className="flex flex-col gap-3">
          {steps.map((s, i) => (
            <li key={s.id} className={box}>
              <div className="flex flex-wrap items-center gap-2">
                <span className="font-mulish text-xs font-extrabold uppercase tracking-[0.14em] text-accent">
                  {i + 1}. {s.stepLabel}
                </span>
                <Badge tone={s.status === "accepted" ? "good" : "warn"}>{s.status === "accepted" ? "Accepted" : "Suggested"}</Badge>
                <span className="text-sm text-ink-muted">
                  About {s.minutes} min · {s.evidence}
                </span>
              </div>
              <p className="mt-1 font-serif text-lg font-semibold">{s.label}</p>
              {s.needs.length > 0 && (
                <p className="mt-1 flex items-start gap-2 rounded-xl bg-gold/15 p-2.5 text-sm">
                  <Icon name="alert" className="mt-0.5 size-4 shrink-0" /> Can’t be built yet. Still needed: {s.needs.join("; ").toLowerCase()}.
                </p>
              )}
              <details className="mt-2" open={s.status !== "accepted"}>
                <summary className="cursor-pointer font-semibold">Why this block</summary>
                <dl className="mt-2 grid gap-x-6 gap-y-2 text-sm sm:grid-cols-2">
                  {WHY.filter(([k]) => s.rationale[k]).map(([k, label]) => (
                    <div key={k} className={cx((k === "mechanism" || k === "needs" || k === "uncertain") && "sm:col-span-2")}>
                      <dt className="text-ink-muted">{label}</dt>
                      <dd>{s.rationale[k]}</dd>
                    </div>
                  ))}
                  {s.signoff && (
                    <div className="sm:col-span-2">
                      <dt className="text-ink-muted">Sign-off before publishing</dt>
                      <dd>{s.signoff}</dd>
                    </div>
                  )}
                  {s.overrideReason && (
                    <div className="sm:col-span-2">
                      <dt className="text-ink-muted">Author’s reason</dt>
                      <dd>{s.overrideReason}</dd>
                    </div>
                  )}
                </dl>
              </details>
              <div className="mt-2 flex flex-wrap items-center gap-1">
                {s.status !== "accepted" && (
                  <button
                    type="button"
                    className={btn.secondary}
                    disabled={busy}
                    onClick={() => act({ action: "plan-step", id: d.theme.id, stepId: s.id, op: "accept" })}
                  >
                    <Icon name="check" className="size-4" /> Accept
                  </button>
                )}
                {s.alternatives.map((a) => (
                  <button key={a.type} type="button" className={btn.quiet} onClick={() => setSwap({ stepId: s.id, blockType: a.type, reason: "" })}>
                    Use {a.label} instead
                  </button>
                ))}
                <button
                  type="button"
                  className={btn.quiet}
                  disabled={busy || i === 0}
                  aria-label="Move up"
                  onClick={() => act({ action: "plan-step", id: d.theme.id, stepId: s.id, op: "up" })}
                >
                  ↑
                </button>
                <button
                  type="button"
                  className={btn.quiet}
                  disabled={busy || i === steps.length - 1}
                  aria-label="Move down"
                  onClick={() => act({ action: "plan-step", id: d.theme.id, stepId: s.id, op: "down" })}
                >
                  ↓
                </button>
                <button
                  type="button"
                  className={btn.quiet}
                  disabled={busy}
                  onClick={() => act({ action: "plan-step", id: d.theme.id, stepId: s.id, op: "remove" })}
                >
                  <Icon name="trash" className="size-4" /> Remove
                </button>
              </div>
              {swap?.stepId === s.id && (
                <form
                  className="mt-2 flex flex-wrap items-end gap-2 rounded-xl bg-muted p-3"
                  onSubmit={async (e) => {
                    e.preventDefault();
                    if (await act({ action: "plan-step", id: d.theme.id, op: "replace", ...swap })) setSwap(null);
                  }}
                >
                  <Field
                    label={`Why ${d.blocks.find((b) => b.type === swap.blockType)?.label ?? swap.blockType} suits better`}
                    className="min-w-0 flex-1 basis-72"
                  >
                    <input className={input} value={swap.reason} onChange={(e) => setSwap({ ...swap, reason: e.target.value })} required minLength={5} />
                  </Field>
                  <button className={btn.secondary} disabled={busy}>
                    Swap
                  </button>
                  <button type="button" className={btn.quiet} onClick={() => setSwap(null)}>
                    Cancel
                  </button>
                </form>
              )}
            </li>
          ))}
          {!steps.length && <li className={cx(box, "text-ink-muted")}>No steps yet. Suggest a plan from the brief, or add a block yourself.</li>}
        </ol>

        <form
          className={cx(box, "mt-3 grid gap-3 sm:grid-cols-2")}
          onSubmit={async (e) => {
            e.preventDefault();
            if (await act({ action: "plan-add", id: d.theme.id, blockType: add.blockType, step: add.step, reason: add.reason }))
              setAdd({ blockType: "", step: "practise", reason: "", q: "" });
          }}
        >
          <p className="font-semibold sm:col-span-2">Add a block yourself</p>
          <Field label="Find a block by what the learner does" hint={`${found.length} of ${d.blocks.length} blocks`}>
            <input className={input} value={add.q} onChange={(e) => setAdd({ ...add, q: e.target.value })} placeholder="spot, decide, conversation, invoice…" />
          </Field>
          <Field label="Block">
            <select className={input} value={add.blockType} onChange={(e) => setAdd({ ...add, blockType: e.target.value })} required>
              <option value="">Choose…</option>
              {found.map((b) => (
                <option key={b.type} value={b.type}>
                  {b.label} · {b.minutes} min
                </option>
              ))}
            </select>
          </Field>
          {picked && (
            <p className="rounded-xl bg-muted p-3 text-sm sm:col-span-2">The learner {picked.purpose.charAt(0).toLowerCase() + picked.purpose.slice(1)}.</p>
          )}
          <Field label="Step">
            <select className={input} value={add.step} onChange={(e) => setAdd({ ...add, step: e.target.value })}>
              {Object.entries(PLAN_STEPS).map(([k, v]) => (
                <option key={k} value={k}>
                  {v}
                </option>
              ))}
            </select>
          </Field>
          <Field label="Why it belongs">
            <input className={input} value={add.reason} onChange={(e) => setAdd({ ...add, reason: e.target.value })} />
          </Field>
          <div>
            <button className={btn.secondary} disabled={busy}>
              Add to the plan
            </button>
          </div>
        </form>
      </Section>

      {steps.length > 0 && (
        <Section title="What the plan covers" hint="In words, not a score.">
          <ul className={cx(box, "flex flex-col gap-1.5 text-sm")}>
            <li>
              <strong className="tabular-nums">About {cov.minutes} minutes</strong> in total, against {planned} planned
              {cov.minutes > planned * 1.5 ? ": that’s well over. Cut a step, or justify the time." : "."}
            </li>
            {cov.practised.length > 0 && <li>Practised with feedback: {cov.practised.join("; ").toLowerCase()}.</li>}
            {cov.explainedOnly.length > 0 && <li className="text-warm">Only explained, never practised: {cov.explainedOnly.join("; ").toLowerCase()}.</li>}
            {cov.untouched.length > 0 && <li className="text-warm">Not addressed at all: {cov.untouched.join("; ").toLowerCase()}.</li>}
            {cov.notLearnable.length > 0 && (
              <li>Outside what learning can fix: {cov.notLearnable.join("; ").toLowerCase()}. These need their own action and owner.</li>
            )}
            {cov.repeated.length > 0 && <li>The same kind of activity more than twice: {cov.repeated.join("; ").toLowerCase()}.</li>}
            {cov.missingSource && <li className="text-warm">At least one step states a rule or procedure, and no approved source has been confirmed.</li>}
            {cov.noFeedback && <li className="text-warm">Nothing here gives the learner feedback: it’s all reading.</li>}
          </ul>
        </Section>
      )}
    </>
  );
}

// ---------------------------------------------------------------------------------------------
// 7. Measures
// ---------------------------------------------------------------------------------------------

export function MeasuresTab({ d, act, busy }: TabProps) {
  const r = d.response.data;
  const buckets = months(d.range.from, d.range.to);
  const [point, setPoint] = useState({ metric: "work", bucket: d.range.to, numerator: "", denominator: "", note: "" });
  const line = (metric: "work" | "practice") => {
    const by = new Map(d.metrics.filter((m) => m.metric === metric).map((m) => [m.bucket, m]));
    return {
      values: buckets.map((b) => by.get(b)?.rate ?? null),
      thin: buckets.map((b) => {
        const m = by.get(b);
        return Boolean(m && m.denominator !== null && m.denominator < SMALL_SAMPLE);
      }),
    };
  };
  const work = line("work");
  const practice = line("practice");
  const markers = markersOf(d);

  return (
    <>
      <Section
        title="Did work change?"
        hint="Two charts on the same months, each with its own scale. The numbered lines are when something was done. Two lines moving together don’t show that one caused the other."
      >
        <dl className={cx(box, "mb-3 grid gap-x-6 gap-y-2 text-sm sm:grid-cols-2")}>
          <div>
            <dt className="text-ink-muted">Work measure</dt>
            <dd className="font-medium">{r.measure.name || "Not named yet: set it in the response decision"}</dd>
          </div>
          <div>
            <dt className="text-ink-muted">Data owner</dt>
            <dd>{r.measure.owner || "None named"}</dd>
          </div>
          {r.measure.definition && (
            <div className="sm:col-span-2">
              <dt className="text-ink-muted">How it’s counted</dt>
              <dd>{r.measure.definition}</dd>
            </div>
          )}
          <div>
            <dt className="text-ink-muted">Baseline</dt>
            <dd>{[r.baseline.window, r.baseline.note].filter(Boolean).join(": ") || "Not measured"}</dd>
          </div>
          <div>
            <dt className="text-ink-muted">What else could move it</dt>
            <dd>{r.competing || "Nothing recorded"}</dd>
          </div>
        </dl>
        <div className="grid gap-3">
          <LineChart
            title={r.measure.name || "Work measure"}
            note="At work. Rate per 100, from the data owner’s report."
            unit="per 100"
            buckets={buckets}
            series={[{ key: "work", name: "Work measure", slot: 1, ...work }]}
            markers={markers}
            empty="Not measured yet. Add the monthly figure from the data owner’s report below."
          />
          <LineChart
            title="First attempts correct in practice"
            note="In the learning. Rate per 100 first attempts. This is practice, not work."
            unit="per 100"
            buckets={buckets}
            series={[{ key: "practice", name: "Practice measure", slot: 3, ...practice }]}
            markers={markers}
            empty="No practice figures yet."
          />
        </div>
        <p className="mt-3 text-sm text-ink-muted">
          Hollow points rest on fewer than {SMALL_SAMPLE} in the denominator: too few to read a trend from. A missing month is a month nobody measured, not
          zero.
        </p>
      </Section>

      <Section title="The figures" hint="Typed in from the named report, as dated aggregates. No names, and nothing the Hub worked out for itself.">
        <div className={cx(box, "overflow-x-auto")}>
          <table className="w-full min-w-[34rem] border-collapse text-left text-sm tabular-nums">
            <thead>
              <tr className="border-b border-line-strong">
                {["Month", "Measure", "Count", "Out of", "Per 100", "Note", ""].map((h) => (
                  <th key={h} scope="col" className="py-1.5 pr-3 font-semibold">
                    {h}
                  </th>
                ))}
              </tr>
            </thead>
            <tbody>
              {d.metrics.map((m) => (
                <tr key={m.id} className="border-b border-line">
                  <th scope="row" className="py-1.5 pr-3 font-normal">
                    {monthLabel(m.bucket, true)}
                  </th>
                  <td className="py-1.5 pr-3">{m.metric === "work" ? "Work" : "Practice"}</td>
                  <td className="py-1.5 pr-3">{m.numerator}</td>
                  <td className="py-1.5 pr-3">{m.denominator ?? "Not known"}</td>
                  <td className="py-1.5 pr-3">{m.rate ?? "Insufficient data"}</td>
                  <td className="py-1.5 pr-3 text-ink-muted">{m.note}</td>
                  <td className="py-1.5">
                    <button
                      type="button"
                      className={btn.quiet}
                      disabled={busy}
                      aria-label={`Remove ${monthLabel(m.bucket, true)}`}
                      onClick={() => act({ action: "remove-metric", id: d.theme.id, pointId: m.id })}
                    >
                      <Icon name="trash" className="size-4" />
                    </button>
                  </td>
                </tr>
              ))}
              {!d.metrics.length && (
                <tr>
                  <td colSpan={7} className="py-3 text-ink-muted">
                    Nothing measured yet.
                  </td>
                </tr>
              )}
            </tbody>
          </table>
        </div>
        <form
          className={cx(box, "mt-3 grid gap-3 sm:grid-cols-2 lg:grid-cols-[10rem_10rem_8rem_8rem_1fr_auto]")}
          onSubmit={async (e) => {
            e.preventDefault();
            if (await act({ action: "metric", id: d.theme.id, ...point })) setPoint({ ...point, numerator: "", denominator: "", note: "" });
          }}
        >
          <Field label="Measure">
            <select className={input} value={point.metric} onChange={(e) => setPoint({ ...point, metric: e.target.value })}>
              <option value="work">Work</option>
              <option value="practice">Practice</option>
            </select>
          </Field>
          <Field label="Month">
            <input type="month" className={input} value={point.bucket} onChange={(e) => setPoint({ ...point, bucket: e.target.value })} required />
          </Field>
          <Field label="Count">
            <input className={input} inputMode="decimal" value={point.numerator} onChange={(e) => setPoint({ ...point, numerator: e.target.value })} required />
          </Field>
          <Field label="Out of">
            <input className={input} inputMode="decimal" value={point.denominator} onChange={(e) => setPoint({ ...point, denominator: e.target.value })} />
          </Field>
          <Field label="Note">
            <input className={input} value={point.note} onChange={(e) => setPoint({ ...point, note: e.target.value })} />
          </Field>
          <div className="flex items-end">
            <button className={btn.secondary} disabled={busy}>
              Add
            </button>
          </div>
        </form>
      </Section>
    </>
  );
}

// ---------------------------------------------------------------------------------------------
// 8. Review
// ---------------------------------------------------------------------------------------------

export function ReviewTab({ d, act, busy }: TabProps) {
  const r = d.response.data;
  const [form, setForm] = useState({ decision: "keep" as ReviewDecision, decidedOn: d.asAt, evidence: "", uncertainties: "" });
  const approved = d.response.status === "approved";

  return (
    <>
      <Section
        title="Review the response"
        hint={`Review ${r.reviewOn ? `is due ${dateText(r.reviewOn)}` : "date not set"}. Look at the work measure first, then the practice figures, then what else changed. Withdrawing or closing is as good an outcome as keeping.`}
      >
        {!approved ? (
          <p className={cx(box, "text-ink-muted")}>There’s no approved response to review yet.</p>
        ) : (
          <form
            className={cx(box, "grid gap-3 sm:grid-cols-2")}
            onSubmit={async (e) => {
              e.preventDefault();
              if (await act({ action: "review", id: d.theme.id, ...form })) setForm({ ...form, evidence: "", uncertainties: "" });
            }}
          >
            <Field label="Decision">
              <select className={input} value={form.decision} onChange={(e) => setForm({ ...form, decision: e.target.value as ReviewDecision })}>
                {Object.entries(REVIEW_DECISIONS).map(([k, v]) => (
                  <option key={k} value={k}>
                    {v}
                  </option>
                ))}
              </select>
            </Field>
            <Field label="Decided on">
              <input type="date" className={input} value={form.decidedOn} onChange={(e) => setForm({ ...form, decidedOn: e.target.value })} />
            </Field>
            <Field label="What the evidence shows, and what it doesn’t" className="sm:col-span-2">
              <textarea className={area} value={form.evidence} onChange={(e) => setForm({ ...form, evidence: e.target.value })} required minLength={20} />
            </Field>
            <Field label="What’s still uncertain" className="sm:col-span-2">
              <textarea className={area} value={form.uncertainties} onChange={(e) => setForm({ ...form, uncertainties: e.target.value })} />
            </Field>
            {form.decision === "close" && (
              <p className="rounded-xl bg-muted p-3 text-sm sm:col-span-2">
                Closing sets the theme to “Closed with evidence”, with this as the evidence. It doesn’t close any source record.
              </p>
            )}
            <div>
              <button className={btn.primary} disabled={busy}>
                Record the review
              </button>
            </div>
          </form>
        )}
      </Section>
      <Section title="Earlier reviews">
        <ul className="flex flex-col gap-3">
          {d.reviews.map((v) => (
            <li key={v.id} className={box}>
              <div className="flex flex-wrap items-center gap-2">
                <Badge tone="info">{REVIEW_DECISIONS[v.decision]}</Badge>
                <span className="text-sm text-ink-muted">{dateText(v.decidedOn)}</span>
              </div>
              <p className="mt-1.5">{v.evidence}</p>
              {v.uncertainties && <p className="mt-1 text-sm text-ink-muted">Still uncertain: {v.uncertainties}</p>}
            </li>
          ))}
          {!d.reviews.length && <li className={cx(box, "text-ink-muted")}>None yet.</li>}
        </ul>
      </Section>
    </>
  );
}
