import "server-only";
import { audit, type Db } from "./db";
import { HttpError, type User } from "./auth";

/*
  The in-app Inbox: a notification centre and an action centre in one, in three tabs.

  - Action required: things that need a response (acknowledge a critical change, complete mandatory
    training). They stay until done; read isn't enough.
  - Updates: things that have happened that you might want to read (a new topic, a webinar coming up).
  - Activity: what other people did that involves you (a reply, an approval), and achievements.

  Priority (critical, high, normal) orders each tab. Acknowledgements record when, and which version of
  the notice, so there's evidence it was read (see acknowledgementReport). No push notifications.
*/

export type Kind = "action" | "update" | "activity";
export type Priority = "critical" | "high" | "normal";

type Row = {
  id: number;
  user_id: string;
  kind: Kind;
  category: string;
  priority: Priority;
  title: string;
  body: string;
  href: string | null;
  due_at: string | null;
  ack_required: number;
  ack_version: string | null;
  source: string;
  created_at: string;
  read_at: string | null;
  acked_at: string | null;
  done_at: string | null;
};

export type NewNotification = {
  kind: Kind;
  category: string;
  priority?: Priority;
  title: string;
  body?: string;
  href?: string | null;
  dueAt?: string | null;
  /** Asks the person to confirm they've read it; `version` is recorded with their confirmation. */
  ack?: { version: string };
  /** One per person per source: adding it again does nothing. */
  source: string;
};

/** Adds a notification to someone's Inbox (once per source). */
export function notify(db: Db, userId: string, n: NewNotification, now: Date) {
  db.prepare(
    `INSERT OR IGNORE INTO notifications (user_id, kind, category, priority, title, body, href, due_at, ack_required, ack_version, source, created_at)
     VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`,
  ).run(
    userId,
    n.kind,
    n.category,
    n.priority ?? "normal",
    n.title,
    n.body ?? "",
    n.href ?? null,
    n.dueAt ?? null,
    n.ack ? 1 : 0,
    n.ack?.version ?? null,
    n.source,
    now.toISOString(),
  );
}

const view = (r: Row) => ({
  id: r.id,
  kind: r.kind,
  category: r.category,
  priority: r.priority,
  title: r.title,
  body: r.body,
  href: r.href,
  dueAt: r.due_at,
  ackRequired: r.ack_required === 1,
  at: r.created_at,
  read: Boolean(r.read_at),
  ackedAt: r.acked_at,
  done: Boolean(r.done_at || r.acked_at),
  /** An email from the hub: its campaign, so the Inbox can show it as it was sent. */
  campaign: r.source.startsWith("campaign:") ? r.source.slice("campaign:".length) : null,
});
export type InboxItem = ReturnType<typeof view>;

const RANK: Record<Priority, number> = { critical: 0, high: 1, normal: 2 };

/** Everything in someone's Inbox, by tab: outstanding actions first (most urgent, then soonest due), then newest. */
export function inbox(db: Db, user: User, now: Date) {
  seedDemo(db, user, now);
  const rows = (db.prepare("SELECT * FROM notifications WHERE user_id = ? ORDER BY created_at DESC, id DESC LIMIT 200").all(user.id) as Row[]).map(view);
  const sort = (a: InboxItem, b: InboxItem) =>
    Number(a.done) - Number(b.done) || RANK[a.priority] - RANK[b.priority] || (a.dueAt ?? "9").localeCompare(b.dueAt ?? "9") || b.at.localeCompare(a.at);
  const action = rows.filter((r) => r.kind === "action").sort(sort);
  const updates = rows.filter((r) => r.kind === "update");
  const activity = rows.filter((r) => r.kind === "activity");
  return {
    action,
    updates,
    activity,
    counts: {
      action: action.filter((r) => !r.done).length,
      updates: updates.filter((r) => !r.read).length,
      activity: activity.filter((r) => !r.read).length,
    },
  };
}

/** The number on the Inbox icon: actions still to do, plus anything unread. */
export function inboxCount(db: Db, user: User, now: Date) {
  const { counts } = inbox(db, user, now);
  return { ...counts, total: counts.action + counts.updates + counts.activity };
}

function own(db: Db, user: User, id: number) {
  const r = db.prepare("SELECT * FROM notifications WHERE id = ? AND user_id = ?").get(id, user.id) as Row | undefined;
  if (!r) throw new HttpError(404, "That notification has gone.");
  return r;
}

export function markRead(db: Db, user: User, id: number, now: Date) {
  own(db, user, id);
  db.prepare("UPDATE notifications SET read_at = COALESCE(read_at, ?) WHERE id = ?").run(now.toISOString(), id);
}

/** Every update or activity item in a tab read. Actions stay until they're done. */
export function markAllRead(db: Db, user: User, kind: Kind, now: Date) {
  if (kind === "action") throw new HttpError(400, "Actions stay until they’re done.");
  db.prepare("UPDATE notifications SET read_at = ? WHERE user_id = ? AND kind = ? AND read_at IS NULL").run(now.toISOString(), user.id, kind);
}

