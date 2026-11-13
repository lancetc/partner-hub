import "server-only";
import type { FollowUpContent, PathConfig, PathStep } from "@/content/followups";
import { lessons } from "@/content/lessons";
import { projectSchedule, releaseAfter, validateSchedule, zonedToUtc, type PlainDate } from "@/lib/schedule";
import { audit, tx, type Db } from "./db";
import { HttpError, requireAuthor, type User } from "./auth";
import {
  followUp,
  isLessonActivity,
  lessonForActivity,
  parseVersion,
  pathVersion,
  scheduleFor,
  type EnrolmentRow,
  type InstanceRow,
  type PathVersionRow,
  type PinnedStep,
} from "./learning";

/* Authoring: drafts, review, publication of immutable versions, pause, resume and withdrawal. */

export function listPaths(db: Db) {
  const ids = db.prepare("SELECT id FROM paths ORDER BY created_at").all() as { id: string }[];
  return ids.map(({ id }) => {
    const versions = (db.prepare("SELECT * FROM path_versions WHERE path_id = ? ORDER BY version DESC").all(id) as PathVersionRow[]).map(parseVersion);
    const live = versions.find((v) => v.status === "published");
    const draft = versions.find((v) => v.status === "draft" || v.status === "in_review");
    return { id, latest: versions[0], live, draft, versions: versions.map((v) => ({ version: v.version, status: v.status })) };
  });
}

export function editableVersion(db: Db, pathId: string) {
  const row = db.prepare("SELECT * FROM path_versions WHERE path_id = ? AND status IN ('draft','in_review') ORDER BY version DESC LIMIT 1").get(pathId) as
    PathVersionRow | undefined;
  return row ? parseVersion(row) : undefined;
}

function latestVersion(db: Db, pathId: string) {
  const row = db.prepare("SELECT * FROM path_versions WHERE path_id = ? ORDER BY version DESC LIMIT 1").get(pathId) as PathVersionRow | undefined;
  if (!row) throw new HttpError(404, "Path not found.");
  return parseVersion(row);
}

export function newDraft(db: Db, actor: User, pathId: string, now: Date) {
  requireAuthor(actor);
  return tx(db, () => {
    const existing = editableVersion(db, pathId);
    if (existing) return existing;
    const latest = latestVersion(db, pathId);
    const steps = latest.steps.map(({ pinned: _pinned, ...s }) => s);
    db.prepare("INSERT INTO path_versions (path_id, version, status, config, steps, created_at, updated_at) VALUES (?, ?, 'draft', ?, ?, ?, ?)").run(
      pathId,
      latest.version + 1,
      JSON.stringify(latest.config),
      JSON.stringify(steps),
      now.toISOString(),
      now.toISOString(),
    );
    audit(db, { actor: actor.id, event: "path.draft_created", entity: `path:${pathId}`, next: { version: latest.version + 1 }, at: now });
    return editableVersion(db, pathId)!;
  });
}

export function saveDraft(db: Db, actor: User, pathId: string, input: { config: PathConfig; steps: PathStep[] }, now: Date) {
  requireAuthor(actor);
  const draft = editableVersion(db, pathId);
  if (!draft) throw new HttpError(409, "Published versions can’t be edited. Create a new draft first.");
  db.prepare("UPDATE path_versions SET config = ?, steps = ?, status = 'draft', updated_at = ? WHERE path_id = ? AND version = ?").run(
    JSON.stringify(input.config),
    JSON.stringify(input.steps),
    now.toISOString(),
    pathId,
    draft.version,
  );
  return editableVersion(db, pathId)!;
}

const latestApproved = (db: Db, id: string) =>
  isLessonActivity(id)
    ? 0
    : (
        db.prepare("SELECT version FROM follow_ups WHERE id = ? AND status = 'approved' ORDER BY version DESC LIMIT 1").get(id) as
          { version: number } | undefined
      )?.version;

