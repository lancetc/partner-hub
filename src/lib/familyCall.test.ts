import { describe, expect, it } from "vitest";
import { FIONA_GARDENER } from "@/content/familyCalls";
import { charactersInBlock } from "./characters";
import { freshPhoneCall } from "./phonecall";
import {
  callerLineProblems,
  caseFile,
  correctTurn,
  cuesNow,
  emptyNote,
  endCall,
  familyCaseProblems,
  familyForReaders,
  familyHardProblems,
  familyResult,
  interpret,
  openCheck,
  playFixture,
  proposalIssues,
  startState,
  takeTurn,
  type FamilyBlock,
  type FamilyNote,
  type FamilyState,
  type Proposal,
} from "./familyCall";

/*
  The Tough Family Call engine (PRD acceptance criteria 2, 3, 4, 5, 6, 7, 8, 9, 10, 13): the Dot/Fiona case holds
  together; the caller can't change a fact or a permission; a sound call passes with Fiona still upset; a blanket
  disclosure, an invented booking, a funding promise and a discouraged complaint get targeted feedback; ambiguous or
  model-only critical findings go to a person; text and voice are the same call; corrections are reviewed, not silent.
*/

const block = (): FamilyBlock => structuredClone(FIONA_GARDENER) as unknown as FamilyBlock;
const TODAY = "2026-11-24";

/** Plays turns (each with case-file sections opened before it) through the reviewed script. */
function play(b: FamilyBlock, turns: (string | { text: string; mode?: "text" | "voice"; checks?: string[] })[], opts: { lower?: boolean } = {}) {
  let st: FamilyState = startState(b, { lower: opts.lower, cues: true });
  const replies: string[] = [];
  for (const t of turns) {
    const x = typeof t === "string" ? { text: t } : t;
    for (const c of x.checks ?? []) st = openCheck(b, st, c);
    const out = takeTurn(b, st, { text: x.text, mode: x.mode ?? "text" });
    st = out.state;
    replies.push(out.authored);
  }
  return { st, replies };
}
const SOUND = FIONA_GARDENER.family!.fixtures[0];
const soundNote = (): FamilyNote => structuredClone(SOUND.note);

describe("the Dot and Fiona case", () => {
  it("passes its own case check, and every evaluation fixture ends where it says", () => {
    const b = block();
    expect(familyCaseProblems(b)).toEqual([]);
    for (const fx of b.family.fixtures) expect(playFixture(b, fx).problems, fx.label).toEqual([]);
  });

  it("names only Dot and Fiona, from the character library, so publishing queues no new portrait", () => {
    const people = charactersInBlock({ type: "phonecall", ...FIONA_GARDENER } as never).map((c) => c.name);
    expect(people.sort()).toEqual(["Dot", "Fiona"]);
    expect(FIONA_GARDENER.family!.characters.map((c) => c.id)).toEqual(["dot", "fiona", "ava"]);
  });

  it("starts with Dot’s goal, Fiona’s concern, known and disputed facts, precise sharing preferences and a version", () => {
    const f = block().family;
    expect(f.version).toBeTruthy();
    expect(f.olderPersonGoal).toMatch(/roses/);
    expect(f.sharing.find((s) => s.id === "visits")?.allowed).toBe(true);
    expect(f.sharing.find((s) => s.id === "health")?.allowed).toBe(true);
    expect(f.sharing.find((s) => s.id === "budget")?.allowed).toBe(false);
    expect(new Set(f.facts.map((x) => x.status))).toEqual(new Set(["verified", "unknown", "reported", "disputed"]));
  });

  it("ships unsigned: the reviewers, each critical error and the voice’s rights are still to come", () => {
    const hard = familyHardProblems(block(), TODAY);
    expect(hard.some((p) => /story owner/.test(p))).toBe(true);
    expect(hard.some((p) => /approve “fc-r-booking” as a critical error/.test(p))).toBe(true);
    expect(hard.some((p) => /voice’s licence/.test(p))).toBe(true);
  });

  it("survives being copied with fresh ids, as a second copy in one course is", () => {
    const copy = freshPhoneCall(FIONA_GARDENER, "abcde") as unknown as FamilyBlock;
    expect(copy.roleplay.moves[0].id).toMatch(/-pabcde$/);
    expect(familyCaseProblems(copy)).toEqual([]);
  });
});

