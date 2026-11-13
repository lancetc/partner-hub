"use client";

import Link from "next/link";
import { useEffect, useMemo, useRef, useState } from "react";
import { createPortal } from "react-dom";
import { api, useApi } from "@/lib/api";
import { cx, formatDate, formatHoursMinutes } from "@/lib/format";
import { Icon } from "../Icon";
import { UserAvatar } from "../UserAvatar";
import { AdminShell, Badge, btn, ErrorNote, Field, input } from "./ui";

/*
  People and permissions, for superadmins (Trilogy staff who look after everyone's access and learning).
  Everyone in the hub in one table: search, filter by organisation, access and learning, tick people
  and assign them a learning path or a single topic with a due date. Opening a person shows their
  access (which can be changed here), everything assigned to them with progress, and what they've
  finished lately, with a link to their full completions report. Server: server/people.ts.
*/

type Access = "learner" | "org_admin" | "author" | "superadmin";
type ReviewRole = "sme" | "compliance" | "publisher" | null;

type Row = {
  id: string;
  name: string;
  email: string;
  org: string;
  orgId: string;
  audience: string;
  serviceRole: string | null;
  avatar: string | null;
  access: Access;
  reviewRole: ReviewRole;
  completed: number;
  inProgress: number;
  assignedPaths: number;
  pathsDone: number;
  assignedTopics: number;
  topicsDone: number;
  overdue: number;
  lastActive: string | null;
};
type Directory = {
  people: Row[];
  orgs: { id: string; name: string }[];
  assignable: { topics: { id: string; title: string; minutes: number }[]; paths: { id: string; title: string; topics: number }[] };
  you: string;
};
type Detail = {
  id: string;
  name: string;
  email: string;
  org: string;
  /** Learning author and superadmin access are for Trilogy Care staff. */
  trilogy: boolean;
  audience: string;
  serviceRole: string | null;
  avatar: string | null;
  access: Access;
  reviewRole: ReviewRole;
  reviewArea: string;
  paths: { id: string; name: string; dueDate: string | null; selfEnrolled: boolean; completed: number; total: number; done: boolean; overdue: boolean }[];
  topics: {
    slug: string;
    title: string;
    minutes: number;
    dueDate: string | null;
    assignedBy: string;
    state: "not_started" | "in_progress" | "completed";
    completedAt: string | null;
    overdue: boolean;
  }[];
  recent: { slug: string; title: string; completedAt: string | null; needsRefresher: boolean }[];
  reportHref: string | null;
};

const ACCESS: { value: Access; label: string; description: string }[] = [
  { value: "learner", label: "Learner", description: "Learns in the hub. No admin." },
  { value: "org_admin", label: "Organisation admin", description: "Reports and assigning learning for their own organisation." },
  { value: "author", label: "Learning author", description: "Trilogy staff: writes topics and paths, sees every organisation's reports." },
  { value: "superadmin", label: "Superadmin", description: "A learning author who also manages people and permissions here." },
];
const accessLabel = (a: Access) => ACCESS.find((x) => x.value === a)!.label;
const accessTone = (a: Access) => (a === "superadmin" ? "bad" : a === "author" ? "info" : a === "org_admin" ? "warn" : "neutral");
const REVIEW: { value: Exclude<ReviewRole, null>; label: string }[] = [
  { value: "sme", label: "Subject matter reviewer" },
  { value: "compliance", label: "Compliance reviewer" },
  { value: "publisher", label: "Publisher" },
];
const nice = (s: string) => s.replace(/_/g, " ").replace(/^./, (c) => c.toUpperCase());
const roleOf = (p: { serviceRole: string | null; audience: string }) => nice(p.serviceRole ?? p.audience);
const PAGE = 40;

