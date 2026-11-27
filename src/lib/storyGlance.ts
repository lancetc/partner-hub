import type { CategoryId, Story } from "@/content/stories";
import type { NarrationAudio } from "./magazine";
import { textHash } from "./magazineNarration";
import { plainText } from "./richText";

/*
  "At a glance" and "Put it into practice" on a news story (the owner, Nov 2026). An editorial summary of three to five
  takeaways under the hero, and an optional short list of things to try, both written with the story and stored with it,
  never made up on view. Claude drafts them from the story alone; an author checks, edits, reorders and turns them on.

  Each is stamped with the story it was checked against (`basis`). When the story's words change afterwards, the editor
  flags the summary and actions for another look, and the News list shows "Summary to check".
*/

export type GlancePoint = {
  /** A short title for the takeaway, a few words, shown in bold above it. */
  title?: string;
  text: string;
  /** The words in the story that support the point, so an author can check it. Never shown to learners. */
  from?: string;
};

export type StoryGlance = {
  /** Shown to learners. Proposed summaries arrive switched off, for an author to review. */
  enabled: boolean;
  points: GlancePoint[];
  /** The story's text it was written or last checked against (storyBasis). */
  basis: string;
  /** Drafted by Claude and not yet reviewed by an author. */
  proposed?: boolean;
  /** A reading of the takeaways in the Magazine Editorial Voice. Never plays by itself. */
  audio?: NarrationAudio;
  audioApproved?: boolean;
};

export type PracticeItem = {
  id: string;
  text: string;
  /** A Hub page that helps: a topic, a resource or a Work Tool. */
  href?: string;
  label?: string;
};

export type StoryPractice = {
  enabled: boolean;
  items: PracticeItem[];
  /** Learners can tick each one off; their ticks are kept for them alone. */
  checklist: boolean;
  basis: string;
  proposed?: boolean;
};

export const GLANCE_MIN = 3;
export const GLANCE_MAX = 5;
export const PRACTICE_MAX = 5;

/** The story's own words, as the summary is checked against them. */
export function storyText(story: Pick<Story, "title" | "dek" | "body">) {
  return [
    story.title,
    story.dek,
    ...story.body.map((b) =>
      b.type === "list"
        ? b.items.map(plainText).join("\n")
        : b.type === "image"
          ? ""
          : b.type === "quote"
            ? `${plainText(b.text)} (${b.cite})`
            : plainText(b.text),
    ),
  ]
    .filter(Boolean)
    .join("\n")
    .replace(/[ \t]+/g, " ")
    .trim();
}

export const storyBasis = (story: Pick<Story, "title" | "dek" | "body">) => textHash(storyText(story));

/** True when the story has changed since the summary (or the actions) were written or last checked. */
export const needsReview = (part: { basis: string } | undefined, story: Pick<Story, "title" | "dek" | "body">) =>
  Boolean(part && part.basis !== storyBasis(story));

/** What the summary audio reads. */
export const glanceScript = (points: GlancePoint[]) =>
  ["At a glance.", ...points.flatMap((p) => [p.title?.trim() ?? "", p.text.trim()]).filter(Boolean)].map((s) => (/[.!?]$/.test(s) ? s : `${s}.`)).join(" ");

export const glanceAudioPlayable = (g: StoryGlance | undefined) =>
  Boolean(g?.audio && g.audioApproved && g.audio.scriptHash === textHash(glanceScript(g.points)));

/** How the summary is shaped for each kind of story. */
export const GLANCE_SHAPE: Record<CategoryId, { label: string; parts: string[] }> = {
  policy: { label: "Policy update", parts: ["what is changing", "who it affects", "when it takes effect", "what to do now"] },
  trilogy: { label: "Trilogy news", parts: ["what is new", "why it matters", "what it means for the reader"] },
  "case-study": { label: "Case study", parts: ["the situation", "what was done", "what changed as a result", "the lesson to take away"] },
  spotlight: { label: "Partner spotlight", parts: ["who they are", "what they do differently", "what others can learn"] },
  learning: { label: "Learning", parts: ["what it covers", "why it matters in practice", "how to start"] },
  industry: { label: "Industry", parts: ["what happened", "why it matters for home care", "what to watch for"] },
};

/** For matching a quoted passage against the story (and the story writer's draft): case, quotes, dashes and spacing don't count. */
export const squash = (s: string) =>
  s
    .toLowerCase()
    .replace(/[‘’`]/g, "'")
    .replace(/[“”]/g, '"')
    .replace(/[–—]/g, "-")
    .replace(/[^a-z0-9%$'"-]+/g, " ")
    .trim();
