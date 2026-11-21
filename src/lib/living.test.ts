import { describe, expect, it } from "vitest";
import {
  capAllows,
  causalClaims,
  cleanNote,
  cleanReturn,
  contains,
  distinctness,
  emptyNote,
  emptyReturn,
  noteProblems,
  noteState,
  reasonText,
  returnProblems,
  seriesByRubric,
  type Delivery,
  type Question,
  type ReturnContext,
  type ReturnData,
} from "./living";
import { questionIssues, readNoteProposal, readQuestionProposal, readReturnProposal, readSummary, storyGate, summaryIssues } from "./livingAssist";
import { countCases, trend, type Case, type EventKind } from "./problemDesk";
import type { CanonPerson } from "./storyAssist";

/* Living cases, as rules: what a return has to be before approval, what state a note is in, and what a model's draft may say. */

const first: Question = {
  prompt: "What do you do first?",
  choices: [
    { id: "ask-dot", text: "Ask Dot what tending the roses means to her, and how she goes about it now.", verdict: "best" },
    { id: "offer-gardener", text: "Tell Dot you can arrange a gardener for the higher branches.", verdict: "acceptable" },
    { id: "ladder-goes", text: "Explain that her daughter is worried and the ladder will have to go.", verdict: "risky" },
  ],
};
const second: Question = {
  prompt: "Before you answer either of them, what would you clarify?",
  choices: [
    { id: "a", text: "With Dot: which part of a Saturday at the markets she would most want to keep, if getting there had to change.", verdict: "best" },
    { id: "b", text: "With Fiona: exactly how far the walk is, and what the ground is like.", verdict: "acceptable" },
    { id: "c", text: "Nothing more. Thank Fiona, and let Dot know the plants will be collected for her.", verdict: "risky" },
  ],
};
const good: ReturnData = {
  ...emptyReturn(),
  behaviour: "Ask the person what an activity gives them before proposing a change.",
  recap: "In spring, Fiona was worried about the ladder Dot uses for her roses. They agreed to work out any change together.",
  changed: "A few weeks on, Dot wants to get back to the Saturday markets. Fiona has offered to collect the plants.",
  decide: "Decide what you would clarify before you answer either of them.",
  principle: "Find out what the person is trying to keep doing.",
  cues: "Nobody is asking for anything to stop; a relative has offered help.",
  mistake: "Accepting a kind substitution on the person’s behalf.",
  criteria: "Best: asks Dot what the outing gives her first.",
  transfer: "A first answer that goes to Dot’s purpose.",
  workAction: "Ask what the thing it replaces gives them.",
  placements: [
    {
      blockId: "q",
      beat: "decision",
      does: "Chooses what to clarify first.",
      why: "It is the transfer question, a different judgement from the first.",
      alternative: "",
      source: "",
      reviewer: "",
      missing: "",
    },
  ],
};
const ctx = (over: Partial<ReturnContext> = {}): ReturnContext => ({
  character: { name: "Dot", approved: true },
  fromEpisode: { title: "Dot and the roses", seq: 20, approved: true },
  toEpisode: { title: "A morning at the markets", seq: 30, approved: true },
  first,
  second,
  blocks: [{ id: "q", type: "decision", label: "Decision question", known: true }],
  target: { exists: true, published: false, relayEpisode: "ep-markets", toEpisodeId: "ep-markets" },
  later: [],
  ...over,
});

describe("a different question", () => {
  it("accepts a new judgement in a new situation", () => {
    expect(distinctness(first, second)).toEqual({ ok: true, problems: [] });
  });
  it("refuses the first question again, or its best answer in other clothes", () => {
    expect(distinctness(first, first).problems.join(" ")).toMatch(/worded almost as it was/);
    const reworded: Question = {
      prompt: "A relative has made an offer. What matters here?",
      choices: [
        { id: "x", text: "Ask Dot what tending the roses means to her and how she goes about it.", verdict: "best" },
        { id: "y", text: "Accept the offer for her.", verdict: "risky" },
        { id: "z", text: "Measure the path.", verdict: "acceptable" },
      ],
    };
    expect(distinctness(first, reworded).problems).toEqual(["The best answer is almost word for word the best answer from the first story."]);
    // With nothing to compare against there is nothing to refuse.
    expect(distinctness(null, second).ok).toBe(true);
  });
});

