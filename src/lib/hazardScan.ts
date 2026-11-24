import { hazardSource, sourceStatus } from "./hazardSources";

/*
  Spot the Hazard (docs/spot-the-hazard.md): an interactive room scan. A learner looks around a drawn room, flags what
  needs attention, says what they'd deal with first, then decides what to do within their role. The outcome is
  notice → judge priority → respond, not a pixel hunt: tapping everything scores worse than a careful look.

  A block is one scene family: one room, several approved variants. Each variant is a complete room: the objects
  drawn in it (components/hazard/SceneArt), each at known coordinates, with its answer key. Variation swaps which
  objects appear and where, so a hotspot can never point at something that isn't drawn there. The server picks an
  approved variant per attempt from a repeatable seed, preferring one the learner hasn't seen, and freezes it.

  The answer key (hazard or not, category, priority, weight, rationale, source) never reaches a learner's browser
  before they submit: readers get the block without its variants or actions, and the attempt API sends the frozen
  variant's drawing and neutral descriptions only. Scoring is here, pure, and the server runs it on the frozen copy.

  Governance (section 8 of the PRD): every variant is reviewed on its own by a named reviewer, who checks the depicted
  object, its location, the risk, the action and the source, and that the learner rendering was tested. Changing an
  approved variant makes a new draft version. The block itself needs Quality, the policy owner and a learning reviewer.
*/

export const SCENE_VERSION = "hazard-scan-1";
export const SCORER_VERSION = "hazard-scorer-1";

export const SCENE_ROLES = {
  worker: "Care partner or support worker",
  coordinator: "Care coordinator",
  supplier: "Supplier worker (cleaning, gardening, maintenance)",
} as const;
export type SceneRole = keyof typeof SCENE_ROLES;
export const ROLE_ORDER = Object.keys(SCENE_ROLES) as SceneRole[];
/** The role a learner plays, from their Hub audience. Staff play the coordinator unless the scene doesn't offer it. */
export const ROLE_FOR_AUDIENCE: Record<string, SceneRole> = { partner: "worker", coordinator: "coordinator", staff: "coordinator" };
export const roleFor = (d: Pick<HazardScanData, "roles">, audience: string, serviceRole: string | null = null): SceneRole => {
  // A partner business that cleans, gardens or maintains homes plays the supplier worker, where the scene offers it.
  const supplier = audience === "partner" && /clean|garden|maint/i.test(serviceRole ?? "") && d.roles.includes("supplier");
  const want = supplier ? "supplier" : (ROLE_FOR_AUDIENCE[audience] ?? "worker");
  return d.roles.includes(want) ? want : (d.roles[0] ?? "worker");
};

export const CATEGORIES = { fall: "Trip or fall", equipment: "Equipment", infection: "Infection control", other: "Other concern" } as const;
export type HazardCategory = keyof typeof CATEGORIES;
/** The short reasons a learner can give for a flag, where the author asks for one. "Not sure" is always defensible. */
export const REASONS = { ...CATEGORIES, unsure: "Not sure" } as const;
export type Reason = keyof typeof REASONS;

export const PRIORITIES = { 3: "Deal with it first", 2: "Needs attention this visit", 1: "Worth raising" } as const;
export type Level = 0 | 1 | 2 | 3;
export const LEVEL_WORDS: Record<Level, string> = { 0: "Not yet", 1: "Partly", 2: "Appropriate", 3: "Strong" };
export const DIMENSIONS = { recognition: "Noticed what matters", priority: "Judged what comes first", response: "Responded within the role" } as const;
export type Dim = keyof typeof DIMENSIONS;
export const DIM_ORDER = Object.keys(DIMENSIONS) as Dim[];

/** What a response can leave out. An action is judged on these as well as on whether it's safe. */
export const CONCERNS = {
  consent: "Doesn’t ask the person first or get their agreement",
  preference: "Overrides the person’s preferences or belongings",
  careplan: "Doesn’t follow the care plan",
  scope: "Goes beyond the role",
  report: "Doesn’t report or escalate what needs it",
  safety: "Doesn’t put the person’s immediate safety and wellbeing first",
  facts: "Records a conclusion or blame, not what was seen",
} as const;
export type Concern = keyof typeof CONCERNS;
export const VERDICTS = { best: "A safe, respectful response", acceptable: "Works, with something to add", unsafe: "Not safe or not within the role" } as const;
export type Verdict = keyof typeof VERDICTS;
const VERDICT_LEVEL: Record<Verdict, Level> = { best: 3, acceptable: 2, unsafe: 0 };

/** The rooms drawn in code, and whether a variant can show the hallway dim. */
export const ROOMS = {
  "bedroom-hall": { label: "Bedroom, with the hallway to the bathroom", dimmable: true },
  "bedroom-care": { label: "Bedroom with care equipment", dimmable: false },
  "kitchen-dining": { label: "Kitchen and dining area", dimmable: false },
  "unit-living": { label: "A small unit: kitchenette, armchair and bed", dimmable: false },
} as const;
export type RoomId = keyof typeof ROOMS;

