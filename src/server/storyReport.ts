import "server-only";
import { pageBlocks, readGuideDoc } from "@/lib/magazine";
import { MOMENT_KINDS, type MomentKind } from "@/lib/story";
import type { Db } from "./db";
import { requireAuthor, type User } from "./auth";
import { reportBasis } from "./story";

/*
  The story report (docs/story-plans.md, step 6): reach and engagement by character, episode and moment, beside
  the learning evidence from the activities those moments sit with, and the work measure the plan answers to.
  Three things that are kept apart: opening a check-in or playing a clip is engagement, never a learning outcome,
  and neither is evidence that a work measure moved.

  Counts of people only. No answer a learner gave, nothing they typed, and no detail of a source case.
*/

/** Fewer learners than this and a figure is too thin to read anything from: it is shown, and marked. */
export const THIN_SAMPLE = 10;
const day = (v: unknown) => (typeof v === "string" && /^\d{4}-\d{2}-\d{2}$/.test(v) ? v : "");

type EventRow = { user_id: string; event: string; character_id: string; moment_id: string; revision: number; kind: string; ref: string; place: string };

export function storyReport(db: Db, actor: User, input: { from?: unknown; to?: unknown }, now: Date) {
  requireAuthor(actor);
  const basis = reportBasis(db, actor, now);
  const to = day(input.to) || now.toISOString().slice(0, 10);
  const from = day(input.from) || new Date(Date.parse(`${to}T00:00:00Z`) - 29 * 86_400_000).toISOString().slice(0, 10);
  const lo = `${from}T00:00:00.000Z`;
  const hi = `${to}T23:59:59.999Z`;
  const events = db
    .prepare("SELECT user_id, event, character_id, moment_id, revision, kind, ref, place FROM story_events WHERE at BETWEEN ? AND ?")
    .all(lo, hi) as EventRow[];
  const momentById = new Map(basis.moments.map((m) => [m.id, m]));
  const people = (rows: EventRow[]) => new Set(rows.map((e) => e.user_id)).size;
  const of = (rows: EventRow[], ...names: string[]) => rows.filter((e) => names.includes(e.event));
  /** Seeing a moment at all: it was shown on a page, a transmission was started, or a check-in was opened. */
  const SEEN = ["story_moment_shown", "ava_transmission_started", "story_check_in_opened"];

  // Whom an event is about: the moment's speaker and the person it features, or the character named on the event.
  const about = (e: EventRow) => {
    const m = momentById.get(e.moment_id);
    return m ? [m.speakerId, m.featuredId].filter(Boolean) : [e.character_id].filter(Boolean);
  };
  const characters = basis.characters
    .map((c) => {
      const mine = events.filter((e) => about(e).includes(c.id));
      const exposed = people(of(mine, ...SEEN));
      return {
        id: c.id,
        name: c.name,
        approved: c.approved,
        exposed,
        thin: exposed > 0 && exposed < THIN_SAMPLE,
        checkInOpens: of(mine, "story_check_in_opened").length,
        checkInPeople: people(of(mine, "story_check_in_opened")),
        questions: of(mine, "story_question_selected").length,
        historyOpens: of(mine, "story_history_opened").length,
        linksFollowed: of(mine, "story_appearance_link_followed").length,
        audioPlays: of(mine, "story_audio_play_started").length,
        placed: basis.placements.filter((p) => {
          const m = momentById.get(p.momentId);
          return m && (m.speakerId === c.id || m.featuredId === c.id);
        }).length,
        appearances: basis.appearances.filter((a) => a.characterId === c.id).length,
      };
    })
    .sort((a, b) => b.exposed - a.exposed || a.name.localeCompare(b.name));

  const episodes = basis.episodes
    .filter((e) => e.status === "approved")
    .map((e) => {
      const ids = new Set(basis.moments.filter((m) => m.episodeId === e.id).map((m) => m.id));
      const mine = events.filter((x) => ids.has(x.moment_id));
      const exposed = people(of(mine, ...SEEN));
      return {
        id: e.id,
        title: e.title,
        whenLabel: e.whenLabel,
        moments: ids.size,
        exposed,
        thin: exposed > 0 && exposed < THIN_SAMPLE,
        checkInOpens: of(mine, "story_check_in_opened").length,
        historyOpens: of(mine, "story_history_opened").length,
      };
    });

  // A moment, by the version learners were given: a revised script is a different thing to have seen.
  const moments = basis.moments
    .filter((m) => m.status !== "retired")
    .flatMap((m) => {
      const mine = events.filter((e) => e.moment_id === m.id);
      const revisions = [...new Set([...basis.placements.filter((p) => p.momentId === m.id).map((p) => p.revision), ...mine.map((e) => e.revision)])].filter(
        (r) => r > 0,
      );
      return revisions
        .sort((a, b) => b - a)
        .map((revision) => {
          const rows = mine.filter((e) => e.revision === revision);
          const exposed = people(of(rows, ...SEEN));
          return {
            id: m.id,
            title: m.title,
            kind: MOMENT_KINDS[m.kind as MomentKind],
            speaker: basis.characters.find((c) => c.id === m.speakerId)?.name ?? m.speakerId,
            episode: basis.episodes.find((e) => e.id === m.episodeId)?.title ?? "",
            revision,
            current: revision === m.revision,
            places: basis.placements.filter((p) => p.momentId === m.id && p.revision === revision).map((p) => `${p.title}: ${p.where}`),
            exposed,
            thin: exposed > 0 && exposed < THIN_SAMPLE,
            checkInOpens: of(rows, "story_check_in_opened").length,
            questions: of(rows, "story_question_selected").length,
            started: of(rows, "ava_transmission_started").length,
            ended: of(rows, "ava_transmission_ended").length,
            skipped: of(rows, "ava_transmission_skipped").length,
            audioPlays: of(rows, "story_audio_play_started").length,
          };
        });
    });

  // Learning evidence: the decisions on the Magazine pages those moments sit on, as the course scored them.
  const decisions: {
    course: string;
    page: string;
    prompt: string;
    answered: number;
    first: { best: number; acceptable: number; risky: number };
    retried: number;
    thin: boolean;
  }[] = [];
  const seenBlocks = new Set<string>();
  let topicPlacements = 0;
  for (const p of basis.placements) {
    if (p.kind !== "guide") {
      topicPlacements += 1;
      continue;
    }
    const g = db.prepare("SELECT id, title, revision_id FROM magazine_guides WHERE id = ?").get(p.ref) as
      { id: string; title: string; revision_id: string | null } | undefined;
    const rev = g?.revision_id ? (db.prepare("SELECT doc FROM magazine_revisions WHERE id = ?").get(g.revision_id) as { doc: string } | undefined) : undefined;
    if (!g || !rev) continue;
    const doc = readGuideDoc(JSON.parse(rev.doc), { draft: true });
    const page = doc.pages.find((pg) => p.place === `page:${pg.id}` || pageBlocks(pg).some((b) => b.id === p.place));
    for (const b of page ? pageBlocks(page) : []) {
      if (b.type !== "decision" || seenBlocks.has(`${g.id}:${b.id}`)) continue;
      seenBlocks.add(`${g.id}:${b.id}`);
      const rows = db
        .prepare(
          "SELECT user_id, json_extract(detail, '$.verdict') verdict, json_extract(detail, '$.attempt') attempt FROM magazine_events WHERE guide_id = ? AND revision_id = ? AND event = 'decision.answered' AND block_id = ? AND at BETWEEN ? AND ?",
        )
        .all(g.id, g.revision_id!, b.id, lo, hi) as { user_id: string; verdict: string; attempt: number }[];
      const first = rows.filter((r) => Number(r.attempt) === 1);
      const answered = new Set(rows.map((r) => r.user_id)).size;
      decisions.push({
        course: g.title,
        page: page!.title,
        prompt: b.prompt.slice(0, 160),
        answered,
        first: {
          best: first.filter((r) => r.verdict === "best").length,
          acceptable: first.filter((r) => r.verdict === "acceptable").length,
          risky: first.filter((r) => r.verdict === "risky").length,
        },
        retried: new Set(rows.filter((r) => Number(r.attempt) > 1).map((r) => r.user_id)).size,
        thin: answered > 0 && answered < THIN_SAMPLE,
      });
    }
  }

  // Work results: each plan that came from a Problem desk theme, with that theme's own measure.
  const work = basis.plans
    .filter((p) => p.themeId)
    .flatMap((p) => {
      const r = db.prepare("SELECT r.data, r.status, t.title FROM pd_responses r JOIN pd_themes t ON t.id = r.theme_id WHERE r.theme_id = ?").get(p.themeId) as
        { data: string; status: string; title: string } | undefined;
      const t = r ?? (db.prepare("SELECT title FROM pd_themes WHERE id = ?").get(p.themeId) as { title: string } | undefined);
      if (!t) return [];
      const d = r
        ? (JSON.parse(r.data) as { desired?: string; measure?: { name?: string; definition?: string; owner?: string }; lag?: string; reviewOn?: string })
        : {};
      return [
        {
          planId: p.id,
          plan: p.title,
          themeId: p.themeId,
          theme: t.title,
          course: p.guide,
          desired: d.desired ?? "",
          measure: d.measure?.name ?? "",
          definition: d.measure?.definition ?? "",
          owner: d.measure?.owner ?? "",
          lag: d.lag ?? "",
          reviewOn: d.reviewOn ?? "",
        },
      ];
    });

  // Editorial diagnostics: things to look at, not a score.
  const name = (id: string) => basis.characters.find((c) => c.id === id)?.name ?? id;
  const story = basis.plans.filter((p) => p.mode !== "none");
  const recommended = basis.characters
    .map((c) => ({
      name: c.name,
      recommended: story.filter((p) => p.topFit === c.id).length,
      chosen: story.filter((p) => p.topFit === c.id && p.anchorId === c.id).length,
    }))
    .filter((r) => r.recommended >= 2 && r.chosen * 2 < r.recommended);
  const checkIns = basis.moments.filter((m) => m.kind === "check_in");
  const unanswered = checkIns.flatMap((m) => {
    const opened = new Set(
      of(
        events.filter((e) => e.moment_id === m.id),
        "story_check_in_opened",
      ).map((e) => e.user_id),
    );
    const asked = new Set(
      of(
        events.filter((e) => e.moment_id === m.id),
        "story_question_selected",
      ).map((e) => e.user_id),
    );
    const silent = [...opened].filter((u) => !asked.has(u)).length;
    // Most people who open it choose nothing: the update or its questions may not be landing.
    return opened.size >= THIN_SAMPLE && silent * 2 > opened.size ? [{ title: m.title, speaker: name(m.speakerId), opened: opened.size, silent }] : [];
  });
  return {
    range: { from, to },
    thinSample: THIN_SAMPLE,
    totals: { exposed: people(of(events, ...SEEN)), events: events.length, placements: basis.placements.length },
    characters,
    episodes,
    moments,
    learning: { decisions, topicPlacements },
    work,
    diagnostics: {
      recommended,
      unanswered,
      brokenLinks: basis.appearances.filter((a) => !a.open).map((a) => ({ character: name(a.characterId), label: a.label, format: a.format })),
      lostPlaces: basis.placements
        .filter((p) => !p.found)
        .map((p) => ({ moment: momentById.get(p.momentId)?.title ?? p.momentId, where: `${p.title}: ${p.where}` })),
      behind: basis.placements
        .filter((p) => p.behind)
        .map((p) => ({ moment: momentById.get(p.momentId)?.title ?? p.momentId, where: `${p.title}: ${p.where}`, revision: p.revision })),
      openWarnings: basis.plans
        .filter((p) => p.openWarnings > 0 && p.guide)
        .map((p) => ({ id: p.id, title: p.title, warnings: p.openWarnings, course: p.guide!.title })),
      unpractised: basis.plans.filter((p) => p.choiceUnpractised).map((p) => ({ id: p.id, title: p.title })),
    },
  };
}
export type StoryReport = ReturnType<typeof storyReport>;
