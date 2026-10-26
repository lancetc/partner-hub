import "server-only";
import type { Db } from "./db";
import { reportOrgScope, requireReporter, type User } from "./auth";
import { activityInfo, explainEnrolment, parseVersion, type AttemptRow, type EnrolmentRow, type InstanceRow, type PathVersionRow } from "./learning";

/*
  Reporting keeps measures separate: scheduled, available, notified, started, completed and
  correct on first attempt. No retention percentage is calculated. Every query is limited
  to the viewer's organisation scope on the server.
*/

export function pathReport(db: Db, viewer: User, pathId: string) {
  requireReporter(viewer);
  const scope = reportOrgScope(viewer);
  const enrolments = db
    .prepare(`SELECT e.*, u.name AS learner, o.name AS org FROM enrolments e JOIN users u ON u.id = e.user_id JOIN orgs o ON o.id = e.org_id WHERE e.path_id = ? ${scope ? "AND e.org_id = ?" : ""} ORDER BY e.created_at`)
    .all(...(scope ? [pathId, scope] : [pathId])) as (EnrolmentRow & { learner: string; org: string })[];

  const versions = (db.prepare("SELECT * FROM path_versions WHERE path_id = ?").all(pathId) as PathVersionRow[]).map(parseVersion);
  const live = versions.find((v) => v.status === "published") ?? versions[0];
  const stepCount = Math.max(live?.steps.length ?? 0, 0);

  const stages = Array.from({ length: stepCount }, (_, i) => ({
    step: i + 1,
    title: live?.steps[i] ? activityInfo(db, live.steps[i].followUpId)?.title ?? `Activity ${i + 1}` : `Activity ${i + 1}`,
    scheduled: 0,
    available: 0,
    notified: 0,
    started: 0,
    completed: 0,
    answered: 0,
    correctFirst: 0,
    correctedAfterFeedback: 0,
    assisted: 0,
  }));

  const timelines = enrolments.map((e) => {
    const instances = db.prepare("SELECT * FROM step_instances WHERE enrolment_id = ? ORDER BY step_index").all(e.id) as InstanceRow[];
    const explained = explainEnrolment(db, e, instances);
    return {
      enrolmentId: e.id,
      learner: e.learner,
      org: e.org,
      version: e.path_version,
      state: e.state,
      timezone: e.timezone,
      anchor: e.anchor,
      steps: instances.map((si) => {
        const attempt = db.prepare("SELECT * FROM attempts WHERE step_instance_id = ?").get(si.id) as AttemptRow | undefined;
        const s = stages[si.step_index];
        if (s && !si.cancelled_at) {
          s.scheduled++;
          if (si.released_at) s.available++;
          if (si.notified_at) s.notified++;
          if (si.started_at) s.started++;
          if (si.completed_at) s.completed++;
          if (attempt) {
            s.answered++;
            if (attempt.initial_correct) s.correctFirst++;
            else if (attempt.corrected_correct) s.correctedAfterFeedback++;
            if (attempt.assisted) s.assisted++;
          }
        }
        return {
          step: si.step_index + 1,
          title: activityInfo(db, si.follow_up_id, si.follow_up_version)?.title ?? "",
          variant: si.follow_up_id,
          planned: si.planned_release,
          released: si.released_at,
          completed: si.completed_at,
          cancelled: si.cancelled_at,
          firstAttempt: attempt ? (attempt.initial_correct ? "correct" : "incorrect") : null,
          afterFeedback: attempt?.corrected_response ? (attempt.corrected_correct ? "correct" : "incorrect") : null,
          why: si.released_at ? `Released ${si.released_at}` : (explained[si.step_index]?.explanation ?? ""),
        };
      }),
    };
  });

  const userIds = [...new Set(enrolments.map((e) => e.user_id))];
  const failures = userIds.length
    ? (db.prepare(`SELECT COUNT(*) AS n FROM outbox WHERE status IN ('failed','unknown') AND user_id IN (${userIds.map(() => "?").join(",")})`).get(...userIds) as { n: number }).n
    : 0;

  // Concept level first attempt accuracy, with sample sizes.
  const concepts = new Map<string, { concept: string; n: number; correctFirst: number }>();
  for (const e of enrolments) {
    const rows = db
      .prepare("SELECT a.* FROM attempts a JOIN step_instances si ON si.id = a.step_instance_id WHERE si.enrolment_id = ?")
      .all(e.id) as AttemptRow[];
    for (const a of rows) {
      const c = concepts.get(a.concept) ?? { concept: a.concept, n: 0, correctFirst: 0 };
      c.n++;
      if (a.initial_correct) c.correctFirst++;
      concepts.set(a.concept, c);
    }
  }

  return {
    scope: scope ?? "all organisations",
    totals: {
      enrolments: enrolments.length,
      active: enrolments.filter((e) => e.state === "active").length,
      paused: enrolments.filter((e) => e.state === "paused").length,
      completed: enrolments.filter((e) => e.state === "completed").length,
      availableNow: timelines.reduce((n, t) => n + t.steps.filter((s) => s.released && !s.completed && !s.cancelled).length, 0),
      waitingOnPrevious: timelines.reduce((n, t) => n + t.steps.filter((s) => !s.planned && !s.completed && !s.cancelled).length, 0),
      notificationFailures: failures,
    },
    stages,
    concepts: [...concepts.values()],
    timelines,
  };
}

export function outboxFor(db: Db, viewer: User) {
  requireReporter(viewer);
  const scope = reportOrgScope(viewer);
  return db
    .prepare(
      `SELECT ob.id, ob.local_date, ob.channel, ob.status, ob.subject, ob.body, ob.attempts, ob.provider_ref, ob.last_error, ob.created_at, u.name AS learner
       FROM outbox ob JOIN users u ON u.id = ob.user_id ${scope ? "WHERE u.org_id = ?" : ""} ORDER BY ob.id DESC LIMIT 100`,
    )
    .all(...(scope ? [scope] : []));
}
