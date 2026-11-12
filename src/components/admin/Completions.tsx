"use client";

import Link from "next/link";
import { useMemo, useState } from "react";
import { useApi } from "@/lib/api";
import { cx, formatDate } from "@/lib/format";
import { AdminShell, Badge, btn, ErrorNote, input } from "./ui";
import { Icon } from "../Icon";

/* Who has finished what: by lesson and by person, with quiz results, refreshers due and a spreadsheet export. */

type State = "completed" | "in_progress" | "not_started";
type Row = {
  state: State;
  /** They enrolled in the topic themselves. */
  enrolled: boolean;
  completedAt: string | null;
  version: string | null;
  needsRefresher: boolean;
  lastActive: string | null;
  reached: { title: string; step: number; of: number } | null;
  score: { right: number; asked: number } | null;
  assessment: { attempts: number; firstScore: number; latestScore: number; passedAt: string | null; passMark: number } | null;
};
type Person = { id: string; name: string; email: string; org: string; audience: string };
type LessonSummary = {
  slug: string;
  title: string;
  track: string;
  version: string;
  people: number;
  completed: number;
  inProgress: number;
  notStarted: number;
  needsRefresher: number;
  firstTry: number | null;
};
type PersonSummary = Person & {
  lessons: number;
  completed: number;
  inProgress: number;
  needsRefresher: number;
  overduePaths: number;
  lastActive: string | null;
};
type Question = { cardId: string; id: string; prompt: string; answered: number; right: number; wrongPicks: { label: string; count: number }[] };
type PathRow = { id: string; name: string; dueDate: string | null; selfEnrolled: boolean; completed: number; total: number; done: boolean };

const stateLabel: Record<State, string> = { completed: "Completed", in_progress: "In progress", not_started: "Not started" };
const stateTone = { completed: "good", in_progress: "info", not_started: "neutral" } as const;
const audienceLabel = (a: string) => (a === "partner" ? "Partner" : a === "coordinator" ? "Coordinator" : "Staff");
const pct = (n: number, of: number) => (of ? Math.round((100 * n) / of) : 0);

function Export({ lesson }: { lesson?: string }) {
  return (
    <a href={`/api/admin/completions/export${lesson ? `?lesson=${encodeURIComponent(lesson)}` : ""}`} className={btn.secondary} download>
      <Icon name="file" className="size-4" /> Download spreadsheet
    </a>
  );
}

/** A stacked bar: completed, in progress, not started. */
function Bar({ completed, inProgress, total }: { completed: number; inProgress: number; total: number }) {
  return (
    <div
      className="flex h-2.5 w-full overflow-hidden rounded-full bg-muted"
      role="img"
      aria-label={`${completed} completed, ${inProgress} in progress, of ${total}`}
    >
      <div className="bg-[var(--action)]" style={{ width: `${pct(completed, total)}%` }} />
      <div className="bg-gold" style={{ width: `${pct(inProgress, total)}%` }} />
    </div>
  );
}

function StateCell({ r }: { r: Row }) {
  return (
    <div className="flex flex-col gap-1">
      <span className="flex flex-wrap gap-1.5">
        <Badge tone={stateTone[r.state]}>{stateLabel[r.state]}</Badge>
        {r.needsRefresher && <Badge tone="warn">Needs refresher</Badge>}
      </span>
      <span className="text-xs text-ink-muted">
        {r.completedAt
          ? `${formatDate(r.completedAt)} · version ${r.version}`
          : r.reached
            ? `Up to “${r.reached.title}” (card ${r.reached.step} of ${r.reached.of})`
            : r.lastActive
              ? `Last active ${formatDate(r.lastActive)}`
              : ""}
      </span>
    </div>
  );
}

const Score = ({ s }: { s: Row["score"] }) => (s ? <span>{`${s.right}/${s.asked}`}</span> : <span className="text-ink-muted">—</span>);

/** An assessment result: passed or not, the latest score, and how many attempts it took. */
function AssessmentResult({ a }: { a: Row["assessment"] }) {
  if (!a) return <span className="text-ink-muted">Not submitted</span>;
  return (
    <span className="flex flex-col gap-0.5">
      <span className="flex flex-wrap items-center gap-1.5">
        <Badge tone={a.passedAt ? "good" : "bad"}>{a.passedAt ? "Passed" : "Not passed"}</Badge>
        <strong>{a.latestScore}%</strong>
      </span>
      <span className="text-xs text-ink-muted">
        {a.attempts} {a.attempts === 1 ? "attempt" : "attempts"}
        {a.attempts > 1 && ` · first ${a.firstScore}%`}
        {a.passedAt && ` · passed ${formatDate(a.passedAt)}`} · pass mark {a.passMark}%
      </span>
    </span>
  );
}

