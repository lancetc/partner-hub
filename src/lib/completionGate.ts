import type { Card } from "@/content/lessons";

/*
  "Required completion": what a learner still has to do on a card before Continue (or a swipe)
  moves them on. Returns the hint to show, or null when they're free to go.

  Audio holds learners on every card by default, so nobody swipes past narration half heard;
  a lesson can turn that off (`holdForAudio: false`). Video and activities only hold when the
  card is marked Required completion.
*/
export function completionGate(
  node: Card,
  ctx: {
    answers: Record<string, unknown>;
    /** Cards already finished: media ended, timer passed, or moved on from before. */
    finished: Set<string>;
    /** Review mode or an author preview: never locked. */
    exempt: boolean;
    /** The card's narration, if it has one: whether it can play, and where it's up to. */
    narration: { playable: boolean; state: string } | null;
    /** True when the card has a spoken script (not a transcript-only video). */
    speaks: boolean;
    /** The lesson's "hold until the audio finishes" setting (on unless turned off). */
    holdForAudio?: boolean;
  },
): string | null {
  if (ctx.exempt || ctx.finished.has(node.id) || ctx.answers[`done:${node.id}`]) return null;
  if (node.requireComplete) {
    const v = node.visual;
    if ((node.type === "presenter" && v.kind === "presenter" && v.video) || node.bubbles?.length) return "Watch the video to continue";
    if (
      node.type === "response" &&
      String(ctx.answers[node.id] ?? "")
        .trim()
        .split(/\s+/)
        .filter(Boolean).length < 3
    )
      return "Write your answer to continue";
    if (node.type === "calculator" && ctx.answers[node.id] === undefined) return "Try the calculator to continue";
  }
  // Cards you answer (quiz, decision, poll, rating, wall) already hold you until you answer; with
  // audio on hold, they also wait for their question to be read out.
  const answerCard = ["quiz", "decision", "poll", "rating", "wall"].includes(node.type);
  if (!(ctx.holdForAudio !== false || (node.requireComplete && !answerCard))) return null;
  // If the audio can't play at all, don't trap anyone.
  if (ctx.speaks && ctx.narration?.playable !== false && ctx.narration?.state !== "ended") return "Listen to the end to continue";
  return null;
}
