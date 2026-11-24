import { beforeEach, describe, expect, it, vi } from "vitest";
import { openDb, type Db } from "./db";
import { userById, type User } from "./auth";
import { createGuide, publishGuide, readGuide, saveGuideDraft } from "./magazine";
import { allBlocks } from "@/lib/magazine";
import type { HazardScanData } from "@/lib/hazardScan";
import { DOT_KITCHEN, PEARCE_BEDROOM } from "@/content/hazardScenes";
import {
  hazardScanPlacements,
  hazardScanState,
  hazardScanStats,
  reportUnclear,
  retryHazardScan,
  saveHazardScan,
  startHazardScan,
  submitFindings,
  submitResponse,
  viewedHazardScan,
} from "./hazardScan";

/*
  Spot the Hazard on the server: it can't publish until each variant is reviewed and the release signed off; readers
  never get the answer key before they submit; the variant is chosen, frozen and resumed; scoring uses the frozen key,
  whatever the browser sends; the action is judged apart; completion is a visual practice completion, never a pass;
  a retry prefers an unseen room; events carry no free text; a Topic card gets the same scene; Quality can trace every
  placement of a source and see results by variant (PRD acceptance criteria 1, 2, 4 to 9, 11 and 12).
*/

let db: Db;
let jordan: User, riley: User, sam: User;
const now = new Date("2026-11-24T00:00:00Z");
const TODAY = "2026-11-24";

/** Test-only sign-off and reviews, to show a reviewed scene can publish. The pilot article's stay empty. */
function approved(d: HazardScanData): HazardScanData {
  const c = structuredClone(d);
  for (const v of c.variants) {
    v.status = "approved";
    v.review = {
      reviewer: "Reviewer",
      reviewedOn: TODAY,
      objects: true,
      locations: true,
      risks: true,
      actions: true,
      sources: true,
      rendering: true,
      note: "",
    };
    for (const o of v.objects) o.key.source = o.key.category === "infection" ? "acqsc-ipc" : "acqsc-home-environment";
  }
  for (const x of c.decisions) x.source = "acqsc-home-environment";
  c.approval = { quality: "Q", policy: "P", learning: "L", approvedOn: TODAY, reviewBy: "2027-05-01", releaseReviewed: c.release };
  return c;
}
const doc = (data: HazardScanData) => ({
  schema: 2 as const,
  pages: [
    {
      id: "p1",
      title: "Look before you help",
      purpose: "",
      template: "notice",
      kind: "content",
      required: true,
      allActivities: false,
      sections: [{ id: "s1", title: "Mrs Pearce", blocks: [{ id: "hz", type: "hazardscan", ...data }] }],
    },
  ],
});
function course(data = approved(PEARCE_BEDROOM)) {
  const c = createGuide(db, jordan, { title: "Look before you help", completion: "confirm", doc: doc(data) as never }, now);
  publishGuide(db, jordan, c.id, "", now);
  return c;
}
const events = (guideId: string) =>
  db.prepare("SELECT event, detail FROM magazine_events WHERE guide_id = ? AND event NOT LIKE 'page%' ORDER BY id").all(guideId) as {
    event: string;
    detail: string;
  }[];
const B = { blockId: "hz" };
/** The ids of the hazards in the learner's frozen room (from the server's own record, as a test only can). */
const keyOf = (attemptId: string) =>
  (
    JSON.parse(
      (db.prepare("SELECT variant FROM hazardscan_attempts WHERE id = ?").get(attemptId) as { variant: string }).variant,
    ) as HazardScanData["variants"][number]
  ).objects;

beforeEach(() => {
  db = openDb(":memory:");
  [jordan, riley, sam] = ["jordan", "riley", "sam"].map((id) => userById(db, id)!);
  vi.stubEnv("OPENAI_API_KEY", "");
  vi.stubEnv("ANTHROPIC_API_KEY", "");
});

