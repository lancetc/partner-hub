import { afterAll, beforeAll, describe, expect, it } from "vitest";
import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import { zipSync, strToU8 } from "fflate";
import { openDb, type Db } from "../db";
import { userById, type User } from "../auth";
import { parseManifest, ManifestError } from "./manifest";
import { safePath, unzip, UnzipError } from "./unzip";
import { formatTotal, outcomeAfter, restorable, RuntimeError, seconds12, seconds2004, startingData, tracked, validateSave } from "./runtime";
import { importPackage, launch, saveAttempt, setCourseStatus, courseForPlayer, learnerCourses } from "./service";
import { contentOriginFor, launchToken, readLaunchToken } from "./launchToken";
import { storage } from "./storage";

/* eLearning (SCORM), Phase 1: manifest, safe unpacking, the runtime rules, and import, launch and save. */

const FIXTURE = path.join(__dirname, "__fixtures__", "scorm12-demo");
const filesOf = (dir: string, base = ""): Record<string, Uint8Array> =>
  Object.fromEntries(
    fs.readdirSync(dir, { withFileTypes: true }).flatMap((e) =>
      e.isDirectory() ? Object.entries(filesOf(path.join(dir, e.name), `${base}${e.name}/`)) : [[`${base}${e.name}`, new Uint8Array(fs.readFileSync(path.join(dir, e.name)))]],
    ),
  );
const demoZip = (extra: Record<string, Uint8Array> = {}) => Buffer.from(zipSync({ ...filesOf(FIXTURE), ...extra }));
const manifest12 = fs.readFileSync(path.join(FIXTURE, "imsmanifest.xml"), "utf8");

const manifest2004 = (sequencing = "") => `<?xml version="1.0"?>
<manifest identifier="m2004" xmlns="http://www.imsglobal.org/xsd/imscp_v1p1" xmlns:adlcp="http://www.adlnet.org/xsd/adlcp_v1p3" xml:base="">
  <metadata><schema>ADL SCORM</schema><schemaversion>2004 4th Edition</schemaversion></metadata>
  <organizations default="o"><organization identifier="o"><title>Storyline course</title>
    <item identifier="i1" identifierref="r1"><title>Lesson</title>${sequencing}</item>
    <item identifier="i2" identifierref="r2"><title>Second</title></item>
  </organization></organizations>
  <resources xml:base="content/">
    <resource identifier="r1" adlcp:scormType="sco" href="story.html?mode=lms"/>
    <resource identifier="r2" adlcp:scormType="sco" href="two.html"/>
  </resources>
</manifest>`;

describe("manifest", () => {
  it("reads a SCORM 1.2 manifest and takes the launch file from it", () => {
    const m = parseManifest(manifest12, (p) => p === "course/index_lms.html");
    expect(m).toMatchObject({ standard: "scorm12", edition: "1.2", identifier: "hub-demo-scorm12", title: "Hub test course (SCORM 1.2)", launchHref: "course/index_lms.html" });
    expect(m.warnings).toEqual([]);
  });

  it("reads SCORM 2004 editions, xml:base and launch parameters, and warns about what Phase 1 doesn't do", () => {
    const m = parseManifest(manifest2004("<imsss:sequencing/>"), (p) => p === "content/story.html");
    expect(m).toMatchObject({ standard: "scorm2004", edition: "2004 4th Edition", launchHref: "content/story.html", launchQuery: "mode=lms" });
    expect(m.warnings.join(" ")).toMatch(/2 SCOs/);
    expect(m.warnings.join(" ")).toMatch(/sequencing/i);
    expect(parseManifest(manifest2004().replace("2004 4th Edition", "2004 3rd Edition"), () => true).edition).toBe("2004 3rd Edition");
    expect(parseManifest(manifest2004().replace("2004 4th Edition", "CAM 1.3"), () => true).edition).toBe("2004 2nd Edition");
  });

  it("falls back on the namespace when there's no schema version", () => {
    expect(parseManifest(manifest12.replace("<schemaversion>1.2</schemaversion>", ""), () => true).standard).toBe("scorm12");
  });

  it("refuses manifests that aren't SCORM, have no launch file, point elsewhere or outside the package", () => {
    expect(() => parseManifest("<nope/>", () => true)).toThrow(ManifestError);
    expect(() => parseManifest("not xml <<<", () => true)).toThrow(ManifestError);
    expect(() => parseManifest(manifest12, () => false)).toThrow(/isn’t in the package/);
    expect(() => parseManifest(manifest12.replace('href="course/index_lms.html">', 'href="https://evil.example/x.html">'), () => true)).toThrow(/another website/);
    expect(() => parseManifest(manifest12.replace('href="course/index_lms.html">', 'href="../../x.html">'), () => true)).toThrow(/outside the package/);
  });
});

