"use client";

import Link from "next/link";
import { useRouter } from "next/navigation";
import { useState } from "react";
import { api, formatWhen, useApi } from "@/lib/api";
import { cx, formatDate } from "@/lib/format";
import { confirmAction } from "@/lib/confirm";
import { DEFAULT_POINTS, POINT_LABELS, type Points } from "@/lib/challengeScoring";
import { AdminShell, Badge, btn, ErrorNote, Field, input, timezones } from "./ui";
import { Icon } from "../Icon";

/*
  Challenge Mode for authors: create a multi-day challenge from existing topics, put people in
  teams, publish it, then follow participation and knowledge gaps as it runs.
*/

type ListItem = { id: string; name: string; tagline: string; status: string; startsOn: string; days: number; members: number; teams: number; state: string };
type Person = { id: string; name: string; role: string; audience: string; manager_id: string | null; org_id: string; org: string };
type Topic = { slug: string; title: string; minutes: number; track: string; draft: boolean };
type Team = { id?: string; name: string; colour: string; members: string[] };
type Draft = {
  name: string;
  tagline: string;
  story: string;
  startsOn: string;
  unlockTime: string;
  reminderTime: string;
  timezone: string;
  points: Points;
  missions: { day: number; slug: string; beat: string }[];
  teams: Team[];
};
type Detail = { challenge: Draft & { id: string; status: "draft" | "published" }; people: Person[]; topics: Topic[] };

const STATE: Record<string, { label: string; tone: "good" | "warn" | "info" | "neutral" }> = {
  draft: { label: "Draft", tone: "neutral" },
  upcoming: { label: "Starts soon", tone: "info" },
  live: { label: "Running now", tone: "good" },
  finished: { label: "Finished", tone: "neutral" },
};
const COLOURS = [
  { id: "teal", label: "Teal", swatch: "#2b9c96" },
  { id: "navy", label: "Navy", swatch: "#2d4875" },
  { id: "warm", label: "Coral", swatch: "#e2725b" },
  { id: "gold", label: "Gold", swatch: "#e7b23c" },
  { id: "sky", label: "Sky", swatch: "#6fb4dc" },
];

/** The next Monday, as the default start: five missions then run Monday to Friday. */
function nextMonday() {
  const d = new Date();
  d.setDate(d.getDate() + ((8 - d.getDay()) % 7 || 7));
  return d.toISOString().slice(0, 10);
}

/* ---------- The list ---------- */

export function ChallengesAdmin() {
  const { data, error } = useApi<{ challenges: ListItem[] }>("/api/admin/challenges");
  return (
    <AdminShell title="Challenges">
      <p className="max-w-2xl text-ink-muted">
        A challenge is a short competition: one mission a day, each one a topic, with points, streaks, badges and team and individual leaderboards. Build the
        missions as topics first, then bring them together here.
      </p>
      <Link href="/admin/challenges/new" className={cx(btn.primary, "mt-5 w-fit")}>
        <Icon name="plus" className="size-4" /> New challenge
      </Link>
      {error && <ErrorNote text={error} />}
      {!data ? (
        <p className="mt-6 text-ink-muted">Loading…</p>
      ) : !data.challenges.length ? (
        <p className="mt-6 rounded-3xl border border-dashed border-line-strong p-6 text-center text-ink-muted">No challenges yet.</p>
      ) : (
        <ul className="mt-6 grid gap-5 md:grid-cols-2">
          {data.challenges.map((c) => (
            <li key={c.id} className="relative flex flex-col gap-2 rounded-3xl border border-line bg-surface p-5 hover:border-line-strong">
              <div className="flex flex-wrap gap-2">
                <Badge tone={STATE[c.state].tone}>{STATE[c.state].label}</Badge>
              </div>
              <h2 className="font-serif text-xl font-semibold">
                <Link href={`/admin/challenges/${c.id}`} className="after:absolute after:inset-0 after:content-[''] hover:underline">
                  {c.name}
                </Link>
              </h2>
              {c.tagline && <p className="text-sm text-ink-muted">{c.tagline}</p>}
              <p className="font-mulish text-xs font-extrabold uppercase tracking-[0.12em] text-accent">
                {c.days} {c.days === 1 ? "day" : "days"} from {formatDate(c.startsOn)} · {c.members} people · {c.teams} teams
              </p>
            </li>
          ))}
        </ul>
      )}
    </AdminShell>
  );
}

