import "server-only";
import { lessons as contentLessons, type Lesson } from "@/content/lessons";
import { allBlocks, type GuideDoc } from "@/lib/magazine";
import { charactersInBlock, cleanAliases, findCharacter, normaliseName, type Character, type CharacterRole, type PortraitStatus } from "@/lib/characters";
import {
  lowerWords,
  peopleInText,
  plainProse,
  suggestedLook,
  lookSaysWho,
  type Evidence,
  type Gender,
  type NamedHint,
  type PersonInText,
  type TextPiece,
} from "@/lib/peopleInText";
import { audit, type Db } from "./db";
import { HttpError, requireAuthor, type User } from "./auth";
import { ensureCharacters, queuePortraits } from "./characters";
import { openaiConfigured } from "./imageGen";

/*
  People in your content (docs/character-photos.md): the named fictional people in every live Topic and Magazine course,
  matched against the character library, so each has one official portrait. The audit only reads; adding people to the
  library is free, and a portrait (paid, OpenAI) is only ever made when an author asks or a Topic is published.
*/

/** What one portrait costs: OpenAI, square, medium quality (about US$0.04 each). An estimate, not a bill. */
export const PORTRAIT_COST_USD = 0.04;

export type ContentDoc = {
  kind: "topic" | "course";
  /** The Topic's slug, or the course's id. */
  id: string;
  slug: string;
  title: string;
  editions: ("draft" | "published")[];
  pieces: TextPiece[];
  hints: NamedHint[];
};

/** Keys whose strings aren't prose: addresses, ids, code, settings, and the Hub's own users (owners, reviewers, approvers). */
const SKIP_KEYS = new Set(
  (
    "id slug src url href html poster mp4 next type kind provider tone icon variant request captionsVtt captions scriptHash stage theme themeId version owner " +
    "reviewDate cardId credit audioSrc guide block position layout textTone gradient visual audiences track alt by approvedBy approver reviewer reviewOwner " +
    "recordedBy checkedBy setBy endorsedBy publishedBy updatedBy uploadedBy sme themeOwner decisionMaker responsible voice model photo figure pdf bubbles labRef " +
    "sceneRef pivotRef image cover video audio file files hash ref refs actor lane badge code codes key keys pageId sectionId snippetId fieldId missingId ruleId " +
    "factId factIds sourceId sourceIds evidenceIds lineId serviceId threadId postIds postId commentId optionId familyId scenarioId pathId policyId milestoneId " +
    "ruleSetId moveId moveTo tileIds approval approved origin source sources reference references issuer"
  ).split(" "),
);
/** Keys that hold a person: a role-play speaker, who a message is from, a scenario's character. */
const SPEAKER_KEYS = new Set(["speaker", "character", "who", "person", "client", "participant", "from", "caller", "name", "family", "supporter", "manager"]);

/** The prose in a Topic or a course, field by field. */
export function proseIn(value: unknown, into: TextPiece[] = [], key = ""): TextPiece[] {
  if (typeof value === "string") {
    const t = value.trim();
    // Ids, dates and addresses aren't prose.
    if (t.length < 2 || /^[a-z0-9_:.-]+$/.test(t) || /^\d{4}-\d{2}/.test(t) || /^(?:https?:|\/|data:)/.test(t)) return into;
    into.push({ text: t, speaker: SPEAKER_KEYS.has(key) });
  } else if (Array.isArray(value)) for (const v of value) proseIn(v, into, key);
  else if (value && typeof value === "object") for (const [k, v] of Object.entries(value)) if (!SKIP_KEYS.has(k)) proseIn(v, into, k);
  return into;
}

const lessonProse = (l: Lesson) =>
  proseIn({ title: l.title, summary: l.summary, outcome: l.outcome, completionMessage: l.completionMessage, nodes: Object.values(l.nodes ?? {}) });

function guideProse(doc: GuideDoc) {
  const pieces = proseIn(doc.pages);
  const hints: NamedHint[] = [];
  for (const b of allBlocks(doc)) hints.push(...charactersInBlock(b as unknown as Record<string, unknown>));
  return { pieces, hints };
}

/** Both editions' prose once each: a draft that repeats the published text doesn't count its names twice. */
function merged(parts: TextPiece[][]) {
  const seen = new Set<string>();
  return parts.flat().filter((p) => (seen.has(p.text) ? false : (seen.add(p.text), true)));
}