/** Every object the scenes can draw (components/hazard/SceneArt), with the looks each one has. */
export const OBJECT_KINDS = {
  heater: { label: "Portable heater", looks: ["cord-across", "cord-along-wall"] },
  rug: { label: "Rug", looks: ["flat", "curled"] },
  "ceiling-light": { label: "Ceiling light", looks: ["on", "out"] },
  "walking-stick": { label: "Walking stick", looks: ["leaning"] },
  photos: { label: "Framed photos", looks: ["frames"] },
  boxes: { label: "Stacked boxes", looks: ["stacked"] },
  slippers: { label: "Slippers", looks: ["closed-back", "backless-worn"] },
  "bath-mat": { label: "Bath mat", looks: ["flat", "rucked"] },
  "night-light": { label: "Night light", looks: ["on"] },
  plant: { label: "Pot plant", looks: ["leafy"] },
  "care-bed": { label: "Height-adjustable bed", looks: ["brakes-down", "brake-up"] },
  commode: { label: "Shower commode chair", looks: ["sound", "cracked"] },
  "walking-frame": { label: "Walking frame", looks: ["tips-on", "tip-missing"] },
  "glasses-book": { label: "Glasses and a book", looks: ["on-table"] },
  radio: { label: "Radio", looks: ["small"] },
  "clothes-chair": { label: "Chair with clothes", looks: ["folded"] },
  "used-ppe": { label: "Used gloves and mask", looks: ["crumpled"] },
  sanitiser: { label: "Hand sanitiser", looks: ["pump"] },
  spill: { label: "Puddle", looks: ["water"] },
  "chopping-board": { label: "Chopping board", looks: ["clean", "raw-and-ready"] },
  "garden-gloves": { label: "Gardening gloves", looks: ["pair"] },
  "roses-vase": { label: "Roses in a vase", looks: ["with-secateurs"] },
  "bowls-bag": { label: "Lawn bowls bag", looks: ["zipped"] },
  bin: { label: "Kitchen bin", looks: ["lidded"] },
  fridge: { label: "Fridge, door open", looks: ["stocked", "near-empty"] },
  "blister-pack": { label: "Medication blister pack", looks: ["in-use", "untouched"] },
  "room-climate": { label: "Thermometer and heater or fan", looks: ["cold", "hot"] },
  "call-pendant": { label: "Personal alarm pendant", looks: ["lanyard", "dock-red"] },
  "single-bed": { label: "Single bed", looks: ["unmade", "soiled"] },
  "books-papers": { label: "Books and papers", looks: ["piles"] },
  "cat-basket": { label: "Cat in its basket", looks: ["with-bowls"] },
  "simple-meal": { label: "Tea and toast", looks: ["plate"] },
} as const satisfies Record<string, { label: string; looks: readonly string[] }>;
export type ObjectKind = keyof typeof OBJECT_KINDS;

export type ItemKey = {
  hazard: boolean;
  category: HazardCategory | "";
  /** For a hazard: 3 deal with it first, 2 this visit, 1 worth raising. 0 for a safe item. */
  priority: 0 | 1 | 2 | 3;
  /** Only where the approved policy supports it: missing it caps recognition, whatever else was found. */
  critical: boolean;
  /** Educational importance, never the object's size. */
  weight: 1 | 2 | 3;
  /** The exact depicted feature, for the reviewer to verify against the drawing. */
  feature: string;
  /** Why it matters in this scene, or why it isn't a hazard here. Shown after submission. */
  explain: string;
  /** A source id (lib/hazardSources). */
  source: string;
};
export type SceneObject = {
  /** Neutral: names the object, never the risk. */
  id: string;
  /** The stable concept across variants (the same cord, wherever it's drawn): actions attach to it. */
  concept: string;
  kind: ObjectKind;
  look: string;
  /** Centre, as a percentage of the scene's width and height. */
  x: number;
  y: number;
  scale: number;
  /** The generous tap region, centred on (x, y), as percentages of width and height. */
  hit: { w: number; h: number };
  area: string;
  /** A short, neutral name: “Heater cord”. */
  label: string;
  /** What a sighted learner can see, without saying whether it's a hazard. */
  description: string;
  key: ItemKey;
};
export type VariantStatus = "draft" | "review" | "approved" | "retired";
export const VARIANT_STATUS: Record<VariantStatus, string> = {
  draft: "Draft",
  review: "In review",
  approved: "Approved for learners",
  retired: "Retired",
};
export type VariantReview = {
  reviewer: string;
  reviewedOn: string;
  /** The reviewer's checks, each on the drawing as learners see it. */
  objects: boolean;
  locations: boolean;
  risks: boolean;
  actions: boolean;
  sources: boolean;
  rendering: boolean;
  note: string;
};
export const REVIEW_CHECKS: [Exclude<keyof VariantReview, "reviewer" | "reviewedOn" | "note">, string][] = [
  ["objects", "Each hazard is visibly drawn, and is the exact object the key describes"],
  ["locations", "Each tap region sits on its object, is generous, and nothing hides it"],
  ["risks", "Each risk, priority and “not a hazard here” rationale is right for this scene"],
  ["actions", "The approved actions are right for each role offered"],
  ["sources", "Each item cites the current source"],
  ["rendering", "Tested as a learner: desktop, phone and the list route"],
];
export type Variant = {
  id: string;
  /** Bumped whenever an approved variant is changed: a change is a new version, reviewed again. */
  version: number;
  label: string;
  /** Roles this variant suits; empty is every role on the block. */
  roles: SceneRole[];
  dim: boolean;
  status: VariantStatus;
  objects: SceneObject[];
  review: VariantReview;
};
export type ActionOption = { id: string; text: string; roles: SceneRole[]; verdict: Verdict; ignores: Concern[]; feedback: string };
export type Decision = {
  id: string;
  /** The hazard concept it's about. Asked whenever that concept is a priority hazard in the learner's room. */
  concept: string;
  prompt: string;
  options: ActionOption[];
  source: string;
};
export type Area = { id: string; label: string };

export type HazardScanData = {
  title: string;
  intro: string;
  /** Stable across releases. */
  familyId: string;
  /** The scene family's release: what reviewers sign off. */
  release: string;
  mode: "practice" | "assessed";
  roles: SceneRole[];
  room: RoomId;
  objective: string;
  person: { name: string; about: string };
  /** What the worker would know from the care plan. */
  carePlan: string;
  /** What the learner is about to do. */
  task: string;
  areas: Area[];
  askReason: boolean;
  rules: { minHazards: number; maxHazards: number; minSafe: number; minHigh: number; decisions: 1 | 2 };
  variants: Variant[];
  decisions: Decision[];
  /** Job Aids by reference (Work Tools), shown with the debrief. */
  jobAids: { snippetId: string; why: string }[];
  /** Why it matters: shown in the debrief. */
  debrief: string;
  approval: { quality: string; policy: string; learning: string; approvedOn: string; reviewBy: string; releaseReviewed: string };
};

