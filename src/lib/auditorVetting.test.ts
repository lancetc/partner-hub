import { describe, expect, it } from "vitest";
import { publishChecks } from "./magazine";
import {
  auditorCaseProblems,
  auditorForReaders,
  auditorHardProblems,
  buildDebrief,
  categoriesFor,
  cleanState,
  emptyState,
  hashable,
  migrateResult,
  parseAuditor,
  scoreAuditor,
  submitProblems,
  type AuditorBlockData,
  type AuditResult,
  type AuditState,
  type Category,
  type Mark,
  type ParseHelpers,
} from "./auditor";
import { AXIS_ORDER, isResolved, priceView, READY_NEEDS, vettingOutcome, vettingProblems, type Axes, type AxisState } from "./auditorVetting";
import { DOT_GARDENER } from "@/content/vettingCases";
import { AUDIT_CASES } from "@/content/auditCases";
import { charactersInBlock } from "./characters";

/*
  The Contractor Vetting Card's acceptance criteria (PRD section 15), as tests: the business and the worker checked
  apart (an ABN alone never makes a pack ready), the accepted screening alternative, insurance as Trilogy Care policy,
  scope, a benchmark as context, the supplier and participant prices kept apart, no Ready with a gap, the corrected pack
  and renewal, the participant explanation, the readers' copy, and older blocks and attempts read as before.
*/

const dot = () => structuredClone(DOT_GARDENER);
const SIGNED = {
  owner: "Owner",
  compliance: "Supplier onboarding",
  finance: "Finance",
  operations: "Care Operations",
  quality: "Quality",
  approvedOn: "2026-11-24",
};
const signed = (): AuditorBlockData => ({ ...dot(), approval: SIGNED, source: { title: "Vetting ruleset", version: "v1", reviewedOn: "2026-11-24" } });
const pages = (data: AuditorBlockData) => [
  {
    id: "p1",
    title: "A card",
    purpose: "",
    template: "blank",
    kind: "content",
    required: true,
    allActivities: false,
    sections: [{ id: "s1", title: "Card", blocks: [{ id: "vc", type: "auditor", ...data }] }],
  },
];
const blocking = (data: AuditorBlockData) => publishChecks({ schema: 2, pages: pages(data) } as never, "confirm").blocking;

let n = 0;
const mark = (target: string, category: Category, compared: string[] = [], missing = false): Mark => ({
  id: `m${++n}`,
  fieldId: missing ? "" : target,
  missingId: missing ? target : "",
  category,
  note: "Checked.",
  compared,
});
/** The reviewed reading: every non-harmless finding with its first accepted reading, compared with its records. */
const careful = (b: AuditorBlockData) =>
  b.findings.filter((e) => e.status !== "verified").map((e) => mark(e.fieldId || e.missingId, e.categories[0], e.compareWith, !e.fieldId));
const NEEDED = () =>
  dot()
    .vetting!.requests.filter((r) => r.needed)
    .map((r) => r.id);
const attempt = (marks: Mark[], decision: AuditState["decision"], more: Partial<AuditState> = {}): AuditState => ({
  ...emptyState(),
  marks,
  decision,
  rationale: "Because of the evidence and the rule.",
  action: "corrected",
  requests: NEEDED(),
  explanation: { text: "Dot, we’re keeping your gardener; a few checks first. I’ll ring you Friday.", startNow: "not_yet", covered: ["checked", "start"] },
  ...more,
});
const allResolved = (): Axes => Object.fromEntries(AXIS_ORDER.map((k) => [k, { state: "verified", note: "", owner: "", barrier: false } as AxisState]));

