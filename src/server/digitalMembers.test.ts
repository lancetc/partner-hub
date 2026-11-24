import { beforeEach, describe, expect, it } from "vitest";
import { openDb, type Db } from "./db";
import { userById, type User } from "./auth";
import { createGuide, publishGuide } from "./magazine";
import { ensureCharacters, saveCharacter } from "./characters";
import { digitalMember, digitalMembers } from "./digitalMembers";
import { DIGITAL_GROUPS, DIGITAL_MEMBERS } from "@/content/digitalMembers";
import { SEED_CHARACTERS } from "@/content/characters";
import { XRAY_CASES } from "@/content/xrayCases";

/* Digital Members: every introduction is a library character, hidden characters aren't shown, and "where you'll meet them" lists only courses the reader can open. */

let db: Db;
let jordan: User, sam: User;
const now = new Date("2026-11-20T00:00:00Z");
const SIGNED = { owner: "Owner", finance: "Finance", operations: "Care Operations", quality: "Quality", approvedOn: "2026-11-20" };
const SOURCE = { title: "Service list", version: "September 2026", reviewedOn: "2026-11-20" };
const doc = (name: string) => ({
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
      sections: [
        {
          id: "s1",
          title: "Section",
          blocks: [{ id: "b1", type: "xray", ...XRAY_CASES[0].data, participant: { name, about: "Lives at home." }, approval: SIGNED, source: SOURCE }],
        },
      ],
    },
  ],
});

beforeEach(() => {
  delete process.env.OPENAI_API_KEY;
  db = openDb(":memory:");
  jordan = userById(db, "jordan")!;
  sam = userById(db, "sam")!;
  ensureCharacters(db, now);
});

describe("the introductions", () => {
  it("are each written once, in a known group, with a hello, a tagline and something to learn", () => {
    const ids = DIGITAL_MEMBERS.map((m) => m.id);
    expect(new Set(ids).size).toBe(ids.length);
    const groups = new Set<string>(DIGITAL_GROUPS.map((g) => g.id));
    for (const m of DIGITAL_MEMBERS) {
      expect(groups.has(m.group), m.id).toBe(true);
      expect(m.hello.length, m.id).toBeGreaterThan(10);
      expect(m.approach.length, `${m.id}'s approach`).toBeGreaterThan(10);
      expect(m.tagline.length, m.id).toBeGreaterThan(10);
      expect(m.about.length, m.id).toBeGreaterThan(60);
      expect(m.themes.length, m.id).toBeGreaterThan(0);
      for (const k of m.knows) expect(ids, `${m.id} knows ${k.id}`).toContain(k.id);
    }
  });

  it("introduce people the starter library already has", () => {
    const seeded = new Set(SEED_CHARACTERS.map((c) => c.id));
    const shown = digitalMembers(db, sam, now).members.map((m) => m.id);
    // Characters added by publishing or by authors aren't in a fresh database, so only the starter ones are checked here.
    for (const m of DIGITAL_MEMBERS.filter((x) => seeded.has(x.id))) expect(shown).toContain(m.id);
  });
});

describe("what a reader sees", () => {
  it("leaves out a hidden character, on the list and on their page", () => {
    const first = DIGITAL_MEMBERS.find((m) => SEED_CHARACTERS.some((c) => c.id === m.id))!;
    saveCharacter(db, jordan, { id: first.id, hidden: true }, now);
    expect(digitalMembers(db, sam, now).members.map((m) => m.id)).not.toContain(first.id);
    expect(digitalMember(db, sam, first.id, now)).toBeNull();
  });

  it("has no page for someone without an introduction", () => {
    expect(digitalMember(db, sam, "nobody-here", now)).toBeNull();
  });

  it("lists a published course that names them, and not a draft", () => {
    const m = DIGITAL_MEMBERS.find((x) => x.id === "mrs-patel");
    if (!m) return;
    const draft = createGuide(db, jordan, { title: "Draft with Mrs Patel", completion: "confirm", doc: doc("Mrs Patel") as never }, now);
    const live = createGuide(db, jordan, { title: "Live with Mrs Patel", completion: "confirm", doc: doc("Mrs Patel") as never }, now);
    publishGuide(db, jordan, live.id, "", now);
    const page = digitalMember(db, sam, "mrs-patel", now)!;
    expect(page.meet.map((c) => c.title)).toContain("Live with Mrs Patel");
    expect(page.meet.map((c) => c.title)).not.toContain(draft.title);
    expect(digitalMembers(db, sam, now).members.find((x) => x.id === "mrs-patel")!.courses).toBe(1);
  });
});
