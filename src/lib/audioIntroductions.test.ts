import { describe, expect, it } from "vitest";
import { publishChecks, readGuideDoc, type GuideAudio, type Narration, type NarrationAudio, type Page } from "./magazine";
import {
  approveForPublication,
  attachRecording,
  claimIn,
  costEstimateText,
  DEFAULT_AUDIO,
  editWorking,
  formatSeconds,
  formulaicOpening,
  listenable,
  NARRATION_LENGTHS,
  narrationForReaders,
  narrationState,
  pageSnapshot,
  playable,
  sameOpenings,
  scriptWarnings,
  speechCost,
  textHash,
  VOICE_PROFILES,
  voiceKey,
  workingCopy,
} from "./magazineNarration";
import { chosenByLearner, settle } from "./onePlayer";

/*
  Magazine Audio Introductions (docs/magazine-audio-guide.md): the Magazine Editorial Voice, the replacement that waits
  while the published introduction keeps playing, the outdated flag, cost estimates, old guides, and one sound at a time.
*/

const SCRIPT =
  "Dot's dashboard suggests she still has money available, but does that tell the whole story? Outstanding invoices and scheduled services can make the amount on screen quite different from what's really left.";
const page = (o: Partial<Page> = {}): Page =>
  readGuideDoc(
    {
      schema: 2,
      pages: [
        {
          id: "p1",
          title: "Dot at quarter end",
          purpose: "Work out what's really left",
          template: "do",
          kind: "content",
          required: true,
          sections: [
            { id: "s1", title: "The numbers", blocks: [{ id: "t1", type: "text", body: "Dot has a budget for the quarter, and some of it is committed." }] },
          ],
          ...o,
        },
      ],
    },
    { draft: true },
  ).pages[0];
const rec = (over: Partial<NarrationAudio> = {}): NarrationAudio => ({
  src: "/api/uploads/0f0e0d0c-0b0a-4908-8706-050403020100.mp3",
  seconds: 31,
  words: null,
  scriptHash: textHash(SCRIPT),
  voice: "profile:editorial",
  at: "2026-11-20T00:00:00.000Z",
  provider: "openai",
  profile: "editorial",
  model: "gpt-4o-mini-tts",
  cost: 0.003,
  ...over,
});
const live = (p: Page): Narration => ({
  script: SCRIPT,
  status: "approved",
  basis: pageSnapshot(p),
  audio: rec(),
  version: 1,
  approvedBy: "Jordan",
  approvedAt: "2026-11-20T01:00:00.000Z",
});
const A: GuideAudio = DEFAULT_AUDIO;

describe("the Magazine Editorial Voice", () => {
  it("is the default for a new course: Alloy, with delivery notes, the editorial length, and nothing playing by itself", () => {
    expect(DEFAULT_AUDIO.voice).toEqual({ kind: "profile", id: "editorial" });
    expect(voiceKey(DEFAULT_AUDIO)).toBe("profile:editorial");
    expect(VOICE_PROFILES.editorial).toMatchObject({ name: "Magazine Editorial Voice", provider: "openai", voice: "alloy" });
    expect(VOICE_PROFILES.editorial.instructions).toMatch(/Australian English/);
    expect(VOICE_PROFILES.editorial.instructions).toMatch(/corporate-training/);
    expect(NARRATION_LENGTHS.editorial).toMatchObject({ min: 70, max: 130 });
    expect(DEFAULT_AUDIO.playback).toBe("press-play");
  });
});

