import { beforeEach, describe, expect, it } from "vitest";
import { openDb, type Db } from "./db";
import { userById, type User } from "./auth";
import { createGuide, publishGuide, readGuide } from "./magazine";
import { publishChecks } from "@/lib/magazine";
import { aggregate, batchCutoff, cohortOf, freshBenchmark, peerReasoning, sampleVotes, versionKey, type BenchmarkBlockData, type Vote } from "@/lib/benchmark";
import { BENCHMARK_CASES } from "@/content/benchmarkCases";
import { members, posts } from "@/content/community";
import { benchmarkResults, benchmarkState, benchmarkStats, lockBenchmark, reflectBenchmark } from "./benchmark";

/* Peer benchmark poll: lock first, one vote per version, privacy-safe cohorts, and the reviewed key never bends to the vote. */

let db: Db;
let jordan: User, riley: User, sam: User;
const now = new Date("2026-11-20T00:07:00Z");
const SIGNED = { owner: "Learning", operations: "Care Operations", clinical: "Clinical", quality: "Quality", privacy: "Privacy", approvedOn: "2026-11-20" };
const seed = () => BENCHMARK_CASES[0].data;
const signed = (): BenchmarkBlockData => ({
  ...seed(),
  approval: SIGNED,
  policy: { ...seed().policy, title: "Unsuccessful contact procedure", version: "3" },
  reviewDue: "2027-05-19",
});
const pages = (data: BenchmarkBlockData) => [
  {
    id: "p1",
    title: "Poll",
    purpose: "",
    template: "blank",
    kind: "content",
    required: true,
    allActivities: false,
    sections: [{ id: "s1", title: "Case", blocks: [{ id: "pb", type: "benchmark", ...data }] }],
  },
];
const blocking = (data: BenchmarkBlockData) => publishChecks({ schema: 2, pages: pages(data) } as never, "confirm").blocking;
function course(data: BenchmarkBlockData) {
  const c = createGuide(db, jordan, { title: "Pulse", completion: "confirm", doc: { schema: 2, pages: pages(data) } }, now);
  publishGuide(db, jordan, c.id, "", now);
  return c;
}
/** Extra learners with a given verified role, to fill a cohort. */
function people(n: number, audience: "partner" | "coordinator" | "staff", tag: string) {
  const ins = db.prepare("INSERT INTO users (id, name, email, org_id, role, audience) VALUES (?, ?, ?, ?, 'learner', ?)");
  return Array.from({ length: n }, (_, i) => {
    const id = `${tag}${i}`;
    ins.run(id, `Test ${id}`, `${id}@example.test`, riley.org_id, audience);
    return userById(db, id)!;
  });
}
const vote = (u: User, guideId: string, choice: string, at = now) => lockBenchmark(db, u, guideId, { blockId: "pb", choice }, at);

beforeEach(() => {
  db = openDb(":memory:");
  [jordan, riley, sam] = ["jordan", "riley", "sam"].map((id) => userById(db, id)!);
});

describe("the poll an author publishes", () => {
  it("can't be published without sign-off, or past its review date, even with Publish anyway", () => {
    expect(blocking(seed()).join(" ")).toMatch(/sign-off is required/);
    expect(blocking(signed())).toEqual([]);
    const draft = createGuide(db, jordan, { title: "Draft", completion: "confirm", doc: { schema: 2, pages: pages(seed()) } }, now);
    expect(() => publishGuide(db, jordan, draft.id, "", now, { allowUnverified: true })).toThrow(/peer benchmark poll needs its sign-off/);
    const old = createGuide(
      db,
      jordan,
      { title: "Old", completion: "confirm", doc: { schema: 2, pages: pages({ ...signed(), reviewDue: "2026-11-01" }) } },
      now,
    );
    expect(() => publishGuide(db, jordan, old.id, "", now, { allowUnverified: true })).toThrow(/current review date/);
  });

  it("never counts anyone twice, and keeps the disclosure threshold at ten or more", () => {
    const b = structuredClone(signed());
    b.cohorts[1].audiences = ["partner"];
    expect(blocking(b).join(" ")).toMatch(/Care Partners are in more than one cohort/);
    const low = { ...signed(), minCohort: 3 };
    const c = createGuide(db, jordan, { title: "Low", completion: "confirm", doc: { schema: 2, pages: pages(low) } }, now);
    const parsed = c.doc.pages[0].sections[0].blocks[0] as unknown as BenchmarkBlockData;
    expect(parsed.minCohort).toBe(10);
  });

  it("needs a reviewed next step, and never teaches a fixed missed-call rule", () => {
    const b = structuredClone(signed());
    for (const c of b.choices) if (c.kind === "preferred") c.kind = "defensible";
    expect(blocking(b).join(" ")).toMatch(/reviewed next step/);
    expect(JSON.stringify(seed())).not.toMatch(/two missed calls (means|always|is the threshold)/i);
    expect(seed().perspective.thresholds).toMatch(/new acute concern/);
  });

  it("keeps how each choice reads, and the reviewed perspective, off the learner's page", () => {
    const c = course(signed());
    const page = JSON.stringify(readGuide(db, riley, c.slug));
    expect(page).toContain("Record the daughter’s reassurance as confirmation");
    for (const secret of ["doesn’t confirm contact today", "Her “he’s fine” is four days old", '"kind":"preferred"', '"kind":"critical"'])
      expect(page).not.toContain(secret);
  });

  it("gives a copy fresh ids, and a changed choice set a new version key", () => {
    const a = freshBenchmark(seed(), "aaaaa");
    expect(a.choices[0].id).toBe("pc-close-xaaaaa");
    expect(versionKey(signed())).toBe(versionKey(structuredClone(signed())));
    const edited = structuredClone(signed());
    edited.choices[0].text = "Something else";
    expect(versionKey(edited)).not.toBe(versionKey(signed()));
    expect(versionKey({ ...signed(), policy: { ...signed().policy, version: "4" } })).not.toBe(versionKey(signed()));
    expect(versionKey({ ...signed(), version: 2 })).toMatch(/^v2-/);
  });
});

