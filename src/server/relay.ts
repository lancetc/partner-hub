import "server-only";
import { randomUUID } from "node:crypto";
import { lessonBySlug } from "@/content/lessons";
import { pageBlocks, pageTitle, type GuideDoc, type Page } from "@/lib/magazine";
import {
  ANSWER_KINDS,
  answerKind,
  attemptState,
  citations,
  claimsFeedback,
  CLIENT_EVENTS,
  concernOf,
  GENERAL_ROUTE,
  NO_ANSWER,
  NO_FEEDBACK_YET,
  NO_POINTING,
  NOT_SUBMITTED,
  personalDetails,
  privacyReply,
  quotesOption,
  RELAY_MAX_QUESTION,
  RELAY_NOTES,
  relayContext,
  sourcesBlock,
  STORY_PROMPTS,
  storySystem,
  URGENT_FIRST,
  whereLine,
  WORK_PROMPTS,
  workSystem,
  type AnswerKind,
  type Concern,
  type RelayContext,
  type RelayEventName,
  type RelayMode,
  type RelayPerson,
  type RelaySourceDoc,
} from "@/lib/relay";
import { relayOn, type RelayCourse, type RelayPage, type RelaySource } from "@/lib/relayConfig";
import { bestCard, keywordsOf } from "./askTrilogy";
import { audit, ensureRelayTables, tx, type Db } from "./db";
import { canAuthor, HttpError, isSuperadmin, requireAuthor, type User } from "./auth";
import { relayDraftEdition, relayEdition } from "./magazine";
import { contactRoutes, playbooksForRelay } from "./playbooks";
import { relayProvider, relayText, type RelayProvider, type RelayRequest } from "./relayModel";
import { openableIds, related } from "./search";
import { relayCanon, storyFor } from "./story";

/*
  Ava Relay's conversation service (docs/ava-relay.md).

  Every message is checked afresh: the learner can still read the course and is on the edition the session began
  on, the page has Ava switched on, and each source is one their role may open today. What the model is told is
  built here, from the published page and the learner's own recorded answers. It is never told a later page, the
  feedback for something they haven't attempted, a later episode, or a block an author has held back, so it has
  nothing of that kind to give away.

  Some answers never reach a model: a question with personal details in it (not sent, not kept), and a work
  question no approved source covers (an honest "can't verify" and the route). Work answers are held until they
  finish and thrown away if they cite nothing real.

  Words are kept with the learner's session until it expires (Hub setting, 14 days unless changed) and only that
  learner can read them back. Events and the audit record carry no words.
*/

export const RELAY_QUESTIONS_PER_HOUR = 30;
export const RELAY_PREVIEWS_PER_HOUR = 80;
export const RELAY_RETENTION_DAYS = 14;
const HISTORY_PAIRS = 4;
const DEFAULT_OPENING = "I’m here if you want to think this page through. What’s on your mind?";
/** What stands in for a question that wasn't kept. */
const NOT_SENT = "(Not sent: it looked like it had personal details in it.)";

type Edition = ReturnType<typeof relayEdition>;
type SessionRow = {
  id: string;
  user_id: string;
  audience: string;
  guide_id: string;
  revision_id: string;
  mode: RelayMode;
  last_page: string;
  status: "open" | "closed";
  created_at: string;
  updated_at: string;
  expires_at: string;
};
type TurnRow = {
  id: string;
  session_id: string;
  n: number;
  role: "learner" | "ava";
  mode: RelayMode;
  page_id: string;
  beat: string;
  attempts: string;
  text: string;
  status: "done" | "failed" | "cancelled" | "hidden";
  kind: AnswerKind | "";
  provider: string;
  model: string;
  provenance: string;
  idem: string | null;
  at: string;
};

export type RouteCard = {
  urgent: boolean;
  note: string;
  general: string;
  links: { label: string; href: string }[];
  contacts: { label: string; route: string }[];
};
type SourceRef = { ref: string; id: string; title: string; href: string; meta: string; revision: string; anchor: string };
type Provenance = {
  sources: SourceRef[];
  feedback: { ref: string; blockId: string; label: string }[];
  people: { ref: string; id: string; name: string; revision: number }[];
  route: RouteCard | null;
  /** Why an answer was fixed instead of written: "personal details", "no approved source", "nothing cited". */
  reason: string;
};
const noProvenance = (): Provenance => ({ sources: [], feedback: [], people: [], route: null, reason: "" });

/** A turn as the learner's page gets it. */
export type RelayTurnView = {
  id: string;
  role: "learner" | "ava";
  mode: RelayMode;
  pageId: string;
  pageTitle: string;
  text: string;
  status: TurnRow["status"];
  kind: AnswerKind | "";
  kindLabel: string;
  sources: { ref: string; title: string; href: string; meta: string }[];
  feedback: { ref: string; label: string }[];
  people: { ref: string; id: string; name: string }[];
  route: RouteCard | null;
  at: string;
};
export type RelayStreamEvent = { type: "start"; learner: RelayTurnView } | { type: "final"; turn: RelayTurnView } | { type: "error"; message: string };