describe("before a return is approved", () => {
  it("passes a complete return, with nothing blocking", () => {
    expect(returnProblems(good, ctx()).blocking).toEqual([]);
  });
  it("needs approved canon, in story order", () => {
    expect(returnProblems(good, ctx({ character: { name: "Dot", approved: false } })).blocking).toContain("Dot’s story profile isn’t approved yet.");
    expect(returnProblems(good, ctx({ toEpisode: { title: "A new fall", seq: 40, approved: false } })).blocking.join(" ")).toMatch(/proposed event/);
    expect(returnProblems(good, ctx({ toEpisode: { title: "Earlier", seq: 10, approved: true } })).blocking.join(" ")).toMatch(/sits before/);
    // No returning character is allowed: it's something to explain, not something that blocks.
    const none = returnProblems(good, ctx({ character: null }));
    expect(none.blocking).toEqual([]);
    expect(none.warnings.join(" ")).toMatch(/No returning character/);
  });
  it("keeps a learner's choice out of the shared story, and later episodes out of the opening", () => {
    const branch = { ...good, changed: "Because you asked her first, Dot has given the ladder to Fiona and feels much happier." };
    expect(returnProblems(branch, ctx()).blocking.join(" ")).toMatch(/as if it followed from a learner’s answer/);
    const later = [
      {
        title: "An invoice that looks right",
        summary: "Ava’s empathy doesn’t tell her whether an invoice matches the agreed service and rate. She has to check the source.",
      },
    ];
    expect(returnProblems(good, ctx({ later })).blocking).toEqual([]);
    const spoiled = {
      ...good,
      recap: "Later, Ava’s empathy doesn’t tell her whether an invoice matches the agreed service and rate, and she has to check the source.",
    };
    expect(returnProblems(spoiled, ctx({ later })).blocking.join(" ")).toMatch(/gives away a later episode, “An invoice that looks right”/);
    expect(contains("Dot likes the markets.", "A completely different thing about suppliers and agreements and rates")).toBe(0);
  });
  it("wants a reason for every block, and won't take “engaging” as one", () => {
    expect(returnProblems({ ...good, placements: [] }, ctx()).blocking.join(" ")).toMatch(/One block has no reason yet/);
    const lazy = { ...good, placements: [{ ...good.placements[0], why: "It’s more engaging." }] };
    expect(returnProblems(lazy, ctx()).blocking.join(" ")).toMatch(/isn’t a reason for a block/);
    // A block the Hub doesn't have is said to need building. It is never passed off as working.
    const made = ctx({
      blocks: [
        { id: "q", type: "decision", label: "Decision question", known: true },
        { id: "v", type: "hologram", label: "hologram", known: false },
      ],
    });
    expect(returnProblems(good, made).blocking.join(" ")).toMatch(/Needs implementation: hologram/);
  });
  it("cleans what it's given and keeps private lines to real choice ids", () => {
    const r = cleanReturn({
      purpose: "nonsense",
      recap: "  Hello  ",
      reflections: { "ask-dot": " A line. ", "bad id!": "x", empty: "" },
      placements: [{ blockId: "q", beat: "nope", why: "w" }, { nope: 1 }],
    });
    expect(r.purpose).toBe("transfer");
    expect(r.recap).toBe("Hello");
    expect(r.reflections).toEqual({ "ask-dot": "A line." });
    expect(r.placements).toEqual([{ blockId: "q", beat: "", does: "", why: "w", alternative: "", source: "", reviewer: "", missing: "" }]);
    expect(r.prerequisite).toBe(false);
  });
});

