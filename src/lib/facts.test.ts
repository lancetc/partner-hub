import { describe, expect, it } from "vitest";
import { applyFacts, factsUsed, tokenFor, validFactKey, volatileIn } from "./facts";
import type { Lesson } from "@/content/lessons";

/* Shared facts: written once as {{key}}, shown to learners as the current value. */

const lesson = {
  slug: "x",
  title: "Rates",
  nodes: { a: { id: "a", type: "image", heading: "The rate is {{hourly_rate}}", body: "From {{ start_date }}, call {{unknown_fact}}" } },
} as unknown as Lesson;

describe("facts", () => {
  it("fills in known facts and leaves unknown ones so they're easy to spot", () => {
    const out = applyFacts(lesson, { hourly_rate: "$82.40", start_date: "1 July 2027" });
    const a = out.nodes.a as unknown as { heading: string; body: string };
    expect(a.heading).toBe("The rate is $82.40");
    expect(a.body).toBe("From 1 July 2027, call {{unknown_fact}}");
    expect((lesson.nodes.a as unknown as { heading: string }).heading).toContain("{{hourly_rate}}");
  });

  it("lists the facts a lesson or card uses", () => {
    expect(factsUsed(lesson).sort()).toEqual(["hourly_rate", "start_date", "unknown_fact"]);
    expect(factsUsed({ body: "No facts here" })).toEqual([]);
  });

  it("checks fact codes", () => {
    expect(validFactKey("hourly_rate")).toBe(true);
    expect(validFactKey("Hourly rate")).toBe(false);
    expect(validFactKey("1rate")).toBe(false);
    expect(tokenFor("hourly_rate")).toBe("{{hourly_rate}}");
  });

  it("spots text likely to go out of date, but not facts", () => {
    expect(volatileIn("It costs $80 an hour")).toEqual(["a dollar amount"]);
    expect(volatileIn("Up 3.5% from 1 November 2025")).toEqual(["a percentage", "a date"]);
    expect(volatileIn("Under the Aged Care Act 2024")).toEqual(["a date", "a law or rule"]);
    expect(volatileIn("It costs {{hourly_rate}} an hour")).toEqual([]);
    expect(volatileIn("Be kind and listen")).toEqual([]);
  });
});
