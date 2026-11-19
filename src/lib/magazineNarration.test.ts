import { describe, expect, it } from "vitest";
import { publishChecks, readGuideDoc, type GuideDoc, type Narration, type Page } from "./magazine";
import {
  answersOn,
  DEFAULT_AUDIO,
  introSnapshot,
  narrationState,
  pageSnapshot,
  playable,
  scriptWarnings,
  spoilerIn,
  substantiallyChanged,
  textHash,
  wordCount,
} from "./magazineNarration";

/* The Magazine Audio Guide's rules: script checks, freshness, what learners hear, and what publishing needs. */

const PARAGRAPH =
  "When you arrive for a shift, take a moment to read the care plan, check the address and the access notes, and look for anything that has changed since your last visit. Small details matter to the people you support.";
const page = (o: Partial<Page> = {}): Page =>
  readGuideDoc(
    {
      schema: 2,
      pages: [
        {
          id: "p1",
          title: "Before your visit",
          purpose: "Get ready for a visit",
          template: "do",
          kind: "content",
          required: true,
          sections: [
            {
              id: "s1",
              title: "Getting ready",
              blocks: [
                { id: "t1", type: "text", body: PARAGRAPH },
                {
                  id: "d1",
                  type: "decision",
                  prompt: "Mr Ellis says “not today”. What do you do?",
                  choices: [
                    { id: "c1", text: "Respect his decision, note it, and let your Trilogy Care contact know as agreed", verdict: "best", feedback: "It’s his choice." },
                    { id: "c2", text: "Encourage him firmly", verdict: "risky", feedback: "That ignores his choice." },
                  ],
                },
              ],
            },
          ],
          ...o,
        },
      ],
    },
    { draft: true },
  ).pages[0];
const SCRIPT =
  "Mr Ellis has had a long week, and today he’d rather skip his shower. What would you do? Before you answer, think about whose choice it really is, and what your Trilogy Care contact would want to know.";
const approved = (p: Page, extra: Partial<Narration> = {}): Narration => ({ script: SCRIPT, status: "approved", basis: pageSnapshot(p), ...extra });
const recording = { src: "/api/uploads/0f0e0d0c-0b0a-4908-8706-050403020100.mp3", seconds: 18, words: null, scriptHash: textHash(SCRIPT), voice: "topic", at: "2026-11-19T00:00:00.000Z" };

describe("checking a script", () => {
  it("counts words and warns when it's far off the length chosen", () => {
    expect(wordCount("It’s his choice, isn't it?")).toBe(5);
    expect(scriptWarnings("Too short.", "standard", [])).toEqual([expect.stringMatching(/^Short for the length chosen: 2 words/)]);
    expect(scriptWarnings(SCRIPT, "short", [])).toEqual([]);
  });

  it("catches a give-away: eight or more words in a row from a best answer", () => {
    const answers = answersOn(page());
    expect(answers).toContain("Respect his decision, note it, and let your Trilogy Care contact know as agreed");
    expect(spoilerIn("The answer: respect his decision, note it, and let your Trilogy Care contact know.", answers)).toBe("respect his decision note it and let your");
    expect(spoilerIn(SCRIPT, answers)).toBeNull();
  });

  it("asks the author to check a figure or date", () => {
    expect(scriptWarnings(`${SCRIPT} It costs $75 an hour.`, "standard", []).join(" ")).toMatch(/figure or date/);
    expect(scriptWarnings(`${SCRIPT} From 1 November 2025.`, "standard", []).join(" ")).toMatch(/figure or date/);
  });
});

