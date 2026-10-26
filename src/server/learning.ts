import "server-only";
import type { FollowUpContent, PathConfig, PathStep } from "@/content/followups";
import { stageLabel } from "@/content/followups";
import { lessons } from "@/content/lessons";
import { getLesson, isSpaced } from "./lessonStore";
import { addWeekdays, localDate, projectSchedule, releaseAfter, zonedToUtc, type ScheduleConfig } from "@/lib/schedule";
import { audit, tx, type Db } from "./db";
import { HttpError, type User } from "./auth";

export type PathVersionRow = {
  path_id: string;
  version: number;
  status: "draft" | "in_review" | "published" | "superseded" | "withdrawn";
  config: string;
  steps: string;
  paused: number;
  withdrawn_reason: string | null;
};

export type EnrolmentRow = {
  id: number;
  user_id: string;
  org_id: string;
  path_id: string;
  path_version: number;
  trigger_occurrence: string;
  anchor: string;
  timezone: string;
  state: "active" | "paused" | "completed" | "withdrawn";
  paused_at: string | null;
};

export type InstanceRow = {
  id: number;
  enrolment_id: number;
  step_index: number;
  step_key: string;
  follow_up_id: string;
  follow_up_version: number;
  planned_release: string | null;
  released_at: string | null;
  notified_at: string | null;
  reminded_at: string | null;
  started_at: string | null;
  feedback_viewed_at: string | null;
  completed_at: string | null;
  cancelled_at: string | null;
  required: number;
  due_at: string | null;
  progress: string | null;
};

export type AttemptRow = {
  id: number;
  step_instance_id: number;
  question_id: string;
  follow_up_version: number;
  concept: string;
  initial_response: string;
  initial_correct: number;
  initial_at: string;
  feedback_shown_at: string | null;
  corrected_response: string | null;
  corrected_correct: number | null;
  corrected_at: string | null;
  assisted: number;
};

export type PinnedStep = PathStep & { pinned?: { default: number; variants: Record<string, number> } };

export function parseVersion(row: PathVersionRow) {
  return { ...row, config: JSON.parse(row.config) as PathConfig, steps: JSON.parse(row.steps) as PinnedStep[] };
}

export function pathVersion(db: Db, pathId: string, version: number) {
  const row = db.prepare("SELECT * FROM path_versions WHERE path_id = ? AND version = ?").get(pathId, version) as PathVersionRow | undefined;
  return row ? parseVersion(row) : undefined;
}

export function followUp(db: Db, id: string, version?: number): FollowUpContent | undefined {
  const row = (
    version === undefined
      ? db.prepare("SELECT content FROM follow_ups WHERE id = ? ORDER BY version DESC LIMIT 1").get(id)
      : db.prepare("SELECT content FROM follow_ups WHERE id = ? AND version = ?").get(id, version)
  ) as { content: string } | undefined;
  return row ? (JSON.parse(row.content) as FollowUpContent) : undefined;
}

/** Path steps can be short follow ups or short lessons (`lesson:<slug>`) played in the lesson player. */
export const isLessonActivity = (id: string) => id.startsWith("lesson:");
export const lessonForActivity = (db: Db, id: string) => (isLessonActivity(id) ? getLesson(db, id.slice(7)) : undefined);

/** Title, length and objective for either kind of activity. */
export function activityInfo(db: Db, id: string, version?: number) {
  if (isLessonActivity(id)) {
    const l = lessonForActivity(db, id);
    return l ? { kind: "lesson" as const, title: l.title, durationSec: l.minutes * 60, objective: l.outcome, slug: l.slug } : undefined;
  }
  const f = followUp(db, id, version);
  return f ? { kind: "followup" as const, title: f.title, durationSec: f.durationSec, objective: f.objective, slug: undefined } : undefined;
}

export function scheduleFor(config: PathConfig, timezone: string): ScheduleConfig {
  return { ...config.schedule, timezone };
}

export function userTimezone(db: Db, user: User, config: PathConfig) {
  if (user.timezone) return user.timezone;
  const org = db.prepare("SELECT timezone FROM orgs WHERE id = ?").get(user.org_id) as { timezone: string } | undefined;
  return org?.timezone ?? config.timezoneFallback;
}

/** Picks an approved role variant when one exists for the learner's role. */
export function resolveStep(step: PinnedStep, user: User) {
  const variantId = user.service_role ? step.variants[user.service_role] : undefined;
  if (variantId && step.pinned?.variants[user.service_role!] !== undefined) {
    return { id: variantId, version: step.pinned.variants[user.service_role!] };
  }
  return { id: step.followUpId, version: step.pinned?.default ?? (isLessonActivity(step.followUpId) ? 0 : 1) };
}

