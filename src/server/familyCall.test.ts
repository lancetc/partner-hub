import { beforeEach, describe, expect, it, vi } from "vitest";
import { openDb, type Db } from "./db";
import { userById, type User } from "./auth";
import { createGuide, publishGuide, readGuide } from "./magazine";
import { allBlocks } from "@/lib/magazine";
import type { PhoneCallData } from "@/lib/phonecall";
import type { Proposal } from "@/lib/familyCall";
import { FIONA_GARDENER } from "@/content/familyCalls";
import { PHONE_CALLS } from "@/content/phoneCalls";
import { roleplayState, startAttempt, submitTurn, type Judge } from "./roleplay";
import {
  checkFamily,
  controlFamily,
  correctFamily,
  deleteFamily,
  endFamily,
  familyCallsAdmin,
  familyLine,
  familyRegister,
  familyState,
  familyStats,
  familyTurn,
  purgeExpired,
  reportFamilySource,
  resolveReview,
  retryFamily,
  reviewDetail,
  startFamily,
  submitFamily,
  viewedFamily,
  type FamilyModel,
} from "./familyCall";

/*
  The Tough Family Call on the server (PRD acceptance criteria 1, 3, 4, 13, 14, 15, 17 and the build request): it can't
  publish unsigned or with a broken case; readers get no facts, replies or rubric; every write is idempotent; the bounded
  caller is held to the facts with a scripted fallback when the model fails or strays; text and voice give the same
  result; events and reports carry no words; transcripts go after their retention days; old phone-call attempts still load.
*/

let db: Db;
let jordan: User, riley: User;
const now = new Date("2026-11-24T00:00:00Z");
const TODAY = "2026-11-24";

/** Test-only sign-off, so a reviewed call can publish. The demo's stays empty. */
function signed(over: (d: PhoneCallData) => void = () => {}): PhoneCallData {
  const d = structuredClone(FIONA_GARDENER);
  d.phone.approval = { owner: "O", finance: "", operations: "Op", quality: "Q", privacy: "P", approvedOn: TODAY };
  const f = d.family!;
  f.approval = {
    story: "S",
    complaints: "C",
    policy: "Po",
    accessibility: "A",
    escalation: "E",
    effectiveFrom: TODAY,
    reviewBy: "2027-05-01",
    scenarioReviewed: f.version,
  };
  for (const r of Object.values(f.risks)) if (r.critical) Object.assign(r, { approvedBy: "Quality", approvedOn: TODAY });
  f.voice.rights = { licence: "L", approvedUse: "U", recordedBy: "R", recordedOn: TODAY };
  over(d);
  return d;
}
const doc = (blocks: unknown[]) => ({
  schema: 2 as const,
  pages: [
    {
      id: "p1",
      title: "Call",
      purpose: "",
      template: "blank",
      kind: "content",
      required: true,
      allActivities: false,
      sections: [{ id: "s1", title: "Call", blocks }],
    },
  ],
});
function course(data: PhoneCallData = signed(), extra: unknown[] = []) {
  const c = createGuide(
    db,
    jordan,
    { title: "Family call", completion: "confirm", doc: doc([{ id: "call", type: "phonecall", ...data }, ...extra]) as never },
    now,
  );
  publishGuide(db, jordan, c.id, "", now);
  return c;
}
const events = (guideId: string, event?: string) =>
  (db.prepare("SELECT event, detail FROM magazine_events WHERE guide_id = ? ORDER BY rowid").all(guideId) as { event: string; detail: string }[]).filter(
    (e) => !event || e.event === event,
  );
function people(count: number, tag: string) {
  const ins = db.prepare("INSERT INTO users (id, name, email, org_id, role, audience) VALUES (?, ?, ?, ?, 'learner', 'coordinator')");
  return Array.from({ length: count }, (_, i) => {
    const id = `${tag}${i}`;
    ins.run(id, `Test ${id}`, `${id}@example.test`, riley.org_id);
    return userById(db, id)!;
  });
}
const SOUND = FIONA_GARDENER.family!.fixtures[0];
let n = 0;
/** The sound call, typed or spoken, through the API functions. */
async function soundCall(c: { id: string }, u: User, mode: "text" | "voice" = "text", model?: FamilyModel) {
  startFamily(db, u, c.id, { blockId: "call", channel: mode }, now);
  for (const t of SOUND.turns) {
    for (const k of t.checks) checkFamily(db, u, c.id, { blockId: "call", check: k }, now);
    await familyTurn(db, u, c.id, { blockId: "call", turnId: `t${++n}`, text: t.text, mode, heard: mode === "voice" ? t.text : undefined }, now, model);
  }
  endFamily(db, u, c.id, { blockId: "call", how: "end" }, now);
  return submitFamily(db, u, c.id, { blockId: "call", note: SOUND.note }, now);
}
const fake =
  (p: Partial<Proposal> & Record<string, unknown> = {}): FamilyModel =>
  async () => ({ intents: [], moves: [], risks: [], unclear: false, reply: "Right.", ...p });

