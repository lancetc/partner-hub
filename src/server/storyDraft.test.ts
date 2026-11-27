import { deflateRawSync } from "node:zlib";
import { beforeEach, describe, expect, it, vi } from "vitest";
import { openDb, type Db } from "./db";
import { userById } from "./auth";
import { lessons } from "@/content/lessons";
import { resources } from "@/content/resources";
import { storyBasis } from "@/lib/storyGlance";

/*
  The News editor's writer: a brief or a dropped document (Word, PowerPoint, PDF, text) in, a complete news item out,
  every field filled in. The model is simulated here (no call to Claude or anyone else): each call takes the next
  queued reply, and a reply the checks refuse is reported back and the next one used, as the real loop does.
*/

const replies: unknown[] = [];
const refused: string[][] = [];
const seen: { content: unknown[] } = { content: [] };
vi.mock("./claudeJson", () => ({
  contentFor: (prompt: string, source?: { kind: string; name: string }) => [
    ...(source ? [{ type: "document", title: source.name }] : []),
    { type: "text", text: prompt },
  ],
  askForJson: async (content: unknown[], check: (v: unknown) => string[]) => {
    seen.content = content;
    while (replies.length) {
      const value = replies.shift();
      const issues = check(value);
      if (!issues.length) return { value, usage: { mocked: true } };
      refused.push(issues);
    }
    throw new Error("No acceptable mocked reply.");
  },
}));
const { draftStory } = await import("./storyDraft");
const { readSource } = await import("./lessonDraft");

let db: Db;
const now = new Date("2026-10-29T04:00:00Z");
const brief = "From 1 December partners must log visit notes in the Trilogy Care Portal on the day of the visit. Applies to all partners.";
const topic = lessons.find((l) => l.track !== "reinforcement")!;
const answer = (over: Record<string, unknown> = {}) => ({
  title: "Log visit notes on the day",
  dek: "From 1 December, notes go into the Trilogy Care Portal the same day.",
  category: "policy",
  audience: ["partner"],
  byline: "Trilogy Care team",
  body: [
    { type: "p", text: "From **1 December**, log your notes in the Trilogy Care Portal on the day of the visit.", items: [], cite: "" },
    { type: "p", text: "It applies to all Care Partners, and it replaces logging notes at the end of the week.", items: [], cite: "" },
    { type: "list", text: "", items: ["Open the portal", "Add the note"], cite: "" },
  ],
  seoTitle: "Log visit notes on the day from 1 December",
  seoDescription: "What changes for Care Partners from 1 December, and how to log notes in the Trilogy Care Portal.",
  imageIdea: "A support worker typing notes on a phone in a car.",
  imageAlt: "A support worker typing on a phone.",
  pictures: [
    { after: "", idea: "A coordinator at a desk with a client file.", alt: "A coordinator at a desk.", caption: "" },
    { after: "A heading that isn't there", idea: "A garden.", alt: "A garden.", caption: "" },
  ],
  policy: {
    status: "announced",
    issuer: "Trilogy Care",
    sourceTitle: "Operations update",
    sourceUrl: "",
    published: "2026-11-20",
    effective: "2026-12-01",
    owner: "",
  },
  glance: [
    {
      title: "Notes on the day",
      text: "From 1 December, visit notes go in on the day.",
      from: "log your notes in the Trilogy Care Portal on the day of the visit",
    },
    { title: "For every partner", text: "It applies to all Care Partners.", from: "It applies to all Care Partners" },
    { title: "No more weekly notes", text: "It replaces logging notes at the end of the week.", from: "it replaces logging notes at the end of the week" },
  ],
  actions: [{ text: "Log today's notes before you leave the visit.", href: "" }],
  relatedTopic: topic.slug,
  relatedResources: [resources[0].id, "not-a-resource"],
  ...over,
});
beforeEach(() => {
  db = openDb(":memory:");
  replies.length = 0;
  refused.length = 0;
  vi.stubEnv("ANTHROPIC_API_KEY", "test-not-used");
});
const jordan = () => userById(db, "jordan")!;
const promptOf = () => (seen.content.at(-1) as { text: string }).text;

