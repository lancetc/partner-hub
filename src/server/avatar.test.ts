import { afterEach, beforeAll, beforeEach, describe, expect, it, vi } from "vitest";
import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import { openDb, type Db } from "./db";
import { userById } from "./auth";

/* AI presenter videos: the voice and a portrait become a lip-synced video, with ElevenLabs stood in for. */

vi.mock("./tts", () => ({
  narration: vi.fn(async (text: string) => ({
    audio: Buffer.from("ID3 fake mp3"),
    words: [
      { from: 0, to: 2, start: 0, end: 0.3 },
      { from: 3, to: text.length, start: 0.35, end: 1.6 },
    ],
  })),
}));

const dir = fs.mkdtempSync(path.join(os.tmpdir(), "hub-avatar-"));
let av: typeof import("./avatar");
beforeAll(async () => {
  process.env.HUB_UPLOADS_DIR = dir;
  av = await import("./avatar");
});

let db: Db;
beforeEach(() => {
  db = openDb(":memory:");
  process.env.ELEVENLABS_API_KEY = "test-key";
});
afterEach(() => vi.unstubAllGlobals());
const u = (id: string) => userById(db, id)!;
const now = new Date("2026-10-28T06:00:00Z");
const face = { src: "/images/oldie.jpg", width: 800, height: 1000 };
const json = (body: unknown, status = 200) => new Response(JSON.stringify(body), { status, headers: { "content-type": "application/json" } });
// An MP4 starts with a box size then "ftyp".
const mp4 = Buffer.concat([Buffer.from([0, 0, 0, 0x18]), Buffer.from("ftypisom"), Buffer.alloc(20)]);

describe("presenter face", () => {
  it("is chosen once for the hub, from the image library only", () => {
    expect(av.avatarSettings(db, u("jordan")).portrait).toBeNull();
    expect(() => av.setAvatarPortrait(db, u("sam"), face, now)).toThrow(/authors/);
    expect(() => av.setAvatarPortrait(db, u("jordan"), { src: "https://evil.example/x.jpg", width: 1, height: 1 }, now)).toThrow(/image library/);
    expect(av.setAvatarPortrait(db, u("jordan"), face, now).portrait).toEqual(face);
  });
});

describe("making a presenter video", () => {
  it("sends the voice and the face, then saves the video with captions", async () => {
    let sent: Record<string, { type?: string; mime_type?: string; content_base64?: string } | string> = {};
    let state = "generating";
    vi.stubGlobal(
      "fetch",
      vi.fn(async (url: string | URL, init?: RequestInit) => {
        const s = String(url);
        if (s.endsWith("/v1/flows/video")) {
          sent = JSON.parse(String(init?.body));
          return json({ id: "vid_1", status: "pending" });
        }
        if (s.endsWith("/v1/flows/video/vid_1"))
          return json(
            state === "completed"
              ? { id: "vid_1", status: "completed", content_url: "https://cdn.example.com/v.mp4", content_mime_type: "video/mp4" }
              : { id: "vid_1", status: state },
          );
        if (s.startsWith("https://cdn.example.com/")) return new Response(mp4);
        throw new Error(`unexpected ${s}`);
      }),
    );
    const script = "Hi, I'm Ava.";
    const { id } = await av.startAvatar(db, u("jordan"), { lesson: "legislative-framework", card: "hook", script, portrait: face }, now);
    expect(sent.model_id).toBe("creatify-aurora");
    expect(sent.resolution).toBe("720p");
    expect(sent.audio).toMatchObject({ type: "inline_base64", mime_type: "audio/mpeg" });
    expect(sent.image).toMatchObject({ type: "inline_base64", mime_type: "image/jpeg" });

    expect((await av.checkAvatar(db, u("jordan"), id, now)).status).toBe("generating");
    state = "completed";
    const done = await av.checkAvatar(db, u("jordan"), id, now);
    expect(done.status).toBe("completed");
    if (done.status !== "completed") return;
    expect(done.video).toMatchObject({
      provider: "elevenlabs",
      orientation: "portrait",
      poster: face.src,
      scriptHash: av.scriptHash(script),
      captions: { spoken: script },
      durationSec: 2,
    });
    expect(done.video.src).toMatch(/^\/api\/uploads\/.+\.mp4$/);
  });

  it("gives the same fingerprint however the script is spaced", () => {
    expect(av.scriptHash("Hi  there,\n Ava. ")).toBe(av.scriptHash("Hi there, Ava."));
    expect(av.scriptHash("Hi there, Ava.")).not.toBe(av.scriptHash("Hi there, Bob."));
  });

  it("needs a script and a face from the library", async () => {
    await expect(av.startAvatar(db, u("jordan"), { lesson: "l", card: "c", script: "", portrait: face }, now)).rejects.toThrow(/script/);
    await expect(av.startAvatar(db, u("jordan"), { lesson: "l", card: "c", script: "A long enough script here.", portrait: null }, now)).rejects.toThrow(
      /face/,
    );
    await expect(av.startAvatar(db, u("sam"), { lesson: "l", card: "c", script: "A long enough script here.", portrait: face }, now)).rejects.toThrow(
      /authors/,
    );
  });

  it("explains a missing plan", async () => {
    vi.stubGlobal(
      "fetch",
      vi.fn(async () => json({ detail: { code: "paid_plan_required" } }, 402)),
    );
    await expect(av.startAvatar(db, u("jordan"), { lesson: "l", card: "c", script: "A long enough script here.", portrait: face }, now)).rejects.toThrow(
      /Pro plan/,
    );
  });
});