export const blankReview = (): VariantReview => ({
  reviewer: "",
  reviewedOn: "",
  objects: false,
  locations: false,
  risks: false,
  actions: false,
  sources: false,
  rendering: false,
  note: "",
});

// ---------------------------------------------------------------------------------------------
// Geometry, coverage and review: what a variant needs before learners can get it
// ---------------------------------------------------------------------------------------------

/** The smallest tap region: about 24 CSS pixels on a 375-pixel phone (WCAG 2.2 target size), before zoom. */
export const MIN_HIT = { w: 8, h: 12 };
const box = (o: SceneObject) => ({ l: o.x - o.hit.w / 2, r: o.x + o.hit.w / 2, t: o.y - o.hit.h / 2, b: o.y + o.hit.h / 2 });

export function geometryProblems(v: Pick<Variant, "objects">): string[] {
  const out: string[] = [];
  for (const o of v.objects) {
    const b = box(o);
    if (b.l < 1 || b.r > 99 || b.t < 1 || b.b > 99) out.push(`“${o.label}”: its tap region runs off the edge of the scene.`);
    if (o.hit.w < MIN_HIT.w || o.hit.h < MIN_HIT.h)
      out.push(`“${o.label}”: its tap region is too small for a phone (at least ${MIN_HIT.w}% by ${MIN_HIT.h}%).`);
  }
  for (let i = 0; i < v.objects.length; i++)
    for (let j = i + 1; j < v.objects.length; j++) {
      const a = v.objects[i];
      const c = v.objects[j];
      const A = box(a);
      const C = box(c);
      const w = Math.max(0, Math.min(A.r, C.r) - Math.max(A.l, C.l));
      const h = Math.max(0, Math.min(A.b, C.b) - Math.max(A.t, C.t));
      const smaller = Math.min(a.hit.w * a.hit.h, c.hit.w * c.hit.h);
      const inside = (p: SceneObject, q: ReturnType<typeof box>) => p.x > q.l && p.x < q.r && p.y > q.t && p.y < q.b;
      if ((smaller > 0 && (w * h) / smaller > 0.25) || inside(a, C) || inside(c, A))
        out.push(`“${a.label}” and “${c.label}” overlap: a tap could land on the wrong one. Move one or shrink its region.`);
    }
  return out;
}

const hazards = (v: Pick<Variant, "objects">) => v.objects.filter((o) => o.key.hazard);
const safes = (v: Pick<Variant, "objects">) => v.objects.filter((o) => !o.key.hazard);
const byPriority = (a: SceneObject, b: SceneObject) => b.key.priority - a.key.priority || b.key.weight - a.key.weight;

/** The actions a learner in a role is asked, for a variant: about its highest-priority hazards that have one. */
export function decisionsFor(d: Pick<HazardScanData, "decisions" | "rules">, v: Pick<Variant, "objects">, role: SceneRole) {
  const out: { decision: Decision; object: SceneObject; options: ActionOption[] }[] = [];
  for (const o of [...hazards(v)].sort(byPriority)) {
    if (out.length >= d.rules.decisions || out.some((x) => x.object.concept === o.concept)) continue;
    const decision = d.decisions.find((x) => x.concept === o.concept);
    // In a fixed order that isn't the authored one, so the best response isn't always first; the same on every attempt.
    const options = (decision?.options.filter((op) => !op.roles.length || op.roles.includes(role)) ?? []).sort(
      (a, b) => hashSeed(`${decision!.id}:${a.id}`) - hashSeed(`${decision!.id}:${b.id}`),
    );
    if (decision && options.length >= 2) out.push({ decision, object: o, options });
  }
  return out;
}

const rolesOf = (d: Pick<HazardScanData, "roles">, v: Pick<Variant, "roles">) => (v.roles.length ? v.roles.filter((r) => d.roles.includes(r)) : d.roles);

