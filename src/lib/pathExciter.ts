import type { Narration, NarrationAudio, NarrationSnapshot } from "./magazine";
import {
  DEFAULT_AUDIO,
  DELIVERY_NOTES,
  NARRATION_LENGTHS,
  listenable,
  narrationState,
  scriptWarnings,
  spoilerIn,
  substantiallyChanged,
  textHash,
  textSnapshot,
  type DeliveryNote,
  type NarrationState,
} from "./magazineNarration";

/*
  The Discovery Exciter (docs/discovery-exciter.md): a Discovery Path's spoken introduction, written to make the learner
  curious, stored apart from the path's description and recorded in the Magazine Editorial Voice. It is a Magazine
  Audio Introduction in every way that matters (lib/magazineNarration): the same script, approval, recording,
  replacement and freshness rules, kept for a path instead of a page. These are the path-specific parts, shared by the
  editor, the Manager and the server.
*/

/** What learners see on the player. */
export const EXCITER_LABEL = "Listen to your introduction";
/** The voice: the Magazine Editorial Voice profile (Alloy). */
export const EXCITER_VOICE = "profile:editorial";
/** Exciters have the Magazine's default audio settings: the Editorial Voice, the editorial length (70 to 130 words). */
export const EXCITER_AUDIO = DEFAULT_AUDIO;
export const EXCITER_LENGTH = "editorial" as const;
export const EXCITER_WORDS = NARRATION_LENGTHS.editorial;
/** A path's one recording target, and its owner in the shared recording queue (server/narrationJobs). */
export const EXCITER_TARGET = "exciter";
export const exciterOwner = (pathId: string) => `learning_path:${pathId}`;
/** The notice when the path has changed since its script was approved. */
export const OUTDATED_EXCITER_NOTICE =
  "This Discovery Path has changed since its introduction was approved. Review the introduction to make sure it still reflects the path.";

export type ExciterAudio = NarrationAudio & { delivery?: DeliveryNote };
/**
  A path's Discovery Exciter: a Narration (script, status, version, audio, checks, approval, visibility, the content
  snapshot it was approved against, and a replacement in `next`) plus the path-only fields.
*/
export type Exciter = Narration & {
  /** The slightly more curious delivery note for the Editorial Voice (DELIVERY_NOTES.curious). */
  curious?: true;
  /** Where the working script came from: seeded (migration or the ALIS builder), written by AI, or the author's own words. */
  source?: "seed" | "ai" | "author";
  /** When anything about it last changed. */
  updatedAt?: string;
};

/** What a path's introduction rests on. */
export type PathShape = {
  name: string;
  description: string;
  audience: string;
  whoFor: string;
  outcomes: string[];
  reward: string;
  topics: { slug: string; title: string }[];
  chapters: { title: string; stage: string; description: string }[];
};

/**
  A snapshot of the path for freshness. Material change, which always flags the Exciter as outdated: a Topic added or
  removed, or the outcomes changed (`key`). Anything else (the name, who it's for, chapters, the description, the
  order) flags it only when about a fifth of the words have changed, as a Magazine page does.
*/
export function pathSnapshot(p: PathShape): NarrationSnapshot {
  const tidy = (s: string) => s.trim().replace(/\s+/g, " ").toLowerCase();
  const key = [[...p.topics.map((t) => t.slug)].sort().join(","), p.outcomes.map(tidy).filter(Boolean).sort().join("|")].join("#");
  const text = [
    p.name,
    p.audience,
    p.whoFor,
    p.description,
    ...p.outcomes,
    p.reward,
    ...p.chapters.map((c) => `${c.stage} ${c.title} ${c.description}`),
    ...p.topics.map((t) => t.title),
  ].join(" | ");
  return textSnapshot(text, key);
}

/** Where the Exciter stands, for its author (NARRATION_STATES labels). */
export const exciterState = (n: Exciter | undefined, now: NarrationSnapshot): NarrationState => narrationState(n, now, EXCITER_AUDIO);

/** The path has changed materially since the script was approved (shown whatever else the state says). */
export const exciterOutdated = (n: Exciter | undefined, now: NarrationSnapshot) => Boolean(n?.basis && substantiallyChanged(n.basis, now));

/** What learners get: the approved script and its approved recording, only when listenable. Never a description. */
export type LearnerExciter = { script: string; audio: NarrationAudio };
export function exciterForLearners(n: Exciter | undefined): LearnerExciter | null {
  if (!listenable(n, EXCITER_AUDIO)) return null;
  const { src, seconds, words, scriptHash, voice, at, provider, profile, model } = n.audio;
  return {
    script: n.script,
    audio: { src, seconds, words, scriptHash, voice, at, ...(provider && { provider }), ...(profile && { profile }), ...(model && { model }) },
  };
}

