import "server-only";
import { ATLAS_TOPICS, TOWNS, type AtlasTopic, type TownId } from "@/content/communityAtlas";
import { HttpError, type User } from "./auth";
import { audit, type Db } from "./db";
import { pictureUrl } from "./profilePictures";
import { serviceTypes } from "@/content/onboarding";

/*
  Real members on the Community Atlas (Community → Atlas), only for people who chose to appear: the box in
  Profile and settings. Nobody is on it by default.

  What's kept is what's shown: the nearest town from the Atlas's list (never an address, never a device location),
  up to three topics, and what they can help with or would like help with. Turning it off deletes the row; nothing
  lingers. Their organisation is shown only if they tick that too. Any signed-in person can see who has joined.
*/

const SCHEMA = `
CREATE TABLE IF NOT EXISTS atlas_members (
  user_id TEXT PRIMARY KEY REFERENCES users(id),
  town TEXT NOT NULL,
  topics TEXT NOT NULL,
  can_help TEXT NOT NULL,
  asking TEXT NOT NULL,
  show_org INTEGER NOT NULL DEFAULT 0,
  updated_at TEXT NOT NULL
);`;
const ready = new WeakSet<object>();
function ensure(db: Db) {
  if (ready.has(db)) return;
  db.exec(SCHEMA);
  ready.add(db);
}

export const MAX_TOPICS = 3;

export type MyAtlas = { town: TownId; topics: AtlasTopic[]; canHelp: AtlasTopic[]; askingAbout: AtlasTopic[]; showOrg: boolean };

/** A member on the Atlas, as everyone sees them. */
export type AtlasMember = {
  id: string;
  name: string;
  role: string;
  org: string | null;
  portrait: string;
  town: TownId;
  topics: AtlasTopic[];
  canHelp: AtlasTopic[];
  askingAbout: AtlasTopic[];
  you: boolean;
};

type Row = { user_id: string; town: string; topics: string; can_help: string; asking: string; show_org: number };

/** "Care Partner · Cleaning", from their audience and the service they deliver (content/onboarding). */
const roleOf = (u: { audience: string; service_role: string | null }) => {
  const base = u.audience === "staff" ? "Trilogy Care staff" : u.audience === "coordinator" ? "Care coordinator" : "Care Partner";
  const service = serviceTypes.find((t) => t.id === u.service_role)?.label;
  return service ? `${base} · ${service}` : base;
};

const topicsFrom = (json: string) => (JSON.parse(json) as string[]).filter((t): t is AtlasTopic => (ATLAS_TOPICS as readonly string[]).includes(t));

/** Your own Atlas settings, or null when you haven't joined. */
export function myAtlas(db: Db, user: User): MyAtlas | null {
  ensure(db);
  const r = db.prepare("SELECT * FROM atlas_members WHERE user_id = ?").get(user.id) as Row | undefined;
  if (!r || !(r.town in TOWNS)) return null;
  return {
    town: r.town as TownId,
    topics: topicsFrom(r.topics),
    canHelp: topicsFrom(r.can_help),
    askingAbout: topicsFrom(r.asking),
    showOrg: r.show_org === 1,
  };
}

/** Join the Atlas, or change what it shows. Everything is checked: a listed town, listed topics, and no more than three. */
export function saveMyAtlas(db: Db, user: User, input: Partial<Record<keyof MyAtlas, unknown>>, now: Date): MyAtlas {
  ensure(db);
  const town = String(input.town ?? "");
  if (!(town in TOWNS)) throw new HttpError(400, "Choose the town nearest to you from the list.");
  const pick = (v: unknown) => [...new Set(Array.isArray(v) ? v.map(String) : [])];
  const topics = pick(input.topics);
  if (!topics.length) throw new HttpError(400, "Choose at least one topic you talk about.");
  if (topics.length > MAX_TOPICS) throw new HttpError(400, `Choose up to ${MAX_TOPICS} topics.`);
  if (topics.some((t) => !(ATLAS_TOPICS as readonly string[]).includes(t))) throw new HttpError(400, "Choose topics from the list.");
  // Helping and asking are about the topics you talk about.
  const canHelp = pick(input.canHelp).filter((t) => topics.includes(t));
  const askingAbout = pick(input.askingAbout).filter((t) => topics.includes(t));
  const showOrg = input.showOrg === true;
  const joined = myAtlas(db, user) === null;
  db.prepare(
    `INSERT INTO atlas_members (user_id, town, topics, can_help, asking, show_org, updated_at) VALUES (?, ?, ?, ?, ?, ?, ?)
     ON CONFLICT(user_id) DO UPDATE SET town = excluded.town, topics = excluded.topics, can_help = excluded.can_help, asking = excluded.asking,
       show_org = excluded.show_org, updated_at = excluded.updated_at`,
  ).run(user.id, town, JSON.stringify(topics), JSON.stringify(canHelp), JSON.stringify(askingAbout), showOrg ? 1 : 0, now.toISOString());
  // The audit notes that someone joined or changed it, not where they are.
  audit(db, { actor: user.id, event: joined ? "atlas.join" : "atlas.update", entity: `user:${user.id}`, at: now });
  return myAtlas(db, user)!;
}

/** Leave the Atlas: the row goes, so nothing about where you are is kept. */
export function leaveAtlas(db: Db, user: User, now: Date) {
  ensure(db);
  const gone = db.prepare("DELETE FROM atlas_members WHERE user_id = ?").run(user.id).changes > 0;
  if (gone) audit(db, { actor: user.id, event: "atlas.leave", entity: `user:${user.id}`, at: now });
  return { left: gone };
}

/** Everyone who has joined, for any signed-in reader. Only what each person chose to show. */
export function atlasMembers(db: Db, user: User): AtlasMember[] {
  ensure(db);
  const rows = db
    .prepare(
      `SELECT a.*, u.name, u.audience, u.service_role, u.avatar, o.name AS org_name
       FROM atlas_members a JOIN users u ON u.id = a.user_id LEFT JOIN orgs o ON o.id = u.org_id
       ORDER BY u.name`,
    )
    .all() as (Row & { name: string; audience: string; service_role: string | null; avatar: string | null; org_name: string | null })[];
  return rows
    .filter((r) => r.town in TOWNS)
    .map((r) => ({
      id: r.user_id,
      name: r.name,
      role: roleOf(r),
      org: r.show_org === 1 ? r.org_name : null,
      portrait: pictureUrl(r.avatar) ?? "",
      town: r.town as TownId,
      topics: topicsFrom(r.topics),
      canHelp: topicsFrom(r.can_help),
      askingAbout: topicsFrom(r.asking),
      you: r.user_id === user.id,
    }));
}
