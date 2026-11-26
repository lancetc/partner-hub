import { beforeEach, describe, expect, it } from "vitest";
import { openDb, type Db } from "./db";
import { userById } from "./auth";
import { acknowledge, inbox } from "./notifications";
import { createPolicyAck, policyAcks, syncPolicyAcks, withdrawPolicyAck } from "./policyAcks";

/* Policy acknowledgements: sent to the roles named, confirmed with the version, picked up by people who arrive later. */

let db: Db;
beforeEach(() => {
  db = openDb(":memory:");
});
const u = (id: string) => userById(db, id)!;
const now = new Date("2026-11-26T01:00:00Z");
const later = new Date("2026-12-10T01:00:00Z");
const send = (roles: string[] = ["supplier"]) =>
  createPolicyAck(
    db,
    u("jordan"),
    {
      title: "Invoicing guidance",
      version: "v2.1",
      summary: "Visit date and service code on every line.",
      href: "/news/extra-visit-time-briefing",
      roles,
      dueOn: "2026-12-03",
    },
    now,
  );

describe("policy acknowledgements", () => {
  it("asks only the roles named, in their Inbox and by email, and records who confirmed which version", () => {
    const { id, sent } = send();
    expect(sent).toBeGreaterThan(0);
    const item = inbox(db, u("sam"), now).action.find((a) => a.title === "Invoicing guidance")!;
    expect(item).toMatchObject({ ackRequired: true, category: "Acknowledgement required", href: "/news/extra-visit-time-briefing" });
    expect(inbox(db, u("riley"), now).action.some((a) => a.title === "Invoicing guidance")).toBe(false);
    const mail = db.prepare("SELECT subject, status FROM outbox WHERE kind = ? AND user_id = 'sam'").get(`policy_ack:${id}`) as {
      subject: string;
      status: string;
    };
    expect(mail).toEqual({ subject: "Please read and acknowledge: Invoicing guidance", status: "queued" });

    acknowledge(db, u("sam"), item.id, now);
    const r = policyAcks(db, u("jordan"), now).requests[0];
    expect(r).toMatchObject({ total: sent, acknowledged: 1, roles: ["Supplier"] });
    expect(r.people.find((p) => p.name === "Sam Taylor")).toMatchObject({ version: "v2.1" });
    // After the due date, whoever hasn't confirmed is overdue.
    expect(policyAcks(db, u("jordan"), later).requests[0].overdue).toBe(sent - 1);
  });

  it("reaches someone who joins later, and withdrawing closes what's still waiting", () => {
    const { id } = send([]);
    db.prepare("DELETE FROM notifications WHERE user_id = 'riley' AND source = ?").run(`policy:${id}`);
    syncPolicyAcks(db, u("riley"), now);
    expect(inbox(db, u("riley"), now).action.some((a) => a.title === "Invoicing guidance")).toBe(true);
    withdrawPolicyAck(db, u("jordan"), { id }, now);
    expect(inbox(db, u("riley"), now).action.find((a) => a.title === "Invoicing guidance")?.done).toBe(true);
    expect(policyAcks(db, u("jordan"), now).requests[0].status).toBe("withdrawn");
  });

  it("is for authors and administrators only, and checks what it's given", () => {
    expect(() => send.call(null)).not.toThrow();
    expect(() => createPolicyAck(db, u("sam"), { title: "x" }, now)).toThrow(/authors/);
    expect(() => createPolicyAck(db, u("jordan"), { title: "Invoicing", version: "v1", href: "https://example.com", dueOn: "2026-12-03" }, now)).toThrow(
      /Link the policy/,
    );
    expect(() => createPolicyAck(db, u("jordan"), { title: "Invoicing", version: "v1", href: "/news/x", dueOn: "2026-01-01" }, now)).toThrow(/due date/);
  });
});
