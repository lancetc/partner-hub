import { afterEach, beforeAll, beforeEach, describe, expect, it, vi } from "vitest";
import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import { openDb, type Db } from "./db";
import { userById } from "./auth";

/* AI poster pictures through ElevenLabs, with ElevenLabs stood in for by a fake. */

const dir = fs.mkdtempSync(path.join(os.tmpdir(), "hub-imagegen-"));
let gen: typeof import("./imageGen");
beforeAll(async () => {
  process.env.HUB_UPLOADS_DIR = dir;
  gen = await import("./imageGen");
});

let db: Db;
beforeEach(() => {
  db = openDb(":memory:");
  process.env.ELEVENLABS_API_KEY = "test-key";
});
afterEach(() => vi.unstubAllGlobals());
const u = (id: string) => userById(db, id)!;
const now = new Date("2026-10-28T05:00:00Z");

// A 1200 × 750 PNG header (enough for its size to be read).
const png = new Uint8Array(40);
png.set([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a, 0, 0, 0, 13, 0x49, 0x48, 0x44, 0x52, 0, 0, 0x04, 0xb0, 0, 0, 0x02, 0xee]);

const json = (body: unknown, status = 200) => new Response(JSON.stringify(body), { status, headers: { "content-type": "application/json" } });
const good = { prompt: "An older man in his garden", model: "gemini-3-pro-image", aspect: "16:9", resolution: "2K" };

describe("image generation settings", () => {
  it("sends only the settings each model takes", () => {
    expect(gen.requestFor({ ...good, houseStyle: false }).body).toEqual({
      model_id: "gemini-3-pro-image",
      prompt: "An older man in his garden",
      aspect_ratio: "16:9",
      resolution: "2K",
    });
    const gpt = gen.requestFor({ prompt: "A kitchen", model: "gpt-image-1.5", aspect: "3:2" }).body;
    expect(gpt).toEqual({ model_id: "gpt-image-1.5", prompt: "A kitchen", aspect_ratio: "3:2", quality: "medium" });
    expect(gen.requestFor({ prompt: "A kitchen", model: "gemini-3.1-flash-lite-image", aspect: "1:1", resolution: "2K" }).body.resolution).toBeUndefined();
  });

  it("adds the house style when asked", () => {
    expect(gen.requestFor({ ...good, houseStyle: true }).body.prompt).toMatch(/^An older man in his garden\n\nWarm, natural documentary/);
  });

  it("refuses unknown models, shapes and empty prompts", () => {
    expect(() => gen.requestFor({ ...good, model: "dall-e-9" })).toThrow(/Choose an image model/);
    expect(() => gen.requestFor({ ...good, model: "gpt-image-1.5", aspect: "16:9" })).toThrow(/can’t make that shape/);
    expect(() => gen.requestFor({ ...good, resolution: "4K" })).toThrow(/size/);
    expect(() => gen.requestFor({ ...good, prompt: " " })).toThrow(/Describe/);
  });

  it("reads picture sizes from PNG and WebP headers", () => {
    expect(gen.imageSize(png)).toEqual({ width: 1200, height: 750 });
    const webp = new Uint8Array(32);
    webp.set(new TextEncoder().encode("RIFF\0\0\0\0WEBPVP8X"));
    webp.set([0xff, 0x03, 0x00, 0xed, 0x02, 0x00], 24);
    expect(gen.imageSize(webp)).toEqual({ width: 1024, height: 750 });
  });
});

describe("making a picture", () => {
  it("starts, waits, then copies the finished picture into the library once", async () => {
    const calls: string[] = [];
    let state = "generating";
    vi.stubGlobal(
      "fetch",
      vi.fn(async (url: string | URL, init?: RequestInit) => {
        const s = String(url);
        calls.push(`${init?.method ?? "GET"} ${s}`);
        if (s.endsWith("/v1/flows/image")) {
          expect((init?.headers as Record<string, string>)["xi-api-key"]).toBe("test-key");
          return json({ id: "gen_123", status: "pending" });
        }
        if (s.endsWith("/v1/flows/image/gen_123"))
          return json(
            state === "completed"
              ? { id: "gen_123", status: "completed", content_url: "https://cdn.example.com/x.png?sig=1", content_mime_type: "image/png" }
              : { id: "gen_123", status: state },
          );
        if (s.startsWith("https://cdn.example.com/")) return new Response(png);
        throw new Error(`unexpected ${s}`);
      }),
    );
    expect(() => gen.imageGenOptions(u("sam"))).toThrow(/authors/);
    const { id } = await gen.startGeneration(db, u("jordan"), { ...good, lesson: "legislative-framework" }, now);
    expect(id).toBe("gen_123");
    expect((await gen.checkGeneration(db, u("jordan"), id, now)).status).toBe("generating");
    state = "completed";
    const done = await gen.checkGeneration(db, u("jordan"), id, now);
    expect(done).toMatchObject({ status: "completed", photo: { width: 1200, height: 750 } });
    // Asking again doesn't download it a second time.
    const downloads = calls.filter((c) => c.includes("cdn.example.com")).length;
    await gen.checkGeneration(db, u("jordan"), id, now);
    expect(calls.filter((c) => c.includes("cdn.example.com")).length).toBe(downloads);
  });

  it("explains ElevenLabs refusals", async () => {
    vi.stubGlobal(
      "fetch",
      vi.fn(async () => json({ detail: { status: "quota_exceeded", message: "This request exceeds your quota." } }, 401)),
    );
    await expect(gen.startGeneration(db, u("jordan"), good, now)).rejects.toThrow(/out of credits/);
    vi.stubGlobal(
      "fetch",
      vi.fn(async () => json({ detail: { code: "paid_plan_required" } }, 402)),
    );
    await expect(gen.startGeneration(db, u("jordan"), good, now)).rejects.toThrow(/Pro plan/);
  });

  it("reports a moderated picture without charging", async () => {
    vi.stubGlobal(
      "fetch",
      vi.fn(async (url: string | URL) =>
        String(url).endsWith("/image") ? json({ id: "gen_9", status: "pending" }) : json({ id: "gen_9", status: "failed", failure_reason: "moderated" }),
      ),
    );
    const { id } = await gen.startGeneration(db, u("jordan"), good, now);
    expect(await gen.checkGeneration(db, u("jordan"), id, now)).toMatchObject({ status: "failed", error: expect.stringMatching(/content rules/) });
  });
});