/** What keeps a variant from being approved for learners. Empty means it can be. */
export function variantProblems(d: HazardScanData, v: Variant, today: string): string[] {
  const out: string[] = [];
  const at = `Variant “${v.label || v.id}”`;
  if (!v.objects.length) return [`${at} has nothing in the room.`];
  const hz = hazards(v);
  const sf = safes(v);
  if (hz.length < d.rules.minHazards || hz.length > d.rules.maxHazards)
    out.push(`${at} has ${hz.length} hazards; the scene’s rules ask for ${d.rules.minHazards} to ${d.rules.maxHazards}.`);
  if (sf.length < d.rules.minSafe) out.push(`${at} needs at least ${d.rules.minSafe} safe, everyday items, so judgement is needed.`);
  if (hz.filter((o) => o.key.priority === 3).length < d.rules.minHigh)
    out.push(`${at} needs at least ${d.rules.minHigh} hazard${d.rules.minHigh === 1 ? "" : "s"} to deal with first.`);
  const ids = new Set<string>();
  for (const o of v.objects) {
    const w = `${at}, “${o.label || o.id}”`;
    if (ids.has(o.id)) out.push(`${w}: two objects share the id ${o.id}.`);
    ids.add(o.id);
    if (!(o.kind in OBJECT_KINDS)) out.push(`${w}: the scene can’t draw a “${o.kind}”.`);
    else if (!(OBJECT_KINDS[o.kind].looks as readonly string[]).includes(o.look))
      out.push(`${w}: a ${OBJECT_KINDS[o.kind].label.toLowerCase()} can’t look “${o.look}”.`);
    if (!o.label || !o.description) out.push(`${w}: needs a short name and a description for the list and screen readers.`);
    if (!d.areas.some((a) => a.id === o.area)) out.push(`${w}: choose where it is in the room.`);
    if (!o.key.explain) out.push(`${w}: needs its explanation (${o.key.hazard ? "why it matters here" : "why it isn’t a hazard here"}).`);
    if (!o.key.source) out.push(`${w}: needs its source.`);
    else {
      const src = hazardSource(o.key.source);
      if (!src) out.push(`${w}: its source isn’t in the source list.`);
      else if (src.placeholder) out.push(`${w}: cites a placeholder policy record. Replace it with the current Trilogy Care procedure before approving.`);
      else if (sourceStatus(o.key.source, today) !== "current") out.push(`${w}: its source is ${sourceStatus(o.key.source, today).replace("-", " ")}.`);
    }
    if (o.key.hazard) {
      if (!o.key.feature) out.push(`${w}: say exactly what is depicted, so the reviewer can check the drawing.`);
      if (!o.key.category) out.push(`${w}: choose its category.`);
      if (!o.key.priority) out.push(`${w}: set its priority.`);
    }
    if (/\b(hazard|danger|unsafe|risk)/i.test(o.description))
      out.push(`${w}: the description gives the answer away. Describe what’s visible, not whether it’s a risk.`);
  }
  out.push(...geometryProblems(v).map((p) => `${at}: ${p}`));
  // A critical or first-priority finding needs an approved, role-specific action for every role this variant goes to.
  for (const role of rolesOf(d, v)) {
    const asked = decisionsFor(d, v, role);
    const top = [...hz].sort(byPriority)[0];
    if (top && !asked.some((x) => x.object.concept === top.concept))
      out.push(`${at}: “${top.label}” comes first, but there’s no action for a ${SCENE_ROLES[role].toLowerCase()} about it.`);
    for (const x of asked) {
      if (!x.options.some((op) => op.verdict === "best"))
        out.push(`${at}: the action about “${x.object.label}” has no best response for a ${SCENE_ROLES[role].toLowerCase()}.`);
      if (x.options.some((op) => !op.feedback)) out.push(`${at}: every response about “${x.object.label}” needs its feedback.`);
    }
  }
  for (const o of hz.filter((x) => x.key.critical))
    if (!rolesOf(d, v).every((role) => decisionsFor(d, v, role).some((x) => x.object.concept === o.concept)))
      out.push(`${at}: “${o.label}” is critical, so every role needs an approved action about it.`);
  return out;
}

/** What the reviewer still has to record before approving. */
export function reviewProblems(v: Variant): string[] {
  const out: string[] = [];
  if (!v.review.reviewer.trim()) out.push("Record the named reviewer.");
  if (!/^\d{4}-\d{2}-\d{2}$/.test(v.review.reviewedOn)) out.push("Record the review date.");
  for (const [k, label] of REVIEW_CHECKS) if (!v.review[k]) out.push(`Not yet checked: ${label.toLowerCase()}.`);
  return out;
}

/**
  Approved variants a learner in a role can be given today: reviewed, complete, and on current sources. In an edition
  published under a demo sign-off (server/demoSignOff), any variant not retired, since nobody has reviewed it.
*/
export function eligibleVariants(d: HazardScanData, role: SceneRole, today: string, opts: { demo?: boolean } = {}) {
  if (opts.demo) return d.variants.filter((v) => v.status !== "retired" && v.objects.length > 0 && rolesOf(d, v).includes(role));
  return d.variants.filter((v) => v.status === "approved" && rolesOf(d, v).includes(role) && !variantProblems(d, v, today).length && !reviewProblems(v).length);
}

/** FNV-1a: a small, repeatable hash, the same in the browser and on the server. */
export function hashSeed(s: string) {
  let h = 0x811c9dc5;
  for (let i = 0; i < s.length; i++) {
    h ^= s.charCodeAt(i);
    h = Math.imul(h, 0x01000193) >>> 0;
  }
  return h >>> 0;
}

/**
  The variant for an attempt: one the learner hasn't seen if there is one, chosen by the attempt's seed. When every
  approved room has been seen, the last one is avoided where possible, and the attempt says it's a repeat: the
  library is small, so it never claims endless variety.
*/
export function chooseVariant<T extends { id: string }>(pool: T[], seen: string[], seed: string): { variant: T; repeat: boolean } | null {
  if (!pool.length) return null;
  const unseen = pool.filter((v) => !seen.includes(v.id));
  const fallback = pool.length > 1 ? pool.filter((v) => v.id !== seen.at(-1)) : pool;
  const from = unseen.length ? unseen : fallback;
  return { variant: from[hashSeed(seed) % from.length], repeat: !unseen.length };
}

/** How many attempts a role can make before a room repeats, and whether it can be given at all. */
export function coverage(d: HazardScanData, today: string) {
  return d.roles.map((role) => {
    const n = eligibleVariants(d, role, today).length;
    return {
      role,
      approved: n,
      note: !n
        ? `No approved room for a ${SCENE_ROLES[role].toLowerCase()} yet.`
        : n === 1
          ? "One approved room: every retry repeats it."
          : `${n} approved rooms: a retry repeats one after ${n} attempts.`,
    };
  });
}

// ---------------------------------------------------------------------------------------------
// What the learner's browser gets, and cleaning what it sends back
// ---------------------------------------------------------------------------------------------

export type LearnerObject = Omit<SceneObject, "key" | "concept">;
export type LearnerVariant = { id: string; version: number; dim: boolean; objects: LearnerObject[] };

