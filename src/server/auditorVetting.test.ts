import { beforeEach, describe, expect, it } from "vitest";
import { openDb, type Db } from "./db";
import { userById, type User } from "./auth";
import { createGuide, publishGuide, readGuide } from "./magazine";
import { allBlocks, readGuideDoc } from "@/lib/magazine";
import { emptyState, scoreAuditor, type AuditorBlockData, type AuditState, type Category, type Mark } from "@/lib/auditor";
import { DOT_GARDENER } from "@/content/vettingCases";
import { AUDIT_CASES } from "@/content/auditCases";
import {
  answerFollowUp,
  auditorKeyHash,
  auditorRegister,
  auditorState,
  auditorStats,
  restartAuditor,
  signalAuditor,
  submitAuditor,
  viewedAuditor,
} from "./auditor";
import { createHash } from "node:crypto";

/*
  The Contractor Vetting Card on the server (PRD sections 8, 12, 13 and 15): idempotent submits, events with keys and
  versions and no learner words, the readers' copy, older attempts loading under the new codes, the case check that no
  sign-off waives, totals suppressed under five people, and the decision register.
*/

let db: Db;
let jordan: User, riley: User;
const now = new Date("2026-11-24T00:00:00Z");
const SIGNED = {
  owner: "Owner",
  compliance: "Supplier onboarding",
  finance: "Finance",
  operations: "Care Operations",
  quality: "Quality",
  approvedOn: "2026-11-24",
};
const signed = (data: AuditorBlockData = DOT_GARDENER): AuditorBlockData => ({
  ...structuredClone(data),
  approval: SIGNED,
  source: { title: "Vetting ruleset", version: "v1", reviewedOn: "2026-11-24" },
});
const pages = (data: unknown) => [
  {
    id: "p1",
    title: "A card",
    purpose: "",
    template: "blank",
    kind: "content",
    required: true,
    allActivities: false,
    sections: [{ id: "s1", title: "Card", blocks: [{ id: "vc", type: "auditor", ...(data as object) }] }],
  },
];
function course(data: unknown, title = "ZZ Test vetting") {
  const c = createGuide(db, jordan, { title, completion: "confirm", doc: { schema: 2, pages: pages(data) } }, now);
  publishGuide(db, jordan, c.id, "", now);
  return c;
}
let n = 0;
const mark = (target: string, category: Category, compared: string[] = [], missing = false): Mark => ({
  id: `m${++n}`,
  fieldId: missing ? "" : target,
  missingId: missing ? target : "",
  category,
  note: "A NOTE ONLY THE LEARNER WROTE",
  compared,
});
const careful = (b: AuditorBlockData) =>
  b.findings.filter((e) => e.status !== "verified").map((e) => mark(e.fieldId || e.missingId, e.categories[0], e.compareWith, !e.fieldId));
const good = (): AuditState => ({
  ...emptyState(),
  marks: careful(DOT_GARDENER),
  decision: "request_evidence",
  rationale: "THE LEARNER’S OWN REASON, which mustn’t reach analytics.",
  action: "corrected",
  requests: DOT_GARDENER.vetting!.requests.filter((r) => r.needed).map((r) => r.id),
  explanation: {
    text: "DEAR DOT, A PRIVATE MESSAGE: we’re keeping your gardener, a few checks first.",
    startNow: "not_yet",
    covered: ["checked", "start", "owner"],
  },
});
const events = (guideId: string, event?: string) =>
  (
    db.prepare("SELECT event, detail FROM magazine_events WHERE guide_id = ? ORDER BY rowid").all(guideId) as {
      event: string;
      detail: string;
    }[]
  ).filter((e) => !event || e.event === event);
function people(count: number, tag: string) {
  const ins = db.prepare("INSERT INTO users (id, name, email, org_id, role, audience) VALUES (?, ?, ?, ?, 'learner', 'coordinator')");
  return Array.from({ length: count }, (_, i) => {
    const id = `${tag}${i}`;
    ins.run(id, `Test ${id}`, `${id}@example.test`, riley.org_id);
    return userById(db, id)!;
  });
}

beforeEach(() => {
  db = openDb(":memory:");
  [jordan, riley] = ["jordan", "riley"].map((id) => userById(db, id)!);
});

