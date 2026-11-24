import { beforeEach, describe, expect, it } from "vitest";
import { openDb, type Db } from "./db";
import { userById, type User } from "./auth";
import { createGuide, publishGuide, readGuide } from "./magazine";
import { publishChecks } from "@/lib/magazine";
import {
  abnChecksum,
  ageOn,
  auditorForReaders,
  auditorHardProblems,
  auditorIdentifiers,
  buildDebrief,
  compareLines,
  emptyState,
  expiryCheck,
  fieldChecks,
  freshAuditor,
  scoreAuditor,
  submitProblems,
  summary,
  type AuditorBlockData,
  type AuditState,
  type Category,
  type Mark,
} from "@/lib/auditor";
import { AUDIT_CASES } from "@/content/auditCases";
import { sourceTypeOf } from "@/lib/auditorVetting";
import { answerVariant, auditorState, auditorStats, restartAuditor, saveAuditor, submitAuditor } from "./auditor";

/* The Document Auditor: careful verification over red marks, proportionate decisions, plain checks behind every date and sum, fictional data only, and an answer key that stays on the server. */

let db: Db;
let jordan: User, riley: User;
const now = new Date("2026-11-20T00:00:00Z");
type Id = "sole-trader-cleaner" | "cleaning-invoice" | "garden-pack" | "cropped-certificate";
const seed = (id: Id) => AUDIT_CASES.find((c) => c.id === id)!.data;
const SIGNED = {
  owner: "Content owner",
  compliance: "Supply Chain",
  finance: "Finance",
  operations: "Care Operations",
  quality: "Quality",
  approvedOn: "2026-11-20",
};
const SOURCE = { title: "Document Auditor ruleset", version: "November 2026", reviewedOn: "2026-11-20" };
const signed = (id: Id): AuditorBlockData => ({ ...structuredClone(seed(id)), approval: SIGNED, source: SOURCE });
const pages = (data: AuditorBlockData) => [
  {
    id: "p1",
    title: "A case",
    purpose: "",
    template: "blank",
    kind: "content",
    required: true,
    allActivities: false,
    sections: [{ id: "s1", title: "Case", blocks: [{ id: "au", type: "auditor", ...data }] }],
  },
];
const blocking = (data: AuditorBlockData) => publishChecks({ schema: 2, pages: pages(data) } as never, "confirm").blocking;
function course(data: AuditorBlockData) {
  const c = createGuide(db, jordan, { title: "Auditor", completion: "confirm", doc: { schema: 2, pages: pages(data) } }, now);
  publishGuide(db, jordan, c.id, "", now);
  return c;
}
let n = 0;
const mark = (target: string, category: Category, compared: string[] = [], missing = false): Mark => ({
  id: `m${++n}`,
  fieldId: missing ? "" : target,
  missingId: missing ? target : "",
  category,
  note: "Checked it.",
  compared,
});
const state = (marks: Mark[], decision: AuditState["decision"], action: AuditState["action"]): AuditState => ({
  ...emptyState(),
  marks,
  decision,
  rationale: "Because the evidence shows it.",
  action,
});
/** Every finding marked with its first accepted category and compared with its records: the reviewed reading. */
const careful = (b: AuditorBlockData) =>
  b.findings.filter((e) => e.status !== "verified").map((e) => mark(e.fieldId || e.missingId, e.categories[0], e.compareWith, !e.fieldId));

beforeEach(() => {
  db = openDb(":memory:");
  [jordan, riley] = ["jordan", "riley"].map((id) => userById(db, id)!);
});