describe("publishing (criteria 1, 4 and 8)", () => {
  it("can't publish the pilot as it ships, nor an assessed check, and “Publish anyway” doesn’t cover it", () => {
    const c = createGuide(db, jordan, { title: "Unreviewed", completion: "confirm", doc: doc(PEARCE_BEDROOM) as never }, now);
    expect(() => publishGuide(db, jordan, c.id, "", now, { allowUnverified: true })).toThrow(/Spot the Hazard needs reviewed, approved room variants/);
    const a = createGuide(db, jordan, { title: "Assessed", completion: "confirm", doc: doc({ ...approved(PEARCE_BEDROOM), mode: "assessed" }) as never }, now);
    expect(() => publishGuide(db, jordan, a.id, "", now)).toThrow(/Spot the Hazard/);
    expect(() => course()).not.toThrow();
  });
});

describe("an attempt (criteria 2, 6, 7 and 9)", () => {
  it("gives readers the scene set and nothing of the answer key, before or after they start", () => {
    const c = course();
    const b = allBlocks(readGuide(db, riley, c.slug).doc).find((x) => x.type === "hazardscan") as unknown as HazardScanData;
    expect([b.variants, b.decisions, b.debrief]).toEqual([[], [], ""]);
    const fresh = hazardScanState(db, riley, c.id, "hz", {}, now);
    expect(fresh).toMatchObject({ status: "new", available: true, role: "coordinator", variant: null });
    const v = startHazardScan(db, riley, c.id, B, now);
    expect(v.status).toBe("active");
    expect(JSON.stringify(v)).not.toMatch(/"key"|"explain"|"feature"|"verdict"|"hazard":true/);
    expect(v.questions).toEqual([]);
    expect(v.findings).toBeNull();
  });

  it("freezes the variant: a resent start or a refresh resumes the same room", () => {
    const c = course();
    const a = startHazardScan(db, sam, c.id, B, now);
    expect(startHazardScan(db, sam, c.id, B, now).attemptId).toBe(a.attemptId);
    const again = hazardScanState(db, sam, c.id, "hz", {}, now);
    expect(again.variant!.id).toBe(a.variant!.id);
    expect(again.role).toBe("worker");
    const row = db
      .prepare("SELECT variant_id, variant_version, variant_hash, scorer_version, scene_version, release, family_id, seed FROM hazardscan_attempts")
      .get();
    expect(row).toMatchObject({
      variant_version: 1,
      scorer_version: "hazard-scorer-1",
      scene_version: "hazard-scan-1",
      release: "1",
      family_id: "pearce-bedroom-bathroom",
    });
  });

  it("flags, revises, submits findings, chooses an action and completes only once the debrief is viewed: never a pass", () => {
    const c = course();
    const a = startHazardScan(db, sam, c.id, B, now);
    const objects = keyOf(a.attemptId!);
    const hazards = objects.filter((o) => o.key.hazard).sort((x, y) => y.key.priority - x.key.priority);
    const safe = objects.find((o) => !o.key.hazard)!;
    // Flag a safe item by mistake, then remove it; flag the hazards, by the list route.
    saveHazardScan(db, sam, c.id, { ...B, flags: [{ id: safe.id }], route: "list" }, now);
    saveHazardScan(db, sam, c.id, { ...B, flags: hazards.map((h) => ({ id: h.id, reason: h.key.category })), priority: hazards[0].id }, now);
    expect(() => submitResponse(db, sam, c.id, { ...B, chosen: {} }, now)).toThrow(/findings first/);
    const found = submitFindings(db, sam, c.id, B, now);
    expect(found.status).toBe("found");
    expect(found.findings!.recognition).toBe(3);
    expect(found.findings!.priority).toBe(3);
    expect(found.questions.length).toBe(2);
    expect(JSON.stringify(found.questions)).not.toMatch(/verdict|feedback/);
    // A resent submit changes nothing.
    const before = events(c.id).length;
    expect(submitFindings(db, sam, c.id, { ...B, flags: [] }, now).findings!.recognition).toBe(3);
    expect(events(c.id).length).toBe(before);
    // The first action, answered without consent: found, but different action feedback.
    const [q1, q2] = found.questions;
    const unilateral = q1.options.find((o) => /without asking|put it away|yourself|Move it to the bed|throw/i.test(o.text)) ?? q1.options[1];
    const done = submitResponse(db, sam, c.id, { ...B, chosen: { [q1.id]: unilateral.id, [q2.id]: q2.options[0].id } }, now);
    expect(done.status).toBe("submitted");
    expect(done.debrief!.levels.recognition).toBe(3);
    expect(done.debrief!.levels.response).toBeLessThan(3);
    expect(done.debrief!.decisions[0].hazard.found).toBe(true);
    expect(done.debrief!.decisions[0].chosen!.ignores.length).toBeGreaterThan(0);
    expect(viewedHazardScan(db, sam, c.id, B, now).status).toBe("completed");
    viewedHazardScan(db, sam, c.id, B, now);
    const names = events(c.id).map((e) => e.event);
    expect(names).toEqual([
      "activity_started",
      "scene_selection_changed",
      "scene_route_switched",
      "scene_selection_changed",
      "findings_submitted",
      "response_submitted",
      "feedback_viewed",
      "activity_completed",
    ]);
    expect(names).not.toContain("assessment_passed");
    const completed = JSON.parse(events(c.id).find((e) => e.event === "activity_completed")!.detail);
    expect(completed.signal).toBe("visual_practice_completed");
    // Every event carries its versions and a key; none carries free text or a place on a map.
    for (const e of events(c.id)) {
      const d = JSON.parse(e.detail);
      expect(d).toMatchObject({
        family: "pearce-bedroom-bathroom",
        release: "1",
        scorer: "hazard-scorer-1",
        mode: "practice",
        role: "worker",
        place: "magazine",
      });
      expect(d.key).toMatch(/^hz-/);
      expect(e.detail).not.toMatch(/latitude|longitude|"text"|"explain"/);
    }
    const f = JSON.parse(events(c.id).find((e) => e.event === "findings_submitted")!.detail);
    // Flagged only in the list route: that's what's recorded, so equivalence between routes can be checked.
    expect(f.routes).toEqual(["list"]);
  });

  it("scores on the server's frozen key: forged ids and duplicates earn nothing (criterion 9)", () => {
    const c = course();
    const a = startHazardScan(db, sam, c.id, B, now);
    const top = keyOf(a.attemptId!)
      .filter((o) => o.key.hazard)
      .sort((x, y) => y.key.priority - x.key.priority)[0];
    const v = submitFindings(
      db,
      sam,
      c.id,
      { ...B, flags: [{ id: top.id }, { id: top.id }, { id: top.id }, { id: "hazard-1" }, { id: "../key" }], priority: top.id },
      now,
    );
    expect(v.findings!.found.map((x) => x.id)).toEqual([top.id]);
    expect(v.findings!.recognition).toBeLessThan(3);
    expect(v.state.flags).toEqual([{ id: top.id, reason: "" }]);
  });

  it("flagging everything doesn't score well", () => {
    const c = course();
    const a = startHazardScan(db, sam, c.id, B, now);
    const all = keyOf(a.attemptId!).map((o) => ({ id: o.id }));
    const v = submitFindings(db, sam, c.id, { ...B, flags: all, priority: "unsure" }, now);
    expect(v.findings!.indiscriminate).toBe(true);
    expect(v.findings!.recognition).toBeLessThanOrEqual(1);
  });

  it("never rescores an old attempt: a republished course starts fresh, and the old debrief stays as given", () => {
    const c = course();
    const a = startHazardScan(db, sam, c.id, B, now);
    const objects = keyOf(a.attemptId!);
    const v = submitFindings(db, sam, c.id, { ...B, flags: objects.filter((o) => o.key.hazard).map((o) => ({ id: o.id })), priority: "unsure" }, now);
    const done = submitResponse(db, sam, c.id, { ...B, chosen: Object.fromEntries(v.questions.map((q) => [q.id, q.options[0].id])) }, now);
    const stored = db.prepare("SELECT result, variant FROM hazardscan_attempts WHERE id = ?").get(a.attemptId!) as { result: string; variant: string };
    // The author edits the answer key and republishes: a new release with a changed variant.
    const changed = approved(PEARCE_BEDROOM);
    changed.release = "2";
    changed.approval.releaseReviewed = "2";
    for (const x of changed.variants) for (const o of x.objects) o.key.explain = `${o.key.explain} (changed)`;
    saveGuideDraft(db, jordan, c.id, { doc: doc(changed) as never }, now);
    publishGuide(db, jordan, c.id, "", now, { moveLearners: true });
    const fresh = hazardScanState(db, sam, c.id, "hz", {}, now);
    expect(fresh.status).toBe("new");
    const after = db.prepare("SELECT result, variant FROM hazardscan_attempts WHERE id = ?").get(a.attemptId!);
    expect(after).toEqual(stored);
    expect(JSON.parse(stored.result).versions).toMatchObject({ release: "1", variantVersion: 1 });
    expect(done.debrief!.findings.found[0].explain).not.toMatch(/changed/);
  });

  it("records an unclear item once, by id, after the reveal only", () => {
    const c = course();
    const a = startHazardScan(db, sam, c.id, B, now);
    const id = keyOf(a.attemptId!)[0].id;
    expect(() => reportUnclear(db, sam, c.id, { ...B, item: id }, now)).toThrow(/once you’ve seen the answers/);
    submitFindings(db, sam, c.id, B, now);
    reportUnclear(db, sam, c.id, { ...B, item: id }, now);
    reportUnclear(db, sam, c.id, { ...B, item: id }, now);
    expect(() => reportUnclear(db, sam, c.id, { ...B, item: "not-here" }, now)).toThrow();
    expect(events(c.id).filter((e) => e.event === "item_unclear_reported")).toHaveLength(1);
  });
});

