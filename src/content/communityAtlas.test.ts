import { describe, expect, it } from "vitest";
import { ATLAS_PLACES, ATLAS_TOPICS, commonGround, kmBetween, TOWNS } from "./communityAtlas";
import { DIGITAL_MEMBERS } from "./digitalMembers";
import { MAP_H, MAP_W, project } from "@/lib/ausMap";

/* The Community Atlas: every Digital Member has a town, towns sit on the map, and common ground reads both ways. */

describe("the Atlas", () => {
  it("places every Digital Member, and nobody who isn't one", () => {
    expect(Object.keys(ATLAS_PLACES).sort()).toEqual(DIGITAL_MEMBERS.map((m) => m.id).sort());
  });

  it("uses known towns and topics, and a person only helps or asks about a topic they talk about", () => {
    for (const [id, p] of Object.entries(ATLAS_PLACES)) {
      expect(TOWNS[p.town], id).toBeTruthy();
      for (const t of [...p.topics, ...(p.canHelp ?? []), ...(p.askingAbout ?? [])]) expect(ATLAS_TOPICS, `${id}: ${t}`).toContain(t);
      for (const t of [...(p.canHelp ?? []), ...(p.askingAbout ?? [])]) expect(p.topics, `${id}: ${t}`).toContain(t);
    }
  });

  it("spreads people across every state and territory, Tasmania included", () => {
    const states = new Set(Object.values(ATLAS_PLACES).map((p) => TOWNS[p.town].state));
    expect([...states].sort()).toEqual(["ACT", "NSW", "NT", "QLD", "SA", "TAS", "VIC", "WA"]);
  });

  it("puts every town on the map", () => {
    for (const t of Object.values(TOWNS)) {
      const [x, y] = project(t.lng, t.lat);
      expect(x, t.name).toBeGreaterThan(0);
      expect(x, t.name).toBeLessThan(MAP_W);
      expect(y, t.name).toBeGreaterThan(0);
      expect(y, t.name).toBeLessThan(MAP_H);
    }
  });

  it("finds common ground: Maya and Mele share hospital discharge, and Mele can help", () => {
    const g = commonGround(ATLAS_PLACES.maya, ATLAS_PLACES["mele-fonua"]);
    expect(g.shared).toContain("Hospital discharge");
    expect(commonGround(ATLAS_PLACES.ava, ATLAS_PLACES["mele-fonua"]).bHelpsA).toEqual(["Hospital discharge"]);
    expect(Math.round(kmBetween(TOWNS.toowoomba, TOWNS.warwick))).toBeGreaterThan(60);
    expect(Math.round(kmBetween(TOWNS.toowoomba, TOWNS.warwick))).toBeLessThan(90);
  });
});