/* ---------- The editor ---------- */

export function ChallengeEditor({ id }: { id?: string }) {
  const detail = useApi<Detail>(id ? `/api/admin/challenges/${id}` : null);
  const options = useApi<{ people: Person[]; topics: Topic[] }>(id ? null : "/api/admin/challenges");
  const error = detail.error ?? options.error;
  const ready = id ? detail.data : options.data;
  return (
    <AdminShell title={id ? (detail.data?.challenge.name ?? "Challenge") : "New challenge"} back={{ href: "/admin/challenges", label: "Challenges" }}>
      {error && <ErrorNote text={error} />}
      {!ready ? (
        <p className="text-ink-muted">Loading…</p>
      ) : (
        <ChallengeForm
          key={id ?? "new"}
          id={id}
          status={detail.data?.challenge.status ?? "draft"}
          initial={
            detail.data?.challenge ?? {
              name: "",
              tagline: "",
              story: "",
              startsOn: nextMonday(),
              unlockTime: "08:00",
              reminderTime: "15:00",
              timezone: "Australia/Brisbane",
              points: DEFAULT_POINTS,
              missions: Array.from({ length: 5 }, (_, i) => ({ day: i + 1, slug: "", beat: "" })),
              teams: [],
            }
          }
          people={ready.people}
          topics={ready.topics}
          onSaved={detail.reload}
        />
      )}
    </AdminShell>
  );
}

