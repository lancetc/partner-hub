import { beforeEach, describe, expect, it } from "vitest";
import { openDb, type Db } from "./db";
import { userById, type User } from "./auth";
import {
  CATEGORIES,
  checkItems,
  cleanTile,
  contentStatus,
  copyText,
  DEMO_COPY_HEADER,
  DEMO_LABEL,
  FILTER_CATEGORIES,
  filterCategories,
  matchTiles,
  tileProblems,
  type MythTileData,
} from "@/lib/myths";
import { DEMO_OWNER, DEMO_REVIEWED, DEMO_TILES } from "@/content/mythDemoTiles";
import { SEED_TILES } from "@/content/mythTiles";
import { approveTile, flagMyth, library, logMyth, openMythFlags, pauseTile, retireTile, saveTile, seedMythTiles, tilesFor } from "./myths";
import { favouritesList } from "./favourites";
import { drawerData, homePins, pinTool, saveTool } from "./pocketPlaybook";
import { search } from "./search";

/* The fifteen Myth vs Reality demonstration entries, and what was added for them (docs/myth-vs-reality.md). */

let db: Db;
let jordan: User, riley: User;
const now = new Date("2026-11-25T00:00:00Z");
const demo = (n: number) => DEMO_TILES[n - 1];
const ids = () =>
  (db.prepare("SELECT id, version FROM myth_tiles ORDER BY id, version").all() as { id: string; version: number }[]).map((r) => `${r.id}@${r.version}`);
/** A demo entry made approvable: what the library asks for before sign-off, filled in. */
const ready = (d: MythTileData): MythTileData => ({
  ...structuredClone(d),
  demo: false,
  applicability: ["sah_ongoing"],
  anchors: d.anchors.map((a) => ({ ...a, section: "Whole page", unverified: false, url: a.url || "https://example.org/policy", verifiedOn: "2026-11-24" })),
  message: { subject: "Your question", body: d.message.body },
  reviewDue: "2027-02-25",
  approval: {
    owner: DEMO_OWNER,
    quality: "Quality",
    operations: "Care Operations",
    finance: "Finance",
    clinical: "Clinical",
    communications: "Communications",
    approvedOn: "2026-11-25",
  },
});
const approve = (n: number) => {
  saveTile(db, jordan, { id: demo(n).id, data: ready(demo(n).data) }, now);
  return approveTile(db, jordan, demo(n).id, now);
};

beforeEach(() => {
  db = openDb(":memory:");
  [jordan, riley] = ["jordan", "riley"].map((id) => userById(db, id)!);
});

