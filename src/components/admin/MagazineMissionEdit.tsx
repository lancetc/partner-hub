"use client";

import { cx } from "@/lib/format";
import type { MissionBlock } from "@/lib/magazine";
import {
  ACTION_ROLES,
  ANCHORS,
  CARE_MODELS,
  DIMENSIONS,
  firstStatement,
  freshMission,
  INFORMED,
  LEARNER_ROLES,
  missionApproved,
  MISSION_STATUSES,
  READINESS,
  showDate,
  STATUSES,
  TARGET_KINDS,
  type ActionRole,
  type CareModel,
  type DateAnchor,
  type Dim,
  type Informed,
  type LearnerRole,
  type MissionAction,
  type MissionStatus,
  type Readiness,
  type TargetKind,
} from "@/lib/mission";
import { MISSION_CASES } from "@/content/missionCases";
import { btn, Field, input } from "./ui";
import { rid, type Update } from "./MagazineEditParts";
import { Icon } from "../Icon";

/*
  The editor for a First 30 Days Mission Board (docs/mission-board.md): the participant and dates, the
  board's tasks and what each depends on, the dated decision points and what each choice is worth, the
  example close-the-loop, and the sign-off. A case can't be published until Care Operations, Supplier
  Compliance, Finance and Quality have signed it off: its dates, screening routes and statement rules are policy.
*/

const area = cx(input, "min-h-20 py-2");
const group = "rounded-2xl bg-muted p-3";
const inner = "mt-2 grid gap-2 rounded-xl bg-surface p-3";
const lines = (v: string) => v.split("\n");
const num = (v: string) => (v === "" ? 0 : Number(v));