const str = (v: unknown, max: number) => (typeof v === "string" ? v.trim().slice(0, max) : "");
const idOf = (v: unknown) => (typeof v === "string" && /^[\w-]{1,80}$/.test(v) ? v : "");
const modeOf = (v: unknown): RelayMode => (v === "work" ? "work" : "story");
const setting = (db: Db, key: string) => (db.prepare("SELECT value FROM settings WHERE key = ?").get(key) as { value: string } | undefined)?.value ?? null;
const setSetting = (db: Db, key: string, value: string) =>
  db.prepare("INSERT INTO settings (key, value) VALUES (?, ?) ON CONFLICT (key) DO UPDATE SET value = excluded.value").run(key, value);

// ---------------------------------------------------------------------------------------------
// Hub settings
// ---------------------------------------------------------------------------------------------

/** The Hub's switch for the relay (off stops it everywhere at once) and how long conversations are kept. */
export function relaySettings(db: Db) {
  const days = Number(setting(db, "relay_retention_days"));
  return { on: setting(db, "relay_on") !== "0", retentionDays: Number.isInteger(days) && days >= 1 && days <= 90 ? days : RELAY_RETENTION_DAYS };
}
export function saveRelaySettings(db: Db, actor: User, input: Record<string, unknown>, now: Date) {
  if (!isSuperadmin(actor)) throw new HttpError(403, "Only a Hub administrator can change Ava Relay’s settings.");
  const before = relaySettings(db);
  const days = Math.floor(Number(input.retentionDays));
  const next = {
    on: typeof input.on === "boolean" ? input.on : before.on,
    retentionDays: Number.isInteger(days) && days >= 1 && days <= 90 ? days : before.retentionDays,
  };
  setSetting(db, "relay_on", next.on ? "1" : "0");
  setSetting(db, "relay_retention_days", String(next.retentionDays));
  audit(db, { actor: actor.id, event: "relay.settings", entity: "relay", previous: before, next, at: now });
  return next;
}

/** Conversations past their expiry go, words and all. Events stay: they hold none. */
function purge(db: Db, now: Date) {
  const at = now.toISOString();
  db.prepare("DELETE FROM relay_turns WHERE session_id IN (SELECT id FROM relay_sessions WHERE expires_at <= ?)").run(at);
  db.prepare("DELETE FROM relay_sessions WHERE expires_at <= ?").run(at);
}

// ---------------------------------------------------------------------------------------------
// What Ava is told
// ---------------------------------------------------------------------------------------------

type Setup = {
  ed: Edition;
  page: Page;
  cfg: RelayPage;
  course: RelayCourse;
  ctx: RelayContext;
  canon: ReturnType<typeof relayCanon>;
  people: RelayPerson[];
  /** The learner has seen Ava's opening transmission on this page (or it's shown as text). */
  introduced: boolean;
};

/**
  Story moments placed on this page, as far as the learner has seen them. A moment shown as text is on the page.
  A transmission with a checked video says nothing to Ava until the learner has played or skipped it.
*/
function momentsSeen(db: Db, user: User, ed: Edition, page: Page, watched: boolean | null, now: Date) {
  const places = new Set([`page:${page.id}`, ...pageBlocks(page).map((b) => b.id)]);
  const lines: string[] = [];
  let introduced = false;
  for (const m of storyFor(db, user, { guide: ed.id }, now).moments) {
    if (!places.has(m.place) || m.kind === "check_in") continue;
    const played =
      !m.video ||
      (watched ??
        Boolean(
          db
            .prepare(
              "SELECT 1 FROM story_events WHERE user_id = ? AND moment_id = ? AND event IN ('ava_transmission_ended','ava_transmission_skipped','ava_poster_shown') LIMIT 1",
            )
            .get(user.id, m.momentId),
        ));
    if (!played) continue;
    if (m.kind === "opening_transmission") introduced = true;
    lines.push(`[${m.speaker.name}${m.whenLabel ? `, ${m.whenLabel}` : ""}] ${m.script}`);
  }
  return { lines, introduced };
}

function setup(db: Db, user: User, ed: Edition, pageId: string, opts: { watched?: boolean | null }, now: Date): Setup {
  if (!relaySettings(db).on) throw new HttpError(503, "Ava’s relay is switched off at the moment.");
  const page = ed.doc.pages.find((p) => p.id === pageId);
  const course = ed.doc.relay;
  if (!page || !course || !relayOn(course, page) || !page.relay) throw new HttpError(404, "Ava isn’t on this page.");
  const cfg = page.relay;
  const ctx = relayContext(ed.doc, page.id, ed.answers, { courseTitle: ed.title, hold: cfg.hold, activity: cfg.activity })!;
  const canon = relayCanon(db, user, { picks: cfg.characters, episode: cfg.episode }, now);
  if (!canon.ava) throw new HttpError(503, "Ava isn’t available right now.");
  const seen = momentsSeen(db, user, ed, page, opts.watched ?? null, now);
  if (seen.lines.length) ctx.page.text = `${seen.lines.join("\n")}\n${ctx.page.text}`;
  const people: RelayPerson[] = canon.people.map((p, i) => ({
    ref: `C${i + 1}`,
    name: p.name,
    role: p.profile.narrativeRole,
    summary: p.profile.summary,
    matters: p.profile.matters,
    relationships: p.profile.relationships.map((r) => `${r.name} (${r.relation})${r.note ? `: ${r.note}` : ""}`),
    facts: p.profile.facts.map((f) => f.text),
    episodes: p.episodes.map((e) => `${e.whenLabel ? `${e.whenLabel}: ` : ""}${e.title}. ${e.summary}`),
  }));
  return { ed, page, cfg, course, ctx, canon, people, introduced: seen.introduced };
}

