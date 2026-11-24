import "server-only";
import { allBlocks, type GuideDoc } from "@/lib/magazine";
import {
  charactersInBlock,
  cleanAliases,
  CHARACTER_ROLES,
  findCharacter,
  lookFromName,
  normaliseName,
  portraitAbout,
  portraitPrompt,
  type Character,
  type CharacterRole,
  type PortraitEntry,
  type PortraitStatus,
} from "@/lib/characters";
import { SEED_CHARACTERS } from "@/content/characters";
import { audit, ensureCharacterTable, type Db } from "./db";
import { HttpError, requireAuthor, type User } from "./auth";
import { openaiConfigured, startGeneration } from "./imageGen";

/*
  The character photo library (docs/character-photos.md). Authors keep a roster of the fictional people in
  training scenarios, each with one portrait from the image library. Portraits are generated with OpenAI in the
  background, one at a time, so a batch never holds up a page or a publish.

  When a course is published, every named person in its scenarios without a portrait is added to the roster (if
  they're new) and queued for a portrait. Readers get names and portrait addresses, nothing else.
*/

type Row = {
  id: string;
  name: string;
  aliases: string;
  role: CharacterRole;
  look: string;
  portrait: string;
  alt: string;
  hidden: number;
  status: PortraitStatus;
  error: string;
  origin: Character["origin"];
  created_at: string;
  updated_at: string;
};

const seeded = new WeakSet<object>();
/** The table, with the starter roster added once. An editor's changes to a starter character are kept. */
export function ensureCharacters(db: Db, now = new Date()) {
  ensureCharacterTable(db);
  if (seeded.has(db)) return;
  const at = now.toISOString();
  for (const c of SEED_CHARACTERS)
    db.prepare(
      "INSERT OR IGNORE INTO characters (id, name, aliases, role, look, portrait, alt, status, origin, created_at, updated_at) VALUES (?, ?, ?, ?, ?, ?, ?, ?, 'seed', ?, ?)",
    ).run(c.id, c.name, JSON.stringify(c.aliases), c.role, c.look, c.portrait ?? "", c.alt ?? "", c.portrait ? "ready" : "none", at, at);
  // Anything still "generating" well past OpenAI's three-minute limit was stopped part-way (a restart): let it be sent again.
  // Only stale ones, so a code reload in development never cancels a batch that's still running.
  const stale = new Date(now.getTime() - 10 * 60_000).toISOString();
  db.prepare(
    "UPDATE characters SET status = CASE WHEN portrait != '' THEN 'ready' ELSE 'none' END, updated_at = ? WHERE status = 'generating' AND updated_at < ?",
  ).run(at, stale);
  seeded.add(db);
}

const toCharacter = (r: Row): Character => ({
  id: r.id,
  name: r.name,
  aliases: JSON.parse(r.aliases) as string[],
  role: r.role,
  look: r.look,
  portrait: r.portrait,
  alt: r.alt,
  hidden: Boolean(r.hidden),
  status: r.status,
  error: r.error,
  origin: r.origin,
});
const all = (db: Db) => (db.prepare("SELECT * FROM characters ORDER BY name COLLATE NOCASE").all() as Row[]).map(toCharacter);
const one = (db: Db, id: string) => {
  const r = db.prepare("SELECT * FROM characters WHERE id = ?").get(id) as Row | undefined;
  return r ? toCharacter(r) : undefined;
};

/** For any signed-in reader: each character's names and portrait. Hidden characters and ones without a portrait aren't sent. */
export function portraitRoster(db: Db): { characters: PortraitEntry[] } {
  ensureCharacters(db);
  return {
    characters: all(db)
      .filter((c) => !c.hidden && c.portrait)
      .map((c) => ({ names: [c.name, ...c.aliases], portrait: c.portrait, alt: c.alt })),
  };
}

/** For authors: the whole roster, where each character appears, and whether OpenAI is connected. */
export function characterLibrary(db: Db, actor: User) {
  requireAuthor(actor);
  ensureCharacters(db);
  const guides = db.prepare("SELECT id, title, status, draft FROM magazine_guides WHERE status != 'archived'").all() as {
    id: string;
    title: string;
    status: string;
    draft: string;
  }[];
  // Which courses name each character, read from the blocks themselves, so "Mr Nguyen" never counts "Mrs Nguyen".
  const named = guides.map((g) => {
    const names = new Set<string>();
    try {
      for (const b of allBlocks(JSON.parse(g.draft) as GuideDoc))
        for (const p of charactersInBlock(b as unknown as Record<string, unknown>)) names.add(normaliseName(p.name));
    } catch {
      // A draft that can't be read names nobody.
    }
    return { id: g.id, title: g.title, names };
  });
  return {
    openai: openaiConfigured(),
    working: [...queued],
    characters: all(db).map((c) => ({
      ...c,
      usedIn: named.filter((g) => [c.name, ...c.aliases].some((n) => g.names.has(normaliseName(n)))).map((g) => ({ id: g.id, title: g.title })),
    })),
  };
}

