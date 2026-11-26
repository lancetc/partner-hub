"use client";

import { useState } from "react";
import { api, useApi } from "@/lib/api";
import { cx, formatDate, formatDateTime } from "@/lib/format";
import { ABOUT_INTERESTS, ABOUT_LEARN, ABOUT_YEARS, roleChoiceLabel, SEGMENTS, SERVICE_TYPES, type Segment, type ServiceType } from "@/lib/onboardingCourses";
import type { courseAudit, courseReport, coursesAdmin, exceptionsQueue, personCourses, searchPeople } from "@/server/onboardingCourses";
import { Icon } from "../Icon";
import { Badge, btn, ErrorNote, Field, input } from "./ui";
import { StepList } from "../onboarding/CourseParts";
import { ByRole } from "./OnboardingByRole";
import { UserAvatar } from "../UserAvatar";

/*
  Starting courses, for the people who run onboarding (docs/onboarding.md, "Starting courses"): each role's starting list
  (By role), the exceptions queue with each person's page, reports with separate denominators, and the audit trail. The
  course template, rule, people and learner-preview screens were removed (the owner, Nov 2026).
*/

type Overview = ReturnType<typeof coursesAdmin>;
type Person = ReturnType<typeof personCourses>;
const API = "/api/admin/onboarding/courses";
// What runs onboarding now (the owner, Nov 2026): each role's starting list, what needs a decision, reports and the trail.
const SECTIONS = [
  { id: "roles", label: "By role" },
  { id: "exceptions", label: "Exceptions" },
  { id: "report", label: "Reports" },
  { id: "audit", label: "Audit trail" },
] as const;
type Section = (typeof SECTIONS)[number]["id"];

