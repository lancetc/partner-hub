import { beforeEach, describe, expect, it } from "vitest";
import { openDb, type Db } from "./db";
import { userById, type User } from "./auth";
import { createGuide, publishGuide, readGuide, saveGuideDraft } from "./magazine";
import { publishChecks } from "@/lib/magazine";
import {
  actionFeedback,
  cleanState,
  emptyState,
  freshSignal,
  notificationWindow,
  POTENTIAL_HARM,
  scoreSignal,
  type SignalBlockData,
  type SignalState,
} from "@/lib/signal";
import { SIGNAL_CASES } from "@/content/signalCases";
import { checkActions, restartSignal, saveSignal, signalState, signalStats, submitSignal } from "./signal";

/* Spot the Signal: escalation before classification, reviewed answers kept on the server, and nothing sent anywhere. */

let db: Db;
let jordan: User, riley: User, sam: User;
const now = new Date("2026-11-20T00:00:00Z");
const later = (mins: number) => new Date(now.getTime() + mins * 60_000);
const APPROVED = {
  owner: "Learning lead",
  clinical: "Clinical reviewer",
  quality: "Quality reviewer",
  approvedOn: "2026-11-20",
  effectiveOn: "2026-11-21",
  reviewOn: "2027-05-20",
};
const SOURCE = { title: "Reportable incidents and SIRS: Provider guidelines", version: "2.0, October 2026", reviewedOn: "2026-11-20" };
const seed = (id: "a" | "b" | "c") => SIGNAL_CASES.find((c) => c.id === id)!.data;
const approved = (id: "a" | "b" | "c"): SignalBlockData => ({ ...seed(id), approval: APPROVED, source: SOURCE });
const pages = (data: SignalBlockData) => [
  {
    id: "p1",
    title: "A case",
    purpose: "",
    template: "blank",
    kind: "content",
    required: true,
    allActivities: false,
    sections: [{ id: "s1", title: "Case", blocks: [{ id: "sig", type: "signal", ...data }] }],
  },
];

function course(data: SignalBlockData) {
  const c = createGuide(db, jordan, { title: "Spot the signal", completion: "confirm", doc: { schema: 2, pages: pages(data) } }, now);
  publishGuide(db, jordan, c.id, "", now);
  return c;
}
const ids = (data: SignalBlockData, signal: "material" | "distractor") => data.artefacts.flatMap((a) => a.passages.filter((p) => p.signal === signal));
/** A learner who gets the case right: every signal, labelled as reviewed, two linked across sources, the needed actions, the reviewed assessment, a full handover. */
function strong(data: SignalBlockData): SignalState {
  const material = ids(data, "material");
  return {
    ...emptyState(),
    stage: 5,
    clues: { ...Object.fromEntries(material.map((p) => [p.id, p.kind])), ...Object.fromEntries(ids(data, "distractor").map((p) => [p.id, "distractor"])) },
    links: [{ a: material[0].id, b: material[material.length - 1].id, kind: "hypothesis" }],
    actions: data.actions.filter((a) => a.role === "essential").map((a) => a.id),
    connection: data.key.connection,
    typeId: data.key.typeId,
    priority: data.key.priority,
    rationale: "The reports point the same way and one involves a worker engaged to deliver care.",
    rationaleClue: material[0].id,
    handover: {
      chronology: "Invoice received Thursday morning, shift note the same morning, voicemail soon after.",
      quotes: `The note says: “${material[material.length - 1].text.slice(0, 40)}”`,
      facts: "Observed: what the gardener heard. Reported: what the relative says they were told.",
      concern: "The person may be under pressure and a visit is due.",
      taken: "Escalated to the incident and Quality lead and asked for a safety check.",
      needed: "The person’s own account, and when the worker is next due.",
      who: "Incident and Quality lead, straight after the voicemail.",
    },
  };
}

beforeEach(() => {
  db = openDb(":memory:");
  [jordan, riley, sam] = ["jordan", "riley", "sam"].map((id) => userById(db, id)!);
});

