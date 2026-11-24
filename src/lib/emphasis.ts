import type { Block, GuideDoc, Page } from "./magazine";
import { normText } from "./passageMatch";
import { emphasisIn } from "./richText";

/*
  Emphasise text (docs/emphasise-text.md): an author's marker behind a short phrase in a Magazine story. The
  rich-text mark itself is in lib/richText (==a phrase==). Here: the limits, the editorial checks before a
  course is published, and when the reader's sweep runs (components/EditorialMark).
*/

export const EMPHASIS = {
  /** A mark longer than this is a sentence, not a phrase: a suggestion before publishing. */
  words: 12,
  /** The editor won't mark more than this: it's a paragraph by then. */
  maxWords: 25,
  /** Suggested most marks in one paragraph, one section and one page. */
  perParagraph: 1,
  perSection: 2,
  perPage: 5,
  /** How much of the phrase is on screen before the marker sweeps in. */
  threshold: 0.4,
} as const;

export const wordsIn = (s: string) => s.split(/\s+/).filter(Boolean).length;

/**
  How a mark first draws when the page opens. "sweep" waits off screen, then sweeps in once as it comes into view.
  Everything else is the final, static marker straight away: reduced motion, a browser that can't watch for the
  phrase, a phrase already seen in this visit, or one already on screen (taking its colour away to sweep it back
  would be a flash).
*/
export function sweepStart(o: { reduced: boolean; canObserve: boolean; seen: boolean; inView: boolean }): "static" | "sweep" {
  return o.reduced || !o.canObserve || o.seen || o.inView ? "static" : "sweep";
}

/**
  Story text, where the editor offers emphasis. Anywhere else it can read as a hint (a question, a choice, a card to
  sort) or stand in for a warning (a callout), and the editor there takes it off when the text is next edited.
*/
const PROSE = new Set<Block["type"]>(["text", "textMedia"]);
/** Fields that aren't words on the page. */
const SKIP = new Set(["id", "type", "src", "href", "poster", "captions", "alt", "note", "flag", "evidence", "narration", "basis"]);

function richStrings(v: unknown, out: string[], key = "") {
  if (SKIP.has(key)) return;
  if (typeof v === "string") out.push(v);
  else if (Array.isArray(v)) v.forEach((x) => richStrings(x, out));
  else if (v && typeof v === "object") for (const [k, x] of Object.entries(v)) richStrings(x, out, k);
}

/** The best answers in a block, as compared words: what emphasis earlier on the page must not point at. */
function bestAnswers(b: Block): string[] {
  if (b.type === "decision") return b.choices.filter((c) => c.verdict === "best").map((c) => normText(c.text));
  if (b.type === "conversation") return b.turns.flatMap((t) => t.responses.filter((r) => r.verdict === "best").map((r) => normText(r.text)));
  return [];
}

/** A phrase that is, or is inside, an answer (two words or more either way). */
const pointsAt = (phrase: string, answer: string) =>
  (phrase.split(" ").length >= 2 && ` ${answer} `.includes(` ${phrase} `)) || (answer.split(" ").length >= 2 && ` ${phrase} `.includes(` ${answer} `));

/**
  Editorial checks on emphasis, as suggestions before publishing: they never stop a course. A short phrase, one or
  two to a section, only in story text, and never pointing at the answer of a question that comes after it on the page.
*/
export function emphasisChecks(doc: GuideDoc, label: (b: Block) => string): string[] {
  const out: string[] = [];
  const many = doc.pages.length > 1;
  doc.pages.forEach((p: Page, pi) => {
    const at = many ? `Page ${pi + 1}, ` : "";
    const marked: { phrase: string; order: number; where: string }[] = [];
    const answers: { words: string; order: number }[] = [];
    let order = 0;
    let onPage = 0;
    p.sections.forEach((s) => {
      let inSection = 0;
      s.blocks.forEach((b, i) => {
        const where = `${at}“${s.title}”, ${label(b)} ${i + 1}`;
        order++;
        for (const words of bestAnswers(b)) if (words) answers.push({ words, order });
        const strings: string[] = [];
        richStrings(b, strings);
        const paragraphs = strings.flatMap(emphasisIn).filter((ph) => ph.length);
        const phrases = paragraphs.flat();
        if (!phrases.length) return;
        if (!PROSE.has(b.type)) {
          out.push(`${where}: emphasis is for story text. Here it can read as a hint to an answer or stand in for a warning, so take it off.`);
          return;
        }
        inSection += phrases.length;
        onPage += phrases.length;
        for (const ph of phrases) {
          if (wordsIn(ph) > EMPHASIS.words) out.push(`${where}: “${ph}” is long for emphasis. Mark the few words that matter (${EMPHASIS.words} or fewer).`);
          marked.push({ phrase: ph, order, where });
        }
        if (paragraphs.some((ph) => ph.length > EMPHASIS.perParagraph))
          out.push(`${where}: two emphasised phrases in one paragraph compete. Keep the one that matters most.`);
      });
      if (inSection > EMPHASIS.perSection)
        out.push(`${at}“${s.title}”: ${inSection} phrases are emphasised in one section. One or two keeps each of them meaningful.`);
    });
    if (onPage > EMPHASIS.perPage)
      out.push(`${at || "The page: "}${onPage} emphasised phrases on one page. Keep emphasis for the few lines readers should hold in mind.`);
    for (const m of marked) {
      const phrase = normText(m.phrase);
      if (answers.some((a) => a.order > m.order && pointsAt(phrase, a.words)))
        out.push(`${m.where}: “${m.phrase}” matches the answer to a question after it. Emphasise it in the feedback instead, so it isn’t a hint.`);
    }
  });
  return out;
}
