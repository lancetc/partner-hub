import { mkdtempSync } from "node:fs";
import { tmpdir } from "node:os";
import path from "node:path";
import { beforeEach, describe, expect, it } from "vitest";

// Documents are written to a private folder: a throwaway one for the tests. Set before the module reads it.
process.env.HUB_ONBOARDING_DIR = mkdtempSync(path.join(tmpdir(), "hub-onboarding-"));

const { openDb } = await import("./db");
const { userById } = await import("./auth");
const { syncPool } = await import("./questionPool");
const { setAccess, saveCompetency, approveCompetency, myCapabilities, saveRole, saveRoleDraft, activateRole, setPerson } = await import("./capability");
const onboarding = await import("./onboarding");
const diagnostic = await import("./onboardingDiagnostic");
const {
  accessFor,
  activateConfig,
  configView,
  funnel,
  grantOverride,
  mySetup,
  readDocument,
  reportMismatch,
  resolveRequest,
  reviewQueue,
  reviewTask,
  saveConfigDraft,
  saveStep,
  startUsing,
  submitTask,
  uploadDocument,
} = onboarding;
const { answerDiagnostic, baselineReport, baselineSignals, diagnosticState, instruments, poolChoices, publishInstrument, saveInstrument, startDiagnostic } =
  diagnostic;

/* Onboarding: tasks by role, approval before activation, private documents, and a starting-point check that never gates anything. */

type Db = ReturnType<typeof openDb>;
type User = NonNullable<ReturnType<typeof userById>>;
let db: Db;
let jordan: User, dana: User, morgan: User, hamish: User, riley: User, sam: User, ash: User, casey: User;
const now = new Date("2026-11-20T00:00:00Z");
const later = (days: number) => new Date(now.getTime() + days * 86_400_000);
const pdf = (name = "police-check.pdf", body = "%PDF-1.4 test") => new File([body], name, { type: "application/pdf" });

const TASKS = [
  { id: "details", kind: "details", title: "Confirm your details", required: true },
  { id: "code", kind: "acknowledge", title: "Code of Conduct", statement: "I have read the Code of Conduct.", required: true },
  { id: "police", kind: "document", title: "Police check", audiences: ["partner", "coordinator"], required: true, expiryMonths: 12 },
  { id: "insurance", kind: "document", scope: "organisation", title: "Public liability insurance", audiences: ["partner"], required: true, expiryMonths: 12 },
  { id: "start", kind: "diagnostic", title: "Check your starting point", required: false },
  // A core-track Topic, so every role can open it (each role's own first course is a starting course: server/onboardingCourses).
  { id: "first", kind: "learning", title: "Your first Topic", asset: "topic:legislative-framework", required: false },
  { id: "photo", kind: "document", title: "A photo for your profile", required: false },
];
function release(tasks: unknown[] = TASKS, existing: string[] = []) {
  saveConfigDraft(db, jordan, { tasks }, now);
  return activateConfig(db, jordan, { existing }, now);
}
const task = (u: User, id: string, at = now) => mySetup(db, u, at).tasks.find((t) => t.id === id)!;
/** Does everything Riley can do alone, then has their police check approved. */
async function rileyReady() {
  submitTask(db, riley, "details", { name: "Riley Morgan" }, now);
  submitTask(db, riley, "code", { agree: true }, now);
  await uploadDocument(db, riley, "police", pdf(), now);
  submitTask(db, riley, "police", {}, now);
  reviewTask(db, jordan, task(riley, "police").rowId, { decision: "approve" }, later(1));
}

beforeEach(() => {
  db = openDb(":memory:");
  [jordan, dana, morgan, hamish, riley, sam, ash, casey] = ["jordan", "dana", "morgan", "hamish", "riley", "sam", "ash", "casey"].map((id) =>
    userById(db, id)!,
  );
});