const avaOf = (s: Setup) => {
  const a = s.canon.ava!;
  return { name: a.name, role: a.profile.narrativeRole, summary: a.profile.summary, portrayal: a.profile.portrayal, never: a.profile.never };
};

/** The context card: what Ava is looking at with the learner. */
function cardOf(s: Setup) {
  return {
    course: s.ed.title,
    page: s.ctx.page.title,
    pageId: s.page.id,
    scene: s.canon.episode ? [s.canon.episode.whenLabel, s.canon.episode.title].filter(Boolean).join(": ") : s.cfg.beat,
    episode: s.canon.episode?.id ?? "",
    people: s.canon.people.map((p) => ({ id: p.id, name: p.name })),
    where: whereLine(s.ctx, s.cfg.activity),
  };
}

function routeCard(db: Db, user: User, course: RelayCourse, concern: Concern, now: Date): RouteCard {
  return { urgent: concern === "urgent", note: NOT_SUBMITTED, general: GENERAL_ROUTE, links: course.routes, contacts: contactRoutes(db, user, now) };
}

// ---------------------------------------------------------------------------------------------
// Work guidance: approved sources this person may open today
// ---------------------------------------------------------------------------------------------

type Found = RelaySourceDoc & SourceRef;
const HUB_KINDS: Partial<Record<RelaySource, string>> = { topics: "lesson", resources: "resource", webinars: "webinar" };

/**
  The approved sources that cover a question, best first, each with the exact release or place it would be cited
  at. Playbooks come first: they have an owner, an effective date and a review date. Stories and news are never
  searched. Nothing found means nothing is sent to the model.
*/
export function findSources(db: Db, user: User, course: RelayCourse, question: string, hint: string, now: Date): Found[] {
  let words = keywordsOf(question).slice(0, 12);
  // A general question ("Find the relevant guidance") is about what the page is about.
  if (words.length < 3) words = [...new Set([...words, ...keywordsOf(hint)])].slice(0, 12);
  if (!words.length) return [];
  const out: Omit<Found, "ref">[] = [];
  if (course.sources.includes("playbooks")) {
    const scored = playbooksForRelay(db, user, now)
      .map((pb) => {
        const head = `${pb.title} ${pb.tag}`.toLowerCase();
        const rest = `${pb.purpose} ${pb.steps.map((st) => `${st.text} ${st.why}`).join(" ")}`.toLowerCase();
        const score = words.reduce((n, w) => n + (head.includes(w) ? 4 : rest.includes(w) ? 1 : 0), 0);
        const step = pb.steps.find((st) => words.some((w) => st.text.toLowerCase().includes(w)));
        return { pb, score, step };
      })
      .filter((x) => x.score >= Math.min(3, words.length))
      .sort((a, b) => b.score - a.score)
      .slice(0, 2);
    for (const { pb, step } of scored)
      out.push({
        id: `playbook:${pb.id}`,
        title: pb.title,
        kind: "Live SOP playbook",
        meta: [
          `Release ${pb.number}`,
          pb.effectiveOn && `effective ${pb.effectiveOn}`,
          pb.ownerTeam && `owner: ${pb.ownerTeam}`,
          pb.reviewBy && `review by ${pb.reviewBy}`,
        ]
          .filter(Boolean)
          .join(" · "),
        text: `${pb.purpose}\n${pb.steps.map((st, i) => `${i + 1}. ${st.text}${st.why ? ` (${st.why})` : ""}`).join("\n")}`,
        reviewDue: pb.reviewDue,
        href: `/tools/${pb.id}`,
        revision: `release ${pb.number}`,
        anchor: step?.id ?? "",
      });
  }
  const only = course.sources.flatMap((sc) => (HUB_KINDS[sc] ? [HUB_KINDS[sc]!] : []));
  if (only.length)
    for (const d of related(db, user, words.join(" "), { limit: 3, chars: 2200, only })) {
      const lesson = d.id.startsWith("lesson:") ? lessonBySlug(d.id.slice("lesson:".length)) : undefined;
      const hit = lesson ? bestCard(lesson, words) : null;
      out.push({
        id: d.id,
        title: d.title,
        kind: d.meta.split(" · ")[0],
        meta: hit ? `${d.meta} · ${hit.card.heading || hit.card.label || "the card that covers it"}` : d.meta,
        text: hit ? `${hit.passage}\n${d.text}`.slice(0, 2400) : d.text,
        href: hit ? `${d.href}?card=${encodeURIComponent(hit.card.id)}` : d.href,
        revision: "as published",
        anchor: hit?.card.id ?? "",
      });
    }
  return out.slice(0, 4).map((d, i) => ({ ...d, ref: `S${i + 1}` }));
}

// ---------------------------------------------------------------------------------------------
// Sessions and turns
// ---------------------------------------------------------------------------------------------

const sessionRow = (db: Db, id: string) => db.prepare("SELECT * FROM relay_sessions WHERE id = ?").get(id) as SessionRow | undefined;
const turnRows = (db: Db, sessionId: string) => db.prepare("SELECT * FROM relay_turns WHERE session_id = ? ORDER BY n").all(sessionId) as TurnRow[];

const titleOfPage = (doc: GuideDoc, title: string, pageId: string) => {
  const p = doc.pages.find((x) => x.id === pageId);
  return p ? pageTitle(doc, p, title) : "An earlier page";
};

