import { beforeEach, describe, expect, it } from "vitest";
import { openDb, type Db } from "./db";
import { userById, type User } from "./auth";
import { completeGuide, createGuide, finishPage, publishGuide, readGuide, recordGuideEvent, saveGuideDraft } from "./magazine";
import {
  activateRole,
  approveCompetency,
  askForObservation,
  capAccess,
  corrections,
  decideMapping,
  framework,
  heatmap,
  importPeople,
  myCapabilities,
  people,
  personCapabilities,
  proposeMapping,
  qualityApproveRole,
  recordEvidence,
  recordObservation,
  requestCorrection,
  resolveCorrection,
  rolePreview,
  saveCompetency,
  saveRole,
  saveRoleDraft,
  setAccess,
  setPerson,
  startPilot,
  teamCapabilities,
  withdrawObservation,
} from "./capability";
import { exportCapability } from "./capabilityExport";
import { summarise } from "@/lib/capability";

/* Capability Intelligence: an evidence view. Each stage has its own evidence, approvals are by name, and records are private. */

let db: Db;
let jordan: User, dana: User, morgan: User, hamish: User, riley: User, sam: User, ash: User, casey: User;
const now = new Date("2026-11-20T00:00:00Z");
const later = (days: number) => new Date(now.getTime() + days * 86_400_000);
const TOPIC = "noticing-a-change";

const BEHAVIOURS = ["Identifies missing detail on an invoice.", "Follows the reviewed process to clarify before approving."];

/** One approved competency in an active "Care coordinator" role (partner population), with riley in it. */
function pilot(opts: { target?: string; highRisk?: boolean; refreshMonths?: number | null } = {}) {
  const { id } = saveCompetency(
    db,
    jordan,
    { name: "Invoice verification", group: "Funding", definition: "Checks an invoice before it is approved.", behaviours: BEHAVIOURS, highRisk: opts.highRisk },
    now,
  );
  approveCompetency(db, jordan, id, now);
  const role = saveRole(db, jordan, { name: "Care coordinator", domain: "partner" }, now).id;
  saveRoleDraft(
    db,
    jordan,
    role,
    { requirements: [{ competencyId: id, target: opts.target ?? "verified", criticality: "core", refreshMonths: opts.refreshMonths ?? null }] },
    now,
  );
  if (opts.highRisk) qualityApproveRole(db, jordan, role, now);
  activateRole(db, jordan, role, now);
  setPerson(db, jordan, "riley", { roleId: role, team: "North" }, now);
  return { competencyId: id, role };
}
const map = (competencyId: string, assetKey: string, relation: string, approve = true) => {
  const { id } = proposeMapping(db, dana, { competencyId, assetKey, relation }, now);
  if (approve) decideMapping(db, jordan, id, { approve: true }, now);
  return id;
};
const completeTopic = (userId: string, evidence: object = {}, via: string | null = null, at = now) =>
  db
    .prepare("INSERT INTO lesson_completions (user_id, lesson_slug, lesson_version, completed_at, via, evidence) VALUES (?, ?, '1.0-demo', ?, ?, ?)")
    .run(userId, TOPIC, at.toISOString(), via, JSON.stringify(evidence));
const mine = (u: User = riley, at = now) => myCapabilities(db, u, at).competencies[0];

beforeEach(() => {
  db = openDb(":memory:");
  [jordan, dana, morgan, hamish, riley, sam, ash, casey] = ["jordan", "dana", "morgan", "hamish", "riley", "sam", "ash", "casey"].map((id) =>
    userById(db, id)!,
  );
});