function ChallengeForm({
  id,
  status,
  initial,
  people,
  topics,
  onSaved,
}: {
  id?: string;
  status: "draft" | "published";
  initial: Draft;
  people: Person[];
  topics: Topic[];
  onSaved: () => void;
}) {
  const router = useRouter();
  const [d, setD] = useState<Draft>(initial);
  const [busy, setBusy] = useState(false);
  const [message, setMessage] = useState<{ tone: "good" | "bad"; text: string } | null>(null);
  const published = status === "published";
  const set = <K extends keyof Draft>(k: K, v: Draft[K]) => setD((x) => ({ ...x, [k]: v }));
  const topic = (slug: string) => topics.find((t) => t.slug === slug);
  const teamOf = (userId: string) => d.teams.findIndex((t) => t.members.includes(userId));
  const inTeams = d.teams.reduce((n, t) => n + t.members.length, 0);

  async function run(fn: () => Promise<unknown>, ok: string) {
    setBusy(true);
    setMessage(null);
    try {
      await fn();
      setMessage({ tone: "good", text: ok });
      return true;
    } catch (e) {
      setMessage({ tone: "bad", text: (e as Error).message });
      return false;
    } finally {
      setBusy(false);
    }
  }

  const payload = () => ({ ...d, missions: d.missions.filter((m) => m.slug) });
  const save = () =>
    run(async () => {
      if (id) await api(`/api/admin/challenges/${id}`, { method: "PUT", body: payload() });
      else {
        const r = await api<{ id: string }>("/api/admin/challenges", { body: payload() });
        router.replace(`/admin/challenges/${r.id}`);
      }
      if (id) onSaved();
    }, "Saved.");

  const publish = (on: boolean) =>
    run(
      async () => {
        if (on) await api(`/api/admin/challenges/${id}`, { method: "PUT", body: payload() });
        await api(`/api/admin/challenges/${id}`, { body: { action: on ? "publish" : "unpublish" } });
        onSaved();
      },
      on ? "Published. Missions open on schedule, and invitations go out as each one opens." : "Back to a draft.",
    );

  async function remove() {
    if (!(await confirmAction(`Delete “${d.name || "this challenge"}”? Its missions go back into the Learning catalogue.`))) return;
    if (await run(() => api(`/api/admin/challenges/${id}`, { method: "DELETE" }), "Deleted.")) router.push("/admin/challenges");
  }

  /** Teams built from who manages whom, or from organisations. Replaces the current teams. */
  async function fillTeams(by: "manager" | "org") {
    if (d.teams.length && !(await confirmAction("Replace the current teams?"))) return;
    const groups = new Map<string, { name: string; members: string[] }>();
    for (const p of people) {
      const key = by === "org" ? p.org_id : (p.manager_id ?? (people.some((x) => x.manager_id === p.id) ? p.id : "none"));
      const name = by === "org" ? p.org : key === "none" ? "Independent" : `${people.find((x) => x.id === key)?.name.split(" ")[0] ?? "Team"}’s team`;
      const g = groups.get(key) ?? { name, members: [] };
      g.members.push(p.id);
      groups.set(key, g);
    }
    set(
      "teams",
      [...groups.values()].map((g, i) => ({ name: g.name, colour: COLOURS[i % COLOURS.length].id, members: g.members })),
    );
  }

  function placePerson(userId: string, team: number) {
    set(
      "teams",
      d.teams.map((t, i) => ({ ...t, members: i === team ? [...t.members.filter((m) => m !== userId), userId] : t.members.filter((m) => m !== userId) })),
    );
  }

  return (
    <div className="flex flex-col gap-8">
      <div className="flex flex-wrap items-center gap-2">
        <Badge tone={published ? "good" : "neutral"}>{published ? "Published" : "Draft"}</Badge>
        {published && <span className="text-sm text-ink-muted">Dates, missions and points are fixed while it’s published.</span>}
      </div>

      <section className="grid gap-4 rounded-3xl border border-line bg-surface p-5 sm:grid-cols-2">
        <h2 className="font-serif text-xl font-semibold sm:col-span-2">The challenge</h2>
        <Field label="Name">
          <input className={input} value={d.name} onChange={(e) => set("name", e.target.value)} placeholder="Trilogy Challenge: Margaret’s Week" />
        </Field>
        <Field label="Tagline" hint="One line, shown under the name.">
          <input className={input} value={d.tagline} onChange={(e) => set("tagline", e.target.value)} />
        </Field>
        <Field label="The story" hint="What’s going on, and who’s involved. Shown at the top of the challenge page." className="sm:col-span-2">
          <textarea rows={4} className={cx(input, "py-2")} value={d.story} onChange={(e) => set("story", e.target.value)} />
        </Field>
        <Field label="Day 1" hint="Start on a Monday to run Monday to Friday.">
          <input type="date" className={input} disabled={published} value={d.startsOn} onChange={(e) => set("startsOn", e.target.value)} />
        </Field>
        <Field label="Time zone" hint="Every mission opens at the same moment for everyone.">
          <select className={input} disabled={published} value={d.timezone} onChange={(e) => set("timezone", e.target.value)}>
            {timezones.map((t) => (
              <option key={t}>{t}</option>
            ))}
          </select>
        </Field>
        <Field label="Missions open at" hint="With an email invitation.">
          <input type="time" className={input} disabled={published} value={d.unlockTime} onChange={(e) => set("unlockTime", e.target.value)} />
        </Field>
        <Field label="Reminder at" hint="Only to people who haven’t finished that day’s mission.">
          <input type="time" className={input} value={d.reminderTime} onChange={(e) => set("reminderTime", e.target.value)} />
        </Field>
      </section>

      <section className="flex flex-col gap-3 rounded-3xl border border-line bg-surface p-5">
        <h2 className="font-serif text-xl font-semibold">Missions</h2>
        <p className="text-sm text-ink-muted">
          One topic a day, in order. Each takes about 5 to 7 minutes, with decisions and a quick check. The story beat sets the scene, and appears once the day
          opens.
        </p>
        <ol className="flex flex-col gap-3">
          {d.missions.map((m, i) => (
            <li key={i} className="grid gap-2 rounded-2xl border border-line p-3 sm:grid-cols-[6rem_1fr]">
              <span className="font-mulish text-sm font-extrabold uppercase tracking-[0.12em] text-accent">
                {i === d.missions.length - 1 && d.missions.length > 1 ? "Finale" : `Day ${i + 1}`}
              </span>
              <div className="flex flex-col gap-2">
                <select
                  className={input}
                  disabled={published}
                  value={m.slug}
                  onChange={(e) =>
                    set(
                      "missions",
                      d.missions.map((x, j) => (j === i ? { ...x, slug: e.target.value } : x)),
                    )
                  }
                  aria-label={`Day ${i + 1} topic`}
                >
                  <option value="">Choose a topic…</option>
                  {topics.map((t) => (
                    <option key={t.slug} value={t.slug}>
                      {t.title}
                      {t.draft ? " (draft)" : ""} · {t.minutes} min
                    </option>
                  ))}
                </select>
                <textarea
                  rows={2}
                  className={cx(input, "py-2")}
                  placeholder="Story beat: what’s happened since yesterday?"
                  value={m.beat}
                  onChange={(e) =>
                    set(
                      "missions",
                      d.missions.map((x, j) => (j === i ? { ...x, beat: e.target.value } : x)),
                    )
                  }
                  aria-label={`Day ${i + 1} story beat`}
                />
                {topic(m.slug)?.draft && <p className="text-xs text-ink-muted">This topic is still a draft. Publish it before you publish the challenge.</p>}
                {!published && (
                  <div className="flex gap-1">
                    <button type="button" className={btn.quiet} disabled={i === 0} onClick={() => set("missions", swap(d.missions, i, i - 1))}>
                      Move up
                    </button>
                    <button
                      type="button"
                      className={btn.quiet}
                      disabled={i === d.missions.length - 1}
                      onClick={() => set("missions", swap(d.missions, i, i + 1))}
                    >
                      Move down
                    </button>
                    <button
                      type="button"
                      className={btn.quiet}
                      onClick={() =>
                        set(
                          "missions",
                          d.missions.filter((_, j) => j !== i),
                        )
                      }
                    >
                      Remove
                    </button>
                  </div>
                )}
              </div>
            </li>
          ))}
        </ol>
        {!published && d.missions.length < 10 && (
          <button
            type="button"
            className={cx(btn.secondary, "self-start")}
            onClick={() => set("missions", [...d.missions, { day: d.missions.length + 1, slug: "", beat: "" }])}
          >
            <Icon name="plus" className="size-4" /> Add a day
          </button>
        )}
      </section>

      <section className="flex flex-col gap-3 rounded-3xl border border-line bg-surface p-5">
        <h2 className="font-serif text-xl font-semibold">Teams</h2>
        <p className="text-sm text-ink-muted">
          Everyone in a team takes part. Teams are ranked by average points per member, so size doesn’t matter. {inTeams} {inTeams === 1 ? "person" : "people"}{" "}
          in {d.teams.length} {d.teams.length === 1 ? "team" : "teams"}.
        </p>
        <div className="flex flex-wrap gap-2">
          <button type="button" className={btn.secondary} onClick={() => fillTeams("manager")}>
            Teams by manager
          </button>
          <button type="button" className={btn.secondary} onClick={() => fillTeams("org")}>
            Teams by organisation
          </button>
          <button
            type="button"
            className={btn.secondary}
            onClick={() => set("teams", [...d.teams, { name: `Team ${d.teams.length + 1}`, colour: COLOURS[d.teams.length % 5].id, members: [] }])}
          >
            <Icon name="plus" className="size-4" /> Add a team
          </button>
        </div>
        {d.teams.length > 0 && (
          <ul className="grid gap-2 sm:grid-cols-2">
            {d.teams.map((t, i) => (
              <li key={i} className="flex flex-wrap items-center gap-2 rounded-2xl border border-line p-3">
                <span className="size-4 shrink-0 rounded-full" style={{ background: COLOURS.find((c) => c.id === t.colour)?.swatch }} aria-hidden />
                <input
                  className={cx(input, "min-w-0 flex-1")}
                  value={t.name}
                  onChange={(e) =>
                    set(
                      "teams",
                      d.teams.map((x, j) => (j === i ? { ...x, name: e.target.value } : x)),
                    )
                  }
                  aria-label={`Team ${i + 1} name`}
                />
                <select
                  className={cx(input, "w-auto")}
                  value={t.colour}
                  onChange={(e) =>
                    set(
                      "teams",
                      d.teams.map((x, j) => (j === i ? { ...x, colour: e.target.value } : x)),
                    )
                  }
                  aria-label={`Team ${i + 1} colour`}
                >
                  {COLOURS.map((c) => (
                    <option key={c.id} value={c.id}>
                      {c.label}
                    </option>
                  ))}
                </select>
                <button
                  type="button"
                  className={btn.quiet}
                  onClick={() =>
                    set(
                      "teams",
                      d.teams.filter((_, j) => j !== i),
                    )
                  }
                  aria-label={`Remove ${t.name}`}
                >
                  <Icon name="trash" className="size-4" />
                </button>
                <span className="w-full text-xs text-ink-muted">
                  {t.members.length} {t.members.length === 1 ? "member" : "members"}
                </span>
              </li>
            ))}
          </ul>
        )}
        {d.teams.length > 0 && (
          <div className="overflow-x-auto rounded-2xl border border-line">
            <table className="w-full min-w-[480px] text-left text-sm">
              <thead className="border-b border-line text-xs uppercase tracking-wide text-ink-muted">
                <tr>
                  <th className="px-3 py-2">Person</th>
                  <th className="px-3 py-2">Team</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-line">
                {people.map((p) => (
                  <tr key={p.id}>
                    <td className="px-3 py-2">
                      <span className="font-semibold">{p.name}</span>
                      <span className="block text-xs text-ink-muted">{p.org}</span>
                    </td>
                    <td className="px-3 py-2">
                      <select
                        className={cx(input, "min-h-9")}
                        value={teamOf(p.id)}
                        onChange={(e) => placePerson(p.id, Number(e.target.value))}
                        aria-label={`${p.name}’s team`}
                      >
                        <option value={-1}>Not taking part</option>
                        {d.teams.map((t, i) => (
                          <option key={i} value={i}>
                            {t.name}
                          </option>
                        ))}
                      </select>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
      </section>

      <section className="flex flex-col gap-3 rounded-3xl border border-line bg-surface p-5">
        <h2 className="font-serif text-xl font-semibold">Points</h2>
        <p className="text-sm text-ink-muted">Only first answers count, so replaying a mission never changes a score. There’s no penalty for a wrong answer.</p>
        <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-3">
          {(Object.keys(POINT_LABELS) as (keyof Points)[]).map((k) => (
            <Field key={k} label={POINT_LABELS[k]}>
              <input
                type="number"
                min={0}
                max={1000}
                step={10}
                className={input}
                disabled={published}
                value={d.points[k]}
                onChange={(e) => set("points", { ...d.points, [k]: Number(e.target.value) })}
              />
            </Field>
          ))}
        </div>
      </section>

      <div className="sticky bottom-3 z-10 flex flex-wrap items-center gap-2 rounded-3xl border border-line bg-surface p-3 shadow-sm">
        <button type="button" className={btn.primary} disabled={busy} onClick={save}>
          {id ? "Save" : "Create challenge"}
        </button>
        {id && !published && (
          <button type="button" className={btn.secondary} disabled={busy} onClick={() => publish(true)}>
            Publish
          </button>
        )}
        {id && published && (
          <button type="button" className={btn.secondary} disabled={busy} onClick={() => publish(false)}>
            Unpublish
          </button>
        )}
        {id && (
          <Link href={`/challenge/${id}`} className={btn.quiet}>
            <Icon name="eye" className="size-4" /> See it as a learner
          </Link>
        )}
        {id && (
          <button type="button" className={cx(btn.quiet, "ml-auto")} disabled={busy} onClick={remove}>
            <Icon name="trash" className="size-4" /> Delete
          </button>
        )}
        {message && (
          <p role="status" className={cx("w-full text-sm", message.tone === "bad" ? "text-danger" : "text-success")}>
            {message.text}
          </p>
        )}
      </div>

      {id && published && <ChallengeReport id={id} />}
    </div>
  );
}

const swap = <T,>(list: T[], a: number, b: number) => {
  const next = [...list];
  [next[a], next[b]] = [next[b], next[a]];
  return next;
};

/* ---------- The report ---------- */

type Report = {
  timezone: string;
  members: number;
  days: { day: number; title: string; opensAt: string; open: boolean; started: number; completed: number; onTheDay: number; averagePoints: number }[];
  gaps: { day: number; kind: string; label: string; answered: number; right: number; commonWrong: { label: string; count: number } | null }[];
  people: { id: string; name: string; team: string; total: number; completed: number; streak: number; achievements: number }[];
};

function ChallengeReport({ id }: { id: string }) {
  const { data, error } = useApi<Report>(`/api/admin/challenges/${id}/report`);
  if (error) return <ErrorNote text={error} />;
  if (!data) return null;
  const pct = (n: number, of: number) => (of ? Math.round((100 * n) / of) : 0);
  return (
    <section className="flex flex-col gap-6">
      <h2 className="font-serif text-2xl font-semibold">How it’s going</h2>
      <div className="overflow-x-auto rounded-3xl border border-line bg-surface">
        <table className="w-full min-w-[560px] text-left text-sm">
          <thead className="border-b border-line text-xs uppercase tracking-wide text-ink-muted">
            <tr>
              <th className="px-4 py-3">Day</th>
              <th className="px-4 py-3">Started</th>
              <th className="px-4 py-3">Finished</th>
              <th className="px-4 py-3">On the day</th>
              <th className="px-4 py-3">Average points</th>
            </tr>
          </thead>
          <tbody className="divide-y divide-line">
            {data.days.map((d) => (
              <tr key={d.day}>
                <td className="px-4 py-3">
                  <span className="font-semibold">
                    Day {d.day}: {d.title}
                  </span>
                  <span className="block text-xs text-ink-muted">{d.open ? "Open" : `Opens ${formatWhen(d.opensAt, data.timezone)}`}</span>
                </td>
                <td className="px-4 py-3">
                  {d.started} of {data.members}
                </td>
                <td className="px-4 py-3">
                  {d.completed} <span className="text-ink-muted">({pct(d.completed, data.members)}%)</span>
                </td>
                <td className="px-4 py-3">{d.onTheDay}</td>
                <td className="px-4 py-3">{d.completed ? d.averagePoints : "—"}</td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>

      <div>
        <h3 className="font-serif text-xl font-semibold">Knowledge gaps</h3>
        <p className="mt-1 text-sm text-ink-muted">
          Every decision and question, from fewest right first time. The common wrong answer shows what people believed.
        </p>
        {data.gaps.length ? (
          <ul className="mt-3 flex flex-col gap-2">
            {data.gaps.map((g, i) => (
              <li key={i} className="flex flex-col gap-1 rounded-2xl border border-line bg-surface p-4">
                <div className="flex flex-wrap items-center gap-2">
                  <Badge tone={g.right / g.answered < 0.6 ? "bad" : g.right / g.answered < 0.8 ? "warn" : "good"}>
                    {pct(g.right, g.answered)}% right first time
                  </Badge>
                  <span className="text-xs text-ink-muted">
                    Day {g.day} · {g.kind === "decision" ? "Decision" : "Question"} · {g.answered} answered
                  </span>
                </div>
                <p className="font-semibold">{g.label}</p>
                {g.commonWrong && (
                  <p className="text-sm text-ink-muted">
                    Most common wrong answer: “{g.commonWrong.label}” ({g.commonWrong.count})
                  </p>
                )}
              </li>
            ))}
          </ul>
        ) : (
          <p className="mt-3 text-ink-muted">Nothing answered yet.</p>
        )}
      </div>

      <div>
        <h3 className="font-serif text-xl font-semibold">Everyone</h3>
        <div className="mt-3 overflow-x-auto rounded-3xl border border-line bg-surface">
          <table className="w-full min-w-[560px] text-left text-sm">
            <thead className="border-b border-line text-xs uppercase tracking-wide text-ink-muted">
              <tr>
                <th className="px-4 py-3">Person</th>
                <th className="px-4 py-3">Team</th>
                <th className="px-4 py-3">Points</th>
                <th className="px-4 py-3">Missions</th>
                <th className="px-4 py-3">Streak</th>
                <th className="px-4 py-3">Badges</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-line">
              {data.people.map((p) => (
                <tr key={p.id}>
                  <td className="px-4 py-3 font-semibold">{p.name}</td>
                  <td className="px-4 py-3">{p.team}</td>
                  <td className="px-4 py-3">{p.total}</td>
                  <td className="px-4 py-3">
                    {p.completed} of {data.days.length}
                  </td>
                  <td className="px-4 py-3">{p.streak}</td>
                  <td className="px-4 py-3">{p.achievements}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      </div>
    </section>
  );
}
