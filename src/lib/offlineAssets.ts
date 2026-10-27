import type { Lesson } from "@/content/lessons";

/*
  What a lesson needs to work offline: its pictures, uploaded files and PDFs, and its narration
  audio. Videos are left out (large, and YouTube or Synthesia can't be saved anyway).
*/

const LOCAL = /^\/(images|api\/uploads|brand)\//;
const VIDEO = /\.(webm|mp4|mov)$/i;

function strings(value: unknown, out: Set<string>) {
  if (typeof value === "string") {
    if (LOCAL.test(value) && !VIDEO.test(value)) out.add(value);
  } else if (Array.isArray(value)) value.forEach((v) => strings(v, out));
  else if (value && typeof value === "object") Object.values(value).forEach((v) => strings(v, out));
}

/** The narration address the player uses for a card (must match components/player/Narration.tsx). */
export const narrationUrl = (slug: string, cardId: string) => `/api/tts?key=${encodeURIComponent(`lesson:${slug}:${cardId}`)}`;
/** When each word is spoken, for following the narration word by word. */
export const timingsUrl = (slug: string, cardId: string) => `${narrationUrl(slug, cardId)}&timings=1`;

export function lessonAssets(lesson: Lesson) {
  const media = new Set<string>();
  strings(lesson, media);
  const narration: string[] = [];
  for (const node of Object.values(lesson.nodes)) {
    // A recorded voice file is already in `media`.
    if (node.audioSrc) continue;
    const spoken =
      node.type === "presenter"
        ? node.visual.kind === "presenter" && node.visual.video
          ? ""
          : node.transcript
        : node.type === "audio" || node.type === "listen"
          ? node.script
          : node.narration;
    if (spoken?.trim()) narration.push(narrationUrl(lesson.slug, node.id), timingsUrl(lesson.slug, node.id));
  }
  return { media: [...media], narration };
}
