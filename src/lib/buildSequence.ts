/*
  The order every generated topic is built in: Hook, Show, Explain, Choose, Feedback, Apply, Recap.
  Claude writes the cards in this order and tags each with its stage, so the author can watch the
  build happen stage by stage and see afterwards which cards do which job.
*/

export const BUILD_STAGES = [
  {
    key: "hook",
    label: "Hook",
    makes: "Video presenter",
    purpose: "Ava, the AI presenter, opens with a relatable moment and why it matters.",
    types: ["presenter"],
  },
  { key: "show", label: "Show", makes: "The situation", purpose: "A realistic, fictional situation the learner can picture.", types: ["image"] },
  { key: "explain", label: "Explain", makes: "Teaching cards", purpose: "The key ideas: short on screen, with the detail in the narration.", types: ["image"] },
  { key: "choose", label: "Choose", makes: "Decision", purpose: "The learner makes the call in the situation.", types: ["decision"] },
  {
    key: "feedback",
    label: "Feedback",
    makes: "Consequences",
    purpose: "What happens after each choice, with a way to try again, and what good looked like.",
    types: ["image"],
  },
  {
    key: "apply",
    label: "Apply",
    makes: "Quick check and your turn",
    purpose: "A quiz on the key ideas, then a short answer about their own work, with an example to compare.",
    types: ["quiz", "response"],
  },
  { key: "recap", label: "Recap", makes: "Summary", purpose: "Two to four points to remember, and one action to take.", types: ["summary"] },
] as const;

export type BuildStage = (typeof BUILD_STAGES)[number]["key"];
export const STAGE_KEYS = BUILD_STAGES.map((s) => s.key) as BuildStage[];
export const isStage = (v: unknown): v is BuildStage => typeof v === "string" && (STAGE_KEYS as string[]).includes(v);

/** How many cards of each stage appear in Claude's reply so far (it may be partway through writing). */
export function stageCounts(text: string) {
  const counts = Object.fromEntries(STAGE_KEYS.map((k) => [k, 0])) as Record<BuildStage, number>;
  for (const m of text.matchAll(/"stage"\s*:\s*"([a-z]+)"/g)) if (isStage(m[1])) counts[m[1]]++;
  return counts;
}

/** A topic's cards grouped by stage, in build order. Cards without a stage (written by hand) are left out. */
export function cardsByStage<C extends { id: string; stage?: string; heading?: string; type: string }>(cards: C[]) {
  return BUILD_STAGES.map((s) => ({ ...s, cards: cards.filter((c) => c.stage === s.key) }));
}

/** The steps Claude works through to draft a learning path. */
export const PATH_STEPS = [
  { key: "who", label: "Who it’s for", makes: "Name and overview", purpose: "The path’s name, what it covers, and who it’s for." },
  {
    key: "outcomes",
    label: "Outcomes",
    makes: "What they’ll be able to do",
    purpose: "Three to six things people can do by the end, each starting with a verb.",
  },
  {
    key: "chapters",
    label: "Chapters and topics",
    makes: "The path, in order",
    purpose: "Chapters in a sensible order, each using your existing topics where they fit, and naming any new topics to write.",
  },
] as const;

/** The steps Claude works through to draft a challenge. */
export const CHALLENGE_STEPS = [
  { key: "theme", label: "Theme", makes: "Name and tagline", purpose: "A name and a one-line tagline that make people want to join in." },
  { key: "story", label: "Story", makes: "The week’s story", purpose: "Who’s involved and what’s going on, told across the days." },
  {
    key: "missions",
    label: "Daily missions",
    makes: "A topic and a beat each day",
    purpose: "One topic a day, from your topics where they fit, with a line of story that leads into it.",
  },
] as const;
