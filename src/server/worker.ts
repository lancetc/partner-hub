import "server-only";
import { baseUrl, runDueCampaigns } from "./campaigns";
import { challengeEmailStillDue, queueChallengeEmails } from "./challenges";
import { runContentReminders } from "./contentReminders";
import { localDate, nextPermittedSlot, reminderAt, type ScheduleConfig } from "@/lib/schedule";
import { tx, type Db } from "./db";
import { activityInfo, pathVersion, scheduleFor, type EnrolmentRow, type InstanceRow } from "./learning";
import { adapterFor, type NotificationAdapter } from "./notify";
import type { User } from "./auth";

/*
  Background worker, run about every 15 minutes (see instrumentation.ts) and from the admin
  screen. Every step takes a transactional claim (BEGIN IMMEDIATE plus conditional updates
  and unique keys), so two workers running together cannot release a step twice or queue
  two digests for the same person and local day.
*/

/** Window for ordinary learning messages across all paths. */
export const MESSAGE_WINDOW: Omit<ScheduleConfig, "timezone" | "mode" | "unit" | "sendTime"> = {
  deliveryDays: "weekdays",
  window: { start: "09:00", end: "17:00" },
};

export type DigestItem = { instanceId: number; kind: "new" | "reminder"; started: boolean; title: string; message: string; optional: boolean };

export type WorkerResult = { released: number; digests: number; dispatched: number; outcomes: Record<string, number> };

const iso = (d: Date) => d.toISOString();

export function releaseDue(db: Db, now: Date) {
  return tx(db, () => {
    const due = db
      .prepare(
        `SELECT si.id, si.step_index, si.enrolment_id, e.path_id, e.path_version FROM step_instances si
         JOIN enrolments e ON e.id = si.enrolment_id
         JOIN path_versions pv ON pv.path_id = e.path_id AND pv.version = e.path_version
         WHERE si.released_at IS NULL AND si.cancelled_at IS NULL AND si.planned_release IS NOT NULL
           AND si.planned_release <= ? AND e.state = 'active' AND pv.paused = 0 AND pv.status != 'withdrawn'`,
      )
      .all(iso(now)) as { id: number; step_index: number; enrolment_id: number; path_id: string; path_version: number }[];
    let released = 0;
    for (const { id, step_index, enrolment_id, path_id, path_version } of due) {
      // Adaptive reinforcement: if an earlier first attempt in this path wasn't correct, release the support variant.
      const adaptive = pathVersion(db, path_id, path_version)?.steps[step_index]?.adaptive;
      if (adaptive) {
        const struggled = db
          .prepare(
            "SELECT COUNT(*) AS n FROM attempts a JOIN step_instances si ON si.id = a.step_instance_id WHERE si.enrolment_id = ? AND si.step_index < ? AND a.initial_correct = 0",
          )
          .get(enrolment_id, step_index) as { n: number };
        if (struggled.n > 0) {
          db.prepare("UPDATE step_instances SET follow_up_id = ?, follow_up_version = 0 WHERE id = ? AND released_at IS NULL").run(adaptive.ifStruggled, id);
        }
      }
      released += Number(db.prepare("UPDATE step_instances SET released_at = ? WHERE id = ? AND released_at IS NULL").run(iso(now), id).changes);
    }
    return released;
  });
}

function digestText(user: User, items: DigestItem[]) {
  const fresh = items.filter((i) => i.kind === "new");
  const waiting = items.filter((i) => i.kind === "reminder");
  const subject =
    items.length === 1
      ? `${items[0].kind === "new" ? "A quick follow up is ready" : "Your follow up is still there"}: ${items[0].title}`
      : `${items.length} short follow ups are ready for you`;
  const lines = [`Hi ${user.name.split(" ")[0]},`, ""];
  if (fresh.length) {
    lines.push("Ready when you have a minute:");
    fresh.forEach((i) => lines.push(`• ${i.title}: ${i.message}`));
    lines.push("");
  }
  if (waiting.length) {
    lines.push("Still there for you:");
    waiting.forEach((i) => lines.push(`• ${i.started ? "Continue" : "Start"} ${i.title}`));
    lines.push("");
  }
  lines.push("Open the Partner Hub and go to Learning to start. Practice items are optional unless marked required.");
  return { subject, body: lines.join("\n") };
}

