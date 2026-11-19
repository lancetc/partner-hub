import "server-only";
import { createHash, randomBytes, randomUUID } from "node:crypto";
import { HttpError, requireAuthor, canAuthor, type User } from "../auth";
import { tx, type Db } from "../db";
import { parseManifest, ManifestError, type Standard } from "./manifest";
import { unzip, UnzipError } from "./unzip";
import { storage } from "./storage";
import { outcomeAfter, RuntimeError, scormName, startingData, tracked, validateSave, type Flat, type Outcome } from "./runtime";
import { contentOriginFor, launchToken } from "./launchToken";

/*
  eLearning (SCORM), Phase 1: import a package, preview and publish it as a course, launch it for a
  learner, and keep what it reports. Completion comes only from what the package reports, never from
  opening or closing the player. See runtime.ts for the outcome rule.
*/

export const MAX_ZIP_BYTES = 500 * 1024 * 1024;

type CourseRow = {
  id: string;
  package_id: string;
  title: string;
  description: string;
  status: "draft" | "published" | "archived";
  version_id: string;
  poster: string | null;
  created_at: string;
  updated_at: string;
  published_at: string | null;
};
type VersionRow = {
  id: string;
  package_id: string;
  version: number;
  title: string;
  identifier: string;
  standard: Standard;
  edition: string;
  launch_href: string;
  file_count: number;
  bytes: number;
  zip_bytes: number;
  report: string;
  uploaded_by: string;
  uploaded_at: string;
};
export type AttemptRow = {
  id: number;
  course_id: string;
  version_id: string;
  user_id: string;
  number: number;
  preview: number;
  outcome: Outcome;
  completion_status: string | null;
  success_status: string | null;
  score_raw: number | null;
  score_min: number | null;
  score_max: number | null;
  score_scaled: number | null;
  location: string | null;
  total_seconds: number;
  launches: number;
  session: string | null;
  last_seq: number;
  started_at: string;
  last_activity_at: string | null;
  completed_at: string | null;
  passed_at: string | null;
  failed_at: string | null;
  ended_at: string | null;
};

const id = (prefix: string) => `${prefix}-${randomUUID().replace(/-/g, "").slice(0, 16)}`;

function event(db: Db, e: { actor: string; event: string; course?: string; version?: string; attempt?: number; detail?: unknown; at: Date }) {
  db.prepare("INSERT INTO scorm_audit_events (at, actor, event, course_id, version_id, attempt_id, detail) VALUES (?, ?, ?, ?, ?, ?, ?)").run(
    e.at.toISOString(),
    e.actor,
    e.event,
    e.course ?? null,
    e.version ?? null,
    e.attempt ?? null,
    JSON.stringify(e.detail ?? {}),
  );
}

const courseRow = (db: Db, courseId: string) => db.prepare("SELECT * FROM scorm_courses WHERE id = ?").get(courseId) as CourseRow | undefined;
const versionRow = (db: Db, versionId: string) => db.prepare("SELECT * FROM scorm_package_versions WHERE id = ?").get(versionId) as VersionRow | undefined;

// ---------------------------------------------------------------------------------------------
// Import
// ---------------------------------------------------------------------------------------------

