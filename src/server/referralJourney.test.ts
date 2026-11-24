import { beforeEach, describe, expect, it, vi } from "vitest";
import { openDb, type Db } from "./db";
import { userById, type User } from "./auth";
import { createGuide, publishGuide, readGuide } from "./magazine";
import { allBlocks, readGuideDoc } from "@/lib/magazine";
import { caseProblems, referralForReaders, referralHardProblems, type ReferralLabData } from "@/lib/referralLab";
import { blankInputs, blankRow, zeroBlanks } from "@/lib/referralJourney";
import { charactersInBlock } from "@/lib/characters";
import { REFERRAL_ACTIVE } from "@/content/referralCases";
import { ensurePlanner } from "./caseloadPlanner";
import {
  businessHome,
  finishReferral,
  getReview,
  referralState,
  referralStats,
  retryReferral,
  saveReferral,
  saveReview,
  submitPrediction,
} from "./referralJourney";

/*
  The Referral Journey Calculator on the server: a fictional case that passes its check and can't publish unsigned,
  no answer key for readers, the debrief only once every step is done (fixture 1: end to end with fictional
  information, private mode optional), telemetry with no words, counts or labels, private Relationship Reviews nobody
  outside the business can reach (fixture 10), and the rationale and versions kept with the block (fixture 11).
*/

let db: Db;
let jordan: User, riley: User, casey: User, sam: User;
const now = new Date("2026-11-23T00:00:00Z");
// Test-only sign-off values, to show a signed block can publish. The real article's sign-off stays empty.
const SIGNED = {
  owner: "Owner",
  pathway: "Pathway",
  intake: "Intake",
  partnerships: "Partnerships",
  operations: "Ops",
  quality: "Quality",
  privacy: "Privacy",
  pilot: "Pilot",
  approvedOn: "2026-11-23",
  effectiveFrom: "2026-12-01",
  reviewBy: "2027-06-30",
};
const relationships = (signed = true): ReferralLabData => {
  const d = structuredClone(REFERRAL_ACTIVE);
  if (signed) d.approval = SIGNED;
  return d;
};
const doc = (data: ReferralLabData) => ({
  schema: 2 as const,
  pages: [
    {
      id: "p1",
      title: "Maya’s relationships",
      purpose: "",
      template: "blank",
      kind: "content",
      required: true,
      allActivities: false,
      sections: [{ id: "s1", title: "The comparison", blocks: [{ id: "rj", type: "referral", ...data }] }],
    },
  ],
});
function course(data = relationships()) {
  const c = createGuide(db, jordan, { title: "Which referrals become active clients?", completion: "confirm", doc: doc(data) as never }, now);
  publishGuide(db, jordan, c.id, "", now);
  return c;
}
const events = (guideId: string) =>
  db.prepare("SELECT event, detail FROM magazine_events WHERE guide_id = ? AND event NOT LIKE 'page%' ORDER BY rowid").all(guideId) as {
    event: string;
    detail: string;
  }[];
/** Each card's stage at first contact: what a careful learner sorts. */
const TAGS = {
  "card-1": "waiting",
  "card-2": "assessment",
  "card-3": "allocated",
  "card-4": "urgent",
  "card-5": "changing",
  "card-6": "unknown",
  "card-7": "allocated",
  "card-8": "waiting",
};
const ANSWERS = { denominator: "cohort", timing: "open", choice: "respect" };
/** Works through every step before finishing: the prediction, the cards, a funnel, the timing, effort and continuity. */
function workThrough(guideId: string, user: User, tags: Record<string, string> = TAGS, answers: Record<string, string> = ANSWERS) {
  submitPrediction(db, user, guideId, { blockId: "rj", prediction: { source: "gp" } }, now);
  return saveReferral(
    db,
    user,
    guideId,
    { blockId: "rj", state: { stage: 3, opened: ["funnel:gp", "time:gp", "effort", "continuity"], filters: ["month"], tags, ...answers } },
    now,
  );
}
const STRONG = {
  ...ANSWERS,
  revised: "community",
  dataPoint: "funded",
  relationship: "explainer",
  operational: "capacity",
  explanation: "careful",
  followUp: "honest",
};

beforeEach(() => {
  db = openDb(":memory:");
  [jordan, riley, casey, sam] = ["jordan", "riley", "casey", "sam"].map((id) => userById(db, id)!);
  ensurePlanner(db, now);
  vi.stubEnv("OPENAI_API_KEY", "");
  vi.stubEnv("ANTHROPIC_API_KEY", "");
});