describe("the caller can’t change facts or permissions (AC3)", () => {
  it("keeps facts and permissions out of the state entirely: there is nothing a turn could rewrite", () => {
    const b = block();
    const st = startState(b);
    expect(Object.keys(st).sort()).toEqual([
      "checks",
      "counters",
      "cues",
      "ended",
      "evals",
      "fired",
      "flags",
      "intensity",
      "lower",
      "paused",
      "revealed",
      "safetyRule",
      "turn",
    ]);
  });

  it("refuses a model line that claims a permission, a legal status, a booking, a reason or a number", () => {
    const b = block();
    const ctx = { allowed: [] as string[], heard: [] as string[], authored: "Yeah, well." };
    expect(callerLineProblems(b, "Mum said you can tell me the budget now. I’m her registered supporter.", ctx).join()).toMatch(
      /registered supporter|can’t make/,
    );
    expect(callerLineProblems(b, "He was sick, apparently.", ctx).join()).toMatch(/he was sick/);
    expect(callerLineProblems(b, "He’s rebooked for 10 tomorrow.", ctx).join()).toMatch(/number|rebooked/);
    expect(callerLineProblems(b, "Let me check the system for you.", ctx).join()).toMatch(/staff/);
    // A revelation that hasn't been unlocked yet can't be voiced early.
    expect(callerLineProblems(b, "He does the arch roses better than anyone.", ctx).join()).toMatch(/not yet revealed/);
    expect(callerLineProblems(b, "He does the arch roses better than anyone.", { ...ctx, allowed: ["dotview"] })).toEqual([]);
  });

  it("refuses a proposal with fields or ids outside the authored lists", () => {
    const b = block();
    const issues = proposalIssues({ intents: ["give-permission"], moves: [], risks: [], reply: "Fine.", permission: "authorised" }, b);
    expect(issues.join(" ")).toMatch(/Remove "permission"/);
    expect(issues.join(" ")).toMatch(/"give-permission" isn't one of the intent ids/);
  });

  it("still flags a budget disclosure by rule, whatever a model says about permission", () => {
    const b = block();
    const proposal: Proposal = { intents: ["i-ack"], moves: [], risks: [], unclear: false, reply: "Thanks. Mum said that's fine to share." };
    const out = takeTurn(b, startState(b), { text: "Sorry. Her budget is $8,000 a quarter.", mode: "text", proposal });
    expect(out.eval.risks.map((r) => r.id)).toContain("fc-r-budget");
    expect(out.eval.risks.find((r) => r.id === "fc-r-budget")?.by).toBe("rule");
  });

  it("answers an off-script question with verified uncertainty, and a known one from what Fiona knows", () => {
    const b = block();
    expect(takeTurn(b, startState(b), { text: "What colour is his ute?", mode: "text" }).authored).toBe(b.family.unknownReply);
    expect(takeTurn(b, startState(b), { text: "Did anyone call your mum this morning?", mode: "text" }).authored).toMatch(/Nobody rang Mum/);
  });

  it("answers each thing the learner did once, even after a beat raised the same topic (found in the live check)", () => {
    const b = block();
    const { replies } = play(b, SOUND.turns);
    expect(replies[0]).toMatch(/not hurt/);
    expect(replies[2]).toMatch(/Ask her, then/);
    expect(replies[3]).toMatch(/not letting this go/);
    // Saying it again doesn't repeat her answer or move her again.
    const again = play(b, ["I’m sorry.", "I’m sorry."]);
    expect(again.replies[1].startsWith(b.family.holdReply)).toBe(true);
  });

  it("answers what Fiona knows only when she’s asked (found in the live check)", () => {
    const b = block();
    expect(interpret(b, "If he’s unreliable we’ll look at it.").intents).not.toContain("k-before");
    expect(interpret(b, "Has this happened before?").intents).toContain("k-before");
  });

  it("never takes a model’s quote the learner didn’t say", () => {
    const b = block();
    const proposal: Proposal = { intents: [], moves: [{ id: "fc-next-step", quote: "I'll call you back by 4" }], risks: [], unclear: false, reply: "Okay." };
    const out = takeTurn(b, startState(b), { text: "Right, okay then.", mode: "text", proposal });
    expect(out.eval.moves).toEqual([]);
  });
});

describe("an angry-but-correct call can pass (AC5, AC10)", () => {
  it("passes the sound call while Fiona is still upset at the end", () => {
    const b = block();
    const { result, state } = playFixture(b, b.family.fixtures[0]);
    expect(state.intensity).toBeGreaterThanOrEqual(2);
    expect(b.roleplay.states[state.intensity]).toBe("Upset");
    expect(result.recommendation).toBe("practised");
    expect(result.ending).toBe("agreed-upset");
    expect(result.defensible).toBe(true);
  });

  it("doesn’t reward a promise that calms her: calm and unsafe, or upset and sound", () => {
    const b = block();
    const { result, state } = playFixture(b, b.family.fixtures[2]);
    expect(state.intensity).toBe(0);
    expect(result.recommendation).toBe("another-attempt");
    expect(result.ending).toBe("unsupported-promise");
  });

  it("has no rapport meter: the indicator is hidden, and practice cues are rules with their reasons", () => {
    const b = block();
    expect(b.roleplay.hideMeter).toBe(true);
    const { st } = play(b, ["Hi Fiona."]);
    const cues = cuesNow(b, st);
    expect(cues.find((c) => c.id === "cue-unverified")?.why).toMatch(/booking isn’t open/);
    // Turned off by the learner, or in assessed mode, there are none.
    expect(cuesNow(b, { ...st, cues: false })).toEqual([]);
    const assessed = { ...b, family: { ...b.family, mode: "assessed" as const } };
    expect(cuesNow(assessed, st)).toEqual([]);
    expect(startState(assessed, { cues: true }).cues).toBe(false);
  });
});

describe("boundaries follow Dot’s exact preferences (AC6)", () => {
  it("treats sharing Dot’s budget as critical, whoever Fiona is to her", () => {
    const b = block();
    const { result } = playFixture(b, b.family.fixtures[3]);
    expect(result.critical).toEqual(["fc-r-budget"]);
    const c = result.criticalFindings.find((x) => x.risk === "fc-r-budget")!;
    expect(c.consequence).toMatch(/Dot asked/);
    expect(c.better).toMatch(/stays between her and us/);
  });

  it("caps a blanket refusal (not critical) and rewards sharing what Dot allows", () => {
    const b = block();
    const blanket = playFixture(b, b.family.fixtures[4]).result;
    expect(blanket.critical).toEqual([]);
    expect(blanket.levels.boundaries).toBeLessThanOrEqual(1);
    expect(blanket.codes).toContain("fc-r-blanket");
    const { st } = play(b, [{ text: "The visit was booked for 9 to 11 this morning.", checks: ["fc-prefs"] }]);
    expect(st.evals[0].moves.map((m) => m.id)).toContain("fc-visit-update");
  });
});

describe("targeted feedback on the critical errors (AC7)", () => {
  const critical = (text: string) => {
    const b = block();
    let { st } = play(b, [text, "I’ll check with the business.", "Bye."]);
    st = endCall(b, st, "end");
    return familyResult(b, st, emptyNote());
  };

  it("an invented booking: the moment, what it meant and a better option", () => {
    const r = critical("Don’t worry, he’ll be there tomorrow first thing.");
    const c = r.criticalFindings.find((x) => x.risk === "fc-r-booking")!;
    expect(c.turn).toBe(1);
    expect(c.quote).toMatch(/tomorrow first thing/);
    expect(c.consequence).toMatch(/no confirmed booking/);
    expect(c.better).toMatch(/can’t promise a time/);
    expect(r.recommendation).toBe("another-attempt");
  });

  it("an unapproved funding promise", () => {
    const r = critical("We’ll waive the charge for this morning, she won’t pay a cent.");
    expect(r.critical).toContain("fc-r-funding");
    expect(r.criticalFindings[0].better).toMatch(/isn’t known yet/);
  });

  it("a discouraged complaint, never read as offering the route", () => {
    const b = block();
    const r = interpret(b, "There’s no need to make a complaint about this.");
    expect(r.risks.map((x) => x.id)).toEqual(["fc-r-complaint"]);
    expect(r.moves.map((x) => x.id)).not.toContain("fc-complaint");
    expect(critical("There’s no need to make a complaint about this.").critical).toContain("fc-r-complaint");
  });

  it("a hedged critical phrase isn’t scored: it goes to a reviewer", () => {
    const b = block();
    const { st } = play(b, ["I can’t promise he’ll be there tomorrow, but I’ll find out."]);
    expect(st.evals[0].risks[0]).toMatchObject({ id: "fc-r-booking", hedged: true });
    expect(st.evals[0].review).toEqual(["ambiguous:fc-r-booking"]);
    const r = familyResult(b, endCall(b, st, "end"), emptyNote());
    expect(r.critical).toEqual([]);
    expect(r.review).toEqual(["ambiguous:fc-r-booking"]);
  });

  it("a critical finding only the model saw goes to review, not to a fail", () => {
    const b = block();
    const proposal: Proposal = { intents: [], moves: [], risks: [{ id: "fc-r-reason", quote: "it was a mix-up on his end" }], unclear: false, reply: "Right." };
    const out = takeTurn(b, startState(b), { text: "Sorry, it was a mix-up on his end.", mode: "text", proposal });
    expect(out.eval.review).toEqual(["model-only:fc-r-reason"]);
    const r = familyResult(b, endCall(b, out.state, "end"), emptyNote());
    expect(r.critical).toEqual([]);
    expect(r.criticalFindings.find((c) => c.risk === "fc-r-reason")?.by).toBe("model");
  });

  it("an assessed call with an unapproved critical threshold isn’t failed automatically", () => {
    const b = block();
    b.family.mode = "assessed";
    const { st } = play(b, ["Her budget is $8,000 a quarter.", "Bye.", "Bye."]);
    const r = familyResult(b, endCall(b, st, "end"), emptyNote());
    expect(r.passed).toBeNull();
    expect(r.review).toContain("unapproved:fc-r-budget");
    b.family.risks["fc-r-budget"].approvedBy = "Quality";
    b.family.risks["fc-r-budget"].approvedOn = TODAY;
    expect(familyResult(b, endCall(b, st, "end"), emptyNote()).passed).toBe(false);
  });
});

describe("text and voice are the same call (AC4)", () => {
  it("gives the same replies, state and result whichever way the learner answers", () => {
    const b = block();
    const turns = SOUND.turns;
    const typed = play(
      b,
      turns.map((t) => ({ ...t, mode: "text" as const })),
    );
    const spoken = play(
      b,
      turns.map((t) => ({ ...t, mode: "voice" as const })),
    );
    expect(spoken.replies).toEqual(typed.replies);
    const a = familyResult(b, typed.st, soundNote());
    const c = familyResult(b, spoken.st, soundNote());
    expect({ ...c, voiceTurns: 0 }).toEqual({ ...a, voiceTurns: 0 });
    expect(c.voiceTurns).toBe(turns.length);
  });

  it("lets a misheard reply be corrected before the result, and sends a changed critical finding to review", () => {
    const b = block();
    // Speech recognition heard "budget is 8000" for "budget isn't something I can share".
    const { st } = play(b, [{ text: "Her budget is 8000 dollars.", mode: "voice" }, "I’ll check.", "Bye."]);
    expect(st.evals[0].risks.map((r) => r.id)).toContain("fc-r-budget");
    const fixed = correctTurn(b, st, 1, "Her budget isn’t something I can share without Dot.");
    expect(fixed.evals[0].risks).toEqual([]);
    expect(fixed.evals[0].corrected).toBe(true);
    expect(fixed.evals[0].review).toEqual(["corrected:1"]);
    expect(fixed.counters.corrections).toBe(1);
    // The story isn't rewritten.
    expect(fixed.flags).toEqual(st.flags);
    expect(() => correctTurn(b, st, 2, "Something else.")).toThrow(/typed replies are as you sent them/);
  });

  it("pausing and ending change nothing that’s scored", () => {
    const b = block();
    const { st } = play(b, SOUND.turns.slice(0, 2));
    const paused = { ...st, paused: true };
    const next = takeTurn(b, paused, { text: SOUND.turns[2].text, mode: "text" });
    expect(next.state.paused).toBe(false);
    const plain = takeTurn(b, st, { text: SOUND.turns[2].text, mode: "text" });
    expect(next.authored).toBe(plain.authored);
  });
});

describe("the follow-up note and the debrief (AC8, AC9)", () => {
  it("distinguishes verified facts, Dot’s wishes, open questions, the owner and the next contact", () => {
    const b = block();
    const sound = playFixture(b, SOUND).result;
    expect(sound.note.every((n) => n.ok)).toBe(true);
    const note = { ...soundNote(), verified: "Gardener is unreliable and was sick this morning.", owner: "", nextContact: "" };
    const r = familyResult(b, playFixture(b, SOUND).state, note);
    expect(r.codes).toEqual(expect.arrayContaining(["assumption-as-fact", "no-owner", "no-next-contact"]));
    expect(r.note.find((n) => n.field === "verified")?.text).toMatch(/doesn’t confirm/);
    expect(r.levels.accuracy).toBeLessThan(3);
  });

  it("points each score to the learner’s words and the criteria, and accepts another respectful wording", () => {
    const b = block();
    const r = playFixture(b, SOUND).result;
    for (const d of r.dims) expect(d.criteria).toHaveLength(3);
    expect(r.moments.every((m) => m.quote && m.behaviour)).toBe(true);
    // The reviewed alternative, in different words, shows the same behaviours with nothing unsafe.
    const alt = interpret(b, b.family.alternative.line);
    expect(alt.risks).toEqual([]);
    expect(alt.moves.map((m) => m.id)).toEqual(expect.arrayContaining(["fc-ack", "fc-next-step", "fc-complaint"]));
  });

  it("shows the case file only as each section is opened, with each fact’s status in words", () => {
    const b = block();
    let st = startState(b);
    expect(caseFile(b, st).every((c) => !c.facts.length)).toBe(true);
    st = openCheck(b, st, "fc-booking");
    const booking = caseFile(b, st).find((c) => c.id === "fc-booking")!;
    expect(booking.facts.map((f) => f.statusLabel)).toEqual(expect.arrayContaining(["Verified in the record", "Not known yet"]));
    expect(() => openCheck(b, st, "the-real-crm")).toThrow();
  });

  it("stops on a safety phrase with the reviewed response, never a model", () => {
    const b = block();
    const out = takeTurn(b, startState(b), { text: "Is she safe? Has someone hit her?", mode: "text" });
    expect(out.state.ended).toBe("safety");
    expect(out.authored).toMatch(/practice call pauses/);
    expect(familyResult(b, out.state, emptyNote()).ending).toBe("paused-safety");
  });
});

describe("what a learner’s browser gets", () => {
  it("keeps the replies, intents, rubric, facts, endings, cues, fixtures and verdicts on the server", () => {
    const r = familyForReaders(block().family);
    expect(r.intents).toEqual([]);
    expect(r.facts).toEqual([]);
    expect(r.criteria).toEqual([]);
    expect(r.risks).toEqual({});
    expect(r.fixtures).toEqual([]);
    expect(r.cues).toEqual([]);
    expect(r.wrapUp.every((w) => w.verdict === "okay" && !w.risk && !w.feedback)).toBe(true);
    expect(r.ava.brief).toBeTruthy();
    expect(r.ava.debrief).toBe("");
    expect(JSON.stringify(r)).not.toMatch(/8,000|he’ll be there tomorrow/);
  });
});