/** Every live Topic (draft and published) and every Magazine course that isn't archived (draft and published edition). */
export function contentDocs(db: Db): ContentDoc[] {
  const docs: ContentDoc[] = [];
  const rows = db.prepare("SELECT slug, draft, published, deleted_at FROM authored_lessons").all() as {
    slug: string;
    draft: string;
    published: string | null;
    deleted_at: string | null;
  }[];
  const authored = new Set(rows.map((r) => r.slug));
  for (const r of rows) {
    if (r.deleted_at) continue;
    try {
      const draft = JSON.parse(r.draft) as Lesson;
      const live = r.published ? (JSON.parse(r.published) as Lesson) : null;
      docs.push({
        kind: "topic",
        id: r.slug,
        slug: r.slug,
        title: (live ?? draft).title || r.slug,
        editions: live ? ["draft", "published"] : ["draft"],
        pieces: merged([lessonProse(draft), live ? lessonProse(live) : []]),
        hints: [],
      });
    } catch {
      // A topic that can't be read names nobody.
    }
  }
  // Topics still only in the content files.
  for (const l of contentLessons)
    if (!authored.has(l.slug) && !docs.some((d) => d.id === l.slug))
      docs.push({ kind: "topic", id: l.slug, slug: l.slug, title: l.title, editions: ["published"], pieces: lessonProse(l), hints: [] });
  const guides = db
    .prepare(
      "SELECT g.id, g.slug, g.title, g.draft, r.doc FROM magazine_guides g LEFT JOIN magazine_revisions r ON r.id = g.revision_id WHERE g.status != 'archived'",
    )
    .all() as { id: string; slug: string; title: string; draft: string; doc: string | null }[];
  for (const g of guides) {
    try {
      const draft = guideProse(JSON.parse(g.draft) as GuideDoc);
      const live = g.doc ? guideProse(JSON.parse(g.doc) as GuideDoc) : null;
      docs.push({
        kind: "course",
        id: g.id,
        slug: g.slug,
        title: g.title,
        editions: live ? ["draft", "published"] : ["draft"],
        pieces: merged([[{ text: g.title }], draft.pieces, live?.pieces ?? []]),
        hints: [...draft.hints, ...(live?.hints ?? [])],
      });
    } catch {
      // A course that can't be read names nobody.
    }
  }
  return docs;
}

type LibraryRow = Pick<Character, "id" | "name" | "aliases" | "role" | "look" | "portrait" | "hidden" | "status">;
function library(db: Db): LibraryRow[] {
  try {
    return (
      db.prepare("SELECT id, name, aliases, role, look, portrait, hidden, status FROM characters").all() as (Omit<LibraryRow, "aliases" | "hidden"> & {
        aliases: string;
        hidden: number;
      })[]
    ).map((r) => ({ ...r, aliases: JSON.parse(r.aliases) as string[], hidden: Boolean(r.hidden) }));
  } catch {
    return [];
  }
}

/** The Hub's own users: real people, never characters. */
const userNames = (db: Db) => (db.prepare("SELECT name FROM users").all() as { name: string }[]).map((u) => u.name).filter((n) => n.includes(" "));

// ---------------------------------------------------------------------------------------------
// Dismissed names: an author's "this isn't a person" (a place or a product the finder took for one)
// ---------------------------------------------------------------------------------------------

export function ensureDismissals(db: Db) {
  db.exec("CREATE TABLE IF NOT EXISTS character_dismissals (name_key TEXT PRIMARY KEY, name TEXT NOT NULL, by TEXT NOT NULL, at TEXT NOT NULL)");
}
function dismissedKeys(db: Db) {
  try {
    return new Set((db.prepare("SELECT name_key FROM character_dismissals").all() as { name_key: string }[]).map((r) => r.name_key));
  } catch {
    return new Set<string>();
  }
}

// ---------------------------------------------------------------------------------------------
// The audit
// ---------------------------------------------------------------------------------------------