function view(t: TurnRow, ed: Edition, prov: Provenance = JSON.parse(t.provenance) as Provenance): RelayTurnView {
  return {
    id: t.id,
    role: t.role,
    mode: t.mode,
    pageId: t.page_id,
    pageTitle: titleOfPage(ed.doc, ed.title, t.page_id),
    text: t.role === "learner" && t.status === "hidden" && !t.text ? NOT_SENT : t.text,
    status: t.status,
    kind: t.kind,
    kindLabel: t.kind ? ANSWER_KINDS[t.kind] : "",
    sources: (prov.sources ?? []).map(({ ref, title, href, meta }) => ({ ref, title, href, meta })),
    feedback: (prov.feedback ?? []).map(({ ref, label }) => ({ ref, label })),
    people: (prov.people ?? []).map(({ ref, id, name }) => ({ ref, id, name })),
    route: prov.route ?? null,
    at: t.at,
  };
}

/**
  A learner's earlier turns, as they may see them now. An answer that leaned on a source or a person's story they
  can no longer open is not shown again.
*/
function visibleTurns(db: Db, user: User, ed: Edition, rows: TurnRow[], now: Date): RelayTurnView[] {
  let openable: Set<string> | null = null;
  let playbooks: Set<string> | null = null;
  return rows.map((t) => {
    const prov = { ...noProvenance(), ...(JSON.parse(t.provenance) as Partial<Provenance>) };
    let lost = false;
    for (const s of prov.sources) {
      if (s.id.startsWith("playbook:")) {
        playbooks ??= new Set(playbooksForRelay(db, user, now).map((p) => `playbook:${p.id}`));
        lost ||= !playbooks.has(s.id);
      } else {
        openable ??= openableIds(db, user);
        lost ||= !openable.has(s.id);
      }
    }
    if (!lost && prov.people.length) {
      const still = new Set(
        relayCanon(db, user, { picks: prov.people.map((p) => ({ id: p.id, revision: p.revision })), episode: "" }, now).people.map((p) => p.id),
      );
      lost = prov.people.some((p) => !still.has(p.id));
    }
    return lost
      ? view({ ...t, text: "This answer used something you can no longer open, so it isn’t shown.", status: "hidden" }, ed, noProvenance())
      : view(t, ed, prov);
  });
}

function event(
  db: Db,
  user: User,
  e: {
    session?: string;
    guide: string;
    revision: string;
    page?: string;
    beat?: string;
    mode?: string;
    event: RelayEventName;
    outcome?: string;
    key: string | null;
    at: Date;
  },
) {
  return db
    .prepare(
      "INSERT OR IGNORE INTO relay_events (at, user_id, audience, session_id, guide_id, revision_id, page_id, beat, mode, event, outcome, idem) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)",
    )
    .run(
      e.at.toISOString(),
      user.id,
      user.audience,
      e.session ?? "",
      e.guide,
      e.revision,
      e.page ?? "",
      e.beat ?? "",
      e.mode ?? "",
      e.event,
      e.outcome ?? "",
      e.key,
    ).changes;
}

/** An engagement event from the page: dialled, linked, mode changed, a source opened, failed, closed. Sent twice, it counts once. */
export function recordRelayEvent(db: Db, user: User, input: Record<string, unknown>, now: Date) {
  ensureRelayTables(db);
  const name = CLIENT_EVENTS.find((e) => e === input.event);
  if (!name) throw new HttpError(400, "Unknown event.");
  const ed = relayEdition(db, user, str(input.slug, 120));
  const page = ed.doc.pages.find((p) => p.id === input.pageId);
  if (!page || !relayOn(ed.doc.relay, page)) throw new HttpError(404, "Ava isn’t on this page.");
  const s = idOf(input.sessionId) ? sessionRow(db, idOf(input.sessionId)) : undefined;
  const key = typeof input.key === "string" && /^[A-Za-z0-9-]{8,100}$/.test(input.key) ? `${user.id}:${input.key}` : null;
  const recorded = event(db, user, {
    session: s && s.user_id === user.id ? s.id : "",
    guide: ed.id,
    revision: ed.revisionId,
    page: page.id,
    beat: page.relay?.episode || page.relay?.beat || "",
    mode: modeOf(input.mode),
    event: name,
    outcome: str(input.outcome, 40).replace(/[^\w -]/g, ""),
    key,
    at: now,
  });
  return { ok: true, recorded: recorded > 0 };
}

/** What a linked relay shows before anything is asked. */
function linked(s: Setup, extra: { sessionId: string; preview: boolean; turns: RelayTurnView[]; resumed: boolean }) {
  const ava = s.canon.ava!;
  return {
    ...extra,
    ava: { name: ava.name, line: ava.profile.narrativeRole, portrait: ava.portrait, monogram: ava.name.slice(0, 1).toUpperCase() },
    card: cardOf(s),
    work: s.course.work,
    opening: s.cfg.opening || DEFAULT_OPENING,
    prompts: { story: s.cfg.prompts.length ? s.cfg.prompts : [...STORY_PROMPTS], work: [...WORK_PROMPTS] },
    notes: RELAY_NOTES,
  };
}
export type RelayLinked = ReturnType<typeof linked>;