describe("the requirements matrix", () => {
  it("asks nothing of anyone until a matrix is released, and only its owners can change it", () => {
    expect(mySetup(db, riley, now)).toMatchObject({ configured: false, tasks: [], wizard: false });
    expect(accessFor(db, riley, now)).toMatchObject({ configured: false, full: true });
    expect(() => configView(db, riley)).toThrow(/managed by/);
    expect(() => saveConfigDraft(db, dana, { tasks: TASKS }, now)).toThrow(/Only People & Culture or Partner Operations/);
    expect(() => saveConfigDraft(db, jordan, { tasks: [{ kind: "acknowledge", title: "Policy" }] }, now)).toThrow(/needs the statement/);
    expect(() => saveConfigDraft(db, jordan, { tasks: [{ kind: "learning", title: "Topic", asset: "topic:nope" }] }, now)).toThrow(/published Topic/);
    const view = saveConfigDraft(db, jordan, { tasks: TASKS }, now);
    expect(view.changes?.added).toHaveLength(7);
    // A draft changes nothing for anyone.
    expect(mySetup(db, riley, now).configured).toBe(false);
    expect(activateConfig(db, jordan, {}, now).active).toMatchObject({ version: 1, approvedBy: "Lance Elliott" });
  });

  it("gives each person only the tasks for who they are", () => {
    release();
    // A coordinator: their own police check, and nothing for their organisation.
    expect(mySetup(db, riley, now).tasks.map((t) => t.id)).toEqual(["details", "code", "police", "first", "photo"]);
    // A Care Partner also waits on their organisation's insurance, which isn't theirs to do. "Your first Topic" is a
    // core Topic, so a Care Partner gets it too.
    expect(mySetup(db, sam, now).tasks.map((t) => [t.id, t.mine])).toEqual([
      ["details", true],
      ["code", true],
      ["police", true],
      ["insurance", false],
      ["first", true],
      ["photo", true],
    ]);
    // Staff have no police check here. The starting-point check isn't offered until one is published for the role.
    expect(mySetup(db, dana, now).tasks.map((t) => t.id)).toEqual(["details", "code", "first", "photo"]);
    expect(mySetup(db, riley, now)).toMatchObject({
      state: "not_started",
      wizard: true,
      person: { role: "Care coordinator", organisation: "Northside Coordination (demo)" },
    });
  });

  it("adds a task for new starters without resetting people who are already active, unless the owner says so", async () => {
    release();
    await rileyReady();
    startUsing(db, riley, later(1));
    expect(mySetup(db, riley, later(1)).state).toBe("active");
    const extra = { id: "privacy", kind: "acknowledge", title: "Privacy statement", statement: "I have read the privacy statement.", required: true };
    saveConfigDraft(db, jordan, { tasks: [...TASKS, extra] }, later(2));
    activateConfig(db, jordan, { existing: [] }, later(2));
    // Riley was already active: nothing new, and everything they did still stands.
    expect(mySetup(db, riley, later(2))).toMatchObject({ state: "active", configVersion: 2 });
    expect(task(riley, "police", later(2)).status).toBe("approved");
    // Sam hasn't started, so it's theirs to do.
    expect(mySetup(db, sam, later(2)).tasks.map((t) => t.id)).toContain("privacy");
    // Applied to existing people instead, it becomes a targeted renewal: one new task, not the whole wizard.
    const second = { id: "safety", kind: "acknowledge", title: "Safety statement", statement: "I have read it.", required: true };
    saveConfigDraft(db, jordan, { tasks: [...TASKS, extra, second] }, later(3));
    activateConfig(db, jordan, { existing: ["safety"] }, later(3));
    const after = mySetup(db, riley, later(3));
    expect(after).toMatchObject({ state: "renewal", waitingOn: "you", wizard: false });
    expect(after.sections.next).toEqual(["safety"]);
  });
});

