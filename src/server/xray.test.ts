import { beforeEach, describe, expect, it } from "vitest";
import { openDb, type Db } from "./db";
import { userById, type User } from "./auth";
import { createGuide, publishGuide, readGuide } from "./magazine";
import { publishChecks } from "@/lib/magazine";
import {
  checkScript,
  criticalErrors,
  emptyState,
  expectedSplit,
  finishProblems,
  freshXRay,
  incomplete,
  money,
  scoreXRay,
  splitOf,
  submitLines,
  xrayForReaders,
  type LinePick,
  type XRayBlockData,
  type XRayState,
} from "@/lib/xray";
import { XRAY_CASES } from "@/content/xrayCases";
import { finishXRay, restartXRay, saveXRay, submitXRay, xrayState, xrayStats } from "./xray";

/* The Invoice X-Ray: four outcomes, whole-cent arithmetic that reconciles, a quote is never a claim, and the answer key stays on the server. */

let db: Db;
let jordan: User, riley: User;
const now = new Date("2026-11-20T00:00:00Z");
const SIGNED = { owner: "Content owner", finance: "Finance reviewer", operations: "Care Operations", quality: "Quality reviewer", approvedOn: "2026-11-20" };
const SOURCE = { title: "Support at Home service list and AT-HM rules", version: "September 2026", reviewedOn: "2026-11-20" };
type Id = "patel" | "brennan" | "wong";
const seed = (id: Id) => XRAY_CASES.find((c) => c.id === id)!.data;
const signed = (id: Id): XRayBlockData => ({ ...seed(id), approval: SIGNED, source: SOURCE });
const pages = (data: XRayBlockData) => [
  {
    id: "p1",
    title: "A document",
    purpose: "",
    template: "blank",
    kind: "content",
    required: true,
    allActivities: false,
    sections: [{ id: "s1", title: "Document", blocks: [{ id: "xr", type: "xray", ...data }] }],
  },
];
const blocking = (data: XRayBlockData) => publishChecks({ schema: 2, pages: pages(data) } as never, "confirm").blocking;
function course(data: XRayBlockData) {
  const c = createGuide(db, jordan, { title: "X-Ray", completion: "confirm", doc: { schema: 2, pages: pages(data) } }, now);
  publishGuide(db, jordan, c.id, "", now);
  return c;
}
/** The reviewed answer for every line, as a learner would enter it. */
const right = (b: XRayBlockData): Record<string, LinePick> =>
  Object.fromEntries(
    b.lines.map((l) => [l.id, { outcome: l.outcome, account: l.outcome.startsWith("eligible") ? l.account : "", reason: l.reasons[0], evidence: l.evidence }]),
  );
const rightNext = (b: XRayBlockData) => b.next.options.find((o) => o.right)!.id;
const sorted = (b: XRayBlockData, picks = right(b)): XRayState => ({ ...emptyState(), picks, next: rightNext(b) });
const draftScript = (b: XRayBlockData) => ({ ...b.explain.draft });

beforeEach(() => {
  db = openDb(":memory:");
  [jordan, riley] = ["jordan", "riley"].map((id) => userById(db, id)!);
});

describe("the pilot's arithmetic", () => {
  it("reconciles exactly: $2,080 = $920 eligible + $850 private + $310 pending, and $920 = $736 + $184", () => {
    const s = expectedSplit(seed("patel"));
    expect(s).toEqual({ total: 208000, eligible: 92000, contribution: 18400, subsidy: 73600, private: 85000, pending: 31000, unsorted: 0 });
    expect(s.eligible + s.private + s.pending).toBe(s.total);
    expect(money(s.subsidy!)).toBe("$736");
    expect(money(208000)).toBe("$2,080");
  });

  it("keeps a line that needs review pending, and an unsorted line out of every column", () => {
    const b = seed("patel");
    const s = splitOf(b, { "pa-l6": "needs_review", "pa-l1": "eligible_with_contribution" });
    expect(s).toMatchObject({ eligible: 21000, pending: 31000, private: 0, unsorted: 156000 });
  });

  it("shows no figure when the rate isn't stated, rather than making one up", () => {
    const wong = seed("wong");
    expect(splitOf(wong, { "wo-l2": "eligible_with_contribution" })).toMatchObject({ eligible: 4650, contribution: null, subsidy: null });
    expect(splitOf(wong, { "wo-l2": "eligible_no_contribution" })).toMatchObject({ eligible: 4650, contribution: 0, subsidy: 4650 });
  });
});

