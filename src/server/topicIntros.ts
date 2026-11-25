import "server-only";
import type Anthropic from "@anthropic-ai/sdk";
import { lessons, type Lesson } from "@/content/lessons";
import { audit, type Db } from "./db";
import { HttpError, requireAuthor, type User } from "./auth";
import { askForJson } from "./claudeJson";
import { GENERATION_MODEL } from "./generate";
import { claudeConfigured, openaiJson, openaiTextModel } from "./openaiText";
import { originalLesson, refreshPublishedLessons } from "./lessonRegistry";
import { saveDraft } from "./authoredLessons";
import { defaultPresenter, presenterById, presenters, seededDefaultPresenter } from "./introPresenters";
import { videoGenerationEnabled } from "./videoProviders";
import { subjectLabel } from "@/lib/subjects";
import { formatUsd, secondsFor, wordCount } from "@/lib/mediaStudio";
import {
  INTRO_EVENTS,
  INTRO_STATUSES,
  INTRO_WORDS,
  introCardOf,
  introScriptWarnings,
  introState,
  isIntroCard,
  planIntro,
  prepareForProduction,
  setPlaceholder,
  setPresenter,
  setScript,
  titleCardToFold,
  withIntroCard,
  type IntroEvent,
  type IntroPicture,
  type IntroPlan,
  type IntroStatus,
} from "@/lib/topicIntro";

/*
  Topic Video Introductions on the server (docs/topic-video-introductions.md): drafting the presenter's script with AI,
  the Topic Introduction Manager (every Topic's introduction, with bulk actions), the one-off migration that gives every
  existing Topic its Introduction card, and the introduction's analytics. Paid AI calls happen only when an author asks
  and confirms; video generation (Synthesia) is switched off, and nothing here calls it.
*/

// ---------------------------------------------------------------------------------------------
// Every Topic, draft and published
// ---------------------------------------------------------------------------------------------

type Row = { slug: string; draft: string; published: string | null; updated_at: string; deleted_at: string | null };
export type TopicCopy = { slug: string; draft: Lesson; published: Lesson | null; row: boolean; updatedAt: string | null };

/** Every Topic an author can edit (not follow-up steps, not deleted): its draft and what learners see. */
export function allTopics(db: Db): TopicCopy[] {
  const rows = db.prepare("SELECT slug, draft, published, updated_at, deleted_at FROM authored_lessons").all() as Row[];
  const bySlug = new Map(rows.map((r) => [r.slug, r]));
  const out: TopicCopy[] = [];
  for (const r of rows) {
    if (r.deleted_at) continue;
    const draft = JSON.parse(r.draft) as Lesson;
    if (draft.track === "reinforcement") continue;
    out.push({ slug: r.slug, draft, published: r.published ? (JSON.parse(r.published) as Lesson) : null, row: true, updatedAt: r.updated_at });
  }
  // Content-file Topics never edited: their code is both the draft and what learners see.
  for (const l of lessons) {
    const original = originalLesson(l.slug);
    if (!original || original.track === "reinforcement" || bySlug.has(l.slug)) continue;
    out.push({ slug: l.slug, draft: original, published: original, row: false, updatedAt: null });
  }
  return out;
}

function topicCopy(db: Db, slug: string) {
  const t = allTopics(db).find((x) => x.slug === slug);
  if (!t) throw new HttpError(404, "Topic not found.");
  return t;
}

// ---------------------------------------------------------------------------------------------
// Drafting the script
// ---------------------------------------------------------------------------------------------

const clip = (s: string, n: number) => (s.length > n ? `${s.slice(0, n)}…` : s);
const plain = (s: string) => s.replace(/\*\*|\*|\[([^\]]+)\]\([^)]+\)/g, "$1").replace(/\s+/g, " ");

