import { describe, expect, it } from "vitest";
import type { Card, Lesson } from "@/content/lessons";
import { blankLesson } from "@/content/blankLesson";
import { dropTargets, mainLine, movable, moveBlock, moveToPosition } from "./lessonGraph";
import {
  autoStartIntro,
  introSpokenText,
  approveScript,
  approveVideo,
  attachVideo,
  carryIntro,
  confirmStillCurrent,
  DEFAULT_PRESENTER,
  INTRO_STATUSES,
  INTRO_WORDS,
  introCardOf,
  introScriptWarnings,
  introState,
  isIntroCard,
  planIntro,
  prepareForProduction,
  setPresenter,
  setScript,
  usesIntroLayout,
  titleCardToFold,
  withIntroCard,
  withinWordBounds,
} from "./topicIntro";

/* Topic Video Introductions: the Introduction card is structural, first, and its working copy never leaks to learners. */

const p = DEFAULT_PRESENTER;
const NONE = { kind: "none" } as const;
const words = (n: number) => Array.from({ length: n }, (_, i) => `word${i}`).join(" ");

function topic(first: Card["type"] = "image"): Lesson {
  const l = blankLesson();
  delete l.nodes.intro;
  const opening: Card =
    first === "presenter"
      ? {
          id: "hook",
          type: "presenter",
          beat: 0,
          label: "Hook",
          heading: "A call",
          body: "",
          transcript: "Mara calls because her visit ran long and she wants to know who pays for the extra time she asked for today.",
          durationSec: 9,
          visual: {
            kind: "presenter",
            name: "Ava",
            synthetic: true,
            tone: "teal",
            alt: "",
            video: { provider: "upload", id: "", title: "Hook", orientation: "portrait", src: "/api/uploads/hook.mp4", poster: "/api/uploads/hook.webp" },
          },
          next: "check",
        }
      : { id: "hook", type: "image", beat: 0, label: "Hook", heading: "A call", body: "Mara calls about her visit.", visual: NONE, next: "check" };
  return {
    ...l,
    slug: "zz-test",
    title: "ZZ Test topic",
    summary: "What to check before a visit runs longer.",
    outcome: "Confirm the change first.",
    start: "hook",
    nodes: { ...l.nodes, hook: opening },
    version: "1.2",
  };
}

describe("the Introduction card is structural", () => {
  it("is created with every new topic, first", () => {
    const l = blankLesson();
    expect(isIntroCard(l.nodes[l.start])).toBe(true);
    expect(l.nodes[l.start].type).toBe("presenter");
    expect(usesIntroLayout(l.nodes[l.start])).toBe(true);
    expect(planIntro(l).action).toBe("none");
  });

  it("is added in front of a topic without one, changing nothing else", () => {
    const before = topic();
    const after = withIntroCard(before, p);
    const c = introCardOf(after)!;
    expect(after.start).toBe(c.id);
    expect(c.next).toBe("hook");
    expect(c.heading).toBe(before.title);
    expect(c.visual.kind === "presenter" && c.visual.photo?.src).toBe(p.portrait.src);
    // Every card, the completion rule and the version are as they were.
    for (const id of Object.keys(before.nodes)) expect(after.nodes[id]).toEqual(before.nodes[id]);
    expect(after.completion).toEqual(before.completion);
    expect(after.version).toBe(before.version);
    expect(after.beats).toEqual(before.beats);
    // Running it again does nothing (the same object comes back).
    expect(withIntroCard(after, p)).toBe(after);
  });

  it("reuses an existing first presenter card, with its video and script, instead of adding a second", () => {
    const after = withIntroCard(topic("presenter"), p);
    expect(Object.keys(after.nodes)).toHaveLength(Object.keys(topic("presenter").nodes).length);
    const c = introCardOf(after)!;
    expect(c.id).toBe("hook");
    expect(c.intro.origin).toBe("reused");
    // Learners see it as it was until the author switches it to the introduction screen.
    expect(c.intro.layout).toBe("legacy");
    expect(c.intro.video?.src).toBe("/api/uploads/hook.mp4");
    expect(c.intro.script?.status).toBe("approved");
    expect(c.visual).toEqual(topic("presenter").nodes.hook.visual);
  });

  it("moves a marked card back to the front, and removes a second mark", () => {
    const l = withIntroCard(topic(), p);
    const moved = structuredClone(l);
    // Simulate a damaged topic: the introduction after the hook.
    const c = introCardOf(moved)!;
    moved.start = "hook";
    (moved.nodes.hook as { next: string }).next = c.id;
    c.next = "check";
    expect(planIntro(moved).action).toBe("move");
    const fixed = withIntroCard(moved, p);
    expect(fixed.start).toBe(c.id);
    expect(mainLine(fixed).slice(0, 2)).toEqual([c.id, "hook"]);

    const twice = structuredClone(l);
    twice.nodes.copy = { ...structuredClone(introCardOf(l)!), id: "copy", next: "check" };
    expect(planIntro(twice).action).toBe("dedupe");
    const tidy = withIntroCard(twice, p);
    expect(Object.values(tidy.nodes).filter(isIntroCard)).toHaveLength(1);
    expect(tidy.nodes.copy).toBeDefined();
  });

  it("can't be moved, and nothing can be moved in front of it", () => {
    const l = withIntroCard(topic(), p);
    const id = l.start;
    expect(movable(l, id)).toBe(false);
    expect(moveBlock(structuredClone(l), id, 1)).toBe("The introduction stays first.");
    expect(moveBlock(structuredClone(l), "hook", -1)).toBe("The introduction stays first.");
    expect(moveToPosition(structuredClone(l), "check", 0)).toBe("The introduction stays first.");
    expect(dropTargets(l, "check").some((t) => t.to === 0)).toBe(false);
    expect(dropTargets(l, id)).toEqual([]);
    // Other cards still move behind it.
    const d = structuredClone(l);
    expect(moveBlock(d, "check", -1)).toBeNull();
    expect(mainLine(d).slice(0, 2)).toEqual([id, "check"]);
  });

  it("is kept when a topic is redrafted from scratch", () => {
    const l = withIntroCard(topic(), p);
    setScript(l, words(40), "author", "2026-11-25T00:00:00Z");
    const fresh = topic();
    const out = carryIntro(l, fresh, p);
    expect(introCardOf(out)!.intro.script?.spoken).toBe(words(40));
    expect(out.start).toBe(introCardOf(out)!.id);
  });
});

