import type { GuideAudio, GuideDoc, Narration, NarrationLength, NarrationSnapshot, Page } from "./magazine";

/*
  The Magazine Audio Guide and its Audio Introductions (docs/magazine-audio-guide.md): a short spoken introduction to
  the course and to each page, drafted by AI from the content, approved by the author, recorded in the Magazine
  Editorial Voice (or another voice), and approved again before learners hear it. These are the rules both the editor
  and the server use: how long a script should be, whether it gives away an answer, whether a narration is still
  current for the page it introduces, and how a replacement waits while the published one keeps playing.
*/

export const NARRATION_LENGTHS: Record<NarrationLength, { label: string; seconds: string; min: number; max: number }> = {
  // Magazine Audio Introductions (Nov 2026): 70 to 130 words, 30 to 60 seconds. A shorter one is fine where it suits the page.
  editorial: { label: "Editorial introduction", seconds: "30–60 seconds", min: 70, max: 130 },
  short: { label: "Short", seconds: "15–20 seconds", min: 35, max: 50 },
  standard: { label: "Standard", seconds: "20–30 seconds", min: 50, max: 75 },
  extended: { label: "Extended", seconds: "30–45 seconds", min: 75, max: 110 },
};

/*
  Voice profiles: a named voice with its delivery, independent of who speaks it. The Magazine Editorial Voice is
  OpenAI's Alloy, read with these delivery notes by the configured speech model (OPENAI_TTS_MODEL, gpt-4o-mini-tts by
  default; instructions need a gpt-4o model, so older tts-1 models read it plainly). Another provider or voice can be a
  new profile without touching the player or the editor.
*/
export type VoiceProfile = { id: "editorial"; name: string; provider: "openai"; voice: string; summary: string; instructions: string };
export const VOICE_PROFILES: Record<VoiceProfile["id"], VoiceProfile> = {
  editorial: {
    id: "editorial",
    name: "Magazine Editorial Voice",
    provider: "openai",
    voice: "alloy",
    summary: "Alloy: warm, calm and professionally confident, in conversational Australian English",
    instructions:
      "Voice: warm, approachable, calm and professionally confident. Accent: conversational Australian English. " +
      "Pacing: natural and unhurried, with short intentional pauses at the end of sentences and before a question. " +
      "Tone: engaging without sounding promotional, and respectful of an experienced adult audience who know their work. " +
      "Avoid: exaggerated enthusiasm, a salesy lift, or a conventional corporate-training delivery.",
  },
};

/**
  Delivery notes a voice profile can take on for one kind of introduction, while staying the same recognisable voice.
  "curious": the Discovery Exciter on a Discovery Path (docs/discovery-exciter.md), a little more exploratory.
*/
export const DELIVERY_NOTES = {
  curious:
    "Delivery for this introduction: slightly more curious and exploratory, as if opening a question with the listener and inviting them to find out, " +
    "while keeping the same warm, calm voice. Let the questions breathe.",
} as const;
export type DeliveryNote = keyof typeof DELIVERY_NOTES;

export const DEFAULT_AUDIO: GuideAudio = {
  levels: { course: true, pages: true, blocks: false },
  voice: { kind: "profile", id: "editorial" },
  length: "editorial",
  // Learners choose whether to listen: introductions never play by themselves.
  playback: "press-play",
};
export const audioOf = (doc: GuideDoc): GuideAudio => doc.audio ?? DEFAULT_AUDIO;

const WORD = /[\p{L}\p{N}’']+/gu;
export const wordCount = (s: string) => s.match(WORD)?.length ?? 0;
/** About 150 words a minute, the pace of the hub's narrator. */
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
  return textSnapshot(text, text);
}
/**
  A snapshot of anything an introduction rests on (a Discovery Path, say): all its words, and the parts whose change
  always asks for a look (`key`). Compared with `substantiallyChanged`, like a page's.
*/
export const textSnapshot = (text: string, key: string): NarrationSnapshot => ({ hash: textHash(text), key: textHash(key), sig: signature(text) });
/**
  Changed enough that the narration should be looked at again: the title, purpose or a question changed,
  or about a fifth or more of the words did. Small edits don't ask.
*/
export const substantiallyChanged = (then: NarrationSnapshot, now: NarrationSnapshot) =>
  then.key !== now.key || (then.hash !== now.hash && similarity(then.sig, now.sig) < 0.75);