/** What an author's preview stands in for: the learner's answers so far, and whether they've watched the opening. */
type PreviewInput = { guideId: string; answers: Record<string, string>; watched: boolean; as: User["audience"] | "" };
/** Who an author's preview answers as: a learner in the chosen role, so sources and people are filtered as theirs would be. */
const viewerOf = (actor: User, p: PreviewInput): User => (p.as ? { ...actor, role: "learner", audience: p.as, superadmin: 0 } : actor);
function previewOf(input: unknown): PreviewInput | null {
  const o = input && typeof input === "object" ? (input as Record<string, unknown>) : null;
  if (!o || !idOf(o.guideId)) return null;
  const answers = o.answers && typeof o.answers === "object" ? (o.answers as Record<string, unknown>) : {};
  return {
    guideId: idOf(o.guideId),
    answers: Object.fromEntries(
      Object.entries(answers)
        .filter(([k, v]) => /^[\w:-]{1,90}$/.test(k) && typeof v === "string")
        .slice(0, 200)
        .map(([k, v]) => [k, String(v).slice(0, 90)]),
    ),
    watched: o.watched === true,
    as: o.as === "partner" || o.as === "coordinator" || o.as === "staff" ? o.as : "",
  };
}
function previewEdition(db: Db, actor: User, p: PreviewInput): Edition {
  return { ...relayDraftEdition(db, actor, p.guideId), answers: p.answers };
}

/**
  Dialling: the conversation is made ready. Refused when there is nothing to answer with, so the page can say so
  honestly. Picks up the learner's open conversation on this edition of the course, or starts one (`fresh`).
*/
export function relayLink(db: Db, user: User, input: Record<string, unknown>, now: Date): RelayLinked {
  ensureRelayTables(db);
  const preview = previewOf(input.preview);
  if (!relayProvider())
    throw new HttpError(503, canAuthor(user) ? "Neither Claude nor OpenAI is connected, so Ava can’t answer." : "Ava’s relay isn’t connected right now.");
  if (preview) {
    const s = setup(db, viewerOf(user, preview), previewEdition(db, user, preview), str(input.pageId, 80), { watched: preview.watched }, now);
    return linked(s, { sessionId: "preview", preview: true, turns: [], resumed: false });
  }
  const ed = relayEdition(db, user, str(input.slug, 120));
  if (typeof input.revisionId === "string" && input.revisionId !== ed.revisionId)
    throw new HttpError(409, "This course has been updated. Reload the page to read the latest version.");
  const s = setup(db, user, ed, str(input.pageId, 80), {}, now);
  const mode = modeOf(input.mode);
  // Only the session's own rows change together; reading earlier turns back happens afterwards.
  const opened = tx(db, () => {
    purge(db, now);
    const at = now.toISOString();
    let row = db
      .prepare("SELECT * FROM relay_sessions WHERE user_id = ? AND guide_id = ? AND revision_id = ? AND status = 'open' ORDER BY created_at DESC LIMIT 1")
      .get(user.id, ed.id, ed.revisionId) as SessionRow | undefined;
    if (row && input.fresh === true) {
      // A new conversation: the old one's words go now, not at expiry.
      db.prepare("DELETE FROM relay_turns WHERE session_id = ?").run(row.id);
      db.prepare("UPDATE relay_sessions SET status = 'closed', updated_at = ? WHERE id = ?").run(at, row.id);
      row = undefined;
    }
    if (!row) {
      const id = `rs-${randomUUID().slice(0, 16)}`;
      const expires = new Date(now.getTime() + relaySettings(db).retentionDays * 86_400_000).toISOString();
      db.prepare(
        "INSERT INTO relay_sessions (id, user_id, audience, guide_id, revision_id, mode, last_page, status, created_at, updated_at, expires_at) VALUES (?, ?, ?, ?, ?, ?, ?, 'open', ?, ?, ?)",
      ).run(id, user.id, user.audience, ed.id, ed.revisionId, mode, s.page.id, at, at, expires);
      return { id, isNew: true };
    }
    db.prepare("UPDATE relay_sessions SET last_page = ?, updated_at = ? WHERE id = ?").run(s.page.id, at, row.id);
    return { id: row.id, isNew: false };
  });
  const turns = opened.isNew ? [] : visibleTurns(db, user, ed, turnRows(db, opened.id), now);
  return linked(s, { sessionId: opened.id, preview: false, turns, resumed: turns.length > 0 });
}

// ---------------------------------------------------------------------------------------------
// Asking
// ---------------------------------------------------------------------------------------------

type Saved = { text: string; status: TurnRow["status"]; kind: AnswerKind | ""; provenance: Provenance; provider: RelayProvider | null };
type Prepared = {
  /** Who the answer is for: the learner, or the role an author is previewing as. */
  viewer: User;
  setup: Setup;
  mode: RelayMode;
  learner: RelayTurnView;
  /** Stores Ava's turn (nothing in a preview) and gives it back as the page gets it. */
  save: (a: Saved, at: Date) => RelayTurnView;
  /** An answer that needs no model. */
  fixed: Saved | null;
  /** A resend of a question already answered: the answer it got. */
  replay: RelayTurnView | null;
  provider: RelayProvider | null;
  request: RelayRequest | null;
  found: Found[];
  route: RouteCard | null;
};

