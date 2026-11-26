import { parseManifest } from "./elearning/manifest";
import { unzip, UnzipError } from "./elearning/unzip";

/*
  The words inside a SCORM package, so AI drafting can read an existing eLearning course like any other source.
  A package is a ZIP of a web page, so its text lives in different places depending on the tool that made it:

  - the manifest: the course title and its outline (item titles, in order);
  - plain HTML pages (hand-built, iSpring, Captivate's HTML, the eLearning fixture);
  - Articulate Rise: the whole course as base64 JSON inside index.html (or a JS file beside it);
  - Articulate Storyline: each slide's text as JSON passed to globalProvideData() in html5/data/js;
  - caption files (.vtt / .srt): the narration, which is often most of what a learner hears.

  Only text files are kept while unzipping (media is skipped), through the same safety checks as an eLearning
  import. The result is plain text in sections marked "[Section: …]", so a claim can point at where it came from.
*/

const TEXT_FILE = /\.(html?|js|json|xml|vtt|srt|txt)$/i;
const MAX_KEPT_BYTES = 40 * 1024 * 1024;

export class ScormTextError extends Error {}

const ENTITIES: Record<string, string> = {
  amp: "&",
  lt: "<",
  gt: ">",
  quot: '"',
  apos: "'",
  nbsp: " ",
  rsquo: "’",
  lsquo: "‘",
  rdquo: "”",
  ldquo: "“",
  ndash: "–",
  mdash: "—",
  hellip: "…",
};