describe("who can do what", () => {
  it("gives no one capability access by default, except the superadmin who grants it", () => {
    expect(() => framework(db, riley)).toThrow(/access/);
    expect(() => framework(db, casey)).toThrow(/access/);
    expect(capAccess(db, dana)).toMatchObject({ pc: false, partnerOps: false, quality: false, author: true });
    // The Hub's compliance reviewers are Quality already.
    expect(capAccess(db, morgan).quality).toBe(true);
    expect(() => setAccess(db, dana, { userId: "dana", role: "pc" }, now)).toThrow(/superadmin/);
    expect(() => setAccess(db, jordan, { userId: "riley", role: "pc" }, now)).toThrow(/staff/);
    setAccess(db, jordan, { userId: "dana", role: "pc" }, now);
    expect(capAccess(db, dana).pc).toBe(true);
    setAccess(db, jordan, { userId: "dana", role: "pc", on: false }, now);
    expect(capAccess(db, dana).pc).toBe(false);
  });

  it("keeps the employee and partner populations with their own owners", () => {
    setAccess(db, jordan, { userId: "dana", role: "pc" }, now);
    setAccess(db, jordan, { userId: "hamish", role: "partner_ops" }, now);
    const { role } = pilot();
    // People & Culture owns employees: they can't see or set a partner, or add a partner role.
    expect(people(db, dana).people.map((p) => p.id)).not.toContain("riley");
    expect(people(db, hamish).people.map((p) => p.id)).toContain("riley");
    expect(() => setPerson(db, dana, "riley", { team: "South" }, now)).toThrow(/population you own/);
    expect(() => saveRole(db, dana, { name: "Partner role", domain: "partner" }, now)).toThrow(/partner framework/);
    expect(() => heatmap(db, dana, role, now)).toThrow(/access/);
    expect(() => personCapabilities(db, dana, "riley", now)).toThrow(/isn’t available/);
    // An employee can't be put in a partner role: the totals must never mix.
    expect(() => setPerson(db, jordan, "dana", { roleId: role }, now)).toThrow(/role for external partners/);
  });
});

describe("the framework", () => {
  it("starts the pilot as drafts that change nothing until they're approved and made active", () => {
    const { roleId } = startPilot(db, jordan, now);
    const f = framework(db, jordan);
    expect(f.competencies).toHaveLength(12);
    expect(f.competencies.every((c) => c.current === null && c.draft?.status === "draft")).toBe(true);
    expect(f.roles[0]).toMatchObject({ name: "Care coordinator", domain: "partner", active: null });
    setPerson(db, jordan, "riley", { roleId }, now);
    expect(myCapabilities(db, riley, now)).toMatchObject({ role: null, pending: true, competencies: [] });
    // Nothing can be made active until every competency has approved wording.
    expect(() => activateRole(db, jordan, roleId, now)).toThrow(/no approved wording/);
    expect(() => startPilot(db, jordan, now)).toThrow(/already has/);
  });

  it("needs Quality for a high-risk competency and for a role that includes one", () => {
    setAccess(db, jordan, { userId: "hamish", role: "partner_ops" }, now);
    const { id } = saveCompetency(
      db,
      hamish,
      { name: "Incident escalation", definition: "Escalates an incident promptly.", behaviours: ["Escalates without delay."], highRisk: true },
      now,
    );
    expect(() => approveCompetency(db, hamish, id, now)).toThrow(/Quality/);
    approveCompetency(db, morgan, id, now);
    const role = saveRole(db, hamish, { name: "Care coordinator", domain: "partner" }, now).id;
    const preview = saveRoleDraft(db, hamish, role, { requirements: [{ competencyId: id, target: "verified", criticality: "high", refreshMonths: 12 }] }, now);
    expect(preview.draft?.blocked).toEqual(["It includes a high-risk competency, so Quality reviews it first."]);
    expect(() => activateRole(db, hamish, role, now)).toThrow(/Quality reviews it first/);
    expect(() => qualityApproveRole(db, hamish, role, now)).toThrow(/Only Quality/);
    qualityApproveRole(db, morgan, role, now);
    // Changing what's asked for sends it back to Quality.
    saveRoleDraft(db, hamish, role, { requirements: [{ competencyId: id, target: "demonstrated" }] }, now);
    expect(() => activateRole(db, hamish, role, now)).toThrow(/Quality/);
    qualityApproveRole(db, morgan, role, now);
    expect(activateRole(db, hamish, role, now)).toEqual({ roleId: role, version: 1 });
  });

  it("keeps the approved wording in use while a reworded draft waits, and shows a change before it's released", () => {
    const { competencyId, role } = pilot();
    saveCompetency(db, jordan, { id: competencyId, name: "Checking invoices", definition: "A new definition.", behaviours: ["One behaviour."] }, later(1));
    expect(mine().name).toBe("Invoice verification");
    expect(mine().version).toBe(1);
    const second = saveCompetency(
      db,
      jordan,
      { name: "Complaints handling", definition: "Receives a complaint well.", behaviours: ["Listens first."] },
      later(1),
    ).id;
    approveCompetency(db, jordan, second, later(1));
    const preview = saveRoleDraft(
      db,
      jordan,
      role,
      {
        requirements: [
          { competencyId, target: "demonstrated" },
          { competencyId: second, target: "practised" },
        ],
      },
      later(1),
    );
    expect(preview.draft).toMatchObject({ version: 2, people: 1, blocked: [] });
    expect(preview.draft!.rows.map((r) => [r.name, r.change])).toEqual([
      ["Invoice verification", "changed"],
      ["Complaints handling", "added"],
    ]);
    // Nothing shows "Demonstrated" for it yet, and the preview says so.
    expect(preview.draft!.rows[0].warnings.join(" ")).toMatch(/reworded draft.*No approved learning shows “Demonstrated”/);
    // Still version 1 for the learner until it's made active.
    expect(myCapabilities(db, riley, later(1)).role?.version).toBe(1);
    approveCompetency(db, jordan, competencyId, later(2));
    activateRole(db, jordan, role, later(2));
    const after = myCapabilities(db, riley, later(2));
    expect(after.role?.version).toBe(2);
    expect(after.competencies.map((c) => [c.name, c.version, c.target])).toEqual([
      ["Checking invoices", 2, "demonstrated"],
      ["Complaints handling", 1, "practised"],
    ]);
    expect(framework(db, jordan).roles[0].history).toMatchObject([{ version: 1 }]);
    expect(rolePreview(db, jordan, role)).toEqual({ roleId: role, draft: null });
  });
});

