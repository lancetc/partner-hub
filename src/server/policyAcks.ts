import "server-only";
import { randomUUID } from "node:crypto";
import { stories, policyStatusLabel } from "@/content/stories";
import { resources } from "@/content/resources";
import { accountSegment, ROLE_CHOICES, roleChoiceLabel, type Segment } from "@/lib/onboardingCourses";
import { audit, tx, type Db } from "./db";
import { canAuthor, HttpError, isSuperadmin, type User } from "./auth";
import { notify } from "./notifications";
import { baseUrl } from "./campaigns";

/*
  Policy acknowledgements (the owner, Nov 2026): when Trilogy Care updates a policy, the people it applies to are asked
  to read it and confirm they have, by a date. An administrator writes a short note of what's changed, links the policy
  (a News story, a Resource, or a PDF they upload), names its version, picks the roles it's for (none: everyone) and a
  due date. Each person gets an Inbox action ("Read and acknowledge"), and an email waits in the outbox until email is
  connected. Their confirmation records when, and which version. People who join a role later get it too, while it's open.
  Withdrawing one closes what's still waiting; confirmations already given stay on record.
*/

const SEGMENTS: Segment[] = ROLE_CHOICES.map((r) => r.segment);

function ensure(db: Db) {
  db.exec(`CREATE TABLE IF NOT EXISTS policy_acks (
    id TEXT PRIMARY KEY, title TEXT NOT NULL, summary TEXT NOT NULL DEFAULT '', version TEXT NOT NULL,
    href TEXT NOT NULL, link_label TEXT NOT NULL DEFAULT '', roles TEXT NOT NULL DEFAULT '[]', due_on TEXT NOT NULL,
    status TEXT NOT NULL DEFAULT 'active' CHECK (status IN ('active', 'withdrawn')),
    created_by TEXT NOT NULL, created_at TEXT NOT NULL, withdrawn_by TEXT, withdrawn_at TEXT, withdrawn_reason TEXT
  )`);
}

type Row = {
  id: string;
  title: string;
  summary: string;
  version: string;
  href: string;
  link_label: string;
  roles: string;
  due_on: string;
  status: "active" | "withdrawn";
  created_by: string;
  created_at: string;
  withdrawn_at: string | null;
};

const may = (u: User) => canAuthor(u) || isSuperadmin(u);
const need = (u: User) => {
  if (!may(u)) throw new HttpError(403, "Only learning authors and Hub administrators manage policy acknowledgements.");
};
const text = (v: unknown, max: number) => (typeof v === "string" ? v.replace(/\r\n/g, "\n").trim().slice(0, max) : "");
const today = (now: Date) => now.toISOString().slice(0, 10);
const rolesOf = (r: Row) => (JSON.parse(r.roles) as string[]).filter((s): s is Segment => (SEGMENTS as string[]).includes(s));
const sourceOf = (id: string) => `policy:${id}`;
/** Whether a request applies to someone: their role is one it names, or it names none (everyone). */
const appliesTo = (r: Row, u: User) => {
  const roles = rolesOf(r);
  return !roles.length || roles.includes(accountSegment(u));
};
const whenText = (day: string) => new Date(`${day}T00:00:00Z`).toLocaleDateString("en-AU", { day: "numeric", month: "long", year: "numeric", timeZone: "UTC" });

/** The policies an administrator can link: News stories (policies first) and Resources. */
export function policyLinks(db: Db, actor: User) {
  need(actor);
  const news = stories
    .map((s) => ({
      href: `/news/${s.slug}`,
      label: s.title,
      kind: "News" as const,
      note: s.policy ? `Policy · ${policyStatusLabel[s.policy.status]}` : "",
      policy: Boolean(s.policy),
    }))
    .sort((a, b) => Number(b.policy) - Number(a.policy) || a.label.localeCompare(b.label));
  const res = resources.map((r) => ({ href: `/resources#${r.id}`, label: r.title, kind: "Resource" as const, note: r.kind, policy: false }));
  return [...news, ...res];
}

