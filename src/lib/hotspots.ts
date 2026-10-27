import type { Card } from "@/content/lessons";

/** How many spots learners need to find before Continue unlocks: the author's number, or all of them. */
export const hotspotsNeeded = (card: Pick<Extract<Card, { type: "hotspot" }>, "spots" | "required">) =>
  Math.min(card.spots.length, Math.max(1, card.required ?? card.spots.length));
