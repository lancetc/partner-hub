import "server-only";
import { audit, type Db } from "./db";
import { HttpError, requireAuthor, type User } from "./auth";
import { DEFAULT_PRESENTER, type IntroPicture, type PresenterProfile } from "@/lib/topicIntro";
import type { MediaProvider } from "@/lib/mediaStudio";

/*
  Presenter profiles for Topic Video Introductions (docs/topic-video-introductions.md): who presents, kept apart from any
  one Topic, so one presenter can introduce many Topics and a Topic can have its own. Each has a placeholder portrait
  (from the image library), the video provider and its avatar, voice and template ids, language and accent, and delivery
  style. One is the default. Ava, the AI Learning Guide, is a separate character and is never the default.
*/

type Row = {
  id: string;
  name: string;
  description: string;
  portrait: string;
  provider: string;
  avatar_id: string;
  voice_id: string;
  template_id: string;
  language: string;
  accent: string;
  delivery_style: string;
  audience: string;
  active: number;
  is_default: number;
  created_by: string;
  created_at: string;
  updated_at: string;
};

const PROVIDERS: MediaProvider[] = ["synthesia", "elevenlabs", "upload", "none"];
const ready = new WeakSet<Db>();

/** The table, made (and the default presenter seeded) the first time it's needed, so a running server picks it up. */
export function ensurePresenters(db: Db) {
  if (ready.has(db)) return;
  db.exec(`CREATE TABLE IF NOT EXISTS intro_presenters (
    id TEXT PRIMARY KEY, name TEXT NOT NULL, description TEXT NOT NULL DEFAULT '', portrait TEXT NOT NULL,
    provider TEXT NOT NULL DEFAULT 'synthesia', avatar_id TEXT NOT NULL DEFAULT '', voice_id TEXT NOT NULL DEFAULT '', template_id TEXT NOT NULL DEFAULT '',
    language TEXT NOT NULL DEFAULT 'en-AU', accent TEXT NOT NULL DEFAULT 'Australian', delivery_style TEXT NOT NULL DEFAULT '', audience TEXT NOT NULL DEFAULT '',
    active INTEGER NOT NULL DEFAULT 1, is_default INTEGER NOT NULL DEFAULT 0,
    created_by TEXT NOT NULL, created_at TEXT NOT NULL, updated_at TEXT NOT NULL
  )`);
  const p = DEFAULT_PRESENTER;
  const at = new Date(0).toISOString();
  db.prepare(
    `INSERT OR IGNORE INTO intro_presenters (id, name, description, portrait, provider, avatar_id, voice_id, template_id, language, accent, delivery_style, audience, active, is_default, created_by, created_at, updated_at)
     VALUES (?, ?, ?, ?, ?, '', '', '', ?, ?, ?, '', 1, ?, 'system', ?, ?)`,
  ).run(
    p.id,
    p.name,
    p.description,
    JSON.stringify(p.portrait),
    p.provider,
    p.language,
    p.accent,
    p.deliveryStyle,
    db.prepare("SELECT 1 FROM intro_presenters WHERE is_default = 1").get() ? 0 : 1,
    at,
    at,
  );
  ready.add(db);
}

const view = (r: Row): PresenterProfile => ({
  id: r.id,
  name: r.name,
  description: r.description,
  portrait: JSON.parse(r.portrait) as IntroPicture,
  provider: r.provider as MediaProvider,
  avatarId: r.avatar_id,
  voiceId: r.voice_id,
  templateId: r.template_id,
  language: r.language,
  accent: r.accent,
  deliveryStyle: r.delivery_style,
  audience: r.audience,
  active: Boolean(r.active),
  isDefault: Boolean(r.is_default),
});

export function presenters(db: Db): PresenterProfile[] {
  ensurePresenters(db);
  return (db.prepare("SELECT * FROM intro_presenters ORDER BY is_default DESC, name").all() as Row[]).map(view);
}

/** The default presenter; the built-in one if the table can't be read (a read-only preview of a database without it). */
export function defaultPresenter(db: Db): PresenterProfile {
  try {
    const r = db.prepare("SELECT * FROM intro_presenters WHERE is_default = 1 LIMIT 1").get() as Row | undefined;
    if (r) return view(r);
  } catch {
    // No table yet.
  }
  return DEFAULT_PRESENTER;
}

/** The same, making the table first: for anything that writes. */
export function seededDefaultPresenter(db: Db) {
  ensurePresenters(db);
  return defaultPresenter(db);
}

