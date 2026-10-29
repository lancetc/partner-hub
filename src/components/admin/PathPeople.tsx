"use client";

import { useEffect, useMemo, useRef, useState } from "react";
import { createPortal } from "react-dom";
import { cx, formatDate } from "@/lib/format";
import { Badge, btn, ErrorNote, Field, input } from "./ui";
import { Icon } from "../Icon";

/*
  Assigning a learning path when there are hundreds of people. Choosing happens in a window: search,
  filter by organisation and role, select page by page or everyone who matches, set a due date.
  The Assigned list stays in the sidebar, searchable and filterable by progress.
*/

export type Person = { id: string; name: string; audience: string; service_role: string | null; org: string };
export type AssignedPerson = {
  userId: string;
  name: string;
  org: string;
  dueDate: string | null;
  completed: number;
  total: number;
  done: boolean;
  nextTitle: string | null;
};

const roleOf = (p: Person) => p.service_role ?? p.audience;
const nice = (s: string) => s.replace(/_/g, " ").replace(/^./, (c) => c.toUpperCase());
const PAGE = 25;

export function AssignDialog({
  people,
  busy,
  error,
  onAssign,
  onClose,
}: {
  people: Person[];
  busy: boolean;
  error: string | null;
  onAssign: (ids: string[], due: string | null) => void;
  onClose: () => void;
}) {
  const [q, setQ] = useState("");
  const [org, setOrg] = useState("all");
  const [role, setRole] = useState("all");
  const [limit, setLimit] = useState(PAGE);
  const [chosen, setChosen] = useState<Set<string>>(new Set());
  const [due, setDue] = useState("");
  const search = useRef<HTMLInputElement>(null);
  useEffect(() => {
    search.current?.focus();
    const onKey = (e: KeyboardEvent) => e.key === "Escape" && onClose();
    document.addEventListener("keydown", onKey);
    return () => document.removeEventListener("keydown", onKey);
  }, [onClose]);

  const orgs = useMemo(() => [...new Set(people.map((p) => p.org))].sort(), [people]);
  const roles = useMemo(() => [...new Set(people.map(roleOf))].sort(), [people]);
  const needle = q.trim().toLowerCase();
  const matches = useMemo(
    () =>
      people
        .filter(
          (p) =>
            (org === "all" || p.org === org) &&
            (role === "all" || roleOf(p) === role) &&
            (!needle || `${p.name} ${p.org} ${roleOf(p)}`.toLowerCase().includes(needle)),
        )
        .sort((a, b) => a.name.localeCompare(b.name, "en-AU")),
    [people, org, role, needle],
  );
  const shown = matches.slice(0, limit);
  const allMatchingChosen = matches.length > 0 && matches.every((p) => chosen.has(p.id));
  const toggle = (id: string, on: boolean) =>
    setChosen((c) => {
      const n = new Set(c);
      if (on) n.add(id);
      else n.delete(id);
      return n;
    });
  const setMatching = (on: boolean) =>
    setChosen((c) => {
      const n = new Set(c);
      for (const p of matches)
        if (on) n.add(p.id);
        else n.delete(p.id);
      return n;
    });
  const filterChange = (fn: () => void) => {
    fn();
    setLimit(PAGE);
  };

  // Drawn at the top of the page: inside the sticky sidebar it would sit under the site header.
  return createPortal(
    <div
      role="dialog"
      aria-modal="true"
      aria-labelledby="assign-title"
      className="fixed inset-0 z-50 grid place-items-center bg-[rgb(10_26_46/0.55)] p-3 sm:p-6"
      onClick={onClose}
    >
      <div
        className="flex max-h-[calc(100dvh-1.5rem)] w-[min(56rem,100%)] flex-col overflow-hidden rounded-3xl bg-surface text-ink shadow-2xl"
        onClick={(e) => e.stopPropagation()}
      >
        <header className="flex items-start justify-between gap-3 border-b border-line p-5">
          <div>
            <h2 id="assign-title" className="font-serif text-2xl font-semibold">
              Assign people
            </h2>
            <p className="text-sm text-ink-muted">{people.length} people can be assigned this path.</p>
          </div>
          <button type="button" onClick={onClose} aria-label="Close" className="grid size-10 shrink-0 place-items-center rounded-full hover:bg-muted">
            <Icon name="close" className="size-5" />
          </button>
        </header>

        <div className="flex flex-wrap items-end gap-2 border-b border-line px-5 py-3">
          <label className="flex min-w-[13rem] flex-1 flex-col gap-1 text-sm font-semibold">
            Search
            <span className="relative">
              <Icon name="search" className="pointer-events-none absolute left-3 top-1/2 size-4 -translate-y-1/2 text-ink-muted" />
              <input
                ref={search}
                type="search"
                className={cx(input, "pl-9 font-normal")}
                placeholder="Name, organisation or role"
                value={q}
                onChange={(e) => filterChange(() => setQ(e.target.value))}
              />
            </span>
          </label>
          <label className="flex flex-col gap-1 text-sm font-semibold">
            Organisation
            <select className={cx(input, "w-auto max-w-[16rem] font-normal")} value={org} onChange={(e) => filterChange(() => setOrg(e.target.value))}>
              <option value="all">All organisations</option>
              {orgs.map((o) => (
                <option key={o} value={o}>
                  {o}
                </option>
              ))}
            </select>
          </label>
          <label className="flex flex-col gap-1 text-sm font-semibold">
            Role
            <select className={cx(input, "w-auto font-normal")} value={role} onChange={(e) => filterChange(() => setRole(e.target.value))}>
              <option value="all">All roles</option>
              {roles.map((r) => (
                <option key={r} value={r}>
                  {nice(r)}
                </option>
              ))}
            </select>
          </label>
        </div>

        <div className="flex flex-wrap items-center justify-between gap-2 px-5 py-2.5 text-sm">
          <span role="status" className="text-ink-muted">
            {matches.length ? `${matches.length} ${matches.length === 1 ? "match" : "matches"}` : "Nobody matches."}
          </span>
          {matches.length > 0 && (
            <button type="button" className="font-semibold text-accent hover:underline" onClick={() => setMatching(!allMatchingChosen)}>
              {allMatchingChosen ? `Clear all ${matches.length} matching` : `Select all ${matches.length} matching`}
            </button>
          )}
        </div>

        <ul className="min-h-0 flex-1 divide-y divide-line overflow-y-auto border-y border-line">
          {shown.map((p) => {
            const on = chosen.has(p.id);
            return (
              <li key={p.id}>
                <label className={cx("flex min-h-12 cursor-pointer items-center gap-3 px-5 py-2 hover:bg-muted", on && "bg-tealtint/60")}>
                  <input type="checkbox" className="size-5 shrink-0 accent-[var(--action)]" checked={on} onChange={(e) => toggle(p.id, e.target.checked)} />
                  <span className="min-w-0 flex-1">
                    <span className="block font-medium">{p.name}</span>
                    <span className="block truncate text-xs text-ink-muted">
                      {p.org} · {nice(roleOf(p))}
                    </span>
                  </span>
                </label>
              </li>
            );
          })}
          {matches.length > shown.length && (
            <li className="px-5 py-3">
              <button type="button" className="font-semibold text-accent hover:underline" onClick={() => setLimit((n) => n + PAGE)}>
                Show {Math.min(PAGE, matches.length - shown.length)} more of {matches.length - shown.length}
              </button>
            </li>
          )}
        </ul>

        <footer className="flex flex-wrap items-end gap-3 p-5">
          <Field label="Due date (optional)">
            <input type="date" className={input} value={due} onChange={(e) => setDue(e.target.value)} />
          </Field>
          <div className="ml-auto flex flex-wrap items-center gap-3">
            {chosen.size > 0 && (
              <button type="button" className="text-sm font-semibold text-ink-muted hover:underline" onClick={() => setChosen(new Set())}>
                Clear {chosen.size} selected
              </button>
            )}
            <button type="button" className={btn.primary} disabled={busy || !chosen.size} onClick={() => onAssign([...chosen], due || null)}>
              {busy ? "Assigning…" : chosen.size ? `Assign ${chosen.size} ${chosen.size === 1 ? "person" : "people"}` : "Choose people to assign"}
            </button>
          </div>
          {error && (
            <div className="w-full">
              <ErrorNote text={error} />
            </div>
          )}
        </footer>
      </div>
    </div>,
    document.body,
  );
}