describe("a Field Note", () => {
  const at = (iso: string) => new Date(iso);
  const d = (over: Partial<Delivery> = {}): Delivery => ({
    eligibleAt: "2026-11-01T00:00:00.000Z",
    dueAt: "2026-11-15T00:00:00.000Z",
    deliveredAt: null,
    openedAt: null,
    dismissedAt: null,
    snoozedUntil: null,
    ...over,
  });
  it("moves through its states, and dismissal wins", () => {
    expect(noteState(d(), at("2026-11-20T00:00:00Z"), 90)).toBe("scheduled");
    const delivered = d({ deliveredAt: "2026-11-15T10:00:00.000Z" });
    expect(noteState(delivered, at("2026-11-16T00:00:00Z"), 90)).toBe("new");
    expect(noteState({ ...delivered, openedAt: "2026-11-16T00:00:00.000Z" }, at("2026-11-17T00:00:00Z"), 90)).toBe("read");
    expect(noteState({ ...delivered, snoozedUntil: "2026-11-23T00:00:00.000Z" }, at("2026-11-17T00:00:00Z"), 90)).toBe("snoozed");
    expect(noteState({ ...delivered, snoozedUntil: "2026-11-23T00:00:00.000Z" }, at("2026-11-24T00:00:00Z"), 90)).toBe("new");
    expect(noteState(delivered, at("2027-03-01T00:00:00Z"), 90)).toBe("expired");
    expect(noteState({ ...delivered, dismissedAt: "2026-11-16T00:00:00.000Z", openedAt: "2026-11-16T00:00:00.000Z" }, at("2026-11-17T00:00:00Z"), 90)).toBe(
      "dismissed",
    );
  });
  it("is capped: one in fourteen days, whatever note it is", () => {
    const now = at("2026-11-30T00:00:00Z");
    expect(capAllows([], now)).toBe(true);
    expect(capAllows(["2026-11-20T00:00:00.000Z"], now)).toBe(false);
    expect(capAllows(["2026-11-10T00:00:00.000Z"], now)).toBe(true);
    expect(capAllows(["2026-11-20T00:00:00.000Z"], now, { count: 2, days: 14 })).toBe(true);
  });
  it("is optional, in the Hub only, and never mentions what someone answered", () => {
    const n = cleanNote({ hook: "Dot has another outing in mind.", optional: false, channel: "email", delayDays: 9999, audience: ["coordinator", "martians"] });
    expect(n).toMatchObject({ optional: true, channel: "hub", delayDays: 180, audience: ["coordinator"] });
    expect(noteProblems({ ...emptyNote(), hook: "Dot has another outing in mind. Hear what each of them knows." })).toEqual([]);
    expect(noteProblems({ ...emptyNote(), hook: "Short" })).toHaveLength(1);
    expect(noteProblems({ ...emptyNote(), hook: "Last time you chose the ladder. See how Dot is getting on." }).join(" ")).toMatch(/shared screen/);
    expect(noteProblems({ ...emptyNote(), hook: "Your score on the roses question was low, so try this one." }).join(" ")).toMatch(/shared screen/);
    expect(reasonText("return", "Dot")).toBe("Dot has a new decision");
    expect(reasonText("guidance", "")).toBe("Guidance changed for a task you do");
  });
});

describe("reading evidence", () => {
  it("never joins two versions of a question into one series", () => {
    const rows = [
      { revision: 1, rubric: "aaa", answered: 12 },
      { revision: 2, rubric: "aaa", answered: 9 },
      { revision: 3, rubric: "bbb", answered: 20 },
      { revision: 4, rubric: "aaa", answered: 4 },
    ];
    const s = seriesByRubric(rows);
    expect(s.map((x) => x.rows.map((r) => r.revision))).toEqual([[1, 2], [3], [4]]);
  });
  it("notices a sentence that claims cause", () => {
    expect(causalClaims("Reversals fell from 31 to 22 between June and October. The Portal form went live on 1 October.")).toEqual([]);
    expect(causalClaims("Reversals fell in October. The return episode reduced reversals.")).toHaveLength(1);
    expect(causalClaims("The fall was due to the new course.")).toHaveLength(1);
    expect(causalClaims("This proves the story worked.")).toHaveLength(1);
  });
  it("counts a repeat contact as a contact and never as a case", () => {
    const kase = (events: [EventKind, string][], party = ""): Case => ({
      id: Math.random().toString(36),
      themeId: "t",
      source: "complaint",
      sourceRef: Math.random().toString(36),
      summary: "",
      link: "",
      falseMatch: false,
      party,
      events: events.map(([kind, on], i) => ({ id: `${i}`, kind, on, note: "" })),
    });
    const thrice = kase(
      [
        ["initial", "2026-06-09"],
        ["repeat", "2026-07-02"],
        ["repeat", "2026-08-18"],
      ],
      "Partner business A",
    );
    const other = kase([["initial", "2026-10-03"]], "partner business a");
    const updated = kase([
      ["initial", "2026-07-21"],
      ["update", "2026-07-28"],
      ["close", "2026-08-30"],
    ]);
    const c = countCases([thrice, other, updated], "2026-12-31");
    expect(c).toMatchObject({ cases: 3, contactEvents: 6, repeatContacts: 2, updates: 1, followUps: 3, repeatCases: 2, parties: 1, casesWithoutParty: 1 });
    expect(countCases([thrice], "2026-12-31")).toMatchObject({ cases: 1, contactEvents: 3, repeatContacts: 2 });
    expect(trend([thrice, other, updated], "2026-07", "2026-08")).toEqual([
      { bucket: "2026-07", newCases: 1, followUps: 2, reopened: 0, repeats: 1, contacts: 3 },
      { bucket: "2026-08", newCases: 0, followUps: 1, reopened: 0, repeats: 1, contacts: 1 },
    ]);
  });
});