describe("Dot’s gardener", () => {
  it("parses with nothing unfinished once signed, passes its own case check, and holds publishing until it’s signed", () => {
    expect(blocking(signed())).toEqual([]);
    expect(auditorCaseProblems(dot())).toEqual([]);
    expect(auditorHardProblems(dot(), "2026-11-24").join(" ")).toMatch(/Finance or procurement pricing reviewer/);
    expect(auditorHardProblems(signed(), "2026-11-24")).toEqual([]);
  });

  it("is first in the starter cases, names only Dot, and queues no new character", () => {
    expect(AUDIT_CASES[0].id).toBe("dot-gardener");
    expect(charactersInBlock({ type: "auditor", ...dot() })).toEqual([]);
    expect(JSON.stringify(dot())).not.toMatch(/Fiona/);
  });

  it("leads first to Request evidence, with the price escalated alongside; the corrected pack to Ready; the renewal back to Request evidence", () => {
    const v = dot().vetting!;
    expect(vettingOutcome(v.axes)).toMatchObject({ outcome: "request_evidence", escalateToo: true });
    expect(vettingOutcome({ ...v.axes, ...v.corrected!.axes }).outcome).toBe("ready");
    expect(vettingOutcome({ ...v.axes, ...v.renewal!.axes })).toMatchObject({ outcome: "request_evidence", escalateToo: true });
    expect(new Set([v.packVersion, v.corrected!.version, v.renewal!.version]).size).toBe(3);
  });

  it("rates a careful attempt Strong on every dimension, with no codes", () => {
    const b = dot();
    const r = scoreAuditor(b, attempt(careful(b), "request_evidence"));
    expect(r.decisionCredit).toBe("full");
    expect(r.vetting!.codes).toEqual([]);
    const d = buildDebrief(b, attempt(careful(b), "request_evidence"), r);
    expect(d.dims.map((x) => x.rating)).toEqual(["Strong", "Strong", "Strong", "Strong", "Strong"]);
  });
});

describe("the business and the worker are separate checks (criterion 3)", () => {
  it("never reaches Ready from an active ABN alone", () => {
    expect(vettingOutcome({ entity_identity: { state: "verified", note: "ABN active", owner: "", barrier: false } }).outcome).not.toBe("ready");
    // Every check resolved except the worker's: still not ready.
    for (const k of ["worker_identity", "screening_route", "screening_status"] as const) {
      const axes = allResolved();
      delete axes[k];
      const o = vettingOutcome(axes);
      expect(o.outcome, k).not.toBe("ready");
      expect(o.open.find((x) => x.axis === k)?.state).toBe("needs_owner_review");
    }
  });

  it("treats “our ABN is active, so I can start” as a worker question, and reading it as fine as a misconception", () => {
    const b = dot();
    const marks = [...careful(b).filter((m) => m.fieldId !== "v-form-note"), mark("v-form-note", "looks_correct")];
    expect(scoreAuditor(b, attempt(marks, "request_evidence")).vetting!.codes).toContain("abn_as_clearance");
  });

  it("makes Ready critical while a check is open", () => {
    const b = dot();
    const r = scoreAuditor(b, attempt(careful(b), "ready"));
    expect(r.critical).toMatch(/clearance is unverified/);
    expect(r.vetting!.critical).toContain("ready_with_open_gap");
  });

  it("separates a trading-name difference from fraud", () => {
    const b = dot();
    const marks = [...careful(b).filter((m) => m.fieldId !== "v-form-name"), mark("v-form-name", "material_gap", ["v-abr-business"])];
    const r = scoreAuditor(b, attempt(marks, "request_evidence"));
    expect(r.vetting!.codes).toContain("name_mismatch_as_fraud");
    expect(r.items.find((i) => i.id === "v-e-name")!.readRight).toBe(false);
  });
});

