import "server-only";
import { randomUUID } from "node:crypto";
import { lessons, type Lesson } from "@/content/lessons";
import { audit, tx, type Db } from "./db";
import { HttpError, requireAuthor, type User } from "./auth";
import { catalogueInfo } from "./learningPaths";
import { addDays, localDate, zonedToUtc, type PlainDate } from "@/lib/schedule";
import { DEFAULT_POINTS, achievementsFor, displayName, missionScore, rankBy, streakOf, type Points } from "@/lib/challengeScoring";

/*
  Challenge Mode: a multi-day competition built from ordinary topics. Each day a mission (a topic)
  opens at the same moment for everyone, in the challenge's time zone. Points come from each
  member's first answers, frozen the first time they're saved (so restarting a topic never changes
  a score), and from when they completed each mission. Leaderboards show the top ten and the
  viewer's own place, never the bottom of the table.
*/

export type ChallengeInput = {
  name: string;
  tagline: string;
  story: string;
  startsOn: string;
  unlockTime: string;
  reminderTime: string;
  timezone: string;
  points: Points;
  missions: { day: number; slug: string; beat: string }[];
  teams: { id?: string; name: string; colour: string; members: string[] }[];
};

type Row = {
  id: string;
  name: string;
  tagline: string;
  story: string;
  starts_on: string;
  unlock_time: string;
  reminder_time: string;
  timezone: string;
  points: string;
  status: "draft" | "published";
  archived: number;
  created_by: string;
  created_at: string;
  updated_at: string;
  published_at: string | null;
};
type Mission = { day: number; lesson_slug: string; beat: string };
type Member = { user_id: string; team_id: string; hide_name: number; emails: number; name: string; email: string };

/** Late missions still count until the challenge closes, this many days after the final mission opens. */
export const GRACE_DAYS = 2;
export const MAX_DAYS = 10;
const TEAM_COLOURS = ["teal", "navy", "warm", "gold", "sky"];

const iso = (d: Date) => d.toISOString();
const parseDate = (s: string): PlainDate => {
  const [y, m, d] = s.split("-").map(Number);
  return { y, m, d };
};
const dateKey = (p: PlainDate) => `${p.y}-${String(p.m).padStart(2, "0")}-${String(p.d).padStart(2, "0")}`;

const rowOf = (db: Db, id: string) => db.prepare("SELECT * FROM challenges WHERE id = ? AND archived = 0").get(id) as Row | undefined;
const missionsOf = (db: Db, id: string) =>
  db.prepare("SELECT day, lesson_slug, beat FROM challenge_missions WHERE challenge_id = ? ORDER BY day").all(id) as Mission[];
const teamsOf = (db: Db, id: string) =>
  db.prepare("SELECT id, name, colour FROM challenge_teams WHERE challenge_id = ? ORDER BY position").all(id) as { id: string; name: string; colour: string }[];
const membersOf = (db: Db, id: string) =>
  db
    .prepare(
      "SELECT m.user_id, m.team_id, m.hide_name, m.emails, u.name, u.email FROM challenge_members m JOIN users u ON u.id = m.user_id WHERE m.challenge_id = ?",
    )
    .all(id) as Member[];
const pointsOf = (r: Row): Points => ({ ...DEFAULT_POINTS, ...(JSON.parse(r.points) as Partial<Points>) });
const lessonOf = (slug: string) => lessons.find((l) => l.slug === slug);
/** "Dot’s Week, Day 1: Welcome, Dot" shows as "Welcome, Dot", since the day is already shown beside it. */
const shortTitle = (title: string) => title.replace(/^.*?\b(?:Day \d+|Finale):\s*/, "");

/** When each day's mission opens, and when the whole challenge closes. */
export function timeline(r: Pick<Row, "starts_on" | "unlock_time" | "reminder_time" | "timezone">, days: number) {
  const start = parseDate(r.starts_on);
  const opens = Array.from({ length: days }, (_, i) => zonedToUtc(addDays(start, i), r.unlock_time, r.timezone));
  const reminders = Array.from({ length: days }, (_, i) => zonedToUtc(addDays(start, i), r.reminder_time, r.timezone));
  const closes = zonedToUtc(addDays(start, days - 1 + GRACE_DAYS + 1), "00:00", r.timezone);
  return { opens, reminders, closes };
}