/**
  Imports a SCORM ZIP as a new draft course. The ZIP is checked as it's unpacked (see unzip.ts), the
  manifest decides the standard and the launch file, and nothing is kept if any of that fails. The
  attempt is recorded either way, with the reason a package was refused.
*/
export async function importPackage(db: Db, actor: User, zip: Buffer, fileName: string, now: Date) {
  requireAuthor(actor);
  if (!zip.length) throw new HttpError(400, "Choose a SCORM ZIP to upload.");
  if (zip.length > MAX_ZIP_BYTES) throw new HttpError(413, `That file is over ${MAX_ZIP_BYTES / 1048576} MB.`);
  const versionId = id("v");
  const files = new Set<string>();
  try {
    if (zip.subarray(0, 4).toString("latin1") !== "PK\u0003\u0004") throw new UnzipError("That file isn’t a ZIP. Upload the SCORM ZIP that Articulate exported.");
    await unzip(zip, async (path, data) => {
      await storage.writeFile(versionId, path, data);
      files.add(path);
    });
    // The manifest belongs at the top of the ZIP. A course zipped again inside one folder is accepted too.
    let base = "";
    if (!files.has("imsmanifest.xml")) {
      const nested = [...files].filter((f) => /^[^/]+\/imsmanifest\.xml$/.test(f));
      if (nested.length === 1 && [...files].every((f) => f.startsWith(nested[0].split("/")[0] + "/"))) base = nested[0].split("/")[0] + "/";
      else throw new ManifestError("There’s no imsmanifest.xml at the top of the ZIP, so this isn’t a SCORM package. Upload the ZIP exactly as Articulate exported it.");
    }
    const xml = storage.readFile(versionId, base + "imsmanifest.xml")!.toString("utf8");
    const m = parseManifest(xml, (p) => files.has(base + p));
    const totalBytes = [...files].reduce((n, f) => n + (storage.readFile(versionId, f)?.length ?? 0), 0);
    await storage.saveZip(versionId, zip);
    const sha = createHash("sha256").update(zip).digest("hex");
    const packageId = id("pkg");
    const courseId = id("crs");
    const at = now.toISOString();
    tx(db, () => {
      db.prepare("INSERT INTO scorm_packages (id, identifier, standard, created_by, created_at) VALUES (?, ?, ?, ?, ?)").run(packageId, m.identifier, m.standard, actor.id, at);
      db.prepare(
        `INSERT INTO scorm_package_versions (id, package_id, version, title, identifier, standard, edition, launch_href, file_count, bytes, zip_bytes, zip_sha256, report, uploaded_by, uploaded_at)
         VALUES (?, ?, 1, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`,
      ).run(
        versionId,
        packageId,
        m.title,
        m.identifier,
        m.standard,
        m.edition,
        base + m.launchHref + (m.launchQuery ? `?${m.launchQuery}` : ""),
        files.size,
        totalBytes,
        zip.length,
        sha,
        JSON.stringify({ fileName: fileName.slice(0, 200), warnings: m.warnings, items: m.items.slice(0, 200), version: m.version }),
        actor.id,
        at,
      );
      db.prepare(
        "INSERT INTO scorm_courses (id, package_id, title, description, status, version_id, created_by, created_at, updated_by, updated_at) VALUES (?, ?, ?, '', 'draft', ?, ?, ?, ?, ?)",
      ).run(courseId, packageId, m.title, versionId, actor.id, at, actor.id, at);
      event(db, { actor: actor.id, event: "package.imported", course: courseId, version: versionId, detail: { fileName, standard: m.standard, edition: m.edition, warnings: m.warnings }, at: now });
    });
    return { courseId, title: m.title, standard: m.standard, edition: m.edition, warnings: m.warnings };
  } catch (e) {
    await storage.remove(versionId);
    const reason = e instanceof UnzipError || e instanceof ManifestError ? e.message : null;
    event(db, { actor: actor.id, event: "package.rejected", detail: { fileName, reason: reason ?? "Unexpected error" }, at: now });
    if (reason) throw new HttpError(422, reason);
    throw e;
  }
}

// ---------------------------------------------------------------------------------------------
// Courses
// ---------------------------------------------------------------------------------------------

const courseView = (db: Db, c: CourseRow) => {
  const v = versionRow(db, c.version_id)!;
  const report = JSON.parse(v.report || "{}") as { warnings?: string[]; fileName?: string };
  return {
    id: c.id,
    title: c.title,
    description: c.description,
    /** The poster picture on the course's tile; null shows the plain cover. */
    poster: c.poster ?? null,
    status: c.status,
    standard: v.standard,
    edition: v.edition,
    version: v.version,
    launchHref: v.launch_href,
    files: v.file_count,
    bytes: v.bytes,
    fileName: report.fileName ?? null,
    warnings: report.warnings ?? [],
    uploadedAt: v.uploaded_at,
    publishedAt: c.published_at,
    /** Learner attempts (not authors' previews): with any, deleting keeps their records. */
    learnerAttempts: (db.prepare("SELECT COUNT(*) AS n FROM scorm_attempts WHERE course_id = ? AND preview = 0").get(c.id) as { n: number }).n,
  };
};

