import { beforeEach, describe, expect, it } from "vitest";
import { openDb, type Db } from "./db";
import { userById, type User } from "./auth";
import { activityDone, readGuideDoc } from "@/lib/magazine";
import { createGuide, finishPage, publishGuide, readGuide, recordGuideEvent, saveGuideDraft } from "./magazine";

/* An acknowledgement: a callout readers tick to confirm. The page waits for the tick, and the tick is recorded. */

let db: Db;
let author: User, partner: User;
const now = new Date("2026-11-19T00:00:00Z");
const ACK = {
  id: "ack",
  type: "callout",
  style: "important",
  label: "Your acknowledgement",
  body: "Finishing this page confirms what's expected of you.",
  confirm: "I understand and agree",
};
const doc = (blocks: unknown[]) => ({
  schema: 2,
  pages: [{ id: "p1", title: "", purpose: "", template: "blank", kind: "content", required: true, sections: [{ id: "s", title: "S", blocks }] }],
});

beforeEach(() => {
  db = openDb(":memory:");
  author = userById(db, "jordan")!;
  partner = userById(db, "riley")!;
});

describe("an acknowledgement to tick", () => {
  it("keeps the words to confirm, and counts as an activity only when it asks for a tick", () => {
    const [b] = readGuideDoc(doc([ACK])).pages[0].sections[0].blocks;
    expect(b).toMatchObject({ type: "callout", confirm: "I understand and agree" });
    expect(activityDone(b, {})).toBe(false);
    expect(activityDone(b, { "done:ack": "1" })).toBe(true);
    const [plain] = readGuideDoc(doc([{ ...ACK, confirm: undefined }])).pages[0].sections[0].blocks;
    expect(activityDone(plain, {})).toBeNull();
  });

  it("holds the page until it's ticked, then records what was confirmed", () => {
    const c = createGuide(db, author, { title: "Declaration", completion: "confirm", doc: doc([ACK]) }, now);
    publishGuide(db, author, c.id, "", now);
    const g = readGuide(db, partner, c.slug);
    expect(() => finishPage(db, partner, c.slug, g.revisionId, "p1", now)).toThrow(/every activity on this page first/);
    recordGuideEvent(db, partner, g.id, { event: "engaged", revisionId: g.revisionId, blockId: "ack" }, now);
    recordGuideEvent(db, partner, g.id, { event: "engaged", revisionId: g.revisionId, blockId: "ack" }, now);
    const events = db.prepare("SELECT event, page_id, block_id, detail FROM magazine_events WHERE guide_id = ? AND event = 'callout.confirmed'").all(g.id);
    expect(events).toEqual([{ event: "callout.confirmed", page_id: "p1", block_id: "ack", detail: JSON.stringify({ confirmed: "I understand and agree" }) }]);
    expect(finishPage(db, partner, c.slug, g.revisionId, "p1", now).completed).toMatchObject({ kind: "completed" });
  });
});

describe("two editors on one course", () => {
  it("refuses a save from an editor that's behind, unless it keeps its own version on purpose", () => {
    const c = createGuide(db, author, { title: "Two tabs", completion: "confirm", doc: doc([ACK]) }, now);
    const opened = c.savedAt;
    // One tab saves...
    const later = new Date("2026-11-19T00:05:00Z");
    const first = saveGuideDraft(db, author, c.id, { doc: doc([{ ...ACK, body: "Newer words." }]), basedOn: opened }, later);
    // ...then a tab still holding the older version tries to save.
    expect(() => saveGuideDraft(db, author, c.id, { doc: doc([ACK]), basedOn: opened }, new Date("2026-11-19T00:06:00Z"))).toThrow(/changed in another tab/);
    // The newer save carries on from where it got to, and a deliberate "keep mine" (no basedOn) still saves.
    expect(saveGuideDraft(db, author, c.id, { doc: doc([ACK]), basedOn: first.savedAt }, new Date("2026-11-19T00:07:00Z")).savedAt).toBe("2026-11-19T00:07:00.000Z");
    expect(saveGuideDraft(db, author, c.id, { doc: doc([ACK]) }, new Date("2026-11-19T00:08:00Z")).savedAt).toBe("2026-11-19T00:08:00.000Z");
  });
});
