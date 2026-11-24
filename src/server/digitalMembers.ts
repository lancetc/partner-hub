import "server-only";
import { allBlocks, type GuideDoc } from "@/lib/magazine";
import { charactersInBlock, CHARACTER_ROLES, normaliseName, type CharacterRole } from "@/lib/characters";
import { cleanProfile, type Profile } from "@/lib/story";
import { DIGITAL_MEMBERS, DIGITAL_GROUPS, type DigitalGroup } from "@/content/digitalMembers";
import { ensureCharacters } from "./characters";
import { learnerGuides } from "./magazine";
import { canAuthor, type User } from "./auth";
import type { Db } from "./db";

/*
  Digital Members (Community → Digital Members): the fictional people learners meet in training, introduced before
  they turn up in a scenario. Each is a row in the character photo library (docs/character-photos.md) with an
  introduction in content/digitalMembers.ts. Where a character has approved story canon (docs/story-plans.md) that
  the reader's audience may see, the profile shows it; otherwise only the introduction. Nothing here is a real person.

  "Where you'll meet them" is read from the published courses this reader can open, so it's never out of date and
  never names a course they can't see.
*/

type Row = { id: string; name: string; aliases: string; role: CharacterRole; portrait: string; alt: string; hidden: number };
type ProfileRow = { audience: string; revision: number };

export type DigitalMemberCard = {
  id: string;
  name: string;
  role: string;
  group: DigitalGroup;
  portrait: string;
  alt: string;
  hello: string;
  /** How they go about things: the caption under their picture in an article. */
  approach: string;
  tagline: string;
  themes: string[];
  /** How many published courses this reader can open name them. */
  courses: number;
};

const rows = (db: Db) => {
  ensureCharacters(db);
  return db.prepare("SELECT id, name, aliases, role, portrait, alt, hidden FROM characters").all() as Row[];
};

/** Published courses this reader can open, and the normalised names their scenarios use. */
function namedIn(db: Db, user: User, now: Date) {
  return learnerGuides(db, user, now).map((g) => {
    const r = db.prepare("SELECT r.doc FROM magazine_guides g JOIN magazine_revisions r ON r.id = g.revision_id WHERE g.id = ?").get(g.id) as
      { doc: string } | undefined;
    const names = new Set<string>();
    try {
      if (r)
        for (const b of allBlocks(JSON.parse(r.doc) as GuideDoc))
          for (const p of charactersInBlock(b as unknown as Record<string, unknown>)) names.add(normaliseName(p.name));
    } catch {
      // A revision that can't be read names nobody.
    }
    return { title: g.title, href: `/magazine/${g.slug}`, names };
  });
}

const namesOf = (r: Row) => [r.name, ...(JSON.parse(r.aliases) as string[])].map(normaliseName);

/** Everyone introduced, in the order the content file gives, for any signed-in reader. Hidden characters aren't shown. */
export function digitalMembers(db: Db, user: User, now: Date): { members: DigitalMemberCard[]; groups: typeof DIGITAL_GROUPS } {
  const byId = new Map(rows(db).map((r) => [r.id, r]));
  const courses = namedIn(db, user, now);
  const members = DIGITAL_MEMBERS.flatMap((m) => {
    const r = byId.get(m.id);
    if (!r || r.hidden) return [];
    const names = namesOf(r);
    return [
      {
        id: r.id,
        name: r.name,
        role: m.role || CHARACTER_ROLES[r.role],
        group: m.group,
        portrait: r.portrait,
        alt: r.alt,
        hello: m.hello,
        approach: m.approach,
        tagline: m.tagline,
        themes: m.themes,
        courses: courses.filter((c) => names.some((n) => c.names.has(n))).length,
      },
    ];
  });
  return { members, groups: DIGITAL_GROUPS };
}

/** One person's profile page: the introduction, approved canon this reader may see, people they know, and where to meet them. */
export function digitalMember(db: Db, user: User, id: string, now: Date) {
  const intro = DIGITAL_MEMBERS.find((m) => m.id === id);
  const all = rows(db);
  const r = all.find((x) => x.id === id);
  if (!intro || !r || r.hidden) return null;
  const p = db.prepare("SELECT audience, revision FROM character_profiles WHERE character_id = ?").get(id) as ProfileRow | undefined;
  let canon: Profile | null = null;
  if (p?.revision) {
    const audience = JSON.parse(p.audience) as string[];
    if (canAuthor(user) || !audience.length || audience.includes(user.audience)) {
      const rev = db.prepare("SELECT profile FROM character_revisions WHERE character_id = ? AND number = ?").get(id, p.revision) as
        { profile: string } | undefined;
      if (rev) canon = cleanProfile(JSON.parse(rev.profile));
    }
  }
  const introduced = new Set(DIGITAL_MEMBERS.map((m) => m.id));
  const visible = new Map(all.filter((x) => !x.hidden && introduced.has(x.id)).map((x) => [x.id, x]));
  const link = (otherId: string) => {
    const o = visible.get(otherId);
    return o ? { id: o.id, name: o.name, portrait: o.portrait } : null;
  };
  const names = namesOf(r);
  return {
    id: r.id,
    name: r.name,
    role: intro.role || CHARACTER_ROLES[r.role],
    group: intro.group,
    groupLabel: DIGITAL_GROUPS.find((g) => g.id === intro.group)?.label ?? "",
    portrait: r.portrait,
    alt: r.alt,
    hello: intro.hello,
    approach: intro.approach,
    tagline: intro.tagline,
    about: intro.about,
    themes: intro.themes,
    matters: canon?.matters || intro.matters || "",
    pronouns: canon?.pronouns ?? "",
    // People they know: from approved canon where there is some, else the introduction's own list.
    knows: (canon?.relationships.length
      ? canon.relationships.map((x) => ({ id: x.id, name: x.name, relation: x.relation, note: x.note }))
      : intro.knows.map((k) => ({ id: k.id, name: visible.get(k.id)?.name ?? k.id, relation: k.relation, note: k.note ?? "" }))
    ).map((k) => ({ ...k, member: link(k.id) })),
    meet: [
      ...new Map(
        [
          ...namedIn(db, user, now)
            .filter((c) => names.some((n) => c.names.has(n)))
            .map((c) => ({ title: c.title, href: c.href })),
          ...intro.meet,
        ].map((c) => [c.href, c]),
      ).values(),
    ],
    hasCanon: Boolean(canon),
  };
}
export type DigitalMemberProfile = NonNullable<ReturnType<typeof digitalMember>>;
