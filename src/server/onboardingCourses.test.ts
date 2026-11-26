import { mkdtempSync } from "node:fs";
import { tmpdir } from "node:os";
import path from "node:path";
import { beforeEach, describe, expect, it } from "vitest";

process.env.HUB_ONBOARDING_DIR = mkdtempSync(path.join(tmpdir(), "hub-onbc-"));

const { openDb } = await import("./db");
const { userById } = await import("./auth");
const { setAccess } = await import("./capability");
const { activateConfig, accessFor, mySetup, reportMismatch, saveConfigDraft } = await import("./onboarding");
const c = await import("./onboardingCourses");

/* Starting courses: assignment by verified role, idempotent, a delta on change, and never an approval. */

type Db = ReturnType<typeof openDb>;
type User = NonNullable<ReturnType<typeof userById>>;
let db: Db;
let jordan: User, morgan: User, riley: User, sam: User, ash: User, casey: User, avery: User;
const now = new Date("2026-11-26T00:00:00Z");
const later = (days: number) => new Date(now.getTime() + days * 86_400_000);

const enrolments = (u: User) =>
  db.prepare("SELECT * FROM onbc_enrolments WHERE user_id = ? ORDER BY course_id, course_version").all(u.id) as {
    id: string;
    course_id: string;
    course_version: number;
    status: string;
    due_on: string | null;
    mandatory: number;
    completion: string | null;
  }[];
const complete = (u: User, slug: string, version = "1.0") =>
  db
    .prepare("INSERT INTO lesson_completions (user_id, lesson_slug, lesson_version, completed_at) VALUES (?, ?, ?, ?)")
    .run(u.id, slug, version, now.toISOString());
const person = (id: string, serviceRole: string | null, audience = "partner", role = "learner") => {
  db.prepare("INSERT INTO users (id, name, email, org_id, role, audience, service_role, timezone) VALUES (?, ?, ?, 'taylor-cleaning', ?, ?, ?, NULL)").run(
    id,
    `${id[0].toUpperCase()}${id.slice(1)} Example`,
    `${id}@example.test`,
    role,
    audience,
    serviceRole,
  );
  return userById(db, id)!;
};

function course(id: string, segment: string, steps: { ref: string; title?: string; required?: boolean }[], serviceTypes: string[] = []) {
  c.saveCourse(db, jordan, { id, data: { learnerTitle: `Course ${id}`, segment, serviceTypes, steps } }, now);
  c.publishCourse(db, jordan, id, now);
}
function rule(id: string, courseId: string, when: Record<string, unknown>, extra: Record<string, unknown> = {}) {
  c.saveRule(db, jordan, { id, data: { courseId, when, ownerTeam: "Partner Operations", effectiveFrom: "2026-11-01", ...extra } }, now);
  return c.publishRule(db, jordan, id, now);
}
/** A shared supplier introduction, a cleaner branch and a coordinator course, all in force. */
function standard() {
  course("intro", "supplier", [{ ref: "topic:legislative-framework", title: "Shared" }, { ref: "topic:a-little-extra-time" }]);
  course("cleaner", "supplier", [{ ref: "topic:extra-time-briefing", title: "First visit" }], ["cleaning"]);
  course("coord", "coordinator", [{ ref: "topic:legislative-framework", title: "Shared" }, { ref: "topic:noticing-a-change" }]);
  rule("rule-intro", "intro", { segment: "supplier" });
  rule("rule-cleaner", "cleaner", { segment: "supplier", serviceTypes: ["cleaning"] });
  rule("rule-coord", "coord", { segment: "coordinator" });
}

beforeEach(() => {
  db = openDb(":memory:");
  [jordan, morgan, riley, sam, ash, casey, avery] = ["jordan", "morgan", "riley", "sam", "ash", "casey", "avery"].map((id) => userById(db, id)!);
});

