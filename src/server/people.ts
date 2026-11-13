import "server-only";
import { lessons, lessonBySlug } from "@/content/lessons";
import { audit, tx, type Db } from "./db";
import { HttpError, requireSuperadmin, userById, type User } from "./auth";
import { facts, isFor, pathsFor, stateOf } from "./completionReports";
import { assignLearningPath, getRow, slugsFor, unassignLearningPath } from "./learningPaths";
import { missionSlugs } from "./challenges";
import { notify } from "./notifications";
import { pictureUrl } from "./profilePictures";

/*
  People and permissions: the superadmin's view of everyone in the hub, across every organisation.
  For each person: who they are, what they can do (their access level and any part in topic approval),
  and their learning (assigned paths and topics, progress, what's overdue). Superadmins give people
  access, and assign learning paths or single topics, with a due date, to one person or many at once.
  Each assignment lands in the person's Inbox as an action.

  Access levels map onto the hub's roles: a Learner; an Organisation admin, who sees reports and assigns
  learning for their own organisation; a Learning author (Trilogy staff who write topics); and a
  Superadmin, a learning author who also manages people and permissions here.
*/

export type Access = "learner" | "org_admin" | "author" | "superadmin";
export type ReviewRole = "sme" | "compliance" | "publisher" | null;

type Row = User & { org: string; review_role: string | null; review_area: string | null };

const catalogue = () => lessons.filter((l) => l.track !== "reinforcement");
export const accessOf = (u: Pick<User, "role" | "superadmin">): Access => (u.superadmin === 1 ? "superadmin" : u.role);

const allPeople = (db: Db) =>
  db.prepare("SELECT u.*, o.name AS org FROM users u JOIN orgs o ON o.id = u.org_id ORDER BY u.name").all() as Row[];

/** A single topic assigned to someone, with its due date. */
function topicAssignments(db: Db, userId?: string) {
  return db
    .prepare(`SELECT lesson_slug, user_id, due_date, assigned_at, assigned_by FROM topic_assignments ${userId ? "WHERE user_id = ?" : ""} ORDER BY assigned_at`)
    .all(...(userId ? [userId] : [])) as { lesson_slug: string; user_id: string; due_date: string | null; assigned_at: string; assigned_by: string }[];
}

/** Everyone, with their access and a summary of their learning, for the People and permissions page. */
export function directory(db: Db, actor: User, now: Date) {
  requireSuperadmin(actor);
  const f = facts(db);
  const today = now.toISOString().slice(0, 10);
  const assigned = topicAssignments(db);
  const people = allPeople(db).map((p) => {
    const mine = catalogue().filter((l) => isFor(l, p.audience));
    const states = mine.map((l) => stateOf(f, l, p.id));
    const paths = pathsFor(db, p.id, f).filter((x) => !x.selfEnrolled);
    const topics = assigned.filter((a) => a.user_id === p.id);
    const topicDone = (slug: string) => f.completions.has(`${p.id}|${slug}`);
    const overdue =
      paths.filter((x) => !x.done && x.dueDate && x.dueDate < today).length + topics.filter((t) => !topicDone(t.lesson_slug) && t.due_date && t.due_date < today).length;
    return {
      id: p.id,
      name: p.name,
      email: p.email,
      org: p.org,
      orgId: p.org_id,
      audience: p.audience,
      serviceRole: p.service_role,
      avatar: pictureUrl(p.avatar ?? null),
      access: accessOf(p),
      reviewRole: (p.review_role as ReviewRole) ?? null,
      completed: states.filter((s) => s.state === "completed").length,
      inProgress: states.filter((s) => s.state === "in_progress").length,
      assignedPaths: paths.length,
      pathsDone: paths.filter((x) => x.done).length,
      assignedTopics: topics.length,
      topicsDone: topics.filter((t) => topicDone(t.lesson_slug)).length,
      overdue,
      lastActive:
        states
          .map((s) => s.lastActive)
          .filter(Boolean)
          .sort()
          .pop() ?? null,
    };
  });
  const orgs = [...new Map(people.map((p) => [p.orgId, p.org])).entries()].map(([id, name]) => ({ id, name })).sort((a, b) => a.name.localeCompare(b.name));
  // What can be assigned: every published topic (not challenge missions) and every learning path with topics.
  const missions = missionSlugs(db);
  const assignable = {
    topics: catalogue()
      .filter((l) => !missions.has(l.slug))
      .map((l) => ({ id: l.slug, title: l.title, minutes: l.minutes }))
      .sort((a, b) => a.title.localeCompare(b.title)),
    paths: (db.prepare("SELECT id, name FROM learning_paths WHERE archived = 0 ORDER BY name").all() as { id: string; name: string }[])
      .filter((p) => slugsFor(db, p.id).length > 0)
      .map((p) => ({ id: p.id, title: p.name, topics: slugsFor(db, p.id).length })),
  };
  return { people, orgs, assignable, you: actor.id };
}

