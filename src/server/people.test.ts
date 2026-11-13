import { beforeEach, describe, expect, it } from "vitest";
import { openDb, type Db } from "./db";
import { userById } from "./auth";
import { recordLessonCompletion } from "./learning";
import { assignLearning, directory, personDetail, setAccess, unassign } from "./people";
import { catalogueTopics } from "./catalogue";
import { inbox } from "./notifications";

/* People and permissions: superadmins give access and assign learning across every organisation. */

let db: Db;
beforeEach(() => {
  db = openDb(":memory:");
});
const u = (id: string) => userById(db, id)!;
const now = new Date("2026-10-22T04:00:00Z");
const TOPIC = "a-little-extra-time";

describe("people and permissions", () => {
  it("is for superadmins only, and Jordan is the first one", () => {
    expect(u("jordan").superadmin).toBe(1);
    expect(() => directory(db, u("dana"), now)).toThrow(/superadmins/);
    expect(() => directory(db, u("casey"), now)).toThrow(/superadmins/);
    const d = directory(db, u("jordan"), now);
    expect(d.people.find((p) => p.id === "jordan")?.access).toBe("superadmin");
    expect(d.people.find((p) => p.id === "sam")?.org).toBeTruthy();
    expect(d.assignable.topics.some((t) => t.id === TOPIC)).toBe(true);
    expect(d.assignable.paths.length).toBeGreaterThan(0);
  });

  it("assigns a topic to several people, with a due date, into their Inbox and their learning", () => {
    const r = assignLearning(db, u("jordan"), { kind: "topic", id: TOPIC, userIds: ["sam", "ash"], dueDate: "2026-11-30" }, now);
    expect(r.assigned).toBe(2);
    const t = catalogueTopics(db, "sam").find((x) => x.slug === TOPIC)!;
    expect(t.assignment).toEqual({ required: true, due: "2026-11-30" });
    expect(catalogueTopics(db, "riley").find((x) => x.slug === TOPIC)!.assignment?.due).not.toBe("2026-11-30");
    expect(inbox(db, u("sam"), now).action.some((n) => n.title.includes("Topic assigned"))).toBe(true);
    const detail = personDetail(db, u("jordan"), "sam", now);
    expect(detail.topics).toMatchObject([{ slug: TOPIC, dueDate: "2026-11-30", state: "not_started", assignedBy: u("jordan").name }]);

    // Finishing it shows as done; reassigning updates the due date rather than duplicating.
    recordLessonCompletion(db, u("sam"), { slug: TOPIC, version: "1.0" }, now);
    assignLearning(db, u("jordan"), { kind: "topic", id: TOPIC, userIds: ["sam"], dueDate: "2026-12-15" }, now);
    const again = personDetail(db, u("jordan"), "sam", now);
    expect(again.topics).toHaveLength(1);
    expect(again.topics[0]).toMatchObject({ dueDate: "2026-12-15", state: "completed", overdue: false });
    expect(directory(db, u("jordan"), now).people.find((p) => p.id === "sam")).toMatchObject({ assignedTopics: 1, topicsDone: 1 });
  });

  it("assigns a learning path and flags overdue learning", () => {
    const path = directory(db, u("jordan"), now).assignable.paths[0];
    assignLearning(db, u("jordan"), { kind: "path", id: path.id, userIds: ["riley"], dueDate: "2026-10-25" }, now);
    const later = new Date("2026-11-02T00:00:00Z");
    const riley = directory(db, u("jordan"), later).people.find((p) => p.id === "riley")!;
    expect(riley.assignedPaths).toBeGreaterThan(0);
    expect(riley.overdue).toBeGreaterThan(0);
    expect(personDetail(db, u("jordan"), "riley", later).paths.find((p) => p.id === path.id)?.overdue).toBe(true);

    unassign(db, u("jordan"), { kind: "path", id: path.id, userId: "riley" }, later);
    expect(personDetail(db, u("jordan"), "riley", later).paths.find((p) => p.id === path.id)).toBeUndefined();
  });

  it("lets a superadmin assign anyone, staff and other organisations included", () => {
    const path = directory(db, u("jordan"), now).assignable.paths[0];
    assignLearning(db, u("jordan"), { kind: "path", id: path.id, userIds: ["dana", "casey", "sam"] }, now);
    expect(personDetail(db, u("jordan"), "dana", now).paths.some((p) => p.id === path.id)).toBe(true);
    expect(personDetail(db, u("jordan"), "casey", now).paths.some((p) => p.id === path.id)).toBe(true);
  });

  it("checks what's being assigned", () => {
    expect(() => assignLearning(db, u("jordan"), { kind: "topic", id: TOPIC, userIds: [] }, now)).toThrow(/at least one/);
    expect(() => assignLearning(db, u("jordan"), { kind: "topic", id: "no-such-topic", userIds: ["sam"] }, now)).toThrow(/published topic/);
    expect(() => assignLearning(db, u("jordan"), { kind: "topic", id: TOPIC, userIds: ["sam"], dueDate: "2020-01-01" }, now)).toThrow(/from today/);
    expect(() => assignLearning(db, u("dana"), { kind: "topic", id: TOPIC, userIds: ["sam"] }, now)).toThrow(/superadmins/);
  });

  it("changes access, with guard rails", () => {
    // An organisation admin for Sam's organisation.
    setAccess(db, u("jordan"), "sam", { access: "org_admin" }, now);
    expect(u("sam").role).toBe("org_admin");
    // Authoring and superadmin are for Trilogy staff.
    expect(() => setAccess(db, u("jordan"), "sam", { access: "author" }, now)).toThrow(/Trilogy/);
    // Approval roles need authoring access.
    expect(() => setAccess(db, u("jordan"), "sam", { access: "org_admin", reviewRole: "sme" }, now)).toThrow(/Approval roles/);

    // Making Dana a superadmin and a Compliance reviewer.
    const dana = setAccess(db, u("jordan"), "dana", { access: "superadmin", reviewRole: "compliance", reviewArea: "Clinical" }, now);
    expect(dana).toMatchObject({ access: "superadmin", reviewRole: "compliance", reviewArea: "Clinical" });
    expect(u("dana")).toMatchObject({ role: "author", superadmin: 1 });

    // Nobody removes their own superadmin access.
    expect(() => setAccess(db, u("jordan"), "jordan", { access: "author" }, now)).toThrow(/your own/);
    // Dana can take Jordan's away now there are two, but not leave none.
    setAccess(db, u("dana"), "jordan", { access: "author" }, now);
    expect(u("jordan").superadmin).toBe(0);
    expect(() => setAccess(db, u("jordan"), "dana", { access: "author" }, now)).toThrow(/superadmins/);
    expect(() => setAccess(db, u("dana"), "dana", { access: "author" }, now)).toThrow(/your own/);

    // Clearing an approval role keeps it cleared.
    setAccess(db, u("dana"), "hamish", { access: "author", reviewRole: null }, now);
    expect(personDetail(db, u("dana"), "hamish", now).reviewRole).toBeNull();
  });
});