export function PeopleAdmin() {
  const { data, error, reload } = useApi<Directory>("/api/admin/people");
  const [q, setQ] = useState("");
  const [org, setOrg] = useState("all");
  const [access, setAccess] = useState<"all" | Access>("all");
  const [learning, setLearning] = useState<"any" | "overdue" | "assigned" | "none">("any");
  const [limit, setLimit] = useState(PAGE);
  const [chosen, setChosen] = useState<Set<string>>(new Set());
  const [assignFor, setAssignFor] = useState<string[] | null>(null);
  const [open, setOpen] = useState<string | null>(null);
  const [notice, setNotice] = useState<string | null>(null);

  const needle = q.trim().toLowerCase();
  const matches = useMemo(
    () =>
      (data?.people ?? []).filter(
        (p) =>
          (org === "all" || p.orgId === org) &&
          (access === "all" || p.access === access) &&
          (learning === "any" ||
            (learning === "overdue" && p.overdue > 0) ||
            (learning === "assigned" && p.assignedPaths + p.assignedTopics > 0) ||
            (learning === "none" && p.assignedPaths + p.assignedTopics === 0)) &&
          (!needle || `${p.name} ${p.email} ${p.org} ${roleOf(p)}`.toLowerCase().includes(needle)),
      ),
    [data, org, access, learning, needle],
  );

  if (error) {
    return (
      <AdminShell title="People and permissions">
        <ErrorNote text={error} />
      </AdminShell>
    );
  }
  if (!data) {
    return (
      <AdminShell title="People and permissions">
        <p className="text-ink-muted">Loading everyone…</p>
      </AdminShell>
    );
  }

  const people = data.people;
  const shown = matches.slice(0, limit);
  const allChosen = matches.length > 0 && matches.every((p) => chosen.has(p.id));
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
  const filter = (fn: () => void) => {
    fn();
    setLimit(PAGE);
  };
  const assignedTotal = people.reduce((n, p) => n + p.assignedPaths + p.assignedTopics, 0);
  const assignedDone = people.reduce((n, p) => n + p.pathsDone + p.topicsDone, 0);
  const filtering = Boolean(needle) || org !== "all" || access !== "all" || learning !== "any";

  return (
    <AdminShell title="People and permissions">
      <p className="max-w-3xl text-ink-muted">
        Everyone in the hub, across every organisation. Give people access, assign learning paths or single topics with a due date, and follow how they’re going.
        Assigned learning shows up in each person’s Inbox and under “Your learning”.
      </p>

      {/* At a glance */}
      <dl className="mt-6 grid grid-cols-2 gap-3 lg:grid-cols-4">
        <Stat label="People" value={people.length} note={`${data.orgs.length} organisations`} />
        <Stat
          label="Staff with admin"
          value={people.filter((p) => p.access !== "learner").length}
          note={(() => {
            const n = people.filter((p) => p.access === "superadmin").length;
            return `${n} ${n === 1 ? "superadmin" : "superadmins"}`;
          })()}
        />
        <Stat label="Assigned learning finished" value={assignedTotal ? `${Math.round((assignedDone / assignedTotal) * 100)}%` : "—"} note={`${assignedDone} of ${assignedTotal}`} />
        <Stat
          label="People overdue"
          value={people.filter((p) => p.overdue > 0).length}
          tone={people.some((p) => p.overdue > 0) ? "warn" : undefined}
          note="past a due date"
          onClick={() => filter(() => setLearning("overdue"))}
        />
      </dl>

      {notice && (
        <p role="status" className="mt-6 flex items-center gap-2 rounded-2xl border border-success bg-success/10 px-4 py-3 text-sm font-semibold">
          <Icon name="circle-check" className="size-5 text-success" /> {notice}
          <button type="button" onClick={() => setNotice(null)} className="ml-auto text-ink-muted hover:text-ink" aria-label="Dismiss">
            <Icon name="close" className="size-4" />
          </button>
        </p>
      )}

      {/* Search and filters */}
      <div className="mt-6 flex flex-wrap items-end gap-3">
        <Field label="Search" className="min-w-[14rem] flex-1 sm:max-w-xs">
          <span className="relative">
            <Icon name="search" className="pointer-events-none absolute left-3 top-1/2 size-4 -translate-y-1/2 text-ink-muted" />
            <input type="search" className={cx(input, "pl-9")} placeholder="Name, email or role" value={q} onChange={(e) => filter(() => setQ(e.target.value))} />
          </span>
        </Field>
        <Field label="Organisation">
          <select className={cx(input, "w-auto max-w-[16rem]")} value={org} onChange={(e) => filter(() => setOrg(e.target.value))}>
            <option value="all">All organisations</option>
            {data.orgs.map((o) => (
              <option key={o.id} value={o.id}>
                {o.name}
              </option>
            ))}
          </select>
        </Field>
        <Field label="Access">
          <select className={cx(input, "w-auto")} value={access} onChange={(e) => filter(() => setAccess(e.target.value as Access))}>
            <option value="all">Any access</option>
            {ACCESS.map((a) => (
              <option key={a.value} value={a.value}>
                {a.label}
              </option>
            ))}
          </select>
        </Field>
        <Field label="Learning">
          <select className={cx(input, "w-auto")} value={learning} onChange={(e) => filter(() => setLearning(e.target.value as typeof learning))}>
            <option value="any">Anyone</option>
            <option value="overdue">Overdue</option>
            <option value="assigned">Has assigned learning</option>
            <option value="none">Nothing assigned</option>
          </select>
        </Field>
        <p className="ml-auto flex items-center gap-3 pb-2.5 text-sm text-ink-muted" role="status">
          {filtering ? `Showing ${matches.length} of ${people.length}` : `${people.length} people`}
          {filtering && (
            <button
              type="button"
              className="font-semibold text-accent hover:underline"
              onClick={() =>
                filter(() => {
                  setQ("");
                  setOrg("all");
                  setAccess("all");
                  setLearning("any");
                })
              }
            >
              Clear filters
            </button>
          )}
        </p>
      </div>

      {/* What to do with the people ticked */}
      <div
        className={cx(
          "sticky top-[4.5rem] z-10 mt-4 flex flex-wrap items-center gap-3 rounded-2xl border px-4 py-2.5 transition-colors",
          chosen.size ? "border-action bg-tealtint" : "border-line bg-surface",
        )}
      >
        <p className="text-sm font-semibold">{chosen.size ? `${chosen.size} ${chosen.size === 1 ? "person" : "people"} chosen` : "Tick people to assign them learning"}</p>
        {chosen.size > 0 && (
          <>
            <button type="button" className={cx(btn.primary, "min-h-10 px-4 text-sm")} onClick={() => setAssignFor([...chosen])}>
              <Icon name="plus" className="size-4" /> Assign learning
            </button>
            <button type="button" className={btn.quiet} onClick={() => setChosen(new Set())}>
              Clear
            </button>
          </>
        )}
      </div>

      {/* Everyone */}
      <div className="mt-3 overflow-x-auto rounded-3xl border border-line bg-surface">
        <table className="w-full min-w-[56rem] text-left text-sm">
          <thead className="border-b border-line font-mulish text-xs font-extrabold uppercase tracking-[0.08em] text-ink-muted">
            <tr>
              <th className="w-12 py-3 pl-4">
                <input
                  type="checkbox"
                  className="size-4 accent-[var(--color-action)]"
                  aria-label={allChosen ? "Untick everyone shown" : "Tick everyone who matches"}
                  checked={allChosen}
                  onChange={(e) => setMatching(e.target.checked)}
                />
              </th>
              <th className="py-3 pr-3">Person</th>
              <th className="py-3 pr-3">Organisation</th>
              <th className="py-3 pr-3">Access</th>
              <th className="py-3 pr-3">Assigned learning</th>
              <th className="py-3 pr-3">Topics finished</th>
              <th className="py-3 pr-4">Last active</th>
            </tr>
          </thead>
          <tbody className="divide-y divide-line">
            {shown.map((p) => {
              const assigned = p.assignedPaths + p.assignedTopics;
              const done = p.pathsDone + p.topicsDone;
              return (
                <tr key={p.id} className={cx("hover:bg-muted/60", chosen.has(p.id) && "bg-tealtint/60")}>
                  <td className="py-2.5 pl-4">
                    <input
                      type="checkbox"
                      className="size-4 accent-[var(--color-action)]"
                      aria-label={`Choose ${p.name}`}
                      checked={chosen.has(p.id)}
                      onChange={(e) => toggle(p.id, e.target.checked)}
                    />
                  </td>
                  <td className="py-2.5 pr-3">
                    <button type="button" onClick={() => setOpen(p.id)} className="group flex items-center gap-3 text-left">
                      <UserAvatar name={p.name} src={p.avatar} className="size-9 text-xs" />
                      <span className="min-w-0">
                        <span className="block font-semibold group-hover:underline">
                          {p.name}
                          {p.id === data.you && <span className="font-normal text-ink-muted"> (you)</span>}
                        </span>
                        <span className="block truncate text-xs text-ink-muted">{roleOf(p)}</span>
                      </span>
                    </button>
                  </td>
                  <td className="py-2.5 pr-3">{p.org}</td>
                  <td className="py-2.5 pr-3">
                    <span className="flex flex-wrap gap-1">
                      <Badge tone={accessTone(p.access)}>{accessLabel(p.access)}</Badge>
                      {p.reviewRole && <Badge>{REVIEW.find((r) => r.value === p.reviewRole)?.label}</Badge>}
                    </span>
                  </td>
                  <td className="py-2.5 pr-3">
                    {assigned ? (
                      <span className="flex items-center gap-2">
                        <Meter value={done} total={assigned} />
                        <span className="tabular-nums text-ink-muted">
                          {done}/{assigned}
                        </span>
                        {p.overdue > 0 && <Badge tone="warn">{p.overdue} overdue</Badge>}
                      </span>
                    ) : (
                      <span className="text-ink-muted">None</span>
                    )}
                  </td>
                  <td className="py-2.5 pr-3 tabular-nums">
                    {p.completed}
                    {p.inProgress > 0 && <span className="text-ink-muted"> · {p.inProgress} under way</span>}
                  </td>
                  <td className="py-2.5 pr-4 text-ink-muted">{p.lastActive ? formatDate(p.lastActive) : "Not yet"}</td>
                </tr>
              );
            })}
          </tbody>
        </table>
        {!matches.length && <p className="p-8 text-center text-ink-muted">No one matches. Try another name, or clear the filters.</p>}
      </div>
      {matches.length > shown.length && (
        <button type="button" className={cx(btn.secondary, "mt-4")} onClick={() => setLimit((l) => l + PAGE)}>
          Show more ({matches.length - shown.length} to go)
        </button>
      )}

      {assignFor && (
        <AssignLearning
          people={people.filter((p) => assignFor.includes(p.id))}
          assignable={data.assignable}
          onClose={() => setAssignFor(null)}
          onDone={(text) => {
            setAssignFor(null);
            setChosen(new Set());
            setNotice(text);
            reload();
            // An open person panel shows the new assignment.
            window.dispatchEvent(new Event("people:assigned"));
          }}
        />
      )}
      {open && (
        <PersonPanel
          id={open}
          you={data.you}
          onClose={() => setOpen(null)}
          onChanged={reload}
          onAssign={() => setAssignFor([open])}
        />
      )}
    </AdminShell>
  );
}