describe("submitting", () => {
  it("is idempotent: a resent submit returns the same attempt, with one score and one set of events", () => {
    const c = course(signed());
    const first = submitAuditor(db, riley, c.id, { blockId: "vc", state: good() }, now);
    expect(first.status).toBe("finished");
    const again = submitAuditor(db, riley, c.id, { blockId: "vc", state: { ...good(), decision: "ready" } }, now);
    expect(again.attemptId).toBe(first.attemptId);
    expect(again.state.decision).toBe("request_evidence");
    expect(events(c.id, "response_submitted")).toHaveLength(1);
    expect(events(c.id, "activity_started")).toHaveLength(1);
    expect((db.prepare("SELECT COUNT(*) AS n FROM auditor_attempts WHERE guide_id = ?").get(c.id) as { n: number }).n).toBe(1);
    // Only Try again starts another, and it's logged as a retry.
    const retry = restartAuditor(db, riley, c.id, { blockId: "vc" }, now);
    expect(retry.attemptId).not.toBe(first.attemptId);
    expect(events(c.id, "retry_started")).toHaveLength(1);
  });

  it("completes once the debrief is viewed, once however often it’s viewed", () => {
    const c = course(signed());
    viewedAuditor(db, riley, c.id, { blockId: "vc" }, now);
    expect(events(c.id, "feedback_viewed")).toHaveLength(0);
    submitAuditor(db, riley, c.id, { blockId: "vc", state: good() }, now);
    viewedAuditor(db, riley, c.id, { blockId: "vc" }, now);
    viewedAuditor(db, riley, c.id, { blockId: "vc" }, now);
    expect(events(c.id, "feedback_viewed")).toHaveLength(1);
    expect(events(c.id, "activity_completed")).toHaveLength(1);
    expect(events(c.id, "assessment_attempted")).toHaveLength(0);
  });

  it("logs ids, codes, counts and versions with a key, and never the learner’s words, a document value or a price", () => {
    const c = course(signed());
    signalAuditor(db, riley, c.id, { blockId: "vc", name: "pack_field_opened", ref: "v-pl-to" }, now);
    signalAuditor(db, riley, c.id, { blockId: "vc", name: "pack_field_opened", ref: "v-pl-to" }, now);
    signalAuditor(db, riley, c.id, { blockId: "vc", name: "price_breakdown_checked" }, now);
    signalAuditor(db, riley, c.id, { blockId: "vc", name: "source_checked", ref: "r-v-screening" }, now);
    expect(() => signalAuditor(db, riley, c.id, { blockId: "vc", name: "pack_field_opened", ref: "not-a-field" }, now)).toThrow(/isn’t part of this case/);
    expect(() => signalAuditor(db, riley, c.id, { blockId: "vc", name: "anything_else" }, now)).toThrow();
    submitAuditor(db, riley, c.id, { blockId: "vc", state: good() }, now);
    const all = events(c.id);
    expect(all.filter((e) => e.event === "pack_field_opened")).toHaveLength(1);
    expect(all.map((e) => e.event)).toEqual(
      expect.arrayContaining([
        "activity_started",
        "pack_field_opened",
        "price_breakdown_checked",
        "source_checked",
        "response_submitted",
        "decision_selected",
        "screening_route_selected",
        "evidence_requested",
        "participant_explanation_submitted",
      ]),
    );
    for (const e of all) {
      const d = JSON.parse(e.detail);
      expect(d.key, e.event).toMatch(/^au-/);
      expect(d).toMatchObject({ pack: "dot-gardener-1", rubric: "vetting-rubric-1", engine: "auditor-engine-2", place: "magazine" });
    }
    const text = all.map((e) => e.detail).join(" ");
    for (const secret of ["A NOTE ONLY", "THE LEARNER’S OWN", "DEAR DOT", "45 678 901 234", "Archway", "6800", "$68"])
      expect(text, secret).not.toContain(secret);
    const sub = JSON.parse(events(c.id, "response_submitted")[0].detail);
    expect(sub).toMatchObject({ decision: "request_evidence", credit: "full", outcome: "request_evidence", codes: [] });
  });

  it("answers the corrected pack and the renewal once each, and logs the renewal with its own version", () => {
    const c = course(signed());
    submitAuditor(db, riley, c.id, { blockId: "vc", state: good() }, now);
    const a = answerFollowUp(db, riley, c.id, { blockId: "vc", kind: "corrected", decision: "ready" }, now);
    expect(a.debrief!.vetting!.corrected).toMatchObject({ right: true });
    answerFollowUp(db, riley, c.id, { blockId: "vc", kind: "corrected", decision: "cannot_engage" }, now);
    expect(auditorState(db, riley, c.id, "vc", now).state.followUps.corrected).toBe("ready");
    signalAuditor(db, riley, c.id, { blockId: "vc", name: "renewal_variant_started" }, now);
    const r = answerFollowUp(
      db,
      riley,
      c.id,
      { blockId: "vc", kind: "renewal", decision: "request_evidence", renew: ["pl", "agree"], newAgreement: "yes" },
      now,
    );
    expect(r.debrief!.vetting!.renewal).toMatchObject({ right: true, newAgreement: { right: true, said: "yes" } });
    expect(JSON.parse(events(c.id, "renewal_variant_started")[0].detail).version).toBe("dot-gardener-2-renewal");
    expect(JSON.parse(events(c.id, "renewal_variant_answered")[0].detail)).toMatchObject({
      version: "dot-gardener-2-renewal",
      right: true,
      newAgreementRight: true,
    });
    expect(events(c.id, "corrected_pack_answered")).toHaveLength(1);
  });

  it("keeps the versions it was read against with the attempt", () => {
    const c = course(signed());
    const v = submitAuditor(db, riley, c.id, { blockId: "vc", state: good() }, now);
    expect(v.versions).toMatchObject({ engine: "auditor-engine-2", rubric: "vetting-rubric-1", pack: "dot-gardener-1" });
    expect(v.versions.rules).toContain("r-v-insurance@2026-11-21");
  });
});

