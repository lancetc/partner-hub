import { body, handle } from "@/server/http";
import { HttpError } from "@/server/auth";
import {
  addMembership,
  approveEquivalence,
  approveRule,
  assignManually,
  courseAudit,
  courseReport,
  courseReportCsv,
  coursesAdmin,
  creditPrior,
  endMembership,
  exceptionsQueue,
  exempt,
  extend,
  personCourses,
  previewLearner,
  previewRule,
  publishCourse,
  publishRule,
  resolveHelp,
  reviewRoleChoice,
  roleStarts,
  saveRoleStart,
  retireRule,
  saveCourse,
  saveEquivalence,
  saveRule,
  searchPeople,
  seedDemoCourses,
  setWorkType,
  withdrawCourse,
} from "@/server/onboardingCourses";

/** Starting courses, for the people who run onboarding: templates, rules, people, exceptions, reports and the learner preview. */
export async function GET(req: Request) {
  const q = new URL(req.url).searchParams;
  return handle(({ db, user, now }) => {
    seedDemoCourses(db, now);
    switch (q.get("view")) {
      case "roles":
        return roleStarts(db, user, now);
      case "people":
        return searchPeople(db, user, q.get("q"), now);
      case "person":
        return personCourses(db, user, q.get("id"), now);
      case "exceptions":
        return exceptionsQueue(db, user, now);
      case "report":
        return courseReport(db, user, { orgId: q.get("org") }, now);
      case "export":
        return new Response(courseReportCsv(db, user, { orgId: q.get("org") }, now), {
          headers: {
            "content-type": "text/csv; charset=utf-8",
            "content-disposition": 'attachment; filename="starting-courses.csv"',
            "cache-control": "private, no-store",
          },
        });
      case "audit":
        return courseAudit(db, user, now);
      case "preview":
        return previewLearner(db, user, q.get("persona"), now);
      case "rule-preview":
        return previewRule(db, user, q.get("id"), now);
      default:
        return coursesAdmin(db, user, now);
    }
  });
}

export async function POST(req: Request) {
  return handle(async ({ db, user, now }) => {
    const input = await body<Record<string, unknown>>(req);
    switch (input.action) {
      case "save-role":
        return saveRoleStart(db, user, input, now);
      case "role-choice":
        return reviewRoleChoice(db, user, input, now);
      case "save-course":
        return saveCourse(db, user, input, now);
      case "publish-course":
        return publishCourse(db, user, input.id, now);
      case "withdraw-course":
        return withdrawCourse(db, user, input, now);
      case "save-rule":
        return saveRule(db, user, input, now);
      case "publish-rule":
        return publishRule(db, user, input.id, now);
      case "approve-rule":
        return approveRule(db, user, input.id, now);
      case "retire-rule":
        return retireRule(db, user, input, now);
      case "assign":
        return assignManually(db, user, input, now);
      case "exempt":
        return exempt(db, user, input, now);
      case "extend":
        return extend(db, user, input, now);
      case "credit":
        return creditPrior(db, user, input, now);
      case "work-type":
        return setWorkType(db, user, input, now);
      case "add-membership":
        return addMembership(db, user, input, now);
      case "end-membership":
        return endMembership(db, user, input, now);
      case "resolve-help":
        return resolveHelp(db, user, input, now);
      case "equivalence":
        return saveEquivalence(db, user, input, now);
      case "approve-equivalence":
        return approveEquivalence(db, user, input.id, now);
      default:
        throw new HttpError(400, "Unknown action.");
    }
  });
}