/**
  Deletes a course. With no learner attempts (previews don't count), it's removed for good: the course,
  its versions, preview attempts and the package files. Once learners have tried it, their attempts are
  training records, so the course is removed from eLearning for everyone but those records (and the
  package they were made on) are kept. Either way the deletion is in the audit trail.
*/
export async function deleteCourse(db: Db, actor: User, courseId: string, now: Date) {
  requireAuthor(actor);
  const c = courseRow(db, courseId);
  if (!c) throw new HttpError(404, "Course not found.");
  const learnerAttempts = (db.prepare("SELECT COUNT(*) AS n FROM scorm_attempts WHERE course_id = ? AND preview = 0").get(courseId) as { n: number }).n;
  if (learnerAttempts) {
    db.prepare("UPDATE scorm_courses SET status = 'archived', updated_by = ?, updated_at = ? WHERE id = ?").run(actor.id, now.toISOString(), courseId);
    event(db, { actor: actor.id, event: "course.deleted", course: courseId, version: c.version_id, detail: { title: c.title, permanently: false, learnerAttempts }, at: now });
    return { deleted: "kept-records" as const, learnerAttempts };
  }
  const versions = (db.prepare("SELECT id FROM scorm_package_versions WHERE package_id = ?").all(c.package_id) as { id: string }[]).map((v) => v.id);
  tx(db, () => {
    db.prepare("DELETE FROM scorm_runtime_data WHERE attempt_id IN (SELECT id FROM scorm_attempts WHERE course_id = ?)").run(courseId);
    db.prepare("DELETE FROM scorm_attempts WHERE course_id = ?").run(courseId);
    db.prepare("DELETE FROM scorm_courses WHERE id = ?").run(courseId);
    db.prepare("DELETE FROM scorm_package_versions WHERE package_id = ?").run(c.package_id);
    db.prepare("DELETE FROM scorm_packages WHERE id = ?").run(c.package_id);
    event(db, { actor: actor.id, event: "course.deleted", course: courseId, detail: { title: c.title, permanently: true, versions }, at: now });
  });
  for (const v of versions) await storage.remove(v);
  return { deleted: "permanently" as const, learnerAttempts: 0 };
}

export function adminCourses(db: Db, actor: User) {
  requireAuthor(actor);
  const rows = db.prepare("SELECT * FROM scorm_courses WHERE status != 'archived' ORDER BY updated_at DESC").all() as CourseRow[];
  const rejected = db
    .prepare("SELECT at, actor, detail FROM scorm_audit_events WHERE event = 'package.rejected' ORDER BY id DESC LIMIT 5")
    .all() as { at: string; actor: string; detail: string }[];
  return {
    courses: rows.map((c) => courseView(db, c)),
    rejected: rejected.map((r) => ({ at: r.at, ...(JSON.parse(r.detail) as { fileName: string; reason: string }) })),
  };
}

export function setCourseStatus(db: Db, actor: User, courseId: string, status: "draft" | "published" | "archived", now: Date) {
  requireAuthor(actor);
  const c = courseRow(db, courseId);
  if (!c) throw new HttpError(404, "Course not found.");
  const at = now.toISOString();
  db.prepare("UPDATE scorm_courses SET status = ?, updated_by = ?, updated_at = ?, published_by = CASE WHEN ? = 'published' THEN ? ELSE published_by END, published_at = CASE WHEN ? = 'published' THEN ? ELSE published_at END WHERE id = ?").run(
    status,
    actor.id,
    at,
    status,
    actor.id,
    status,
    at,
    courseId,
  );
  event(db, { actor: actor.id, event: `course.${status}`, course: courseId, version: c.version_id, at: now });
  return courseView(db, courseRow(db, courseId)!);
}

export const MAX_COURSE_TITLE = 160;
export const MAX_COURSE_DESCRIPTION = 1000;

