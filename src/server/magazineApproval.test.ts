import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { openDb, type Db } from "./db";
import { userById, type User } from "./auth";
import { createGuide, readGuide, saveGuideDraft } from "./magazine";
import { approvalFor, decide, publishCourse, signOff, skipAiReview, submit, withdraw } from "./magazineApproval";

/* A Magazine course's review and sign-off, mirroring topics: submit, AI pre-review, sign off flagged items, approve, publish. */

let db: Db;
let author: User, sme: User, compliance: User;
const now = new Date("2026-11-19T00:00:00Z");

beforeEach(() => {
  db = openDb(":memory:");
  author = userById(db, "jordan")!;
  sme = userById(db, "dana")!;
  compliance = userById(db, "morgan")!;
});
afterEach(() => vi.unstubAllEnvs());

const doc = (blocks: unknown[]) => ({
  schema: 2,
  pages: [{ id: "p1", title: "", purpose: "", template: "blank", kind: "content", required: true, sections: [{ id: "one", title: "One", blocks }] }],
});
const flagged = doc([
  { id: "t1", type: "text", body: "Call the incident line.", flag: { kind: "verify", note: "TC to confirm: the incident line." } },
  { id: "t2", type: "text", body: "Report it the same day.", flag: { kind: "verify", note: "TC to confirm: the reporting steps." } },
  { id: "t3", type: "text", body: "Plain words." },
]);
const course = () => createGuide(db, author, { title: "Incidents", completion: "confirm", audience: ["partner"], doc: flagged }, now).id;
/** Submitted to the SME, with the AI pre-review skipped. */
function submitted(id: string, opts: { compliance?: boolean } = {}) {
  submit(db, author, id, { reviewer: "dana", compliance: opts.compliance ?? false, note: "Please check the contacts." }, now);
  return skipAiReview(db, author, id, "Claude isn’t connected here.", now);
}

describe("reviewing a course", () => {
  it("goes to a reviewer, who signs off each flagged item before approving", () => {
    const id = course();
    expect(approvalFor(db, author, id)).toMatchObject({
      stage: "draft",
      flags: [
        { blockId: "t1", signoff: null },
        { blockId: "t2", signoff: null },
      ],
    });
    expect(() => submit(db, author, id, { reviewer: "jordan" }, now)).toThrow(/someone else/);
    submit(db, author, id, { reviewer: "dana" }, now);
    // The AI pre-review comes first.
    expect(approvalFor(db, sme, id).you).toMatchObject({ canReview: false, canSignOff: false });
    expect(() => decide(db, sme, id, { decision: "approve" }, now)).toThrow(/AI pre-review comes first/);
    skipAiReview(db, author, id, "", now);
    expect(approvalFor(db, sme, id)).toMatchObject({ stage: "review", aiReview: { status: "skipped" }, you: { canReview: true, canSignOff: true } });

    expect(() => signOff(db, author, id, { blockId: "t1", note: "Checked." }, now)).toThrow(/Only the reviewer/);
    expect(() => signOff(db, sme, id, { blockId: "t1", note: "" }, now)).toThrow(/what you confirmed/);
    expect(() => decide(db, sme, id, { decision: "approve" }, now)).toThrow(/Sign off the 2 items/);
    signOff(db, sme, id, { blockId: "t1", note: "Confirmed with Ops: 1300 number." }, now);
    const after = signOff(db, sme, id, { blockId: "t2", note: "Matches the SIRS policy v3." }, now);
    expect(after.flags.every((f) => f.signoff)).toBe(true);
    expect(after.flags[0].signoff).toMatchObject({ note: "Confirmed with Ops: 1300 number.", by: "Dana Okafor" });
    expect(decide(db, sme, id, { decision: "approve", note: "Good to go." }, now).stage).toBe("approved");
    const history = approvalFor(db, author, id).history.map((h) => h.action);
    expect(history).toEqual(["approved", "signed_off", "signed_off", "ai_skipped", "submitted"]);
  });

  it("asks Compliance too when it's compliance-sensitive, and needs a note to ask for changes", () => {
    const id = course();
    submitted(id, { compliance: true });
    expect(() => decide(db, sme, id, { decision: "changes" }, now)).toThrow(/Say what needs to change/);
    for (const blockId of ["t1", "t2"]) signOff(db, sme, id, { blockId, note: "Checked." }, now);
    expect(decide(db, sme, id, { decision: "approve" }, now).stage).toBe("compliance");
    expect(() => decide(db, sme, id, { decision: "approve" }, now)).toThrow(/Compliance/);
    expect(decide(db, compliance, id, { decision: "approve" }, now).stage).toBe("approved");
  });

  it("needs submitting again after an edit, and a changed flag needs signing off again", () => {
    const id = course();
    submitted(id);
    signOff(db, sme, id, { blockId: "t1", note: "Checked." }, now);
    const changed = structuredClone(flagged) as unknown as { pages: { sections: { blocks: Record<string, unknown>[] }[] }[] };
    changed.pages[0].sections[0].blocks[0] = { ...changed.pages[0].sections[0].blocks[0], flag: { kind: "verify", note: "TC to confirm: the new line." } };
    saveGuideDraft(db, author, id, { doc: changed }, now);
    const a = approvalFor(db, author, id);
    expect(a).toMatchObject({ stage: "draft", stale: true });
    expect(a.flags[0].signoff).toBeNull();
  });

  it("can be withdrawn by the author while it's with the reviewer", () => {
    const id = course();
    submitted(id);
    expect(() => withdraw(db, sme, id, now)).toThrow(/Only the author/);
    expect(withdraw(db, author, id, now)).toMatchObject({ stage: "draft", submission: null });
  });
});

