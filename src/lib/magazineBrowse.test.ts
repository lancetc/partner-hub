import { describe, expect, it } from "vitest";
import { guideFormat, guideTags, readGuideDoc, SIMULATION_BLOCKS, type GuideDoc } from "./magazine";

/* How the Magazine browses: each story's format, and the roles and goals it's for (the author's, or worked out). */

const page = (id: string, blocks: Record<string, unknown>[]) => ({
  id,
  title: "Page",
  purpose: "",
  template: "blank",
  kind: "content",
  required: true,
  sections: [{ id: `s-${id}`, title: "Section", blocks: blocks.map((b, i) => ({ id: `${id}-b${i}`, ...b })) }],
});
const text = { type: "text", body: "Some words." };
const doc = (pages: ReturnType<typeof page>[], extra: Record<string, unknown> = {}) => readGuideDoc({ schema: 2, pages, ...extra }, { draft: true });

describe("a story's format", () => {
  it("is a course with several pages, whatever is on them", () => {
    expect(guideFormat(doc([page("a", [text]), page("b", [{ type: "hiring" }])]))).toBe("course");
  });
  it("is a simulation with one page built around a simulation block, else a guide", () => {
    const sim = { schema: 2, pages: [{ id: "p", sections: [{ id: "s", blocks: [{ id: "x", type: "hiring" }] }] }] } as unknown as GuideDoc;
    expect(guideFormat(sim)).toBe("simulation");
    expect(guideFormat(doc([page("a", [text])]))).toBe("guide");
    expect(SIMULATION_BLOCKS).toContain("onedaymap");
  });
});

describe("roles and goals", () => {
  it("are the author's when set, and kept through reading the document", () => {
    const d = doc([page("a", [text])], { tags: { roles: ["owner", "nobody"], goals: ["grow", "grow"] } });
    expect(d.tags).toEqual({ roles: ["owner"], goals: ["grow"] });
    expect(guideTags(d, ["partner"], "Invoices that get paid")).toEqual({ roles: ["owner"], goals: ["grow"] });
  });

  it("drop empty tags rather than keeping an empty set", () => {
    expect(doc([page("a", [text])], { tags: { roles: [], goals: [] } }).tags).toBeUndefined();
  });

  it("are worked out from who it's for, its blocks and its words until the author sets some", () => {
    expect(guideTags(doc([page("a", [text])]), ["partner"], "Invoices that get paid first time")).toEqual({ roles: ["partner"], goals: ["money"] });
    expect(guideTags(doc([page("a", [text])]), ["coordinator"], "Ready for your first shift: induction")).toMatchObject({ goals: ["start"] });
    // A business simulator is for owners and managers, and about growing the business and its money.
    const hiring = { schema: 2, pages: [{ id: "p", sections: [{ id: "s", blocks: [{ id: "x", type: "hiring" }] }] }] } as unknown as GuideDoc;
    expect(guideTags(hiring, ["partner"], "Maya's next coordinator")).toEqual({ roles: ["partner", "owner"], goals: ["grow", "money"] });
    // Page and section titles count too: a course about referrals is about growing the business.
    const brokered = doc([page("a", [text])]);
    brokered.pages[0].title = "One referral code to start";
    expect(guideTags(brokered, ["partner"], "Your first steps").goals).toContain("grow");
    // For everyone: no roles.
    expect(guideTags(null, [], "The client journey, from enquiry to exit").roles).toEqual([]);
  });
});
