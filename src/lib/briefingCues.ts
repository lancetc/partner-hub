import type { NarrationAudio } from "./magazine";

/*
  Narration cues for The Trilogy Briefing (the owner, Nov 2026): as the narrator mentions a story or a part of the
  newspaper, that part of the homepage is gently emphasised. Each cue starts at a passage of the script; its time comes
  from the recording's own word timings (speech alignment), or from a time an author sets by hand when there are none.
  Never guessed from the script's length. The newspaper follows the audio's playback position, so pausing, seeking and
  replaying always show the right emphasis.
*/

export type CueTreatment = "headline" | "rule" | "tint" | "picture";

export const CUE_TREATMENTS: { id: CueTreatment; label: string }[] = [
  { id: "headline", label: "Headline underline" },
  { id: "rule", label: "Accent rule" },
  { id: "tint", label: "Soft background" },
  { id: "picture", label: "Picture lift" },
];

/** Parts of the newspaper a cue can point at, besides a story ("story:<slug>"). */
export const CUE_SECTIONS: { id: string; label: string }[] = [
  { id: "section:masthead", label: "The masthead" },
  { id: "section:featured", label: "The featured story" },
  { id: "section:latest", label: "Latest" },
  { id: "section:policy", label: "The policy notice" },
  { id: "section:brief", label: "News in brief" },
  { id: "section:archive", label: "From the archive" },
  { id: "section:question", label: "The weekly question" },
];

export type BriefingCue = {
  id: string;
  /** The words of the script where the cue begins. */
  excerpt: string;
  /** "story:<slug>" or one of CUE_SECTIONS. */
  target: string;
  treatment: CueTreatment;
  /** Set by hand, in seconds; otherwise taken from the recording's word timings. */
  start?: number;
  end?: number;
  /** The story's headline when the cue was made, to notice it changing. */
  targetTitle?: string;
};

/** A cue as the homepage plays it. */
export type TimedCue = { id: string; target: string; treatment: CueTreatment; start: number; end: number; excerpt: string };

const norm = (s: string) => s.toLowerCase().replace(/[‘’]/g, "'").replace(/\s+/g, " ").trim();

/**
  When each cue starts and ends. A time set by hand wins; otherwise the first spoken word at or after the cue's passage
  (found in order through the script) gives the start. A cue whose passage isn't in the script, in a recording without
  word timings, has no start until an author sets one. Each ends where it says, else where the next begins, else at the end.
*/
export function cueTimes(cues: BriefingCue[], script: string, audio: NarrationAudio | null) {
  const text = norm(script);
  let from = 0;
  const starts = cues.map((c) => {
    const at = c.excerpt.trim() ? text.indexOf(norm(c.excerpt), from) : -1;
    if (at >= 0) from = at + 1;
    if (typeof c.start === "number") return { start: c.start, how: "set" as const, found: at >= 0 };
    if (at < 0 || !audio?.words?.length) return { start: null, how: "none" as const, found: at >= 0 };
    // The script as spoken: word timings index the original script, so map the normalised position back.
    const orig = indexIn(script, at);
    const w = audio.words.find((x) => x.to > orig) ?? null;
    return { start: w ? Math.round(w.start * 100) / 100 : null, how: w ? ("aligned" as const) : ("none" as const), found: true };
  });
  const total = audio?.seconds ?? null;
  return cues.map((c, i) => {
    const start = starts[i].start;
    const next = starts.slice(i + 1).find((x) => x.start !== null && start !== null && x.start > start)?.start ?? null;
    const end = typeof c.end === "number" ? c.end : (next ?? total);
    return { id: c.id, start, end, how: starts[i].how, found: starts[i].found };
  });
}

/** The position in the original script of a position in its normalised form (lower case, single spaces, trimmed). */
function indexIn(script: string, normAt: number) {
  let n = 0;
  let i = 0;
  // Skip leading space, as norm() trims it.
  while (i < script.length && /\s/.test(script[i])) i++;
  for (; i < script.length && n < normAt; i++) {
    if (/\s/.test(script[i])) {
      while (i + 1 < script.length && /\s/.test(script[i + 1])) i++;
    }
    n++;
  }
  return i;
}

/** The cues a recording can play, in time order. */
export function timedCues(cues: BriefingCue[], script: string, audio: NarrationAudio | null): TimedCue[] {
  const times = cueTimes(cues, script, audio);
  return cues
    .map((c, i) => ({ c, t: times[i] }))
    .filter(
      (x): x is { c: BriefingCue; t: { id: string; start: number; end: number; how: "set" | "aligned" | "none"; found: boolean } } =>
        x.t.start !== null && x.t.end !== null && x.t.end > x.t.start,
    )
    .map(({ c, t }) => ({ id: c.id, target: c.target, treatment: c.treatment, start: t.start, end: t.end, excerpt: c.excerpt }))
    .sort((a, b) => a.start - b.start);
}

/** The cue playing at this moment, if any. */
export const activeCue = (cues: TimedCue[], t: number) => [...cues].reverse().find((c) => t >= c.start && t < c.end) ?? null;

/** Checks cues from the editor and puts them in the stored shape. */
export function cleanCues(input: unknown): BriefingCue[] {
  if (!Array.isArray(input)) return [];
  const sections = new Set(CUE_SECTIONS.map((s) => s.id));
  const seen = new Set<string>();
  return input
    .slice(0, 20)
    .map((raw, i): BriefingCue | null => {
      const c = raw as Partial<BriefingCue>;
      const target = typeof c.target === "string" ? c.target : "";
      if (!sections.has(target) && !/^story:[\w-]{1,120}$/.test(target)) return null;
      let id = typeof c.id === "string" && /^[\w-]{1,40}$/.test(c.id) ? c.id : `c${i + 1}`;
      while (seen.has(id)) id = `${id}x`;
      seen.add(id);
      const num = (v: unknown) => (typeof v === "number" && Number.isFinite(v) && v >= 0 && v < 3600 ? Math.round(v * 100) / 100 : undefined);
      const start = num(c.start);
      const end = num(c.end);
      return {
        id,
        excerpt: typeof c.excerpt === "string" ? c.excerpt.trim().slice(0, 300) : "",
        target,
        treatment: CUE_TREATMENTS.some((t) => t.id === c.treatment) ? (c.treatment as CueTreatment) : "headline",
        ...(start !== undefined ? { start } : {}),
        ...(end !== undefined && (start === undefined || end > start) ? { end } : {}),
        ...(typeof c.targetTitle === "string" && c.targetTitle ? { targetTitle: c.targetTitle.slice(0, 200) } : {}),
      };
    })
    .filter((c): c is BriefingCue => c !== null);
}
