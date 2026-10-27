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
  completedAt: string | null;
  version: string | null;
  needsRefresher: boolean;
  lastActive: string | null;
  reached: { title: string; step: number; of: number } | null;
  score: { right: number; asked: number } | null;
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
type PathRow = { id: string; name: string; dueDate: string | null; completed: number; total: number; done: boolean };

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

export function CompletionsOverview() {
  const { data, error } = useApi<{ lessons: LessonSummary[]; people: PersonSummary[] }>("/api/admin/completions");
  const [view, setView] = useState<"lessons" | "people">("lessons");
  const [q, setQ] = useState("");
  const people = useMemo(() => (data?.people ?? []).filter((p) => `${p.name} ${p.org} ${p.email}`.toLowerCase().includes(q.trim().toLowerCase())), [data, q]);
  return (
    <AdminShell title="Completions">
      <div className="flex flex-wrap items-start justify-between gap-4">
        <p className="max-w-3xl text-ink-muted">
          Who has finished each lesson, who started and stopped, and who hasn’t opened it yet. “Needs refresher” means they finished a version from before an
          important change.
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
            ["lessons", "By lesson"],
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
                  <th className="px-4 py-3">Lessons completed</th>
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
    lesson: { slug: string; title: string; version: string; track: string };
    people: (Row & { person: Person; expected: boolean })[];
    questions: Question[];
  }>(`/api/admin/completions/lessons/${slug}`);
  const [filter, setFilter] = useState<(typeof FILTERS)[number][0]>("all");
  const rows = (data?.people ?? []).filter((r) => (filter === "all" ? true : filter === "refresher" ? r.needsRefresher : r.state === filter));
  const count = (f: (typeof FILTERS)[number][0]) =>
    (data?.people ?? []).filter((r) => (f === "all" ? true : f === "refresher" ? r.needsRefresher : r.state === f)).length;
  return (
    <AdminShell title={data?.lesson.title ?? "Lesson completions"} back={{ href: "/admin/completions", label: "Completions" }}>
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
                    <th className="px-4 py-3">Quiz first try</th>
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
                        </span>
                      </td>
                      <td className="px-4 py-3">
                        <StateCell r={r} />
                      </td>
                      <td className="px-4 py-3">
                        <Score s={r.score} />
                      </td>
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
            <h2 className="font-serif text-xl font-semibold">Lessons</h2>
            <div className="mt-3 overflow-x-auto rounded-3xl border border-line bg-surface">
              <table className="w-full min-w-[640px] text-left text-sm">
                <thead className="border-b border-line text-xs uppercase tracking-wide text-ink-muted">
                  <tr>
                    <th className="px-4 py-3">Lesson</th>
                    <th className="px-4 py-3">Progress</th>
                    <th className="px-4 py-3">Quiz first try</th>
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
                      <td className="px-4 py-3">
                        <Score s={l.score} />
                      </td>
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
                      {p.completed} of {p.total} lessons
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
              <p className="mt-2 text-sm text-ink-muted">Not assigned to any learning paths.</p>
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