export type PersonState = "missing" | "no-portrait" | "ready" | "hidden" | "dismissed";
export type ContentPerson = {
  /** The library character's id, or the normalised name for someone not in it. */
  key: string;
  name: string;
  aliases: string[];
  role: CharacterRole;
  gender: Gender;
  age: number | null;
  quote: string;
  evidence: Evidence[];
  mentions: number;
  look: string;
  where: { kind: ContentDoc["kind"]; id: string; slug: string; title: string; editions: ContentDoc["editions"] }[];
  library: { id: string; name: string; status: PortraitStatus; portrait: boolean; hidden: boolean; look: string } | null;
  state: PersonState;
  /** A library character this may be another way of writing. */
  maybe?: { id: string; name: string } | null;
};

/** The people one Topic or course names, read with the roster's names and the content's own vocabulary. */
export function peopleInDoc(doc: Pick<ContentDoc, "pieces" | "hints">, roster: LibraryRow[], opts: { vocabulary?: Set<string>; exclude?: string[] } = {}) {
  return peopleInText(doc.pieces, doc.hints, {
    vocabulary: opts.vocabulary,
    known: roster.flatMap((c) => [c.name, ...c.aliases]),
    exclude: opts.exclude,
  });
}

const libraryFor = (roster: LibraryRow[], p: Pick<PersonInText, "name" | "aliases">) =>
  findCharacter(roster, p.name) ?? p.aliases.map((a) => findCharacter(roster, a)).find(Boolean);

/**
  Every named person in every live Topic and Magazine course, matched against the character library. Read-only: it
  never adds, changes or generates anything.
*/
export function auditPeople(db: Db, docs = contentDocs(db)) {
  const roster = library(db);
  const dismissed = dismissedKeys(db);
  const exclude = userNames(db);
  // One vocabulary for everything: a word written in lower case anywhere is an ordinary word.
  const vocabulary = lowerWords(docs.flatMap((d) => d.pieces.map((p) => plainProse(p.text))));
  const found = new Map<string, ContentPerson & { votes: { gender: Gender; role: CharacterRole; scenario: boolean; sure: boolean }[]; about: string }>();
  for (const d of docs) {
    for (const p of peopleInDoc(d, roster, { vocabulary, exclude })) {
      const lib = libraryFor(roster, p);
      // Someone not in the library may be written in another way elsewhere ("Bruce" here, "Bruce Harding" there).
      const key =
        lib?.id ??
        [...found.keys()].find(
          (k) => !roster.some((c) => c.id === k) && [found.get(k)!.name, ...found.get(k)!.aliases].some((n) => normaliseName(n) === normaliseName(p.name)),
        ) ??
        normaliseName(p.name);
      const at = { kind: d.kind, id: d.id, slug: d.slug, title: d.title, editions: d.editions };
      const vote = { gender: p.gender, role: p.role, scenario: p.evidence.includes("scenario"), sure: p.roleSure };
      const had = found.get(key);
      if (had) {
        had.aliases = [...new Set([...had.aliases, ...p.aliases, ...(normaliseName(p.name) !== normaliseName(had.name) ? [p.name] : [])])].filter(
          (a) => normaliseName(a) !== normaliseName(had.name),
        );
        // The fuller name leads: "Bruce Harding" rather than "Bruce".
        if (!lib && p.name.split(" ").length > had.name.split(" ").length) {
          had.aliases = [...new Set([had.name, ...had.aliases.filter((a) => normaliseName(a) !== normaliseName(p.name))])];
          had.name = p.name;
        }
        if (!had.where.some((w) => w.kind === d.kind && w.id === d.id)) had.where.push(at);
        had.mentions += p.mentions;
        had.evidence = [...new Set([...had.evidence, ...p.evidence])];
        had.votes.push(vote);
        had.age ??= p.age;
        had.about ||= p.about;
        continue;
      }
      found.set(key, {
        key,
        name: lib?.name ?? p.name,
        aliases: lib ? [] : p.aliases,
        role: p.role,
        gender: p.gender,
        age: p.age,
        quote: p.quote,
        evidence: p.evidence,
        mentions: p.mentions,
        look: "",
        where: [at],
        library: lib ? { id: lib.id, name: lib.name, status: lib.status, portrait: Boolean(lib.portrait), hidden: lib.hidden, look: lib.look } : null,
        state: "missing",
        votes: [vote],
        about: p.about,
      });
    }
  }
  const people: ContentPerson[] = [...found.values()].map(({ votes, about, ...p }) => {
    // Man or woman only when the content agrees; the role a scenario gives wins, otherwise the most common guess.
    const genders = new Set(votes.map((v) => v.gender).filter((g) => g !== "unknown"));
    const gender: Gender = genders.size === 1 ? [...genders][0] : "unknown";
    const roles = votes.filter((v) => v.scenario).map((v) => v.role);
    // A role the content states outweighs a default one.
    const tally = new Map<CharacterRole, number>();
    for (const v of votes) tally.set(v.role, (tally.get(v.role) ?? 0) + (v.sure ? 10 : 1));
    const role = roles[0] ?? [...tally.entries()].sort((a, b) => b[1] - a[1])[0][0];
    const names = [p.name, ...p.aliases, ...(p.library ? [p.library.name] : [])].map(normaliseName);
    const state: PersonState = names.some((n) => dismissed.has(n))
      ? "dismissed"
      : !p.library
        ? "missing"
        : p.library.hidden
          ? "hidden"
          : p.library.portrait
            ? "ready"
            : "no-portrait";
    // A first name alone that's the first name of exactly one character ("Hana" and Hana Mitchell) is probably them.
    const alike =
      p.library || p.name.includes(" ") ? [] : roster.filter((c) => c.name.includes(" ") && normaliseName(c.name).split(" ")[0] === normaliseName(p.name));
    const maybe = alike.length === 1 ? { id: alike[0].id, name: alike[0].name } : null;
    return { ...p, gender, role, look: p.library?.look || suggestedLook({ gender, role, age: p.age, about }), state, maybe };
  });
  people.sort((a, b) => b.where.length - a.where.length || b.mentions - a.mentions || a.name.localeCompare(b.name));
  const count = (s: PersonState) => people.filter((p) => p.state === s).length;
  // A portrait is only made for someone the content says is a man or a woman; the rest need a description first.
  const portraitable = people.filter((p) => (p.state === "missing" || p.state === "no-portrait") && lookSaysWho(p.look));
  return {
    topics: docs.filter((d) => d.kind === "topic").length,
    courses: docs.filter((d) => d.kind === "course").length,
    counts: {
      found: people.length,
      ready: count("ready"),
      noPortrait: count("no-portrait"),
      missing: count("missing"),
      hidden: count("hidden"),
      dismissed: count("dismissed"),
      needsDescription: people.filter((p) => (p.state === "missing" || p.state === "no-portrait") && !lookSaysWho(p.look)).length,
    },
    cost: { each: PORTRAIT_COST_USD, portraits: portraitable.length, total: Math.round(portraitable.length * PORTRAIT_COST_USD * 100) / 100 },
    people,
  };
}
export type PeopleAudit = ReturnType<typeof auditPeople>;