describe("the readers’ copy", () => {
  it("carries the pack, the price and the choices, never the answer key", () => {
    const c = course(signed());
    const block = readGuide(db, riley, c.id).doc.pages[0].sections[0].blocks[0];
    const text = JSON.stringify(block);
    for (const secret of [
      "clearance is unverified",
      "screening_both_required",
      "He can’t start on the 4th",
      "lose her choice",
      "Finance accepted the explanation",
    ])
      expect(text, secret).not.toContain(secret);
    expect(text).toContain("Archway Garden Services Pty Ltd");
    // The debrief arrives only after submitting.
    expect(auditorState(db, riley, c.id, "vc", now).debrief).toBeNull();
    expect(submitAuditor(db, riley, c.id, { blockId: "vc", state: good() }, now).debrief!.vetting!.explanation.model).toMatch(/He can’t start/);
  });
});

describe("older attempts", () => {
  it("load from the database under the new codes, with the same answer-key hash as before", () => {
    // A course published before the four outcomes: Approve, Query and Reject in its stored document.
    const g = structuredClone(signed(AUDIT_CASES.find((x) => x.id === "garden-pack")!.data)) as unknown as Record<string, unknown> & AuditorBlockData;
    const old = { ...g, decisions: { approve: g.decisions.ready, query: g.decisions.request_evidence, reject_current_submission: g.decisions.cannot_engage } };
    const c = course(old, "ZZ Test legacy");
    const parsed = allBlocks(readGuideDoc({ schema: 2, pages: pages(old) } as never, { draft: true }))[0] as unknown as AuditorBlockData & { id: string };
    // The hash as the earlier code computed it: decisions under their old codes.
    const k = { approve: old.decisions.approve, query: old.decisions.query, reject_current_submission: old.decisions.reject_current_submission };
    const plain = (d: { credit: string; critical: boolean; why: string }) => ({ credit: d.credit, critical: d.critical, why: d.why });
    const before = createHash("sha1")
      .update(
        JSON.stringify({
          d: parsed.docs,
          m: parsed.missing,
          r: parsed.rules,
          e: parsed.findings,
          k: { approve: plain(k.approve), query: plain(k.query), reject_current_submission: plain(k.reject_current_submission) },
          a: parsed.actions,
          g: parsed.engagementDate,
        }),
      )
      .digest("hex")
      .slice(0, 12);
    expect(auditorKeyHash(parsed)).toBe(before);
    // An attempt as the earlier code stored it.
    const state = {
      marks: [{ id: "m1", fieldId: "c-pl-to", missingId: "", category: "looks_correct", note: "", compared: [] }],
      decision: "approve",
      rationale: "All there.",
      action: "proceed",
      stage: 1,
      variant: "",
    };
    const result = { ...scoreAuditor(parsed, { ...emptyState(), ...(state as unknown as Partial<AuditState>), decision: "ready" }), decision: "approve" };
    delete (result as { vetting?: unknown }).vetting;
    const rev = (db.prepare("SELECT revision_id FROM magazine_guides WHERE id = ?").get(c.id) as { revision_id: string }).revision_id;
    db.prepare(
      "INSERT INTO auditor_attempts (id, guide_id, revision_id, block_id, user_id, key_hash, state, result, status, started_at, updated_at, finished_at) VALUES ('au-old', ?, ?, 'vc', ?, ?, ?, ?, 'finished', ?, ?, ?)",
    ).run(c.id, rev, riley.id, before, JSON.stringify(state), JSON.stringify(result), now.toISOString(), now.toISOString(), now.toISOString());
    const v = auditorState(db, riley, c.id, "vc", now);
    expect(v).toMatchObject({ attemptId: "au-old", status: "finished", earlierCase: false });
    expect(v.state.decision).toBe("ready");
    expect(v.debrief!.decision).toMatchObject({ yours: "Ready for engagement review", credit: "full" });
    expect(v.debrief!.vetting).toBeNull();
    // And its totals count it under the new code (with enough people to show a breakdown).
    for (const u of people(5, "o"))
      submitAuditor(
        db,
        u,
        c.id,
        { blockId: "vc", state: { ...emptyState(), marks: state.marks as Mark[], decision: "ready", rationale: "All there, checked.", action: "proceed" } },
        now,
      );
    expect(auditorStats(db, jordan, c.id).blocks[0].decisions).toEqual({ ready: 6 });
  });
});