describe("a person's setup", () => {
  it("saves as it goes, picks up where it left off, and is ready only when required tasks are approved", async () => {
    release();
    saveStep(db, riley, { step: "code" }, now);
    expect(mySetup(db, riley, now)).toMatchObject({ lastStep: "code", state: "in_progress", wizard: true });
    expect(() => submitTask(db, riley, "details", { name: "R" }, now)).toThrow(/name/);
    submitTask(db, riley, "details", { name: "Riley J Morgan" }, now);
    expect(userById(db, "riley")?.name).toBe("Riley J Morgan");
    expect(() => submitTask(db, riley, "code", {}, now)).toThrow(/Tick the box/);
    submitTask(db, riley, "code", { agree: true }, now);
    // Doing it again (a double press, a second device) changes nothing.
    submitTask(db, riley, "code", { agree: true }, now);
    expect(db.prepare("SELECT COUNT(*) AS n FROM onb_tasks WHERE subject_id = 'riley'").get()).toEqual({ n: 2 });

    await uploadDocument(db, riley, "police", pdf(), now);
    expect(task(riley, "police")).toMatchObject({ status: "in_progress", document: { name: "police-check.pdf" } });
    submitTask(db, riley, "police", {}, now);
    // Submitted isn't approved: not ready, not "all complete", and not Riley's move.
    const waiting = mySetup(db, riley, now);
    expect(waiting).toMatchObject({ state: "awaiting_review", waitingOn: "reviewer", canStart: false });
    expect(waiting.sections).toMatchObject({ next: [], waiting: ["police"], done: ["details", "code"], optional: ["first", "photo"] });
    expect(() => startUsing(db, riley, now)).toThrow(/waiting for review/);
    expect(accessFor(db, riley, now)).toMatchObject({ full: false, outstanding: 1 });

    reviewTask(db, jordan, task(riley, "police").rowId, { decision: "approve" }, later(1));
    // Optional tasks never block.
    expect(mySetup(db, riley, later(1))).toMatchObject({ state: "ready", canStart: true });
    expect(startUsing(db, riley, later(1))).toMatchObject({ state: "active", wizard: false });
    expect(accessFor(db, riley, later(1)).full).toBe(true);
  });

  it("sends a correction back with a reason, and takes the resubmission without restarting", async () => {
    release();
    await uploadDocument(db, riley, "police", pdf(), now);
    submitTask(db, riley, "police", {}, now);
    const rowId = task(riley, "police").rowId;
    // A file with a reviewer can't be swapped underneath them.
    await expect(uploadDocument(db, riley, "police", pdf("other.pdf"), now)).rejects.toThrow(/with a reviewer/);
    expect(() => reviewTask(db, jordan, rowId, { decision: "correct", reason: "no" }, later(1))).toThrow(/specifically/);
    reviewTask(db, jordan, rowId, { decision: "correct", reason: "The check is more than three years old." }, later(1));
    expect(() => reviewTask(db, jordan, rowId, { decision: "approve" }, later(1))).toThrow(/already been reviewed/);
    expect(task(riley, "police", later(1))).toMatchObject({
      status: "needs_action",
      reason: "The check is more than three years old.",
      reference: rowId!.toUpperCase(),
    });
    expect(mySetup(db, riley, later(1))).toMatchObject({ state: "needs_action", waitingOn: "you" });
    // They're told in the Inbox, without the document's details.
    const note = db.prepare("SELECT title, body, href FROM notifications WHERE user_id = 'riley' AND category = 'Your setup'").get() as {
      title: string;
      body: string;
      href: string;
    };
    expect(note).toMatchObject({ title: "Needs a correction: Police check", href: "/onboarding#task-police" });
    expect(note.body).not.toMatch(/three years|police-check/);

    await uploadDocument(db, riley, "police", pdf("police-check-2026.pdf"), later(2));
    submitTask(db, riley, "police", {}, later(2));
    expect(task(riley, "police", later(2))).toMatchObject({ status: "submitted", rowId, document: { name: "police-check-2026.pdf" } });
    expect(reviewQueue(db, jordan, {}, later(3)).items).toMatchObject([{ who: "Riley Morgan", task: "Police check", resubmitted: true, days: 1 }]);
  });

  it("checks what a file really is, and refuses one that's too big", async () => {
    release();
    await expect(uploadDocument(db, riley, "police", new File(["<html>"], "check.pdf", { type: "application/pdf" }), now)).rejects.toThrow(/isn’t a PDF/);
    await expect(uploadDocument(db, riley, "police", new File([new Uint8Array(11 * 1024 * 1024)], "big.pdf"), now)).rejects.toThrow(/over 10 MB/);
    await expect(uploadDocument(db, riley, "code", pdf(), now)).rejects.toThrow(/doesn’t take a file/);
    await expect(uploadDocument(db, dana, "police", pdf(), now)).rejects.toThrow(/isn’t one of your setup tasks/);
  });

  it("flags an approval that's running out, and keeps it standing while a renewal is reviewed", async () => {
    release();
    await rileyReady();
    startUsing(db, riley, later(1));
    expect(task(riley, "police", later(300)).status).toBe("approved");
    expect(task(riley, "police", later(350))).toMatchObject({ status: "renew", ok: true });
    expect(mySetup(db, riley, later(350)).state).toBe("active");
    // A renewal sent in early doesn't cost them access while it's reviewed.
    await uploadDocument(db, riley, "police", pdf("renewed.pdf"), later(350));
    submitTask(db, riley, "police", {}, later(350));
    expect(task(riley, "police", later(351))).toMatchObject({ status: "submitted", ok: true });
    expect(mySetup(db, riley, later(351)).state).toBe("active");
    // Left to run out, it stops counting and says so.
    expect(mySetup(db, riley, later(380))).toMatchObject({ state: "renewal", waitingOn: "reviewer" });
    reviewTask(db, jordan, task(riley, "police", later(380)).rowId, { decision: "approve", validUntil: "2028-01-31" }, later(380));
    expect(task(riley, "police", later(381))).toMatchObject({ status: "approved", expiresAt: "2028-01-31T23:59:59.000Z" });
  });

  it("asks again when a statement is reworded", () => {
    release();
    submitTask(db, riley, "code", { agree: true }, now);
    expect(task(riley, "code").status).toBe("approved");
    release(TASKS.map((t) => (t.id === "code" ? { ...t, statement: "I have read the Code of Conduct (2027)." } : t)));
    expect(task(riley, "code").status).toBe("not_started");
  });

  it("lets a person ask about their role without changing it", () => {
    release();
    expect(() => reportMismatch(db, riley, { message: "wrong" }, now)).toThrow(/what’s wrong/);
    reportMismatch(db, riley, { message: "I’m a Care Partner, not a coordinator." }, now);
    expect(userById(db, "riley")?.audience).toBe("coordinator");
    expect(() => reportMismatch(db, riley, { message: "Asking again about my role." }, now)).toThrow(/already asked/);
    const [req] = reviewQueue(db, jordan, {}, now).requests;
    expect(req).toMatchObject({ person: "Riley Morgan", role: "Care coordinator" });
    resolveRequest(db, jordan, req.id, { resolution: "Checked with your organisation: coordinator is right." }, later(1));
    expect(mySetup(db, riley, later(1)).request).toMatchObject({ state: "resolved", resolution: "Checked with your organisation: coordinator is right." });
  });

  it("allows a dated exception, by name and with a reason", async () => {
    release();
    submitTask(db, riley, "details", { name: "Riley Morgan" }, now);
    submitTask(db, riley, "code", { agree: true }, now);
    expect(() => grantOverride(db, dana, { userId: "riley", reason: "Starting Monday, check in the post.", expiresOn: "2026-12-01" }, now)).toThrow(/owner/);
    expect(() => grantOverride(db, jordan, { userId: "riley", reason: "Starting Monday, check in the post.", expiresOn: "2028-01-01" }, now)).toThrow(
      /three months/,
    );
    grantOverride(db, jordan, { userId: "riley", reason: "Starting Monday, check in the post.", expiresOn: "2026-12-01" }, now);
    expect(mySetup(db, riley, now)).toMatchObject({ canStart: true, override: { until: "2026-12-01", by: "Lance Elliott" } });
    expect(accessFor(db, riley, now)).toMatchObject({ full: true, override: true });
    startUsing(db, riley, now);
    // When the exception ends, the requirement is still outstanding.
    expect(accessFor(db, riley, later(30))).toMatchObject({ full: false, override: false });
    expect(mySetup(db, riley, later(30)).state).toBe("renewal");
  });
});

