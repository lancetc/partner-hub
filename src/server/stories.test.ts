import { beforeEach, describe, expect, it } from "vitest";
import { openDb, type Db } from "./db";
import { userById } from "./auth";
import { stories, storyBySlug, type Story } from "@/content/stories";
import { syncStories } from "./storyRegistry";
import { adminStories, adminStory, deleteStory, restoreStory, revertStory, saveStory, setStoryStatus, storyPreview, validateStory } from "./stories";

/* Editing the homepage news: built-in stories can be changed, new ones written, and either published or kept as drafts. */

let db: Db;
beforeEach(() => {
  db = openDb(":memory:");
  syncStories(db);
});
const u = (id: string) => userById(db, id)!;
const now = new Date("2026-10-29T04:00:00Z");
const builtIn = () => adminStories(db, u("jordan")).stories.find((s) => s.builtIn)!;
const draft = (over: Partial<Story> = {}): Partial<Story> => ({
  title: "Our new gardening partners",
  dek: "Three new teams join this month.",
  category: "trilogy",
  date: "2026-10-29T00:00:00Z",
  audience: ["partner"],
  visual: { variant: "petals", tone: "teal", icon: "leaf", alt: "" },
  body: [{ type: "p", text: "Welcome to our new partners." }],
  ...over,
});

describe("news stories", () => {
  it("edits a built-in story, which goes live straight away and can be put back as it shipped", () => {
    const s = builtIn();
    const story = adminStory(db, u("jordan"), s.slug).story;
    saveStory(db, u("jordan"), s.slug, { ...story, title: "A better headline" }, now);
    expect(storyBySlug(s.slug)?.title).toBe("A better headline");
    expect(adminStory(db, u("jordan"), s.slug)).toMatchObject({ edited: true, status: "published" });
    revertStory(db, u("jordan"), s.slug, now);
    expect(storyBySlug(s.slug)?.title).toBe(s.title);
  });

  it("keeps a new story as a draft until it's published, previewable by authors only", () => {
    const { slug, status } = saveStory(db, u("jordan"), null, draft(), now);
    expect(status).toBe("draft");
    expect(storyBySlug(slug)).toBeUndefined();
    expect(storyPreview(db, u("jordan"), slug)?.title).toBe("Our new gardening partners");
    expect(storyPreview(db, u("sam"), slug)).toBeNull();
    setStoryStatus(db, u("jordan"), slug, "published", now);
    expect(storyBySlug(slug)?.slug).toBe(slug);
    setStoryStatus(db, u("jordan"), slug, "draft", now);
    expect(storyBySlug(slug)).toBeUndefined();
  });

  it("deletes and restores, including built-in stories", () => {
    const s = builtIn();
    deleteStory(db, u("jordan"), s.slug, now);
    expect(storyBySlug(s.slug)).toBeUndefined();
    expect(adminStories(db, u("jordan")).deleted.map((d) => d.slug)).toContain(s.slug);
    restoreStory(db, u("jordan"), s.slug, now);
    expect(storyBySlug(s.slug)?.title).toBe(s.title);
  });

  it("checks what's saved, and works out the reading time", () => {
    expect(() => validateStory(draft({ title: " " }))).toThrow(/title/);
    expect(() => validateStory(draft({ body: [] }))).toThrow(/paragraph/);
    expect(() => validateStory(draft({ audience: [] }))).toThrow(/who the story is for/);
    expect(() =>
      validateStory(
        draft({ visual: { variant: "petals", tone: "teal", icon: "leaf", alt: "x", photo: { src: "https://evil.example/a.jpg", width: 1, height: 1 } } }),
      ),
    ).toThrow(/image library/);
    expect(() =>
      validateStory(
        draft({ visual: { variant: "petals", tone: "teal", icon: "leaf", alt: "", photo: { src: "/api/uploads/a.webp", width: 10, height: 10 } } }),
      ),
    ).toThrow(/Describe the poster/);
    expect(validateStory(draft({ relatedLesson: "no-such-topic" })).relatedLesson).toBeUndefined();
    const pic = { type: "image" as const, src: "/api/uploads/a.webp", width: 800, height: 600, alt: "A garden", align: "left" as const };
    expect(validateStory(draft({ body: [{ type: "p", text: "Intro." }, pic] })).body[1]).toEqual(pic);
    expect(() =>
      validateStory(
        draft({
          body: [
            { type: "p", text: "Intro." },
            { ...pic, alt: "" },
          ],
        }),
      ),
    ).toThrow(/Describe each picture/);
    expect(() => validateStory(draft({ body: [pic] }))).toThrow(/paragraph/);
    expect(validateStory(draft({ seo: { title: "  Short title ", description: "" } })).seo).toEqual({ title: "Short title" });
    const long = validateStory(draft({ body: [{ type: "p", text: "word ".repeat(660) }] }));
    expect(long.readMinutes).toBe(3);
  });

  it("is for learning authors only, and new stories get their own address", () => {
    expect(() => saveStory(db, u("sam"), null, draft(), now)).toThrow(/Only learning authors/);
    const a = saveStory(db, u("jordan"), null, draft(), now).slug;
    const b = saveStory(db, u("jordan"), null, draft(), now).slug;
    expect(a).toBe("our-new-gardening-partners");
    expect(b).toBe("our-new-gardening-partners-2");
    expect(stories.length).toBeGreaterThan(0);
  });
});
