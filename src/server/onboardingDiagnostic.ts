import "server-only";
import { randomUUID } from "node:crypto";
import {
  AUDIENCES,
  CONFIDENCE,
  DIAGNOSTIC,
  UNSURE,
  type Audience,
  type BaselineSignal,
  type DiagnosticQuestion,
  type DiagnosticResult,
  type InstrumentItem,
} from "@/lib/onboarding";
import { domainOf } from "@/lib/capability";
import type { PoolContent } from "@/lib/questionPool";
import { audit, ensureOnboarding, tx, type Db } from "./db";
import { HttpError, type User } from "./auth";
import { assets, capAccess } from "./capability";

/*
  Check your starting point (docs/onboarding.md): a short set of approved, versioned Question Pool items
  for a role, answered before assigned learning begins.

  - Only an approved version of a question is ever served, and never with its answer key.
  - The first answer to each question is the record. It is taken before any feedback and never changed.
  - There is no pass mark and no score. Finishing it is what completes the task; how it was answered can't
    hold anyone up, isn't a quiz pass, and waives nothing.
  - The result is a suggestion of learning and the reviewed guidance for each question.
  - A person's answers are theirs. The owners of the instrument see totals.
*/

type InstrumentRow = {
  id: string;
  audience: Audience;
  version: number;
  status: "draft" | "active" | "retired";
  title: string;
  items: string;
  created_by: string;
  created_at: string;
  approved_by: string | null;
  approved_at: string | null;
};
type AttemptRow = {
  id: string;
  user_id: string;
  instrument_id: string;
  instrument_version: number;
  items: string;
  goal: string;
  confidence: number | null;
  status: "active" | "completed";
  started_at: string;
  completed_at: string | null;
};
/** A question as it read when it was asked: kept with the attempt, answer key included, and never sent whole. */
type Asked = { questionId: string; version: number; competencyId: string | null; originKey: string | null; content: PoolContent };
type ResponseRow = {
  attempt_id: string;
  question_id: string;
  version: number;
  competency_id: string | null;
  choice_id: string;
  outcome: "right" | "other" | "unsure";
  at: string;
};

const text = (v: unknown, max: number) => (typeof v === "string" ? v.replace(/\s+/g, " ").trim().slice(0, max) : "");
const nameOf = (db: Db, id: string | null) =>
  id ? ((db.prepare("SELECT name FROM users WHERE id = ?").get(id) as { name: string } | undefined)?.name ?? id) : null;
const itemsOf = (r: InstrumentRow) => JSON.parse(r.items) as InstrumentItem[];

function need(ok: boolean, message: string) {
  if (!ok) throw new HttpError(403, message);
}
const ownsAudience = (db: Db, actor: User, audience: Audience) => {
  const a = capAccess(db, actor);
  return a.superadmin || (domainOf(audience) === "internal" ? a.pc : a.partnerOps);
};

/** The approved wording of a pool question, if that version is still approved. */
function approvedContent(db: Db, questionId: string, version: number) {
  const row = db
    .prepare(
      "SELECT q.origin_key, q.stem, v.content, v.status FROM pool_questions q JOIN pool_versions v ON v.question_id = q.id AND v.version = ? WHERE q.id = ?",
    )
    .get(version, questionId) as { origin_key: string | null; stem: string; content: string; status: string } | undefined;
  return row && row.status === "approved" ? { originKey: row.origin_key, content: JSON.parse(row.content) as PoolContent } : null;
}

// ---------------------------------------------------------------------------------------------
// Building and publishing an instrument
// ---------------------------------------------------------------------------------------------

/** Approved Question Pool items to choose from. Only questions with a clear best answer are offered. */
export function poolChoices(db: Db, actor: User, input: { q?: unknown; audience?: unknown }) {
  ensureOnboarding(db);
  const a = capAccess(db, actor);
  need(a.superadmin || a.pc || a.partnerOps || a.quality, "Only the owners of setup can build a starting-point check.");
  const q = text(input.q, 60).toLowerCase();
  const rows = db
    .prepare(
      `SELECT q.id, q.stem, q.topic, q.audience, q.kind, q.risk, q.approved_version AS version, v.content
       FROM pool_questions q JOIN pool_versions v ON v.question_id = q.id AND v.version = q.approved_version AND v.status = 'approved'
       WHERE q.approved_version IS NOT NULL ORDER BY q.topic, q.stem LIMIT 2000`,
    )
    .all() as { id: string; stem: string; topic: string; audience: string; kind: string; risk: string; version: number; content: string }[];
  return {
    questions: rows
      .filter(
        (r) => (!q || `${r.stem} ${r.topic}`.toLowerCase().includes(q)) && (JSON.parse(r.content) as PoolContent).options.some((o) => o.credit === "correct"),
      )
      .slice(0, 60)
      .map(({ id, stem, topic, audience, kind, version }) => ({ id, stem, topic, audience, kind, version })),
  };
}