/** Sends one person a request: the Inbox action and, while email isn't connected, an email waiting in the outbox. */
function deliver(db: Db, r: Row, u: User, now: Date) {
  const source = sourceOf(r.id);
  const already = db.prepare("SELECT 1 FROM notifications WHERE user_id = ? AND source = ?").get(u.id, source);
  if (already) return false;
  notify(
    db,
    u.id,
    {
      kind: "action",
      category: "Acknowledgement required",
      priority: "high",
      title: r.title,
      body: r.summary,
      href: r.href,
      dueAt: `${r.due_on}T23:59:00Z`,
      ack: { version: r.version },
      source,
    },
    now,
  );
  const at = now.toISOString();
  const link = `${baseUrl()}${r.href}`;
  db.prepare(
    `INSERT OR IGNORE INTO outbox (user_id, kind, channel, local_date, idempotency_key, items, subject, body, status, created_at, updated_at)
     VALUES (?, ?, 'email', ?, ?, ?, ?, ?, 'queued', ?, ?)`,
  ).run(
    u.id,
    `policy_ack:${r.id}`,
    today(now),
    `policy_ack:${r.id}:${u.id}`,
    JSON.stringify([{ id: r.id, version: r.version }]),
    `Please read and acknowledge: ${r.title}`,
    [
      `Hi ${u.name.split(" ")[0]},`,
      "",
      `${r.title} (${r.version}) has been updated, and it applies to you.`,
      r.summary ? `\nWhat's changed: ${r.summary}\n` : "",
      `Please read it and confirm in your Partner Hub Inbox by ${whenText(r.due_on)}.`,
      "",
      `Read it: ${link}`,
      `Your Inbox: ${baseUrl()}/inbox`,
      "",
      "Trilogy Care",
    ].join("\n"),
    at,
    at,
  );
  return true;
}

/** Everyone a request applies to today. */
const audienceFor = (db: Db, r: Row) => (db.prepare("SELECT * FROM users ORDER BY name").all() as User[]).filter((u) => appliesTo(r, u));