/**
  Names a course and says what it's about, as learners see it in Magazine. A new import takes the title in
  the package's manifest, which is often a working title from Articulate ("New Course Example").
*/
export function setCourseDetails(db: Db, actor: User, courseId: string, input: { title?: unknown; description?: unknown }, now: Date) {
  requireAuthor(actor);
  const c = courseRow(db, courseId);
  if (!c || c.status === "archived") throw new HttpError(404, "Course not found.");
  const title = String(input.title ?? "").replace(/\s+/g, " ").trim();
  const description = String(input.description ?? "").trim();
  if (title.length < 2) throw new HttpError(400, "Give the course a name.");
  if (title.length > MAX_COURSE_TITLE) throw new HttpError(400, `Keep the name to ${MAX_COURSE_TITLE} characters.`);
  if (description.length > MAX_COURSE_DESCRIPTION) throw new HttpError(400, `Keep the description to ${MAX_COURSE_DESCRIPTION} characters.`);
  db.prepare("UPDATE scorm_courses SET title = ?, description = ?, updated_by = ?, updated_at = ? WHERE id = ?").run(title, description, actor.id, now.toISOString(), courseId);
  event(db, {
    actor: actor.id,
    event: "course.details",
    course: courseId,
    version: c.version_id,
    detail: { title, previousTitle: c.title, descriptionChanged: description !== c.description },
    at: now,
  });
  return courseView(db, courseRow(db, courseId)!);
}

/** Only pictures uploaded to the Hub can be a poster. */
const POSTER = /^\/api\/uploads\/[0-9a-f-]{36}\.(jpg|png|webp|gif)$/;

/** Sets or clears (null) the picture on a course's tile. */
export function setCoursePoster(db: Db, actor: User, courseId: string, poster: unknown, now: Date) {
  requireAuthor(actor);
  const c = courseRow(db, courseId);
  if (!c || c.status === "archived") throw new HttpError(404, "Course not found.");
  const src = poster == null || poster === "" ? null : String(poster);
  if (src !== null && !POSTER.test(src)) throw new HttpError(400, "Choose a picture uploaded to the Hub for the poster.");
  db.prepare("UPDATE scorm_courses SET poster = ?, updated_by = ?, updated_at = ? WHERE id = ?").run(src, actor.id, now.toISOString(), courseId);
  event(db, {
    actor: actor.id,
    event: src ? "course.poster_set" : "course.poster_cleared",
    course: courseId,
    version: c.version_id,
    detail: src ? { poster: src } : undefined,
    at: now,
  });
  return courseView(db, courseRow(db, courseId)!);
}

const latestAttempt = (db: Db, userId: string, courseId: string, preview: boolean) =>
  db.prepare("SELECT * FROM scorm_attempts WHERE user_id = ? AND course_id = ? AND preview = ? ORDER BY number DESC LIMIT 1").get(userId, courseId, preview ? 1 : 0) as
    | AttemptRow
    | undefined;

const attemptView = (a: AttemptRow | undefined) =>
  a
    ? {
        id: a.id,
        number: a.number,
        outcome: a.outcome,
        completion: a.completion_status,
        success: a.success_status,
        score: a.score_raw,
        scoreMax: a.score_max,
        scaled: a.score_scaled,
        totalSeconds: a.total_seconds,
        startedAt: a.started_at,
        lastActivityAt: a.last_activity_at,
        completedAt: a.completed_at,
        passedAt: a.passed_at,
        endedAt: a.ended_at,
      }
    : null;

/** Published courses, with how the learner is going on each. */
export function learnerCourses(db: Db, user: User) {
  const rows = db.prepare("SELECT * FROM scorm_courses WHERE status = 'published' ORDER BY title").all() as CourseRow[];
  return { courses: rows.map((c) => ({ ...courseView(db, c), attempt: attemptView(latestAttempt(db, user.id, c.id, false)) })) };
}