/** Every audience's instrument: what's live, any draft, and whether a live one has a question that's no longer approved. */
export function instruments(db: Db, actor: User) {
  ensureOnboarding(db);
  const a = capAccess(db, actor);
  need(a.superadmin || a.pc || a.partnerOps || a.quality, "Only the owners of setup can see starting-point checks.");
  // Each competency's latest approved name.
  const names = new Map<string, string>();
  for (const v of db.prepare("SELECT competency_id, name FROM cap_competency_versions WHERE status = 'approved' ORDER BY version").all() as {
    competency_id: string;
    name: string;
  }[])
    names.set(v.competency_id, v.name);
  const competencies = [...names].map(([id, name]) => ({ id, name })).sort((x, y) => x.name.localeCompare(y.name));
  const view = (r: InstrumentRow | undefined) =>
    r
      ? {
          id: r.id,
          version: r.version,
          title: r.title,
          approvedBy: nameOf(db, r.approved_by),
          approvedAt: r.approved_at,
          items: itemsOf(r).map((i) => {
            const q = db.prepare("SELECT stem, topic, approved_version FROM pool_questions WHERE id = ?").get(i.questionId) as
              { stem: string; topic: string; approved_version: number | null } | undefined;
            return {
              ...i,
              stem: q?.stem ?? "(question removed)",
              topic: q?.topic ?? "",
              /** The version chosen is no longer the approved one: this instrument needs another look. */
              stale: !approvedContent(db, i.questionId, i.version),
              newer: Boolean(q?.approved_version && q.approved_version !== i.version),
            };
          }),
        }
      : null;
  return {
    audiences: (Object.keys(AUDIENCES) as Audience[]).map((audience) => {
      const rows = db.prepare("SELECT * FROM onb_instruments WHERE audience = ? ORDER BY version DESC").all(audience) as InstrumentRow[];
      const attempts = db
        .prepare("SELECT COUNT(*) AS n FROM onb_attempts t JOIN onb_instruments i ON i.id = t.instrument_id WHERE i.audience = ? AND t.status = 'completed'")
        .get(audience) as { n: number };
      return {
        audience,
        label: AUDIENCES[audience],
        canEdit: ownsAudience(db, actor, audience),
        active: view(rows.find((r) => r.status === "active")),
        draft: view(rows.find((r) => r.status === "draft")),
        completed: attempts.n,
      };
    }),
    competencies,
    limits: { min: DIAGNOSTIC.minItems, max: DIAGNOSTIC.maxItems },
  };
}

export function saveInstrument(db: Db, actor: User, input: Record<string, unknown>, now: Date) {
  ensureOnboarding(db);
  const audience = (Object.keys(AUDIENCES) as Audience[]).find((x) => x === input.audience);
  if (!audience) throw new HttpError(400, "Choose who this check is for.");
  need(ownsAudience(db, actor, audience), "Only this population’s owner can change its starting-point check.");
  const seen = new Set<string>();
  const items: InstrumentItem[] = [];
  for (const r of (Array.isArray(input.items) ? input.items : []) as Record<string, unknown>[]) {
    const id = typeof r?.questionId === "string" ? r.questionId : "";
    const version = Math.round(Number(r?.version));
    if (!id || seen.has(id)) continue;
    // Only what a reviewer has approved in the Question Pool can be asked.
    if (!approvedContent(db, id, version))
      throw new HttpError(400, "One of those questions isn’t approved in the Question Pool any more. Take it out, or approve it there first.");
    seen.add(id);
    const competencyId =
      typeof r.competencyId === "string" && db.prepare("SELECT 1 FROM cap_competencies WHERE id = ?").get(r.competencyId) ? r.competencyId : null;
    items.push({ questionId: id, version, competencyId });
  }
  if (items.length > DIAGNOSTIC.maxItems) throw new HttpError(400, `Keep it to ${DIAGNOSTIC.maxItems} questions or fewer: it’s a starting point, not a test.`);
  const draft = db.prepare("SELECT * FROM onb_instruments WHERE audience = ? AND status = 'draft'").get(audience) as InstrumentRow | undefined;
  if (draft) db.prepare("UPDATE onb_instruments SET items = ?, title = ? WHERE id = ?").run(JSON.stringify(items), text(input.title, 80), draft.id);
  else
    db.prepare("INSERT INTO onb_instruments (id, audience, version, status, title, items, created_by, created_at) VALUES (?, ?, ?, 'draft', ?, ?, ?, ?)").run(
      `inst-${randomUUID().slice(0, 12)}`,
      audience,
      ((db.prepare("SELECT MAX(version) AS v FROM onb_instruments WHERE audience = ?").get(audience) as { v: number | null }).v ?? 0) + 1,
      text(input.title, 80),
      JSON.stringify(items),
      actor.id,
      now.toISOString(),
    );
  return instruments(db, actor);
}