describe("organisations", () => {
  it("does an organisation's requirement once, for all its people, through its administrator", async () => {
    release();
    // Sam can't do the organisation's task; Casey, the administrator, can.
    await expect(uploadDocument(db, sam, "insurance", pdf("insurance.pdf"), now)).rejects.toThrow(/administrator does this one/);
    expect(task(casey, "insurance").mine).toBe(true);
    await uploadDocument(db, casey, "insurance", pdf("insurance.pdf"), now);
    submitTask(db, casey, "insurance", {}, now);
    expect(task(sam, "insurance")).toMatchObject({ status: "submitted", mine: false });
    reviewTask(db, jordan, task(casey, "insurance").rowId, { decision: "approve" }, later(1));
    // One approval covers Sam and Casey, and no one in another organisation.
    expect(task(sam, "insurance", later(1)).status).toBe("approved");
    expect(task(ash, "insurance", later(1)).status).toBe("not_started");
    expect(db.prepare("SELECT COUNT(*) AS n FROM onb_tasks WHERE task_id = 'insurance'").get()).toEqual({ n: 1 });
    // The administrator is told; a person waiting on their organisation isn't blamed for it.
    expect(db.prepare("SELECT COUNT(*) AS n FROM notifications WHERE user_id = 'casey' AND category = 'Your setup'").get()).toEqual({ n: 1 });
    expect(mySetup(db, ash, now)).toMatchObject({ waitingOn: "you" });
    submitTask(db, ash, "details", { name: "Ash Nguyen" }, now);
    submitTask(db, ash, "code", { agree: true }, now);
    await uploadDocument(db, ash, "police", pdf(), now);
    submitTask(db, ash, "police", {}, now);
    reviewTask(db, jordan, task(ash, "police").rowId, { decision: "approve" }, now);
    expect(mySetup(db, ash, now)).toMatchObject({ state: "awaiting_review", waitingOn: "organisation" });
  });

  it("shows an administrator where their people are up to, and nothing of what they answered or uploaded", async () => {
    release();
    await uploadDocument(db, sam, "police", pdf("sams-check.pdf"), now);
    const view = mySetup(db, casey, now);
    expect(view.people).toMatchObject([{ id: "sam", name: "Sam Taylor", state: "in_progress", done: 0, of: 3 }]);
    expect(JSON.stringify(view.people)).not.toContain("sams-check");
    expect(mySetup(db, sam, now).people).toBeNull();
    // Their own person's document isn't theirs to open.
    expect(() => readDocument(db, casey, task(sam, "police").document!.id, now)).toThrow(/isn’t available/);
  });
});

