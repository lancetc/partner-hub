import { beforeEach, describe, expect, it } from "vitest";
import { openDb, type Db } from "./db";
import { userById, type User } from "./auth";
import { createGuide, publishGuide } from "./magazine";
import { publishChecks } from "@/lib/magazine";
import { canCopy, cleanTile, matchTiles, placeholdersIn, secondsToSay, tileProblems, tileState, type MythTileData } from "@/lib/myths";
import { SEED_TILES } from "@/content/mythTiles";
import { approveTile, flagMyth, library, logMyth, mythStats, openMythFlags, pauseTile, resolveMythFlag, saveTile, tilesFor } from "./myths";

/* Myth vs Reality: one canonical library, versions never rewritten, exact sources, copy (never send), and no copying under review. */

let db: Db;
let jordan: User, riley: User;
const now = new Date("2026-11-20T00:00:00Z");
const SIGNED = {
  owner: "Budget policy",
  quality: "Quality",
  operations: "Care Operations",
  finance: "Finance",
  clinical: "",
  communications: "Communications",
  approvedOn: "2026-11-20",
};
const seed = (id: string) => structuredClone(SEED_TILES.find((t) => t.id === id)!.data);
const ready = (id: string): MythTileData => {
  const d = seed(id);
  d.anchors = d.anchors.map((a) => ({ ...a, verifiedOn: "2026-11-19" }));
  d.reviewDue = "2027-02-19";
  d.approval = SIGNED;
  return d;
};
const approve = (id: string) => {
  saveTile(db, jordan, { id, data: ready(id) }, now);
  return approveTile(db, jordan, id, now);
};
const pages = (tileIds: string[]) => [
  {
    id: "p1",
    title: "Myths",
    purpose: "",
    template: "blank",
    kind: "content",
    required: true,
    allActivities: false,
    sections: [{ id: "s1", title: "Questions", blocks: [{ id: "mt", type: "myths", title: "Myth vs Reality", tileIds, mode: "learning" }] }],
  },
];

beforeEach(() => {
  db = openDb(":memory:");
  [jordan, riley] = ["jordan", "riley"].map((id) => userById(db, id)!);
});

describe("the seed tiles", () => {
  it("are 30-second answers that keep the carryover exception and never state a balance", () => {
    for (const t of SEED_TILES) {
      expect(secondsToSay(t.data.answer)).toBeGreaterThanOrEqual(24);
      expect(secondsToSay(t.data.answer)).toBeLessThanOrEqual(34);
    }
    const c = seed("sah-quarterly-carryover");
    expect(c.answer).toMatch(/higher of \$1,000 or 10%/);
    expect(c.answer).toMatch(/Home Care Package are a separate category/);
    expect(c.exception).toMatch(/Don’t combine/);
    expect(c.message.body).not.toMatch(/your balance is|you have \$/i);
    expect(placeholdersIn(c.message.body)).toEqual(["[Name]", "[Your name]"]);
  });

  it("keep care management with the provider when someone self-manages", () => {
    const s = seed("sah-self-management-care-partner");
    expect(s.answer).toMatch(/registered provider still provides care management/);
    expect(s.answer).toMatch(/agree which tasks/);
    expect(s.anchors[0].section).toMatch(/Mandatory care management/);
  });

  it("start as drafts that can't be approved without exact sources, a review date and sign-off", () => {
    const problems = tileProblems(seed("sah-quarterly-carryover")).join(" ");
    expect(problems).toMatch(/exact source/);
    expect(problems).toMatch(/review date/);
    expect(problems).toMatch(/Finance/);
    expect(tileProblems(ready("sah-quarterly-carryover"))).toEqual([]);
    const ai = { ...ready("sah-care-plan-changes"), aiDraft: true };
    expect(tileProblems(ai).join(" ")).toMatch(/AI draft/);
    const ph = ready("sah-care-plan-changes");
    ph.message.body += " [Balance]";
    expect(tileProblems(ph).join(" ")).toMatch(/\[Balance\]/);
    const noSection = ready("sah-care-plan-changes");
    noSection.anchors[0].section = "";
    expect(tileProblems(noSection).join(" ")).toMatch(/exact source/);
  });
});

