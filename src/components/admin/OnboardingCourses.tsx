"use client";

import { useState } from "react";
import { api, useApi } from "@/lib/api";
import { cx, formatDate, formatDateTime } from "@/lib/format";
import {
  SEGMENTS,
  SERVICE_TYPES,
  STAFF_FUNCTIONS,
  TRIGGERS,
  type CourseData,
  type RuleData,
  type Segment,
  type ServiceType,
  type StaffFunction,
} from "@/lib/onboardingCourses";
import type {
  courseAudit,
  courseReport,
  coursesAdmin,
  exceptionsQueue,
  personCourses,
  previewLearner,
  previewRule,
  searchPeople,
} from "@/server/onboardingCourses";
import { Badge, btn, ErrorNote, Field, input } from "./ui";
import { StepList } from "../onboarding/CourseParts";

/*
  Starting courses, for the people who run onboarding (docs/onboarding.md, "Starting courses"): course templates,
  assignment rules with an IF/THEN summary and an audience preview before publishing, each person's enrolments and
  why, the exceptions queue, reports with separate denominators, the audit trail, and the learner preview.
*/

type Overview = ReturnType<typeof coursesAdmin>;
type Person = ReturnType<typeof personCourses>;
const API = "/api/admin/onboarding/courses";
const SECTIONS = [
  { id: "courses", label: "Courses" },
  { id: "rules", label: "Rules" },
  { id: "people", label: "People" },
  { id: "exceptions", label: "Exceptions" },
  { id: "report", label: "Reports" },
  { id: "preview", label: "Learner preview" },
  { id: "audit", label: "Audit trail" },
] as const;
type Section = (typeof SECTIONS)[number]["id"];

export function CoursesTab() {
  const [section, setSection] = useState<Section>("courses");
  const [person, setPerson] = useState<string | null>(null);
  return (
    <div className="flex flex-col gap-4">
      <p className="max-w-3xl text-ink-muted">
        Each person is assigned a starting course from their <strong>verified</strong> role and work, never from anything they choose. A rule can ask to be
        mandatory, but only its named owner can make it so; until then it’s recommended, with no due date. Finishing a course never approves anyone to work.
      </p>
      <nav aria-label="Starting courses" className="flex flex-wrap gap-1.5">
        {SECTIONS.map((s) => (
          <button
            key={s.id}
            type="button"
            aria-current={section === s.id ? "page" : undefined}
            onClick={() => setSection(s.id)}
            className={cx("min-h-10 rounded-xl px-3 text-sm font-semibold", section === s.id ? "bg-ink text-surface" : "bg-muted hover:bg-line")}
          >
            {s.label}
          </button>
        ))}
      </nav>
      {section === "courses" && <Courses />}
      {section === "rules" && <Rules />}
      {section === "people" && <People selected={person} onSelect={setPerson} />}
      {section === "exceptions" && (
        <Exceptions
          onPerson={(id) => {
            setPerson(id);
            setSection("people");
          }}
        />
      )}
      {section === "report" && <Report />}
      {section === "preview" && <Preview />}
      {section === "audit" && <Audit />}
    </div>
  );
}

/** Runs an admin action, showing what went wrong in words. */
function useAct<T>(after?: (r: T) => void) {
  const [problem, setProblem] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);
  const act = async (body: Record<string, unknown>) => {
    setProblem(null);
    setBusy(true);
    try {
      const r = await api<T>(API, { body });
      after?.(r);
      return r;
    } catch (e) {
      const err = e as Error & { problems?: string[] };
      setProblem(err.problems?.join(" ") ?? err.message);
      return null;
    } finally {
      setBusy(false);
    }
  };
  return { act, problem, busy };
}

const segmentOptions = (Object.keys(SEGMENTS) as Segment[]).map((s) => (
  <option key={s} value={s}>
    {SEGMENTS[s]}
  </option>
));

function Checks<K extends string>({ legend, all, value, onChange }: { legend: string; all: Record<K, string>; value: K[]; onChange: (v: K[]) => void }) {
  return (
    <fieldset>
      <legend className="text-sm font-semibold">{legend}</legend>
      <div className="mt-1 flex flex-wrap gap-x-4 gap-y-1">
        {(Object.keys(all) as K[]).map((k) => (
          <label key={k} className="flex min-h-10 items-center gap-2">
            <input
              type="checkbox"
              checked={value.includes(k)}
              onChange={(e) => onChange(e.target.checked ? [...value, k] : value.filter((x) => x !== k))}
              className="size-4"
            />
            {all[k]}
          </label>
        ))}
      </div>
    </fieldset>
  );
}

// ---------------------------------------------------------------------------------------------
// Courses
// ---------------------------------------------------------------------------------------------

const BLANK_COURSE: CourseData = {
  name: "",
  learnerTitle: "",
  gains: [],
  segment: "supplier",
  serviceTypes: [],
  stage: 1,
  order: 1,
  steps: [],
  languages: ["en"],
  ownerTeam: "",
  reassign: "continue",
  changeNote: "",
  gaps: "",
  demo: false,
};

