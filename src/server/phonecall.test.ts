import { beforeEach, describe, expect, it, vi } from "vitest";
import { openDb, type Db } from "./db";
import { userById, type User } from "./auth";
import { createGuide, publishGuide, readGuide } from "./magazine";
import { publishChecks } from "@/lib/magazine";
import { charactersInBlock } from "@/lib/characters";
import { DISCLOSURE_ID, freshPhoneCall, phoneResult, restrictedSaid, type PhoneCallData } from "@/lib/phonecall";
import { PHONE_CALLS } from "@/content/phoneCalls";
import { finishAttempt, lookup, rewriteLine, roleplayState, startAttempt, submitTurn, turnPrompt, type Judge, type Judgement } from "./roleplay";

/* Tough Phone Call: case tools reveal only authored facts, a privacy breach and a missed urgent cue are caught by rule, and the debrief rates six things from the learner's own words. */

let db: Db;
let jordan: User, riley: User;
const now = new Date("2026-11-20T00:00:00Z");
const SIGNED = { owner: "Owner", finance: "Finance", operations: "Care Operations", quality: "Quality", privacy: "Privacy", approvedOn: "2026-11-20" };
const scene = (id: "declined-invoice" | "no-show", signed = true): PhoneCallData => {
  const d = structuredClone(PHONE_CALLS.find((c) => c.id === id)!.data);
  if (signed) d.phone.approval = { ...SIGNED };
  return d;
};
const doc = (data: PhoneCallData) => ({
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
      sections: [{ id: "s1", title: "Call", blocks: [{ id: "call", type: "phonecall", ...data }] }],
    },
  ],
});
function course(data: PhoneCallData) {
  const c = createGuide(db, jordan, { title: "Phone", completion: "confirm", doc: doc(data) as never }, now);
  publishGuide(db, jordan, c.id, "", now);
  return { c, rev: readGuide(db, riley, c.slug).revisionId };
}
const says =
  (j: Partial<Judgement>): Judge =>
  async () => ({ moves: [], risks: [], unclear: false, state: 2, caption: "The caller is still worried.", reply: "So what happens now?", end: false, ...j });
let n = 0;
const begin = (c: { id: string }, rev: string) => startAttempt(db, riley, c.id, { revisionId: rev, blockId: "call" }, now).attempt!;
const say = (c: { id: string }, id: string, text: string, judge: Judge = says({})) =>
  submitTurn(db, riley, c.id, { attemptId: id, turnId: `t${++n}`, text }, now, judge).then((r) => r.attempt);
const look = (c: { id: string }, id: string, actionId: string) => lookup(db, riley, c.id, { attemptId: id, actionId }, now).attempt;

beforeEach(() => {
  db = openDb(":memory:");
  [jordan, riley] = ["jordan", "riley"].map((id) => userById(db, id)!);
  vi.stubEnv("OPENAI_API_KEY", "test-key");
});

