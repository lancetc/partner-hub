import { beforeEach, describe, expect, it } from "vitest";
import { zipSync, strToU8 } from "fflate";
import { openDb, type Db } from "./db";
import { userById, type User } from "./auth";
import { createGuide } from "./magazine";
import { addSource, draftPlan, outlineIssues, outlinePrompt, pageIssues, pagePrompt, removeSource, updatePlan, updateSource, type OutlinePage } from "./magazineDraft";

/* Drafting a Magazine with Claude: reading the documents, the time target, and checking what Claude sends back. (No calls to Claude here.) */

let db: Db;
let author: User, coordinator: User;
let guideId: string;
const now = new Date("2026-11-19T00:00:00Z");

beforeEach(() => {
  db = openDb(":memory:");
  author = userById(db, "jordan")!;
  coordinator = userById(db, "riley")!;
  guideId = createGuide(db, author, { title: "Checking invoices", template: "do" }, now).id;
});

const longText = "Match each line on the invoice to one agreed service before it is approved. ".repeat(10);
const file = (name: string, data: Uint8Array | string, type = "") => new File([Buffer.from(typeof data === "string" ? strToU8(data) : data)], name, { type });
const page = (o: Partial<OutlinePage> = {}): OutlinePage => ({
  title: "What to check",
  purpose: "Run the checks",
  template: "do",
  minutes: 10,
  required: true,
  interaction: "",
  sources: [],
  missing: [],
  ...o,
});

describe("source documents", () => {
  it("reads text, Word-free PowerPoint slides, and says which file couldn't be read and why", async () => {
    const txt = await addSource(db, author, guideId, file("guidance.txt", longText, "text/plain"), now);
    expect(txt).toMatchObject({ name: "guidance.txt", kind: "text", status: "ready", authority: "authoritative" });
    expect(txt.words).toBeGreaterThan(100);

    const pptx = zipSync({
      "ppt/presentation.xml": strToU8("<p:presentation/>"),
      "ppt/slides/slide1.xml": strToU8(`<p:sld><a:t>Check the client’s name and period on every invoice line</a:t></p:sld>`),
      "ppt/slides/slide2.xml": strToU8(`<p:sld><a:t>Match each line to an agreed service, then check dates hours and the price &amp; query anything that doesn’t match</a:t></p:sld>`),
    });
    const slides = await addSource(db, author, guideId, file("training.pptx", pptx), now);
    expect(slides).toMatchObject({ status: "ready", slides: 2 });

    const junk = await addSource(db, author, guideId, file("photo.png", new Uint8Array([0x89, 0x50, 0x4e, 0x47, 1, 2, 3])), now);
    expect(junk).toMatchObject({ status: "error" });
    expect(junk.error).toMatch(/PDF, Word/);
    const scan = await addSource(db, author, guideId, file("scan.txt", "page 1"), now);
    expect(scan).toMatchObject({ status: "error" });
    expect(scan.error).toMatch(/scan/);

    expect(draftPlan(db, author, guideId).sources.map((s) => s.status)).toEqual(["ready", "ready", "error", "error"]);
  });

  it("marks a document background, removes one, and is for authors only", async () => {
    const s = await addSource(db, author, guideId, file("notes.txt", longText, "text/plain"), now);
    expect(updateSource(db, author, guideId, s.id, { authority: "background" }).authority).toBe("background");
    expect(() => updateSource(db, author, guideId, s.id, { authority: "maybe" })).toThrow(/authoritative or background/);
    await expect(addSource(db, coordinator, guideId, file("x.txt", longText), now)).rejects.toThrow(/authors/);
    removeSource(db, author, guideId, s.id);
    expect(draftPlan(db, author, guideId).sources).toEqual([]);
  });
});

