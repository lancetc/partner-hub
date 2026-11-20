import { beforeEach, describe, expect, it } from "vitest";
import { strFromU8, unzipSync } from "fflate";
import { openDb, type Db } from "./db";
import { userById, type User } from "./auth";
import { createCourseFor, deskOverview, ensureProblems, exportRegister, problemAction, themeDetail } from "./problemDesk";

/* The Problem desk: a trail from a signal to a response that doesn't have to be a course, with honest counts. */

let db: Db;
let jordan: User, riley: User, casey: User;
const now = new Date("2026-11-21T00:00:00Z");
const INVOICE = "theme-invoice-rates";
const act = (input: Record<string, unknown>) => problemAction(db, jordan, input, now) as unknown as Record<string, string>;
const detail = (id: string) => themeDetail(db, jordan, id, {}, now);

beforeEach(() => {
  db = openDb(":memory:");
  [jordan, riley, casey] = ["jordan", "riley", "casey"].map((id) => userById(db, id)!);
});

describe("the desk", () => {
  it("is for learning authors only", () => {
    expect(() => deskOverview(db, riley, {}, now)).toThrow();
    expect(() => deskOverview(db, casey, {}, now)).toThrow();
    expect(() => themeDetail(db, riley, INVOICE, {}, now)).toThrow();
    expect(() => problemAction(db, casey, { action: "create-theme", title: "Something keeps happening" }, now)).toThrow();
    expect(() => exportRegister(db, riley, {}, now)).toThrow();
  });

  it("seeds the fictional pilot once, safety first, and doesn’t bring a theme back", () => {
    const desk = deskOverview(db, jordan, {}, now);
    expect(desk.themes.map((t) => t.id)).toEqual(["theme-fall-not-reported", INVOICE, "theme-travel-charges"]);
    expect(desk.themes.every((t) => t.sample)).toBe(true);
    expect(desk.safety.map((t) => t.id)).toEqual(["theme-fall-not-reported"]);
    expect(desk.ungrouped).toHaveLength(2);
    db.prepare("DELETE FROM pd_case_events WHERE case_id IN (SELECT id FROM pd_cases WHERE theme_id = 'theme-travel-charges')").run();
    for (const t of ["pd_cases", "pd_actions", "pd_responses", "pd_metric_points"])
      db.prepare(`DELETE FROM ${t} WHERE theme_id = 'theme-travel-charges'`).run();
    db.prepare("DELETE FROM pd_themes WHERE id = 'theme-travel-charges'").run();
    ensureProblems(db, now);
    expect(deskOverview(db, jordan, {}, now).themes).toHaveLength(2);
  });

  it("counts cases, contacts and reopenings apart, and leaves out the false match", () => {
    const d = detail(INVOICE);
    expect(d.cases).toHaveLength(7);
    expect(d.counts.cases).toBe(6);
    expect(d.counts.reopened).toBe(1);
    expect(d.counts.contactEvents).toBeGreaterThan(d.counts.cases);
    const first = d.cases.find((c) => c.sourceRef === "BR-PRACTICE-0412")!;
    expect(first.events.filter((e) => e.kind === "initial" || e.kind === "update")).toHaveLength(4);
    expect(d.trend).toHaveLength(12);
    expect(d.trend.reduce((n, p) => n + p.newCases, 0)).toBe(6);
    const desk = deskOverview(db, jordan, { risk: "elevated" }, now);
    expect(desk.themes.map((t) => t.id)).toEqual([INVOICE]);
    expect(desk.total).toBe(3);
  });

  it("shows what was tried before, with the Topic’s report or none", () => {
    const d = detail(INVOICE);
    const prior = d.actions.filter((a) => a.prior);
    expect(prior).toHaveLength(2);
    expect(prior.map((a) => a.result).sort()).toEqual(["mixed", "no_change"]);
    for (const a of d.actions) expect(a.reportLink === null || a.reportLink.startsWith("/admin/completions/lessons/")).toBe(true);
    expect(d.metrics.filter((m) => m.metric === "work").every((m) => m.rate !== null)).toBe(true);
    expect(d.statement).toMatch(/We think the main barrier is/);
  });
});