export type NarrationState = "none" | "draft" | "unrecorded" | "pending" | "rerecord" | "revoice" | "review" | "current";
export const NARRATION_STATES: Record<NarrationState, { label: string; tone: "good" | "warn" | "bad" | "neutral" }> = {
  none: { label: "No introduction", tone: "neutral" },
  draft: { label: "Script to approve", tone: "neutral" },
  unrecorded: { label: "Approved, no audio yet", tone: "neutral" },
  pending: { label: "Audio to approve", tone: "warn" },
  rerecord: { label: "Record again", tone: "bad" },
  revoice: { label: "Earlier voice", tone: "warn" },
  review: { label: "May be out of date", tone: "warn" },
  current: { label: "Published-ready", tone: "good" },
};

/** Which voice a recording was made with: "profile:<id>" for a voice profile, "topic" for the hub's Topic narrator, else the voice's id. */
export const voiceKey = (a: GuideAudio) =>
  a.voice.kind === "profile"
    ? `profile:${a.voice.id}`
    : a.voice.kind === "topic"
      ? "topic"
      : a.voice.kind === "openai"
        ? `openai:${a.voice.voice}`
        : a.voice.voiceId;

/**
  Where a narration stands, for its author. "rerecord" (the recording no longer matches its words) is the only one that
  holds publishing. A voice change ("revoice") or a page that has moved on ("review") asks for a look; learners keep
  hearing what's there until a replacement is approved.
*/
export function narrationState(n: Narration | undefined, now: NarrationSnapshot, audio: GuideAudio): NarrationState {
  if (!n || !n.script.trim()) return "none";
  if (n.status === "draft") return "draft";
  if (n.audio && n.audio.scriptHash !== textHash(n.script)) return "rerecord";
  if (n.audio?.pending) return "pending";
  if (n.basis && substantiallyChanged(n.basis, now)) return "review";
  // An uploaded recording is the author's own choice of voice.
  if (n.audio && n.audio.provider !== "upload" && n.audio.voice !== voiceKey(audio)) return "revoice";
  return n.audio ? "current" : "unrecorded";
}

/**
  Learners can hear it: approved, its audio approved, and recorded from these exact words (it may still be awaiting the
  author's review). A recording in an earlier voice still plays until it's replaced.
*/
export const playable = (n: Narration | undefined, audio: GuideAudio | undefined): n is Narration & { audio: NonNullable<Narration["audio"]> } =>
  Boolean(audio && n && n.status === "approved" && n.audio && !n.audio.pending && n.audio.scriptHash === textHash(n.script));

/** What the page's "Listen to the introduction" player plays: playable, and not turned off by the author. */
export const listenable = (n: Narration | undefined, audio: GuideAudio | undefined): n is Narration & { audio: NonNullable<Narration["audio"]> } =>
  playable(n, audio) && !n.hidden;

// ---------------------------------------------------------------------------------------------
// Replacements: the published introduction stays until its replacement is approved
// ---------------------------------------------------------------------------------------------

/** The version the author is working on: a replacement in progress, else the narration itself. */
export const workingCopy = (n: Narration | undefined): Narration | undefined => (n?.next ? n.next : n);

