import type { Block, GuideBlock, GuideDoc } from "./magazine";
import { textHash } from "./magazineNarration";

/*
  The AI Learning Guide (docs/ai-learning-guide.md): one recognisable, openly AI-generated guide who appears
  at purposeful moments. Every appearance is a recorded, scripted asset: the script is the thing that's
  written, reviewed and approved; the video or audio is made from it and must match it.

  A learner only ever gets media that was made from the approved script and has been watched through by a
  person. Anything else falls back to the script as text, so the page always works.
*/

export const GUIDE_MODES = {
  transmission: { label: "Transmission", hint: "The guide’s face in the full digital frame: a course opening or a major case setup.", needs: "video" },
  inset: { label: "Guide inset", hint: "A smaller video beside related text: a short explanation or feedback.", needs: "video" },
  voice: { label: "Voice over context", hint: "The guide’s voice over a picture or document that’s more useful to look at. No face.", needs: "audio" },
} as const;
export type GuideMode = keyof typeof GUIDE_MODES;

/** What the guide is doing here. It teaches by doing one of these, never by reading the page aloud. */
export const GUIDE_PURPOSES = {
  scene: "Set the scene",
  attention: "Direct attention",
  question: "Ask a question",
  consequence: "Explain a consequence",
  bridge: "Bridge to the next step",
} as const;
export type GuidePurpose = keyof typeof GUIDE_PURPOSES;

export const DEFAULT_GUIDE_INTRO = "Meet {name}, your AI learning guide. These are recorded, scripted lessons reviewed by Trilogy Care.";
/** The guide's identity, the same across the Hub. `name` may be empty: the label then reads "AI Learning Guide" alone. */
export type GuideIdentity = { name: string; intro: string; portrait: string | null };

const norm = (s: string) => s.trim().replace(/\s+/g, " ");
/** A script's fingerprint: media is made from exactly these words, and is out of date when they change. */
export const guideScriptHash = (script: string) => textHash(norm(script));
export const guideWords = (script: string) => norm(script).split(" ").filter(Boolean).length;
/** About how long it takes to say, at a measured pace. */
export const guideSeconds = (script: string) => Math.round((guideWords(script) / 150) * 60);

/**
  Where a guide segment is. Draft: the script isn't approved (or changed since). Approved: the script is,
  with no media yet. Stale: there's media, but it was made from other words. Ready: media matches the
  script and is waiting to be watched through. Checked: it has been, and (for video) has captions.
*/
export type GuideState = "draft" | "approved" | "stale" | "ready" | "checked";
export const GUIDE_STATES: Record<GuideState, { label: string; tone: "neutral" | "info" | "bad" | "warn" | "good" }> = {
  draft: { label: "Draft script", tone: "neutral" },
  approved: { label: "Script approved", tone: "info" },
  stale: { label: "Media out of date", tone: "bad" },
  ready: { label: "Media ready: check it", tone: "warn" },
  checked: { label: "Media checked", tone: "good" },
};
export const GUIDE_STEPS = ["Draft", "Script approved", "Media ready", "Media checked", "Published"] as const;

export function guideState(b: GuideBlock): GuideState {
  const hash = guideScriptHash(b.script);
  if (!b.script.trim() || b.status !== "approved" || b.approved?.hash !== hash) return "draft";
  if (!b.media?.src) return "approved";
  if (b.media.scriptHash !== hash) return "stale";
  if (!b.media.checked || (b.media.kind === "video" && !b.media.captions)) return "ready";
  return "checked";
}
/** How far along it is, for the editor's steps (0 to 3; "Published" is the edition, not the block). */
export const guideStep = (b: GuideBlock) => ({ draft: 0, approved: 1, stale: 1, ready: 2, checked: 3 })[guideState(b)];

/** Learners get its media: made from the approved script, watched through, captioned. Otherwise they get the script as text. */
export const guidePlayable = (b: GuideBlock) => guideState(b) === "checked";

