/*
  Word timings for following the narration word by word. ElevenLabs returns the start and end time
  of every character it spoke; these are grouped into words, each with its place in the script.
*/

export type Alignment = { characters: string[]; character_start_times_seconds: number[]; character_end_times_seconds: number[] };
/** A spoken word: where it is in the script (from/to) and when it's said (seconds). */
export type WordTiming = { from: number; to: number; start: number; end: number };

/** Words with their times, or null if the timings don't line up with this script. */
export function wordsFromAlignment(text: string, a: Alignment | null | undefined): WordTiming[] | null {
  if (!a?.characters?.length || a.characters.join("") !== text) return null;
  const words: WordTiming[] = [];
  for (const m of text.matchAll(/\S+/g)) {
    const from = m.index;
    const to = from + m[0].length;
    words.push({ from, to, start: a.character_start_times_seconds[from], end: a.character_end_times_seconds[to - 1] });
  }
  return words;
}

/**
  Word timings estimated from how long the recording plays, for a voice that doesn't report them (OpenAI's).
  Each word gets time by its length, with a little more after a comma and more after a sentence's end, so
  following along stays close enough to read with.
*/
export function estimateWords(text: string, seconds: number): WordTiming[] | null {
  const found = [...text.matchAll(/\S+/g)];
  if (!found.length || !(seconds > 0)) return null;
  const lead = Math.min(0.2, seconds * 0.02);
  const weight = (w: string) => w.length + 2 + (/[.!?…]["”’)]*$/.test(w) ? 6 : /[,;:—–]["”’)]*$/.test(w) ? 3 : 0);
  const total = found.reduce((n, m) => n + weight(m[0]), 0);
  const per = (seconds - lead) / total;
  let at = lead;
  return found.map((m) => {
    const w = m[0];
    // The word is said over its letters; the pause after it is silence.
    const start = at;
    const end = start + (w.length + 2) * per;
    at += weight(w) * per;
    return { from: m.index, to: m.index + w.length, start: Math.round(start * 1000) / 1000, end: Math.round(end * 1000) / 1000 };
  });
}

/** The word being said at this time: the last one that has started. */
export function wordAt(words: WordTiming[], seconds: number): WordTiming | null {
  let lo = 0;
  let hi = words.length - 1;
  let found = -1;
  while (lo <= hi) {
    const mid = (lo + hi) >> 1;
    if (words[mid].start <= seconds) {
      found = mid;
      lo = mid + 1;
    } else hi = mid - 1;
  }
  return found < 0 ? null : words[found];
}

/** The word around a character position (for the browser voice, which reports where it's up to). */
export function wordAround(text: string, index: number): { from: number; to: number } | null {
  if (index < 0 || index >= text.length || /\s/.test(text[index])) return null;
  let from = index;
  while (from > 0 && /\S/.test(text[from - 1])) from--;
  let to = index;
  while (to < text.length && /\S/.test(text[to])) to++;
  return to > from ? { from, to } : null;
}

/** One piece of what speech-to-text heard (ElevenLabs Scribe): a word, the space after it, or a sound ("[laughs]"). */
export type HeardToken = { text: string; start?: number; end?: number; type?: string };

/**
  What a recording says, as heard: its words written out, each with when it's said. The words and spaces are put back
  together in order (sounds such as "[laughs]" are left out), so each word knows its place in the text.
*/
export function wordsFromSpeech(tokens: HeardToken[] | null | undefined): { text: string; words: WordTiming[] } | null {
  let text = "";
  const words: WordTiming[] = [];
  for (const t of tokens ?? []) {
    if (t.type === "audio_event" || typeof t.text !== "string") continue;
    if (t.type === "spacing" || !t.text.trim()) {
      // One space between words, however the gap was heard.
      if (text && !text.endsWith(" ")) text += " ";
      continue;
    }
    const piece = t.text.trim();
    // A word straight after another (no spacing token between them) still gets its own place.
    if (text && !text.endsWith(" ") && words.length) text += " ";
    const from = text.length;
    text += piece;
    const start = Number(t.start);
    const end = Number(t.end);
    words.push({ from, to: text.length, start: Number.isFinite(start) ? start : 0, end: Number.isFinite(end) ? end : Number.isFinite(start) ? start : 0 });
  }
  text = text.trimEnd();
  return words.length ? { text, words } : null;
}

/**
  The same timings over a lightly edited script (a spelling fixed, punctuation added): when the edit keeps every word in
  place (the same number of words), each keeps its time and takes its new place in the text. Otherwise null: they have
  to be timed again.
*/
export function retimeWords(words: WordTiming[] | null | undefined, text: string): WordTiming[] | null {
  if (!words?.length) return null;
  const found = [...text.matchAll(/\S+/g)];
  if (found.length !== words.length) return null;
  return found.map((m, i) => ({ from: m.index, to: m.index + m[0].length, start: words[i].start, end: words[i].end }));
}