describe("the starter cases", () => {
  it("parse with nothing unfinished except their sign-off", () => {
    for (const c of AUDIT_CASES) {
      const problems = blocking(c.data);
      expect(problems.length, c.id).toBeGreaterThanOrEqual(0);
      expect(blocking({ ...c.data, approval: SIGNED, source: SOURCE }), c.id).toEqual([]);
    }
  });

  it("are fictional: every ABN fails the real checksum, and nothing looks like a real identifier", () => {
    for (const c of AUDIT_CASES) expect(auditorIdentifiers(c.data), c.id).toEqual([]);
    for (const abn of ["12 345 678 901", "98 765 432 109", "23 456 789 012", "34 567 890 123", "45 678 901 234"]) expect(abnChecksum(abn)).toBe(false);
    // The ATO's own published ABN passes, so a real-format ABN is caught.
    expect(abnChecksum("51 824 753 556")).toBe(true);
  });

  it("keep supplier insurance, screening, service-list and pricing rules separate, each with a source and dates", () => {
    const rules = AUDIT_CASES.flatMap((c) => c.data.rules);
    expect(new Set(rules.map((r) => r.family))).toEqual(
      new Set(["insurance", "screening", "verification", "claims", "pricing", "service_list", "benchmark", "engagement"]),
    );
    for (const r of rules) expect(r.source && r.effectiveFrom && r.reviewBy, r.id).toBeTruthy();
    // A public rule links to its source; a fictional training policy has no link to pretend to.
    for (const r of rules.filter((x) => sourceTypeOf(x) === "public_rule")) expect(r.url.startsWith("https://"), r.id).toBe(true);
    expect(rules.find((r) => r.family === "service_list")!.text).toMatch(/no blanket “gutters are excluded” rule/);
  });
});

describe("the plain checks", () => {
  it("compares an expiry with the engagement date, not today", () => {
    expect(expiryCheck("2026-11-01", "2026-12-01")).toEqual({ expired: true, days: -30 });
    expect(expiryCheck("2027-08-31", "2026-12-08").expired).toBe(false);
  });

  it("works out a screening document's age on the engagement date", () => {
    expect(ageOn("2023-06-14", "2026-12-01")).toMatchObject({ years: 3, months: 5 });
    expect(ageOn("2025-02-10", "2026-12-01")).toMatchObject({ years: 1, months: 9 });
  });

  it("compares an invoice line with the agreed rate and delivered units, both ways", () => {
    expect(compareLines({ qty: 3, unit: "hours", rateCents: 7200, amountCents: 21600 }, { qty: 2, rateCents: 6200 })).toEqual({
      qtyDiff: 1,
      rateDiffCents: 1000,
      ratePercent: 16.1,
      sumAddsUp: true,
    });
    // With a higher agreed rate and three delivered hours, the same line reconciles.
    expect(compareLines({ qty: 3, unit: "hours", rateCents: 7200, amountCents: 21600 }, { qty: 3, rateCents: 7200 })).toMatchObject({
      qtyDiff: 0,
      rateDiffCents: 0,
    });
    expect(compareLines({ qty: 3, unit: "hours", rateCents: 7200, amountCents: 20000 }, { qty: 3, rateCents: 7200 }).sumAddsUp).toBe(false);
  });

  it("explains a finding in words from the dates and sums", () => {
    const a = seed("sole-trader-cleaner");
    expect(fieldChecks(a, "a-pl-to", [])).toEqual(["Expired 1 Nov 2026: 30 days before 1 Dec 2026."]);
    const b = seed("cleaning-invoice");
    const checks = fieldChecks(b, "b-inv-l1", ["b-sched-rate", "b-log-visit"]);
    expect(checks[0]).toBe("3 hours × $72.00 = $216.00, as invoiced.");
    expect(checks.join(" ")).toMatch(/\$10\.00 more per hour than agreed \(\$62\.00, 16\.1%\)/);
    expect(fieldChecks(b, "b-prev-l1", ["b-log-visit"]).join(" ")).toMatch(/Same service date as 6 Nov 2026/);
  });
});