describe("evidence stages", () => {
  it("shows Introduced for a completed Topic and nothing more", () => {
    const { competencyId } = pilot();
    map(competencyId, `topic:${TOPIC}`, "introduces");
    expect(mine()).toMatchObject({ highest: null, met: false, summary: expect.stringMatching(/No evidence yet/) });
    completeTopic("riley", { "first:check.q1": 1 });
    const c = mine();
    expect(c.highest).toBe("introduced");
    expect(c.stages.introduced).toMatchObject([{ kind: "topic", version: "1.0-demo" }]);
    expect(c.stages.practised).toEqual([]);
    expect(c.stages.demonstrated).toEqual([]);
    expect(c.stages.verified).toEqual([]);
    expect(c.summary).toBe("Learning completed; workplace verification pending.");
    // The role asks for Verified at work, so the next step is the observation.
    expect(c.next).toMatchObject({ action: "ask" });
  });

  it("counts nothing from a mapping that hasn't been approved, or was rejected", () => {
    const { competencyId } = pilot();
    const id = map(competencyId, `topic:${TOPIC}`, "introduces", false);
    completeTopic("riley");
    expect(mine().highest).toBeNull();
    // Authors propose; they can't approve.
    expect(() => decideMapping(db, dana, id, { approve: true }, now)).toThrow(/owners or Quality/);
    decideMapping(db, jordan, id, { approve: false, note: "Too general." }, now);
    expect(mine().highest).toBeNull();
    decideMapping(db, jordan, id, { approve: true }, now);
    expect(mine().highest).toBe("introduced");
    expect(framework(db, jordan).competencies[0].mappings[0]).toMatchObject({ status: "approved", decidedBy: "Lance Elliott", proposedBy: "Dana Okafor" });
  });

  it("doesn't count testing out of a Topic as having been through it", () => {
    const { competencyId } = pilot();
    map(competencyId, `topic:${TOPIC}`, "introduces");
    completeTopic("riley", {}, "path-quiz:lp-care-coordination");
    expect(mine().highest).toBeNull();
  });

  it("shows Practised from decisions answered, and Demonstrated only from an approved assessment", () => {
    const { competencyId } = pilot({ target: "demonstrated" });
    map(competencyId, `topic:${TOPIC}`, "practises");
    completeTopic("riley", { "first:check.q1": 0 });
    expect(mine()).toMatchObject({ highest: "practised", met: false, summary: "Practice evidence present; assessment pending." });

    // A passed path quiz is only evidence once the quiz is mapped and approved as assessing this.
    db.prepare("UPDATE learning_paths SET quiz = ? WHERE id = 'lp-care-coordination'").run(JSON.stringify({ questions: null, passMark: 80, attempts: 1 }));
    db.prepare(
      "INSERT INTO path_quiz_attempts (path_id, user_id, questions, answers, score, total, pass_mark, passed, started_at, submitted_at) VALUES ('lp-care-coordination', 'riley', '[]', '{}', 4, 5, 80, 1, ?, ?)",
    ).run(now.toISOString(), now.toISOString());
    expect(mine().highest).toBe("practised");
    // A Topic without an assessment can't be mapped as assessing, and a page can't assess at all.
    expect(() => proposeMapping(db, dana, { competencyId, assetKey: `topic:${TOPIC}`, relation: "assesses" }, now)).toThrow(/assessment mode/);
    map(competencyId, "quiz:lp-care-coordination", "assesses");
    const c = mine();
    expect(c).toMatchObject({ highest: "demonstrated", met: true, next: null });
    expect(c.stages.demonstrated).toMatchObject([{ kind: "quiz", detail: "4 of 5", version: "attempt 1" }]);
    // A cleared attempt stops counting.
    db.prepare("UPDATE path_quiz_attempts SET cleared_at = ? WHERE user_id = 'riley'").run(now.toISOString());
    expect(mine().highest).toBe("practised");
  });

  it("reads Magazine completions, page finishes and decisions, and never private notes or Quick review", () => {
    const { competencyId } = pilot({ target: "practised" });
    const pages = [
      {
        id: "p1",
        title: "The invoice",
        purpose: "",
        template: "blank",
        kind: "content",
        required: true,
        allActivities: false,
        sections: [{ id: "s1", title: "S", blocks: [{ id: "t1", type: "text", body: "An invoice." }] }],
      },
      {
        id: "p2",
        title: "The rate does not match",
        purpose: "",
        template: "blank",
        kind: "content",
        required: true,
        allActivities: false,
        sections: [
          {
            id: "s2",
            title: "S",
            blocks: [
              {
                id: "d1",
                type: "decision",
                prompt: "What do you do?",
                choices: [
                  { id: "a", text: "Clarify it", verdict: "best", feedback: "Yes." },
                  { id: "b", text: "Approve it", verdict: "risky", feedback: "No." },
                ],
              },
            ],
          },
        ],
      },
    ];
    const c = createGuide(db, jordan, { title: "Checking invoices", completion: "confirm", doc: { schema: 2, pages } }, now);
    publishGuide(db, jordan, c.id, "", now, { allowUnverified: true });
    map(competencyId, `page:${c.id}:p1`, "introduces");
    map(competencyId, `page:${c.id}:p2`, "practises");
    expect(() => proposeMapping(db, dana, { competencyId, assetKey: `page:${c.id}:p1`, relation: "practises" }, now)).toThrow(/no decisions/);
    // A private journal entry and a Quick review answer are nobody's evidence.
    db.prepare(
      "INSERT INTO magazine_notes (guide_id, user_id, block_id, kind, body, created_at, updated_at) VALUES (?, 'riley', 'j1', 'journal', 'I always check the rate.', ?, ?)",
    ).run(c.id, now.toISOString(), now.toISOString());
    expect(mine().highest).toBeNull();
    const g = readGuide(db, riley, c.slug);
    finishPage(db, riley, c.slug, g.revisionId, "p1", later(1));
    expect(mine(riley, later(1))).toMatchObject({ highest: "introduced", next: { href: `/magazine/${c.slug}/p2` } });
    recordGuideEvent(db, riley, c.slug, { event: "decision", revisionId: g.revisionId, pageId: "p2", sectionId: "s2", blockId: "d1", choiceId: "a" }, later(2));
    expect(mine(riley, later(2))).toMatchObject({ highest: "practised", met: true });
    finishPage(db, riley, c.slug, g.revisionId, "p2", later(2));
    completeGuide(db, riley, c.slug, g.revisionId, later(2));
    expect(mine(riley, later(2)).stages.demonstrated).toEqual([]);

    // Republishing the page flags its mapping for another look. The evidence already earned stays.
    pages[0] = { ...pages[0], title: "The invoice, revised" };
    saveGuideDraft(db, jordan, c.id, { doc: { schema: 2, pages } }, later(3));
    publishGuide(db, jordan, c.id, "Edit", later(3), { allowUnverified: true });
    const f = framework(db, jordan);
    expect(f.changed).toBe(1);
    expect(f.competencies[0].mappings.map((m) => [m.label, m.changed])).toEqual([
      ["The invoice, revised", true],
      ["The rate does not match", false],
    ]);
    expect(mine(riley, later(3)).stages.introduced).toHaveLength(1);
  });

  it("flags old evidence as needing a refresh without removing it", () => {
    const { competencyId } = pilot({ target: "introduced", refreshMonths: 12 });
    map(competencyId, `topic:${TOPIC}`, "introduces");
    completeTopic("riley");
    expect(mine(riley, later(30))).toMatchObject({ met: true, stale: false });
    const old = mine(riley, later(400));
    expect(old).toMatchObject({ met: false, stale: true, highest: "introduced", summary: "Introduced, but the evidence is due a refresh." });
    expect(old.stages.introduced).toMatchObject([{ stale: true }]);
    expect(old.next).toMatchObject({ href: `/topics/${TOPIC}` });
  });

  it("words the summary so unknown never reads as a judgement", () => {
    const none = { introduced: [], practised: [], demonstrated: [], verified: [] };
    expect(summarise(none, "verified")).toMatch(/hasn’t been recorded, not that you can’t do it/);
  });
});

