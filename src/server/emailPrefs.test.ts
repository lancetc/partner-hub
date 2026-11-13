import { beforeEach, describe, expect, it } from "vitest";
import { openDb, type Db } from "./db";
import { userById } from "./auth";
import { createCampaign, recipients, sendCampaign, setNewsletters, updateCampaign } from "./campaigns";
import { emailSettings, setAllTopics, setTopic, settingsForToken, tokenFor, wants } from "./emailPrefs";
import type { NotificationAdapter } from "./notify";

/* Email topics: people choose what they get, every email respects it, and the link in any email changes it without signing in. */

let db: Db;
beforeEach(() => {
  db = openDb(":memory:");
});
const now = new Date("2026-11-13T01:00:00Z");
const on = (id: string, topic: string) => emailSettings(db, id).find((t) => t.id === topic)!.on;

const sent: string[] = [];
const adapter: NotificationAdapter = {
  name: "test",
  channel: "email",
  configured: true,
  async send(m) {
    sent.push(m.to.email);
    return { status: "accepted", providerRef: m.idempotencyKey };
  },
};

describe("email topics", () => {
  it("start from each topic's default: most on, the Community round-up off", () => {
    expect(on("sam", "policy")).toBe(true);
    expect(on("sam", "newsletters")).toBe(true);
    expect(on("sam", "community")).toBe(false);
  });

  it("switch on and off, one at a time or all at once", () => {
    setTopic(db, "sam", "news", false, now, "settings");
    expect(wants(db, "sam", "news")).toBe(false);
    expect(wants(db, "ash", "news")).toBe(true);
    setAllTopics(db, "sam", false, now, "settings");
    expect(emailSettings(db, "sam").every((t) => !t.on)).toBe(true);
    setAllTopics(db, "sam", true, now, "settings");
    expect(emailSettings(db, "sam").every((t) => t.on)).toBe(true);
    expect(() => setTopic(db, "sam", "spam", true, now, "settings")).toThrow(/topics listed/);
  });

  it("work from the link in an email, without signing in", () => {
    const token = tokenFor(db, "ash");
    expect(settingsForToken(db, token).firstName).toBe("Ash");
    const r = setNewsletters(db, token, false, now, "policy");
    expect(r).toMatchObject({ topic: "policy", on: false });
    expect(wants(db, "ash", "policy")).toBe(false);
    expect(wants(db, "ash", "newsletters")).toBe(true);
    expect(() => settingsForToken(db, "not-a-real-code")).toThrow(/isn’t valid/);
  });
});

describe("emails respect what people chose", () => {
  it("send a one-off email only to people subscribed to its topic", async () => {
    const jordan = userById(db, "jordan")!;
    const { id } = createCampaign(db, jordan, "one_off", now);
    updateCampaign(db, jordan, id, { name: "Rate change", subject: "Travel rate changes", preheader: "", blocks: [{ id: "b1", type: "text", text: "Hi" }], audience: ["partner", "coordinator"], topic: "policy" }, now);
    const before = recipients(db, ["partner", "coordinator"], "policy").map((u) => u.id);
    expect(before).toContain("sam");

    setTopic(db, "sam", "policy", false, now, "settings");
    expect(recipients(db, ["partner", "coordinator"], "policy").map((u) => u.id)).not.toContain("sam");
    // Turning off policy updates doesn't stop newsletters.
    expect(recipients(db, ["partner", "coordinator"], "newsletters").map((u) => u.id)).toContain("sam");

    sent.length = 0;
    await sendCampaign(db, id, now, adapter);
    expect(sent).not.toContain("sam@example.test");
    expect(sent).toContain("ash@example.test");
  });

  it("keeps the older newsletters setting in step", () => {
    setNewsletters(db, tokenFor(db, "riley"), false, now);
    expect(wants(db, "riley", "newsletters")).toBe(false);
    expect((db.prepare("SELECT newsletters FROM email_prefs WHERE user_id = 'riley'").get() as { newsletters: number }).newsletters).toBe(0);
  });
});