/** Learners (not authors previewing) active in each course in the 30 days before `now`, for "Popular with your colleagues". */
export function coursePopularity(db: Db, now: Date) {
  const since = new Date(now.getTime() - 30 * 86_400_000).toISOString();
  const rows = db
    .prepare("SELECT course_id, COUNT(DISTINCT user_id) AS n FROM scorm_attempts WHERE preview = 0 AND COALESCE(last_activity_at, started_at) >= ? GROUP BY course_id")
    .all(since) as { course_id: string; n: number }[];
  return new Map(rows.map((r) => [r.course_id, r.n]));
}

/** A course as its player sees it. Drafts only for authors, who preview them. */
export function courseForPlayer(db: Db, user: User, courseId: string) {
  const c = courseRow(db, courseId);
  if (!c || c.status === "archived" || (c.status !== "published" && !canAuthor(user))) throw new HttpError(404, "Course not found.");
  const preview = c.status !== "published";
  return { course: courseView(db, c), preview, attempt: attemptView(latestAttempt(db, user.id, c.id, preview)) };
}

// ---------------------------------------------------------------------------------------------
// Launch and save
// ---------------------------------------------------------------------------------------------

const savedData = (db: Db, attemptId: number) => {
  const r = db.prepare("SELECT cmi FROM scorm_runtime_data WHERE attempt_id = ?").get(attemptId) as { cmi: string } | undefined;
  return r ? (JSON.parse(r.cmi) as Flat) : null;
};

/**
  Starts or resumes the learner's attempt. An attempt that has finished (completed, passed or failed,
  and exited without suspending) isn't reopened: launching again starts a new attempt, and earlier ones
  stay as they were. Each launch gets a new session; only the latest session can save.
*/
export function launch(db: Db, user: User, courseId: string, opts: { restart?: boolean; hubOrigin: string }, now: Date) {
  const { course, preview } = courseForPlayer(db, user, courseId);
  const contentOrigin = contentOriginFor(opts.hubOrigin);
  if (!contentOrigin) throw new HttpError(503, "Courses need a separate content address. Set HUB_CONTENT_ORIGIN for this site.");
  const at = now.toISOString();
  const versionId = (courseRow(db, courseId) as CourseRow).version_id;
  const session = randomBytes(12).toString("base64url");
  const attempt = tx(db, () => {
    const last = latestAttempt(db, user.id, courseId, preview);
    if (last && !last.ended_at && !opts.restart) {
      // Save numbers count from 1 in each launch; only this new session can save from now on.
      db.prepare("UPDATE scorm_attempts SET session = ?, last_seq = 0, launches = launches + 1, last_activity_at = ? WHERE id = ?").run(session, at, last.id);
      return { ...last, session, last_seq: 0, resumed: true };
    }
    if (last && !last.ended_at) db.prepare("UPDATE scorm_attempts SET ended_at = ?, session = NULL WHERE id = ?").run(at, last.id);
    const number = (last?.number ?? 0) + 1;
    const r = db
      .prepare("INSERT INTO scorm_attempts (course_id, version_id, user_id, number, preview, outcome, session, launches, started_at, last_activity_at) VALUES (?, ?, ?, ?, ?, 'not_started', ?, 1, ?, ?)")
      .run(courseId, versionId, user.id, number, preview ? 1 : 0, session, at, at);
    return { ...(db.prepare("SELECT * FROM scorm_attempts WHERE id = ?").get(Number(r.lastInsertRowid)) as AttemptRow), resumed: false };
  });
  // An attempt stays on the version it started with.
  const version = versionRow(db, attempt.version_id)!;
  const saved = savedData(db, attempt.id);
  event(db, { actor: user.id, event: attempt.resumed ? "attempt.resumed" : "attempt.started", course: courseId, version: version.id, attempt: attempt.id, detail: { preview }, at: now });
  const token = launchToken(db, { attempt: attempt.id, version: version.id, session, hub: opts.hubOrigin }, now);
  return {
    course,
    preview,
    attempt: { id: attempt.id, number: attempt.number, session, resumed: attempt.resumed && Boolean(saved) },
    contentOrigin,
    shellUrl: `${contentOrigin}/api/elearning/shell/${token}`,
    standard: version.standard,
    data: startingData(version.standard, {
      learnerId: user.id,
      learnerName: version.standard === "scorm12" ? scormName(user.name) : user.name,
      saved,
      totalSeconds: attempt.total_seconds,
      preview,
    }),
  };
}

