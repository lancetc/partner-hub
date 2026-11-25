import { beforeAll, beforeEach, describe, expect, it } from "vitest";
import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import { openDb, type Db } from "./db";
import { userById, type User } from "./auth";
import { readGuideDoc } from "@/lib/magazine";
import { DEFAULT_AUDIO, listenable, pageSnapshot, textHash } from "@/lib/magazineNarration";
import type { SpeechEngine } from "./magazineNarration";

/*
  Magazine Audio Introductions on the server (docs/magazine-audio-guide.md): recording in the background with a
  stand-in for the speech provider (no paid calls), what each recording keeps, confirmation before a paid bulk run, a
  failure that leaves published audio alone, script edits that never make audio, the prompt, and listening figures
  that are ids and numbers only.
*/

const dir = fs.mkdtempSync(path.join(os.tmpdir(), "hub-intro-audio-"));
let jobs: typeof import("./narrationJobs");
let mag: typeof import("./magazine");
let narr: typeof import("./magazineNarration");
let stats: typeof import("./narrationStats");
beforeAll(async () => {
  process.env.HUB_UPLOADS_DIR = dir;
  jobs = await import("./narrationJobs");
  mag = await import("./magazine");
  narr = await import("./magazineNarration");
  stats = await import("./narrationStats");
});

/** An MPEG-1 Layer III frame header at 128 kbps, then enough bytes for about two seconds. */
const MP3 = (() => {
  const b = Buffer.alloc(32_000);
  b.set([0xff, 0xfb, 0x90, 0x00], 0);
  return b;
})();
function fakeSpeech(fail = false) {
  const calls: { text: string; voice: string; fresh: boolean }[] = [];
  const speech: SpeechEngine = async (text, voice, opts) => {
    calls.push({ text, voice, fresh: opts.fresh });
    if (fail) throw new Error("OpenAI’s rate limit was reached. Wait a moment and try again.");
    return { audio: MP3, words: null, provider: "openai", model: "gpt-4o-mini-tts", profile: "editorial" };
  };
  return { speech, calls };
}

const SCRIPT =
  "Before you knock on the door, a lot has already happened. Someone has planned this visit, and the person you're seeing has made choices about how it should go. On this page, you'll see what's already in place and where you fit.";
const NEW_SCRIPT = `${SCRIPT} What would you check first?`;
const page = (narration?: object) => ({
  id: "p1",
  title: "Before your first visit",
  purpose: "Know what's in place",
  template: "do",
  kind: "content",
  required: true,
  sections: [{ id: "s1", title: "S", blocks: [{ id: "t1", type: "text", body: "You support people at home, with their plan." }] }],
  ...(narration && { narration }),
});
const page2 = {
  ...page(),
  id: "p2",
  title: "When someone says no",
  sections: [{ id: "s2", title: "S", blocks: [{ id: "t2", type: "text", body: "Mr Ellis says he'd rather not shower today." }] }],
};

let db: Db;
let author: User, learner: User;
const now = new Date("2026-11-25T00:00:00Z");
beforeEach(() => {
  db = openDb(":memory:");
  author = userById(db, "jordan")!;
  learner = userById(db, "riley")!;
});
const course = (narration?: object) =>
  mag.createGuide(
    db,
    author,
    { title: "ZZ Test intro audio", completion: "confirm", doc: { schema: 2, audio: DEFAULT_AUDIO, pages: [page(narration), page2] } },
    now,
  );
const draftOf = (id: string) => db.prepare("SELECT draft FROM magazine_guides WHERE id = ?").get(id) as { draft: string };