describe("assignment", () => {
  it("enrols a verified cleaner once in the shared and cleaning courses, however often it runs", () => {
    standard();
    for (let i = 0; i < 10; i++) {
      c.evaluate(db, sam, later(i / 10));
      c.myCourses(db, sam, later(i / 10));
    }
    expect(enrolments(sam).map((e) => e.course_id)).toEqual(["cleaner", "intro"]);
    const invites = db.prepare("SELECT COUNT(*) AS n FROM notifications WHERE user_id = 'sam' AND source LIKE 'onbc:invite:%'").get() as { n: number };
    expect(invites.n).toBe(2);
    // The database itself refuses a second row for the same person, organisation and course version.
    const e = enrolments(sam)[0];
    expect(() =>
      db
        .prepare(
          "INSERT INTO onbc_enrolments (id, user_id, org_id, membership, course_id, course_version, source, assigned_by, assigned_at, status, updated_at) VALUES ('x', 'sam', 'taylor-cleaning', 'p', ?, ?, 'rule', 'system', '', 'active', '')",
        )
        .run(e.course_id, e.course_version),
    ).toThrow(/UNIQUE/);
  });

  it("never gives a nurse or a gardener the cleaner branch", () => {
    standard();
    const nina = person("nina", "nursing");
    c.evaluate(db, nina, now);
    c.evaluate(db, ash, now);
    expect(enrolments(nina).map((e) => e.course_id)).toEqual(["intro"]);
    expect(enrolments(ash).map((e) => e.course_id)).toEqual(["intro"]);
    expect(c.previewLearner(db, jordan, "nurse", now).courses.map((x) => x.id)).toEqual(["intro"]);
    expect(c.previewLearner(db, jordan, "cleaner", now).courses.map((x) => x.id)).toEqual(["intro", "cleaner"]);
    // Gardening has no reviewed branch yet: the owners are told, rather than it being filled with something else.
    expect(c.exceptionsQueue(db, jordan, now).items.some((i) => i.kind === "no_branch" && i.person?.id === "ash")).toBe(true);
  });

  it("asks to confirm the work type when it's missing or disputed, and assigns nothing broader meanwhile", () => {
    standard();
    const tom = person("tom", null);
    const wes = person("wes", "window washing");
    expect(c.myCourses(db, tom, now).confirm).toEqual({ reason: "missing" });
    expect(c.myCourses(db, wes, now).confirm).toEqual({ reason: "missing" });
    expect(enrolments(tom)).toEqual([]);
    expect(enrolments(wes)).toEqual([]);
    expect(c.previewLearner(db, jordan, "unknown", now)).toMatchObject({ confirm: true, courses: [] });

    const zoe = person("zoe", "cleaning");
    reportMismatch(db, zoe, { message: "I’m a gardener, not a cleaner." }, now);
    expect(c.myCourses(db, zoe, now).confirm).toEqual({ reason: "disputed" });
    expect(enrolments(zoe)).toEqual([]);
  });

  it("gives someone with two roles both paths, and credits a shared item once", () => {
    standard();
    c.evaluate(db, sam, now);
    c.addMembership(
      db,
      jordan,
      { userId: "sam", segment: "coordinator", orgId: "northside-coord", reason: "Confirmed with Northside’s principal by phone." },
      now,
    );
    expect(enrolments(sam).map((e) => e.course_id)).toEqual(["cleaner", "coord", "intro"]);
    complete(sam, "legislative-framework");
    const mine = c.myCourses(db, sam, now);
    const shared = (id: string) => mine.courses.find((x) => x.courseId === id)!.steps.find((s) => s.title === "Shared")!.state;
    expect(shared("intro")).toBe("done");
    expect(shared("coord")).toBe("done");
    // Sam's account reads the Hub as a Care Partner, so the coordinator-only Topic won't open: flagged, never leaked.
    const coordOnly = mine.courses.find((x) => x.courseId === "coord")!.steps.find((s) => s.title !== "Shared")!;
    expect(coordOnly).toMatchObject({ state: "unavailable", href: null, contentTitle: null });
    expect(c.exceptionsQueue(db, jordan, now).items.some((i) => i.kind === "second_role_access" && i.person?.id === "sam")).toBe(true);
  });

  it("counts an approved equivalent once, and a pending one not at all", () => {
    course("coord2", "coordinator", [{ ref: "topic:legislative-framework" }, { ref: "topic:our-mission-and-model", title: "Mission" }]);
    rule("rule-coord2", "coord2", { segment: "coordinator" });
    complete(riley, "legislative-framework");
    complete(riley, "noticing-a-change");
    const { id } = c.saveEquivalence(db, jordan, { a: "topic:our-mission-and-model", b: "topic:noticing-a-change", note: "Same learning outcome." }, now);
    const mission = () =>
      c
        .myCourses(db, riley, now)
        .courses.concat(c.myCourses(db, riley, now).history)
        .find((x) => x.courseId === "coord2")!
        .steps.find((s) => s.title === "Mission")!;
    expect(mission().state).toBe("todo");
    c.approveEquivalence(db, jordan, id, now);
    expect(mission()).toMatchObject({ state: "done", credit: expect.stringMatching(/equivalent/) });
    expect(enrolments(riley).find((e) => e.course_id === "coord2")!.status).toBe("completed");
  });

  it("adds only the delta when work changes, keeping finished records, and picks up again on the way back", () => {
    standard();
    c.evaluate(db, sam, now);
    c.setWorkType(db, jordan, { userId: "sam", serviceType: "nursing", reason: "Partner Operations confirmed a nursing contract." }, now);
    expect(Object.fromEntries(enrolments(sam).map((e) => [e.course_id, e.status]))).toEqual({ cleaner: "ended", intro: "active" });
    c.setWorkType(db, jordan, { userId: "sam", serviceType: "cleaning", reason: "Back to cleaning, per the signed agreement." }, later(1));
    expect(Object.fromEntries(enrolments(sam).map((e) => [e.course_id, e.status]))).toEqual({ cleaner: "active", intro: "active" });
    expect(enrolments(sam)).toHaveLength(2);

    // Finished, then moved to nursing: the completion stands.
    complete(sam, "extra-time-briefing");
    c.evaluate(db, sam, later(2));
    c.setWorkType(db, jordan, { userId: "sam", serviceType: "nursing", reason: "Partner Operations confirmed a nursing contract." }, later(3));
    expect(enrolments(sam).find((e) => e.course_id === "cleaner")!.status).toBe("completed");
  });
});