function Courses() {
  const { data, error, reload } = useApi<Overview>(API);
  const [editing, setEditing] = useState<{ id: string | null; data: CourseData } | null>(null);
  const { act, problem, busy } = useAct(() => reload());
  if (error) return <ErrorNote text={error} />;
  if (!data) return <p className="text-ink-muted">Loading…</p>;
  if (editing) return <CourseEditor overview={data} start={editing} onDone={() => (setEditing(null), reload())} />;
  return (
    <div className="flex flex-col gap-4">
      <div className="flex flex-wrap items-center justify-between gap-2">
        <p>
          {data.courses.length} course template{data.courses.length === 1 ? "" : "s"}. A published version never changes: editing makes a new draft.
        </p>
        <button type="button" className={btn.primary} onClick={() => setEditing({ id: null, data: BLANK_COURSE })}>
          New course
        </button>
      </div>
      {problem && <ErrorNote text={problem} />}
      <ul className="flex flex-col gap-3">
        {data.courses.map((c) => (
          <li key={c.id} className="rounded-3xl bg-surface p-5 ring-1 ring-line">
            <div className="flex flex-wrap items-start justify-between gap-2">
              <div>
                <h3 className="font-serif text-xl font-semibold">{c.data.learnerTitle}</h3>
                <p className="text-sm text-ink-muted">
                  {c.data.name} · {SEGMENTS[c.data.segment]}
                  {c.data.serviceTypes.length
                    ? ` · ${c.data.serviceTypes.map((s) => SERVICE_TYPES[s]).join(", ")} branch`
                    : c.data.segment === "supplier"
                      ? " · shared by every service type"
                      : ""}{" "}
                  · owner: {c.data.ownerTeam || "not named"} · {c.enrolled} enrolled
                </p>
              </div>
              <span className="flex flex-wrap gap-1.5">
                {c.data.demo && <Badge tone="warn">Demonstration</Badge>}
                {c.published ? (
                  <Badge tone="good">v{c.published.version} published</Badge>
                ) : c.withdrawn ? (
                  <Badge tone="bad">Withdrawn</Badge>
                ) : (
                  <Badge>Not published</Badge>
                )}
                {c.latest.status === "draft" && <Badge tone="info">v{c.latest.version} draft</Badge>}
              </span>
            </div>
            <details className="mt-2">
              <summary className="flex min-h-10 cursor-pointer items-center text-sm font-semibold text-accent">
                {c.data.steps.length} steps · completion: every required step · languages reviewed: {c.data.languages.join(", ")}
              </summary>
              <div className="mt-2">
                <StepList steps={c.steps} compact />
              </div>
              {c.data.gaps && (
                <p className="mt-2 text-sm">
                  <strong>Content gaps:</strong> {c.data.gaps}
                </p>
              )}
            </details>
            {c.problems.length > 0 && (
              <ul className="mt-2 list-disc pl-5 text-sm text-[#9b2c2c] dark:text-[#ff9ea2]">
                {c.problems.map((p) => (
                  <li key={p}>{p}</li>
                ))}
              </ul>
            )}
            <div className="mt-3 flex flex-wrap gap-2">
              <button type="button" className={btn.secondary} onClick={() => setEditing({ id: c.id, data: c.data })}>
                {c.latest.status === "draft" ? "Edit draft" : "Edit (new version)"}
              </button>
              {c.latest.status === "draft" && (
                <button
                  type="button"
                  className={btn.primary}
                  disabled={busy || c.problems.length > 0}
                  onClick={() => act({ action: "publish-course", id: c.id })}
                >
                  Publish v{c.latest.version}
                </button>
              )}
              {c.published && (
                <button
                  type="button"
                  className={btn.danger}
                  disabled={busy}
                  onClick={() => {
                    const reason = prompt("Why is it being withdrawn? Nobody new will be assigned it.");
                    if (reason) act({ action: "withdraw-course", id: c.id, reason });
                  }}
                >
                  Withdraw
                </button>
              )}
            </div>
          </li>
        ))}
      </ul>
      <Equivalences overview={data} onChange={reload} />
    </div>
  );
}

function CourseEditor({ overview, start, onDone }: { overview: Overview; start: { id: string | null; data: CourseData }; onDone: () => void }) {
  const [d, setD] = useState<CourseData>(start.data);
  const { act, problem, busy } = useAct(() => onDone());
  const set = (patch: Partial<CourseData>) => setD({ ...d, ...patch });
  const setStep = (i: number, patch: Partial<CourseData["steps"][number]>) => set({ steps: d.steps.map((s, j) => (j === i ? { ...s, ...patch } : s)) });
  return (
    <form
      className="flex flex-col gap-4 rounded-3xl bg-surface p-5 ring-1 ring-line"
      onSubmit={(e) => {
        e.preventDefault();
        act({ action: "save-course", id: start.id, data: d });
      }}
    >
      <h3 className="font-serif text-xl font-semibold">{start.id ? "Edit course (saved as a draft)" : "New course"}</h3>
      <div className="grid gap-3 sm:grid-cols-2">
        <Field label="Title the learner reads" hint="Action first: “Getting ready for your first visit”.">
          <input className={input} value={d.learnerTitle} onChange={(e) => set({ learnerTitle: e.target.value })} />
        </Field>
        <Field label="Admin name">
          <input className={input} value={d.name} onChange={(e) => set({ name: e.target.value })} />
        </Field>
        <Field label="For">
          <select className={input} value={d.segment} onChange={(e) => set({ segment: e.target.value as Segment, serviceTypes: [] })}>
            {segmentOptions}
          </select>
        </Field>
        <Field label="Owner (team)">
          <input className={input} value={d.ownerTeam} onChange={(e) => set({ ownerTeam: e.target.value })} />
        </Field>
        <Field label="Stage" hint="Earlier stages show first.">
          <input type="number" min={1} max={5} className={input} value={d.stage} onChange={(e) => set({ stage: Number(e.target.value) })} />
        </Field>
        <Field label="Order within the stage">
          <input type="number" min={0} max={99} className={input} value={d.order} onChange={(e) => set({ order: Number(e.target.value) })} />
        </Field>
      </div>
      {d.segment === "supplier" && (
        <Checks<ServiceType>
          legend="Service-type branch (none ticked: shared by every supplier)"
          all={SERVICE_TYPES}
          value={d.serviceTypes}
          onChange={(v) => set({ serviceTypes: v })}
        />
      )}
      <Field label="What they’ll gain (one per line)">
        <textarea className={cx(input, "py-2")} rows={3} value={d.gains.join("\n")} onChange={(e) => set({ gains: e.target.value.split("\n") })} />
      </Field>
      <fieldset className="flex flex-col gap-2">
        <legend className="text-sm font-semibold">Steps, in order</legend>
        {d.steps.map((s, i) => (
          <div key={i} className="grid gap-2 rounded-2xl bg-muted/50 p-3 sm:grid-cols-[minmax(0,2fr)_minmax(0,2fr)_auto_auto_auto]">
            <select aria-label={`Step ${i + 1}: content`} className={input} value={s.ref} onChange={(e) => setStep(i, { ref: e.target.value })}>
              <option value="">Choose a Topic, Magazine course or Job Aid</option>
              {overview.choices.map((c) => (
                <option key={c.ref} value={c.ref}>
                  {c.kind === "topic" ? "Topic" : c.kind === "course" ? "Magazine" : "Job Aid"}: {c.label} ({c.note})
                </option>
              ))}
            </select>
            <input
              aria-label={`Step ${i + 1}: what the learner does`}
              className={input}
              placeholder="What the learner does"
              value={s.title}
              onChange={(e) => setStep(i, { title: e.target.value })}
            />
            <label className="flex min-h-11 items-center gap-2 text-sm">
              <input type="checkbox" checked={s.required} onChange={(e) => setStep(i, { required: e.target.checked })} /> Required
            </label>
            <input
              aria-label={`Step ${i + 1}: minutes`}
              type="number"
              min={0}
              className={cx(input, "w-20")}
              value={s.minutes}
              onChange={(e) => setStep(i, { minutes: Number(e.target.value) })}
            />
            <button type="button" className={btn.quiet} onClick={() => set({ steps: d.steps.filter((_, j) => j !== i) })}>
              Remove<span className="sr-only"> step {i + 1}</span>
            </button>
          </div>
        ))}
        <button
          type="button"
          className={cx(btn.secondary, "self-start")}
          onClick={() => set({ steps: [...d.steps, { id: `step-${d.steps.length + 1}`, kind: "topic", ref: "", title: "", required: true, minutes: 0 }] })}
        >
          Add a step
        </button>
      </fieldset>
      <div className="grid gap-3 sm:grid-cols-2">
        <Field label="When a new version is published">
          <select className={input} value={d.reassign} onChange={(e) => set({ reassign: e.target.value as CourseData["reassign"] })}>
            <option value="continue">People carry on with the version they started</option>
            <option value="new_assignment">People who finished get the new version as a new assignment</option>
          </select>
        </Field>
        <Field label="What changed (shown to people on an older version)">
          <input className={input} value={d.changeNote} onChange={(e) => set({ changeNote: e.target.value })} />
        </Field>
      </div>
      <Field label="Content gaps for the owner">
        <textarea className={cx(input, "py-2")} rows={2} value={d.gaps} onChange={(e) => set({ gaps: e.target.value })} />
      </Field>
      <label className="flex min-h-10 items-center gap-2">
        <input type="checkbox" checked={d.demo} onChange={(e) => set({ demo: e.target.checked })} /> Demonstration content (not current Trilogy policy)
      </label>
      <p className="text-sm text-ink-muted">
        Reviewed translations: English only. Another language is added here only once a fluent reviewer has checked the whole course, including buttons,
        feedback, assessment options and the Job Aid.
      </p>
      {problem && <ErrorNote text={problem} />}
      <div className="flex flex-wrap gap-2">
        <button type="submit" className={btn.primary} disabled={busy}>
          Save draft
        </button>
        <button type="button" className={btn.secondary} onClick={onDone}>
          Cancel
        </button>
      </div>
    </form>
  );
}