/** Publishes the draft as this audience's check, by name. People already part-way through keep the version they started. */
export function publishInstrument(db: Db, actor: User, audienceInput: unknown, now: Date) {
  ensureOnboarding(db);
  const audience = (Object.keys(AUDIENCES) as Audience[]).find((x) => x === audienceInput);
  if (!audience) throw new HttpError(400, "Choose who this check is for.");
  need(ownsAudience(db, actor, audience), "Only this population’s owner can publish its starting-point check.");
  const draft = db.prepare("SELECT * FROM onb_instruments WHERE audience = ? AND status = 'draft'").get(audience) as InstrumentRow | undefined;
  if (!draft) throw new HttpError(400, "There’s no draft to publish.");
  const items = itemsOf(draft);
  if (items.length < DIAGNOSTIC.minItems) throw new HttpError(400, `Choose at least ${DIAGNOSTIC.minItems} questions.`);
  if (items.some((i) => !approvedContent(db, i.questionId, i.version)))
    throw new HttpError(400, "One of the questions isn’t approved in the Question Pool any more.");
  tx(db, () => {
    db.prepare("UPDATE onb_instruments SET status = 'retired' WHERE audience = ? AND status = 'active'").run(audience);
    db.prepare("UPDATE onb_instruments SET status = 'active', approved_by = ?, approved_at = ? WHERE id = ?").run(actor.id, now.toISOString(), draft.id);
    audit(db, {
      actor: actor.id,
      event: "onboarding.instrument_published",
      entity: `onboarding_instrument:${draft.id}`,
      next: { audience, version: draft.version, questions: items.map((i) => `${i.questionId}@${i.version}`) },
      at: now,
    });
  });
  return instruments(db, actor);
}

// ---------------------------------------------------------------------------------------------
// Taking it
// ---------------------------------------------------------------------------------------------

const attemptOf = (db: Db, userId: string) =>
  db.prepare("SELECT * FROM onb_attempts WHERE user_id = ? ORDER BY started_at DESC LIMIT 1").get(userId) as AttemptRow | undefined;
const responsesOf = (db: Db, attemptId: string) => db.prepare("SELECT * FROM onb_responses WHERE attempt_id = ? ORDER BY at").all(attemptId) as ResponseRow[];
const asked = (a: AttemptRow) => JSON.parse(a.items) as Asked[];

/** A question for the learner: the wording and choices, plus "I'm not sure". The answer key stays on the server. */
const forLearner = (q: Asked): DiagnosticQuestion => ({
  id: q.questionId,
  stem: q.content.stem,
  context: q.content.context ?? null,
  options: [...q.content.options.map((o) => ({ id: o.id, text: o.text })), { id: UNSURE, text: "I’m not sure" }],
});

function result(db: Db, a: AttemptRow): DiagnosticResult {
  const items = asked(a);
  const responses = new Map(responsesOf(db, a.id).map((r) => [r.question_id, r]));
  const all = assets(db);
  const answers = items.map((q) => {
    const r = responses.get(q.questionId)!;
    const chosen = q.content.options.find((o) => o.id === r.choice_id);
    const best = q.content.options.find((o) => o.credit === "correct");
    return {
      id: q.questionId,
      stem: q.content.stem,
      chosen: r.outcome === "unsure" ? "I’m not sure" : (chosen?.text ?? ""),
      outcome: r.outcome,
      // The reviewed feedback for what they chose, or the general explanation.
      guidance: chosen?.feedback ?? (r.outcome === "right" ? q.content.feedback?.correct : q.content.feedback?.incorrect) ?? q.content.explanation ?? null,
      best: best?.text ?? "",
    };
  });
  // Suggest the learning each question they weren't sure of comes from, in the order asked.
  const suggestions: DiagnosticResult["suggestions"] = [];
  for (const q of items) {
    const r = responses.get(q.questionId)!;
    if (r.outcome === "right") continue;
    const [surface, ref] = (q.originKey ?? "").split(":");
    const asset = all.get(surface === "topic" ? `topic:${ref}` : surface === "magazine" || surface === "practice" ? `course:${ref}` : "");
    if (!asset || suggestions.some((s) => s.href === asset.href)) continue;
    suggestions.push({
      label: asset.label,
      href: asset.href,
      why: r.outcome === "unsure" ? `You weren’t sure about: “${q.content.stem}”` : `Worth another look: “${q.content.stem}”`,
    });
  }
  return { completedAt: a.completed_at ?? "", answers, suggestions: suggestions.slice(0, 4) };
}

