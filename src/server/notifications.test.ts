import { beforeEach, describe, expect, it } from "vitest";
import { openDb, type Db } from "./db";
import { userById } from "./auth";
import { acknowledge, acknowledgementReport, inbox, inboxCount, markAllRead, markDone, markRead, notify } from "./notifications";
import { campaignDetail, campaignForReader, createCampaign, sendCampaign, updateCampaign } from "./campaigns";
import { setTopic } from "./emailPrefs";
import type { NotificationAdapter } from "./notify";

/* The Inbox: actions that need a response, updates and activity, with acknowledgements on record. */

let db: Db;
beforeEach(() => {
  db = openDb(":memory:");
});
const u = (id: string) => userById(db, id)!;
const now = new Date("2026-11-13T01:00:00Z");
const later = new Date("2026-11-13T03:00:00Z");
const adapter: NotificationAdapter = { name: "test", channel: "email", configured: true, send: async (m) => ({ status: "accepted", providerRef: m.idempotencyKey }) };

describe("the Inbox", () => {
  it("opens with something in each tab, and counts what's outstanding", () => {
    const box = inbox(db, u("sam"), now);
    expect(box.action.length).toBeGreaterThan(0);
    expect(box.updates.length).toBeGreaterThan(0);
    expect(box.activity.length).toBeGreaterThan(0);
    // The critical acknowledgement comes first.
    expect(box.action[0]).toMatchObject({ priority: "critical", ackRequired: true });
    const count = inboxCount(db, u("sam"), now);
    expect(count.total).toBe(count.action + count.updates + count.activity);
    // Seeded once: opening it again adds nothing.
    expect(inbox(db, u("sam"), now).updates.length).toBe(box.updates.length);
  });

  it("keeps actions until they're done; reading isn't enough", () => {
    const ack = inbox(db, u("sam"), now).action.find((a) => a.ackRequired)!;
    markRead(db, u("sam"), ack.id, now);
    expect(inbox(db, u("sam"), now).counts.action).toBe(2);
    expect(() => markAllRead(db, u("sam"), "action", now)).toThrow(/stay until/);
    expect(() => markDone(db, u("sam"), ack.id, now)).toThrow(/Confirm/);
    acknowledge(db, u("sam"), ack.id, later);
    const after = inbox(db, u("sam"), now);
    expect(after.counts.action).toBe(1);
    expect(after.action.find((a) => a.id === ack.id)).toMatchObject({ done: true, ackedAt: later.toISOString() });
  });

  it("marks a whole tab read", () => {
    expect(inbox(db, u("sam"), now).counts.updates).toBeGreaterThan(0);
    markAllRead(db, u("sam"), "update", now);
    expect(inbox(db, u("sam"), now).counts.updates).toBe(0);
  });

  it("adds each thing once per person", () => {
    const n = { kind: "update" as const, category: "News", title: "Hello", source: "test:once" };
    notify(db, "sam", n, now);
    notify(db, "sam", n, now);
    expect(inbox(db, u("sam"), now).updates.filter((x) => x.title === "Hello")).toHaveLength(1);
    expect(() => markRead(db, u("ash"), inbox(db, u("sam"), now).updates[0].id, now)).toThrow(/gone/);
  });
});

describe("critical changes and acknowledgements", () => {
  it("reach everyone, even people who switched emails off, and record who confirmed", async () => {
    const jordan = u("jordan");
    const { id } = createCampaign(db, jordan, "one_off", now);
    updateCampaign(
      db,
      jordan,
      id,
      { name: "Invoicing", subject: "Invoicing is changing", preheader: "Read and confirm", blocks: [{ id: "b1", type: "text", text: "Hi" }], audience: ["partner", "coordinator"], topic: "critical", ack: true },
      now,
    );
    setTopic(db, "sam", "announcements", false, now, "settings");
    setTopic(db, "sam", "policy", false, now, "settings");
    await sendCampaign(db, id, now, adapter);

    const item = inbox(db, u("sam"), now).action.find((a) => a.title === "Invoicing is changing")!;
    expect(item).toMatchObject({ priority: "critical", ackRequired: true, category: "Acknowledgement required" });
    expect(campaignForReader(db, u("sam"), id).html).toContain("Invoicing");
    expect(() => campaignForReader(db, u("jordan"), id)).toThrow(/isn’t in your Inbox/);

    acknowledge(db, u("sam"), item.id, later);
    const report = acknowledgementReport(db, `campaign:${id}`);
    expect(report.acknowledged).toBe(1);
    expect(report.total).toBeGreaterThan(1);
    expect(report.people[0]).toMatchObject({ name: "Sam Taylor", ackedAt: later.toISOString() });
    expect(report.people[0].version).toMatch(/^Invoicing · /);
    expect(campaignDetail(db, jordan, id).acknowledgements?.acknowledged).toBe(1);
  });

  it("only asks for confirmation on critical and policy emails", () => {
    const jordan = u("jordan");
    const { id } = createCampaign(db, jordan, "one_off", now);
    updateCampaign(db, jordan, id, { name: "x", subject: "News", preheader: "", blocks: [{ id: "b1", type: "text", text: "Hi" }], audience: ["partner"], topic: "news", ack: true }, now);
    expect(campaignDetail(db, jordan, id).ack).toBe(false);
  });
});