describe("unzip", () => {
  const read = async (zip: Buffer) => {
    const out: Record<string, number> = {};
    await unzip(zip, async (p, d) => void (out[p] = d.length));
    return out;
  };

  it("keeps the package's folders and files as they are", async () => {
    const files = await read(demoZip());
    expect(Object.keys(files).sort()).toEqual(["course/course.js", "course/index_lms.html", "imsmanifest.xml"]);
  });

  it("refuses paths that escape, absolute paths, backslashes, and executables", async () => {
    expect(() => safePath("../evil.js")).toThrow(UnzipError);
    expect(() => safePath("a/../../evil.js")).toThrow(UnzipError);
    expect(() => safePath("/etc/passwd")).toThrow(UnzipError);
    expect(() => safePath("C:/x.js")).toThrow(UnzipError);
    expect(() => safePath("a\\b.js")).toThrow(UnzipError);
    expect(safePath("__MACOSX/._x")).toBeNull();
    await expect(read(Buffer.from(zipSync({ "../evil.js": strToU8("x") })))).rejects.toThrow(/outside the package/);
    await expect(read(Buffer.from(zipSync({ "tools/run.exe": strToU8("MZ") })))).rejects.toThrow(/can’t be part of a course/);
  });

  it("refuses symbolic links", async () => {
    const zip = Buffer.from(zipSync({ "link.js": [strToU8("/etc/passwd"), { os: 3, attrs: (0o120777 << 16) >>> 0 }] }));
    await expect(read(zip)).rejects.toThrow(/link/);
  });

  it("refuses a zip bomb and anything over its limits", async () => {
    const bomb = Buffer.from(zipSync({ "zeros.txt": new Uint8Array(20 * 1024 * 1024) }, { level: 9 }));
    await expect(read(bomb)).rejects.toThrow(/compressed suspiciously/);
    await expect(unzip(demoZip(), async () => {}, { maxFiles: 2, maxFileBytes: 1e9, maxTotalBytes: 1e9, maxRatio: 1000 })).rejects.toThrow(/limit is 2/);
    await expect(unzip(demoZip(), async () => {}, { maxFiles: 100, maxFileBytes: 100, maxTotalBytes: 1e9, maxRatio: 1000 })).rejects.toThrow(/limit for one file/);
  });

  it("refuses something that isn't a ZIP", async () => {
    await expect(read(Buffer.from("hello"))).rejects.toThrow(UnzipError);
  });
});