describe("signals", () => {
  it("counts the same source record once, and says where it already is", () => {
    expect(() =>
      act({ action: "add-case", id: INVOICE, themeId: INVOICE, source: "billing", sourceRef: "BR-PRACTICE-0412", on: "2026-11-01", summary: "Again" }),
    ).toThrow(/already linked to “Invoices approved/);
    const { caseId } = act({
      action: "add-case",
      id: INVOICE,
      themeId: INVOICE,
      source: "billing",
      sourceRef: "BR-NEW-1",
      on: "2026-11-01",
      summary: "A new one",
    });
    expect(detail(INVOICE).counts.cases).toBe(7);
    act({ action: "add-event", caseId, kind: "update", on: "2026-11-05", note: "Asked again" });
    const c = detail(INVOICE).counts;
    expect(c.cases).toBe(7);
    expect(() => act({ action: "add-event", caseId, kind: "reopen", on: "2026-11-06" })).toThrow(/isn’t closed/);
    act({ action: "add-event", caseId, kind: "close", on: "2026-11-07" });
    expect(() => act({ action: "add-event", caseId, kind: "close", on: "2026-11-08" })).toThrow(/already closed/);
    act({ action: "add-event", caseId, kind: "reopen", on: "2026-11-09" });
    expect(detail(INVOICE).counts.reopened).toBe(2);
    expect(() => act({ action: "add-event", caseId, kind: "initial", on: "2026-11-10" })).toThrow();
  });

  it("moves, splits and merges with a reason, and keeps a safety theme apart", () => {
    const desk = deskOverview(db, jordan, {}, now);
    act({ action: "move-case", caseId: desk.ungrouped[0].id, themeId: INVOICE });
    expect(deskOverview(db, jordan, {}, now).ungrouped).toHaveLength(1);
    const d = detail(INVOICE);
    const { id: fresh } = act({ action: "split", id: INVOICE, title: "Rates on weekend visits", caseIds: [d.cases[0].id, d.cases[1].id] });
    expect(detail(fresh).cases).toHaveLength(2);
    expect(detail(INVOICE).cases).toHaveLength(6);
    expect(() => act({ action: "merge", id: fresh, into: INVOICE, reason: "same" })).toThrow(/why these are the same/);
    act({ action: "merge", id: fresh, into: INVOICE, reason: "On a closer look these are the same rate problem." });
    expect(detail(INVOICE).cases).toHaveLength(8);
    expect(detail(fresh).theme.mergedInto).toBe(INVOICE);
    expect(deskOverview(db, jordan, {}, now).themes.some((t) => t.id === fresh)).toBe(false);
    expect(() => act({ action: "merge", id: "theme-fall-not-reported", into: INVOICE, reason: "Both are about paperwork being late." })).toThrow(
      /safety theme can’t be merged/,
    );
    expect(detail(INVOICE).history.map((h) => h.action)).toEqual(expect.arrayContaining(["merged-from", "split", "case-moved-in"]));
  });

  it("marks a false match without losing the case, and needs evidence to close", () => {
    const d = detail(INVOICE);
    const real = d.cases.find((c) => !c.falseMatch)!;
    act({ action: "false-match", caseId: real.id, on: true });
    expect(detail(INVOICE).counts.cases).toBe(5);
    expect(detail(INVOICE).cases).toHaveLength(7);
    expect(() => act({ action: "set-status", id: INVOICE, status: "closed", note: "" })).toThrow(/what the evidence is/);
    act({ action: "set-status", id: INVOICE, status: "closed", note: "Rework has stayed under one per 100 for three months." });
    expect(detail(INVOICE).theme.status).toBe("closed");
  });
});