const FILTERS = {
  all: "All",
  progress: "In progress",
  notstarted: "Not started",
  overdue: "Overdue",
  finished: "Finished",
} as const;
type FilterId = keyof typeof FILTERS;
const statusOf = (a: AssignedPerson, today: string): Exclude<FilterId, "all"> =>
  a.done ? "finished" : a.dueDate && a.dueDate < today ? "overdue" : a.completed > 0 ? "progress" : "notstarted";

/** Everyone on the path: search, filter by progress, and page through. */
export function AssignedList({ assigned, busy, onRemove }: { assigned: AssignedPerson[]; busy: boolean; onRemove: (a: AssignedPerson) => void }) {
  const [q, setQ] = useState("");
  const [filter, setFilter] = useState<FilterId>("all");
  const [limit, setLimit] = useState(10);
  const today = new Date().toISOString().slice(0, 10);
  const counts = useMemo(() => {
    const c: Record<FilterId, number> = { all: assigned.length, progress: 0, notstarted: 0, overdue: 0, finished: 0 };
    for (const a of assigned) c[statusOf(a, today)]++;
    return c;
  }, [assigned, today]);
  const needle = q.trim().toLowerCase();
  const matches = assigned
    .filter((a) => (filter === "all" || statusOf(a, today) === filter) && (!needle || `${a.name} ${a.org}`.toLowerCase().includes(needle)))
    // Overdue first, then those furthest from finishing.
    .sort(
      (a, b) =>
        Number(statusOf(b, today) === "overdue") - Number(statusOf(a, today) === "overdue") ||
        a.completed / (a.total || 1) - b.completed / (b.total || 1) ||
        a.name.localeCompare(b.name),
    );
  const shown = matches.slice(0, limit);

  if (!assigned.length) return <p className="mt-2 text-sm text-ink-muted">Nobody yet.</p>;
  return (
    <>
      {assigned.length > 5 && (
        <>
          <input
            type="search"
            className={cx(input, "mt-3")}
            placeholder={`Search ${assigned.length} people`}
            value={q}
            onChange={(e) => {
              setQ(e.target.value);
              setLimit(10);
            }}
            aria-label="Search assigned people"
          />
          <div className="mt-2 flex flex-wrap gap-1" role="group" aria-label="Filter by progress">
            {(Object.keys(FILTERS) as FilterId[])
              .filter((f) => f === "all" || counts[f] > 0)
              .map((f) => (
                <button
                  key={f}
                  type="button"
                  aria-pressed={filter === f}
                  onClick={() => {
                    setFilter(f);
                    setLimit(10);
                  }}
                  className={cx(
                    "min-h-8 rounded-full border px-2.5 text-xs font-semibold",
                    filter === f ? "border-action bg-action text-on-action" : "border-line-strong text-ink-muted hover:text-ink",
                    f === "overdue" && filter !== f && "border-danger/50 text-danger",
                  )}
                >
                  {FILTERS[f]} {counts[f]}
                </button>
              ))}
          </div>
        </>
      )}
      <ul className="mt-2 flex flex-col divide-y divide-line">
        {shown.map((a) => {
          const st = statusOf(a, today);
          return (
            <li key={a.userId} className="py-3">
              <div className="flex items-start gap-2">
                <div className="min-w-0 flex-1">
                  <p className="font-semibold">{a.name}</p>
                  <p className="text-xs text-ink-muted">{a.org}</p>
                </div>
                {st === "finished" ? (
                  <Badge tone="good">Finished</Badge>
                ) : (
                  a.dueDate && <Badge tone={st === "overdue" ? "bad" : "neutral"}>Due {formatDate(a.dueDate)}</Badge>
                )}
                <button type="button" className={btn.quiet} disabled={busy} onClick={() => onRemove(a)} aria-label={`Remove ${a.name}`}>
                  <Icon name="close" className="size-4" />
                </button>
              </div>
              <div className="mt-2 flex items-center gap-2">
                <div className="h-2 flex-1 overflow-hidden rounded-full bg-muted" role="img" aria-label={`${a.completed} of ${a.total} topics done`}>
                  <div className="h-full rounded-full bg-action" style={{ width: `${a.total ? (a.completed / a.total) * 100 : 0}%` }} />
                </div>
                <span className="text-xs text-ink-muted">
                  {a.completed}/{a.total}
                </span>
              </div>
              {a.nextTitle && <p className="mt-1 text-xs text-ink-muted">Next: {a.nextTitle}</p>}
            </li>
          );
        })}
      </ul>
      {!shown.length && <p className="py-3 text-sm text-ink-muted">Nobody matches.</p>}
      {matches.length > shown.length && (
        <button type="button" className="mt-1 text-sm font-semibold text-accent hover:underline" onClick={() => setLimit((n) => n + 20)}>
          Show more ({matches.length - shown.length} left)
        </button>
      )}
    </>
  );
}