/** What a mission topic asks: its decisions (100 points each by default) and quiz questions. */
export function missionQuestions(lesson: Lesson) {
  const out: { key: string; kind: "decision" | "question"; cardId: string; label: string; options: { id: string; label: string; right: boolean }[] }[] = [];
  for (const c of Object.values(lesson.nodes)) {
    if (c.type === "decision" && c.options.some((o) => o.correct !== undefined))
      out.push({
        key: `first:${c.id}`,
        kind: "decision",
        cardId: c.id,
        label: c.heading,
        options: c.options.map((o) => ({ id: o.id, label: o.label, right: Boolean(o.correct) })),
      });
    if (c.type === "quiz")
      for (const q of c.questions)
        out.push({
          key: `first:${c.id}.${q.id}`,
          kind: "question",
          cardId: c.id,
          label: q.prompt,
          options: q.options.map((o) => ({ id: o.id, label: o.label, right: o.id === q.correct })),
        });
  }
  return out;
}

/* ---------- Missions in play: hidden from the catalogue, and locked until they open ---------- */

/** Topics used as missions in any challenge that isn't archived. They stay out of the Learning catalogue. */
export function missionSlugs(db: Db) {
  return new Set(
    (
      db.prepare("SELECT DISTINCT m.lesson_slug FROM challenge_missions m JOIN challenges c ON c.id = m.challenge_id WHERE c.archived = 0").all() as {
        lesson_slug: string;
      }[]
    ).map((r) => r.lesson_slug),
  );
}

/** Why a mission can't be opened yet, or null if it can. Authors can always open it, to check it. */
export function missionLock(db: Db, user: User, slug: string, now: Date) {
  if (user.role === "author") return null;
  const uses = db
    .prepare("SELECT c.*, m.day FROM challenge_missions m JOIN challenges c ON c.id = m.challenge_id WHERE m.lesson_slug = ? AND c.archived = 0")
    .all(slug) as (Row & { day: number })[];
  for (const c of uses) {
    if (c.status === "draft") return { challenge: c.name, challengeId: c.id, day: c.day, opensAt: null as string | null, timezone: c.timezone };
    const opens = timeline(c, c.day).opens[c.day - 1];
    if (now < opens) return { challenge: c.name, challengeId: c.id, day: c.day, opensAt: iso(opens), timezone: c.timezone };
  }
  return null;
}

/** The published challenge this topic is a mission in, for this member: where "back" goes when they finish. */
export function challengeForMission(db: Db, user: User, slug: string) {
  const r = db
    .prepare(
      `SELECT c.id FROM challenge_missions m JOIN challenges c ON c.id = m.challenge_id
       JOIN challenge_members cm ON cm.challenge_id = c.id AND cm.user_id = ?
       WHERE m.lesson_slug = ? AND c.status = 'published' AND c.archived = 0 ORDER BY c.starts_on DESC`,
    )
    .get(user.id, slug) as { id: string } | undefined;
  return r?.id ?? null;
}

/**
  Called whenever topic progress is saved. If the topic is an open mission for this person, their
  first answers are kept, once: later saves (and restarts) never change them.
*/
export function recordChallengeAnswers(db: Db, user: User, slug: string, attempt: unknown, now: Date) {
  const answers = (attempt as { answers?: Record<string, unknown> })?.answers;
  if (!answers || typeof answers !== "object") return;
  const firsts = Object.entries(answers).filter(([k]) => k.startsWith("first:"));
  if (!firsts.length) return;
  const uses = db
    .prepare(
      `SELECT c.*, m.day FROM challenge_missions m JOIN challenges c ON c.id = m.challenge_id
       JOIN challenge_members cm ON cm.challenge_id = c.id AND cm.user_id = ?
       WHERE m.lesson_slug = ? AND c.status = 'published' AND c.archived = 0`,
    )
    .all(user.id, slug) as (Row & { day: number })[];
  for (const c of uses) {
    const days = (db.prepare("SELECT COUNT(*) AS n FROM challenge_missions WHERE challenge_id = ?").get(c.id) as { n: number }).n;
    const t = timeline(c, days);
    if (now < t.opens[c.day - 1] || now >= t.closes) continue;
    const insert = db.prepare("INSERT OR IGNORE INTO challenge_answers (challenge_id, user_id, day, key, right, pick, at) VALUES (?, ?, ?, ?, ?, ?, ?)");
    for (const [key, value] of firsts) {
      const pick = answers[`pick:${key.slice(6)}`];
      insert.run(c.id, user.id, c.day, key, Number(value) === 1 ? 1 : 0, typeof pick === "string" ? pick : null, iso(now));
    }
  }
}

/* ---------- Scores ---------- */