describe("the case an author publishes", () => {
  it("can't be published until Clinical and Quality approval and the source version are recorded", () => {
    const draft = publishChecks(
      { schema: 2, pages: pages({ ...seed("a"), source: { title: "", version: "", reviewedOn: "" } }) } as never,
      "confirm",
    ).blocking.join(" | ");
    expect(draft).toMatch(/Clinical and Quality approval is required/);
    expect(draft).toMatch(/record the policy source and its version/);
    // The starter cases are drafts: none of them publishes as it comes.
    for (const c of SIGNAL_CASES)
      expect(publishChecks({ schema: 2, pages: pages(c.data) } as never, "confirm").blocking.join(" ")).toMatch(/approval is required/);
    expect(publishChecks({ schema: 2, pages: pages(approved("a")) } as never, "confirm").blocking).toEqual([]);
    // Each needs exactly an invoice, a shift note and a voicemail.
    const two = { ...approved("a"), artefacts: approved("a").artefacts.slice(0, 2) };
    expect(publishChecks({ schema: 2, pages: pages(two) } as never, "confirm").blocking.join(" ")).toMatch(/three artefacts/);
    // A priority has to rest on a reportable type.
    const loose = { ...approved("b"), key: { ...approved("b").key, priority: "p1" as const } };
    expect(publishChecks({ schema: 2, pages: pages(loose) } as never, "confirm").blocking.join(" ")).toMatch(/needs the reportable type it rests on/);
  });

  it("can't be pushed out with Publish anyway either", () => {
    const c = createGuide(db, jordan, { title: "Draft case", completion: "confirm", doc: { schema: 2, pages: pages(seed("b")) } }, now);
    expect(() => publishGuide(db, jordan, c.id, "", now)).toThrow(/Resolve/);
    expect(() => publishGuide(db, jordan, c.id, "", now, { allowUnverified: true })).toThrow(/“Publish anyway” doesn’t cover this/);
    saveGuideDraft(db, jordan, c.id, { doc: { schema: 2, pages: pages(approved("b")) } }, later(1));
    expect(publishGuide(db, jordan, c.id, "", later(1)).publishedNumber).toBe(1);
  });

  it("keeps the answers off the learner's page until they've finished", () => {
    const c = course(approved("a"));
    const sent = JSON.stringify(readGuide(db, riley, c.slug).doc);
    // The case itself is there, with the voicemail's transcript.
    expect(sent).toContain("Keep this between us or your visits may stop.");
    expect(sent).toContain("asked for her bank card and her PIN");
    // What marks an answer right is not.
    for (const secret of [
      "heard this first-hand",
      "reasonable grounds to report to police",
      "Waiting for proof is how a concern stays unseen",
      "I have not spoken to the cleaner",
      "bank statement",
      "taken to have become aware",
    ])
      expect(sent).not.toContain(secret);
    expect(sent).not.toMatch(/"signal":"material"|"role":"essential"|"role":"unsafe"|"priority":"p1"|"typeId":"t-fin"/);
    expect(JSON.stringify(signalState(db, riley, c.id, "sig"))).not.toMatch(/reasonable grounds|first-hand/);
  });

  it("gives two blocks from the same starter case ids of their own", () => {
    const one = freshSignal(seed("a"), "aaaaa");
    const two = freshSignal(one, "bbbbb");
    expect(one.artefacts[0].passages[0].id).toBe("a-i1-xaaaaa");
    expect(two.artefacts[0].passages[0].id).toBe("a-i1-xbbbbb");
    expect(two.key.typeId).toBe("t-fin-xbbbbb");
    expect(two.key.types.some((t) => t.id === two.key.typeId)).toBe(true);
  });
});

