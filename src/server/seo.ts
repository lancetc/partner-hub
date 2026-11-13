import "server-only";
import type { Metadata } from "next";
import { lessonBySlug, lessons } from "@/content/lessons";
import { whoPhotoFor } from "@/lib/pathPhoto";
import type { Db } from "./db";
import type { Row as WebinarRow } from "./webinars";

/*
  What search engines and link previews see for the overview pages: published topics, live
  learning paths with published topics, and published webinars. Anything else is kept out.
*/

/** A search-result length description: whole words, no more than about 155 characters. */
export function snippet(text: string, max = 155) {
  const t = text
    .replace(/\*\*(.+?)\*\*/g, "$1")
    .replace(/\s+/g, " ")
    .trim();
  if (t.length <= max) return t;
  const cut = t.slice(0, max - 1);
  return `${cut.slice(0, cut.lastIndexOf(" "))}…`;
}

const hidden: Metadata["robots"] = { index: false, follow: false };

/** Title, description, share picture and canonical address for one page. */
function page(title: string, description: string, path: string, image?: string | null): Metadata {
  const d = snippet(description);
  return {
    title,
    description: d,
    alternates: { canonical: path },
    openGraph: { title, description: d, url: path, type: "website", siteName: "Trilogy Care Partner Hub", ...(image ? { images: [image] } : {}) },
    twitter: { card: image ? "summary_large_image" : "summary", title, description: d, ...(image ? { images: [image] } : {}) },
  };
}

const catalogue = () => lessons.filter((l) => l.track !== "reinforcement");

export function topicMetadata(slug: string): Metadata {
  const l = lessonBySlug(slug);
  if (!l || l.track === "reinforcement") return { title: "Topic", robots: hidden };
  return page(l.title, l.summary || l.outcome, `/topics/${l.slug}`, l.visual?.photo?.src);
}

type PathRow = { id: string; name: string; description: string; who_photo: string | null };

/** Live paths with at least one published topic. */
function livePaths(db: Db) {
  const published = new Set(catalogue().map((l) => l.slug));
  const rows = db.prepare("SELECT id, name, description, who_photo FROM learning_paths WHERE archived = 0").all() as PathRow[];
  const slugs = db.prepare("SELECT lesson_slug FROM learning_path_lessons WHERE path_id = ?");
  return rows.filter((p) => (slugs.all(p.id) as { lesson_slug: string }[]).some((r) => published.has(r.lesson_slug)));
}

export function pathMetadata(db: Db, id: string): Metadata {
  const p = livePaths(db).find((r) => r.id === id);
  if (!p) return { title: "Learning path", robots: hidden };
  return page(p.name, p.description || `A Trilogy Care learning path: ${p.name}.`, `/paths/${p.id}`, whoPhotoFor(p.who_photo));
}

function publishedWebinars(db: Db) {
  return db.prepare("SELECT * FROM webinars WHERE status = 'published' ORDER BY recorded_on DESC").all() as WebinarRow[];
}

export function webinarMetadata(db: Db, id: string): Metadata {
  const w = publishedWebinars(db).find((r) => r.id === id);
  if (!w) return { title: "Webinar", robots: hidden };
  return page(w.title, w.summary || `A Trilogy Care webinar presented by ${w.presenter}.`, `/webinars/${w.id}`, w.thumbnail);
}

/** Overview pages for the sitemap. */
export function sitemapEntries(db: Db) {
  return {
    topics: catalogue().map((l) => ({ path: `/topics/${l.slug}` })),
    paths: livePaths(db).map((p) => ({ path: `/paths/${p.id}` })),
    webinars: publishedWebinars(db).map((w) => ({ path: `/webinars/${w.id}`, lastModified: w.updated_at })),
  };
}