describe("recording in the background", () => {
  it("records an approved script with the provider, profile, model and estimated cost stored with it, and reuses it for the same words", async () => {
    const g = course();
    const { speech, calls } = fakeSpeech();
    const q = jobs.queueNarrationAudio(db, author, g.id, { items: [{ target: "p1", script: SCRIPT }], voice: "profile:editorial" }, now, speech);
    expect(q.jobs[0]).toMatchObject({ status: "queued", target: "p1", provider: "openai", model: "gpt-4o-mini-tts", characters: SCRIPT.length });
    expect(q.jobs[0].estCost).toBeCloseTo((SCRIPT.length * 15) / 1e6, 4);
    await jobs.drainNarrationJobs(db, speech);
    const list = jobs.narrationJobs(db, author, g.id, "profile:editorial", speech);
    const done = list.jobs[0];
    expect(done.status).toBe("done");
    expect(done.result).toMatchObject({
      provider: "openai",
      profile: "editorial",
      model: "gpt-4o-mini-tts",
      voice: "profile:editorial",
      scriptHash: textHash(SCRIPT),
      seconds: 2,
    });
    expect(done.result!.src).toMatch(/^\/api\/uploads\/.+\.mp3$/);
    expect(done.result!.cost).toBeGreaterThan(0);
    expect(list.speech).toMatchObject({ provider: "openai", model: "gpt-4o-mini-tts", pricePerMillionChars: 15, profile: "editorial" });
    expect(calls).toEqual([{ text: SCRIPT, voice: "profile:editorial", fresh: false }]);
    // Once the editor has put it with its script, it isn't offered again (so discarding it sticks)...
    jobs.markNarrationJobsAttached(db, author, g.id, [done.id], now);
    expect(jobs.narrationJobs(db, author, g.id, undefined, speech).jobs[0].attached).toBe(true);
    // ...until the same words are asked for again: the recording already made, no new charge. "Regenerate audio" asks for a fresh take.
    const again = jobs.queueNarrationAudio(db, author, g.id, { items: [{ target: "p1", script: SCRIPT }], voice: "profile:editorial" }, now, speech).jobs[0];
    expect(again).toMatchObject({ id: done.id, attached: false });
    jobs.queueNarrationAudio(db, author, g.id, { items: [{ target: "p1", script: SCRIPT }], voice: "profile:editorial", fresh: true }, now, speech);
    await jobs.drainNarrationJobs(db, speech);
    expect(calls.map((c) => c.fresh)).toEqual([false, true]);
    // What's kept in the course document keeps all of it.
    const kept = readGuideDoc({ schema: 2, audio: DEFAULT_AUDIO, pages: [page({ script: SCRIPT, status: "approved", audio: done.result })] }, { draft: true });
    expect(kept.pages[0].narration!.audio).toMatchObject({ provider: "openai", profile: "editorial", model: "gpt-4o-mini-tts" });
  });

  it("needs confirmation before a paid bulk run, and refuses voices and scripts it can't record", () => {
    const g = course();
    const { speech, calls } = fakeSpeech();
    const items = [
      { target: "p1", script: SCRIPT },
      { target: "p2", script: NEW_SCRIPT },
    ];
    expect(() => jobs.queueNarrationAudio(db, author, g.id, { items, voice: "profile:editorial" }, now, speech)).toThrow(/Confirm the estimated cost/);
    expect(jobs.narrationJobs(db, author, g.id, undefined, speech).jobs).toEqual([]);
    expect(calls).toEqual([]);
    const ok = jobs.queueNarrationAudio(db, author, g.id, { items, voice: "profile:editorial", confirmed: true }, now, speech);
    expect(ok.jobs).toHaveLength(2);
    expect(() => jobs.queueNarrationAudio(db, author, g.id, { items: [items[0]], voice: "profile:nobody" }, now, speech)).toThrow(/voices offered/);
    expect(() => jobs.queueNarrationAudio(db, author, g.id, { items: [{ target: "p1", script: "x".repeat(1201) }], voice: "topic" }, now, speech)).toThrow(
      /too long/,
    );
    expect(() => jobs.queueNarrationAudio(db, learner, g.id, { items: [items[0]], voice: "topic" }, now, speech)).toThrow();
  });

  it("a failed recording leaves the draft and the published introduction exactly as they were, and can be tried again", async () => {
    const p = readGuideDoc({ schema: 2, pages: [page()] }, { draft: true }).pages[0];
    const published = {
      src: "/api/uploads/0f0e0d0c-0b0a-4908-8706-050403020100.mp3",
      seconds: 18,
      words: null,
      scriptHash: textHash(SCRIPT),
      voice: "profile:editorial",
      at: now.toISOString(),
    };
    // A published introduction, and a replacement being prepared in the draft.
    const g = course({ script: SCRIPT, status: "approved", basis: pageSnapshot(p), audio: published, next: { script: NEW_SCRIPT, status: "approved" } });
    mag.publishGuide(db, author, g.id, "", now);
    const before = { draft: draftOf(g.id).draft, reader: JSON.stringify(mag.readGuide(db, learner, g.slug).doc) };
    const bad = fakeSpeech(true);
    const q = jobs.queueNarrationAudio(db, author, g.id, { items: [{ target: "p1", script: NEW_SCRIPT }], voice: "profile:editorial" }, now, bad.speech);
    await jobs.drainNarrationJobs(db, bad.speech);
    const failed = jobs.narrationJobs(db, author, g.id, undefined, bad.speech).jobs[0];
    expect(failed).toMatchObject({ id: q.jobs[0].id, status: "failed", error: expect.stringMatching(/rate limit/), result: null });
    expect(draftOf(g.id).draft).toBe(before.draft);
    const reader = mag.readGuide(db, learner, g.slug);
    expect(JSON.stringify(reader.doc)).toBe(before.reader);
    expect(listenable(reader.doc.pages[0].narration, reader.doc.audio)).toBe(true);
    expect(reader.doc.pages[0].narration?.audio?.src).toBe(published.src);
    // Tried again, it works.
    const good = fakeSpeech();
    jobs.retryNarrationJob(db, author, g.id, failed.id, now, good.speech);
    await jobs.drainNarrationJobs(db, good.speech);
    expect(jobs.narrationJobs(db, author, g.id, undefined, good.speech).jobs[0]).toMatchObject({ status: "done", attempts: 2 });
    expect(() => jobs.retryNarrationJob(db, author, g.id, failed.id, now, good.speech)).toThrow(/Only a failed recording/);
  });

  it("marks a recording stopped part-way by a restart as failed, so it can be tried again", () => {
    const g = course();
    jobs.ensureNarrationJobs(db);
    const old = new Date(Date.now() - 20 * 60_000).toISOString();
    db.prepare(
      "INSERT INTO magazine_narration_jobs (id, guide_id, target, script, script_hash, voice, status, characters, provider, model, created_by, created_at, updated_at) VALUES ('nj-x', ?, 'p1', ?, ?, 'topic', 'running', 10, 'openai', 'gpt-4o-mini-tts', 'jordan', ?, ?)",
    ).run(g.id, SCRIPT, textHash(SCRIPT), old, old);
    expect(jobs.narrationJobs(db, author, g.id, undefined, fakeSpeech().speech).jobs[0]).toMatchObject({
      status: "failed",
      error: expect.stringMatching(/restarted/),
    });
  });
});

