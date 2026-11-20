import { beforeEach, describe, expect, it } from "vitest";
import { openDb, type Db } from "./db";
import { userById, type User } from "./auth";
import { createGuide, publishGuide, readGuide } from "./magazine";
import { publishChecks } from "@/lib/magazine";
import {
  applyReplacements,
  blankAttempt,
  diffWords,
  emptyRedPen,
  freshRedPen,
  hasPhrase,
  identifierWarnings,
  readAttempt,
  submit,
  type Attempt,
  type RedPenBlockData,
} from "@/lib/redpen";
import { REDPEN_CASES } from "@/content/redpenCases";
import { redPenState, redPenStats, saveRedPen, submitRedPen } from "./redpen";

/* Red Pen: judgement not word lists, no invented actions, escalation can't be edited away, and the reviewed rewrite waits. */

let db: Db;
let jordan: User, riley: User;
const now = new Date("2026-11-20T00:00:00Z");
const SIGNED = { owner: "Learning", clinical: "Clinical", quality: "Quality", privacy: "Privacy", approvedOn: "2026-11-20" };
const kase = (id: string) => structuredClone(REDPEN_CASES.find((c) => c.id === id)!.data);
const signed = (id = "dot"): RedPenBlockData => ({ ...kase(id), approval: SIGNED, policyIds: ["documentation-policy"], reviewDue: "2027-05-19" });
/** Marks every issue line with its first accepted reason, and rewrites with the reviewed text. */
function good(b: RedPenBlockData): Attempt {
  const a = blankAttempt(b);
  for (const s of b.document) if (s.expect === "issue") a.marks[s.id] = { reason: s.reasons[0], note: "x", replacement: s.suggestion };
  a.rewrite = b.reviewed.text;
  a.escalation = b.escalation?.options.find((o) => o.verdict === "good")?.id ?? "";
  return a;
}
const pages = (data: RedPenBlockData) => [
  {
    id: "p1",
    title: "Red Pen",
    purpose: "",
    template: "blank",
    kind: "content",
    required: true,
    allActivities: false,
    sections: [{ id: "s1", title: "Case", blocks: [{ id: "rp", type: "redpen", ...data }] }],
  },
];
const blocking = (data: RedPenBlockData) => publishChecks({ schema: 2, pages: pages(data) } as never, "confirm").blocking;
function course(data: RedPenBlockData) {
  const c = createGuide(db, jordan, { title: "Red Pen", completion: "confirm", doc: { schema: 2, pages: pages(data) } }, now);
  publishGuide(db, jordan, c.id, "", now);
  return c;
}

beforeEach(() => {
  db = openDb(":memory:");
  [jordan, riley] = ["jordan", "riley"].map((id) => userById(db, id)!);
});

describe("the critique an author publishes", () => {
  it("can't be published without sign-off or past its review date, even with Publish anyway", () => {
    expect(blocking(kase("dot")).join(" ")).toMatch(/sign-off is required/);
    for (const c of ["dot", "nguyen", "okafor"]) expect(blocking(signed(c))).toEqual([]);
    const d = createGuide(db, jordan, { title: "Draft", completion: "confirm", doc: { schema: 2, pages: pages(kase("dot")) } }, now);
    expect(() => publishGuide(db, jordan, d.id, "", now, { allowUnverified: true })).toThrow(/Red Pen critique needs its sign-off/);
    const old = createGuide(
      db,
      jordan,
      { title: "Old", completion: "confirm", doc: { schema: 2, pages: pages({ ...signed(), reviewDue: "2026-01-01" }) } },
      now,
    );
    expect(() => publishGuide(db, jordan, old.id, "", now, { allowUnverified: true })).toThrow(/current review date/);
  });

  it("refuses text that looks like a real identifier", () => {
    expect(identifierWarnings("Call 0412 345 678 or email dot@example.com, 12 Smith Street")).toEqual([
      "an email address",
      "a phone number",
      "a street address",
    ]);
    expect(identifierWarnings("10:15 am: offered a shower.")).toEqual([]);
    const b = signed();
    b.facts[0].text = "Medicare 2123456701";
    expect(blocking(b).join(" ")).toMatch(/a long ID number/);
    // "Publish anyway" doesn't cover it.
    const p = signed();
    p.facts[0].text += " Call his son on 0412 345 678.";
    const c = createGuide(db, jordan, { title: "Phone", completion: "confirm", doc: { schema: 2, pages: pages(p) } }, now);
    expect(() => publishGuide(db, jordan, c.id, "", now, { allowUnverified: true })).toThrow(/real identifier/);
  });

  it("keeps the rubric and reviewed rewrite off the learner's page", () => {
    const c = course(signed("nguyen"));
    const page = JSON.stringify(readGuide(db, riley, c.slug));
    expect(page).toContain("RN notified.");
    for (const secret of ["No RN was contacted. Recording an action", "rn informed", "Offered Mrs Nguyen a shower. She said, “Not now", '"expect":"issue"'])
      expect(page).not.toContain(secret);
    expect(freshRedPen(kase("dot"), "aaaaa").document[0].id).toBe("rp-d-s1-xaaaaa");
  });
});