export type SaveInput = { session?: unknown; seq?: unknown; terminate?: unknown; data?: unknown };

/**
  Keeps what the package committed. Checks that the attempt is the learner's own, still open, and on the
  session that's saving; a save with a sequence number it has already seen is answered without being
  applied again (retries are safe). Session time is added to the total only when the package finishes.
*/
export function saveAttempt(db: Db, user: User, attemptId: number, input: SaveInput, now: Date) {
  const a = db.prepare("SELECT * FROM scorm_attempts WHERE id = ?").get(attemptId) as AttemptRow | undefined;
  if (!a || a.user_id !== user.id) throw new HttpError(404, "Attempt not found.");
  if (a.ended_at) throw new HttpError(409, "This attempt has already finished.");
  if (typeof input.session !== "string" || input.session !== a.session) throw new HttpError(409, "This course was opened again somewhere else, so this window can’t save. Close it and carry on in the newer one.");
  const seq = Number(input.seq);
  if (!Number.isInteger(seq) || seq < 1) throw new HttpError(400, "Missing save number.");
  if (seq <= a.last_seq) return { attempt: attemptView(a), duplicate: true };
  const version = versionRow(db, a.version_id)!;
  let data: Flat;
  try {
    data = validateSave(version.standard, input.data);
  } catch (e) {
    if (e instanceof RuntimeError) {
      event(db, { actor: user.id, event: "save.rejected", course: a.course_id, version: a.version_id, attempt: a.id, detail: { reason: e.message }, at: now });
      throw new HttpError(422, e.message);
    }
    throw e;
  }
  const terminate = input.terminate === true;
  const t = tracked(version.standard, data);
  const outcome = outcomeAfter(t, { passedAt: a.passed_at, completedAt: a.completed_at });
  const at = now.toISOString();
  const json = JSON.stringify(data);
  const finished = terminate && t.exit !== "suspend" && ["completed", "passed", "failed"].includes(outcome);
  tx(db, () => {
    db.prepare(
      `UPDATE scorm_attempts SET outcome = ?, completion_status = ?, success_status = ?, score_raw = ?, score_min = ?, score_max = ?, score_scaled = ?,
         location = ?, total_seconds = total_seconds + ?, last_seq = ?, last_activity_at = ?,
         completed_at = COALESCE(completed_at, ?), passed_at = COALESCE(passed_at, ?), failed_at = CASE WHEN ? THEN ? ELSE failed_at END,
         ended_at = CASE WHEN ? THEN ? ELSE ended_at END, session = CASE WHEN ? THEN NULL ELSE session END
       WHERE id = ?`,
    ).run(
      outcome,
      t.completion,
      t.success,
      t.score.raw,
      t.score.min,
      t.score.max,
      t.score.scaled,
      t.location,
      terminate ? Math.round(t.sessionSeconds) : 0,
      seq,
      at,
      t.completion === "completed" || outcome === "passed" ? at : null,
      outcome === "passed" ? at : null,
      t.success === "failed" ? 1 : 0,
      at,
      finished ? 1 : 0,
      at,
      finished ? 1 : 0,
      a.id,
    );
    db.prepare("INSERT INTO scorm_runtime_data (attempt_id, cmi, bytes, updated_at) VALUES (?, ?, ?, ?) ON CONFLICT(attempt_id) DO UPDATE SET cmi = excluded.cmi, bytes = excluded.bytes, updated_at = excluded.updated_at").run(
      a.id,
      json,
      json.length,
      at,
    );
  });
  const after = db.prepare("SELECT * FROM scorm_attempts WHERE id = ?").get(a.id) as AttemptRow;
  if (after.outcome !== a.outcome || finished)
    event(db, { actor: user.id, event: finished ? "attempt.finished" : `attempt.${after.outcome}`, course: a.course_id, version: a.version_id, attempt: a.id, detail: { score: t.score.raw, terminate }, at: now });
  return { attempt: attemptView(after), duplicate: false };
}
