import { describe, expect, it } from "vitest";
import { activityDone, GuideDocError, embedLink, embedSrc, parseEmbedLink, publishChecks, readGuideDoc, videoOf } from "./magazine";

/* Magazine video blocks on YouTube and Vimeo: reading the links people paste, what's kept, and what publishing needs. */

const withVideo = (video: object): unknown => ({
  schema: 2,
  pages: [
    {
      id: "p1",
      title: "",
      purpose: "",
      template: "blank",
      kind: "content",
      required: true,
      sections: [{ id: "s", title: "S", blocks: [{ id: "v", type: "video", title: "Clip", transcript: "Words.", ...video }] }],
    },
  ],
});

describe("YouTube and Vimeo links", () => {
  it("reads the usual YouTube shapes, Shorts included", () => {
    expect(parseEmbedLink("https://www.youtube.com/watch?v=dQw4w9WgXcQ&t=30s")).toEqual({ provider: "youtube", id: "dQw4w9WgXcQ" });
    expect(parseEmbedLink("youtu.be/dQw4w9WgXcQ")).toEqual({ provider: "youtube", id: "dQw4w9WgXcQ" });
    expect(parseEmbedLink("https://www.youtube.com/shorts/abcDEF12345")).toEqual({ provider: "youtube", id: "abcDEF12345", portrait: true });
  });

  it("reads Vimeo links, keeping the private part of an unlisted one", () => {
    expect(parseEmbedLink("https://vimeo.com/76979871")).toEqual({ provider: "vimeo", id: "76979871" });
    expect(parseEmbedLink("vimeo.com/76979871/8272103f6e")).toEqual({ provider: "vimeo", id: "76979871", hash: "8272103f6e" });
    expect(parseEmbedLink("https://player.vimeo.com/video/76979871?h=8272103f6e&badge=0")).toEqual({ provider: "vimeo", id: "76979871", hash: "8272103f6e" });
    expect(parseEmbedLink("https://vimeo.com/channels/staffpicks/76979871")).toEqual({ provider: "vimeo", id: "76979871" });
    expect(parseEmbedLink("https://vimeo.com/showcase/123/video/76979871")).toMatchObject({ id: "76979871" });
  });

  it("reads Loom share and embed links, and plays them without Loom's share buttons", () => {
    const id = "a4c993b957ae4b94bf170beb7c665bc8";
    expect(parseEmbedLink(`https://www.loom.com/share/${id}`)).toEqual({ provider: "loom", id });
    expect(parseEmbedLink(`loom.com/share/${id}?sid=123`)).toEqual({ provider: "loom", id });
    expect(parseEmbedLink(`https://www.loom.com/embed/${id}`)).toEqual({ provider: "loom", id });
    expect(parseEmbedLink("https://www.loom.com/share/not-a-video")).toBeNull();
    expect(parseEmbedLink(`https://www.loom.com/looms/${id}`)).toBeNull();
    expect(embedSrc({ provider: "loom", id })).toBe(`https://www.loom.com/embed/${id}?hide_owner=true&hide_share=true&hide_title=true&hideEmbedTopBar=true`);
    expect(embedLink({ provider: "loom", id })).toBe(`https://www.loom.com/share/${id}`);
    const d = readGuideDoc(withVideo({ embed: { provider: "loom", id, url: "https://evil.example" }, captionsOnPlayer: true }));
    expect(d.pages[0].sections[0].blocks[0]).toMatchObject({ embed: { provider: "loom", id } });
    expect(() => readGuideDoc(withVideo({ embed: { provider: "loom", id: "../../x" } }))).toThrow(GuideDocError);
  });

  it("turns away anything else", () => {
    for (const link of [
      "",
      "https://vimeo.com/about",
      "https://example.com/76979871",
      "https://www.youtube.com/watch?v=short",
      "not a link",
      "javascript:alert(1)",
    ])
      expect(parseEmbedLink(link)).toBeNull();
  });

  it("plays YouTube without tracking cookies and Vimeo with Do Not Track, captions on", () => {
    expect(embedSrc({ provider: "youtube", id: "dQw4w9WgXcQ" })).toBe(
      "https://www.youtube-nocookie.com/embed/dQw4w9WgXcQ?rel=0&playsinline=1&modestbranding=1&cc_load_policy=1",
    );
    expect(embedSrc({ provider: "vimeo", id: "76979871", hash: "8272103f6e" })).toBe("https://player.vimeo.com/video/76979871?h=8272103f6e&dnt=1&texttrack=en");
    expect(embedLink({ provider: "vimeo", id: "76979871", hash: "8272103f6e" })).toBe("https://vimeo.com/76979871/8272103f6e");
  });
});