/** One person in full: profile, access, every path and topic assigned to them with progress, and recent completions. */
export function personDetail(db: Db, actor: User, userId: string, now: Date) {
  requireSuperadmin(actor);
  const p = allPeople(db).find((x) => x.id === userId);
  if (!p) throw new HttpError(404, "Person not found.");
  const f = facts(db);
  const today = now.toISOString().slice(0, 10);
  const name = (id: string) => userById(db, id)?.name ?? "Someone";
  const paths = pathsFor(db, p.id, f).map((x) => ({ ...x, overdue: Boolean(!x.done && x.dueDate && x.dueDate < today) }));
  const topics = topicAssignments(db, p.id).flatMap((a) => {
    const l = lessonBySlug(a.lesson_slug);
    if (!l) return [];
    const s = stateOf(f, l, p.id);
    return [
      {
        slug: l.slug,
        title: l.title,
        minutes: l.minutes,
        dueDate: a.due_date,
        assignedBy: name(a.assigned_by),
        assignedAt: a.assigned_at,
        state: s.state,
        completedAt: s.completedAt,
        overdue: Boolean(s.state !== "completed" && a.due_date && a.due_date < today),
      },
    ];
  });
  const recent = catalogue()
    .map((l) => ({ slug: l.slug, title: l.title, ...stateOf(f, l, p.id) }))
    .filter((r) => r.completedAt)
    .sort((a, b) => (b.completedAt ?? "").localeCompare(a.completedAt ?? ""))
    .slice(0, 8)
    .map((r) => ({ slug: r.slug, title: r.title, completedAt: r.completedAt, needsRefresher: r.needsRefresher }));
  return {
    id: p.id,
    name: p.name,
    email: p.email,
    org: p.org,
    trilogy: p.org_id === "trilogy",
    audience: p.audience,
    serviceRole: p.service_role,
    avatar: pictureUrl(p.avatar ?? null),
    access: accessOf(p),
    reviewRole: (p.review_role as ReviewRole) ?? null,
    reviewArea: p.review_area ?? "",
    paths,
    topics,
    recent,
    // The completions report covers learners; staff don't have one.
    reportHref: p.role === "learner" ? `/admin/completions/people/${encodeURIComponent(p.id)}` : null,
  };
}

/**
  Changes what someone can do. Guard rails: you can't take your own superadmin access away (so nobody
  locks themselves out), and there's always at least one superadmin. Approval roles (reviewer,
  Compliance, publisher) are for Trilogy staff with admin access.
*/
export function setAccess(db: Db, actor: User, userId: string, input: { access?: unknown; reviewRole?: unknown; reviewArea?: unknown }, now: Date) {
  requireSuperadmin(actor);
  const target = userById(db, userId);
  if (!target) throw new HttpError(404, "Person not found.");
  const access = input.access as Access;
  if (!["learner", "org_admin", "author", "superadmin"].includes(access)) throw new HttpError(400, "Choose an access level.");
  if (target.id === actor.id && access !== "superadmin") throw new HttpError(409, "You can’t remove your own superadmin access. Ask another superadmin.");
  const others = (db.prepare("SELECT COUNT(*) n FROM users WHERE superadmin = 1 AND id != ?").get(target.id) as { n: number }).n;
  if (target.superadmin === 1 && access !== "superadmin" && others === 0) throw new HttpError(409, "There has to be at least one superadmin.");
  if ((access === "author" || access === "superadmin") && target.org_id !== "trilogy") throw new HttpError(409, "Learning author and superadmin access are for Trilogy Care staff.");
  const reviewRole = input.reviewRole === "sme" || input.reviewRole === "compliance" || input.reviewRole === "publisher" ? input.reviewRole : null;
  if (reviewRole && access !== "author" && access !== "superadmin") throw new HttpError(409, "Approval roles need learning author or superadmin access.");
  const reviewArea = String(input.reviewArea ?? "").trim().slice(0, 60);
  const role = access === "superadmin" ? "author" : access;
  db.prepare("UPDATE users SET role = ?, superadmin = ?, review_role = ?, review_area = ? WHERE id = ?").run(
    role,
    access === "superadmin" ? 1 : 0,
    reviewRole,
    // Kept (as "" at least) when a role is cleared, so demo seeding never puts it back.
    reviewRole ? reviewArea || null : reviewArea,
    target.id,
  );
  audit(db, {
    actor: actor.id,
    event: "person.access",
    entity: `user:${target.id}`,
    previous: { access: accessOf(target), reviewRole: (target as Row).review_role ?? null },
    next: { access, reviewRole },
    at: now,
  });
  return personDetail(db, actor, target.id, now);
}

