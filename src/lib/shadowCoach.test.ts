import { describe, expect, it } from "vitest";
import {
  applyMove,
  buildDebrief,
  caseProblems,
  CODES,
  emptyState,
  MoveError,
  parseMove,
  phaseOf,
  planProblems,
  readCoaching,
  shadowForReaders,
  shadowUsable,
  shadowView,
  signOffProblems,
  type AvailMap,
  type Move,
  type ShadowData,
  type ShadowState,
} from "./shadowCoach";
import { SHADOW_SOURCES } from "./shadowCoachSources";
import { charactersInBlock } from "./characters";
import { MAYA_SHADOW } from "@/content/shadowCoachCases";

/*
  First 100 Days: Shadow & Coach, the engine (docs/shadow-and-coach.md). Mapped to the PRD's acceptance criteria:
  a participant risk is actioned before coaching (2, 3); a possible incident isn't a SIRS determination (4); skill gap
  and workflow defect are told apart; humiliating or vague feedback gets targeted feedback and different constructive
  approaches are accepted (5); the plan uses only real, current content, with practice and an observation, and an
  author review for anything missing (6, 7); readiness needs the second, different sample, a defined task and its
  reviewer (8); the reader never gets the key (9); a source or rule change holds the block (10).
*/

const d = MAYA_SHADOW;
const CALL = "contribution-call";
const NOTE = "minimised-incident";
const current = (title = "t"): AvailMap[string] => ({ status: "current", title, version: "v1", href: "/x" });
const AVAIL: AvailMap = {
  "s-topic-contrib": current("Understanding Client Contributions"),
  "s-aid-contrib": { status: "missing", title: "A contribution explanation Job Aid", version: "", href: "" },
  "s-topic-types": current(),
  "s-practice-lab": current(),
  "s-redo": current(),
  "t-what": current(),
  "t-how": current(),
  "t-aid": { status: "unapproved", title: "Incident first steps", version: "", href: "" },
  "t-scenario": current(),
  "t-sirs": current(),
};

function play(data: ShadowData, sid: string, moves: Move[], avail = AVAIL): ShadowState {
  let s = emptyState(sid);
  for (const m of moves) s = applyMove(data, s, m, { avail });
  return s;
}
const views = (sid: string): Move[] => data(sid).artefacts.map((a) => ({ do: "view", artefact: a.id }));
const data = (sid: string) => d.scenarios.find((x) => x.id === sid)!;

const callMarks: Move[] = [
  { do: "mark", key: "c2", kind: "assumption", cls: "correct", cause: "skill", why: "Not the same: two are clinical supports." },
  { do: "mark", key: "c3", kind: "assumption", cls: "act_now", cause: "both", why: "An invented universal rate she may budget on." },
  { do: "mark", key: "c4", kind: "observation", cls: "act_now", cause: "", why: "She may cancel her nurse because of it." },
  { do: "mark", key: "n1", kind: "observation", cls: "correct", cause: "skill", why: "The note repeats the error." },
  { do: "mark", key: "n3", kind: "observation", cls: "process", cause: "workflow", why: "An out-of-date sheet." },
  { do: "mark", key: "q2", kind: "observation", cls: "act_now", cause: "workflow", why: "Others told the same." },
  { do: "mark", key: "omit:n3", kind: "missing", cls: "coach", cause: "skill", why: "No determination checked." },
];
const callActions: Move = { do: "act", now: ["a-source", "a-correct", "a-nurse", "a-record", "a-others"], later: ["a-sheet", "a-coach"] };
const goodCoaching: Move[] = [
  {
    do: "coach",
    text: "In your call with Mrs Lin on Thursday I heard you say all three services have the same contribution, about 20 per cent. What did you have to go on, and where did you check it?",
  },
  {
    do: "coach",
    text: "Let’s correct it with her today through the right process, and practise how to say what’s known. I’ll sit in on your next suitable call.",
  },
];
const callPlan: Move = {
  do: "plan",
  items: [
    { id: "s-correct", due: 0 },
    { id: "s-topic-contrib", due: 3 },
    { id: "s-aid-contrib", due: 2 },
    { id: "s-practice-roleplay", due: 5 },
    { id: "s-observe", due: 12 },
    { id: "s-process", due: 1 },
  ],
};
const callFollow: Move[] = [
  { do: "followView" },
  ...["e-category", "e-rate", "e-date", "e-source"].map((f): Move => ({ do: "evidence", field: f, state: "verified" })),
  { do: "evidence", field: "e-plan", state: "material_gap" },
];
const strongCall = (): Move[] => [
  ...views(CALL),
  ...callMarks,
  { do: "inspected" },
  callActions,
  ...goodCoaching,
  { do: "pushback", option: "p-source" },
  { do: "coached" },
  callPlan,
  { do: "assign" },
  ...callFollow,
  { do: "decide", outcome: "signoff", scope: "s-contrib", reviewer: "" },
];

