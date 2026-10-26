import "server-only";
import { randomUUID } from "node:crypto";
import { lessons } from "@/content/lessons";
import { stories } from "@/content/stories";
import type { Db } from "./db";
import { audit } from "./db";
import { HttpError, requireAuthor, type User } from "./auth";
import { adapterFor, type NotificationAdapter } from "./notify";
import { renderEmail, type Block, type WebinarCard } from "@/lib/emailTemplate";

/*
  Email campaigns (EDM): a monthly update and a quarterly newsletter to service partners and
  coordinators. Built from blocks, previewed, then scheduled or sent. Each person gets one copy,
  everyone can unsubscribe in one click, and unsubscribed people are always skipped.
*/

export type Kind = "monthly" | "quarterly" | "one_off";
export type Group = "partner" | "coordinator";
type Row = {
  id: string;
  kind: Kind;
  name: string;
  subject: string;
  preheader: string;
  blocks: string;
  audience: string;
  status: "draft" | "scheduled" | "sending" | "sent" | "cancelled";
  send_at: string | null;
  sent_at: string | null;
  created_by: string;
  created_at: string;
  updated_at: string;
};
export type CampaignInput = { name: string; subject: string; preheader: string; blocks: Block[]; audience: Group[] };

export const baseUrl = () => (process.env.HUB_PUBLIC_URL ?? "http://localhost:3000").replace(/\/$/, "");
const KIND_LABEL: Record<Kind, string> = { monthly: "Monthly update", quarterly: "Quarterly newsletter", one_off: "Email" };

const parse = (r: Row) => ({ ...r, blocks: JSON.parse(r.blocks) as Block[], audience: JSON.parse(r.audience) as Group[] });

function getRow(db: Db, id: string) {
  const r = db.prepare("SELECT * FROM campaigns WHERE id = ?").get(id) as Row | undefined;
  if (!r) throw new HttpError(404, "Campaign not found.");
  return parse(r);
}

/** First Tuesday of a month, 9am Brisbane (23:00 UTC the day before). */
function firstTuesday(y: number, m: number) {
  const d = new Date(Date.UTC(y, m, 1));
  const offset = (2 - d.getUTCDay() + 7) % 7;
  return new Date(Date.UTC(y, m, 1 + offset) - 3600_000);
}

/** When each kind is next due: monthly on the first Tuesday, quarterly in January, April, July and October. */
export function nextDue(kind: "monthly" | "quarterly", from: Date) {
  for (let i = 0; i < 15; i++) {
    const y = from.getUTCFullYear() + Math.floor((from.getUTCMonth() + i) / 12);
    const m = (from.getUTCMonth() + i) % 12;
    if (kind === "quarterly" && m % 3 !== 0) continue;
    const at = firstTuesday(y, m);
    if (at > from) return at;
  }
  return null;
}

/** Each person's unsubscribe token, created the first time it's needed. */
export function prefsFor(db: Db, userId: string) {
  let p = db.prepare("SELECT * FROM email_prefs WHERE user_id = ?").get(userId) as { token: string; newsletters: number } | undefined;
  if (!p) {
    db.prepare("INSERT OR IGNORE INTO email_prefs (user_id, token) VALUES (?, ?)").run(userId, randomUUID());
    p = db.prepare("SELECT * FROM email_prefs WHERE user_id = ?").get(userId) as { token: string; newsletters: number };
  }
  return p;
}

/** Partners and coordinators in the chosen groups who haven't unsubscribed. Trilogy staff aren't sent marketing. */
export function recipients(db: Db, audience: Group[]) {
  if (!audience.length) return [];
  return db
    .prepare(
      `SELECT u.* FROM users u LEFT JOIN email_prefs p ON p.user_id = u.id
       WHERE u.audience IN (${audience.map(() => "?").join(",")}) AND COALESCE(p.newsletters, 1) = 1 ORDER BY u.name`,
    )
    .all(...audience) as User[];
}

export function webinarCards(db: Db) {
  const rows = db.prepare("SELECT id, title, summary, presenter, minutes, thumbnail FROM webinars WHERE status = 'published'").all() as WebinarCard[];
  return new Map(rows.map((w) => [w.id, w]));
}

function renderFor(db: Db, c: ReturnType<typeof parse>, user: User) {
  const token = prefsFor(db, user.id).token;
  const unsubscribeUrl = `${baseUrl()}/unsubscribe?t=${token}`;
  return { ...renderEmail(c, { firstName: user.name.split(" ")[0], baseUrl: baseUrl(), unsubscribeUrl, webinars: webinarCards(db) }), unsubscribeUrl };
}

