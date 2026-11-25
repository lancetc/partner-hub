import { beforeAll, beforeEach, describe, expect, it } from "vitest";
import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import { openDb, type Db } from "./db";
import { userById, type User } from "./auth";
import type { SpeechEngine } from "./magazineNarration";
import { scriptFor } from "./tts";
import { ALIS_PARTS } from "@/content/alisCourse";
import { DISCOVERY_PATH_DESCRIPTIONS, SPOKEN_DESCRIPTIONS, SPOKEN_SIRS_DESCRIPTIONS } from "@/content/discoveryExciters";

/*
  The Discovery Exciter on the server (docs/discovery-exciter.md), with stand-ins for the speech provider and the AI
  writer (no paid calls): the description is never spoken, editing never makes audio, audio needs confirming, the
  published introduction stays until its replacement is approved, the outdated flag, bulk actions, listening figures
  that are ids and numbers only, and the migration of existing paths.
*/

const dir = fs.mkdtempSync(path.join(os.tmpdir(), "hub-exciter-"));
let ex: typeof import("./pathExciter");
let jobs: typeof import("./narrationJobs");
let store: typeof import("./pathExciterStore");
let paths: typeof import("./learningPaths");
let migration: typeof import("./exciterMigration");
beforeAll(async () => {
  process.env.HUB_UPLOADS_DIR = dir;
  ex = await import("./pathExciter");
  jobs = await import("./narrationJobs");
  store = await import("./pathExciterStore");
  paths = await import("./learningPaths");
  migration = await import("./exciterMigration");
});

/** An MPEG-1 Layer III frame header at 128 kbps, then enough bytes for about two seconds. */
const MP3 = (() => {
  const b = Buffer.alloc(32_000);
  b.set([0xff, 0xfb, 0x90, 0x00], 0);
  return b;
})();
function fakeSpeech() {
  const calls: { text: string; voice: string; fresh: boolean; delivery?: string }[] = [];
  const speech: SpeechEngine = async (text, voice, opts) => {
    calls.push({ text, voice, fresh: opts.fresh, delivery: opts.delivery });
    return { audio: MP3, words: null, provider: "openai", model: "gpt-4o-mini-tts", profile: "editorial" };
  };
  return { speech, calls };
}

const SCRIPT =
  "A client says no to the support you’ve planned. Do you push on, or step back and ask why? Every coordinator meets that moment, and how you handle it shapes the trust that follows. In this Discovery Path, you’ll work through the choices people make about their own care, the risks that come with them, and the conversations that help. There isn’t always one right answer, but there are better questions to ask, and you’ll leave with a few of them.";
const NEW_SCRIPT = `${SCRIPT} Where would you start?`;

let db: Db;
let author: User, learner: User, admin: User;
const now = new Date("2026-11-25T00:00:00Z");
const later = (min: number) => new Date(now.getTime() + min * 60_000);
const ID = "lp-care-coordination";
beforeEach(() => {
  db = openDb(":memory:");
  author = userById(db, "jordan")!;
  learner = userById(db, "riley")!;
  admin = userById(db, "casey")!;
});
const jobCount = () => {
  jobs.ensureNarrationJobs(db);
  return (db.prepare("SELECT COUNT(*) AS n FROM magazine_narration_jobs").get() as { n: number }).n;
};
const act = (input: Record<string, unknown>, at = now, speech?: SpeechEngine) => ex.exciterAction(db, author, ID, input, at, speech);

/** Writes, approves, records (with the stand-in) and publishes an Exciter. */
async function published(script = SCRIPT) {
  const { speech, calls } = fakeSpeech();
  act({ action: "save", script });
  act({ action: "approve-script" });
  act({ action: "queue", confirmed: true }, now, speech);
  await jobs.drainNarrationJobs(db, speech);
  const v = ex.exciterView(db, author, ID, speech);
  expect(v.working?.audio?.pending).toBe(true);
  act({ action: "approve-audio" }, later(1), speech);
  return { speech, calls };
}

