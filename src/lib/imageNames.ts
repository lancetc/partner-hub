/*
  Names for pictures in the image library (server/uploads). Files arrive named by whatever made them: an AI prompt
  ("magnific__image-prompt-meet-dot-a-good-outcome…", "AI OpenAI – Head-and-shoulders portrait photograph…"), a stock
  site ("Pexels 33524619 – Gonzalo"), a camera ("IMG_1234"), or a random id. These turn a file name into a short,
  readable title when it says something, and into nothing when it doesn't, so the library can ask for one.

  A title names the picture for authors; the alt text (written separately) describes it for screen readers.
*/

/** Prompt boilerplate that says how a picture was made, not what's in it. Removed from the front of a name. */
const BOILERPLATE = [
  /^image[ -]prompt[ -]*/i,
  /^(create|generate|make)( an?| the)? /i,
  /^(an? )?(ultra[ -]?)?(photo[ -]?realistic|hyper[ -]?realistic|natural photorealistic|realistic)( image| photo(graph)?| photography)?( of)? /i,
  /^(an? )?(premium |high[ -]?resolution |cinematic |natural |warm |soft |candid )+/i,
  /^(australian |documentary[ -]?style |editorial |lifestyle |documentary |photo(graph(y)?)?( of)? )+/i,
  /^(of |showing |depicting )/i,
];

/** Names that say nothing about the picture. */
const MEANINGLESS = [
  /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}(-cropped)?$/i,
  /^[0-9a-f]{20,}$/i,
  /^\d{6,}$/,
  /^(image|img|picture|photo|pic|test|untitled|download|screenshot|vert|second|rejected|re|path)[ _-]*\d*$/i,
  /^(img|dsc|pxl|mvimg)[_ -]?\d+/i,
];

/** A file name with its extension, prefixes, id suffixes and separators tidied away. */
function tidy(raw: string): string {
  let s = raw.replace(/\.(webp|png|jpe?g|gif|svg)$/i, "").trim();
  // An app's own prefix: "magnific__…", "magnific_…".
  s = s.replace(/^magnific_+/i, "");
  // A generator's random suffix: "…_DoOmk4jpcl", "…__26222", "… (1)".
  s = s.replace(/_{1,2}[A-Za-z0-9]{4,12}$/, "").replace(/ \(\d+\)$/, "");
  s = s.replace(/[_-]+/g, " ").replace(/\s+/g, " ").trim();
  return s;
}

const sentence = (s: string) => (s ? s[0].toUpperCase() + s.slice(1) : s);

/**
  A readable title for a picture from its file name (and its Pexels credit, whose page address describes the photo),
  or "" when the name says nothing about it.
*/
export function titleFromFileName(fileName: string, credit?: { page?: string } | null): string {
  // Pexels: the photo's page is named for what's in it ("engaged-students-in-classroom-setting-33524619").
  const page = credit?.page?.match(/\/photo\/([a-z0-9-]+?)-\d+\/?$/i)?.[1];
  if (page) return sentence(page.replace(/-/g, " ")).slice(0, 90);
  const raw = fileName.trim();
  // An AI picture: "AI OpenAI – <the start of its prompt>". Character portraits all start the same way.
  const ai = raw.match(/^AI\s+[\w.-]+\s*[–-]+\s*(.*)$/);
  let s = ai ? ai[1].replace(/\.(webp|png|jpe?g)$/i, "") : tidy(raw);
  if (ai && /^head[ -]and[ -]shoulders portrait photograph of a fictional person/i.test(s)) return "Portrait of a fictional person";
  if (/^pexels \d+/i.test(s)) return "";
  const base = raw.replace(/\.(webp|png|jpe?g|gif|svg)$/i, "");
  // A long random id somewhere in it: one run of 20 or more letters and digits in both cases ("t45VNIcWfOJTU_t34j…").
  const randomRun = base.split(/[-_ ]+/).some((part) => part.length >= 20 && /\d/.test(part) && /[A-Z]/.test(part) && /[a-z]/.test(part));
  if (randomRun || MEANINGLESS.some((re) => re.test(base) || re.test(s))) return "";
  let before = "";
  while (before !== s) {
    before = s;
    for (const re of BOILERPLATE) s = s.replace(re, "").trim();
  }
  // Keep the first clause of a long prompt: what the picture is of, not how to light it. The generator glues words
  // together where it cut the prompt ("a good outcomewarm natura"), so the style words are cut wherever they start.
  s = s
    .split(/[.;:]/)[0]
    .replace(/(warm ?natura|natural ?light|photo ?realis|documentar|cinematic|editorial|shot on).*$/i, "")
    .trim();
  if (s.length < 3 || /^(australian|photo\w*|documentar\w*|editorial|cinematic|lifestyle|premium|ultra\w*|create|image)\b/i.test(s)) return "";
  // "meet dot a good outcome" reads better as "Meet Dot: a good outcome" when it's a story beat; leave other names be.
  s = s.replace(/^meet (\w+) /i, (_, name: string) => `Meet ${sentence(name)}: `);
  return sentence(s).slice(0, 90);
}

/** A starting alt text for a picture whose title says what it shows. Authors should check it. */
export const altFromTitle = (title: string) => (title ? `${sentence(title)}.` : "");

/**
  Whether some alt text reads as words, not keyboard testing ("fdfdsf dsf dsf"): at least two words, most of them
  with a vowel, and not the same few letters over and over. "A gardener" passes; "dsfdsf dsf dsf" doesn't.
*/
export const realWords = (s: string) => {
  const words = s.trim().split(/\s+/).filter(Boolean);
  if (words.length < 2) return false;
  const voweled = words.filter((w) => /[aeiouy]/i.test(w)).length;
  const distinct = new Set(words.map((w) => w.toLowerCase())).size;
  return voweled / words.length >= 0.7 && distinct >= Math.min(3, words.length);
};