function Stat({ label, value, note, tone, onClick }: { label: string; value: number | string; note?: string; tone?: "warn"; onClick?: () => void }) {
  const body = (
    <>
      <dt className="font-mulish text-xs font-extrabold uppercase tracking-[0.1em] text-ink-muted">{label}</dt>
      <dd className={cx("mt-1 font-serif text-3xl font-semibold tabular-nums", tone === "warn" && "text-warm")}>{value}</dd>
      {note && <dd className="text-sm text-ink-muted">{note}</dd>}
    </>
  );
  const box = "rounded-2xl border border-line bg-surface p-4 text-left";
  return onClick ? (
    <button type="button" onClick={onClick} className={cx(box, "hover:border-action")}>
      {body}
    </button>
  ) : (
    <div className={box}>{body}</div>
  );
}

function Meter({ value, total }: { value: number; total: number }) {
  return (
    <span className="block h-2 w-16 overflow-hidden rounded-full bg-muted" role="img" aria-label={`${value} of ${total} finished`}>
      <span className="block h-full bg-action" style={{ width: `${total ? (value / total) * 100 : 0}%` }} />
    </span>
  );
}

/** Windows open now, newest last: Escape closes only the top one. */
const openOverlays: symbol[] = [];

/** A window over the page, closed with Escape or by clicking outside. */
function Overlay({ labelledBy, onClose, side, children }: { labelledBy: string; onClose: () => void; side?: boolean; children: React.ReactNode }) {
  useEffect(() => {
    const me = Symbol();
    openOverlays.push(me);
    const onKey = (e: KeyboardEvent) => e.key === "Escape" && openOverlays.at(-1) === me && onClose();
    document.addEventListener("keydown", onKey);
    return () => {
      document.removeEventListener("keydown", onKey);
      openOverlays.splice(openOverlays.indexOf(me), 1);
    };
  }, [onClose]);
  return createPortal(
    <div
      role="dialog"
      aria-modal="true"
      aria-labelledby={labelledBy}
      className={cx("fixed inset-0 z-50 flex bg-[rgb(10_26_46/0.55)]", side ? "justify-end" : "items-center justify-center p-3 sm:p-6")}
      onClick={onClose}
    >
      <div
        className={cx(
          "flex flex-col overflow-hidden bg-surface text-ink shadow-2xl",
          side ? "people-panel h-full w-[min(36rem,100%)]" : "max-h-[calc(100dvh-1.5rem)] w-[min(40rem,100%)] rounded-3xl",
        )}
        onClick={(e) => e.stopPropagation()}
      >
        {children}
      </div>
    </div>,
    document.body,
  );
}