function Equivalences({ overview, onChange }: { overview: Overview; onChange: () => void }) {
  const [a, setA] = useState("");
  const [b, setB] = useState("");
  const [note, setNote] = useState("");
  const { act, problem, busy } = useAct(() => onChange());
  return (
    <section aria-labelledby="eqv" className="rounded-3xl bg-surface p-5 ring-1 ring-line">
      <h3 id="eqv" className="font-serif text-xl font-semibold">
        Equivalences
      </h3>
      <p className="text-sm text-ink-muted">Once approved, finishing either item counts for both, so someone with two roles does shared learning once.</p>
      {overview.equivalences.length > 0 && (
        <ul className="mt-2 flex flex-col gap-1.5">
          {overview.equivalences.map((e) => (
            <li key={e.id} className="flex flex-wrap items-center gap-2 text-sm">
              <span>
                {e.a} ≡ {e.b}
                {e.note && ` (${e.note})`}
              </span>
              <Badge tone={e.status === "approved" ? "good" : "warn"}>{e.status === "approved" ? `Approved by ${e.approvedBy}` : "Pending approval"}</Badge>
              {e.status === "pending" && overview.canRunOnboarding && (
                <button type="button" className={btn.quiet} disabled={busy} onClick={() => act({ action: "approve-equivalence", id: e.id })}>
                  Approve
                </button>
              )}
            </li>
          ))}
        </ul>
      )}
      {overview.canRunOnboarding && (
        <div className="mt-3 grid gap-2 sm:grid-cols-[1fr_1fr_1fr_auto]">
          {[
            [a, setA, "First item"],
            [b, setB, "Equivalent item"],
          ].map(([v, set, label]) => (
            <select
              key={label as string}
              aria-label={label as string}
              className={input}
              value={v as string}
              onChange={(e) => (set as (x: string) => void)(e.target.value)}
            >
              <option value="">{label as string}</option>
              {overview.choices.map((c) => (
                <option key={c.ref} value={c.ref}>
                  {c.label}
                </option>
              ))}
            </select>
          ))}
          <input
            aria-label="Why they’re equivalent"
            placeholder="Why they’re equivalent"
            className={input}
            value={note}
            onChange={(e) => setNote(e.target.value)}
          />
          <button type="button" className={btn.secondary} disabled={busy} onClick={() => act({ action: "equivalence", a, b, note })}>
            Propose
          </button>
        </div>
      )}
      {problem && <ErrorNote text={problem} />}
    </section>
  );
}

// ---------------------------------------------------------------------------------------------
// Rules
// ---------------------------------------------------------------------------------------------

