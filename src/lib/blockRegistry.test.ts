import { describe, expect, it } from "vitest";
import { BLOCK_LABELS, type BlockType } from "./magazine";
import { BARRIERS, BLOCK_REGISTRY, contractFor, coverage, isAssessed, recommend, searchBlocks, type Brief } from "./blockRegistry";

/* The block registry: one contract per implemented block, and recommendations that give their reasons. */

const brief = (over: Partial<Brief> = {}): Brief => ({
  signal: "Invoices approved at rates that differ from the agreement",
  behaviour: "Compare each invoice line’s rate with the current agreement before approving",
  barriers: [{ barrier: "attention", confidence: "known" }],
  minutes: 8,
  hasArtefact: true,
  hasSource: true,
  assessed: false,
  ...over,
});

describe("the registry", () => {
  it("has exactly one contract for every block the Magazine can hold", () => {
    const types = BLOCK_REGISTRY.map((b) => b.type).sort();
    expect(types).toEqual((Object.keys(BLOCK_LABELS) as BlockType[]).sort());
    expect(new Set(types).size).toBe(types.length);
  });

  it("says what each block is for, what it needs and what it proves", () => {
    for (const b of BLOCK_REGISTRY) {
      expect(b.purpose.length, b.type).toBeGreaterThan(15);
      expect(b.goodFor.length, b.type).toBeGreaterThan(0);
      expect(b.barriers.length, b.type).toBeGreaterThan(0);
      expect(b.poorFit.length, b.type).toBeGreaterThan(10);
      expect(b.completion.length, b.type).toBeGreaterThan(3);
      expect(b.minutes, b.type).toBeGreaterThan(0);
      for (const x of b.barriers) expect(BARRIERS[x].learnable, `${b.type} claims to fix ${x}`).toBe(true);
      // Reading something is never called practice.
      if (b.scoring === "none") expect(["accessed", "completed"], b.type).toContain(b.evidence);
    }
  });

  it("is searchable by what the learner does", () => {
    const top = (q: string) =>
      searchBlocks(q, BLOCK_LABELS)
        .slice(0, 5)
        .map((b) => b.type);
    expect(top("practise a difficult phone conversation")).toContain("phonecall");
    expect(top("check an invoice for errors")).toContain("auditor");
    expect(searchBlocks("", BLOCK_LABELS)).toHaveLength(BLOCK_REGISTRY.length);
    expect(searchBlocks("zzzz", BLOCK_LABELS)).toHaveLength(0);
  });
});

describe("recommendations", () => {
  it("recommends nothing when the barrier is access or workflow", () => {
    const out = recommend(brief({ barriers: [{ barrier: "access", confidence: "known" }] }), BLOCK_LABELS);
    expect(out.steps).toHaveLength(0);
    expect(out.note).toMatch(/access or workflow/);
    expect(recommend(brief({ barriers: [] }), BLOCK_LABELS).note).toMatch(/No barrier has been diagnosed/);
  });

  it("gives a short sequence of implemented blocks, each with its reasons", () => {
    const out = recommend(brief(), BLOCK_LABELS);
    expect(out.steps.length).toBeGreaterThan(0);
    expect(out.steps.length).toBeLessThanOrEqual(4);
    expect(out.steps.some((s) => s.step === "practise")).toBe(true);
    expect(new Set(out.steps.map((s) => s.type)).size).toBe(out.steps.length);
    for (const s of out.steps) {
      expect(contractFor(s.type), s.type).toBeTruthy();
      expect(s.rationale.behaviour).toMatch(/Compare each invoice line/);
      expect(s.rationale.mechanism).toMatch(/the learner/);
      expect(s.rationale.evidence.length).toBeGreaterThan(5);
      expect(s.rationale.proportionate).toMatch(/minute/);
      for (const a of s.alternatives) expect(contractFor(a)).toBeTruthy();
    }
  });

  it("uses an assessed block only when a criterion has to be met", () => {
    expect(recommend(brief(), BLOCK_LABELS).steps.some((s) => isAssessed(contractFor(s.type)!))).toBe(false);
    const out = recommend(brief({ assessed: true, minutes: 20 }), BLOCK_LABELS);
    expect(out.steps.some((s) => s.step === "assess")).toBe(true);
  });

  it("says what’s uncertain, and what practice can’t fix", () => {
    const out = recommend(
      brief({
        barriers: [
          { barrier: "attention", confidence: "suspected" },
          { barrier: "workflow", confidence: "known" },
        ],
      }),
      BLOCK_LABELS,
    );
    expect(out.note).toMatch(/Learning alone won’t close this/);
    expect(out.steps[0].rationale.uncertain).toMatch(/suspected/);
    expect(out.steps[0].rationale.uncertain).toMatch(/can’t be fixed by practice/);
  });

  it("flags a step that can’t be built without an artefact or a source", () => {
    const out = recommend(brief({ hasArtefact: false, hasSource: false }), BLOCK_LABELS);
    expect(out.steps.some((s) => s.needsInput.length > 0)).toBe(true);
  });

  it("keeps within the time there is", () => {
    const out = recommend(brief({ minutes: 3 }), BLOCK_LABELS);
    const total = out.steps.reduce((n, s) => n + contractFor(s.type)!.minutes, 0);
    expect(out.steps.length === 1 || total <= 3 * 1.5).toBe(true);
  });
});

describe("coverage", () => {
  it("tells practised from only explained, in words", () => {
    const b = brief({
      barriers: [
        { barrier: "attention", confidence: "known" },
        { barrier: "confidence", confidence: "suspected" },
        { barrier: "access", confidence: "known" },
      ],
    });
    const reading = coverage([{ type: "text", step: "see" }], { ...b, barriers: [{ barrier: "knowledge", confidence: "known" }] });
    expect(reading.explainedOnly).toHaveLength(1);
    expect(reading.practised).toHaveLength(0);
    expect(reading.noFeedback).toBe(true);
    const plan = recommend(b, BLOCK_LABELS).steps.map((s) => ({ type: s.type, step: s.step }));
    const cov = coverage(plan, b);
    expect(cov.practised.length).toBeGreaterThan(0);
    expect(cov.notLearnable).toEqual([BARRIERS.access.label]);
    expect(cov.noFeedback).toBe(false);
    expect(cov.minutes).toBeGreaterThan(0);
  });
});
