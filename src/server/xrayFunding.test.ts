import { beforeEach, describe, expect, it, vi } from "vitest";
import { openDb, type Db } from "./db";
import { HttpError, userById, type User } from "./auth";
import { createGuide, publishGuide, readGuide } from "./magazine";
import { allBlocks, publishChecks, readGuideDoc, type XRayBlock } from "@/lib/magazine";
import { emptyState, submitLines, xrayApproved, xrayForReaders, type LinePick, type XRayBlockData, type XRayState } from "@/lib/xray";
import {
  coachFacts,
  coachIssues,
  expectedOverall,
  fundingCritical,
  fundingHardProblems,
  fundingProblems,
  invoiceCheck,
  lineVerdict,
  reviewedCoach,
  scoreFunding,
  selfManagedCeiling,
  type FundingData,
} from "@/lib/xrayFunding";
import { MAX_OVERHEAD_PERCENT } from "@/lib/auditorVetting";
import { XRAY_REVIEW_CASES } from "@/content/xrayReviewCases";
import { XRAY_CASES } from "@/content/xrayCases";
import { SEED_SNIPPETS } from "@/content/playbooks";
import { MAGAZINE_DEMOS } from "@/content/magazineDemos";
import { askXRay, coachXRay, finishXRay, restartXRay, saveXRay, signalXRay, submitXRay, viewedXRay, xrayRegister, xrayState, xrayStats } from "./xray";

/*
  The Quote/Invoice X-Ray (docs/invoice-xray.md, "Quote and invoice review"): the PRD's acceptance criteria. A listed
  item is never approved on its listing, pending clarification scores as the good decision it is, supplier,
  participant and AT–HM prices stay in their own contexts, a quote is never delivery, coaching can't move the verdict
  or cite what the line doesn't rest on, resent requests change nothing, the readers' copy holds no answer key, and
  the classic cases' attempts still load.
*/

// A fake coaching model: no paid call is ever made from a test.
const model = vi.hoisted(() => ({ ready: true, reply: {} as unknown, prompts: [] as string[] }));
vi.mock("./openaiText", async (original) => ({
  ...(await original<typeof import("./openaiText")>()),
  claudeConfigured: () => false,
  openaiReady: () => model.ready,
  // As the real one does: the reply has to pass the checks, or it fails.
  openaiJson: async (prompt: string, check: (v: unknown) => string[]) => {
    model.prompts.push(prompt);
    const issues = check(model.reply);
    if (issues.length) throw new HttpError(502, `The reply didn’t pass the checks:\n${issues.join("\n")}`);
    return model.reply;
  },
}));

let db: Db;
let jordan: User, riley: User;
const now = new Date("2026-11-24T00:00:00Z");
const SIGNED = { owner: "Content owner", finance: "Operations and Finance", operations: "Care Operations", quality: "Quality", approvedOn: "2026-11-24" };
const SOURCE = { title: "Quote X-Ray rule set", version: "2026-11", reviewedOn: "2026-11-24" };
type Id = "wong-chair" | "brennan-podiatry";
const seed = (id: Id): XRayBlockData => structuredClone(XRAY_REVIEW_CASES.find((c) => c.id === id)!.data) as XRayBlockData;
const f = (b: XRayBlockData) => b.funding as FundingData;
/** A case as reviewers would leave it: every sign-off recorded and every source confirmed. */
function signed(id: Id, patch: (b: XRayBlockData) => void = () => {}): XRayBlockData {
  const b = seed(id);
  Object.assign(b, { approval: SIGNED, source: SOURCE });
  f(b).reviewers = { policy: "Policy owner", clinical: "AT–HM and clinical reviewer" };
  f(b).sources = f(b).sources.map((s) => ({ ...s, reviewed: true, reviewer: "Source reviewer" }));
  patch(b);
  return b;
}
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
function course(data: XRayBlockData) {
  const c = createGuide(db, jordan, { title: "ZZ Test X-Ray", completion: "confirm", doc: { schema: 2, pages: pages(data) } }, now);
  publishGuide(db, jordan, c.id, "", now);
  return c;
}
/** The reviewed answer for every line, as a learner would enter it. */
const right = (b: XRayBlockData): Record<string, LinePick> =>
  Object.fromEntries(
    b.lines.map((l) => {
      const fl = f(b).lines.find((x) => x.lineId === l.id)!;
      return [l.id, { outcome: "", account: "", reason: l.reasons[0], evidence: l.evidence, decision: fl.decision, route: fl.route, ask: fl.askWho, cite: "" }];
    }),
  );