const anchorLabelFor = (config: PathConfig) =>
  config.trigger.type === "lesson_completion" ? "the base lesson was completed" : "the path was assigned";

function dueFor(step: PinnedStep, release: Date | null, cfg: ScheduleConfig) {
  if (!step.required || !step.dueWeekdays || !release) return null;
  return zonedToUtc(addWeekdays(localDate(release, cfg.timezone), step.dueWeekdays), "17:00", cfg.timezone).toISOString();
}

/** Creates one enrolment per person, path version and trigger occurrence. Safe to call repeatedly. */
export function enrol(db: Db, user: User, pathId: string, version: number, trigger: string, anchor: Date, now: Date) {
  const pv = pathVersion(db, pathId, version);
  if (!pv || pv.status !== "published") throw new HttpError(409, "Only a published path version can enrol learners.");
  const timezone = userTimezone(db, user, pv.config);
  const res = db
    .prepare(
      "INSERT OR IGNORE INTO enrolments (user_id, org_id, path_id, path_version, trigger_occurrence, anchor, timezone, state, paused_at, created_at) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?)",
    )
    .run(user.id, user.org_id, pathId, version, trigger, anchor.toISOString(), timezone, pv.paused ? "paused" : "active", pv.paused ? now.toISOString() : null, now.toISOString());
  const enrolment = db
    .prepare("SELECT * FROM enrolments WHERE user_id = ? AND path_id = ? AND path_version = ? AND trigger_occurrence = ?")
    .get(user.id, pathId, version, trigger) as EnrolmentRow;
  if (res.changes === 0) return { enrolment, created: false };

  const cfg = scheduleFor(pv.config, timezone);
  const projected = projectSchedule({ cfg, anchor, anchorLabel: anchorLabelFor(pv.config), gaps: pv.steps.map((s) => s.gap) });
  pv.steps.forEach((step, i) => {
    const fu = resolveStep(step, user);
    const at = projected[i].at;
    db.prepare(
      "INSERT INTO step_instances (enrolment_id, step_index, step_key, follow_up_id, follow_up_version, planned_release, required, due_at) VALUES (?, ?, ?, ?, ?, ?, ?, ?)",
    ).run(enrolment.id, i, step.key, fu.id, fu.version, at ? at.toISOString() : null, step.required ? 1 : 0, dueFor(step, at, cfg));
  });
  audit(db, { actor: user.id, event: "enrolment.created", entity: `enrolment:${enrolment.id}`, next: { pathId, version, trigger }, at: now });
  return { enrolment, created: true };
}

/**
  Records a server-confirmed lesson completion. The completion row is unique per person and
  lesson version, so replaying the same event returns the original record and enrolment.
*/
export function recordLessonCompletion(db: Db, user: User, lesson: { slug: string; version: string }, now: Date) {
  return tx(db, () => {
    db.prepare("INSERT OR IGNORE INTO lesson_completions (user_id, lesson_slug, lesson_version, completed_at) VALUES (?, ?, ?, ?)").run(
      user.id,
      lesson.slug,
      lesson.version,
      now.toISOString(),
    );
    const completion = db
      .prepare("SELECT * FROM lesson_completions WHERE user_id = ? AND lesson_slug = ? AND lesson_version = ?")
      .get(user.id, lesson.slug, lesson.version) as { id: number; completed_at: string };
    const anchor = new Date(completion.completed_at);

    // Spaced learning only runs for master lessons with the checkbox ticked.
    const published = isSpaced(db, lesson.slug)
      ? (db.prepare("SELECT * FROM path_versions WHERE status = 'published'").all() as PathVersionRow[]).map(parseVersion)
      : [];
    const followUps = [];
    for (const pv of published) {
      const t = pv.config.trigger;
      if (t.type !== "lesson_completion" || t.lessonSlug !== lesson.slug || t.lessonVersion !== lesson.version) continue;
      if (user.audience === "staff" || !pv.config.audience.includes(user.audience)) continue;
      const { enrolment } = enrol(db, user, pv.path_id, pv.version, `lesson_completion:${completion.id}`, anchor, now);
      const first = db.prepare("SELECT * FROM step_instances WHERE enrolment_id = ? AND step_index = 0").get(enrolment.id) as InstanceRow | undefined;
      const content = first ? activityInfo(db, first.follow_up_id, first.follow_up_version) : undefined;
      followUps.push({
        pathName: pv.config.name,
        firstRelease: first?.planned_release ?? null,
        durationSec: content?.durationSec ?? 60,
        timezone: enrolment.timezone,
      });
    }
    return { completedAt: completion.completed_at, followUps };
  });
}