describe("observations", () => {
  it("lets only the person's manager sign off, against the whole rubric, with a reason", () => {
    const { competencyId } = pilot();
    askForObservation(db, riley, competencyId, now);
    const obs = {
      userId: "riley",
      competencyId,
      decision: "verified",
      rationale: "Watched Riley check three invoices and query a rate.",
      behaviours: BEHAVIOURS,
      observedOn: "2026-11-19",
    };
    // Riley reports to Jordan. Not themselves, not another manager, not an author.
    expect(() => recordObservation(db, riley, obs, now)).toThrow(/report to you/);
    expect(() => recordObservation(db, casey, obs, now)).toThrow(/report to you/);
    expect(() => recordObservation(db, dana, obs, now)).toThrow(/report to you/);
    const team = teamCapabilities(db, jordan, now);
    expect(team.queue).toMatchObject([{ person: "Riley Morgan", competency: "Invoice verification", state: "due", askedAt: now.toISOString() }]);
    expect(() => recordObservation(db, jordan, { ...obs, rationale: "ok" }, now)).toThrow(/what you saw/);
    expect(() => recordObservation(db, jordan, { ...obs, behaviours: [BEHAVIOURS[0]] }, now)).toThrow(/tick each behaviour/);
    expect(() => recordObservation(db, jordan, { ...obs, observedOn: "2027-01-01" }, now)).toThrow(/future/);

    // Not there yet: recorded, shown to the learner, and nothing reads as verified.
    recordObservation(
      db,
      jordan,
      { ...obs, decision: "more_practice", behaviours: [BEHAVIOURS[0]], rationale: "Missed the rate mismatch on the second invoice." },
      now,
    );
    expect(mine()).toMatchObject({ highest: null, morePractice: { by: "Lance Elliott" }, askedAt: null });
    recordObservation(db, jordan, obs, later(1));
    const c = mine(riley, later(1));
    expect(c).toMatchObject({ highest: "verified", met: true, summary: "Verified at work.", morePractice: null });
    expect(c.stages.verified).toMatchObject([{ by: "Lance Elliott", at: "2026-11-19", version: "competency version 1" }]);
    // The earlier one is kept, marked superseded.
    const all = personCapabilities(db, jordan, "riley", later(1)).observations;
    expect(all.map((o) => [o.decision, o.superseded])).toEqual([
      ["verified", false],
      ["more_practice", true],
    ]);
    expect(teamCapabilities(db, jordan, later(1)).queue).toEqual([]);
    // The audit says who and what, not the words.
    expect(JSON.stringify(db.prepare("SELECT * FROM audit WHERE event LIKE 'capability.observation%'").all())).not.toContain("invoices");
  });

  it("withdraws a sign-off with a reason and keeps it on record", () => {
    const { competencyId } = pilot();
    const { id } = recordObservation(
      db,
      jordan,
      { userId: "riley", competencyId, decision: "verified", rationale: "Watched Riley check three invoices.", behaviours: BEHAVIOURS },
      now,
    );
    expect(() => withdrawObservation(db, casey, id, "Not valid at all.", now)).toThrow(/Only the person who signed it/);
    expect(() => withdrawObservation(db, jordan, id, "no", now)).toThrow(/why/);
    withdrawObservation(db, jordan, id, "Signed against the wrong person.", later(1));
    expect(mine(riley, later(1)).highest).toBeNull();
    expect(personCapabilities(db, jordan, "riley", later(1)).observations[0]).toMatchObject({
      withdrawn: { by: "Lance Elliott", reason: "Signed against the wrong person." },
    });
  });

  it("never shows Verified at work from learning, an assessment or a hand-recorded item", () => {
    const { competencyId } = pilot();
    map(competencyId, `topic:${TOPIC}`, "introduces");
    map(competencyId, `topic:${TOPIC}`, "practises");
    completeTopic("riley", { "first:check.q1": 1 });
    expect(mine().stages.verified).toEqual([]);
    expect(() =>
      recordEvidence(
        db,
        jordan,
        { userId: "riley", competencyId, stage: "verified", description: "Manager says they can do it.", evidenceOn: "2026-11-01" },
        now,
      ),
    ).toThrow(/only ever shown by an observation/);
    recordEvidence(
      db,
      jordan,
      { userId: "riley", competencyId, stage: "demonstrated", description: "Assessment passed at induction, checked by P&C.", evidenceOn: "2026-11-01" },
      now,
    );
    expect(mine()).toMatchObject({ highest: "demonstrated", met: false });
    expect(mine().stages.demonstrated).toMatchObject([{ kind: "record", by: "Lance Elliott" }]);
  });
});