export function CompletionsOverview() {
  const { data, error } = useApi<{ lessons: LessonSummary[]; paths: PathSummary[]; people: PersonSummary[] }>("/api/admin/completions");
  const [view, setView] = useState<"lessons" | "paths" | "people">("lessons");
  const [q, setQ] = useState("");
  const people = useMemo(() => (data?.people ?? []).filter((p) => `${p.name} ${p.org} ${p.email}`.toLowerCase().includes(q.trim().toLowerCase())), [data, q]);
  return (
    <AdminShell title="Completions">
      <div className="flex flex-wrap items-start justify-between gap-4">
        <p className="max-w-3xl text-ink-muted">
          Who has finished each topic and learning path, who started and stopped, and who hasn’t opened it yet. “Needs refresher” means they finished a version
          from before an important change.
        </p>
        <Export />
      </div>
      {error && (
        <div className="mt-4">
          <ErrorNote text={error} />
        </div>
      )}
      <div role="tablist" aria-label="View" className="mt-6 inline-flex rounded-full border border-line-strong p-1">
        {(
          [
            ["lessons", "By topic"],
            ["paths", "By learning path"],
            ["people", "By person"],
          ] as const
        ).map(([v, label]) => (
          <button
            key={v}
            type="button"
            role="tab"
            aria-selected={view === v}
            onClick={() => setView(v)}
            className={cx("min-h-9 rounded-full px-4 text-sm font-semibold", view === v ? "bg-[var(--action)] text-white" : "text-ink-muted hover:text-ink")}
          >
            {label}
          </button>
        ))}
      </div>
      {!data ? (
        <p className="mt-6 text-ink-muted">Loading…</p>
      ) : view === "paths" ? (
        !data.paths.length ? (
          <p className="mt-6 rounded-3xl border border-dashed border-line-strong p-6 text-center text-ink-muted">No learning paths yet.</p>
        ) : (
          <ul className="mt-4 grid gap-3 md:grid-cols-2">
            {data.paths.map((p) => (
              <li key={p.id} className="relative flex flex-col gap-2 rounded-3xl border border-line bg-surface p-5 hover:border-line-strong">
                <h2 className="font-serif text-lg font-semibold leading-snug">
                  <Link href={`/admin/completions/paths/${p.id}`} className="after:absolute after:inset-0 after:content-[''] hover:underline">
                    {p.name}
                  </Link>
                </h2>
                <p className="text-sm text-ink-muted">
                  {p.topics} {p.topics === 1 ? "topic" : "topics"} · {p.assigned} {p.assigned === 1 ? "person" : "people"} assigned
                </p>
                {p.assigned > 0 ? (
                  <>
                    <Bar completed={p.completed} inProgress={p.inProgress} total={p.assigned} />
                    <p className="text-sm">
                      <strong>{p.completed}</strong> of {p.assigned} finished · {p.inProgress} in progress · {p.notStarted} not started
                    </p>
                    {p.overdue > 0 && (
                      <div>
                        <Badge tone="bad">{p.overdue} overdue</Badge>
                      </div>
                    )}
                  </>
                ) : (
                  <p className="text-sm text-ink-muted">Nobody is assigned this path yet.</p>
                )}
              </li>
            ))}
          </ul>
        )
      ) : view === "lessons" ? (
        <ul className="mt-4 grid gap-3 md:grid-cols-2">
          {data.lessons.map((l) => (
            <li key={l.slug} className="relative flex flex-col gap-2 rounded-3xl border border-line bg-surface p-5 hover:border-line-strong">
              <h2 className="font-serif text-lg font-semibold leading-snug">
                <Link href={`/admin/completions/lessons/${l.slug}`} className="after:absolute after:inset-0 after:content-[''] hover:underline">
                  {l.title}
                </Link>
              </h2>
              <Bar completed={l.completed} inProgress={l.inProgress} total={l.people} />
              <p className="text-sm">
                <strong>{l.completed}</strong> of {l.people} completed · {l.inProgress} in progress · {l.notStarted} not started
              </p>
              <div className="flex flex-wrap gap-1.5">
                {l.needsRefresher > 0 && <Badge tone="warn">{l.needsRefresher} need a refresher</Badge>}
                {l.firstTry !== null && <Badge tone="info">Quiz right first try: {l.firstTry}%</Badge>}
                <Badge>Version {l.version}</Badge>
              </div>
            </li>
          ))}
        </ul>
      ) : (
        <>
          <input
            className={cx(input, "mt-4 max-w-sm")}
            placeholder="Search by name or organisation"
            value={q}
            onChange={(e) => setQ(e.target.value)}
            aria-label="Search people"
          />
          <div className="mt-4 overflow-x-auto rounded-3xl border border-line bg-surface">
            <table className="w-full min-w-[640px] text-left text-sm">
              <thead className="border-b border-line text-xs uppercase tracking-wide text-ink-muted">
                <tr>
                  <th className="px-4 py-3">Person</th>
                  <th className="px-4 py-3">Topics completed</th>
                  <th className="px-4 py-3">Attention</th>
                  <th className="px-4 py-3">Last active</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-line">
                {people.map((p) => (
                  <tr key={p.id}>
                    <td className="px-4 py-3">
                      <Link href={`/admin/completions/people/${p.id}`} className="font-semibold hover:underline">
                        {p.name}
                      </Link>
                      <span className="block text-xs text-ink-muted">
                        {p.org} · {audienceLabel(p.audience)}
                      </span>
                    </td>
                    <td className="px-4 py-3">
                      <div className="flex items-center gap-2">
                        <div className="w-24">
                          <Bar completed={p.completed} inProgress={p.inProgress} total={p.lessons} />
                        </div>
                        {p.completed}/{p.lessons}
                      </div>
                    </td>
                    <td className="px-4 py-3">
                      <span className="flex flex-wrap gap-1.5">
                        {p.overduePaths > 0 && <Badge tone="bad">{p.overduePaths} path overdue</Badge>}
                        {p.needsRefresher > 0 && <Badge tone="warn">{p.needsRefresher} refresher</Badge>}
                        {!p.overduePaths && !p.needsRefresher && <span className="text-ink-muted">—</span>}
                      </span>
                    </td>
                    <td className="px-4 py-3 text-ink-muted">{p.lastActive ? formatDate(p.lastActive) : "Not yet"}</td>
                  </tr>
                ))}
              </tbody>
            </table>
            {!people.length && <p className="p-6 text-center text-ink-muted">No one matches.</p>}
          </div>
        </>
      )}
    </AdminShell>
  );
}