const rightNext = (b: XRayBlockData) => b.next.options.find((o) => o.right)!.id;
const allOpened = (b: XRayBlockData) => [...f(b).evidence.map((e) => e.id), ...f(b).sources.map((s) => s.id)];
const decided = (b: XRayBlockData, picks = right(b)): XRayState => ({
  ...emptyState(),
  picks,
  next: rightNext(b),
  overall: f(b).overall,
  opened: allOpened(b),
});
const explained = (b: XRayBlockData): XRayState => {
  const out = submitLines(b, decided(b));
  if (!("state" in out)) throw new Error(out.problem);
  return { ...out.state, script: { ...b.explain.draft }, cite: f(b).modelSourceId };
};
const events = (guideId: string, event?: string) =>
  db.prepare(`SELECT event, detail FROM magazine_events WHERE guide_id = ?${event ? " AND event = ?" : ""}`).all(...(event ? [guideId, event] : [guideId])) as {
    event: string;
    detail: string;
  }[];

beforeEach(() => {
  db = openDb(":memory:");
  [jordan, riley] = ["jordan", "riley"].map((id) => userById(db, id)!);
  Object.assign(model, { ready: true, reply: {} });
  model.prompts.length = 0;
});

describe("the two first-release cases", () => {
  it("hold together, are fictional and unsigned, and can't publish until reviewers sign off", () => {
    for (const c of XRAY_REVIEW_CASES) {
      const b = seed(c.id);
      expect(fundingProblems(b)).toEqual([]);
      expect(publishChecks({ schema: 2, pages: pages(b) } as never, "confirm").blocking).toEqual([]);
      expect(fundingHardProblems(b, "2026-11-24").join(" ")).toMatch(/record the content owner, the Support at Home policy owner/);
      expect(fundingHardProblems(signed(c.id), "2026-11-24")).toEqual([]);
      expect(xrayApproved(b)).toBe(false);
      expect(b.supplier).toMatch(/\(fictional\)/);
      expect(f(b).sources.every((s) => !s.reviewed)).toBe(true);
    }
    // The participants are library characters, so publishing queues no new portrait.
    expect(XRAY_REVIEW_CASES.map((c) => c.data.participant.name)).toEqual(["Mrs Wong", "Mr Brennan"]);
    expect(XRAY_CASES.filter((c) => c.data.funding).map((c) => c.id)).toEqual(["wong-chair", "brennan-podiatry"]);
  });

  it("can't be published unsigned, even with Publish anyway, and can once reviewers sign off", () => {
    const c = createGuide(db, jordan, { title: "ZZ Test unsigned", completion: "confirm", doc: { schema: 2, pages: pages(seed("wong-chair")) } }, now);
    expect(() => publishGuide(db, jordan, c.id, "", now, { allowUnverified: true })).toThrow(/needs its sign-off and reviewed, in-date sources/);
    expect(() => course(signed("wong-chair"))).not.toThrow();
  });

  it("holds a case whose source is past its review date", () => {
    const b = signed("wong-chair", (x) => (f(x).sources[0].reviewBy = "2026-11-01"));
    expect(fundingHardProblems(b, "2026-11-24").join(" ")).toMatch(/was due for review on 2026-11-01/);
  });

  it("adds the canonical Can this be funded? Job Aid as an unapproved seed, and a demo draft with empty sign-offs", () => {
    const aid = SEED_SNIPPETS.find((s) => s.id === "can-this-be-funded")!;
    expect(aid.data.title).toBe("Can this be funded?");
    expect(Object.values(aid.release.approvals).every((x) => x === "")).toBe(true);
    expect(aid.release.steps[0].text).toMatch(/goal/i);
    for (const c of XRAY_REVIEW_CASES) expect(f(seed(c.id)).jobAid.snippetId).toBe("can-this-be-funded");
    const demo = MAGAZINE_DEMOS.find((d) => d.key === "quote-invoice-xray")!;
    const blocks = allBlocks(readGuideDoc(demo.doc as never, { draft: true })).filter((x): x is XRayBlock => x.type === "xray");
    expect(blocks).toHaveLength(2);
    for (const b of blocks) {
      expect(fundingProblems(b)).toEqual([]);
      expect(Object.values(b.approval).every((x) => x === "")).toBe(true);
      expect(b.funding?.reviewers).toEqual({ policy: "", clinical: "" });
    }
  });
});