export function CoursesTab() {
  const [section, setSection] = useState<Section>("roles");
  const [person, setPerson] = useState<string | null>(null);
  return (
    <div className="flex flex-col gap-4">
      <p className="max-w-3xl text-ink-muted">
        Choose what each of the four roles (Supplier, Care Coordinator, Care Partner and Trilogy Care staff) does first under <strong>By role</strong>.
        Exceptions shows what needs a decision, and finds anyone to exempt them or change a due date. Finishing a course never approves anyone to work.
      </p>
      <nav aria-label="Starting courses" className="flex flex-wrap gap-1.5">
        {SECTIONS.map((s) => (
          <button
            key={s.id}
            type="button"
            aria-current={section === s.id ? "page" : undefined}
            onClick={() => {
              setSection(s.id);
              setPerson(null);
            }}
            className={cx("min-h-10 rounded-xl px-3 text-sm font-semibold", section === s.id ? "bg-ink text-surface" : "bg-muted hover:bg-line")}
          >
            {s.label}
          </button>
        ))}
      </nav>
      {/* A person's page (their courses, with Exempt and a new due date) opens from Exceptions or Reports, with a way back. */}
      {person ? (
        <PersonDetail id={person} onBack={() => setPerson(null)} />
      ) : (
        <>
          {section === "roles" && <ByRole />}
          {section === "exceptions" && <Exceptions onPerson={setPerson} />}
          {section === "report" && <Report onPerson={setPerson} />}
          {section === "audit" && <Audit />}
        </>
      )}
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
        ← Back
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
      {data.about.updatedAt && (
        <section className="rounded-3xl bg-surface p-5 text-sm ring-1 ring-line">
          <h4 className="font-semibold">Get to know you</h4>
          <p className="text-xs text-ink-muted">In their own words, {formatDate(data.about.updatedAt)}.</p>
          <dl className="mt-2 grid gap-x-4 gap-y-1.5 sm:grid-cols-[12rem_minmax(0,1fr)]">
            <dt className="text-ink-muted">In aged care or home support</dt>
            <dd>{data.about.years ? ABOUT_YEARS[data.about.years] : "Not said"}</dd>
            <dt className="text-ink-muted">Before, or alongside</dt>
            <dd>{data.about.before || "Not said"}</dd>
            <dt className="text-ink-muted">Other languages</dt>
            <dd>{data.about.languages || "Not said"}</dd>
            <dt className="text-ink-muted">Would like to get better at</dt>
            <dd>{data.about.interests.map((k) => ABOUT_INTERESTS[k]).join(", ") || "Not said"}</dd>
            <dt className="text-ink-muted">Likes to learn by</dt>
            <dd>{data.about.learn.map((k) => ABOUT_LEARN[k]).join(", ") || "Not said"}</dd>
            {data.about.note && (
              <>
                <dt className="text-ink-muted">Anything else</dt>
                <dd>{data.about.note}</dd>
              </>
            )}
          </dl>
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

/** Anyone current, by name or organisation: their page has Exempt and a new due date for each course (the owner, Nov 2026). */
function FindPerson({ onPerson }: { onPerson: (id: string) => void }) {
  const [q, setQ] = useState("");
  const term = q.trim();
  const { data } = useApi<ReturnType<typeof searchPeople>>(term.length >= 2 ? `${API}?view=people&q=${encodeURIComponent(term)}` : null);
  return (
    <section className="rounded-2xl bg-surface p-4 ring-1 ring-line">
      <Field label="Find a person" hint="To exempt someone from a course, or give them a new due date.">
        <input type="search" className={input} value={q} placeholder="Name or organisation" onChange={(e) => setQ(e.target.value)} />
      </Field>
      {term.length >= 2 && data && (
        <ul className="mt-2 flex flex-col gap-1">
          {data.length === 0 && <li className="text-sm text-ink-muted">Nobody matches.</li>}
          {data.map((u) => (
            <li key={u.id}>
              <button type="button" className="flex min-h-11 w-full items-center gap-3 rounded-xl px-2 text-left hover:bg-muted" onClick={() => onPerson(u.id)}>
                <span className="min-w-0 flex-1">
                  <span className="block font-semibold">{u.name}</span>
                  <span className="block text-sm text-ink-muted">
                    {u.roles.join(", ") || u.organisation} · {u.active} in progress, {u.completed} done
                  </span>
                </span>
                <Icon name="arrow-right" className="size-4 shrink-0 text-ink-muted" />
              </button>
            </li>
          ))}
        </ul>
      )}
    </section>
  );
}

function Exceptions({ onPerson }: { onPerson: (id: string) => void }) {
  const { data, error, reload } = useApi<ReturnType<typeof exceptionsQueue>>(`${API}?view=exceptions`);
  const [busy, setBusy] = useState<string | null>(null);
  const [problem, setProblem] = useState<string | null>(null);
  const decide = async (id: string, decision: "keep" | "undo") => {
    setBusy(id);
    setProblem(null);
    try {
      await api(API, { body: { action: "role-choice", id, decision } });
      reload();
    } catch (e) {
      setProblem(e instanceof Error ? e.message : "That didn’t save.");
    } finally {
      setBusy(null);
    }
  };
  if (error) return <ErrorNote text={error} />;
  if (!data) return <p className="text-ink-muted">Loading…</p>;
  if (!data.items.length)
    return (
      <div className="flex flex-col gap-3">
        <FindPerson onPerson={onPerson} />
        <p className="rounded-2xl bg-muted px-4 py-3">Nothing needs attention.</p>
      </div>
    );
  return (
    <div className="flex flex-col gap-3">
      <FindPerson onPerson={onPerson} />
      <ul className="flex flex-col gap-2">
        {problem && <ErrorNote text={problem} />}
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
            {i.choice && (
              <div className="mt-2 flex flex-wrap gap-2">
                <button type="button" className={btn.secondary} disabled={busy === i.choice.id} onClick={() => decide(i.choice!.id, "keep")}>
                  Keep it
                </button>
                <button type="button" className={btn.quiet} disabled={busy === i.choice.id} onClick={() => decide(i.choice!.id, "undo")}>
                  Change it back
                </button>
              </div>
            )}
          </li>
        ))}
      </ul>
    </div>
  );
}

const COLS = ["eligible", "invited", "enrolled", "started", "completed", "overdue", "exempted", "ended"] as const;

/*
  Reports (the owner, Nov 2026): who needs what, at a glance. Tiles for how everyone's going (each one a filter), the four
  roles as chips with a name search, and a row per person: their picture, role, each course with a progress bar, when it
  was allocated and when they were last active. Sorted so whoever needs a nudge is first. The course-by-course counts
  are underneath, closed, with the CSV export.
*/
type Report = ReturnType<typeof courseReport>;
type ReportPerson = Report["people"][number];
type TileId = "all" | "done" | "started" | "not_started" | "overdue";

const COURSE_STATE = {
  done: { label: "Done", tone: "good" },
  overdue: { label: "Overdue", tone: "bad" },
  started: { label: "Under way", tone: "info" },
  not_started: { label: "Not started", tone: "neutral" },
} as const;
/** How a person's going, for the tiles: "stalled" (not started a week on) counts as not started. */
const tileOf = (p: ReportPerson): Exclude<TileId, "all"> => (p.state === "stalled" ? "not_started" : p.state);
const TILES: { id: TileId; label: string; colour: string }[] = [
  { id: "all", label: "Onboarding", colour: "#102a43" },
  { id: "done", label: "Finished", colour: "#0f7a4a" },
  { id: "started", label: "Under way", colour: "#008282" },
  { id: "not_started", label: "Not started", colour: "#8a94a6" },
  { id: "overdue", label: "Overdue", colour: "#c7393e" },
];
/** Each role's colour, for its tag and chip. */
const ROLE_TONE: Record<Segment, string> = {
  supplier: "bg-[#fab53d]/20 text-[#7a4b00] dark:text-[#fab53d]",
  coordinator: "bg-[#3cb8b9]/20 text-[#006b6b] dark:text-[#3cb8b9]",
  principal: "bg-[#8b6fd6]/18 text-[#4b3596] dark:text-[#c3b3f5]",
  staff: "bg-[#102a43]/10 text-[#102a43] dark:bg-white/10 dark:text-white",
};

/** "today", "yesterday", "5 days ago", "3 weeks ago", or the date. */
function ago(iso: string, now: number) {
  const days = Math.floor((now - Date.parse(iso)) / 86_400_000);
  if (days <= 0) return "today";
  if (days === 1) return "yesterday";
  if (days < 14) return `${days} days ago`;
  if (days < 60) return `${Math.round(days / 7)} weeks ago`;
  return formatDate(iso);
}

/** A small ring: this tile's share of everyone onboarding. */
function Ring({ value, of, colour }: { value: number; of: number; colour: string }) {
  const r = 15;
  const c = 2 * Math.PI * r;
  const share = of ? value / of : 0;
  return (
    <svg viewBox="0 0 36 36" className="size-11 shrink-0 -rotate-90" aria-hidden>
      <circle cx="18" cy="18" r={r} fill="none" stroke="currentColor" strokeWidth="4" className="text-line" />
      <circle cx="18" cy="18" r={r} fill="none" stroke={colour} strokeWidth="4" strokeLinecap="round" strokeDasharray={`${share * c} ${c}`} />
    </svg>
  );
}

function Report({ onPerson }: { onPerson: (id: string) => void }) {
  const [org, setOrg] = useState("");
  const [tile, setTile] = useState<TileId>("all");
  const [role, setRole] = useState<Segment | "all">("all");
  const [q, setQ] = useState("");
  // The time the report opened, once, so every "days ago" agrees.
  const [now] = useState(() => Date.now());
  const { data, error } = useApi<Report>(`${API}?view=report&org=${encodeURIComponent(org)}`);
  if (error) return <ErrorNote text={error} />;
  if (!data) return <p className="text-ink-muted">Loading…</p>;
  const everyone = data.people;
  const count = (id: TileId) => (id === "all" ? everyone.length : everyone.filter((p) => tileOf(p) === id).length);
  const term = q.trim().toLowerCase();
  const shown = everyone.filter(
    (p) =>
      (tile === "all" || tileOf(p) === tile) && (role === "all" || p.segment === role) && (!term || `${p.name} ${p.organisation}`.toLowerCase().includes(term)),
  );
  return (
    <div className="flex flex-col gap-5">
      {/* How everyone's going: each tile filters the list below. */}
      <div role="group" aria-label="How everyone's going" className="grid grid-cols-2 gap-2 sm:grid-cols-3 lg:grid-cols-5">
        {TILES.map((t) => (
          <button
            key={t.id}
            type="button"
            aria-pressed={tile === t.id}
            onClick={() => setTile(tile === t.id && t.id !== "all" ? "all" : t.id)}
            className={cx(
              "flex items-center gap-3 rounded-2xl bg-surface p-3 text-left ring-1 transition hover:ring-[#008282]",
              tile === t.id ? "ring-2 ring-[#008282] dark:ring-[#3cb8b9]" : "ring-line",
            )}
          >
            <Ring value={count(t.id)} of={everyone.length} colour={t.colour} />
            <span>
              <span
                className="block font-serif text-3xl font-semibold leading-none"
                style={t.id === "overdue" && count(t.id) ? { color: t.colour } : undefined}
              >
                {count(t.id)}
              </span>
              <span className="mt-1 block text-sm text-ink-muted">{t.label}</span>
            </span>
          </button>
        ))}
      </div>

      {/* The four roles, and a name search; the organisation and the CSV beside them. */}
      <div className="flex flex-wrap items-end gap-3">
        <div role="group" aria-label="Role" className="flex flex-wrap gap-1.5">
          {(["all", ...(Object.keys(ROLE_TONE) as Segment[])] as const).map((r) => {
            const n = r === "all" ? everyone.length : everyone.filter((p) => p.segment === r).length;
            return (
              <button
                key={r}
                type="button"
                aria-pressed={role === r}
                onClick={() => setRole(r)}
                className={cx(
                  "inline-flex min-h-10 items-center gap-1.5 rounded-full px-3 text-sm font-semibold",
                  role === r ? "bg-ink text-surface" : "bg-muted hover:bg-line",
                )}
              >
                {r === "all" ? "Everyone" : roleChoiceLabel(r)}
                <span className={cx("rounded-full px-1.5 text-xs", role === r ? "bg-white/20" : "bg-surface")}>{n}</span>
              </button>
            );
          })}
        </div>
        <Field label="Find a person" className="min-w-[12rem] flex-1">
          <input type="search" className={input} value={q} placeholder="Name or organisation" onChange={(e) => setQ(e.target.value)} />
        </Field>
        <Field label="Organisation" className="w-56">
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

      {shown.length === 0 ? (
        <p className="rounded-2xl bg-muted px-4 py-3">{everyone.length ? "Nobody matches." : "Nobody has a starting course yet."}</p>
      ) : (
        <ul className="flex flex-col gap-2">
          {shown.map((p) => (
            <li key={p.id} className="grid gap-3 rounded-2xl bg-surface p-4 ring-1 ring-line md:grid-cols-[minmax(0,17rem)_minmax(0,1fr)] md:gap-6">
              <div className="flex min-w-0 items-start gap-3">
                <UserAvatar name={p.name} src={p.avatar} className="size-11 shrink-0 text-sm" />
                <div className="min-w-0">
                  <button type="button" className="text-left font-semibold text-accent underline-offset-4 hover:underline" onClick={() => onPerson(p.id)}>
                    {p.name}
                  </button>
                  <p className="mt-0.5 flex flex-wrap items-center gap-1.5 text-sm text-ink-muted">
                    <span className={cx("rounded-full px-2 py-0.5 font-mulish text-xs font-bold", ROLE_TONE[p.segment])}>{p.role}</span>
                    {p.organisation}
                  </p>
                  {p.state === "stalled" && (
                    <p className="mt-1 text-xs font-semibold text-[#7a4b00] dark:text-[#fab53d]">Not started a week on: worth a nudge</p>
                  )}
                </div>
              </div>
              <div className="flex min-w-0 flex-col gap-2.5">
                {p.courses.map((c, i) => {
                  const pct = c.total ? Math.round((c.done / c.total) * 100) : 0;
                  return (
                    <div key={i}>
                      <p className="flex flex-wrap items-center gap-x-2 gap-y-1">
                        <span className="min-w-0 font-medium">{c.title}</span>
                        <Badge tone={COURSE_STATE[c.state].tone}>{COURSE_STATE[c.state].label}</Badge>
                      </p>
                      <div className="mt-1 flex items-center gap-2">
                        <span aria-hidden className="block h-2 flex-1 overflow-hidden rounded-full bg-muted">
                          <span
                            className={cx(
                              "block h-full rounded-full",
                              c.state === "overdue" ? "bg-[#c7393e]" : c.state === "done" ? "bg-[#0f7a4a]" : "bg-[#008282]",
                            )}
                            style={{ width: `${pct}%` }}
                          />
                        </span>
                        <span className="w-24 shrink-0 text-right text-sm tabular-nums text-ink-muted">
                          {c.done} of {c.total} · {pct}%
                        </span>
                      </div>
                    </div>
                  );
                })}
                <p className="text-sm text-ink-muted">
                  Allocated {ago(p.allocatedAt, now)} · {p.lastActive ? `last active ${ago(p.lastActive, now)}` : "not active yet"}
                  {p.courses.some((c) => c.state !== "done" && c.at) &&
                    ` · due ${formatDate(
                      p.courses
                        .filter((c) => c.state !== "done" && c.at)
                        .map((c) => c.at!)
                        .sort()[0],
                    )}`}
                </p>
              </div>
            </li>
          ))}
        </ul>
      )}

      <details className="rounded-2xl bg-muted/50 px-4 py-2">
        <summary className="flex min-h-11 cursor-pointer items-center font-semibold">Course numbers</summary>
        <div className="flex flex-col gap-4 pb-3">
          <p className="max-w-3xl text-sm text-ink-muted">{data.note}</p>
          <div className="overflow-x-auto rounded-2xl bg-surface ring-1 ring-line">
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
      </details>
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