describe("the three cases", () => {
  it("A: a worker, money and pressure. The invoice alone isn't the answer; together it's Priority 1", () => {
    const data = approved("a");
    const right = scoreSignal(data, strong(data));
    expect(right.dims).toMatchObject({ detect: { score: 1 }, evidence: { score: 1 }, protect: { score: 1 }, sirs: { score: 1 }, handover: { score: 1 } });
    expect(right).toMatchObject({ total: 100, critical: [], flags: { missedSignals: false, unsafeDelay: false, careConnection: false, strongHandover: true } });
    expect(data.key).toMatchObject({ connection: "yes", typeId: "t-fin", priority: "p1" });
    // Spotting only the invoice misses the case: it's one clue from one source, and it isn't proof.
    const invoiceOnly: SignalState = { ...strong(data), clues: { "a-i1": "observed" }, links: [] };
    const missed = scoreSignal(data, invoiceOnly);
    expect(missed.flags.missedSignals).toBe(true);
    expect(missed.dims.detect.score).toBeLessThan(0.3);
    expect(data.artefacts[0].passages[0].why).toMatch(/isn’t proof/);
    // "Not established yet" is a defensible answer for someone who isn't the assessor.
    expect(scoreSignal(data, { ...strong(data), priority: "unknown" }).dims.sirs.score).toBe(1);
    // The window is the provider's, from the reviewed awareness time.
    expect(notificationWindow(data)).toMatchObject({
      rule: "within 24 hours of becoming aware",
      aware: expect.stringContaining("20 Nov"),
      due: expect.stringContaining("21 Nov"),
    });
  });

  it("B: family, not a worker. Not SIRS reportable on the facts, and never nothing to do", () => {
    const data = approved("b");
    expect(data.key).toMatchObject({ connection: "no", typeId: "", priority: "none" });
    expect(scoreSignal(data, strong(data))).toMatchObject({ total: 100, critical: [] });
    // Treating the explained invoice as a signal is unwarranted certainty.
    const fooled = scoreSignal(data, { ...strong(data), clues: { ...strong(data).clues, "b-i2": "observed" } });
    expect(fooled.flags.unwarrantedCertainty).toBe(true);
    expect(fooled.dims.detect.notes.join(" ")).toMatch(/ordinary explanation/);
    // Calling it Priority 1 is coached with the rule about potential harm, and it isn't a failure to speak up.
    const over = scoreSignal(data, { ...strong(data), connection: "yes", typeId: "t-fin", priority: "p1" });
    expect(over.critical).toEqual([]);
    expect(over.flags.careConnection).toBe(true);
    expect(over.dims.sirs.notes).toContain(POTENTIAL_HARM);
    expect(over.dims.protect.score).toBe(1);
    // A routine note alone can't finish it, even though it "isn't SIRS".
    expect(actionFeedback(data, ["act-note"]).critical).toHaveLength(1);
    expect(actionFeedback(data, ["act-finance"]).critical).toHaveLength(1);
    // No reportable priority, so no clock is made up.
    expect(notificationWindow(data)).toBeNull();
    expect(data.awareAt).toBe("");
  });

  it("C: a reportable type with no Priority 1 condition is Priority 2, with a 30-day window", () => {
    const data = approved("c");
    expect(data.key).toMatchObject({ connection: "yes", typeId: "t-psych", priority: "p2" });
    expect(data.key.why).toContain("doesn’t, by itself, make an incident Priority 1");
    expect(data.key.why).toMatch(/reviewer would reassess the priority/);
    expect(scoreSignal(data, strong(data)).total).toBe(100);
    expect(scoreSignal(data, { ...strong(data), priority: "p1" }).dims.sirs.notes).toContain(POTENTIAL_HARM);
    expect(notificationWindow(data)).toMatchObject({ rule: "within 30 calendar days of becoming aware", due: expect.stringContaining("19 Dec") });
    // The 30-day window isn't time to wait: waiting is still stopped.
    expect(actionFeedback(data, ["act-wait"]).critical[0]).toMatch(/passed on straight away/);
  });

  it("doesn't punish doing more than was needed, and reads wording that states a verdict", () => {
    const data = approved("a");
    const everything = data.actions.filter((a) => a.role !== "unsafe").map((a) => a.id);
    expect(actionFeedback(data, everything)).toMatchObject({ critical: [], missed: [] });
    expect(scoreSignal(data, { ...strong(data), actions: everything }).dims.protect.score).toBe(1);
    const verdict = scoreSignal(data, { ...strong(data), handover: { ...strong(data).handover, facts: "The cleaner stole from her and is guilty." } });
    expect(verdict.flags.unwarrantedCertainty).toBe(true);
    expect(verdict.dims.evidence.notes.join(" ")).toMatch(/states a conclusion/);
    // Labelling a second-hand report as an observed fact is picked up, with the right label named.
    const mislabelled = scoreSignal(data, { ...strong(data), clues: { ...strong(data).clues, "a-v2": "observed" } });
    expect(mislabelled.dims.evidence.notes[0]).toMatch(/is reported allegation, not observed fact/);
  });
});