describe("editing never makes audio", () => {
  it("saves a changed script without asking for any recording", async () => {
    const p = readGuideDoc({ schema: 2, pages: [page()] }, { draft: true }).pages[0];
    const g = course({ script: SCRIPT, status: "approved", basis: pageSnapshot(p) });
    const { speech, calls } = fakeSpeech();
    for (const s of [NEW_SCRIPT, `${NEW_SCRIPT} Again.`])
      mag.saveGuideDraft(db, author, g.id, { doc: { schema: 2, audio: DEFAULT_AUDIO, pages: [page({ script: s, status: "approved" }), page2] } }, now);
    await jobs.drainNarrationJobs(db, speech);
    expect(jobs.narrationJobs(db, author, g.id, undefined, speech).jobs).toEqual([]);
    expect(calls).toEqual([]);
    expect(JSON.parse(draftOf(g.id).draft).pages[0].narration.script).toBe(`${NEW_SCRIPT} Again.`);
  });
});

describe("the script prompt", () => {
  it("gives the five-part structure, the course's context and the page's place, and bans formulaic openings and unsupported claims", () => {
    const doc = readGuideDoc(
      { schema: 2, audio: DEFAULT_AUDIO, pages: [page(), { ...page2, relay: { purpose: "Respecting a client's choice to say no" } }] },
      { draft: true },
    );
    const prompt = narr.narrationPrompt({
      title: "Ready for your first shift",
      standfirst: "Be ready for a first visit",
      audience: "Care partners",
      doc,
      targets: ["p2"],
      length: "editorial",
      note: "",
      brief: "Partners should check the plan before every first visit.",
    });
    for (const part of [
      "1. Why the subject matters.",
      "2. How it connects",
      "3. A real problem, question or opportunity",
      "4. What they'll gain",
      "5. An invitation to explore",
    ])
      expect(prompt).toContain(part);
    expect(prompt).toContain("70 to 130 words");
    expect(prompt).toContain("Partners should check the plan before every first visit.");
    expect(prompt).toContain("Position: after “Before your first visit”, the last page.");
    expect(prompt).toContain("Respecting a client's choice to say no");
    expect(prompt).toMatch(/Never open with "Welcome to this module", "In today's lesson"/);
    expect(prompt).toMatch(/regulatory requirement, financial figure, clinical instruction/);
    const check = narr.narrationIssues(doc, ["p1", "p2"], "editorial");
    const issues = check({
      pages: [
        { id: "p1", script: `Welcome to this module. ${SCRIPT}` },
        { id: "p2", script: `Welcome to this module. ${NEW_SCRIPT}` },
      ],
    }).join(" ");
    expect(issues).toMatch(/opens like a training module/);
    expect(issues).toMatch(/start with the same words/);
    // A shorter introduction is allowed for a page that needs less.
    expect(
      check({
        pages: [
          { id: "p1", script: SCRIPT },
          { id: "p2", script: `Mr Ellis says no. ${SCRIPT}` },
        ],
      }),
    ).toEqual([]);
  });
});