describe("variation and retries (criteria 5 and 6)", () => {
  function finish(c: { id: string }, u: User) {
    const v = submitFindings(db, u, c.id, B, now);
    submitResponse(db, u, c.id, { ...B, chosen: Object.fromEntries(v.questions.map((q) => [q.id, q.options[0].id])) }, now);
    return viewedHazardScan(db, u, c.id, B, now);
  }

  it("gives a retry a room the learner hasn't seen, keeps each attempt, and says when a room repeats", () => {
    const c = course();
    const first = startHazardScan(db, sam, c.id, B, now);
    finish(c, sam);
    const seen = [first.variant!.id];
    let last = first;
    for (let i = 0; i < 2; i++) {
      const r = retryHazardScan(db, sam, c.id, { ...B, from: last.attemptId }, now);
      // A resent retry returns the open attempt.
      expect(retryHazardScan(db, sam, c.id, { ...B, from: last.attemptId }, now).attemptId).toBe(r.attemptId);
      expect(seen).not.toContain(r.variant!.id);
      expect(r.repeat).toBe(false);
      seen.push(r.variant!.id);
      finish(c, sam);
      last = r;
    }
    const fourth = retryHazardScan(db, sam, c.id, { ...B, from: last.attemptId }, now);
    expect(fourth.repeat).toBe(true);
    expect(fourth.variant!.id).not.toBe(seen.at(-1));
    expect(fourth.attempts).toBe(4);
    expect(events(c.id).filter((e) => e.event === "retry_started")).toHaveLength(3);
  });

  it("takes a scene out of use when its sources need review: a start is refused, old attempts stay intact (criterion 12)", () => {
    const c = course();
    startHazardScan(db, sam, c.id, B, now);
    finish(c, sam);
    const later = new Date("2027-07-01T00:00:00Z");
    expect(hazardScanState(db, riley, c.id, "hz", {}, later).available).toBe(false);
    expect(() => startHazardScan(db, riley, c.id, B, later)).toThrow(/being reviewed/);
    expect((db.prepare("SELECT status FROM hazardscan_attempts WHERE user_id = 'sam'").get() as { status: string }).status).toBe("completed");
  });
});

