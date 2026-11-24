import { describe, expect, it } from "vitest";
import { allBlocks, publishChecks, readGuideDoc } from "@/lib/magazine";
import { caseProblems, type HiringLabData } from "@/lib/hiringRunway";
import { caseProblems as dayProblems, type OneDayData } from "@/lib/oneDay";
import { caseProblems as intakeCaseProblems, type IntakeLabData } from "@/lib/growthLab";
import { caseProblems as workloadCaseProblems, type WorkloadLabData } from "@/lib/workloadLab";
import { caseProblems as coverageCaseProblems, type CoverageLabData } from "@/lib/coverageLab";
import { caseProblems as referralCaseProblems, type ReferralLabData } from "@/lib/referralLab";
import { caseProblems as reliabilityCaseProblems, type ReliabilityLabData } from "@/lib/reliabilityLab";
import { caseProblems as cashBridgeCaseProblems, type CashBridgeLabData } from "@/lib/cashBridgeLab";
import { caseGuardrailProblems, caseThreadHardProblems, type CaseThreadData } from "@/lib/caseThread";
import { caseProblems as budgetLabCaseProblems, type BudgetLabData } from "@/lib/budgetLab";
import { hazardScanHardProblems, sceneProblems, variantProblems, type HazardScanData } from "@/lib/hazardScan";
import { pivotHardProblems, scenarioProblems, type DischargeData } from "@/lib/dischargePivot";
import { auditorCaseProblems, auditorHardProblems, type AuditorBlockData } from "@/lib/auditor";
import { MAGAZINE_DEMOS } from "./magazineDemos";

/* The demonstration articles: each parses as a real Magazine guide, and the only things holding publishing are the claims flagged to verify. */