const PORTRAIT_SRC = /^\/(api\/uploads\/[\w-]+\.(webp|png|jpe?g|gif)|images\/[\w/.-]+\.(webp|png|jpe?g|svg))$/;

/** Add or change a character: its names, role, look, and (optionally) a portrait picked from the image library. */
export function saveCharacter(db: Db, actor: User, input: Record<string, unknown>, now: Date) {
  requireAuthor(actor);
  ensureCharacters(db, now);
  const at = now.toISOString();
  const id = typeof input.id === "string" ? input.id : "";
  const existing = id ? one(db, id) : undefined;
  if (id && !existing) throw new HttpError(404, "That character isn’t in the library.");
  const name = typeof input.name === "string" ? input.name.trim().slice(0, 80) : (existing?.name ?? "");
  if (normaliseName(name).length < 2) throw new HttpError(400, "Give the character a name, as scenarios write it.");
  const aliases = cleanAliases(name, input.aliases ?? existing?.aliases);
  // A name already used by another character would make portraits ambiguous.
  const clash = findCharacter(
    all(db).filter((c) => c.id !== existing?.id),
    name,
  );
  const aliasClash = aliases
    .map((a) =>
      findCharacter(
        all(db).filter((c) => c.id !== existing?.id),
        a,
      ),
    )
    .find(Boolean);
  if (clash || aliasClash) throw new HttpError(409, `“${(clash ?? aliasClash)!.name}” already uses that name. Each name points to one character.`);
  const role = (Object.keys(CHARACTER_ROLES) as CharacterRole[]).includes(input.role as CharacterRole)
    ? (input.role as CharacterRole)
    : (existing?.role ?? "participant");
  const look = typeof input.look === "string" ? input.look.trim().slice(0, 600) : (existing?.look ?? "");
  let portrait = existing?.portrait ?? "";
  let alt = typeof input.alt === "string" ? input.alt.trim().slice(0, 200) : (existing?.alt ?? "");
  if (typeof input.portrait === "string") {
    if (input.portrait && !PORTRAIT_SRC.test(input.portrait)) throw new HttpError(400, "Choose the portrait from the image library.");
    portrait = input.portrait;
    if (portrait && !alt) alt = `Portrait of ${name}, a fictional character`;
  }
  const hidden = typeof input.hidden === "boolean" ? input.hidden : (existing?.hidden ?? false);
  const status: PortraitStatus = portrait ? "ready" : existing?.status === "generating" ? "generating" : "none";
  if (existing) {
    db.prepare(
      "UPDATE characters SET name = ?, aliases = ?, role = ?, look = ?, portrait = ?, alt = ?, hidden = ?, status = ?, error = '', updated_at = ? WHERE id = ?",
    ).run(name, JSON.stringify(aliases), role, look, portrait, alt, hidden ? 1 : 0, status, at, existing.id);
    audit(db, { actor: actor.id, event: "character.saved", entity: `character:${existing.id}`, at: now });
    return one(db, existing.id)!;
  }
  const fresh = newId(db, name);
  db.prepare(
    "INSERT INTO characters (id, name, aliases, role, look, portrait, alt, hidden, status, origin, created_at, updated_at) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, 'author', ?, ?)",
  ).run(fresh, name, JSON.stringify(aliases), role, look, portrait, alt, hidden ? 1 : 0, status, at, at);
  audit(db, { actor: actor.id, event: "character.added", entity: `character:${fresh}`, at: now });
  return one(db, fresh)!;
}

function newId(db: Db, name: string) {
  const base =
    normaliseName(name)
      .replace(/\s+/g, "-")
      .replace(/[^a-z0-9-]/g, "")
      .slice(0, 40) || "character";
  let id = base;
  for (let n = 2; db.prepare("SELECT 1 FROM characters WHERE id = ?").get(id); n++) id = `${base}-${n}`;
  return id;
}