/** Plain text from a bit of HTML: no scripts, styles or tags; entities decoded; whitespace tidied. */
export function htmlText(html: string) {
  return html
    .replace(/<(script|style|noscript|template)[\s\S]*?<\/\1>/gi, " ")
    .replace(/<!--[\s\S]*?-->/g, " ")
    .replace(/<\/(p|div|li|h[1-6]|tr|section|article|blockquote)>|<br\s*\/?>/gi, "\n")
    .replace(/<[^>]+>/g, " ")
    .replace(/&(#x?[0-9a-f]+|\w+);/gi, (m, e: string) =>
      e[0] === "#"
        ? String.fromCodePoint(e[1] === "x" || e[1] === "X" ? parseInt(e.slice(2), 16) : parseInt(e.slice(1), 10))
        : (ENTITIES[e.toLowerCase()] ?? m),
    )
    .replace(/[ \t ]+/g, " ")
    .replace(/\s*\n\s*/g, "\n")
    .trim();
}

/** A string that reads as words for a learner, not an id, path, colour, code or encoded data. */
function isProse(s: string) {
  if (s.length < 3 || s.length > 20_000) return false;
  if (/^(https?:|data:|#[0-9a-f]{3,8}$|[\w./-]+\.(png|jpe?g|gif|svg|webp|mp[34]|webm|vtt|woff2?|css|js|html?)$)/i.test(s)) return false;
  if (/^[\w$.-]+$/.test(s) && !/\s/.test(s)) return false; // a single token: ids, keys, enum values
  if (/[{};]\s*$/.test(s) && /[{}]/.test(s)) return false; // CSS or code
  return (s.match(/[A-Za-z]{2,}/g) ?? []).length >= 2;
}

/** The readable strings in parsed JSON, in document order; `keys` narrows it to strings under those keys. */
function proseIn(value: unknown, keys?: Set<string>, key = "", out: string[] = []): string[] {
  if (typeof value === "string") {
    if (!keys || keys.has(key)) {
      const t = /<[a-z][\s\S]*>/i.test(value) ? htmlText(value) : value.trim();
      if (isProse(t)) out.push(t);
    }
  } else if (Array.isArray(value)) value.forEach((v) => proseIn(v, keys, key, out));
  else if (value && typeof value === "object") for (const [k, v] of Object.entries(value)) proseIn(v, keys, k, out);
  return out;
}

/** Articulate Rise keeps the course as base64 JSON in a long string literal. */
function riseCourse(text: string): string[] {
  const out: string[] = [];
  for (const m of text.matchAll(/["'`]([A-Za-z0-9+/]{4000,}={0,2})["'`]/g)) {
    try {
      const json = Buffer.from(m[1], "base64").toString("utf8");
      if (!/^\s*[{[]/.test(json)) continue;
      out.push(...proseIn(JSON.parse(json)));
    } catch {
      // Not base64 JSON after all: an embedded font or image.
    }
  }
  return out;
}

const STORYLINE_KEYS = new Set(["altText", "title", "caption", "text"]);

/** Articulate Storyline: globalProvideData('slide', '<JSON as a JS string>'). */
function storylineSlide(js: string): { title: string; text: string[] } | null {
  const m = js.match(/globalProvideData\(\s*'(\w+)'\s*,\s*'([\s\S]*)'\s*\)\s*;?\s*$/);
  if (!m || m[1] !== "slide") return null;
  try {
    const data = JSON.parse(m[2].replace(/\\'/g, "'").replace(/\\\\/g, "\\")) as { title?: string };
    const title = typeof data.title === "string" ? data.title : "";
    return { title, text: proseIn(data, STORYLINE_KEYS).filter((t) => t !== title) };
  } catch {
    return null;
  }
}

/** Caption lines without numbers, timings or cue settings. */
function captionText(vtt: string) {
  return vtt
    .split(/\r?\n/)
    .filter((l) => l.trim() && !/^(WEBVTT|NOTE|\d+$|[\d:.,]+\s*-->)/.test(l.trim()))
    .map((l) => htmlText(l))
    .join(" ");
}

const unique = (xs: string[]) => {
  const seen = new Set<string>();
  return xs.filter((x) => {
    const k = x.toLowerCase().replace(/\s+/g, " ");
    return !seen.has(k) && (seen.add(k), true);
  });
};

/** Whether a ZIP is a SCORM package: an imsmanifest.xml at the top, or inside a single folder. */
export function looksLikeScorm(names: string[]) {
  return names.some((n) => /^([^/]+\/)?imsmanifest\.xml$/i.test(n));
}

/**
  Reads a SCORM ZIP's text. Returns its title and its sections (each "[Section: name]" then the text), or throws
  ScormTextError saying why it couldn't (not SCORM, unsafe, or nothing readable inside).
*/
export async function scormText(zip: Buffer): Promise<{ title: string; sections: string[] }> {
  const files = new Map<string, string>();
  let kept = 0;
  try {
    await unzip(zip, async (path, data) => {
      if (!TEXT_FILE.test(path) || kept + data.length > MAX_KEPT_BYTES) return;
      kept += data.length;
      files.set(path, data.toString("utf8"));
    });
  } catch (e) {
    if (e instanceof UnzipError) throw new ScormTextError(e.message);
    throw e;
  }
  const manifestPath = [...files.keys()].filter((p) => /^([^/]+\/)?imsmanifest\.xml$/i.test(p)).sort((a, b) => a.length - b.length)[0];
  if (!manifestPath) throw new ScormTextError("There’s no imsmanifest.xml in the ZIP, so it isn’t a SCORM package.");
  const base = manifestPath.slice(0, manifestPath.length - "imsmanifest.xml".length);
  let title = "";
  let outline: string[] = [];
  try {
    const m = parseManifest(files.get(manifestPath)!, () => true);
    title = m.title;
    outline = m.items.map((i) => i.title).filter(Boolean);
  } catch {
    // A manifest the strict reader turns down (no SCORM version, say) still names the course and its parts.
    const titles = [...files.get(manifestPath)!.matchAll(/<(?:\w+:)?title[^>]*>\s*(?:<(?:\w+:)?langstring[^>]*>)?([^<]+)</gi)].map((m) => htmlText(m[1]));
    title = titles[0] ?? "";
    outline = titles.slice(1);
  }

  const sections: string[] = [];
  const add = (name: string, parts: string[]) => {
    const text = unique(parts.map((p) => p.trim()).filter(Boolean)).join("\n");
    if (text) sections.push(`[Section: ${name}]\n${text}`);
  };
  if (outline.length > 1) add("Course outline", outline);

  const inPackage = [...files.entries()].filter(([p]) => p.startsWith(base) && p !== manifestPath);
  const short = (p: string) => p.slice(base.length);

  // Rise: one course, many lessons, in a base64 blob.
  const rise = unique(inPackage.filter(([p]) => /\.(html?|js)$/i.test(p)).flatMap(([, t]) => riseCourse(t)));
  if (rise.length) add(title || "Course", rise);

  // Storyline: a file per slide, named by its slide title.
  const slides = inPackage
    .filter(([p]) => /\.js$/i.test(p) && /data\/js\//i.test(p))
    .map(([p, t]) => ({ p, s: storylineSlide(t) }))
    .filter((x): x is { p: string; s: { title: string; text: string[] } } => !!x.s && x.s.text.length > 0)
    .sort((a, b) => a.p.localeCompare(b.p, undefined, { numeric: true }));
  for (const { p, s } of slides) add(s.title || short(p), s.text);

  // Plain pages, when the tool didn't keep the words in data.
  if (!rise.length && !slides.length)
    for (const [p, t] of inPackage.filter(([p]) => /\.html?$/i.test(p)).sort(([a], [b]) => a.localeCompare(b, undefined, { numeric: true }))) {
      const heading = t.match(/<title[^>]*>([\s\S]*?)<\/title>/i)?.[1];
      add(heading ? htmlText(heading) : short(p), [htmlText(t)]);
    }

  // Narration captions, whatever the tool.
  for (const [p, t] of inPackage.filter(([p]) => /\.(vtt|srt)$/i.test(p))) add(`Narration: ${short(p).split("/").pop()}`, [captionText(t)]);

  if (!sections.some((s) => !s.startsWith("[Section: Course outline]")))
    throw new ScormTextError(
      "It’s a SCORM package, but no text could be read from it (the words may be inside images or video). Upload a PDF or Word copy of the script instead.",
    );
  return { title, sections };
}