const pairs = (turns: { role: "learner" | "ava"; mode: RelayMode; text: string; status: string; kind: string }[], mode: RelayMode) => {
  const out: { role: "user" | "assistant"; content: string }[] = [];
  for (let i = 0; i + 1 < turns.length; i++) {
    const [q, a] = [turns[i], turns[i + 1]];
    if (q.role !== "learner" || a.role !== "ava" || q.mode !== mode || a.status !== "done" || !q.text || !a.text || a.kind === "privacy") continue;
    out.push({ role: "user", content: q.text }, { role: "assistant", content: a.text });
    i += 1;
  }
  return out.slice(-HISTORY_PAIRS * 2);
};

/**
  Checks a question and gathers what answers it. Throws an HttpError (shown to the learner) for anything wrong
  before the answer starts; after that, problems arrive as an "error" event and the page stays usable.
*/
export function prepareAsk(db: Db, user: User, input: Record<string, unknown>, now: Date, signal?: AbortSignal): Prepared {
  ensureRelayTables(db);
  const text = typeof input.text === "string" ? input.text.trim() : "";
  if (!text) throw new HttpError(400, "Type a question first.");
  if (text.length > RELAY_MAX_QUESTION) throw new HttpError(400, `Keep your question under ${RELAY_MAX_QUESTION} characters.`);
  const mode = modeOf(input.mode);
  const pageId = str(input.pageId, 80);
  const at = now.toISOString();
  const preview = previewOf(input.preview);
  const provider = relayProvider();
  const since = new Date(now.getTime() - 3_600_000).toISOString();

  let s: Setup;
  let viewer = user;
  let session: SessionRow | undefined;
  let history: Parameters<typeof pairs>[0] = [];
  if (preview) {
    requireAuthor(user);
    const asked = db.prepare("SELECT COUNT(*) n FROM audit WHERE actor = ? AND event = 'relay.preview' AND at > ?").get(user.id, since) as { n: number };
    if (asked.n >= RELAY_PREVIEWS_PER_HOUR) throw new HttpError(429, "That’s a lot of test questions this hour. Try again a little later.");
    viewer = viewerOf(user, preview);
    s = setup(db, viewer, previewEdition(db, user, preview), pageId, { watched: preview.watched }, now);
    history = (Array.isArray(input.turns) ? input.turns : []).slice(-HISTORY_PAIRS * 2).map((t: Record<string, unknown>) => ({
      role: t?.role === "ava" ? ("ava" as const) : ("learner" as const),
      mode: modeOf(t?.mode),
      text: str(t?.text, 2000),
      status: "done",
      kind: str(t?.kind, 20),
    }));
    audit(db, { actor: user.id, event: "relay.preview", entity: `guide:${preview.guideId}`, next: { page: pageId, mode }, at: now });
  } else {
    session = idOf(input.sessionId) ? sessionRow(db, idOf(input.sessionId)) : undefined;
    // Someone else's conversation looks the same as none.
    if (!session || session.user_id !== user.id || session.status !== "open" || session.expires_at <= at)
      throw new HttpError(404, "That conversation has ended. Close Ava and dial again.");
    const ed = relayEdition(db, user, session.guide_id);
    if (ed.revisionId !== session.revision_id) throw new HttpError(409, "This course has been updated. Close Ava and reload the page.");
    s = setup(db, user, ed, pageId, {}, now);
    const asked = db
      .prepare("SELECT COUNT(*) n FROM relay_turns t JOIN relay_sessions x ON x.id = t.session_id WHERE x.user_id = ? AND t.role = 'learner' AND t.at > ?")
      .get(user.id, since) as { n: number };
    if (asked.n >= RELAY_QUESTIONS_PER_HOUR) throw new HttpError(429, "You’ve asked a lot of questions this hour. Try again a little later.");
    history = turnRows(db, session.id);
  }
  const idem = typeof input.key === "string" && /^[A-Za-z0-9-]{8,100}$/.test(input.key) ? input.key : null;
  const beat = s.cfg.episode || s.cfg.beat;
  const attempts = JSON.stringify(attemptState(s.ctx));
  const found = personalDetails(text);
  const base = { mode, page_id: s.page.id, beat, attempts, provider: "", model: "", idem: null as string | null, at };

  // A resend (a double click, a retry after a dropped connection) gets the answer the first one got.
  if (session && idem) {
    const first = db.prepare("SELECT * FROM relay_turns WHERE session_id = ? AND idem = ?").get(session.id, idem) as TurnRow | undefined;
    if (first) {
      const reply = db.prepare("SELECT * FROM relay_turns WHERE session_id = ? AND n = ?").get(session.id, first.n + 1) as TurnRow | undefined;
      if (reply)
        return {
          viewer,
          setup: s,
          mode,
          learner: view(first, s.ed),
          save: () => view(reply, s.ed),
          fixed: null,
          replay: view(reply, s.ed),
          provider,
          request: null,
          found: [],
          route: null,
        };
      throw new HttpError(409, "Ava is still answering that one.");
    }
  }

  if (!provider) throw new HttpError(503, "Ava’s relay isn’t connected right now.");
  if (mode === "work" && !s.course.work) throw new HttpError(400, "Work guidance isn’t offered on this course.");

  // The learner's turn. With personal details in it, the words are neither sent nor kept.
  const kept = found.length ? "" : text;
  const next = session
    ? (db.prepare("SELECT COALESCE(MAX(n), 0) n FROM relay_turns WHERE session_id = ?").get(session.id) as { n: number }).n + 1
    : history.length + 1;
  const learnerRow: TurnRow = {
    ...base,
    id: `rt-${randomUUID().slice(0, 16)}`,
    session_id: session?.id ?? "preview",
    n: next,
    role: "learner",
    text: kept,
    status: found.length ? "hidden" : "done",
    kind: "",
    provenance: "{}",
    idem,
  };
  if (session) {
    db.prepare(
      "INSERT INTO relay_turns (id, session_id, n, role, mode, page_id, beat, attempts, text, status, kind, provider, model, provenance, idem, at) VALUES (?, ?, ?, 'learner', ?, ?, ?, ?, ?, ?, '', '', '', '{}', ?, ?)",
    ).run(learnerRow.id, session.id, next, mode, s.page.id, beat, attempts, kept, learnerRow.status, idem, at);
    db.prepare("UPDATE relay_sessions SET mode = ?, last_page = ?, updated_at = ? WHERE id = ?").run(mode, s.page.id, at, session.id);
    event(db, user, {
      session: session.id,
      guide: s.ed.id,
      revision: s.ed.revisionId,
      page: s.page.id,
      beat,
      mode,
      event: "ava_question_submitted",
      key: `q:${learnerRow.id}`,
      at: now,
    });
  }
  const learner = view(learnerRow, s.ed);

  const save = (a: Saved, when: Date): RelayTurnView => {
    const row: TurnRow = {
      ...base,
      id: `rt-${randomUUID().slice(0, 16)}`,
      session_id: session?.id ?? "preview",
      n: next + 1,
      role: "ava",
      text: a.text,
      status: a.status,
      kind: a.kind,
      provider: a.provider?.id ?? "",
      model: a.provider?.model ?? "",
      provenance: JSON.stringify(a.provenance),
      at: when.toISOString(),
    };
    if (session) {
      db.prepare(
        "INSERT INTO relay_turns (id, session_id, n, role, mode, page_id, beat, attempts, text, status, kind, provider, model, provenance, idem, at) VALUES (?, ?, ?, 'ava', ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, NULL, ?)",
      ).run(row.id, session.id, row.n, mode, s.page.id, beat, attempts, row.text, row.status, row.kind, row.provider, row.model, row.provenance, row.at);
      event(db, user, {
        session: session.id,
        guide: s.ed.id,
        revision: s.ed.revisionId,
        page: s.page.id,
        beat,
        mode,
        event: a.status === "done" ? "ava_answer_delivered" : "ava_relay_failed",
        outcome: a.status === "done" ? a.kind : `answer ${a.status}`,
        key: `a:${row.id}`,
        at: when,
      });
      // The audit record says an answer was given and where it came from. Never what was asked or said.
      audit(db, {
        actor: user.id,
        event: "relay.answer",
        entity: `guide:${s.ed.id}`,
        next: {
          revision: s.ed.revision,
          page: s.page.id,
          mode,
          kind: a.kind,
          status: a.status,
          provider: row.provider,
          model: row.model,
          sources: a.provenance.sources.map((x) => `${x.id} (${x.revision})`),
          reason: a.provenance.reason,
        },
        at: when,
      });
    }
    return view(row, s.ed);
  };

  const concern = concernOf(text);
  const route = concern ? routeCard(db, viewer, s.course, concern, now) : null;
  const out: Prepared = { viewer, setup: s, mode, learner, save, fixed: null, replay: null, provider, request: null, found: [], route };
  const fixed = (textOut: string, kind: AnswerKind, reason: string, withRoute: RouteCard | null): Prepared => ({
    ...out,
    fixed: { text: textOut, status: "done", kind, provenance: { ...noProvenance(), route: withRoute, reason }, provider: null },
  });

  if (found.length) return fixed(privacyReply(found), "privacy", "personal details", null);
  if (mode === "work") {
    const sources = findSources(db, viewer, s.course, text, `${s.cfg.purpose} ${s.ctx.page.title}`, now);
    // Nothing approved covers it: say so, and give the route. No model is asked.
    if (!sources.length)
      return fixed(
        `${concern === "urgent" ? `${URGENT_FIRST} ` : ""}${NO_ANSWER}`,
        concern ? "route" : "no_answer",
        "no approved source",
        route ?? routeCard(db, viewer, s.course, null, now),
      );
    const system = workSystem({ ava: avaOf(s), course: s.ed.title, page: s.ctx.page.title });
    return {
      ...out,
      found: sources,
      request: { ...system, messages: [...pairs(history, "work"), { role: "user", content: `${text}\n\n${sourcesBlock(sources)}` }], maxTokens: 700, signal },
    };
  }
  const system = storySystem({ ava: avaOf(s), course: s.ed.title, purpose: s.cfg.purpose, redirect: s.cfg.redirect, ctx: s.ctx, people: s.people });
  const context = s.introduced
    ? `${system.context}\n\nThe learner has already had your opening transmission on this page. Don’t introduce yourself again.`
    : system.context;
  return { ...out, request: { rules: system.rules, context, messages: [...pairs(history, "story"), { role: "user", content: text }], maxTokens: 500, signal } };
}

