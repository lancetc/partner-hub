import "server-only";
import type { Db } from "./db";
import { baseUrl } from "./campaigns";
import { adapterFor, type NotificationAdapter } from "./notify";
import { datedItems, type ReviewItem } from "./contentReview";

/*
  Reminders to learning authors: a digest email when content is due for checking within 14 days,
  and again once it's overdue. Each item is reminded once per stage; changing its date starts again.
*/

const SOON_DAYS = 14;

const stageOf = (i: ReviewItem) => (i.days < 0 ? "overdue" : i.days <= SOON_DAYS ? "soon" : null);
const keyOf = (i: ReviewItem) => `${i.key}@${i.due}`;

function linkFor(i: ReviewItem) {
  if (i.kind === "fact") return `${baseUrl()}/admin/facts#${i.factKey}`;
  return `${baseUrl()}/admin/lessons/${i.slug}/edit${i.cardId ? `?card=${i.cardId}` : ""}`;
}

export function digestText(items: ReviewItem[]) {
  const line = (i: ReviewItem) =>
    `- ${i.kind === "card" ? `${i.context}: ${i.title}` : i.title} (${i.days < 0 ? `overdue since ${i.due}` : `due ${i.due}`})${i.note ? `. ${i.note}` : ""}\n  ${linkFor(i)}`;
  return `Some Partner Hub content needs checking so it stays accurate:\n\n${items.map(line).join("\n")}\n\nSee everything in Admin > Content review: ${baseUrl()}/admin/content-review`;
}

export async function runContentReminders(db: Db, now: Date, adapter: NotificationAdapter = adapterFor("email")) {
  const due = datedItems(db, now).filter((i) => {
    const stage = stageOf(i);
    return stage && !db.prepare("SELECT 1 FROM content_reminders WHERE item_key = ? AND stage = ?").get(keyOf(i), stage);
  });
  if (!due.length) return { sent: 0, items: 0 };
  const authors = db.prepare("SELECT id, name, email FROM users WHERE role = 'author'").all() as { id: string; name: string; email: string }[];
  const day = now.toISOString().slice(0, 10);
  let sent = 0;
  let retryLater = false;
  for (const a of authors) {
    const r = await adapter.send({
      idempotencyKey: `content-reminder:${a.id}:${day}`,
      to: { name: a.name, email: a.email },
      subject: `${due.length} ${due.length === 1 ? "item needs" : "items need"} checking in the Partner Hub`,
      body: digestText(due),
    });
    if (r.status === "failed" && r.retryable) retryLater = true;
    else sent++;
  }
  // Mark them reminded (unless the provider asked us to try again).
  if (!retryLater)
    for (const i of due)
      db.prepare("INSERT OR IGNORE INTO content_reminders (item_key, stage, sent_at) VALUES (?, ?, ?)").run(keyOf(i), stageOf(i), now.toISOString());
  return { sent, items: due.length };
}