/** Words that claim something the guide can't have done: it's a recording of a script, not a practitioner. */
const FIRST_HAND =
  /\b(i('ve| have) (cared|worked|nursed|looked after|seen clients)|when i (was|worked) (a|as|at|in)|in my (years|time|experience) (as|at|of)|my (clients?|patients?)|as a (nurse|clinician|coordinator|carer), i)\b/i;

/**
  A guide block's own checks. `blocks`: stops publishing (an unapproved script, media that doesn't match it
  or hasn't been checked, a video without captions). Otherwise a suggestion.
*/
export function guideChecks(b: GuideBlock, doc: GuideDoc): { text: string; blocks: boolean }[] {
  const out: { text: string; blocks: boolean }[] = [];
  const state = guideState(b);
  const m = b.media;
  const needs = GUIDE_MODES[b.mode].needs;
  if (!b.script.trim()) out.push({ text: "write the guide’s script.", blocks: true });
  else if (state === "draft")
    out.push({ text: b.approved ? "the script changed after it was approved. Approve it again." : "the script isn’t approved yet.", blocks: true });
  if (state === "approved") out.push({ text: `upload the ${needs} made from the approved script, or remove the guide from this page.`, blocks: true });
  if (state === "stale")
    out.push({ text: "the video or audio was made from an earlier script. Make it again from the approved script, then check it.", blocks: true });
  if (m?.src && m.kind !== needs && state !== "stale")
    out.push({
      text: `${GUIDE_MODES[b.mode].label} needs ${needs === "video" ? "a video" : "an audio recording"}, not ${m.kind === "video" ? "a video" : "audio"}.`,
      blocks: true,
    });
  if (state === "ready" && m) {
    if (m.kind === "video" && !m.captions) out.push({ text: "add a captions file for the video.", blocks: true });
    if (!m.checked) out.push({ text: "watch the whole recording against the script, then mark it checked.", blocks: true });
  }
  if (b.after) {
    const other = allOf(doc).find((x) => x.id === b.after);
    if (!other || other.type !== "decision")
      out.push({ text: "the decision it gives feedback on isn’t there any more. Choose another, or show it on its own.", blocks: true });
  }
  if (b.mode === "voice" && !b.context?.src) out.push({ text: "Voice over context needs the picture or document the voice is about.", blocks: true });
  if (b.context?.src && !b.context.decorative && !b.context.alt) out.push({ text: "describe the picture for screen readers.", blocks: true });
  // Suggestions: editorial guidance, never a hard limit.
  const secs = guideSeconds(b.script);
  if (secs > (b.mode === "transmission" ? 75 : 60))
    out.push({ text: `about ${secs} seconds of talking is long for one segment. Split it, or leave some to the page.`, blocks: false });
  if (FIRST_HAND.test(b.script))
    out.push({
      text: "the script reads as first-hand experience. The guide is a recording of a script: it hasn’t cared for clients or worked at Trilogy Care.",
      blocks: false,
    });
  if (!b.source) out.push({ text: "link the source the script’s facts come from.", blocks: false });
  if (!b.owner) out.push({ text: "name the script’s owner.", blocks: false });
  if (m?.kind === "video" && !m.poster) out.push({ text: "add a poster frame showing the guide, for before it’s played.", blocks: false });
  return out;
}

const allOf = (doc: GuideDoc): Block[] => doc.pages.flatMap((p) => p.sections.flatMap((s) => s.blocks));

/** Every guide segment in a course, with where it is: for the review of everywhere the guide is used. */
export function guideUsesIn(doc: GuideDoc) {
  const out: { block: GuideBlock; pageId: string; pageTitle: string }[] = [];
  doc.pages.forEach((p, i) => {
    for (const s of p.sections) for (const b of s.blocks) if (b.type === "guide") out.push({ block: b, pageId: p.id, pageTitle: p.title || `Page ${i + 1}` });
  });
  return out;
}