/** Runs the answer, as events: the learner's turn, then the finished, checked turn (or an error). */
export async function* relayAnswer(db: Db, p: Prepared, clock: () => Date = () => new Date()): AsyncGenerator<RelayStreamEvent> {
  yield { type: "start", learner: p.learner };
  if (p.replay) {
    yield { type: "final", turn: p.replay };
    return;
  }
  if (p.fixed) {
    yield { type: "final", turn: p.save(p.fixed, clock()) };
    return;
  }
  const s = p.setup;
  let text = "";
  try {
    // An answer is checked whole before any of it is shown: its tags, and that it doesn't hand over an option.
    for await (const piece of relayText(p.provider!, p.request!)) text += piece;
  } catch (e) {
    const cancelled = p.request?.signal?.aborted === true;
    if (!cancelled) console.error("relay answer failed", e instanceof Error ? e.message : e);
    p.save({ text: "", status: cancelled ? "cancelled" : "failed", kind: "", provenance: noProvenance(), provider: p.provider }, clock());
    yield { type: "error", message: "Ava couldn’t answer just now. Your page is still here: try again, or carry on reading." };
    return;
  }
  const attempted = s.ctx.page.activities.filter((a) => a.attempted && a.feedback);
  const valid = p.mode === "work" ? p.found.map((f) => f.ref) : [...attempted.map((a) => a.ref), ...s.people.map((x) => x.ref)];
  const { text: clean, cited } = citations(text, valid);
  const kind = answerKind(p.mode, cited);
  if (!clean) {
    p.save({ text: "", status: "failed", kind: "", provenance: noProvenance(), provider: p.provider }, clock());
    yield { type: "error", message: "Ava couldn’t answer just now. Your page is still here: try again, or carry on reading." };
    return;
  }
  // A story answer that repeats one option of something they haven't answered is not shown either.
  const open = s.ctx.page.activities.filter((a) => !a.attempted && a.options.length > 1);
  if (p.mode === "story" && open.some((a) => quotesOption(clean, a.options))) {
    yield {
      type: "final",
      turn: p.save(
        {
          text: NO_POINTING,
          status: "done",
          kind: "story",
          provenance: { ...noProvenance(), route: p.route, reason: "repeated an option" },
          provider: p.provider,
        },
        clock(),
      ),
    };
    return;
  }
  // Nor one that reports feedback or a verdict when the learner has answered nothing here, so there is none to report.
  if (p.mode === "story" && open.length > 0 && !attempted.length && claimsFeedback(clean)) {
    yield {
      type: "final",
      turn: p.save(
        {
          text: NO_FEEDBACK_YET,
          status: "done",
          kind: "story",
          provenance: { ...noProvenance(), route: p.route, reason: "spoke of feedback there isn't" },
          provider: p.provider,
        },
        clock(),
      ),
    };
    return;
  }
  // A work answer that cites nothing real is not shown.
  if (p.mode === "work" && kind === "no_answer") {
    const route = p.route ?? routeCard(db, p.viewer, s.course, null, clock());
    yield {
      type: "final",
      turn: p.save(
        {
          text: NO_ANSWER,
          status: "done",
          kind: p.route ? "route" : "no_answer",
          provenance: { ...noProvenance(), route, reason: "nothing cited" },
          provider: p.provider,
        },
        clock(),
      ),
    };
    return;
  }
  const provenance: Provenance = {
    sources: p.found
      .filter((f) => cited.includes(f.ref))
      .map(({ ref, id, title, href, meta, revision, anchor }) => ({ ref, id, title, href, meta, revision, anchor })),
    feedback: attempted.filter((a) => cited.includes(a.ref)).map((a) => ({ ref: a.ref, blockId: a.blockId, label: a.label })),
    people: s.canon.people.flatMap((x, i) => (cited.includes(`C${i + 1}`) ? [{ ref: `C${i + 1}`, id: x.id, name: x.name, revision: x.revision }] : [])),
    route: p.route,
    reason: "",
  };
  yield { type: "final", turn: p.save({ text: clean, status: "done", kind, provenance, provider: p.provider }, clock()) };
}