/** A new campaign from its template, filled with the latest stories, lessons and webinars. */
export function createCampaign(db: Db, actor: User, kind: Kind, now: Date) {
  requireAuthor(actor);
  const due = kind === "one_off" ? null : nextDue(kind, now);
  const when = due ?? now;
  const month = when.toLocaleDateString("en-AU", { month: "long", year: "numeric", timeZone: "Australia/Brisbane" });
  const quarter = `Q${Math.floor(when.getUTCMonth() / 3) + 1} ${when.getUTCFullYear()}`;
  const latest = [...stories].sort((a, b) => b.date.localeCompare(a.date));
  const course = lessons.filter((l) => l.track !== "reinforcement");
  const webinars = [...webinarCards(db).values()];
  let n = 0;
  const id = () => `b${++n}`;
  const blocks: Block[] =
    kind === "quarterly"
      ? [
          { id: id(), type: "heading", text: `Your ${quarter} newsletter` },
          { id: id(), type: "text", text: "Hi {{first_name}},\n\nHere’s what changed this quarter, what’s coming next, and the learning that will help most." },
          ...latest.slice(0, 3).map((s): Block => ({ id: id(), type: "story", slug: s.slug })),
          { id: id(), type: "divider" },
          { id: id(), type: "heading", text: "Learning this quarter" },
          ...course.slice(0, 2).map((l): Block => ({ id: id(), type: "lesson", slug: l.slug })),
          ...webinars.slice(0, 2).map((w): Block => ({ id: id(), type: "webinar", webinarId: w.id })),
          { id: id(), type: "button", label: "Open the Partner Hub", url: "/" },
        ]
      : [
          { id: id(), type: "heading", text: kind === "monthly" ? `Your ${month} update` : "News from Trilogy Care" },
          { id: id(), type: "text", text: "Hi {{first_name}},\n\nA quick round-up of what’s new for partners and coordinators this month." },
          ...latest.slice(0, 2).map((s): Block => ({ id: id(), type: "story", slug: s.slug })),
          ...course.slice(0, 1).map((l): Block => ({ id: id(), type: "lesson", slug: l.slug })),
          ...webinars.slice(0, 1).map((w): Block => ({ id: id(), type: "webinar", webinarId: w.id })),
          { id: id(), type: "button", label: "Open the Partner Hub", url: "/" },
        ];
  const cid = `c-${kind}-${now.getTime().toString(36)}`;
  const at = now.toISOString();
  db.prepare(
    "INSERT INTO campaigns (id, kind, name, subject, preheader, blocks, audience, status, send_at, created_by, created_at, updated_at) VALUES (?, ?, ?, ?, ?, ?, ?, 'draft', ?, ?, ?, ?)",
  ).run(
    cid,
    kind,
    kind === "quarterly" ? `Quarterly newsletter · ${quarter}` : kind === "monthly" ? `Monthly update · ${month}` : "New email",
    kind === "quarterly" ? `Your ${quarter} newsletter from Trilogy Care` : kind === "monthly" ? `What’s new this ${month.split(" ")[0]}` : "News from Trilogy Care",
    kind === "quarterly" ? "Changes, what’s coming and learning for the quarter ahead." : "A quick round-up for partners and coordinators.",
    JSON.stringify(blocks),
    JSON.stringify(["partner", "coordinator"]),
    due?.toISOString() ?? null,
    actor.id,
    at,
    at,
  );
  audit(db, { actor: actor.id, event: "campaign.created", entity: `campaign:${cid}`, next: { kind }, at: now });
  return { id: cid };
}

function stats(db: Db, id: string) {
  const rows = db.prepare("SELECT status, COUNT(*) AS n FROM campaign_deliveries WHERE campaign_id = ? GROUP BY status").all(id) as { status: string; n: number }[];
  return Object.fromEntries(rows.map((r) => [r.status, r.n])) as Record<string, number>;
}