describe("the demonstration articles", () => {
  it.each(MAGAZINE_DEMOS.map((d) => [d.title, d] as const))("%s parses, and only flagged claims hold it back", (_title, d) => {
    const checks = publishChecks(d.doc as never, d.completion);
    expect(checks.blocking.filter((b) => !/needs verification/.test(b))).toEqual([]);
    const doc = readGuideDoc(d.doc as never, { draft: true });
    expect(doc.pages.length).toBe(d.doc.pages.length);
  });

  it("covers each kind: a one-page guide, expert guidance, a simulator, onboarding, the journey map, a coordinator’s day and week", () => {
    expect(MAGAZINE_DEMOS.map((d) => d.key)).toEqual([
      "invoices",
      "outside-service",
      "hiring",
      "brokered",
      "journey",
      "one-day",
      "next-10",
      "coordinator-week",
      "suburb-growth",
      "referral-active",
      "missed-service",
      "fund-90",
      "what-would-you-do",
      "quarter-end",
      "spot-the-hazard",
      "discharge-pivot",
      "contractor-vetting",
    ]);
    const types = (key: string) => allBlocks(readGuideDoc(MAGAZINE_DEMOS.find((d) => d.key === key)!.doc as never, { draft: true })).map((b) => b.type);
    expect(types("hiring")).toContain("hiring");
    expect(types("brokered")).toContain("hubvisual");
    expect(types("journey")).toContain("hubvisual");
    expect(types("one-day")).toContain("onedaymap");
    expect(types("next-10")).toContain("intake");
    expect(types("coordinator-week")).toContain("workload");
    expect(types("suburb-growth")).toContain("coverage");
    expect(types("referral-active")).toContain("referral");
    expect(types("missed-service")).toContain("reliability");
    expect(types("fund-90")).toContain("cashbridge");
    expect(types("what-would-you-do").filter((t) => t === "casethread")).toHaveLength(2);
    expect(types("quarter-end")).toContain("budgetlab");
    expect(types("spot-the-hazard").filter((t) => t === "hazardscan")).toHaveLength(3);
    expect(types("discharge-pivot")).toContain("discharge");
    expect(types("contractor-vetting")).toContain("auditor");
  });

  it("puts Dot’s gardener in the contractor-vetting article: a case that passes its own check, every sign-off empty, so it can’t publish as it stands", () => {
    const d = MAGAZINE_DEMOS.find((x) => x.key === "contractor-vetting")!;
    const b = allBlocks(readGuideDoc(d.doc as never, { draft: true })).find((x) => x.type === "auditor") as unknown as AuditorBlockData;
    expect(b.vetting?.participant.name).toBe("Dot");
    expect(auditorCaseProblems(b)).toEqual([]);
    expect(Object.values(b.approval).every((x) => x === "")).toBe(true);
    expect(auditorHardProblems(b, "2026-11-24").length).toBeGreaterThan(0);
    expect(b.vetting?.jobAid.snippetId).toBe("choosing-and-checking-your-contractor");
    expect(d.audience).toEqual(["coordinator", "staff"]);
  });

  it("puts Dot comes home in the discharge article: a scenario that passes its check, every sign-off empty, so it can’t publish as it stands", () => {
    const d = MAGAZINE_DEMOS.find((x) => x.key === "discharge-pivot")!;
    const b = allBlocks(readGuideDoc(d.doc as never, { draft: true })).find((x) => x.type === "discharge") as unknown as DischargeData;
    expect(b.participant.name).toBe("Dot");
    expect(b.supporter.name).toBe("Fiona");
    expect(scenarioProblems(b)).toEqual([]);
    expect(Object.values(b.approval).every((x) => x === "")).toBe(true);
    expect(pivotHardProblems(b, "2026-11-24").length).toBeGreaterThan(0);
    expect(b.jobAid.snippetId).toBe("hospital-to-home-handover-check");
    expect(d.audience).toEqual(["coordinator", "staff"]);
  });

  it("puts the three pilot rooms in the Spot the Hazard article: complete scenes, two or more variants each, all in review and unsigned", () => {
    const d = MAGAZINE_DEMOS.find((x) => x.key === "spot-the-hazard")!;
    const doc = readGuideDoc(d.doc as never, { draft: true });
    const scenes = allBlocks(doc).filter((b) => b.type === "hazardscan") as unknown as HazardScanData[];
    expect(scenes.map((s) => s.person.name)).toEqual(["Mrs Pearce", "Mr Okafor", "Dot"]);
    for (const s of scenes) {
      expect(sceneProblems(s)).toEqual([]);
      expect(s.variants.length).toBeGreaterThanOrEqual(2);
      // Every variant is complete except for its placeholder sources, and none is approved or reviewed.
      for (const v of s.variants) {
        expect(variantProblems(s, v, "2026-11-24").filter((p) => !/placeholder policy record/.test(p))).toEqual([]);
        expect(v.status).toBe("review");
        expect(v.review.reviewer).toBe("");
      }
      expect(Object.values(s.approval).every((x) => x === "")).toBe(true);
      // So it can't be published as it stands.
      expect(hazardScanHardProblems(s, "2026-11-24").length).toBeGreaterThan(0);
    }
    expect(d.audience).toEqual(["partner", "coordinator", "staff"]);
  });

  it("puts a complete, reconciled Hiring Runway case in the simulator article", () => {
    const lab = allBlocks(readGuideDoc(MAGAZINE_DEMOS.find((d) => d.key === "hiring")!.doc as never, { draft: true })).find((b) => b.type === "hiring")!;
    expect(caseProblems(lab as unknown as HiringLabData)).toEqual([]);
  });

  it("puts Leila’s Monday in the coordinator’s-day article, with a branch test that passes and its browsing tags", () => {
    const d = MAGAZINE_DEMOS.find((x) => x.key === "one-day")!;
    const doc = readGuideDoc(d.doc as never, { draft: true });
    const map = allBlocks(doc).find((b) => b.type === "onedaymap")!;
    expect(dayProblems(map as unknown as OneDayData)).toEqual([]);
    expect(doc.tags?.roles).toContain("coordinator");
  });

  it("puts Priya’s February in the growth readiness article: a case that passes its check and has something to find", () => {
    const d = MAGAZINE_DEMOS.find((x) => x.key === "next-10")!;
    const doc = readGuideDoc(d.doc as never, { draft: true });
    const calc = allBlocks(doc).find((b) => b.type === "intake")!;
    expect(intakeCaseProblems(calc as unknown as IntakeLabData)).toEqual([]);
    expect(doc.tags).toEqual({ roles: ["owner"], goals: ["grow", "quality"] });
  });

  it("puts Sam’s week in the coordinator-week article: a case that passes its check, with its sign-off left for the reviewers", () => {
    const d = MAGAZINE_DEMOS.find((x) => x.key === "coordinator-week")!;
    const doc = readGuideDoc(d.doc as never, { draft: true });
    const lens = allBlocks(doc).find((b) => b.type === "workload")! as unknown as WorkloadLabData;
    expect(workloadCaseProblems(lens)).toEqual([]);
    expect(Object.values(lens.approval).every((v) => v === "")).toBe(true);
    expect(lens.story).toMatchObject({ character: "Maya", coordinator: "Sam" });
    expect(lens.story.situation).toMatch(/35 people.*Three new participants start each month and about one leaves.*\$26,720.*\$10,000/);
    expect(doc.tags).toEqual({ roles: ["owner", "coordinator"], goals: ["grow", "quality"] });
  });

  it("puts Maya’s three suburbs in the suburb-growth article: a case that passes its check, with its sign-off left for the reviewers", () => {
    const d = MAGAZINE_DEMOS.find((x) => x.key === "suburb-growth")!;
    const doc = readGuideDoc(d.doc as never, { draft: true });
    const block = allBlocks(doc).find((b) => b.type === "coverage")! as unknown as CoverageLabData;
    expect(coverageCaseProblems(block)).toEqual([]);
    expect(Object.values(block.approval).every((v) => v === "")).toBe(true);
    expect(block.story.character).toBe("Maya");
    expect(block.story.situation).toMatch(/Toowoomba.*35 people; three start each month and about one leaves.*\$26,720.*\$10,000/);
    // Fictional suburbs, labelled as such; no library "Sam".
    expect(block.inputs.areas.every((a) => /fictional/i.test(a.note ?? ""))).toBe(true);
    expect(JSON.stringify(block)).not.toMatch(/\bSam\b/);
    expect(doc.tags).toEqual({ roles: ["owner"], goals: ["grow", "quality"] });
  });

  it("puts Maya’s three relationships in the referral article: a case that passes its check, generic labels only, sign-off left for the reviewers", () => {
    const d = MAGAZINE_DEMOS.find((x) => x.key === "referral-active")!;
    const doc = readGuideDoc(d.doc as never, { draft: true });
    const block = allBlocks(doc).find((b) => b.type === "referral")! as unknown as ReferralLabData;
    expect(referralCaseProblems(block)).toEqual([]);
    expect(Object.values(block.approval).every((v) => v === "")).toBe(true);
    expect(block.story.character).toBe("Maya");
    expect(block.story.situation).toMatch(/Toowoomba.*35 people; three start each month and about one leaves.*\$26,720.*\$10,000/);
    expect(block.story.relationships.map((r) => r.label)).toEqual(["The GP practice", "The hospital discharge team", "The community organisation"]);
    // Opaque ids only, and no library "Sam".
    expect(block.inputs.records.every((r) => /^E\d\d$/.test(r.id))).toBe(true);
    expect(JSON.stringify(block)).not.toMatch(/\bSam\b/);
    expect(block.links.map((l) => l.href)).toEqual(["/magazine/is-this-suburb-ready-for-growth", "/magazine/can-we-take-on-the-next-10-clients"]);
    expect(doc.tags).toEqual({ roles: ["owner"], goals: ["grow", "quality"] });
  });

  it("puts Mrs Patel’s Tuesdays in the missed-service article: a case that passes its check, Maya’s facts kept, sign-off left for the reviewers", () => {
    const d = MAGAZINE_DEMOS.find((x) => x.key === "missed-service")!;
    const doc = readGuideDoc(d.doc as never, { draft: true });
    const block = allBlocks(doc).find((b) => b.type === "reliability")! as unknown as ReliabilityLabData;
    expect(reliabilityCaseProblems(block)).toEqual([]);
    expect(Object.values(block.approval).every((v) => v === "")).toBe(true);
    expect(block.story.character).toBe("Maya");
    expect(block.story.participant).toBe("Mrs Patel");
    expect(block.story.situation).toMatch(/Toowoomba.*35 people; three start each month and about one leaves.*\$26,720.*\$10,000/);
    // Mrs Patel's established facts: she lives at home and is planning a bathroom upgrade.
    expect(block.story.situation).toMatch(/lives at home.*bathroom upgrade/);
    // Opaque visit ids, every visit fictional, no library "Sam", and the missing Work Tools as labelled placeholders.
    expect(block.inputs.occurrences.every((o) => /^V\d\d$/.test(o.id) && o.source === "fictional")).toBe(true);
    expect(JSON.stringify(block)).not.toMatch(/\bSam\b/);
    expect(block.placeholders.trustCheck).toMatch(/28-Day Trust Check.*placeholder/);
    expect(block.placeholders.networkBuilder).toMatch(/Contractor Network Builder.*placeholder/);
    expect(doc.tags).toEqual({ roles: ["owner"], goals: ["quality", "grow"] });
  });

  it("puts Maya’s next 90 days in the cash article: a case that passes its check, Maya’s facts kept, sign-off left for the reviewers", () => {
    const d = MAGAZINE_DEMOS.find((x) => x.key === "fund-90")!;
    const doc = readGuideDoc(d.doc as never, { draft: true });
    const block = allBlocks(doc).find((b) => b.type === "cashbridge")! as unknown as CashBridgeLabData;
    expect(cashBridgeCaseProblems(block)).toEqual([]);
    expect(Object.values(block.approval).every((v) => v === "")).toBe(true);
    expect(block.story.character).toBe("Maya");
    expect(block.story.situation).toMatch(/Toowoomba.*35 people; three start each month and about one leaves.*\$26,720.*\$10,000/);
    // Generic labels only, no library "Sam", and links that are opened by choice, never prefilled.
    expect(block.inputs.clients.every((c) => /^Start \d$/.test(c.label))).toBe(true);
    expect(JSON.stringify(block)).not.toMatch(/\bSam\b/);
    expect(block.links.map((l) => l.href)).toEqual([
      "/magazine/mayas-next-coordinator-when-to-hire",
      "/magazine/can-we-take-on-the-next-10-clients",
      "/magazine/which-referrals-become-active-clients",
      "/tools/caseload-margin",
    ]);
    expect(doc.tags).toEqual({ roles: ["owner"], goals: ["grow"] });
  });

  it("puts both case threads in the what-would-you-do article: guardrails pass, only the owners’ sign-off and versions are left", () => {
    const d = MAGAZINE_DEMOS.find((x) => x.key === "what-would-you-do")!;
    const doc = readGuideDoc(d.doc as never, { draft: true });
    const cases = allBlocks(doc).filter((b) => b.type === "casethread") as unknown as CaseThreadData[];
    expect(cases.map((c) => c.threadId)).toEqual(["wwyd-chosen-friend", "wwyd-refused-check"]);
    for (const c of cases) {
      expect(caseGuardrailProblems(c)).toEqual([]);
      expect(Object.values(c.approval).every((v) => v === "")).toBe(true);
      expect(c.seeds.length).toBeGreaterThanOrEqual(3);
      // What holds it back is exactly what the owners decide: the sign-off, the policy version and the review date.
      expect(caseThreadHardProblems(c, "2026-11-24").map((p) => p.replace(/^“[^”]+”: /, ""))).toEqual([
        "record the content owner, Clinical, Quality and Community owner approval of the case note, and the date.",
        "record the governing policy or agreement and its version.",
        "set the case note’s next review date.",
      ]);
    }
    expect(d.audience).toEqual(["coordinator", "staff"]);
  });

  it("puts Dot at quarter end in the quarter-end article: a case that passes its check, Dot’s facts kept, sign-off left for the reviewers", () => {
    const d = MAGAZINE_DEMOS.find((x) => x.key === "quarter-end")!;
    const doc = readGuideDoc(d.doc as never, { draft: true });
    const block = allBlocks(doc).find((b) => b.type === "budgetlab")! as unknown as BudgetLabData;
    expect(budgetLabCaseProblems(block)).toEqual([]);
    expect(Object.values(block.approval).every((v) => v === "")).toBe(true);
    expect(block.story.participant).toBe("Dot");
    expect(block.story.supporter).toMatchObject({ name: "Fiona", relation: "daughter" });
    expect(block.story.about).toMatch(/roses/);
    expect(d.audience).toEqual(["coordinator", "staff"]);
    expect(doc.tags).toEqual({ roles: ["coordinator"], goals: ["money", "clients"] });
  });
});