/**
  Applies an author's change to the version they're working on. When learners can hear this narration now, the change
  goes into a replacement (`next`), and what they hear stays as it is until the replacement is approved for publication.
  `fn` returning undefined drops the replacement (or, with nothing published, the narration).
*/
export function editWorking(n: Narration | undefined, audio: GuideAudio, fn: (w: Narration | undefined) => Narration | undefined): Narration | undefined {
  if (n && playable(n, audio)) {
    const { next, hidden, ...live } = n;
    const base: Narration = structuredClone(next ?? live);
    delete base.approvedBy;
    delete base.approvedAt;
    const changed = fn(base);
    const kept: Narration = { ...live, ...(hidden && { hidden }) };
    if (!changed) return kept;
    const { next: _n, hidden: _h, ...rest } = changed;
    void _n;
    void _h;
    return { ...kept, next: rest };
  }
  return fn(n);
}

/**
  A recording that has just been made, put with the script it was made from, for the author to listen to and approve.
  Nothing happens when the script has moved on since, or when what's there is the same or newer.
*/
export function attachRecording(n: Narration | undefined, rec: NonNullable<Narration["audio"]>, audio: GuideAudio): Narration | undefined {
  const w = workingCopy(n);
  if (!w || w.status !== "approved" || rec.scriptHash !== textHash(w.script)) return n;
  if (w.audio && w.audio.at >= rec.at) return n;
  return editWorking(n, audio, (x) => x && { ...x, audio: { ...rec, pending: true } });
}

/** Approve the version being worked on for publication: its audio becomes what learners hear once the course is published. */
export function approveForPublication(n: Narration | undefined, by: string, at: string): Narration | undefined {
  const w = workingCopy(n);
  if (!n || !w || w.status !== "approved" || !w.audio || w.audio.scriptHash !== textHash(w.script)) return n;
  const { pending: _p, ...rec } = w.audio;
  void _p;
  const { next: _n, ...rest } = w;
  void _n;
  return { ...rest, audio: rec, approvedBy: by, approvedAt: at, ...(n.hidden && { hidden: true as const }) };
}

/** The narrations in a learner's copy of the course: no replacements in progress, no audio awaiting approval, no checks. */
export function narrationForReaders<D extends { pages: { narration?: Narration }[]; audio?: GuideAudio }>(doc: D): D {
  const clean = (n: Narration | undefined) => {
    if (!n) return n;
    const { next: _n, checks: _c, ...rest } = n;
    void _n;
    void _c;
    if (rest.audio?.pending) delete rest.audio;
    return rest;
  };
  return {
    ...doc,
    pages: doc.pages.map((p) => (p.narration ? { ...p, narration: clean(p.narration) } : p)),
    ...(doc.audio && { audio: { ...doc.audio, ...(doc.audio.intro && { intro: clean(doc.audio.intro) }) } }),
  };
}

/** The player's speeds. */
export const INTRO_AUDIO_SPEEDS = [0.75, 1, 1.25, 1.5, 2] as const;
/**
  What "Listen to the introduction" records (as intro_audio.<action>, with numbers only): a play, listening to the end,
  a replay, opening the transcript, choosing a speed, and how long was listened to and how far it got.
*/
export const INTRO_AUDIO_ACTIONS = ["play", "complete", "replay", "transcript", "speed", "listened"] as const;
export type IntroAudioAction = (typeof INTRO_AUDIO_ACTIONS)[number];

// ---------------------------------------------------------------------------------------------
// Cost: an estimate where the price is reliable
// ---------------------------------------------------------------------------------------------

/**
  VERIFY before relying on these: OpenAI's published speech prices in US dollars per million input characters
  (platform.openai.com/docs/pricing, as understood in Nov 2026). tts-1 and tts-1-hd are priced by character.
  gpt-4o-mini-tts is priced by tokens (about US$0.015 a spoken minute); 15 per million characters approximates
  that for scripts read at about 150 words a minute. ElevenLabs bills plan credits, so it has no estimate here.
*/
export const SPEECH_PRICES_TO_VERIFY: Record<string, number> = { "gpt-4o-mini-tts": 15, "tts-1": 15, "tts-1-hd": 30 };