function memberScores(db: Db, c: Row, missions: Mission[], userIds: string[], now: Date) {
  const points = pointsOf(c);
  const t = timeline(c, missions.length);
  const answers = db.prepare("SELECT user_id, day, key, right, pick FROM challenge_answers WHERE challenge_id = ?").all(c.id) as {
    user_id: string;
    day: number;
    key: string;
    right: number;
    pick: string | null;
  }[];
  const completions = db
    .prepare(
      `SELECT user_id, lesson_slug, MIN(completed_at) AS at FROM lesson_completions WHERE lesson_slug IN (${missions.map(() => "?").join(",") || "''"}) GROUP BY user_id, lesson_slug`,
    )
    .all(...missions.map((m) => m.lesson_slug)) as { user_id: string; lesson_slug: string; at: string }[];
  const questions = new Map(missions.map((m) => [m.day, (lessonOf(m.lesson_slug) ? missionQuestions(lessonOf(m.lesson_slug)!) : []).map((q) => q.key)]));
  return new Map(
    userIds.map((uid) => {
      const days = missions.map((m, i) => {
        const opens = t.opens[i];
        const done = completions.find((x) => x.user_id === uid && x.lesson_slug === m.lesson_slug && x.at >= iso(opens) && x.at < iso(t.closes));
        const mine = answers.filter((a) => a.user_id === uid && a.day === m.day);
        const asked = questions.get(m.day) ?? [];
        const isQuestion = (key: string) => key.includes(".");
        const score = missionScore(points, {
          decisions: { right: mine.filter((a) => a.right && !isQuestion(a.key)).length, asked: asked.filter((k) => !isQuestion(k)).length },
          questions: { right: mine.filter((a) => a.right && isQuestion(a.key)).length, asked: asked.filter(isQuestion).length },
          completed: Boolean(done),
          onTheDay: Boolean(done) && dateKey(localDate(new Date(done!.at), c.timezone)) === dateKey(localDate(opens, c.timezone)),
        });
        return { day: m.day, opensAt: iso(opens), open: now >= opens, completedAt: done?.at ?? null, ...score, picks: mine };
      });
      const total = days.reduce((n, d) => n + d.total, 0);
      const streak = streakOf(days, missions.length, days.filter((d) => d.open).length);
      return [uid, { days, total, streak, achievements: achievementsFor(days, missions.length) }];
    }),
  );
}

/* ---------- The learner's view ---------- */

/** Challenges this person is in that are running, about to start, or finished in the last fortnight. */
export function myChallenges(db: Db, user: User, now: Date) {
  const rows = db
    .prepare(
      "SELECT c.* FROM challenges c JOIN challenge_members m ON m.challenge_id = c.id WHERE m.user_id = ? AND c.status = 'published' AND c.archived = 0 ORDER BY c.starts_on DESC",
    )
    .all(user.id) as Row[];
  return rows
    .map((c) => {
      const missions = missionsOf(db, c.id);
      const t = timeline(c, missions.length);
      const openDays = t.opens.filter((o) => now >= o).length;
      const state = now < t.opens[0] ? "upcoming" : now < t.closes ? "live" : "finished";
      const me = memberScores(db, c, missions, [user.id], now).get(user.id)!;
      const today = openDays ? me.days[openDays - 1] : null;
      return {
        id: c.id,
        name: c.name,
        tagline: c.tagline,
        state,
        day: openDays,
        days: missions.length,
        startsAt: iso(t.opens[0]),
        closesAt: iso(t.closes),
        points: me.total,
        streak: me.streak,
        todayDone: Boolean(today?.completedAt),
        todaySlug: today ? missions[openDays - 1].lesson_slug : null,
      };
    })
    .filter((c) => c.state !== "finished" || now.getTime() - new Date(c.closesAt).getTime() < 14 * 86400000);
}