describe("privacy, corrections and the handoff", () => {
  it("shows a profile to the person, their manager and their population's owner, and no one else", () => {
    pilot();
    expect(myCapabilities(db, riley, now).person.name).toBe("Riley Morgan");
    expect(personCapabilities(db, jordan, "riley", now).person.id).toBe("riley");
    // Another org's admin, an author, Quality and a peer all get the same "not available".
    for (const u of [casey, dana, morgan, sam]) expect(() => personCapabilities(db, u, "riley", now)).toThrow(/isn’t available/);
    expect(teamCapabilities(db, casey, now).team.map((p) => p.person.id)).toEqual(["sam"]);
    expect(teamCapabilities(db, dana, now)).toMatchObject({ isManager: false, team: [], queue: [] });
    // Looking at someone's record is itself recorded.
    expect(db.prepare("SELECT COUNT(*) AS n FROM audit WHERE event = 'capability.profile_viewed' AND entity = 'user:riley'").get()).toEqual({ n: 1 });
  });

  it("answers a correction by name, records what was missing, and rewrites nothing", () => {
    const { competencyId } = pilot({ target: "demonstrated" });
    expect(() => requestCorrection(db, riley, { competencyId, message: "wrong" }, now)).toThrow(/what’s wrong or missing/);
    expect(() => requestCorrection(db, sam, { competencyId, message: "I passed this last month." }, now)).toThrow(/for your role/);
    requestCorrection(db, riley, { competencyId, message: "I passed the invoice assessment at my induction in October." }, now);
    expect(() => requestCorrection(db, riley, { competencyId, message: "Asking again about the same thing." }, now)).toThrow(/already have a request open/);
    const [c] = corrections(db, jordan).corrections;
    expect(c).toMatchObject({ person: "Riley Morgan", state: "open" });
    expect(() => corrections(db, dana)).toThrow(/owners/);
    expect(() => resolveCorrection(db, jordan, c.id, { state: "resolved", resolution: "ok" }, later(1))).toThrow(/what you found/);
    resolveCorrection(
      db,
      jordan,
      c.id,
      {
        state: "resolved",
        resolution: "Confirmed with the induction record. Added.",
        stage: "demonstrated",
        description: "Induction invoice assessment, confirmed by P&C.",
        evidenceOn: "2026-10-12",
      },
      later(1),
    );
    const me = myCapabilities(db, riley, later(1));
    expect(me.corrections[0]).toMatchObject({ state: "resolved", resolvedBy: "Lance Elliott", resolution: "Confirmed with the induction record. Added." });
    expect(me.competencies[0]).toMatchObject({ highest: "demonstrated", met: true });
    expect(() => resolveCorrection(db, jordan, c.id, { state: "declined", resolution: "Changed my mind about this." }, later(2))).toThrow(
      /already been answered/,
    );
  });

  it("takes a role handoff and reports back what it couldn't match", () => {
    const { role } = pilot();
    const out = importPeople(
      db,
      jordan,
      [
        { person: "sam.taylor@example.com", role: "Care coordinator", team: "West" },
        { person: sam.email, role: "Care coordinator", team: "West", manager: "casey", startDate: "2026-10-01" },
        { person: sam.id, role: "Care coordinator" },
        { person: ash.email, role: "Nurse" },
        { person: dana.email, role: role },
        { person: ash.email, manager: "nobody@example.com" },
      ],
      now,
    );
    expect(out.applied).toBe(1);
    expect(out.unmatched.map((u) => [u.row, u.why])).toEqual([
      [1, "No Hub user has that id or email."],
      [3, "This person is in the list twice: the first row was used."],
      [4, "No role has that name."],
      [5, expect.stringMatching(/role for external partners/)],
      [6, "The manager doesn’t match one Hub user."],
    ]);
    expect(people(db, jordan).people.find((p) => p.id === "sam")).toMatchObject({ roleId: role, team: "West", startDate: "2026-10-01", managerId: "casey" });
    expect(() => importPeople(db, dana, [], now)).toThrow(/owners/);
  });
});

