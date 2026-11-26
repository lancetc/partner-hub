import { describe, expect, it } from "vitest";
import fs from "node:fs";
import path from "node:path";
import { BLOCK_LABELS, SIMULATION_BLOCKS, type BlockType } from "./magazine";
import {
  AI_CONFIGURABLE_BLOCKS,
  AI_MODES,
  BLOCK_META,
  CATALOGUE,
  EXCLUDED,
  RETIRED_FROM_PALETTE,
  STANDALONE_ACTIVITIES,
  TOPIC_CARD_META,
  magazineAiMode,
  magazineCandidates,
  resolveActivity,
  validateCatalogue,
  type CatalogueEntry,
} from "./activityCatalogue";
import { AI_SHAPES, pageIssues } from "@/server/magazineDraft";
import { DEFAULT_SHOWCASE, parserKnows } from "@/server/activityCatalogue";

/*
  The Activity Catalogue's gate (docs/activity-catalogue-audit.md). It fails when an activity exists without an entry,
  an entry has no explicit AI decision, ids or aliases clash, a renderer, schema or route doesn't exist, the AI is offered
  a block it has no valid shape for (or a shape for a block the catalogue hasn't cleared), or the homepage would link to
  something that can't be featured. Run with the rest: npx vitest run.
*/

const src = (p: string) => path.join(process.cwd(), "src", p);
const read = (p: string) => fs.readFileSync(src(p), "utf8");
const BLOCK_TYPES = Object.keys(BLOCK_LABELS) as BlockType[];

