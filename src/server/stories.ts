import "server-only";
import { categories, type PolicyMeta, type Story, type StoryBlock } from "@/content/stories";
import { lessons } from "@/content/lessons";
import { resources } from "@/content/resources";
import { plainText } from "@/lib/richText";
import { audit, type Db } from "./db";
import { canAuthor, HttpError, type User } from "./auth";
import { originalStories, originalStory, refreshStories } from "./storyRegistry";

/*
  Editing the news on the homepage: change any story (its words, poster image, category, policy
  details), write new ones, and publish, unpublish or delete them. Stories that shipped with the
  site start as they are in content/stories.ts; saving one keeps the edited copy here instead.
*/

type Row = {
  slug: string;
  data: string;
  status: "draft" | "published";
  updated_at: string;
  updated_by: string;
  published_at: string | null;
  deleted_at: string | null;
};
export type StoryStatus = "draft" | "published";
export type AdminStory = {
  slug: string;
  title: string;
  category: Story["category"];
  date: string;
  status: StoryStatus;
  /** A built-in story that's been changed here (it can be put back as it shipped). */
  edited: boolean;
  builtIn: boolean;
  photo: string | null;
  updatedAt: string | null;
};

const requireEditor = (u: User) => {
  if (!canAuthor(u)) throw new HttpError(403, "Only learning authors can edit the news.");
};
const rowFor = (db: Db, slug: string) => db.prepare("SELECT * FROM authored_stories WHERE slug = ?").get(slug) as Row | undefined;

function summary(slug: string, story: Story, row: Row | undefined): AdminStory {
  return {
    slug,
    title: story.title,
    category: story.category,
    date: story.date,
    status: row ? row.status : "published",
    edited: Boolean(row && originalStory(slug)),
    builtIn: Boolean(originalStory(slug)),
    photo: story.visual.photo?.src ?? null,
    updatedAt: row?.updated_at ?? null,
  };
}

/** Every story, newest first, with deleted ones listed separately. */
export function adminStories(db: Db, actor: User) {
  requireEditor(actor);
  const rows = new Map((db.prepare("SELECT * FROM authored_stories").all() as Row[]).map((r) => [r.slug, r]));
  const slugs = new Set<string>();
  const out: AdminStory[] = [];
  const deleted: AdminStory[] = [];
  const add = (slug: string, story: Story) => {
    if (slugs.has(slug)) return;
    slugs.add(slug);
    const r = rows.get(slug);
    (r?.deleted_at ? deleted : out).push(summary(slug, story, r));
  };
  for (const r of rows.values()) add(r.slug, JSON.parse(r.data) as Story);
  // Built-in stories nobody has changed.
  for (const s of originalStories()) add(s.slug, s);
  const byDate = (a: AdminStory, b: AdminStory) => b.date.localeCompare(a.date);
  return { stories: out.sort(byDate), deleted: deleted.sort(byDate) };
}

/** One story to edit: the saved copy, or the built-in one. */
export function adminStory(db: Db, actor: User, slug: string) {
  requireEditor(actor);
  const r = rowFor(db, slug);
  const story = r ? (JSON.parse(r.data) as Story) : originalStory(slug);
  if (!story) throw new HttpError(404, "Story not found.");
  return { story, ...summary(slug, story, r), deleted: Boolean(r?.deleted_at) };
}

/** A draft, for an author's preview of the story page. */
export function storyPreview(db: Db, actor: User, slug: string): Story | null {
  if (!canAuthor(actor)) return null;
  const r = rowFor(db, slug);
  return r && !r.deleted_at ? (JSON.parse(r.data) as Story) : null;
}

const TONES = ["teal", "navy", "warm", "gold", "sky"] as const;
const VARIANTS = ["petals", "rings", "grid", "wave", "dots", "arc"] as const;
const ICONS = ["clock", "shield", "heart", "leaf", "chat", "home", "spark", "doc", "people", "sun", "route", "book"] as const;
const POLICY_STATUS: PolicyMeta["status"][] = ["proposal", "announced", "in_effect", "superseded"];
const text = (v: unknown, max: number) =>
  String(v ?? "")
    .trim()
    .slice(0, max);