describe("the response", () => {
  it("approves a response with no learning item, and won’t start a course for it", () => {
    const { id } = act({ action: "create-theme", title: "Quotes missing the travel line", risk: "routine", owner: "Operations" });
    expect(detail(id).theme.verified).toBe(false);
    act({ action: "verify", id, on: true });
    act({
      action: "save-diagnosis",
      id,
      diagnosis: {
        situation: "quoting",
        role: "coordinators",
        observed: "leave travel inside the visit rate",
        desired: "quote travel as its own line",
        barriers: [{ barrier: "workflow", confidence: "known", text: "The form has no travel line" }],
        verified: true,
      },
    });
    expect(() => act({ action: "approve-response", id })).toThrow(/Write the response decision first/);
    const data = {
      problem: "Travel is being charged inside the visit rate.",
      audience: "Coordinators who quote",
      audienceSize: 300,
      desired: "Quote travel as its own line.",
      barrierSummary: "The form had no travel line (known).",
      learning: "none",
      why: "The form is the cause, so the form is what changes.",
      measure: { name: "Travel queries per 100 quotes" },
      baseline: { note: "12 per 100 in October" },
      reviewOn: "2027-02-01",
      owner: "Operations lead",
    };
    act({ action: "save-response", id, data });
    expect(() => act({ action: "approve-response", id })).toThrow(/at least one action with an owner/);
    expect(() => act({ action: "save-action", id, kind: "portal", title: "Add a travel line to the quote form" })).toThrow(/needs an owner/);
    act({ action: "save-action", id, kind: "portal", title: "Add a travel line to the quote form", owner: "Product", due: "2026-12-10" });
    act({ action: "approve-response", id });
    const d = detail(id);
    expect(d.response.status).toBe("approved");
    expect(d.response.learnerHours).toBeNull();
    // Nothing to practise: the plan stays empty and says why.
    expect(act({ action: "plan-generate", id }).note).toMatch(/access or workflow/);
    expect(detail(id).plan.steps).toHaveLength(0);
    expect(() => createCourseFor(db, jordan, id, now)).toThrow(/has none/);
    // Changing an approved decision makes it a draft again.
    act({ action: "save-response", id, data: { ...data, why: "The form is the cause; a note to coordinators goes with the fix." } });
    expect(detail(id).response.status).toBe("draft");
    expect(() => act({ action: "review", id, decision: "keep", evidence: "Queries fell from 12 to 3 per 100 after the form change." })).toThrow(
      /Approve the response/,
    );
    act({ action: "approve-response", id });
    act({ action: "review", id, decision: "close", evidence: "Queries fell from 12 to 3 per 100 in the two months after the form change." });
    expect(detail(id).theme.status).toBe("closed");
    expect(detail(id).reviews).toHaveLength(1);
    expect(db.prepare("SELECT COUNT(*) AS n FROM audit WHERE event LIKE 'problem.%'").get()).toEqual({ n: 3 });
  });

  it("plans the learning with reasons, keeps what the author accepted, and wants a reason for a swap", () => {
    expect(act({ action: "plan-generate", id: INVOICE }).note).toMatch(/Learning alone won’t close this/);
    let steps = detail(INVOICE).plan.steps;
    expect(steps.length).toBeGreaterThan(0);
    expect(steps.every((s) => s.status === "proposed" && s.rationale.mechanism && s.evidence)).toBe(true);
    act({ action: "plan-step", id: INVOICE, stepId: steps[0].id, op: "accept" });
    expect(() => act({ action: "plan-step", id: INVOICE, stepId: steps[0].id, op: "replace", blockType: "nope", reason: "Because it suits" })).toThrow(
      /isn’t a block/,
    );
    expect(() => act({ action: "plan-step", id: INVOICE, stepId: steps[0].id, op: "replace", blockType: "auditor", reason: "" })).toThrow(
      /why this block suits/,
    );
    const last = steps.at(-1)!;
    act({
      action: "plan-step",
      id: INVOICE,
      stepId: last.id,
      op: "replace",
      blockType: "checklist",
      reason: "A checklist at the desk is what coordinators asked for.",
    });
    act({ action: "plan-add", id: INVOICE, blockType: "confidence", step: "apply", reason: "To see who still isn’t sure." });
    act({ action: "plan-generate", id: INVOICE });
    steps = detail(INVOICE).plan.steps;
    expect(steps.find((s) => s.id === last.id)).toMatchObject({
      blockType: "checklist",
      status: "accepted",
      overrideReason: "A checklist at the desk is what coordinators asked for.",
    });
    expect(steps.filter((s) => s.blockType === "confidence")).toHaveLength(1);
    expect(new Set(steps.map((s) => s.blockType)).size).toBe(steps.length);
    const cov = detail(INVOICE).plan.coverage;
    expect(cov.minutes).toBeGreaterThan(0);
    expect(cov.notLearnable.length).toBe(1);
    act({ action: "plan-step", id: INVOICE, stepId: steps[1].id, op: "up" });
    expect(detail(INVOICE).plan.steps[0].id).toBe(steps[1].id);
    act({ action: "plan-step", id: INVOICE, stepId: steps[1].id, op: "remove" });
    expect(detail(INVOICE).plan.steps).toHaveLength(steps.length - 1);
  });

  it("starts an ordinary Magazine draft only for an approved decision to build", () => {
    expect(() => createCourseFor(db, jordan, INVOICE, now)).toThrow(/Approve the response/);
    const data = detail(INVOICE).response.data;
    act({ action: "save-response", id: INVOICE, data: { ...data, learning: "new" } });
    act({ action: "approve-response", id: INVOICE });
    const { guideId } = createCourseFor(db, jordan, INVOICE, now);
    expect(db.prepare("SELECT status FROM magazine_guides WHERE id = ?").get(guideId)).toEqual({ status: "draft" });
    expect(createCourseFor(db, jordan, INVOICE, now).guideId).toBe(guideId);
    expect(detail(INVOICE).response.guide?.id).toBe(guideId);
  });

  it("keeps a measure as a dated aggregate, with no rate where there’s no denominator", () => {
    act({ action: "metric", id: INVOICE, metric: "work", bucket: "2026-11", numerator: 30, denominator: "" });
    act({ action: "metric", id: INVOICE, metric: "work", bucket: "2026-11", numerator: 28, denominator: 1300, note: "Corrected" });
    const nov = detail(INVOICE).metrics.filter((m) => m.metric === "work" && m.bucket === "2026-11");
    expect(nov).toHaveLength(1);
    expect(nov[0]).toMatchObject({ numerator: 28, denominator: 1300, rate: 2.2 });
    act({ action: "metric", id: INVOICE, metric: "practice", bucket: "2026-11", numerator: 12, denominator: "" });
    expect(detail(INVOICE).metrics.find((m) => m.metric === "practice" && m.bucket === "2026-11")!.rate).toBeNull();
    expect(() => act({ action: "metric", id: INVOICE, metric: "work", bucket: "November", numerator: 1 })).toThrow(/Choose the month/);
  });
});

