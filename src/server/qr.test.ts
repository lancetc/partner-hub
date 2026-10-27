import { beforeEach, describe, expect, it } from "vitest";
import { openDb, type Db } from "./db";
import { userById } from "./auth";
import { learnerPath } from "./learningPaths";
import { emailPathQr, localOnly, qrPng, qrSvg, qrTarget } from "./qr";
import type { NotificationAdapter, OutboundMessage, SendResult } from "./notify";

/* QR codes that open a learning path or lesson on a phone, and emailing them to the people assigned. */

let db: Db;
beforeEach(() => {
  db = openDb(":memory:");
});
const u = (id: string) => userById(db, id)!;
const now = new Date("2026-10-26T01:00:00Z");
/** A seeded path with people assigned. */
const assignedPath = () => (db.prepare("SELECT path_id FROM learning_path_assignments LIMIT 1").get() as { path_id: string }).path_id;

class Fake implements NotificationAdapter {
  channel = "email" as const;
  name = "fake";
  configured = true;
  sent: OutboundMessage[] = [];
  constructor(private result: SendResult = { status: "accepted", providerRef: "x" }) {}
  async send(msg: OutboundMessage) {
    this.sent.push(msg);
    return this.result;
  }
}

describe("QR codes", () => {
  it("only point at this hub's own paths and lessons", () => {
    const id = assignedPath();
    expect(qrTarget(db, { kind: "path", id }).url).toMatch(new RegExp(`/paths/${id}$`));
    expect(qrTarget(db, { kind: "lesson", id: "a-little-extra-time" })).toMatchObject({ title: "A little extra time", kind: "Lesson" });
    expect(() => qrTarget(db, { kind: "lesson", id: "https://example.com" })).toThrow(/not found/);
    expect(() => qrTarget(db, { kind: "path", id: "nope" })).toThrow(/not found/);
  });

  it("makes PNG and SVG images", async () => {
    const png = await qrPng("http://localhost:3000/paths/x", 256);
    expect(png.subarray(1, 4).toString()).toBe("PNG");
    expect(await qrSvg("http://localhost:3000/paths/x")).toMatch(/^<svg[\s\S]*#102a43/);
  });

  it("knows when the codes only work on this computer", () => {
    expect(localOnly()).toBe(true);
  });
});

describe("emailing a path's QR code", () => {
  it("sends each assigned person the code and link, once a day", async () => {
    const id = assignedPath();
    const email = new Fake();
    const r = await emailPathQr(db, u("jordan"), id, now, email);
    expect(r.sent).toBe(r.people);
    expect(email.sent.length).toBe(r.people);
    const msg = email.sent[0];
    expect(msg.html).toContain(`/api/qr?path=${id}`);
    expect(msg.body).toContain(`/paths/${id}`);
    expect(msg.idempotencyKey).toBe(`path-qr:${id}:${(db.prepare("SELECT id FROM users WHERE email = ?").get(msg.to.email) as { id: string }).id}:2026-10-26`);
  });

  it("says when email isn't set up, and needs people assigned", async () => {
    const id = assignedPath();
    const r = await emailPathQr(db, u("jordan"), id, now, new Fake({ status: "not_configured", error: "no email" }));
    expect(r).toMatchObject({ sent: 0, notConfigured: r.people });
    db.prepare("DELETE FROM learning_path_assignments WHERE path_id = ?").run(id);
    await expect(emailPathQr(db, u("jordan"), id, now, new Fake())).rejects.toThrow(/Assign the path/);
    await expect(emailPathQr(db, u("sam"), id, now, new Fake())).rejects.toThrow();
  });
});

describe("the path page a QR code opens", () => {
  it("shows the path with the person's own progress", () => {
    const id = assignedPath();
    const who = (db.prepare("SELECT user_id FROM learning_path_assignments WHERE path_id = ?").get(id) as { user_id: string }).user_id;
    const mine = learnerPath(db, u(who), id);
    expect(mine).toMatchObject({ id, assigned: true });
    expect(mine.steps.length).toBeGreaterThan(0);
    const other = db
      .prepare("SELECT id FROM users WHERE role = 'learner' AND id NOT IN (SELECT user_id FROM learning_path_assignments WHERE path_id = ?)")
      .get(id) as { id: string } | undefined;
    if (other) expect(learnerPath(db, u(other.id), id)).toMatchObject({ assigned: false, dueDate: null });
  });
});