/** Queues at most one ordinary learning digest per person per local day, covering new and unfinished items. */
export function queueDigests(db: Db, now: Date) {
  const users = db
    .prepare(
      `SELECT DISTINCT u.* FROM users u JOIN enrolments e ON e.user_id = u.id
       JOIN step_instances si ON si.enrolment_id = e.id
       WHERE e.state = 'active' AND si.released_at IS NOT NULL AND si.completed_at IS NULL AND si.cancelled_at IS NULL
         AND (si.notified_at IS NULL OR si.reminded_at IS NULL)`,
    )
    .all() as User[];
  let queued = 0;

  for (const user of users) {
    const rows = db
      .prepare(
        `SELECT si.*, e.timezone AS tz, e.path_id, e.path_version FROM step_instances si JOIN enrolments e ON e.id = si.enrolment_id
         JOIN path_versions pv ON pv.path_id = e.path_id AND pv.version = e.path_version
         WHERE e.user_id = ? AND e.state = 'active' AND pv.paused = 0 AND si.released_at IS NOT NULL
           AND si.completed_at IS NULL AND si.cancelled_at IS NULL`,
      )
      .all(user.id) as (InstanceRow & { tz: string; path_id: string; path_version: number })[];
    if (!rows.length) continue;

    const tz = rows[0].tz;
    const windowCfg: ScheduleConfig = { ...MESSAGE_WINDOW, timezone: tz, mode: "scheduled", unit: "calendar", sendTime: "09:30" };
    if (nextPermittedSlot(now, windowCfg).getTime() !== now.getTime()) continue; // outside the person's local window

    const items: DigestItem[] = [];
    for (const r of rows) {
      const pv = pathVersion(db, r.path_id, r.path_version)!;
      const step = pv.steps[r.step_index];
      const content = activityInfo(db, r.follow_up_id, r.follow_up_version);
      const base = {
        instanceId: r.id,
        started: Boolean(r.started_at),
        title: content?.title ?? "Follow up",
        message: step?.message ?? "",
        optional: !r.required,
      };
      if (!r.notified_at) items.push({ ...base, kind: "new" });
      else if (!r.reminded_at && pv.config.reminders.enabled && now >= reminderAt(new Date(r.released_at!), scheduleFor(pv.config, r.tz))) {
        items.push({ ...base, kind: "reminder" });
      }
    }
    if (!items.length) continue;

    const d = localDate(now, tz);
    const localDay = `${d.y}-${String(d.m).padStart(2, "0")}-${String(d.d).padStart(2, "0")}`;
    const { subject, body } = digestText(user, items);
    const created = tx(db, () => {
      const res = db
        .prepare(
          `INSERT OR IGNORE INTO outbox (user_id, kind, channel, local_date, idempotency_key, items, subject, body, status, created_at, updated_at)
           VALUES (?, 'digest', 'email', ?, ?, ?, ?, ?, 'queued', ?, ?)`,
        )
        .run(user.id, localDay, `digest:${user.id}:email:${localDay}`, JSON.stringify(items), subject, body, iso(now), iso(now));
      if (res.changes === 0) return false; // today's digest already exists; items wait for the next one
      for (const it of items) {
        const col = it.kind === "new" ? "notified_at" : "reminded_at";
        db.prepare(`UPDATE step_instances SET ${col} = COALESCE(${col}, ?) WHERE id = ?`).run(iso(now), it.instanceId);
      }
      return true;
    });
    if (created) queued++;
  }
  return queued;
}