describe("documents and reviewers", () => {
  it("serves a document only to the person it's about and the people who review it", async () => {
    release();
    await uploadDocument(db, riley, "police", pdf(), now);
    submitTask(db, riley, "police", {}, now);
    const id = task(riley, "police").document!.id;
    expect(readDocument(db, riley, id, now)).toMatchObject({ mime: "application/pdf", name: "police-check.pdf" });
    expect(readDocument(db, jordan, id, now).buffer.toString()).toBe("%PDF-1.4 test");
    // A peer, another organisation's administrator, an author and Quality all get the same answer.
    for (const u of [sam, casey, dana, morgan]) expect(() => readDocument(db, u, id, now)).toThrow(/isn’t available/);
    expect(() => readDocument(db, riley, "doc-nope", now)).toThrow(/isn’t available/);
    // A reviewer opening it is on record; the person opening their own isn't.
    expect(db.prepare("SELECT COUNT(*) AS n FROM audit WHERE event = 'onboarding.document_viewed'").get()).toEqual({ n: 1 });
    // Events say that a file arrived, never its name.
    expect(JSON.stringify(db.prepare("SELECT * FROM onb_events").all())).not.toContain("police-check");
  });

  it("keeps employees' and partners' queues with their own reviewers", async () => {
    release([
      ...TASKS,
      { id: "id-check", kind: "document", title: "Proof of identity", audiences: ["staff"], required: true },
      { id: "clinical", kind: "document", title: "Clinical registration", quality: true, required: false },
    ]);
    setAccess(db, jordan, { userId: "dana", role: "pc" }, now);
    setAccess(db, jordan, { userId: "hamish", role: "partner_ops" }, now);
    await uploadDocument(db, riley, "police", pdf(), now);
    submitTask(db, riley, "police", {}, now);
    await uploadDocument(db, morgan, "id-check", pdf("passport.pdf"), now);
    submitTask(db, morgan, "id-check", {}, now);
    await uploadDocument(db, riley, "clinical", pdf("registration.pdf"), now);
    submitTask(db, riley, "clinical", {}, now);
    expect(reviewQueue(db, dana, {}, now).items.map((i) => i.task)).toEqual(["Proof of identity"]);
    expect(reviewQueue(db, hamish, {}, now).items.map((i) => i.task)).toEqual(["Police check"]);
    // A document marked for Quality is theirs, whoever it's about.
    expect(reviewQueue(db, morgan, {}, now).items.map((i) => i.task)).toEqual(["Clinical registration"]);
    expect(() => reviewTask(db, dana, task(riley, "police").rowId, { decision: "approve" }, now)).toThrow(/isn’t in your queue/);
    expect(() => readDocument(db, dana, task(riley, "police").document!.id, now)).toThrow(/isn’t available/);
    expect(() => reviewQueue(db, riley, {}, now)).toThrow(/review queue is for/);
    // Each sees only their own population's funnel.
    expect(funnel(db, dana, {}, now).byAudience.map((x) => x.audience)).toEqual(["staff"]);
    expect(funnel(db, hamish, {}, now).byAudience.map((x) => x.audience)).toEqual(["coordinator", "partner"]);
  });

  it("reports who is waiting on whom", async () => {
    release();
    await uploadDocument(db, riley, "police", pdf(), now);
    submitTask(db, riley, "details", { name: "Riley Morgan" }, now);
    submitTask(db, riley, "code", { agree: true }, now);
    submitTask(db, riley, "police", {}, now);
    const f = funnel(db, jordan, {}, later(2));
    expect(f.byAudience.find((x) => x.audience === "coordinator")).toMatchObject({ people: 1, states: { awaiting_review: 1 } });
    expect(f.waiting).toMatchObject({ onReviewers: 1 });
    expect(f.people.find((p) => p.id === "riley")).toMatchObject({
      state: "awaiting_review",
      waitingOn: "reviewer",
      waitingFor: "Police check (with a reviewer)",
    });
    expect(funnel(db, jordan, { state: "awaiting_review" }, later(2)).total).toBe(1);
  });
});