describe("publishing", () => {
  it("refuses a case that contradicts itself even with Publish anyway, and before any sign-off", () => {
    const broken = signed();
    broken.decisions.ready = { credit: "full", critical: false, why: "Looks fine." };
    const c = createGuide(db, jordan, { title: "ZZ Test broken", completion: "confirm", doc: { schema: 2, pages: pages(broken) } }, now);
    expect(() => publishGuide(db, jordan, c.id, "", now, { allowUnverified: true })).toThrow(/doesn’t hold together/);
  });

  it("holds the demo draft (no sign-off) back, and publishes once it’s signed", () => {
    const c = createGuide(db, jordan, { title: "ZZ Test unsigned", completion: "confirm", doc: { schema: 2, pages: pages(DOT_GARDENER) } }, now);
    expect(() => publishGuide(db, jordan, c.id, "", now, { allowUnverified: true })).toThrow(/needs its sign-off/);
    expect(() => course(signed())).not.toThrow();
  });

  it("holds new attempts on an assessed card whose rule is past its review date", () => {
    const a = signed();
    a.vetting!.mode = "assessed";
    const c = course(a);
    const later = new Date("2027-06-01T00:00:00Z");
    expect(auditorState(db, riley, c.id, "vc", later).usable.ok).toBe(false);
    expect(() => submitAuditor(db, riley, c.id, { blockId: "vc", state: good() }, later)).toThrow(/due for review/);
  });
});

describe("totals and the decision register", () => {
  it("shows counts only under five people, and misconceptions with five", () => {
    const c = course(signed());
    submitAuditor(db, riley, c.id, { blockId: "vc", state: good() }, now);
    expect(auditorStats(db, jordan, c.id).blocks[0]).toMatchObject({ people: 1, suppressed: true, codes: null, decisions: null });
    for (const u of people(4, "p"))
      submitAuditor(
        db,
        u,
        c.id,
        {
          blockId: "vc",
          state: {
            ...good(),
            requests: [...good().requests, "police"],
            marks: [...careful(DOT_GARDENER).filter((m) => m.fieldId !== "v-quote-hourly"), mark("v-quote-hourly", "material_gap")],
          },
        },
        now,
      );
    const s = auditorStats(db, jordan, c.id).blocks[0];
    expect(s).toMatchObject({ people: 5, suppressed: false, decisions: { request_evidence: 5 } });
    expect(s.codes).toMatchObject({ screening_both_required: 4, median_as_cap: 4 });
    expect(s.unnecessaryRequests).toEqual({ police: 4 });
    expect(() => auditorStats(db, riley, c.id)).toThrow();
  });

  it("lists each published case with versions and aggregate results, never a learner’s words or a supplier record", () => {
    const c = course(signed());
    for (const u of [riley, ...people(4, "r")]) submitAuditor(db, u, c.id, { blockId: "vc", state: good() }, now);
    const rows = auditorRegister(db, now);
    const r = rows.find((x) => x.guideId === c.id)!;
    expect(r).toMatchObject({
      kind: "Contractor Vetting Card",
      started: 5,
      submitted: 5,
      people: 5,
      suppressed: false,
      jobAid: "choosing-and-checking-your-contractor",
      mode: "formative",
    });
    expect(r.version).toMatch(/dot-gardener-1/);
    expect(r.decisions).toBe("request_evidence 5/5");
    const text = JSON.stringify(r);
    for (const secret of ["DEAR DOT", "THE LEARNER’S OWN", "A NOTE ONLY", "45 678 901 234"]) expect(text, secret).not.toContain(secret);
  });
});