describe("the pilot scenes", () => {
  it("are complete, but can't be published until Finance, Care Operations, Quality and Privacy have signed off", () => {
    for (const id of ["declined-invoice", "no-show"] as const) {
      expect(publishChecks(doc(scene(id)) as never, "confirm").blocking).toEqual([]);
      const g = createGuide(db, jordan, { title: id, completion: "confirm", doc: doc(scene(id, false)) as never }, now);
      expect(() => publishGuide(db, jordan, g.id, "", now, { allowUnverified: true })).toThrow(/Tough Phone Call needs its sign-off/);
    }
    // A billing call needs Finance; a service call doesn't.
    const billing = scene("declined-invoice");
    billing.phone.approval.finance = "";
    const g = createGuide(db, jordan, { title: "No finance", completion: "confirm", doc: doc(billing) as never }, now);
    expect(() => publishGuide(db, jordan, g.id, "", now)).toThrow(/sign-off/);
    const service = scene("no-show");
    service.phone.approval.finance = "";
    expect(() => course(service)).not.toThrow();
  });

  it("can sit twice in one course, each with ids of its own", () => {
    const two = {
      schema: 2 as const,
      pages: [
        {
          ...doc(scene("no-show")).pages[0],
          sections: [
            {
              id: "s1",
              title: "Calls",
              blocks: [
                { id: "a", type: "phonecall", ...freshPhoneCall(scene("no-show")) },
                { id: "b", type: "phonecall", ...freshPhoneCall(scene("no-show")) },
                { id: "c", type: "phonecall", ...freshPhoneCall(scene("declined-invoice")) },
              ],
            },
          ],
        },
      ],
    };
    expect(publishChecks(two as never, "confirm").blocking).toEqual([]);
    const f = freshPhoneCall(scene("no-show"), "abcde");
    expect(f.phone.urgent).toMatchObject({ actionId: "welfare-pabcde", moveIds: ["act-now-pabcde"] });
    expect(f.phone.dims["acknowledge-pabcde"]).toBe("deescalation");
    expect(f.phone.cite["act-now-pabcde"]).toBe("missed-visit-pabcde");
    expect(freshPhoneCall(f, "zzzzz").roleplay.moves[0].id).toBe("acknowledge-pzzzzz");
  });

  it("won't publish on a source past its review date", () => {
    const d = scene("no-show");
    d.phone.sources[0].reviewBy = "2026-01-01";
    const g = createGuide(db, jordan, { title: "Stale", completion: "confirm", doc: doc(d) as never }, now);
    expect(() => publishGuide(db, jordan, g.id, "", now, { allowUnverified: true })).toThrow(/in-date sources/);
  });

  it("keep the SIRS-style safety ordering: the urgent route comes before the complaints timeframes", () => {
    const d = scene("no-show");
    expect(d.phone.sources.find((s) => s.id === "tc-complaints")!.excerpt).toMatch(/never a reason to delay urgent safety action/);
    expect(d.roleplay.risks.some((r) => r.id === "process-first")).toBe(true);
  });

  it("never teach that self-management ends Trilogy Care's responsibility", () => {
    const d = scene("declined-invoice");
    expect(d.phone.sources.find((s) => s.id === "self-management")!.excerpt).toMatch(/remains responsible/);
    expect(d.roleplay.risks.find((r) => r.id === "blame")!.caution).toMatch(/doesn’t end Trilogy Care’s responsibility/);
  });
});

describe("what a learner's browser gets", () => {
  it("has the case tools' labels and the policy pack, but not what they reveal, who may be told what, the restricted words or the urgent cue", () => {
    const { c } = course(scene("no-show"));
    const sent = JSON.stringify(readGuide(db, riley, c.slug).doc);
    expect(sent).toContain("Open service log");
    expect(sent).toContain("Outcome 2.6b");
    for (const secret of [
      "Not marked as attended",
      "authorised representative for her services",
      "hasn’t had her morning tablets",
      "sounded flat",
      "wellbeing",
    ])
      expect(sent).not.toContain(secret);
    const inv = course(scene("declined-invoice"));
    const sentInv = JSON.stringify(readGuide(db, riley, inv.c.slug).doc);
    expect(sentInv).not.toContain("Declined automatically");
    expect(sentInv).not.toContain("INV-PRACTICE-0418");
    expect(sentInv).not.toContain('"itemised"');
  });
});

describe("case tools", () => {
  it("reveal only their authored facts, once, between turns; the permission shows only once checked", async () => {
    const { c, rev } = course(scene("declined-invoice"));
    const a = begin(c, rev);
    expect(a.phone!.permission).toBeNull();
    expect(a.phone!.actions.every((x) => x.facts.length === 0)).toBe(true);
    const after = look(c, a.id, "invoice");
    expect(after.phone!.actions.find((x) => x.id === "invoice")!.facts.join(" ")).toMatch(/missing itemisation/);
    expect(after.phone!.permission).toBeNull();
    const checked = look(c, a.id, "check-caller");
    expect(checked.phone!.permission).toMatchObject({ state: "limited" });
    // Twice is still once.
    look(c, a.id, "invoice");
    expect(db.prepare("SELECT COUNT(*) AS n FROM roleplay_lookups WHERE attempt_id = ?").get(a.id)).toEqual({ n: 2 });
    expect(() => look(c, a.id, "made-up")).toThrow(/isn’t one of the case tools/);
  });

  it("show the urgent escalation only once the caller has said the urgent thing, in their own words, on the authored turn", async () => {
    const { c, rev } = course(scene("no-show"));
    const a = begin(c, rev);
    expect(a.phone!.actions.some((x) => x.id === "welfare")).toBe(false);
    expect(() => look(c, a.id, "welfare")).toThrow(/case tools/);
    const t1 = await say(c, a.id, "I'm so sorry, that's really worrying.");
    expect(t1.turns[0].reply).toMatch(/hasn’t had her morning tablets/);
    expect(t1.phone!.urgent).toBe(true);
    expect(t1.phone!.actions.some((x) => x.id === "welfare")).toBe(true);
  });
});