/** For the Character photos page: everyone found who isn't in the library or has no portrait, and what's been dismissed. */
export function peopleToAdd(db: Db, actor: User) {
  requireAuthor(actor);
  ensureCharacters(db);
  ensureDismissals(db);
  const a = auditPeople(db);
  return {
    ...a,
    openai: openaiConfigured(),
    people: a.people.filter((p) => p.state === "missing" || p.state === "no-portrait"),
    dismissed: a.people.filter((p) => p.state === "dismissed").map((p) => ({ key: p.key, name: p.name, where: p.where.length })),
  };
}

// ---------------------------------------------------------------------------------------------
// Adding people to the library (free) and making portraits (paid, confirmed by the author)
// ---------------------------------------------------------------------------------------------

type Queue = (db: Db, actor: User, ids: string[]) => { queued: string[] };

function newCharacterId(db: Db, name: string) {
  const base =
    normaliseName(name)
      .replace(/\s+/g, "-")
      .replace(/[^a-z0-9-]/g, "")
      .slice(0, 40) || "character";
  let id = base;
  for (let n = 2; db.prepare("SELECT 1 FROM characters WHERE id = ?").get(id); n++) id = `${base}-${n}`;
  return id;
}

/** Adds one person to the library, with only the other spellings no one else uses. Returns the new character's id. */
function insertCharacter(
  db: Db,
  p: { name: string; aliases: string[]; role: CharacterRole; look: string },
  origin: "publish" | "author",
  at: string,
  roster: LibraryRow[],
) {
  const aliases = cleanAliases(p.name, p.aliases).filter((a) => !findCharacter(roster, a));
  const id = newCharacterId(db, p.name);
  db.prepare("INSERT INTO characters (id, name, aliases, role, look, status, origin, created_at, updated_at) VALUES (?, ?, ?, ?, ?, 'none', ?, ?, ?)").run(
    id,
    p.name.trim().slice(0, 80),
    JSON.stringify(aliases),
    p.role,
    p.look.slice(0, 600),
    origin,
    at,
    at,
  );
  roster.push({ id, name: p.name, aliases, role: p.role, look: p.look, portrait: "", hidden: false, status: "none" });
  return id;
}