describe("results", () => {
  const b = () => signed();
  const v = (choice: string, cohort: string, n: number): Vote[] => Array.from({ length: n }, () => ({ choice, cohort }));

  it("shows nothing until a group reaches the threshold", () => {
    const r = aggregate(b(), v("pc-verify", "pc-partners", 5), "t");
    expect(r).toMatchObject({ empty: true, total: null });
    expect(r.groups.every((g) => !g.shown && g.n === null && g.rows.length === 0)).toBe(true);
  });

  it("hides a small cohort, and the total that would let it be worked out", () => {
    const r = aggregate(b(), [...v("pc-verify", "pc-partners", 30), ...v("pc-close", "pc-coordinators", 4)], "t");
    expect(r.groups.find((g) => g.id === "pc-partners")).toMatchObject({ shown: true, n: 30 });
    expect(r.groups.find((g) => g.id === "pc-coordinators")).toMatchObject({ shown: false, n: null, rows: [] });
    expect(r.total).toBeNull();
    expect(r.groups[0]).toMatchObject({ id: "all", shown: false });
  });

  it("shows everything with enough in every group, as counts and percentages", () => {
    const r = aggregate(b(), [...v("pc-verify", "pc-partners", 27), ...v("pc-close", "pc-partners", 3), ...v("pc-verify", "pc-coordinators", 20)], "t");
    expect(r.total).toBe(50);
    expect(r.groups[0].rows.find((x) => x.choiceId === "pc-verify")).toMatchObject({ count: 47, pct: 94 });
    // Votes from roles outside every cohort count in "All" only, and only when there are enough of them too.
    const staff = aggregate(b(), [...v("pc-verify", "pc-partners", 25), ...v("pc-verify", "", 3)], "t");
    expect(staff.total).toBeNull();
  });

  it("uses the verified role for the cohort, and batches by time", () => {
    expect(cohortOf(b(), "partner")).toBe("pc-partners");
    expect(cohortOf(b(), "staff")).toBe("");
    expect(batchCutoff(new Date("2026-11-20T10:29:59Z"), 15).toISOString()).toBe("2026-11-20T10:15:00.000Z");
  });

  it("previews with a labelled sample that shows the small-cohort case", () => {
    const small = aggregate(b(), sampleVotes(b(), "small"), "t");
    expect(small.groups.map((g) => g.shown)).toEqual([false, true, false]);
    expect(aggregate(b(), sampleVotes(b(), "enough"), "t").total).toBe(91);
    expect(sampleVotes(b(), "empty")).toEqual([]);
  });

  it("orders peer reasoning by likes, endorses only when recorded, and drops a withdrawn thread", () => {
    const r = peerReasoning(b(), posts, members, new Set());
    expect(r.reasons.map((x) => x.commentId)).toEqual(["mci1", "mci2"]);
    expect(r.reasons.every((x) => x.endorsedBy === "")).toBe(true);
    const e = structuredClone(b());
    e.community.rationales[1] = { commentId: "mci2", endorsedBy: "Clinical lead", endorsedOn: "2026-11-20" };
    expect(peerReasoning(e, posts, members, new Set()).reasons[1].endorsedBy).toBe("Clinical lead");
    expect(peerReasoning(b(), posts, members, new Set(["case-missed-check-in"]))).toEqual({ thread: null, reasons: [] });
  });
});