describe("placement, Quality and reporting (criteria 1, 11 and 12)", () => {
  it("gives a Topic card the same block, readers' copy and attempt, by reference", () => {
    const c = course();
    startHazardScan(db, sam, c.id, { ...B, place: "topic:falls-at-home" }, now);
    const v = hazardScanState(db, sam, c.slug, "hz", { embed: true }, now);
    expect(v.guideId).toBe(c.id);
    expect(v.block!.variants).toEqual([]);
    expect(v.status).toBe("active");
    expect(JSON.parse(events(c.id)[0].detail).place).toBe("topic:falls-at-home");
    expect(() => hazardScanState(db, sam, c.id, "nope", {}, now)).toThrow(/isn’t here/);
  });

  it("lists every live placement, its reviewers and sources, and traces a source to the scenes resting on it", () => {
    const c = course();
    const d = createGuide(db, jordan, { title: "Dot’s kitchen", completion: "confirm", doc: doc(approved(DOT_KITCHEN)) as never }, now);
    publishGuide(db, jordan, d.id, "", now);
    const all = hazardScanPlacements(db, jordan, now).scenes;
    expect(all.map((s) => s.guideId).sort()).toEqual([c.id, d.id].sort());
    const pearce = all.find((s) => s.guideId === c.id)!;
    expect(pearce).toMatchObject({ person: "Mrs Pearce", release: "1", placements: [{ kind: "magazine", label: "Magazine: Look before you help" }] });
    expect(pearce.variants.map((v) => v.reviewer)).toEqual(["Reviewer", "Reviewer", "Reviewer"]);
    expect(pearce.eligible).toEqual([
      { role: "worker", label: "Care partner or support worker", count: 3 },
      { role: "coordinator", label: "Care coordinator", count: 3 },
    ]);
    expect(hazardScanPlacements(db, jordan, now, { source: "acqsc-ipc" }).scenes.map((s) => s.guideId)).toEqual([d.id]);
    expect(() => hazardScanPlacements(db, sam, now)).toThrow();
  });

  it("shows authors results by variant and item, suppressed under five people, never who did what", () => {
    const c = course();
    startHazardScan(db, sam, c.id, B, now);
    submitFindings(db, sam, c.id, { ...B, flags: [] }, now);
    const s = hazardScanStats(db, jordan, c.id).blocks[0];
    expect(s).toMatchObject({ attempts: 1, people: 1, submitted: 1, completed: 0, routes: { image: 1, list: 0, both: 0 } });
    expect(s.variants[0]).toMatchObject({ submitted: 1, suppressed: true, items: null, choices: null });
    expect(JSON.stringify(s)).not.toMatch(/sam/);
    expect(() => hazardScanStats(db, sam, c.id)).toThrow();
    // With five people, the item breakdown shows found / missed / flagged in error.
    for (const id of ["riley", "ash", "casey", "jordan"]) {
      const u = userById(db, id)!;
      startHazardScan(db, u, c.id, B, now);
      submitFindings(db, u, c.id, { ...B, flags: [] }, now);
    }
    const big = hazardScanStats(db, jordan, c.id).blocks[0];
    const withItems = big.variants.filter((v) => !v.suppressed);
    for (const v of withItems) expect(v.items!.some((i) => i.hazard && i.missed > 0)).toBe(true);
    expect(big.people).toBe(5);
  });

  it("writes nothing outside its own attempts and events", () => {
    const c = course();
    const tables = () => (db.prepare("SELECT name FROM sqlite_master WHERE type = 'table'").all() as { name: string }[]).map((t) => t.name).sort();
    startHazardScan(db, sam, c.id, B, now);
    const before = tables();
    const v = submitFindings(db, sam, c.id, B, now);
    submitResponse(db, sam, c.id, { ...B, chosen: Object.fromEntries(v.questions.map((q) => [q.id, q.options[0].id])) }, now);
    viewedHazardScan(db, sam, c.id, B, now);
    expect(tables()).toEqual(before);
  });
});
