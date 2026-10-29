import "server-only";
import type { Db } from "./db";
import { audit } from "./db";
import { HttpError, requireAuthor, type User } from "./auth";
import { lessons } from "@/content/lessons";
import { factsUsed, validFactKey } from "@/lib/facts";
import { unpublishedLessons } from "./authoredLessons";

/*
  The facts library: rates, dates and numbers used in lesson text as {{key}}. Each has a source, an
  owner and a date to check it by. Changing a value changes it in every lesson at once.
*/

type Row = {
  key: string;
  label: string;
  value: string;
  notes: string;
  source_title: string | null;
  source_url: string | null;
  owner: string;
  check_by: string | null;
  updated_at: string;
  updated_by: string;
};
export type FactInput = {
  key: string;
  label: string;
  value: string;
  notes?: string;
  sourceTitle?: string;
  sourceUrl?: string;
  owner?: string;
  checkBy?: string | null;
};

const view = (r: Row) => ({
  key: r.key,
  label: r.label,
  value: r.value,
  notes: r.notes,
  source: r.source_url ? { title: r.source_title || r.source_url, url: r.source_url } : null,
  owner: r.owner,
  checkBy: r.check_by,
  updatedAt: r.updated_at,
  updatedBy: r.updated_by,
});
export type Fact = ReturnType<typeof view>;

/** Current values, for filling in lesson text. */
export function factValues(db: Db): Record<string, string> {
  return Object.fromEntries((db.prepare("SELECT key, value FROM facts").all() as { key: string; value: string }[]).map((r) => [r.key, r.value]));
}

/** Lessons (live, and drafts not yet published) that use each fact. */
export function factUsage(db: Db) {
  const all = [...lessons.filter((l) => l.track !== "reinforcement"), ...unpublishedLessons(db)];
  const usage: Record<string, { slug: string; title: string }[]> = {};
  for (const l of all) for (const key of factsUsed(l)) (usage[key] ??= []).push({ slug: l.slug, title: l.title });
  return usage;
}

export function listFacts(db: Db, actor: User) {
  requireAuthor(actor);
  const usage = factUsage(db);
  return (db.prepare("SELECT * FROM facts ORDER BY label").all() as Row[]).map((r) => ({ ...view(r), usedIn: usage[r.key] ?? [] }));
}

export function allFacts(db: Db) {
  return (db.prepare("SELECT * FROM facts ORDER BY label").all() as Row[]).map(view);
}

export function saveFact(db: Db, actor: User, input: FactInput, now: Date) {
  requireAuthor(actor);
  const key = (input.key ?? "").trim();
  if (!validFactKey(key)) throw new HttpError(400, "Use a short name of lowercase letters, numbers and underscores, starting with a letter, e.g. hourly_rate.");
  const label = (input.label ?? "").trim().slice(0, 120);
  const value = (input.value ?? "").trim().slice(0, 300);
  if (!label) throw new HttpError(400, "Give the fact a name people will recognise.");
  if (!value) throw new HttpError(400, "Add the fact’s value.");
  if (input.checkBy && !/^\d{4}-\d{2}-\d{2}$/.test(input.checkBy)) throw new HttpError(400, "Check-by dates look like 2027-03-31.");
  const url = (input.sourceUrl ?? "").trim();
  if (url && !/^https:\/\//.test(url)) throw new HttpError(400, "Source links start with https://.");
  const previous = db.prepare("SELECT value FROM facts WHERE key = ?").get(key) as { value: string } | undefined;
  db.prepare(
    `INSERT INTO facts (key, label, value, notes, source_title, source_url, owner, check_by, updated_at, updated_by) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
     ON CONFLICT(key) DO UPDATE SET label = excluded.label, value = excluded.value, notes = excluded.notes, source_title = excluded.source_title,
       source_url = excluded.source_url, owner = excluded.owner, check_by = excluded.check_by, updated_at = excluded.updated_at, updated_by = excluded.updated_by`,
  ).run(
    key,
    label,
    value,
    (input.notes ?? "").trim().slice(0, 600),
    (input.sourceTitle ?? "").trim() || null,
    url || null,
    (input.owner ?? "").trim().slice(0, 120),
    input.checkBy || null,
    now.toISOString(),
    actor.id,
  );
  audit(db, { actor: actor.id, event: previous ? "fact.updated" : "fact.created", entity: `fact:${key}`, previous: previous?.value, next: value, at: now });
  return { key, usedIn: factUsage(db)[key] ?? [] };
}

export function deleteFact(db: Db, actor: User, key: string, now: Date) {
  requireAuthor(actor);
  const used = factUsage(db)[key] ?? [];
  if (used.length) throw new HttpError(409, `It’s used in ${used.map((l) => `“${l.title}”`).join(", ")}. Take it out of those topics first.`);
  db.prepare("DELETE FROM facts WHERE key = ?").run(key);
  audit(db, { actor: actor.id, event: "fact.deleted", entity: `fact:${key}`, at: now });
}
