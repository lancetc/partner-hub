import "server-only";
import { cellText, CRITICALITY, DOMAINS, STAGE_LABELS, STAGES, WHAT_COUNTS } from "@/lib/capability";
import { audit, type Db } from "./db";
import type { User } from "./auth";
import { evidenceRows, heatmap } from "./capability";
import { workbook, type Sheet } from "./xlsx";

/*
  The capability export (docs/capability-intelligence.md): the role matrix and the aggregate heatmap, with
  the definitions, framework version and snapshot time someone needs to read them properly. The individual
  evidence sheet is a separate choice, for the population's owner only, and is audited by itself. No
  export holds private notes, journals, Discovery goals or reflections: they're never read to begin with.
*/
export function exportCapability(db: Db, actor: User, roleId: unknown, individual: boolean, now: Date) {
  const map = heatmap(db, actor, roleId, now);
  const date = now.toISOString().slice(0, 10);
  const readMe: Sheet = {
    name: "Read me",
    header: ["Item", "Detail"],
    widths: [34, 120],
    rows: [
      ["Role", map.role.name],
      ["Population", DOMAINS[map.role.domain]],
      [
        "Framework version",
        map.version ? `Version ${map.version.number}, made active ${map.version.approvedAt?.slice(0, 10)} by ${map.version.approvedBy}` : "No active version",
      ],
      ["Snapshot", `${now.toISOString()} (read from the Hub’s records at this moment)`],
      ["People in this role", map.people],
      ["People in this population with no role set (not counted)", map.unassigned],
      ["Small groups", map.canDrill ? "Shown: this export was made by the population’s owner." : `Groups of fewer than ${map.threshold} people are not shown.`],
      [
        "What this is",
        "An evidence view. It says what has been recorded, not how capable someone is. A count of completions is not a count of observed competence.",
      ],
      ...STAGES.map((s, i) => [STAGE_LABELS[s], WHAT_COUNTS[i]]),
      ["No evidence yet", "Nothing eligible has been recorded. It means unknown, not a judgement about the person."],
      ["Needs refresh", "Evidence older than the role’s refresh rule. It is flagged, never removed."],
      ["Not included", WHAT_COUNTS[4]],
    ],
  };
  const matrix: Sheet = {
    name: "Role matrix",
    header: ["Competency", "Group", "Competency version", "Role asks for", "Criticality", "Approved way to show it"],
    widths: [38, 24, 18, 20, 14, 30],
    rows: map.rows.map((r) => [r.name, r.group, r.version, STAGE_LABELS[r.target], CRITICALITY[r.criticality], r.noRoute ? "None yet: coverage gap" : "Yes"]),
  };
  const heat: Sheet = {
    name: "Heatmap",
    header: [
      "Competency",
      "Group",
      "People",
      "Verified at work",
      "Demonstrated",
      "Practised",
      "Introduced",
      "No evidence yet",
      "At the role’s target",
      "Needs refresh",
      "In words",
    ],
    widths: [38, 24, 10, 16, 14, 12, 12, 16, 18, 14, 70],
    rows: map.rows.flatMap((r) =>
      map.columns.map((col, i) => {
        const c = r.cells[i];
        return c.suppressed
          ? [r.name, col.label, `Fewer than ${map.threshold}`, "", "", "", "", "", "", "", "Not shown: too few people"]
          : [r.name, col.label, c.n, c.verified, c.demonstrated, c.practised, c.introduced, c.none, c.met, c.stale, cellText(c)];
      }),
    ),
  };
  const sheets = [readMe, matrix, heat];
  if (individual) {
    const profiles = evidenceRows(db, actor, roleId, now);
    sheets.push({
      name: "Individual evidence",
      header: [
        "Person",
        "Team",
        "Competency",
        "Competency version",
        "Role asks for",
        "Stage",
        "Evidence",
        "Date",
        "Version",
        "Detail",
        "Signed off or recorded by",
        "Needs refresh",
      ],
      widths: [26, 18, 34, 18, 18, 18, 50, 14, 20, 40, 26, 14],
      rows: profiles.flatMap((p) =>
        p.competencies.flatMap((c) => {
          const rows = STAGES.flatMap((s) =>
            c.stages[s].map((e) => [
              p.person.name,
              p.person.team,
              c.name,
              c.version,
              STAGE_LABELS[c.target],
              STAGE_LABELS[s],
              e.label,
              e.at.slice(0, 10),
              e.version ?? "",
              e.detail ?? "",
              e.by ?? "",
              e.stale ? "Yes" : "",
            ]),
          );
          return rows.length ? rows : [[p.person.name, p.person.team, c.name, c.version, STAGE_LABELS[c.target], "No evidence yet", "", "", "", "", "", ""]];
        }),
      ),
    });
  }
  audit(db, {
    actor: actor.id,
    event: individual ? "capability.exported_individual" : "capability.exported",
    entity: `role:${map.role.id}`,
    next: { version: map.version?.number ?? null, people: map.people, individual },
    at: now,
  });
  return { buffer: workbook(sheets), filename: `Capability ${map.role.name} ${date}${individual ? " individual" : ""}.xlsx` };
}
