import { describe, expect, it } from "vitest";
import { ADMIN_GROUPS, CONTENT_LINKS, CONTENT_SECTIONS } from "./adminNav";

/* The admin menu's content groups: every content area in exactly one group, none lost, none twice. */

describe("the admin menu", () => {
  it("puts every content area in exactly one group", () => {
    const placed = CONTENT_SECTIONS.flatMap((g) => g.hrefs);
    expect(new Set(placed).size).toBe(placed.length);
    expect([...placed].sort()).toEqual(CONTENT_LINKS.map((l) => l.href).sort());
  });

  it("keeps the other groups after the content ones, with no empty group and no link twice", () => {
    expect(ADMIN_GROUPS.map((g) => g.title).slice(0, CONTENT_SECTIONS.length)).toEqual(CONTENT_SECTIONS.map((g) => g.title));
    expect(ADMIN_GROUPS.map((g) => g.title)).toContain("People & progress");
    expect(ADMIN_GROUPS.every((g) => g.links.length > 0)).toBe(true);
    const all = ADMIN_GROUPS.flatMap((g) => g.links.map((l) => l.href));
    expect(new Set(all).size).toBe(all.length);
  });
});