describe("marking", () => {
  it("passes the reviewed rewrite, and accepts the documented diagnosis while flagging labels", () => {
    const b = kase("dot");
    const f = readAttempt(b, good(b));
    expect(f).toMatchObject({ pass: true, result: "strong" });
    expect(f.lines.find((l) => l.id === "rp-d-s1")).toMatchObject({ verdict: "strong", marked: "" });
    // Marking the accurate diagnosis as an inference is flagged; removing it from the rewrite too.
    const a = good(b);
    a.marks["rp-d-s1"] = { reason: "inference", note: "", replacement: "" };
    a.rewrite = a.rewrite.replace("Dot has osteoarthritis in both hands (GP letter). ", "");
    const g = readAttempt(b, a);
    expect(g.lines.find((l) => l.id === "rp-d-s1")?.feedback).toMatch(/accurate and should stay/);
    expect(g.rewrite.map((x) => x.feedback).join(" ")).toMatch(/osteoarthritis is relevant/);
    // The same clinical word as an unsupported inference is a critical gap.
    const n = kase("nguyen");
    const bad = readAttempt(n, { ...good(n), rewrite: `${n.reviewed.text} She seemed confused.` });
    expect(bad).toMatchObject({ pass: false, result: "critical" });
  });

  it("never passes a recorded RN notification that didn't happen", () => {
    const n = kase("nguyen");
    const a = readAttempt(n, { ...good(n), rewrite: "10:15 am: Offered a shower; she said she'd prefer after lunch. RN notified. Follow up to confirm." });
    expect(a.pass).toBe(false);
    expect(a.dims.find((d) => d.dim === "fidelity")?.result).toBe("critical");
    expect(a.rewrite.map((x) => x.text).join(" ")).toMatch(/RN notified/i);
    expect(hasPhrase("The RN was not notified", "rn notified")).toBe(false);
  });

  it("names a missed issue, a right line with the wrong reason, and a deliberate choice to leave it", () => {
    const n = kase("nguyen");
    const a = good(n);
    delete a.marks["rp-n-s4"];
    a.kept["rp-n-s4"] = "It’s just a summary";
    a.marks["rp-n-s3"] = { reason: "vague", note: "", replacement: "" };
    const f = readAttempt(n, a);
    expect(f.lines.find((l) => l.id === "rp-n-s4")?.feedback).toMatch(/You left this deliberately \(“It’s just a summary”\)/);
    expect(f.lines.find((l) => l.id === "rp-n-s3")?.feedback).toMatch(/You spotted it\. The main problem: action not evidenced/);
    expect(f.dims.find((d) => d.dim === "rationale")?.result).toBe("revision");
  });

  it("a case needing escalation can't pass on a good rewrite alone", () => {
    const o = kase("okafor");
    expect(submit(o, emptyRedPen(), { ...good(o), escalation: "" })).toMatchObject({ problem: /escalation decision/ });
    const meeting = readAttempt(o, { ...good(o), escalation: "rp-o-e2" });
    expect(meeting).toMatchObject({ pass: false, result: "critical" });
    expect(meeting.escalation?.feedback).toMatch(/Writing it down isn’t escalating it/);
    expect(readAttempt(o, good(o)).pass).toBe(true);
    expect(readAttempt(o, { ...good(o), rewrite: `${o.reviewed.text} Helped him back into bed.` }).result).toBe("critical");
  });

  it("builds a starting rewrite from replacements, and diffs by word", () => {
    const n = kase("nguyen");
    expect(applyReplacements(n, good(n))).toMatch(/^Offered Mrs Nguyen a shower/);
    const a = "She refused hygiene care.";
    const b = "She chose to wash after lunch.";
    const d = diffWords(a, b);
    expect(
      d
        .filter((p) => p.kind !== "add")
        .map((p) => p.text)
        .join(""),
    ).toBe(a);
    expect(
      d
        .filter((p) => p.kind !== "del")
        .map((p) => p.text)
        .join(""),
    ).toBe(b);
    expect(d.find((p) => p.kind === "del")?.text).toMatch(/refused/);
    expect(d.find((p) => p.kind === "add")?.text).toMatch(/chose/);
    expect(d[0]).toEqual({ kind: "same", text: "She " });
  });
});