/** A new request: checked, saved, and sent to everyone it applies to. */
export function createPolicyAck(db: Db, actor: User, input: Record<string, unknown>, now: Date) {
  need(actor);
  ensure(db);
  const title = text(input.title, 120);
  if (title.length < 4) throw new HttpError(400, "Give the policy’s name, as people know it.");
  const version = text(input.version, 40);
  if (!version) throw new HttpError(400, "Say which version they’re confirming, such as “v2.1” or “November 2026”.");
  const summary = text(input.summary, 400);
  const href = text(input.href, 300);
  if (!/^\/[A-Za-z0-9/_#.?=&%-]*$/.test(href) || href.startsWith("//"))
    throw new HttpError(400, "Link the policy: a News story, a Resource or a PDF you upload.");
  const roles = Array.isArray(input.roles) ? [...new Set(input.roles.filter((s): s is Segment => (SEGMENTS as unknown[]).includes(s)))] : [];
  const dueOn = typeof input.dueOn === "string" && /^\d{4}-\d{2}-\d{2}$/.test(input.dueOn) ? input.dueOn : "";
  if (!dueOn || dueOn < today(now)) throw new HttpError(400, "Choose a due date from today on.");
  const row: Row = {
    id: `pol-${randomUUID().slice(0, 12)}`,
    title,
    summary,
    version,
    href,
    link_label: text(input.linkLabel, 160),
    roles: JSON.stringify(roles),
    due_on: dueOn,
    status: "active",
    created_by: actor.id,
    created_at: now.toISOString(),
    withdrawn_at: null,
  };
  let sent = 0;
  tx(db, () => {
    db.prepare(
      "INSERT INTO policy_acks (id, title, summary, version, href, link_label, roles, due_on, status, created_by, created_at) VALUES (?, ?, ?, ?, ?, ?, ?, ?, 'active', ?, ?)",
    ).run(row.id, row.title, row.summary, row.version, row.href, row.link_label, row.roles, row.due_on, row.created_by, row.created_at);
    for (const u of audienceFor(db, row)) if (deliver(db, row, u, now)) sent++;
    audit(db, { actor: actor.id, event: "policy_ack.sent", entity: `policy_ack:${row.id}`, next: { title, version, roles, dueOn, sent }, at: now });
  });
  return { id: row.id, sent };
}

/** Someone who's joined, or changed role, since a request went out: they get the ones open now that apply to them. */
export function syncPolicyAcks(db: Db, user: User, now: Date) {
  ensure(db);
  const open = db.prepare("SELECT * FROM policy_acks WHERE status = 'active'").all() as Row[];
  for (const r of open) if (appliesTo(r, user)) deliver(db, r, user, now);
}

type Person = { name: string; role: string; organisation: string; ackedAt: string | null; version: string | null; opened: boolean; overdue: boolean };

function peopleFor(db: Db, r: Row, now: Date): Person[] {
  const rows = db
    .prepare(
      `SELECT n.acked_at, n.ack_version, n.read_at, n.done_at, u.*, o.name AS org FROM notifications n JOIN users u ON u.id = n.user_id
       LEFT JOIN orgs o ON o.id = u.org_id WHERE n.source = ? AND n.ack_required = 1`,
    )
    .all(sourceOf(r.id)) as (User & {
    acked_at: string | null;
    ack_version: string | null;
    read_at: string | null;
    done_at: string | null;
    org: string | null;
  })[];
  const due = `${r.due_on}T23:59:00Z`;
  return rows
    .map((x) => ({
      name: x.name,
      role: roleChoiceLabel(accountSegment(x)),
      organisation: x.org ?? "",
      ackedAt: x.acked_at,
      version: x.ack_version,
      opened: Boolean(x.read_at),
      overdue: !x.acked_at && r.status === "active" && now.toISOString() > due,
    }))
    .sort((a, b) => Number(Boolean(a.ackedAt)) - Number(Boolean(b.ackedAt)) || Number(b.overdue) - Number(a.overdue) || a.name.localeCompare(b.name));
}

const view = (db: Db, r: Row, now: Date) => {
  const people = peopleFor(db, r, now);
  const roles = rolesOf(r);
  return {
    id: r.id,
    title: r.title,
    summary: r.summary,
    version: r.version,
    href: r.href,
    linkLabel: r.link_label,
    roles: roles.map((s) => roleChoiceLabel(s)),
    forEveryone: !roles.length,
    dueOn: r.due_on,
    status: r.status,
    createdAt: r.created_at,
    withdrawnAt: r.withdrawn_at,
    total: people.length,
    acknowledged: people.filter((p) => p.ackedAt).length,
    overdue: people.filter((p) => p.overdue).length,
    people,
  };
};

/** Every request, newest first, with how many have confirmed. */
export function policyAcks(db: Db, actor: User, now: Date) {
  need(actor);
  ensure(db);
  const rows = db.prepare("SELECT * FROM policy_acks ORDER BY status = 'withdrawn', created_at DESC").all() as Row[];
  return { requests: rows.map((r) => view(db, r, now)), roles: ROLE_CHOICES.map((r) => ({ value: r.segment, label: r.label })) };
}

/** Closes a request: nobody new gets it, and what's still waiting leaves people's Inboxes. Confirmations stay. */
export function withdrawPolicyAck(db: Db, actor: User, input: Record<string, unknown>, now: Date) {
  need(actor);
  ensure(db);
  const r = db.prepare("SELECT * FROM policy_acks WHERE id = ?").get(String(input.id ?? "")) as Row | undefined;
  if (!r) throw new HttpError(404, "That request isn’t here.");
  if (r.status === "withdrawn") return { ok: true };
  const reason = text(input.reason, 300);
  const at = now.toISOString();
  tx(db, () => {
    db.prepare("UPDATE policy_acks SET status = 'withdrawn', withdrawn_by = ?, withdrawn_at = ?, withdrawn_reason = ? WHERE id = ?").run(
      actor.id,
      at,
      reason || null,
      r.id,
    );
    db.prepare("UPDATE notifications SET done_at = COALESCE(done_at, ?) WHERE source = ? AND acked_at IS NULL").run(at, sourceOf(r.id));
    db.prepare("UPDATE outbox SET status = 'cancelled', updated_at = ? WHERE kind = ? AND status = 'queued'").run(at, `policy_ack:${r.id}`);
    audit(db, { actor: actor.id, event: "policy_ack.withdrawn", entity: `policy_ack:${r.id}`, reason: reason || undefined, at: now });
  });
  return { ok: true };
}
