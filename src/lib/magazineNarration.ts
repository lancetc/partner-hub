import type { GuideAudio, GuideDoc, Narration, NarrationLength, NarrationSnapshot, Page } from "./magazine";

/*
  The Magazine Audio Guide (docs/magazine-audio-guide.md): a short spoken introduction to the course
  and to each page, drafted by Claude from the content, approved by the author, recorded with ElevenLabs.
  These are the rules both the editor and the server use: how long a script should be, whether a script
  gives away an answer, and whether a narration is still current for the page it introduces.
*/

export const NARRATION_LENGTHS: Record<NarrationLength, { label: string; seconds: string; min: number; max: number }> = {
  short: { label: "Short", seconds: "15–20 seconds", min: 35, max: 50 },
  standard: { label: "Standard", seconds: "20–30 seconds", min: 50, max: 75 },
  extended: { label: "Extended", seconds: "30–45 seconds", min: 75, max: 110 },
};

export const DEFAULT_AUDIO: GuideAudio = {
  levels: { course: true, pages: true, blocks: false },
  voice: { kind: "topic" },
  length: "standard",
  playback: "auto",
};
export const audioOf = (doc: GuideDoc): GuideAudio => doc.audio ?? DEFAULT_AUDIO;

const WORD = /[\p{L}\p{N}’']+/gu;
export const wordCount = (s: string) => s.match(WORD)?.length ?? 0;
/** About 150 words a minute, the pace of the hub's narrator. */
export const secondsFor = (words: number) => Math.max(1, Math.round(words / 2.5));
export const formatSeconds = (s: number) => `${Math.floor(s / 60)}:${String(Math.round(s % 60)).padStart(2, "0")}`;

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

// ---------------------------------------------------------------------------------------------
// Freshness: what a page said when its script was approved, and whether it has moved on since
// ---------------------------------------------------------------------------------------------

/** Fields that aren't reading content: ids, files, layout and reviewer notes. */
const NOT_CONTENT = new Set([
  "id",
  "type",
  "src",
  "poster",
  "captions",
  "href",
  "layout",
  "width",
  "reveal",
  "style",
  "placement",
  "group",
  "next",
  "compareWith",
  "note",
  "evidence",
  "flag",
  "alt",
  "decorative",
  "embed",
  "trim",
  "recording",
  "enlarge",
  "level",
  "wrap",
  "mediaStyle",
  "pathId",
  "narration",
]);
function strings(v: unknown, out: string[]) {
  if (typeof v === "string") out.push(v);
  else if (Array.isArray(v)) v.forEach((x) => strings(x, out));
  else if (v && typeof v === "object") for (const [k, x] of Object.entries(v)) if (!NOT_CONTENT.has(k)) strings(x, out);
}
/** Blocks an introduction leans on: a changed question can make a hook wrong or a spoiler. */
const KEY_BLOCKS = new Set(["decision", "quiz", "branching", "conversation", "spot"]);
const SIG_SIZE = 24;

/** A rough fingerprint of the words (MinHash over three-word runs): similar pages give similar fingerprints. */
function signature(text: string) {
  const words = (text.toLowerCase().match(WORD) ?? []) as string[];
  const shingles = words.length < 3 ? [words.join(" ")] : words.slice(2).map((_, i) => `${words[i]} ${words[i + 1]} ${words[i + 2]}`);
  return Array.from({ length: SIG_SIZE }, (_, k) => shingles.reduce((m, sh) => Math.min(m, fnv(sh, 0x811c9dc5 ^ Math.imul(k + 1, 0x9e3779b1))), 0xffffffff));
}
const similarity = (a: number[], b: number[]) => (a.length && a.length === b.length ? a.filter((x, i) => x === b[i]).length / a.length : 0);

/** What a page says now, for comparing with when its script was approved. */
export function pageSnapshot(page: Page): NarrationSnapshot {
  const all: string[] = [page.title, page.purpose];
  const key: string[] = [page.title, page.purpose];
  for (const s of page.sections)
    for (const b of s.blocks) {
      strings(b, all);
      if (KEY_BLOCKS.has(b.type)) strings(b, key);
    }
  const text = all.join(" ");
  return { hash: textHash(text), key: textHash(key.join("|")), sig: signature(text) };
}
/** What the course introduction rests on: the title, the promise, and the pages in order. Any change asks for a look. */
export function introSnapshot(title: string, standfirst: string, doc: GuideDoc): NarrationSnapshot {
  const text = [title, standfirst, ...doc.pages.map((p) => `${p.title} ${p.purpose}`)].join("|");
  return { hash: textHash(text), key: textHash(text), sig: signature(text) };
}
/**
  Changed enough that the narration should be looked at again: the title, purpose or a question changed,
  or about a fifth or more of the words did. Small edits don't ask.
*/
export const substantiallyChanged = (then: NarrationSnapshot, now: NarrationSnapshot) =>
  then.key !== now.key || (then.hash !== now.hash && similarity(then.sig, now.sig) < 0.75);

export type NarrationState = "none" | "draft" | "unrecorded" | "rerecord" | "review" | "current";
export const NARRATION_STATES: Record<NarrationState, { label: string; tone: "good" | "warn" | "bad" | "neutral" }> = {
  none: { label: "No narration", tone: "neutral" },
  draft: { label: "Script to approve", tone: "neutral" },
  unrecorded: { label: "Approved, to record", tone: "neutral" },
  rerecord: { label: "Record again", tone: "bad" },
  review: { label: "May be out of date", tone: "warn" },
  current: { label: "Narrated", tone: "good" },
};

/** Which voice a recording was made with: "topic" for the hub's Topic narrator, else the ElevenLabs voice id. */
export const voiceKey = (a: GuideAudio) => (a.voice.kind === "topic" ? "topic" : a.voice.kind === "openai" ? `openai:${a.voice.voice}` : a.voice.voiceId);

export function narrationState(n: Narration | undefined, now: NarrationSnapshot, audio: GuideAudio): NarrationState {
  if (!n || !n.script.trim()) return "none";
  if (n.status === "draft") return "draft";
  if (n.audio && (n.audio.scriptHash !== textHash(n.script) || n.audio.voice !== voiceKey(audio))) return "rerecord";
  if (n.basis && substantiallyChanged(n.basis, now)) return "review";
  return n.audio ? "current" : "unrecorded";
}

/** Learners hear it: approved and recorded from these exact words (it may still be awaiting the author's review). */
export const playable = (n: Narration | undefined, audio: GuideAudio): n is Narration & { audio: NonNullable<Narration["audio"]> } =>
  Boolean(n && n.status === "approved" && n.audio && n.audio.scriptHash === textHash(n.script) && n.audio.voice === voiceKey(audio));

// ---------------------------------------------------------------------------------------------
// Checks on a script
// ---------------------------------------------------------------------------------------------

/** The answers on a page an introduction must never give away. */
export function answersOn(page: Page): string[] {
  const out: string[] = [];
  for (const s of page.sections)
    for (const b of s.blocks) {
      if (b.type === "decision") b.choices.filter((c) => c.verdict === "best").forEach((c) => out.push(c.text, c.feedback));
      if (b.type === "conversation") b.turns.forEach((t) => t.responses.filter((r) => r.verdict === "best").forEach((r) => out.push(r.text, r.feedback)));
      if (b.type === "branching") b.scenes.forEach((sc) => sc.ending?.outcome === "good" && out.push(sc.ending.summary));
      if (b.type === "fillblank") out.push(b.text);
    }
  return out.filter(Boolean);
}

const norm = (s: string) => (s.toLowerCase().match(WORD) ?? []) as string[];
/** The longest run of words a script shares with an answer, if it's 8 words or more: a give-away. */
export function spoilerIn(script: string, answers: string[]): string | null {
  const words = norm(script);
  const N = 8;
  if (words.length < N) return null;
  const runs = new Set<string>();
  for (const a of answers) {
    const w = norm(a);
    for (let i = 0; i + N <= w.length; i++) runs.add(w.slice(i, i + N).join(" "));
  }
  for (let i = 0; i + N <= words.length; i++) {
    const run = words.slice(i, i + N).join(" ");
    if (runs.has(run)) return run;
  }
  return null;
}

const FIGURE =
  /\$\s?\d|\b\d+(\.\d+)?\s?(%|per ?cent)|\b(19|20)\d{2}\b|\b\d{1,2}(st|nd|rd|th)?\s+(January|February|March|April|May|June|July|August|September|October|November|December)\b/i;

/** Warnings for the author on a script: too long or short, a figure to confirm, a give-away. */
export function scriptWarnings(script: string, length: NarrationLength, answers: string[]): string[] {
  const out: string[] = [];
  const n = wordCount(script);
  const { min, max } = NARRATION_LENGTHS[length];
  if (n < Math.floor(min * 0.9)) out.push(`Short for the length chosen: ${n} words (aim for ${min} to ${max}).`);
  if (n > Math.ceil(max * 1.1)) out.push(`Long for the length chosen: ${n} words (aim for ${min} to ${max}).`);
  if (FIGURE.test(script)) out.push("It mentions a figure or date: check it’s right, or leave it to the page.");
  const spoiler = spoilerIn(script, answers);
  if (spoiler) out.push(`It may give away an answer (“…${spoiler}…”).`);
  return out;
}