beforeEach(() => {
  db = openDb(":memory:");
  [jordan, riley] = ["jordan", "riley"].map((id) => userById(db, id)!);
  // No model is connected unless a test says so: the reviewed script runs.
  vi.stubEnv("OPENAI_API_KEY", "");
  vi.stubEnv("ANTHROPIC_API_KEY", "");
  vi.stubEnv("ANTHROPIC_AUTH_TOKEN", "");
});

describe("publishing (AC1, AC16)", () => {
  it("can’t publish without the family reviewers, critical approvals and voice rights; can once they’re recorded", () => {
    const unsigned = signed((d) => {
      d.family!.approval.story = "";
      d.family!.risks["fc-r-booking"].approvedBy = "";
      d.family!.voice.rights.licence = "";
    });
    const g = createGuide(db, jordan, { title: "Unsigned", completion: "confirm", doc: doc([{ id: "call", type: "phonecall", ...unsigned }]) as never }, now);
    expect(() => publishGuide(db, jordan, g.id, "", now, { allowUnverified: true })).toThrow(/Tough Family Call needs its reviewers/);
    expect(() => course()).not.toThrow();
  });

  it("refuses a case that doesn’t hold together, as a case check that no sign-off waives", () => {
    const broken = signed((d) => void (d.family!.fixtures[0].expect.ending = "unresolved"));
    const g = createGuide(db, jordan, { title: "Broken", completion: "confirm", doc: doc([{ id: "call", type: "phonecall", ...broken }]) as never }, now);
    expect(() => publishGuide(db, jordan, g.id, "", now, { allowUnverified: true })).toThrow(/case check doesn’t pass/);
  });

  it("holds a published call whose review date has passed, if it’s assessed", () => {
    const c = course(
      signed((d) => {
        d.family!.mode = "assessed";
        d.family!.caller = "script";
      }),
    );
    expect(() => startFamily(db, riley, c.id, { blockId: "call" }, new Date("2027-06-01T00:00:00Z"))).toThrow(/due for review/);
  });
});

describe("what readers get", () => {
  it("the briefing and labels only: no facts, replies, intents, rubric or fixtures", () => {
    const c = course();
    const r = readGuide(db, riley, c.slug);
    const b = allBlocks(r.doc).find((x) => x.id === "call");
    expect(b?.type).toBe("phonecall");
    const f = (b as { family?: Record<string, unknown> }).family!;
    expect(f.intents).toEqual([]);
    expect(f.facts).toEqual([]);
    expect(f.criteria).toEqual([]);
    expect(JSON.stringify(b)).not.toMatch(/8,000|he’ll be there tomorrow|kettle/);
  });
});

