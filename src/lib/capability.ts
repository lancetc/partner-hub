/*
  Capability Intelligence (docs/capability-intelligence.md): a governed framework of competencies for a
  role, the learning and assessment that count as evidence for each, and what the Hub can honestly say
  about a person from its own records. Shared by the server and the pages.

  The profile is an evidence view, never a score. Four stages are shown side by side, each with its own
  evidence: finishing a Topic is "Introduced" and nothing more; only an approved assessment shows
  "Demonstrated"; only a named person's observation shows "Verified at work". "No evidence yet" means
  unknown, not a judgement about the person.
*/

export const STAGES = ["introduced", "practised", "demonstrated", "verified"] as const;
export type Stage = (typeof STAGES)[number];

export const STAGE_LABELS: Record<Stage, string> = {
  introduced: "Introduced",
  practised: "Practised",
  demonstrated: "Demonstrated",
  verified: "Verified at work",
};
/** How each stage gets shown, for a stage with nothing against it yet. */
export const STAGE_HOW: Record<Stage, string> = {
  introduced: "Shown by finishing approved learning about this.",
  practised: "Shown by answering a decision about this in a practice scenario.",
  demonstrated: "Shown by passing an approved assessment of this.",
  verified: "Shown when someone authorised to has watched you do this at work and signed it off.",
};
export const NO_EVIDENCE = "No evidence yet";

/** How a piece of learning relates to a competency. Each relation can only ever support its own stage. */
export const RELATIONS = ["introduces", "practises", "assesses"] as const;
export type Relation = (typeof RELATIONS)[number];
export const RELATION_STAGE: Record<Relation, Stage> = { introduces: "introduced", practises: "practised", assesses: "demonstrated" };
export const RELATION_LABELS: Record<Relation, string> = { introduces: "Introduces", practises: "Practises", assesses: "Assesses" };

export type AssetKind = "topic" | "course" | "page" | "quiz";
export const ASSET_LABELS: Record<AssetKind, string> = { topic: "Topic", course: "Magazine course", page: "Magazine page", quiz: "Path quiz" };
/** What each kind of asset can be mapped as: a path quiz only assesses; a page can't assess. */
export const ASSET_RELATIONS: Record<AssetKind, Relation[]> = {
  topic: ["introduces", "practises", "assesses"],
  course: ["introduces", "practises"],
  page: ["introduces", "practises"],
  quiz: ["assesses"],
};

export const CRITICALITY = { core: "Core", high: "High risk", supporting: "Supporting" } as const;
export type Criticality = keyof typeof CRITICALITY;

/** Internal employees and external partners are separate populations: separate owners, separate totals. */
export const DOMAINS = { internal: "Trilogy Care employees", partner: "External partners and coordinators" } as const;
export type Domain = keyof typeof DOMAINS;
export const domainOf = (audience: string): Domain => (audience === "staff" ? "internal" : "partner");

export const ACCESS_ROLES = {
  pc: { label: "People & Culture", text: "Owns the employee framework and can see employees’ evidence." },
  partner_ops: { label: "Growth / Partner Operations", text: "Owns the partner framework and can see partners’ evidence." },
  quality: { label: "Quality", text: "Approves high-risk competencies and their assessment mappings. Sees aggregates." },
  insights: { label: "Aggregate insights", text: "Sees the heatmap only, with small groups hidden. No individual records." },
} as const;
export type AccessRole = keyof typeof ACCESS_ROLES;

export type Requirement = {
  competencyId: string;
  /** The competency version the role was approved against. Set when the role version is made active. */
  version: number;
  target: Stage;
  criticality: Criticality;
  /** Evidence older than this many months is flagged "Needs refresh". Empty: it doesn't go stale. */
  refreshMonths: number | null;
};

export type Evidence = {
  stage: Stage;
  /** What kind of record this is. */
  kind: "topic" | "course" | "page" | "decision" | "quiz" | "assessment" | "observation" | "record";
  label: string;
  at: string;
  /** The version of the content, assessment or competency it was earned against. */
  version: string | null;
  detail: string | null;
  /** Who signed it off or added it, for an observation or a recorded item. */
  by: string | null;
  stale: boolean;
};

export type NextStep = { text: string; href: string | null; action?: "ask" };

export type CompetencyProfile = {
  id: string;
  version: number;
  name: string;
  definition: string;
  behaviours: string[];
  group: string;
  target: Stage;
  criticality: Criticality;
  refreshMonths: number | null;
  stages: Record<Stage, Evidence[]>;
  /** The highest stage with any evidence, or null: no evidence yet. */
  highest: Stage | null;
  /** Evidence at the target stage exists and is current. */
  met: boolean;
  /** Evidence at the target stage exists but needs refreshing. */
  stale: boolean;
  summary: string;
  next: NextStep | null;
  /** They've asked their manager to observe this. */
  askedAt: string | null;
  /** The latest observation said "needs more practice". */
  morePractice: { at: string; by: string; rationale: string } | null;
};