describe("listening figures", () => {
  it("records ids and numbers only, never counts listening towards finishing, and totals by page without naming anyone", () => {
    const p = readGuideDoc({ schema: 2, pages: [page()] }, { draft: true }).pages[0];
    const audio = {
      src: "/api/uploads/0f0e0d0c-0b0a-4908-8706-050403020100.mp3",
      seconds: 30,
      words: null,
      scriptHash: textHash(SCRIPT),
      voice: "profile:editorial",
      at: now.toISOString(),
    };
    const g = course({ script: SCRIPT, status: "approved", basis: pageSnapshot(p), audio });
    mag.publishGuide(db, author, g.id, "", now);
    const r = mag.readGuide(db, learner, g.slug);
    const send = (detail: object) => mag.recordGuideEvent(db, learner, g.id, { event: "introAudio", revisionId: r.revisionId, pageId: "p1", detail }, now);
    send({ action: "play", speed: 1.25, note: "Riley says hi", email: "riley@example.com" });
    send({ action: "speed", speed: 1.5 });
    send({ action: "transcript" });
    send({ action: "listened", seconds: 12.345, percent: 140, who: "riley" });
    send({ action: "replay" });
    send({ action: "complete", speed: "fast" });
    expect(() => send({ action: "skipped" })).toThrow(/Unknown introduction event/);
    expect(() =>
      mag.recordGuideEvent(db, learner, g.id, { event: "introAudio", revisionId: r.revisionId, pageId: "nope", detail: { action: "play" } }, now),
    ).toThrow();
    const rows = db
      .prepare("SELECT event, page_id, block_id, section_id, detail FROM magazine_events WHERE event LIKE 'intro_audio.%' ORDER BY rowid")
      .all() as {
      event: string;
      page_id: string;
      detail: string;
    }[];
    expect(rows.map((x) => x.event)).toEqual([
      "intro_audio.play",
      "intro_audio.speed",
      "intro_audio.transcript",
      "intro_audio.listened",
      "intro_audio.replay",
      "intro_audio.complete",
    ]);
    for (const row of rows) for (const v of Object.values(JSON.parse(row.detail))) expect(typeof v).toBe("number");
    expect(JSON.parse(rows[3].detail)).toEqual({ seconds: 12.3, percent: 100 });
    expect(rows.every((x) => x.page_id === "p1")).toBe(true);
    // Listening isn't working through the page, and finishing doesn't wait for it.
    const after = mag.readGuide(db, learner, g.slug);
    expect(Object.keys(after.progress.answers)).toEqual([]);
    expect(after.progress.finished).toEqual([]);
    const s = stats.introAudioStats(db, author, g.id);
    expect(s.listeners).toBe(1);
    expect(s.pages[0]).toMatchObject({
      pageId: "p1",
      plays: 1,
      listeners: 1,
      seconds: 12,
      percent: 100,
      completed: 1,
      replays: 1,
      transcripts: 1,
      speeds: { "1.5×": 1 },
    });
    // One person: too few to compare with finishing the page.
    expect(s.pages[0].finishedAfterListening).toBeNull();
    expect(JSON.stringify(s)).not.toMatch(/riley/i);
    expect(() => stats.introAudioStats(db, learner, g.id)).toThrow();
  });
});