describe("a video block on YouTube or Vimeo", () => {
  it("keeps only the site and the video's id, and needs no uploaded file", () => {
    const d = readGuideDoc(
      withVideo({
        src: "/api/uploads/x.mp4",
        embed: { provider: "vimeo", id: "76979871", hash: "8272103f6e", url: "https://evil.example" },
        captionsOnPlayer: true,
      }),
    );
    expect(d.pages[0].sections[0].blocks[0]).toEqual({
      id: "v",
      type: "video",
      title: "Clip",
      src: "",
      embed: { provider: "vimeo", id: "76979871", hash: "8272103f6e" },
      captionsOnPlayer: true,
      transcript: "Words.",
    });
  });

  it("refuses an id that isn't a video on those sites", () => {
    for (const embed of [
      { provider: "youtube", id: "<script>" },
      { provider: "vimeo", id: "abc" },
      { provider: "dailymotion", id: "x8a" },
      { provider: "vimeo", id: "76979871", hash: "../../x" },
    ])
      expect(() => readGuideDoc(withVideo({ embed }))).toThrow(GuideDocError);
  });

  it("holds publishing until the author confirms it has captions there", () => {
    const without = readGuideDoc(withVideo({ embed: { provider: "youtube", id: "dQw4w9WgXcQ" } }));
    expect(publishChecks(without, "confirm").blocking.join(" ")).toMatch(/confirm the video has captions on YouTube/);
    const confirmed = readGuideDoc(withVideo({ embed: { provider: "youtube", id: "dQw4w9WgXcQ" }, captionsOnPlayer: true }));
    expect(publishChecks(confirmed, "confirm").blocking).toEqual([]);
    const noTranscript = readGuideDoc(withVideo({ embed: { provider: "youtube", id: "dQw4w9WgXcQ" }, captionsOnPlayer: true, transcript: "" }));
    expect(publishChecks(noTranscript, "confirm").blocking.join(" ")).toMatch(/add a transcript/);
  });
});

describe("a video recorded in the studio", () => {
  const recorded = (extra: object = {}) =>
    withVideo({ src: "/api/uploads/0f8e7d6c-5b4a-4321-8fed-cba987654321.webm", captions: "/api/uploads/0f8e7d6c-5b4a-4321-8fed-cba987654322.vtt", ...extra });

  it("keeps the part that plays and how it was recorded", () => {
    const d = readGuideDoc(
      recorded({ trim: { start: 1.234, end: 42.06 }, recording: { mode: "screen", at: "2026-11-19T02:00:00Z", seconds: 45.27, consent: true, by: "x" } }),
    );
    expect(d.pages[0].sections[0].blocks[0]).toMatchObject({
      trim: { start: 1.2, end: 42.1 },
      recording: { mode: "screen", at: "2026-11-19T02:00:00.000Z", seconds: 45.3, consent: true },
    });
    expect(d.pages[0].sections[0].blocks[0]).not.toHaveProperty("recording.by");
    // A trim that ends before it starts is dropped.
    expect(readGuideDoc(recorded({ trim: { start: 9, end: 3 } })).pages[0].sections[0].blocks[0]).not.toHaveProperty("trim");
  });

  it("won't publish until the author confirms everyone shown agreed", () => {
    const checks = (consent: boolean) =>
      publishChecks(
        readGuideDoc(recorded({ recording: { mode: "camera", at: "2026-11-19T02:00:00Z", seconds: 30, consent } }), { draft: true }),
        "confirm",
      ).blocking.join(" ");
    expect(checks(false)).toMatch(/everyone who appears agreed/);
    expect(checks(true)).not.toMatch(/agreed/);
  });
});

const withTextMedia = (block: object): unknown => ({
  schema: 2,
  pages: [
    {
      id: "p1",
      title: "",
      purpose: "",
      template: "blank",
      kind: "content",
      required: true,
      sections: [{ id: "s", title: "S", blocks: [{ id: "tm", type: "textMedia", heading: "Meet Sam", body: "Sam explains the first visit.", layout: "media-right", ...block }] }],
    },
  ],
});

describe("a video in a text-and-media block", () => {
  it("keeps the video's own settings, no picture needed, titled from the heading if it has no title", () => {
    const doc = readGuideDoc(withTextMedia({ media: { src: "" }, video: { embed: { provider: "youtube", id: "dQw4w9WgXcQ" }, transcript: "Hello." } }));
    const b = doc.pages[0].sections[0].blocks[0];
    if (b.type !== "textMedia") throw new Error("expected text and media");
    expect(b.video).toEqual({ title: "Meet Sam", src: "", embed: { provider: "youtube", id: "dQw4w9WgXcQ" }, transcript: "Hello." });
    expect(b.media).toEqual({ src: "", alt: "" });
    expect(videoOf(b)).toMatchObject({ id: "tm", type: "video", title: "Meet Sam" });
  });

  it("is checked before publishing just like a video block, and its picture isn't", () => {
    const doc = readGuideDoc(withTextMedia({ media: { src: "" }, video: { embed: { provider: "vimeo", id: "76979871" }, transcript: "" } }), { draft: true });
    const checks = publishChecks(doc, "confirm").blocking.join(" ");
    expect(checks).toMatch(/confirm the video has captions on Vimeo/);
    expect(checks).toMatch(/add a transcript/);
    expect(checks).not.toMatch(/describe the picture/);
  });

  it("counts as an activity once watched when it's uploaded to the Hub, and never as one on another site", () => {
    const hub = readGuideDoc(withTextMedia({ media: { src: "" }, video: { src: "/api/uploads/a.mp4", captions: "/api/uploads/a.vtt", transcript: "Hi." } })).pages[0];
    const tm = hub.sections[0].blocks[0];
    expect(activityDone(tm, {})).toBe(false);
    expect(activityDone(tm, { "done:tm": "1" })).toBe(true);
    const picture = readGuideDoc(withTextMedia({ media: { src: "/images/magazine/a.jpg", alt: "A door" } })).pages[0].sections[0].blocks[0];
    expect(activityDone(picture, {})).toBeNull();
  });
});