describe("the accepted screening alternative (criterion 4)", () => {
  it("doesn’t penalise leaving the old police certificate alone beside the NDIS clearance", () => {
    const b = dot();
    for (const c of ["different_rule", "looks_correct"] as const) {
      const r = scoreAuditor(b, attempt([...careful(b), mark("v-police-issued", c, ["v-check-screening"])], "request_evidence"));
      expect(r.falsePositives, c).toBe(0);
      expect(r.vetting!.codes, c).toEqual([]);
    }
    // Not asking for a new police certificate is right; the debrief says so.
    const d = buildDebrief(b, attempt(careful(b), "request_evidence"), scoreAuditor(b, attempt(careful(b), "request_evidence")));
    expect(d.vetting!.requests.find((x) => x.id === "police")).toMatchObject({ needed: false, asked: false });
  });

  it("counts demanding both routes as a misconception, whether marked or requested", () => {
    const b = dot();
    const marked = scoreAuditor(b, attempt([...careful(b), mark("v-police-issued", "material_gap")], "request_evidence"));
    expect(marked.falsePositives).toBe(1);
    expect(marked.vetting!.codes).toContain("screening_both_required");
    const asked = scoreAuditor(b, attempt(careful(b), "request_evidence", { requests: [...NEEDED(), "police"] }));
    expect(asked.vetting!.requests.unnecessary).toEqual(["police"]);
    expect(asked.vetting!.codes).toContain("screening_both_required");
  });

  it("still needs the clearance verified: accepting it unverified is a misconception", () => {
    const b = dot();
    const marks = [...careful(b).filter((m) => m.fieldId !== "v-ndis-check"), mark("v-ndis-check", "looks_correct")];
    expect(scoreAuditor(b, attempt(marks, "request_evidence")).vetting!.codes).toContain("clearance_accepted_unverified");
  });

  it("refuses a case that treats the old police certificate as decisive beside a valid clearance", () => {
    const b = dot();
    const e = b.findings.find((x) => x.id === "v-e-police")!;
    e.state = "material_gap";
    e.categories = ["material_gap"];
    expect(vettingProblems(b).join(" ")).toMatch(/accepted alternative route/);
    const c = dot();
    c.vetting!.requests.find((r) => r.id === "police")!.needed = true;
    expect(vettingProblems(c).join(" ")).toMatch(/Don’t demand both/);
  });
});

describe("insurance is Trilogy Care policy, not statute (criterion 5)", () => {
  it("rests the insurance finding on an internal policy, and refuses one resting on a public rule", () => {
    const b = dot();
    expect(b.rules.find((r) => r.id === "r-v-insurance")!.sourceType).toBe("internal_policy");
    expect(b.rules.find((r) => r.id === "r-v-insurance")!.text).toMatch(/not a Support at Home law/);
    b.rules.find((r) => r.id === "r-v-insurance")!.sourceType = "public_rule";
    expect(vettingProblems(b).join(" ")).toMatch(/isn’t a Trilogy Care policy or contract source/);
  });
});

describe("scope (criterion 6)", () => {
  it("doesn’t let the gutters ride along with the rose pruning", () => {
    const b = dot();
    const marks = [...careful(b).filter((m) => m.fieldId !== "v-form-service"), mark("v-form-service", "looks_correct")];
    const r = scoreAuditor(b, attempt(marks, "request_evidence"));
    expect(r.vetting!.codes).toContain("scope_silently_accepted");
    expect(r.items.find((i) => i.id === "v-e-scope")).toMatchObject({ finding: true, found: false });
    expect(b.findings.find((e) => e.id === "v-e-scope")!.explain).toMatch(/no blanket rule/);
  });
});

describe("a benchmark is context, never a cap (criterion 7)", () => {
  it("reads an above-median rate as a price question, and calling it a breach as a misconception", () => {
    const b = dot();
    const p = priceView(b.vetting!.price);
    expect(p.benchmarkPercent).toBe(17.2);
    expect(p.benchmarkText).toMatch(/A review cue, not a cap: and it’s only partly comparable/);
    const marks = [...careful(b).filter((m) => m.fieldId !== "v-quote-hourly"), mark("v-quote-hourly", "material_gap", ["v-bench-rate"])];
    const r = scoreAuditor(b, attempt(marks, "request_evidence"));
    expect(r.vetting!.codes).toContain("median_as_cap");
    expect(r.items.find((i) => i.id === "v-e-hourly")!.readRight).toBe(false);
  });

  it("says “insufficient comparison evidence” rather than inventing a comparison", () => {
    const price = { ...dot().vetting!.price, benchmark: { ...dot().vetting!.price.benchmark!, comparable: "insufficient" as const } };
    expect(priceView(price)).toMatchObject({ benchmarkPercent: null });
    expect(priceView(price).benchmarkText).toMatch(/^Insufficient comparison evidence/);
  });

  it("refuses a case that makes the benchmark a gap or a barrier", () => {
    const b = dot();
    b.findings.find((e) => e.id === "v-e-hourly")!.state = "material_gap";
    expect(vettingProblems(b).join(" ")).toMatch(/A median isn’t a cap/);
    const c = dot();
    c.vetting!.axes.benchmark_context = { state: "price_review", note: "", owner: "", barrier: true };
    expect(vettingProblems(c).join(" ")).toMatch(/can’t be a material gap or a barrier/);
  });
});