export function challengeView(db: Db, user: User, id: string, now: Date) {
  const c = rowOf(db, id);
  const member =
    c &&
    (db.prepare("SELECT * FROM challenge_members WHERE challenge_id = ? AND user_id = ?").get(id, user.id) as
      { team_id: string; hide_name: number; emails: number } | undefined);
  if (!c || (c.status !== "published" && user.role !== "author") || (!member && user.role !== "author"))
    throw new HttpError(404, "That challenge isn’t available.");
  const missions = missionsOf(db, id);
  const teams = teamsOf(db, id);
  const members = membersOf(db, id);
  const t = timeline(c, missions.length);
  const scores = memberScores(db, c, missions, members.map((m) => m.user_id).concat(member ? [] : [user.id]), now);
  const mine = scores.get(user.id)!;

  // Individuals: the top ten who have scored, and your own place. Nobody sees the bottom of the table.
  const ranked = rankBy(
    members.filter((m) => scores.get(m.user_id)!.total > 0).map((m) => ({ id: m.user_id, total: scores.get(m.user_id)!.total })),
    (x) => x.total,
  );
  const byId = new Map(members.map((m) => [m.user_id, m]));
  const top = ranked.slice(0, 10).map((r) => {
    const m = byId.get(r.item.id)!;
    const team = teams.find((x) => x.id === m.team_id);
    return {
      rank: r.rank,
      name: r.item.id === user.id ? "You" : m.hide_name ? "A player" : displayName(m.name),
      points: r.item.total,
      team: team?.name ?? null,
      colour: team?.colour ?? "teal",
      me: r.item.id === user.id,
    };
  });
  const myRank = ranked.find((r) => r.item.id === user.id)?.rank ?? null;

  // Teams: average points per member, so every member's part counts and size doesn't matter.
  const teamBoard = rankBy(
    teams.map((tm) => {
      const ms = members.filter((m) => m.team_id === tm.id);
      const sum = ms.reduce((n, m) => n + scores.get(m.user_id)!.total, 0);
      const finishedToday = ms.filter((m) => {
        const open = scores.get(m.user_id)!.days.filter((d) => d.open);
        return open.length && open[open.length - 1].completedAt;
      }).length;
      return { id: tm.id, name: tm.name, colour: tm.colour, members: ms.length, average: ms.length ? Math.round(sum / ms.length) : 0, finishedToday };
    }),
    (x) => x.average,
  ).map((r) => ({ rank: r.rank, ...r.item, mine: r.item.id === member?.team_id }));

  // Your story so far: your first call on each decision in the missions you've completed.
  const story = missions
    .map((m, i) => {
      const day = mine.days[i];
      const lesson = lessonOf(m.lesson_slug);
      if (!day.completedAt || !lesson) return null;
      const decisions = missionQuestions(lesson)
        .filter((q) => q.kind === "decision")
        .map((q) => {
          const a = day.picks.find((p) => p.key === q.key);
          const pick = q.options.find((o) => o.id === a?.pick);
          return a ? { label: q.label, choice: pick?.label ?? null, right: Boolean(a.right) } : null;
        })
        .filter(Boolean);
      return { day: m.day, title: shortTitle(lesson.title), decisions };
    })
    .filter(Boolean);

  return {
    id: c.id,
    name: c.name,
    tagline: c.tagline,
    story: c.story,
    timezone: c.timezone,
    preview: !member,
    state: now < t.opens[0] ? "upcoming" : now < t.closes ? "live" : "finished",
    closesAt: iso(t.closes),
    points: pointsOf(c),
    me: {
      total: mine.total,
      streak: mine.streak,
      rank: myRank,
      of: members.length,
      achievements: mine.achievements,
      hideName: Boolean(member?.hide_name),
      emails: member ? Boolean(member.emails) : true,
      team: teams.find((x) => x.id === member?.team_id)?.name ?? null,
    },
    missions: missions.map((m, i) => {
      const lesson = lessonOf(m.lesson_slug);
      const d = mine.days[i];
      return {
        day: m.day,
        slug: m.lesson_slug,
        beat: d.open ? m.beat : "",
        // "Dot’s Week, Day 1: Welcome, Dot" shows as "Welcome, Dot": the day is already on the card.
        title: d.open ? shortTitle(lesson?.title ?? "Mission") : null,
        minutes: lesson?.minutes ?? 0,
        opensAt: d.opensAt,
        open: d.open,
        completedAt: d.completedAt,
        onTheDay: d.onTheDay,
        perfect: d.perfect,
        total: d.total,
        possible: d.possible,
      };
    }),
    leaderboard: { top, me: myRank && myRank > 10 ? { rank: myRank, points: mine.total } : null },
    teams: teamBoard,
    storySoFar: story,
  };
}

export function setMyPreferences(db: Db, user: User, id: string, prefs: { hideName?: boolean; emails?: boolean }) {
  const m = db.prepare("SELECT 1 FROM challenge_members WHERE challenge_id = ? AND user_id = ?").get(id, user.id);
  if (!m) throw new HttpError(404, "You’re not in that challenge.");
  if (typeof prefs.hideName === "boolean")
    db.prepare("UPDATE challenge_members SET hide_name = ? WHERE challenge_id = ? AND user_id = ?").run(prefs.hideName ? 1 : 0, id, user.id);
  if (typeof prefs.emails === "boolean")
    db.prepare("UPDATE challenge_members SET emails = ? WHERE challenge_id = ? AND user_id = ?").run(prefs.emails ? 1 : 0, id, user.id);
  return { ok: true };
}