describe("the block", () => {
  it("reads back from stored JSON unchanged, with its rationale and versions (fixture 11), and the case passes its check", () => {
    const parsed = allBlocks(readGuideDoc(doc(relationships()) as never)).find((b) => b.type === "referral")! as unknown as ReferralLabData;
    expect(parsed).toMatchObject({ title: REFERRAL_ACTIVE.title, storyVersion: REFERRAL_ACTIVE.storyVersion, stageModelVersion: "referral-stages-1" });
    expect(parsed.inputs).toEqual(REFERRAL_ACTIVE.inputs);
    expect(parsed.cards).toEqual(REFERRAL_ACTIVE.cards);
    expect(parsed.update).toEqual(REFERRAL_ACTIVE.update);
    expect(parsed.relationship).toEqual(REFERRAL_ACTIVE.relationship);
    expect(parsed.rationale).toEqual(REFERRAL_ACTIVE.rationale);
    expect(caseProblems(REFERRAL_ACTIVE)).toEqual([]);
  });

  it("ships with its sign-off empty, can't be published without it, and “Publish anyway” doesn’t cover it", () => {
    expect(Object.values(REFERRAL_ACTIVE.approval).every((v) => v === "")).toBe(true);
    expect(referralHardProblems(relationships(false), "2026-11-23").join(" ")).toMatch(/record the owner, the referral pathway owner/);
    const c = createGuide(db, jordan, { title: "Maya’s relationships", completion: "confirm", doc: doc(relationships(false)) as never }, now);
    expect(() => publishGuide(db, jordan, c.id, "", now, { allowUnverified: true })).toThrow(/Referral Journey Calculator block needs/);
    expect(() => course()).not.toThrow();
  });

  it("lets an author change the fictional data and see the case check respond (fixture 11)", () => {
    const d = relationships();
    d.inputs.records = d.inputs.records.map((r) => (r.id === "E06" ? { ...r, startedOn: "2026-08-01" } : r));
    expect(caseProblems(d).join(" ")).toMatch(/Enquiry E06: a first service follows an agreement/);
  });

  it("names Maya for the character library, and no referrer, enquiry or older person", () => {
    const named = charactersInBlock({ type: "referral", ...REFERRAL_ACTIVE });
    expect(named.map((p) => [p.name, p.role])).toEqual([["Maya", "other"]]);
  });

  it("gives learners no answer key: likely answers, card feedback, option feedback, levels, flags, outcomes and the debrief stay on the server", () => {
    const c = course();
    const g = readGuide(db, riley, c.slug);
    const b = allBlocks(g.doc).find((x) => x.type === "referral") as unknown as ReferralLabData;
    expect(b.prediction.options.every((x) => !x.likely)).toBe(true);
    expect(b.cards.every((x) => !x.feedback)).toBe(true);
    for (const q of [b.denominator, b.timing, b.choice, b.revise, b.dataPoints, b.followUp])
      expect(q.options.every((x) => !x.feedback && !x.flags.length && !Object.keys(x.levels).length)).toBe(true);
    for (const list of [b.relationship, b.operational]) expect(list.every((x) => !x.feedback && !x.outcome && !x.flags.length)).toBe(true);
    expect(b.explanations.every((x) => !x.feedback && !x.flags.length)).toBe(true);
    expect(b.debrief).toBe("");
    expect(referralForReaders(REFERRAL_ACTIVE).inputs).toEqual(REFERRAL_ACTIVE.inputs);
  });
});