describe("writing a story from a brief", () => {
  it("fills in every field, ready to check: the story, At a glance, the actions, related learning and the introduction script", async () => {
    replies.push(answer());
    const { story, imageIdea, imageAlt, pictures } = await draftStory(db, jordan(), { brief }, now);
    expect(imageAlt).toBe("A support worker typing on a phone.");
    // A picture suggested under a heading the story doesn't have is dropped.
    expect(pictures).toEqual([{ after: "", idea: "A coordinator at a desk with a client file.", alt: "A coordinator at a desk.", caption: "" }]);
    expect(story).toMatchObject({
      title: "Log visit notes on the day",
      category: "policy",
      audience: ["partner"],
      date: now.toISOString(),
      seo: { title: "Log visit notes on the day from 1 December" },
      policy: { effective: "2026-12-01", status: "announced" },
      relatedLesson: topic.slug,
      relatedResources: [resources[0].id],
    });
    expect(story.glance).toMatchObject({ enabled: true, basis: storyBasis(story) });
    expect(story.glance?.points.map((p) => p.title)).toEqual(["Notes on the day", "For every partner", "No more weekly notes"]);
    expect(story.practice).toMatchObject({ enabled: false, checklist: true, items: [{ id: "a1", text: "Log today's notes before you leave the visit." }] });
    expect(story.narration?.script).toContain("From 1 December");
    expect(imageIdea).toMatch(/support worker/);
    expect(promptOf()).toContain("<brief>");
    expect(promptOf()).toContain("Use only the facts in the brief");
  });

  it("sends back a takeaway that doesn't quote the story, and a link that isn't a Hub page", async () => {
    replies.push(
      answer({
        glance: [...answer().glance.slice(0, 2), { title: "Rates rise", text: "Rates rise in January.", from: "rates rise by five per cent in January" }],
      }),
      answer({ actions: [{ text: "Read more.", href: "https://example.com" }] }),
      answer(),
    );
    await draftStory(db, jordan(), { brief }, now);
    expect(refused[0].join(" ")).toMatch(/isn't in it/);
    expect(refused[1].join(" ")).toMatch(/isn't one of the pages listed/);
  });

  it("leaves policy details off other stories, and drops a link that isn't a web address", async () => {
    replies.push(answer({ category: "trilogy" }));
    expect((await draftStory(db, jordan(), { brief }, now)).story.policy).toBeUndefined();
    replies.push(answer({ policy: { ...answer().policy, sourceUrl: "javascript:alert(1)" } }));
    expect((await draftStory(db, jordan(), { brief }, now)).story.policy?.sourceUrl).toBe("");
  });

  it("needs a real brief or a document, and an author", async () => {
    await expect(draftStory(db, jordan(), { brief: "Too short" }, now)).rejects.toThrow(/a little more/);
    await expect(draftStory(db, userById(db, "sam")!, { brief }, now)).rejects.toThrow(/learning authors/);
    await expect(draftStory(db, jordan(), { source: { kind: "text", name: "notes.docx", text: "Hello." } }, now)).rejects.toThrow(/Almost no text/);
  });
});

/** A zip with stored (or deflated) files, as a .pptx is. */
function zip(files: Record<string, string>) {
  const locals: Buffer[] = [];
  const central: Buffer[] = [];
  let offset = 0;
  for (const [name, text] of Object.entries(files)) {
    const raw = Buffer.from(text, "utf8");
    const data = deflateRawSync(raw);
    const n = Buffer.from(name, "utf8");
    const local = Buffer.alloc(30);
    local.writeUInt32LE(0x04034b50, 0);
    local.writeUInt16LE(8, 8);
    local.writeUInt32LE(data.length, 18);
    local.writeUInt32LE(raw.length, 22);
    local.writeUInt16LE(n.length, 26);
    const c = Buffer.alloc(46);
    c.writeUInt32LE(0x02014b50, 0);
    c.writeUInt16LE(8, 10);
    c.writeUInt32LE(data.length, 20);
    c.writeUInt32LE(raw.length, 24);
    c.writeUInt16LE(n.length, 28);
    c.writeUInt32LE(offset, 42);
    locals.push(local, n, data);
    central.push(c, n);
    offset += 30 + n.length + data.length;
  }
  const cd = Buffer.concat(central);
  const end = Buffer.alloc(22);
  end.writeUInt32LE(0x06054b50, 0);
  end.writeUInt16LE(Object.keys(files).length, 8);
  end.writeUInt16LE(Object.keys(files).length, 10);
  end.writeUInt32LE(cd.length, 12);
  end.writeUInt32LE(offset, 16);
  return Buffer.concat([...locals, cd, end]);
}

describe("writing a story from a document", () => {
  it("reads a PowerPoint deck's slides and writes the story from it", async () => {
    const deck = zip({
      "ppt/presentation.xml": "<p:presentation/>",
      "ppt/slides/slide1.xml": "<p:sld><a:t>Visit notes on the day</a:t></p:sld>",
      "ppt/slides/slide2.xml":
        "<p:sld><a:t>From 1 December, log notes in the portal on the day of the visit. It applies to all Care Partners &amp; coordinators.</a:t></p:sld>",
    });
    const source = await readSource(new File([deck], "Ops update.pptx"));
    expect(source).toEqual({
      kind: "text",
      name: "Ops update.pptx",
      text: "A slide deck: Ops update.pptx\n\n[Slide 1]\nVisit notes on the day\n\n[Slide 2]\nFrom 1 December, log notes in the portal on the day of the visit. It applies to all Care Partners & coordinators.",
    });
    replies.push(answer());
    const { story } = await draftStory(db, jordan(), { source }, now);
    expect(story.title).toBe("Log visit notes on the day");
    expect(seen.content[0]).toEqual({ type: "document", title: "Ops update.pptx" });
    expect(promptOf()).toContain('the attached document "Ops update.pptx"');
    expect(promptOf()).toContain("never describe the slides");
  });

  it("asks for a newer copy of an old .ppt file", async () => {
    const old = Buffer.concat([Buffer.from([0xd0, 0xcf, 0x11, 0xe0]), Buffer.alloc(40)]);
    await expect(readSource(new File([old], "deck.ppt"))).rejects.toThrow(/\.pptx/);
  });
});

describe("the voiced introduction's script", () => {
  it("uses the writer's own script, and drafts one from the story when it's missing or too short", async () => {
    const intro = "From the first of December, visit notes change. " + "Notes go into the portal on the day of the visit, while it's fresh. ".repeat(6);
    replies.push(answer({ introScript: intro }));
    expect((await draftStory(db, jordan(), { brief }, now)).story.narration?.script).toBe(intro.trim().replace(/\s+/g, " "));
    replies.push(answer({ introScript: "Too short." }));
    expect((await draftStory(db, jordan(), { brief }, now)).story.narration?.script).toContain("From 1 December");
  });
});