export function MissionEdit({ block: b, update }: { block: MissionBlock; update: Update }) {
  const set = (fn: (x: MissionBlock) => void, tag?: string) => update<MissionBlock>(b.id, fn, tag && `${b.id}:${tag}`);
  const signed = missionApproved(b);
  const st = firstStatement(b);
  const taskTitle = (id: string) => b.tasks.find((t) => t.id === id)?.title || "untitled task";
  const promising = b.checkpoints.flatMap((c) => c.actions.filter((a) => a.promise).map((a) => ({ id: a.id, label: `Day ${c.day}: ${a.promise}` })));

  return (
    <div className="w-full rounded-3xl border border-line-strong bg-surface p-5 shadow-sm sm:p-7">
      <p className="mb-2 flex items-center gap-2 font-mulish text-sm font-extrabold uppercase tracking-[0.12em] text-accent">
        <Icon name="calendar" className="size-5" /> First 30 Days Mission Board
      </p>
      <p
        role="status"
        className={cx(
          "rounded-2xl px-4 py-3 text-sm font-semibold",
          signed ? "bg-[#e3f4ea] text-[#0f5b3a] dark:bg-[#12392a] dark:text-[#8fe0b5]" : "bg-[#fff1cc] text-[#4a3400] dark:bg-[#3d2f08] dark:text-[#ffd97a]",
        )}
      >
        {signed
          ? `Signed off by ${b.approval.owner} (Care Operations), ${b.approval.compliance} (Supplier Compliance), ${b.approval.finance} (Finance) and ${b.approval.quality} (Quality) on ${b.approval.approvedOn}.`
          : "Sign-off required. This case can’t be published until Care Operations, Supplier Compliance, Finance and Quality sign-off and the source version are recorded below."}
      </p>

      <div className="mt-3 flex flex-wrap items-center gap-2">
        <span className="text-sm font-semibold">Start from a case:</span>
        {MISSION_CASES.map((c) => (
          <button
            key={c.id}
            type="button"
            className={btn.secondary}
            title={c.teaches}
            onClick={() => {
              if (window.confirm(`Replace this block with the starter case “${c.name}”? What’s in the block now is lost, including any sign-off recorded.`))
                set((x) => void Object.assign(x, freshMission(c.data)));
            }}
          >
            {c.name}
          </button>
        ))}
      </div>
      <p className="mt-1 text-xs text-ink-muted">
        Starter cases are fictional drafts written from the PRD. Reviewers check every date, script and answer against current guidance before signing off.
      </p>

      <div className="mt-4 grid gap-3 sm:grid-cols-2">
        <Field label="Title">
          <input className={input} value={b.title} maxLength={160} onChange={(e) => set((x) => void (x.title = e.target.value), "title")} />
        </Field>
        <Field label="Introduction">
          <input className={input} value={b.intro} maxLength={600} onChange={(e) => set((x) => void (x.intro = e.target.value), "intro")} />
        </Field>
        <Field label="The participant" hint="A made-up name. Never a real participant.">
          <input className={input} value={b.participant.name} maxLength={80} onChange={(e) => set((x) => void (x.participant.name = e.target.value), "pn")} />
        </Field>
        <Field label="Age">
          <input
            type="number"
            className={input}
            value={b.participant.age ?? ""}
            min={50}
            max={110}
            onChange={(e) => set((x) => void (x.participant.age = e.target.value === "" ? null : Number(e.target.value)), "pa")}
          />
        </Field>
        <Field label="About them" className="sm:col-span-2">
          <textarea
            className={area}
            value={b.participant.about}
            maxLength={800}
            onChange={(e) => set((x) => void (x.participant.about = e.target.value), "pb")}
          />
        </Field>
        <Field label="Who may be involved, with their consent" className="sm:col-span-2">
          <input
            className={input}
            value={b.participant.consent}
            maxLength={400}
            onChange={(e) => set((x) => void (x.participant.consent = e.target.value), "pc")}
          />
        </Field>
        <Field label="Care model">
          <select className={input} value={b.careModel} onChange={(e) => set((x) => void (x.careModel = e.target.value as CareModel))}>
            {(Object.keys(CARE_MODELS) as CareModel[]).map((k) => (
              <option key={k} value={k}>
                {CARE_MODELS[k].label}
              </option>
            ))}
          </select>
        </Field>
        <Field label="The learner’s role">
          <select className={input} value={b.learnerRole} onChange={(e) => set((x) => void (x.learnerRole = e.target.value as LearnerRole))}>
            {(Object.keys(LEARNER_ROLES) as LearnerRole[]).map((k) => (
              <option key={k} value={k}>
                {LEARNER_ROLES[k].label}
              </option>
            ))}
          </select>
        </Field>
        <Field label="Who the learner is in this case" className="sm:col-span-2">
          <input className={input} value={b.roleNote} maxLength={300} onChange={(e) => set((x) => void (x.roleNote = e.target.value), "rn")} />
        </Field>
      </div>

      <details className={cx(group, "mt-3")}>
        <summary className="min-h-11 cursor-pointer py-2 font-semibold">Dates</summary>
        <p className="text-xs text-ink-muted">
          Three separate dates. They can fall on the same day. Day 0 is the day the referral is accepted; every other day in the case counts from it.
        </p>
        <div className="mt-2 grid gap-3 sm:grid-cols-3">
          <Field label="Funding allocated">
            <input
              type="date"
              className={input}
              value={b.dates.fundingAllocation}
              onChange={(e) => set((x) => void (x.dates.fundingAllocation = e.target.value))}
            />
          </Field>
          <Field label="Provider chosen">
            <input
              type="date"
              className={input}
              value={b.dates.providerSelection}
              onChange={(e) => set((x) => void (x.dates.providerSelection = e.target.value))}
            />
          </Field>
          <Field label="Referral accepted (Day 0)">
            <input
              type="date"
              className={input}
              value={b.dates.referralAccepted}
              onChange={(e) => set((x) => void (x.dates.referralAccepted = e.target.value))}
            />
          </Field>
          <Field label="First planned service (day)">
            <input
              type="number"
              className={input}
              min={0}
              max={120}
              value={b.firstServiceDay}
              onChange={(e) => set((x) => void (x.firstServiceDay = num(e.target.value)), "fs")}
            />
          </Field>
          <Field label="First statement issued (day)" hint="After the first calendar month ends, and by its due date.">
            <input
              type="number"
              className={input}
              min={0}
              max={120}
              value={b.statementIssuedDay}
              onChange={(e) => set((x) => void (x.statementIssuedDay = num(e.target.value)), "si")}
            />
          </Field>
          <label className="flex min-h-11 items-center gap-2 self-end text-sm font-semibold">
            <input
              type="checkbox"
              className="size-5"
              checked={b.noServicesFirstMonth}
              onChange={(e) => set((x) => void (x.noServicesFirstMonth = e.target.checked))}
            />
            No services in the first month
          </label>
        </div>
        {st && (
          <p className="mt-2 text-sm">
            First statement covers {st.month}, due by {showDate(st.due)} (Day {st.dueDay}); issued in this case on {showDate(st.issued)}.
          </p>
        )}
      </details>

      <details className={cx(group, "mt-3")}>
        <summary className="min-h-11 cursor-pointer py-2 font-semibold">The board ({b.tasks.length} tasks)</summary>
        <p className="text-xs text-ink-muted">
          A task can’t be marked done until the tasks it comes after are. Label every target honestly: a government rule, a Trilogy Care target, or a date made
          up for the case.
        </p>
        {b.tasks.map((t, i) => {
          const put = (fn: (x: MissionBlock["tasks"][number]) => void, tag?: string) => set((x) => fn(x.tasks[i]), tag && `t${i}${tag}`);
          return (
            <details key={t.id} className={inner}>
              <summary className="min-h-11 cursor-pointer py-2 font-semibold">{t.title || "Untitled task"}</summary>
              <div className="grid gap-2 sm:grid-cols-2">
                <Field label="Task">
                  <input className={input} value={t.title} maxLength={120} onChange={(e) => put((x) => void (x.title = e.target.value), "t")} />
                </Field>
                <Field label="Owner (a role)">
                  <input className={input} value={t.owner} maxLength={120} onChange={(e) => put((x) => void (x.owner = e.target.value), "o")} />
                </Field>
                <Field label="What it needs" className="sm:col-span-2">
                  <textarea className={area} value={t.needs} maxLength={600} onChange={(e) => put((x) => void (x.needs = e.target.value), "n")} />
                </Field>
                <Field label="Target counts from">
                  <select className={input} value={t.target.anchor} onChange={(e) => put((x) => void (x.target.anchor = e.target.value as DateAnchor))}>
                    {(Object.keys(ANCHORS) as DateAnchor[]).map((k) => (
                      <option key={k} value={k}>
                        {ANCHORS[k]}
                      </option>
                    ))}
                  </select>
                </Field>
                <div className="grid grid-cols-2 gap-2">
                  <Field label="Days after (or before, negative)">
                    <input
                      type="number"
                      className={input}
                      value={t.target.offset}
                      onChange={(e) => put((x) => void (x.target.offset = num(e.target.value)), "f")}
                    />
                  </Field>
                  <Field label="Kind of target">
                    <select className={input} value={t.target.kind} onChange={(e) => put((x) => void (x.target.kind = e.target.value as TargetKind))}>
                      {(Object.keys(TARGET_KINDS) as TargetKind[]).map((k) => (
                        <option key={k} value={k}>
                          {TARGET_KINDS[k]}
                        </option>
                      ))}
                    </select>
                  </Field>
                </div>
                <Field label="Can’t be done before day" hint="Blank for no limit.">
                  <input
                    type="number"
                    className={input}
                    value={t.notBeforeDay ?? ""}
                    onChange={(e) => put((x) => void (x.notBeforeDay = e.target.value === "" ? null : Number(e.target.value)), "nb")}
                  />
                </Field>
                <Field label="Starts as">
                  <select className={input} value={t.start} onChange={(e) => put((x) => void (x.start = e.target.value as MissionStatus))}>
                    {MISSION_STATUSES.map((k) => (
                      <option key={k} value={k}>
                        {STATUSES[k].label}
                      </option>
                    ))}
                  </select>
                </Field>
                {t.notBeforeDay !== null && (
                  <Field label="Why not before then" className="sm:col-span-2">
                    <input
                      className={input}
                      value={t.notBeforeWhy}
                      maxLength={300}
                      onChange={(e) => put((x) => void (x.notBeforeWhy = e.target.value), "nw")}
                    />
                  </Field>
                )}
                <div className="sm:col-span-2">
                  <Picks tasks={b.tasks} label="Comes after" value={t.dependsOn} exclude={t.id} onChange={(v) => put((x) => void (x.dependsOn = v))} />
                </div>
              </div>
              <div>
                <button type="button" className={btn.quiet} onClick={() => set((x) => void x.tasks.splice(i, 1))}>
                  <Icon name="trash" className="size-4" /> Remove this task
                </button>
              </div>
            </details>
          );
        })}
        <button
          type="button"
          className={cx(btn.secondary, "mt-2")}
          onClick={() =>
            set(
              (x) =>
                void x.tasks.push({
                  id: rid("task"),
                  title: "",
                  owner: "",
                  needs: "",
                  dependsOn: [],
                  target: { anchor: "referral_accepted", offset: 0, kind: "case" },
                  notBeforeDay: null,
                  notBeforeWhy: "",
                  start: "to_plan",
                }),
            )
          }
        >
          <Icon name="plus" className="size-4" /> Add a task
        </button>
      </details>

      {b.checkpoints.map((c, i) => {
        const put = (fn: (x: MissionBlock["checkpoints"][number]) => void, tag?: string) => set((x) => fn(x.checkpoints[i]), tag && `c${i}${tag}`);
        return (
          <details key={c.id} className={cx(group, "mt-3")}>
            <summary className="min-h-11 cursor-pointer py-2 font-semibold">
              Day {c.day}: {c.title || "untitled"} ({c.actions.length} choices)
            </summary>
            <div className="grid gap-2 sm:grid-cols-[8rem_1fr]">
              <Field label="Day">
                <input type="number" className={input} min={0} max={120} value={c.day} onChange={(e) => put((x) => void (x.day = num(e.target.value)), "d")} />
              </Field>
              <Field label="What happens">
                <input className={input} value={c.title} maxLength={120} onChange={(e) => put((x) => void (x.title = e.target.value), "t")} />
              </Field>
              <Field label="The facts, one per line" className="sm:col-span-2">
                <textarea className={area} value={c.facts.join("\n")} onChange={(e) => put((x) => void (x.facts = lines(e.target.value)), "f")} />
              </Field>
              <div className="sm:col-span-2">
                <Picks tasks={b.tasks} label="Puts at risk when it arrives" value={c.atRisk} onChange={(v) => put((x) => void (x.atRisk = v))} />
              </div>
              <div className="sm:col-span-2">
                <Picks
                  tasks={b.tasks}
                  label="Must be done before the case reaches it (a start gate)"
                  value={c.requires}
                  onChange={(v) => put((x) => void (x.requires = v))}
                />
              </div>
              {c.requires.length > 0 && (
                <Field label="Why those come first" className="sm:col-span-2">
                  <input className={input} value={c.requireWhy} maxLength={400} onChange={(e) => put((x) => void (x.requireWhy = e.target.value), "rw")} />
                </Field>
              )}
              <Field label="Service readiness if no choice says otherwise">
                <select className={input} value={c.readiness} onChange={(e) => put((x) => void (x.readiness = e.target.value as Readiness))}>
                  {(Object.keys(READINESS) as Readiness[]).map((k) => (
                    <option key={k} value={k}>
                      {READINESS[k]}
                    </option>
                  ))}
                </select>
              </Field>
              <Field label="Outstanding risk if no choice says otherwise">
                <input className={input} value={c.risk} maxLength={300} onChange={(e) => put((x) => void (x.risk = e.target.value), "r")} />
              </Field>
            </div>

            <label className="mt-2 flex min-h-11 items-center gap-2 text-sm font-semibold">
              <input
                type="checkbox"
                className="size-5"
                checked={Boolean(c.message)}
                onChange={(e) => put((x) => void (x.message = e.target.checked ? { prompt: "Write what you’d say.", checklist: [], model: "" } : null))}
              />
              The learner also writes what they’d say
            </label>
            {c.message && (
              <div className={inner}>
                <Field label="Prompt">
                  <input
                    className={input}
                    value={c.message.prompt}
                    maxLength={300}
                    onChange={(e) => put((x) => void (x.message!.prompt = e.target.value), "mp")}
                  />
                </Field>
                <Field label="What a good message does, one per line" hint="Shown after they’ve written theirs.">
                  <textarea
                    className={area}
                    value={c.message.checklist.join("\n")}
                    onChange={(e) => put((x) => void (x.message!.checklist = lines(e.target.value)), "mc")}
                  />
                </Field>
                <Field label="An example message" hint="Shown after. Don’t promise a service a real case might not have.">
                  <textarea
                    className={area}
                    value={c.message.model}
                    maxLength={1500}
                    onChange={(e) => put((x) => void (x.message!.model = e.target.value), "mm")}
                  />
                </Field>
              </div>
            )}

            <p className="mt-3 text-sm font-semibold">Choices</p>
            <p className="text-xs text-ink-muted">
              A choice marked unsafe or misleading, or a decision with nothing that’s needed, sends the learner back to think again. Say why in its feedback.
            </p>
            {c.actions.map((a, j) => (
              <ActionEdit
                key={a.id}
                a={a}
                n={j + 1}
                tasks={b.tasks.map((t) => ({ id: t.id, title: t.title }))}
                promising={promising.filter((p) => p.id !== a.id)}
                taskTitle={taskTitle}
                put={(fn, tag) => put((x) => fn(x.actions[j]), tag && `a${j}${tag}`)}
                remove={() => put((x) => void x.actions.splice(j, 1))}
              />
            ))}
            <div className="mt-2 flex flex-wrap gap-2">
              <button
                type="button"
                className={btn.secondary}
                onClick={() =>
                  put(
                    (x) =>
                      void x.actions.push({
                        id: rid("choice"),
                        label: "",
                        role: "helpful",
                        dim: "sequencing",
                        feedback: "",
                        consequence: "",
                        told: "",
                        promise: "",
                        keeps: "",
                        readiness: "",
                        informed: "",
                        risk: "",
                        sets: [],
                      }),
                  )
                }
              >
                <Icon name="plus" className="size-4" /> Add a choice
              </button>
              <button type="button" className={btn.quiet} onClick={() => set((x) => void x.checkpoints.splice(i, 1))}>
                <Icon name="trash" className="size-4" /> Remove Day {c.day}
              </button>
            </div>
          </details>
        );
      })}
      <button
        type="button"
        className={cx(btn.secondary, "mt-3")}
        onClick={() =>
          set(
            (x) =>
              void x.checkpoints.push({
                id: rid("day"),
                day: Math.min(120, (x.checkpoints.at(-1)?.day ?? 0) + 7),
                title: "",
                facts: [],
                atRisk: [],
                requires: [],
                requireWhy: "",
                actions: [],
                message: null,
                readiness: "ready",
                risk: "",
              }),
          )
        }
      >
        <Icon name="plus" className="size-4" /> Add a decision point
      </button>

      <details className={cx(group, "mt-3")}>
        <summary className="min-h-11 cursor-pointer py-2 font-semibold">The debrief’s example close-the-loop</summary>
        <textarea className={area} value={b.closing} maxLength={1500} onChange={(e) => set((x) => void (x.closing = e.target.value), "cl")} />
      </details>

      <details className={cx(group, "mt-3")} open={!signed}>
        <summary className="min-h-11 cursor-pointer py-2 font-semibold">Source and sign-off</summary>
        <div className="grid gap-3 sm:grid-cols-2">
          <Field label="Policy source the case was checked against" className="sm:col-span-2">
            <input className={input} value={b.source.title} maxLength={200} onChange={(e) => set((x) => void (x.source.title = e.target.value), "st")} />
          </Field>
          <Field label="Its version">
            <input className={input} value={b.source.version} maxLength={80} onChange={(e) => set((x) => void (x.source.version = e.target.value), "sv")} />
          </Field>
          <Field label="Checked against it on">
            <input type="date" className={input} value={b.source.reviewedOn} onChange={(e) => set((x) => void (x.source.reviewedOn = e.target.value))} />
          </Field>
          <Field label="Care Operations owner">
            <input className={input} value={b.approval.owner} maxLength={120} onChange={(e) => set((x) => void (x.approval.owner = e.target.value), "ao")} />
          </Field>
          <Field label="Supplier Compliance (worker checks)">
            <input
              className={input}
              value={b.approval.compliance}
              maxLength={120}
              onChange={(e) => set((x) => void (x.approval.compliance = e.target.value), "ac")}
            />
          </Field>
          <Field label="Finance (budget and statement)">
            <input
              className={input}
              value={b.approval.finance}
              maxLength={120}
              onChange={(e) => set((x) => void (x.approval.finance = e.target.value), "af")}
            />
          </Field>
          <Field label="Quality or policy (regulated wording)">
            <input
              className={input}
              value={b.approval.quality}
              maxLength={120}
              onChange={(e) => set((x) => void (x.approval.quality = e.target.value), "aq")}
            />
          </Field>
          <Field label="Signed off on">
            <input type="date" className={input} value={b.approval.approvedOn} onChange={(e) => set((x) => void (x.approval.approvedOn = e.target.value))} />
          </Field>
        </div>
        <p className="mt-2 text-xs text-ink-muted">
          Record the people who actually reviewed it. Changing the case after sign-off means it needs signing off again: clear and re-enter the date when it has
          been.
        </p>
      </details>
    </div>
  );
}