describe("pilot A: the sole trader cleaner", () => {
  const a = seed("sole-trader-cleaner");

  it("gives full credit for marking the expiry and the screening date, compared, and requesting current evidence", () => {
    const r = scoreAuditor(a, state(careful(a), "request_evidence", "corrected"));
    expect(r.scores).toEqual({ identification: 1, comparison: 1, interpretation: 1, decision: 1, action: 1 });
    expect(r.critical).toBeNull();
  });

  it("doesn't count the absent PI or WorkCover against a sole trader with no employees, unless they're flagged as failures", () => {
    const ok = scoreAuditor(
      a,
      state([...careful(a), mark("a-miss-pi", "looks_correct", [], true), mark("a-miss-wc", "looks_correct", [], true)], "cannot_engage", "hold"),
    );
    expect(ok.falsePositives).toBe(0);
    const flagged = scoreAuditor(
      a,
      state([...careful(a), mark("a-miss-pi", "missing", [], true), mark("a-miss-wc", "missing", [], true)], "cannot_engage", "hold"),
    );
    expect(flagged.falsePositives).toBe(2);
    expect(flagged.scores.identification).toBeCloseTo(0.6);
  });

  it("treats approving with an expired certificate as critical", () => {
    const r = scoreAuditor(a, state(careful(a), "ready", "proceed"));
    expect(r.critical).toMatch(/public liability expired/);
    expect(r.scores.decision).toBe(0);
    expect(r.actionRight).toBe(false);
  });

  it("doesn't reward a count of red marks: missing the screening date is missed however many other marks there are", () => {
    const r = scoreAuditor(
      a,
      state([mark("a-pl-to", "expired", ["a-req-date"]), mark("a-reg-name", "mismatch"), mark("a-abn-gst", "unverified")], "cannot_engage", "hold"),
    );
    expect(r.scores.identification).toBeCloseTo(0.1); // one of two found, less 0.2 for each false positive
    expect(r.extra).toHaveLength(2);
  });

  it("explains the changed fact: an NDIS clearance and a new certificate make it approvable", () => {
    expect(a.variant).toMatchObject({ decision: "ready" });
    expect(a.variant!.why).toMatch(/accepted alternative/);
  });
});

describe("pilot B: the cleaning invoice", () => {
  const b = seed("cleaning-invoice");

  it("finds the rate and units only through the agreed price and the service log", () => {
    const r = scoreAuditor(b, state(careful(b), "cannot_engage", "corrected"));
    expect(r.scores).toMatchObject({ identification: 1, comparison: 1, decision: 1 });
    const uncompared = scoreAuditor(
      b,
      state(
        careful(b).map((m) => ({ ...m, compared: [] })),
        "cannot_engage",
        "corrected",
      ),
    );
    expect(uncompared.scores.comparison).toBe(0);
  });

  it("flags the participant admin charge under the pricing rule, and pet care under the service list", () => {
    const debrief = buildDebrief(b, state(careful(b), "cannot_engage", "corrected"), scoreAuditor(b, state(careful(b), "cannot_engage", "corrected")));
    expect(debrief.items.find((i) => i.id === "b-e-l2")!.rule!.family).toBe("pricing");
    expect(debrief.items.find((i) => i.id === "b-e-l3")!.rule!.family).toBe("service_list");
    expect(debrief.items.find((i) => i.id === "b-e-l3")!.explain).not.toMatch(/gutter/i);
  });

  it("treats the duplicate date as a question, not fraud", () => {
    const dup = b.findings.find((e) => e.id === "b-e-dup")!;
    expect(dup).toMatchObject({ status: "ambiguous", severity: "query" });
    expect(dup.explain).toMatch(/don’t assume fraud/);
    expect(b.actions.find((x) => x.id === "escalate")!.right).toBe(false);
  });

  it("gives partial credit for Query, and none for approving", () => {
    expect(scoreAuditor(b, state(careful(b), "request_evidence", "clarify")).decisionCredit).toBe("partial");
    expect(scoreAuditor(b, state(careful(b), "ready", "proceed")).critical).toBeTruthy();
  });

  it("says the line marks would be false positives under the changed fact, and it's still rejected", () => {
    expect(b.variant).toMatchObject({ decision: "cannot_engage" });
    expect(b.variant!.why).toMatch(/false positives/);
  });
});