describe("publishing", () => {
  it("with review required: only the Hub owner, only once approved", () => {
    vi.stubEnv("HUB_TOPIC_REVIEW", "required");
    const id = course();
    expect(() => publishCourse(db, author, id, {}, now)).toThrow(/approving first/);
    submitted(id);
    for (const blockId of ["t1", "t2"]) signOff(db, sme, id, { blockId, note: "Checked." }, now);
    decide(db, sme, id, { decision: "approve" }, now);
    expect(() => publishCourse(db, sme, id, {}, now)).toThrow(/approving first|Hub owner/);
    const out = publishCourse(db, author, id, { summary: "First edition" }, now);
    expect(out.guide).toMatchObject({ status: "published", publishedNumber: 1 });
    expect(out.approval.stage).toBe("live");
    expect(out.approval.history[0]).toMatchObject({ action: "published" });
  });

  it("while review is optional: publish anyway publishes it as it is, whatever the checks say, and records the open flags", () => {
    const id = course();
    expect(() => publishCourse(db, author, id, {}, now)).toThrow(/Resolve 2 checks/);
    const out = publishCourse(db, author, id, { anyway: true }, now);
    expect(out.guide.publishedNumber).toBe(1);
    expect(out.approval.history[0]).toMatchObject({ action: "published_anyway", note: expect.stringContaining("2 items weren’t verified") });

    // A picture without a description and an empty text block: Publish stops, Publish anyway publishes, and learners can read it.
    const id2 = createGuide(
      db,
      author,
      {
        title: "Pictures",
        completion: "confirm",
        doc: doc([
          { id: "pic", type: "image", media: { src: "/images/magazine/agreed-services.svg", alt: "" }, width: "column" },
          { id: "empty", type: "text", body: "" },
        ]),
      },
      now,
    ).id;
    expect(() => publishCourse(db, author, id2, {}, now)).toThrow(/Resolve/);
    const pub = publishCourse(db, author, id2, { anyway: true }, now);
    expect(pub.guide.publishedNumber).toBe(1);
    expect(readGuide(db, author, pub.guide.slug).doc.pages[0].sections[0].blocks.map((b) => b.id)).toEqual(["pic", "empty"]);
  });
});