describe("a listed item is never approved on its listing", () => {
  it("decides the rise chair from its checks: on the list, but advice, approval and price are open", () => {
    const b = seed("wong-chair");
    const chair = f(b).lines[0];
    const v = lineVerdict(chair.axes, b.phase);
    expect(v.decision).toBe("check_advice");
    expect(v.open.map((x) => x.axis)).toEqual(["individual_approval", "clinical_advice", "price_agreement", "participant_contribution"]);
    // Even with the advice in, approval and price keep it from being ready.
    expect(lineVerdict({ ...chair.axes, clinical_advice: { state: "met", note: "", owner: "" } }, b.phase).decision).toBe("potentially_fundable");
  });

  it("sends back Ready on the chair as a critical error, with why", () => {
    const b = seed("wong-chair");
    const picks = right(b);
    picks["wq-l1"] = { ...picks["wq-l1"], decision: "ready" };
    const errs = fundingCritical(b, decided(b, picks));
    expect(errs.map((e) => e.code)).toContain("listed_as_approved");
    expect(errs[0].text).toMatch(/potentially fundable, not approved for Mrs Wong/);
    const out = submitLines(b, decided(b, picks));
    expect("state" in out && out.state.stage).toBe(0);
  });

  it("won't let an author mark a line ready while a check is open", () => {
    const b = seed("wong-chair");
    f(b).lines[0].decision = "ready";
    expect(fundingProblems(b).join(" ")).toMatch(
      /its checks lead to “Check clinical or AT–HM advice”, not “Ready for approved process”.*an unresolved line can’t be marked ready/,
    );
  });

  it("treats “every chair is furniture” as a critical categorical exclusion", () => {
    const b = seed("wong-chair");
    const picks = right(b);
    picks["wq-l1"] = { ...picks["wq-l1"], decision: "out_of_scope" };
    expect(fundingCritical(b, decided(b, picks)).map((e) => e.code)).toContain("furniture_excluded");
  });
});

describe("pending clarification is a good decision", () => {
  it("scores the reviewed answers, overall pending, as strong, and passes in assessed mode", () => {
    for (const id of ["wong-chair", "brennan-podiatry"] as const) {
      const b = signed(id, (x) => (f(x).mode = "assessed"));
      expect(f(b).overall).toBe("pending");
      const r = scoreFunding(b, explained(b));
      expect(r.pendingRight).toBe(true);
      expect(r.dims.action.rating).toBe("Strong");
      expect(r.dims.action.notes.join(" ")).toMatch(/Pending clarification was the right call/);
      expect(r.dims.reads.rating).toBe("Strong");
      expect(r.passed).toBe(true);
      expect(r.finalCodes).toEqual([]);
    }
  });

  it("gives full credit for an accepted alternative, and notes the reviewed one is more specific", () => {
    const b = seed("wong-chair");
    const picks = right(b);
    picks["wq-l1"] = { ...picks["wq-l1"], decision: "potentially_fundable" };
    const out = submitLines(b, decided(b, picks));
    expect("state" in out && out.critical).toEqual([]);
    const r = scoreFunding(b, { ...(out as { state: XRayState }).state, script: { ...b.explain.draft }, cite: f(b).modelSourceId });
    expect(r.lines[0]).toMatchObject({ decisionRight: true, alternative: true });
  });

  it("works out the overall result from the lines", () => {
    expect(expectedOverall(["ready", "ask_detail"])).toBe("pending");
    expect(expectedOverall(["ready", "out_of_scope"])).toBe("partial");
    expect(expectedOverall(["ready", "ready"])).toBe("ready");
    expect(expectedOverall(["out_of_scope", "other_route"])).toBe("redirect");
  });
});