describe("the Excel export", () => {
  it("writes the register, previous responses, design, trend and notes, and logs the export", () => {
    act({ action: "plan-generate", id: INVOICE });
    const out = exportRegister(db, jordan, { origin: "https://hub.example" }, now);
    expect(out.filename).toBe("Problem desk decision register 2026-11-21.xlsx");
    const files = unzipSync(new Uint8Array(out.buffer));
    const text = (n: number) => strFromU8(files[`xl/worksheets/sheet${n}.xml`]);
    const all = [1, 2, 3, 4, 5].map(text).join("\n");
    expect(strFromU8(files["xl/workbook.xml"])).toMatch(/Decision register.*Previous responses.*Learning design.*Trend data.*Data notes/);
    expect(text(1)).toMatch(/Invoices approved at rates that differ from the agreement/);
    expect(text(1)).toMatch(/https:\/\/hub\.example\/admin\/problems\/theme-invoice-rates/);
    expect(text(1)).toMatch(/Sample data/);
    // The safety theme has no measure: it says so, rather than showing a zero.
    expect(text(1)).toMatch(/Not measured/);
    expect(text(2)).toMatch(/Tried before this decision/);
    expect(text(2)).toMatch(/Many learners choose the correct response in practice; invoice rework has not yet fallen\./);
    expect(text(3)).toMatch(/Proposed/);
    expect(text(4)).toMatch(/New unique cases/);
    expect(text(4)).toMatch(/Follow-up contacts/);
    expect(text(5)).toMatch(/not the source of truth/);
    expect(text(5)).toMatch(new RegExp(jordan.name));
    // No case narratives, and no named learners.
    expect(all).not.toMatch(/Supplier asked again about the short payment/);
    expect(all).not.toMatch(new RegExp(riley.name));
    const logged = db.prepare("SELECT actor, next FROM audit WHERE event = 'problem.exported'").get() as { actor: string; next: string };
    expect(logged.actor).toBe("jordan");
    expect(JSON.parse(logged.next)).toMatchObject({ themes: 3 });
    expect(strFromU8(unzipSync(new Uint8Array(exportRegister(db, jordan, { risk: "safety" }, now).buffer))["xl/worksheets/sheet1.xml"])).not.toMatch(
      /Invoices approved/,
    );
  });
});
