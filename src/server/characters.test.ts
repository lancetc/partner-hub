import { beforeEach, describe, expect, it } from "vitest";
import { openDb, type Db } from "./db";
import { userById, type User } from "./auth";
import { createGuide, publishGuide } from "./magazine";
import { charactersInBlock, findCharacter, lookFromName, normaliseName, portraitPrompt } from "@/lib/characters";
import { SEED_CHARACTERS } from "@/content/characters";
import { XRAY_CASES } from "@/content/xrayCases";
import { characterLibrary, charactersAfterPublish, ensureCharacters, missingPortraits, portraitRoster, saveCharacter } from "./characters";

/* The character photo library: portraits are found by exact name, a new name on publish joins the roster, and readers get only names and pictures. */

let db: Db;
let jordan: User, sam: User;
const now = new Date("2026-11-20T00:00:00Z");
const SIGNED = { owner: "Owner", finance: "Finance", operations: "Care Operations", quality: "Quality", approvedOn: "2026-11-20" };
const SOURCE = { title: "Service list", version: "September 2026", reviewedOn: "2026-11-20" };
const xray = (name: string) => ({ ...XRAY_CASES[0].data, participant: { name, about: "Lives at home." }, approval: SIGNED, source: SOURCE });
const doc = (blocks: Record<string, unknown>[]) => ({
  schema: 2,
  pages: [
    {
      id: "p1",
      title: "Page",
      purpose: "",
      template: "blank",
      kind: "content",
      required: true,
      allActivities: false,
      sections: [{ id: "s1", title: "Section", blocks: blocks.map((b, i) => ({ id: `b${i}`, ...b })) }],
    },
  ],
});

beforeEach(() => {
  // Never call OpenAI from a test.
  delete process.env.OPENAI_API_KEY;
  db = openDb(":memory:");
  jordan = userById(db, "jordan")!;
  sam = userById(db, "sam")!;
  ensureCharacters(db, now);
});

describe("finding a portrait by name", () => {
  const roster = [
    { names: ["Mr Nguyen"], portrait: "/a.webp", alt: "" },
    { names: ["Margaret Alder", "Mrs Alder"], portrait: "/b.webp", alt: "" },
  ];
  it("matches the name or another way it's written, ignoring case, spacing and a possessive", () => {
    expect(findCharacter(roster, "mr  nguyen")?.portrait).toBe("/a.webp");
    expect(findCharacter(roster, "Mrs Alder’s")?.portrait).toBe("/b.webp");
    expect(findCharacter(roster, "Margaret Alder")?.portrait).toBe("/b.webp");
  });
  it("never confuses Mrs Nguyen with Mr Nguyen, or a first name with a full one", () => {
    expect(findCharacter(roster, "Mrs Nguyen")).toBeUndefined();
    expect(findCharacter(roster, "Margaret")).toBeUndefined();
    expect(normaliseName("Mr. Tan")).toBe("mr tan");
  });
});

describe("the people a scenario names", () => {
  it("reads participants, families, callers and clients, and skips generic labels", () => {
    expect(
      charactersInBlock({ type: "reset", person: { name: "Arthur", about: "x" }, family: { name: "Chloe", relation: "daughter" } }).map((p) => p.name),
    ).toEqual(["Arthur", "Chloe"]);
    expect(charactersInBlock({ type: "signal", client: "Helen Park" })[0]).toMatchObject({ name: "Helen Park", role: "participant" });
    expect(
      charactersInBlock({
        type: "journey",
        personas: {
          person: { name: "Arthur" },
          family: { name: "Chloe" },
          coordinator: { name: "Trilogy Care Coordinator" },
          provider: { name: "Independent provider" },
        },
      }).map((p) => p.name),
    ).toEqual(["Arthur", "Chloe"]);
    expect(charactersInBlock({ type: "mission", participant: { name: "Mrs Lin", age: 83, about: "Lives alone." } })[0].age).toBe(83);
    expect(charactersInBlock({ type: "text", body: "Mrs Lin" })).toEqual([]);
  });
  it("describes a new person from their title, age and role, for the prompt", () => {
    expect(lookFromName("Mrs Quill", 81, "Lives alone.", "participant")).toBe("81-year-old woman. Lives alone.");
    expect(lookFromName("Sam", null, "", "family")).toBe("middle-aged person, a family member");
    expect(portraitPrompt({ look: "older man", role: "participant" })).toMatch(/fictional person.*older man.*Australian home background.*No text/);
  });
  it("sets a portrait where the look says, out in the real world", () => {
    const p = portraitPrompt({
      look: "Care coordinator in her forties, pink striped shirt. Background: a leafy street with a Queenslander.",
      role: "coordinator",
    });
    expect(p).toMatch(/pink striped shirt\. Natural/);
    expect(p).toMatch(/softly blurred background of a leafy street with a Queenslander, Australia/);
    expect(p).not.toMatch(/home background|Background:/);
  });
});