/** The prompt: the Topic at a glance (its cards, scenarios, questions and sources) and the rules for the script. */
export function introPrompt(l: Lesson) {
  const cards = Object.values(l.nodes).filter((n) => !isIntroCard(n));
  const ordered = cards.sort((a, b) => a.beat - b.beat);
  const list = ordered
    .map((n) => {
      const extra =
        n.type === "decision"
          ? ` Decision: ${n.prompt} Options: ${n.options.map((o) => o.label).join(" / ")}`
          : n.type === "presenter"
            ? ` Spoken: ${n.transcript}`
            : n.type === "summary"
              ? ` Action: ${n.action}`
              : "";
      return `- [${n.type}] ${n.label}: ${n.heading}. ${clip(plain(n.body), 400)}${clip(extra, 400)}`;
    })
    .join("\n");
  const questions = ordered.flatMap((n) => (n.type === "quiz" ? n.questions.map((q) => `- ${q.prompt}`) : []));
  const sources = [
    ...ordered.flatMap((n) => (n.source ? [`- ${n.source.title} (${n.source.url})`] : [])),
    ...ordered.flatMap((n) => (n.type === "resources" ? n.items.map((i) => `- ${i.title}${i.source ? `, ${i.source}` : ""}`) : [])),
    ...ordered.flatMap((n) => (n.type === "summary" ? (n.references ?? []).map((r) => `- ${r.title}, ${r.issuer}`) : [])),
  ];
  const audience = l.audiences?.length
    ? l.audiences.join(", ")
    : { core: "everyone", partner: "Care Partners", coordinator: "care coordinators", briefing: "everyone (a policy briefing)", reinforcement: "everyone" }[
        l.track
      ];
  return `You are writing the script a presenter says to camera at the start of a Topic on Trilogy Care's Partner Hub: short mobile microlearning for Australian aged care (Care Partners who deliver services, care coordinators, and Trilogy Care's own staff). It is a portrait video of 15 to 30 seconds that opens the Topic, before the learner swipes into the cards.

Topic: ${l.title}
Description: ${l.summary || "(none)"}
Who it's for: ${audience}
Learning outcome and the behaviour it should change: ${l.outcome || "(not given)"}
How it's completed: ${l.completion.label}

The Topic's cards, in order:
${list}
${questions.length ? `\nAssessment questions (never hint at their answers):\n${questions.join("\n")}\n` : ""}${sources.length ? `\nApproved source material the Topic cites:\n${sources.join("\n")}\n` : ""}
Write one script, as one flowing piece of speech (never labelled parts), in this order:
1. Open with a relevant question, situation or challenge the learner will recognise.
2. Why the topic matters.
3. How it connects to the learner's own professional responsibilities.
4. What they'll explore, or be able to do, in this Topic.

For example, for a Topic called "Hiring Runway Window" (an example of the tone and shape only; never reuse its words): "Your business is growing, but your coordinator is starting to work late and client callbacks are taking longer. Is it time to hire, or would that put too much pressure on your cash flow? In this topic, you'll explore how to recognise the right hiring window before growth starts to compromise your team or your clients."

Rules:
- ${INTRO_WORDS.min} to ${INTRO_WORDS.max} words.
- Australian English, warm and professionally confident, conversational, "you", short sentences, written for the ear: no lists, headings, brackets, emoji or symbols a voice would stumble on.
- Never open with "Welcome to this training module", "In this lesson" or anything like it. Don't read the description or the learning outcome aloud: introduce them in your own words.
- No unsupported clinical, financial or regulatory claims: never state a rate, dollar amount, date, rule or requirement, and give no clinical advice. The Topic teaches those, with its sources.
- No spoilers: never give away the right answer to a question or the best choice in a scenario.
- People from the Topic's scenarios may be mentioned by first name, as the cards do. Never invent people or facts.

Reply with only a JSON object, no other text: {"script": "what the presenter says"}`;
}

