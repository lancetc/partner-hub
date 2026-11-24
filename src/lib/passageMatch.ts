/*
  Finding a saved passage in text again (docs/job-aids.md). The server and the page compare words the same way:
  letters and digits only, lower case, so a passage still matches across bold, a link or a line break, and a
  change of punctuation alone doesn't lose it. A change of wording does: that passage is no longer there.
*/

/** Text as it compares: letters and digits only, so a selection across bold or a line break still matches its source. */
export const normText = (s: string) =>
  s
    .toLowerCase()
    .replace(/[^\p{L}\p{N}]+/gu, " ")
    .trim();

const WORD = /[\p{L}\p{N}]/u;

/** Where a passage starts and ends in a run of text pieces (a page's text nodes, in order): piece and offset. */
export type PassageSpan = { start: [number, number]; end: [number, number] };

/**
  Finds a passage, word for word, in pieces of text that read on from one another (a block's text nodes). Whole
  words only: "rate" isn't found inside "separate". Returns null when the words aren't there as they were saved.
  `breaks[p]` says piece p starts a new line of the page (a heading, then a paragraph), where the text itself has no
  space: "Check each line" and "A supplier…" are two lines, not "lineA".
*/
export function locatePassage(pieces: string[], quote: string, breaks: boolean[] = []): PassageSpan | null {
  const want = normText(quote);
  if (!want) return null;
  // The pieces as they compare, with where each character came from.
  let norm = " ";
  const from: [number, number, number][] = [[-1, 0, 0]];
  pieces.forEach((text, p) => {
    if (breaks[p] && !norm.endsWith(" ")) {
      norm += " ";
      from.push([p, 0, 0]);
    }
    let i = 0;
    for (const ch of text) {
      for (const c of ch.toLowerCase()) {
        if (WORD.test(c)) {
          norm += c;
          from.push([p, i, ch.length]);
        } else if (!norm.endsWith(" ")) {
          norm += " ";
          from.push([p, i, ch.length]);
        }
      }
      i += ch.length;
    }
  });
  if (!norm.endsWith(" ")) {
    norm += " ";
    from.push([-1, 0, 0]);
  }
  const at = norm.indexOf(` ${want} `);
  if (at < 0) return null;
  const first = from[at + 1];
  const last = from[at + want.length];
  return { start: [first[0], first[1]], end: [last[0], last[1] + last[2]] };
}