function Rules() {
  const { data, error, reload } = useApi<Overview>(API);
  const [editing, setEditing] = useState<{ id: string | null; data: RuleData } | null>(null);
  const [previewing, setPreviewing] = useState<string | null>(null);
  const { act, problem, busy } = useAct(() => reload());
  if (error) return <ErrorNote text={error} />;
  if (!data) return <p className="text-ink-muted">Loading…</p>;
  if (editing) return <RuleEditor overview={data} start={editing} onDone={() => (setEditing(null), reload())} />;
  const blank: RuleData = {
    name: "",
    when: { segment: "supplier", serviceTypes: [], staffFunctions: [] },
    courseId: "",
    mandatory: false,
    trigger: "joined",
    dueDays: null,
    effectiveFrom: "",
    effectiveTo: null,
    ownerTeam: "",
    ownerUserId: null,
    demo: false,
    note: "",
  };
  return (
    <div className="flex flex-col gap-4">
      <div className="flex flex-wrap items-center justify-between gap-2">
        <p>Rules are versioned and effective-dated. Preview who a draft reaches before publishing it.</p>
        {data.canRunOnboarding && (
          <button type="button" className={btn.primary} onClick={() => setEditing({ id: null, data: blank })}>
            New rule
          </button>
        )}
      </div>
      {problem && <ErrorNote text={problem} />}
      <ul className="flex flex-col gap-3">
        {data.rules.map((r) => (
          <li key={r.id} className="rounded-3xl bg-surface p-5 ring-1 ring-line">
            <div className="flex flex-wrap items-start justify-between gap-2">
              <h3 className="font-serif text-xl font-semibold">{r.data.name}</h3>
              <span className="flex flex-wrap gap-1.5">
                {r.data.demo && <Badge tone="warn">Demonstration</Badge>}
                {r.published ? <Badge tone="good">v{r.published.version} in force</Badge> : <Badge>Not in force</Badge>}
                {r.latest.status === "draft" && <Badge tone="info">v{r.latest.version} draft</Badge>}
                {r.published?.mandatory === "pending" && <Badge tone="warn">Mandatory: waiting for owner approval</Badge>}
                {r.published?.mandatory === "approved" && <Badge tone="good">Mandatory, approved by {r.published.approvedBy}</Badge>}
              </span>
            </div>
            <p className="mt-2 font-mono text-sm">{r.summary.if}</p>
            <p className="font-mono text-sm">{r.summary.then}</p>
            <ul className="mt-1 list-disc pl-5 text-sm text-ink-muted">
              {r.summary.with.map((w) => (
                <li key={w}>{w}</li>
              ))}
              <li>Named approver: {r.owner ?? "none yet. Only a named person can make this mandatory."}</li>
            </ul>
            {r.data.note && <p className="mt-1 text-sm">{r.data.note}</p>}
            <div className="mt-3 flex flex-wrap gap-2">
              {r.canPublish && (
                <button type="button" className={btn.secondary} onClick={() => setEditing({ id: r.id, data: r.data })}>
                  {r.latest.status === "draft" ? "Edit draft" : "Edit (new version)"}
                </button>
              )}
              {r.latest.status === "draft" && r.canPublish && (
                <button type="button" className={btn.primary} onClick={() => setPreviewing(previewing === r.id ? null : r.id)}>
                  Preview and publish
                </button>
              )}
              {r.canApprove && (
                <button type="button" className={btn.primary} disabled={busy} onClick={() => act({ action: "approve-rule", id: r.id })}>
                  Approve as mandatory
                </button>
              )}
              {r.published && r.canPublish && (
                <button
                  type="button"
                  className={btn.danger}
                  disabled={busy}
                  onClick={() => {
                    const reason = prompt("Why is this rule being retired? People on it keep their course.");
                    if (reason) act({ action: "retire-rule", id: r.id, reason });
                  }}
                >
                  Retire
                </button>
              )}
            </div>
            {previewing === r.id && <RulePreview id={r.id} onPublished={() => (setPreviewing(null), reload())} />}
          </li>
        ))}
      </ul>
    </div>
  );
}

function RulePreview({ id, onPublished }: { id: string; onPublished: () => void }) {
  const { data, error } = useApi<ReturnType<typeof previewRule>>(`${API}?view=rule-preview&id=${encodeURIComponent(id)}`);
  const { act, problem, busy } = useAct(() => onPublished());
  if (error) return <ErrorNote text={error} />;
  if (!data) return <p className="mt-3 text-ink-muted">Working out who it reaches…</p>;
  return (
    <div className="mt-3 rounded-2xl bg-muted/60 p-4">
      <p className="font-semibold">
        Reaches {data.eligible} {data.eligible === 1 ? "person" : "people"}: {data.newEnrolments} new, {data.alreadyEnrolled} already enrolled. About{" "}
        {data.minutesEach} minutes each.
      </p>
      {data.needWorkType > 0 && (
        <p className="text-sm">{data.needWorkType} supplier(s) have no verified service type and won’t be reached until it’s confirmed.</p>
      )}
      {!data.courseAssignable && <p className="text-sm font-semibold">Its course isn’t published, so it can’t be published yet.</p>}
      {data.sample.length > 0 && (
        <ul className="mt-2 max-h-48 overflow-auto text-sm">
          {data.sample.map((p, i) => (
            <li key={i}>
              {p.name} · {p.as}
              {p.already ? " (already enrolled)" : ""}
            </li>
          ))}
        </ul>
      )}
      {problem && <ErrorNote text={problem} />}
      <button type="button" className={cx(btn.primary, "mt-3")} disabled={busy || !data.courseAssignable} onClick={() => act({ action: "publish-rule", id })}>
        Publish and assign
      </button>
    </div>
  );
}

