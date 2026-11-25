import { describe, expect, it } from "vitest";
import { createElement } from "react";
import { renderToStaticMarkup } from "react-dom/server";
import { textHash } from "@/lib/magazineNarration";
import { settle } from "@/lib/onePlayer";
import { PathOverview } from "./PathPage";

/*
  The top of a Discovery Path page, as the server draws it (docs/discovery-exciter.md): "Listen to your introduction"
  with the approved Discovery Exciter only, never the description read aloud, no Ava, nothing playing by itself, and
  one sound at a time. Playing is checked in the browser.
*/

const DESCRIPTION = "Everything you need to start coordinating care with Trilogy Care, in short topics built around real situations.";
const SCRIPT = "Your first clients are on their way. Who do you call when something doesn’t add up? You’ll find out here, one short topic at a time.";
const audio = {
  src: "/api/uploads/0f0e0d0c-0b0a-4908-8706-050403020100.mp3",
  seconds: 47,
  words: null,
  scriptHash: textHash(SCRIPT),
  voice: "profile:editorial",
  at: "2026-11-25T00:00:00.000Z",
  provider: "openai",
  profile: "editorial",
  model: "gpt-4o-mini-tts",
};
type Data = Parameters<typeof PathOverview>[0]["path"];
const path = (exciter: Data["exciter"]): Data =>
  ({
    id: "lp-care-coordination",
    name: "Care Coordination",
    description: DESCRIPTION,
    inOrder: true,
    dueDate: null,
    assigned: false,
    selfEnrolled: false,
    chapters: [],
    steps: [{ slug: "a", title: "A", minutes: 5, track: "core", draft: false, completedAt: null, locked: false }],
    completed: 0,
    total: 1,
    nextSlug: "a",
    done: false,
    minutes: 5,
    quiz: null,
    thumbnail: null,
    whoFor: "",
    outcomes: [],
    reward: "",
    exciter,
  }) as unknown as Data;
const html = (exciter: Data["exciter"]) => renderToStaticMarkup(createElement(PathOverview, { path: path(exciter) }));

describe("the path page's introduction", () => {
  it("plays the Discovery Exciter in the Magazine's player, labelled for the learner, and never by itself", () => {
    const out = html({ script: SCRIPT, audio });
    expect(out).toContain('aria-label="Listen to your introduction"');
    expect(out).toContain(">Listen to your introduction<");
    expect(out).toContain('preload="none"');
    expect(out).not.toMatch(/autoplay/i);
    expect(out).toContain("Narrated by an AI voice · Magazine Editorial Voice");
    // Its transcript is the Exciter's own words; the description is text on the page, once, not in the player.
    expect(out).toContain(SCRIPT);
    expect(out.split(DESCRIPTION).length - 1).toBe(1);
    expect(out).toContain("data-player");
  });

  it("shows nothing in its place without approved audio: no player, no Ava, and the description isn't read", () => {
    const out = html(null);
    expect(out).not.toContain("<audio");
    expect(out).not.toContain("<video");
    expect(out).not.toContain("Listen to your introduction");
    expect(out).not.toMatch(/\bAva\b/);
    expect(out).not.toContain("/api/tts");
    expect(out).toContain(DESCRIPTION);
  });

  it("plays one sound at a time: pressing Play on the introduction pauses anything else playing", () => {
    type Fake = { paused: boolean; ended: boolean; loop: boolean; muted: boolean; pause: () => void; closest: () => unknown };
    const make = (paused: boolean) => {
      const root = { contains: (x: unknown) => x === el || (x as { root?: unknown })?.root === root };
      const el: Fake & { root: unknown } = {
        paused,
        ended: false,
        loop: false,
        muted: false,
        root,
        pause() {
          el.paused = true;
        },
        closest: () => root,
      };
      return el as unknown as HTMLMediaElement & { root: unknown };
    };
    const intro = make(false);
    const other = make(false);
    (globalThis as { document?: unknown }).document = { querySelectorAll: () => [intro, other] };
    settle(intro, { at: 0, target: { root: intro.root } as unknown as Element }, 100);
    expect([intro.paused, other.paused]).toEqual([false, true]);
    delete (globalThis as { document?: unknown }).document;
  });
});