describe("the case an author publishes", () => {
  it("every starter case is complete apart from its sign-off", () => {
    for (const c of XRAY_CASES) {
      expect(blocking(c.data).join(" ")).toMatch(/sign-off is required/);
      expect(blocking({ ...c.data, approval: SIGNED, source: SOURCE })).toEqual([]);
    }
  });

  it("can't be published without sign-off, even with Publish anyway", () => {
    const c = createGuide(db, jordan, { title: "Unsigned", completion: "confirm", doc: { schema: 2, pages: pages(seed("patel")) } }, now);
    expect(() => publishGuide(db, jordan, c.id, "", now, { allowUnverified: true })).toThrow(/Invoice X-Ray case needs its sign-off/);
    expect(() => course(signed("patel"))).not.toThrow();
  });

  it("needs whole-cent prices, an account for eligible lines and the missing evidence for a pending one", () => {
    const b = structuredClone(signed("patel"));
    b.lines[0].amountCents = 210.5;
    b.lines[1].account = "none";
    b.lines[5].evidence = [];
    const p = blocking(b).join(" ");
    expect(p).toMatch(/line 1 needs a price in whole cents/);
    expect(p).toMatch(/line 2 is eligible, so it needs the account/);
    expect(p).toMatch(/line 6 needs review, so it needs the missing evidence/);
  });

  it("keeps the answer key and the model script off the learner's page", () => {
    const c = course(signed("patel"));
    const page = JSON.stringify(readGuide(db, riley, c.slug));
    expect(page).toContain("Feature tile upgrade (optional)");
    for (const secret of [
      '"excluded_private"',
      '"home_modifications"',
      "A ramp may qualify",
      "won't pay for bathrooms",
      "This optional tile upgrade is priced separately",
    ])
      expect(page).not.toContain(secret);
    const r = xrayForReaders(seed("patel"));
    expect(r.lines.every((l) => l.outcome === "needs_review" && !l.reasons.length && !l.feedback)).toBe(true);
    expect(r.next.options.every((o) => !o.right && !o.why)).toBe(true);
  });

  it("gives a copy fresh ids that the answer key still points at", () => {
    const b = freshXRay(freshXRay(seed("patel"), "aaaaa"), "bbbbb");
    expect(b.lines[5].id).toBe("pa-l6-xbbbbb");
    expect(b.lines[5].evidence).toEqual(["pa-e-ot-xbbbbb", "pa-e-approval-xbbbbb"]);
    expect(b.explain.lineId).toBe("pa-l3-xbbbbb");
    expect(b.twist?.lineId).toBe("pa-l6-xbbbbb");
  });
});

describe("sorting the lines", () => {
  const b = seed("patel");
  it("needs every line resolved, with an account, a reason, and the missing evidence where it applies", () => {
    const s = { ...emptyState(), picks: { "pa-l6": { outcome: "needs_review" as const, account: "" as const, reason: "pa-r-unprescribed", evidence: [] } } };
    const todo = incomplete(b, s).join(" ");
    expect(todo).toMatch(/Line 1: choose what it is/);
    expect(todo).toMatch(/Line 6: name what’s missing/);
    expect(todo).toMatch(/what can happen with this document now/);
    expect(submitLines(b, s)).toMatchObject({ problem: /Every line needs an answer first/ });
  });

  it("sends back a private expense treated as a contribution, AT-HM put through the quarterly budget, and claiming a quote", () => {
    const picks = right(b);
    picks["pa-l3"] = { outcome: "eligible_with_contribution", account: "home_modifications", reason: "pa-r-approved", evidence: [] };
    picks["pa-l1"] = { ...picks["pa-l1"], account: "ongoing_quarterly" };
    const s = { ...sorted(b, picks), next: "pa-n-claim" };
    const errs = criticalErrors(b, s)
      .map((e) => e.text)
      .join(" | ");
    expect(errs).toMatch(/Line 3.*a private expense isn’t a participant contribution/);
    expect(errs).toMatch(/Line 1.*AT-HM work isn’t paid from the quarterly budget/);
    expect(errs).toMatch(/A quote can’t be claimed/);
    const out = submitLines(b, s);
    expect("state" in out && out.state.stage).toBe(0);
    expect("state" in out && out.state.tries).toBe(1);
  });

  it("gives full credit for a genuinely missing fact, and calls a right label with the wrong reason incomplete", () => {
    const picks = right(b);
    picks["pa-l3"] = { ...picks["pa-l3"], reason: "pa-r-bathroom" };
    const s: XRayState = {
      ...sorted(b, picks),
      stage: 1,
      tries: 1,
      first: Object.fromEntries(b.lines.map((l) => [l.id, l.outcome])),
      firstNext: rightNext(b),
      script: draftScript(b),
    };
    const r = scoreXRay(b, s);
    expect(r.lines.find((l) => l.id === "pa-l6")).toMatchObject({ outcomeRight: true, evidenceRight: true });
    expect(r.lines.find((l) => l.id === "pa-l3")).toMatchObject({ outcomeRight: true, reasonRight: false });
    expect(r.dims.identify.rating).toBe("Strong");
    expect(r.dims.reason.notes.join(" ")).toMatch(/Line 3: the right outcome, for a different reason/);
    expect(r.flags.splitRight).toBe(true);
  });
});