/** Publication checks: references, completion rules, accessible media, audience and schedule. */
export function validatePath(db: Db, config: PathConfig, steps: PathStep[]) {
  const issues: string[] = [
    ...validateSchedule(
      { ...config.schedule, timezone: config.timezoneFallback },
      steps.map((s) => s.gap),
    ),
  ];
  if (!config.name.trim()) issues.push("Give the path a name");
  if (!config.owner.trim()) issues.push("Name a content owner");
  if (!config.audience.length) issues.push("Choose an approved audience");
  if (config.trigger.type === "lesson_completion") {
    const t = config.trigger;
    if (!lessons.some((l) => l.slug === t.lessonSlug && l.version === t.lessonVersion)) issues.push("The trigger topic version doesn’t exist");
  }
  steps.forEach((s, i) => {
    const n = `Activity ${i + 1}`;
    const check = (id: string, label: string) => {
      if (isLessonActivity(id)) {
        const l = lessonForActivity(db, id);
        if (!l) issues.push(`${n}: ${label} topic doesn’t exist`);
        else if ("generated" in l && l.generated?.status !== "approved") issues.push(`${n}: “${l.title}” is still a draft`);
        return;
      }
      const f = followUp(db, id);
      if (!f) return issues.push(`${n}: ${label} doesn’t exist`);
      if (latestApproved(db, id) === undefined) issues.push(`${n}: “${f.title}”${label === "the activity" ? "" : ` (${label})`} isn’t approved yet`);
      contentIssues(f).forEach((x) => issues.push(`${n}: ${x}`));
    };
    check(s.followUpId, "the activity");
    Object.entries(s.variants).forEach(([role, id]) => check(id, `${role} variant`));
    if (s.adaptive) check(s.adaptive.ifStruggled, "the support variant");
    if (!s.completionRule) issues.push(`${n}: choose a completion rule`);
    if (s.required && !s.dueWeekdays) issues.push(`${n}: a required item needs a due rule`);
    if (!s.message.trim()) issues.push(`${n}: add a sharing message`);
  });
  return issues;
}

export function contentIssues(f: FollowUpContent) {
  const out: string[] = [];
  if (!f.question.prompt.trim() || !f.question.heading.trim()) out.push("the question needs a heading and prompt");
  if (f.question.options.length < 2) out.push("add at least two options");
  if (!f.question.options.some((o) => o.correct)) out.push("mark the better option");
  if (f.question.options.some((o) => !o.feedback.trim())) out.push("every option needs feedback");
  if (f.question.visual.kind !== "none" && !f.question.visual.alt.trim()) out.push("the visual needs a text alternative");
  if (f.explain?.script && !f.explain.body.trim()) out.push("narration needs an on-screen text equivalent");
  if (!f.takeaway.action.trim()) out.push("add a practical takeaway");
  if (!f.takeaway.reference?.url) out.push("link an approved reference");
  return out;
}

export function submitForReview(db: Db, actor: User, pathId: string, now: Date) {
  requireAuthor(actor);
  const draft = editableVersion(db, pathId);
  if (!draft) throw new HttpError(409, "There’s no draft to submit.");
  const issues = validatePath(db, draft.config, draft.steps);
  if (issues.length) throw new HttpError(422, issues.join("\n"));
  db.prepare("UPDATE path_versions SET status = 'in_review', submitted_by = ?, updated_at = ? WHERE path_id = ? AND version = ?").run(
    actor.id,
    now.toISOString(),
    pathId,
    draft.version,
  );
  audit(db, { actor: actor.id, event: "path.submitted", entity: `path:${pathId}@${draft.version}`, at: now });
}

/** Publishing pins every follow up version and creates an immutable path version. */
export function publish(db: Db, actor: User, pathId: string, now: Date) {
  requireAuthor(actor);
  return tx(db, () => {
    const draft = editableVersion(db, pathId);
    if (!draft || draft.status !== "in_review") throw new HttpError(409, "Submit the draft for review before publishing.");
    const issues = validatePath(db, draft.config, draft.steps);
    if (issues.length) throw new HttpError(422, issues.join("\n"));
    const pinned: PinnedStep[] = draft.steps.map((s) => ({
      ...s,
      pinned: {
        default: latestApproved(db, s.followUpId)!,
        variants: Object.fromEntries(Object.entries(s.variants).map(([role, id]) => [role, latestApproved(db, id)!])),
      },
    }));
    const previous = db.prepare("SELECT version FROM path_versions WHERE path_id = ? AND status = 'published'").get(pathId) as { version: number } | undefined;
    db.prepare("UPDATE path_versions SET status = 'superseded' WHERE path_id = ? AND status = 'published'").run(pathId);
    db.prepare(
      "UPDATE path_versions SET status = 'published', steps = ?, published_at = ?, published_by = ?, updated_at = ? WHERE path_id = ? AND version = ?",
    ).run(JSON.stringify(pinned), now.toISOString(), actor.id, now.toISOString(), pathId, draft.version);
    audit(db, {
      actor: actor.id,
      event: "path.published",
      entity: `path:${pathId}@${draft.version}`,
      previous: previous ? { version: previous.version } : undefined,
      reason: previous ? "New enrolments use this version. Existing enrolments stay on their version unless migrated." : undefined,
      at: now,
    });
  });
}