describe("authorisation and access", () => {
  it("never lets a learner give themselves a role, or reach anyone else's records or the admin", () => {
    standard();
    c.evaluate(db, sam, now);
    c.evaluate(db, riley, now);
    c.savePrefs(db, sam, { mode: "listen", audience: "staff", role: "author", superadmin: 1, serviceType: "nursing", service_role: "nursing" }, now);
    expect(userById(db, "sam")).toMatchObject({ audience: "partner", role: "learner", service_role: "cleaning", superadmin: 0 });
    for (const call of [
      () => c.saveRule(db, sam, { data: { courseId: "intro", when: { segment: "supplier" }, ownerTeam: "Me" } }, now),
      () => c.publishRule(db, sam, "rule-intro", now),
      () => c.assignManually(db, sam, { userId: "sam", courseId: "coord", reason: "I would like this one please." }, now),
      () => c.setWorkType(db, sam, { userId: "sam", serviceType: "nursing", reason: "I decided I am a nurse now." }, now),
      () => c.addMembership(db, sam, { userId: "sam", segment: "staff", orgId: "trilogy", reason: "I would like admin access." }, now),
      () => c.personCourses(db, sam, "riley", now),
      () => c.courseReport(db, sam, {}, now),
      () => c.previewLearner(db, sam, "coordinator", now),
      () => c.exceptionsQueue(db, sam, now),
    ])
      expect(call).toThrow();
    const rileys = enrolments(riley)[0].id;
    expect(() => c.myEnrolment(db, sam, rileys, now)).toThrow(/isn’t one of yours/);
    expect(() => c.askForHelp(db, sam, { kind: "question", message: "About Riley’s course", enrolmentId: rileys }, now)).toThrow(/isn’t one of yours/);
  });

  it("won't assign or publish a course for a role the person doesn't hold", () => {
    standard();
    expect(() => c.assignManually(db, jordan, { userId: "sam", courseId: "coord", reason: "Trying a coordinator course on a supplier." }, now)).toThrow(
      /verified role/,
    );
    c.saveCourse(db, jordan, { id: "leaky", data: { learnerTitle: "Leaky course", segment: "supplier", steps: [{ ref: "topic:noticing-a-change" }] } }, now);
    expect(() => c.publishCourse(db, jordan, "leaky", now)).toThrow(/isn’t open to Suppliers/);
    // A partner organisation's administrator doesn't run onboarding, and a general Hub admin role gives no more.
    expect(() => c.personCourses(db, casey, "sam", now)).toThrow();
    // People & Culture own employees, not partners' records.
    setAccess(db, jordan, { userId: "avery", role: "pc" }, now);
    expect(() => c.personCourses(db, userById(db, "avery")!, "sam", now)).toThrow(/population owner/);
    expect(c.personCourses(db, userById(db, "avery")!, "jordan", now).name).toBe("Lance Elliott");
  });

  it("doesn't newly assign a withdrawn course, by rule or by hand", () => {
    standard();
    c.withdrawCourse(db, jordan, { id: "intro", reason: "Being rewritten after review." }, now);
    const nina = person("nina", "nursing");
    c.evaluate(db, nina, now);
    expect(enrolments(nina)).toEqual([]);
    expect(() => c.assignManually(db, jordan, { userId: "nina", courseId: "intro", reason: "Pilot group: nurses in Brisbane." }, now)).toThrow(/withdrawn/);
    c.saveRule(db, jordan, { id: "rule-intro", data: { courseId: "intro", when: { segment: "supplier" }, ownerTeam: "Partner Operations" } }, now);
    expect(() => c.publishRule(db, jordan, "rule-intro", now)).toThrow(/withdrawn/);
    expect(c.exceptionsQueue(db, jordan, now).items.some((i) => i.kind === "withdrawn_content")).toBe(true);
  });
});