describe("explaining line 3", () => {
  const b = seed("patel");
  it("the reviewed draft covers every point and avoids the wrong rule", () => {
    const c = checkScript(b, draftScript(b));
    expect(c.covered.every((x) => x.met)).toBe(true);
    expect(c.avoided).toEqual([]);
  });

  it("won't finish with “the government won't pay for bathrooms” or a promised reimbursement", () => {
    const s: XRayState = { ...sorted(b), stage: 1, script: { ...draftScript(b), rule: "Sorry, the government won't pay for bathrooms." } };
    expect(finishProblems(b, s).join(" ")).toMatch(/Accessibility changes to a bathroom can be funded/);
    const promise = { ...s, script: { ...draftScript(b), next: "Don't worry, it will be reimbursed later." } };
    expect(finishProblems(b, promise).join(" ")).toMatch(/Don’t promise a reimbursement/);
  });

  it("notes when the draft was used word for word", () => {
    const s: XRayState = { ...sorted(b), stage: 1, tries: 1, first: {}, script: draftScript(b), usedDraft: true };
    expect(scoreXRay(b, s).dims.explain.notes.join(" ")).toMatch(/say it in your own words/);
  });
});

describe("attempts", () => {
  it("runs the pilot through the server, keeps the record, and gives authors totals only", () => {
    const c = course(signed("patel"));
    const b = seed("patel");
    const save = (state: Partial<XRayState>) => saveXRay(db, riley, c.id, { blockId: "xr", state }, now);
    expect(xrayState(db, riley, c.id, "xr")).toMatchObject({ status: "new", draft: null, debrief: null });

    // A first try that treats the tile upgrade as a contribution is sent back with why.
    const wrong = right(b);
    wrong["pa-l3"] = { outcome: "eligible_with_contribution", account: "home_modifications", reason: "pa-r-approved", evidence: [] };
    save({ picks: wrong, next: rightNext(b) });
    const back = submitXRay(db, riley, c.id, { blockId: "xr" }, now);
    expect(back.critical[0].text).toMatch(/a private expense isn’t a participant contribution/);
    expect(back.state.stage).toBe(0);
    expect(back.draft).toBeNull();

    save({ picks: right(b) });
    const ok = submitXRay(db, riley, c.id, { blockId: "xr" }, now);
    expect(ok).toMatchObject({ critical: [], state: { stage: 1, tries: 2 } });
    expect(ok.draft?.rule).toMatch(/isn’t needed for those changes/);
    // The lines are settled once submitted.
    save({ picks: wrong });
    expect(xrayState(db, riley, c.id, "xr").state.picks["pa-l3"].outcome).toBe("excluded_private");

    save({ script: { ...draftScript(b), rule: "The government won't pay for bathrooms." } });
    expect(() => finishXRay(db, riley, c.id, { blockId: "xr" }, now)).toThrow(/Not yet.*Accessibility changes/);
    save({ script: { ...draftScript(b), ack: "I can see why you'd want it to look finished." }, usedDraft: true });
    const done = finishXRay(db, riley, c.id, { blockId: "xr" }, now);
    expect(done.status).toBe("finished");
    expect(done.debrief?.split.reviewed).toMatchObject({ eligible: 92000, contribution: 18400, private: 85000, pending: 31000 });
    expect(done.debrief?.dims.find((d) => d.id === "identify")?.notes.join(" ")).toMatch(/first submission had 1 critical mistake/);
    expect(done.debrief?.dims.find((d) => d.id === "explain")?.notes.join(" ")).toMatch(/first version had a phrase that makes it wrong/);
    expect(done.debrief?.twist?.lineId).toBe("pa-l6");

    const stats = xrayStats(db, jordan, c.id);
    expect(stats.blocks[0]).toMatchObject({ people: 1, finished: 1, criticalFirstTry: 1, splitRight: 1, missedByLine: {} });
    expect(JSON.stringify(stats)).not.toMatch(/riley|tiles|finished\./);
    expect(() => xrayStats(db, riley, c.id)).toThrow();

    expect(restartXRay(db, riley, c.id, { blockId: "xr" }, now)).toMatchObject({ status: "active", state: { stage: 0 } });
  });
});