describe("the script", () => {
  it("is 35 to 70 words", () => {
    expect(INTRO_WORDS).toEqual({ min: 35, max: 70 });
    expect(withinWordBounds(words(34))).toBe(false);
    expect(withinWordBounds(words(35))).toBe(true);
    expect(withinWordBounds(words(70))).toBe(true);
    expect(withinWordBounds(words(71))).toBe(false);
    expect(introScriptWarnings(words(34), topic())[0]).toMatch(/^Short: 34 words/);
    expect(introScriptWarnings(words(71), topic())[0]).toMatch(/^Long: 71 words/);
    expect(introScriptWarnings(words(50), topic())).toEqual([]);
    expect(introScriptWarnings(`Welcome to this training module. ${words(40)}`, topic()).join(" ")).toMatch(/training module/);
  });

  it("goes live only when approved: an edit is a new draft and the card keeps the approved words", () => {
    const l = withIntroCard(topic(), p);
    setScript(l, words(40), "ai", "2026-11-25T00:00:00Z", "test-model");
    expect(introCardOf(l)!.transcript).toBe("");
    expect(introState(l).status).toBe("script_drafted");
    approveScript(l, "Jordan", "2026-11-25T01:00:00Z");
    const c = introCardOf(l)!;
    expect(c.transcript).toBe(words(40));
    expect(c.durationSec).toBe(16);
    expect(introState(l).status).toBe("script_approved");
    // Published with this script and no video: the placeholder is live.
    expect(introState(l, structuredClone(l)).status).toBe("placeholder");
    setScript(l, words(45), "author", "2026-11-25T02:00:00Z");
    expect(introCardOf(l)!.intro.script).toMatchObject({ status: "draft", version: 2 });
    expect(introCardOf(l)!.transcript).toBe(words(40));
  });
});

