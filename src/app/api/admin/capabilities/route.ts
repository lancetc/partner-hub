import { body, handle } from "@/server/http";
import { HttpError } from "@/server/auth";
import {
  accessList,
  activateRole,
  approveCompetency,
  corrections,
  decideMapping,
  framework,
  heatmap,
  importPeople,
  people,
  personCapabilities,
  proposeMapping,
  qualityApproveRole,
  recordEvidence,
  resolveCorrection,
  rolePreview,
  saveCompetency,
  saveRole,
  saveRoleDraft,
  searchAssets,
  setAccess,
  setPerson,
  startPilot,
} from "@/server/capability";

/** Capability Insights. Each view checks who's asking: the framework, a role's heatmap, people, corrections, access. */
export async function GET(req: Request) {
  const q = new URL(req.url).searchParams;
  return handle(({ db, user, now }) => {
    switch (q.get("view")) {
      case "heatmap":
        return heatmap(db, user, q.get("role"), now);
      case "preview":
        return rolePreview(db, user, q.get("role"));
      case "people":
        return people(db, user);
      case "person":
        return personCapabilities(db, user, q.get("person"), now);
      case "corrections":
        return corrections(db, user);
      case "assets":
        return searchAssets(db, user, q.get("q"));
      case "access":
        return accessList(db, user);
      default:
        return framework(db, user);
    }
  });
}

export async function POST(req: Request) {
  return handle(async ({ db, user, now }) => {
    const input = await body<Record<string, unknown>>(req);
    switch (input.action) {
      case "pilot":
        startPilot(db, user, now);
        return framework(db, user);
      case "competency":
        saveCompetency(db, user, input, now);
        return framework(db, user);
      case "approveCompetency":
        approveCompetency(db, user, input.id, now);
        return framework(db, user);
      case "role":
        saveRole(db, user, input, now);
        return framework(db, user);
      case "roleDraft":
        return saveRoleDraft(db, user, input.roleId, input, now);
      case "roleQuality":
        return qualityApproveRole(db, user, input.roleId, now);
      case "roleActivate":
        activateRole(db, user, input.roleId, now);
        return framework(db, user);
      case "propose":
        proposeMapping(db, user, input, now);
        return framework(db, user);
      case "decide":
        decideMapping(db, user, input.id, input, now);
        return framework(db, user);
      case "person":
        return setPerson(db, user, input.userId, input, now);
      case "import":
        return importPeople(db, user, input.rows, now);
      case "record":
        return recordEvidence(db, user, input, now);
      case "correction":
        return resolveCorrection(db, user, input.id, input, now);
      case "access":
        return setAccess(db, user, input, now);
      default:
        throw new HttpError(400, "Unknown action.");
    }
  });
}
