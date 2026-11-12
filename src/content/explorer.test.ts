import { describe, expect, it } from "vitest";
import { doorLines, fillLine, quests, timeOfDay } from "./explorer";

const vars = { name: "Sam", time: "morning" };
const dot = quests.find((q) => q.id === "dot")!;

describe("knocking on a client's door", () => {
  it("gives the full opening on the first knock", () => {
    expect(doorLines(dot, 0, false, vars)).toEqual(dot.opening);
  });

  it("never says the same thing twice running on return visits", () => {
    for (const q of quests)
      for (const helped of [false, true])
        for (let k = 1; k < 12; k++) expect(doorLines(q, k, helped, vars)).not.toEqual(doorLines(q, k + 1, helped, vars));
  });

  it("says how things turned out once you've helped", () => {
    const seen = new Set([0, 1, 2].map((k) => doorLines(dot, k, true, vars).join(" ")));
    expect(seen.size).toBe(dot.returns.after.length);
  });

  it("fills in the player's name and the time of day", () => {
    expect(fillLine("Good {time}, {name}!", vars)).toBe("Good morning, Sam!");
    expect(fillLine("Hi {nobody}", vars)).toBe("Hi {nobody}");
    for (const q of quests) for (let k = 0; k < 6; k++) for (const helped of [false, true]) expect(doorLines(q, k, helped, vars).join(" ")).not.toMatch(/\{\w+\}/);
  });

  it("knows morning from afternoon and evening", () => {
    expect(timeOfDay(new Date(2026, 0, 1, 9))).toBe("morning");
    expect(timeOfDay(new Date(2026, 0, 1, 14))).toBe("afternoon");
    expect(timeOfDay(new Date(2026, 0, 1, 19))).toBe("evening");
  });
});