/** Warnings for the author: length, a figure or claim, a formulaic opening, or reading out the description. */
export function exciterWarnings(script: string, description: string): string[] {
  const out = scriptWarnings(script, EXCITER_LENGTH, []);
  if (description.trim() && spoilerIn(script, [description]))
    out.push("It repeats the description word for word. The Exciter should open the path up, not read it out.");
  return out;
}

const HUB_AUDIO = /^\/api\/uploads\/[0-9a-f-]{36}\.(mp3|m4a|mp4|wav|ogg|webm|aac)$/;
const iso = (v: unknown) => (typeof v === "string" && !Number.isNaN(Date.parse(v)) ? new Date(v).toISOString() : undefined);

/** A stored Exciter, checked field by field (anything unknown or unsafe is dropped). */
export function readExciter(v: unknown, nested = false): Exciter | undefined {
  const o = v as Record<string, unknown> | null | undefined;
  if (!o || typeof o !== "object") return undefined;
  const script = typeof o.script === "string" ? o.script.slice(0, 1200) : "";
  if (!script.trim()) return undefined;
  const b = o.basis as Record<string, unknown> | undefined;
  const basis =
    b && typeof b.hash === "string" && typeof b.key === "string" && Array.isArray(b.sig)
      ? { hash: b.hash.slice(0, 40), key: b.key.slice(0, 40), sig: b.sig.slice(0, 32).map((x) => Number(x) >>> 0) }
      : undefined;
  const a = o.audio as Record<string, unknown> | undefined;
  let audio: ExciterAudio | undefined;
  if (a && typeof a === "object" && typeof a.src === "string" && HUB_AUDIO.test(a.src)) {
    const words = Array.isArray(a.words)
      ? (a.words as Record<string, unknown>[])
          .slice(0, 600)
          .map((w) => ({ from: Number(w?.from) || 0, to: Number(w?.to) || 0, start: Number(w?.start) || 0, end: Number(w?.end) || 0 }))
      : null;
    audio = {
      src: a.src,
      seconds: Math.max(0, Math.round(Number(a.seconds) * 10) / 10 || 0),
      words,
      scriptHash: String(a.scriptHash ?? "").slice(0, 40),
      voice: String(a.voice ?? EXCITER_VOICE).slice(0, 60),
      at: iso(a.at) ?? new Date(0).toISOString(),
      ...(typeof a.provider === "string" && /^[a-z0-9-]{2,30}$/.test(a.provider) && { provider: a.provider }),
      ...(typeof a.profile === "string" && /^[a-z0-9-]{2,30}$/.test(a.profile) && { profile: a.profile }),
      ...(typeof a.model === "string" && /^[\w.:-]{2,60}$/.test(a.model) && { model: a.model }),
      ...(typeof a.cost === "number" && Number.isFinite(a.cost) && a.cost >= 0 && { cost: Math.round(a.cost * 1e5) / 1e5 }),
      ...(a.pending === true && { pending: true as const }),
      ...(typeof a.delivery === "string" && a.delivery in DELIVERY_NOTES && { delivery: a.delivery as DeliveryNote }),
    };
  }
  const checks = Array.isArray(o.checks) ? o.checks.slice(0, 10).map((c) => String(c).slice(0, 300)) : [];
  const version = Math.round(Number(o.version));
  const approvedAt = iso(o.approvedAt);
  const next = nested ? undefined : readExciter(o.next, true);
  const source = o.source === "seed" || o.source === "ai" || o.source === "author" ? o.source : undefined;
  const updatedAt = iso(o.updatedAt);
  return {
    script,
    status: o.status === "approved" ? "approved" : "draft",
    ...(basis && { basis }),
    ...(audio && { audio }),
    ...(checks.length && { checks }),
    ...(version > 0 && version < 10_000 && { version }),
    ...(typeof o.approvedBy === "string" && o.approvedBy.trim() && { approvedBy: o.approvedBy.trim().slice(0, 80) }),
    ...(approvedAt && { approvedAt }),
    ...(source && { source }),
    ...(!nested && o.hidden === true && { hidden: true as const }),
    ...(!nested && o.curious === true && { curious: true as const }),
    ...(!nested && updatedAt && { updatedAt }),
    ...(next && { next }),
  };
}

/** The script's text hash, for matching a recording to the words it was made from. */
export const scriptHashOf = (script: string) => textHash(script);
