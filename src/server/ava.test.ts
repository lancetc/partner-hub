import { beforeEach, describe, expect, it, vi } from "vitest";
import { openDb, type Db } from "./db";
import { userById } from "./auth";
import { attachAvaVideo, avaForLearners, avaLineFor, avaLines, avaVideoFor, avaVoice, makeAvaVideo, removeAvaVideo, saveAvaWords, voiceByName } from "./ava";
import { saveIdentity } from "./learningGuide";
import { avaSpeaks, scriptFor } from "./tts";
import { editorLesson, saveDraft } from "./authoredLessons";

/* Ava 2.0: her identity by default, the voice found by name, and the lines she speaks. */

let db: Db;
const now = new Date("2026-11-22T00:00:00Z");

beforeEach(() => {
  db = openDb(":memory:");
  vi.unstubAllEnvs();
});

describe("Ava's voice", () => {
  const voices = [
    { id: "aaaaaaaaaaaaaaaaaaaa", name: "Laura - Enthusiast, Quirky Attitude" },
    { id: "bbbbbbbbbbbbbbbbbbbb", name: "Addison 2.0 - Warm and Clear" },
    { id: "cccccccccccccccccccc", name: "Addison" },
  ];

  it("is found by the name it's given: an exact name first, then one that starts with it", () => {
    expect(voiceByName(voices, "Addison")).toBe("cccccccccccccccccccc");
    expect(voiceByName(voices, "addison 2.0")).toBe("bbbbbbbbbbbbbbbbbbbb");
    expect(voiceByName(voices, "Laura")).toBe("aaaaaaaaaaaaaaaaaaaa");
    expect(voiceByName(voices, "Claire")).toBeUndefined();
    expect(voiceByName(voices, "  ")).toBeUndefined();
  });

  it("is OpenAI's Alloy until an administrator sets another: the same voice as the Topics' narrator", async () => {
    vi.stubEnv("AVA_VOICE_ID", "");
    expect(await avaVoice(db)).toBe("openai:alloy");
  });

  it("uses a voice id or an OpenAI voice as given, and AVA_VOICE_ID over everything", async () => {
    const owner = userById(db, "jordan")!;
    saveIdentity(db, owner, { name: "Ava", intro: "Meet {name}, your AI learning guide.", voiceRef: "dddddddddddddddddddd" }, now);
    expect(await avaVoice(db)).toBe("dddddddddddddddddddd");
    saveIdentity(db, owner, { name: "Ava", intro: "Meet {name}, your AI learning guide.", voiceRef: "openai:shimmer" }, now);
    expect(await avaVoice(db)).toBe("openai:shimmer");
    vi.stubEnv("AVA_VOICE_ID", "eeeeeeeeeeeeeeeeeeee");
    expect(await avaVoice(db)).toBe("eeeeeeeeeeeeeeeeeeee");
  });
});

describe("Ava for learners", () => {
  it("is Ava by default, with the Topic presenter's still until a portrait is set", () => {
    expect(avaForLearners(db)).toEqual({ name: "Ava", portrait: "/images/presenter-intro.jpg" });
  });
});

describe("the lines Ava speaks", () => {
  it("reads a Discovery Path's description as its introduction, and a Topic's presenter card", () => {
    const path = db.prepare("SELECT id, description FROM learning_paths WHERE archived = 0 AND description != '' LIMIT 1").get() as {
      id: string;
      description: string;
    };
    expect(scriptFor(db, `path:${path.id}`)).toBe(path.description.trim());
    expect(avaSpeaks(db, `path:${path.id}`)).toBe(true);
    expect(avaSpeaks(db, "lesson:a-little-extra-time:welcome")).toBe(true);
    // Other cards stay with the Hub's narrator.
    expect(avaSpeaks(db, "lesson:a-little-extra-time:check")).toBe(false);
    expect(() => scriptFor(db, "path:no-such-path")).toThrow(/No narration/);
  });

  it("includes, for authors, a presenter card added to the draft of a Topic that's already published", async () => {
    const author = userById(db, "dana")!;
    const draft = editorLesson(db, "a-little-extra-time")!.lesson;
    draft.nodes["presenter-new"] = {
      ...structuredClone(draft.nodes.welcome),
      id: "presenter-new",
      transcript: "Ava here, from the new card.",
    } as typeof draft.nodes.welcome;
    saveDraft(db, author, "a-little-extra-time", draft, now);
    const key = "lesson:a-little-extra-time:presenter-new";
    // Learners only ever get what's published; the editor sees the draft.
    expect(avaSpeaks(db, key)).toBe(false);
    expect(avaSpeaks(db, key, true)).toBe(true);
    expect(scriptFor(db, key, true)).toBe("Ava here, from the new card.");
    expect(await avaLineFor(db, author, key)).toMatchObject({ key, state: "none" });
  });
});

