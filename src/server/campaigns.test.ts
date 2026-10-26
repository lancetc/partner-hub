import { beforeEach, describe, expect, it } from "vitest";
import { openDb, type Db } from "./db";
import { userById } from "./auth";
import { createCampaign, nextDue, prefsFor, recipients, runDueCampaigns, scheduleCampaign, sendCampaign, sendTest, setNewsletters } from "./campaigns";
import { renderEmail } from "@/lib/emailTemplate";
import type { NotificationAdapter, OutboundMessage } from "./notify";
import { learnerWebinars, saveWebinar, publishWebinar } from "./webinars";

/* Email campaigns (monthly update, quarterly newsletter) and recorded webinars. */

class Fake implements NotificationAdapter {
  channel = "email" as const;
  name = "fake";
  configured = true;
  sent: OutboundMessage[] = [];
  async send(m: OutboundMessage) {
    this.sent.push(m);
    return { status: "accepted" as const, providerRef: `id-${this.sent.length}` };
  }
}

let db: Db;
beforeEach(() => {
  db = openDb(":memory:");
});
const u = (id: string) => userById(db, id)!;
const now = new Date("2026-10-26T00:00:00Z");
const local = (d: Date | null) => d && new Intl.DateTimeFormat("en-AU", { dateStyle: "full", timeStyle: "short", timeZone: "Australia/Brisbane" }).format(d);

describe("email campaigns", () => {
  it("knows when the monthly update and quarterly newsletter are due", () => {
    expect(local(nextDue("monthly", now))).toBe("Tuesday, 3 November 2026 at 9:00 am");
    expect(local(nextDue("quarterly", now))).toBe("Tuesday, 5 January 2027 at 9:00 am");
  });

  it("starts a newsletter from its template, ready to send on the due date", () => {
    const { id } = createCampaign(db, u("jordan"), "quarterly", now);
    const row = db.prepare("SELECT * FROM campaigns WHERE id = ?").get(id) as { name: string; blocks: string; send_at: string };
    expect(row.name).toBe("Quarterly newsletter · Q1 2027");
    expect(JSON.parse(row.blocks).map((b: { type: string }) => b.type)).toContain("story");
    expect(() => createCampaign(db, u("casey"), "monthly", now)).toThrow(/learning authors/);
  });

  it("sends partners and coordinators one copy each, never staff or people who unsubscribed", async () => {
    const { id } = createCampaign(db, u("jordan"), "monthly", now);
    setNewsletters(db, prefsFor(db, "ash").token, false, now);
    expect(recipients(db, ["partner", "coordinator"]).map((x) => x.id).sort()).toEqual(["casey", "riley", "sam"]);
    const fake = new Fake();
    const first = await sendCampaign(db, id, now, fake, u("jordan"));
    expect(first.sent).toBe(3);
    expect(fake.sent[0].headers?.["List-Unsubscribe"]).toMatch(/\/unsubscribe\?t=/);
    expect(fake.sent[0].html).toContain("Unsubscribe from newsletters");
    await expect(sendCampaign(db, id, now, fake, u("jordan"))).rejects.toThrow(/already gone out/);
  });

  it("sends scheduled campaigns when their time comes", async () => {
    const { id } = createCampaign(db, u("jordan"), "monthly", now);
    scheduleCampaign(db, u("jordan"), id, "2026-11-02T23:00:00Z", now);
    const fake = new Fake();
    expect(await runDueCampaigns(db, new Date("2026-11-01T00:00:00Z"), fake)).toBe(0);
    expect(await runDueCampaigns(db, new Date("2026-11-03T00:00:00Z"), fake)).toBe(4);
    expect(() => scheduleCampaign(db, u("jordan"), id, "2026-12-01T00:00:00Z", now)).toThrow(/already gone out/);
  });

  it("sends a marked test copy only to the author", async () => {
    const { id } = createCampaign(db, u("jordan"), "monthly", now);
    const fake = new Fake();
    await sendTest(db, u("jordan"), id, now, fake);
    expect(fake.sent.map((m) => [m.to.email, m.subject.startsWith("[Test]")])).toEqual([["jordan@example.test", true]]);
  });

  it("greets people by name and keeps what they type from becoming HTML", () => {
    const { html, text } = renderEmail(
      { subject: "S", preheader: "P", blocks: [{ id: "a", type: "text", text: "Hi {{first_name}}, <b>bold</b>" }] },
      { firstName: "Sam", baseUrl: "https://hub", unsubscribeUrl: "https://hub/unsubscribe?t=x", webinars: new Map() },
    );
    expect(html).toContain("Hi Sam, &lt;b&gt;bold&lt;/b&gt;");
    expect(text).toContain("Unsubscribe: https://hub/unsubscribe?t=x");
  });
});

describe("webinars", () => {
  const input = { title: "Coordinator Q&A", summary: "", presenter: "", recordedOn: "2026-10-01", minutes: 30, video: { provider: "youtube" as const, id: "dQw4w9WgXcQ" }, thumbnail: null, audience: ["coordinator" as const], topics: ["Q&A"], transcript: "", resources: [] };

  it("shows learners published recordings meant for them", () => {
    const { id } = saveWebinar(db, u("jordan"), null, input, now);
    expect(learnerWebinars(db, u("riley")).map((w) => w.id)).not.toContain(id);
    publishWebinar(db, u("jordan"), id, true, now);
    expect(learnerWebinars(db, u("riley")).map((w) => w.id)).toContain(id);
    expect(learnerWebinars(db, u("sam")).map((w) => w.id)).not.toContain(id);
  });

  it("needs a playable recording and an audience", () => {
    expect(() => saveWebinar(db, u("jordan"), null, { ...input, video: { provider: "youtube", id: "nope" } }, now)).toThrow(/recording/);
    expect(() => saveWebinar(db, u("jordan"), null, { ...input, audience: [] }, now)).toThrow(/who it’s for/);
  });
});