describe("locking and results through the server", () => {
  it("reveals nothing until the lock, keeps the first lock, and never adds a second vote", () => {
    const c = course(signed());
    const before = benchmarkState(db, riley, c.id, "pb", now);
    expect(before).toMatchObject({ locked: null, reading: null, perspective: null, peers: { reasons: [] } });
    expect(() => benchmarkResults(db, riley, c.id, "pb", now)).toThrow(/Lock in your decision/);
    expect(() => lockBenchmark(db, riley, c.id, { blockId: "pb", choice: "nope" }, now)).toThrow(/Choose one/);

    const first = lockBenchmark(db, riley, c.id, { blockId: "pb", choice: "pc-close", confidence: "high", reason: "She said he’s fine." }, now);
    expect(first).toMatchObject({ already: false, locked: { choice: "pc-close", confidence: "high" }, reading: { kind: "critical" } });
    expect(first.perspective?.reasoning).toMatch(/doesn’t confirm contact today/);
    expect(first.peers.reasons).toHaveLength(2);
    const again = lockBenchmark(db, riley, c.id, { blockId: "pb", choice: "pc-verify" }, now);
    expect(again).toMatchObject({ already: true, locked: { choice: "pc-close" } });
    expect(db.prepare("SELECT COUNT(*) n FROM benchmark_votes").get()).toEqual({ n: 1 });

    reflectBenchmark(db, riley, c.id, { blockId: "pb", reflection: "If a worker found nobody home." }, now);
    expect(benchmarkState(db, riley, c.id, "pb", now).locked).toMatchObject({ choice: "pc-close", reflection: "If a worker found nobody home." });
    // The event says a decision was locked, never which one or why.
    const ev = db.prepare("SELECT detail FROM magazine_events WHERE event = 'benchmark.locked'").get() as { detail: string };
    expect(ev.detail).not.toMatch(/pc-close|fine|high/);
  });

  it("routes a critical choice to the reviewed teaching point even when most peers chose it", () => {
    const c = course(signed());
    const early = new Date("2026-11-19T00:00:00Z");
    for (const u of people(25, "partner", "p")) vote(u, c.id, "pc-close", early);
    const out = vote(riley, c.id, "pc-close");
    const r = benchmarkResults(db, riley, c.id, "pb", now);
    expect(r.results?.groups.find((g) => g.id === "pc-partners")?.rows.find((x) => x.choiceId === "pc-close")?.pct).toBe(100);
    expect(out.reading).toMatchObject({ kind: "critical", label: "Needs a debrief" });
  });

  it("counts by verified role in batches, leaves authors out, and suppresses small groups", () => {
    const c = course(signed());
    const early = new Date("2026-11-19T00:00:00Z");
    for (const u of people(22, "partner", "p")) vote(u, c.id, "pc-verify", early);
    for (const u of people(4, "coordinator", "k")) vote(u, c.id, "pc-welfare", early);
    vote(jordan, c.id, "pc-wait", early);
    vote(sam, c.id, "pc-verify", early);
    // Riley locks now: their vote waits for the next batch.
    vote(riley, c.id, "pc-verify");
    const r = benchmarkResults(db, riley, c.id, "pb", now).results!;
    expect(r.asOf).toBe("2026-11-20T00:00:00.000Z");
    expect(r.groups.find((g) => g.id === "pc-partners")).toMatchObject({ shown: true, n: 23 });
    expect(r.groups.find((g) => g.id === "pc-coordinators")).toMatchObject({ shown: false, n: null });
    expect(r.total).toBeNull();
    expect(r.groups[0].rows.some((x) => x.choiceId === "pc-wait" && x.count > 0)).toBe(false);

    const later = new Date("2026-11-20T00:20:00Z");
    expect(benchmarkResults(db, riley, c.id, "pb", later).results!.groups.find((g) => g.id === "pc-coordinators")?.n).toBeNull();
    const stats = benchmarkStats(db, jordan, c.id, "pb", later);
    // Riley (a coordinator) is in this batch now; the coordinators are still too few to show.
    expect(stats.results.groups.find((g) => g.id === "pc-partners")?.n).toBe(23);
    expect(stats.results.groups.find((g) => g.id === "pc-coordinators")?.n).toBeNull();
    expect(() => benchmarkStats(db, riley, c.id, "pb", later)).toThrow();
  });

  it("keeps a changed version's votes apart, and pauses guidance and results past the review date", () => {
    const c = course(signed());
    vote(riley, c.id, "pc-verify");
    const v2 = { ...signed(), version: 2 };
    db.prepare("UPDATE magazine_guides SET status = status WHERE id = ?").run(c.id);
    const c2 = createGuide(db, jordan, { title: "Pulse v2", completion: "confirm", doc: { schema: 2, pages: pages(v2) } }, now);
    publishGuide(db, jordan, c2.id, "", now);
    expect(benchmarkState(db, riley, c2.id, "pb", now).locked).toBeNull();

    const stale = new Date("2027-06-01T00:00:00Z");
    const s = benchmarkState(db, riley, c.id, "pb", stale);
    expect(s).toMatchObject({ paused: true, reading: null, perspective: null, locked: { choice: "pc-verify" } });
    expect(benchmarkResults(db, riley, c.id, "pb", stale)).toMatchObject({ paused: true, results: null });
  });
});