describe("one entry for every activity", () => {
  it("has exactly one catalogue entry for every Magazine block type, with its id the saved block type", () => {
    const blocks = CATALOGUE.filter((e) => e.builder === "magazine").map((e) => e.id);
    expect([...blocks].sort()).toEqual([...BLOCK_TYPES].sort());
    expect(Object.keys(BLOCK_META).sort()).toEqual([...BLOCK_TYPES].sort());
  });

  it("has an entry for every Topic card type", () => {
    const cards = CATALOGUE.filter((e) => e.builder === "topic").map((e) => e.id.replace("topic.", ""));
    expect(cards.sort()).toEqual(Object.keys(TOPIC_CARD_META).sort());
  });

  it("passes its own rules: an explicit AI decision with a reason, unique ids and aliases, honest surfaces", () => {
    expect(Object.fromEntries(validateCatalogue())).toEqual({});
    const ids = [...CATALOGUE.map((e) => e.id), ...EXCLUDED.map((e) => e.id)];
    expect(new Set(ids).size).toBe(ids.length);
    for (const e of CATALOGUE) {
      expect(Object.keys(AI_MODES), e.id).toContain(e.ai.mode);
      expect(e.ai.reason.length, `${e.id} needs a reason for its AI decision`).toBeGreaterThan(20);
    }
  });

  it("fails a new registration that has no explicit AI decision, a duplicate id, or claims an AI config path it hasn't got", () => {
    const base = STANDALONE_ACTIVITIES[0];
    const undecided: CatalogueEntry = { ...base, id: "tool.new", aliases: [], ai: { mode: "unavailable", reason: "", constraints: [] } };
    expect(
      validateCatalogue([...CATALOGUE, undecided])
        .get("tool.new")
        ?.join(" "),
    ).toMatch(/No explicit reason/);
    const clash: CatalogueEntry = { ...base, aliases: [] };
    expect(
      validateCatalogue([...CATALOGUE, clash])
        .get(base.id)
        ?.join(" "),
    ).toMatch(/Duplicate id|also/);
    const pretend: CatalogueEntry = {
      ...base,
      id: "tool.pretend",
      aliases: [],
      ai: { mode: "configurable", reason: "The AI writes it, it says.", constraints: [] },
    };
    expect(
      validateCatalogue([...CATALOGUE, pretend])
        .get("tool.pretend")
        ?.join(" "),
    ).toMatch(/no builder can place it/);
    const leak: CatalogueEntry = { ...CATALOGUE[0], id: "zz-gated", aliases: [], gate: "planner" };
    expect(
      validateCatalogue([...CATALOGUE, leak])
        .get("zz-gated")
        ?.join(" "),
    ).toMatch(/can't carry its own gate/);
  });

  it("finds one canonical entry by any old or design name, so aliases never make duplicate cards", () => {
    expect(resolveActivity("Tough Family Call")?.id).toBe("phonecall");
    expect(resolveActivity("72-Hour Discharge Pivot")?.id).toBe("discharge");
    expect(resolveActivity("Contractor Vetting Card")?.id).toBe("auditor");
    expect(resolveActivity("Next 10 Clients")?.id).toBe("intake");
    expect(resolveActivity("Missed Service Cost")?.id).toBe("reliability");
    expect(resolveActivity("SIRS Red-Flag")?.id).toBe("tool.incident-first-steps");
    expect(resolveActivity("discharge")?.id).toBe("discharge");
  });
});

describe("what the catalogue points at exists", () => {
  it("has a renderer and a schema file for every entry, and a route for every standalone one", () => {
    for (const e of CATALOGUE) {
      expect(fs.existsSync(src(e.renderer)), `${e.id}: src/${e.renderer}`).toBe(true);
      if (e.schema) expect(fs.existsSync(src(e.schema)), `${e.id}: src/${e.schema}`).toBe(true);
      if (e.route) expect(fs.existsSync(src(`app${e.route}/page.tsx`)), `${e.id}: app${e.route}/page.tsx`).toBe(true);
      if (e.admin) expect(fs.existsSync(src(`app${e.admin.split("#")[0]}/page.tsx`)), `${e.id}: app${e.admin}/page.tsx`).toBe(true);
    }
  });

  it("draws every Magazine block in the reader, and the parser accepts every one (no unknown renderer type)", () => {
    const readers = fs
      .readdirSync(src("components/magazine"))
      .filter((f) => f.endsWith(".tsx"))
      .map((f) => read(`components/magazine/${f}`))
      .join("\n");
    for (const t of BLOCK_TYPES) {
      expect(readers.includes(`case "${t}":`), `no reader case for ${t}`).toBe(true);
      expect(parserKnows(t), `the parser refuses ${t}`).toBe(true);
    }
    expect(parserKnows("made-up-block")).toBe(false);
  });

  it("draws every Topic card in the player (an image card is the player's default)", () => {
    const player = read("components/player/LessonPlayer.tsx");
    for (const t of Object.keys(TOPIC_CARD_META))
      if (t !== "image") expect(player.includes(`case "${t}":`) || player.includes(`type === "${t}"`), `no player case for ${t}`).toBe(true);
  });

  it("can author every Magazine block from the editor's palette", () => {
    const editor = read("components/admin/MagazineEditor.tsx");
    const palette = editor.slice(editor.indexOf("const BLOCK_CATEGORIES"), editor.indexOf("];", editor.indexOf("const BLOCK_CATEGORIES")));
    for (const t of BLOCK_TYPES)
      expect(
        palette.includes(`"${t}"`) || (SIMULATION_BLOCKS as readonly string[]).includes(t) || Boolean(RETIRED_FROM_PALETTE[t]),
        `${t} isn't in the palette`,
      ).toBe(true);
    // A retired block really is gone from the palette, and says why.
    for (const [t, why] of Object.entries(RETIRED_FROM_PALETTE)) {
      expect(palette.includes(`"${t}"`), `${t} is retired but still in the palette`).toBe(false);
      expect(why).toBeTruthy();
    }
  });
});

describe("the AI builder's path", () => {
  it("offers a JSON shape for exactly the blocks the catalogue marks AI configurable", () => {
    expect(Object.keys(AI_SHAPES).sort()).toEqual([...AI_CONFIGURABLE_BLOCKS].sort());
  });

  it("lets a configurable block through the page check and turns every other one back", () => {
    for (const t of BLOCK_TYPES) {
      const issues = pageIssues({ sections: [{ title: "A", blocks: [{ type: t }] }] }).join(" ");
      if (magazineAiMode(t) === "configurable") expect(issues, t).not.toMatch(/don’t use/);
      else expect(issues, t).toMatch(new RegExp(`don’t use ${t} blocks`));
    }
  });

  it("never offers a human-only or unavailable activity, and offers owner-only labs only to a course partners can read", () => {
    const all = magazineCandidates({ text: "hospital discharge handover and cash flow before payroll", audience: [] }).map((e) => e.id);
    expect(all).toContain("discharge");
    expect(all).toContain("cashbridge");
    for (const id of all) expect(["configurable", "recommend"]).toContain(magazineAiMode(id));
    for (const banned of ["video", "ava", "guide", "carousel", "hotspots", "spot"]) expect(all).not.toContain(banned);
    const coordinators = magazineCandidates({ text: "cash flow before payroll, when partner fees are paid", audience: ["coordinator"] }).map((e) => e.id);
    expect(coordinators).not.toContain("cashbridge");
    expect(magazineCandidates({ text: "cash flow before payroll, when partner fees are paid", audience: ["partner"] }).map((e) => e.id)).toContain(
      "cashbridge",
    );
  });
});

describe("the homepage", () => {
  it("starts with picks that are all activities that may be featured", () => {
    for (const p of DEFAULT_SHOWCASE) {
      const e = CATALOGUE.find((x) => x.id === p.activity);
      expect(e?.homepage, p.id).toBe(true);
      expect(p.question.length).toBeGreaterThan(10);
    }
  });
});