const isDate = (v: string) => /^\d{4}-\d{2}-\d{2}/.test(v) && !Number.isNaN(Date.parse(v));
const localPicture = (src: string) => /^\/api\/uploads\/[\w.-]+$/.test(src) || /^\/images\/[\w.-]+$/.test(src);

/** Checks a story from the editor and puts it in the stored shape. */
export function validateStory(input: Partial<Story>): Story {
  const title = text(input.title, 160);
  if (!title) throw new HttpError(400, "Give the story a title.");
  const category = categories.find((c) => c.id === input.category)?.id;
  if (!category) throw new HttpError(400, "Choose a category.");
  const date = text(input.date, 40);
  if (!isDate(date)) throw new HttpError(400, "Choose the story’s date.");
  const audience = (Array.isArray(input.audience) ? input.audience : []).filter((a): a is "partner" | "coordinator" => a === "partner" || a === "coordinator");
  if (!audience.length) throw new HttpError(400, "Choose who the story is for.");

  const body: StoryBlock[] = [];
  for (const b of Array.isArray(input.body) ? input.body : []) {
    if (b?.type === "p" || b?.type === "h2" || b?.type === "h3") {
      const t = text(b.text, 4000);
      if (t) body.push({ type: b.type, text: t });
    } else if (b?.type === "list") {
      const items = (Array.isArray(b.items) ? b.items : []).map((i) => text(i, 600)).filter(Boolean);
      if (items.length) body.push({ type: "list", items });
    } else if (b?.type === "image") {
      if (!b.src) continue;
      if (!localPicture(b.src)) throw new HttpError(400, "Choose pictures in the story from the image library.");
      const alt = text(b.alt, 400);
      if (!alt) throw new HttpError(400, "Describe each picture in the story for people who can’t see it.");
      const align = (["left", "right", "center", "full"] as const).includes(b.align) ? b.align : "full";
      const caption = text(b.caption, 300);
      body.push({
        type: "image",
        src: b.src,
        width: Math.max(1, Math.round(Number(b.width) || 1200)),
        height: Math.max(1, Math.round(Number(b.height) || 800)),
        alt,
        align,
        ...(caption ? { caption } : {}),
      });
    } else if (b?.type === "quote") {
      const t = text(b.text, 1500);
      if (t) body.push({ type: "quote", text: t, cite: text(b.cite, 200) });
    }
  }
  if (!body.some((b) => b.type !== "image")) throw new HttpError(400, "Write the story: add at least one paragraph.");

  const v = input.visual ?? ({} as Story["visual"]);
  const photo = v.photo && typeof v.photo.src === "string" && v.photo.src ? v.photo : undefined;
  if (photo && !localPicture(photo.src)) throw new HttpError(400, "Choose the poster image from the image library.");
  const visual: Story["visual"] = {
    variant: VARIANTS.includes(v.variant as (typeof VARIANTS)[number]) ? v.variant : "petals",
    tone: TONES.includes(v.tone as (typeof TONES)[number]) ? v.tone : "teal",
    icon: ICONS.includes(v.icon as (typeof ICONS)[number]) ? v.icon : "spark",
    alt: text(v.alt, 400),
    ...(photo
      ? {
          photo: {
            src: photo.src,
            width: Math.max(1, Math.round(Number(photo.width) || 1200)),
            height: Math.max(1, Math.round(Number(photo.height) || 800)),
            ...(photo.position ? { position: text(photo.position, 40) } : {}),
          },
        }
      : {}),
  };
  if (photo && !visual.alt) throw new HttpError(400, "Describe the poster image for people who can’t see it.");

  let policy: PolicyMeta | undefined;
  if (category === "policy" && input.policy) {
    const p = input.policy;
    const sourceUrl = text(p.sourceUrl, 500);
    if (sourceUrl && !/^https?:\/\//i.test(sourceUrl)) throw new HttpError(400, "The policy source needs a web address starting https://");
    policy = {
      status: POLICY_STATUS.includes(p.status) ? p.status : "announced",
      issuer: text(p.issuer, 200),
      sourceTitle: text(p.sourceTitle, 300),
      sourceUrl,
      published: text(p.published, 40),
      ...(text(p.effective, 40) ? { effective: text(p.effective, 40) } : {}),
      ...(text(p.jurisdiction, 100) ? { jurisdiction: text(p.jurisdiction, 100) } : {}),
      owner: text(p.owner, 200),
      reviewDate: text(p.reviewDate, 40),
      ...(text(p.correction, 1000) ? { correction: text(p.correction, 1000) } : {}),
    };
  }

  // A related topic that's since been deleted isn't shown anyway, so it's dropped rather than blocking the save.
  const wanted = text(input.relatedLesson, 200);
  const relatedLesson = lessons.some((l) => l.slug === wanted && l.track !== "reinforcement") ? wanted : "";
  const relatedResources = (Array.isArray(input.relatedResources) ? input.relatedResources : []).filter((id) => resources.some((r) => r.id === id));

  const seo: NonNullable<Story["seo"]> = {};
  if (text(input.seo?.title, 70)) seo.title = text(input.seo?.title, 70);
  if (text(input.seo?.description, 200)) seo.description = text(input.seo?.description, 200);
  const words = [input.dek, ...body.map((b) => (b.type === "list" ? b.items.join(" ") : b.type === "image" ? "" : plainText(b.text)))]
    .join(" ")
    .split(/\s+/)
    .filter(Boolean).length;
  return {
    slug: "",
    category,
    title,
    dek: text(input.dek, 500),
    byline: text(input.byline, 120) || "Trilogy Care team",
    date,
    readMinutes: Math.max(1, Math.round(words / 220)),
    visual,
    body,
    ...(policy ? { policy } : {}),
    ...(relatedLesson ? { relatedLesson } : {}),
    ...(relatedResources.length ? { relatedResources } : {}),
    audience,
    ...(seo.title || seo.description ? { seo } : {}),
  };
}

function newSlug(db: Db, title: string) {
  const base =
    title
      .toLowerCase()
      .replace(/[^a-z0-9]+/g, "-")
      .replace(/^-|-$/g, "")
      .slice(0, 60) || "story";
  const taken = (s: string) => Boolean(originalStory(s) || rowFor(db, s));
  let slug = base;
  // "draft" is the address of the writer (/api/admin/stories/draft), so a story can't take it.
  for (let n = 2; taken(slug) || slug === "draft"; n++) slug = `${base}-${n}`;
  return slug;
}

/** Saves a story. A new one starts as a draft; a published one's changes show on the site straight away. */
export function saveStory(db: Db, actor: User, slug: string | null, input: Partial<Story>, now: Date) {
  requireEditor(actor);
  const story = validateStory(input);
  story.updated = now.toISOString();
  const at = now.toISOString();
  if (!slug) {
    const s = newSlug(db, story.title);
    story.slug = s;
    db.prepare("INSERT INTO authored_stories (slug, data, status, created_by, created_at, updated_by, updated_at) VALUES (?, ?, 'draft', ?, ?, ?, ?)").run(
      s,
      JSON.stringify(story),
      actor.id,
      at,
      actor.id,
      at,
    );
    audit(db, { actor: actor.id, event: "story.created", entity: `story:${s}`, at: now });
    refreshStories(db);
    return { slug: s, status: "draft" as StoryStatus };
  }
  const r = rowFor(db, slug);
  if (!r && !originalStory(slug)) throw new HttpError(404, "Story not found.");
  if (r?.deleted_at) throw new HttpError(409, "Restore this story before editing it.");
  story.slug = slug;
  if (r) db.prepare("UPDATE authored_stories SET data = ?, updated_by = ?, updated_at = ? WHERE slug = ?").run(JSON.stringify(story), actor.id, at, slug);
  else
    // A built-in story's first edit: it stays published.
    db.prepare(
      "INSERT INTO authored_stories (slug, data, status, created_by, created_at, updated_by, updated_at, published_at) VALUES (?, ?, 'published', ?, ?, ?, ?, ?)",
    ).run(slug, JSON.stringify(story), actor.id, at, actor.id, at, at);
  audit(db, { actor: actor.id, event: "story.saved", entity: `story:${slug}`, at: now });
  refreshStories(db);
  return { slug, status: (r?.status ?? "published") as StoryStatus };
}

/** Publish (shows on the homepage) or unpublish (back to draft, off the site). */
export function setStoryStatus(db: Db, actor: User, slug: string, status: StoryStatus, now: Date) {
  requireEditor(actor);
  const at = now.toISOString();
  let r = rowFor(db, slug);
  if (!r) {
    const original = originalStory(slug);
    if (!original) throw new HttpError(404, "Story not found.");
    db.prepare(
      "INSERT INTO authored_stories (slug, data, status, created_by, created_at, updated_by, updated_at, published_at) VALUES (?, ?, 'published', ?, ?, ?, ?, ?)",
    ).run(slug, JSON.stringify(original), actor.id, at, actor.id, at, at);
    r = rowFor(db, slug)!;
  }
  if (r.deleted_at) throw new HttpError(409, "Restore this story first.");
  db.prepare(
    "UPDATE authored_stories SET status = ?, updated_by = ?, updated_at = ?, published_at = CASE WHEN ? = 'published' THEN ? ELSE published_at END WHERE slug = ?",
  ).run(status, actor.id, at, status, at, slug);
  audit(db, { actor: actor.id, event: status === "published" ? "story.published" : "story.unpublished", entity: `story:${slug}`, at: now });
  refreshStories(db);
  return { slug, status };
}

/** Takes a story off the site and out of the list; it can be restored. */
export function deleteStory(db: Db, actor: User, slug: string, now: Date) {
  requireEditor(actor);
  const at = now.toISOString();
  if (!rowFor(db, slug)) {
    const original = originalStory(slug);
    if (!original) throw new HttpError(404, "Story not found.");
    db.prepare("INSERT INTO authored_stories (slug, data, status, created_by, created_at, updated_by, updated_at) VALUES (?, ?, 'published', ?, ?, ?, ?)").run(
      slug,
      JSON.stringify(original),
      actor.id,
      at,
      actor.id,
      at,
    );
  }
  db.prepare("UPDATE authored_stories SET deleted_at = ?, updated_by = ?, updated_at = ? WHERE slug = ?").run(at, actor.id, at, slug);
  audit(db, { actor: actor.id, event: "story.deleted", entity: `story:${slug}`, at: now });
  refreshStories(db);
}

export function restoreStory(db: Db, actor: User, slug: string, now: Date) {
  requireEditor(actor);
  const r = rowFor(db, slug);
  if (!r?.deleted_at) throw new HttpError(404, "That story isn’t in the deleted list.");
  db.prepare("UPDATE authored_stories SET deleted_at = NULL, updated_by = ?, updated_at = ? WHERE slug = ?").run(actor.id, now.toISOString(), slug);
  audit(db, { actor: actor.id, event: "story.restored", entity: `story:${slug}`, at: now });
  refreshStories(db);
}

/** A built-in story back exactly as it shipped: the edited copy is thrown away. */
export function revertStory(db: Db, actor: User, slug: string, now: Date) {
  requireEditor(actor);
  if (!originalStory(slug)) throw new HttpError(400, "Only stories that came with the site can be put back.");
  db.prepare("DELETE FROM authored_stories WHERE slug = ?").run(slug);
  audit(db, { actor: actor.id, event: "story.reverted", entity: `story:${slug}`, at: now });
  refreshStories(db);
}