function RuleEditor({ overview, start, onDone }: { overview: Overview; start: { id: string | null; data: RuleData }; onDone: () => void }) {
  const [d, setD] = useState<RuleData>(start.data);
  const { act, problem, busy } = useAct(() => onDone());
  const set = (patch: Partial<RuleData>) => setD({ ...d, ...patch });
  const courses = overview.courses.filter((c) => c.data.segment === d.when.segment);
  return (
    <form
      className="flex flex-col gap-4 rounded-3xl bg-surface p-5 ring-1 ring-line"
      onSubmit={(e) => {
        e.preventDefault();
        act({ action: "save-rule", id: start.id, data: d });
      }}
    >
      <h3 className="font-serif text-xl font-semibold">{start.id ? "Edit rule (saved as a draft)" : "New rule"}</h3>
      <div className="grid gap-3 sm:grid-cols-2">
        <Field label="Name">
          <input className={input} value={d.name} onChange={(e) => set({ name: e.target.value })} />
        </Field>
        <Field label="IF verified role is">
          <select
            className={input}
            value={d.when.segment}
            onChange={(e) => set({ when: { segment: e.target.value as Segment, serviceTypes: [], staffFunctions: [] }, courseId: "" })}
          >
            {segmentOptions}
          </select>
        </Field>
      </div>
      {d.when.segment === "supplier" && (
        <Checks<ServiceType>
          legend="AND verified service type includes (none ticked: any verified type)"
          all={SERVICE_TYPES}
          value={d.when.serviceTypes}
          onChange={(v) => set({ when: { ...d.when, serviceTypes: v } })}
        />
      )}
      {d.when.segment === "staff" && (
        <Checks<StaffFunction>
          legend="AND their function is (none ticked: any)"
          all={STAFF_FUNCTIONS}
          value={d.when.staffFunctions}
          onChange={(v) => set({ when: { ...d.when, staffFunctions: v } })}
        />
      )}
      <div className="grid gap-3 sm:grid-cols-2">
        <Field label="THEN assign">
          <select className={input} value={d.courseId} onChange={(e) => set({ courseId: e.target.value })}>
            <option value="">Choose a course</option>
            {courses.map((c) => (
              <option key={c.id} value={c.id}>
                {c.data.learnerTitle}
                {c.published ? "" : " (not published)"}
              </option>
            ))}
          </select>
        </Field>
        <Field label="Trigger">
          <select className={input} value={d.trigger} onChange={(e) => set({ trigger: e.target.value as RuleData["trigger"] })}>
            {(Object.keys(TRIGGERS) as (keyof typeof TRIGGERS)[]).map((t) => (
              <option key={t} value={t}>
                {TRIGGERS[t]}
              </option>
            ))}
          </select>
        </Field>
        <Field label="Owner (team)">
          <input className={input} value={d.ownerTeam} onChange={(e) => set({ ownerTeam: e.target.value })} />
        </Field>
        <Field label="Named approver" hint="Only this person can make the rule mandatory.">
          <select className={input} value={d.ownerUserId ?? ""} onChange={(e) => set({ ownerUserId: e.target.value || null })}>
            <option value="">Not named yet</option>
            {overview.owners.map((o) => (
              <option key={o.id} value={o.id}>
                {o.name}
              </option>
            ))}
          </select>
        </Field>
        <Field label="Due (days after assignment)" hint="Applies only once mandatory is approved.">
          <input
            type="number"
            min={1}
            max={365}
            className={input}
            value={d.dueDays ?? ""}
            onChange={(e) => set({ dueDays: e.target.value ? Number(e.target.value) : null })}
          />
        </Field>
        <label className="flex min-h-11 items-center gap-2 self-end">
          <input type="checkbox" checked={d.mandatory} onChange={(e) => set({ mandatory: e.target.checked })} /> Ask for it to be mandatory
        </label>
        <Field label="In force from">
          <input type="date" className={input} value={d.effectiveFrom} onChange={(e) => set({ effectiveFrom: e.target.value })} />
        </Field>
        <Field label="Until (optional)">
          <input type="date" className={input} value={d.effectiveTo ?? ""} onChange={(e) => set({ effectiveTo: e.target.value || null })} />
        </Field>
      </div>
      <Field label="Note">
        <input className={input} value={d.note} onChange={(e) => set({ note: e.target.value })} />
      </Field>
      <label className="flex min-h-10 items-center gap-2">
        <input type="checkbox" checked={d.demo} onChange={(e) => set({ demo: e.target.checked })} /> Demonstration rule
      </label>
      {problem && <ErrorNote text={problem} />}
      <div className="flex flex-wrap gap-2">
        <button type="submit" className={btn.primary} disabled={busy}>
          Save draft
        </button>
        <button type="button" className={btn.secondary} onClick={onDone}>
          Cancel
        </button>
      </div>
    </form>
  );
}

// ---------------------------------------------------------------------------------------------
// People and enrolments
// ---------------------------------------------------------------------------------------------

function People({ selected, onSelect }: { selected: string | null; onSelect: (id: string | null) => void }) {
  const [q, setQ] = useState("");
  const { data, error } = useApi<ReturnType<typeof searchPeople>>(`${API}?view=people&q=${encodeURIComponent(q)}`);
  if (selected) return <PersonDetail id={selected} onBack={() => onSelect(null)} />;
  return (
    <div className="flex flex-col gap-3">
      <Field label="Find a person or organisation" className="max-w-md">
        <input type="search" className={input} value={q} onChange={(e) => setQ(e.target.value)} />
      </Field>
      {error && <ErrorNote text={error} />}
      <ul className="flex flex-col gap-2">
        {(data ?? []).map((p) => (
          <li key={p.id}>
            <button
              type="button"
              onClick={() => onSelect(p.id)}
              className="flex w-full flex-wrap items-center justify-between gap-2 rounded-2xl bg-surface p-4 text-left ring-1 ring-line hover:ring-action"
            >
              <span>
                <span className="block font-semibold">{p.name}</span>
                <span className="block text-sm text-ink-muted">{p.roles.join(" | ")}</span>
              </span>
              <span className="flex flex-wrap gap-1.5">
                {p.needsWorkType && <Badge tone="warn">Work type to confirm</Badge>}
                <Badge>{p.active} in progress</Badge>
                <Badge tone="good">{p.completed} completed</Badge>
              </span>
            </button>
          </li>
        ))}
      </ul>
    </div>
  );
}

