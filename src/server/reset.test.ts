import { beforeEach, describe, expect, it } from "vitest";
import { openDb, type Db } from "./db";
import { userById, type User } from "./auth";
import { createGuide, publishGuide, readGuide } from "./magazine";
import { publishChecks } from "@/lib/magazine";
import { cleanProgress, copyChecks, eligiblePosts, freshReset, isStale, markerPosition, type ResetBlockData } from "@/lib/reset";
import { members, posts } from "@/content/community";
import { RESET_CASES } from "@/content/resetCases";
import { flagReset, moderation, resetEvent, resetState, resetStats, resolveFlag, saveReset, setModeration } from "./reset";

/* The Expectation Reset: peer posts follow the Community's moderation, months stay fictional, and scripts promise nothing. */

let db: Db;
let jordan: User, riley: User;
const now = new Date("2026-11-20T00:00:00Z");
const SIGNED = {
  owner: "Learning and Community",
  operations: "Care Operations",
  quality: "Quality",
  privacy: "Privacy",
  communications: "Communications",
  approvedOn: "2026-11-20",
};
const SOURCE = { title: "Waiting-period contact SOP", version: "1.0" };
const seed = () => RESET_CASES[0].data;
const reviewed = (data: ResetBlockData, due = "2027-05-20"): ResetBlockData => ({
  ...data,
  markers: data.markers.map((m) => ({
    ...m,
    featured: { ...m.featured, reviewedBy: "Care Operations and Quality", policyId: "SOP-WAIT-01", approvedOn: "2026-11-20", reviewDue: due },
  })),
  approval: SIGNED,
  source: SOURCE,
});
const pages = (data: ResetBlockData) => [
  {
    id: "p1",
    title: "Arthur",
    purpose: "",
    template: "blank",
    kind: "content",
    required: true,
    allActivities: false,
    sections: [{ id: "s1", title: "Story", blocks: [{ id: "rs", type: "reset", ...data }] }],
  },
];
const blocking = (data: ResetBlockData) => publishChecks({ schema: 2, pages: pages(data) } as never, "confirm").blocking;
function course(data: ResetBlockData) {
  const c = createGuide(db, jordan, { title: "Arthur’s wait", completion: "confirm", doc: { schema: 2, pages: pages(data) } }, now);
  publishGuide(db, jordan, c.id, "", now);
  return c;
}
const m4 = () => seed().markers.find((m) => m.id === "ar-m4")!;

beforeEach(() => {
  db = openDb(":memory:");
  [jordan, riley] = ["jordan", "riley"].map((id) => userById(db, id)!);
});

describe("the case an author publishes", () => {
  it("the starter is complete apart from its reviews and sign-off", () => {
    const p = blocking(seed()).join(" ");
    expect(p).toMatch(/record who reviewed the script/);
    expect(p).toMatch(/sign-off is required/);
    expect(blocking(reviewed(seed()))).toEqual([]);
  });

  it("can't be published without sign-off, even with Publish anyway", () => {
    const c = createGuide(db, jordan, { title: "Unsigned", completion: "confirm", doc: { schema: 2, pages: pages(seed()) } }, now);
    expect(() => publishGuide(db, jordan, c.id, "", now, { allowUnverified: true })).toThrow(/Expectation Reset timeline needs its sign-off/);
    expect(() => course(reviewed(seed()))).not.toThrow();
  });

  it("puts Month 4 between Month 3 and Month 5 without adding a milestone", () => {
    const b = seed();
    expect(b.nodes.map((n) => n.label)).not.toContain("Month 4");
    expect(markerPosition(b, m4())).toEqual({ at: -1, between: [1, 2] });
    const bad = structuredClone(reviewed(seed()));
    bad.markers[1].anchor = { node: "", after: "ar-n-m5", before: "ar-n-m3" };
    expect(blocking(bad).join(" ")).toMatch(/must come before the second/);
  });

  it("an approved free offer needs its scope", () => {
    expect(blocking({ ...reviewed(seed()), offer: { approved: true, scope: "" } }).join(" ")).toMatch(/approved offer needs its exact scope/);
  });

  it("gives a copy fresh ids that the anchors still point at", () => {
    const b = freshReset(freshReset(seed(), "aaaaa"), "bbbbb");
    expect(b.markers[1].anchor).toEqual({ node: "", after: "ar-n-m3-xbbbbb", before: "ar-n-m5-xbbbbb" });
  });
});