/** Where this person is with the check: not offered, to begin, part-way (with the next question), or done (with the result). */
export function diagnosticState(db: Db, user: User) {
  ensureOnboarding(db);
  const a = attemptOf(db, user.id);
  const instrument = db.prepare("SELECT * FROM onb_instruments WHERE audience = ? AND status = 'active'").get(user.audience) as InstrumentRow | undefined;
  if (!a)
    return {
      status: instrument ? ("ready" as const) : ("none" as const),
      questions: instrument ? itemsOf(instrument).length : 0,
      confidence: CONFIDENCE,
      intro: DIAGNOSTIC.intro,
      question: null,
      position: 0,
      result: null,
    };
  const items = asked(a);
  const answered = new Set(responsesOf(db, a.id).map((r) => r.question_id));
  const next = items.find((q) => !answered.has(q.questionId));
  return {
    status: a.status === "completed" ? ("done" as const) : ("active" as const),
    questions: items.length,
    confidence: CONFIDENCE,
    intro: DIAGNOSTIC.intro,
    question: a.status === "active" && next ? forLearner(next) : null,
    position: answered.size,
    // Guidance appears only once every first answer is recorded.
    result: a.status === "completed" ? result(db, a) : null,
  };
}

/** Begins the check: records what they said they'd like help with, and fixes the questions as they read today. */
export function startDiagnostic(db: Db, user: User, input: Record<string, unknown>, now: Date) {
  ensureOnboarding(db);
  const existing = attemptOf(db, user.id);
  if (existing) return diagnosticState(db, user);
  const instrument = db.prepare("SELECT * FROM onb_instruments WHERE audience = ? AND status = 'active'").get(user.audience) as InstrumentRow | undefined;
  if (!instrument) throw new HttpError(400, "There’s no starting-point check for your role yet.");
  // Anything no longer approved in the pool is left out rather than asked.
  const items: Asked[] = itemsOf(instrument).flatMap((i) => {
    const c = approvedContent(db, i.questionId, i.version);
    return c ? [{ questionId: i.questionId, version: i.version, competencyId: i.competencyId, originKey: c.originKey, content: c.content }] : [];
  });
  if (!items.length) throw new HttpError(400, "The starting-point check is being updated. Try again later; it won’t hold up your setup.");
  const confidence = Math.round(Number(input.confidence));
  db.prepare(
    "INSERT INTO onb_attempts (id, user_id, instrument_id, instrument_version, items, goal, confidence, status, started_at) VALUES (?, ?, ?, ?, ?, ?, ?, 'active', ?)",
  ).run(
    `att-${randomUUID().slice(0, 12)}`,
    user.id,
    instrument.id,
    instrument.version,
    JSON.stringify(items),
    text(input.goal, 300),
    confidence >= 1 && confidence <= CONFIDENCE.length ? confidence : null,
    now.toISOString(),
  );
  return diagnosticState(db, user);
}

/** Records the first answer to a question. Answering it again changes nothing: the first answer is the baseline. */
export function answerDiagnostic(db: Db, user: User, input: Record<string, unknown>, now: Date) {
  ensureOnboarding(db);
  const a = attemptOf(db, user.id);
  if (!a) throw new HttpError(400, "Start the check first.");
  if (a.status === "completed") return diagnosticState(db, user);
  const items = asked(a);
  const q = items.find((x) => x.questionId === input.questionId);
  if (!q) throw new HttpError(400, "That question isn’t part of your check.");
  const choice = input.choiceId === UNSURE ? UNSURE : q.content.options.find((o) => o.id === input.choiceId)?.id;
  if (!choice) throw new HttpError(400, "Choose one of the answers, or “I’m not sure”.");
  tx(db, () => {
    const outcome = choice === UNSURE ? "unsure" : q.content.options.find((o) => o.id === choice)?.credit === "correct" ? "right" : "other";
    db.prepare(
      "INSERT OR IGNORE INTO onb_responses (attempt_id, question_id, version, competency_id, choice_id, outcome, at) VALUES (?, ?, ?, ?, ?, ?, ?)",
    ).run(a.id, q.questionId, q.version, q.competencyId, choice, outcome, now.toISOString());
    const done = (db.prepare("SELECT COUNT(*) AS n FROM onb_responses WHERE attempt_id = ?").get(a.id) as { n: number }).n;
    if (done >= items.length)
      db.prepare("UPDATE onb_attempts SET status = 'completed', completed_at = ? WHERE id = ? AND status = 'active'").run(now.toISOString(), a.id);
  });
  return diagnosticState(db, user);
}

