import { beforeEach, describe, expect, it } from "vitest";
import { unzipSync, strFromU8 } from "fflate";
import { openDb, type Db } from "./db";
import { userById, type User } from "./auth";
import { readGuideDoc, type PracticeItem } from "@/lib/magazine";
import { itemVersion } from "@/lib/magazineReview";
import { pageSnapshot } from "@/lib/magazineNarration";
import { approvalBlock, excelSafe } from "@/lib/questionPool";
import { createGuide, publishGuide, readGuide, saveGuideDraft } from "./magazine";
import { startPractice } from "./magazinePractice";
import {
  coverage,
  listPool,
  poolUser,
  publishPreflight,
  questionDetail,
  reviewQuestion,
  saveExternal,
  saveSource,
  setEnforce,
  supersedeSource,
  syncPool,
  updateQuestion,
} from "./questionPool";
import { questionsInGuide } from "@/lib/questionPool";
import { exportPool } from "./questionPoolExport";

/* The Question Pool: one id per question, a version per wording, approval per version. */

let db: Db;
let owner: User, sme: User, compliance: User, learner: User;
const now = new Date("2026-11-20T00:00:00Z");
const later = (mins: number) => new Date(now.getTime() + mins * 60_000);

const decision = (prompt = "A client offers you $20 for petrol. What do you do?") => ({
  id: "dec",
  type: "decision",
  prompt,
  choices: [
    { id: "a", text: "Decline politely and let Trilogy Care know", verdict: "best", feedback: "Right." },
    { id: "b", text: "Accept it, it's only small", verdict: "risky", feedback: "Gifts and tips aren't accepted." },
  ],
});
const pages = (blocks: unknown[]) => [
  { id: "p1", title: "Boundaries", purpose: "", template: "blank", kind: "content", required: true, allActivities: false, sections: [{ id: "s1", title: "S", blocks }] },
];
const text = { id: "t", type: "text", body: "Never accept gifts or tips. Decline politely and let Trilogy Care know." };

function course(blocks: unknown[] = [text, decision()], extra: object = {}) {
  const c = createGuide(db, owner, { title: "Pool course", completion: "confirm", doc: { schema: 2, pages: pages(blocks), ...extra } }, now);
  publishGuide(db, owner, c.id, "", now, { allowUnverified: true });
  return c;
}
const idFor = (key: string) => (db.prepare("SELECT id FROM pool_questions WHERE origin_key = ?").get(key) as { id: string }).id;

beforeEach(() => {
  db = openDb(":memory:");
  owner = userById(db, "jordan")!;
  sme = userById(db, "dana")!;
  compliance = userById(db, "morgan")!;
  learner = userById(db, "riley")!;
});