describe("a Magazine course's introduction", () => {
  it("is the approved Audio Guide script of the published edition, read by Ava; a draft only for authors", () => {
    const at = new Date().toISOString();
    const doc = (status: string) => JSON.stringify({ schema: 2, pages: [], audio: { intro: { status, script: "  Ready for your first shift? Good.  " } } });
    db.prepare(
      "INSERT INTO magazine_guides (id, slug, title, status, draft, draft_saved_at, revision_id, owner, created_at, updated_by, updated_at) VALUES ('mag-t', 'ava-test', 'T', 'published', ?, ?, 'mag-t-r1', 'jordan', ?, 'jordan', ?)",
    ).run(doc("approved"), at, at, at);
    db.prepare(
      "INSERT INTO magazine_revisions (id, guide_id, number, title, standfirst, doc, completion, minutes, published_by, published_at) VALUES ('mag-t-r1', 'mag-t', 1, 'T', '', ?, 'confirm', 1, 'jordan', ?)",
    ).run(doc("draft"), at);
    // The published script isn't approved: learners get nothing; an author previewing hears the approved draft.
    expect(() => scriptFor(db, "magazine:mag-t:intro")).toThrow(/No narration/);
    expect(scriptFor(db, "magazine:mag-t:intro", true)).toBe("Ready for your first shift? Good.");
    db.prepare("UPDATE magazine_revisions SET doc = ? WHERE id = 'mag-t-r1'").run(doc("approved"));
    expect(scriptFor(db, "magazine:mag-t:intro")).toBe("Ready for your first shift? Good.");
    expect(avaSpeaks(db, "magazine:mag-t:intro")).toBe(true);
  });
});

describe("Ava's talking videos", () => {
  it("are played only while the script, the voice and the portrait still match", async () => {
    const owner = userById(db, "jordan")!;
    const path = db.prepare("SELECT id, description FROM learning_paths WHERE archived = 0 AND description != '' LIMIT 1").get() as {
      id: string;
      description: string;
    };
    const key = `path:${path.id}`;
    const at = new Date().toISOString();
    const { scriptHash } = await import("./avatar");
    const voice = (await avaVoice(db))!;
    const insert = (hash: string) =>
      db
        .prepare(
          "INSERT OR REPLACE INTO ava_videos (key, script_hash, voice, portrait, generation_id, status, video_src, created_by, created_at) VALUES (?, ?, ?, ?, 'g1', 'completed', '/api/uploads/v.mp4', 'jordan', ?)",
        )
        .run(key, hash, voice, "/images/presenter-intro.jpg", at);
    expect(await avaVideoFor(db, key)).toBeNull();
    insert(scriptHash(path.description));
    expect(await avaVideoFor(db, key)).toEqual({ src: "/api/uploads/v.mp4", poster: "/images/presenter-intro.jpg", transcript: null, words: null });
    // The words changed: out of date, so learners get the portrait and her voice instead.
    insert(scriptHash("Other words."));
    expect(await avaVideoFor(db, key)).toBeNull();
    // A new portrait (say, a still of Laura): out of date too.
    insert(scriptHash(path.description));
    saveIdentity(db, owner, { name: "Ava", intro: "Meet {name}, your AI learning guide.", voiceRef: voice, portrait: "/images/hero-video-call.webp" }, now);
    expect(await avaVideoFor(db, key)).toBeNull();
  });

  it("are listed for authors with each line's state, and only authors make them", async () => {
    const learner = userById(db, "riley")!;
    const author = userById(db, "dana")!;
    await expect(avaLines(db, learner)).rejects.toThrow();
    const { lines } = await avaLines(db, author);
    expect(lines.some((l) => l.kind === "path" && l.state === "none")).toBe(true);
    await expect(makeAvaVideo(db, author, "lesson:nope:nope", now)).rejects.toThrow(/isn’t one of Ava’s lines/);
  });
});