/**
  The author's actions on "People in your content": add someone (or everyone) to the library, which is free; make
  portraits, which is paid and needs `confirm: true`; dismiss a name that isn't a person, or bring it back.
*/
export function actOnPeople(db: Db, actor: User, input: Record<string, unknown>, now: Date, queue: Queue = queuePortraits) {
  requireAuthor(actor);
  ensureCharacters(db, now);
  ensureDismissals(db);
  const at = now.toISOString();
  const action = String(input.action ?? "");
  const keys = Array.isArray(input.keys) ? input.keys.filter((x): x is string => typeof x === "string").slice(0, 200) : [];
  if (action === "dismiss" || action === "restore") {
    const a = auditPeople(db);
    for (const k of keys) {
      const p = a.people.find((x) => x.key === k);
      const names = p ? [p.name, ...p.aliases] : [k];
      for (const n of names) {
        if (action === "dismiss")
          db.prepare("INSERT OR REPLACE INTO character_dismissals (name_key, name, by, at) VALUES (?, ?, ?, ?)").run(normaliseName(n), n, actor.id, at);
        else db.prepare("DELETE FROM character_dismissals WHERE name_key = ?").run(normaliseName(n));
      }
      audit(db, {
        actor: actor.id,
        event: `character.${action === "dismiss" ? "dismissed" : "restored"}`,
        entity: `character-name:${normaliseName(names[0])}`,
        at: now,
      });
    }
    return { done: keys.length };
  }
  if (action === "same-as") {
    // "Hana" is Hana Mitchell: the name joins that character's other spellings, so her portrait shows there too.
    const roster = library(db);
    const target = roster.find((c) => c.id === input.id);
    const p = auditPeople(db).people.find((x) => x.key === keys[0]);
    if (!target || !p) throw new HttpError(404, "That person or character isn’t there any more.");
    const extra = [p.name, ...p.aliases].filter((n) => !findCharacter(roster, n));
    const aliases = cleanAliases(target.name, [...target.aliases, ...extra]);
    db.prepare("UPDATE characters SET aliases = ?, updated_at = ? WHERE id = ?").run(JSON.stringify(aliases), at, target.id);
    audit(db, { actor: actor.id, event: "character.saved", entity: `character:${target.id}`, next: { aliases }, at: now });
    return { aliases };
  }
  if (action !== "add" && action !== "add-all" && action !== "portrait" && action !== "portrait-all") throw new HttpError(400, "Unknown action.");
  const paid = action === "portrait" || action === "portrait-all";
  if (paid && input.confirm !== true) throw new HttpError(400, "Confirm the cost before making portraits.");
  if (paid && !openaiConfigured()) throw new HttpError(503, "OpenAI isn’t connected. Add OPENAI_API_KEY to .env.local and restart the server.");
  const a = auditPeople(db);
  const open = a.people.filter((p) => p.state === "missing" || p.state === "no-portrait");
  const chosen = action === "add-all" || action === "portrait-all" ? open : open.filter((p) => keys.includes(p.key));
  // The author can correct the role and look for one person before adding them.
  const edits = (input.edits && typeof input.edits === "object" ? input.edits : {}) as Record<string, { role?: unknown; look?: unknown }>;
  const roster = library(db);
  const added: string[] = [];
  const ids: string[] = [];
  const needsDescription: string[] = [];
  for (const p of chosen) {
    const e = edits[p.key] ?? {};
    const role =
      typeof e.role === "string" && ["participant", "family", "worker", "coordinator", "other"].includes(e.role) ? (e.role as CharacterRole) : p.role;
    const look = typeof e.look === "string" && e.look.trim() ? e.look.trim().slice(0, 600) : p.look;
    let id = p.library?.id;
    if (!id) {
      if (findCharacter(roster, p.name)) continue;
      id = insertCharacter(db, { name: p.name, aliases: p.aliases, role, look }, "author", at, roster);
      audit(db, { actor: actor.id, event: "character.added", entity: `character:${id}`, at: now });
      added.push(p.name);
    } else if (typeof e.look === "string" && e.look.trim()) {
      db.prepare("UPDATE characters SET look = ?, role = ?, updated_at = ? WHERE id = ?").run(look, role, at, id);
    }
    if (paid) {
      if (lookSaysWho(look)) ids.push(id);
      else needsDescription.push(p.name);
    }
  }
  const queued = ids.length ? queue(db, actor, ids).queued : [];
  return { added, queued: queued.length, needsDescription, cost: Math.round(queued.length * PORTRAIT_COST_USD * 100) / 100 };
}