describe("the call on the reviewed script", () => {
  it("runs end to end, idempotently, and completes once the debrief is viewed", async () => {
    const c = course();
    const first = startFamily(db, riley, c.id, { blockId: "call" }, now);
    expect(first.caller).toBe("script");
    expect(startFamily(db, riley, c.id, { blockId: "call" }, now).attemptId).toBe(first.attemptId);
    checkFamily(db, riley, c.id, { blockId: "call", check: "fc-prefs" }, now);
    checkFamily(db, riley, c.id, { blockId: "call", check: "fc-prefs" }, now);
    const t1 = await familyTurn(db, riley, c.id, { blockId: "call", turnId: "same", text: SOUND.turns[0].text }, now);
    const again = await familyTurn(db, riley, c.id, { blockId: "call", turnId: "same", text: SOUND.turns[0].text }, now);
    expect(again.transcript).toHaveLength(1);
    expect(again.transcript[0].reply).toBe(t1.transcript[0].reply);
    expect(t1.caseFile.find((s) => s.id === "fc-prefs")?.facts.length).toBeGreaterThan(0);
    expect(events(c.id, "case_file_checked")).toHaveLength(1);
    for (const t of SOUND.turns.slice(1)) {
      for (const k of t.checks) checkFamily(db, riley, c.id, { blockId: "call", check: k }, now);
      await familyTurn(db, riley, c.id, { blockId: "call", turnId: `x${++n}`, text: t.text }, now);
    }
    checkFamily(db, riley, c.id, { blockId: "call", check: "fc-booking" }, now);
    const ended = familyState(db, riley, c.id, "call", now);
    expect(ended.stage).toBe("wrap");
    await expect(familyTurn(db, riley, c.id, { blockId: "call", turnId: "late", text: "One more thing." }, now)).rejects.toThrow(/ended/);
    expect(() => submitFamily(db, riley, c.id, { blockId: "call", note: {} }, now)).toThrow(/follow-up note/);
    const sub = submitFamily(db, riley, c.id, { blockId: "call", note: SOUND.note }, now);
    expect(sub.debrief?.recommendation).toBe("practised");
    expect(sub.debrief?.ending).toBe("agreed-upset");
    // A resent submit, and a second view, change nothing.
    expect(submitFamily(db, riley, c.id, { blockId: "call", note: {} }, now).debrief?.score).toBe(sub.debrief?.score);
    viewedFamily(db, riley, c.id, { blockId: "call" }, now);
    viewedFamily(db, riley, c.id, { blockId: "call" }, now);
    expect(events(c.id, "activity_completed")).toHaveLength(1);
    expect(events(c.id, "response_submitted")).toHaveLength(1);
    expect(events(c.id, "complaint_route_offered")).toHaveLength(1);
    expect(events(c.id, "boundary_checked").length).toBeGreaterThanOrEqual(2);
    // Try again: a fresh attempt; the first keeps its debrief.
    const retry = retryFamily(db, riley, c.id, { blockId: "call", from: first.attemptId }, now);
    expect(retry.attemptNo).toBe(2);
    expect(retryFamily(db, riley, c.id, { blockId: "call", from: first.attemptId }, now).attemptNo).toBe(2);
  });

  it("never puts what was said or written into an event", async () => {
    const c = course();
    await soundCall(c, riley);
    viewedFamily(db, riley, c.id, { blockId: "call" }, now);
    reportFamilySource(db, riley, c.id, { blockId: "call", source: "fc-rights", kind: "outdated" }, now);
    const all = events(c.id);
    expect(all.length).toBeGreaterThan(10);
    // The learner’s words: every reply and every note field (the chosen actions are authored ids, not words).
    const { actions: _ids, ...fields } = SOUND.note;
    const words = [...SOUND.turns.map((t) => t.text), ...Object.values(fields).filter((x) => x.length > 6)];
    expect(_ids.length).toBeGreaterThan(0);
    for (const e of all) {
      for (const w of words) expect(e.detail.includes(String(w).slice(0, 25)), `${e.event} holds learner words`).toBe(false);
      const d = JSON.parse(e.detail);
      expect(d).toMatchObject({ scenario: "fiona-missed-gardener", scenarioVersion: FIONA_GARDENER.family!.version, rubric: "family-rubric-1" });
      expect(d.key).toBeTruthy();
      expect(d.characters).toBe("dot@pilot-canon-1,fiona@pilot-canon-1,ava@pilot-canon-1");
    }
    expect(all.find((e) => e.event === "source_issue_reported")?.detail).toMatch(/"kind":"outdated"/);
  });

  it("pauses, switches between text and voice, and leaves without penalty, keeping the call", async () => {
    const c = course();
    startFamily(db, riley, c.id, { blockId: "call" }, now);
    await familyTurn(db, riley, c.id, { blockId: "call", turnId: "a", text: SOUND.turns[0].text }, now);
    expect(controlFamily(db, riley, c.id, { blockId: "call", action: "pause" }, now).call?.paused).toBe(true);
    const switched = controlFamily(db, riley, c.id, { blockId: "call", action: "channel", channel: "voice" }, now);
    expect(switched.channel).toBe("voice");
    expect(switched.transcript).toHaveLength(1);
    expect(controlFamily(db, riley, c.id, { blockId: "call", action: "resume" }, now).call?.paused).toBe(false);
    expect(events(c.id, "call_paused")).toHaveLength(1);
    expect(events(c.id, "call_mode_selected").length).toBe(2);
    const left = endFamily(db, riley, c.id, { blockId: "call", how: "exit" }, now);
    expect(left.stage).toBe("left");
    expect(events(c.id, "activity_completed")).toHaveLength(0);
  });

  it("lets the learner delete their call", async () => {
    const c = course();
    const v = await soundCall(c, riley);
    expect(() => deleteFamily(db, jordan, { attemptId: v.attemptId })).toThrow(/isn’t here/);
    deleteFamily(db, riley, { attemptId: v.attemptId });
    expect(familyState(db, riley, c.id, "call", now).attemptId).toBeNull();
  });
});