describe("the other cases", () => {
  it("rewards approving a complete pack, without penalising the NDIS clearance in place of a police certificate", () => {
    const c = seed("garden-pack");
    const r = scoreAuditor(c, state([mark("c-pl-to", "looks_correct"), mark("c-miss-police", "looks_correct", [], true)], "ready", "proceed"));
    expect(r.scores).toMatchObject({ identification: 1, decision: 1, action: 1 });
    expect(r.scores.comparison).toBeNull();
    const rejecting = scoreAuditor(c, state([mark("c-reg-trading", "mismatch"), mark("c-miss-police", "missing", [], true)], "cannot_engage", "corrected"));
    expect(rejecting.falsePositives).toBe(2);
    expect(rejecting.scores.decision).toBe(0);
  });

  it("gives Query full credit for a cropped certificate, and none for concluding it's expired", () => {
    const d = seed("cropped-certificate");
    expect(scoreAuditor(d, state(careful(d), "request_evidence", "corrected")).scores).toMatchObject({ decision: 1, action: 1, identification: 1 });
    expect(scoreAuditor(d, state([mark("d-pl-period", "expired")], "cannot_engage", "corrected")).scores).toMatchObject({
      decision: 0,
      interpretation: 0,
    });
    expect(scoreAuditor(d, state(careful(d), "ready", "proceed")).critical).toBeTruthy();
  });
});

describe("what a learner must do", () => {
  it("asks for a mark, a category for each, a decision, a reason and a next action", () => {
    expect(submitProblems(emptyState())).toHaveLength(4);
    expect(submitProblems(state([{ ...mark("a-pl-to", "expired"), category: "" }], "request_evidence", "hold"))).toEqual([
      "Say what you noticed for each marker.",
    ]);
    expect(
      summary(
        state(
          [mark("a-pl-to", "expired", ["a-req-date"]), mark("a-police-issued", "expired"), mark("a-abn-status", "looks_correct")],
          "request_evidence",
          "hold",
        ),
      ),
    ).toBe("You identified 2 possible issues, compared 1 with another source, and chose Request evidence or clarification.");
  });
});

describe("publishing", () => {
  it("can't be published without sign-off, even with Publish anyway", () => {
    const c = createGuide(db, jordan, { title: "Auditor", completion: "confirm", doc: { schema: 2, pages: pages(seed("sole-trader-cleaner")) } }, now);
    expect(() => publishGuide(db, jordan, c.id, "", now, { allowUnverified: true })).toThrow(/Document Auditor case needs its sign-off/);
    expect(() => course(signed("sole-trader-cleaner"))).not.toThrow();
  });

  it("asks for Compliance on a vetting case and Finance on an invoice case", () => {
    expect(auditorHardProblems({ ...signed("sole-trader-cleaner"), approval: { ...SIGNED, compliance: "" } }, "2026-11-20")[0]).toMatch(
      /Supply Chain or Compliance/,
    );
    expect(auditorHardProblems({ ...signed("cleaning-invoice"), approval: { ...SIGNED, compliance: "" } }, "2026-11-20")).toEqual([]);
    expect(auditorHardProblems({ ...signed("cleaning-invoice"), approval: { ...SIGNED, finance: "" } }, "2026-11-20")[0]).toMatch(/Finance/);
  });

  it("refuses a rule past its review date, or text that looks like a real ABN", () => {
    expect(auditorHardProblems(signed("cleaning-invoice"), "2027-06-01").join(" ")).toMatch(/due for review/);
    const real = signed("cleaning-invoice");
    real.docs[0].fields[0].value = "Brightwater Home Cleaning Pty Ltd, ABN 51 824 753 556";
    expect(auditorHardProblems(real, "2026-11-20").join(" ")).toMatch(/real ABN checksum/);
  });

  it("catches an answer key that contradicts its own dates", () => {
    const a = structuredClone(signed("sole-trader-cleaner"));
    a.docs[2].fields[4].date = "2027-01-01";
    expect(blocking(a).join(" ")).toMatch(/expiry date is on or after the engagement date/);
  });

  it("gives every id in a copy its own suffix, so two cases sit in one course", () => {
    const a = freshAuditor(seed("cleaning-invoice"), "9zzzz");
    expect(a.findings[0]).toMatchObject({ id: "b-e-l1-k9zzzz", fieldId: "b-inv-l1-k9zzzz", ruleId: "r-claims-k9zzzz" });
    expect(a.findings[0].compareWith).toEqual(["b-sched-rate-k9zzzz", "b-log-visit-k9zzzz"]);
    const both = {
      schema: 2,
      pages: [
        {
          ...pages(seed("cleaning-invoice"))[0],
          sections: [
            {
              id: "s1",
              title: "Case",
              blocks: [
                { id: "au1", type: "auditor", ...freshAuditor(signed("cleaning-invoice")) },
                { id: "au2", type: "auditor", ...freshAuditor(signed("cleaning-invoice")) },
              ],
            },
          ],
        },
      ],
    };
    expect(publishChecks(both as never, "confirm").blocking).toEqual([]);
  });
});