describe("supplier, participant and AT–HM prices stay in their own contexts", () => {
  it("reads the self-managed participant ceiling from the vetting card's 10% overhead", () => {
    expect(MAX_OVERHEAD_PERCENT).toBe(10);
    expect(selfManagedCeiling(12000)).toBe(13200);
    expect(f(seed("brennan-podiatry")).evidence.find((e) => e.id === "ev-participant")?.text).toMatch(/\$132/);
  });

  it("puts AT–HM through the quarterly budget as a critical error", () => {
    const b = seed("wong-chair");
    const picks = right(b);
    picks["wq-l1"] = { ...picks["wq-l1"], route: "ongoing_quarterly" };
    expect(fundingCritical(b, decided(b, picks)).map((e) => e.code)).toContain("athm_to_ongoing");
  });

  it("reads a supplier's fee line by the document's role, not its label", () => {
    const b = seed("brennan-podiatry");
    const picks = right(b);
    picks["bi-l4"] = { ...picks["bi-l4"], decision: "ready" };
    expect(fundingCritical(b, decided(b, picks)).map((e) => e.code)).toContain("fee_passed_to_participant");
    // Calling it a banned participant fee misreads whose document it is: a misconception, not a critical error.
    picks["bi-l4"] = { ...picks["bi-l4"], decision: "out_of_scope", evidence: [] };
    expect(fundingCritical(b, decided(b, picks))).toEqual([]);
    expect(scoreFunding(b, { ...decided(b, picks), tries: 0 }).lines[3].codes).toEqual(["supplier_fee_as_participant_fee"]);
  });

  it("won't publish a case that mixes the contexts up", () => {
    const athmOngoing = seed("wong-chair");
    f(athmOngoing).lines[0].route = "ongoing_quarterly";
    expect(fundingProblems(athmOngoing).join(" ")).toMatch(/an AT–HM cost can’t be routed through the ongoing quarterly budget/);
    const serviceListOnly = seed("wong-chair");
    f(serviceListOnly).sources[0].kind = "service_list";
    f(serviceListOnly).sources[1].kind = "service_list";
    expect(fundingProblems(serviceListOnly).join(" ")).toMatch(/an AT–HM line has to rest on the AT–HM list or scheme/);
    const noRole = seed("brennan-podiatry");
    f(noRole).documentRole = "participant_statement";
    expect(fundingProblems(noRole).join(" ")).toMatch(/a supplier’s line only makes sense on a supplier’s or worker’s document/);
    const unpriced = seed("brennan-podiatry");
    f(unpriced).lines[0].sourceIds = ["src-service-list"];
    expect(fundingProblems(unpriced).join(" ")).toMatch(/a confirmed contribution needs a pricing or Trilogy Care price source/);
  });
});