describe("the bounded AI caller (AC3, AC13)", () => {
  beforeEach(() => vi.stubEnv("OPENAI_API_KEY", "test-key"));

  it("uses the model’s line when it stays within the facts, and the beat word for word", async () => {
    const c = course();
    expect(startFamily(db, riley, c.id, { blockId: "call" }, now).caller).toBe("bounded-ai");
    const v = await familyTurn(
      db,
      riley,
      c.id,
      { blockId: "call", turnId: "a", text: "I’m so sorry your mum waited in. Is she okay?" },
      now,
      fake({ intents: ["i-ack", "i-urgent"], reply: "Thanks. She’s fine, she’s not hurt. Just cross about it." }),
    );
    expect(v.transcript[0]).toMatchObject({ by: "ai", reply: "Thanks. She’s fine, she’s not hurt. Just cross about it." });
    const v2 = await familyTurn(
      db,
      riley,
      c.id,
      { blockId: "call", turnId: "b", text: "It was booked for 9 to 11." },
      now,
      fake({ intents: ["i-visit"], reply: "So where was he?" }),
    );
    // The budget demand arrives on its authored turn, appended to the model's paraphrase.
    expect(v2.transcript[1].reply).toMatch(/^So where was he\? And I want to see Mum’s budget/);
  });

  it("falls back to the reviewed script when the model strays, fails or answers outside the lists, and says so", async () => {
    const c = course();
    startFamily(db, riley, c.id, { blockId: "call" }, now);
    const strayed = await familyTurn(
      db,
      riley,
      c.id,
      { blockId: "call", turnId: "a", text: "Why didn’t he come?" },
      now,
      fake({ reply: "He was sick, and Mum said you can tell me her budget now. I’m her registered supporter." }),
    );
    expect(strayed.transcript[0].by).toBe("script");
    expect(strayed.transcript[0].reply).toBe(FIONA_GARDENER.family!.unknownReply);
    expect(strayed.notice).toMatch(/reviewed script/);
    const failed = await familyTurn(db, riley, c.id, { blockId: "call", turnId: "b", text: "I’m sorry." }, now, async () => {
      throw new Error("down");
    });
    expect(failed.transcript[1].by).toBe("script");
    const invalid = await familyTurn(
      db,
      riley,
      c.id,
      { blockId: "call", turnId: "c", text: "Is she okay?" },
      now,
      fake({ permission: "authorised", reply: "Fine." }),
    );
    expect(invalid.transcript[2].by).toBe("script");
    expect(events(c.id, "caller_fallback_used").map((e) => JSON.parse(e.detail).reason)).toEqual(["strayed", "unavailable", "invalid"]);
    // The case file and permissions are exactly as authored, whatever the model said.
    checkFamily(db, riley, c.id, { blockId: "call", check: "fc-prefs" }, now);
    const prefs = familyState(db, riley, c.id, "call", now).caseFile.find((s) => s.id === "fc-prefs")!;
    expect(prefs.facts.map((f) => f.text).join(" ")).toMatch(/hasn’t agreed to share them with Fiona/);
  });
});