/* ---------- Authoring ---------- */

const people = (db: Db) =>
  db
    .prepare("SELECT u.id, u.name, u.role, u.audience, u.manager_id, u.org_id, o.name AS org FROM users u JOIN orgs o ON o.id = u.org_id ORDER BY u.name")
    .all() as { id: string; name: string; role: string; audience: string; manager_id: string | null; org_id: string; org: string }[];

/** Everyone who can be put in a team, and every topic that can be a mission, for the editor. */
export function challengeOptions(db: Db, actor: User) {
  requireAuthor(actor);
  return { people: people(db), topics: catalogueInfo(db) };
}

export function listChallenges(db: Db, actor: User, now: Date) {
  requireAuthor(actor);
  const rows = db.prepare("SELECT * FROM challenges WHERE archived = 0 ORDER BY starts_on DESC").all() as Row[];
  return rows.map((c) => {
    const missions = missionsOf(db, c.id);
    const t = missions.length ? timeline(c, missions.length) : null;
    const members = (db.prepare("SELECT COUNT(*) AS n FROM challenge_members WHERE challenge_id = ?").get(c.id) as { n: number }).n;
    return {
      id: c.id,
      name: c.name,
      tagline: c.tagline,
      status: c.status,
      startsOn: c.starts_on,
      days: missions.length,
      members,
      teams: teamsOf(db, c.id).length,
      state: !t ? "draft" : c.status === "draft" ? "draft" : now < t.opens[0] ? "upcoming" : now < t.closes ? "live" : "finished",
    };
  });
}

export function challengeDetail(db: Db, actor: User, id: string) {
  requireAuthor(actor);
  const c = rowOf(db, id);
  if (!c) throw new HttpError(404, "Challenge not found.");
  const members = membersOf(db, id);
  return {
    challenge: {
      id: c.id,
      status: c.status,
      name: c.name,
      tagline: c.tagline,
      story: c.story,
      startsOn: c.starts_on,
      unlockTime: c.unlock_time,
      reminderTime: c.reminder_time,
      timezone: c.timezone,
      points: pointsOf(c),
      missions: missionsOf(db, id).map((m) => ({ day: m.day, slug: m.lesson_slug, beat: m.beat })),
      teams: teamsOf(db, id).map((t) => ({ ...t, members: members.filter((m) => m.team_id === t.id).map((m) => m.user_id) })),
    },
    people: people(db),
    topics: catalogueInfo(db),
  };
}

function validInput(db: Db, input: ChallengeInput) {
  const name = String(input?.name ?? "").trim();
  if (!name) throw new HttpError(400, "Give the challenge a name.");
  if (!/^\d{4}-\d{2}-\d{2}$/.test(input.startsOn ?? "")) throw new HttpError(400, "Choose a start date.");
  for (const t of [input.unlockTime, input.reminderTime]) if (!/^([01]\d|2[0-3]):[0-5]\d$/.test(t ?? "")) throw new HttpError(400, "Times look like 08:00.");
  try {
    new Intl.DateTimeFormat("en-AU", { timeZone: input.timezone });
  } catch {
    throw new HttpError(400, "Choose a time zone.");
  }
  const missions = (input.missions ?? []).filter((m) => m.slug);
  if (missions.length > MAX_DAYS) throw new HttpError(400, `A challenge can run for up to ${MAX_DAYS} days.`);
  const known = new Set([...lessons.map((l) => l.slug), ...catalogueInfo(db).map((t) => t.slug)]);
  for (const m of missions) if (!known.has(m.slug)) throw new HttpError(400, "One of the missions isn’t a topic any more.");
  if (new Set(missions.map((m) => m.slug)).size !== missions.length) throw new HttpError(400, "Each day needs a different topic.");
  const seen = new Set<string>();
  for (const t of input.teams ?? []) {
    if (!String(t.name ?? "").trim()) throw new HttpError(400, "Every team needs a name.");
    for (const u of t.members ?? []) {
      if (seen.has(u)) throw new HttpError(400, "Someone is in two teams. Each person can only be in one.");
      seen.add(u);
    }
  }
  const points = Object.fromEntries(
    (Object.keys(DEFAULT_POINTS) as (keyof Points)[]).map((k) => [k, Math.max(0, Math.min(1000, Math.round(Number(input.points?.[k] ?? DEFAULT_POINTS[k]))))]),
  ) as Points;
  return {
    ...input,
    name,
    tagline: String(input.tagline ?? "").trim(),
    story: String(input.story ?? "").trim(),
    missions: missions.map((m, i) => ({ ...m, day: i + 1 })),
    points,
  };
}