const FILTERS = [
  ["all", "Everyone"],
  ["completed", "Completed"],
  ["in_progress", "In progress"],
  ["not_started", "Not started"],
  ["refresher", "Needs refresher"],
] as const;

export function LessonCompletions({ slug }: { slug: string }) {
  const { data, error } = useApi<{
    lesson: { slug: string; title: string; version: string; track: string; assessment: { passMark: number } | null };
    people: (Row & { person: Person; expected: boolean })[];
    questions: Question[];
  }>(`/api/admin/completions/lessons/${slug}`);
  const [filter, setFilter] = useState<(typeof FILTERS)[number][0]>("all");
  const rows = (data?.people ?? []).filter((r) => (filter === "all" ? true : filter === "refresher" ? r.needsRefresher : r.state === filter));
  const count = (f: (typeof FILTERS)[number][0]) =>
    (data?.people ?? []).filter((r) => (f === "all" ? true : f === "refresher" ? r.needsRefresher : r.state === f)).length;
  return (
    <AdminShell title={data?.lesson.title ?? "Topic completions"} back={{ href: "/admin/completions", label: "Completions" }}>
      {error && <ErrorNote text={error} />}
      {!data ? (
        <p className="text-ink-muted">Loading…</p>
      ) : (
        <div className="flex flex-col gap-8">
          <div className="flex flex-wrap items-center justify-between gap-3">
            <p className="text-ink-muted">Live version {data.lesson.version}</p>
            <Export lesson={slug} />
          </div>
          <section>
            <div className="flex flex-wrap gap-2" role="group" aria-label="Show">
              {FILTERS.map(([f, label]) => (
                <button
                  key={f}
                  type="button"
                  aria-pressed={filter === f}
                  onClick={() => setFilter(f)}
                  className={cx(
                    "min-h-9 rounded-full border px-3 text-sm font-semibold",
                    filter === f ? "border-[var(--action)] bg-[var(--action)] text-white" : "border-line-strong text-ink-muted hover:text-ink",
                  )}
                >
                  {label} ({count(f)})
                </button>
              ))}
            </div>
            <div className="mt-3 overflow-x-auto rounded-3xl border border-line bg-surface">
              <table className="w-full min-w-[640px] text-left text-sm">
                <thead className="border-b border-line text-xs uppercase tracking-wide text-ink-muted">
                  <tr>
                    <th className="px-4 py-3">Person</th>
                    <th className="px-4 py-3">Progress</th>
                    <th className="px-4 py-3">{data.lesson.assessment ? "Assessment" : "Quiz first try"}</th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-line">
                  {rows.map((r) => (
                    <tr key={r.person.id}>
                      <td className="px-4 py-3">
                        <Link href={`/admin/completions/people/${r.person.id}`} className="font-semibold hover:underline">
                          {r.person.name}
                        </Link>
                        <span className="block text-xs text-ink-muted">
                          {r.person.org} · {audienceLabel(r.person.audience)}
                          {!r.expected && " · not their audience"}
                          {r.enrolled && " · self-enrolled"}
                        </span>
                      </td>
                      <td className="px-4 py-3">
                        <StateCell r={r} />
                      </td>
                      <td className="px-4 py-3">{data.lesson.assessment ? <AssessmentResult a={r.assessment} /> : <Score s={r.score} />}</td>
                    </tr>
                  ))}
                </tbody>
              </table>
              {!rows.length && <p className="p-6 text-center text-ink-muted">No one here.</p>}
            </div>
          </section>
          {data.questions.length > 0 && (
            <section>
              <h2 className="font-serif text-xl font-semibold">Quiz questions</h2>
              <p className="text-sm text-ink-muted">How people did on their first try, and the wrong answers they chose most.</p>
              <ul className="mt-3 flex flex-col gap-3">
                {data.questions.map((qn) => {
                  const p = pct(qn.right, qn.answered);
                  return (
                    <li key={`${qn.cardId}.${qn.id}`} className="rounded-3xl border border-line bg-surface p-5">
                      <p className="font-semibold">{qn.prompt}</p>
                      {qn.answered ? (
                        <>
                          <div className="mt-2 flex items-center gap-3">
                            <div className="h-2.5 flex-1 overflow-hidden rounded-full bg-muted">
                              <div className={cx("h-full", p < 60 ? "bg-danger" : p < 80 ? "bg-gold" : "bg-[var(--action)]")} style={{ width: `${p}%` }} />
                            </div>
                            <span className="text-sm font-semibold">
                              {p}% right first try ({qn.right} of {qn.answered})
                            </span>
                          </div>
                          {qn.wrongPicks.length > 0 && (
                            <ul className="mt-2 flex flex-col gap-1 text-sm">
                              {qn.wrongPicks.map((w) => (
                                <li key={w.label} className="flex gap-2">
                                  <Icon name="close" className="mt-0.5 size-4 shrink-0 text-danger" />
                                  <span>
                                    {w.label} <span className="text-ink-muted">· chosen by {w.count}</span>
                                  </span>
                                </li>
                              ))}
                            </ul>
                          )}
                        </>
                      ) : (
                        <p className="mt-1 text-sm text-ink-muted">No answers yet.</p>
                      )}
                    </li>
                  );
                })}
              </ul>
            </section>
          )}
        </div>
      )}
    </AdminShell>
  );
}