// ---------------------------------------------------------------------------------------------
// Authors: what Ava would be told on a page
// ---------------------------------------------------------------------------------------------

/**
  For the editor's "Allowed reveals": what Ava knows on a page of the saved draft now, what she gets once the
  activity is attempted, and what stays back until later. Counts and labels, with the page's own activities named.
*/
export function relayOutlook(db: Db, actor: User, guideId: string, pageId: string, now: Date) {
  requireAuthor(actor);
  const ed = relayDraftEdition(db, actor, guideId);
  const page = ed.doc.pages.find((p) => p.id === pageId);
  if (!page) throw new HttpError(404, "That page isn’t in this course.");
  const cfg = page.relay;
  const ctx = relayContext(ed.doc, page.id, {}, { courseTitle: ed.title, hold: cfg?.hold ?? [], activity: cfg?.activity })!;
  const canon = relayCanon(db, actor, { picks: cfg?.characters ?? [], episode: cfg?.episode ?? "" }, now);
  return {
    provider: Boolean(relayProvider()),
    hubOn: relaySettings(db).on,
    avaApproved: Boolean(canon.ava),
    now: {
      words: ctx.page.text.split(/\s+/).filter(Boolean).length,
      earlierPages: ctx.earlier.length,
      people: canon.people.map((p) => ({ name: p.name, revision: p.revision, current: p.current, episodes: p.episodes.length })),
    },
    afterAttempt: {
      activities: ctx.page.activities.map((a) => ({ blockId: a.blockId, label: a.label, prompt: a.prompt.slice(0, 140) })),
      held: ctx.withheld.held,
    },
    later: { pages: ctx.withheld.laterPages, episodes: canon.later },
  };
}
