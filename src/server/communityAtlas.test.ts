import { beforeEach, describe, expect, it } from "vitest";
import { openDb, type Db } from "./db";
import { userById, type User } from "./auth";
import { atlasMembers, leaveAtlas, myAtlas, saveMyAtlas } from "./communityAtlas";

/* Real members on the Community Atlas: only by choice, only a listed town and topics, and leaving deletes it. */

let db: Db;
let jordan: User, sam: User;
const now = new Date("2026-11-23T02:00:00Z");

beforeEach(() => {
  db = openDb(":memory:");
  jordan = userById(db, "jordan")!;
  sam = userById(db, "sam")!;
});

describe("joining the Atlas", () => {
  it("is off until someone chooses it", () => {
    expect(myAtlas(db, sam)).toBeNull();
    expect(atlasMembers(db, jordan)).toEqual([]);
  });

  it("shows only what they chose, to anyone signed in", () => {
    saveMyAtlas(db, sam, { town: "toowoomba", topics: ["Hospital discharge", "Growing a business"], canHelp: ["Hospital discharge"] }, now);
    const [m] = atlasMembers(db, jordan);
    expect(m).toMatchObject({
      id: "sam",
      town: "toowoomba",
      topics: ["Hospital discharge", "Growing a business"],
      canHelp: ["Hospital discharge"],
      org: null,
      you: false,
    });
    expect(JSON.stringify(m)).not.toMatch(/@/); // no email
    expect(atlasMembers(db, sam)[0].you).toBe(true);
    saveMyAtlas(db, sam, { town: "toowoomba", topics: ["Hospital discharge"], showOrg: true }, now);
    expect(atlasMembers(db, jordan)[0].org).toBeTruthy();
  });

  it("accepts only a listed town and up to three listed topics, and helping stays within them", () => {
    expect(() => saveMyAtlas(db, sam, { town: "12 Smith St", topics: ["Hospital discharge"] }, now)).toThrow(/town/);
    expect(() => saveMyAtlas(db, sam, { town: "perth", topics: [] }, now)).toThrow(/at least one/);
    expect(() =>
      saveMyAtlas(db, sam, { town: "perth", topics: ["Hospital discharge", "Self-management", "Rural and remote", "Social connection"] }, now),
    ).toThrow(/up to 3/);
    expect(() => saveMyAtlas(db, sam, { town: "perth", topics: ["Knitting"] }, now)).toThrow(/from the list/);
    const out = saveMyAtlas(db, sam, { town: "perth", topics: ["Self-management"], canHelp: ["Self-management", "Rural and remote"] }, now);
    expect(out.canHelp).toEqual(["Self-management"]);
  });

  it("deletes their town and topics when they leave, and the audit never records where", () => {
    saveMyAtlas(db, sam, { town: "hobart", topics: ["Social connection"] }, now);
    expect(leaveAtlas(db, sam, now)).toEqual({ left: true });
    expect(myAtlas(db, sam)).toBeNull();
    expect(db.prepare("SELECT COUNT(*) AS n FROM atlas_members").get()).toMatchObject({ n: 0 });
    const events = db.prepare("SELECT event, previous, next FROM audit WHERE event LIKE 'atlas.%' ORDER BY id").all() as { event: string }[];
    expect(events.map((e) => e.event)).toEqual(["atlas.join", "atlas.leave"]);
    expect(JSON.stringify(events)).not.toMatch(/hobart/i);
  });
});