/** Choose a learning path or a topic, and a due date, for the people chosen. */
function AssignLearning({
  people,
  assignable,
  onClose,
  onDone,
}: {
  people: Row[];
  assignable: Directory["assignable"];
  onClose: () => void;
  onDone: (notice: string) => void;
}) {
  const [kind, setKind] = useState<"path" | "topic">("path");
  const [q, setQ] = useState("");
  const [pick, setPick] = useState<string | null>(null);
  const [due, setDue] = useState("");
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const search = useRef<HTMLInputElement>(null);
  useEffect(() => search.current?.focus(), [kind]);

  const needle = q.trim().toLowerCase();
  const options =
    kind === "path"
      ? assignable.paths.map((p) => ({ id: p.id, title: p.title, meta: `${p.topics} ${p.topics === 1 ? "topic" : "topics"}` }))
      : assignable.topics.map((t) => ({ id: t.id, title: t.title, meta: formatHoursMinutes(t.minutes) }));
  const shown = options.filter((o) => !needle || o.title.toLowerCase().includes(needle));
  const chosen = options.find((o) => o.id === pick);

  const assign = async () => {
    if (!pick) return;
    setBusy(true);
    setError(null);
    try {
      const r = await api<{ assigned: number; title: string }>("/api/admin/people", {
        body: { action: "assign", kind, id: pick, userIds: people.map((p) => p.id), dueDate: due || null },
      });
      onDone(`Assigned “${r.title}” to ${r.assigned === 1 ? people[0].name : `${r.assigned} people`}${due ? `, due ${formatDate(due)}` : ""}. They’ll see it in their Inbox.`);
    } catch (e) {
      setError((e as Error).message);
      setBusy(false);
    }
  };

  return (
    <Overlay labelledBy="assign-learning-title" onClose={onClose}>
      <header className="flex items-start justify-between gap-3 border-b border-line p-5">
        <div>
          <h2 id="assign-learning-title" className="font-serif text-2xl font-semibold">
            Assign learning
          </h2>
          <p className="text-sm text-ink-muted">
            To {people.length === 1 ? people[0].name : `${people.length} people`}
            {people.length > 1 && `: ${people.slice(0, 3).map((p) => p.name.split(" ")[0]).join(", ")}${people.length > 3 ? ` and ${people.length - 3} more` : ""}`}
          </p>
        </div>
        <button type="button" onClick={onClose} aria-label="Close" className="grid size-10 shrink-0 place-items-center rounded-full hover:bg-muted">
          <Icon name="close" className="size-5" />
        </button>
      </header>

      <div className="flex min-h-0 flex-1 flex-col gap-4 overflow-y-auto p-5">
        <div role="radiogroup" aria-label="What to assign" className="flex w-fit rounded-full border border-line-strong p-0.5">
          {(["path", "topic"] as const).map((k) => (
            <button
              key={k}
              type="button"
              role="radio"
              aria-checked={kind === k}
              onClick={() => {
                setKind(k);
                setPick(null);
                setQ("");
              }}
              className={cx("inline-flex min-h-10 items-center gap-1.5 rounded-full px-4 text-sm font-semibold", kind === k ? "bg-action text-on-action" : "hover:bg-muted")}
            >
              <Icon name={k === "path" ? "route" : "book"} className="size-4" /> {k === "path" ? "A learning path" : "A single topic"}
            </button>
          ))}
        </div>

        <Field label={kind === "path" ? "Learning path" : "Topic"}>
          <span className="relative">
            <Icon name="search" className="pointer-events-none absolute left-3 top-1/2 size-4 -translate-y-1/2 text-ink-muted" />
            <input
              ref={search}
              type="search"
              className={cx(input, "pl-9")}
              placeholder={kind === "path" ? `Search ${options.length} learning paths` : `Search ${options.length} topics`}
              value={q}
              onChange={(e) => setQ(e.target.value)}
            />
          </span>
        </Field>
        <ul role="listbox" aria-label={kind === "path" ? "Learning paths" : "Topics"} className="-mt-2 max-h-64 overflow-y-auto rounded-2xl border border-line">
          {shown.map((o) => (
            <li key={o.id} role="option" aria-selected={pick === o.id}>
              <button
                type="button"
                onClick={() => setPick(o.id)}
                className={cx("flex w-full items-center gap-3 px-4 py-2.5 text-left hover:bg-muted", pick === o.id && "bg-tealtint font-semibold")}
              >
                <span className={cx("grid size-5 shrink-0 place-items-center rounded-full border", pick === o.id ? "border-action bg-action text-on-action" : "border-line-strong")}>
                  {pick === o.id && <Icon name="check" className="size-3" />}
                </span>
                <span className="min-w-0 flex-1 truncate">{o.title}</span>
                <span className="shrink-0 text-xs text-ink-muted">{o.meta}</span>
              </button>
            </li>
          ))}
          {!shown.length && <li className="p-4 text-sm text-ink-muted">Nothing matches “{q}”.</li>}
        </ul>

        <Field label="Due date" hint="Optional. Overdue learning is flagged here and in their Inbox." className="w-fit">
          <input type="date" className={input} value={due} onChange={(e) => setDue(e.target.value)} />
        </Field>
        {error && <ErrorNote text={error} />}
      </div>

      <footer className="flex flex-wrap items-center justify-end gap-3 border-t border-line p-4">
        <p className="mr-auto text-sm text-ink-muted">{chosen ? `“${chosen.title}”` : "Choose what to assign"}</p>
        <button type="button" className={btn.secondary} onClick={onClose}>
          Cancel
        </button>
        <button type="button" className={btn.primary} disabled={!pick || busy} onClick={assign}>
          {busy ? "Assigning…" : `Assign to ${people.length === 1 ? people[0].name.split(" ")[0] : `${people.length} people`}`}
        </button>
      </footer>
    </Overlay>
  );
}