/** Tick the tasks a task comes after, or a decision point puts at risk or needs first. */
function Picks({
  tasks,
  label,
  value,
  onChange,
  exclude,
}: {
  tasks: { id: string; title: string }[];
  label: string;
  value: string[];
  onChange: (v: string[]) => void;
  exclude?: string;
}) {
  return (
    <fieldset className="flex flex-col gap-1">
      <legend className="text-sm font-semibold">{label}</legend>
      <div className="flex flex-wrap gap-x-4 gap-y-1">
        {tasks
          .filter((t) => t.id !== exclude)
          .map((t) => (
            <label key={t.id} className="flex min-h-11 items-center gap-2 text-sm">
              <input
                type="checkbox"
                className="size-5"
                checked={value.includes(t.id)}
                onChange={(e) => onChange(e.target.checked ? [...value, t.id] : value.filter((x) => x !== t.id))}
              />
              {t.title || "untitled task"}
            </label>
          ))}
      </div>
    </fieldset>
  );
}

function ActionEdit({
  a,
  n,
  tasks,
  promising,
  taskTitle,
  put,
  remove,
}: {
  a: MissionAction;
  n: number;
  tasks: { id: string; title: string }[];
  promising: { id: string; label: string }[];
  taskTitle: (id: string) => string;
  put: (fn: (x: MissionAction) => void, tag?: string) => void;
  remove: () => void;
}) {
  return (
    <details className={inner}>
      <summary className="min-h-11 cursor-pointer py-2 font-semibold">
        {a.label || `Choice ${n}`} · {ACTION_ROLES[a.role]}
      </summary>
      <div className="grid gap-2 sm:grid-cols-2">
        <Field label="The choice" className="sm:col-span-2">
          <input className={input} value={a.label} maxLength={200} onChange={(e) => put((x) => void (x.label = e.target.value), "l")} />
        </Field>
        <Field label="What it’s worth in this case">
          <select className={input} value={a.role} onChange={(e) => put((x) => void (x.role = e.target.value as ActionRole))}>
            {(Object.keys(ACTION_ROLES) as ActionRole[]).map((k) => (
              <option key={k} value={k}>
                {ACTION_ROLES[k]}
              </option>
            ))}
          </select>
        </Field>
        <Field label="What it shows">
          <select className={input} value={a.dim} onChange={(e) => put((x) => void (x.dim = e.target.value as Dim))}>
            {(Object.keys(DIMENSIONS) as Dim[]).map((k) => (
              <option key={k} value={k}>
                {DIMENSIONS[k].label}
              </option>
            ))}
          </select>
        </Field>
        <Field label="Feedback" className="sm:col-span-2">
          <textarea className={area} value={a.feedback} maxLength={700} onChange={(e) => put((x) => void (x.feedback = e.target.value), "f")} />
        </Field>
        <Field label="In the made-up timeline, what happens next (optional)" className="sm:col-span-2">
          <input className={input} value={a.consequence} maxLength={400} onChange={(e) => put((x) => void (x.consequence = e.target.value), "c")} />
        </Field>
        <Field label="What the participant hears (optional)" className="sm:col-span-2">
          <input className={input} value={a.told} maxLength={400} onChange={(e) => put((x) => void (x.told = e.target.value), "t")} />
        </Field>
        <Field label="A promise it makes (optional)">
          <input className={input} value={a.promise} maxLength={200} onChange={(e) => put((x) => void (x.promise = e.target.value), "p")} />
        </Field>
        <Field label="Keeps an earlier promise">
          <select className={input} value={a.keeps} onChange={(e) => put((x) => void (x.keeps = e.target.value))}>
            <option value="">None</option>
            {promising.map((p) => (
              <option key={p.id} value={p.id}>
                {p.label}
              </option>
            ))}
          </select>
        </Field>
        <Field label="Service readiness after it">
          <select className={input} value={a.readiness} onChange={(e) => put((x) => void (x.readiness = e.target.value as Readiness | ""))}>
            <option value="">No change</option>
            {(Object.keys(READINESS) as Readiness[]).map((k) => (
              <option key={k} value={k}>
                {READINESS[k]}
              </option>
            ))}
          </select>
        </Field>
        <Field label="Participant informed after it">
          <select className={input} value={a.informed} onChange={(e) => put((x) => void (x.informed = e.target.value as Informed | ""))}>
            <option value="">No change</option>
            {(Object.keys(INFORMED) as Informed[]).map((k) => (
              <option key={k} value={k}>
                {INFORMED[k]}
              </option>
            ))}
          </select>
        </Field>
        <Field label="Outstanding risk after it (optional)" className="sm:col-span-2">
          <input className={input} value={a.risk} maxLength={300} onChange={(e) => put((x) => void (x.risk = e.target.value), "r")} />
        </Field>
      </div>
      <p className="text-sm font-semibold">What it does to the board</p>
      {a.sets.map((s, k) => (
        <div key={k} className="grid grid-cols-[minmax(0,1fr)_minmax(0,1fr)_auto] gap-2">
          <select aria-label={`Task ${k + 1}`} className={input} value={s.task} onChange={(e) => put((x) => void (x.sets[k].task = e.target.value))}>
            {tasks.map((t) => (
              <option key={t.id} value={t.id}>
                {t.title || "untitled task"}
              </option>
            ))}
          </select>
          <select
            aria-label={`Status for ${taskTitle(s.task)}`}
            className={input}
            value={s.status}
            onChange={(e) => put((x) => void (x.sets[k].status = e.target.value as MissionStatus))}
          >
            {MISSION_STATUSES.map((x) => (
              <option key={x} value={x}>
                {STATUSES[x].label}
              </option>
            ))}
          </select>
          <button type="button" className={btn.quiet} aria-label={`Remove board change ${k + 1}`} onClick={() => put((x) => void x.sets.splice(k, 1))}>
            <Icon name="trash" className="size-4" />
          </button>
        </div>
      ))}
      <div className="flex flex-wrap gap-2">
        <button
          type="button"
          className={btn.secondary}
          disabled={!tasks.length}
          onClick={() => put((x) => void x.sets.push({ task: tasks[0].id, status: "ready" }))}
        >
          <Icon name="plus" className="size-4" /> Add a board change
        </button>
        <button type="button" className={btn.quiet} onClick={remove}>
          <Icon name="trash" className="size-4" /> Remove this choice
        </button>
      </div>
    </details>
  );
}