describe("attempts", () => {
  it("never sends the answer key to a learner's browser", () => {
    const c = course(signed("cleaning-invoice"));
    const g = readGuide(db, riley, c.id);
    const block = g.doc.pages[0].sections[0].blocks[0];
    expect(block.type).toBe("auditor");
    const text = JSON.stringify(block);
    expect(text).not.toMatch(/don’t assume fraud|false positives|Confirmed errors/);
    const stripped = auditorForReaders(seed("cleaning-invoice"));
    expect(stripped.findings).toEqual([]);
    expect(stripped.actions.every((x) => !x.right && !x.why)).toBe(true);
  });

  it("saves as it goes, scores on submit, and keeps a submitted attempt as it was", () => {
    const c = course(signed("cleaning-invoice"));
    const b = seed("cleaning-invoice");
    saveAuditor(db, riley, c.id, { blockId: "au", state: { ...emptyState(), marks: [mark("b-inv-l1", "mismatch")] } }, now);
    expect(auditorState(db, riley, c.id, "au").state.marks).toHaveLength(1);
    expect(() => submitAuditor(db, riley, c.id, { blockId: "au" }, now)).toThrow(/Not yet/);
    const done = submitAuditor(db, riley, c.id, { blockId: "au", state: state(careful(b), "cannot_engage", "corrected") }, now);
    expect(done.status).toBe("finished");
    expect(done.debrief!.decision.credit).toBe("full");
    expect(done.debrief!.items.find((i) => i.id === "b-e-l1")!.checks.length).toBeGreaterThan(1);
    // Settled: a later save doesn't change it.
    expect(saveAuditor(db, riley, c.id, { blockId: "au", state: state([], "ready", "proceed") }, now)).toEqual({ saved: false });
    expect(auditorState(db, riley, c.id, "au").state.decision).toBe("cannot_engage");
    const v = answerVariant(db, riley, c.id, { blockId: "au", variant: "cannot_engage" }, now);
    expect(v.debrief!.variant).toMatchObject({ right: true });
  });

  it("offers the hint on a new try after a decision without full credit", () => {
    const c = course(signed("cleaning-invoice"));
    const b = seed("cleaning-invoice");
    submitAuditor(db, riley, c.id, { blockId: "au", state: state(careful(b), "request_evidence", "clarify") }, now);
    expect(auditorState(db, riley, c.id, "au").hint).toBeNull();
    const again = restartAuditor(db, riley, c.id, { blockId: "au" }, now);
    expect(again).toMatchObject({ status: "active", tries: 1 });
    expect(again.hint).toMatch(/agreed price and the service log/);
    expect(again.state.marks).toEqual([]);
  });

  it("gives authors totals, never the words", () => {
    const c = course(signed("sole-trader-cleaner"));
    const a = seed("sole-trader-cleaner");
    submitAuditor(
      db,
      riley,
      c.id,
      { blockId: "au", state: state([mark("a-pl-to", "expired"), mark("a-miss-wc", "missing", [], true)], "ready", "proceed") },
      now,
    );
    const s = auditorStats(db, jordan, c.id).blocks[0];
    // One person: counts only, so nobody's choices can be singled out.
    expect(s).toMatchObject({ finished: 1, people: 1, suppressed: true, decisions: null, missed: null, falsePositives: null });
    expect(JSON.stringify(s)).not.toMatch(/Checked it/);
    expect(() => auditorStats(db, riley, c.id)).toThrow();
    expect(a.findings.length).toBeGreaterThan(0);
  });
});