describe("check your starting point", () => {
  /** Publishes a three-question check for coordinators from approved pool questions, the first tagged to a competency. */
  function check() {
    syncPool(db, jordan, now);
    const choices = poolChoices(db, jordan, {}).questions.slice(0, 3);
    const { id } = saveCompetency(db, jordan, { name: "Noticing change", definition: "Notices change.", behaviours: ["Describes what changed."] }, now);
    approveCompetency(db, jordan, id, now);
    saveInstrument(
      db,
      jordan,
      {
        audience: "coordinator",
        title: "Coordinator start",
        items: choices.map((q, i) => ({ questionId: q.id, version: q.version, competencyId: i === 0 ? id : null })),
      },
      now,
    );
    publishInstrument(db, jordan, "coordinator", now);
    return { choices, competencyId: id };
  }
  const keyOf = (questionId: string) => {
    const row = db
      .prepare("SELECT v.content FROM pool_questions q JOIN pool_versions v ON v.question_id = q.id AND v.version = q.approved_version WHERE q.id = ?")
      .get(questionId) as { content: string };
    const options = (JSON.parse(row.content) as { options: { id: string; credit: string }[] }).options;
    return { right: options.find((o) => o.credit === "correct")!.id, wrong: options.find((o) => o.credit !== "correct")!.id };
  };

  it("only asks approved questions, and never sends the answers", () => {
    syncPool(db, jordan, now);
    const [q] = poolChoices(db, jordan, {}).questions;
    expect(() => saveInstrument(db, dana, { audience: "coordinator", items: [] }, now)).toThrow(/owner/);
    expect(() => saveInstrument(db, jordan, { audience: "coordinator", items: [{ questionId: q.id, version: 99 }] }, now)).toThrow(/isn’t approved/);
    saveInstrument(db, jordan, { audience: "coordinator", items: [{ questionId: q.id, version: q.version }] }, now);
    expect(() => publishInstrument(db, jordan, "coordinator", now)).toThrow(/at least 3/);
    check();
    release();
    expect(diagnosticState(db, riley)).toMatchObject({ status: "ready", questions: 3 });
    // No check has been published for staff, so the task isn't offered to them at all.
    expect(diagnosticState(db, dana).status).toBe("none");
    expect(mySetup(db, dana, now).tasks.map((t) => t.id)).not.toContain("start");
    const started = startDiagnostic(db, riley, { goal: "Handling invoice queries", confidence: 2 }, now);
    expect(started.status).toBe("active");
    expect(started.question?.options.at(-1)).toEqual({ id: "unsure", text: "I’m not sure" });
    expect(JSON.stringify(started)).not.toMatch(/credit|correct|feedback|explanation/);
    expect(task(riley, "start").status).toBe("in_progress");
  });

  it("records the first answer before any feedback, and gives guidance and suggestions instead of a score", () => {
    const { choices, competencyId } = check();
    release();
    startDiagnostic(db, riley, {}, now);
    const first = keyOf(choices[0].id);
    let state = answerDiagnostic(db, riley, { questionId: choices[0].id, choiceId: first.wrong }, now);
    // Nothing is revealed part-way, and changing the answer doesn't change the record.
    expect(state).toMatchObject({ status: "active", position: 1, result: null });
    answerDiagnostic(db, riley, { questionId: choices[0].id, choiceId: first.right }, now);
    expect(db.prepare("SELECT choice_id, outcome FROM onb_responses WHERE question_id = ?").get(choices[0].id)).toEqual({
      choice_id: first.wrong,
      outcome: "other",
    });
    expect(() => answerDiagnostic(db, riley, { questionId: choices[1].id, choiceId: "made-up" }, now)).toThrow(/Choose one/);
    answerDiagnostic(db, riley, { questionId: choices[1].id, choiceId: "unsure" }, now);
    state = answerDiagnostic(db, riley, { questionId: choices[2].id, choiceId: keyOf(choices[2].id).right }, later(1));
    expect(state.status).toBe("done");
    expect(state.result!.answers.map((a) => a.outcome)).toEqual(["other", "unsure", "right"]);
    expect(state.result!.answers[1].chosen).toBe("I’m not sure");
    expect(state.result!.answers[0].best).toBeTruthy();
    // Suggestions come from where the questions they missed are taught. There's no percentage anywhere.
    expect(state.result!.suggestions.length).toBeGreaterThan(0);
    expect(state.result!.suggestions[0].href).toMatch(/^\/(topics|magazine)\//);
    expect(Object.keys(state.result!).sort()).toEqual(["answers", "completedAt", "suggestions"]);
    expect(Object.keys(state.result!.answers[0]).sort()).toEqual(["best", "chosen", "guidance", "id", "outcome", "stem"]);
    expect(task(riley, "start", later(1)).status).toBe("approved");
    // The handoff: a labelled baseline for the tagged competency, and nothing more.
    expect(baselineSignals(db, "riley")).toEqual([{ competencyId, asked: 1, right: 0, unsure: 0, at: later(1).toISOString(), instrumentVersion: 1 }]);
  });

  it("can't hold up activation, pass a quiz, complete learning or show a capability", async () => {
    const { choices, competencyId } = check();
    // Even when the check itself is required, only finishing it counts.
    release(TASKS.map((t) => (t.id === "start" ? { ...t, required: true } : t)));
    const role = saveRole(db, jordan, { name: "Care coordinator", domain: "partner" }, now).id;
    saveRoleDraft(db, jordan, role, { requirements: [{ competencyId, target: "demonstrated" }] }, now);
    activateRole(db, jordan, role, now);
    setPerson(db, jordan, "riley", { roleId: role }, now);
    await rileyReady();
    expect(mySetup(db, riley, later(1))).toMatchObject({ state: "in_progress", canStart: false });
    startDiagnostic(db, riley, {}, later(1));
    for (const q of choices) answerDiagnostic(db, riley, { questionId: q.id, choiceId: keyOf(q.id).wrong }, later(1));
    // Every answer wrong, and they're ready.
    expect(mySetup(db, riley, later(1))).toMatchObject({ state: "ready", canStart: true });
    expect(db.prepare("SELECT COUNT(*) AS n FROM path_quiz_attempts WHERE user_id = 'riley'").get()).toEqual({ n: 0 });
    expect(db.prepare("SELECT COUNT(*) AS n FROM lesson_completions WHERE user_id = 'riley'").get()).toEqual({ n: 0 });
    expect(db.prepare("SELECT COUNT(*) AS n FROM compliance_testouts WHERE user_id = 'riley'").get()).toEqual({ n: 0 });
    // The competency the first question was tagged to shows no evidence: a baseline isn't evidence.
    expect(baselineSignals(db, "riley")).toMatchObject([{ competencyId, asked: 1, right: 0 }]);
    expect(myCapabilities(db, riley, later(1)).competencies[0]).toMatchObject({ highest: null, met: false });
  });

  it("flags an instrument when a question stops being approved, and shows owners totals only", () => {
    const { choices } = check();
    release();
    startDiagnostic(db, riley, {}, now);
    for (const q of choices) answerDiagnostic(db, riley, { questionId: q.id, choiceId: "unsure" }, now);
    // One person's answers aren't shown, even as totals.
    expect(baselineReport(db, jordan, "coordinator")).toMatchObject({ completed: 1, shown: false, min: 5 });
    expect(baselineReport(db, jordan, "coordinator").questions.every((q) => q.unsure === 0)).toBe(true);
    expect(() => baselineReport(db, dana, "coordinator")).toThrow(/owner/);
    expect(JSON.stringify(mySetup(db, casey, now))).not.toContain("unsure");
    db.prepare("UPDATE pool_versions SET status = 'needs_review' WHERE question_id = ? AND version = ?").run(choices[0].id, choices[0].version);
    const live = instruments(db, jordan).audiences.find((a) => a.audience === "coordinator")!.active!;
    expect(live.items.map((i) => i.stale)).toEqual([true, false, false]);
    // What Riley was asked is kept as it read; someone starting now is asked only what's still approved.
    expect(diagnosticState(db, riley).result!.answers).toHaveLength(3);
    db.prepare("UPDATE users SET audience = 'coordinator' WHERE id = 'ash'").run();
    expect(startDiagnostic(db, userById(db, "ash")!, {}, later(1)).questions).toBe(2);
  });
});