/** Assigns a learning path or a single topic to several people at once, with an optional due date. Each gets it in their Inbox. */
export function assignLearning(db: Db, actor: User, input: { kind?: unknown; id?: unknown; userIds?: unknown; dueDate?: unknown }, now: Date) {
  requireSuperadmin(actor);
  const userIds = Array.isArray(input.userIds) ? [...new Set(input.userIds.map(String))] : [];
  if (!userIds.length) throw new HttpError(400, "Choose at least one person.");
  const unknown = userIds.filter((id) => !userById(db, id));
  if (unknown.length) throw new HttpError(404, "Someone you chose isn’t in the hub any more.");
  const dueDate = input.dueDate ? String(input.dueDate) : null;
  if (dueDate && !/^\d{4}-\d{2}-\d{2}$/.test(dueDate)) throw new HttpError(400, "Use a date like 2026-11-30.");
  if (dueDate && dueDate < now.toISOString().slice(0, 10)) throw new HttpError(400, "Choose a due date from today on.");
  const id = String(input.id ?? "");
  const due = dueDate ? ` · due ${new Date(`${dueDate}T00:00:00Z`).toLocaleDateString("en-AU", { day: "numeric", month: "short", timeZone: "UTC" })}` : "";

  if (input.kind === "path") {
    const path = getRow(db, id);
    assignLearningPath(db, actor, id, userIds, dueDate, now);
    for (const u of userIds)
      notify(
        db,
        u,
        {
          kind: "action",
          category: "Assigned learning",
          priority: dueDate ? "high" : "normal",
          title: `Learning path assigned: ${path.name}`,
          body: `${actor.name} assigned you this learning path${due}.`,
          href: `/paths/${encodeURIComponent(id)}`,
          dueAt: dueDate ? `${dueDate}T23:59:00Z` : null,
          source: `assign:path:${id}:${now.getTime()}`,
        },
        now,
      );
    return { assigned: userIds.length, title: path.name };
  }

  if (input.kind === "topic") {
    const lesson = lessonBySlug(id);
    if (!lesson || lesson.track === "reinforcement" || missionSlugs(db).has(id)) throw new HttpError(404, "Choose a published topic.");
    const at = now.toISOString();
    tx(db, () => {
      for (const u of userIds)
        db.prepare(
          `INSERT INTO topic_assignments (lesson_slug, user_id, due_date, assigned_by, assigned_at) VALUES (?, ?, ?, ?, ?)
           ON CONFLICT (lesson_slug, user_id) DO UPDATE SET due_date = excluded.due_date, assigned_by = excluded.assigned_by, assigned_at = excluded.assigned_at`,
        ).run(id, u, dueDate, actor.id, at);
      audit(db, { actor: actor.id, event: "topic.assigned", entity: `lesson:${id}`, next: { userIds, dueDate }, at: now });
    });
    for (const u of userIds)
      notify(
        db,
        u,
        {
          kind: "action",
          category: "Assigned learning",
          priority: dueDate ? "high" : "normal",
          title: `Topic assigned: ${lesson.title}`,
          body: `${actor.name} assigned you this ${lesson.minutes}-minute topic${due}.`,
          href: `/topics/${encodeURIComponent(id)}`,
          dueAt: dueDate ? `${dueDate}T23:59:00Z` : null,
          source: `assign:topic:${id}:${now.getTime()}`,
        },
        now,
      );
    return { assigned: userIds.length, title: lesson.title };
  }
  throw new HttpError(400, "Choose a learning path or a topic.");
}

/** Takes an assignment away. Anything they've completed is kept. */
export function unassign(db: Db, actor: User, input: { kind?: unknown; id?: unknown; userId?: unknown }, now: Date) {
  requireSuperadmin(actor);
  const id = String(input.id ?? "");
  const userId = String(input.userId ?? "");
  if (input.kind === "path") unassignLearningPath(db, actor, id, userId, now);
  else if (input.kind === "topic") {
    db.prepare("DELETE FROM topic_assignments WHERE lesson_slug = ? AND user_id = ?").run(id, userId);
    audit(db, { actor: actor.id, event: "topic.unassigned", entity: `lesson:${id}`, previous: { userId }, reason: "Removed by a superadmin; completions are kept.", at: now });
  } else throw new HttpError(400, "Which assignment?");
  return personDetail(db, actor, userId, now);
}

/** A person's own assigned topics, for their Learning page and the "Your learning" panel. */
export function myTopicAssignments(db: Db, userId: string) {
  return new Map(topicAssignments(db, userId).map((a) => [a.lesson_slug, a.due_date]));
}
