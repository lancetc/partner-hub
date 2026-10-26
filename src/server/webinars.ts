import "server-only";
import type { Db } from "./db";
import { audit } from "./db";
import { HttpError, requireAuthor, type User } from "./auth";

/*
  Recorded webinars. Authors add the recording (YouTube, Synthesia or an uploaded file), a summary,
  topics, resources and a transcript, then publish. Learners see published webinars for their
  audience and can mark one watched.
*/

export type WebinarVideo = { provider: "youtube" | "synthesia" | "upload"; id?: string; src?: string; orientation?: "landscape" | "portrait" };
export type WebinarInput = {
  title: string;
  summary: string;
  presenter: string;
  recordedOn: string;
  minutes: number;
  video: WebinarVideo;
  thumbnail: string | null;
  audience: ("partner" | "coordinator")[];
  topics: string[];
  transcript: string;
  resources: { title: string; url: string }[];
};
type Row = {
  id: string;
  title: string;
  summary: string;
  presenter: string;
  recorded_on: string;
  minutes: number;
  video: string;
  thumbnail: string | null;
  audience: string;
  topics: string;
  transcript: string;
  resources: string;
  status: "draft" | "published";
  created_by: string;
  updated_at: string;
};

const parse = (r: Row) => ({
  id: r.id,
  title: r.title,
  summary: r.summary,
  presenter: r.presenter,
  recordedOn: r.recorded_on,
  minutes: r.minutes,
  video: JSON.parse(r.video) as WebinarVideo,
  thumbnail: r.thumbnail,
  audience: JSON.parse(r.audience) as ("partner" | "coordinator")[],
  topics: JSON.parse(r.topics) as string[],
  transcript: r.transcript,
  resources: JSON.parse(r.resources) as { title: string; url: string }[],
  status: r.status,
  updatedAt: r.updated_at,
});
export type Webinar = ReturnType<typeof parse>;

function getRow(db: Db, id: string) {
  const r = db.prepare("SELECT * FROM webinars WHERE id = ?").get(id) as Row | undefined;
  if (!r) throw new HttpError(404, "Webinar not found.");
  return parse(r);
}

/** What learners can see: published, and meant for them (Trilogy staff see everything). */
const forLearner = (w: Webinar, user: User) => w.status === "published" && (user.audience === "staff" || w.audience.includes(user.audience as "partner" | "coordinator"));

export function learnerWebinars(db: Db, user: User) {
  const watched = new Set((db.prepare("SELECT webinar_id FROM webinar_views WHERE user_id = ?").all(user.id) as { webinar_id: string }[]).map((r) => r.webinar_id));
  return (db.prepare("SELECT * FROM webinars WHERE status = 'published' ORDER BY recorded_on DESC").all() as Row[])
    .map(parse)
    .filter((w) => forLearner(w, user))
    .map((w) => ({ ...w, transcript: undefined, watched: watched.has(w.id) }));
}

export function learnerWebinar(db: Db, user: User, id: string) {
  const w = getRow(db, id);
  if (!forLearner(w, user) && user.role !== "author") throw new HttpError(404, "Webinar not found.");
  const watched = Boolean(db.prepare("SELECT 1 FROM webinar_views WHERE webinar_id = ? AND user_id = ?").get(id, user.id));
  return { ...w, watched };
}

export function markWatched(db: Db, user: User, id: string, now: Date) {
  learnerWebinar(db, user, id);
  db.prepare("INSERT OR IGNORE INTO webinar_views VALUES (?, ?, ?)").run(id, user.id, now.toISOString());
  return { watched: true };
}

export function adminWebinars(db: Db, actor: User) {
  requireAuthor(actor);
  const views = new Map((db.prepare("SELECT webinar_id, COUNT(*) AS n FROM webinar_views GROUP BY webinar_id").all() as { webinar_id: string; n: number }[]).map((r) => [r.webinar_id, r.n]));
  return (db.prepare("SELECT * FROM webinars ORDER BY recorded_on DESC").all() as Row[]).map(parse).map((w) => ({ ...w, views: views.get(w.id) ?? 0 }));
}

export function adminWebinar(db: Db, actor: User, id: string) {
  requireAuthor(actor);
  return getRow(db, id);
}