/** The room to draw: objects, places and neutral descriptions, in list order (by area, then left to right). No answer key. */
export function learnerVariant(d: Pick<HazardScanData, "areas">, v: Variant): LearnerVariant {
  const order = (o: SceneObject) => d.areas.findIndex((a) => a.id === o.area);
  return {
    id: v.id,
    version: v.version,
    dim: v.dim,
    objects: [...v.objects]
      .sort((a, b) => order(a) - order(b) || a.x - b.x)
      .map((o) => ({
        id: o.id,
        kind: o.kind,
        look: o.look,
        x: o.x,
        y: o.y,
        scale: o.scale,
        hit: { ...o.hit },
        area: o.area,
        label: o.label,
        description: o.description,
      })),
  };
}

export type Selection = { id: string; reason: Reason | "" };

/** The learner's flags, kept only for objects in their room: duplicates count once, and anything else is dropped. */
export function cleanFlags(v: Pick<Variant, "objects">, raw: unknown): Selection[] {
  const seen = new Set<string>();
  const out: Selection[] = [];
  for (const x of Array.isArray(raw) ? raw : []) {
    const o = (x && typeof x === "object" ? x : { id: x }) as Record<string, unknown>;
    const id = typeof o.id === "string" ? o.id : "";
    if (!id || seen.has(id) || !v.objects.some((p) => p.id === id)) continue;
    seen.add(id);
    out.push({ id, reason: typeof o.reason === "string" && o.reason in REASONS ? (o.reason as Reason) : "" });
  }
  return out;
}
export const cleanPriority = (v: Pick<Variant, "objects">, flags: Selection[], raw: unknown) =>
  raw === "unsure" ? "unsure" : typeof raw === "string" && flags.some((f) => f.id === raw) ? raw : "";

// ---------------------------------------------------------------------------------------------
// Scoring (hazard-scorer-1)
// ---------------------------------------------------------------------------------------------

export type ItemResult = {
  id: string;
  label: string;
  area: string;
  category: HazardCategory | "";
  priority: number;
  critical: boolean;
  explain: string;
  source: string;
  reason: Reason | "";
  /** Null when no reason was given or asked for. */
  reasonFits: boolean | null;
};
export type Findings = {
  found: ItemResult[];
  /** "Worth another look": hazards not flagged, the most important first. */
  missed: ItemResult[];
  /** "Not a hazard in this context": safe items flagged. */
  mistaken: ItemResult[];
  /** Every safe item, for reviewing the scene. */
  safe: ItemResult[];
  recognition: Level;
  priority: Level;
  priorityPick: { id: string; label: string } | "unsure" | null;
  priorityNote: string;
  indiscriminate: boolean;
  missedCritical: boolean;
  notes: string[];
};

const result = (o: SceneObject, sel?: Selection): ItemResult => ({
  id: o.id,
  label: o.label,
  area: o.area,
  category: o.key.category,
  priority: o.key.priority,
  critical: o.key.critical,
  explain: o.key.explain,
  source: o.key.source,
  reason: sel?.reason ?? "",
  reasonFits: !sel?.reason || !o.key.hazard ? null : sel.reason === "unsure" || sel.reason === o.key.category,
});

/**
  Recognition credits each hazard's weight once, however it was flagged (picture or list), and takes one point off
  for each safe item flagged, so flagging everything is never an advantage. Flagging half the safe items or more, or
  missing a critical hazard, caps it at "Partly". Priority is judged on the one thing the learner would deal with first.
*/
export function scoreFindings(v: Variant, flags: Selection[], priority: string): Findings {
  const flagged = new Map(flags.map((f) => [f.id, f]));
  const hz = hazards(v);
  const sf = safes(v);
  const found = hz.filter((o) => flagged.has(o.id));
  const missed = hz.filter((o) => !flagged.has(o.id)).sort(byPriority);
  const mistaken = sf.filter((o) => flagged.has(o.id));
  const total = hz.reduce((n, o) => n + o.key.weight, 0);
  const net = Math.max(0, found.reduce((n, o) => n + o.key.weight, 0) - mistaken.length);
  const r = total ? net / total : 1;
  let recognition: Level = r >= 0.85 ? 3 : r >= 0.6 ? 2 : r >= 0.3 ? 1 : 0;
  const indiscriminate = mistaken.length >= Math.max(2, Math.ceil(sf.length / 2));
  const missedCritical = missed.some((o) => o.key.critical);
  if (indiscriminate || missedCritical) recognition = Math.min(recognition, 1) as Level;

  const top = Math.max(0, ...hz.map((o) => o.key.priority));
  const topFound = Math.max(0, ...found.map((o) => o.key.priority));
  const pick = v.objects.find((o) => o.id === priority);
  let prio: Level = 0;
  let priorityNote = "";
  if (priority === "unsure") {
    prio = 1;
    priorityNote = "You weren’t sure what comes first. That’s fair to say, and worth asking about before you start.";
  } else if (!pick || !flagged.has(pick.id)) {
    priorityNote = flags.length ? "You didn’t say what you’d deal with first." : "You didn’t flag anything, so there was nothing to put first.";
  } else if (!pick.key.hazard) {
    priorityNote = `You’d deal with “${pick.label}” first, but it isn’t a hazard in this context.`;
  } else if (pick.key.priority === top) {
    prio = 3;
    priorityNote = `“${pick.label}” is the right thing to deal with first.`;
  } else if (pick.key.priority === topFound) {
    prio = 2;
    priorityNote = `Of what you found, “${pick.label}” is the right one to put first. Something more urgent was missed.`;
  } else {
    prio = 1;
    const first = [...hz].sort(byPriority)[0];
    priorityNote = `“${pick.label}” matters, but “${first.label}” comes before it.`;
  }

  const notes: string[] = [];
  if (!flags.length) notes.push("You didn’t flag anything. There was something here that needed attention.");
  if (indiscriminate) notes.push("Many of the things you flagged aren’t hazards in this context. A careful look beats flagging everything.");
  if (missedCritical) notes.push("You missed something that has to be dealt with before you go on.");
  if (found.length === hz.length && !mistaken.length) notes.push("You found every hazard, and flagged nothing that wasn’t one.");
  return {
    found: found.map((o) => result(o, flagged.get(o.id))),
    missed: missed.map((o) => result(o)),
    mistaken: mistaken.map((o) => result(o, flagged.get(o.id))),
    safe: sf.map((o) => result(o, flagged.get(o.id))),
    recognition,
    priority: prio,
    priorityPick: priority === "unsure" ? "unsure" : pick && flagged.has(pick.id) ? { id: pick.id, label: pick.label } : null,
    priorityNote,
    indiscriminate,
    missedCritical,
    notes,
  };
}