describe("old guides", () => {
  it("still parse, play and publish: a recording from before Audio Introductions has no provider, model or approval and stays approved", () => {
    const p = page();
    const old = readGuideDoc({
      schema: 2,
      audio: { levels: { course: true, pages: true, blocks: false }, voice: { kind: "openai", voice: "alloy" }, length: "standard", playback: "auto" },
      pages: [
        {
          ...p,
          narration: {
            script: SCRIPT,
            status: "approved",
            basis: pageSnapshot(p),
            audio: { src: rec().src, seconds: 18.6, words: null, scriptHash: textHash(SCRIPT), voice: "openai:alloy", at: "2026-11-19T00:00:00.000Z" },
          },
        },
      ],
    });
    const n = old.pages[0].narration!;
    expect(old.audio).toMatchObject({ voice: { kind: "openai", voice: "alloy" }, length: "standard", playback: "auto" });
    expect(n.audio).not.toHaveProperty("pending");
    expect(n.audio).not.toHaveProperty("provider");
    expect(listenable(n, old.audio)).toBe(true);
    expect(narrationState(n, pageSnapshot(old.pages[0]), old.audio!)).toBe("current");
    expect(publishChecks(old, "confirm").blocking).toEqual([]);
  });

  it("keeps the new fields: provider, profile, model, cost, version, approval, visibility and a replacement in progress", () => {
    const p = page();
    const n: Narration = { ...live(p), hidden: true, next: { script: `${SCRIPT} Ready?`, status: "draft", version: 2 } };
    const doc = readGuideDoc({ schema: 2, audio: A, pages: [{ ...p, narration: n }] });
    expect(doc.pages[0].narration).toEqual(n);
    expect(doc.audio).toMatchObject({ voice: { kind: "profile", id: "editorial" }, length: "editorial" });
    // Nonsense is dropped, not kept.
    const odd = readGuideDoc({
      schema: 2,
      audio: A,
      pages: [{ ...p, narration: { ...n, audio: { ...rec(), provider: "Not A Provider!", cost: "free", pending: "yes" } } }],
    });
    expect(odd.pages[0].narration!.audio).not.toHaveProperty("provider");
    expect(odd.pages[0].narration!.audio).not.toHaveProperty("cost");
    expect(odd.pages[0].narration!.audio).not.toHaveProperty("pending");
  });
});

describe("a published introduction stays until its replacement is approved", () => {
  it("puts an edit to the script into a replacement; learners keep the published one, and no audio is made", () => {
    const p = page();
    const n = live(p);
    const edited = editWorking(n, A, (w) => w && { ...w, script: `${SCRIPT} What would you fund?` })!;
    expect(edited.script).toBe(SCRIPT);
    expect(listenable(edited, A)).toBe(true);
    expect(edited.next?.script).toBe(`${SCRIPT} What would you fund?`);
    expect(edited.next).not.toHaveProperty("approvedBy");
    // The edit made no new audio: the replacement still holds the old recording, which no longer matches its words.
    expect(edited.next?.audio?.src).toBe(n.audio!.src);
    expect(narrationState(workingCopy(edited), pageSnapshot(p), A)).toBe("rerecord");
    // And it doesn't hold publishing: what learners hear is the published one, which still matches.
    expect(publishChecks(readGuideDoc({ schema: 2, audio: A, pages: [{ ...p, narration: edited }] }), "confirm").blocking).toEqual([]);
  });

  it("attaches new audio to the replacement for approval, then approving it for publication takes the published one's place", () => {
    const p = page();
    const n = live(p);
    const newer = rec({ src: "/api/uploads/1f0e0d0c-0b0a-4908-8706-050403020100.mp3", at: "2026-11-21T00:00:00.000Z" });
    const attached = attachRecording(n, newer, A)!;
    expect(attached.audio?.src).toBe(n.audio!.src);
    expect(attached.next?.audio).toMatchObject({ src: newer.src, pending: true });
    expect(narrationState(workingCopy(attached), pageSnapshot(p), A)).toBe("pending");
    // Attaching the same recording again changes nothing.
    expect(attachRecording(attached, newer, A)).toBe(attached);
    const approved = approveForPublication(attached, "Riley", "2026-11-22T00:00:00.000Z")!;
    expect(approved.audio).toEqual({ ...newer });
    expect(approved).toMatchObject({ approvedBy: "Riley", approvedAt: "2026-11-22T00:00:00.000Z" });
    expect(approved).not.toHaveProperty("next");
  });

  it("leaves everything as it was when a recording doesn't match the words being worked on (made from an older script)", () => {
    const p = page();
    const n = editWorking(live(p), A, (w) => w && { ...w, script: "Something else entirely, approved.", status: "approved" })!;
    expect(attachRecording(n, rec({ at: "2026-11-23T00:00:00.000Z" }), A)).toBe(n);
  });

  it("never sends learners a replacement, audio awaiting approval, or the checks", () => {
    const p = page();
    const n = attachRecording(live(p), rec({ src: "/api/uploads/2f0e0d0c-0b0a-4908-8706-050403020100.mp3", at: "2026-11-21T00:00:00.000Z" }), A)!;
    const first = { script: SCRIPT, status: "approved" as const, audio: rec({ pending: true }), checks: ["A figure"] };
    const out = narrationForReaders({
      pages: [
        { ...p, narration: { ...n, checks: ["x"] } },
        { ...p, id: "p2", narration: first },
      ],
      audio: A,
    });
    expect(out.pages[0].narration).not.toHaveProperty("next");
    expect(out.pages[0].narration).not.toHaveProperty("checks");
    expect(out.pages[0].narration!.audio!.src).toBe(live(p).audio!.src);
    expect(out.pages[1].narration).not.toHaveProperty("audio");
    expect(playable(first, A)).toBe(false);
  });

  it("lets the author turn an introduction off without losing it", () => {
    const n = { ...live(page()), hidden: true as const };
    expect(playable(n, A)).toBe(true);
    expect(listenable(n, A)).toBe(false);
  });
});