export function createFromLesson(db: Db, actor: User, lessonSlug: string, now: Date) {
  requireAuthor(actor);
  const lesson = lessons.find((l) => l.slug === lessonSlug);
  if (!lesson) throw new HttpError(404, "Topic not found.");
  const pathId = `path-${lesson.slug}-${now.getTime().toString(36)}`;
  const sources = [{ title: `${lesson.title}, topic version ${lesson.version}`, url: `/topics/${lesson.slug}` }];
  const stages = [
    { stage: "recall", title: "A quick recall", hint: "Ask the learner to recall what should happen first." },
    { stage: "scenario", title: "A new scenario", hint: "Change the situation while keeping the same objective." },
    { stage: "apply", title: "Practical application", hint: "Ask the learner to work something out or apply a step." },
    { stage: "transfer", title: "Final transfer check", hint: "Test the same judgement somewhere new." },
  ] as const;
  return tx(db, () => {
    db.prepare("INSERT INTO paths VALUES (?, ?, ?)").run(pathId, now.toISOString(), actor.id);
    const steps: PathStep[] = stages.map((s, i) => {
      const id = `${pathId}-${s.stage}`;
      const content: FollowUpContent = {
        id,
        version: 1,
        status: "draft",
        title: s.title,
        stage: s.stage,
        concept: lesson.slug,
        objective: lesson.outcome,
        durationSec: 60,
        question: {
          label: s.title,
          heading: "",
          body: s.hint,
          prompt: "",
          visual: { kind: "illustration", variant: lesson.visual.variant, tone: lesson.visual.tone, icon: lesson.visual.icon, alt: "" },
          options: [
            { id: "a", label: "", correct: true, feedback: "" },
            { id: "b", label: "", correct: false, feedback: "" },
          ],
        },
        explain: { heading: "", body: "" },
        takeaway: { action: "" },
        sources,
        draftWording: true,
      };
      db.prepare("INSERT INTO follow_ups VALUES (?, 1, 'draft', ?, ?, ?)").run(id, JSON.stringify(content), now.toISOString(), actor.id);
      return { key: `s${i + 1}`, followUpId: id, variants: {}, gap: [2, 5, 7, 16][i], message: "", required: false, completionRule: "response_and_feedback" };
    });
    const config: PathConfig = {
      name: `${lesson.title}: follow ups`,
      description: "",
      owner: actor.name,
      audience: lesson.track === "coordinator" ? ["coordinator"] : ["partner"],
      objective: lesson.outcome,
      trigger: { type: "lesson_completion", lessonSlug: lesson.slug, lessonVersion: lesson.version },
      schedule: { mode: "scheduled", unit: "calendar", deliveryDays: "weekdays", sendTime: "09:30", window: { start: "09:00", end: "17:00" } },
      timezoneFallback: "Australia/Brisbane",
      channel: "email",
      reminders: { enabled: true, afterWeekdays: 2 },
    };
    db.prepare("INSERT INTO path_versions (path_id, version, status, config, steps, created_at, updated_at) VALUES (?, 1, 'draft', ?, ?, ?, ?)").run(
      pathId,
      JSON.stringify(config),
      JSON.stringify(steps),
      now.toISOString(),
      now.toISOString(),
    );
    audit(db, { actor: actor.id, event: "path.created_from_lesson", entity: `path:${pathId}`, next: { lessonSlug }, at: now });
    return pathId;
  });
}