const noteMarks: Move[] = [
  { do: "mark", key: "i1", kind: "observation", cls: "act_now", cause: "", why: "What was seen." },
  { do: "mark", key: "i2", kind: "allegation", cls: "act_now", cause: "", why: "An allegation." },
  { do: "mark", key: "i3", kind: "observation", cls: "correct", cause: "", why: "Her wish, passed on." },
  { do: "mark", key: "i5", kind: "assumption", cls: "act_now", cause: "both", why: "Closed without assessment." },
  { do: "mark", key: "m1", kind: "observation", cls: "act_now", cause: "", why: "Same worker tomorrow." },
  { do: "mark", key: "m2", kind: "assumption", cls: "coach", cause: "skill", why: "Reassurance." },
  { do: "mark", key: "q1", kind: "observation", cls: "process", cause: "workflow", why: "Fall-first form." },
  { do: "mark", key: "q2", kind: "observation", cls: "process", cause: "workflow", why: "A pattern." },
];
const noteToCoach = (act: Move): Move[] => [...views(NOTE), ...noteMarks, { do: "inspected" }, act];
const empathetic: Move = {
  do: "coach",
  text: "I know this was a hard afternoon, and I can see you cared about Mrs Lin. In your note you wrote that the worker grabbed her arm. What was going on for you? Let’s agree what to do next time, and I’ll review your next notes.",
};

describe("the shipped case", () => {
  it("passes its own check, names only Maya and Mrs Lin, and can’t be published as it ships", () => {
    expect(caseProblems(d)).toEqual([]);
    const people = charactersInBlock({ type: "shadowcoach", ...d }).map((c) => c.name);
    expect(people.sort()).toEqual(["Maya", "Mrs Lin"]);
    expect(d.coordinator.label).toMatch(/coordinator/i);
    const p = signOffProblems(d, "2026-11-24");
    expect(p.join(" ")).toMatch(/Sign-off still needed/);
    expect(p.join(" ")).toMatch(/placeholder/);
  });

  it("plays the strong contribution path to a defined-task sign-off, with no codes and full marks", () => {
    const s = play(d, CALL, strongCall());
    expect(phaseOf(s)).toBe("submit");
    const deb = buildDebrief(d, s);
    expect(deb.critical).toEqual([]);
    expect(deb.codes).toEqual([]);
    expect(deb.ending).toBe("signoff");
    expect(deb.score).toBe(deb.max);
    expect(deb.followup.scope).toMatch(/Explain contribution categories/);
  });
});

describe("criterion 1: the unsupported claim, highlighted and explained", () => {
  it("records the highlighted line with the manager’s reason, and finds the claim and its impact on Mrs Lin’s care", () => {
    const s = play(d, CALL, [...views(CALL), ...callMarks]);
    expect(s.marks.c3).toMatchObject({ cls: "act_now", why: "An invented universal rate she may budget on." });
    const deb = buildDebrief(d, play(d, CALL, strongCall()));
    expect(deb.findings.find((f) => f.id === "rate")).toMatchObject({ found: true, classRight: true });
    expect(deb.findings.find((f) => f.id === "impact")?.why).toMatch(/changed a decision about her clinical care/);
  });

  it("calling the invented rate “no issue” is the critical universal-rate error", () => {
    const moves = strongCall().map((m) => (m.do === "mark" && m.key === "c3" ? { ...m, cls: "none" as const } : m));
    const deb = buildDebrief(d, play(d, CALL, moves));
    expect(deb.critical.map((c) => c.code)).toContain("universal_rate");
  });
});

