/* Captions for recordings made in the Magazine's studio: phrases as they were spoken, as a WebVTT file. */

export type Cue = { start: number; end: number; text: string };

const vttTime = (s: number) => {
  const ms = Math.max(0, Math.round(s * 1000));
  const h = Math.floor(ms / 3600000);
  const m = Math.floor((ms % 3600000) / 60000);
  const sec = Math.floor((ms % 60000) / 1000);
  return `${String(h).padStart(2, "0")}:${String(m).padStart(2, "0")}:${String(sec).padStart(2, "0")}.${String(ms % 1000).padStart(3, "0")}`;
};

/** Long recognised phrases become captions of a dozen words or so, sharing the phrase's time between them. */
export function splitCues(cues: Cue[], words = 12): Cue[] {
  return cues.flatMap((c) => {
    const w = c.text.split(/\s+/).filter(Boolean);
    if (w.length <= words) return [c];
    const parts = Math.ceil(w.length / words);
    const step = (c.end - c.start) / parts;
    return Array.from({ length: parts }, (_, i) => ({
      start: c.start + step * i,
      end: c.start + step * (i + 1),
      text: w.slice(i * words, (i + 1) * words).join(" "),
    }));
  });
}

/** A WebVTT file: every caption on screen for at least half a second; empty ones left out. */
export function toVtt(cues: Cue[]) {
  const kept = cues.filter((c) => c.text.trim());
  return `WEBVTT\n\n${kept.map((c, i) => `${i + 1}\n${vttTime(c.start)} --> ${vttTime(Math.max(c.end, c.start + 0.5))}\n${c.text.trim()}`).join("\n\n")}\n`;
}
