import type { Story } from "@/content/stories";
import { plainText } from "./richText";

/*
  A news story's voiced introduction script, drafted from the story itself (the owner, Nov 2026: every story gets one).
  Rules, not a model: the standfirst, the opening of the story, and what its sections cover, to about 90 words in the
  Magazine Editorial Voice's register. The author edits it and records it in the News editor; nothing is recorded or
  played until they do and approve it.
*/

const MAX_WORDS = 95;
const sentences = (text: string) =>
  plainText(text)
    .replace(/\s+/g, " ")
    .trim()
    .split(/(?<=[.!?])\s+(?=[A-Z“"'])/)
    .filter(Boolean);
const lowerFirst = (s: string) => (/^[A-Z][a-z]/.test(s) ? s[0].toLowerCase() + s.slice(1) : s);
const words = (s: string) => s.split(/\s+/).filter(Boolean).length;

export function draftStoryScript(story: Pick<Story, "title" | "dek" | "body">): string {
  const parts: string[] = [];
  const add = (s: string) => {
    const t = s.trim();
    if (t && words([...parts, t].join(" ")) <= MAX_WORDS) parts.push(/[.!?]$/.test(t) ? t : `${t}.`);
  };
  for (const s of sentences(story.dek ?? "")) add(s);
  const opening = story.body.find((b) => b.type === "p");
  if (opening && opening.type === "p") for (const s of sentences(opening.text).slice(0, 2)) add(s);
  const sections = story.body.flatMap((b) => (b.type === "h2" ? [lowerFirst(plainText(b.text).trim())] : [])).slice(0, 4);
  if (sections.length > 1) add(`In this story: ${sections.slice(0, -1).join(", ")} and ${sections.at(-1)}`);
  return parts.join(" ") || story.title;
}
