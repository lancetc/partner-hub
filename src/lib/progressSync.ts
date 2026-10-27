import type { LessonAttempt } from "./store";

/*
  Lesson progress between this device and the server: whichever copy was saved most recently wins.
  Progress saved before syncing existed (no savedAt) counts as older than anything on the server.
*/

export type ServerProgress = Record<string, { attempt: LessonAttempt; savedAt: string }>;

export function mergeProgress(local: Record<string, LessonAttempt>, server: ServerProgress) {
  const merged = { ...local };
  const toPush: string[] = [];
  for (const [slug, s] of Object.entries(server)) {
    const mine = local[slug];
    if (!mine || !mine.savedAt || mine.savedAt < s.savedAt) merged[slug] = { ...s.attempt, savedAt: s.savedAt };
  }
  for (const [slug, mine] of Object.entries(local)) {
    const theirs = server[slug];
    if (!theirs || (mine.savedAt && mine.savedAt > theirs.savedAt)) toPush.push(slug);
  }
  return { merged, toPush };
}
