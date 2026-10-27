import { describe, expect, it } from "vitest";
import { lessonMatches, normalTitle, parseOutline } from "./pathOutline";

/* Importing a course outline into a learning path. */

const OUTLINE = `01 · Your Team
2 topics
Getting connected with the people who support you.

1. Your Two Key Contacts
2. Who to Contact and When

02 · About Trilogy Care
3 topics
Understanding the organisation and its model of care.

1. Our Mission & Model
2. The Relationship Triangle
3. Organisational Support Behind You

Stage 2: Working as a Care Coordinator
05 · Care Coordination
6 topics
The day-to-day responsibilities of coordinating safe, appropriate care.

1. Understanding Client Types
2. The Care Coordinator's Responsibilities`;

describe("parseOutline", () => {
  it("reads chapters, descriptions, topics and stages", () => {
    const c = parseOutline(OUTLINE);
    expect(c.map((x) => [x.number, x.title, x.topics.length, x.stage])).toEqual([
      ["01", "Your Team", 2, ""],
      ["02", "About Trilogy Care", 3, ""],
      ["05", "Care Coordination", 2, "Stage 2: Working as a Care Coordinator"],
    ]);
    expect(c[0].description).toBe("Getting connected with the people who support you.");
    expect(c[1].topics).toEqual(["Our Mission & Model", "The Relationship Triangle", "Organisational Support Behind You"]);
  });

  it("copes with other separators and no blank lines", () => {
    const c = parseOutline("1 - Basics\nWhy it matters\n1) First thing\n2) Second thing\n02: More\n1. Third");
    expect(c.map((x) => [x.title, x.description, x.topics])).toEqual([
      ["Basics", "Why it matters", ["First thing", "Second thing"]],
      ["More", "", ["Third"]],
    ]);
  });
});

describe("matching topics to lessons", () => {
  const lessons = [{ title: "Our Mission and Model" }, { title: "Legislative Framework" }, { title: "Legislative Framework: the Aged Care Act in practice" }];
  it("ignores case, punctuation and & versus and", () => {
    expect(normalTitle("Statement of Rights & Principles")).toBe("statement of rights and principles");
    expect(lessonMatches("Our Mission & Model", lessons)).toEqual([lessons[0]]);
  });
  it("puts exact matches before longer titles that start the same way", () => {
    expect(lessonMatches("Legislative Framework", lessons)).toEqual([lessons[1], lessons[2]]);
    expect(lessonMatches("Something new", lessons)).toEqual([]);
  });
});