describe("folding a picture title card into the Introduction card", () => {
  const NOTE = "*If this brings up something difficult, support is available.*";
  /** A topic that opens with its title card: a photo, the summary with a support note, and Ava's old narration. */
  function titled(): Lesson {
    const l = topic();
    l.start = "intro";
    l.nodes.intro = {
      id: "intro",
      type: "image",
      beat: 0,
      label: "Module 1.1",
      heading: l.title,
      body: `What this module covers.\n\n${NOTE}`,
      narration: "Hi, I'm Ava. Mara calls about her visit, and you need to work out what to check before you agree to stay longer.",
      visual: {
        kind: "illustration",
        variant: "petals",
        tone: "teal",
        icon: "shield",
        alt: "A coordinator on the phone",
        photo: { src: "/api/uploads/cover.webp", width: 1600, height: 900, position: "center top" },
      },
      next: "hook",
    };
    return l;
  }

  it("takes over the title card: same id and links, its words, its picture as the placeholder, its narration as a draft script", () => {
    const before = titled();
    expect(planIntro(before)).toEqual({ action: "fold", id: "intro" });
    const after = withIntroCard(before, p);
    const c = after.nodes.intro;
    if (!isIntroCard(c)) throw new Error("not folded");
    expect(after.start).toBe("intro");
    expect(c.next).toBe("hook");
    expect(c.intro).toMatchObject({ layout: "intro", origin: "folded" });
    expect(c.label).toBe("Module 1.1");
    expect(c.heading).toBe(before.title);
    expect(c.body).toContain(NOTE);
    expect(c.intro.placeholder).toEqual({ src: "/api/uploads/cover.webp", width: 1600, height: 900, position: "center top" });
    expect(c.visual).toMatchObject({ kind: "presenter", alt: "A coordinator on the phone", photo: { src: "/api/uploads/cover.webp", position: "center top" } });
    expect(c.intro.script).toMatchObject({ status: "draft", origin: "existing" });
    expect(c.transcript).toBe("");
    // Only one card changed; nothing was added; the rest are as they were.
    expect(Object.keys(after.nodes).sort()).toEqual(Object.keys(before.nodes).sort());
    for (const id of Object.keys(before.nodes)) if (id !== "intro") expect(after.nodes[id]).toEqual(before.nodes[id]);
    expect(after.version).toBe(before.version);
    expect(after.completion).toEqual(before.completion);
    // Once is enough.
    expect(withIntroCard(after, p)).toBe(after);
  });

  it("never shows a production note as the description: the Topic's summary stands in", () => {
    const l = titled();
    (l.nodes.intro as { body: string }).body = "Synthesia video to replace.";
    const after = withIntroCard(l, p);
    const c = introCardOf(after)!;
    expect(c.body).toBe("");
    expect(introSpokenText(c, after)).toBe(c.narration);
  });

  it("folds a title card without a picture into the presenter's placeholder", () => {
    const l = titled();
    (l.nodes.intro as { visual: unknown }).visual = { kind: "none" };
    const c = introCardOf(withIntroCard(l, p))!;
    expect(c.intro.placeholder).toBeUndefined();
    expect(c.visual.kind === "presenter" && c.visual.photo?.src).toBe(p.portrait.src);
  });

  it("leaves a title card with content the introduction can't show, and adds the introduction in front", () => {
    const l = titled();
    (l.nodes.intro as { keyPoints?: unknown }).keyPoints = { style: "chips", items: [{ text: "Ask" }] };
    expect(titleCardToFold(l)).toBeUndefined();
    expect(planIntro(l).action).toBe("add");
    // A first card that isn't a title card is never folded.
    expect(planIntro(topic()).action).toBe("add");
  });
});

describe("sound when the Introduction card opens (the owner's override of PRD section 4)", () => {
  it("autoplays the intro audio, with a fallback when the browser blocks it, and respects the card-audio switch", async () => {
    let calls = 0;
    const plays = { play: () => (calls++, Promise.resolve()) };
    expect(await autoStartIntro(plays, true)).toBe("playing");
    expect(calls).toBe(1);
    const blocked = { play: () => Promise.reject(new DOMException("No gesture", "NotAllowedError")) };
    expect(await autoStartIntro(blocked, true)).toBe("blocked");
    // Card audio switched off: nothing starts, and the card offers "Tap to listen".
    expect(await autoStartIntro(plays, false)).toBe("off");
    expect(calls).toBe(1);
    expect(await autoStartIntro(null, true)).toBe("blocked");
    // A start that neither plays nor fails (a background page) falls back to "Tap to listen" rather than hanging.
    expect(await autoStartIntro({ play: () => new Promise<void>(() => {}) }, true, 20)).toBe("blocked");
  });

  it("speaks the approved script, else a folded card's narration, else the title and description; never a draft", () => {
    const l = withIntroCard(topic(), p);
    const c = introCardOf(l)!;
    expect(introSpokenText(c, l)).toBe("ZZ Test topic. What to check before a visit runs longer.");
    c.heading = "**Visits** that run long";
    c.body = "Check *first*.";
    expect(introSpokenText(c, l)).toBe("Visits that run long. Check first.");
    setScript(l, words(40), "author", "2026-11-25T00:00:00Z");
    expect(introSpokenText(introCardOf(l)!, l)).toBe("Visits that run long. Check first.");
    introCardOf(l)!.narration = "Mara asks you to stay longer.";
    expect(introSpokenText(introCardOf(l)!, l)).toBe("Mara asks you to stay longer.");
    approveScript(l, "Jordan", "2026-11-25T01:00:00Z");
    expect(introSpokenText(introCardOf(l)!, l)).toBe(words(40));
  });
});