describe("a quote is never delivery, and an invoice is never retroactive agreement", () => {
  it("won't let a quote case show delivery evidence", () => {
    const b = seed("wong-chair");
    f(b).lines[0].axes.delivery_evidence = { state: "met", note: "", owner: "" };
    expect(fundingProblems(b).join(" ")).toMatch(/a quote isn’t evidence of delivery/);
  });

  it("compares each invoice line with what was agreed and when it happened", () => {
    const b = seed("brennan-podiatry");
    const [l1, , l3, , l5] = f(b).lines;
    expect(invoiceCheck(l1.invoice!, b.docDate)).toMatchObject({ unitsMatch: true, rateMatch: true, afterInvoice: false, differenceCents: 0 });
    expect(invoiceCheck(l3.invoice!, b.docDate)).toMatchObject({ unitsMatch: false, rateMatch: false, differenceCents: 4000 });
    expect(invoiceCheck(l5.invoice!, b.docDate).afterInvoice).toBe(true);
    // An invoice needs evidence of delivery to be ready.
    expect(lineVerdict({ ...l1.axes, delivery_evidence: { state: "unknown", note: "", owner: "" } }, b.phase).decision).toBe("potentially_fundable");
  });

  it("makes Ready on a booked visit or an unagreed rate a critical error", () => {
    const b = seed("brennan-podiatry");
    const picks = right(b);
    picks["bi-l5"] = { ...picks["bi-l5"], decision: "ready" };
    picks["bi-l3"] = { ...picks["bi-l3"], decision: "ready" };
    const codes = fundingCritical(b, decided(b, picks)).map((e) => e.code);
    expect(codes).toContain("no_delivery_evidence");
    expect(codes).toContain("unagreed_price_accepted");
  });

  it("separates the bundle's clinical nail care from its cosmetic polish by the authored facts, not the word “pedicure”", () => {
    const b = seed("brennan-podiatry");
    const bundle = f(b).lines[1];
    expect(bundle.components.map((c) => c.clinical)).toEqual([true, false, null]);
    expect(lineVerdict(bundle.axes, b.phase).decision).toBe("ask_detail");
    const picks = right(b);
    picks["bi-l2"] = { ...picks["bi-l2"], decision: "ready" };
    expect(fundingCritical(b, decided(b, picks)).map((e) => e.code)).toContain("cosmetic_bundled");
    picks["bi-l2"] = { ...picks["bi-l2"], decision: "out_of_scope", evidence: [] };
    expect(fundingCritical(b, decided(b, picks)).map((e) => e.code)).toContain("categorical_exclusion");
    // An author can't fund a cosmetic part inside a clinical line either.
    const authored = seed("brennan-podiatry");
    f(authored).lines[1].decision = "potentially_fundable";
    expect(fundingProblems(authored).join(" ")).toMatch(/a cosmetic part can’t be funded inside a clinical line/);
  });
});

describe("coaching can't change the verdict or cite what the line doesn't rest on", () => {
  const b = seed("wong-chair");
  const s = explained(b);
  const facts = coachFacts(b, s);

  it("rejects approval words, a verdict of its own, an unsupported source, an invented figure", () => {
    const good = {
      points: [{ kind: "strength", text: "You start with her goal and say the OT’s advice comes first.", facts: ["goal", "source-src-athm-list"] }],
    };
    expect(coachIssues(good, b, facts)).toEqual([]);
    const said = (text: string, ids = ["verdict"]) => coachIssues({ points: [{ kind: "suggestion", text, facts: ids }] }, b, facts).join(" ");
    expect(said("Tell her it’s covered and the shop can deliver on Friday.")).toMatch(/isn’t ready/);
    expect(said("Say chairs can’t be funded through AT–HM.")).toMatch(/isn’t out of scope/);
    expect(said("Mention her contribution will be 25%.")).toMatch(/isn’t a figure in the facts/);
    expect(said("Cite the service list for this.")).toMatch(/doesn’t rest on the service list/);
    expect(said("Point her to the pricing rule.", ["source-src-service-list"])).toMatch(/must cite facts by their ids/);
    expect(coachIssues({ ...good, verdict: "ready" }, b, facts).join(" ")).toMatch(/Don’t return a verdict/);
  });

  it("falls back to the reviewed coaching when the model fails, and never moves the verdict or the stored answer", async () => {
    const reviewCase = signed("wong-chair", (x) => (f(x).aiCoach = true));
    const c = course(reviewCase);
    const st = explained(reviewCase);
    saveXRay(db, riley, c.id, { blockId: "xr", state: { ...decided(reviewCase) } }, now);
    submitXRay(db, riley, c.id, { blockId: "xr" }, now);
    saveXRay(db, riley, c.id, { blockId: "xr", state: { script: st.script, cite: st.cite } }, now);
    const before = xrayState(db, riley, c.id, "xr").state.picks;

    model.reply = { points: [{ kind: "suggestion", text: "Tell her it’s approved so the shop can deliver.", facts: ["verdict"] }] };
    const bad = await coachXRay(db, riley, c.id, { blockId: "xr" }, now);
    expect(bad).toMatchObject({ source: "reviewed", verdict: "check_advice" });
    expect(bad.fallback).toMatch(/reviewed feedback/);
    expect(model.prompts).toHaveLength(1);
    expect(model.prompts[0]).toContain("The reviewed decision for line 1");
    expect(model.prompts[0]).not.toContain("src-service-list");

    model.reply = {
      points: [{ kind: "strength", text: "You start with her goal and say the OT’s advice comes first.", facts: ["goal", "source-src-athm-list"] }],
    };
    const ok = await coachXRay(db, riley, c.id, { blockId: "xr" }, now);
    expect(ok).toMatchObject({ source: "ai", verdict: "check_advice" });
    expect(ok.facts.map((x) => x.id)).toEqual(["goal", "source-src-athm-list"]);

    model.ready = false;
    expect(await coachXRay(db, riley, c.id, { blockId: "xr" }, now)).toMatchObject({ source: "reviewed", verdict: "check_advice" });
    expect(xrayState(db, riley, c.id, "xr").state.picks).toEqual(before);
    // Finishing still works, and the result doesn't depend on the coaching.
    const done = finishXRay(db, riley, c.id, { blockId: "xr" }, now);
    expect(done.review?.lines[0].reviewed.decision).toBe("check_advice");
  });

  it("asks no model unless the author turned coaching on", async () => {
    const c = course(signed("wong-chair"));
    const st = explained(signed("wong-chair"));
    saveXRay(db, riley, c.id, { blockId: "xr", state: decided(signed("wong-chair")) }, now);
    submitXRay(db, riley, c.id, { blockId: "xr" }, now);
    saveXRay(db, riley, c.id, { blockId: "xr", state: { script: st.script, cite: st.cite } }, now);
    const out = await coachXRay(db, riley, c.id, { blockId: "xr" }, now);
    expect(out.source).toBe("reviewed");
    expect(model.prompts).toHaveLength(0);
    expect(reviewedCoach(signed("wong-chair"), st).length).toBeGreaterThan(0);
  });
});