/** Sends queued messages. Items finished or withdrawn since queuing are dropped first. */
export async function dispatch(db: Db, now: Date, adapters?: Partial<Record<"email" | "sms", NotificationAdapter>>) {
  const queued = db.prepare("SELECT * FROM outbox WHERE status = 'queued' ORDER BY id").all() as {
    id: number;
    user_id: string;
    kind: string;
    channel: "email" | "sms";
    idempotency_key: string;
    items: string;
    subject: string;
    body: string;
  }[];
  const outcomes: Record<string, number> = {};
  let dispatched = 0;
  for (const msg of queued) {
    const claimed = db
      .prepare("UPDATE outbox SET status = 'sending', attempts = attempts + 1, updated_at = ? WHERE id = ? AND status = 'queued'")
      .run(iso(now), msg.id);
    if (claimed.changes === 0) continue; // another worker has it

    // Challenge invitations and reminders are written when queued; a reminder is dropped once the mission's done.
    if (msg.kind.startsWith("challenge_")) {
      if (!challengeEmailStillDue(db, msg.user_id, msg.kind, msg.items, now)) {
        db.prepare("UPDATE outbox SET status = 'cancelled', last_error = 'The mission was finished before the reminder went', updated_at = ? WHERE id = ?").run(
          iso(now),
          msg.id,
        );
        outcomes.cancelled = (outcomes.cancelled ?? 0) + 1;
        continue;
      }
      const to = db.prepare("SELECT name, email FROM users WHERE id = ?").get(msg.user_id) as { name: string; email: string };
      const sent = await (adapters?.[msg.channel] ?? adapterFor(msg.channel)).send({
        idempotencyKey: msg.idempotency_key,
        to,
        subject: msg.subject,
        body: msg.body,
      });
      dispatched++;
      outcomes[sent.status] = (outcomes[sent.status] ?? 0) + 1;
      const tries = (db.prepare("SELECT attempts FROM outbox WHERE id = ?").get(msg.id) as { attempts: number }).attempts;
      db.prepare("UPDATE outbox SET status = ?, provider_ref = ?, last_error = ?, updated_at = ? WHERE id = ?").run(
        sent.status === "failed" ? (sent.retryable && tries < 3 ? "queued" : "failed") : sent.status,
        sent.status === "accepted" ? sent.providerRef : null,
        "error" in sent ? sent.error : null,
        iso(now),
        msg.id,
      );
      continue;
    }
    const items = (JSON.parse(msg.items) as DigestItem[]).filter((it) => {
      const s = db.prepare("SELECT completed_at, cancelled_at FROM step_instances WHERE id = ?").get(it.instanceId) as {
        completed_at: string | null;
        cancelled_at: string | null;
      };
      return !s.completed_at && !s.cancelled_at;
    });
    if (!items.length) {
      db.prepare("UPDATE outbox SET status = 'cancelled', last_error = 'Every item was finished or withdrawn before sending', updated_at = ? WHERE id = ?").run(
        iso(now),
        msg.id,
      );
      outcomes.cancelled = (outcomes.cancelled ?? 0) + 1;
      continue;
    }
    const user = db.prepare("SELECT * FROM users WHERE id = ?").get(msg.user_id) as User;
    const text = digestText(user, items);
    const adapter = adapters?.[msg.channel] ?? adapterFor(msg.channel);
    const result = await adapter.send({
      idempotencyKey: msg.idempotency_key,
      to: { name: user.name, email: user.email },
      subject: text.subject,
      body: text.body,
    });
    dispatched++;
    outcomes[result.status] = (outcomes[result.status] ?? 0) + 1;

    const attempts = (db.prepare("SELECT attempts FROM outbox WHERE id = ?").get(msg.id) as { attempts: number }).attempts;
    const status = result.status === "failed" ? (result.retryable && attempts < 3 ? "queued" : "failed") : result.status; // accepted | unknown | not_configured
    db.prepare("UPDATE outbox SET status = ?, provider_ref = ?, last_error = ?, items = ?, subject = ?, body = ?, updated_at = ? WHERE id = ?").run(
      status,
      result.status === "accepted" ? result.providerRef : null,
      "error" in result ? result.error : null,
      JSON.stringify(items),
      text.subject,
      text.body,
      iso(now),
      msg.id,
    );
  }
  return { dispatched, outcomes };
}

export async function runWorker(db: Db, now: Date, adapters?: Partial<Record<"email" | "sms", NotificationAdapter>>): Promise<WorkerResult> {
  const released = releaseDue(db, now);
  const digests = queueDigests(db, now);
  // Each day's challenge invitation, and an afternoon reminder.
  queueChallengeEmails(db, now, baseUrl());
  const { dispatched, outcomes } = await dispatch(db, now, adapters);
  // Newsletters scheduled for now or earlier go out too.
  await runDueCampaigns(db, now, adapters?.email);
  // Content due for checking: remind learning authors.
  await runContentReminders(db, now, adapters?.email);
  db.prepare("INSERT INTO worker_runs (started_at, clock, released, digests, dispatched, note) VALUES (?, ?, ?, ?, ?, ?)").run(
    new Date().toISOString(),
    iso(now),
    released,
    digests,
    dispatched,
    JSON.stringify(outcomes),
  );
  return { released, digests, dispatched, outcomes };
}

export type { EnrolmentRow };
