import { beforeEach, describe, expect, it } from "vitest";
import { openDb, type Db } from "./db";
import { userById, type User } from "./auth";
import { archiveGuide, createGuide, publishGuide } from "./magazine";
import { featureStatus, homeShowcase, setFeatured } from "./activityCatalogue";

/* The homepage showcase's featured course: ticked on the course, one at a time, shown large to the people it's for. */

let db: Db;
let author: User, coordinator: User, partner: User;
const now = new Date("2026-11-26T00:00:00Z");

beforeEach(() => {
  db = openDb(":memory:");
  author = userById(db, "jordan")!;
  coordinator = userById(db, "riley")!;
  partner = userById(db, "sam")!;
});

const doc = {
  schema: 2,
  pages: [
    {
      id: "p1",
      title: "The call",
      purpose: "Decide what to say",
      template: "do",
      kind: "content",
      required: true,
      sections: [{ id: "s1", title: "Start", blocks: [{ id: "t1", type: "text", body: "A family member rings, upset." }] }],
    },
  ],
};
const course = (title: string, audience: string[] = []) => {
  const g = createGuide(db, author, { title, standfirst: `What to do when ${title.toLowerCase()}`, completion: "confirm", audience, doc } as never, now);
  publishGuide(db, author, g.id, "", now);
  return g;
};

describe("the featured course", () => {
  it("can only be a published course, one at a time, and is for authors to set", () => {
    const draft = createGuide(db, author, { title: "Not yet out", template: "do" }, now);
    expect(featureStatus(db, author, draft.id)).toMatchObject({ featured: false, eligible: false, why: expect.stringMatching(/Publish it first/) });
    expect(() => setFeatured(db, author, draft.id, true, now)).toThrow(/Publish it first/);
    expect(() => featureStatus(db, coordinator, draft.id)).toThrow();

    const a = course("A family calls");
    const b = course("A visit is missed");
    expect(setFeatured(db, author, a.id, true, now)).toMatchObject({ featured: true });
    // Ticking another takes over, and says which one it replaced before it's ticked.
    expect(featureStatus(db, author, b.id)).toMatchObject({ featured: false, other: "A family calls" });
    setFeatured(db, author, b.id, true, now);
    expect(featureStatus(db, author, a.id).featured).toBe(false);
    // Unticking a course that isn't featured changes nothing.
    setFeatured(db, author, a.id, false, now);
    expect(featureStatus(db, author, b.id).featured).toBe(true);
    setFeatured(db, author, b.id, false, now);
    expect(featureStatus(db, author, b.id).featured).toBe(false);
  });

  it("leads the homepage showcase for the people it's for, and drops off when archived", () => {
    const g = course("A family calls", ["coordinator"]);
    setFeatured(db, author, g.id, true, now);
    const shown = homeShowcase(db, coordinator, now);
    expect(shown.featured).toMatchObject({ title: "A family calls", href: `/magazine/${g.slug}`, question: "What to do when a family calls", cta: "Start" });
    expect(shown.cards.some((c) => c.slug === g.slug)).toBe(false);
    // Not for partners: they don't see it.
    expect(homeShowcase(db, partner, now).featured).toBeNull();
    archiveGuide(db, author, g.id, now);
    expect(homeShowcase(db, coordinator, now).featured).toBeNull();
  });
});