describe("text and voice parity, and transcript correction (AC4)", () => {
  it("gives the same result typed or spoken", async () => {
    const [a, b] = people(2, "p");
    const c = course();
    const typed = await soundCall(c, a, "text");
    const spoken = await soundCall(c, b, "voice");
    expect({ ...spoken.debrief!, voiceTurns: 0 }).toEqual({ ...typed.debrief!, voiceTurns: 0 });
    expect(spoken.debrief!.voiceTurns).toBe(SOUND.turns.length);
  });

  it("corrects a spoken line before the result, logs the request, and refuses a typed one", async () => {
    const c = course();
    startFamily(db, riley, c.id, { blockId: "call", channel: "voice" }, now);
    await familyTurn(
      db,
      riley,
      c.id,
      { blockId: "call", turnId: "a", text: "Sorry. Her budget is 8000 dollars.", mode: "voice", heard: "Sorry. Her budget is 8000 dollars." },
      now,
    );
    await familyTurn(db, riley, c.id, { blockId: "call", turnId: "b", text: "I’ll check.", mode: "text" }, now);
    await familyTurn(db, riley, c.id, { blockId: "call", turnId: "c", text: "Bye." }, now);
    expect(() => correctFamily(db, riley, c.id, { blockId: "call", n: 2, text: "Something else." }, now)).toThrow(/typed replies/);
    const v = correctFamily(db, riley, c.id, { blockId: "call", n: 1, text: "Sorry. Her budget isn’t something I can share without Dot." }, now);
    expect(v.transcript[0].corrected).toMatch(/isn’t something/);
    expect(events(c.id, "transcript_correction_requested")).toHaveLength(1);
    const sub = submitFamily(db, riley, c.id, { blockId: "call", note: { concern: "Fiona upset about the gardener visit." } }, now);
    expect(sub.debrief?.critical).toEqual([]);
    expect(sub.debrief?.review).toEqual(["corrected:1"]);
    expect(() => correctFamily(db, riley, c.id, { blockId: "call", n: 1, text: "Too late." }, now)).toThrow(/before you submit/);
  });
});

describe("privacy and retention (AC14)", () => {
  it("removes the words after the retention days, keeping the levels and ending", async () => {
    const c = course();
    const v = await soundCall(c, riley);
    const before = db.prepare("SELECT result FROM family_call_attempts WHERE id = ?").get(v.attemptId) as { result: string };
    expect(purgeExpired(db, new Date("2026-12-20T00:00:00Z"))).toBe(0);
    expect(purgeExpired(db, new Date("2026-12-25T00:00:00Z"))).toBe(1);
    const after = familyState(db, riley, c.id, "call", new Date("2026-12-25T00:00:00Z"));
    expect(after.purged).toBe(true);
    expect(after.transcript).toEqual([]);
    expect(after.debrief?.moments.every((m) => m.quote === "")).toBe(true);
    expect(after.note.concern).toBe("");
    expect((db.prepare("SELECT result FROM family_call_attempts WHERE id = ?").get(v.attemptId) as { result: string }).result).toBe(before.result);
  });

  it("reads a caller line aloud only from the learner’s own call, and only with the voice’s rights recorded", async () => {
    const c = course();
    expect(familyLine(db, riley, c.id, "call", 0).line).toBe(FIONA_GARDENER.roleplay.opening);
    expect(familyLine(db, riley, c.id, "call", 0).voice.id).toBe("openai:coral");
    expect(() => familyLine(db, riley, c.id, "call", 1)).toThrow(/isn’t here/);
    await soundCall(c, riley);
    expect(familyLine(db, riley, c.id, "call", 1).line).toMatch(/kettle|not hurt/);
    expect(() => familyLine(db, jordan, c.id, "call", 1)).toThrow(/isn’t here/);
    const unvoiced = createGuide(
      db,
      jordan,
      { title: "No voice", completion: "confirm", doc: doc([{ id: "call", type: "phonecall", ...signed((d) => void (d.family!.voice.id = "")) }]) as never },
      now,
    );
    publishGuide(db, jordan, unvoiced.id, "", now);
    expect(() => familyLine(db, riley, unvoiced.id, "call", 0)).toThrow(/voice isn’t approved/);
  });
});