type LearnerStatus = "available" | "in_progress" | "completed" | "upcoming" | "waiting" | "paused" | "withdrawn";

function statusOf(i: InstanceRow, e: EnrolmentRow): LearnerStatus {
  if (i.cancelled_at) return "withdrawn";
  if (i.completed_at) return "completed";
  if (i.released_at) return i.started_at ? "in_progress" : "available";
  if (e.state === "paused") return "paused";
  return i.planned_release ? "upcoming" : "waiting";
}

/** Explains each step's date with the same scheduling function the worker uses. */
export function explainEnrolment(db: Db, e: EnrolmentRow, instances: InstanceRow[]) {
  const pv = pathVersion(db, e.path_id, e.path_version)!;
  const cfg = scheduleFor(pv.config, e.timezone);
  return projectSchedule({
    cfg,
    anchor: new Date(e.anchor),
    anchorLabel: anchorLabelFor(pv.config),
    gaps: pv.steps.map((s) => s.gap),
    completions: instances.map((i) => (i.completed_at ? new Date(i.completed_at) : null)),
  });
}

export function learnerFollowUps(db: Db, user: User) {
  const enrolments = db.prepare("SELECT * FROM enrolments WHERE user_id = ? ORDER BY created_at").all(user.id) as EnrolmentRow[];
  return enrolments.flatMap((e) => {
    const pv = pathVersion(db, e.path_id, e.path_version)!;
    const instances = db.prepare("SELECT * FROM step_instances WHERE enrolment_id = ? ORDER BY step_index").all(e.id) as InstanceRow[];
    const explained = explainEnrolment(db, e, instances);
    const base = pv.config.trigger.type === "lesson_completion" ? lessons.find((l) => l.slug === (pv.config.trigger as { lessonSlug: string }).lessonSlug) : undefined;
    return instances.map((i) => {
      const content = activityInfo(db, i.follow_up_id, i.follow_up_version);
      return {
        id: i.id,
        pathId: e.path_id,
        enrolmentId: e.id,
        pathName: pv.config.name,
        stage: pv.steps[i.step_index]?.stage ?? null,
        anchor: e.anchor,
        base: base ? { slug: base.slug, title: base.title } : null,
        href: content?.kind === "lesson" ? `/learning/s/${content.slug}?instance=${i.id}` : `/learning/follow-ups/${i.id}`,
        stepNumber: i.step_index + 1,
        stepCount: instances.length,
        title: content?.title ?? stageLabel.custom,
        objective: content?.objective ?? pv.config.objective,
        durationSec: content?.durationSec ?? 60,
        status: statusOf(i, e),
        plannedRelease: i.planned_release,
        releasedAt: i.released_at,
        completedAt: i.completed_at,
        required: Boolean(i.required),
        dueAt: i.due_at,
        explanation: explained[i.step_index]?.explanation ?? "",
        withdrawnReason: i.cancelled_at ? pv.withdrawn_reason : null,
        timezone: e.timezone,
      };
    });
  });
}

/** Loads an instance only if it belongs to the signed-in learner; otherwise it does not exist for them. */
export function ownedInstance(db: Db, user: User, id: number) {
  const row = db
    .prepare("SELECT si.*, e.user_id AS owner FROM step_instances si JOIN enrolments e ON e.id = si.enrolment_id WHERE si.id = ?")
    .get(id) as (InstanceRow & { owner: string }) | undefined;
  if (!row || row.owner !== user.id) throw new HttpError(404, "Follow up not found.");
  const enrolment = db.prepare("SELECT * FROM enrolments WHERE id = ?").get(row.enrolment_id) as EnrolmentRow;
  return { instance: row as InstanceRow, enrolment };
}

function requireOpen(i: InstanceRow) {
  if (i.cancelled_at) throw new HttpError(410, "This follow up was withdrawn.");
  if (!i.released_at) throw new HttpError(409, "This follow up isn’t available yet.");
}