function write(db: Db, id: string, input: ReturnType<typeof validInput>) {
  db.prepare("DELETE FROM challenge_missions WHERE challenge_id = ?").run(id);
  input.missions.forEach((m) =>
    db.prepare("INSERT INTO challenge_missions (challenge_id, day, lesson_slug, beat) VALUES (?, ?, ?, ?)").run(id, m.day, m.slug, String(m.beat ?? "").trim()),
  );
  // Members keep their own settings (hide name, emails) across team changes.
  const kept = new Map(membersOf(db, id).map((m) => [m.user_id, m]));
  db.prepare("DELETE FROM challenge_members WHERE challenge_id = ?").run(id);
  db.prepare("DELETE FROM challenge_teams WHERE challenge_id = ?").run(id);
  input.teams.forEach((t, i) => {
    const teamId = t.id || randomUUID().slice(0, 8);
    db.prepare("INSERT INTO challenge_teams (challenge_id, id, name, colour, position) VALUES (?, ?, ?, ?, ?)").run(
      id,
      teamId,
      t.name.trim(),
      TEAM_COLOURS.includes(t.colour) ? t.colour : TEAM_COLOURS[i % TEAM_COLOURS.length],
      i,
    );
    for (const u of t.members ?? [])
      db.prepare("INSERT INTO challenge_members (challenge_id, user_id, team_id, hide_name, emails) VALUES (?, ?, ?, ?, ?)").run(
        id,
        u,
        teamId,
        kept.get(u)?.hide_name ?? 0,
        kept.get(u)?.emails ?? 1,
      );
  });
}

