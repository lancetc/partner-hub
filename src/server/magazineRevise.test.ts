import { describe, expect, it } from "vitest";
import { readGuideDoc, type GuideDoc } from "@/lib/magazine";
import { revisePrompt, revisionIssues, toRevision } from "./magazineRevise";

/* Revise with AI: checking and applying what Claude proposes for a built course. (No calls to Claude here.) */

const doc: GuideDoc = readGuideDoc(
  {
    schema: 2,
    pages: [
      {
        id: "p1",
        title: "Before your first visit",
        purpose: "Get ready",
        template: "do",
        kind: "content",
        required: true,
        sections: [
          {
            id: "s1",
            title: "Getting ready",
            blocks: [
              { id: "t1", type: "text", body: "Read the care plan before you go.", evidence: [{ source: "Guide.pdf", ref: "p 2", quote: "Read the plan" }] },
              { id: "im1", type: "image", media: { src: "/images/magazine/visit.jpg", alt: "A worker at a front door" }, width: "column" },
            ],
          },
        ],
      },
      {
        id: "p2",
        title: "On the day",
        purpose: "Do the visit",
        template: "decide",
        kind: "content",
        required: true,
        sections: [{ id: "s2", title: "Arriving", blocks: [{ id: "t2", type: "text", body: "Knock and introduce yourself." }] }],
      },
      { id: "quiz", title: "Final check", purpose: "Show what you know", template: "blank", kind: "assessment", required: true, sections: [] },
    ],
  },
  { draft: true },
);

const text = (body: string) => ({ type: "text", body });

describe("checking Claude's proposal", () => {
  it("accepts kept blocks, rewritten blocks, a new page and a removed page", () => {
    const issues = revisionIssues(
      doc,
      "course",
    )({
      summary: "Tightened page 1 and added a page on leaving.",
      changes: [
        { page: "p1", why: "Shorter", sections: [{ title: "Getting ready", blocks: [{ keep: "im1" }, text("Read the care plan the day before.")] }] },
        { page: "new", after: "p2", why: "Leaving is missing", title: "Leaving", purpose: "Leave well", template: "do", sections: [{ title: "Before you go", blocks: [text("Say goodbye.")] }] },
        { page: "p2", remove: true, why: "Covered elsewhere" },
      ],
    });
    expect(issues).toEqual([]);
  });

  it("names a keep that isn't the page's own, a block kept twice, an unknown page and a missing why", () => {
    const issues = revisionIssues(
      doc,
      "course",
    )({
      summary: "x",
      changes: [
        { page: "p1", why: "a", sections: [{ title: "A", blocks: [{ keep: "t2" }, { keep: "im1" }, { keep: "im1" }] }] },
        { page: "nope", why: "b", sections: [] },
        { page: "p2", sections: [{ title: "B", blocks: [text("Hi")] }] },
      ],
    }).join(" ");
    expect(issues).toMatch(/keep" names t2/);
    expect(issues).toMatch(/im1 is kept twice/);
    expect(issues).toMatch(/Change 2: "page" must be the id/);
    expect(issues).toMatch(/Change 3 needs a "why"/);
  });

  it("keeps a page revision to its page: no new or removed pages, and assessments can't be changed", () => {
    const check = revisionIssues(doc, "p1");
    const issues = check({
      summary: "x",
      changes: [
        { page: "new", after: "p1", why: "a", title: "T", template: "do", sections: [] },
        { page: "p1", remove: true, why: "b" },
        { page: "p2", why: "c", sections: [] },
      ],
    }).join(" ");
    expect(issues).toMatch(/don’t add pages/);
    expect(issues).toMatch(/don’t remove the page/);
    expect(issues).toMatch(/Change 3: "page" must be the id of a page you were asked to revise\./);
    expect(revisionIssues(doc, "course")({ summary: "x", changes: [{ page: "quiz", why: "a", sections: [] }] }).join(" ")).toMatch(/must be the id/);
  });

  it("asks for a summary and a changes list, and allows no changes", () => {
    expect(revisionIssues(doc, "course")({ changes: [] })).toEqual(['Add a "summary": what you changed and why, or that nothing needed changing.']);
    expect(revisionIssues(doc, "course")({ summary: "All good" })).toHaveLength(1);
    expect(revisionIssues(doc, "course")({ summary: "Nothing needed changing.", changes: [] })).toEqual([]);
  });
});

describe("turning the proposal into changes", () => {
  it("brings kept blocks back exactly, gives new blocks fresh ids, and keeps everything about the page but its words", () => {
    const r = toRevision(doc, "course", {
      summary: "Done",
      changes: [{ page: "p1", why: "Shorter", title: "Get ready", sections: [{ title: "Getting ready", blocks: [{ keep: "im1" }, text("Read the care plan the day before.")] }] }],
    });
    expect(r.summary).toBe("Done");
    const c = r.changes[0];
    if (c.kind !== "edit") throw new Error("expected an edit");
    expect(c.page).toMatchObject({ id: "p1", title: "Get ready", purpose: "Get ready", template: "do", kind: "content" });
    const [kept, fresh] = c.page.sections[0].blocks;
    expect(kept).toEqual(doc.pages[0].sections[0].blocks[1]);
    expect(fresh.id).not.toBe("t1");
    expect(fresh).toMatchObject({ type: "text", body: "Read the care plan the day before." });
  });

  it("places a new page and passes removals through", () => {
    const r = toRevision(doc, "course", {
      summary: "x",
      changes: [
        { page: "new", after: "start", why: "Intro", title: "Welcome", purpose: "Meet the course", template: "notice", sections: [{ title: "Hello", blocks: [text("Welcome.")] }] },
        { page: "p2", remove: true, why: "Covered" },
      ],
    });
    expect(r.changes[0]).toMatchObject({ kind: "add", after: null, page: { title: "Welcome", template: "notice", kind: "content", required: true } });
    expect(r.changes[1]).toEqual({ kind: "remove", pageId: "p2", why: "Covered" });
  });
});

describe("the prompt", () => {
  it("lists the course, gives only the page in scope in full, and carries the author's instructions", () => {
    const p = revisePrompt({ title: "Induction", standfirst: "", audience: "Care Partners", brief: "", doc, scope: "p2", prompt: "Make it friendlier", hasSources: false });
    expect(p).toContain("1. [id p1] Before your first visit");
    expect(p).toContain("<- revise this page");
    expect(p).toContain('<page id="p2">');
    expect(p).not.toContain('<page id="p1">');
    expect(p).toContain("Make it friendlier");
    expect(p).not.toContain('"page":"new"');
  });
});