describe("reconciling the pool with the Hub's content", () => {
  it("gives every live question a stable id, approved at set-up and marked for a first review; running it again changes nothing", () => {
    course();
    // Publishing the course was the first reconciliation (the cutover): what was live then is recorded as approved.
    const first = syncPool(db, owner, now);
    expect(coverage(db, owner, now).cutover).toBe(now.toISOString());
    expect(first.pool.questions).toBeGreaterThan(1);
    expect(first.found.bySurface["topic-quiz"].live).toBeGreaterThan(0);
    expect(first.exceptions.liveUnapproved).toBe(0);
    const again = syncPool(db, owner, later(1));
    expect(again).toMatchObject({ cutover: false, newQuestions: 0, newVersions: 0, withdrawn: 0, pool: first.pool });
    const q = questionDetail(db, owner, idFor("magazine:" + (db.prepare("SELECT id FROM magazine_guides WHERE title = 'Pool course'").get() as { id: string }).id + ":dec"));
    expect(q).toMatchObject({ status: "approved", unreviewed: true, liveUses: 1, kind: "decision" });
    expect(q.versions[0]).toMatchObject({ version: 1, migrated: true, live: true });
    expect(q.placements[0]).toMatchObject({ surface: "magazine-decision", release: "Edition 1", live: true, current: true });
  });

  it("makes an edit a new draft version, leaves the approved one alone, and counts a publish without approval as an exception", () => {
    const c = course();
    syncPool(db, owner, now);
    const id = idFor(`magazine:${c.id}:dec`);
    saveGuideDraft(db, owner, c.id, { doc: { schema: 2, pages: pages([text, decision("A client offers you $50. What do you do?")]) } }, later(1));
    syncPool(db, owner, later(2));
    let q = questionDetail(db, owner, id);
    expect(q).toMatchObject({ status: "draft", currentVersion: 2, approvedVersion: 1, liveUnapproved: false });
    expect(q.versions.map((v) => [v.version, v.status, v.live])).toEqual([
      [2, "draft", false],
      [1, "approved", true],
    ]);
    // The preflight names it; with "require approval" on, publishing waits.
    const draft = readGuideDoc({ schema: 2, pages: pages([text, decision("A client offers you $50. What do you do?")]) }, { draft: true });
    expect(publishPreflight(db, questionsInGuide({ id: c.id, title: "", audience: "" }, draft, "next", true))[0].problem).toMatch(/changes that aren’t approved/);
    setEnforce(db, owner, true, later(2));
    expect(() => publishGuide(db, owner, c.id, "", later(3), { allowUnverified: true })).toThrow(/1 question isn’t approved in the Question Pool/);
    setEnforce(db, owner, false, later(2));
    // Off (the default): it publishes, and shows as live without approval.
    publishGuide(db, owner, c.id, "", later(3), { allowUnverified: true });
    q = questionDetail(db, owner, id);
    expect(q).toMatchObject({ liveUnapproved: true, status: "draft" });
    expect(q.placements.filter((p) => p.live).map((p) => [p.version, p.release, p.current])).toEqual([
      [2, "Edition 2", true],
      [1, "Edition 1", false],
    ]);
    expect(coverage(db, owner, later(4)).exceptions.map((e) => e.id)).toContain(id);
    // Changing it back withdraws nothing live, and a draft wording that's gone is withdrawn.
    saveGuideDraft(db, owner, c.id, { doc: { schema: 2, pages: pages([text, decision("A third wording of the same question, for now?")]) } }, later(5));
    syncPool(db, owner, later(6));
    saveGuideDraft(db, owner, c.id, { doc: { schema: 2, pages: pages([text, decision("A client offers you $50. What do you do?")]) } }, later(7));
    expect(syncPool(db, owner, later(8)).withdrawn).toBe(1);
  });
});