function PersonDetail({ id, onBack }: { id: string; onBack: () => void }) {
  const { data, error, setData } = useApi<Person>(`${API}?view=person&id=${encodeURIComponent(id)}`);
  const { act, problem, busy } = useAct<Person>((r) => r && "enrolments" in r && setData(r));
  const [form, setForm] = useState<Record<string, string>>({});
  const f = (k: string) => form[k] ?? "";
  const setF = (k: string, v: string) => setForm({ ...form, [k]: v });
  const overview = useApi<Overview>(API).data;
  if (error) return <ErrorNote text={error} />;
  if (!data) return <p className="text-ink-muted">Loading…</p>;
  const supplier = data.memberships.some((m) => m.id === "primary" && m.segment === "supplier");
  return (
    <div className="flex flex-col gap-4">
      <button type="button" className={cx(btn.quiet, "self-start")} onClick={onBack}>
        ← Everyone
      </button>
      <h3 className="font-serif text-2xl font-semibold">{data.name}</h3>
      <section className="rounded-3xl bg-surface p-5 ring-1 ring-line">
        <h4 className="font-semibold">Verified roles</h4>
        <ul className="mt-1 flex flex-col gap-1 text-sm">
          {data.memberships.map((m) => (
            <li key={m.id} className="flex flex-wrap items-center gap-2">
              <span>
                {m.label}{" "}
                <span className="text-ink-muted">
                  ({m.source}
                  {m.verifiedBy ? `, ${m.verifiedBy}` : ""})
                </span>
              </span>
              {m.id !== "primary" && (
                <button
                  type="button"
                  className={btn.quiet}
                  disabled={busy}
                  onClick={() => {
                    const reason = prompt("Why has this role ended?");
                    if (reason) act({ action: "end-membership", membershipId: m.id, reason });
                  }}
                >
                  End this role
                </button>
              )}
            </li>
          ))}
        </ul>
        {data.needsWorkType && <p className="mt-2 text-sm font-semibold">No verified service type: no supplier course is assigned until it’s confirmed.</p>}
        {data.disputed && (
          <p className="mt-2 text-sm font-semibold">They’ve said this isn’t their role. Nothing new is assigned until it’s answered in the Review queue.</p>
        )}
        {data.plan.length > 0 && <p className="mt-2 text-sm text-ink-muted">Rules in force reach them for: {data.plan.map((p) => p.course).join(", ")}.</p>}
      </section>

      <section className="flex flex-col gap-3">
        <h4 className="font-semibold">Enrolments</h4>
        {data.enrolments.length === 0 && <p className="text-ink-muted">None.</p>}
        {data.enrolments.map((e) => (
          <div key={e.id} className="rounded-3xl bg-surface p-5 ring-1 ring-line">
            <div className="flex flex-wrap items-start justify-between gap-2">
              <p className="font-semibold">
                {e.title}{" "}
                <span className="text-ink-muted">
                  v{e.version} · {e.organisation}
                </span>
              </p>
              <span className="flex flex-wrap gap-1.5">
                <Badge tone={e.status === "completed" ? "good" : e.status === "active" ? "info" : "neutral"}>{e.status}</Badge>
                <Badge>
                  {e.progress.done}/{e.progress.total}
                </Badge>
                {e.dueOn && <Badge tone={e.due?.overdue ? "bad" : "neutral"}>Due {formatDate(e.dueOn)}</Badge>}
              </span>
            </div>
            <p className="mt-1 text-sm">
              <strong>Why:</strong> {e.why.text} {e.rule && <span className="text-ink-muted">(rule {e.rule})</span>}
            </p>
            <p className="text-sm text-ink-muted">
              Assigned {formatDateTime(e.assignedAt)} by {e.assignedBy}
              {e.invitedAt ? ` · invited ${formatDateTime(e.invitedAt)}` : ""}
              {e.startedAt ? ` · started ${formatDateTime(e.startedAt)}` : ""}
              {e.completedAt ? ` · completed ${formatDateTime(e.completedAt)}` : ""}
              {e.exemptReason ? ` · exempted by ${e.exemptBy}: ${e.exemptReason} (review ${e.exemptReviewOn})` : ""}
              {e.endedReason ? ` · ${e.endedReason}` : ""}
            </p>
            <details className="mt-1">
              <summary className="flex min-h-10 cursor-pointer items-center text-sm font-semibold text-accent">Steps</summary>
              <StepList steps={e.steps} compact />
              {e.completion != null && <pre className="mt-2 overflow-auto rounded-xl bg-muted p-2 text-xs">{JSON.stringify(e.completion, null, 1)}</pre>}
            </details>
            {e.status === "active" && (
              <div className="mt-2 flex flex-wrap gap-2">
                <button
                  type="button"
                  className={btn.secondary}
                  disabled={busy}
                  onClick={() => {
                    const reason = prompt("Reason for the exemption (recorded and audited):");
                    const reviewOn = reason ? prompt("Review the exemption on (YYYY-MM-DD):") : null;
                    if (reason && reviewOn) act({ action: "exempt", enrolmentId: e.id, reason, reviewOn });
                  }}
                >
                  Exempt
                </button>
                <button
                  type="button"
                  className={btn.secondary}
                  disabled={busy}
                  onClick={() => {
                    const dueOn = prompt("New due date (YYYY-MM-DD):");
                    const reason = dueOn ? prompt("Reason for the new date:") : null;
                    if (dueOn && reason) act({ action: "extend", enrolmentId: e.id, dueOn, reason });
                  }}
                >
                  New due date
                </button>
              </div>
            )}
          </div>
        ))}
      </section>

      <section className="grid gap-4 lg:grid-cols-2">
        <div className="flex flex-col gap-2 rounded-3xl bg-surface p-5 ring-1 ring-line">
          <h4 className="font-semibold">Assign a course by hand</h4>
          <p className="text-sm text-ink-muted">For a pilot while eligibility sources are connected. Only a published course for a role they hold.</p>
          <select aria-label="Course" className={input} value={f("courseId")} onChange={(e) => setF("courseId", e.target.value)}>
            <option value="">Choose a course</option>
            {data.courses.map((c) => (
              <option key={c.id} value={c.id}>
                {c.title} ({SEGMENTS[c.segment as Segment]}, v{c.version})
              </option>
            ))}
          </select>
          <input
            aria-label="Reason"
            placeholder="Reason (they see it)"
            className={input}
            value={f("reason")}
            onChange={(e) => setF("reason", e.target.value)}
          />
          <input aria-label="Due date (optional)" type="date" className={input} value={f("dueOn")} onChange={(e) => setF("dueOn", e.target.value)} />
          <button
            type="button"
            className={btn.primary}
            disabled={busy}
            onClick={() => act({ action: "assign", userId: id, courseId: f("courseId"), reason: f("reason"), dueOn: f("dueOn") || null })}
          >
            Assign
          </button>
        </div>
        <div className="flex flex-col gap-2 rounded-3xl bg-surface p-5 ring-1 ring-line">
          <h4 className="font-semibold">Credit prior learning</h4>
          <select aria-label="Item" className={input} value={f("ref")} onChange={(e) => setF("ref", e.target.value)}>
            <option value="">Choose the item</option>
            {(overview?.choices ?? []).map((c) => (
              <option key={c.ref} value={c.ref}>
                {c.label}
              </option>
            ))}
          </select>
          <input
            aria-label="What prior learning it recognises"
            placeholder="What prior learning it recognises"
            className={input}
            value={f("creditReason")}
            onChange={(e) => setF("creditReason", e.target.value)}
          />
          <button
            type="button"
            className={btn.secondary}
            disabled={busy}
            onClick={() => act({ action: "credit", userId: id, ref: f("ref"), reason: f("creditReason") })}
          >
            Credit
          </button>
        </div>
        {supplier && (
          <div className="flex flex-col gap-2 rounded-3xl bg-surface p-5 ring-1 ring-line">
            <h4 className="font-semibold">Verified service type</h4>
            <select aria-label="Service type" className={input} value={f("serviceType")} onChange={(e) => setF("serviceType", e.target.value)}>
              <option value="">Not confirmed</option>
              {(Object.keys(SERVICE_TYPES) as ServiceType[]).map((s) => (
                <option key={s} value={s}>
                  {SERVICE_TYPES[s]}
                </option>
              ))}
            </select>
            <input
              aria-label="Where it was verified"
              placeholder="Where it was verified"
              className={input}
              value={f("wtReason")}
              onChange={(e) => setF("wtReason", e.target.value)}
            />
            <button
              type="button"
              className={btn.secondary}
              disabled={busy}
              onClick={() => act({ action: "work-type", userId: id, serviceType: f("serviceType"), reason: f("wtReason") })}
            >
              Save and update their courses
            </button>
          </div>
        )}
        <div className="flex flex-col gap-2 rounded-3xl bg-surface p-5 ring-1 ring-line">
          <h4 className="font-semibold">Add a verified role</h4>
          <select aria-label="Role" className={input} value={f("segment")} onChange={(e) => setF("segment", e.target.value)}>
            <option value="">Choose a role</option>
            {segmentOptions}
          </select>
          <select aria-label="Organisation" className={input} value={f("orgId")} onChange={(e) => setF("orgId", e.target.value)}>
            <option value="">Organisation</option>
            {(overview?.orgs ?? []).map((o) => (
              <option key={o.id} value={o.id}>
                {o.name}
              </option>
            ))}
          </select>
          {f("segment") === "supplier" && (
            <select aria-label="Service type" className={input} value={f("mServiceType")} onChange={(e) => setF("mServiceType", e.target.value)}>
              <option value="">Service type</option>
              {(Object.keys(SERVICE_TYPES) as ServiceType[]).map((s) => (
                <option key={s} value={s}>
                  {SERVICE_TYPES[s]}
                </option>
              ))}
            </select>
          )}
          <input
            aria-label="How it was verified"
            placeholder="How it was verified"
            className={input}
            value={f("mReason")}
            onChange={(e) => setF("mReason", e.target.value)}
          />
          <button
            type="button"
            className={btn.secondary}
            disabled={busy}
            onClick={() =>
              act({ action: "add-membership", userId: id, segment: f("segment"), orgId: f("orgId"), serviceType: f("mServiceType"), reason: f("mReason") })
            }
          >
            Add role
          </button>
        </div>
      </section>
      {problem && <ErrorNote text={problem} />}

      {data.credits.length > 0 && (
        <section className="rounded-3xl bg-surface p-5 ring-1 ring-line text-sm">
          <h4 className="font-semibold">Credited prior learning</h4>
          <ul className="mt-1">
            {data.credits.map((c) => (
              <li key={c.ref}>
                {c.label}: {c.reason} ({c.by}, {formatDate(c.at)})
              </li>
            ))}
          </ul>
        </section>
      )}
      {data.help.length > 0 && (
        <section className="rounded-3xl bg-surface p-5 ring-1 ring-line text-sm">
          <h4 className="font-semibold">Help requests</h4>
          <ul className="mt-1 flex flex-col gap-2">
            {data.help.map((h) => (
              <li key={h.id} className="flex flex-wrap items-center gap-2">
                <Badge tone={h.state === "open" ? "warn" : "good"}>{h.state}</Badge>
                {h.kindLabel}: {h.message || "(no message)"}
                {h.state === "open" && (
                  <button
                    type="button"
                    className={btn.quiet}
                    onClick={() => {
                      const resolution = prompt("What was done?");
                      if (resolution)
                        act({ action: "resolve-help", id: h.id, resolution }).then(() =>
                          setData({ ...data, help: data.help.map((x) => (x.id === h.id ? { ...x, state: "resolved" } : x)) }),
                        );
                    }}
                  >
                    Mark resolved
                  </button>
                )}
              </li>
            ))}
          </ul>
        </section>
      )}
    </div>
  );
}