export function listCampaigns(db: Db, actor: User, now: Date) {
  requireAuthor(actor);
  const rows = (db.prepare("SELECT * FROM campaigns WHERE status != 'cancelled' OR updated_at > ? ORDER BY COALESCE(send_at, created_at) DESC").all(new Date(now.getTime() - 30 * 86400000).toISOString()) as Row[]).map(parse);
  const plan = (["monthly", "quarterly"] as const).map((kind) => {
    const due = nextDue(kind, now)!;
    const planned = rows.find((r) => r.kind === kind && r.send_at && Math.abs(new Date(r.send_at).getTime() - due.getTime()) < 20 * 86400000 && r.status !== "cancelled");
    return { kind, label: KIND_LABEL[kind], due: due.toISOString(), campaignId: planned?.id ?? null, status: planned?.status ?? null };
  });
  return {
    plan,
    campaigns: rows.map((r) => ({
      id: r.id,
      kind: r.kind,
      kindLabel: KIND_LABEL[r.kind],
      name: r.name,
      subject: r.subject,
      status: r.status,
      sendAt: r.send_at,
      sentAt: r.sent_at,
      audience: r.audience,
      recipients: recipients(db, r.audience).length,
      stats: stats(db, r.id),
    })),
    unsubscribed: (db.prepare("SELECT COUNT(*) AS n FROM email_prefs WHERE newsletters = 0").get() as { n: number }).n,
    provider: adapterFor("email").configured,
  };
}

export function campaignDetail(db: Db, actor: User, id: string) {
  requireAuthor(actor);
  const c = getRow(db, id);
  return {
    ...c,
    kindLabel: KIND_LABEL[c.kind],
    recipients: recipients(db, c.audience).length,
    stats: stats(db, id),
    catalogue: {
      stories: [...stories].sort((a, b) => b.date.localeCompare(a.date)).map((s) => ({ slug: s.slug, title: s.title })),
      lessons: lessons.filter((l) => l.track !== "reinforcement").map((l) => ({ slug: l.slug, title: l.title })),
      webinars: [...webinarCards(db).values()].map((w) => ({ id: w.id, title: w.title })),
    },
    provider: adapterFor("email").configured,
  };
}

const editable = (c: { status: string }) => {
  if (c.status === "sent" || c.status === "sending") throw new HttpError(409, "This campaign has already gone out.");
};

export function updateCampaign(db: Db, actor: User, id: string, input: CampaignInput, now: Date) {
  requireAuthor(actor);
  editable(getRow(db, id));
  if (!input.subject?.trim()) throw new HttpError(400, "Add a subject line.");
  if (!Array.isArray(input.blocks) || !input.blocks.length) throw new HttpError(400, "Add some content.");
  const audience = (input.audience ?? []).filter((g) => g === "partner" || g === "coordinator");
  db.prepare("UPDATE campaigns SET name = ?, subject = ?, preheader = ?, blocks = ?, audience = ?, updated_at = ? WHERE id = ?").run(
    (input.name ?? "").trim().slice(0, 120) || "Untitled email",
    input.subject.trim().slice(0, 150),
    (input.preheader ?? "").trim().slice(0, 200),
    JSON.stringify(input.blocks),
    JSON.stringify(audience),
    now.toISOString(),
    id,
  );
}

export function previewHtml(db: Db, actor: User, id: string) {
  requireAuthor(actor);
  return renderFor(db, getRow(db, id), actor).html;
}

/** Sends one person a copy. Returns the provider's answer; unsubscribed people are never sent to. */
async function deliver(db: Db, c: ReturnType<typeof parse>, user: User, now: Date, adapter: NotificationAdapter, test = false) {
  const { html, text, unsubscribeUrl } = renderFor(db, c, user);
  const result = await adapter.send({
    idempotencyKey: test ? `campaign-test:${c.id}:${user.id}:${now.getTime()}` : `campaign:${c.id}:${user.id}`,
    to: { name: user.name, email: user.email },
    subject: test ? `[Test] ${c.subject}` : c.subject,
    body: text,
    html,
    headers: { "List-Unsubscribe": `<${unsubscribeUrl}>`, "List-Unsubscribe-Post": "List-Unsubscribe=One-Click" },
  });
  return result;
}

export async function sendTest(db: Db, actor: User, id: string, now: Date, adapter = adapterFor("email")) {
  requireAuthor(actor);
  const result = await deliver(db, getRow(db, id), actor, now, adapter, true);
  audit(db, { actor: actor.id, event: "campaign.test", entity: `campaign:${id}`, next: { status: result.status }, at: now });
  return { status: result.status, to: actor.email, error: "error" in result ? result.error : null };
}