describe("reporting: totals, the Admin view, the review queue and the register (AC15)", () => {
  it("suppresses levels under five people, shows them from five, and refuses non-authors", async () => {
    const c = course();
    await soundCall(c, riley);
    expect(familyStats(db, jordan, c.id).blocks[0]).toMatchObject({ people: 1, suppressed: true, levels: null, criticalPatterns: null });
    expect(() => familyStats(db, riley, c.id)).toThrow();
    expect(() => familyCallsAdmin(db, riley, now)).toThrow();
    for (const u of people(4, "q")) await soundCall(c, u);
    const s = familyStats(db, jordan, c.id).blocks[0];
    expect(s.suppressed).toBe(false);
    expect(s.levels?.communication.reduce((a, b) => a + b, 0)).toBe(5);
    expect(s.practised).toBe(5);
    const admin = familyCallsAdmin(db, jordan, now).calls[0];
    expect(admin.totals.textOnly).toBe(5);
    expect(admin.health.continuity.some((x) => /New detail for Dot’s story owner/.test(x))).toBe(true);
    const row = familyRegister(db)[0];
    expect(row.responseId).toBe("fiona-missed-gardener:call");
    expect(row.dims.communication).toMatch(/of 3 \(n=5\)/);
    expect(JSON.stringify(row)).not.toMatch(/kettle|Archway Gardens this afternoon/);
  });

  it("sends an ambiguous assessed result to the review queue, audits opening it, and records the decision", async () => {
    const c = course(
      signed((d) => {
        d.family!.mode = "assessed";
        d.family!.caller = "script";
      }),
    );
    startFamily(db, riley, c.id, { blockId: "call" }, now);
    for (const t of [...SOUND.turns.slice(0, 4), { text: "I can’t promise he’ll be there tomorrow. Talk soon.", checks: [] }]) {
      for (const k of t.checks) checkFamily(db, riley, c.id, { blockId: "call", check: k }, now);
      await familyTurn(db, riley, c.id, { blockId: "call", turnId: `r${++n}`, text: t.text }, now);
    }
    endFamily(db, riley, c.id, { blockId: "call", how: "end" }, now);
    const sub = submitFamily(db, riley, c.id, { blockId: "call", note: SOUND.note }, now);
    expect(sub.debrief?.passed).toBeNull();
    viewedFamily(db, riley, c.id, { blockId: "call" }, now);
    expect(events(c.id, "assessment_passed")).toHaveLength(0);
    const q = familyCallsAdmin(db, jordan, now).calls[0].queue;
    expect(q).toHaveLength(1);
    expect(q[0].reasons[0].code).toBe("ambiguous:fc-r-booking");
    const detail = reviewDetail(db, jordan, q[0].attemptId, now);
    expect(detail.moments.some((m) => /can’t promise/.test(m.quote))).toBe(true);
    expect((db.prepare("SELECT COUNT(*) AS n FROM audit WHERE event = 'family_call.transcript_viewed'").get() as { n: number }).n).toBe(1);
    resolveReview(db, jordan, { attemptId: q[0].attemptId, decision: "passed" }, now);
    expect(events(c.id, "assessment_passed")).toHaveLength(1);
    expect(familyCallsAdmin(db, jordan, now).calls[0].queue).toHaveLength(0);
  });
});

describe("old Tough Phone Call attempts still work (backward compatibility)", () => {
  it("runs and loads a classic phone call beside a family call in the same course", async () => {
    vi.stubEnv("OPENAI_API_KEY", "test-key");
    const classic = structuredClone(PHONE_CALLS.find((x) => x.id === "no-show")!.data);
    classic.phone.approval = { owner: "O", finance: "", operations: "Op", quality: "Q", privacy: "P", approvedOn: TODAY };
    const c = course(signed(), [{ id: "classic", type: "phonecall", ...classic }]);
    const rev = readGuide(db, riley, c.slug).revisionId;
    const judge: Judge = async () => ({ moves: [], risks: [], unclear: false, state: 2, caption: "Still worried.", reply: "So what happens now?", end: false });
    const a = startAttempt(db, riley, c.id, { revisionId: rev, blockId: "classic" }, now).attempt!;
    await submitTurn(db, riley, c.id, { attemptId: a.id, turnId: "old-1", text: "That’s really worrying. How is your mum right now?" }, now, judge);
    // The family call runs on its own tables; the classic attempt loads exactly as before.
    await soundCall(c, riley);
    const old = roleplayState(db, riley, c.id, "classic");
    expect(old.attempt?.turns).toHaveLength(1);
    expect(old.attempt?.phone?.actions.length).toBeGreaterThan(0);
    expect(familyState(db, riley, c.id, "call", now).debrief?.recommendation).toBe("practised");
  });
});