describe("uploaded videos", () => {
  it("need only match the words, show their own first frame, and must be a video in the library", async () => {
    const author = userById(db, "dana")!;
    const path = db.prepare("SELECT id, description FROM learning_paths WHERE archived = 0 AND description != '' LIMIT 1").get() as {
      id: string;
      description: string;
    };
    const key = `path:${path.id}`;
    const { scriptHash } = await import("./avatar");
    const at = new Date().toISOString();
    await expect(attachAvaVideo(db, author, key, "/api/uploads/00000000-0000-0000-0000-000000000000.mp4", now)).rejects.toThrow(/Upload the video/);
    await expect(attachAvaVideo(db, author, key, "https://example.com/v.mp4", now)).rejects.toThrow(/Upload the video/);
    const insert = (hash: string) =>
      db
        .prepare(
          "INSERT OR REPLACE INTO ava_videos (key, script_hash, voice, portrait, status, video_src, created_by, created_at) VALUES (?, ?, 'upload', '', 'completed', '/api/uploads/v.mp4', 'dana', ?)",
        )
        .run(key, hash, at);
    insert(scriptHash(path.description));
    // Its own face and voice: a new portrait or voice for Ava doesn't put it out of date.
    saveIdentity(
      db,
      userById(db, "jordan")!,
      { name: "Ava", intro: "Meet {name}, your AI learning guide.", voiceRef: "openai:shimmer", portrait: "/images/hero-video-call.webp" },
      now,
    );
    expect(await avaVideoFor(db, key)).toEqual({ src: "/api/uploads/v.mp4", poster: null, transcript: null, words: null });
    // New words do.
    insert(scriptHash("Something else."));
    expect(await avaVideoFor(db, key)).toBeNull();
    expect((await removeAvaVideo(db, author, key, now)).state).toBe("none");
  });

  it("can be given to a Magazine page's introduction", () => {
    const at = new Date().toISOString();
    const doc = JSON.stringify({
      schema: 2,
      pages: [
        { id: "p1", narration: { status: "approved", script: "Page one, said by Ava." } },
        { id: "p2", narration: { status: "draft", script: "Not yet." } },
      ],
    });
    db.prepare(
      "INSERT INTO magazine_guides (id, slug, title, status, draft, draft_saved_at, revision_id, owner, created_at, updated_by, updated_at) VALUES ('mag-p', 'p', 'P', 'published', ?, ?, 'mag-p-r1', 'jordan', ?, 'jordan', ?)",
    ).run(doc, at, at, at);
    db.prepare(
      "INSERT INTO magazine_revisions (id, guide_id, number, title, standfirst, doc, completion, minutes, published_by, published_at) VALUES ('mag-p-r1', 'mag-p', 1, 'P', '', ?, 'confirm', 1, 'jordan', ?)",
    ).run(doc, at);
    expect(scriptFor(db, "magazine:mag-p:page:p1")).toBe("Page one, said by Ava.");
    expect(() => scriptFor(db, "magazine:mag-p:page:p2")).toThrow(/No narration/);
    expect(avaSpeaks(db, "magazine:mag-p:page:p1")).toBe(true);
  });
});