describe("a model's draft", () => {
  const dot: CanonPerson = {
    id: "dot",
    name: "Dot",
    revision: 1,
    role: "An older person living in her own home.",
    summary: "",
    matters: "",
    relationships: [],
    portrayal: "",
    never: "",
    facts: [{ id: "roses", text: "Dot tends the roses in her front garden, and has for years, every morning before breakfast without fail." }],
    episodes: [{ id: "ep-roses", title: "Dot and the roses", whenLabel: "This spring", summary: "Dot wants to keep tending her roses.", seq: 20 }],
  };
  const later = [
    {
      title: "An invoice that looks right",
      summary: "Ava’s empathy doesn’t tell her whether an invoice matches the agreed service and rate. She has to check the source.",
    },
  ];

  it("isn't asked for at all where the response is a process fix, existing guidance or no learning", () => {
    expect(storyGate(null)).toEqual({ ok: true });
    expect(storyGate({ decided: true, learning: "new", barriers: ["judgement", "habit"] })).toEqual({ ok: true });
    expect(storyGate({ decided: false, learning: "new", barriers: ["judgement"] })).toMatchObject({ ok: false });
    const access = storyGate({ decided: true, learning: "new", barriers: ["access", "workflow"] });
    expect(!access.ok && access.reason).toMatch(/No story is proposed.*can’t change/);
    const none = storyGate({ decided: true, learning: "none", barriers: ["judgement"] });
    expect(!none.ok && none.reason).toMatch(/No learning item/);
    expect(storyGate({ decided: true, learning: "reuse", barriers: ["knowledge"] })).toMatchObject({ ok: false });
    // One learnable barrier among others is enough for learning to be part of the answer.
    expect(storyGate({ decided: true, learning: "revise", barriers: ["access", "attention"] })).toEqual({ ok: true });
  });

  it("has its opening read field by field: what gives away later story, follows a choice or recites canon is taken out", () => {
    const p = readReturnProposal(
      {
        fields: {
          recap: "In spring Fiona worried about the ladder [dot:roses] and Dot agreed to plan any change together.",
          changed: "Later, Ava’s empathy doesn’t tell her whether an invoice matches the agreed service and rate, so she has to check the source.",
          decide: "Because you asked her first last time, Dot now trusts you to decide for her.",
          principle: "Dot tends the roses in her front garden, and has for years, every morning before breakfast without fail.",
          cues: "A relative has offered help and nobody has objected.",
          workAction: "You must always ask the person before any change.",
        },
        rationale: "It tests the same judgement.",
        facts: ["dot:roses", "dot:made-up"],
        missing: ["Quality to confirm the criteria."],
      },
      { allowed: [dot], later },
    );
    expect(p.fields.map((f) => f.field)).toEqual(["recap", "cues", "workAction"]);
    // A citation written into a sentence is lifted out of it: a learner never reads "[dot:roses]".
    expect(p.fields[0].text).toBe("In spring Fiona worried about the ladder and Dot agreed to plan any change together.");
    expect(p.fields.find((f) => f.field === "workAction")!.needsSource).toBe(true);
    expect(p.fields.find((f) => f.field === "cues")!.needsSource).toBe(false);
    expect(p.used.map((u) => u.ref)).toEqual(["dot:roses"]);
    expect(p.dropped.join(" | ")).toMatch(/gave away a later episode/);
    expect(p.dropped.join(" | ")).toMatch(/learner’s choice as if it had happened/);
    expect(p.dropped.join(" | ")).toMatch(/recited an approved fact/);
    expect(p.dropped.join(" | ")).toMatch(/dot:made-up/);
    expect(p.missing).toEqual(["Quality to confirm the criteria."]);
  });

  it("offers only hooks that could be read over a shoulder", () => {
    const p = readNoteProposal(
      {
        hooks: [
          "Dot has another outing in mind. Hear what she and Fiona each know.",
          "Last time you chose the gardener. See what Dot wants now.",
          "Dot is back. You must always ask the person first.",
          "Dot has another outing in mind. Hear what she and Fiona each know.",
        ],
      },
      emptyNote(),
    );
    expect(p.hooks).toEqual(["Dot has another outing in mind. Hear what she and Fiona each know."]);
    expect(p.dropped).toHaveLength(2);
  });

  it("is sent back, and not offered, when a proposed question is the first one again", () => {
    const same = {
      prompt: first.prompt,
      choices: first.choices.map((c) => ({ text: c.text, verdict: c.verdict, feedback: "This would leave something unknown about Dot." })),
    };
    expect(questionIssues(same, first).join(" ")).toMatch(/Ask about a different judgement/);
    const read = readQuestionProposal(same, first);
    expect(read.prompt).toBe("");
    expect(read.choices).toEqual([]);
    expect(read.dropped.length).toBeGreaterThan(0);
    const fine = {
      context: "Fiona’s offer is kind.",
      prompt: second.prompt,
      choices: second.choices.map((c) => ({ text: c.text, verdict: c.verdict, feedback: "It leaves unasked what the outing is for Dot." })),
    };
    expect(questionIssues(fine, first)).toEqual([]);
    const ok = readQuestionProposal(fine, first);
    expect(ok.choices.map((c) => c.verdict)).toEqual(["best", "acceptable", "risky"]);
    expect(ok.dropped).toEqual([]);
    // An "alternate" that is the page's present question again is sent back, and never offered.
    expect(questionIssues(fine, first, second).join(" ")).toMatch(/question the page already has/);
    expect(readQuestionProposal(fine, first, second)).toMatchObject({ prompt: "", choices: [] });
    const other = {
      prompt: "Dot hasn’t replied to Fiona yet. What do you put to her first?",
      choices: [
        {
          text: "Whether she would still like to go herself, and what she’d miss if she didn’t.",
          verdict: "best",
          feedback: "It leaves nothing assumed about what Saturday is for.",
        },
        {
          text: "Which plants she would like Fiona to look out for this week.",
          verdict: "risky",
          feedback: "It treats the offer as settled, so what Dot wants from the morning stays unknown.",
        },
        {
          text: "Whether a lift to the entrance would make the walk easier.",
          verdict: "acceptable",
          feedback: "A fair idea, though it leaves unasked whether the walk is what’s in the way.",
        },
      ],
    };
    expect(questionIssues(other, first, second)).toEqual([]);
    expect(readQuestionProposal(other, first, second).choices).toHaveLength(3);
    // Words that only describe the field are not something an owner has to supply.
    expect(
      readQuestionProposal({ ...other, missing: ["what Quality or Operations must confirm", "Whether a lift can be arranged."] }, first, second).missing,
    ).toEqual(["Whether a lift can be arranged."]);
    // Two best answers, or none, isn't a question.
    expect(questionIssues({ ...fine, choices: fine.choices.map((c) => ({ ...c, verdict: "best" })) }, first).join(" ")).toMatch(/Exactly one/);
    // Feedback that states a rule is flagged for an approved source.
    const ruled = { ...fine, choices: fine.choices.map((c, i) => (i === 0 ? { ...c, feedback: "Policy says you must always ask the person first." } : c)) };
    expect(readQuestionProposal(ruled, first).choices[0].needsSource).toBe(true);
  });

  it("may describe the figures, and nothing more: no cause, and no number that isn't on the page", () => {
    const shown = "2026-06: 31 of 420 (7.4 per 100)\n2026-10: 22 of 428 (5.1 per 100)\n2026-10-01: Portal or product change: New plan-change form";
    const plain = "The work measure was 31 of 420 in June 2026 and 22 of 428 in October 2026. The Portal form went live on 1 October 2026, in the same month.";
    expect(summaryIssues({ text: plain }, shown)).toEqual([]);
    expect(readSummary({ text: plain }, shown).text).toBe(plain);
    const causal = "The work measure fell from 31 of 420 to 22 of 428 because of the return episode, which shows the learning worked.";
    expect(summaryIssues({ text: causal }, shown).join(" ")).toMatch(/says or implies cause/);
    expect(readSummary({ text: causal }, shown).text).toBe("");
    const invented = "The work measure fell by 29 percent between June 2026 and October 2026, from 31 of 420 to 22 of 428, across both months measured here.";
    expect(summaryIssues({ text: invented }, shown).join(" ")).toMatch(/aren’t on the page: 29/);
  });
});