describe("review", () => {
  it("is earned per version: submit, then a reviewer approves; a plain author can't", () => {
    const c = course();
    syncPool(db, owner, now);
    const id = idFor(`magazine:${c.id}:dec`);
    saveGuideDraft(db, owner, c.id, { doc: { schema: 2, pages: pages([text, decision("A client offers you $50. What do you do?")]) } }, later(1));
    syncPool(db, owner, later(2));
    expect(() => reviewQuestion(db, sme, id, { action: "approve" }, later(3))).toThrow(/draft version can’t be approve/);
    reviewQuestion(db, owner, id, { action: "submit" }, later(3));
    expect(approvalBlock({ id: "x", canAuthor: true, superadmin: false, reviewRole: null }, "standard", null)).toMatch(/needs a review role/);
    const q = reviewQuestion(db, sme, id, { action: "approve", note: "Checked against the Code." }, later(4));
    expect(q).toMatchObject({ status: "approved", approvedVersion: 2, unreviewed: false });
    expect(q.versions[0]).toMatchObject({ approvedBy: sme.name, migrated: false });
    expect(q.events.map((e) => e.action)).toEqual(expect.arrayContaining(["submit", "approve", "migrated", "new_version"]));
    expect(() => reviewQuestion(db, learner, id, { action: "flag", note: "x" }, later(5))).toThrow();
  });

  it("holds a high-risk question to Quality and Compliance or the Hub owner, a second person, and a recorded source", () => {
    const c = course();
    syncPool(db, owner, now);
    const id = idFor(`magazine:${c.id}:dec`);
    // Marking it high-risk asks for another look at what was approved.
    expect(updateQuestion(db, owner, id, { risk: "high", owner: owner.id }, later(1))).toMatchObject({ risk: "high", status: "needs_review" });
    expect(() => reviewQuestion(db, sme, id, { action: "approve" }, later(2))).toThrow(/Quality and Compliance or the Hub owner/);
    expect(() => reviewQuestion(db, compliance, id, { action: "approve" }, later(2))).toThrow(/needs its source recorded/);
    const { id: src } = saveSource(db, owner, { title: "Code of Conduct for Aged Care", url: "https://www.agedcarequality.gov.au/for-providers/code-conduct", effective: "2022-12-01" }, later(2));
    updateQuestion(db, owner, id, { sourceId: src, sourceRef: "Part 1(d)" }, later(3));
    expect(reviewQuestion(db, compliance, id, { action: "approve" }, later(4))).toMatchObject({ status: "approved", unreviewed: false });
    expect(approvalBlock(poolUser(db, owner), "high", owner.id)).toMatch(/second person/);
    // The source is replaced: everything approved on it is flagged, with what it touches.
    expect(supersedeSource(db, owner, { id: src, note: "New Act." }, later(5))).toMatchObject({ questions: 1, flagged: 1, live: 1 });
    expect(questionDetail(db, owner, id)).toMatchObject({ status: "needs_review", impact: { placements: 1 } });
    expect(listPool(db, owner, { view: "needs-review", risk: "high" }, later(6)).rows.map((r) => r.id)).toEqual([id]);
  });

  it("stops a flagged self-review question being served, whatever the course says", () => {
    const base = readGuideDoc({ schema: 2, pages: pages([text]) }, { draft: true });
    const item = (id: string): PracticeItem => {
      const it: PracticeItem = {
        id,
        kind: "scenario",
        pageId: "p1",
        prompt: `Practice question ${id}: what do you do when offered a gift?`,
        choices: [
          { id: "a", text: "Decline" },
          { id: "b", text: "Accept" },
          { id: "c", text: "Hide it" },
        ],
        answer: "a",
        explanation: "Decline and report.",
        status: "approved",
      };
      return { ...it, basis: pageSnapshot(base.pages[0]), approved: { by: "Jordan Lee", at: now.toISOString(), version: itemVersion(it) } };
    };
    const c = course([text], { review: { enabled: true, items: [item("q1"), item("q2")] } });
    syncPool(db, owner, now);
    const g = readGuide(db, learner, c.slug);
    expect(startPractice(db, learner, c.id, { revisionId: g.revisionId, scope: "page", pageId: "p1" }, now).total).toBe(2);
    const id = idFor(`practice:${c.id}:q1`);
    expect(questionDetail(db, owner, id)).toMatchObject({ status: "approved", unreviewed: false, practiceOnly: true });
    reviewQuestion(db, owner, id, { action: "flag", note: "A learner reported the answer is out of date." }, later(1));
    const s = startPractice(db, learner, c.id, { revisionId: g.revisionId, scope: "page", pageId: "p1" }, later(2));
    expect(s.questions.map((q) => q.id)).toEqual(["q2"]);
  });
});

describe("self-review questions that aren't being asked", () => {
  it("are drafts in the pool, even inside a published edition: never approved just for being there", () => {
    const draftItem = {
      id: "q1",
      kind: "scenario",
      pageId: "p1",
      prompt: "A draft practice question nobody has approved yet, about gifts?",
      choices: [
        { id: "a", text: "Decline" },
        { id: "b", text: "Accept" },
        { id: "c", text: "Hide it" },
      ],
      answer: "a",
      explanation: "Decline and report.",
      status: "draft",
    };
    // Published with self-review off and the question unapproved: this is also the pool's set-up run.
    const c = course([text], { review: { enabled: false, items: [draftItem] } });
    const q = questionDetail(db, owner, idFor(`practice:${c.id}:q1`));
    expect(q).toMatchObject({ status: "draft", liveUses: 0, approvedVersion: null, unreviewed: false, liveUnapproved: false });
    expect(q.versions[0]).toMatchObject({ migrated: false, live: false });
  });
});

