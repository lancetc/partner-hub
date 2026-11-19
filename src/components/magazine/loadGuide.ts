import "server-only";
import { notFound } from "next/navigation";
import { getDb } from "@/server/db";
import { canAuthor, currentUser, HttpError } from "@/server/auth";
import { previewGuide, readGuide, type ReaderGuide } from "@/server/magazine";

/*
  Loads a Magazine for its pages: the published course for a reader (outside its audience looks the same
  as not existing), or an author's saved draft for preview.
*/

export async function loadGuide(key: string, draft: boolean): Promise<{ guide: ReaderGuide; base: string; canEdit: boolean }> {
  const db = getDb();
  const user = await currentUser(db);
  if (draft && !canAuthor(user)) notFound();
  try {
    const guide = draft ? previewGuide(db, user, key) : readGuide(db, user, key);
    return { guide, base: draft ? `/magazine/draft/${encodeURIComponent(guide.id)}` : `/magazine/${encodeURIComponent(guide.slug)}`, canEdit: canAuthor(user) };
  } catch (e) {
    if (e instanceof HttpError && (e.status === 404 || e.status === 403)) notFound();
    throw e;
  }
}