describe("supplier and participant prices stay separate (criterion 8)", () => {
  it("keeps the supplier cost, the permitted overhead, the participant price and the agreement apart", () => {
    const v = dot().vetting!;
    expect(priceView(v.price)).toMatchObject({
      supplierCostCents: 21700,
      overheadMaxCents: 2170,
      ceilingCents: 23870,
      participantPriceCents: null,
      withinCeiling: null,
      agreement: "none",
    });
    expect(priceView(v.price).passThrough.map((l) => l.kind)).toEqual(["travel", "admin"]);
    expect(priceView(v.corrected!.price!)).toMatchObject({ supplierCostCents: 20500, overheadCents: 2050, participantPriceCents: 22550, withinCeiling: true });
  });

  it("treats a supplier’s travel or admin line as a question, not automatically an impermissible participant fee", () => {
    const b = dot();
    for (const id of ["v-e-travel", "v-e-admin"]) expect(b.findings.find((e) => e.id === id)!.categories).not.toContain("material_gap");
    const marks = [...careful(b).filter((m) => m.fieldId !== "v-quote-travel"), mark("v-quote-travel", "material_gap")];
    expect(scoreAuditor(b, attempt(marks, "request_evidence")).vetting!.codes).toContain("supplier_fee_as_participant_fee");
  });

  it("refuses an agreement with no participant price, an overhead over 10%, or a price above cost plus 10%", () => {
    const a = dot();
    a.vetting!.price.agreement = "agreed_in_writing";
    expect(vettingProblems(a).join(" ")).toMatch(/Don’t let the supplier’s quote stand in for it/);
    const b = dot();
    b.vetting!.price.overheadPercent = 12;
    expect(vettingProblems(b).join(" ")).toMatch(/between 0% and 10%/);
    const c = dot();
    c.vetting!.price.participantPriceCents = 24000;
    expect(vettingProblems(c).join(" ")).toMatch(/more than the supplier cost plus the permitted 10% overhead/);
  });
});

describe("a pack with a gap can’t reach Ready (criterion 9)", () => {
  it("holds Ready back while any required check is open, whatever the others say", () => {
    expect(vettingOutcome(allResolved()).outcome).toBe("ready");
    for (const k of READY_NEEDS)
      for (const s of ["needs_verification", "material_gap", "price_review", "needs_owner_review"] as const) {
        const axes = allResolved();
        axes[k] = { state: s, note: "", owner: "", barrier: false };
        expect(vettingOutcome(axes).outcome, `${k} ${s}`).not.toBe("ready");
      }
  });

  it("refuses a case whose key gives Ready credit while a check is open, or whose follow-up outcome doesn’t follow", () => {
    const b = dot();
    b.decisions.ready = { credit: "full", critical: false, why: "x" };
    expect(vettingProblems(b).join(" ")).toMatch(/can’t earn credit/);
    const c = dot();
    c.vetting!.corrected!.axes.insurance_status = { state: "material_gap", note: "", owner: "", barrier: false };
    expect(vettingProblems(c).join(" ")).toMatch(/corrected pack’s checks lead to “request evidence”, not “ready”/);
  });

  it("makes a confirmed barrier “Cannot engage as proposed”, and saying that for a correctable gap an unnecessary rejection", () => {
    const axes = allResolved();
    axes.screening_status = { state: "material_gap", note: "Clearance suspended", owner: "Quality", barrier: true };
    expect(vettingOutcome(axes).outcome).toBe("cannot_engage");
    const b = dot();
    expect(scoreAuditor(b, attempt(careful(b), "cannot_engage")).vetting!.codes).toContain("unnecessary_rejection");
  });
});

