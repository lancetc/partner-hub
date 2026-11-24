/*
  Fills in titles and descriptions (alt text) for pictures in the image library from what the Hub already knows,
  only where a picture has none: nothing anyone has written is overwritten. Run with:

    npx vite-node --config vitest.config.ts scripts/describe-images.ts          (shows what it would do)
    npx vite-node --config vitest.config.ts scripts/describe-images.ts --write  (does it)

  Where the words come from, best first:
  1. a character's portrait: their name, and alt text from the look it was made from;
  2. alt text an author already wrote where the picture is placed (Magazine courses and Topics, drafts and live);
  3. a Pexels photo: the description in its page address.
  Anything left still needs someone to look at it; the library's "Needs a description" filter finds them.
*/
import path from "node:path";
import { openDb } from "@/server/db";
import { portraitAbout, type CharacterRole } from "@/lib/characters";
import { altFromTitle, realWords, titleFromFileName } from "@/lib/imageNames";
import { lessons as contentLessons } from "@/content/lessons";

const write = process.argv.includes("--write");
const db = openDb(path.join(process.cwd(), "data", "hub.sqlite"));
type Row = { filename: string; original_name: string; credit: string | null; title: string | null; alt: string | null };
const rows = db
  .prepare("SELECT filename, original_name, credit, title, alt FROM uploads WHERE mime LIKE 'image/%' AND deleted_at IS NULL AND replaced_by IS NULL")
  .all() as Row[];

// 1. Character portraits.
const portraits = new Map<string, { title: string; alt: string }>();
for (const c of db.prepare("SELECT name, look, role, portrait FROM characters WHERE portrait != ''").all() as {
  name: string;
  look: string;
  role: CharacterRole;
  portrait: string;
}[])
  portraits.set(c.portrait.split("/").pop()!, portraitAbout(c));

// 2. Alt text where pictures are placed: every { src, alt } in the courses' and topics' JSON.
const placedAlt = new Map<string, string>();
const collect = (v: unknown) => {
  if (!v || typeof v !== "object") return;
  if (Array.isArray(v)) return v.forEach(collect);
  const o = v as Record<string, unknown>;
  if (typeof o.src === "string" && o.src.startsWith("/api/uploads/") && typeof o.alt === "string" && realWords(o.alt)) {
    const file = o.src.split("/").pop()!;
    const alt = o.alt.trim();
    // The fullest description wins.
    if ((placedAlt.get(file) ?? "").length < alt.length) placedAlt.set(file, alt);
  }
  Object.values(o).forEach(collect);
};
const parse = (s: string | null) => {
  try {
    return s ? JSON.parse(s) : null;
  } catch {
    return null;
  }
};
for (const g of db.prepare("SELECT draft FROM magazine_guides").all() as { draft: string }[]) collect(parse(g.draft));
for (const r of db.prepare("SELECT doc FROM magazine_revisions").all() as { doc: string }[]) collect(parse(r.doc));
for (const l of db.prepare("SELECT draft, published FROM authored_lessons").all() as { draft: string; published: string | null }[]) {
  collect(parse(l.draft));
  collect(parse(l.published));
}
collect(contentLessons);

/** A short title from a description: its first clause, up to about 70 characters. */
const titleFromAlt = (alt: string) => {
  const first = alt.split(/[.;:]|, (?:with|while|as|and) /)[0].trim();
  return first.length > 70 ? `${first.slice(0, 67).replace(/\s+\S*$/, "")}…` : first;
};

let titled = 0;
let described = 0;
const stillNeeded: string[] = [];
const update = db.prepare("UPDATE uploads SET title = COALESCE(title, ?), alt = COALESCE(alt, ?) WHERE filename = ?");
for (const r of rows) {
  const credit = parse(r.credit) as { page?: string } | null;
  const fromName = titleFromFileName(r.original_name, credit);
  const portrait = portraits.get(r.filename);
  const placed = placedAlt.get(r.filename);
  const title = r.title ? null : (portrait?.title ?? (placed && !fromName ? titleFromAlt(placed) : null));
  const alt = r.alt ? null : (portrait?.alt ?? placed ?? (credit?.page && fromName ? altFromTitle(fromName) : null));
  if (title) titled++;
  if (alt) described++;
  if (!r.alt && !alt) stillNeeded.push(r.filename);
  if (write && (title || alt)) update.run(title, alt, r.filename);
}
console.log(`${rows.length} pictures in the library.`);
console.log(`${write ? "Gave" : "Would give"} ${titled} a title and ${described} a description.`);
console.log(`${stillNeeded.length} still need a description.`);