describe("the path page", () => {
  it("never speaks the description: nothing to say until an Exciter's audio is approved, and Ava's path line is gone", () => {
    const desc = (db.prepare("SELECT description FROM learning_paths WHERE id = ?").get(ID) as { description: string }).description;
    expect(desc.length).toBeGreaterThan(0);
    expect(() => scriptFor(db, `path:${ID}`)).toThrow(/No narration/);
    expect(ex.learnerExciter(db, ID)).toBeNull();
    // A script, even an approved one, isn't enough: only approved audio reaches learners, and it's the Exciter's words.
    act({ action: "save", script: SCRIPT });
    act({ action: "approve-script" });
    expect(ex.learnerExciter(db, ID)).toBeNull();
  });

  it("plays the approved Exciter in the Editorial Voice, only its own words, and nothing while it's turned off", async () => {
    await published();
    const l = ex.learnerExciter(db, ID)!;
    expect(l.script).toBe(SCRIPT);
    expect(l.audio).toMatchObject({ voice: "profile:editorial", provider: "openai", profile: "editorial" });
    expect(l.audio).not.toHaveProperty("pending");
    act({ action: "visible", on: false });
    expect(ex.learnerExciter(db, ID)).toBeNull();
    act({ action: "visible", on: true });
    expect(ex.learnerExciter(db, ID)?.script).toBe(SCRIPT);
  });
});