// ---------------------------------------------------------------------------------------------
// Exceptions, reports, preview and audit
// ---------------------------------------------------------------------------------------------

function Exceptions({ onPerson }: { onPerson: (id: string) => void }) {
  const { data, error } = useApi<ReturnType<typeof exceptionsQueue>>(`${API}?view=exceptions`);
  if (error) return <ErrorNote text={error} />;
  if (!data) return <p className="text-ink-muted">Loading…</p>;
  if (!data.items.length) return <p className="rounded-2xl bg-muted px-4 py-3">Nothing needs attention.</p>;
  return (
    <ul className="flex flex-col gap-2">
      {data.items.map((i, n) => (
        <li key={n} className="rounded-2xl bg-surface p-4 ring-1 ring-line">
          <p className="font-semibold">
            {i.title}
            {i.person && (
              <>
                {": "}
                <button type="button" className="font-semibold text-accent underline underline-offset-4" onClick={() => onPerson(i.person!.id)}>
                  {i.person.name}
                </button>
              </>
            )}
          </p>
          <p className="text-sm text-ink-muted">{i.detail}</p>
        </li>
      ))}
    </ul>
  );
}

const COLS = ["eligible", "invited", "enrolled", "started", "completed", "overdue", "exempted", "ended"] as const;

function Report() {
  const [org, setOrg] = useState("");
  const { data, error } = useApi<ReturnType<typeof courseReport>>(`${API}?view=report&org=${encodeURIComponent(org)}`);
  if (error) return <ErrorNote text={error} />;
  if (!data) return <p className="text-ink-muted">Loading…</p>;
  return (
    <div className="flex flex-col gap-4">
      <p className="max-w-3xl text-sm text-ink-muted">{data.note}</p>
      <div className="flex flex-wrap items-end gap-3">
        <Field label="Organisation" className="max-w-xs">
          <select className={input} value={org} onChange={(e) => setOrg(e.target.value)}>
            <option value="">All you can see</option>
            {data.organisations.map((o) => (
              <option key={o.id} value={o.id}>
                {o.name}
              </option>
            ))}
          </select>
        </Field>
        <a href={`${API}?view=export&org=${encodeURIComponent(org)}`} className={btn.secondary}>
          Export CSV
        </a>
      </div>
      <div className="overflow-x-auto rounded-2xl ring-1 ring-line">
        <table className="min-w-full text-sm">
          <caption className="sr-only">Starting courses by course version, role and service type</caption>
          <thead className="bg-muted text-left">
            <tr>
              <th scope="col" className="p-2">
                Course
              </th>
              <th scope="col" className="p-2">
                Role
              </th>
              <th scope="col" className="p-2">
                Service type
              </th>
              {COLS.map((c) => (
                <th key={c} scope="col" className="p-2 text-right capitalize">
                  {c === "ended" ? "No longer assigned" : c}
                </th>
              ))}
            </tr>
          </thead>
          <tbody>
            {data.rows.map((r) => (
              <tr key={`${r.course}-${r.version}-${r.segment}-${r.serviceType}`} className="border-t border-line">
                <th scope="row" className="p-2 text-left font-medium">
                  {r.title} v{r.version}
                </th>
                <td className="p-2">{r.segment}</td>
                <td className="p-2">{r.serviceType || "–"}</td>
                {COLS.map((c) => (
                  <td key={c} className="p-2 text-right tabular-nums">
                    {r[c]}
                  </td>
                ))}
              </tr>
            ))}
          </tbody>
        </table>
      </div>
      <section>
        <h3 className="font-semibold">Where people stop</h3>
        <ul className="mt-1 text-sm">
          {data.steps.map((s, i) => (
            <li key={i}>
              {s.title}: {s.step}: {s.started} of {s.enrolled} started, {s.done} done
            </li>
          ))}
        </ul>
      </section>
      <section>
        <h3 className="font-semibold">Help requests</h3>
        <ul className="mt-1 text-sm">
          {data.help.map((h) => (
            <li key={h.kind}>
              {h.kind}: {h.count}
            </li>
          ))}
        </ul>
      </section>
    </div>
  );
}