export function followUpView(db: Db, user: User, id: number) {
  const { instance, enrolment } = ownedInstance(db, user, id);
  const pv = pathVersion(db, enrolment.path_id, enrolment.path_version)!;
  const attempt = db.prepare("SELECT * FROM attempts WHERE step_instance_id = ?").get(instance.id) as AttemptRow | undefined;
  const full = instance.released_at && !instance.cancelled_at ? followUp(db, instance.follow_up_id, instance.follow_up_version) : undefined;
  // Correctness and feedback are only sent once the learner has committed a first answer.
  const activity = activityInfo(db, instance.follow_up_id, instance.follow_up_version);
  const content =
    full && !attempt
      ? { ...full, question: { ...full.question, options: full.question.options.map((o) => ({ id: o.id, label: o.label, correct: false, feedback: "" })) } }
      : full;
  const next = db
    .prepare("SELECT * FROM step_instances WHERE enrolment_id = ? AND step_index = ?")
    .get(enrolment.id, instance.step_index + 1) as InstanceRow | undefined;
  const nextContent = next ? activityInfo(db, next.follow_up_id, next.follow_up_version) : undefined;
  const step = pv.steps[instance.step_index];
  return {
    id: instance.id,
    status: statusOf(instance, enrolment),
    // Short lessons in a sequence are played in the lesson player.
    lessonHref: activity?.kind === "lesson" ? `/learning/s/${activity.slug}?instance=${instance.id}` : null,
    stage: step?.stage ?? null,
    pathName: pv.config.name,
    stepNumber: instance.step_index + 1,
    stepCount: pv.steps.length,
    completionRule: step?.completionRule ?? "response_and_feedback",
    required: Boolean(instance.required),
    plannedRelease: instance.planned_release,
    withdrawnReason: instance.cancelled_at ? pv.withdrawn_reason : null,
    content,
    progress: instance.progress ? (JSON.parse(instance.progress) as { card: number }) : { card: 0 },
    attempt: attempt
      ? {
          initial: attempt.initial_response,
          initialCorrect: Boolean(attempt.initial_correct),
          feedbackShown: Boolean(attempt.feedback_shown_at),
          corrected: attempt.corrected_response,
          correctedCorrect: attempt.corrected_correct === null ? null : Boolean(attempt.corrected_correct),
        }
      : null,
    feedbackViewed: Boolean(instance.feedback_viewed_at),
    completedAt: instance.completed_at,
    next: next
      ? {
          title: nextContent?.title ?? "Next follow up",
          plannedRelease: next.planned_release,
          waiting: !next.planned_release,
          durationSec: nextContent?.durationSec ?? 60,
        }
      : null,
    timezone: enrolment.timezone,
  };
}

export type FollowUpAction =
  | { action: "start" }
  | { action: "progress"; card: number }
  | { action: "answer"; optionId: string; phase: "initial" | "corrected"; assisted?: boolean }
  | { action: "feedback_viewed" }
  | { action: "complete" }
  | { action: "complete_lesson"; results: { id: string; correct: boolean }[] };

