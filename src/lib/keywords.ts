/*
  The words that matter in a short question or goal: common words dropped, simple plurals trimmed.
  Shared by site search's "related content" and Discovery Path suggestions.
*/

const STOP = new Set(
  "a about after all also am an and any are as at be been before but by can could did do does doing for from get got had has have how i if in into is it its just me my need no not of on or our should so than that the their them then there these they this to up us was we what when where which who why will with would you your".split(
    " ",
  ),
);
export const keywords = (text: string) => [
  ...new Set(
    text
      .toLowerCase()
      .replace(/[^\p{L}\p{N}\s'-]/gu, " ")
      .split(/\s+/)
      .map((w) => w.replace(/^'+|'+$/g, ""))
      .filter((w) => w.length > 2 && !STOP.has(w))
      // "visits" finds "visit": a simple plural trim, enough for short questions.
      .map((w) => (w.length > 4 && w.endsWith("s") && !w.endsWith("ss") ? w.slice(0, -1) : w)),
  ),
];