describe("attempts and events", () => {
  it("runs the invoice case through the server: idempotent submits, events without words, the debrief and completion", () => {
    const b = signed("brennan-podiatry");
    const c = course(b);
    const at = (blockId = "xr") => ({ blockId });
    expect(xrayState(db, riley, c.id, "xr")).toMatchObject({ status: "new", review: null, replies: [] });

    // Opening and asking are recorded once each, however often they're sent.
    for (const ref of [...allOpened(b), "bi-l2", "bi-l2"])
      signalXRay(db, riley, c.id, { ...at(), name: ref.startsWith("bi-") ? "document_line_opened" : "source_checked", ref }, now);
    const ask = askXRay(db, riley, c.id, { ...at(), lineId: "bi-l2", who: "clinician" }, now);
    askXRay(db, riley, c.id, { ...at(), lineId: "bi-l2", who: "clinician" }, now);
    expect(ask.reply).toMatch(/for his foot health/);
    expect(events(c.id, "missing_information_requested")).toHaveLength(1);
    expect(events(c.id, "document_line_opened")).toHaveLength(1);
    expect(xrayState(db, riley, c.id, "xr").replies).toEqual([expect.objectContaining({ lineId: "bi-l2", who: "clinician" })]);
    expect(() => signalXRay(db, riley, c.id, { ...at(), name: "source_checked", ref: "made-up" }, now)).toThrow(/isn’t part of this document/);

    saveXRay(db, riley, c.id, { ...at(), state: { picks: right(b), next: rightNext(b), overall: "pending" } }, now);
    const first = submitXRay(db, riley, c.id, at(), now);
    expect(first).toMatchObject({ critical: [], state: { stage: 1, tries: 1 } });
    // A double click or a network retry doesn't count again.
    expect(submitXRay(db, riley, c.id, at(), now)).toMatchObject({ critical: [], state: { stage: 1, tries: 1 } });
    expect(events(c.id, "response_submitted")).toHaveLength(1);

    expect(() => finishXRay(db, riley, c.id, at(), now)).toThrow(/Write something for/);
    saveXRay(db, riley, c.id, { ...at(), state: { script: { ...b.explain.draft }, cite: "src-service-list" } }, now);
    const done = finishXRay(db, riley, c.id, at(), now);
    expect(done.status).toBe("finished");
    expect(done.review?.explain.citeValid).toBe(false);
    expect(done.review?.dims.find((d) => d.id === "explain")?.notes.join(" ")).toMatch(/doesn’t support this line/);
    const again = finishXRay(db, riley, c.id, at(), now);
    expect(again.attemptId).toBe(done.attemptId);
    expect(events(c.id, "explanation_submitted")).toHaveLength(1);
    expect(db.prepare("SELECT COUNT(*) AS n FROM xray_attempts WHERE guide_id = ?").get(c.id)).toEqual({ n: 1 });

    viewedXRay(db, riley, c.id, at(), now);
    viewedXRay(db, riley, c.id, at(), now);
    expect(events(c.id, "feedback_viewed")).toHaveLength(1);
    expect(events(c.id, "activity_completed")).toHaveLength(1);
    expect(events(c.id, "assessment_attempted")).toHaveLength(0);

    // Every review event carries its key and versions, and none carries the learner's words or the documents.
    const all = events(c.id).filter((e) => e.event !== "magazine.published");
    for (const e of all.map((x) => JSON.parse(x.detail)))
      expect(e).toMatchObject({ scenario: "brennan-podiatry-invoice-1", engine: expect.any(String), key: expect.any(String) });
    const text = JSON.stringify(all);
    for (const words of ["walking to the shops", "itemise it", "polish", "$132"]) expect(text).not.toContain(words);

    // Try again starts a new attempt; the finished one keeps its result and versions.
    expect(restartXRay(db, riley, c.id, at(), now)).toMatchObject({ status: "active", state: { stage: 0 } });
    expect(events(c.id, "retry_started")).toHaveLength(1);
    const kept = db.prepare("SELECT result FROM xray_attempts WHERE guide_id = ? AND status = 'finished'").get(c.id) as { result: string };
    expect(JSON.parse(kept.result).versions).toMatchObject({ scenario: "brennan-podiatry-invoice-1", ruleSet: "quote-xray-rules-2026-11 (draft)" });
  });

  it("gives authors totals only, with breakdowns held back under five people, and a register row with denominators", () => {
    const b = signed("wong-chair");
    const c = course(b);
    saveXRay(db, riley, c.id, { blockId: "xr", state: decided(b) }, now);
    submitXRay(db, riley, c.id, { blockId: "xr" }, now);
    saveXRay(db, riley, c.id, { blockId: "xr", state: { script: { ...b.explain.draft }, cite: f(b).modelSourceId } }, now);
    finishXRay(db, riley, c.id, { blockId: "xr" }, now);
    const stats = xrayStats(db, jordan, c.id);
    expect(stats.blocks[0]).toMatchObject({ people: 1, finished: 1, review: { counted: 1, suppressed: true, codes: null } });
    expect(JSON.stringify(stats)).not.toMatch(/riley|get up from your chair/);
    expect(() => xrayStats(db, riley, c.id)).toThrow();
    const reg = xrayRegister(db, now);
    expect(reg).toHaveLength(1);
    expect(reg[0]).toMatchObject({ kind: "Quote review", jobAid: "can-this-be-funded", people: 1, suppressed: true, mode: "formative" });
    expect(reg[0].sources).toMatch(/AT–HM list \(July 2026, effective 2026-07-01\)/);
  });

  it("won't start an assessed attempt on a stale source", () => {
    const b = signed("wong-chair", (x) => (f(x).mode = "assessed"));
    const c = course(b);
    const g = db.prepare("SELECT r.id, r.doc FROM magazine_guides g JOIN magazine_revisions r ON r.id = g.revision_id WHERE g.id = ?").get(c.id) as {
      id: string;
      doc: string;
    };
    db.prepare("UPDATE magazine_revisions SET doc = ? WHERE id = ?").run(g.doc.replace(/"reviewBy":"2027-01-31"/, '"reviewBy":"2026-11-01"'), g.id);
    expect(() => saveXRay(db, riley, c.id, { blockId: "xr", state: {} }, now)).toThrow(/due for review/);
  });
});