describe("the demonstration entries", () => {
  it("are fifteen, with stable ids, every field, the demo owner and review date, and drafts only", () => {
    expect(DEMO_TILES).toHaveLength(15);
    expect(new Set(DEMO_TILES.map((t) => t.id)).size).toBe(15);
    for (const t of DEMO_TILES) {
      const d = t.data;
      expect(t.id).toMatch(/^demo-myth-\d\d-[a-z0-9-]+$/);
      expect([d.quote, d.myth, d.reality, d.answer, d.checks[0], d.message.body].every((s) => s && s.trim())).toBe(true);
      expect(d.anchors).toHaveLength(1);
      expect(d.demo).toBe(true);
      expect(d.lastReviewed).toBe(DEMO_REVIEWED);
      expect(d.contentOwner).toBe("Quality and Compliance");
      expect(d.approval.owner).toBe("");
      expect(cleanTile(d)).toEqual(d);
    }
    expect(DEMO_REVIEWED).toBe("2026-11-25");
  });

  it("keep the brief's wording, and mark the two internal-policy sources unverified", () => {
    expect(demo(1).data.quote).toBe("Will I lose all my unspent funds?");
    expect(demo(1).data.answer).toMatch(/^You don't necessarily need to spend everything\. You can carry forward up to \$1,000 or 10%/);
    expect(demo(15).data.reality).toBe("From 1 October 2026, personal care moved into the Clinical Supports contribution category under Support at Home.");
    const unverified = DEMO_TILES.filter((t) => t.data.anchors[0].unverified);
    expect(unverified.map((t) => t.id)).toEqual([demo(7).id, demo(13).id]);
    expect(demo(7).data.anchors[0].document).toBe("Support at Home service guidance and Trilogy Care scope-of-practice policy, pending internal verification.");
    expect(demo(13).data.anchors[0].document).toBe("Support at Home charging guidance and Trilogy Care invoice dispute policy, pending internal verification.");
    expect(demo(1).data.anchors[0]).toMatchObject({
      document: "Individualised budgets for Support at Home participants",
      url: "https://www.health.gov.au/our-work/support-at-home/managing-support-at-home-services/individualised-budgets-for-support-at-home-participants",
      unverified: false,
    });
  });

  it("can't be approved as they stand: demo content, unverified sources and missing sign-off all block it", () => {
    const p = tileProblems(demo(7).data).join(" ");
    expect(p).toMatch(/demonstration content/);
    expect(p).toMatch(/unverified/);
    expect(p).toMatch(/sign-off/);
    seedMythTiles(db, DEMO_TILES, now);
    expect(() => approveTile(db, jordan, demo(1).id, now)).toThrow(/demonstration content/);
    expect(tileProblems(ready(demo(7).data))).toEqual([]);
  });
});

describe("the seed", () => {
  it("is idempotent: a second run creates nothing", () => {
    const first = seedMythTiles(db, DEMO_TILES, now);
    expect(first.created).toHaveLength(15);
    const after = ids();
    const second = seedMythTiles(db, DEMO_TILES, new Date("2026-11-26T00:00:00Z"));
    expect(second.created).toEqual([]);
    expect(second.kept).toHaveLength(15);
    expect(second.kept.every((k) => !k.edited)).toBe(true);
    expect(ids()).toEqual(after);
    const row = db.prepare("SELECT status, created_by FROM myth_tiles WHERE id = ?").get(demo(1).id) as { status: string; created_by: string };
    expect(row).toEqual({ status: "draft", created_by: "seed-demo" });
  });

  it("never overwrites an entry an author has edited, or one approved since", () => {
    seedMythTiles(db, DEMO_TILES, now);
    const edited = { ...structuredClone(demo(3).data), reality: "Edited by an author." };
    saveTile(db, jordan, { id: demo(3).id, data: edited }, now);
    approve(5);
    const again = seedMythTiles(db, DEMO_TILES, now);
    expect(again.created).toEqual([]);
    expect(again.kept.find((k) => k.id === demo(3).id)?.edited).toBe(true);
    expect(again.kept.find((k) => k.id === demo(5).id)?.edited).toBe(true);
    const lib = library(db, jordan, now).tiles;
    expect(lib.find((t) => t.id === demo(3).id)?.latest.data.reality).toBe("Edited by an author.");
    expect(lib.find((t) => t.id === demo(5).id)?.status).toBe("approved");
  });

  it("adds only what's missing, and leaves the original four seed tiles alone", () => {
    seedMythTiles(db, DEMO_TILES.slice(0, 5), now);
    const r = seedMythTiles(db, DEMO_TILES, now);
    expect(r.created).toHaveLength(10);
    expect(library(db, jordan, now).tiles).toHaveLength(19);
    expect(SEED_TILES.every((s) => library(db, jordan, now).tiles.some((t) => t.id === s.id && t.status === "draft"))).toBe(true);
  });
});

describe("statuses and the live library", () => {
  beforeEach(() => void seedMythTiles(db, DEMO_TILES, now));

  it("maps draft, under review, approved and retired onto the versions", () => {
    const status = (n: number) => library(db, jordan, now).tiles.find((t) => t.id === demo(n).id)!.status;
    expect(status(1)).toBe("draft");
    approve(1);
    expect(status(1)).toBe("approved");
    pauseTile(db, jordan, demo(1).id, true, "Policy changed", now);
    expect(status(1)).toBe("under-review");
    expect(status(2)).toBe("draft");
    expect(() => retireTile(db, jordan, demo(1).id, "", now)).toThrow(/why/);
    retireTile(db, jordan, demo(1).id, "Superseded", now);
    expect(status(1)).toBe("retired");
    expect(() => retireTile(db, riley, demo(2).id, "No", now)).toThrow();
    // Past its review date reads as under review too.
    approve(2);
    expect(library(db, jordan, new Date("2027-03-01T00:00:00Z")).tiles.find((t) => t.id === demo(2).id)!.status).toBe("under-review");
    expect(contentStatus([], "2026-11-25")).toBe("retired");
  });

  it("shows learners only approved, current entries; drafts and demo content never", () => {
    expect(tilesFor(db, riley, null, now).tiles).toEqual([]);
    expect(tilesFor(db, riley, null, now, { preview: true }).tiles).toEqual([]);
    expect(tilesFor(db, riley, null, now).canPreview).toBe(false);
    approve(1);
    approve(2);
    expect(tilesFor(db, riley, null, now).tiles.map((t) => t.id)).toEqual([demo(1).id, demo(2).id]);
    // Under review leaves the live library; a course that asks for it by id still shows it, with copying off.
    pauseTile(db, jordan, demo(2).id, true, "Checking", now);
    expect(tilesFor(db, riley, null, now).tiles.map((t) => t.id)).toEqual([demo(1).id]);
    expect(tilesFor(db, riley, [demo(2).id], now).tiles[0]).toMatchObject({ state: "under-review", copyable: false });
    // Retired: gone from both, and from the preview.
    retireTile(db, jordan, demo(1).id, "Superseded", now);
    expect(tilesFor(db, riley, null, now).tiles).toEqual([]);
    expect(tilesFor(db, riley, [demo(1).id], now).missing).toEqual([demo(1).id]);
    expect(tilesFor(db, jordan, null, now, { preview: true }).tiles.some((t) => t.id === demo(1).id)).toBe(false);
  });

  it("labels the author's preview: every draft and demo entry is marked, and nothing copied passes as approved", () => {
    const p = tilesFor(db, jordan, null, now, { preview: true });
    expect(p.canPreview).toBe(true);
    expect(p.tiles).toHaveLength(19);
    const demos = p.tiles.filter((t) => t.data.demo);
    expect(demos).toHaveLength(15);
    expect(demos.every((t) => t.preview === true && t.status === "draft" && t.copyable === false)).toBe(true);
    expect(DEMO_LABEL).toBe("Demo content · Pending compliance approval");
    // The server refuses to record a copy of a draft, of either the email or the script.
    expect(() => logMyth(db, jordan, { event: "copied", tileId: demo(1).id, version: 1 }, now)).toThrow(/can’t be copied/);
    expect(() => logMyth(db, jordan, { event: "script-copied", tileId: demo(1).id, version: 1 }, now)).toThrow(/can’t be copied/);
  });
});

describe("copying, checks and search", () => {
  it("copies the script and the email exactly, and marks anything from a draft or demo entry", () => {
    const d = demo(1).data;
    expect(copyText("script", d, false)).toBe(d.answer);
    expect(copyText("email", d, false)).toBe(d.message.body);
    expect(copyText("email", { ...d, message: { subject: "Your budget", body: d.message.body } }, false)).toBe(`Subject: Your budget\n\n${d.message.body}`);
    expect(copyText("script", d, true)).toBe(`${DEMO_COPY_HEADER}\n\n${d.answer}`);
    expect(copyText("email", d, true, { subject: "", body: "Edited" })).toBe(`${DEMO_COPY_HEADER}\n\nEdited`);
    expect(DEMO_COPY_HEADER).toMatch(/Not an approved Trilogy Care communication\. Do not send\./);
  });

  it("expands a check list into its items, words unchanged", () => {
    expect(checkItems(demo(1).data.checks)).toEqual(["Quarterly allocation", "outstanding invoices", "committed services", "retained Home Care Package funds"]);
    expect(checkItems(["One check?", "Another"])).toEqual(["One check?", "Another"]);
    expect(checkItems(["Just one"])).toEqual(["Just one"]);
  });

  it("finds entries by participants' own words as well as the professional terms", () => {
    const find = (q: string, category = "") => matchTiles(DEMO_TILES, q, category, "").map((t) => t.id);
    for (const q of ["lose my money", "quarter end", "leftover funds"]) {
      const hits = matchTiles(DEMO_TILES, q, "", "");
      expect(hits.map((t) => t.id)).toContain(demo(1).id);
      expect(hits.every((t) => t.data.category === "budget")).toBe(true);
    }
    expect(find("leftover funds")).toEqual([demo(1).id, demo(14).id]);
    expect(find("carry forward")).toEqual([demo(1).id]);
    expect(find("my own gardener")).toEqual([demo(3).id]);
    expect(find("claim it back")).toEqual([demo(8).id]);
    expect(find("power of attorney")).toEqual([demo(11).id]);
    expect(find("didn’t turn up")).toEqual([demo(13).id]);
    expect(find("AT-HM")).toEqual([demo(4).id, demo(8).id]);
  });

  it("puts approved entries in site search by those words, and never a draft", () => {
    seedMythTiles(db, DEMO_TILES, now);
    expect(search(db, riley, "leftover funds").some((r) => r.id.startsWith("myth:"))).toBe(false);
    approve(1);
    const hits = search(db, riley, "leftover funds");
    expect(hits.find((r) => r.id === `myth:${demo(1).id}`)).toMatchObject({
      href: `/resources/myths?tile=${demo(1).id}`,
      meta: "Myth vs Reality · Funding and budgets",
    });
    expect(search(db, riley, "lose my money").some((r) => r.id === `myth:${demo(1).id}`)).toBe(true);
    expect(search(db, riley, "quarter end").some((r) => r.id === `myth:${demo(14).id}`)).toBe(false);
  });

  it("filters by every topic, including the two the brief added", () => {
    expect(FILTER_CATEGORIES.map((c) => CATEGORIES[c])).toEqual([
      "Funding and budgets",
      "Contributions and fees",
      "Provider choice",
      "Service eligibility",
      "Equipment and home modifications",
      "Equipment and reimbursement",
      "Privacy and decision-making",
      "Supported decision-making",
      "Worker roles and safety",
      "Complaints and rights",
      "Choice and independence",
      "Assessments and funding",
      "Invoices and service delivery",
    ]);
    for (const c of FILTER_CATEGORIES) expect(matchTiles(DEMO_TILES, "", c, "").length).toBeGreaterThan(0);
    expect(matchTiles(DEMO_TILES, "", "equipment-reimbursement", "").map((t) => t.id)).toEqual([demo(8).id]);
    expect(matchTiles(DEMO_TILES, "", "supported-decisions", "").map((t) => t.id)).toEqual([demo(11).id]);
    expect(matchTiles(DEMO_TILES, "", "budget", "").map((t) => t.id)).toEqual([demo(1).id, demo(14).id]);
    expect(matchTiles(DEMO_TILES, "", "contributions", "").map((t) => t.id)).toEqual([demo(2).id, demo(15).id]);
    // The older topics appear only when a tile uses them.
    expect(filterCategories(DEMO_TILES)).toEqual(FILTER_CATEGORIES);
    expect(filterCategories([...DEMO_TILES, ...SEED_TILES])).toEqual([...FILTER_CATEGORIES, "self-management", "care-plan"]);
  });
});

describe("favourites, pins and flags", () => {
  beforeEach(() => void seedMythTiles(db, DEMO_TILES, now));

  it("saves and pins an approved entry to the dashboard, through the same Favourites and pins as Work Tools", () => {
    expect(() => pinTool(db, riley, { kind: "myth", id: demo(1).id, on: true }, now)).toThrow(/Only an approved/);
    approve(1);
    expect(saveTool(db, riley, { kind: "myth", id: demo(1).id }, now)).toMatchObject({ saved: true, pinned: false });
    expect(tilesFor(db, riley, null, now).favs).toEqual({ [demo(1).id]: { pinned: false } });
    expect(pinTool(db, riley, { kind: "myth", id: demo(1).id, on: true }, now)).toMatchObject({ pinned: true, saved: true });
    pinTool(db, riley, { kind: "myth", id: demo(1).id, on: true }, now);
    expect(db.prepare("SELECT COUNT(*) AS n FROM favourites WHERE user_id = 'riley'").get()).toEqual({ n: 1 });
    expect(tilesFor(db, riley, null, now).favs[demo(1).id]).toEqual({ pinned: true });
    const fav = favouritesList(db, riley, {}, now).items[0];
    expect(fav).toMatchObject({ kind: "tool", label: "Myth vs Reality", title: demo(1).data.quote, pinned: true, state: "current" });
    expect(fav.href).toBe(`/resources/myths?tile=${demo(1).id}`);
    const pins = homePins(db, riley, now).pinned;
    expect(pins).toHaveLength(1);
    expect(pins[0]).toMatchObject({ id: `myth:${demo(1).id}`, label: "Myth vs Reality", inDrawer: false, pinned: true });
    // The drawer unpins with the pin's own kind and id.
    pinTool(db, riley, { kind: "tool", id: pins[0].id, on: false }, now);
    expect(drawerData(db, riley, now).pinned).toEqual([]);
    expect(favouritesList(db, riley, {}, now).items).toHaveLength(1);
    // Someone else's list is untouched, and theirs is their own.
    expect(tilesFor(db, jordan, null, now).favs).toEqual({});
    saveTool(db, riley, { kind: "myth", id: demo(1).id, on: false }, now);
    expect(favouritesList(db, riley, {}, now).items).toEqual([]);
  });

  it("shows a saved entry's standing now: under review, then retired, never its old words as current", () => {
    approve(1);
    pinTool(db, riley, { kind: "myth", id: demo(1).id, on: true }, now);
    pauseTile(db, jordan, demo(1).id, true, "Checking the limit", now);
    expect(favouritesList(db, riley, {}, now).items[0]).toMatchObject({ state: "changed", note: expect.stringMatching(/Under review/) });
    expect(homePins(db, riley, now).pinned[0].state).toBe("review_due");
    retireTile(db, jordan, demo(1).id, "Superseded", now);
    expect(favouritesList(db, riley, {}, now).items[0]).toMatchObject({ state: "unavailable", href: "/resources/myths" });
    // A retired entry's pin can still come off.
    expect(pinTool(db, riley, { kind: "myth", id: demo(1).id, on: false }, now)).toMatchObject({ pinned: false, saved: true });
  });

  it("flags an entry as inaccurate or out of date, a draft included, into the library's queue", () => {
    expect(() => flagMyth(db, riley, { kind: "outdated", tileId: demo(15).id, version: 1, note: "" }, now)).toThrow(/Say a little/);
    flagMyth(db, jordan, { kind: "outdated", tileId: demo(15).id, version: 1, note: "Check the 1 October date." }, now);
    expect(openMythFlags(db, jordan)[0]).toMatchObject({ tileId: demo(15).id, version: 1, note: "Check the 1 October date." });
    expect(library(db, jordan, now).tiles.find((t) => t.id === demo(15).id)?.openFlags).toBe(1);
  });
});

describe("tiles stored before these fields", () => {
  it("still parse, with the new fields empty, and keep their topic", () => {
    const old = { ...structuredClone(SEED_TILES[0].data) } as Record<string, unknown>;
    for (const k of ["myth", "reality", "searchPhrases", "lastReviewed", "contentOwner", "demo"]) delete old[k];
    const c = cleanTile(JSON.parse(JSON.stringify(old)));
    expect(c).toMatchObject({ myth: "", reality: "", searchPhrases: [], lastReviewed: "", contentOwner: "", demo: false, category: "budget" });
    expect(c.anchors.every((a) => a.unverified === false)).toBe(true);
    expect(CATEGORIES[c.category]).toBe("Funding and budgets");
    expect(c.quote).toBe(SEED_TILES[0].data.quote);
    // Stored as JSON without the fields, read back through the library.
    db.prepare(
      "INSERT INTO myth_tiles (id, version, status, paused, data, created_by, created_at, updated_at) VALUES ('old-one', 1, 'draft', 0, ?, 'x', ?, ?)",
    ).run(JSON.stringify({ quote: "An old question", category: "care-plan", checks: ["One"] }), now.toISOString(), now.toISOString());
    const t = library(db, jordan, now).tiles.find((x) => x.id === "old-one")!;
    expect(t).toMatchObject({ status: "draft", latest: { data: { quote: "An old question", category: "care-plan", myth: "", demo: false } } });
    expect(matchTiles([t.latest], "old question", "", "")).toHaveLength(1);
  });
});