describe("the heatmap", () => {
  it("counts everyone in the role with unknown kept apart, by team", () => {
    const { competencyId, role } = pilot();
    setPerson(db, jordan, "sam", { roleId: role, team: "South" }, now);
    setPerson(db, jordan, "ash", { roleId: role, team: "North" }, now);
    map(competencyId, `topic:${TOPIC}`, "introduces");
    completeTopic("sam");
    recordObservation(
      db,
      jordan,
      { userId: "riley", competencyId, decision: "verified", rationale: "Watched Riley check three invoices.", behaviours: BEHAVIOURS },
      now,
    );
    const h = heatmap(db, jordan, role, now);
    expect(h).toMatchObject({ people: 3, canDrill: true, version: { number: 1 }, observationsWaiting: 2 });
    expect(h.columns.map((c) => c.label)).toEqual(["Everyone in this role", "North", "South"]);
    expect(h.rows[0].cells).toMatchObject([
      { n: 3, verified: 1, introduced: 1, none: 1, met: 1 },
      { n: 2, verified: 1, none: 1 },
      { n: 1, introduced: 1 },
    ]);
    expect(h.rows[0].people?.map((p) => [p.name, p.highest])).toEqual([
      ["Ash Nguyen", null],
      ["Riley Morgan", "verified"],
      ["Sam Taylor", "introduced"],
    ]);
    // Employees with no role aren't partners, so they aren't in this population's "unassigned".
    expect(h.unassigned).toBe(1);
  });

  it("hides small groups and every name from someone who only sees aggregates", () => {
    const { competencyId, role } = pilot();
    setPerson(db, jordan, "sam", { roleId: role, team: "South" }, now);
    setAccess(db, jordan, { userId: "dana", role: "insights" }, now);
    const h = heatmap(db, dana, role, now);
    expect(h.canDrill).toBe(false);
    expect(h.rows[0].people).toBeNull();
    expect(h.rows[0].cells).toEqual([
      { suppressed: true, n: null },
      { suppressed: true, n: null },
      { suppressed: true, n: null },
    ]);
    expect(JSON.stringify(h)).not.toMatch(/Riley|Sam Taylor/);
    // The export follows the same rule, and the individual sheet is refused.
    expect(() => exportCapability(db, dana, role, true, now)).toThrow(/owner can export individual evidence/);
    expect(exportCapability(db, dana, role, false, now).filename).toBe("Capability Care coordinator 2026-11-20.xlsx");
    expect(exportCapability(db, jordan, role, true, now).filename).toMatch(/individual\.xlsx$/);
    expect(
      (db.prepare("SELECT event FROM audit WHERE event LIKE 'capability.exported%' ORDER BY id").all() as { event: string }[]).map((r) => r.event),
    ).toEqual(["capability.exported", "capability.exported_individual"]);
    // With a lower agreed threshold, a group of two shows.
    db.prepare("INSERT INTO settings (key, value) VALUES ('capability_min_cohort', '2')").run();
    expect(heatmap(db, dana, role, now).rows[0].cells[0]).toMatchObject({ suppressed: false, n: 2, none: 2 });
    expect(competencyId).toBeTruthy();
  });

  it("says when 'no evidence yet' is a coverage gap rather than a skills gap", () => {
    const { competencyId, role } = pilot({ target: "demonstrated" });
    expect(heatmap(db, jordan, role, now).rows[0].noRoute).toBe(true);
    db.prepare("UPDATE learning_paths SET quiz = ? WHERE id = 'lp-care-coordination'").run(JSON.stringify({ questions: null, passMark: 80, attempts: 1 }));
    map(competencyId, "quiz:lp-care-coordination", "assesses");
    expect(heatmap(db, jordan, role, now).rows[0].noRoute).toBe(false);
  });
});