const FORMULAIC = /^\W*(welcome( back)? to\b|hello and welcome|in (today[’']s|this) (lesson|module|session|course|training))/i;
/** Problems that send the reply back once: no script, outside the word range, or a formulaic opening. */
export function introIssues(value: unknown): string[] {
  const v = value as { script?: unknown } | null;
  if (!v || typeof v !== "object" || typeof v.script !== "string" || !v.script.trim()) return ['Reply with {"script": "…"}.'];
  const n = wordCount(v.script);
  const issues: string[] = [];
  if (n < INTRO_WORDS.min || n > INTRO_WORDS.max) issues.push(`The script is ${n} words; keep it between ${INTRO_WORDS.min} and ${INTRO_WORDS.max}.`);
  if (FORMULAIC.test(v.script.trim())) issues.push("The script opens like a training module. Open with a question, a situation or a challenge.");
  return issues;
}

/** Writes a script from a prompt, checked by `check` (one retry). Tests pass their own, so nothing paid runs in tests. */
export type IntroDrafter = (prompt: string, check: (v: unknown) => string[]) => Promise<{ value: { script: string }; model: string; usage: unknown }>;

/** Claude when it's connected, otherwise OpenAI with the Hub's key: the same adapters the Magazine's narration drafting uses. */
export const hubDrafter: IntroDrafter = async (prompt, check) => {
  if (claudeConfigured()) {
    const content: Anthropic.Beta.BetaContentBlockParam[] = [{ type: "text", text: prompt }];
    const { value, usage } = await askForJson<{ script: string }>(content, check, { onText: () => {}, onPhase: () => {} }, "low");
    return { value, model: GENERATION_MODEL, usage };
  }
  return { value: await openaiJson<{ script: string }>(prompt, check), model: openaiTextModel(), usage: null };
};

export type DraftedIntro = { script: string; words: number; seconds: number; warnings: string[]; model: string };

/** Drafts the presenter's script for the Topic as it stands in the editor. Nothing is saved: the editor puts it in the draft. */
export async function draftIntroScript(db: Db, actor: User, lesson: Lesson, now: Date, drafter: IntroDrafter = hubDrafter): Promise<DraftedIntro> {
  requireAuthor(actor);
  if (!lesson || typeof lesson !== "object" || !lesson.nodes || !lesson.title) throw new HttpError(400, "Send the topic to write an introduction for.");
  if (Object.values(lesson.nodes).filter((n) => !isIntroCard(n)).length < 1)
    throw new HttpError(400, "Add some cards first: the introduction is written from them.");
  const { value, model, usage } = await drafter(introPrompt(lesson), introIssues);
  const script = value.script.trim();
  const words = wordCount(script);
  audit(db, { actor: actor.id, event: "intro.script_drafted", entity: `lesson:${lesson.slug}`, next: { model, words, usage }, at: now });
  return { script, words, seconds: secondsFor(words), warnings: introScriptWarnings(script, lesson), model };
}

/*
  VERIFY before relying on these: US dollars per million tokens, input and output, for the drafting models. Prices change
  and aren't checked here, so they come from the environment (INTRO_TEXT_PRICE_IN and INTRO_TEXT_PRICE_OUT); without
  them the estimate gives the number of paid calls and tokens, and no dollar figure.
*/
function textPrice() {
  const i = Number(process.env.INTRO_TEXT_PRICE_IN);
  const o = Number(process.env.INTRO_TEXT_PRICE_OUT);
  return i > 0 && o > 0 ? { input: i, output: o } : null;
}

/** What drafting these Topics' scripts would cost: one paid call each (two if the first reply needs fixing). */
export function estimateScripts(topics: Lesson[]) {
  const inputTokens = topics.reduce((n, l) => n + Math.ceil(introPrompt(l).length / 4), 0);
  const outputTokens = topics.length * 150;
  const price = textPrice();
  const usd = price ? (inputTokens * price.input + outputTokens * price.output) / 1e6 : null;
  return {
    topics: topics.length,
    calls: topics.length,
    maxCalls: topics.length * 2,
    inputTokens,
    outputTokens,
    model: claudeConfigured() ? GENERATION_MODEL : openaiTextModel(),
    usd,
    label: usd === null ? "No price is configured, so there's no dollar estimate." : `${formatUsd(usd)} (up to double if replies need fixing)`,
  };
}

// ---------------------------------------------------------------------------------------------
// The Topic Introduction Manager
// ---------------------------------------------------------------------------------------------

export type IntroRow = {
  slug: string;
  title: string;
  category: string;
  presenter: { id: string | null; name: string; isDefault: boolean };
  thumbnail: string | null;
  hasIntro: boolean;
  status: IntroStatus;
  statusLabel: string;
  script: string;
  video: string;
  approval: string;
  outdated: boolean;
  reasons: string[];
  words: number;
  topicState: "unpublished" | "live" | "changes";
  updatedAt: string | null;
};

const SCRIPT_LABEL = { required: "Script required", drafted: "Script drafted", approved: "Script approved", review: "Requires review" } as const;
const VIDEO_LABEL = {
  placeholder: "Placeholder",
  ready: "Ready for production",
  generating: "Generating video",
  generated: "Video generated",
  awaiting_approval: "Video awaiting approval",
  approved: "Video approved, not yet published",
  published: "Video published",
  failed: "Generation failed",
} as const;

/** Every Topic's introduction, for the manager. */
export function introOverview(db: Db) {
  const all = presenters(db);
  const fallback = defaultPresenter(db);
  const subjects = Object.fromEntries(
    (db.prepare("SELECT slug, subject FROM topic_subjects").all() as { slug: string; subject: string }[]).map((r) => [r.slug, r.subject]),
  );
  const rows: IntroRow[] = allTopics(db).map((t) => {
    const card = introCardOf(t.draft);
    // A Topic not yet migrated: what it will look like with its Introduction card.
    const view = card ? t.draft : withIntroCard(t.draft, fallback);
    const c = introCardOf(view)!;
    const s = introState(view, t.published);
    const p = (c.intro.presenter && all.find((x) => x.id === c.intro.presenter)) || undefined;
    const legacyName = c.intro.layout === "legacy" && c.visual.kind === "presenter" ? c.visual.name : null;
    const sc = c.intro.script;
    return {
      slug: t.slug,
      title: t.draft.title,
      category: subjects[t.slug]
        ? subjectLabel(subjects[t.slug])
        : { core: "Everyone", partner: "Care Partners", coordinator: "Coordinators", briefing: "Briefing", reinforcement: "" }[t.draft.track],
      presenter: p
        ? { id: p.id, name: p.name, isDefault: p.isDefault }
        : legacyName && !c.intro.presenter
          ? { id: null, name: `${legacyName} (existing card)`, isDefault: false }
          : { id: null, name: fallback.name, isDefault: true },
      thumbnail: c.visual.kind === "presenter" ? (c.visual.video?.poster ?? c.visual.photo?.src ?? null) : null,
      hasIntro: Boolean(card),
      status: s.status,
      statusLabel: INTRO_STATUSES[s.status].label,
      script: SCRIPT_LABEL[s.script],
      video: VIDEO_LABEL[s.video],
      approval:
        sc?.status === "approved"
          ? sc.approvedAt
            ? `Script approved ${sc.approvedAt.slice(0, 10)}`
            : "Script approved (existing)"
          : sc
            ? "Script not approved"
            : "Nothing to approve",
      outdated: s.status === "requires_review",
      reasons: s.reasons,
      words: s.words,
      topicState: !t.published ? "unpublished" : JSON.stringify(t.draft) === JSON.stringify(t.published) ? "live" : "changes",
      updatedAt: t.updatedAt,
    };
  });
  return {
    rows,
    presenters: all,
    videoGeneration: videoGenerationEnabled(),
    migration: introMigrationPreview(db),
  };
}

export type BulkAction = "assign_presenter" | "replace_placeholder" | "prepare_production" | "estimate_scripts" | "generate_scripts";

/**
  Bulk actions on Topics' drafts (learners see nothing until each Topic is published). Generating scripts is a paid
  action: it needs the estimate's `confirm` token, made from the same Topics, so what's run is what was shown.
*/
export async function bulkIntro(
  db: Db,
  actor: User,
  input: { action?: unknown; slugs?: unknown; presenterId?: unknown; picture?: unknown; confirm?: unknown },
  now: Date,
  drafter: IntroDrafter = hubDrafter,
) {
  requireAuthor(actor);
  const slugs = Array.isArray(input.slugs) ? [...new Set(input.slugs.map(String))].slice(0, 200) : [];
  if (!slugs.length) throw new HttpError(400, "Choose some topics first.");
  const topics = slugs.map((s) => topicCopy(db, s));
  const fallback = seededDefaultPresenter(db);
  const at = now.toISOString();
  const save = (slug: string, l: Lesson) => saveDraft(db, actor, slug, l, now);
  const draftOf = (t: TopicCopy) => withIntroCard(structuredClone(t.draft), fallback);
  const done: string[] = [];
  const skipped: { slug: string; why: string }[] = [];

  switch (input.action as BulkAction) {
    case "assign_presenter": {
      const p = input.presenterId === null || input.presenterId === "" ? null : presenterById(db, String(input.presenterId));
      if (input.presenterId && !p) throw new HttpError(400, "Choose one of the presenters.");
      if (p && !p.active) throw new HttpError(400, "That presenter is switched off.");
      for (const t of topics) {
        const d = draftOf(t);
        setPresenter(d, p ?? null, fallback);
        save(t.slug, d);
        done.push(t.slug);
      }
      break;
    }
    case "replace_placeholder": {
      // A picture: each Topic's own placeholder. None: back to (and refreshed from) the presenter's portrait.
      const pic = input.picture ? cleanPicture(input.picture) : undefined;
      if (input.picture && !pic) throw new HttpError(400, "Choose a picture from the image library.");
      for (const t of topics) {
        const d = draftOf(t);
        const c = introCardOf(d)!;
        setPlaceholder(d, pic, presenterById(db, c.intro.presenter) ?? fallback);
        save(t.slug, d);
        done.push(t.slug);
      }
      break;
    }
    case "prepare_production": {
      for (const t of topics) {
        const d = draftOf(t);
        const c = introCardOf(d)!;
        if (c.intro.script?.status !== "approved") {
          skipped.push({ slug: t.slug, why: "The script isn't approved." });
          continue;
        }
        if (c.intro.production) {
          skipped.push({ slug: t.slug, why: "Already prepared." });
          continue;
        }
        const p = presenterById(db, c.intro.presenter) ?? fallback;
        prepareForProduction(d, p, actor.id, at);
        save(t.slug, d);
        done.push(t.slug);
      }
      break;
    }
    case "estimate_scripts":
    case "generate_scripts": {
      const missing = topics.filter((t) => !introCardOf(draftOf(t))?.intro.script?.spoken.trim());
      for (const t of topics) if (!missing.includes(t)) skipped.push({ slug: t.slug, why: "It already has a script." });
      const estimate = estimateScripts(missing.map(draftOf));
      const token = `${missing.length}:${estimate.inputTokens}`;
      if (input.action === "estimate_scripts") return { estimate, confirm: token, slugs: missing.map((t) => t.slug), skipped };
      if (input.confirm !== token) throw new HttpError(409, "Check the estimate and confirm it before generating scripts.");
      if (missing.length > 25) throw new HttpError(400, "Generate up to 25 scripts at a time.");
      for (const t of missing) {
        const d = draftOf(t);
        try {
          const r = await draftIntroScript(db, actor, d, now, drafter);
          setScript(d, r.script, "ai", at, r.model);
          save(t.slug, d);
          done.push(t.slug);
        } catch (e) {
          // Stop at the first failure (a quota, say), keeping what's done.
          skipped.push({ slug: t.slug, why: e instanceof HttpError ? e.message : "The script couldn't be written." });
          break;
        }
      }
      break;
    }
    default:
      throw new HttpError(400, "Unknown action.");
  }
  audit(db, { actor: actor.id, event: `intro.bulk_${String(input.action)}`, entity: "topics", next: { done: done.length, skipped: skipped.length }, at: now });
  return { done, skipped };
}

function cleanPicture(v: unknown): IntroPicture | undefined {
  const p = v as Partial<IntroPicture> | null;
  if (!p || typeof p.src !== "string" || !/^\/(api\/uploads|images)\//.test(p.src)) return undefined;
  const width = Math.round(Number(p.width));
  const height = Math.round(Number(p.height));
  if (!(width > 0 && height > 0)) return undefined;
  return { src: p.src, width, height, ...(typeof p.position === "string" && /^[\w% .-]{1,30}$/.test(p.position) && { position: p.position }) };
}

// ---------------------------------------------------------------------------------------------
// The migration: every existing Topic gets its Introduction card
// ---------------------------------------------------------------------------------------------

export type MigrationPreview = {
  topics: number;
  /** Already open with their Introduction card (draft and published). */
  haveIntro: number;
  /** Would get a new Introduction card in front of their first card. */
  wouldAdd: number;
  /** Open with a presenter card that would become the Introduction card, as it is. */
  wouldReuse: number;
  /** Of those, how many have a video file or player that would be kept. */
  wouldReuseVideo: number;
  /** Open with a picture title card that would be folded into the Introduction card (its id kept, so progress resumes). */
  wouldFold: number;
  /** Of those, how many bring a picture as the Topic's own placeholder, and how many a narration script as a draft. */
  foldPictures: number;
  foldScripts: number;
  /** A marked card that isn't first (moved to the front). */
  wouldMove: number;
  /** More than one marked card (the extra marks removed; no card is deleted). */
  duplicates: number;
  /** Topics that open with a title card that can't be folded (it has content the introduction can't show): it would follow the new card. */
  titleCardsAfterIntro: number;
  /** Topics whose published copy is changed in place (same version, so progress and completions carry on). */
  publishedInPlace: number;
  /** Content-file Topics never edited, which would get a database copy. */
  contentTopics: number;
  /** Learners part-way through the affected Topics: they carry on where they were. */
  learnersInProgress: number;
  byTopic: { slug: string; draft: IntroPlan["action"]; published: IntroPlan["action"] | null; video: boolean }[];
};

const opensWithTitleCard = (l: Lesson) => {
  const first = l.nodes[l.start];
  return Boolean(first && first.type === "image" && (first.id === "intro" || first.heading.trim() === l.title.trim()));
};

/** What the migration would do, without changing anything (only reads, so it can run on a read-only copy). */
export function introMigrationPreview(db: Db): MigrationPreview {
  const out: MigrationPreview = {
    topics: 0,
    haveIntro: 0,
    wouldAdd: 0,
    wouldReuse: 0,
    wouldReuseVideo: 0,
    wouldFold: 0,
    foldPictures: 0,
    foldScripts: 0,
    wouldMove: 0,
    duplicates: 0,
    titleCardsAfterIntro: 0,
    publishedInPlace: 0,
    contentTopics: 0,
    learnersInProgress: 0,
    byTopic: [],
  };
  const affected: string[] = [];
  for (const t of allTopics(db)) {
    out.topics++;
    const d = planIntro(t.draft);
    const p = t.published ? planIntro(t.published) : null;
    const main = p && p.action !== "none" ? p : d;
    out.byTopic.push({ slug: t.slug, draft: d.action, published: p?.action ?? null, video: main.action === "reuse" && main.video });
    if (d.action === "none" && (!p || p.action === "none")) {
      out.haveIntro++;
      continue;
    }
    affected.push(t.slug);
    if (main.action === "add") {
      out.wouldAdd++;
      if (opensWithTitleCard(t.published ?? t.draft)) out.titleCardsAfterIntro++;
    }
    if (main.action === "reuse") {
      out.wouldReuse++;
      if (main.video) out.wouldReuseVideo++;
    }
    if (main.action === "fold") {
      out.wouldFold++;
      const c = titleCardToFold(t.published ?? t.draft)!;
      if (c.visual.kind === "illustration" && c.visual.photo) out.foldPictures++;
      if (c.narration?.trim()) out.foldScripts++;
    }
    if (main.action === "move") out.wouldMove++;
    if (main.action === "dedupe") out.duplicates++;
    if (p && p.action !== "none") out.publishedInPlace++;
    if (!t.row) out.contentTopics++;
  }
  if (affected.length) {
    const marks = affected.map(() => "?").join(",");
    const r = db
      .prepare(`SELECT COUNT(*) AS n FROM lesson_progress WHERE slug IN (${marks}) AND attempt NOT LIKE '%"status":"completed"%'`)
      .get(...affected) as { n: number };
    out.learnersInProgress = r.n;
  }
  return out;
}

/**
  Applies the migration. Each Topic's draft and published copy get their Introduction card (lib/topicIntro withIntroCard):
  a new card in front, or the existing first presenter card reused with its video. The published copy is changed in
  place, keeping its version: learners part-way through carry on (their saved card and route still exist), completions
  stay against the version they were for, and the completion rule, quizzes and assessments are untouched. Earlier
  versions in the version history stay as they were published. Running it again changes nothing.
*/
export function applyIntroMigration(db: Db, actor: User, now: Date) {
  requireAuthor(actor);
  const p = seededDefaultPresenter(db);
  const changed: string[] = [];
  db.exec("BEGIN");
  try {
    for (const t of allTopics(db)) {
      const draft = withIntroCard(t.draft, p);
      const published = t.published ? withIntroCard(t.published, p) : null;
      if (draft === t.draft && published === t.published) continue;
      if (t.row) {
        if (draft !== t.draft) db.prepare("UPDATE authored_lessons SET draft = ? WHERE slug = ?").run(JSON.stringify(draft), t.slug);
        if (published && published !== t.published)
          db.prepare("UPDATE authored_lessons SET published = ? WHERE slug = ?").run(JSON.stringify(published), t.slug);
      } else {
        // A content-file Topic: kept in the database from now on, still as the version it shipped as (never "published" by anyone).
        const json = JSON.stringify(draft);
        db.prepare(
          "INSERT INTO authored_lessons (slug, draft, published, created_by, created_at, updated_by, updated_at, published_at) VALUES (?, ?, ?, ?, ?, ?, ?, NULL)",
        ).run(t.slug, json, json, actor.id, now.toISOString(), actor.id, now.toISOString());
      }
      audit(db, {
        actor: actor.id,
        event: "lesson.intro_migrated",
        entity: `lesson:${t.slug}`,
        previous: { start: (t.published ?? t.draft).start },
        next: { start: (published ?? draft).start, version: (published ?? draft).version },
        at: now,
      });
      changed.push(t.slug);
    }
    db.exec("COMMIT");
  } catch (e) {
    db.exec("ROLLBACK");
    throw e;
  }
  refreshPublishedLessons(db);
  return { changed };
}

// ---------------------------------------------------------------------------------------------
// Analytics
// ---------------------------------------------------------------------------------------------

const eventsReady = new WeakSet<Db>();
export function ensureIntroEvents(db: Db) {
  if (eventsReady.has(db)) return;
  db.exec(`CREATE TABLE IF NOT EXISTS topic_intro_events (
    id INTEGER PRIMARY KEY AUTOINCREMENT, at TEXT NOT NULL, received_at TEXT NOT NULL, user_id TEXT NOT NULL, audience TEXT NOT NULL DEFAULT '',
    slug TEXT NOT NULL, card TEXT NOT NULL, version TEXT NOT NULL, event TEXT NOT NULL, media TEXT NOT NULL CHECK (media IN ('video','placeholder')),
    seconds REAL, percent INTEGER, idem TEXT UNIQUE
  );
  CREATE INDEX IF NOT EXISTS topic_intro_events_slug ON topic_intro_events (slug, event);`);
  eventsReady.add(db);
}

const ID = /^[a-z0-9][a-z0-9-]{0,80}$/;
/** One thing a learner did on an Introduction card: ids and numbers only. Sending it again with the same key records nothing new. */
export function recordIntroEvent(db: Db, user: User, input: Record<string, unknown>, now: Date) {
  ensureIntroEvents(db);
  const event = INTRO_EVENTS.find((e) => e === input.event) as IntroEvent | undefined;
  if (!event) throw new HttpError(400, "Unknown event.");
  const slug = String(input.slug ?? "");
  const card = String(input.card ?? "");
  if (!ID.test(slug) || !ID.test(card)) throw new HttpError(400, "Which topic and card?");
  const media = input.media === "video" ? "video" : input.media === "placeholder" ? "placeholder" : null;
  if (!media) throw new HttpError(400, "Video or placeholder?");
  const version = String(input.version ?? "").slice(0, 20);
  const num = (v: unknown, max: number) => (typeof v === "number" && Number.isFinite(v) ? Math.min(max, Math.max(0, v)) : null);
  const seconds = num(input.seconds, 3600);
  const percent = num(input.percent, 100);
  const key = typeof input.key === "string" && /^[A-Za-z0-9:._-]{6,120}$/.test(input.key) ? `${user.id}:${input.key}` : null;
  const occurred = typeof input.at === "string" && !Number.isNaN(Date.parse(input.at)) ? new Date(input.at).toISOString() : now.toISOString();
  const r = db
    .prepare(
      "INSERT OR IGNORE INTO topic_intro_events (at, received_at, user_id, audience, slug, card, version, event, media, seconds, percent, idem) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)",
    )
    .run(
      occurred,
      now.toISOString(),
      user.id,
      user.audience,
      slug,
      card,
      version,
      event,
      media,
      seconds === null ? null : Math.round(seconds * 10) / 10,
      percent === null ? null : Math.round(percent),
      key,
    );
  return { recorded: Boolean(r.changes) };
}

/**
  The introduction's engagement for a Topic, with the placeholder and the video kept apart: views, plays, how far videos
  got, skips, replays, time on the card, moving on into the Topic, and how many viewers went on to complete it. Watching
  the video is never taken as evidence of learning.
*/
export function introStats(db: Db, slug: string) {
  ensureIntroEvents(db);
  const by = (media: "video" | "placeholder") => {
    const count = (event: IntroEvent) =>
      (db.prepare("SELECT COUNT(*) AS n FROM topic_intro_events WHERE slug = ? AND media = ? AND event = ?").get(slug, media, event) as { n: number }).n;
    const viewers = (
      db.prepare("SELECT COUNT(DISTINCT user_id) AS n FROM topic_intro_events WHERE slug = ? AND media = ? AND event = 'view'").get(slug, media) as {
        n: number;
      }
    ).n;
    const time = db.prepare("SELECT AVG(seconds) AS s FROM topic_intro_events WHERE slug = ? AND media = ? AND event = 'leave'").get(slug, media) as {
      s: number | null;
    };
    const reach = db
      .prepare(
        "SELECT AVG(p) AS p FROM (SELECT MAX(percent) AS p FROM topic_intro_events WHERE slug = ? AND media = ? AND event IN ('progress','complete') GROUP BY user_id)",
      )
      .get(slug, media) as { p: number | null };
    const completed = (
      db
        .prepare(
          "SELECT COUNT(DISTINCT e.user_id) AS n FROM topic_intro_events e JOIN lesson_completions c ON c.user_id = e.user_id AND c.lesson_slug = e.slug AND c.completed_at >= e.at WHERE e.slug = ? AND e.media = ? AND e.event = 'view'",
        )
        .get(slug, media) as { n: number }
    ).n;
    return {
      views: count("view"),
      viewers,
      plays: count("play"),
      completions: count("complete"),
      replays: count("replay"),
      captions: count("captions"),
      skips: count("skip"),
      continued: count("continue") + count("skip"),
      averageSeconds: time.s === null ? null : Math.round(time.s * 10) / 10,
      averagePercent: reach.p === null ? null : Math.round(reach.p),
      viewersWhoCompletedTopic: completed,
    };
  };
  return { slug, video: by("video"), placeholder: by("placeholder") };
}