// ---------------------------------------------------------------------------------------------
// Portraits, made in the background
// ---------------------------------------------------------------------------------------------

/** Characters being generated now or waiting their turn, in this server. */
const queued = new Set<string>();
let running = false;
const waiting: { db: Db; actor: User; id: string }[] = [];

/** Queue portraits for these characters. Returns at once; each portrait is made in turn. */
export function queuePortraits(db: Db, actor: User, ids: string[]) {
  requireAuthor(actor);
  if (!openaiConfigured()) throw new HttpError(503, "OpenAI isn’t connected. Add OPENAI_API_KEY to .env.local and restart the server.");
  const at = new Date().toISOString();
  const added: string[] = [];
  for (const id of ids) {
    const c = one(db, id);
    if (!c || queued.has(id)) continue;
    queued.add(id);
    waiting.push({ db, actor, id });
    db.prepare("UPDATE characters SET status = 'generating', error = '', updated_at = ? WHERE id = ?").run(at, id);
    added.push(id);
  }
  void drain();
  return { queued: added };
}

async function drain() {
  if (running) return;
  running = true;
  try {
    for (let job = waiting.shift(); job; job = waiting.shift()) {
      await makePortrait(job.db, job.actor, job.id).catch(() => undefined);
      queued.delete(job.id);
    }
  } finally {
    running = false;
  }
}

/** Makes one portrait with OpenAI, keeps it in the image library, and gives it to the character. */
export async function makePortrait(db: Db, actor: User, id: string) {
  const c = one(db, id);
  if (!c) return;
  const now = new Date();
  try {
    // Named and described for the library from the start: "Maya, character portrait", with alt text from her look.
    const out = await startGeneration(
      db,
      actor,
      { model: "openai", prompt: portraitPrompt(c), aspect: "1:1", quality: "medium", houseStyle: false, about: portraitAbout(c) },
      now,
    );
    const src = "photo" in out ? out.photo.src : "";
    if (!src) throw new Error("No picture came back.");
    const at = new Date().toISOString();
    // If someone chose a portrait by hand while this was being made, theirs stays; the new one is still in the library.
    const latest = one(db, id);
    if (latest?.status !== "generating") return;
    db.prepare("UPDATE characters SET portrait = ?, alt = ?, status = 'ready', error = '', updated_at = ? WHERE id = ?").run(
      src,
      `Portrait of ${c.name}, a fictional character`,
      at,
      id,
    );
    audit(db, { actor: actor.id, event: "character.portrait_generated", entity: `character:${id}`, next: { src }, at: new Date() });
  } catch (e) {
    db.prepare("UPDATE characters SET status = 'failed', error = ?, updated_at = ? WHERE id = ?").run(
      (e instanceof Error ? e.message : "It didn’t work.").slice(0, 300),
      new Date().toISOString(),
      id,
    );
  }
}

/** Every visible character without a portrait (or whose last try failed). */
export function missingPortraits(db: Db) {
  ensureCharacters(db);
  return all(db)
    .filter((c) => !c.hidden && !c.portrait && c.status !== "generating")
    .map((c) => c.id);
}

/**
  After a course is published: add anyone its scenarios name who isn't in the roster, and queue a portrait for
  everyone named who doesn't have one. Never stops a publish: if OpenAI isn't connected, they're simply listed.
*/
export function charactersAfterPublish(db: Db, actor: User, doc: GuideDoc, now: Date) {
  try {
    ensureCharacters(db, now);
    const roster = all(db);
    const want = new Set<string>();
    const at = now.toISOString();
    for (const b of allBlocks(doc))
      for (const p of charactersInBlock(b as unknown as Record<string, unknown>)) {
        const known = findCharacter(roster, p.name);
        if (known) {
          if (!known.hidden && !known.portrait) want.add(known.id);
          continue;
        }
        const id = newId(db, p.name);
        const look = lookFromName(p.name, p.age, p.about, p.role);
        db.prepare(
          "INSERT INTO characters (id, name, aliases, role, look, status, origin, created_at, updated_at) VALUES (?, ?, '[]', ?, ?, 'none', 'publish', ?, ?)",
        ).run(id, p.name, p.role, look, at, at);
        roster.push(one(db, id)!);
        want.add(id);
      }
    if (want.size && openaiConfigured()) queuePortraits(db, actor, [...want]);
    return [...want];
  } catch {
    return [];
  }
}
