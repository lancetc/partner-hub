/*
  A small, provider-neutral media module (Topic Video Introductions, Nov 2026; docs/topic-video-introductions.md).

  The Magazine's Audio Introductions (lib/magazineNarration.ts) and the Topics' Video Introductions (lib/topicIntro.ts)
  share the same ideas: a script drafted by AI and approved by an author, media made from it by a provider, a production
  status, an outdated flag when the content it introduces moves on, and a published version that stays until its
  replacement is approved. The helpers here are the parts that don't depend on either feature. They copy the Magazine's
  word count, timing and fingerprint rules exactly (that file is being worked on, so it isn't imported or edited).

  FOR LATER CONVERGENCE (the proposed Partner Hub Media Studio): lib/magazineNarration.ts can import wordCount,
  secondsFor, textHash, fingerprint and materiallyChanged from here and drop its own copies; MEDIA_STATUSES is the shared
  vocabulary both features map their own states onto.
*/

const WORD = /[\p{L}\p{N}’']+/gu;
export const wordCount = (s: string) => s.match(WORD)?.length ?? 0;
/** About 150 words a minute, the pace the Hub's narrators and presenters speak at. */
export const secondsFor = (words: number) => Math.max(1, Math.round(words / 2.5));
export const formatSeconds = (s: number) => {
  const t = Math.max(0, Math.round(s));
  return `${Math.floor(t / 60)}:${String(t % 60).padStart(2, "0")}`;
};

/** A 32-bit FNV-1a hash, seeded: the same in the browser and on the server. */
function fnv(s: string, seed = 0x811c9dc5) {
  let h = seed >>> 0;
  for (let i = 0; i < s.length; i++) {
    h ^= s.charCodeAt(i);
    h = Math.imul(h, 0x01000193) >>> 0;
  }
  return h >>> 0;
}
export const textHash = (s: string) => fnv(s).toString(36) + fnv(s, 0x9747b28c).toString(36);

/** What some content said at a moment: an exact hash, a hash of the parts that matter most, and a rough fingerprint. */
export type ContentSnapshot = { hash: string; key: string; sig: number[] };

const SIG_SIZE = 24;
/** A rough fingerprint of the words (MinHash over three-word runs): similar text gives similar fingerprints. */
export function fingerprint(text: string) {
  const words = (text.toLowerCase().match(WORD) ?? []) as string[];
  const shingles = words.length < 3 ? [words.join(" ")] : words.slice(2).map((_, i) => `${words[i]} ${words[i + 1]} ${words[i + 2]}`);
  return Array.from({ length: SIG_SIZE }, (_, k) => shingles.reduce((m, sh) => Math.min(m, fnv(sh, 0x811c9dc5 ^ Math.imul(k + 1, 0x9e3779b1))), 0xffffffff));
}
const similarity = (a: number[], b: number[]) => (a.length && a.length === b.length ? a.filter((x, i) => x === b[i]).length / a.length : 0);

/** A snapshot of `text`, with `key` for the parts whose change always matters (a title, a question). */
export const snapshotOf = (text: string, key: string): ContentSnapshot => ({ hash: textHash(text), key: textHash(key), sig: fingerprint(text) });

/** Changed enough to look at again: the key parts changed, or about a quarter or more of the words did. Small edits don't count. */
export const materiallyChanged = (then: ContentSnapshot, now: ContentSnapshot) =>
  then.key !== now.key || (then.hash !== now.hash && similarity(then.sig, now.sig) < 0.75);

/** Who makes a piece of media. "upload" is a file made elsewhere and uploaded by an author. */
export type MediaProvider = "synthesia" | "elevenlabs" | "openai" | "upload" | "youtube" | "none";

/**
  The shared production vocabulary. The Magazine's narration states and the Topic introduction statuses both map onto it:
  needs a script, script to approve, approved with no media yet, queued, being made, made and waiting for approval, live,
  to look at again (the content moved on), or failed.
*/
export const MEDIA_STATUSES = [
  "needs_script",
  "script_draft",
  "script_approved",
  "queued",
  "making",
  "made",
  "awaiting_approval",
  "live",
  "review",
  "failed",
] as const;
export type MediaStatus = (typeof MEDIA_STATUSES)[number];

export const formatUsd = (usd: number) => (usd < 0.01 ? "under US$0.01" : `about US$${usd.toFixed(2)}`);
