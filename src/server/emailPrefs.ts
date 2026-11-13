import "server-only";
import { randomUUID } from "node:crypto";
import { EMAIL_TOPICS, isEmailTopic, topicLabel, type EmailTopic, type TopicSetting } from "@/lib/emailTopics";
import { audit, type Db } from "./db";
import { HttpError } from "./auth";

/*
  Email preferences: which topics each person gets (lib/emailTopics). People change them in Profile and
  settings, or from the link at the bottom of any email, which works without signing in. The older
  newsletters setting (email_prefs.newsletters) is the "newsletters" topic, and is kept in step.
*/

type Via = "settings" | "link" | "one-click";

/** Each person's private link code, created the first time it's needed. */
export function tokenFor(db: Db, userId: string) {
  let p = db.prepare("SELECT token FROM email_prefs WHERE user_id = ?").get(userId) as { token: string } | undefined;
  if (!p) {
    db.prepare("INSERT OR IGNORE INTO email_prefs (user_id, token) VALUES (?, ?)").run(userId, randomUUID());
    p = db.prepare("SELECT token FROM email_prefs WHERE user_id = ?").get(userId) as { token: string };
  }
  return p.token;
}

/** Who a link code belongs to. */
export function userForToken(db: Db, token: string) {
  const p = token ? (db.prepare("SELECT user_id FROM email_prefs WHERE token = ?").get(token) as { user_id: string } | undefined) : undefined;
  if (!p) throw new HttpError(404, "That link isn’t valid any more. Sign in to change your email settings.");
  return p.user_id;
}

/** Every topic, on or off for this person (their choice, else the topic's default). */
export function emailSettings(db: Db, userId: string): TopicSetting[] {
  const rows = db.prepare("SELECT topic, subscribed FROM email_topic_prefs WHERE user_id = ?").all(userId) as { topic: string; subscribed: number }[];
  const chosen = new Map(rows.map((r) => [r.topic, r.subscribed === 1]));
  const legacy = db.prepare("SELECT newsletters FROM email_prefs WHERE user_id = ?").get(userId) as { newsletters: number } | undefined;
  return EMAIL_TOPICS.map((t) => ({
    id: t.id,
    label: t.label,
    description: t.description,
    on: chosen.get(t.id) ?? (t.id === "newsletters" && legacy ? legacy.newsletters === 1 : t.default),
  }));
}

export const wants = (db: Db, userId: string, topic: EmailTopic) => emailSettings(db, userId).find((s) => s.id === topic)!.on;

/** Switch one topic on or off. */
export function setTopic(db: Db, userId: string, topic: unknown, on: boolean, now: Date, via: Via) {
  if (!isEmailTopic(topic)) throw new HttpError(400, "Choose one of the email topics listed.");
  const at = now.toISOString();
  db.prepare(
    `INSERT INTO email_topic_prefs (user_id, topic, subscribed, changed_at, via) VALUES (?, ?, ?, ?, ?)
     ON CONFLICT (user_id, topic) DO UPDATE SET subscribed = excluded.subscribed, changed_at = excluded.changed_at, via = excluded.via`,
  ).run(userId, topic, on ? 1 : 0, at, via);
  if (topic === "newsletters") {
    tokenFor(db, userId);
    db.prepare("UPDATE email_prefs SET newsletters = ?, changed_at = ? WHERE user_id = ?").run(on ? 1 : 0, at, userId);
  }
  audit(db, { actor: userId, event: on ? "email.subscribed" : "email.unsubscribed", entity: `user:${userId}`, next: { topic, via }, at: now });
  return emailSettings(db, userId);
}

/** Every optional topic off (or back on) at once. Essential emails still come. */
export function setAllTopics(db: Db, userId: string, on: boolean, now: Date, via: Via) {
  for (const t of EMAIL_TOPICS) setTopic(db, userId, t.id, on, now, via);
  return emailSettings(db, userId);
}

/** From a link in an email: what this person gets, and their name (first name only) to greet them. */
export function settingsForToken(db: Db, token: string) {
  const userId = userForToken(db, token);
  const name = (db.prepare("SELECT name FROM users WHERE id = ?").get(userId) as { name: string } | undefined)?.name ?? "";
  return { firstName: name.split(" ")[0], topics: emailSettings(db, userId) };
}

/** People subscribed to a topic, for counting and sending. */
export function subscribedTo(db: Db, userIds: string[], topic: EmailTopic) {
  return userIds.filter((id) => wants(db, id, topic));
}

export { topicLabel };