describe("an attempt (fixture 1: end to end, fictional only, private mode optional)", () => {
  it("opens the cards only after the prediction, and sends the debrief only once every step is done", () => {
    const c = course();
    const early = saveReferral(db, riley, c.id, { blockId: "rj", state: { stage: 5 } }, now);
    expect(early.state.stage).toBeLessThanOrEqual(1);
    expect(() => finishReferral(db, riley, c.id, { blockId: "rj", ...STRONG }, now)).toThrow(/Make your prediction first/);
    submitPrediction(db, riley, c.id, { blockId: "rj", prediction: { source: "gp" } }, now);
    expect(() => finishReferral(db, riley, c.id, { blockId: "rj", ...STRONG }, now)).toThrow(/Sort every stage card/);
    workThrough(c.id, riley);
    const v = finishReferral(db, riley, c.id, { blockId: "rj", ...STRONG }, now);
    expect(v.status).toBe("finished");
    expect(v.debrief!.flags).toEqual([]);
    expect(v.debrief!.score).toBe(18);
    expect(v.debrief!.cards.every((x) => x.matches)).toBe(true);
    expect(v.debrief!.relationship.next).toBe("studio");
    expect(v.debrief!.operational.next).toBe("coverage");
    expect(referralState(db, riley, c.id, "rj").debrief).not.toBeNull();
    // Riley has no business access: the article completes without it.
    expect(businessHome(db, riley).access).toBeNull();
  });

  it("puts critical flags above any total: a waiting person counted as lost, mixed cohorts, pressure, a stage assumed from the source", () => {
    const c = course();
    workThrough(c.id, riley, { ...TAGS, "card-1": "allocated" }, { denominator: "calendar", timing: "lost", choice: "persuade" });
    const d = finishReferral(
      db,
      riley,
      c.id,
      {
        blockId: "rj",
        denominator: "calendar",
        timing: "lost",
        choice: "persuade",
        revised: "gp",
        dataPoint: "signed",
        relationship: "drop",
        operational: "none",
        explanation: "rank",
        followUp: "proved",
      },
      now,
    ).debrief!;
    expect(d.flags.map((f) => f.id).sort()).toEqual(
      ["agreementAsStart", "blamedReferrer", "inferredStage", "mixedCohort", "pressure", "rankedSmall", "volumeAsValue", "waitAsLost"].sort(),
    );
    expect(d.score).toBeLessThan(6);
  });

  it("keeps the first answer when the learner tries another interpretation after the return visit", () => {
    const c = course();
    workThrough(c.id, riley);
    const d = finishReferral(db, riley, c.id, { blockId: "rj", ...STRONG, reinterpret: "nurture" }, now).debrief!;
    expect(d.relationship.text).toMatch(/stage explainer/);
    expect(d.followUp).toMatchObject({ changed: true, reinterpreted: expect.stringMatching(/Nurture the community organisation/) });
  });

  it("keeps every attempt, and logs fictional choices, matches, flags and levels only: no words, counts or labels", () => {
    const c = course();
    workThrough(c.id, riley, TAGS, { denominator: "calendar", timing: "open", choice: "respect" });
    saveReferral(db, riley, c.id, { blockId: "rj", state: { denominator: "cohort", timing: "open", choice: "respect" } }, now);
    finishReferral(db, riley, c.id, { blockId: "rj", ...STRONG, reinterpret: "nurture" }, now);
    const again = retryReferral(db, riley, c.id, { blockId: "rj" }, now);
    expect(again.attemptNo).toBe(2);
    expect(again.state.stage).toBe(0);
    const log = events(c.id);
    expect(log.map((e) => e.event)).toEqual(
      expect.arrayContaining([
        "referral_started",
        "prediction_submitted",
        "stage_classified",
        "funnel_opened",
        "view_opened",
        "filter_used",
        "denominator_answered",
        "timing_answered",
        "choice_answered",
        "decision_submitted",
        "followup_answered",
        "referral_completed",
        "retry_started",
      ]),
    );
    const denominators = log.filter((e) => e.event === "denominator_answered").map((e) => JSON.parse(e.detail));
    expect(denominators.map((x) => [x.answer, x.flagged])).toEqual([
      ["calendar", true],
      ["cohort", false],
    ]);
    expect(log.find((e) => e.event === "followup_answered")!.detail).toMatch(/"changed":true/);
    expect(log.filter((e) => e.event === "stage_classified").every((e) => /"matches":true/.test(e.detail))).toBe(true);
    expect(JSON.parse(log.find((e) => e.event === "referral_completed")!.detail)).toMatchObject({ story: "referral-active-1", model: "referral-journey-1" });
    const text = log.map((e) => e.detail).join(" ");
    expect(text).not.toMatch(/Maya|Banksia Rise|Toowoomba|26,720|practice nurse|enquiries|"hours"/);
    expect(referralStats(db, jordan, c.id).blocks[0]).toMatchObject({ attempts: 2, people: 1, finished: 1, suppressed: true, dims: null, misread: null });
    expect(() => referralStats(db, riley, c.id)).toThrow();
  });
});