export function followUpAct(db: Db, user: User, id: number, body: FollowUpAction, now: Date) {
  return tx(db, () => {
    const { instance, enrolment } = ownedInstance(db, user, id);
    requireOpen(instance);
    const at = now.toISOString();
    switch (body.action) {
      case "start":
        db.prepare("UPDATE step_instances SET started_at = COALESCE(started_at, ?) WHERE id = ?").run(at, id);
        break;
      case "progress":
        db.prepare("UPDATE step_instances SET progress = ?, started_at = COALESCE(started_at, ?) WHERE id = ?").run(
          JSON.stringify({ card: Math.max(0, Math.min(2, Math.floor(body.card))) }),
          at,
          id,
        );
        break;
      case "answer": {
        const content = followUp(db, instance.follow_up_id, instance.follow_up_version)!;
        const option = content.question.options.find((o) => o.id === body.optionId);
        if (!option) throw new HttpError(400, "Unknown option.");
        const existing = db.prepare("SELECT * FROM attempts WHERE step_instance_id = ?").get(id) as AttemptRow | undefined;
        if (body.phase === "initial" || !existing) {
          // The first response is kept as given; later posts never overwrite it.
          db.prepare(
            "INSERT OR IGNORE INTO attempts (step_instance_id, question_id, follow_up_version, concept, initial_response, initial_correct, initial_at, assisted) VALUES (?, ?, ?, ?, ?, ?, ?, ?)",
          ).run(id, content.id, content.version, content.concept, option.id, option.correct ? 1 : 0, at, body.assisted ? 1 : 0);
        } else {
          if (!existing.feedback_shown_at) throw new HttpError(409, "A corrected response follows feedback.");
          db.prepare("UPDATE attempts SET corrected_response = ?, corrected_correct = ?, corrected_at = ? WHERE id = ?").run(option.id, option.correct ? 1 : 0, at, existing.id);
        }
        db.prepare("UPDATE attempts SET feedback_shown_at = COALESCE(feedback_shown_at, ?) WHERE step_instance_id = ?").run(at, id);
        db.prepare("UPDATE step_instances SET started_at = COALESCE(started_at, ?) WHERE id = ?").run(at, id);
        break;
      }
      case "feedback_viewed":
        db.prepare("UPDATE step_instances SET feedback_viewed_at = COALESCE(feedback_viewed_at, ?) WHERE id = ?").run(at, id);
        break;
      case "complete_lesson": {
        // Prototype: the lesson player reports first-attempt results. Production scores on the server.
        if (!isLessonActivity(instance.follow_up_id)) throw new HttpError(400, "This activity isn’t a lesson.");
        if (instance.completed_at) break;
        const results = Array.isArray(body.results) ? body.results.slice(0, 50) : [];
        const allCorrect = results.length > 0 && results.every((r) => r.correct);
        db.prepare(
          "INSERT OR IGNORE INTO attempts (step_instance_id, question_id, follow_up_version, concept, initial_response, initial_correct, initial_at, feedback_shown_at) VALUES (?, ?, 0, ?, ?, ?, ?, ?)",
        ).run(id, instance.follow_up_id, instance.follow_up_id.replace("lesson:", ""), JSON.stringify(results), allCorrect ? 1 : 0, at, at);
        db.prepare("UPDATE step_instances SET started_at = COALESCE(started_at, ?), feedback_viewed_at = COALESCE(feedback_viewed_at, ?), completed_at = ? WHERE id = ?").run(at, at, at, id);
        onStepCompleted(db, enrolment, instance, now);
        audit(db, { actor: user.id, event: "step.completed", entity: `step_instance:${id}`, next: { firstAttemptCorrect: allCorrect }, at: now });
        break;
      }
      case "complete": {
        if (instance.completed_at) break;
        const attempt = db.prepare("SELECT * FROM attempts WHERE step_instance_id = ?").get(id) as AttemptRow | undefined;
        const fresh = db.prepare("SELECT feedback_viewed_at FROM step_instances WHERE id = ?").get(id) as { feedback_viewed_at: string | null };
        if (!attempt || !fresh.feedback_viewed_at) throw new HttpError(409, "Answer the question and view the feedback to finish.");
        const pv = pathVersion(db, enrolment.path_id, enrolment.path_version)!;
        const rule = pv.steps[instance.step_index]?.completionRule ?? "response_and_feedback";
        if (rule === "pass" && !attempt.initial_correct && !attempt.corrected_correct) {
          throw new HttpError(409, "This activity needs a correct answer to finish. Try again after reading the feedback.");
        }
        db.prepare("UPDATE step_instances SET completed_at = ? WHERE id = ?").run(at, id);
        onStepCompleted(db, enrolment, instance, now);
        audit(db, { actor: user.id, event: "step.completed", entity: `step_instance:${id}`, at: now });
        break;
      }
    }
    return followUpView(db, user, id);
  });
}

/** After completion mode starts the next gap from the confirmed completion; finishes the enrolment at the end. */
function onStepCompleted(db: Db, enrolment: EnrolmentRow, instance: InstanceRow, now: Date) {
  const pv = pathVersion(db, enrolment.path_id, enrolment.path_version)!;
  const next = db
    .prepare("SELECT * FROM step_instances WHERE enrolment_id = ? AND step_index = ?")
    .get(enrolment.id, instance.step_index + 1) as InstanceRow | undefined;
  if (next && pv.config.schedule.mode === "after_completion" && !next.planned_release && !next.cancelled_at) {
    const cfg = scheduleFor(pv.config, enrolment.timezone);
    const release = releaseAfter(now, pv.steps[next.step_index].gap, cfg).at;
    db.prepare("UPDATE step_instances SET planned_release = ?, due_at = ? WHERE id = ?").run(
      release.toISOString(),
      dueFor(pv.steps[next.step_index], release, cfg),
      next.id,
    );
  }
  const open = db.prepare("SELECT COUNT(*) AS n FROM step_instances WHERE enrolment_id = ? AND completed_at IS NULL AND cancelled_at IS NULL").get(enrolment.id) as {
    n: number;
  };
  if (open.n === 0 && enrolment.state === "active") db.prepare("UPDATE enrolments SET state = 'completed' WHERE id = ?").run(enrolment.id);
}