describe("criteria 2 and 3: an immediate participant risk is actioned before coaching", () => {
  it("a lesson in two weeks without correcting Mrs Lin’s advice shows the missing correction route, and coaching can’t start", () => {
    let s = play(d, CALL, [...views(CALL), ...callMarks, { do: "inspected" }, { do: "act", now: ["a-lesson"], later: [] }]);
    expect(s.actionsOk).toBe(false);
    expect(phaseOf(s)).toBe("act");
    const v = shadowView(d, s);
    expect(v.actions?.feedback?.critical[0].text).toMatch(/Correct the advice first/);
    expect(v.actions?.feedback?.missing.join(" ")).toMatch(/Correct the advice with Mrs Lin today/);
    expect(() => applyMove(d, s, goodCoaching[0])).toThrow(MoveError);
    // Fixing it lets the practice go on, but a good coaching phrase doesn’t erase the first gap.
    s = applyMove(d, s, callActions);
    expect(phaseOf(s)).toBe("coach");
    const rest = strongCall().slice(strongCall().indexOf(callActions) + 1);
    for (const m of rest) s = applyMove(d, s, m, { avail: AVAIL });
    const deb = buildDebrief({ ...d, mode: "assessed" }, s);
    expect(deb.critical.map((c) => c.code)).toEqual(["missed_correction"]);
    expect(deb.dims.find((x) => x.dim === "urgency")?.level).toBe(0);
    expect(deb.dims.find((x) => x.dim === "coaching")?.level).toBe(3);
    expect(deb.passed).toBe(false);
    expect(deb.ending).toBe("critical");
  });

  it("the incident note can’t reach coaching while safety and escalation wait for training, and empathy doesn’t make it a pass", () => {
    let s = play(d, NOTE, noteToCoach({ do: "act", now: ["b-course"], later: ["b-coach"] }));
    expect(s.actionsOk).toBe(false);
    expect(s.actionCodes).toContain("deferred_incident");
    expect(() => applyMove(d, s, empathetic)).toThrow(/Protect the person first/);
    s = applyMove(d, s, { do: "act", now: ["b-escalate", "b-safe", "b-words"], later: ["b-coach", "b-form"] });
    s = applyMove(d, s, empathetic);
    expect(readCoaching(data(NOTE), empathetic.do === "coach" ? empathetic.text : "").risks).toEqual([]);
    const deb = buildDebrief({ ...d, mode: "assessed" }, { ...s, coached: true, pushback: "q-explain" });
    expect(deb.critical.map((c) => c.code)).toContain("deferred_incident");
    expect(deb.passed).toBe(false);
  });

  it("waiting for Mrs Lin’s consent, or proof, is critical; a coaching reply that accepts it is too", () => {
    expect(play(d, NOTE, noteToCoach({ do: "act", now: ["b-escalate", "b-safe", "b-consent"], later: [] })).actionCodes).toContain("suppressed_allegation");
    expect(play(d, NOTE, noteToCoach({ do: "act", now: ["b-escalate", "b-safe", "b-proof"], later: [] })).actionCodes).toContain("deferred_incident");
    const s = play(d, NOTE, [
      ...noteToCoach({ do: "act", now: ["b-escalate", "b-safe"], later: ["b-coach"] }),
      empathetic,
      { do: "coach", text: "Thanks for explaining. Let’s keep going and I’ll review your next notes." },
      { do: "pushback", option: "q-choice" },
    ]);
    expect(buildDebrief(d, s).critical.map((c) => c.code)).toContain("suppressed_allegation");
  });

  it("puts coaching before protection down as a sequencing gap", () => {
    const s = play(d, NOTE, noteToCoach({ do: "act", now: ["b-escalate", "b-safe", "b-coach"], later: [] }));
    expect(s.actionsOk).toBe(true);
    expect(s.actionCodes).toContain("sequence");
  });
});

