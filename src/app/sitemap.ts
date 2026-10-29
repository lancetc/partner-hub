import type { MetadataRoute } from "next";
import { connection } from "next/server";
import { stories } from "@/content/stories";
import { getDb } from "@/server/db";

/** For search engines: the homepage, the main sections and every published news story. */
export default async function sitemap(): Promise<MetadataRoute.Sitemap> {
  // Stories are published from admin at any time.
  await connection();
  getDb();
  const base = (process.env.HUB_PUBLIC_URL ?? "http://localhost:3000").replace(/\/$/, "");
  const latest = stories.reduce((d, s) => ((s.updated ?? s.date) > d ? (s.updated ?? s.date) : d), "");
  return [
    { url: `${base}/`, lastModified: latest || undefined, changeFrequency: "daily", priority: 1 },
    { url: `${base}/learning`, changeFrequency: "weekly", priority: 0.7 },
    { url: `${base}/webinars`, changeFrequency: "weekly", priority: 0.5 },
    { url: `${base}/resources`, changeFrequency: "monthly", priority: 0.5 },
    ...stories.map((s) => ({ url: `${base}/news/${s.slug}`, lastModified: s.updated ?? s.date, changeFrequency: "monthly" as const, priority: 0.8 })),
  ];
}