describe("authoring", () => {
  it("never queues audio when a script is written, edited or approved", () => {
    act({ action: "save", script: SCRIPT });
    act({ action: "save", script: NEW_SCRIPT });
    act({ action: "approve-script" });
    act({ action: "save", script: SCRIPT });
    act({ action: "curious", on: true });
    expect(jobCount()).toBe(0);
    const v = ex.exciterView(db, author, ID);
    expect(v).toMatchObject({ state: "unrecorded", audioStatus: "None", live: false });
    expect(v.working).toMatchObject({ script: SCRIPT, status: "approved", source: "author" });
  });

  it("needs a confirmed request to generate audio, records in the background with the curious delivery, and only authors can", async () => {
    act({ action: "save", script: SCRIPT });
    expect(() => act({ action: "queue", confirmed: true })).toThrow(/Approve the script first/);
    act({ action: "approve-script" });
    act({ action: "curious", on: true });
    const { speech, calls } = fakeSpeech();
    expect(() => act({ action: "queue" }, now, speech)).toThrow(/Confirm the estimated cost/);
    expect(jobCount()).toBe(0);
    act({ action: "queue", confirmed: true }, now, speech);
    await jobs.drainNarrationJobs(db, speech);
    expect(calls).toEqual([{ text: SCRIPT, voice: "profile:editorial", fresh: false, delivery: "curious" }]);
    const v = ex.exciterView(db, author, ID, speech);
    expect(v.working?.audio).toMatchObject({ pending: true, delivery: "curious", model: "gpt-4o-mini-tts" });
    expect(v.state).toBe("pending");
    expect(() => ex.exciterAction(db, learner, ID, { action: "save", script: "x" }, now)).toThrow();
    expect(() => ex.exciterAction(db, admin, ID, { action: "queue", confirmed: true }, now, speech)).toThrow();
  });

  it("keeps the published audio until a replacement is approved", async () => {
    const { speech } = await published();
    const first = ex.learnerExciter(db, ID)!;
    // A new script goes into a replacement; learners keep the published one.
    act({ action: "save", script: NEW_SCRIPT }, later(2), speech);
    let v = ex.exciterView(db, author, ID, speech);
    expect(v.replacing).toBe(true);
    expect(v.working?.script).toBe(NEW_SCRIPT);
    expect(ex.learnerExciter(db, ID)).toEqual(first);
    act({ action: "approve-script" }, later(3), speech);
    act({ action: "queue", confirmed: true, fresh: true }, later(4), speech);
    await jobs.drainNarrationJobs(db, speech);
    v = ex.exciterView(db, author, ID, speech);
    expect(v.working?.audio?.pending).toBe(true);
    // Recorded but not approved: still the published one.
    expect(ex.learnerExciter(db, ID)).toEqual(first);
    act({ action: "approve-audio" }, later(5), speech);
    expect(ex.learnerExciter(db, ID)?.script).toBe(NEW_SCRIPT);
    expect(store.storedExciter(db, ID)).toMatchObject({ approvedBy: author.name, approvedAt: later(5).toISOString() });
    expect(store.storedExciter(db, ID)?.next).toBeUndefined();
  });

  it("discards a replacement and leaves the published introduction exactly as it was", async () => {
    const { speech } = await published();
    const before = ex.learnerExciter(db, ID);
    act({ action: "save", script: NEW_SCRIPT }, later(2), speech);
    act({ action: "discard" }, later(3), speech);
    expect(ex.learnerExciter(db, ID)).toEqual(before);
    expect(store.storedExciter(db, ID)?.next).toBeUndefined();
  });

  it("drafts a script from the whole path with the writer it's given, as a new draft version, saving nothing else", async () => {
    let prompt = "";
    const writer: import("./pathExciter").ScriptWriter = async (p, check) => {
      prompt = p;
      expect(check({ script: "Welcome to this module. ".repeat(20) })).toEqual(expect.arrayContaining([expect.stringMatching(/training module/)]));
      expect(check({ script: SCRIPT })).toEqual([]);
      return { value: { script: SCRIPT }, model: "stand-in" };
    };
    act({ action: "save", script: "My own first go at it." });
    const events: unknown[] = [];
    const r = await ex.draftExciters(db, author, { pathIds: [ID] }, now, (e) => events.push(e), writer);
    expect(r.results).toEqual([{ pathId: ID, ok: true, words: expect.any(Number) }]);
    // The whole path: every Topic, the outcomes, the audience and the structure.
    const detail = paths.learningPathDetail(db, author, ID);
    for (const o of detail.outcomes) expect(prompt).toContain(o);
    for (const c of detail.chapters) expect(prompt).toContain(c.title);
    expect(prompt).toContain(detail.audience);
    expect(prompt).toMatch(/Topics, in order:\n1\. /);
    expect(prompt.match(/^\d+\. /gm)?.length).toBe(detail.lessons.length);
    expect(store.storedExciter(db, ID)).toMatchObject({ script: SCRIPT, status: "draft", version: 2, source: "ai" });
    expect(jobCount()).toBe(0);
  });
});

describe("the outdated flag", () => {
  it("is raised when Topics are added or removed or the outcomes change, never regenerates, and clears with “still appropriate”", async () => {
    const { speech, calls } = await published();
    const input = () => {
      const d = paths.learningPathDetail(db, author, ID);
      return { ...d, lessons: d.lessons, chapters: d.chapters.length ? d.chapters : undefined };
    };
    expect(ex.exciterView(db, author, ID, speech).outdated).toBe(false);
    // A small change (the audience label) doesn't flag it.
    paths.updateLearningPath(db, author, ID, { ...input(), audience: "Care coordinators" }, later(2));
    expect(ex.exciterView(db, author, ID, speech).outdated).toBe(false);
    // A Topic removed does.
    const d = input();
    expect(d.lessons.length).toBeGreaterThan(1);
    paths.updateLearningPath(
      db,
      author,
      ID,
      d.chapters ? { ...d, chapters: d.chapters.map((c, i) => (i === 0 ? { ...c, lessons: c.lessons.slice(1) } : c)) } : { ...d, lessons: d.lessons.slice(1) },
      later(3),
    );
    expect(paths.learningPathDetail(db, author, ID).lessons.length).toBe(d.lessons.length - 1);
    const v = ex.exciterView(db, author, ID, speech);
    expect(v.outdated).toBe(true);
    expect(v.state).toBe("review");
    // Nothing happened by itself: no new audio, and learners still hear the approved one.
    expect(calls).toHaveLength(1);
    expect(jobCount()).toBe(1);
    expect(ex.learnerExciter(db, ID)?.script).toBe(SCRIPT);
    act({ action: "still-fine" }, later(4), speech);
    expect(ex.exciterView(db, author, ID, speech).outdated).toBe(false);
    // Changed outcomes flag it again.
    paths.updateLearningPath(db, author, ID, { ...input(), outcomes: ["Something entirely different to be able to do"] }, later(5));
    expect(ex.exciterView(db, author, ID, speech).outdated).toBe(true);
  });
});