describe("the explanation to the participant (criterion 10)", () => {
  it("needs a message and a start answer before submitting, and a promised start is critical", () => {
    const b = dot();
    expect(submitProblems({ ...attempt(careful(b), "request_evidence"), explanation: { text: "", startNow: "", covered: [] } }, b)).toEqual([
      "Write a short message to Dot.",
      "Say whether the worker can start yet.",
    ]);
    const r = scoreAuditor(
      b,
      attempt(careful(b), "request_evidence", { explanation: { text: "Dot, he can start on the 4th, all sorted.", startNow: "yes", covered: [] } }),
    );
    expect(r.vetting!.critical).toEqual(["promised_start"]);
    expect(r.vetting!.dims.decision).toBeLessThanOrEqual(0.3);
  });

  it("shows the model explanation, both consequences and the Job Aid in the debrief", () => {
    const b = dot();
    const s = attempt(careful(b), "request_evidence");
    const d = buildDebrief(b, s, scoreAuditor(b, s)).vetting!;
    expect(d.explanation.model).toMatch(/He can’t start on the 4th just yet/);
    expect(d.consequences.unsafe).toMatch(/expired insurance certificate/);
    expect(d.consequences.unnecessary).toMatch(/lose her choice/);
    expect(d.axes.find((x) => x.axis === "screening_route")).toMatchObject({ stateLabel: "A different rule applies", resolved: true });
    expect(d.axes.find((x) => x.axis === "entity_identity")!.side).not.toBe(d.axes.find((x) => x.axis === "worker_identity")!.side);
  });
});

describe("the corrected pack and the renewal (criterion 12)", () => {
  it("answers each once, after submitting, with its own reviewed answer", () => {
    const b = dot();
    const done: AuditState = { ...attempt(careful(b), "request_evidence"), stage: 1 };
    const s = cleanState(b, { ...done, followUps: { corrected: "ready", renewal: "request_evidence", renew: ["pl", "agree"], newAgreement: "yes" } });
    const d = buildDebrief(b, s, scoreAuditor(b, s)).vetting!;
    expect(d.corrected).toMatchObject({ right: true, version: "dot-gardener-1-corrected" });
    expect(d.renewal).toMatchObject({ right: true, version: "dot-gardener-2-renewal", newAgreement: { right: true, said: "yes" } });
    expect(d.renewal!.renew.filter((x) => x.chosen !== x.needed)).toEqual([]);
  });
});

describe("the readers’ copy (criterion 1, 11)", () => {
  it("never carries the answer key, the checks, the reviewed answers or the model explanation", () => {
    const r = auditorForReaders(dot());
    expect(r.findings).toEqual([]);
    expect(r.vetting!.axes).toEqual({});
    expect(r.vetting!.requests.every((x) => !x.needed && !x.why && !x.code)).toBe(true);
    expect(r.vetting!.explanation.model).toBe("");
    expect(r.vetting!.corrected).toMatchObject({ axes: {}, why: "", newAgreement: null });
    expect(r.vetting!.renewal!.renew.every((x) => !x.needed && !x.why)).toBe(true);
    expect(Object.values(r.decisions).every((d) => d.credit === "none" && !d.why)).toBe(true);
    const text = JSON.stringify(r);
    for (const secret of [
      "clearance is unverified",
      "screening_both_required",
      "He can’t start on the 4th",
      "lose her choice",
      "Finance accepted the explanation",
      "median_as_cap",
    ])
      expect(text, secret).not.toContain(secret);
    // What the learner needs to do the task is still there.
    expect(r.vetting!.price.lines).toHaveLength(3);
    expect(r.vetting!.requests.map((x) => x.label)).toContain("A new police certificate for W1");
    expect(r.vetting!.corrected!.changes.length).toBeGreaterThan(0);
  });
});