export function PersonCompletions({ id }: { id: string }) {
  const { data, error } = useApi<{
    person: Person;
    lessons: (Row & { slug: string; title: string; liveVersion: string; expected: boolean })[];
    paths: PathRow[];
    signoffs: { lesson: string; outcome: "confirmed" | "support"; note: string; at: string; by: string }[];
  }>(`/api/admin/completions/people/${id}`);
  const today = new Date().toISOString().slice(0, 10);
  return (
    <AdminShell title={data?.person.name ?? "Learner record"} back={{ href: "/admin/completions", label: "Completions" }}>
      {error && <ErrorNote text={error} />}
      {!data ? (
        <p className="text-ink-muted">Loading…</p>
      ) : (
        <div className="flex flex-col gap-8">
          <p className="text-ink-muted">
            {data.person.org} · {audienceLabel(data.person.audience)} · {data.person.email}
          </p>
          <section>
            <h2 className="font-serif text-xl font-semibold">Topics</h2>
            <div className="mt-3 overflow-x-auto rounded-3xl border border-line bg-surface">
              <table className="w-full min-w-[640px] text-left text-sm">
                <thead className="border-b border-line text-xs uppercase tracking-wide text-ink-muted">
                  <tr>
                    <th className="px-4 py-3">Topic</th>
                    <th className="px-4 py-3">Progress</th>
                    <th className="px-4 py-3">Quiz or assessment</th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-line">
                  {data.lessons.map((l) => (
                    <tr key={l.slug}>
                      <td className="px-4 py-3">
                        <Link href={`/admin/completions/lessons/${l.slug}`} className="font-semibold hover:underline">
                          {l.title}
                        </Link>
                        <span className="block text-xs text-ink-muted">Live version {l.liveVersion}</span>
                      </td>
                      <td className="px-4 py-3">
                        <StateCell r={l} />
                      </td>
                      <td className="px-4 py-3">{l.assessment ? <AssessmentResult a={l.assessment} /> : <Score s={l.score} />}</td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          </section>
          <section>
            <h2 className="font-serif text-xl font-semibold">Learning paths</h2>
            {data.paths.length ? (
              <ul className="mt-3 grid gap-3 md:grid-cols-2">
                {data.paths.map((p) => (
                  <li key={p.id} className="flex flex-col gap-2 rounded-3xl border border-line bg-surface p-5">
                    <Link href={`/admin/learning-paths/${p.id}`} className="font-semibold hover:underline">
                      {p.name}
                    </Link>
                    <Bar completed={p.completed} inProgress={0} total={p.total} />
                    <p className="flex flex-wrap items-center gap-2 text-sm">
                      {p.completed} of {p.total} topics
                      {p.selfEnrolled && <Badge tone="neutral">Self-enrolled</Badge>}
                      {p.done ? (
                        <Badge tone="good">Finished</Badge>
                      ) : (
                        p.dueDate && (
                          <Badge tone={p.dueDate < today ? "bad" : "neutral"}>
                            {p.dueDate < today ? "Overdue" : "Due"} {formatDate(p.dueDate)}
                          </Badge>
                        )
                      )}
                    </p>
                  </li>
                ))}
              </ul>
            ) : (
              <p className="mt-2 text-sm text-ink-muted">Not assigned to or enrolled in any learning paths.</p>
            )}
          </section>
          <section>
            <h2 className="font-serif text-xl font-semibold">Manager sign-offs</h2>
            {data.signoffs.length ? (
              <ul className="mt-3 divide-y divide-line rounded-3xl border border-line bg-surface px-5">
                {data.signoffs.map((s, i) => (
                  <li key={i} className="py-3 text-sm">
                    <span className="flex flex-wrap items-center gap-2">
                      <span className="font-semibold">{s.lesson}</span>
                      <Badge tone={s.outcome === "confirmed" ? "good" : "warn"}>{s.outcome === "confirmed" ? "Applying it at work" : "Needs support"}</Badge>
                    </span>
                    {s.note && <span className="mt-1 block">{s.note}</span>}
                    <span className="block text-xs text-ink-muted">
                      {s.by}, {formatDate(s.at)}
                    </span>
                  </li>
                ))}
              </ul>
            ) : (
              <p className="mt-2 text-sm text-ink-muted">No sign-offs yet.</p>
            )}
          </section>
        </div>
      )}
    </AdminShell>
  );
}

type PathSummary = { id: string; name: string; topics: number; assigned: number; completed: number; inProgress: number; notStarted: number; overdue: number };
type PathPersonRow = {
  person: Person;
  completed: number;
  total: number;
  state: "completed" | "in_progress" | "not_started";
  dueDate: string | null;
  selfEnrolled: boolean;
  overdue: boolean;
  lastActive: string | null;
  next: { slug: string; title: string } | null;
};
const PATH_FILTERS = [
  ["all", "Everyone"],
  ["completed", "Finished"],
  ["in_progress", "In progress"],
  ["not_started", "Not started"],
  ["overdue", "Overdue"],
] as const;

/** One learning path: each assigned person's progress, and how far everyone has got with each topic. */
export function PathCompletions({ id }: { id: string }) {
  const { data, error } = useApi<{
    path: { id: string; name: string };
    people: PathPersonRow[];
    topics: { slug: string; title: string; completed: number; inProgress: number }[];
  }>(`/api/admin/completions/paths/${id}`);
  const [filter, setFilter] = useState<(typeof PATH_FILTERS)[number][0]>("all");
  const match = (r: PathPersonRow, f: (typeof PATH_FILTERS)[number][0]) => (f === "all" ? true : f === "overdue" ? r.overdue : r.state === f);
  const rows = (data?.people ?? []).filter((r) => match(r, filter));
  const assigned = data?.people.length ?? 0;
  return (
    <AdminShell title={data?.path.name ?? "Learning path"} back={{ href: "/admin/completions", label: "Completions" }}>
      {error && <ErrorNote text={error} />}
      {!data ? (
        <p className="text-ink-muted">Loading…</p>
      ) : (
        <div className="flex flex-col gap-8">
          <section aria-label="People">
            <div className="flex flex-wrap items-center gap-2">
              {PATH_FILTERS.map(([f, label]) => (
                <button
                  key={f}
                  type="button"
                  aria-pressed={filter === f}
                  onClick={() => setFilter(f)}
                  className={cx(
                    "min-h-9 rounded-full border px-3 text-sm font-semibold",
                    filter === f ? "border-action bg-tealtint" : "border-line-strong hover:bg-muted",
                  )}
                >
                  {label} <span className="font-normal text-ink-muted">{data.people.filter((r) => match(r, f)).length}</span>
                </button>
              ))}
              <Link href={`/admin/learning-paths/${encodeURIComponent(id)}`} className="ml-auto text-sm font-semibold text-accent hover:underline">
                Assign people or edit the path
              </Link>
            </div>
            <div className="mt-4 overflow-x-auto rounded-3xl border border-line bg-surface">
              <table className="w-full min-w-[720px] text-left text-sm">
                <thead className="border-b border-line text-xs uppercase tracking-wide text-ink-muted">
                  <tr>
                    <th className="px-4 py-3">Person</th>
                    <th className="px-4 py-3">Progress</th>
                    <th className="px-4 py-3">Next topic</th>
                    <th className="px-4 py-3">Due</th>
                    <th className="px-4 py-3">Last active</th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-line">
                  {rows.map((r) => (
                    <tr key={r.person.id}>
                      <td className="px-4 py-3">
                        <Link href={`/admin/completions/people/${r.person.id}`} className="font-semibold hover:underline">
                          {r.person.name}
                        </Link>
                        <span className="block text-xs text-ink-muted">
                          {r.person.org}
                          {r.selfEnrolled && " · self-enrolled"}
                        </span>
                      </td>
                      <td className="px-4 py-3">
                        <div className="flex items-center gap-2">
                          <div className="w-28">
                            <Bar completed={r.completed} inProgress={r.state === "in_progress" && !r.completed ? 1 : 0} total={r.total} />
                          </div>
                          {r.completed}/{r.total}
                          {r.state === "completed" && <Badge tone="good">Finished</Badge>}
                        </div>
                      </td>
                      <td className="px-4 py-3">{r.next ? r.next.title : <span className="text-ink-muted">—</span>}</td>
                      <td className="px-4 py-3">
                        {r.dueDate ? formatDate(r.dueDate) : <span className="text-ink-muted">No due date</span>}
                        {r.overdue && (
                          <span className="ml-1.5">
                            <Badge tone="bad">Overdue</Badge>
                          </span>
                        )}
                      </td>
                      <td className="px-4 py-3 text-ink-muted">{r.lastActive ? formatDate(r.lastActive) : "Not yet"}</td>
                    </tr>
                  ))}
                </tbody>
              </table>
              {!rows.length && <p className="p-6 text-center text-ink-muted">{assigned ? "No one matches." : "Nobody is assigned this path yet."}</p>}
            </div>
          </section>

          {assigned > 0 && (
            <section aria-labelledby="path-topics">
              <h2 id="path-topics" className="font-serif text-xl font-semibold">
                Topic by topic
              </h2>
              <p className="mt-1 text-sm text-ink-muted">How many of the {assigned} people assigned have finished each topic in the path.</p>
              <ol className="mt-3 flex flex-col divide-y divide-line rounded-3xl border border-line bg-surface">
                {data.topics.map((t, i) => (
                  <li key={t.slug} className="grid items-center gap-2 px-4 py-3 sm:grid-cols-[2rem_minmax(0,1fr)_12rem_6rem]">
                    <span className="text-sm tabular-nums text-ink-muted">{i + 1}</span>
                    <Link href={`/admin/completions/lessons/${t.slug}`} className="font-semibold hover:underline">
                      {t.title}
                    </Link>
                    <Bar completed={t.completed} inProgress={t.inProgress} total={assigned} />
                    <span className="text-sm tabular-nums">
                      {t.completed}/{assigned}
                    </span>
                  </li>
                ))}
              </ol>
            </section>
          )}
        </div>
      )}
    </AdminShell>
  );
}