describe("keeping narration current", () => {
  it("ignores small edits, but asks for a look when a question or much of the page changes", () => {
    const before = page();
    const typo = page({ sections: [{ ...before.sections[0], blocks: [{ id: "t1", type: "text", body: PARAGRAPH.replace("shift", "shift today") }, before.sections[0].blocks[1]] }] });
    expect(substantiallyChanged(pageSnapshot(before), pageSnapshot(typo))).toBe(false);
    const question = page({
      sections: [{ ...before.sections[0], blocks: [before.sections[0].blocks[0], { ...before.sections[0].blocks[1], prompt: "Mrs Russo is upset. What first?" } as Page["sections"][0]["blocks"][0]] }],
    });
    expect(substantiallyChanged(pageSnapshot(before), pageSnapshot(question))).toBe(true);
    const rewritten = page({ sections: [{ ...before.sections[0], blocks: [{ id: "t1", type: "text", body: "Completely different words about invoices and approvals and money." }, before.sections[0].blocks[1]] }] });
    expect(substantiallyChanged(pageSnapshot(before), pageSnapshot(rewritten))).toBe(true);
    expect(substantiallyChanged(pageSnapshot(before), pageSnapshot(page({ title: "Getting ready" })))).toBe(true);
  });

  it("names each state: draft, approved to record, recorded, record again, may be out of date", () => {
    const p = page();
    const now = pageSnapshot(p);
    expect(narrationState(undefined, now, DEFAULT_AUDIO)).toBe("none");
    expect(narrationState({ script: SCRIPT, status: "draft" }, now, DEFAULT_AUDIO)).toBe("draft");
    expect(narrationState(approved(p), now, DEFAULT_AUDIO)).toBe("unrecorded");
    expect(narrationState(approved(p, { audio: recording }), now, DEFAULT_AUDIO)).toBe("current");
    expect(narrationState(approved(p, { script: `${SCRIPT} Let’s go.`, audio: recording }), now, DEFAULT_AUDIO)).toBe("rerecord");
    expect(narrationState(approved(p, { audio: recording }), now, { ...DEFAULT_AUDIO, voice: { kind: "custom", voiceId: "abcdefgh12", name: "Ava" } })).toBe("rerecord");
    expect(narrationState(approved(p, { audio: recording }), pageSnapshot(page({ title: "New title" })), DEFAULT_AUDIO)).toBe("review");
  });

  it("lets learners hear only approved narration recorded from its exact words, even while it awaits review", () => {
    const p = page();
    expect(playable(approved(p, { audio: recording }), DEFAULT_AUDIO)).toBe(true);
    expect(playable({ ...approved(p, { audio: recording }), status: "draft" }, DEFAULT_AUDIO)).toBe(false);
    expect(playable(approved(p, { script: "Changed.", audio: recording }), DEFAULT_AUDIO)).toBe(false);
  });

  it("asks about the course introduction when the course's title, promise or pages change", () => {
    const doc = { schema: 2, pages: [page()] } as GuideDoc;
    const a = introSnapshot("Induction", "Get ready for your first shift", doc);
    expect(substantiallyChanged(a, introSnapshot("Induction", "Get ready for your first shift", doc))).toBe(false);
    expect(substantiallyChanged(a, introSnapshot("Induction", "Be shift-ready", doc))).toBe(true);
  });
});

describe("narration in the course document", () => {
  const withAudio = (p: object, audio: object = {}) => ({ schema: 2, pages: [{ ...page(), ...p }], audio: { ...DEFAULT_AUDIO, ...audio } });

  it("keeps the settings, scripts and recordings, and drops a recording that isn't on the hub", () => {
    const doc = readGuideDoc(withAudio({ narration: approved(page(), { audio: recording }) }, { length: "short", playback: "offer-auto" }));
    expect(doc.audio).toMatchObject({ length: "short", playback: "offer-auto", voice: { kind: "topic" }, levels: { course: true, pages: true, blocks: false } });
    expect(doc.pages[0].narration).toMatchObject({ script: SCRIPT, status: "approved", audio: { src: recording.src, seconds: 18 } });
    expect(() => readGuideDoc(withAudio({ narration: approved(page(), { audio: { ...recording, src: "https://example.com/a.mp3" } }) }))).toThrow(/recorded on the Hub/);
  });

  it("holds publishing for a recording that no longer matches its script, and reminds about the rest", () => {
    const rerecord = readGuideDoc(withAudio({ narration: approved(page(), { script: `${SCRIPT} Ready?`, audio: recording }) }));
    expect(publishChecks(rerecord, "confirm").blocking.join(" ")).toMatch(/The page’s narration: the script or voice has changed since it was recorded/);
    const draft = readGuideDoc(withAudio({ narration: { script: SCRIPT, status: "draft" } }));
    expect(publishChecks(draft, "confirm").blocking).toEqual([]);
    expect(publishChecks(draft, "confirm").suggestions.join(" ")).toMatch(/approve the script/);
    const current = readGuideDoc(withAudio({ narration: approved(page(), { audio: recording }) }));
    expect(publishChecks(current, "confirm").suggestions.join(" ")).not.toMatch(/narration/);
  });
});