describe("an uploaded transmission with its own words", () => {
  it("plays whatever the line's script now says, and its words are the ones learners read", async () => {
    const path = db.prepare("SELECT id FROM learning_paths WHERE archived = 0 AND description != '' LIMIT 1").get() as { id: string };
    const key = `path:${path.id}`;
    const words = "Ava, from a servo outside Dalby. The pie's terrible and the signal's worse, so, quickly —";
    db.prepare(
      "INSERT OR REPLACE INTO ava_videos (key, script_hash, voice, portrait, status, video_src, created_by, created_at, transcript) VALUES (?, 'an-old-script', 'upload', '', 'completed', '/api/uploads/t.mp4', 'dana', ?, ?)",
    ).run(key, new Date().toISOString(), words);
    expect(await avaVideoFor(db, key)).toEqual({ src: "/api/uploads/t.mp4", poster: null, transcript: words, words: null });
    const { lines } = await avaLines(db, userById(db, "dana")!);
    expect(lines.find((l) => l.key === key)).toMatchObject({ state: "ready", uploaded: true, transcript: words });
  });
});

describe("Ava's video in the Magazine editor", () => {
  it("can go on a page with no Audio guide script only with its own words, and is looked up one line at a time", async () => {
    const author = userById(db, "dana")!;
    const at = new Date().toISOString();
    const doc = JSON.stringify({ schema: 2, pages: [{ id: "p1" }, { id: "p2" }] });
    db.prepare(
      "INSERT INTO magazine_guides (id, slug, title, status, draft, draft_saved_at, revision_id, owner, created_at, updated_by, updated_at) VALUES ('mag-e', 'e', 'E', 'published', ?, ?, 'mag-e-r1', 'jordan', ?, 'jordan', ?)",
    ).run(doc, at, at, at);
    db.prepare(
      "INSERT INTO magazine_revisions (id, guide_id, number, title, standfirst, doc, completion, minutes, published_by, published_at) VALUES ('mag-e-r1', 'mag-e', 1, 'E', '', ?, 'confirm', 1, 'jordan', ?)",
    ).run(doc, at);
    // The file check comes first, so a made-up file is refused either way.
    await expect(attachAvaVideo(db, author, "magazine:mag-e:page:p1", "/api/uploads/00000000-0000-0000-0000-000000000000.mp4", now)).rejects.toThrow(
      /Upload the video/,
    );
    // With its own words it stands, Audio guide script or not.
    db.prepare(
      "INSERT INTO ava_videos (key, script_hash, voice, portrait, status, video_src, created_by, created_at, transcript) VALUES ('magazine:mag-e:page:p1', '', 'upload', '', 'completed', '/api/uploads/w.mp4', 'dana', ?, 'Ava, from Roma —')",
    ).run(at);
    expect(await avaLineFor(db, author, "magazine:mag-e:page:p1")).toMatchObject({
      state: "ready",
      src: "/api/uploads/w.mp4",
      transcript: "Ava, from Roma —",
      uploaded: true,
    });
    expect(await avaLineFor(db, author, "magazine:mag-e:page:p2")).toMatchObject({ state: "none", src: null });
    await expect(avaLineFor(db, userById(db, "riley")!, "magazine:mag-e:page:p1")).rejects.toThrow();
  });
});

describe("the words on screen", () => {
  it("are timed again when an uploaded video's script changes, evenly across its length without ElevenLabs", async () => {
    const path = db.prepare("SELECT id FROM learning_paths WHERE archived = 0 AND description != '' LIMIT 1").get() as { id: string };
    const key = `path:${path.id}`;
    db.prepare(
      "INSERT INTO ava_videos (key, script_hash, voice, portrait, status, video_src, seconds, created_by, created_at, transcript) VALUES (?, '', 'upload', '', 'completed', '/api/uploads/00000000-0000-0000-0000-000000000001.mp4', 12, 'dana', ?, 'Old words —')",
    ).run(key, new Date().toISOString());
    const said = "Ava here, Roma, finally. Someone just tried to give me a jar of quince paste —";
    const line = await saveAvaWords(db, userById(db, "dana")!, key, said, now);
    expect(line).toMatchObject({ transcript: said, timing: "estimated", state: "ready" });
    const video = (await avaVideoFor(db, key))!;
    expect(video.words?.length).toBe(said.split(/\s+/).length);
    expect(said.slice(video.words![1].from, video.words![1].to)).toBe("here,");
    expect(video.words!.at(-1)!.end).toBeLessThanOrEqual(12);
    await expect(saveAvaWords(db, userById(db, "dana")!, "path:no-video", "x", now)).rejects.toThrow(/Upload the video first/);
  });
});