/** One person: change their access, see and remove what's assigned, assign more. */
function PersonPanel({ id, you, onClose, onChanged, onAssign }: { id: string; you: string; onClose: () => void; onChanged: () => void; onAssign: () => void }) {
  const { data: person, error, setData, reload } = useApi<Detail>(`/api/admin/people/${encodeURIComponent(id)}`);
  const [access, setAccessLevel] = useState<Access | null>(null);
  const [reviewRole, setReviewRole] = useState<ReviewRole | undefined>(undefined);
  const [reviewArea, setReviewArea] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);
  const [saveError, setSaveError] = useState<string | null>(null);
  const [saved, setSaved] = useState(false);

  // Assigning from here opens the assign window over the panel; reload once it's done.
  useEffect(() => {
    window.addEventListener("people:assigned", reload);
    return () => window.removeEventListener("people:assigned", reload);
  }, [reload]);

  const level = access ?? person?.access ?? "learner";
  const role = reviewRole === undefined ? (person?.reviewRole ?? null) : reviewRole;
  const area = reviewArea ?? person?.reviewArea ?? "";
  const staff = level === "author" || level === "superadmin";
  const changed = person && (level !== person.access || role !== person.reviewRole || (role && area !== person.reviewArea));

  const post = async (b: unknown) => {
    setBusy(true);
    setSaveError(null);
    try {
      const next = await api<Detail>(`/api/admin/people/${encodeURIComponent(id)}`, { body: b });
      setData(next);
      onChanged();
      return true;
    } catch (e) {
      setSaveError((e as Error).message);
      return false;
    } finally {
      setBusy(false);
    }
  };
  const save = async () => {
    if (await post({ action: "access", access: level, reviewRole: staff ? role : null, reviewArea: area })) {
      setAccessLevel(null);
      setReviewRole(undefined);
      setReviewArea(null);
      setSaved(true);
    }
  };

  return (
    <Overlay labelledBy="person-title" onClose={onClose} side>
      <header className="flex items-start gap-4 border-b border-line p-5">
        {person ? <UserAvatar name={person.name} src={person.avatar} className="size-14 text-base" /> : <span className="size-14 rounded-full bg-muted" />}
        <div className="min-w-0 flex-1">
          <h2 id="person-title" className="font-serif text-2xl font-semibold leading-tight">
            {person?.name ?? "Loading…"}
          </h2>
          {person && (
            <p className="text-sm text-ink-muted">
              {roleOf(person)} · {person.org}
              <br />
              <a href={`mailto:${person.email}`} className="hover:underline">
                {person.email}
              </a>
            </p>
          )}
        </div>
        <button type="button" onClick={onClose} aria-label="Close" className="grid size-10 shrink-0 place-items-center rounded-full hover:bg-muted">
          <Icon name="close" className="size-5" />
        </button>
      </header>

      <div className="flex min-h-0 flex-1 flex-col gap-8 overflow-y-auto p-5">
        {error && <ErrorNote text={error} />}
        {person && (
          <>
            {/* Access */}
            <section aria-labelledby="access-title" className="flex flex-col gap-3">
              <h3 id="access-title" className="font-mulish text-sm font-extrabold uppercase tracking-[0.12em]">
                Access
              </h3>
              <div role="radiogroup" aria-labelledby="access-title" className="grid gap-2 sm:grid-cols-2">
                {ACCESS.map((a) => {
                  const staffOnly = (a.value === "author" || a.value === "superadmin") && !person.trilogy;
                  const self = person.id === you && a.value !== "superadmin";
                  return (
                    <button
                      key={a.value}
                      type="button"
                      role="radio"
                      aria-checked={level === a.value}
                      disabled={staffOnly || self}
                      title={staffOnly ? "For Trilogy Care staff" : self ? "You can’t remove your own superadmin access" : undefined}
                      onClick={() => {
                        setAccessLevel(a.value);
                        setSaved(false);
                      }}
                      className={cx(
                        "flex flex-col gap-0.5 rounded-2xl border p-3 text-left transition-colors disabled:cursor-not-allowed disabled:opacity-45",
                        level === a.value ? "border-action bg-tealtint ring-1 ring-action" : "border-line-strong hover:border-action",
                      )}
                    >
                      <span className="flex items-center gap-2 font-semibold">
                        <span className={cx("grid size-4 place-items-center rounded-full border", level === a.value ? "border-action bg-action" : "border-line-strong")}>
                          {level === a.value && <span className="size-1.5 rounded-full bg-white" />}
                        </span>
                        {a.label}
                      </span>
                      <span className="text-xs text-ink-muted">{a.description}</span>
                    </button>
                  );
                })}
              </div>
              {staff && (
                <div className="grid gap-3 sm:grid-cols-2">
                  <Field label="Part in topic approval">
                    <select
                      className={input}
                      value={role ?? ""}
                      onChange={(e) => {
                        setReviewRole((e.target.value || null) as ReviewRole);
                        setSaved(false);
                      }}
                    >
                      <option value="">None</option>
                      {REVIEW.map((r) => (
                        <option key={r.value} value={r.value}>
                          {r.label}
                        </option>
                      ))}
                    </select>
                  </Field>
                  {role && (
                    <Field label="Area" hint="What they review, such as Clinical or Finance.">
                      <input
                        className={input}
                        value={area}
                        maxLength={60}
                        onChange={(e) => {
                          setReviewArea(e.target.value);
                          setSaved(false);
                        }}
                      />
                    </Field>
                  )}
                </div>
              )}
              {saveError && <ErrorNote text={saveError} />}
              <div className="flex items-center gap-3">
                <button type="button" className={btn.primary} disabled={!changed || busy} onClick={save}>
                  {busy ? "Saving…" : "Save access"}
                </button>
                {saved && !changed && (
                  <span role="status" className="flex items-center gap-1.5 text-sm font-semibold text-success">
                    <Icon name="check" className="size-4" /> Saved
                  </span>
                )}
              </div>
            </section>

            {/* Learning */}
            <section aria-labelledby="learning-title" className="flex flex-col gap-3">
              <div className="flex items-center justify-between gap-3">
                <h3 id="learning-title" className="font-mulish text-sm font-extrabold uppercase tracking-[0.12em]">
                  Assigned learning
                </h3>
                <button type="button" className={cx(btn.secondary, "min-h-10 text-sm")} onClick={onAssign}>
                  <Icon name="plus" className="size-4" /> Assign
                </button>
              </div>
              {!person.paths.length && !person.topics.length && <p className="text-sm text-ink-muted">Nothing assigned yet.</p>}
              <ul className="flex flex-col divide-y divide-line rounded-2xl border border-line empty:hidden">
                {person.paths.map((p) => (
                  <li key={`path:${p.id}`} className="flex items-center gap-3 p-3">
                    <Icon name="route" className="size-5 shrink-0 text-accent" />
                    <div className="min-w-0 flex-1">
                      <p className="truncate font-semibold">{p.name}</p>
                      <p className="flex flex-wrap items-center gap-2 text-xs text-ink-muted">
                        <Meter value={p.completed} total={p.total} />
                        {p.completed} of {p.total} topics
                        {p.selfEnrolled && " · enrolled themselves"}
                        {p.dueDate && !p.done && <span className={cx(p.overdue && "font-bold text-warm")}>· due {formatDate(p.dueDate)}</span>}
                      </p>
                    </div>
                    {p.done ? <Badge tone="good">Done</Badge> : p.overdue ? <Badge tone="warn">Overdue</Badge> : null}
                    {!p.selfEnrolled && (
                      <button
                        type="button"
                        className="grid size-9 shrink-0 place-items-center rounded-full text-ink-muted hover:bg-muted hover:text-ink"
                        aria-label={`Remove ${p.name}`}
                        title="Remove (their completions are kept)"
                        disabled={busy}
                        onClick={() => post({ action: "unassign", kind: "path", itemId: p.id })}
                      >
                        <Icon name="trash" className="size-4" />
                      </button>
                    )}
                  </li>
                ))}
                {person.topics.map((t) => (
                  <li key={`topic:${t.slug}`} className="flex items-center gap-3 p-3">
                    <Icon name="book" className="size-5 shrink-0 text-accent" />
                    <div className="min-w-0 flex-1">
                      <p className="truncate font-semibold">{t.title}</p>
                      <p className="text-xs text-ink-muted">
                        Topic · {t.minutes} min · {t.state === "completed" ? `finished ${formatDate(t.completedAt!)}` : t.state === "in_progress" ? "under way" : "not started"}
                        {t.dueDate && t.state !== "completed" && <span className={cx(t.overdue && "font-bold text-warm")}> · due {formatDate(t.dueDate)}</span>}
                        {` · by ${t.assignedBy}`}
                      </p>
                    </div>
                    {t.state === "completed" ? <Badge tone="good">Done</Badge> : t.overdue ? <Badge tone="warn">Overdue</Badge> : null}
                    <button
                      type="button"
                      className="grid size-9 shrink-0 place-items-center rounded-full text-ink-muted hover:bg-muted hover:text-ink"
                      aria-label={`Remove ${t.title}`}
                      title="Remove (their completions are kept)"
                      disabled={busy}
                      onClick={() => post({ action: "unassign", kind: "topic", itemId: t.slug })}
                    >
                      <Icon name="trash" className="size-4" />
                    </button>
                  </li>
                ))}
              </ul>
            </section>

            {/* Recently finished */}
            <section aria-labelledby="recent-title" className="flex flex-col gap-3">
              <h3 id="recent-title" className="font-mulish text-sm font-extrabold uppercase tracking-[0.12em]">
                Recently finished
              </h3>
              {person.recent.length ? (
                <ul className="flex flex-col gap-2">
                  {person.recent.map((r) => (
                    <li key={r.slug} className="flex items-center gap-2 text-sm">
                      <Icon name="circle-check" className="size-4 shrink-0 text-success" />
                      <span className="min-w-0 flex-1 truncate">{r.title}</span>
                      {r.needsRefresher && <Badge tone="warn">Refresher due</Badge>}
                      <span className="shrink-0 text-ink-muted">{r.completedAt && formatDate(r.completedAt)}</span>
                    </li>
                  ))}
                </ul>
              ) : (
                <p className="text-sm text-ink-muted">No topics finished yet.</p>
              )}
              {person.reportHref && (
                <Link href={person.reportHref} className="inline-flex w-fit items-center gap-1 font-semibold text-accent hover:underline">
                  Full completions report <Icon name="arrow-right" className="size-4" />
                </Link>
              )}
            </section>
          </>
        )}
      </div>
    </Overlay>
  );
}