export function presenterById(db: Db, id: string | undefined | null): PresenterProfile | undefined {
  if (!id) return undefined;
  ensurePresenters(db);
  const r = db.prepare("SELECT * FROM intro_presenters WHERE id = ?").get(id) as Row | undefined;
  return r && view(r);
}

const str = (v: unknown, max: number) => (typeof v === "string" ? v.trim().slice(0, max) : "");
function picture(v: unknown): IntroPicture | null {
  const p = v as Partial<IntroPicture> | null;
  if (!p || typeof p.src !== "string" || !/^\/(api\/uploads|images)\//.test(p.src)) return null;
  const w = Math.round(Number(p.width));
  const h = Math.round(Number(p.height));
  if (!(w > 0 && h > 0)) return null;
  return { src: p.src, width: w, height: h, ...(typeof p.position === "string" && /^[\w% .-]{1,30}$/.test(p.position) && { position: p.position }) };
}
const slug = (s: string) =>
  s
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, "-")
    .replace(/^-|-$/g, "")
    .slice(0, 40) || "presenter";

/** Adds a presenter, or changes one (`id`). Making one the default makes it the only default; the default can't be switched off. */
export function savePresenter(db: Db, actor: User, input: Record<string, unknown>, now: Date) {
  requireAuthor(actor);
  ensurePresenters(db);
  const existing = presenterById(db, str(input.id, 60));
  const name = str(input.name, 80) || existing?.name || "";
  if (!name) throw new HttpError(400, "Give the presenter a name.");
  if (/\bava\b/i.test(name) && input.isDefault) throw new HttpError(400, "Ava is a separate character, so she can't be the default Topic presenter.");
  const portrait = input.portrait === undefined && existing ? existing.portrait : picture(input.portrait);
  if (!portrait) throw new HttpError(400, "Choose a placeholder portrait from the image library.");
  const provider = PROVIDERS.includes(input.provider as MediaProvider) ? (input.provider as MediaProvider) : (existing?.provider ?? "synthesia");
  const isDefault = input.isDefault === undefined ? Boolean(existing?.isDefault) : Boolean(input.isDefault);
  const active = isDefault || (input.active === undefined ? (existing?.active ?? true) : Boolean(input.active));
  const at = now.toISOString();
  const fields = {
    name,
    description: input.description === undefined ? (existing?.description ?? "") : str(input.description, 400),
    portrait: JSON.stringify(portrait),
    provider,
    avatar_id: input.avatarId === undefined ? (existing?.avatarId ?? "") : str(input.avatarId, 120),
    voice_id: input.voiceId === undefined ? (existing?.voiceId ?? "") : str(input.voiceId, 120),
    template_id: input.templateId === undefined ? (existing?.templateId ?? "") : str(input.templateId, 120),
    language: str(input.language, 20) || existing?.language || "en-AU",
    accent: str(input.accent, 40) || existing?.accent || "Australian",
    delivery_style: input.deliveryStyle === undefined ? (existing?.deliveryStyle ?? "") : str(input.deliveryStyle, 300),
    audience: input.audience === undefined ? (existing?.audience ?? "") : str(input.audience, 80),
  };
  let id = existing?.id;
  if (existing && existing.isDefault && !isDefault && !presenters(db).some((p) => p.isDefault && p.id !== existing.id))
    throw new HttpError(400, "Choose another default presenter first.");
  if (isDefault) db.prepare("UPDATE intro_presenters SET is_default = 0").run();
  if (existing) {
    db.prepare(
      `UPDATE intro_presenters SET name = ?, description = ?, portrait = ?, provider = ?, avatar_id = ?, voice_id = ?, template_id = ?, language = ?, accent = ?,
       delivery_style = ?, audience = ?, active = ?, is_default = ?, updated_at = ? WHERE id = ?`,
    ).run(...Object.values(fields), active ? 1 : 0, isDefault ? 1 : 0, at, existing.id);
  } else {
    id = slug(name);
    for (let n = 2; presenterById(db, id); n++) id = `${slug(name)}-${n}`;
    db.prepare(
      `INSERT INTO intro_presenters (id, name, description, portrait, provider, avatar_id, voice_id, template_id, language, accent, delivery_style, audience, active, is_default, created_by, created_at, updated_at)
       VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`,
    ).run(id, ...Object.values(fields), active ? 1 : 0, isDefault ? 1 : 0, actor.id, at, at);
  }
  audit(db, { actor: actor.id, event: existing ? "intro.presenter_updated" : "intro.presenter_added", entity: `presenter:${id}`, at: now });
  return presenterById(db, id)!;
}