describe("mandatory rules, completion and reminders", () => {
  it("is mandatory only when its named owner approves, and only then has a due date", () => {
    course("intro", "supplier", [{ ref: "topic:legislative-framework" }, { ref: "topic:a-little-extra-time", title: "Extra time" }]);
    setAccess(db, jordan, { userId: "morgan", role: "partner_ops" }, now);
    expect(rule("rule-intro", "intro", { segment: "supplier" }, { mandatory: true, dueDays: 14, ownerUserId: "morgan" }).mandatory).toBe("pending");
    expect(enrolments(sam)[0]).toMatchObject({ mandatory: 0, due_on: null });
    expect(() => c.approveRule(db, jordan, "rule-intro", now)).toThrow(/Only Morgan Reid/);
    c.approveRule(db, morgan, "rule-intro", now);
    expect(enrolments(sam)[0]).toMatchObject({ mandatory: 1, due_on: "2026-12-10" });

    // One reminder a week out, naming the step and the date; then nothing more for that stage.
    expect(c.courseReminders(db, later(10)).sent).toBeGreaterThan(0);
    const sent = (db.prepare("SELECT COUNT(*) AS n FROM notifications WHERE user_id = 'sam' AND source LIKE 'onbc:remind:%'").get() as { n: number }).n;
    c.courseReminders(db, later(11));
    expect((db.prepare("SELECT COUNT(*) AS n FROM notifications WHERE user_id = 'sam' AND source LIKE 'onbc:remind:%'").get() as { n: number }).n).toBe(sent);
    const r = db.prepare("SELECT title, body, done_at FROM notifications WHERE user_id = 'sam' AND source LIKE 'onbc:remind:%'").get() as {
      title: string;
      body: string;
      done_at: string | null;
    };
    expect(r.title).toMatch(/2026-12-10/);
    expect(r.body).toMatch(/next step/);
    // Done: the reminders stop and close.
    complete(sam, "legislative-framework");
    complete(sam, "a-little-extra-time");
    c.myCourses(db, sam, later(12));
    c.courseReminders(db, later(20));
    // Ash (gardening) is still on it and is reminded that it's overdue; Sam, finished, is not.
    expect((db.prepare("SELECT COUNT(*) AS n FROM notifications WHERE user_id = 'sam' AND source LIKE 'onbc:remind:%'").get() as { n: number }).n).toBe(sent);
    expect(db.prepare("SELECT 1 FROM notifications WHERE user_id = 'ash' AND source LIKE 'onbc:remind:overdue:%'").get()).toBeTruthy();
    expect(
      (db.prepare("SELECT COUNT(*) AS n FROM notifications WHERE user_id = 'sam' AND source LIKE 'onbc:%' AND done_at IS NULL").get() as { n: number }).n,
    ).toBe(0);
  });

  it("records completion against the exact versions, and never sets setup or supplier approval", () => {
    saveConfigDraft(db, jordan, { tasks: [{ id: "police", kind: "document", title: "Police check", required: true }] }, now);
    activateConfig(db, jordan, {}, now);
    const before = { setup: mySetup(db, sam, now).state, access: accessFor(db, sam, now).full, user: userById(db, "sam") };
    standard();
    complete(sam, "legislative-framework", "1.4");
    complete(sam, "a-little-extra-time", "1.0-demo");
    complete(sam, "extra-time-briefing", "1.0-demo");
    const mine = c.myCourses(db, sam, now);
    expect(mine.history.map((x) => x.status)).toEqual(["completed", "completed"]);
    const intro = enrolments(sam).find((e) => e.course_id === "intro")!;
    expect(JSON.parse(intro.completion!)).toMatchObject({
      courseVersion: 1,
      steps: [
        { ref: "topic:legislative-framework", version: "1.4" },
        { ref: "topic:a-little-extra-time", version: "1.0-demo" },
      ],
    });
    expect(mySetup(db, sam, now).state).toBe(before.setup);
    expect(mySetup(db, sam, now).tasks.find((t) => t.id === "police")!.status).toBe("not_started");
    expect(accessFor(db, sam, now).full).toBe(before.access);
    expect(userById(db, "sam")).toEqual(before.user);
    expect(mine.statuses.operational).toMatch(/doesn’t approve you/);
  });

  it("keeps people on their version when a course changes, unless the owner asks for a new assignment", () => {
    standard();
    complete(sam, "extra-time-briefing");
    c.evaluate(db, sam, now);
    c.saveCourse(
      db,
      jordan,
      {
        id: "cleaner",
        data: {
          learnerTitle: "Course cleaner",
          segment: "supplier",
          serviceTypes: ["cleaning"],
          steps: [{ ref: "topic:legislative-framework" }],
          reassign: "new_assignment",
          changeNote: "Now covers the legislation.",
        },
      },
      now,
    );
    c.publishCourse(db, jordan, "cleaner", now);
    c.evaluate(db, sam, later(1));
    const rows = enrolments(sam).filter((e) => e.course_id === "cleaner");
    expect(rows.map((e) => [e.course_version, e.status])).toEqual([
      [1, "completed"],
      [2, "active"],
    ]);
  });
});