describe("the brief, time and outline", () => {
  it("keeps the brief, time target and the author's outline edits", () => {
    const p = updatePlan(db, author, guideId, { brief: "Teach invoice checks.", minutes: 30, outline: [page({ minutes: 99, template: "nope" as never })] }, now);
    expect(p).toMatchObject({ brief: "Teach invoice checks.", minutes: 30 });
    expect(p.outline![0]).toMatchObject({ minutes: 60, template: "blank" });
    expect(() => updatePlan(db, author, guideId, { minutes: 1 }, now)).toThrow(/between 2 and 240/);
    expect(updatePlan(db, author, guideId, { minutes: null }, now).minutes).toBeNull();
  });

  it("checks Claude's outline adds up to about the time asked for, with real templates and sources", () => {
    const ok = { pages: [page({ minutes: 12, sources: ["guidance.txt"] }), page({ title: "Read it", template: "notice", minutes: 16 })] };
    expect(outlineIssues(ok, 30, ["guidance.txt"])).toEqual([]);
    expect(outlineIssues(ok, 60, ["guidance.txt"]).join(" ")).toMatch(/add up to 28 minutes; the course should take about 60/);
    expect(outlineIssues({ pages: [page({ template: "blank" as never })] }, null, []).join(" ")).toMatch(/decide, do, notice, adapt or say/);
    expect(outlineIssues({ pages: [page({ sources: ["made-up.pdf"] })] }, null, ["guidance.txt"]).join(" ")).toMatch(/isn’t one of the documents/);
    expect(outlineIssues({}, 30, [])).toEqual(['The reply needs a "pages" list.']);
  });

  it("puts the time target in the prompts: for the outline and for each page", () => {
    const outline = outlinePrompt({ title: "Invoices", standfirst: "", audience: "care coordinators", brief: "b", minutes: 45, sourceNames: ["guidance.txt"] });
    expect(outline).toMatch(/about 45 minutes/);
    expect(outline).toMatch(/"guidance.txt"/);
    expect(outline).toMatch(/Never invent rates/);
    const p = pagePrompt({ title: "Invoices", standfirst: "", audience: "care coordinators", brief: "b", outline: [page({ minutes: 8 })], index: 0 });
    expect(p).toMatch(/about 8 minutes/);
    expect(p).toMatch(/1040 to 1360 words/);
    expect(p).toMatch(/illustrative/);
  });
});

describe("a generated page", () => {
  const good = {
    sections: [
      {
        title: "Step by step",
        blocks: [
          { type: "text", body: "1. Open the agreed services.", evidence: [{ source: "guidance.txt", ref: "p. 2", quote: "Match each line" }] },
          {
            type: "decision",
            prompt: "What do you do?",
            choices: [
              { text: "Ask for detail", verdict: "best", feedback: "Yes." },
              { text: "Approve it", verdict: "risky", feedback: "Not yet." },
            ],
          },
          { type: "image", media: { src: "https://example.com/invoice.png", alt: "An invoice" }, width: "wide" },
          { type: "callout", style: "tip", body: "Check the guidance.", link: { href: "javascript:alert(1)", label: "Go" } },
        ],
      },
    ],
  };

  it("passes when complete; another site's picture or an unsafe link is tidied away rather than refused", () => {
    expect(pageIssues(good)).toEqual([]);
  });

  it("is sent back to Claude when a question is incomplete or a block isn't allowed", () => {
    const bad = {
      sections: [
        {
          title: "",
          blocks: [
            { type: "decision", prompt: "?", choices: [{ text: "Only one", verdict: "risky", feedback: "" }] },
            { type: "quiz", pathId: "x" },
          ],
        },
      ],
    };
    const issues = pageIssues(bad).join(" ");
    expect(issues).toMatch(/needs a title/);
    expect(issues).toMatch(/at least 2 choices/);
    expect(issues).toMatch(/best choice/);
    expect(issues).toMatch(/don’t use quiz/);
    expect(pageIssues({ sections: [{ title: "A", blocks: [{ type: "html", body: "<b>x</b>" }] }] }).join(" ")).toMatch(/unknown kind/);
    expect(pageIssues({})).toEqual(['The reply needs a "sections" list with at least one section.']);
  });
});