/** Saves follow up content. Approved versions are immutable, so editing one creates a new draft version. */
export function saveFollowUp(db: Db, actor: User, content: FollowUpContent, approve: boolean, now: Date) {
  requireAuthor(actor);
  return tx(db, () => {
    const latest = followUp(db, content.id);
    if (!latest) throw new HttpError(404, "Follow up not found.");
    const issues = approve ? contentIssues(content) : [];
    if (issues.length) throw new HttpError(422, issues.join("\n"));
    const status = approve ? "approved" : "draft";
    if (latest.status === "approved") {
      const version = latest.version + 1;
      db.prepare("INSERT INTO follow_ups VALUES (?, ?, ?, ?, ?, ?)").run(
        content.id,
        version,
        status,
        JSON.stringify({ ...content, version, status }),
        now.toISOString(),
        actor.id,
      );
    } else {
      db.prepare("UPDATE follow_ups SET content = ?, status = ? WHERE id = ? AND version = ?").run(
        JSON.stringify({ ...content, version: latest.version, status }),
        status,
        content.id,
        latest.version,
      );
    }
    audit(db, { actor: actor.id, event: approve ? "follow_up.approved" : "follow_up.saved", entity: `follow_up:${content.id}`, at: now });
    return followUp(db, content.id)!;
  });
}

export function previewSchedule(input: { config: PathConfig; steps: PathStep[]; timezone: string; start: PlainDate; time: string }) {
  const cfg = scheduleFor(input.config, input.timezone);
  const anchor = zonedToUtc(input.start, input.time, input.timezone);
  const anchorLabel = input.config.trigger.type === "lesson_completion" ? "the base topic was completed" : "the path was assigned";
  return {
    anchor: anchor.toISOString(),
    steps: projectSchedule({ cfg, anchor, anchorLabel, gaps: input.steps.map((s) => s.gap), estimate: true }).map((s) => ({
      ...s,
      at: s.at?.toISOString() ?? null,
    })),
  };
}

function publishedVersion(db: Db, pathId: string) {
  const pv = db.prepare("SELECT * FROM path_versions WHERE path_id = ? AND status = 'published'").get(pathId) as PathVersionRow | undefined;
  if (!pv) throw new HttpError(409, "This path has no published version.");
  return parseVersion(pv);
}

export function pausePath(db: Db, actor: User, pathId: string, now: Date) {
  requireAuthor(actor);
  tx(db, () => {
    const pv = publishedVersion(db, pathId);
    db.prepare("UPDATE path_versions SET paused = 1 WHERE path_id = ? AND version = ?").run(pathId, pv.version);
    db.prepare("UPDATE enrolments SET state = 'paused', paused_at = ? WHERE path_id = ? AND path_version = ? AND state = 'active'").run(
      now.toISOString(),
      pathId,
      pv.version,
    );
    audit(db, { actor: actor.id, event: "path.paused", entity: `path:${pathId}@${pv.version}`, at: now });
  });
}

/** What resuming will do, shown before the author confirms. */
export function resumePreview(db: Db, pathId: string, now: Date) {
  const pv = publishedVersion(db, pathId);
  const rows = db
    .prepare(
      `SELECT si.* FROM step_instances si JOIN enrolments e ON e.id = si.enrolment_id
       WHERE e.path_id = ? AND e.path_version = ? AND e.state = 'paused' AND si.released_at IS NULL AND si.cancelled_at IS NULL`,
    )
    .all(pathId, pv.version) as InstanceRow[];
  const overdue = rows.filter((r) => r.planned_release && r.planned_release <= now.toISOString()).length;
  const future = rows.filter((r) => r.planned_release && r.planned_release > now.toISOString()).length;
  const waiting = rows.filter((r) => !r.planned_release).length;
  const enrolments = (
    db.prepare("SELECT COUNT(*) AS n FROM enrolments WHERE path_id = ? AND path_version = ? AND state = 'paused'").get(pathId, pv.version) as { n: number }
  ).n;
  return {
    enrolments,
    overdue,
    future,
    waiting,
    summary: [
      `${enrolments} paused enrolment${enrolments === 1 ? "" : "s"} will resume.`,
      `${overdue} overdue activit${overdue === 1 ? "y becomes" : "ies become"} available at the next worker run, covered by at most one digest per person that day.`,
      `${future} future release${future === 1 ? " keeps its" : "s keep their"} planned date${future === 1 ? "" : "s"}.`,
      waiting ? `${waiting} after completion step${waiting === 1 ? " waits" : "s wait"} for the previous activity, using recorded completions as anchors.` : "",
    ].filter(Boolean),
  };
}