describe("attempts", () => {
  it("autosaves, keeps the first submission, reveals the reviewed rewrite only after it, and gives authors counts only", () => {
    const c = course(signed("nguyen"));
    const n = kase("nguyen");
    const before = redPenState(db, riley, c.id, "rp", now);
    expect(before).toMatchObject({ feedback: null, reviewed: null, thread: null });
    expect(() => saveRedPen(db, riley, c.id, { blockId: "rp", reflection: "x" }, now)).toThrow(/Submit your critique first/);
    saveRedPen(db, riley, c.id, { blockId: "rp", draft: { ...blankAttempt(n), rewrite: "half done" } }, now);
    expect(redPenState(db, riley, c.id, "rp", now).state.draft?.rewrite).toBe("half done");

    const first = submitRedPen(db, riley, c.id, { blockId: "rp", attempt: { ...good(n), rewrite: "RN notified about Mrs Nguyen." } }, now);
    expect(first).toMatchObject({
      passedNow: false,
      feedback: { pass: false },
      reviewed: { reviewerRole: "Senior Clinical Lead (example)" },
      thread: { id: "case-shower-after-lunch" },
    });
    expect(first.reviewed?.text).toMatch(/I’d prefer to wash after lunch/);
    const second = submitRedPen(db, riley, c.id, { blockId: "rp", attempt: good(n) }, now);
    expect(second).toMatchObject({ passedNow: true, feedback: { pass: true } });
    expect(second.first?.rewrite).toBe("RN notified about Mrs Nguyen.");
    expect(second.state.submissions).toHaveLength(2);
    saveRedPen(db, riley, c.id, { blockId: "rp", compared: true, reflection: "Never write notified until it's done." }, now);
    expect(redPenState(db, riley, c.id, "rp", now).state).toMatchObject({ compared: true, reflection: "Never write notified until it's done." });

    expect(redPenStats(db, jordan, c.id)).toMatchObject({ submissions: 2, passes: 1, passedFirstTry: 0, compared: 1 });
    expect(() => redPenStats(db, riley, c.id)).toThrow();
    expect(JSON.stringify(db.prepare("SELECT detail FROM magazine_events WHERE event LIKE 'redpen.%'").all())).not.toMatch(/Nguyen|notified/);
  });

  it("retires the endorsement badge past the review date", () => {
    const c = course({ ...signed("dot"), reviewed: { ...signed("dot").reviewed, endorsed: true } });
    submitRedPen(db, riley, c.id, { blockId: "rp", attempt: good(kase("dot")) }, now);
    expect(redPenState(db, riley, c.id, "rp", now).reviewed?.endorsed).toBe(true);
    const later = redPenState(db, riley, c.id, "rp", new Date("2027-06-01T00:00:00Z"));
    expect(later).toMatchObject({ stale: true, reviewed: { endorsed: false } });
  });
});