// ---------------------------------------------------------------------------------------------
// What others can see
// ---------------------------------------------------------------------------------------------

/**
  The handoff to Capability Intelligence: for each competency a question was tagged to, how many were
  asked and how they were answered at the start. It is labelled a baseline and is never evidence: it
  can't show Demonstrated or Verified at work, and one question is a signal, not a measure.
*/
export function baselineSignals(db: Db, userId: string): BaselineSignal[] {
  ensureOnboarding(db);
  const a = attemptOf(db, userId);
  if (!a || a.status !== "completed") return [];
  const by = new Map<string, BaselineSignal>();
  for (const r of responsesOf(db, a.id)) {
    if (!r.competency_id) continue;
    const s = by.get(r.competency_id) ?? {
      competencyId: r.competency_id,
      asked: 0,
      right: 0,
      unsure: 0,
      at: a.completed_at ?? r.at,
      instrumentVersion: a.instrument_version,
    };
    s.asked += 1;
    if (r.outcome === "right") s.right += 1;
    if (r.outcome === "unsure") s.unsure += 1;
    by.set(r.competency_id, s);
  }
  return [...by.values()];
}

/** Fewer completed checks than this and the totals aren't shown: they'd say too much about too few people. */
export const BASELINE_MIN = 5;

/** For the instrument's owner: how each question was answered at the start, as totals for that version. Never who. */
export function baselineReport(db: Db, actor: User, audienceInput: unknown) {
  ensureOnboarding(db);
  const audience = (Object.keys(AUDIENCES) as Audience[]).find((x) => x === audienceInput);
  if (!audience) throw new HttpError(400, "Choose an audience.");
  need(ownsAudience(db, actor, audience), "Only this population’s owner can see its starting-point totals.");
  const instrument = db.prepare("SELECT * FROM onb_instruments WHERE audience = ? AND status = 'active'").get(audience) as InstrumentRow | undefined;
  if (!instrument) return { audience, version: null, completed: 0, shown: false, min: BASELINE_MIN, questions: [], confidence: [] };
  const completed = (db.prepare("SELECT COUNT(*) AS n FROM onb_attempts WHERE instrument_id = ? AND status = 'completed'").get(instrument.id) as { n: number })
    .n;
  const shown = completed >= BASELINE_MIN;
  const rows = shown
    ? (db
        .prepare(
          `SELECT r.question_id, r.version, r.outcome, COUNT(*) AS n FROM onb_responses r JOIN onb_attempts t ON t.id = r.attempt_id
           WHERE t.instrument_id = ? AND t.status = 'completed' GROUP BY r.question_id, r.version, r.outcome`,
        )
        .all(instrument.id) as { question_id: string; version: number; outcome: string; n: number }[])
    : [];
  return {
    audience,
    version: instrument.version,
    completed,
    shown,
    min: BASELINE_MIN,
    questions: itemsOf(instrument).map((i) => {
      const of = (o: string) => rows.find((r) => r.question_id === i.questionId && r.version === i.version && r.outcome === o)?.n ?? 0;
      const q = db.prepare("SELECT stem FROM pool_questions WHERE id = ?").get(i.questionId) as { stem: string } | undefined;
      return { questionId: i.questionId, version: i.version, stem: q?.stem ?? "", right: of("right"), other: of("other"), unsure: of("unsure") };
    }),
    confidence: shown
      ? (
          db
            .prepare(
              "SELECT confidence, COUNT(*) AS n FROM onb_attempts WHERE instrument_id = ? AND status = 'completed' AND confidence IS NOT NULL GROUP BY confidence",
            )
            .all(instrument.id) as {
            confidence: number;
            n: number;
          }[]
        ).map((r) => ({ label: CONFIDENCE[r.confidence - 1], people: r.n }))
      : [],
  };
}