/** The action questions as the learner sees them before answering: no verdicts, concerns or feedback. */
export type AskedDecision = { id: string; prompt: string; hazard: { id: string; label: string; found: boolean }; options: { id: string; text: string }[] };
export function askedDecisions(d: HazardScanData, v: Variant, role: SceneRole, flags: Selection[]): AskedDecision[] {
  return decisionsFor(d, v, role).map((x) => ({
    id: x.decision.id,
    prompt: x.decision.prompt,
    hazard: { id: x.object.id, label: x.object.label, found: flags.some((f) => f.id === x.object.id) },
    options: x.options.map((o) => ({ id: o.id, text: o.text })),
  }));
}

export type DebriefDecision = AskedDecision & {
  chosen: { id: string; text: string; verdict: Verdict; ignores: Concern[]; feedback: string } | null;
  best: string[];
  source: string;
};
export type Debrief = {
  findings: Findings;
  decisions: DebriefDecision[];
  levels: Record<Dim, Level>;
  dims: { dim: Dim; label: string; rating: Level; words: string; why: string }[];
  matters: string;
  mode: "practice" | "assessed";
  versions: { scene: string; scorer: string; family: string; release: string; variant: string; variantVersion: number; role: SceneRole };
};

/** An attempt, as the learner's page sees it: from the server, or computed locally in the editor's preview. */
export type ScanStatus = "new" | "active" | "found" | "submitted" | "completed";
export type ScanState = {
  flags: Selection[];
  priority: string;
  route: "image" | "list";
  routes: ("image" | "list")[];
  chosen: Record<string, string>;
  unclear: string[];
};
export const emptyScanState = (): ScanState => ({ flags: [], priority: "", route: "image", routes: [], chosen: {}, unclear: [] });
export type ScanView = {
  attemptId: string | null;
  attemptNo: number;
  status: ScanStatus;
  role: SceneRole;
  roleLabel: string;
  /** An approved variant can be given to this learner's role today. */
  available: boolean;
  variant: LearnerVariant | null;
  /** Every approved room had been seen, so this one is a repeat. */
  repeat: boolean;
  state: ScanState;
  findings: Findings | null;
  questions: AskedDecision[];
  debrief: Debrief | null;
  attempts: number;
  versions: { scene: string; scorer: string; family: string; release: string; variant: string; variantVersion: number };
};

export const cleanDecisions = (asked: { id: string; options: { id: string }[] }[], raw: unknown) => {
  const o = (raw && typeof raw === "object" ? raw : {}) as Record<string, unknown>;
  return Object.fromEntries(asked.filter((q) => q.options.some((op) => op.id === o[q.id])).map((q) => [q.id, o[q.id] as string])) as Record<string, string>;
};

/**
  The debrief: what was noticed, what was missed, what the learner would do and why it matters. Recognition and the
  action are judged apart, so someone who spots a hazard but chooses a response that ignores consent, preference, the
  care plan or the role gets action feedback of its own.
*/
export function buildDebrief(d: HazardScanData, v: Variant, role: SceneRole, flags: Selection[], priority: string, chosen: Record<string, string>): Debrief {
  const findings = scoreFindings(v, flags, priority);
  const decisions: DebriefDecision[] = decisionsFor(d, v, role).map((x) => {
    const pick = x.options.find((o) => o.id === chosen[x.decision.id]);
    return {
      id: x.decision.id,
      prompt: x.decision.prompt,
      hazard: { id: x.object.id, label: x.object.label, found: flags.some((f) => f.id === x.object.id) },
      options: x.options.map((o) => ({ id: o.id, text: o.text })),
      chosen: pick ? { id: pick.id, text: pick.text, verdict: pick.verdict, ignores: pick.ignores, feedback: pick.feedback } : null,
      best: x.options.filter((o) => o.verdict === "best").map((o) => o.text),
      source: x.decision.source,
    };
  });
  const response = (decisions.length ? Math.min(...decisions.map((x) => (x.chosen ? VERDICT_LEVEL[x.chosen.verdict] : 0))) : 0) as Level;
  const levels: Record<Dim, Level> = { recognition: findings.recognition, priority: findings.priority, response };
  const why: Record<Dim, string> = {
    recognition: [
      `You found ${findings.found.length} of ${findings.found.length + findings.missed.length} hazards.`,
      findings.mistaken.length
        ? `${findings.mistaken.length} thing${findings.mistaken.length === 1 ? "" : "s"} you flagged ${findings.mistaken.length === 1 ? "isn’t a hazard" : "aren’t hazards"} here.`
        : "",
      ...findings.notes,
    ]
      .filter(Boolean)
      .join(" "),
    priority: findings.priorityNote,
    response: decisions
      .map((x) =>
        !x.chosen
          ? `You didn’t choose a response about “${x.hazard.label}”.`
          : [
              x.hazard.found ? `You spotted “${x.hazard.label}”.` : `You didn’t flag “${x.hazard.label}”, so here it is.`,
              x.chosen.ignores.length ? `Your response: ${x.chosen.ignores.map((c) => CONCERNS[c].toLowerCase()).join("; ")}.` : "",
            ]
              .filter(Boolean)
              .join(" "),
      )
      .join(" "),
  };
  return {
    findings,
    decisions,
    levels,
    dims: DIM_ORDER.map((dim) => ({ dim, label: DIMENSIONS[dim], rating: levels[dim], words: LEVEL_WORDS[levels[dim]], why: why[dim] })),
    matters: d.debrief,
    mode: d.mode,
    versions: { scene: SCENE_VERSION, scorer: SCORER_VERSION, family: d.familyId, release: d.release, variant: v.id, variantVersion: v.version, role },
  };
}