export function resumePath(db: Db, actor: User, pathId: string, now: Date) {
  requireAuthor(actor);
  tx(db, () => {
    const pv = publishedVersion(db, pathId);
    const preview = resumePreview(db, pathId, now);
    db.prepare("UPDATE path_versions SET paused = 0 WHERE path_id = ? AND version = ?").run(pathId, pv.version);
    db.prepare("UPDATE enrolments SET state = 'active', paused_at = NULL WHERE path_id = ? AND path_version = ? AND state = 'paused'").run(pathId, pv.version);
    audit(db, { actor: actor.id, event: "path.resumed", entity: `path:${pathId}@${pv.version}`, next: preview.summary, at: now });
  });
}

/** Separate, logged action: restart the remaining spacing from now after a long pause. */
export function rebaseline(db: Db, actor: User, pathId: string, reason: string, now: Date) {
  requireAuthor(actor);
  if (!reason.trim()) throw new HttpError(400, "Give a reason for the rebaseline.");
  tx(db, () => {
    const pv = publishedVersion(db, pathId);
    const enrolments = db
      .prepare("SELECT * FROM enrolments WHERE path_id = ? AND path_version = ? AND state IN ('active','paused')")
      .all(pathId, pv.version) as EnrolmentRow[];
    for (const e of enrolments) {
      const cfg = scheduleFor(pv.config, e.timezone);
      const pending = db
        .prepare(
          "SELECT * FROM step_instances WHERE enrolment_id = ? AND released_at IS NULL AND cancelled_at IS NULL AND planned_release IS NOT NULL ORDER BY step_index",
        )
        .all(e.id) as InstanceRow[];
      let prev = now;
      for (const si of pending) {
        const at = pv.config.schedule.mode === "scheduled" || si === pending[0] ? releaseAfter(prev, pv.steps[si.step_index].gap, cfg).at : null;
        if (!at) break;
        db.prepare("UPDATE step_instances SET planned_release = ? WHERE id = ?").run(at.toISOString(), si.id);
        audit(db, {
          actor: actor.id,
          event: "step.rebaselined",
          entity: `step_instance:${si.id}`,
          previous: si.planned_release,
          next: at.toISOString(),
          reason,
          at: now,
        });
        prev = at;
      }
    }
  });
}

/** Withdraws a version: cancels unsent work, keeps completed evidence, explains the change to learners. */
export function withdraw(db: Db, actor: User, pathId: string, version: number, reason: string, now: Date) {
  requireAuthor(actor);
  if (!reason.trim()) throw new HttpError(400, "Explain why the version is withdrawn. Learners will see this.");
  tx(db, () => {
    const pv = pathVersion(db, pathId, version);
    if (!pv || !["published", "superseded"].includes(pv.status)) throw new HttpError(409, "Only a published or superseded version can be withdrawn.");
    db.prepare("UPDATE path_versions SET status = 'withdrawn', withdrawn_reason = ?, updated_at = ? WHERE path_id = ? AND version = ?").run(
      reason,
      now.toISOString(),
      pathId,
      version,
    );
    db.prepare(
      `UPDATE step_instances SET cancelled_at = ? WHERE completed_at IS NULL AND cancelled_at IS NULL
       AND enrolment_id IN (SELECT id FROM enrolments WHERE path_id = ? AND path_version = ?)`,
    ).run(now.toISOString(), pathId, version);
    db.prepare("UPDATE enrolments SET state = 'withdrawn' WHERE path_id = ? AND path_version = ? AND state != 'completed'").run(pathId, version);
    audit(db, { actor: actor.id, event: "path.withdrawn", entity: `path:${pathId}@${version}`, reason, at: now });
  });
}
