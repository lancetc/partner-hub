import { beforeEach, describe, expect, it } from "vitest";
import { createElement } from "react";
import { renderToStaticMarkup } from "react-dom/server";
import { openDb, type Db } from "@/server/db";
import { userById, type User } from "@/server/auth";
import { createGuide, publishGuide, readGuide, type ReaderGuide } from "@/server/magazine";
import { readGuideDoc } from "@/lib/magazine";
import { DEFAULT_AUDIO, pageSnapshot, textHash } from "@/lib/magazineNarration";
import { IntroPlayer, waveform } from "./IntroPlayer";
import { GuideReader } from "./GuideReader";
import { AppRouterContext } from "next/dist/shared/lib/app-router-context.shared-runtime";
import { PathnameContext, SearchParamsContext } from "next/dist/shared/lib/hooks-client-context.shared-runtime";

/*
  "Listen to the introduction", rendered as the server sends it (docs/magazine-audio-guide.md): it never plays by itself,
  its controls have names, and on a page where Ava introduces too, both are there (lib/onePlayer keeps them from playing
  together; that's covered in lib/audioIntroductions.test.ts). Playing is checked in the browser.
*/

const SCRIPT =
  "Before you knock on the door, a lot has already happened. Someone has planned this visit, and the person you're seeing has made choices about how it should go.";
const audio = {
  src: "/api/uploads/0f0e0d0c-0b0a-4908-8706-050403020100.mp3",
  seconds: 42,
  words: null,
  scriptHash: textHash(SCRIPT),
  voice: "profile:editorial",
  at: "2026-11-25T00:00:00.000Z",
  provider: "openai",
  profile: "editorial",
  model: "gpt-4o-mini-tts",
};
const html = (el: ReturnType<typeof createElement>) => renderToStaticMarkup(el);
/** A page as the app router would draw it: a stand-in router, path and query, so links and the page's hooks render. */
const router = { back() {}, forward() {}, refresh() {}, push() {}, replace() {}, prefetch() {}, hmrRefresh() {} };
const inApp = (el: ReturnType<typeof createElement>) =>
  html(
    createElement(
      AppRouterContext.Provider,
      { value: router as never },
      createElement(PathnameContext.Provider, { value: "/magazine/x/p1" }, createElement(SearchParamsContext.Provider, { value: new URLSearchParams() }, el)),
    ),
  );

describe("the player", () => {
  it("waits for Play: no autoplay, nothing loaded until asked, and every control named", () => {
    const out = html(createElement(IntroPlayer, { script: SCRIPT, audio, onEvent: () => {} }));
    expect(out).not.toMatch(/autoplay/i);
    expect(out).toContain('preload="none"');
    expect(out).toContain('aria-label="Listen to the introduction"');
    expect(out).toContain('aria-label="Play the introduction, 0:42"');
    expect(out).toMatch(/role="slider"[^>]*aria-valuetext="0:00 of 0:42"/);
    expect(out).toContain("Speed 1×. Change to 1.25×");
    expect(out).toContain("Replay");
    expect(out).toMatch(/aria-expanded="false"[^>]*>.*Transcript/);
    expect(out).toContain("Narrated by an AI voice · Magazine Editorial Voice");
    // The transcript is there for screen readers' "expand", hidden until asked for.
    expect(out).toMatch(/<div id="[^"]+" hidden=""/);
    expect(out).toContain("data-player");
  });

  it("draws the same waveform on the server and in the browser, quieter where nobody speaks", () => {
    const words = [
      { from: 0, to: 6, start: 0, end: 10 },
      { from: 7, to: 10, start: 30, end: 42 },
    ];
    const a = waveform({ ...audio, words }, 42);
    expect(waveform({ ...audio, words }, 42)).toEqual(a);
    const silence = a.slice(12, 28);
    const speech = a.slice(0, 9);
    expect(Math.max(...silence)).toBeLessThan(Math.min(...speech) + 0.01);
    expect(Math.max(...silence)).toBeCloseTo(0.18, 2);
  });
});

describe("a page with Ava and an introduction", () => {
  let db: Db;
  let author: User, learner: User;
  const now = new Date("2026-11-25T00:00:00Z");
  beforeEach(() => {
    db = openDb(":memory:");
    author = userById(db, "jordan")!;
    learner = userById(db, "riley")!;
  });
  const page = (id: string, title: string) => ({
    id,
    title,
    purpose: `About ${title}`,
    template: "do",
    kind: "content",
    required: true,
    sections: [{ id: `s-${id}`, title: "S", blocks: [{ id: `t-${id}`, type: "text", body: `The page on ${title}.` }] }],
  });
  function published(narration: (p: ReturnType<typeof page>) => object | undefined): ReaderGuide {
    const pages = [page("p1", "Before your visit"), page("p2", "When someone says no")];
    const doc = readGuideDoc({ schema: 2, pages }, { draft: true });
    const withN = pages.map((p, i) => ({ ...p, narration: narration({ ...p, ...doc.pages[i] } as never) }));
    const g = createGuide(db, author, { title: "ZZ Test Ava and intro", completion: "confirm", doc: { schema: 2, audio: DEFAULT_AUDIO, pages: withN } }, now);
    publishGuide(db, author, g.id, "", now);
    return readGuide(db, learner, g.slug);
  }

  it("shows Ava's transmission in the picture's place and the introduction player beneath the heading, neither playing by itself over the other", () => {
    const guide = published((p) => ({ script: SCRIPT, status: "approved", basis: pageSnapshot(p as never), audio }));
    guide.ava = {
      name: "Ava",
      portrait: "/images/presenter-intro.jpg",
      videos: {
        [`magazine:${guide.id}:page:p1`]: {
          src: "/api/uploads/1f0e0d0c-0b0a-4908-8706-050403020100.mp4",
          poster: null,
          transcript: "Is this thing on? It's Ava.",
          words: null,
        },
      },
    };
    const out = inApp(createElement(GuideReader, { guide, pageId: "p1", base: `/magazine/${guide.slug}` }));
    expect(out).toContain('aria-label="Listen to the introduction"');
    expect(out).toContain("Introduction to Before your visit");
    // The player comes after the heading and description, before the page's content.
    const at = (s: string) => out.indexOf(s);
    expect(at("<h1")).toBeLessThan(at("Listen to the introduction"));
    expect(at("About Before your visit")).toBeLessThan(at("Listen to the introduction"));
    expect(at("Listen to the introduction")).toBeLessThan(at("The page on Before your visit."));
    // The introduction itself never starts by itself.
    const player = out.slice(at('data-player=""'), out.indexOf("</section>", at('data-player=""')));
    expect(player).not.toMatch(/autoplay/i);
  });

  it("leaves the player off a page without an approved, recorded introduction, one awaiting approval, or one turned off", () => {
    const guide = published((p) =>
      p.id === "p1"
        ? { script: SCRIPT, status: "approved", basis: pageSnapshot(p as never), audio: { ...audio, pending: true } }
        : { script: SCRIPT, status: "approved", basis: pageSnapshot(p as never), audio, hidden: true },
    );
    for (const pageId of ["p1", "p2"])
      expect(inApp(createElement(GuideReader, { guide, pageId, base: "/magazine/x" }))).not.toContain("Listen to the introduction");
  });
});