// ---------------------------------------------------------------------------------------------
// Authoring checks, publishing and the readers' copy
// ---------------------------------------------------------------------------------------------

/** What makes the scene family unusable as written. Shown live in the editor. */
export function sceneProblems(d: HazardScanData): string[] {
  const where = `“${d.title || "Spot the Hazard"}”`;
  const out: string[] = [];
  if (!d.title) out.push(`${where} needs a title.`);
  if (!d.task || !d.person.name) out.push(`${where} needs the scene set: who you’re visiting and what you’re about to do.`);
  if (!d.roles.length) out.push(`${where}: choose at least one role the learner plays.`);
  if (!d.areas.length) out.push(`${where}: name the areas of the room, for the list route.`);
  if (!d.familyId || !d.release) out.push(`${where} needs its scene family id and release.`);
  if (d.rules.minHazards < 1 || d.rules.maxHazards < d.rules.minHazards) out.push(`${where}: the hazard count rules don’t make sense.`);
  for (const x of d.decisions) {
    if (!x.prompt) out.push(`${where}: the action “${x.id}” needs its question.`);
    if (!d.variants.some((v) => v.objects.some((o) => o.concept === x.concept && o.key.hazard)))
      out.push(`${where}: the action “${x.prompt.slice(0, 40) || x.id}” is about something no variant shows as a hazard.`);
  }
  const ids = new Set<string>();
  for (const v of d.variants) {
    if (ids.has(v.id)) out.push(`${where}: two variants share the id ${v.id}.`);
    ids.add(v.id);
  }
  return out;
}

export const sceneApproved = (d: Pick<HazardScanData, "approval">) => {
  const a = d.approval;
  return Boolean(a.quality && a.policy && a.learning && a.approvedOn);
};
/** The first release should offer a meaningful choice of rooms (PRD section 13). */
export const MIN_APPROVED = 2;

/** What "Publish anyway" can't waive (the publication preflight, PRD section 8). */
export function hazardScanHardProblems(d: HazardScanData, today: string): string[] {
  const where = `“${d.title || "Spot the Hazard"}”`;
  const out = sceneProblems(d);
  if (d.mode === "assessed")
    out.push(
      `${where} is set to an assessed check, which needs a governed Question Pool placement that isn’t built yet. Use guided practice: a practice scan never creates a pass.`,
    );
  const approved = d.variants.filter((v) => v.status === "approved");
  for (const v of approved) {
    out.push(...variantProblems(d, v, today));
    out.push(...reviewProblems(v).map((p) => `Variant “${v.label || v.id}” is marked approved, but: ${p}`));
  }
  if (approved.length < MIN_APPROVED) out.push(`${where} needs at least ${MIN_APPROVED} approved variants, so a retry can be a different room.`);
  for (const c of coverage(d, today)) if (!c.approved) out.push(`${where}: ${c.note}`);
  if (!sceneApproved(d))
    out.push(`${where}: record Quality (safety, infection and clinical claims), the policy owner and the learning reviewer (accessibility), and the date.`);
  else if (d.approval.releaseReviewed !== d.release)
    out.push(`${where}: Review required. The sign-off was for release ${d.approval.releaseReviewed || "none"}, and this is release ${d.release}.`);
  if (d.approval.reviewBy && d.approval.reviewBy < today) out.push(`${where} was due for review on ${d.approval.reviewBy}.`);
  return [...new Set(out)];
}

/** The learner's copy: the scene set and the rules, without any variant or action. Those come from the attempt API. */
export function hazardScanForReaders<T extends HazardScanData>(b: T): T {
  return { ...b, variants: [], decisions: [], debrief: "" };
}

/** Every source a scene cites, in its approved variants and actions. */
export function sourcesOf(d: HazardScanData, all = false) {
  const vs = d.variants.filter((v) => all || v.status === "approved");
  return [
    ...new Set([
      ...vs.flatMap((v) => v.objects.map((o) => o.key.source)),
      ...d.decisions.filter((x) => vs.some((v) => v.objects.some((o) => o.concept === x.concept))).map((x) => x.source),
    ]),
  ].filter(Boolean);
}

// ---------------------------------------------------------------------------------------------
// Reading a block from stored JSON
// ---------------------------------------------------------------------------------------------

type Raw = Record<string, unknown>;
export type ParseHelpers = {
  str: (v: unknown, where: string, opts?: { required?: boolean; max?: number }) => string | undefined;
  unfinished: (problem: string) => void;
};
const obj = (v: unknown): Raw => (v && typeof v === "object" && !Array.isArray(v) ? (v as Raw) : {});
const arr = (v: unknown): unknown[] => (Array.isArray(v) ? v : []);
const s = (v: unknown, max = 600) => (typeof v === "string" ? v.slice(0, max) : "");
const ID = /^[a-z0-9][a-z0-9-]{0,47}$/;
const id = (v: unknown, d: string) => (typeof v === "string" && ID.test(v) ? v : d);
const num = (v: unknown, min: number, max: number, d: number) =>
  Number.isFinite(Number(v)) && v !== "" && v !== null ? Math.min(max, Math.max(min, Number(v))) : d;
const date = (v: unknown) => (typeof v === "string" && /^\d{4}-\d{2}-\d{2}$/.test(v) ? v : "");
const roles = (v: unknown) => [...new Set(arr(v).filter((r): r is SceneRole => typeof r === "string" && r in SCENE_ROLES))];
const pick = <T extends string | number>(v: unknown, list: readonly T[], d: T): T => (list.includes(v as T) ? (v as T) : d);