describe("the readers' copy", () => {
  it("has the document, evidence and sources, and no answer key, authored answers or model response", () => {
    const b = signed("brennan-podiatry");
    const c = course(b);
    const page = JSON.stringify(readGuide(db, riley, c.slug));
    expect(page).toContain("Foot care and pedicure package");
    expect(page).toContain("Nail polish");
    expect(page).toContain("Prices for Support at Home participants");
    for (const secret of [
      '"ask_detail"',
      '"cosmetic_bundled"',
      "One line for three different things",
      "Cosmetic. Never funded inside a clinical line",
      "I reduced them during the visit",
      "Hold the invoice and raise a query",
      BRENNAN_CHECKING,
      '"clinical":true',
      '"clinical":false',
      "Pay it as one line",
      "A booked visit, invoiced before it happened",
    ])
      expect(page).not.toContain(secret);
    const r = xrayForReaders(b);
    expect(r.funding?.lines.every((l) => !l.decision && !Object.keys(l.axes).length && !l.sourceIds.length)).toBe(true);
    expect(r.funding?.asks.every((a) => !a.reply)).toBe(true);
  });
});
const BRENNAN_CHECKING = "So we’ve asked the practice to itemise it";

describe("older attempts", () => {
  it("still load a classic case's attempt saved before review mode existed", () => {
    const patel = XRAY_CASES.find((x) => x.id === "patel")!.data as XRayBlockData;
    const c = course({ ...patel, approval: SIGNED, source: SOURCE });
    const rev = (db.prepare("SELECT revision_id FROM magazine_guides WHERE id = ?").get(c.id) as { revision_id: string }).revision_id;
    // The state and result exactly as the earlier version stored them.
    const state = {
      stage: 1,
      picks: { "pa-l1": { outcome: "eligible_with_contribution", account: "home_modifications", reason: "pa-r-approved", evidence: [] } },
      next: "pa-n-agree",
      first: { "pa-l1": "eligible_with_contribution" },
      firstNext: "pa-n-agree",
      tries: 1,
      script: { ack: "I can see why.", rule: "The rule.", split: "The split.", next: "Next step." },
      usedDraft: false,
      scriptTries: 0,
      twist: null,
    };
    const result = {
      lines: [{ id: "pa-l1", outcomeRight: true, accountRight: true, reasonRight: true, evidenceRight: null }],
      dims: Object.fromEntries(["identify", "path", "reason", "split", "explain"].map((k) => [k, { rating: "Strong", notes: [] }])),
      flags: { criticalFirstTry: 0, tries: 1, splitRight: false, avoidedPhrases: 0, usedDraftUnchanged: false },
    };
    db.prepare(
      "INSERT INTO xray_attempts (id, guide_id, revision_id, block_id, user_id, key_hash, state, result, status, started_at, updated_at, finished_at) VALUES ('xr-old', ?, ?, 'xr', ?, 'oldhash', ?, ?, 'finished', ?, ?, ?)",
    ).run(c.id, rev, riley.id, JSON.stringify(state), JSON.stringify(result), "2026-11-20T00:00:00Z", "2026-11-20T00:00:00Z", "2026-11-20T00:00:00Z");
    const v = xrayState(db, riley, c.id, "xr");
    expect(v).toMatchObject({ status: "finished", attemptId: "xr-old", earlierCase: true, review: null });
    expect(v.debrief?.lines[0].theirs.outcome).toBe("eligible_with_contribution");
    // A resent submit or finish on it changes nothing and starts nothing.
    submitXRay(db, riley, c.id, { blockId: "xr" }, now);
    finishXRay(db, riley, c.id, { blockId: "xr" }, now);
    expect(db.prepare("SELECT COUNT(*) AS n FROM xray_attempts WHERE guide_id = ?").get(c.id)).toEqual({ n: 1 });
  });
});