describe("the scripts", () => {
  it("say funding isn't allocated, and promise no start date", () => {
    for (const m of seed().markers) {
      for (const t of [m.featured.text, m.featured.family]) {
        expect(t).toMatch(/still waiting for funding|no date yet|start date yet|isn’t a start date|can’t give you a start date/i);
        expect(t).not.toMatch(/next month|will start in|by (january|february|march|april|may|june|july|august|september|october|november|december)/i);
      }
    }
  });

  it("the family version asks for the person's information-sharing choice to be checked before copying", () => {
    expect(copyChecks(true, "Arthur", "Chloe").map((c) => c.label)).toContain("I’ve checked what Arthur has agreed Chloe can be told");
    expect(copyChecks(false, "Arthur", "Chloe").some((c) => c.id === "consent")).toBe(false);
  });

  it("a script past its review date is stale", () => {
    expect(isStale(reviewed(seed(), "2026-11-19").markers[0], "2026-11-20")).toBe(true);
    expect(isStale(reviewed(seed()).markers[0], "2026-11-20")).toBe(false);
    expect(isStale(seed().markers[0], "2026-11-20")).toBe(true);
  });
});

describe("peer approaches from the Community", () => {
  it("only moderator-approved, reuse-consented, stage-matching posts appear", () => {
    const cards = eligiblePosts(m4(), posts, members, new Set(), "2026-11-20");
    expect(cards.map((c) => c.postId).sort()).toEqual(["waiting-chat", "waiting-rhythm"]);
    // Wrong stage, or a role the post isn't for: nothing.
    expect(eligiblePosts({ ...m4(), stage: "after-allocation" }, posts, members, new Set(), "2026-11-20")).toEqual([]);
    expect(eligiblePosts({ ...m4(), roles: ["finance"] }, posts, members, new Set(), "2026-11-20")).toEqual([]);
    // Out of its review date: gone.
    expect(eligiblePosts(m4(), posts, members, new Set(), "2027-06-01")).toEqual([]);
  });

  it("can't be made authoritative by votes, and respects the contributor's attribution", () => {
    const loud = posts.map((p) => (p.id === "waiting-promise" ? { ...p, likes: 9999, learning: { ...p.learning!, consent: true } } : p));
    const cards = eligiblePosts(m4(), loud, members, new Set(), "2026-11-20");
    expect(cards.some((c) => c.postId === "waiting-promise")).toBe(false);
    expect(JSON.stringify(cards)).not.toMatch(/endorse|policy/i);
    const changed = eligiblePosts(seed().markers[2], posts, members, new Set(), "2026-11-20").find((c) => c.postId === "waiting-changed")!;
    expect(changed).toMatchObject({ author: "", role: "Care coordinator" });
  });

  it("a post withdrawn in the Community disappears from the lesson at once, and comes back if restored", () => {
    const c = course(reviewed(seed()));
    expect(resetState(db, riley, c.id, "rs", now).peers["ar-m4"].map((x) => x.postId)).toContain("waiting-rhythm");
    expect(() => setModeration(db, riley, { postId: "waiting-rhythm", state: "withdrawn", reason: "Out of date" }, now)).toThrow();
    expect(() => setModeration(db, jordan, { postId: "waiting-rhythm", state: "withdrawn" }, now)).toThrow(/why/);
    setModeration(db, jordan, { postId: "waiting-rhythm", state: "withdrawn", reason: "Out of date" }, now);
    expect(resetState(db, riley, c.id, "rs", now).peers["ar-m4"].map((x) => x.postId)).not.toContain("waiting-rhythm");
    expect(moderation(db, riley)).toEqual({ withdrawn: ["waiting-rhythm"], canModerate: false, reasons: {} });
    setModeration(db, jordan, { postId: "waiting-rhythm", state: "published" }, now);
    expect(resetState(db, riley, c.id, "rs", now).peers["ar-m4"].map((x) => x.postId)).toContain("waiting-rhythm");
  });
});