describe("criterion 4: a possible incident, never a SIRS determination", () => {
  it("deciding a priority or that it isn’t reportable is critical, and the case itself states no priority", () => {
    for (const id of ["b-priority", "b-minor"])
      expect(play(d, NOTE, noteToCoach({ do: "act", now: ["b-escalate", "b-safe", id], later: [] })).actionCodes).toContain("invented_priority");
    expect(play(d, NOTE, noteToCoach({ do: "act", now: ["b-escalate", "b-safe", "b-fall"], later: [] })).actionCodes).toContain("clinical_conclusion");
    const sc = data(NOTE);
    const text = JSON.stringify([sc.artefacts, sc.findings.map((f) => f.why), sc.followup, sc.coach.replies, sc.known]);
    expect(text).not.toMatch(/Priority [12]\b|is reportable|not reportable/i);
  });
});

describe("skill gap or workflow defect", () => {
  it("an out-of-date sheet read as her skill gap is marked as a misread cause; read as a source defect it isn’t", () => {
    const misread = strongCall().map((m) => (m.do === "mark" && m.key === "n3" ? { ...m, cause: "skill" as const } : m));
    expect(buildDebrief(d, play(d, CALL, misread)).codes).toContain("misread_cause");
    expect(buildDebrief(d, play(d, CALL, strongCall())).codes).not.toContain("misread_cause");
  });
  it("needs a process issue in the plan when the source is the problem", () => {
    const moves = strongCall().map((m) => (m.do === "plan" ? { ...m, items: m.items.filter((i) => i.id !== "s-process") } : m));
    expect(buildDebrief(d, play(d, CALL, moves)).codes).toContain("no_process_issue");
  });
});

describe("criterion 5: feedback in the manager’s own words", () => {
  const sc = data(CALL);
  it("humiliating feedback gets targeted feedback, a defensive reply and no coaching credit", () => {
    const text = "Honestly that call was embarrassing and you should have known better. Lift your game.";
    const r = readCoaching(sc, text);
    expect(r.risks.map((x) => x.code).sort()).toEqual(["blame", "humiliation", "vague"]);
    const s = play(d, CALL, [...strongCall().slice(0, strongCall().indexOf(callActions) + 1), { do: "coach", text }]);
    expect(s.turns[0].reply).toBe("defensive");
    expect(shadowView(d, s).coach?.turns[0].cues.join(" ")).toMatch(/hide the next mistake/);
    const deb = buildDebrief(d, { ...s, coached: true, pushback: "p-source" });
    expect(deb.dims.find((x) => x.dim === "coaching")?.level).toBe(0);
    expect(deb.coaching.turns[0].risks.map((x) => x.feedback).join(" ")).toMatch(/dignity/);
  });

  it("vague feedback is named as vague, with what would make it specific", () => {
    const s = play(d, CALL, [
      ...strongCall().slice(0, strongCall().indexOf(callActions) + 1),
      { do: "coach", text: "You need to be more careful with costs from now on." },
    ]);
    const deb = buildDebrief(d, { ...s, coached: true, pushback: "p-source" });
    expect(deb.codes).toContain("vague");
    expect(deb.coaching.missingMoves.map((m) => m.move)).toContain("Notice");
    expect(deb.dims.find((x) => x.dim === "coaching")!.level).toBeLessThanOrEqual(1);
  });

  it("accepts different constructive approaches that reach the same outcome", () => {
    const approaches = [
      [goodCoaching[0], goodCoaching[1]],
      [
        { do: "coach", text: "Mrs Lin may cancel her nurse because of the call. Can you talk me through what you said about the same contribution?" },
        { do: "coach", text: "Together we’ll correct it today and practise the explanation. I will observe your next call about costs." },
      ],
    ] as Move[][];
    for (const a of approaches) {
      const s = play(d, CALL, [
        ...strongCall().slice(0, strongCall().indexOf(callActions) + 1),
        ...a,
        { do: "pushback", option: "p-source" },
        { do: "coached" },
      ]);
      const deb = buildDebrief(d, s);
      expect(deb.codes.filter((c) => ["blame", "humiliation", "label", "conclusion", "vague"].includes(c))).toEqual([]);
      expect(deb.dims.find((x) => x.dim === "coaching")!.level).toBeGreaterThanOrEqual(2);
    }
  });

  it("a softened risky phrase goes to a reviewer instead of being scored", () => {
    const r = readCoaching(sc, "I’m not saying you were careless. In the call I heard you give one rate. Where did you check it?");
    expect(r.risks).toEqual([expect.objectContaining({ code: "blame", hedged: true })]);
    const s = play(d, CALL, [
      ...strongCall().slice(0, strongCall().indexOf(callActions) + 1),
      { do: "coach", text: "I’m not saying you were careless. In the call I heard you give one rate. Where did you check it?" },
    ]);
    expect(s.turns[0].risks).toEqual([]);
    expect(buildDebrief(d, { ...s, coached: true, pushback: "p-source" }).review).toBe(true);
  });

  it("a formal warning is an HR label, never coaching", () => {
    expect(readCoaching(sc, "In the call you said 20 per cent. This is going in your HR file as a formal warning.").risks.map((x) => x.code)).toContain(
      "label",
    );
  });
});