describe("the library", () => {
  it("shows learners only approved tiles, and authors drafts in preview", () => {
    expect(tilesFor(db, riley, ["sah-quarterly-carryover"], now)).toMatchObject({ tiles: [], missing: ["sah-quarterly-carryover"] });
    expect(tilesFor(db, riley, ["sah-quarterly-carryover"], now, { preview: true }).tiles).toEqual([]);
    expect(tilesFor(db, jordan, ["sah-quarterly-carryover"], now, { preview: true }).tiles[0]).toMatchObject({
      status: "draft",
      preview: true,
      copyable: false,
    });
    approve("sah-quarterly-carryover");
    expect(tilesFor(db, riley, ["sah-quarterly-carryover"], now).tiles[0]).toMatchObject({ version: 1, state: "approved", copyable: true });
  });

  it("refuses approval with what's missing, and an unsigned draft can't be shown", () => {
    expect(() => approveTile(db, jordan, "sah-care-plan-changes", now)).toThrow(/Not yet\. .*exact source/);
    expect(() => approveTile(db, riley, "sah-care-plan-changes", now)).toThrow();
  });

  it("never rewrites an approved version: a change is a new draft, and the old one is retired on approval", () => {
    approve("sah-quarterly-carryover");
    const changed = ready("sah-quarterly-carryover");
    changed.answer = `${changed.answer} Updated.`;
    const draft = saveTile(db, jordan, { id: "sah-quarterly-carryover", data: changed }, now);
    expect(draft).toMatchObject({ version: 2, status: "draft" });
    expect(tilesFor(db, riley, ["sah-quarterly-carryover"], now).tiles[0]).toMatchObject({ version: 1 });
    approveTile(db, jordan, "sah-quarterly-carryover", now);
    const lib = library(db, jordan, now).tiles.find((t) => t.id === "sah-quarterly-carryover")!;
    expect(lib.history.map((h) => [h.version, h.status])).toEqual([
      [2, "approved"],
      [1, "retired"],
    ]);
    expect(tilesFor(db, riley, ["sah-quarterly-carryover"], now).tiles[0].data.answer).toMatch(/Updated\.$/);
  });

  it("stops copying when a tile is paused or past its review date", () => {
    approve("sah-care-plan-changes");
    expect(() => pauseTile(db, jordan, "sah-care-plan-changes", true, "", now)).toThrow(/why/);
    pauseTile(db, jordan, "sah-care-plan-changes", true, "Policy changed", now);
    const paused = tilesFor(db, riley, ["sah-care-plan-changes"], now).tiles[0];
    expect(paused).toMatchObject({ state: "under-review", copyable: false });
    expect(() => logMyth(db, riley, { event: "copied", tileId: "sah-care-plan-changes", version: 1 }, now)).toThrow(/under review/);
    pauseTile(db, jordan, "sah-care-plan-changes", false, "", now);
    const later = new Date("2027-03-01T00:00:00Z");
    expect(tilesFor(db, riley, ["sah-care-plan-changes"], later).tiles[0]).toMatchObject({ state: "under-review", copyable: false });
    expect(() => pauseTile(db, jordan, "sah-care-plan-changes", false, "", later)).toThrow(/approve a new version/);
  });

  it("searches by the phrase someone used, and filters by topic and audience", () => {
    const tiles = SEED_TILES.map((t) => ({ data: t.data }));
    expect(matchTiles(tiles, "roll over", "", "")).toHaveLength(1);
    expect(matchTiles(tiles, "", "self-management", "")).toHaveLength(1);
    expect(matchTiles(tiles, "care plan", "", "partner").length).toBeGreaterThan(0);
  });

  it("cleans stored data, dropping links that aren't https", () => {
    const c = cleanTile({ anchors: [{ document: "x", url: "javascript:alert(1)" }], category: "nope" });
    expect(c.anchors[0].url).toBe("");
    expect(c.category).toBe("other");
    expect(tileState({ status: "draft", paused: false, data: c }, "2026-11-20")).toBe("draft");
    expect(canCopy({ status: "draft", paused: false, data: c }, "2026-11-20")).toBe(false);
  });
});

describe("a course block", () => {
  it("can't be published until every tile has an approved version, not under review", () => {
    expect(publishChecks({ schema: 2, pages: pages([]) } as never, "confirm").blocking.join(" ")).toMatch(/at least one tile/);
    const c = createGuide(
      db,
      jordan,
      { title: "Myths", completion: "confirm", doc: { schema: 2, pages: pages(["sah-quarterly-carryover", "sah-care-plan-changes"]) } },
      now,
    );
    expect(() => publishGuide(db, jordan, c.id, "", now, { allowUnverified: true })).toThrow(/Myth vs Reality tiles need an approved version/);
    approve("sah-quarterly-carryover");
    approve("sah-care-plan-changes");
    pauseTile(db, jordan, "sah-care-plan-changes", true, "Policy changed", now);
    expect(() => publishGuide(db, jordan, c.id, "", now, { allowUnverified: true })).toThrow(/Myth vs Reality/);
    pauseTile(db, jordan, "sah-care-plan-changes", false, "", now);
    expect(() => publishGuide(db, jordan, c.id, "", now)).not.toThrow();
  });
});

describe("what learners do", () => {
  it("records copies as copies, with the version, and no message text", () => {
    approve("sah-quarterly-carryover");
    logMyth(db, riley, { event: "opened", tileId: "sah-quarterly-carryover", version: 1, guideId: "g1" }, now);
    logMyth(db, riley, { event: "copied", tileId: "sah-quarterly-carryover", version: 1, body: "Hi Mrs Smith" }, now);
    expect(() => logMyth(db, riley, { event: "sent", tileId: "sah-quarterly-carryover", version: 1 }, now)).toThrow(/Unknown event/);
    const rows = db.prepare("SELECT * FROM myth_events").all();
    expect(JSON.stringify(rows)).not.toMatch(/Smith/);
    expect(mythStats(db, jordan)["sah-quarterly-carryover"]).toMatchObject({ opened: 1, copied: 1 });
    expect(() => mythStats(db, riley)).toThrow();
  });

  it("sends outdated flags to the library's queue, and counts useful once", () => {
    approve("sah-quarterly-carryover");
    expect(() => flagMyth(db, riley, { kind: "outdated", tileId: "sah-quarterly-carryover", version: 1, note: "" }, now)).toThrow(/Say a little/);
    flagMyth(db, riley, { kind: "outdated", tileId: "sah-quarterly-carryover", version: 1, note: "The limit changed?" }, now);
    flagMyth(db, riley, { kind: "useful", tileId: "sah-quarterly-carryover", version: 1 }, now);
    flagMyth(db, riley, { kind: "useful", tileId: "sah-quarterly-carryover", version: 1 }, now);
    const [f] = openMythFlags(db, jordan);
    expect(f).toMatchObject({ tileId: "sah-quarterly-carryover", version: 1, note: "The limit changed?" });
    expect(mythStats(db, jordan)["sah-quarterly-carryover"].useful).toBe(1);
    expect(library(db, jordan, now).tiles.find((t) => t.id === "sah-quarterly-carryover")?.openFlags).toBe(1);
    resolveMythFlag(db, jordan, f.id, "Checked: still right.", now);
    expect(openMythFlags(db, jordan)).toEqual([]);
  });
});
