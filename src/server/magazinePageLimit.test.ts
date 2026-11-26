import { describe, expect, it } from "vitest";
import { PLAIN_BLOCKS, pageAllowed, pageIssues, pagePrompt, type OutlinePage } from "./magazineDraft";

/* A drafted page holds only the activities the author accepted for it, besides plain content (the owner, Nov 2026). */

const why = { behaviour: "b", evidence: "e", alternative: "a", rationale: "r", learnerAction: "l", signal: "s", owner: "o", source: "src" };
const page = (activities: OutlinePage["activities"]): OutlinePage => ({
  title: "What to do first",
  purpose: "Respond to a missed visit",
  template: "do",
  minutes: 4,
  required: true,
  interaction: "",
  sources: [],
  missing: [],
  activities,
});
const course = ["text", "callout", "accordion", "process", "decision", "checklist", "sorting", "pulse"];

describe("limiting a page to the accepted activities", () => {
  it("allows plain content and only the accepted activities, never suggested or rejected ones", () => {
    expect(PLAIN_BLOCKS).toEqual(expect.arrayContaining(["text", "callout", "accordion", "tabs", "timeline"]));
    expect(PLAIN_BLOCKS).not.toContain("decision");
    expect(PLAIN_BLOCKS).not.toContain("pulse");
    const p = page([
      { type: "process", mode: "configurable", decision: "accepted", why },
      { type: "checklist", mode: "configurable", decision: "suggested", why },
      { type: "sorting", mode: "configurable", decision: "rejected", why },
    ]);
    expect(pageAllowed(course, p)).toEqual(["text", "callout", "accordion", "process"]);
    expect(pageAllowed(course, page(undefined))).toEqual(["text", "callout", "accordion"]);
  });

  it("asks for the accepted activities and no others, and refuses a page that adds one", () => {
    const p = page([
      { type: "process", mode: "configurable", decision: "accepted", why },
      { type: "checklist", mode: "configurable", decision: "suggested", why },
    ]);
    const allowed = pageAllowed(course, p);
    const prompt = pagePrompt({ title: "T", standfirst: "", audience: "coordinators", brief: "", outline: [p], index: 0, allowed });
    expect(prompt).toMatch(/activities the author accepted[\s\S]*- process/);
    expect(prompt).not.toMatch(/- checklist/);
    expect(prompt).toMatch(/Add no other activity/);
    const withExtra = {
      sections: [
        {
          title: "Steps",
          blocks: [
            { type: "text", body: "Start here." },
            {
              type: "decision",
              prompt: "What first?",
              choices: [
                { text: "A", verdict: "best", feedback: "f" },
                { text: "B", verdict: "risky", feedback: "g" },
              ],
            },
          ],
        },
      ],
    };
    expect(pageIssues(withExtra, allowed).join(" ")).toMatch(/don’t use decision blocks/);
    expect(pagePrompt({ title: "T", standfirst: "", audience: "", brief: "", outline: [page([])], index: 0, allowed: pageAllowed(course, page([])) })).toMatch(
      /accepted no activities for this page/,
    );
  });
});