describe("criteria 6 and 7: a two-week plan from real, current content", () => {
  const sc = data(CALL);
  it("needs one or two current learning pieces, one supervised practice and one observation; the work action stays today", () => {
    expect(planProblems(sc, [{ id: "s-correct", due: 0 }], AVAIL).join(" ")).toMatch(/approved learning[^]*supervised practice[^]*observed work check/);
    expect(planProblems(sc, [{ id: "s-topic-contrib", due: 3 }], AVAIL).join(" ")).toMatch(/Keep the immediate work action/);
    expect(planProblems(sc, (callPlan as Extract<Move, { do: "plan" }>).items, AVAIL)).toEqual([]);
    const s = play(d, CALL, [...strongCall().slice(0, strongCall().indexOf(callPlan)), { do: "plan", items: [{ id: "s-correct", due: 9 }] }]);
    expect(s.plan[0].due).toBe(0);
  });

  it("content that isn’t current never counts as learning: a missing Job Aid becomes an author review request", () => {
    const missingTopic = { ...AVAIL, "s-topic-contrib": { status: "missing" as const, title: "", version: "", href: "" } };
    expect(
      planProblems(
        sc,
        [
          { id: "s-correct", due: 0 },
          { id: "s-topic-contrib", due: 3 },
          { id: "s-practice-roleplay", due: 5 },
          { id: "s-observe", due: 12 },
        ],
        missingTopic,
      ),
    ).toContain("Add one or two approved learning pieces that address the behaviour.");
    const deb = buildDebrief(d, play(d, CALL, strongCall()));
    expect(deb.reviewRequests).toEqual(["A contribution explanation Job Aid for live calls"]);
    expect(deb.plan.find((p) => p.id === "s-aid-contrib")).toMatchObject({ kind: "Author review request", status: "missing" });
    expect(deb.plan.find((p) => p.id === "s-topic-contrib")).toMatchObject({ status: "current", version: "v1" });
  });

  it("without the server’s catalogue, nothing with content can be assigned", () => {
    const s = play(d, CALL, strongCall().slice(0, strongCall().indexOf(callPlan) + 1));
    expect(() => applyMove(d, s, { do: "assign" }, { avail: {} })).toThrow(/approved learning/);
  });

  it("repeating the whole induction, or a quiz in place of an observation, is called out", () => {
    const moves = strongCall().map((m) => (m.do === "plan" ? { ...m, items: [...m.items, { id: "s-redo", due: 10 }, { id: "s-quiz", due: 7 }] } : m));
    const deb = buildDebrief(d, play(d, CALL, moves));
    expect(deb.codes).toEqual(expect.arrayContaining(["duplicate_course", "reading_only", "overload"]));
    expect(deb.dims.find((x) => x.dim === "learning")!.level).toBeLessThanOrEqual(1);
  });
});