function parseObject(x: unknown, k: number): SceneObject {
  const o = obj(x);
  const kind = pick(o.kind, Object.keys(OBJECT_KINDS) as ObjectKind[], "plant");
  const k2 = obj(o.key);
  const h = obj(o.hit);
  const hazard = k2.hazard === true;
  return {
    id: id(o.id, `object-${k + 1}`),
    concept: id(o.concept, id(o.id, `object-${k + 1}`)),
    kind,
    look: pick(o.look, OBJECT_KINDS[kind].looks as readonly string[], OBJECT_KINDS[kind].looks[0]),
    x: num(o.x, 0, 100, 50),
    y: num(o.y, 0, 100, 50),
    scale: num(o.scale, 0.4, 2.5, 1),
    hit: { w: num(h.w, 2, 60, 12), h: num(h.h, 2, 60, 14) },
    area: id(o.area, ""),
    label: s(o.label, 80),
    description: s(o.description, 400),
    key: {
      hazard,
      category: hazard ? pick(k2.category, Object.keys(CATEGORIES) as HazardCategory[], "other") : "",
      priority: hazard ? pick(k2.priority, [1, 2, 3] as const, 1) : 0,
      critical: hazard && k2.critical === true,
      weight: pick(k2.weight, [1, 2, 3] as const, 1),
      feature: s(k2.feature, 400),
      explain: s(k2.explain, 900),
      source: id(k2.source, ""),
    },
  };
}

function parseVariant(x: unknown, k: number): Variant {
  const v = obj(x);
  const r = obj(v.review);
  return {
    id: id(v.id, `variant-${k + 1}`),
    version: Math.max(1, Math.floor(num(v.version, 1, 9999, 1))),
    label: s(v.label, 80),
    roles: roles(v.roles),
    dim: v.dim === true,
    status: pick(v.status, ["draft", "review", "approved", "retired"] as const, "draft"),
    objects: arr(v.objects).slice(0, 16).map(parseObject),
    review: {
      reviewer: s(r.reviewer, 120),
      reviewedOn: date(r.reviewedOn),
      objects: r.objects === true,
      locations: r.locations === true,
      risks: r.risks === true,
      actions: r.actions === true,
      sources: r.sources === true,
      rendering: r.rendering === true,
      note: s(r.note, 600),
    },
  };
}

export function parseHazardScan(o: Raw, where: string, h: ParseHelpers): HazardScanData {
  const { str, unfinished } = h;
  const p = obj(o.person);
  const ru = obj(o.rules);
  const ap = obj(o.approval);
  const data: HazardScanData = {
    title: str(o.title, `${where} title`, { required: true, max: 120 }) ?? "",
    intro: str(o.intro, `${where} introduction`, { max: 600 }) ?? "",
    familyId: id(o.familyId, ""),
    release: s(o.release, 20) || "1",
    mode: o.mode === "assessed" ? "assessed" : "practice",
    roles: roles(o.roles),
    room: pick(o.room, Object.keys(ROOMS) as RoomId[], "bedroom-hall"),
    objective: s(o.objective, 400),
    person: { name: s(p.name, 60), about: s(p.about, 800) },
    carePlan: s(o.carePlan, 800),
    task: s(o.task, 600),
    areas: arr(o.areas)
      .slice(0, 8)
      .map((x, k) => ({ id: id(obj(x).id, `area-${k + 1}`), label: s(obj(x).label, 80) }))
      .filter((a) => a.label),
    askReason: o.askReason !== false,
    rules: {
      minHazards: Math.floor(num(ru.minHazards, 1, 8, 2)),
      maxHazards: Math.floor(num(ru.maxHazards, 1, 10, 4)),
      minSafe: Math.floor(num(ru.minSafe, 0, 10, 3)),
      minHigh: Math.floor(num(ru.minHigh, 0, 4, 1)),
      decisions: ru.decisions === 2 ? 2 : 1,
    },
    variants: arr(o.variants).slice(0, 8).map(parseVariant),
    decisions: arr(o.decisions)
      .slice(0, 12)
      .map((x, k) => {
        const v = obj(x);
        return {
          id: id(v.id, `action-${k + 1}`),
          concept: id(v.concept, ""),
          prompt: s(v.prompt, 300),
          source: id(v.source, ""),
          // Responses for every role share one list, so it's longer than a single question's.
          options: arr(v.options)
            .slice(0, 12)
            .map((y, j) => {
              const op = obj(y);
              return {
                id: id(op.id, `option-${j + 1}`),
                text: s(op.text, 400),
                roles: roles(op.roles),
                verdict: pick(op.verdict, ["best", "acceptable", "unsafe"] as const, "unsafe"),
                ignores: [...new Set(arr(op.ignores).filter((c): c is Concern => typeof c === "string" && c in CONCERNS))],
                feedback: s(op.feedback, 900),
              };
            }),
        };
      }),
    jobAids: arr(o.jobAids)
      .slice(0, 3)
      .map((x) => ({ snippetId: s(obj(x).snippetId, 80), why: s(obj(x).why, 300) }))
      .filter((x) => x.snippetId),
    debrief: s(o.debrief, 1200),
    approval: {
      quality: s(ap.quality, 120),
      policy: s(ap.policy, 120),
      learning: s(ap.learning, 120),
      approvedOn: date(ap.approvedOn),
      reviewBy: date(ap.reviewBy),
      releaseReviewed: s(ap.releaseReviewed, 20),
    },
  };
  if (!data.variants.length) unfinished(`${where} needs at least one room variant.`);
  return data;
}

/** A new, empty variant to draw in. */
export const blankVariant = (vid: string, label: string): Variant => ({
  id: vid,
  version: 1,
  label,
  roles: [],
  dim: false,
  status: "draft",
  objects: [],
  review: blankReview(),
});