const monthsBefore = (now: Date, months: number) => {
  const d = new Date(now);
  d.setMonth(d.getMonth() - months);
  return d.toISOString();
};
/** Evidence older than the role's refresh rule. Old evidence is flagged, never removed. */
export const isStale = (at: string, refreshMonths: number | null, now: Date) => Boolean(refreshMonths) && at < monthsBefore(now, refreshMonths!);

export function highestStage(stages: Record<Stage, Evidence[]>): Stage | null {
  for (let i = STAGES.length - 1; i >= 0; i--) if (stages[STAGES[i]].length) return STAGES[i];
  return null;
}

/** Whether the target stage has evidence, and whether the newest of it is current. */
export function targetState(stages: Record<Stage, Evidence[]>, target: Stage) {
  const at = stages[target];
  if (!at.length) return { met: false, stale: false };
  const current = at.some((e) => !e.stale);
  return { met: current, stale: !current };
}

/** The profile's one-line summary, in plain words: what there is, and what's still to come. */
export function summarise(stages: Record<Stage, Evidence[]>, target: Stage): string {
  const { met, stale } = targetState(stages, target);
  const highest = highestStage(stages);
  if (met) return target === "verified" ? "Verified at work." : `${STAGE_LABELS[target]}: this is what your role asks for.`;
  if (stale) return `${STAGE_LABELS[target]}, but the evidence is due a refresh.`;
  if (!highest) return "No evidence yet. That means it hasn’t been recorded, not that you can’t do it.";
  const have =
    highest === "verified"
      ? "Verified at work"
      : highest === "demonstrated"
        ? "Assessment evidence present"
        : highest === "practised"
          ? "Practice evidence present"
          : "Learning completed";
  const want =
    target === "verified"
      ? "workplace verification pending"
      : target === "demonstrated"
        ? "assessment pending"
        : `${STAGE_LABELS[target].toLowerCase()} pending`;
  return `${have}; ${want}.`;
}

/** A heatmap cell: everyone in the group, by the highest stage they have evidence for, with unknown kept apart. */
export type Cell = { n: number; verified: number; demonstrated: number; practised: number; introduced: number; none: number; met: number; stale: number };
export const emptyCell = (): Cell => ({ n: 0, verified: 0, demonstrated: 0, practised: 0, introduced: 0, none: 0, met: 0, stale: 0 });

export function addToCell(cell: Cell, c: Pick<CompetencyProfile, "highest" | "met" | "stale">) {
  cell.n += 1;
  if (c.highest) cell[c.highest] += 1;
  else cell.none += 1;
  if (c.met) cell.met += 1;
  if (c.stale) cell.stale += 1;
}

/** A cell in words, so it reads without colour: "12 of 20 verified at work · 5 demonstrated · 3 no evidence yet". */
export function cellText(cell: Cell): string {
  const parts = [
    cell.verified ? `${cell.verified} verified at work` : "",
    cell.demonstrated ? `${cell.demonstrated} demonstrated` : "",
    cell.practised ? `${cell.practised} practised` : "",
    cell.introduced ? `${cell.introduced} introduced` : "",
    cell.none ? `${cell.none} no evidence yet` : "",
    cell.stale ? `${cell.stale} need refresh` : "",
  ].filter(Boolean);
  return `${cell.n} ${cell.n === 1 ? "person" : "people"}: ${parts.join(" · ") || "no one"}`;
}

/** Groups smaller than this are hidden from aggregate views, so a figure can't be traced to a person. */
export const DEFAULT_MIN_COHORT = 5;

export const OBSERVATION_DECISIONS = { verified: "Sign off", more_practice: "Needs more practice" } as const;
export type ObservationDecision = keyof typeof OBSERVATION_DECISIONS;

export const NO_CLIENT_DETAILS = "Don’t name a client or include their health details. Describe what you saw the person do.";

export const WHAT_COUNTS = [
  "Finishing an approved Topic or Magazine course shows Introduced.",
  "Answering a decision in a mapped scenario shows Practised.",
  "Passing an approved assessment shows Demonstrated.",
  "Only a sign-off from your manager or an authorised assessor shows Verified at work.",
  "Your private notes, journal entries, Discovery Paths, Quick review answers and time spent on a page are never used.",
];