describe("the outdated flag", () => {
  it("flags a material change to the page, never a small one, and suggests a look without holding publishing", () => {
    const p = page();
    const n = live(p);
    const typo = page({
      sections: [{ ...p.sections[0], blocks: [{ id: "t1", type: "text", body: "Dot has a budget for the quarter, and some of it is already committed." }] }],
    });
    expect(narrationState(n, pageSnapshot(typo), A)).toBe("current");
    const retitled = page({ title: "What can Dot still fund?" });
    expect(narrationState(n, pageSnapshot(retitled), A)).toBe("review");
    const checks = publishChecks(readGuideDoc({ schema: 2, audio: A, pages: [{ ...retitled, narration: n }] }), "confirm");
    expect(checks.blocking).toEqual([]);
    expect(checks.suggestions.join(" ")).toMatch(/may be out of date/);
    // Learners keep hearing it meanwhile.
    expect(listenable(n, A)).toBe(true);
  });
});

describe("script checks", () => {
  it("catches formulaic openings, repeated openings and claims to leave to the page", () => {
    expect(formulaicOpening("Welcome to this module on budgets.")).toBe(true);
    expect(formulaicOpening("In today’s lesson, we’ll look at invoices.")).toBe(true);
    expect(formulaicOpening(SCRIPT)).toBe(false);
    expect(
      sameOpenings([
        { id: "a", script: "Have you ever wondered why" },
        { id: "b", script: "Have you ever noticed" },
        { id: "c", script: SCRIPT },
      ]),
    ).toEqual([["a", "b"]]);
    expect(claimIn("Under the Aged Care Act you must do this.")).toMatch(/Act/);
    expect(scriptWarnings(`${SCRIPT} The dosage is listed on the chart.`, "editorial", []).join(" ")).toMatch(/clinical claim/);
    // A shorter introduction is allowed with the editorial length: about 45 words doesn't warn; 20 does.
    const longer = `${SCRIPT} In this activity, you'll work through her numbers and decide what can genuinely be funded.`;
    expect(scriptWarnings(longer, "editorial", []).filter((w) => /Short/.test(w))).toEqual([]);
    expect(scriptWarnings("Dot's dashboard says there's money left. Is there? Let's look closer at what's committed.", "editorial", []).join(" ")).toMatch(
      /Short/,
    );
  });
});