describe("the Manager's bulk actions", () => {
  it("each need confirmation, and audio is only made for approved scripts", async () => {
    const other = "lp-welcome";
    expect(() => ex.approveExciterScripts(db, author, { pathIds: [ID] }, now)).toThrow(/Confirm/);
    await expect(ex.draftExciters(db, author, { pathIds: [ID, other] }, now, () => {})).rejects.toThrow(/Confirm/);
    expect(() => ex.queueExciterAudio(db, author, [ID, other], {}, now)).toThrow(/Confirm/);
    store.seedExciter(db, ID, SCRIPT, author.id, now);
    store.seedExciter(db, other, NEW_SCRIPT, author.id, now);
    expect(ex.approveExciterScripts(db, author, { pathIds: [ID], confirmed: true }, now).approved).toEqual([ID]);
    const { speech, calls } = fakeSpeech();
    const r = ex.queueExciterAudio(db, author, [ID, other], { confirmed: true }, now, speech);
    expect(r.queued.map((q) => q.pathId)).toEqual([ID]);
    expect(r.skipped).toEqual([{ pathId: other, reason: "The script isn’t approved." }]);
    await jobs.drainNarrationJobs(db, speech);
    expect(calls).toHaveLength(1);
    const rows = ex.exciterManager(db, author, speech).rows;
    expect(rows.find((x) => x.id === ID)).toMatchObject({ scriptStatus: "approved", audioStatus: "To approve", estimated: false });
    expect(rows.find((x) => x.id === other)).toMatchObject({ scriptStatus: "draft", audioStatus: "None", estimated: true, source: "seed" });
    expect(() => ex.exciterManager(db, learner)).toThrow();
  });
});

describe("listening figures", () => {
  it("keep ids and numbers only, drop anything else sent, and never count towards finishing", () => {
    ex.recordExciterEvent(db, learner, ID, { action: "play", detail: { speed: 1.25, name: "Riley", email: "riley@example.com" } }, now);
    ex.recordExciterEvent(db, learner, ID, { action: "listened", detail: { seconds: 31.24, percent: 72, note: "loved it" } }, now);
    ex.recordExciterEvent(db, learner, ID, { action: "transcript" }, now);
    expect(() => ex.recordExciterEvent(db, learner, ID, { action: "shared" }, now)).toThrow(/Unknown/);
    const stored = db.prepare("SELECT path_id, user_id, event, detail FROM path_intro_events ORDER BY id").all() as Record<string, string>[];
    expect(stored.map((r) => [r.event, JSON.parse(r.detail)])).toEqual([
      ["intro_audio.play", { speed: 1.25 }],
      ["intro_audio.listened", { seconds: 31.2, percent: 72 }],
      ["intro_audio.transcript", {}],
    ]);
    const stats = ex.exciterStats(db, author);
    expect(stats.paths[0]).toMatchObject({ pathId: ID, plays: 1, listeners: 1, seconds: 31, percent: 72, transcripts: 1, startedAfterListening: null });
    // Totals: nobody's id or name, only numbers (and the path's id).
    const text = JSON.stringify(stats);
    expect(text).not.toContain(learner.id);
    expect(text).not.toContain("Riley");
    for (const v of Object.values(stats.paths[0])) expect(typeof v === "number" || v === null || v === ID || typeof v === "object").toBe(true);
    expect(() => ex.exciterStats(db, learner)).toThrow();
    // Listening isn't a step: the path's progress is the same with or without it.
    const progress = paths.learnerPath(db, learner, ID);
    expect(progress.steps.every((s) => !s.completedAt)).toBe(true);
  });
});

