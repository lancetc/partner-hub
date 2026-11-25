import type { Lesson } from "@/content/lessons";
import { parseRich, type Inline } from "./richText";

/*
  Every card in a Topic has a voice-over (the owner, Nov 2026), even a short one. A card without its own narration script
  is read from what it already says on screen: its heading and text, its question, its points. Nothing is made up, and a
  question's answers and feedback are never read out. The player (the footer narration) and the server (/api/tts, which
  reads the same words) both use this, so what's heard always matches what's shown.
*/

type Card = Lesson["nodes"][string];

/** About a minute of speech at most: the card's opening sentences, not everything on it. */
const MAX_WORDS = 110;

const flat = (c: Inline[]): string => c.map((x) => (x.t === "text" ? x.v : x.t === "br" ? " " : flat(x.c))).join("");
const tidy = (s: string) => s.replace(/\s+/g, " ").trim();
/** A sentence ends with a full stop (or ! ? : …) so the voice pauses between them. */
const sentence = (s: string) => {
  const t = tidy(s);
  if (!t) return "";
  return /[.!?…:]["”’)]*$/.test(t) ? t : `${t}.`;
};

/** A card's text as sentences: list items become sentences, and a source note (a paragraph wholly in italics) is left out. */
function spokenBody(src: string | undefined): string[] {
  if (!src?.trim()) return [];
  const out: string[] = [];
  for (const b of parseRich(src)) {
    if (b.t === "p") {
      // "*Based on the Commission's modules…*": the source line, shown on screen, not read aloud.
      if (b.c.length === 1 && b.c[0].t === "i" && /^\s*(based on|source|general guidance)/i.test(flat(b.c[0].c))) continue;
      out.push(sentence(flat(b.c)));
    } else if (b.t === "ul" || b.t === "ol") out.push(...b.items.map((i) => sentence(flat(i))));
    // Tables are for reading, not listening.
  }
  return out.filter(Boolean);
}

/** Keeps whole sentences up to the word limit. */
function within(parts: string[]): string {
  const kept: string[] = [];
  let words = 0;
  for (const p of parts) {
    const n = p.split(/\s+/).filter(Boolean).length;
    if (kept.length && words + n > MAX_WORDS) break;
    kept.push(p);
    words += n;
  }
  return kept.join(" ");
}

/** True when the card's sound is its own video (the video speaks for itself). */
const speaksForItself = (c: Card) => c.type === "presenter" && c.visual.kind === "presenter" && Boolean(c.visual.video);

/**
  The voice-over for a card that has no script of its own: built from what it says on screen. Empty for a card whose
  video speaks for itself, and for audio cards, which always have their own script.
*/
export function fallbackNarration(c: Card): string {
  if (c.type === "audio" || c.type === "listen" || speaksForItself(c)) return "";
  const heading = sentence(c.heading ?? "");
  const body = spokenBody((c as { body?: string }).body);
  // A heading the text already starts with isn't said twice.
  const lead = heading && !(body[0] ?? "").toLowerCase().startsWith(heading.replace(/[.!?:]$/, "").toLowerCase()) ? [heading] : [];
  switch (c.type) {
    case "quiz": {
      const n = c.questions.length;
      return within([...lead, ...body, n > 1 ? `There are ${n} questions. Choose the best answer to each one.` : "Choose the best answer."]);
    }
    case "decision":
      return within([...lead, ...body, sentence(c.prompt)].filter(Boolean));
    case "rating":
      return within([
        ...lead,
        ...body,
        `“${tidy(c.prompt)}”`,
        `Choose how sure you are${c.lowLabel && c.highLabel ? `, from ${tidy(c.lowLabel)} to ${tidy(c.highLabel)}` : ""}.`,
      ]);
    case "summary":
      return within([...lead, ...body, ...(c.points ?? []).map(sentence), sentence(c.action ?? "")].filter(Boolean));
    default: {
      // Turn-over tiles and similar: their titles, after the card's own words.
      const kp = (c as { keyPoints?: { items: { title?: string; text: string }[] } }).keyPoints;
      const tiles = kp?.items.length ? [sentence(kp.items.map((i) => tidy(i.title || i.text)).join(", "))] : [];
      return within([...lead, ...body, ...(body.length ? [] : tiles)].filter(Boolean));
    }
  }
}

/** What a card says aloud in the footer: its own narration script, or the voice-over built from it. */
export const cardNarration = (c: Card) => (c as { narration?: string }).narration?.trim() || fallbackNarration(c);