export function scheduleCampaign(db: Db, actor: User, id: string, sendAt: string, now: Date) {
  requireAuthor(actor);
  const c = getRow(db, id);
  editable(c);
  const at = new Date(sendAt);
  if (Number.isNaN(at.getTime())) throw new HttpError(400, "Choose a date and time.");
  if (at <= now) throw new HttpError(400, "Choose a time in the future, or send it now.");
  if (!c.audience.length) throw new HttpError(400, "Choose who it’s for.");
  db.prepare("UPDATE campaigns SET status = 'scheduled', send_at = ?, updated_at = ? WHERE id = ?").run(at.toISOString(), now.toISOString(), id);
  audit(db, { actor: actor.id, event: "campaign.scheduled", entity: `campaign:${id}`, next: { sendAt: at.toISOString() }, at: now });
}

export function unscheduleCampaign(db: Db, actor: User, id: string, now: Date) {
  requireAuthor(actor);
  const c = getRow(db, id);
  editable(c);
  db.prepare("UPDATE campaigns SET status = 'draft', updated_at = ? WHERE id = ?").run(now.toISOString(), id);
  audit(db, { actor: actor.id, event: "campaign.unscheduled", entity: `campaign:${id}`, at: now });
}

export function deleteCampaign(db: Db, actor: User, id: string, now: Date) {
  requireAuthor(actor);
  const c = getRow(db, id);
  if (c.status !== "draft") throw new HttpError(409, "Only drafts can be deleted. Unschedule it first.");
  db.prepare("DELETE FROM campaigns WHERE id = ?").run(id);
  audit(db, { actor: actor.id, event: "campaign.deleted", entity: `campaign:${id}`, at: now });
}

/** Sends to everyone in the audience who hasn't had it yet. Safe to run again: each person gets one copy. */
export async function sendCampaign(db: Db, id: string, now: Date, adapter = adapterFor("email"), actor?: User) {
  if (actor) requireAuthor(actor);
  const c = getRow(db, id);
  if (c.status === "sent") throw new HttpError(409, "This campaign has already gone out.");
  if (!c.audience.length) throw new HttpError(400, "Choose who it’s for.");
  db.prepare("UPDATE campaigns SET status = 'sending', updated_at = ? WHERE id = ?").run(now.toISOString(), id);
  const done = new Set((db.prepare("SELECT user_id FROM campaign_deliveries WHERE campaign_id = ? AND status IN ('accepted','delivered','not_configured')").all(id) as { user_id: string }[]).map((r) => r.user_id));
  let sent = 0;
  for (const user of recipients(db, c.audience)) {
    if (done.has(user.id)) continue;
    const result = await deliver(db, c, user, now, adapter);
    db.prepare(
      `INSERT INTO campaign_deliveries VALUES (?, ?, ?, ?, ?, ?)
       ON CONFLICT(campaign_id, user_id) DO UPDATE SET status = excluded.status, provider_ref = excluded.provider_ref, error = excluded.error, at = excluded.at`,
    ).run(id, user.id, result.status, result.status === "accepted" ? result.providerRef : null, "error" in result ? result.error : null, now.toISOString());
    sent++;
  }
  db.prepare("UPDATE campaigns SET status = 'sent', sent_at = ?, updated_at = ? WHERE id = ?").run(now.toISOString(), now.toISOString(), id);
  audit(db, { actor: actor?.id ?? "worker", event: "campaign.sent", entity: `campaign:${id}`, next: { sent, ...stats(db, id) }, at: now });
  return { sent, stats: stats(db, id) };
}

/** The worker sends scheduled campaigns once their time comes. */
export async function runDueCampaigns(db: Db, now: Date, adapter?: NotificationAdapter) {
  const due = db.prepare("SELECT id FROM campaigns WHERE status = 'scheduled' AND send_at <= ?").all(now.toISOString()) as { id: string }[];
  let sent = 0;
  for (const c of due) sent += (await sendCampaign(db, c.id, now, adapter ?? adapterFor("email"))).sent;
  return sent;
}

export function setNewsletters(db: Db, token: string, on: boolean, now: Date) {
  const p = db.prepare("SELECT user_id FROM email_prefs WHERE token = ?").get(token) as { user_id: string } | undefined;
  if (!p) throw new HttpError(404, "That link isn’t valid any more. Sign in to change your email settings.");
  db.prepare("UPDATE email_prefs SET newsletters = ?, changed_at = ? WHERE token = ?").run(on ? 1 : 0, now.toISOString(), token);
  audit(db, { actor: p.user_id, event: on ? "newsletters.resubscribed" : "newsletters.unsubscribed", entity: `user:${p.user_id}`, at: now });
  return { newsletters: on };
}