describe("criterion 8: readiness needs the second, different sample", () => {
  const upToFollow = () => strongCall().slice(0, strongCall().indexOf(callFollow[0]));
  it("can’t decide before the second sample is reviewed", () => {
    const s = play(d, CALL, upToFollow());
    expect(phaseOf(s)).toBe("followup");
    expect(() => applyMove(d, s, { do: "decide", outcome: "signoff", scope: "s-contrib", reviewer: "" })).toThrow(/second sample/);
    const half = play(d, CALL, [...upToFollow(), { do: "followView" }, { do: "evidence", field: "e-category", state: "verified" }]);
    expect(() => applyMove(d, half, { do: "decide", outcome: "extend", scope: "", reviewer: "" })).toThrow(/mark every piece of evidence/);
  });

  it("a sign-off is blocked when the manager hasn’t marked its evidence verified, or its reviewer is missing", () => {
    const s = play(d, CALL, [
      ...upToFollow(),
      ...callFollow.slice(0, 2),
      ...callFollow.slice(2).map((m) => (m.do === "evidence" && m.field === "e-source" ? { ...m, state: "needs_verification" as const } : m)),
    ]);
    expect(() => applyMove(d, s, { do: "decide", outcome: "signoff", scope: "s-contrib", reviewer: "" })).toThrow(/Records the source/);
    const all = play(d, CALL, [...upToFollow(), ...callFollow, { do: "evidence", field: "e-plan", state: "verified" }]);
    expect(() => applyMove(d, all, { do: "decide", outcome: "signoff", scope: "s-services", reviewer: "" })).toThrow(/Care Coordination operations/);
  });

  it("signing off “fully compliant” is critical; signing off on evidence the sample doesn’t show is marked", () => {
    const out = strongCall().map((m) => (m.do === "decide" ? { ...m, scope: "s-all" } : m));
    expect(buildDebrief(d, play(d, CALL, out)).critical.map((c) => c.code)).toEqual(["signoff_out_of_scope"]);
    const over = [
      ...strongCall().slice(0, -1),
      { do: "evidence", field: "e-plan", state: "verified" } as Move,
      { do: "decide", outcome: "signoff", scope: "s-services", reviewer: "operations" } as Move,
    ];
    expect(buildDebrief(d, play(d, CALL, over)).codes).toContain("signoff_without_evidence");
  });

  it("the second sample is a different artefact testing the same judgement, and the case check holds it to that", () => {
    for (const sc of d.scenarios) {
      const first = new Set(sc.artefacts.flatMap((a) => a.lines.map((l) => l.text)));
      expect(sc.followup.artefact.lines.some((l) => first.has(l.text))).toBe(false);
    }
    const copy = structuredClone(d);
    copy.scenarios[0].followup.artefact.lines[0].text = copy.scenarios[0].artefacts[0].lines[1].text;
    expect(caseProblems(copy).join(" ")).toMatch(/repeats a line/);
  });

  it("the incident follow-up can’t be signed off without the Quality/incident owner", () => {
    const s = play(d, NOTE, [
      ...noteToCoach({ do: "act", now: ["b-escalate", "b-safe", "b-words"], later: ["b-coach", "b-form"] }),
      empathetic,
      { do: "pushback", option: "q-explain" },
      { do: "coached" },
      {
        do: "plan",
        items: [
          { id: "t-safety", due: 0 },
          { id: "t-what", due: 2 },
          { id: "t-scenario", due: 6 },
          { id: "t-observe", due: 14 },
          { id: "t-form", due: 2 },
        ],
      },
      { do: "assign" },
      { do: "followView" },
      ...["e-words", "e-escalated", "e-noclass", "e-wishes", "e-next"].map((f): Move => ({ do: "evidence", field: f, state: "verified" })),
    ]);
    expect(() => applyMove(d, s, { do: "decide", outcome: "signoff", scope: "s-recognise", reviewer: "" })).toThrow(/Quality\/incident owner/);
    const done = applyMove(d, s, { do: "decide", outcome: "escalate", scope: "", reviewer: "quality" });
    const deb = buildDebrief(d, done);
    expect(deb.critical).toEqual([]);
    expect(deb.followup.fields.find((f) => f.id === "e-next")).toMatchObject({ right: false });
  });
});

