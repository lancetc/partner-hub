import { describe, expect, it } from "vitest";
import { checkInOpener, subjectOf, type CheckInFacts } from "./checkIn";

const facts = (lastChat: CheckInFacts["lastChat"]): CheckInFacts => ({
  name: "Margaret Alder",
  possessive: "her",
  lastChat,
  recent: null,
  upcoming: null,
  interests: [],
  episode: null,
  tagline: "",
});

describe("the catch-up's first line", () => {
  it("remembers what the learner's own questions were about when it isn't one of the character's topics", () => {
    const qs = ["do you like dogs?", "What sort of dogs do you like?", "Have you owned a dog?"];
    expect(subjectOf(qs)).toBe("dogs");
    expect(checkInOpener(facts({ at: "2026-11-25T05:13:00Z", topics: [], questions: qs }))).toBe(
      "Hello again! Last time you were asking me about dogs. Lovely to hear from you.",
    );
  });

  it("says nothing about the last chat when nothing in it stands out, rather than guess", () => {
    expect(subjectOf(["What’s been happening this week?"])).toBeNull();
    expect(subjectOf(["How are you?", "What did you have for lunch?"])).toBeNull();
    expect(checkInOpener(facts({ at: "2026-11-25T05:02:00Z", topics: [], questions: ["What’s been happening this week?"] }))).toBe(
      "Hello again! Lovely to hear from you.",
    );
  });

  it("uses the latest chat's remembered topic first", () => {
    expect(checkInOpener(facts({ at: "2026-11-25T05:00:00Z", topics: ["her garden"], questions: ["do you like dogs?", "dogs?"] }))).toBe(
      "Hello again! Last time we were talking about my garden. Lovely to hear from you.",
    );
  });
});