export function createChallenge(db: Db, actor: User, input: ChallengeInput, now: Date) {
  requireAuthor(actor);
  const clean = validInput(db, input);
  const base =
    clean.name
      .toLowerCase()
      .replace(/[’']/g, "")
      .replace(/[^a-z0-9]+/g, "-")
      .replace(/^-|-$/g, "")
      .slice(0, 40) || "challenge";
  let id = `ch-${base}`;
  for (let n = 2; db.prepare("SELECT 1 FROM challenges WHERE id = ?").get(id); n++) id = `ch-${base}-${n}`;
  tx(db, () => {
    db.prepare(
      `INSERT INTO challenges (id, name, tagline, story, starts_on, unlock_time, reminder_time, timezone, points, status, archived, created_by, created_at, updated_at)
       VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, 'draft', 0, ?, ?, ?)`,
    ).run(
      id,
      clean.name,
      clean.tagline,
      clean.story,
      clean.startsOn,
      clean.unlockTime,
      clean.reminderTime,
      clean.timezone,
      JSON.stringify(clean.points),
      actor.id,
      iso(now),
      iso(now),
    );
    write(db, id, clean);
    audit(db, { actor: actor.id, event: "challenge.create", entity: `challenge:${id}`, next: { name: clean.name }, at: now });
  });
  return { id };
}

export function updateChallenge(db: Db, actor: User, id: string, input: ChallengeInput, now: Date) {
  requireAuthor(actor);
  const c = rowOf(db, id);
  if (!c) throw new HttpError(404, "Challenge not found.");
  const clean = validInput(db, input);
  if (c.status === "published") {
    // Once it's published, the schedule, missions and points are fixed, so nobody's score changes under them.
    const same =
      c.starts_on === clean.startsOn &&
      c.unlock_time === clean.unlockTime &&
      c.timezone === clean.timezone &&
      c.points === JSON.stringify(clean.points) &&
      JSON.stringify(missionsOf(db, id).map((m) => m.lesson_slug)) === JSON.stringify(clean.missions.map((m) => m.slug));
    if (!same) throw new HttpError(409, "This challenge is published, so its dates, missions and points are fixed. Unpublish it first to change them.");
  }
  tx(db, () => {
    db.prepare(
      "UPDATE challenges SET name = ?, tagline = ?, story = ?, starts_on = ?, unlock_time = ?, reminder_time = ?, timezone = ?, points = ?, updated_at = ? WHERE id = ?",
    ).run(
      clean.name,
      clean.tagline,
      clean.story,
      clean.startsOn,
      clean.unlockTime,
      clean.reminderTime,
      clean.timezone,
      JSON.stringify(clean.points),
      iso(now),
      id,
    );
    write(db, id, clean);
    audit(db, { actor: actor.id, event: "challenge.update", entity: `challenge:${id}`, at: now });
  });
  return { id };
}

export function publishChallenge(db: Db, actor: User, id: string, publish: boolean, now: Date) {
  requireAuthor(actor);
  const c = rowOf(db, id);
  if (!c) throw new HttpError(404, "Challenge not found.");
  const missions = missionsOf(db, id);
  if (publish) {
    if (!missions.length) throw new HttpError(400, "Add at least one mission first.");
    const unpublished = missions.filter((m) => !lessonOf(m.lesson_slug));
    if (unpublished.length) throw new HttpError(400, `Publish every mission topic first. Day ${unpublished.map((m) => m.day).join(", ")} isn’t published yet.`);
    if (!membersOf(db, id).length) throw new HttpError(400, "Add people to at least one team first.");
  } else if (timeline(c, missions.length).opens[0] <= now) {
    throw new HttpError(409, "This challenge has started, so it can’t be unpublished.");
  }
  db.prepare("UPDATE challenges SET status = ?, published_at = ?, updated_at = ? WHERE id = ?").run(
    publish ? "published" : "draft",
    publish ? iso(now) : null,
    iso(now),
    id,
  );
  audit(db, { actor: actor.id, event: publish ? "challenge.publish" : "challenge.unpublish", entity: `challenge:${id}`, at: now });
  return { status: publish ? "published" : "draft" };
}

export function archiveChallenge(db: Db, actor: User, id: string, now: Date) {
  requireAuthor(actor);
  if (!rowOf(db, id)) throw new HttpError(404, "Challenge not found.");
  db.prepare("UPDATE challenges SET archived = 1, updated_at = ? WHERE id = ?").run(iso(now), id);
  audit(db, { actor: actor.id, event: "challenge.archive", entity: `challenge:${id}`, at: now });
  return { ok: true };
}

/* ---------- Reporting ---------- */

export function challengeReport(db: Db, actor: User, id: string, now: Date) {
  requireAuthor(actor);
  const c = rowOf(db, id);
  if (!c) throw new HttpError(404, "Challenge not found.");
  const missions = missionsOf(db, id);
  const members = membersOf(db, id);
  const teams = teamsOf(db, id);
  const scores = memberScores(
    db,
    c,
    missions,
    members.map((m) => m.user_id),
    now,
  );
  const started = new Set(
    (db.prepare("SELECT DISTINCT user_id, day FROM challenge_answers WHERE challenge_id = ?").all(id) as { user_id: string; day: number }[]).map(
      (r) => `${r.user_id}:${r.day}`,
    ),
  );
  const days = missions.map((m, i) => {
    const lesson = lessonOf(m.lesson_slug);
    const each = members.map((mb) => scores.get(mb.user_id)!.days[i]);
    const done = each.filter((d) => d.completedAt);
    return {
      day: m.day,
      title: shortTitle(lesson?.title ?? m.lesson_slug),
      opensAt: each[0]?.opensAt ?? timeline(c, missions.length).opens[i].toISOString(),
      open: each[0]?.open ?? false,
      started: members.filter((mb) => started.has(`${mb.user_id}:${m.day}`) || scores.get(mb.user_id)!.days[i].completedAt).length,
      completed: done.length,
      onTheDay: done.filter((d) => d.onTheDay).length,
      averagePoints: done.length ? Math.round(done.reduce((n, d) => n + d.total, 0) / done.length) : 0,
    };
  });

  // Knowledge gaps: every decision and question, from fewest right first time.
  const answers = db.prepare("SELECT day, key, right, pick FROM challenge_answers WHERE challenge_id = ?").all(id) as {
    day: number;
    key: string;
    right: number;
    pick: string | null;
  }[];
  const gaps = missions
    .flatMap((m) => {
      const lesson = lessonOf(m.lesson_slug);
      return lesson ? missionQuestions(lesson).map((q) => ({ ...q, day: m.day })) : [];
    })
    .map((q) => {
      const mine = answers.filter((a) => a.day === q.day && a.key === q.key);
      const wrong = mine.filter((a) => !a.right && a.pick);
      const counts = new Map<string, number>();
      for (const w of wrong) counts.set(w.pick!, (counts.get(w.pick!) ?? 0) + 1);
      const top = [...counts.entries()].sort((a, b) => b[1] - a[1])[0];
      return {
        day: q.day,
        kind: q.kind,
        label: q.label,
        answered: mine.length,
        right: mine.filter((a) => a.right).length,
        commonWrong: top ? { label: q.options.find((o) => o.id === top[0])?.label ?? top[0], count: top[1] } : null,
      };
    })
    .filter((g) => g.answered)
    .sort((a, b) => a.right / a.answered - b.right / b.answered);

  const people = members
    .map((mb) => {
      const s = scores.get(mb.user_id)!;
      return {
        id: mb.user_id,
        name: mb.name,
        team: teams.find((t) => t.id === mb.team_id)?.name ?? "",
        total: s.total,
        completed: s.days.filter((d) => d.completedAt).length,
        streak: s.streak,
        achievements: s.achievements.filter((a) => a.earned).length,
      };
    })
    .sort((a, b) => b.total - a.total || a.name.localeCompare(b.name));
  return { name: c.name, status: c.status, timezone: c.timezone, members: members.length, days, gaps, people };
}

/* ---------- Daily emails ---------- */

type Message = { subject: string; body: string };

function messageFor(
  c: Row,
  kind: "open" | "reminder",
  day: number,
  days: number,
  beat: string,
  title: string,
  total: number,
  streak: number,
  url: string,
): Message {
  const final = day === days;
  const subject = kind === "open" ? `${c.name}: ${final ? "the final mission" : `day ${day}`} is open` : `${c.name}: there’s still time for day ${day}`;
  const lines = [
    kind === "open"
      ? `Day ${day} of ${days} is open: ${title}.`
      : `Day ${day} of ${days} is still waiting for you: ${title}. Finish it today for the on-the-day bonus.`,
    beat ? `\n${beat}` : "",
    `\nYou have ${total} points${streak ? ` and a ${streak}-day streak` : ""}. It takes about 5 to 7 minutes.`,
    `\nPlay now: ${url}`,
  ];
  return { subject, body: lines.join("\n") };
}

/** Queues each member's invitation when a mission opens, and one reminder that afternoon if it isn't done. */
export function queueChallengeEmails(db: Db, now: Date, baseUrl: string) {
  const live = db.prepare("SELECT * FROM challenges WHERE status = 'published' AND archived = 0").all() as Row[];
  let queued = 0;
  for (const c of live) {
    const missions = missionsOf(db, c.id);
    if (!missions.length) continue;
    const t = timeline(c, missions.length);
    const i = t.opens.filter((o) => now >= o).length - 1;
    if (i < 0 || now >= t.closes) continue;
    // Only on the day it opened: no back-filling old days if the worker was down.
    const today = dateKey(localDate(now, c.timezone));
    if (dateKey(localDate(t.opens[i], c.timezone)) !== today) continue;
    const kind = now >= t.reminders[i] ? "reminder" : "open";
    const members = membersOf(db, c.id).filter((m) => m.emails);
    const scores = memberScores(
      db,
      c,
      missions,
      members.map((m) => m.user_id),
      now,
    );
    const lesson = lessonOf(missions[i].lesson_slug);
    for (const m of members) {
      const s = scores.get(m.user_id)!;
      if (kind === "reminder" && s.days[i].completedAt) continue;
      const msg = messageFor(
        c,
        kind,
        i + 1,
        missions.length,
        missions[i].beat,
        lesson?.title ?? "today’s mission",
        s.total,
        s.streak,
        `${baseUrl}/challenge/${c.id}`,
      );
      const r = db
        .prepare(
          `INSERT OR IGNORE INTO outbox (user_id, kind, channel, local_date, idempotency_key, items, subject, body, status, created_at, updated_at)
           VALUES (?, ?, 'email', ?, ?, ?, ?, ?, 'queued', ?, ?)`,
        )
        .run(
          m.user_id,
          `challenge_${kind}`,
          today,
          `challenge:${c.id}:${i + 1}:${kind}:${m.user_id}`,
          JSON.stringify({ challengeId: c.id, day: i + 1 }),
          msg.subject,
          msg.body,
          iso(now),
          iso(now),
        );
      queued += Number(r.changes);
    }
  }
  return queued;
}

/** Whether a queued challenge email should still go: reminders are dropped once the mission is done. */
export function challengeEmailStillDue(db: Db, userId: string, kind: string, items: string, now: Date) {
  const { challengeId, day } = JSON.parse(items) as { challengeId: string; day: number };
  const c = rowOf(db, challengeId);
  if (!c || c.status !== "published") return false;
  if (kind !== "challenge_reminder") return true;
  const missions = missionsOf(db, challengeId);
  return !memberScores(db, c, missions, [userId], now).get(userId)!.days[day - 1]?.completedAt;
}