describe("the privacy gate", () => {
  it("catches a restricted detail said before checking, or to a caller who isn't authorised for it, whatever the model says", async () => {
    const { c, rev } = course(scene("declined-invoice"));
    const a = begin(c, rev);
    look(c, a.id, "invoice");
    const t = await say(c, a.id, "It was declined because it wasn't itemised, that's all.");
    expect(db.prepare("SELECT risks FROM roleplay_turns WHERE attempt_id = ?").get(a.id)).toEqual({
      risks: JSON.stringify([{ id: DISCLOSURE_ID, quote: "itemised" }]),
    });
    // Checking first doesn't help: Karen is cleared for general updates only.
    look(c, a.id, "check-caller");
    await say(c, a.id, "The amount was 260 dollars.");
    expect(JSON.parse((db.prepare("SELECT risks FROM roleplay_turns WHERE attempt_id = ? AND n = 2").get(a.id) as { risks: string }).risks)).toEqual([
      { id: DISCLOSURE_ID, quote: "260" },
    ]);
    expect(t.turns).toHaveLength(1);
  });

  it("lets an authorised caller hear the details once they've been checked", async () => {
    const d = scene("declined-invoice");
    d.phone.permission.state = "authorised";
    const { c, rev } = course(d);
    const a = begin(c, rev);
    await say(c, a.id, "It wasn't itemised, before I've checked anything.");
    look(c, a.id, "check-caller");
    await say(c, a.id, "Now I've checked: it wasn't itemised.");
    const risks = (db.prepare("SELECT n, risks FROM roleplay_turns WHERE attempt_id = ? ORDER BY n").all(a.id) as { n: number; risks: string }[]).map((r) =>
      JSON.parse(r.risks),
    );
    expect(risks[0]).toEqual([{ id: DISCLOSURE_ID, quote: "itemised" }]);
    expect(risks[1]).toEqual([]);
  });

  it("matches whole words only", () => {
    expect(restrictedSaid("It wasn't itemised.", ["itemised"])).toBe("itemised");
    expect(restrictedSaid("$260 was the amount", ["260"])).toBe("260");
    expect(restrictedSaid("about 2600 things", ["260"])).toBeNull();
  });
});