/** What recording these characters is estimated to cost in US dollars, or null when there's no reliable price. */
export function speechCost(characters: number, provider: string, model: string): number | null {
  const price = provider === "openai" ? SPEECH_PRICES_TO_VERIFY[model] : undefined;
  return price === undefined ? null : Math.round(((characters * price) / 1e6) * 1e5) / 1e5;
}
export const formatCost = (usd: number) => (usd < 0.01 ? "under US$0.01" : `about US$${usd.toFixed(2)}`);

/** The estimate shown before audio is made: characters × the configured model's price, or why there isn't one. */
export function costEstimateText(characters: number, speech: { provider: string; model: string; pricePerMillionChars: number | null }) {
  if (speech.pricePerMillionChars === null)
    return `${characters.toLocaleString("en-AU")} characters. No cost estimate: ${speech.provider === "elevenlabs" ? "ElevenLabs bills plan credits" : `there’s no price on file for ${speech.model}`}.`;
  const usd = (characters * speech.pricePerMillionChars) / 1e6;
  return `Estimated cost: ${formatCost(usd)} (${characters.toLocaleString("en-AU")} characters × US$${speech.pricePerMillionChars} per million for ${speech.model}; price to verify).`;
}

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

/** Openings that sound like a training module, not a magazine: "Welcome to this module", "In today's lesson"… */
const FORMULAIC =
  /^\W*(welcome( back)? to\b|hello and welcome|hi( there)?,? and welcome|in (today[’']s|this) (lesson|module|session|page|course|section)|today,? we(['’]ll| will| are going to)|this (module|lesson|page|session) (will|is going to|covers|is about)|in this (module|lesson|page|session),? (we|you)(['’]ll| will))/i;
export const formulaicOpening = (script: string) => FORMULAIC.test(script.trim());

/** Words that usually carry a regulatory, financial or clinical claim, which belongs to the page and its sources. */
const CLAIM =
  /\b(by law|legally|legislation|the (Aged Care )?Act\b|regulations? (say|require)|the Commission (says|requires)|compliance requirement|mandatory|subsid(y|ies)|fee schedule|price cap|dosage|dose|diagnos\w*|prescri\w*|clinical advice)\b/i;
export const claimIn = (script: string) => CLAIM.exec(script)?.[0] ?? null;

/** Scripts that open with the same three words, so a course's introductions don't all start alike. */
export function sameOpenings(scripts: { id: string; script: string }[]): string[][] {
  const by = new Map<string, string[]>();
  for (const s of scripts) {
    const key = norm(s.script).slice(0, 3).join(" ");
    if (key.split(" ").length < 3) continue;
    by.set(key, [...(by.get(key) ?? []), s.id]);
  }
  return [...by.values()].filter((ids) => ids.length > 1);
}

/** Warnings for the author on a script: too long or short, a figure or claim to confirm, a formulaic opening, a give-away. */
export function scriptWarnings(script: string, length: NarrationLength, answers: string[]): string[] {
  const out: string[] = [];
  const n = wordCount(script);
  const { min, max } = NARRATION_LENGTHS[length];
  // A shorter introduction can be right for a page; the editorial length only warns well under it.
  if (n < Math.floor(min * (length === "editorial" ? 0.6 : 0.9))) out.push(`Short for the length chosen: ${n} words (aim for ${min} to ${max}).`);
  if (n > Math.ceil(max * 1.1)) out.push(`Long for the length chosen: ${n} words (aim for ${min} to ${max}).`);
  if (FIGURE.test(script)) out.push("It mentions a figure or date: check it’s right, or leave it to the page.");
  const claim = claimIn(script);
  if (claim) out.push(`It may make a regulatory, financial or clinical claim (“${claim}”): check the page supports it, or leave it to the page.`);
  if (formulaicOpening(script)) out.push("It opens like a training module. Start with the situation, a question or why it matters instead.");
  const spoiler = spoilerIn(script, answers);
  if (spoiler) out.push(`It may give away an answer (“…${spoiler}…”).`);
  return out;
}