/** "I've read and understood this": recorded with the time and the version of the notice. */
export function acknowledge(db: Db, user: User, id: number, now: Date) {
  const r = own(db, user, id);
  if (!r.ack_required) throw new HttpError(400, "This one doesn’t need confirming.");
  if (r.acked_at) return;
  const at = now.toISOString();
  db.prepare("UPDATE notifications SET acked_at = ?, read_at = COALESCE(read_at, ?), done_at = ? WHERE id = ?").run(at, at, at, id);
  audit(db, { actor: user.id, event: "notice.acknowledged", entity: r.source, next: { version: r.ack_version, title: r.title }, at: now });
}

/** An action done some other way (the training completed, say). */
export function markDone(db: Db, user: User, id: number, now: Date) {
  const r = own(db, user, id);
  if (r.ack_required) throw new HttpError(400, "Confirm you’ve read it instead.");
  db.prepare("UPDATE notifications SET done_at = COALESCE(done_at, ?), read_at = COALESCE(read_at, ?) WHERE id = ?").run(now.toISOString(), now.toISOString(), id);
}

/** For admins: who has confirmed a notice (by its source), when, and which version. */
export function acknowledgementReport(db: Db, source: string) {
  const rows = db
    .prepare(
      `SELECT n.acked_at, n.ack_version, n.read_at, u.name, u.email FROM notifications n JOIN users u ON u.id = n.user_id
       WHERE n.source = ? AND n.ack_required = 1 ORDER BY n.acked_at IS NULL, n.acked_at, u.name`,
    )
    .all(source) as { acked_at: string | null; ack_version: string | null; read_at: string | null; name: string; email: string }[];
  return {
    total: rows.length,
    acknowledged: rows.filter((r) => r.acked_at).length,
    people: rows.map((r) => ({ name: r.name, email: r.email, ackedAt: r.acked_at, version: r.ack_version, opened: Boolean(r.read_at) })),
  };
}

/**
  Demonstration content: a few things in each tab the first time someone opens their Inbox, so the
  prototype has something to show. Dates are relative to today. Each is added once.
*/
function seedDemo(db: Db, user: User, now: Date) {
  const days = (n: number) => new Date(now.getTime() + n * 86_400_000).toISOString();
  const ago = (h: number) => new Date(now.getTime() - h * 3_600_000);
  const add = (n: NewNotification, at: Date) => notify(db, user.id, n, at);
  add(
    {
      kind: "action",
      category: "Mandatory learning",
      priority: "high",
      title: "SIRS refresher due",
      body: "Complete your refresher on the Serious Incident Response Scheme: knowing what to report, and when.",
      href: "/learning/sirs-in-depth-know-what-to-report",
      dueAt: days(17),
      source: "demo:sirs-refresher",
    },
    ago(26),
  );
  add(
    {
      kind: "action",
      category: "Acknowledgement required",
      priority: "critical",
      title: "Updated invoicing guidance",
      body: "Invoices now need the visit date and the service code on every line. Review the guidance and confirm you’ve read it.",
      href: "/news/extra-visit-time-briefing",
      dueAt: days(7),
      ack: { version: "Invoicing guidance v2.1" },
      source: "demo:invoicing-guidance",
    },
    ago(5),
  );
  add(
    {
      kind: "update",
      category: "Webinar",
      title: "Tomorrow: Support at Home, what changes for partners",
      body: "The monthly coordinator webinar starts at 10:30 am. A recording follows if you can’t make it.",
      href: "/webinars/w-support-at-home",
      source: "demo:webinar-reminder",
    },
    ago(3),
  );
  add(
    {
      kind: "update",
      category: "New learning",
      title: "New topic: Who Does What?",
      body: "An interactive map of who’s responsible for what in aged care. About 5 minutes.",
      href: "/learning/who-does-what",
      source: "demo:new-topic",
    },
    ago(30),
  );
  add(
    {
      kind: "update",
      category: "News",
      title: "Partners and coordinators are shaping the new Partner Hub",
      body: "What the pilot is testing, and how to tell us what works.",
      href: "/news/partners-shaping-the-hub",
      source: "demo:news-story",
    },
    ago(52),
  );
  add(
    {
      kind: "activity",
      category: "Community",
      title: "Priya Raman replied to your question",
      body: "“The small talk is the work. That’s how you notice when something’s off.”",
      href: "/community",
      source: "demo:community-reply",
    },
    ago(2),
  );
  add(
    {
      kind: "activity",
      category: "Achievement",
      title: "You earned the Sharp eye badge",
      body: "For spotting what had changed for Margaret in Neighbourhood Explorer.",
      href: "/explorer",
      source: "demo:badge",
    },
    ago(20),
  );
}