describe("the table and the export", () => {
  it("filters, sorts and counts across the whole result, and the export follows the same filters", () => {
    const c = course();
    syncPool(db, owner, now);
    const id = idFor(`magazine:${c.id}:dec`);
    const all = listPool(db, owner, {}, now);
    expect(all.total).toBe(all.poolSize);
    expect(all.views["first-review"]).toBe(all.poolSize);
    const found = listPool(db, owner, { q: "petrol offers", surface: "magazine-decision", sort: "title", dir: "desc" }, now);
    expect(found.rows.map((r) => r.id)).toEqual([id]);
    expect(listPool(db, owner, { q: "no such words anywhere" }, now).total).toBe(0);
    const sorted = listPool(db, owner, { sort: "id", dir: "desc" }, now).rows.map((r) => r.id);
    expect(sorted).toEqual([...sorted].sort().reverse());
    expect(() => listPool(db, learner, {}, now)).toThrow();

    const out = exportPool(db, sme, { q: "petrol offers", surface: "magazine-decision" }, { keys: true, versions: false }, later(1));
    expect(out).toMatchObject({ keys: true, total: 1 });
    expect(out.filename).toMatch(/CONFIDENTIAL/);
    const files = unzipSync(new Uint8Array(out.buffer));
    const sheet = (n: number) => strFromU8(files[`xl/worksheets/sheet${n}.xml`]);
    expect(strFromU8(files["xl/workbook.xml"])).toMatch(/Read me.*Questions.*Options and feedback.*Placements.*Review history.*External SCORM/);
    expect(sheet(1)).toMatch(/CONFIDENTIAL: contains assessment answers/);
    expect(sheet(2)).toContain(id);
    expect(sheet(3)).toMatch(/Decline politely and let Trilogy Care know.*Correct \(best answer\)/);
    expect(sheet(4)).toMatch(/Magazine decision.*Edition 1.*Published.*Current/);
    // No formulas anywhere, and nothing about learners.
    expect(sheet(2)).not.toMatch(/<f>/);
    expect(JSON.stringify(Object.keys(files))).not.toMatch(/sharedStrings/);
    expect(excelSafe("=HYPERLINK(1)")).toBe("'=HYPERLINK(1)");
    expect((db.prepare("SELECT COUNT(*) AS n FROM audit WHERE event = 'pool.exported'").get() as { n: number }).n).toBe(1);
    // An author without a review role gets the inventory without the answers.
    db.prepare("UPDATE users SET review_role = NULL, superadmin = 0 WHERE id = ?").run(sme.id);
    const plain = exportPool(db, userById(db, sme.id)!, { q: "petrol offers", surface: "magazine-decision" }, { keys: true, versions: true }, later(2));
    expect(plain.keys).toBe(false);
    expect(strFromU8(unzipSync(new Uint8Array(plain.buffer))["xl/worksheets/sheet3.xml"])).not.toMatch(/Decline politely/);
  });

  it("records how far an imported SCORM course's questions are known, never a guessed count", () => {
    const c = coverage(db, owner, now);
    expect(c.bySurface.find((s) => s.surface === "topic-quiz")!.questions).toBeGreaterThan(0);
    expect(c.notCovered.length).toBeGreaterThan(0);
    db.prepare("INSERT INTO scorm_packages (id, identifier, standard, created_by, created_at) VALUES ('pk', 'x', 'scorm12', ?, ?)").run(owner.id, now.toISOString());
    db.prepare(
      "INSERT INTO scorm_package_versions (id, package_id, version, title, identifier, standard, edition, launch_href, file_count, bytes, zip_bytes, zip_sha256, report, uploaded_by, uploaded_at) VALUES ('pv', 'pk', 1, 'T', 'x', 'scorm12', '', 'i.html', 1, 1, 1, 'h', '{\"fileName\":\"t.zip\"}', ?, ?)",
    ).run(owner.id, now.toISOString());
    db.prepare("INSERT INTO scorm_courses (id, package_id, title, description, status, version_id, created_by, created_at, updated_by, updated_at) VALUES ('crs', 'pk', 'Manual handling', '', 'published', 'pv', ?, ?, ?, ?)").run(
      owner.id,
      now.toISOString(),
      owner.id,
      now.toISOString(),
    );
    expect(coverage(db, owner, now).external[0]).toMatchObject({ coverage: "unavailable", questionCount: null, file: "t.zip" });
    expect(saveExternal(db, owner, { courseId: "crs", coverage: "unavailable", questionCount: 12 }, now).external[0].questionCount).toBeNull();
    expect(saveExternal(db, owner, { courseId: "crs", coverage: "supplied", questionCount: 12, hasAssessment: "yes", owner: "Quality" }, now).external[0]).toMatchObject({
      coverage: "supplied",
      questionCount: 12,
      hasAssessment: "yes",
    });
  });
});
