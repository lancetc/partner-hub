import type { Lesson } from "@/content/lessons";

/*
  Shared facts in lesson text. A card says "the rate is {{example_rate}} an hour"; learners see the
  fact's current value. Change the fact once and every lesson using it changes with it.
*/

export const FACT_TOKEN = /\{\{\s*([a-z0-9_]+)\s*\}\}/g;
export const validFactKey = (key: string) => /^[a-z][a-z0-9_]{1,39}$/.test(key);
export const tokenFor = (key: string) => `{{${key}}}`;

function walk(value: unknown, visit: (s: string) => string): unknown {
  if (typeof value === "string") return value.includes("{{") ? visit(value) : value;
  if (Array.isArray(value)) return value.map((v) => walk(v, visit));
  if (value && typeof value === "object") return Object.fromEntries(Object.entries(value).map(([k, v]) => [k, walk(v, visit)]));
  return value;
}

/** The lesson with each {{fact}} replaced by its value. Unknown facts are left as they are, so they're easy to spot. */
export function applyFacts<T extends Lesson>(lesson: T, values: Record<string, string>): T {
  return walk(lesson, (s) => s.replace(FACT_TOKEN, (m, key: string) => values[key] ?? m)) as T;
}

/** Which facts a lesson (or one card) uses. */
export function factsUsed(value: unknown): string[] {
  const keys = new Set<string>();
  walk(value, (s) => {
    for (const m of s.matchAll(FACT_TOKEN)) keys.add(m[1]);
    return s;
  });
  return [...keys];
}

/*
  Text that tends to go out of date: dollar amounts, percentages, dates and years, and named laws.
  Used to suggest adding a check date or turning the value into a shared fact.
*/
const VOLATILE: { label: string; re: RegExp }[] = [
  { label: "a dollar amount", re: /\$\s?\d[\d,]*(\.\d+)?/ },
  { label: "a percentage", re: /\b\d+(\.\d+)?\s?%/ },
  {
    label: "a date",
    re: /\b\d{1,2}\s(January|February|March|April|May|June|July|August|September|October|November|December)(\s\d{4})?\b|\b(19|20)\d{2}\b/,
  },
  { label: "a law or rule", re: /\b(Act|Rules|Regulations?|Standards?)\s(19|20)\d{2}\b/ },
];

/** What in this text might go out of date, e.g. ["a dollar amount"]. Facts ({{…}}) don't count: they're kept up to date. */
export function volatileIn(text: string): string[] {
  const plain = text.replace(FACT_TOKEN, "");
  return VOLATILE.filter((v) => v.re.test(plain)).map((v) => v.label);
}