describe("runtime rules", () => {
  it("reads both standards' times, and writes total time back in each format", () => {
    expect(seconds12("0001:02:03.5")).toBe(3723.5);
    expect(seconds12("bad")).toBe(0);
    expect(seconds2004("PT1H2M3S")).toBe(3723);
    expect(seconds2004("P1DT1S")).toBe(86401);
    expect(seconds2004("PT")).toBe(0);
    expect(formatTotal("scorm12", 3723)).toBe("0001:02:03");
    expect(formatTotal("scorm2004", 3723)).toBe("PT1H2M3S");
  });

  it("checks saves without ever cutting values short", () => {
    expect(() => validateSave("scorm12", { "window.x": "1" })).toThrow(RuntimeError);
    expect(() => validateSave("scorm12", { "cmi.core.lesson_status": "awesome" })).toThrow(/valid value/);
    expect(() => validateSave("scorm12", { "cmi.core.score.raw": "lots" })).toThrow(/number/);
    expect(() => validateSave("scorm12", { "cmi.suspend_data": "x".repeat(4097) })).toThrow(/4096/);
    expect(validateSave("scorm2004", { "cmi.suspend_data": "x".repeat(60000) })["cmi.suspend_data"]).toHaveLength(60000);
    expect(() => validateSave("scorm2004", { "cmi.score.scaled": "2" })).toThrow(/between -1 and 1/);
    expect(() => validateSave("scorm2004", ["x"])).toThrow(RuntimeError);
  });

  it("works out the outcome from what the package reports, keeping completion and success apart", () => {
    const t12 = (s: string) => tracked("scorm12", { "cmi.core.lesson_status": s });
    expect(t12("passed")).toMatchObject({ completion: "completed", success: "passed" });
    expect(t12("failed")).toMatchObject({ completion: "completed", success: "failed" });
    expect(t12("incomplete")).toMatchObject({ completion: "incomplete", success: "unknown" });
    const none = { passedAt: null, completedAt: null };
    expect(outcomeAfter(t12("passed"), none)).toBe("passed");
    expect(outcomeAfter(t12("failed"), none)).toBe("failed");
    expect(outcomeAfter(t12("completed"), none)).toBe("completed");
    expect(outcomeAfter(t12("incomplete"), none)).toBe("in_progress");
    // SCORM 2004: completed but failed is a fail; completed with unknown success is completed.
    expect(outcomeAfter({ completion: "completed", success: "failed" }, none)).toBe("failed");
    expect(outcomeAfter({ completion: "completed", success: "unknown" }, none)).toBe("completed");
    // Achievements stick when a package reports "incomplete" again on review; a failed attempt can still pass.
    expect(outcomeAfter(t12("incomplete"), { passedAt: "x", completedAt: "x" })).toBe("passed");
    expect(outcomeAfter(t12("incomplete"), { passedAt: null, completedAt: "x" })).toBe("completed");
    expect(outcomeAfter(t12("passed"), { passedAt: null, completedAt: "x" })).toBe("passed");
  });

  it("hands back only what a resumed attempt should get, with who and how", () => {
    const saved = { "cmi.core.lesson_location": "3", "cmi.suspend_data": "p1,p2", "cmi.core.session_time": "0000:01:00", "cmi.interactions.0.id": "q1", "cmi.core.lesson_status": "incomplete" };
    expect(restorable("scorm12", saved)).toEqual({ "cmi.core.lesson_location": "3", "cmi.suspend_data": "p1,p2", "cmi.core.lesson_status": "incomplete" });
    const start = startingData("scorm12", { learnerId: "sam", learnerName: "Taylor, Sam", saved, totalSeconds: 75, preview: false });
    expect(start).toMatchObject({ "cmi.core.entry": "resume", "cmi.core.total_time": "0000:01:15", "cmi.core.credit": "credit", "cmi.suspend_data": "p1,p2" });
    expect(startingData("scorm2004", { learnerId: "sam", learnerName: "Sam", saved: null, totalSeconds: 0, preview: true })).toMatchObject({ "cmi.entry": "ab-initio", "cmi.credit": "no-credit" });
  });
});