// ---------------------------------------------------------------------------------------------
// Topics: new people join the library when a Topic is published or drafted by AI
// ---------------------------------------------------------------------------------------------

export type TopicPerson = { name: string; state: "ready" | "making" | "will-make" | "needs-description" | "failed" };

/** The people a Topic names, and where each stands in the library: for the notice in the editor's publish step. */
export function topicPeople(db: Db, actor: User, lesson: Lesson): TopicPerson[] {
  requireAuthor(actor);
  ensureCharacters(db);
  const roster = library(db);
  const dismissed = dismissedKeys(db);
  return peopleInDoc({ pieces: lessonProse(lesson), hints: [] }, roster, { exclude: userNames(db) })
    .filter((p) => ![p.name, ...p.aliases].some((n) => dismissed.has(normaliseName(n))))
    .map((p): TopicPerson => {
      const lib = libraryFor(roster, p);
      if (lib?.portrait) return { name: lib.name, state: "ready" };
      if (lib?.status === "generating") return { name: lib.name, state: "making" };
      if (lib?.status === "failed") return { name: lib.name, state: "failed" };
      const look = lib?.look ?? suggestedLook(p);
      return { name: lib?.name ?? p.name, state: lookSaysWho(look) ? "will-make" : "needs-description" };
    });
}

/**
  After a Topic is published or first saved from an AI draft: anyone it names who isn't in the library is added, and a
  portrait is queued for each person without one, but only when the content says they're a man or a woman (as for a
  Magazine course, server/characters charactersAfterPublish). The rest wait on the Character photos page for a
  description. Never stops a publish.
*/
export function charactersAfterTopic(db: Db, actor: User, lesson: Lesson, now: Date, queue: Queue = queuePortraits) {
  const out = { added: [] as string[], queued: [] as string[], needsDescription: [] as string[] };
  try {
    ensureCharacters(db, now);
    const roster = library(db);
    const dismissed = dismissedKeys(db);
    const at = now.toISOString();
    const want = new Map<string, string>();
    for (const p of peopleInDoc({ pieces: lessonProse(lesson), hints: [] }, roster, { exclude: userNames(db) })) {
      if ([p.name, ...p.aliases].some((n) => dismissed.has(normaliseName(n)))) continue;
      const known = libraryFor(roster, p);
      if (known) {
        if (known.hidden || known.portrait || known.status === "generating") continue;
        if (lookSaysWho(known.look)) want.set(known.id, known.name);
        else out.needsDescription.push(known.name);
        continue;
      }
      const look = suggestedLook(p);
      const id = insertCharacter(db, { name: p.name, aliases: p.aliases, role: p.role, look }, "publish", at, roster);
      audit(db, { actor: actor.id, event: "character.added", entity: `character:${id}`, reason: `Named in the Topic ${lesson.slug}`, at: now });
      out.added.push(p.name);
      if (lookSaysWho(look)) want.set(id, p.name);
      else out.needsDescription.push(p.name);
    }
    if (want.size && openaiConfigured()) {
      const q = queue(db, actor, [...want.keys()]).queued;
      out.queued = q.map((id) => want.get(id)!);
    }
  } catch {
    // The library never holds up a publish.
  }
  return out;
}

/** A Topic Claude drafted: its cards carry the build stage they were written for. */
export const aiDrafted = (l: Lesson) => Object.values(l.nodes ?? {}).some((c) => Boolean(c.stage));