describe("the learner's progress, events and flags", () => {
  it("keeps first takes private, and events say which marker without the words", () => {
    const c = course(reviewed(seed()));
    saveReset(
      db,
      riley,
      c.id,
      {
        blockId: "rs",
        progress: { opened: ["ar-m4", "nope"], takes: { "ar-m4": "I'd tell Chloe it should be next month." }, saved: ["post:waiting-rhythm", "post:other"] },
      },
      now,
    );
    expect(resetState(db, riley, c.id, "rs", now).progress).toEqual({
      opened: ["ar-m4"],
      takes: { "ar-m4": "I'd tell Chloe it should be next month." },
      saved: ["post:waiting-rhythm"],
    });
    expect(resetState(db, jordan, c.id, "rs", now).progress.takes).toEqual({});
    resetEvent(db, riley, c.id, { blockId: "rs", event: "copied", marker: "ar-m4" }, now);
    resetEvent(db, riley, c.id, { blockId: "rs", event: "take", marker: "ar-m4" }, now);
    expect(() => resetEvent(db, riley, c.id, { blockId: "rs", event: "sent", marker: "ar-m4" }, now)).toThrow(/Unknown event/);
    const stats = resetStats(db, jordan, c.id);
    expect(stats.byMarker["ar-m4"]).toEqual({ copied: 1, take: 1 });
    expect(JSON.stringify(stats)).not.toMatch(/next month/);
  });

  it("flags go to a queue authors can resolve", () => {
    const c = course(reviewed(seed()));
    expect(() => flagReset(db, riley, c.id, { blockId: "rs", marker: "ar-m4", target: "featured", text: "no" }, now)).toThrow(/Say a little/);
    flagReset(db, riley, c.id, { blockId: "rs", marker: "ar-m4", target: "waiting-chat", text: "The offer wording has changed." }, now);
    const stats = resetStats(db, jordan, c.id);
    expect(stats.flags).toMatchObject([{ marker_id: "ar-m4", target: "post:waiting-chat", text: "The offer wording has changed." }]);
    expect(stats.byMarker["ar-m4"]).toEqual({ flagged: 1 });
    expect(() => resetStats(db, riley, c.id)).toThrow();
    expect(resolveFlag(db, jordan, c.id, { flagId: stats.flags[0].id }, now).flags).toEqual([]);
  });

  it("marks the starter's unreviewed scripts as stale, so they can't be copied", () => {
    const c = course({
      ...seed(),
      approval: SIGNED,
      source: SOURCE,
      markers: reviewed(seed()).markers.map((m, i) => (i === 0 ? { ...m, featured: { ...m.featured, reviewDue: "2026-11-01" } } : m)),
    });
    expect(resetState(db, riley, c.id, "rs", now).stale).toEqual(["ar-m3"]);
    expect(JSON.stringify(readGuide(db, riley, c.slug))).toContain("A useful check-in when the date is still unknown");
  });

  it("ignores progress for markers and posts the block doesn't have", () => {
    expect(cleanProgress(seed(), { opened: ["x"], takes: { x: "y" }, saved: ["featured:x", "featured:ar-m3"] })).toEqual({
      opened: [],
      takes: {},
      saved: ["featured:ar-m3"],
    });
  });
});