describe("older blocks and attempts", () => {
  const helpers = (): ParseHelpers & { problems: string[] } => {
    const problems: string[] = [];
    const seen = new Set<string>();
    return {
      problems,
      str: (v, where, o = {}) => {
        if (v == null || v === "") {
          if (o.required) problems.push(`${where} is missing.`);
          return undefined;
        }
        return typeof v === "string" ? v.trim() : undefined;
      },
      idOf: (v, where) => {
        if (typeof v !== "string") problems.push(`${where} id`);
        else if (seen.has(v)) problems.push(`${where} repeats ${v}`);
        seen.add(String(v));
        return String(v);
      },
      list: (v) => (Array.isArray(v) ? (v as Record<string, unknown>[]) : []),
      unfinished: (p) => problems.push(p),
    };
  };
  /** A block as it was stored before the four outcomes: Approve, Query and Reject current submission, no Escalate. */
  const legacy = () => {
    const c = structuredClone(AUDIT_CASES.find((x) => x.id === "garden-pack")!.data) as unknown as Record<string, unknown> & AuditorBlockData;
    const d = c.decisions;
    return {
      ...c,
      decisions: { approve: d.ready, query: d.request_evidence, reject_current_submission: d.cannot_engage },
      variant: { fact: "A changed fact.", decision: "approve", why: "Because." },
    };
  };

  it("reads Approve, Query and Reject as Ready, Request evidence and Cannot engage, without offering an Escalate they never had", () => {
    const h = helpers();
    const b = parseAuditor(legacy(), "old", h);
    expect(h.problems).toEqual([]);
    expect(b.decisions.ready.credit).toBe("full");
    expect(b.decisions.request_evidence.credit).toBe("partial");
    expect(b.decisions.cannot_engage.credit).toBe("none");
    expect(b.decisions.escalate).toMatchObject({ offered: false, credit: "none" });
    expect(b.variant!.decision).toBe("ready");
    expect(auditorForReaders(b).decisions.escalate.offered).toBe(false);
    expect(categoriesFor(b, false)).toContain("expired");
  });

  it("hashes an older block exactly as before, so its attempts aren’t shown as read against a changed case", () => {
    const b = parseAuditor(legacy(), "old", helpers());
    const plain = (k: "ready" | "request_evidence" | "cannot_engage") => ({
      credit: b.decisions[k].credit,
      critical: b.decisions[k].critical,
      why: b.decisions[k].why,
    });
    const before = {
      d: b.docs,
      m: b.missing,
      r: b.rules,
      e: b.findings,
      k: { approve: plain("ready"), query: plain("request_evidence"), reject_current_submission: plain("cannot_engage") },
      a: b.actions,
      g: b.engagementDate,
    };
    expect(JSON.stringify(hashable(b))).toBe(JSON.stringify(before));
    // Nothing new crept into an older block's parts.
    expect(JSON.stringify(b.findings)).not.toMatch(/"state"|"axis"|"codes"/);
    expect(JSON.stringify(b.rules)).not.toMatch(/"sourceType"/);
  });

  it("loads an older attempt’s state and result under the new codes", () => {
    const b = parseAuditor(legacy(), "old", helpers());
    const s = cleanState(b, {
      marks: [{ id: "m1", fieldId: "c-pl-to", category: "looks_correct", compared: [] }],
      decision: "approve",
      variant: "query",
      stage: 1,
    });
    expect(s).toMatchObject({ decision: "ready", variant: "request_evidence", stage: 1, requests: [], followUps: { corrected: "" } });
    const old = { ...scoreAuditor(b, s), decision: "approve" } as unknown as AuditResult;
    const r = migrateResult(old);
    expect(r.decision).toBe("ready");
    const d = buildDebrief(b, s, r);
    expect(d.decision.yours).toBe("Ready for engagement review");
    expect(d.variant).toMatchObject({ answered: "request_evidence", right: false, decision: "Ready for engagement review" });
    expect(d.vetting).toBeNull();
  });

  it("can’t be given an Escalate answer on an older block", () => {
    const b = parseAuditor(legacy(), "old", helpers());
    expect(cleanState(b, { decision: "escalate" }).decision).toBe("");
  });

  it("every older starter case still passes its own (empty) vetting check", () => {
    for (const c of AUDIT_CASES.filter((x) => !x.data.vetting)) {
      expect(vettingProblems(c.data), c.id).toEqual([]);
      expect(
        c.data.findings.every((e) => !e.state || isResolved(e.state) === (e.status === "verified")),
        c.id,
      ).toBe(true);
    }
  });
});
