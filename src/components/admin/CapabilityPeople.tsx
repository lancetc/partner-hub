"use client";

import { useState } from "react";
import { api, useApi } from "@/lib/api";
import { cx, formatDate } from "@/lib/format";
import { ACCESS_ROLES, DOMAINS, STAGE_LABELS, type AccessRole } from "@/lib/capability";
import type { accessList, corrections, importPeople, people } from "@/server/capability";
import { Badge, btn, ErrorNote, Field, input } from "./ui";

/*
  The people side of Capability Insights (docs/capability-intelligence.md): each person's role, team and
  manager (set by hand, or by a handoff from HR or onboarding), correction requests, and who has access.
*/

type People = ReturnType<typeof people>;
type Imported = ReturnType<typeof importPeople>;
type Corrections = ReturnType<typeof corrections>;
type AccessData = ReturnType<typeof accessList>;

export function PeopleTab() {
  const { data, error, setData } = useApi<People>("/api/admin/capabilities?view=people");
  const [problem, setProblem] = useState<string | null>(null);
  const [filter, setFilter] = useState("");
  const [saved, setSaved] = useState<string | null>(null);
  if (error) return <ErrorNote text={error} />;
  if (!data) return <p className="text-ink-muted">Loading…</p>;
  const save = async (userId: string, body: Record<string, unknown>) => {
    setProblem(null);
    try {
      setData(await api<People>("/api/admin/capabilities", { body: { action: "person", userId, ...body } }));
      setSaved(userId);
    } catch (e) {
      setProblem(e instanceof Error ? e.message : "That didn’t save.");
    }
  };
  const q = filter.trim().toLowerCase();
  const shown = data.people.filter((p) => !q || `${p.name} ${p.email} ${p.org} ${p.team}`.toLowerCase().includes(q));
  return (
    <div className="flex flex-col gap-5">
      <p className="max-w-3xl text-ink-muted">
        A person’s role decides which capabilities their profile shows; their manager is who can observe and sign them off. You can set these here, or bring
        them in from HR or onboarding below. Employees can only hold employee roles, and partners partner roles.
      </p>
      {problem && <ErrorNote text={problem} />}
      <label className="flex max-w-sm flex-col gap-1 text-sm font-semibold">
        Find a person
        <input type="search" className={input} value={filter} onChange={(e) => setFilter(e.target.value)} />
      </label>
      <div className="overflow-x-auto rounded-3xl bg-surface p-2 ring-1 ring-line">
        <table className="w-full min-w-[56rem] text-left text-sm">
          <thead className="text-ink-muted">
            <tr>
              {["Person", "Role", "Team", "Started", "Manager", ""].map((h) => (
                <th key={h} scope="col" className="px-2 py-2 font-semibold">
                  {h || <span className="sr-only">Save</span>}
                </th>
              ))}
            </tr>
          </thead>
          <tbody className="divide-y divide-line">
            {shown.map((p) => (
              <tr key={`${p.id}:${p.roleId}:${p.team}:${p.startDate}:${p.managerId}`}>
                <th scope="row" className="px-2 py-2 font-semibold">
                  {p.name}
                  <span className="block font-normal text-ink-muted">
                    {p.org} · {p.domain === "internal" ? "Employee" : "Partner"}
                  </span>
                </th>
                <td className="px-2 py-2" colSpan={5}>
                  <form
                    className="grid grid-cols-[minmax(10rem,1.2fr)_minmax(8rem,1fr)_9.5rem_minmax(10rem,1fr)_auto] items-center gap-2"
                    onSubmit={(e) => {
                      e.preventDefault();
                      void save(p.id, Object.fromEntries(new FormData(e.currentTarget)));
                    }}
                  >
                    <select name="roleId" aria-label={`Role for ${p.name}`} defaultValue={p.roleId ?? ""} className={cx(input, "min-h-10")}>
                      <option value="">No role</option>
                      {data.roles
                        .filter((r) => r.domain === p.domain)
                        .map((r) => (
                          <option key={r.id} value={r.id}>
                            {r.name}
                          </option>
                        ))}
                    </select>
                    <input name="team" aria-label={`Team for ${p.name}`} defaultValue={p.team} maxLength={60} className={cx(input, "min-h-10")} />
                    <input
                      type="date"
                      name="startDate"
                      aria-label={`Start date for ${p.name}`}
                      defaultValue={p.startDate ?? ""}
                      className={cx(input, "min-h-10")}
                    />
                    <select name="managerId" aria-label={`Manager of ${p.name}`} defaultValue={p.managerId ?? ""} className={cx(input, "min-h-10")}>
                      <option value="">No manager</option>
                      {data.managers
                        .filter((m) => m.id !== p.id)
                        .map((m) => (
                          <option key={m.id} value={m.id}>
                            {m.name}
                          </option>
                        ))}
                    </select>
                    <span className="flex items-center gap-2">
                      <button type="submit" className={btn.secondary}>
                        Save
                      </button>
                      {saved === p.id && (
                        <span role="status" className="text-sm font-semibold text-success">
                          Saved
                        </span>
                      )}
                    </span>
                  </form>
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
      <Handoff onDone={(next) => setData(next)} />
    </div>
  );
}

/** Rows pasted from HR or onboarding: person, role, team, manager, start date. */
function Handoff({ onDone }: { onDone: (p: People) => void }) {
  const [text, setText] = useState("");
  const [result, setResult] = useState<Imported | null>(null);
  const [problem, setProblem] = useState<string | null>(null);
  const run = async () => {
    setProblem(null);
    const rows = text
      .split("\n")
      .map((l) => l.split(/\t|,/).map((c) => c.trim()))
      .filter((c) => c[0] && !/^(person|email)$/i.test(c[0]))
      .map(([person, role, team, manager, startDate]) => ({ person, role, team, manager, startDate }));
    try {
      setResult(await api<Imported>("/api/admin/capabilities", { body: { action: "import", rows } }));
      onDone(await api<People>("/api/admin/capabilities?view=people"));
    } catch (e) {
      setProblem(e instanceof Error ? e.message : "That didn’t import.");
    }
  };
  return (
    <section aria-labelledby="cap-handoff" className="rounded-3xl bg-surface p-5 ring-1 ring-line">
      <h2 id="cap-handoff" className="font-serif text-xl font-semibold">
        Bring roles in from HR or onboarding
      </h2>
      <p className="mt-1 max-w-3xl text-sm text-ink-muted">
        One person per line: <strong>email or Hub id, role, team, manager’s email or id, start date (YYYY-MM-DD)</strong>, separated by commas or tabs. Each
        line is matched to one Hub user. Nothing is guessed: a line that doesn’t match is listed below and left alone. Leave a column empty to keep what’s
        there.
      </p>
      <Field label="Rows" className="mt-3">
        <textarea
          className={cx(input, "min-h-28 py-2 font-mono text-sm")}
          value={text}
          onChange={(e) => setText(e.target.value)}
          placeholder="riley@example.com, Care coordinator, North, jordan@example.com, 2026-10-01"
        />
      </Field>
      {problem && <ErrorNote text={problem} />}
      <button type="button" className={cx(btn.secondary, "mt-2")} disabled={!text.trim()} onClick={() => void run()}>
        Apply these rows
      </button>
      {result && (
        <div className="mt-3" role="status">
          <p className="font-semibold">
            {result.applied} of {result.rows} applied.
          </p>
          {result.unmatched.length > 0 && (
            <ul className="mt-1 list-disc pl-5 text-sm">
              {result.unmatched.map((u) => (
                <li key={`${u.row}:${u.why}`}>
                  Line {u.row} ({u.person}): {u.why}
                </li>
              ))}
            </ul>
          )}
        </div>
      )}
    </section>
  );
}

export function CorrectionsTab() {
  const { data, error, setData } = useApi<Corrections>("/api/admin/capabilities?view=corrections");
  const [problem, setProblem] = useState<string | null>(null);
  const [open, setOpen] = useState<string | null>(null);
  const [today] = useState(() => new Date().toISOString().slice(0, 10));
  if (error) return <ErrorNote text={error} />;
  if (!data) return <p className="text-ink-muted">Loading…</p>;
  return (
    <div className="flex flex-col gap-4">
      <p className="max-w-3xl text-ink-muted">
        When someone says their record is wrong or missing something, it comes here. Check it, then answer by name: they see your reply on My Capabilities. If
        evidence was missing, record it; nothing that’s already recorded is rewritten. A sign-off recorded by mistake is withdrawn by the manager who made it.
      </p>
      {problem && <ErrorNote text={problem} />}
      {data.corrections.length === 0 ? (
        <p className="rounded-2xl bg-muted px-4 py-3">No correction requests.</p>
      ) : (
        <ul className="flex flex-col gap-3">
          {data.corrections.map((c) => (
            <li key={c.id} className="rounded-3xl bg-surface p-5 ring-1 ring-line">
              <p className="flex flex-wrap items-center gap-2">
                <span className="font-semibold">
                  {c.person}: {c.competency}
                </span>
                <Badge tone={c.state === "open" ? "warn" : c.state === "resolved" ? "good" : "neutral"}>
                  {c.state === "open" ? "Waiting" : c.state === "resolved" ? "Corrected" : "No change"}
                </Badge>
                <span className="text-sm text-ink-muted">Asked {formatDate(c.createdAt)}</span>
              </p>
              <p className="mt-1">“{c.message}”</p>
              {c.resolution && (
                <p className="mt-1 text-sm text-ink-muted">
                  {c.resolvedBy}
                  {c.resolvedAt ? `, ${formatDate(c.resolvedAt)}` : ""}: {c.resolution}
                </p>
              )}
              {c.state === "open" &&
                (open === c.id ? (
                  <form
                    className="mt-3 grid gap-3 rounded-2xl bg-muted p-4 sm:grid-cols-2"
                    onSubmit={async (e) => {
                      e.preventDefault();
                      setProblem(null);
                      try {
                        setData(
                          await api<Corrections>("/api/admin/capabilities", {
                            body: { action: "correction", id: c.id, ...Object.fromEntries(new FormData(e.currentTarget)) },
                          }),
                        );
                        setOpen(null);
                      } catch (err) {
                        setProblem(err instanceof Error ? err.message : "That didn’t save.");
                      }
                    }}
                  >
                    <Field label="What you found">
                      <select name="state" className={input} defaultValue="resolved">
                        <option value="resolved">They were right: the record is corrected</option>
                        <option value="declined">The record stays as it is</option>
                      </select>
                    </Field>
                    <Field label="Evidence to record, if it was missing" hint="Leave as “None” when nothing needs adding.">
                      <select name="stage" className={input} defaultValue="">
                        <option value="">None</option>
                        {(["introduced", "practised", "demonstrated"] as const).map((s) => (
                          <option key={s} value={s}>
                            {STAGE_LABELS[s]}
                          </option>
                        ))}
                      </select>
                    </Field>
                    <Field
                      label="What the evidence is and where it came from"
                      hint="Shown on their profile as recorded by you. “Verified at work” can only come from an observation."
                    >
                      <input name="description" maxLength={300} className={input} />
                    </Field>
                    <Field label="Date of the evidence">
                      <input type="date" name="evidenceOn" max={today} className={input} />
                    </Field>
                    <Field label="Your reply to them" hint="What you checked and what was done." className="sm:col-span-2">
                      <textarea name="resolution" required minLength={10} maxLength={600} className={cx(input, "min-h-20 py-2")} />
                    </Field>
                    <div className="flex gap-2 sm:col-span-2">
                      <button type="submit" className={btn.primary}>
                        Send the answer
                      </button>
                      <button type="button" className={btn.quiet} onClick={() => setOpen(null)}>
                        Cancel
                      </button>
                    </div>
                  </form>
                ) : (
                  <button type="button" className={cx(btn.secondary, "mt-3")} onClick={() => setOpen(c.id)}>
                    Answer this request
                  </button>
                ))}
            </li>
          ))}
        </ul>
      )}
    </div>
  );
}

export function AccessTab() {
  const { data, error, setData } = useApi<AccessData>("/api/admin/capabilities?view=access");
  const [problem, setProblem] = useState<string | null>(null);
  if (error) return <ErrorNote text={error} />;
  if (!data) return <p className="text-ink-muted">Loading…</p>;
  const change = async (userId: string, role: AccessRole, on: boolean) => {
    setProblem(null);
    try {
      setData(await api<AccessData>("/api/admin/capabilities", { body: { action: "access", userId, role, on } }));
    } catch (e) {
      setProblem(e instanceof Error ? e.message : "That didn’t save.");
    }
  };
  return (
    <div className="flex flex-col gap-4">
      <p className="max-w-3xl text-ink-muted">
        Nobody has capability access unless it’s given here. {DOMAINS.internal} and {DOMAINS.partner.toLowerCase()} have separate owners: owning one doesn’t
        show you the other. The Hub’s compliance reviewers already act as Quality. As a superadmin you can do everything here yourself, and every change is
        logged.
      </p>
      {problem && <ErrorNote text={problem} />}
      <dl className="grid gap-3 sm:grid-cols-2">
        {(Object.keys(ACCESS_ROLES) as AccessRole[]).map((r) => (
          <div key={r} className="rounded-3xl bg-surface p-4 ring-1 ring-line">
            <dt className="font-semibold">{ACCESS_ROLES[r].label}</dt>
            <dd className="text-sm text-ink-muted">{ACCESS_ROLES[r].text}</dd>
            <dd className="mt-2">
              <ul className="flex flex-col gap-1">
                {data.access
                  .filter((x) => x.role === r)
                  .map((x) => (
                    <li key={x.userId} className="flex items-center justify-between gap-2">
                      {x.name}
                      <button type="button" className={btn.quiet} onClick={() => void change(x.userId, r, false)}>
                        Remove
                        <span className="sr-only">
                          {" "}
                          {x.name} from {ACCESS_ROLES[r].label}
                        </span>
                      </button>
                    </li>
                  ))}
              </ul>
              <select
                aria-label={`Add someone to ${ACCESS_ROLES[r].label}`}
                className={cx(input, "mt-2 min-h-10")}
                value=""
                onChange={(e) => e.target.value && void change(e.target.value, r, true)}
              >
                <option value="">Add a member of staff…</option>
                {data.users
                  .filter((u) => !data.access.some((x) => x.role === r && x.userId === u.id))
                  .map((u) => (
                    <option key={u.id} value={u.id}>
                      {u.name}
                    </option>
                  ))}
              </select>
            </dd>
          </div>
        ))}
      </dl>
    </div>
  );
}