function validate(input: WebinarInput) {
  const title = input.title?.trim();
  if (!title) throw new HttpError(400, "Give the webinar a title.");
  if (!/^\d{4}-\d{2}-\d{2}$/.test(input.recordedOn ?? "")) throw new HttpError(400, "Add the date it was recorded.");
  const v = input.video;
  const ok = v && ((v.provider === "youtube" && /^[A-Za-z0-9_-]{11}$/.test(v.id ?? "")) || (v.provider === "synthesia" && /^[0-9a-f-]{36}$/i.test(v.id ?? "")) || (v.provider === "upload" && /^\/api\/uploads\/[0-9a-f-]{36}\.(webm|mp4|mov)$/.test(v.src ?? "")));
  if (!ok) throw new HttpError(400, "Add the recording: a YouTube or Synthesia link, or an uploaded video.");
  const audience = (input.audience ?? []).filter((a) => a === "partner" || a === "coordinator");
  if (!audience.length) throw new HttpError(400, "Choose who it’s for.");
  return {
    title: title.slice(0, 160),
    summary: (input.summary ?? "").trim().slice(0, 600),
    presenter: (input.presenter ?? "").trim().slice(0, 120),
    recordedOn: input.recordedOn,
    minutes: Math.max(0, Math.min(600, Math.round(Number(input.minutes) || 0))),
    video: v,
    thumbnail: input.thumbnail || null,
    audience,
    topics: [...new Set((input.topics ?? []).map((t) => t.trim()).filter(Boolean))].slice(0, 8),
    transcript: (input.transcript ?? "").slice(0, 100_000),
    resources: (input.resources ?? []).filter((r) => r.title?.trim() && r.url?.trim()).slice(0, 10),
  };
}

export function saveWebinar(db: Db, actor: User, id: string | null, input: WebinarInput, now: Date) {
  requireAuthor(actor);
  const v = validate(input);
  const at = now.toISOString();
  let wid = id;
  if (wid) {
    getRow(db, wid);
    db.prepare(
      "UPDATE webinars SET title = ?, summary = ?, presenter = ?, recorded_on = ?, minutes = ?, video = ?, thumbnail = ?, audience = ?, topics = ?, transcript = ?, resources = ?, updated_at = ? WHERE id = ?",
    ).run(v.title, v.summary, v.presenter, v.recordedOn, v.minutes, JSON.stringify(v.video), v.thumbnail, JSON.stringify(v.audience), JSON.stringify(v.topics), v.transcript, JSON.stringify(v.resources), at, wid);
  } else {
    const base = v.title.toLowerCase().replace(/[^a-z0-9]+/g, "-").replace(/^-|-$/g, "").slice(0, 40) || "webinar";
    wid = `w-${base}`;
    for (let n = 2; db.prepare("SELECT 1 FROM webinars WHERE id = ?").get(wid); n++) wid = `w-${base}-${n}`;
    db.prepare(
      "INSERT INTO webinars (id, title, summary, presenter, recorded_on, minutes, video, thumbnail, audience, topics, transcript, resources, status, created_by, updated_at) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, 'draft', ?, ?)",
    ).run(wid, v.title, v.summary, v.presenter, v.recordedOn, v.minutes, JSON.stringify(v.video), v.thumbnail, JSON.stringify(v.audience), JSON.stringify(v.topics), v.transcript, JSON.stringify(v.resources), actor.id, at);
  }
  audit(db, { actor: actor.id, event: id ? "webinar.updated" : "webinar.created", entity: `webinar:${wid}`, at: now });
  return { id: wid };
}

export function publishWebinar(db: Db, actor: User, id: string, publish: boolean, now: Date) {
  requireAuthor(actor);
  getRow(db, id);
  db.prepare("UPDATE webinars SET status = ?, updated_at = ? WHERE id = ?").run(publish ? "published" : "draft", now.toISOString(), id);
  audit(db, { actor: actor.id, event: publish ? "webinar.published" : "webinar.unpublished", entity: `webinar:${id}`, at: now });
}

export function deleteWebinar(db: Db, actor: User, id: string, now: Date) {
  requireAuthor(actor);
  const w = getRow(db, id);
  if (w.status === "published") throw new HttpError(409, "Unpublish it first.");
  db.prepare("DELETE FROM webinar_views WHERE webinar_id = ?").run(id);
  db.prepare("DELETE FROM webinars WHERE id = ?").run(id);
  audit(db, { actor: actor.id, event: "webinar.deleted", entity: `webinar:${id}`, at: now });
}