describe("a learner's attempt", () => {
  it("saves as they go and resumes, and only this block's ids survive", () => {
    const c = course(approved("a"));
    expect(signalState(db, riley, c.id, "sig")).toMatchObject({ status: "new", attemptId: null });
    saveSignal(
      db,
      riley,
      c.id,
      {
        blockId: "sig",
        state: { stage: 2, clues: { "a-n3": "observed", "made-up": "observed", "a-v2": "nonsense" }, rationale: "x".repeat(900), extra: "ignored" },
      },
      now,
    );
    const back = signalState(db, riley, c.id, "sig");
    expect(back).toMatchObject({ status: "active", state: { stage: 2, clues: { "a-n3": "observed" } } });
    expect(back.state.rationale).toHaveLength(400);
    // A second save is the same attempt.
    saveSignal(db, riley, c.id, { blockId: "sig", state: { stage: 3 } }, later(1));
    expect(db.prepare("SELECT COUNT(*) AS n FROM signal_attempts").get()).toEqual({ n: 1 });
    expect(cleanState(approved("a"), { stage: 99, actions: ["act-safety", "act-safety", "nope"] })).toMatchObject({ stage: 5, actions: ["act-safety"] });
    expect(() => signalState(db, riley, c.id, "not-a-block")).toThrow(/isn’t here/);
  });

  it("asks what they'd do before any classification, and won't finish while the concern is left with no one", () => {
    const data = approved("a");
    const c = course(data);
    // Nothing chosen: no assessment yet.
    expect(() => submitSignal(db, riley, c.id, { blockId: "sig", state: { ...strong(data), actions: [] } }, now)).toThrow(/what you’d do first/);
    // A routine note only: told why, shown the made-up timeline, not told the answer.
    const note = checkActions(db, riley, c.id, { blockId: "sig", state: { ...strong(data), actions: ["act-note"] } }, now).feedback;
    expect(note.critical).toHaveLength(1);
    expect(note.chosen[0]).toMatchObject({ role: "insufficient", consequence: expect.stringContaining("made-up timeline") });
    expect(note.missed).toEqual([]);
    // Even with a perfect assessment, the attempt isn't finished and they're sent back to that step.
    const blocked = submitSignal(db, riley, c.id, { blockId: "sig", state: { ...strong(data), actions: ["act-wait"] } }, later(1));
    expect(blocked).toMatchObject({ finished: false, status: "active", debrief: null, state: { stage: 3 } });
    expect(blocked.critical[0]).toMatch(/leaves the concern with no one looking at it/);
    // Choosing well, they're told what each does, and anything needed that they missed.
    const good = checkActions(db, riley, c.id, { blockId: "sig", state: { ...strong(data), actions: ["act-safety"] } }, later(2)).feedback;
    expect(good).toMatchObject({ critical: [], missed: ["Tell the incident and Quality lead now"] });
    const done = submitSignal(db, riley, c.id, { blockId: "sig", state: strong(data) }, later(3));
    expect(done).toMatchObject({ finished: true, status: "finished", retries: 2 });
  });

  it("gives the reviewed answers only in the debrief, in words rather than a mark", () => {
    const data = approved("c");
    const c = course(data);
    const done = submitSignal(db, riley, c.id, { blockId: "sig", state: { ...strong(data), clues: { "c-n2": "observed" }, links: [] } }, now);
    const d = done.debrief!;
    expect(d.dims.map((x) => [x.label, x.rating])).toEqual([
      ["Detect and connect clues", "Worth another look"],
      ["Evidence quality", "Strong"],
      ["Protect and escalate", "Strong"],
      ["SIRS reasoning", "Strong"],
      ["Handover", "Strong"],
    ]);
    expect(JSON.stringify(d.dims)).not.toMatch(/\d+%|"score"|"total"/);
    expect(d.key).toMatchObject({ priority: "p2", typeId: "t-psych", handover: expect.stringContaining("I have not spoken to the worker") });
    expect(d.clues["c-i1"]).toMatchObject({ signal: "distractor", why: expect.stringContaining("rate notice") });
    expect(d.window).toMatchObject({ rule: "within 30 calendar days of becoming aware" });
    expect(d.source).toMatchObject({ version: "2.0, October 2026" });
    // Coming back shows the same debrief; starting again keeps the finished attempt.
    expect(signalState(db, riley, c.id, "sig").debrief?.key.priority).toBe("p2");
    expect(restartSignal(db, riley, c.id, { blockId: "sig" }, later(5))).toMatchObject({ status: "active", debrief: null, state: { stage: 0, actions: [] } });
    expect(db.prepare("SELECT COUNT(*) AS n FROM signal_attempts").get()).toEqual({ n: 2 });
  });

  it("is a training record: nothing is sent, notified or recorded as an incident, and no one else can read it", () => {
    const data = approved("a");
    const c = course(data);
    const before = (t: string) => (db.prepare(`SELECT COUNT(*) AS n FROM ${t}`).get() as { n: number }).n;
    const counts = Object.fromEntries(["notifications", "outbox", "audit"].map((t) => [t, before(t)]));
    submitSignal(
      db,
      riley,
      c.id,
      { blockId: "sig", state: { ...strong(data), handover: { ...strong(data).handover, concern: "Margaret may be at risk on Thursday." } } },
      now,
    );
    for (const t of ["notifications", "outbox", "audit"]) expect(before(t)).toBe(counts[t]);
    // Another learner sees their own blank case, not Riley's.
    expect(signalState(db, sam, c.id, "sig")).toMatchObject({ status: "new", state: { actions: [] } });
    // Authors see where people went wrong, as totals. Events and totals hold none of what was written.
    const stats = signalStats(db, jordan, c.id);
    expect(stats.blocks).toMatchObject([{ blockId: "sig", attempts: 1, people: 1, finished: 1, strongHandover: 1, missedSignals: 0, careConnection: 0 }]);
    expect(() => signalStats(db, riley, c.id)).toThrow(/authors/);
    const events = JSON.stringify(db.prepare("SELECT event, detail FROM magazine_events WHERE event LIKE 'signal.%'").all());
    expect(events).toContain("signal.finished");
    expect(`${events}${JSON.stringify(stats)}`).not.toMatch(/Margaret|Thursday|worker engaged/);
    // And it never recorded how long anything took.
    expect(events).not.toMatch(/seconds|duration|elapsed/);
  });

  it("keeps a finished attempt as it was read when the case is revised", () => {
    const data = approved("a");
    const c = course(data);
    submitSignal(db, riley, c.id, { blockId: "sig", state: strong(data) }, now);
    const first = db.prepare("SELECT key_hash, result FROM signal_attempts").get() as { key_hash: string; result: string };
    const revised = { ...data, key: { ...data.key, priority: "p2" as const } };
    saveGuideDraft(db, jordan, c.id, { doc: { schema: 2, pages: pages(revised) } }, later(5));
    publishGuide(db, jordan, c.id, "Revised", later(5), { moveLearners: true });
    // The new edition starts fresh; the old result is untouched, with the version it was read against.
    expect(signalState(db, riley, c.id, "sig").status).toBe("new");
    expect(db.prepare("SELECT key_hash, result FROM signal_attempts").get()).toEqual(first);
    expect(JSON.parse(first.result).total).toBe(100);
  });
});