describe("the debrief", () => {
  it("flags a missed urgent cue as critical, even in a warm call, and credits escalating", async () => {
    const run = async (escalate: boolean) => {
      const { c, rev } = course(scene("no-show"));
      const a = begin(c, rev);
      await say(c, a.id, "I'm so sorry, that's really worrying.", says({ moves: [{ id: "acknowledge", quote: "that's really worrying" }] }));
      if (escalate) look(c, a.id, "welfare");
      await say(
        c,
        a.id,
        "I'll find out from the provider what happened.",
        says({ moves: [{ id: "find-out", quote: "find out from the provider what happened" }] }),
      );
      await say(c, a.id, "I'll call you back by one to tell you.", says({ moves: [{ id: "own-it", quote: "call you back by one" }] }));
      const end = await say(c, a.id, "Thanks for telling me straight away.", says({ end: true, state: 1 }));
      return end.debrief!.phone!;
    };
    const missed = await run(false);
    expect(missed.critical.map((x) => x.text)).toEqual([expect.stringMatching(/Didn’t act on the sign/)]);
    expect(missed.ending).toBe("unsafe");
    expect(missed.recommendation).toBe("Needs another attempt");
    expect(missed.dims.find((d) => d.id === "safety")!.score).toBe(0);
    const acted = await run(true);
    expect(acted.critical).toEqual([]);
    expect(acted.ending).toBe("escalated");
  });

  it("warns about a false reassurance even when it eased the caller, and says 'insufficient evidence' for what a call didn't test", async () => {
    const { c, rev } = course(scene("declined-invoice"));
    const a = begin(c, rev);
    await say(c, a.id, "I can hear how frustrating that is.", says({ moves: [{ id: "acknowledge", quote: "I can hear how frustrating that is" }] }));
    await say(
      c,
      a.id,
      "Don't worry, Ben will definitely be paid tomorrow.",
      says({ risks: [{ id: "promise", quote: "Ben will definitely be paid tomorrow" }], state: 1 }),
    );
    await say(c, a.id, "Let me check his care plan.", says({}));
    const end = await say(
      c,
      a.id,
      "I'll call your dad by Thursday.",
      says({ moves: [{ id: "next-step", quote: "call your dad by Thursday" }], end: true, state: 1 }),
    );
    const r = end.debrief!.phone!;
    expect(end.turns.at(-1)!.stateAfter).toBe(1);
    expect(r.highlights.find((h) => !h.good)).toMatchObject({ quote: "Ben will definitely be paid tomorrow", turn: 2 });
    expect(r.highlights.find((h) => !h.good)!.alternative).toMatch(/can’t promise/);
    expect(r.dims.find((d) => d.id === "facts")!.score).toBe(0);
    expect(r.recommendation).toBe("Needs another attempt");
    // No urgent cue in this call, and nothing about safety was said: not tested, so not a zero.
    expect(r.dims.find((d) => d.id === "safety")).toMatchObject({ score: null, rating: "Insufficient evidence" });
  });

  it("can find a sound call that leaves the caller unhappy practised, and records a complaint ending", () => {
    const d = scene("declined-invoice");
    const all = (ids: string[]) => ids.map((id) => ({ id, quote: id }));
    const turns = [
      { n: 1, text: "x", moves: all(["acknowledge", "permission"]), risks: [], unclear: false, stateAfter: 2 },
      { n: 2, text: "x", moves: all(["impact", "real-reason", "self-managed"]), risks: [], unclear: false, stateAfter: 2 },
      { n: 3, text: "x", moves: all(["involve", "next-step", "complaint"]), risks: [], unclear: false, stateAfter: 2 },
    ];
    const r = phoneResult(d.roleplay, d.phone, turns, [{ actionId: "record-complaint", afterTurn: 2 }], true);
    expect(r.recommendation).toBe("Practised");
    expect(r.ending).toBe("complaint");
    expect(r.dims.filter((x) => x.score !== null).every((x) => x.score === 3)).toBe(true);
    // Leaving part-way is never "practised".
    expect(phoneResult(d.roleplay, d.phone, turns, [], false)).toMatchObject({ ending: "unsafe", recommendation: "Needs another attempt" });
  });

  it("lets the learner rewrite a line without changing the call, a few times", async () => {
    const { c, rev } = course(scene("declined-invoice"));
    const a = begin(c, rev);
    await say(c, a.id, "Ben will be paid tomorrow.", says({ risks: [{ id: "promise", quote: "Ben will be paid tomorrow" }] }));
    finishAttempt(db, riley, c.id, { attemptId: a.id, how: "help" }, now);
    const better = says({ moves: [{ id: "next-step", quote: "let your dad know today" }] });
    const out = await rewriteLine(db, riley, c.id, { attemptId: a.id, n: 1, text: "I'll find out what's needed and let your dad know today." }, better);
    expect(out).toMatchObject({ n: 1, left: 4, moves: [{ quote: "let your dad know today" }], risks: [] });
    expect(roleplayState(db, riley, c.id, "call").attempt!.turns).toHaveLength(1);
    for (let i = 0; i < 4; i++) await rewriteLine(db, riley, c.id, { attemptId: a.id, n: 1, text: "Another try at it." }, better);
    await expect(rewriteLine(db, riley, c.id, { attemptId: a.id, n: 1, text: "One more." }, better)).rejects.toThrow(/rewrites for this call/);
  });
});

describe("the model's brief", () => {
  it("gets the case file and the permission, so it can tag a made-up reason, but the caller never learns the file", () => {
    const d = scene("declined-invoice");
    const block = { id: "call", type: "phonecall" as const, ...d };
    const prompt = turnPrompt(block, [], 2, "Hello", { checked: false, opened: ["Open invoice record"] });
    expect(prompt).toMatch(/<case_file>[\s\S]*missing itemisation[\s\S]*<\/case_file>/);
    expect(prompt).toMatch(/General updates only/);
    expect(prompt).toMatch(/hasn't checked this yet/);
    expect(prompt).toMatch(/never repeats or reveals anything from the case file/);
    expect(prompt).not.toMatch(/Record a complaint:/);
  });

  it("names the caller and the client for the character library", () => {
    expect(charactersInBlock({ type: "phonecall", person: "Karen", phone: { client: "Mr Hale" } }).map((x) => [x.name, x.role])).toEqual([
      ["Karen", "family"],
      ["Mr Hale", "participant"],
    ]);
  });
});