describe("criterion 9: what the reader’s page holds", () => {
  it("the readers’ copy has the frame only, and the view never carries the key", () => {
    const r = shadowForReaders({ id: "b", type: "shadowcoach" as const, ...d });
    expect(r.scenarios.every((sc) => !sc.artefacts.length && !sc.findings.length && !sc.actions.length && !sc.followup.fields.length)).toBe(true);
    const v = JSON.stringify(shadowView(d, play(d, CALL, strongCall().slice(0, -1))));
    for (const secret of [
      "essential",
      "misclassCode",
      "universal_rate",
      "verdict",
      '"fit"',
      '"state"',
      '"needs"',
      "outOfScope",
      "“In your call with Mrs Lin on Thursday",
      "Start from Mrs Lin",
    ])
      expect(v).not.toContain(secret);
  });
});

describe("criterion 10: a source or rule change holds the block", () => {
  it("a withdrawn source stops new attempts; one under review or a placeholder blocks publishing", () => {
    expect(shadowUsable(d).ok).toBe(true);
    const withdrawn = SHADOW_SOURCES.map((s) => (s.id === "doh-contributions" ? { ...s, status: "withdrawn" as const } : s));
    expect(shadowUsable(d, withdrawn).ok).toBe(false);
    const review = SHADOW_SOURCES.map((s) => (s.id === "acqsc-sirs-home" ? { ...s, status: "review-required" as const } : s));
    expect(signOffProblems(d, "2026-11-24", review).join(" ")).toMatch(/SIRS in residential and home services” needs review/);
  });

  it("a case resting on an old contribution rule set, or claiming the wrong category for its date, fails its check", () => {
    const old = structuredClone(d);
    old.scenarios[0].rules!.ruleSet = "2025-11-01";
    expect(caseProblems(old).join(" ")).toMatch(/current one is/);
    expect(shadowUsable(old).ok).toBe(false);
    const wrong = structuredClone(d);
    wrong.scenarios[0].rules!.claims[1] = { service: "personal_care", category: "independence" };
    expect(caseProblems(wrong).join(" ")).toMatch(/personal care isn’t independence/);
  });
});

describe("the case check", () => {
  it("refuses identifiers, rankings and a named coordinator", () => {
    const c = structuredClone(d);
    c.scenarios[0].artefacts[0].lines[0].text = "Call me on 0412 345 678.";
    c.intro = "A leaderboard of your coordinators.";
    c.coordinator.label = "Jessica";
    const p = caseProblems(c).join(" ");
    expect(p).toMatch(/real identifier/);
    expect(p).toMatch(/No ranking/);
    expect(p).toMatch(/never a named person/);
  });
  it("parses moves strictly: unknown shapes are refused", () => {
    expect(parseMove({ do: "mark", key: "c1; drop", kind: "observation", cls: "coach", cause: "" })).toBeNull();
    expect(parseMove({ do: "decide", outcome: "competent", scope: "", reviewer: "" })).toBeNull();
    expect(parseMove({ do: "coach", text: "x".repeat(2000) })).toMatchObject({ text: "x".repeat(600) });
    expect(Object.keys(CODES)).toContain("signoff_out_of_scope");
  });
});