describe("import, launch and save", () => {
  let db: Db;
  let dir: string;
  let author: User;
  let learner: User;
  let other: User;
  const now = new Date("2026-11-18T01:00:00Z");
  const HUB = "http://localhost:3000";

  beforeAll(() => {
    dir = fs.mkdtempSync(path.join(os.tmpdir(), "hub-elearning-"));
    process.env.HUB_ELEARNING_DIR = dir;
    db = openDb(":memory:");
    author = userById(db, "jordan")!;
    learner = userById(db, "sam")!;
    other = userById(db, "ash")!;
  });
  afterAll(() => {
    delete process.env.HUB_ELEARNING_DIR;
    fs.rmSync(dir, { recursive: true, force: true });
  });

  it("imports a package as a draft course, keeping its files privately, and records refusals", async () => {
    await expect(importPackage(db, learner, demoZip(), "demo.zip", now)).rejects.toThrow(/authors/);
    const r = await importPackage(db, author, demoZip(), "demo.zip", now);
    expect(r).toMatchObject({ title: "Hub test course (SCORM 1.2)", standard: "scorm12", edition: "1.2" });
    const c = courseForPlayer(db, author, r.courseId);
    expect(c).toMatchObject({ preview: true, course: { status: "draft", launchHref: "course/index_lms.html" } });
    await expect(importPackage(db, author, Buffer.from(zipSync({ "index.html": strToU8("<p>hi</p>") })), "plain.zip", now)).rejects.toThrow(/imsmanifest/);
    await expect(importPackage(db, author, Buffer.from("plain text"), "x.zip", now)).rejects.toThrow(/isn’t a ZIP/);
    const refused = db.prepare("SELECT COUNT(*) AS n FROM scorm_audit_events WHERE event = 'package.rejected'").get() as { n: number };
    expect(refused.n).toBe(2);
    // Nothing from a refused package is left behind: only the good one's folder remains.
    expect(fs.readdirSync(dir)).toHaveLength(1);
  });

  it("accepts a course zipped again inside one folder", async () => {
    const files = filesOf(FIXTURE);
    const wrapped = Object.fromEntries(Object.entries(files).map(([k, v]) => [`My course/${k}`, v]));
    const r = await importPackage(db, author, Buffer.from(zipSync(wrapped)), "wrapped.zip", now);
    expect(courseForPlayer(db, author, r.courseId).course.launchHref).toBe("My course/course/index_lms.html");
  });

  it("launches, saves, resumes, finishes and starts a new attempt, keeping the old one", async () => {
    const { courseId } = await importPackage(db, author, demoZip(), "demo.zip", now);
    // Learners can't open a draft; once published they can.
    expect(() => launch(db, learner, courseId, { hubOrigin: HUB }, now)).toThrow(/not found/);
    setCourseStatus(db, author, courseId, "published", now);
    const first = launch(db, learner, courseId, { hubOrigin: HUB }, now);
    expect(first).toMatchObject({ preview: false, contentOrigin: "http://127.0.0.1:3000", standard: "scorm12", attempt: { number: 1, resumed: false } });
    expect(first.data).toMatchObject({ "cmi.core.entry": "ab-initio", "cmi.core.student_id": "sam" });

    const s = first.attempt.session;
    const save1 = { "cmi.core.lesson_status": "incomplete", "cmi.core.lesson_location": "2", "cmi.suspend_data": "p1,p2", "cmi.core.exit": "suspend", "cmi.core.session_time": "0000:02:00" };
    expect(saveAttempt(db, learner, first.attempt.id, { session: s, seq: 1, data: save1 }, now).attempt).toMatchObject({ outcome: "in_progress" });
    // A retried save is answered, not applied twice; someone else's attempt, or an old window, can't save.
    expect(saveAttempt(db, learner, first.attempt.id, { session: s, seq: 1, data: save1 }, now).duplicate).toBe(true);
    expect(() => saveAttempt(db, other, first.attempt.id, { session: s, seq: 2, data: save1 }, now)).toThrow(/not found/);
    expect(() => saveAttempt(db, learner, first.attempt.id, { session: "old", seq: 2, data: save1 }, now)).toThrow(/opened again/);
    expect(() => saveAttempt(db, learner, first.attempt.id, { session: s, seq: 2, data: { "cmi.core.lesson_status": "bad" } }, now)).toThrow(/valid value/);
    // Finishing a session with suspend adds the session time, and keeps the attempt open.
    saveAttempt(db, learner, first.attempt.id, { session: s, seq: 3, terminate: true, data: save1 }, now);

    // Relaunching resumes the same attempt with its bookmark and resume data; the old session can't save.
    const second = launch(db, learner, courseId, { hubOrigin: HUB }, now);
    expect(second.attempt).toMatchObject({ id: first.attempt.id, number: 1, resumed: true });
    expect(second.data).toMatchObject({ "cmi.core.entry": "resume", "cmi.core.lesson_location": "2", "cmi.suspend_data": "p1,p2", "cmi.core.total_time": "0000:02:00" });
    expect(() => saveAttempt(db, learner, first.attempt.id, { session: s, seq: 4, data: save1 }, now)).toThrow(/opened again/);
    // The new session numbers its saves from 1 again, and they apply.
    expect(saveAttempt(db, learner, second.attempt.id, { session: second.attempt.session, seq: 1, data: { ...save1, "cmi.core.lesson_location": "3" } }, now).attempt?.outcome).toBe("in_progress");

    // Failing the check: recorded as failed, not passed, and the attempt ends.
    const failed = saveAttempt(db, learner, second.attempt.id, {
      session: second.attempt.session,
      seq: 2,
      terminate: true,
      data: { "cmi.core.lesson_status": "failed", "cmi.core.score.raw": "0", "cmi.core.score.max": "100", "cmi.core.exit": "", "cmi.core.session_time": "0000:01:00" },
    }, now);
    expect(failed.attempt).toMatchObject({ outcome: "failed", score: 0, totalSeconds: 180 });
    expect(failed.attempt?.endedAt).toBeTruthy();
    expect(failed.attempt?.passedAt).toBeNull();

    // A retake is a new attempt; passing it records the pass, and the failed attempt stays in the history.
    const retake = launch(db, learner, courseId, { hubOrigin: HUB }, now);
    expect(retake.attempt).toMatchObject({ number: 2, resumed: false });
    expect(retake.data["cmi.core.entry"]).toBe("ab-initio");
    const passed = saveAttempt(db, learner, retake.attempt.id, { session: retake.attempt.session, seq: 1, terminate: true, data: { "cmi.core.lesson_status": "passed", "cmi.core.score.raw": "100", "cmi.core.exit": "" } }, now);
    expect(passed.attempt).toMatchObject({ outcome: "passed", number: 2 });
    const history = db.prepare("SELECT number, outcome FROM scorm_attempts WHERE user_id = 'sam' AND course_id = ? ORDER BY number").all(courseId);
    expect(history).toEqual([
      { number: 1, outcome: "failed" },
      { number: 2, outcome: "passed" },
    ]);
    expect(learnerCourses(db, learner).courses.find((c) => c.id === courseId)?.attempt).toMatchObject({ outcome: "passed", number: 2 });
  });

  it("keeps an author's preview of a draft apart from learner records", async () => {
    const { courseId } = await importPackage(db, author, demoZip(), "demo.zip", now);
    const p = launch(db, author, courseId, { hubOrigin: HUB }, now);
    expect(p.preview).toBe(true);
    expect(p.data["cmi.core.credit"]).toBe("no-credit");
    expect((db.prepare("SELECT preview FROM scorm_attempts WHERE id = ?").get(p.attempt.id) as { preview: number }).preview).toBe(1);
  });

  it("signs launch tokens that grant one version, expire, and can't be forged", () => {
    const t = launchToken(db, { attempt: 1, version: "v-x", session: "s", hub: HUB }, now);
    expect(readLaunchToken(db, t, now)).toMatchObject({ attempt: 1, version: "v-x", hub: HUB });
    expect(readLaunchToken(db, t, new Date(now.getTime() + 13 * 3600_000))).toBeNull();
    const [body, mac] = t.split(".");
    const forged = Buffer.from(JSON.stringify({ ...JSON.parse(Buffer.from(body, "base64url").toString()), version: "v-other" })).toString("base64url");
    expect(readLaunchToken(db, `${forged}.${mac}`, now)).toBeNull();
    expect(contentOriginFor("http://localhost:3000")).toBe("http://127.0.0.1:3000");
    expect(contentOriginFor("https://hub.example.com")).toBeNull();
  });

  it("never serves a file from outside the version's folder", async () => {
    const { courseId } = await importPackage(db, author, demoZip(), "demo.zip", now);
    const versionId = (db.prepare("SELECT version_id FROM scorm_courses WHERE id = ?").get(courseId) as { version_id: string }).version_id;
    expect(storage.readFile(versionId, "imsmanifest.xml")).not.toBeNull();
    expect(storage.readFile(versionId, "../package.zip")).toBeNull();
    expect(storage.readFile(versionId, "../../hub.sqlite")).toBeNull();
    expect(() => storage.readFile("../etc", "x")).toThrow();
  });
});