describe("the outdated flag", () => {
  const approved = () => {
    const l = withIntroCard(topic(), p);
    setScript(l, words(40), "author", "2026-11-25T00:00:00Z");
    approveScript(l, "Jordan", "2026-11-25T01:00:00Z");
    return l;
  };

  it("is raised by a material change to the topic, and never by a small one", () => {
    const small = approved();
    (small.nodes.hook as { body: string }).body = "Mara calls about her visit today.";
    expect(introState(small).status).toBe("script_approved");

    const big = approved();
    big.title = "A different topic altogether";
    const s = introState(big);
    expect(s.status).toBe("requires_review");
    expect(s.outdated).toBe(true);
    // Nothing is regenerated, and what learners see stays the approved script.
    expect(introCardOf(big)!.transcript).toBe(words(40));

    const question = approved();
    (question.nodes.check as { questions: { prompt: string }[] }).questions[0].prompt = "A new question about something else";
    expect(introState(question).status).toBe("requires_review");
  });

  it("clears when the author confirms the script still fits", () => {
    const l = approved();
    l.outcome = "Something else entirely changes for the learner";
    expect(introState(l).outdated).toBe(true);
    confirmStillCurrent(l, "Jordan", "2026-11-26T00:00:00Z");
    expect(introState(l).outdated).toBe(false);
  });

  it("is raised when a video no longer says the approved script", () => {
    const l = approved();
    attachVideo(l, { src: "/api/uploads/v.mp4", provider: "upload", at: "2026-11-25T03:00:00Z" });
    expect(introState(l).status).toBe("awaiting_approval");
    approveVideo(l, "Jordan", "2026-11-25T04:00:00Z");
    expect(introState(l).video).toBe("approved");
    expect(introState(l, structuredClone(l)).status).toBe("published");
    setScript(l, words(50), "author", "2026-11-25T05:00:00Z");
    approveScript(l, "Jordan", "2026-11-25T06:00:00Z");
    expect(introState(l).status).toBe("requires_review");
  });
});

describe("statuses and production", () => {
  it("has the eleven production statuses", () => {
    expect(Object.values(INTRO_STATUSES).map((s) => s.label)).toEqual([
      "Placeholder",
      "Script required",
      "Script drafted",
      "Script approved",
      "Ready for production",
      "Generating video",
      "Video generated",
      "Awaiting approval",
      "Published",
      "Requires review",
      "Generation failed",
    ]);
  });

  it("prepares an approved script for production without sending anything", () => {
    const l = withIntroCard(topic(), p);
    expect(introState(l).status).toBe("script_required");
    expect(() => prepareForProduction(l, p, "Jordan", "2026-11-25T00:00:00Z")).toThrow(/Approve the script/);
    setScript(l, words(40), "author", "2026-11-25T00:00:00Z");
    approveScript(l, "Jordan", "2026-11-25T01:00:00Z");
    prepareForProduction(l, p, "Jordan", "2026-11-25T02:00:00Z");
    expect(introState(l).status).toBe("ready_for_production");
    expect(introCardOf(l)!.intro.production).toMatchObject({ state: "ready", provider: "synthesia" });
  });

  it("shows another presenter's placeholder at once when there's no video", () => {
    const l = withIntroCard(topic(), p);
    setPresenter(l, { id: "sam", name: "Sam", portrait: { src: "/api/uploads/sam.webp", width: 720, height: 1280 } }, p);
    const c = introCardOf(l)!;
    expect(c.intro.presenter).toBe("sam");
    expect(c.visual.kind === "presenter" && c.visual.photo?.src).toBe("/api/uploads/sam.webp");
    setPresenter(l, null, p);
    expect(introCardOf(l)!.intro.presenter).toBeUndefined();
  });
});