describe("cost", () => {
  it("estimates from characters and the configured model's price, and says so when there isn't a reliable one", () => {
    expect(speechCost(1_000_000, "openai", "gpt-4o-mini-tts")).toBe(15);
    expect(speechCost(5000, "openai", "tts-1-hd")).toBe(0.15);
    expect(speechCost(5000, "elevenlabs", "eleven_flash_v2_5")).toBeNull();
    expect(costEstimateText(5300, { provider: "openai", model: "gpt-4o-mini-tts", pricePerMillionChars: 15 })).toBe(
      "Estimated cost: about US$0.08 (5,300 characters × US$15 per million for gpt-4o-mini-tts; price to verify).",
    );
    expect(costEstimateText(400, { provider: "elevenlabs", model: "eleven_flash_v2_5", pricePerMillionChars: null })).toMatch(/No cost estimate: ElevenLabs/);
  });
  it("shows times without a 60th second", () => {
    expect(formatSeconds(59.6)).toBe("1:00");
    expect(formatSeconds(18.6)).toBe("0:19");
  });
});

// ---------------------------------------------------------------------------------------------
// One sound at a time (lib/onePlayer), with stand-ins for the page's media
// ---------------------------------------------------------------------------------------------

type Fake = {
  paused: boolean;
  ended: boolean;
  loop: boolean;
  muted: boolean;
  root: { contains: (x: unknown) => boolean };
  pause: () => void;
  closest: () => unknown;
};
function media(root: object, o: Partial<Fake> = {}): Fake & HTMLMediaElement {
  const el = {
    paused: true,
    ended: false,
    loop: false,
    muted: false,
    pause() {
      el.paused = true;
    },
    ...o,
  } as Fake;
  const r = { contains: (x: unknown) => x === el || (x as { root?: unknown })?.root === r, root };
  el.root = r;
  el.closest = () => r;
  return el as Fake & HTMLMediaElement;
}
function page$(els: HTMLMediaElement[]) {
  (globalThis as { document?: unknown }).document = { querySelectorAll: () => els };
}

describe("one sound at a time", () => {
  it("pauses Ava when the learner presses the introduction's Play, and the introduction when they press Ava's", () => {
    const intro = media({});
    const ava = media({}, { paused: false });
    const video = media({}, { paused: false });
    page$([intro, ava, video]);
    // A click on the introduction's Play, then it starts: Ava and the video pause.
    intro.paused = false;
    settle(intro, { at: 0, target: { root: intro.root } as unknown as Element }, 100);
    expect([intro.paused, ava.paused, video.paused]).toEqual([false, true, true]);
    // A click on Ava's Play: the introduction pauses.
    ava.paused = false;
    settle(ava, { at: 5000, target: { root: ava.root } as unknown as Element }, 5200);
    expect([intro.paused, ava.paused]).toEqual([true, false]);
  });

  it("holds back a start nobody asked for (Ava arriving on screen) while the introduction plays", () => {
    const intro = media({}, { paused: false });
    const ava = media({});
    page$([intro, ava]);
    ava.paused = false; // her transmission starts by itself
    settle(ava); // no click in her player: she waits
    expect(ava.paused).toBe(true);
    expect(intro.paused).toBe(false);
  });

  it("leaves decorative looping pictures alone, and does nothing when nothing else is playing", () => {
    const motion = media({}, { paused: false, loop: true, muted: true });
    const intro = media({});
    page$([motion, intro]);
    intro.paused = false;
    settle(intro);
    expect(motion.paused).toBe(false);
    expect(intro.paused).toBe(false);
  });

  it("counts a click as the learner's only within its own player, and only for a few seconds", () => {
    const a = media({});
    const inside = { root: a.root } as unknown as Element;
    const elsewhere = { root: {} } as unknown as Element;
    expect(chosenByLearner(a, { at: 1000, target: inside }, 2000)).toBe(true);
    expect(chosenByLearner(a, { at: 1000, target: elsewhere }, 2000)).toBe(false);
    expect(chosenByLearner(a, { at: 1000, target: inside }, 7000)).toBe(false);
    expect(chosenByLearner(a, null, 2000)).toBe(false);
  });
});