function Preview() {
  const [persona, setPersona] = useState("cleaner");
  const { data, error } = useApi<ReturnType<typeof previewLearner>>(`${API}?view=preview&persona=${persona}`);
  if (error) return <ErrorNote text={error} />;
  return (
    <div className="flex flex-col gap-4">
      <p className="text-sm text-ink-muted">A made-up person in each role, from the rules in force today. Nothing is saved, and nobody real is involved.</p>
      <div className="flex flex-wrap gap-1.5" role="group" aria-label="Preview as">
        {(data?.personas ?? []).map((p) => (
          <button
            key={p.id}
            type="button"
            aria-pressed={persona === p.id}
            onClick={() => setPersona(p.id)}
            className={cx("min-h-10 rounded-xl px-3 text-sm font-semibold", persona === p.id ? "bg-ink text-surface" : "bg-muted")}
          >
            {p.label}
          </button>
        ))}
      </div>
      {data && (
        <div className="mx-auto w-full max-w-[390px] rounded-[2rem] border-8 border-ink/80 bg-canvas p-4 shadow-lg">
          <p className="font-mulish text-xs font-extrabold uppercase tracking-[0.14em] text-accent">Getting started</p>
          <p className="mt-1 font-serif text-2xl font-semibold">Welcome, {data.person.name.split(" ")[0]}</p>
          <p className="text-sm">You’re here as {data.person.label}.</p>
          {data.confirm && (
            <p className="mt-3 rounded-2xl bg-[#fab53d]/15 p-3 text-sm ring-1 ring-[#fab53d]/50">
              <strong>We need to confirm your work type.</strong> No starting course is shown until an administrator confirms it.
            </p>
          )}
          {data.courses.map((c, i) => (
            <div key={c.id} className="mt-4">
              <p className="font-serif text-lg font-semibold">
                {i === 0 ? "Continue: " : ""}
                {c.title}
              </p>
              <p className="text-xs text-ink-muted">
                {c.mandatory ? `Required${c.dueDays ? `, due ${c.dueDays} days after it’s assigned` : ""}` : "Recommended, no due date"}
                {c.demo ? " · demonstration" : ""}
              </p>
              <div className="mt-2">
                <StepList steps={c.steps} compact />
              </div>
              <p className="mt-2 text-xs text-ink-muted">
                {c.why.if} {c.why.then}
              </p>
            </div>
          ))}
          {!data.confirm && !data.courses.length && <p className="mt-3 text-sm">No rule in force reaches this role yet.</p>}
          <p className="mt-4 text-xs text-ink-muted">{data.demoNote}</p>
        </div>
      )}
    </div>
  );
}

function Audit() {
  const { data, error } = useApi<ReturnType<typeof courseAudit>>(`${API}?view=audit`);
  if (error) return <ErrorNote text={error} />;
  if (!data) return <p className="text-ink-muted">Loading…</p>;
  return (
    <ul className="flex flex-col gap-1 text-sm">
      {data.map((a, i) => (
        <li key={i} className="rounded-xl bg-surface px-3 py-2 ring-1 ring-line">
          <span className="text-ink-muted">{formatDateTime(a.at)}</span> · {a.who} · <span className="font-mono">{a.event}</span> · {a.entity}
          {a.reason ? ` · ${a.reason}` : ""}
        </li>
      ))}
    </ul>
  );
}
