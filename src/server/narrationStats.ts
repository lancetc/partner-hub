import "server-only";
import type { Db } from "./db";
import type { User } from "./auth";
import { requireGuide } from "./magazineDraft";

/*
  Listening to the Audio Introductions, for the course's authors (docs/magazine-audio-guide.md): totals by page, from
  the Magazine's own events (magazine_events, intro_audio.*). Never who listened. Listening is never a completion
  requirement, and finishing an introduction isn't evidence of learning: the comparison with finishing the page is a
  prompt for the author, shown only when both groups have five people or more.

  `introListening` is the same count for any introduction's events (a Discovery Path's Discovery Exciter uses it too,
  docs/discovery-exciter.md).
*/

/** Under this many people in a group, a comparison could point to someone: it isn't shown. */
export const SMALL_GROUP = 5;

type Row = { user_id: string; event: string; page_id: string | null; detail: string };

/** One introduction's listening events: who (an id, only to count people once), what (intro_audio.<action>) and its numbers. */
export type IntroAudioRow = { user_id: string; event: string; detail: string };
export type IntroListening = {
  plays: number;
  /** The people who pressed Play (ids, for counting and comparing; never shown). */
  listenerIds: Set<string>;
  /** Seconds listened to, in all. */
  seconds: number;
  /** How far listeners got on average (the furthest each one reached), as a percentage. */
  percent: number | null;
  completed: number;
  replays: number;
  transcripts: number;
  /** How often each speed was chosen. */
  speeds: Record<string, number>;
};

/** Totals for one introduction from its intro_audio.* events. */
export function introListening(audio: IntroAudioRow[]): IntroListening {
  const detail = (r: IntroAudioRow) => {
    try {
      return JSON.parse(r.detail || "{}") as { seconds?: number; percent?: number; speed?: number };
    } catch {
      return {};
    }
  };
  const listenerIds = new Set(audio.filter((r) => r.event === "intro_audio.play").map((r) => r.user_id));
  const furthest = new Map<string, number>();
  for (const r of audio) {
    const p = r.event === "intro_audio.complete" ? 100 : detail(r).percent;
    if (typeof p === "number") furthest.set(r.user_id, Math.max(furthest.get(r.user_id) ?? 0, p));
  }
  const speeds: Record<string, number> = {};
  for (const r of audio.filter((x) => x.event === "intro_audio.speed")) {
    const s = detail(r).speed;
    if (typeof s === "number") speeds[`${s}×`] = (speeds[`${s}×`] ?? 0) + 1;
  }
  return {
    plays: audio.filter((r) => r.event === "intro_audio.play").length,
    listenerIds,
    seconds: Math.round(audio.filter((r) => r.event === "intro_audio.listened").reduce((n, r) => n + (detail(r).seconds ?? 0), 0)),
    percent: furthest.size ? Math.round([...furthest.values()].reduce((a, b) => a + b, 0) / furthest.size) : null,
    completed: new Set(audio.filter((r) => r.event === "intro_audio.complete").map((r) => r.user_id)).size,
    replays: audio.filter((r) => r.event === "intro_audio.replay").length,
    transcripts: audio.filter((r) => r.event === "intro_audio.transcript").length,
    speeds,
  };
}

/** Of a group of people, the share in `done`, as a percentage: null when the group is too small to show. */
export const shareOf = (group: string[], done: Set<string>) =>
  group.length < SMALL_GROUP ? null : Math.round((group.filter((u) => done.has(u)).length / group.length) * 100);

export type IntroPageStats = {
  pageId: string;
  plays: number;
  listeners: number;
  /** Seconds listened to, in all. */
  seconds: number;
  /** How far listeners got on average (the furthest each one reached), as a percentage. */
  percent: number | null;
  completed: number;
  replays: number;
  transcripts: number;
  /** How often each speed was chosen. */
  speeds: Record<string, number>;
  /** Of the people who listened, and of those who opened the page without listening, the share who finished the page. */
  finishedAfterListening: number | null;
  finishedWithoutListening: number | null;
};

export function introAudioStats(db: Db, actor: User, guideId: string): { pages: IntroPageStats[]; listeners: number; seconds: number } {
  requireGuide(db, actor, guideId);
  const rows = db
    .prepare(
      "SELECT user_id, event, page_id, detail FROM magazine_events WHERE guide_id = ? AND page_id IS NOT NULL AND (event LIKE 'intro_audio.%' OR event IN ('page.opened', 'page.finished')) ORDER BY rowid",
    )
    .all(guideId) as Row[];
  const by = new Map<string, Row[]>();
  for (const r of rows) by.set(r.page_id!, [...(by.get(r.page_id!) ?? []), r]);
  const pages: IntroPageStats[] = [];
  for (const [pageId, rs] of by) {
    const audio = rs.filter((r) => r.event.startsWith("intro_audio."));
    if (!audio.length) continue;
    const { listenerIds: listeners, ...l } = introListening(audio);
    const opened = new Set(rs.filter((r) => r.event === "page.opened").map((r) => r.user_id));
    const finished = new Set(rs.filter((r) => r.event === "page.finished").map((r) => r.user_id));
    const without = [...opened].filter((u) => !listeners.has(u));
    const small = listeners.size < SMALL_GROUP || without.length < SMALL_GROUP;
    pages.push({
      pageId,
      plays: l.plays,
      listeners: listeners.size,
      seconds: l.seconds,
      percent: l.percent,
      completed: l.completed,
      replays: l.replays,
      transcripts: l.transcripts,
      speeds: l.speeds,
      finishedAfterListening: small ? null : shareOf([...listeners], finished),
      finishedWithoutListening: small ? null : shareOf(without, finished),
    });
  }
  const everyone = new Set(rows.filter((r) => r.event === "intro_audio.play").map((r) => r.user_id));
  return { pages, listeners: everyone.size, seconds: pages.reduce((n, p) => n + p.seconds, 0) };
}