describe("the roster", () => {
  it("starts with the recurring scenario characters, none with a portrait yet", () => {
    const lib = characterLibrary(db, jordan);
    expect(lib.characters).toHaveLength(SEED_CHARACTERS.length);
    expect(lib.characters.every((c) => c.status === "none" && !c.portrait && c.origin === "seed")).toBe(true);
    expect(missingPortraits(db)).toContain("mrs-patel");
    expect(missingPortraits(db)).toHaveLength(SEED_CHARACTERS.length);
  });
  it("gives readers only characters with a portrait, never hidden ones, and only names and pictures", () => {
    saveCharacter(db, jordan, { id: "mrs-patel", portrait: "/api/uploads/abc-123.webp" }, now);
    saveCharacter(db, jordan, { id: "mr-brennan", portrait: "/api/uploads/def-456.webp", hidden: true }, now);
    const r = portraitRoster(db).characters;
    expect(r.find((c) => c.names.includes("Mrs Patel"))).toEqual({
      names: ["Mrs Patel"],
      portrait: "/api/uploads/abc-123.webp",
      alt: "Portrait of Mrs Patel, a fictional character",
    });
    expect(r.some((c) => c.names.includes("Mr Brennan"))).toBe(false);
    expect(r.some((c) => c.names.includes("Mrs Wong"))).toBe(false);
  });
  it("keeps every name pointing at one character, and portraits to the image library", () => {
    expect(() => saveCharacter(db, jordan, { name: "mrs patel" }, now)).toThrow(/already uses that name/);
    expect(() => saveCharacter(db, jordan, { id: "tom-reyes", aliases: ["Mrs Park"] }, now)).toThrow(/Helen Park/);
    expect(() => saveCharacter(db, jordan, { id: "mrs-patel", portrait: "https://example.com/x.png" }, now)).toThrow(/image library/);
    const added = saveCharacter(db, jordan, { name: "Mr Quill", aliases: ["Bert Quill"], role: "participant", look: "older man" }, now);
    expect(added).toMatchObject({ id: "mr-quill", aliases: ["Bert Quill"], origin: "author", status: "none" });
  });
  it("is for authors", () => {
    expect(() => characterLibrary(db, sam)).toThrow();
    expect(() => saveCharacter(db, sam, { name: "Someone" }, now)).toThrow();
  });
});

describe("publishing", () => {
  it("adds anyone a course's scenarios name who isn't in the roster, and lists who needs a portrait", () => {
    const g = createGuide(db, jordan, { title: "Characters", completion: "confirm", doc: doc([{ type: "xray", ...xray("Mrs Quill") }]) as never }, now);
    publishGuide(db, jordan, g.id, "", now);
    const quill = characterLibrary(db, jordan).characters.find((c) => c.name === "Mrs Quill")!;
    expect(quill).toMatchObject({ origin: "publish", role: "participant", status: "none", look: "older woman. Lives at home." });
    expect(quill.usedIn.map((u) => u.id)).toEqual([g.id]);
  });
  it("never adds a known character twice, and never stops a publish", () => {
    const before = characterLibrary(db, jordan).characters.length;
    expect(charactersAfterPublish(db, jordan, doc([{ type: "xray", ...xray("Mrs Patel") }]) as never, now)).toEqual(["mrs-patel"]);
    expect(characterLibrary(db, jordan).characters).toHaveLength(before);
    expect(charactersAfterPublish(db, jordan, { broken: true } as never, now)).toEqual([]);
  });
});

describe("a new character's look", () => {
  it("takes a man or a woman from a title or from the words about them, never from a first name", () => {
    expect(lookFromName("Bill", null, "He offers you $50 and asks to be Facebook friends.", "participant")).toBe(
      "older man. He offers you $50 and asks to be Facebook friends.",
    );
    expect(lookFromName("Joan", null, "Her eyesight is poor, so she asks you to help.", "participant")).toMatch(/^older woman\./);
    expect(lookFromName("Alan", null, "", "participant")).toBe("older person");
  });
});