describe("Review my relationships (fixture 10)", () => {
  const filled = () => {
    const i = blankInputs("2026-09-30");
    const r = zeroBlanks(blankRow("row-1", "2026-04"));
    i.minSample = 5;
    i.rows = [
      {
        ...r,
        label: "GP practice A",
        enquiries: 12,
        stages: { ...r.stages, allocated: 8, waiting: 4 },
        introduced: 12,
        pathway: 8,
        agreed: 6,
        started: 6,
        open: 6,
        bands: { ...r.bands, d15_30: 6 },
        matureStarts: 5,
        active: 4,
      },
    ];
    return i;
  };

  it("is only for the business owner and the members they authorise", () => {
    expect(businessHome(db, casey).access).toMatchObject({ orgName: expect.any(String), role: "owner" });
    expect(businessHome(db, sam)).toEqual({ access: null, reviews: [] });
    expect(() => saveReview(db, sam, { name: "Mine", inputs: blankInputs("2026-11-23") }, now)).toThrow(/business owner/);
  });

  it("saves numbered versions of aggregate cohorts only, keeps blanks as blanks, and returns the version before", () => {
    const v1 = saveReview(db, casey, { name: "Spring", inputs: blankInputs("2026-09-30") }, now);
    expect(v1.version).toBe(1);
    expect(v1.inputs.rows[0].enquiries).toBeNull();
    expect(v1.versions[0].snapshot).toMatchObject({ incomplete: expect.any(Number) });
    // Individual rows never reach a private review: it's the manual aggregate grid.
    const v2 = saveReview(
      db,
      casey,
      {
        id: v1.id,
        inputs: { ...filled(), mode: "records", records: REFERRAL_ACTIVE.inputs.records },
        review: { relationshipAction: "Share a stage explainer", relationshipOwner: "Principal", next: "studio", reviewBy: "2026-12-31" },
      },
      now,
    );
    expect(v2.version).toBe(2);
    expect(v2.inputs.mode).toBe("aggregate");
    expect(v2.inputs.records).toEqual([]);
    expect(v2.versions[1].snapshot).toEqual({ sources: 1, enquiries: 12, starts: 6, open: 6, tooEarly: 0 });
    expect(v2.review).toMatchObject({ relationshipAction: "Share a stage explainer", next: "studio", reviewBy: "2026-12-31" });
    expect(v2.previous).toMatchObject({ number: 1 });
    expect(v2.previous!.inputs.rows[0].enquiries).toBeNull();
    expect(getReview(db, casey, v1.id, 1).inputs.rows[0].enquiries).toBeNull();
    expect(businessHome(db, casey).reviews).toHaveLength(1);
  });

  it("can't be read by anyone outside the business, whatever id they ask for, and never reaches the authors' totals", () => {
    const p = saveReview(db, casey, { name: "Spring", inputs: filled() }, now);
    expect(() => getReview(db, sam, p.id)).toThrow(/business owner/);
    // The author and superadmin, without planner access to that business, gets nothing either.
    expect(() => getReview(db, jordan, p.id)).toThrow();
    // An owner of another business, with access of their own, still can't reach it.
    db.prepare("INSERT INTO business_planner_access (org_id, user_id, grant_role, granted_by, granted_at) VALUES (?, ?, 'owner', 'test', ?)").run(
      riley.org_id,
      riley.id,
      now.toISOString(),
    );
    expect(riley.org_id).not.toBe(casey.org_id);
    expect(() => getReview(db, riley, p.id)).toThrow(/isn’t here/);
    expect(() => saveReview(db, riley, { id: p.id, inputs: blankInputs("2026-11-23") }, now)).toThrow(/isn’t here/);
    expect(businessHome(db, riley).reviews).toEqual([]);
    const c = course();
    expect(referralStats(db, jordan, c.id).blocks).toEqual([]);
  });

  it("notes a review saved or reopened from an article in the activity log, with no figure, label or note", () => {
    const c = course();
    const p = saveReview(db, casey, { name: "Spring", inputs: filled(), review: { notes: "Met the practice nurse" }, guideId: c.id, blockId: "rj" }, now);
    getReview(db, casey, p.id, undefined, { guideId: c.id, blockId: "rj" }, now);
    const log = events(c.id).filter((e) => e.event.startsWith("review_"));
    expect(log.map((e) => e.event)).toEqual(["review_saved", "review_returned"]);
    expect(log.map((e) => e.detail).join(" ")).not.toMatch(/GP practice A|Spring|practice nurse|12/);
  });
});
