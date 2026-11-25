import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { openDb, type Db } from "./db";
import { userById } from "./auth";

// The video file itself: any bytes will do, ElevenLabs is stood in for below.
vi.mock("./uploads", async (real) => ({
  ...(await real<typeof import("./uploads")>()),
  readUpload: () => ({ body: Buffer.from("video"), mime: "video/mp4", name: "ava.mp4" }),
}));

const { avaVideoFor, hearAvaVideo, saveAvaWords } = await import("./ava");

/* Fill in from the video: ElevenLabs listens to an uploaded transmission and writes out what Ava says, word by word, timed. */

let db: Db;
const now = new Date("2026-11-22T00:00:00Z");
const SRC = "/api/uploads/00000000-0000-0000-0000-000000000001.mp4";

let key: string;
beforeEach(() => {
  db = openDb(":memory:");
  vi.stubEnv("ELEVENLABS_API_KEY", "test-key");
  // One of Ava's lines: an uploaded video needs only its row here (Discovery Paths aren't hers any more, Nov 2026).
  key = "magazine:mag-h:page:p1";
  db.prepare(
    "INSERT INTO ava_videos (key, script_hash, voice, portrait, status, video_src, seconds, created_by, created_at) VALUES (?, 'x', 'upload', '', 'completed', ?, 4, 'dana', ?)",
  ).run(key, SRC, now.toISOString());
});
afterEach(() => {
  vi.unstubAllEnvs();
  vi.unstubAllGlobals();
});

const heard = {
  text: "Ava here. Signal's patchy —",
  words: [
    { text: "Ava", start: 0.1, end: 0.4, type: "word" },
    { text: " ", start: 0.4, end: 0.45, type: "spacing" },
    { text: "here.", start: 0.45, end: 0.9, type: "word" },
    { text: " ", start: 0.9, end: 1.2, type: "spacing" },
    { text: "(static)", start: 1.2, end: 1.6, type: "audio_event" },
    { text: " ", start: 1.6, end: 1.7, type: "spacing" },
    { text: "Signal's", start: 1.7, end: 2.2, type: "word" },
    { text: " ", start: 2.2, end: 2.25, type: "spacing" },
    { text: "patchy", start: 2.25, end: 2.8, type: "word" },
    { text: " ", start: 2.8, end: 2.85, type: "spacing" },
    { text: "—", start: 2.85, end: 3, type: "word" },
  ],
};

describe("filling in a video's script from the video", () => {
  it("saves what ElevenLabs hears as the script, each word timed to her voice, so learners see it as she says it", async () => {
    const calls: FormData[] = [];
    vi.stubGlobal(
      "fetch",
      vi.fn(async (_url: string, init: RequestInit) => {
        calls.push(init.body as FormData);
        return Response.json(heard);
      }),
    );
    const line = await hearAvaVideo(db, userById(db, "dana")!, key, now);
    expect(calls[0].get("model_id")).toBe("scribe_v2");
    expect(calls[0].get("timestamps_granularity")).toBe("word");
    expect(line).toMatchObject({ transcript: "Ava here. Signal's patchy —", timing: "aligned", state: "ready" });
    const video = (await avaVideoFor(db, key))!;
    expect(video.words!.map((w) => video.transcript!.slice(w.from, w.to))).toEqual(["Ava", "here.", "Signal's", "patchy", "—"]);
    expect(video.words![2]).toMatchObject({ start: 1.7, end: 2.2 });

    // A misheard word corrected keeps every word's time.
    const fixed = await saveAvaWords(db, userById(db, "dana")!, key, "Ava here. Signal’s patchy —", now);
    expect(fixed).toMatchObject({ timing: "aligned" });
    expect((await avaVideoFor(db, key))!.words![2]).toMatchObject({ start: 1.7, end: 2.2 });
  });

  it("falls back to the first Scribe model, says plainly when the key lacks the permission, and is for authors only", async () => {
    const models: unknown[] = [];
    vi.stubGlobal(
      "fetch",
      vi.fn(async (_url: string, init: RequestInit) => {
        const model = (init.body as FormData).get("model_id");
        models.push(model);
        return model === "scribe_v2" ? new Response("invalid model_id", { status: 422 }) : Response.json(heard);
      }),
    );
    await hearAvaVideo(db, userById(db, "dana")!, key, now);
    expect(models).toEqual(["scribe_v2", "scribe_v1"]);

    vi.stubGlobal(
      "fetch",
      vi.fn(
        async () =>
          new Response(JSON.stringify({ detail: { status: "missing_permissions", message: "missing the permission speech_to_text" } }), { status: 401 }),
      ),
    );
    await expect(hearAvaVideo(db, userById(db, "dana")!, key, now)).rejects.toThrow(/Speech to Text permission/);
    await expect(hearAvaVideo(db, userById(db, "riley")!, key, now)).rejects.toThrow();
    await expect(hearAvaVideo(db, userById(db, "dana")!, "path:no-video", now)).rejects.toThrow(/Upload the video first/);
  });
});