describe("reporting", () => {
  it("keeps each denominator separate, and never reports language or reading preferences", () => {
    standard();
    const tom = person("tom", null);
    for (const u of [sam, ash, riley, tom]) c.myCourses(db, u, now);
    db.prepare("UPDATE users SET language = 'vi' WHERE id = 'sam'").run();
    c.savePrefs(db, sam, { mode: "listen", textSize: "large" }, now);
    complete(sam, "extra-time-briefing");
    db.prepare("INSERT INTO lesson_progress (user_id, slug, attempt, saved_at) VALUES ('ash', 'legislative-framework', '{}', ?)").run(now.toISOString());
    const exempted = enrolments(riley)[0].id;
    c.exempt(db, jordan, { enrolmentId: exempted, reason: "Completed the equivalent course at a previous provider.", reviewOn: "2027-05-01" }, now);
    const r = c.courseReport(db, jordan, {}, now);
    const intro = r.rows.find((x) => x.course === "intro" && x.serviceType === "Cleaning")!;
    expect(intro).toMatchObject({ eligible: 1, invited: 1, enrolled: 1, started: 0, completed: 0, exempted: 0 });
    expect(r.rows.find((x) => x.course === "intro" && x.serviceType === "Gardening")).toMatchObject({ eligible: 1, enrolled: 1, started: 1 });
    expect(r.rows.find((x) => x.course === "cleaner")).toMatchObject({ eligible: 1, enrolled: 1, started: 1, completed: 1 });
    expect(r.rows.find((x) => x.course === "coord")).toMatchObject({ eligible: 1, enrolled: 1, exempted: 1, completed: 0 });
    // Tom has no service type: not eligible for anything, so he isn't counted as a missing enrolment either.
    expect(r.rows.reduce((n, x) => n + x.eligible, 0)).toBe(4);
    const json = JSON.stringify(r) + c.courseReportCsv(db, jordan, {}, now) + JSON.stringify(c.personCourses(db, jordan, "sam", now));
    expect(json).not.toMatch(/"language"|listen|"vi"|textSize|text_size/);
    expect(c.courseAudit(db, jordan, now).some((a) => a.event === "onboarding.report.exported")).toBe(true);
  });
});

describe("demonstration pathways", () => {
  it("seeds once, labelled as demonstration, and makes nothing mandatory", () => {
    expect(c.seedDemoCourses(db, now).seeded).toBe(true);
    expect(c.seedDemoCourses(db, now).seeded).toBe(false);
    const rules = db.prepare("SELECT data, mandatory_state FROM onbc_rules").all() as { data: string; mandatory_state: string }[];
    expect(rules).toHaveLength(5);
    for (const r of rules) {
      expect(r.mandatory_state).not.toBe("approved");
      expect(JSON.parse(r.data)).toMatchObject({ demo: true, ownerUserId: null });
    }
    for (const row of db.prepare("SELECT data FROM onbc_courses").all() as { data: string }[]) expect(JSON.parse(row.data).demo).toBe(true);
    // Nobody is given a due date by a demonstration rule.
    for (const u of [sam, riley, casey, avery]) c.myCourses(db, u, now);
    expect((db.prepare("SELECT COUNT(*) AS n FROM onbc_enrolments WHERE due_on IS NOT NULL OR mandatory = 1").get() as { n: number }).n).toBe(0);
  });
});