describe("migrating the existing paths", () => {
  it("restores the description, seeds a draft Exciter through updateLearningPath, changes nothing else, and is idempotent", () => {
    // Before: the description is the spoken script (as on 24 Nov), and a SIRS path from the ALIS builder's old version.
    db.prepare("UPDATE learning_paths SET description = ? WHERE id = ?").run(SPOKEN_DESCRIPTIONS[ID], ID);
    const sirs = paths.createLearningPath(
      db,
      author,
      { name: ALIS_PARTS[0].title, description: SPOKEN_SIRS_DESCRIPTIONS[ALIS_PARTS[0].title], lessons: ["a-little-extra-time"] },
      now,
    ).id;
    const before = paths.learningPathDetail(db, author, ID);
    const first = migration.migrateDiscoveryExciters(db, author, later(1));
    expect(first.updated).toBe(2);
    expect(first.lines.filter((l) => l.applied).map((l) => [l.id, l.description, l.exciter, l.changed])).toEqual([
      [ID, "restored", "created", []],
      [sirs, "restored", "created", []],
    ]);
    const after = paths.learningPathDetail(db, author, ID);
    expect(after.description).toBe(DISCOVERY_PATH_DESCRIPTIONS[ID]);
    expect({ ...after, description: "" }).toEqual({ ...before, description: "" });
    expect(paths.learningPathDetail(db, author, sirs).description).toBe(ALIS_PARTS[0].description);
    expect(store.storedExciter(db, ID)).toMatchObject({ status: "draft", source: "seed", version: 1 });
    expect(store.storedExciter(db, sirs)).toMatchObject({ script: ALIS_PARTS[0].intro, status: "draft" });
    // The paths not in this database, and live ones it doesn't cover, are reported.
    expect(first.exceptions.some((e) => /Dot’s Week|lp-dot-s-week/.test(e))).toBe(true);
    expect(first.exceptions.some((e) => /lp-welcome/.test(e))).toBe(true);
    expect(jobCount()).toBe(0);

    // Again: nothing changes.
    const audits = (db.prepare("SELECT COUNT(*) AS n FROM audit WHERE event = 'learning_path.updated'").get() as { n: number }).n;
    const second = migration.migrateDiscoveryExciters(db, author, later(2));
    expect(second.updated).toBe(0);
    expect(second.lines.filter((l) => l.id === ID || l.id === sirs).map((l) => [l.description, l.exciter])).toEqual([
      ["already", "same"],
      ["already", "same"],
    ]);
    expect((db.prepare("SELECT COUNT(*) AS n FROM audit WHERE event = 'learning_path.updated'").get() as { n: number }).n).toBe(audits);
    expect(store.storedExciter(db, ID)?.updatedAt).toBe(later(1).toISOString());
  });

  it("leaves a description an author has rewritten since, and an Exciter an author has worked on", () => {
    db.prepare("UPDATE learning_paths SET description = ? WHERE id = ?").run("An author’s own new summary.", ID);
    act({ action: "save", script: SCRIPT });
    const r = migration.migrateDiscoveryExciters(db, author, later(1));
    const line = r.lines.find((l) => l.id === ID)!;
    expect(line).toMatchObject({ description: "kept", exciter: "kept", applied: false });
    expect(paths.learningPathDetail(db, author, ID).description).toBe("An author’s own new summary.");
    expect(store.storedExciter(db, ID)?.script).toBe(SCRIPT);
    expect(r.exceptions.filter((e) => e.startsWith("Care Coordination")).length).toBe(2);
  });
});
