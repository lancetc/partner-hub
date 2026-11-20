import { BLOCK_REGISTRY, contractFor, EVIDENCE, type ActivityContract, type LearnerAction } from "./blockRegistry";

/*
  Story Plans, recurring characters and check-ins (docs/story-plans.md).

  A fictional learning case history, kept apart from any client record, complaint, incident or care plan. The
  rules everything else leans on:

  - A character's shared story (canon) is an approved profile and approved episodes. Nothing a learner does in a
    practice activity changes it, and nothing a model suggests becomes canon without a person approving it.
  - In-story order (an episode's `seq`) is separate from when anything was published. A history is read "up to
    the story so far" for where the learner is; later episodes stay behind a spoiler control.
  - A story moment (Ava's opening transmission, new information, a person's response, a debrief, a later
    check-in) is one typed, versioned record. A placement pins the exact approved revision it shows, so editing
    a script never changes what an existing Topic or Magazine page says.
  - Opening a check-in, playing audio or watching a transmission is engagement. It is never a completion, an
    attempt or evidence of anything.
*/

export const AUDIENCES = { partner: "Care Partners", coordinator: "Care Coordinators", staff: "Trilogy Care staff" } as const;
export type Audience = keyof typeof AUDIENCES;
export const PROVENANCE = { fictional: "Fictional", composite: "Reviewed composite" } as const;
export type Provenance = keyof typeof PROVENANCE;
export const CAST_ROLES = { focus: "Focus", supporting: "Supporting", mention: "Brief mention" } as const;
export type CastRole = keyof typeof CAST_ROLES;
export const STORY_STATUS = { draft: "Draft", approved: "Approved", retired: "Retired" } as const;
export type StoryStatus = keyof typeof STORY_STATUS;

// ---------------------------------------------------------------------------------------------
// Character canon
// ---------------------------------------------------------------------------------------------

export type Fact = { id: string; text: string; source: string };
export type Relationship = { id: string; name: string; relation: string; note: string };
export type Profile = {
  provenance: Provenance;
  pronouns: string;
  /** Their part in stories: "An older person living at home", "A care coordinator and the stories' host". */
  narrativeRole: string;
  summary: string;
  matters: string;
  relationships: Relationship[];
  facts: Fact[];
  /** How to write and voice them, and what to avoid. */
  portrayal: string;
  /** The approved look: face, clothing, props, settings. */
  visual: string;
  /** What they must never be shown claiming without review. */
  never: string;
  voice: { id: string; name: string; reason: string };
};
export const emptyProfile = (): Profile => ({
  provenance: "fictional",
  pronouns: "",
  narrativeRole: "",
  summary: "",
  matters: "",
  relationships: [],
  facts: [],
  portrayal: "",
  visual: "",
  never: "",
  voice: { id: "", name: "", reason: "" },
});

const str = (v: unknown, max: number) => (typeof v === "string" ? v.trim().slice(0, max) : "");
const obj = (v: unknown) => (v && typeof v === "object" && !Array.isArray(v) ? (v as Record<string, unknown>) : {});
const list = (v: unknown, max: number) => (Array.isArray(v) ? v.slice(0, max) : []);
const sid = (v: unknown, fallback: string) => (typeof v === "string" && /^[\w-]{1,40}$/.test(v) ? v : fallback);

export function cleanProfile(raw: unknown): Profile {
  const o = obj(raw);
  const voice = obj(o.voice);
  return {
    provenance: o.provenance === "composite" ? "composite" : "fictional",
    pronouns: str(o.pronouns, 40),
    narrativeRole: str(o.narrativeRole, 160),
    summary: str(o.summary, 600),
    matters: str(o.matters, 400),
    relationships: list(o.relationships, 12)
      .map((x, i) => {
        const r = obj(x);
        return { id: sid(r.id, `r${i + 1}`), name: str(r.name, 80), relation: str(r.relation, 60), note: str(r.note, 200) };
      })
      .filter((r) => r.name && r.relation),
    facts: list(o.facts, 30)
      .map((x, i) => {
        const f = obj(x);
        return { id: sid(f.id, `f${i + 1}`), text: str(f.text, 300), source: str(f.source, 200) };
      })
      .filter((f) => f.text),
    portrayal: str(o.portrayal, 800),
    visual: str(o.visual, 600),
    never: str(o.never, 400),
    // A provider voice id, or one of OpenAI's named voices. Anything else is dropped.
    voice: {
      id: typeof voice.id === "string" && (/^[A-Za-z0-9]{8,40}$/.test(voice.id) || /^openai:[a-z]{2,20}$/.test(voice.id)) ? voice.id : "",
      name: str(voice.name, 80),
      reason: str(voice.reason, 300),
    },
  };
}

/** What a profile needs before it can be approved as shared canon. */
export function profileProblems(p: Profile): string[] {
  const out: string[] = [];
  if (p.summary.length < 20) out.push("Say who this person is, in a sentence or two.");
  if (!p.narrativeRole) out.push("Say what part they play in stories.");
  if (!p.matters) out.push("Say what matters to them: a person is more than the problem a course needs.");
  if (!p.facts.length) out.push("Add at least one approved fact for stories to stay consistent with.");
  return out;
}

/** What changed between the approved profile and the draft, in words an editor can check against live placements. */
export function profileChanges(approved: Profile | null, draft: Profile): string[] {
  if (!approved) return [];
  const out: string[] = [];
  const was = new Map(approved.facts.map((f) => [f.id, f.text]));
  for (const f of draft.facts) {
    if (!was.has(f.id)) out.push(`New fact: ${f.text}`);
    else if (was.get(f.id) !== f.text) out.push(`Fact changed: “${was.get(f.id)}” becomes “${f.text}”`);
  }
  for (const f of approved.facts) if (!draft.facts.some((d) => d.id === f.id)) out.push(`Fact removed: ${f.text}`);
  const rel = (r: Relationship) => `${r.name} (${r.relation})`;
  const before = new Set(approved.relationships.map(rel));
  const after = new Set(draft.relationships.map(rel));
  for (const r of after) if (!before.has(r)) out.push(`New relationship: ${r}`);
  for (const r of before) if (!after.has(r)) out.push(`Relationship removed: ${r}`);
  if (approved.summary !== draft.summary) out.push("The summary has changed.");
  if (approved.matters !== draft.matters) out.push("What matters to them has changed.");
  if (approved.voice.id !== draft.voice.id) out.push(`Voice changed${draft.voice.reason ? `: ${draft.voice.reason}` : ". Record why."}`);
  return out;
}

// ---------------------------------------------------------------------------------------------
// Episodes and history
// ---------------------------------------------------------------------------------------------

export type Episode = {
  id: string;
  title: string;
  /** A short summary that makes sense on its own and gives away nothing later. */
  summary: string;
  /** In-story time, in words: "A few weeks later". */
  whenLabel: string;
  /** In-story order. Nothing to do with when anything was published. */
  seq: number;
  people: { characterId: string; role: CastRole }[];
  /** What is different afterwards. */
  changes: string;
  source: string;
  status: StoryStatus;
};

export const FORMATS = { topic: "Topic", course: "Magazine course", page: "Magazine page", other: "Elsewhere in the Hub" } as const;
export type AppearanceKind = keyof typeof FORMATS;
export type HistoryItem = {
  id: string;
  episodeId: string;
  seq: number;
  whenLabel: string;
  title: string;
  summary: string;
  format: string;
  href: string;
  role: CastRole;
};

/** A character's history up to where the learner is in the story, with anything later held back. */
export function splitHistory(items: HistoryItem[], contextSeq: number | null) {
  const sorted = [...items].sort((a, b) => a.seq - b.seq || a.title.localeCompare(b.title));
  if (contextSeq === null) return { upTo: sorted, later: [] as HistoryItem[] };
  return { upTo: sorted.filter((i) => i.seq <= contextSeq), later: sorted.filter((i) => i.seq > contextSeq) };
}

// ---------------------------------------------------------------------------------------------
// Story moments
// ---------------------------------------------------------------------------------------------

export const MOMENT_KINDS = {
  opening_transmission: "Opening transmission",
  new_information: "New information",
  person_response: "Person’s response",
  debrief: "Debrief",
  check_in: "Later check-in",
} as const;
export type MomentKind = keyof typeof MOMENT_KINDS;
export const MOMENT_HINTS: Record<MomentKind, string> = {
  opening_transmission: "The host sets the scene and states the first decision, then a story event cuts the transmission off.",
  new_information: "Something arrives that changes the problem: a call back, a note, a missing detail. The judgement stays with the learner.",
  person_response: "The person says, in their own words, how an action landed for them.",
  debrief: "What was first assumed, what changed, and the action to take at work.",
  check_in: "A later, approved update the learner can open if they want to, with a few authored questions.",
};

export type TransmissionBeats = { greeting: string; backstory: string; problem: string; instruction: string; interruption: string };
export const BEAT_PROMPTS: Record<keyof TransmissionBeats, { label: string; hint: string }> = {
  greeting: { label: "Greeting", hint: "A brief hello and where she’s transmitting from. Skip the full introduction for people who’ve met her." },
  backstory: {
    label: "Relevant backstory",
    hint: "One or two approved facts about the person and what matters to them. A small piece of her own history, if it adds meaning.",
  },
  problem: { label: "Present problem", hint: "The work situation and what’s uncertain. Don’t give away the answer." },
  instruction: {
    label: "Learner instruction",
    hint: "Exactly what the learner will do when the transmission ends. This also shows as text with the activity.",
  },
  interruption: {
    label: "Interruption and hand-off",
    hint: "A plausible story event at the moment of decision: a call, a message, someone at the door. Never an invented emergency.",
  },
};
export type Question = { id: string; label: string; answer: string };
export type MomentVideo = { src: string; poster: string; captions: string; endFrame: string; checked: boolean };
export type MomentData = {
  /** A working title authors see. */
  title: string;
  whenLabel: string;
  /** Why this placement helps the target behaviour. */
  purpose: string;
  newInfo: string;
  /** Who the learner is at the hand-off: the coordinator making the call, an observer, a colleague reviewing. */
  role: string;
  /** What the speaker says. For an opening transmission the script is its beats, in order. */
  text: string;
  beats: TransmissionBeats;
  /** What the learner does next: the Begin button and the text instruction. */
  nextAction: string;
  questions: Question[];
  source: string;
  video: MomentVideo;
  /** A response that depends on what the learner chose: a practice-story consequence, never shared canon. */
  hypothetical: boolean;
};
export const emptyMoment = (): MomentData => ({
  title: "",
  whenLabel: "",
  purpose: "",
  newInfo: "",
  role: "",
  text: "",
  beats: { greeting: "", backstory: "", problem: "", instruction: "", interruption: "" },
  nextAction: "",
  questions: [],
  source: "",
  video: { src: "", poster: "", captions: "", endFrame: "", checked: false },
  hypothetical: false,
});
/** Site media only: an upload or a shipped image. */
const media = (v: unknown) => (typeof v === "string" && /^\/(api\/uploads|images)\/[\w.\-/]+$/.test(v) ? v : "");

export function cleanMoment(raw: unknown): MomentData {
  const o = obj(raw);
  const b = obj(o.beats);
  const v = obj(o.video);
  return {
    title: str(o.title, 120),
    whenLabel: str(o.whenLabel, 80),
    purpose: str(o.purpose, 400),
    newInfo: str(o.newInfo, 400),
    role: str(o.role, 200),
    text: str(o.text, 1200),
    beats: {
      greeting: str(b.greeting, 300),
      backstory: str(b.backstory, 400),
      problem: str(b.problem, 400),
      instruction: str(b.instruction, 300),
      interruption: str(b.interruption, 300),
    },
    nextAction: str(o.nextAction, 120),
    questions: list(o.questions, 4)
      .map((x, i) => {
        const q = obj(x);
        return { id: sid(q.id, `q${i + 1}`), label: str(q.label, 120), answer: str(q.answer, 800) };
      })
      .filter((q) => q.label || q.answer),
    source: str(o.source, 300),
    video: { src: media(v.src), poster: media(v.poster), captions: media(v.captions), endFrame: media(v.endFrame), checked: v.checked === true },
    hypothetical: o.hypothetical === true,
  };
}

/** The words spoken, exactly as they'll be shown: the transcript, and what a voice reads. */
export function scriptOf(kind: MomentKind, d: MomentData) {
  if (kind !== "opening_transmission") return d.text;
  return (["greeting", "backstory", "problem", "instruction", "interruption"] as const)
    .map((k) => d.beats[k])
    .filter(Boolean)
    .join(" ");
}

/** What stops a moment being approved. The script and its spoken form are approved together, so text comes first. */
export function momentProblems(kind: MomentKind, d: MomentData, ctx: { speakerApproved: boolean; episodeApproved: boolean | null }): string[] {
  const out: string[] = [];
  const script = scriptOf(kind, d);
  if (!ctx.speakerApproved) out.push("The speaker’s story profile isn’t approved yet.");
  if (ctx.episodeApproved === false) out.push("The episode this belongs to isn’t approved yet.");
  if (script.length < 10) out.push("Write what they say.");
  if (script.length > 1200) out.push("Keep the script under 1,200 characters: a moment is short.");
  if (d.purpose.length < 10) out.push("Say why this moment belongs here: what it does for the learner’s decision.");
  if (kind === "opening_transmission") {
    if (!d.beats.instruction) out.push("Give the learner instruction: what they do when the transmission ends.");
    if (!d.beats.interruption) out.push("Write the interruption that hands over to the learner.");
    if (!d.nextAction) out.push("Name the next action for the Begin button.");
    if (!d.role) out.push("Say who the learner is at the hand-off.");
    if (d.video.src) {
      if (!d.video.poster) out.push("Choose the still poster that appears after the transmission.");
      if (!d.video.captions) out.push("Add captions for the video.");
      if (!d.video.checked) out.push("Confirm the video matches the approved script, and that the poster is the same person.");
    }
  }
  if (kind === "new_information" && !d.newInfo) out.push("Say what new information this brings.");
  if (kind === "check_in") {
    if (!d.whenLabel) out.push("Say when this is in the story, in words: “A few weeks later”.");
    for (const q of d.questions) if (!q.label || q.answer.length < 5) out.push("Every question needs its wording and an approved answer.");
  }
  return [...new Set(out)];
}

// ---------------------------------------------------------------------------------------------
// The opening transmission's stage
// ---------------------------------------------------------------------------------------------

/**
  Timings, in milliseconds. The empty stage lasts a full three seconds and is measured from when the video frame
  has gone, not from when the video ended.
*/
export const TX = { openStatic: 500, endFlash: 300, fadeOut: 200, hold: 3000, posterFade: 500 } as const;
export type TxState = "ready" | "static" | "playing" | "flash" | "hiding" | "empty" | "poster" | "begun";
export type TxEvent = "play" | "static_done" | "ended" | "flash_done" | "hidden" | "hold_done" | "skip_wait" | "settle" | "skip" | "fail" | "replay" | "begin";

/**
  One controller for the whole sequence: ready → opening static → playing → end flash → frame hides → empty stage
  → poster → begun. With reduced motion there's no static, flash, fade or wait. An event that doesn't belong to
  the current state (a second `ended`, a late timer) changes nothing.
*/
export function txNext(state: TxState, event: TxEvent, reduced = false): TxState {
  // Skipping, or media that won't play, goes straight to the instruction and the activity: no forced wait.
  if (event === "skip" || event === "fail") return "begun";
  if (event === "replay") return state === "poster" || state === "begun" ? (reduced ? "playing" : "static") : state;
  switch (state) {
    case "ready":
      return event === "play" ? (reduced ? "playing" : "static") : state;
    case "static":
      return event === "static_done" ? "playing" : state;
    case "playing":
      return event === "ended" ? (reduced ? "poster" : "flash") : state;
    case "flash":
      return event === "flash_done" ? "hiding" : event === "settle" ? "poster" : state;
    case "hiding":
      return event === "hidden" ? "empty" : event === "settle" ? "poster" : state;
    case "empty":
      return event === "hold_done" || event === "skip_wait" || event === "settle" ? "poster" : state;
    case "poster":
      return event === "begin" ? "begun" : state;
    default:
      return state;
  }
}
/** The states that end by themselves: how long each lasts, and the event that ends it. */
export function txTimer(state: TxState): { ms: number; event: TxEvent } | null {
  if (state === "static") return { ms: TX.openStatic, event: "static_done" };
  if (state === "flash") return { ms: TX.endFlash, event: "flash_done" };
  if (state === "hiding") return { ms: TX.fadeOut, event: "hidden" };
  if (state === "empty") return { ms: TX.hold, event: "hold_done" };
  return null;
}

// ---------------------------------------------------------------------------------------------
// Story Plans
// ---------------------------------------------------------------------------------------------

export const PLAN_MODES = { story: "Plan a story", example: "Use a short example", none: "Continue without a story" } as const;
export type PlanMode = keyof typeof PLAN_MODES;
export const PLAN_TARGETS = { topic: "Topic", course: "Magazine course", guide: "Single-page guide" } as const;
export type PlanTarget = keyof typeof PLAN_TARGETS;
export const BEAT_KINDS = {
  goal: "Person’s goal",
  situation: "Work situation",
  clue: "Complication or clue",
  choice: "Learner choice",
  consequence: "Consequence and feedback",
  perspective: "Another perspective or changed situation",
  transfer: "Transfer to work",
} as const;
export type BeatKind = keyof typeof BEAT_KINDS;
export const BEAT_EVIDENCE = { explanation: "Explanation", practice: "Unscored practice", assessment: "Approved assessment" } as const;
export type Beat = {
  id: string;
  kind: BeatKind;
  text: string;
  characterId: string;
  episodeId: string;
  /** What the learner does at this beat. Empty for a beat that's only read or heard. */
  action: string;
  source: string;
  blocks: string[];
  evidence: keyof typeof BEAT_EVIDENCE;
  /** A consequence that depends on the learner's choice: it stays inside their attempt. */
  hypothetical: boolean;
  momentIds: string[];
};
export type PlanData = {
  mode: PlanMode;
  target: PlanTarget;
  audience: Audience | "";
  purpose: string;
  /** The continuing character, "" for none, or "new" for one still to be written. */
  anchorId: string;
  /** Why this character, when the author chose against the suggestion. */
  anchorNote: string;
  perspective: string;
  tension: string;
  decision: string;
  effect: string;
  transfer: string;
  sources: string;
  checkin: string;
  ava: string;
  beats: Beat[];
  /** Continuity warnings an editor has answered, by warning id. */
  resolved: Record<string, string>;
};
export const emptyPlan = (): PlanData => ({
  mode: "story",
  target: "course",
  audience: "",
  purpose: "",
  anchorId: "",
  anchorNote: "",
  perspective: "",
  tension: "",
  decision: "",
  effect: "",
  transfer: "",
  sources: "",
  checkin: "",
  ava: "",
  beats: [],
  resolved: {},
});

export function cleanPlan(raw: unknown): PlanData {
  const o = obj(raw);
  const resolved: Record<string, string> = {};
  for (const [k, v] of Object.entries(obj(o.resolved)).slice(0, 40)) if (/^[\w:.-]{1,80}$/.test(k) && str(v, 300)) resolved[k] = str(v, 300);
  return {
    mode: o.mode === "example" || o.mode === "none" ? o.mode : "story",
    target: o.target === "topic" || o.target === "guide" ? o.target : "course",
    audience: typeof o.audience === "string" && o.audience in AUDIENCES ? (o.audience as Audience) : "",
    purpose: str(o.purpose, 600),
    anchorId: o.anchorId === "new" ? "new" : sid(o.anchorId, ""),
    anchorNote: str(o.anchorNote, 300),
    perspective: str(o.perspective, 300),
    tension: str(o.tension, 600),
    decision: str(o.decision, 400),
    effect: str(o.effect, 600),
    transfer: str(o.transfer, 600),
    sources: str(o.sources, 600),
    checkin: str(o.checkin, 400),
    ava: str(o.ava, 600),
    beats: list(o.beats, 14).map((x, i) => {
      const b = obj(x);
      return {
        id: sid(b.id, `beat${i + 1}`),
        kind: typeof b.kind === "string" && b.kind in BEAT_KINDS ? (b.kind as BeatKind) : "situation",
        text: str(b.text, 600),
        characterId: sid(b.characterId, ""),
        episodeId: sid(b.episodeId, ""),
        action: str(b.action, 300),
        source: str(b.source, 300),
        // Only blocks the Hub really has.
        blocks: list(b.blocks, 4).filter((t): t is string => typeof t === "string" && Boolean(contractFor(t))),
        evidence: b.evidence === "practice" || b.evidence === "assessment" ? b.evidence : "explanation",
        hypothetical: b.hypothetical === true,
        momentIds: list(b.momentIds, 4).filter((m): m is string => typeof m === "string" && /^[\w-]{1,40}$/.test(m)),
      };
    }),
    resolved,
  };
}

/** The optional beats in their usual order, as a starting storyboard an author reorders or trims. */
export const starterBeats = (): Beat[] =>
  (Object.keys(BEAT_KINDS) as BeatKind[]).map((kind, i) => ({
    id: `beat${i + 1}`,
    kind,
    text: "",
    characterId: "",
    episodeId: "",
    action: "",
    source: "",
    blocks: [],
    evidence: kind === "choice" ? "practice" : "explanation",
    hypothetical: kind === "consequence",
    momentIds: [],
  }));

// ---------------------------------------------------------------------------------------------
// Finding a fitting character
// ---------------------------------------------------------------------------------------------

const STOP = new Set([
  "the",
  "and",
  "for",
  "with",
  "that",
  "this",
  "from",
  "their",
  "they",
  "what",
  "when",
  "into",
  "each",
  "before",
  "after",
  "are",
  "not",
  "can",
  "how",
  "her",
  "his",
  "she",
  "who",
  "has",
  "have",
  "will",
  "about",
  "while",
  "still",
]);
const stems = (s: string) =>
  new Set(
    s
      .toLowerCase()
      .split(/[^a-z]+/)
      .filter((w) => w.length > 2 && !STOP.has(w))
      .map((w) => w.replace(/(ing|ed|es|s)$/, "")),
  );
const overlap = (a: Set<string>, b: Set<string>) => [...a].filter((w) => b.has(w)).length;

export type CastMember = {
  id: string;
  name: string;
  /** A practitioner who hosts or works in the stories (a coordinator, a worker), as against someone a story happens to. */
  host: boolean;
  /** Has an approved story profile. */
  approved: boolean;
  /** Who may see them. Empty is everyone. */
  audience: Audience[];
  profile: Profile;
  /** Approved episodes they're in, in story order. */
  episodes: Episode[];
  appearances: number;
};
export type StoryBrief = { behaviour: string; situation: string; tension: string; audience: Audience | "" };
export type Suggestion = { id: string; name: string; score: number; reasons: string[]; tensions: string[] };
/** More appearances than this and a familiar face starts collecting every problem the Hub has. */
export const CATCH_ALL = 6;

/**
  Characters for a brief: filtered first (approved, and allowed for the audience), then ranked on how their approved
  story connects to the behaviour and whether a next development is believable. Each comes with its reasons and any
  tension. Never ranked on novelty, and an unrelated character is flagged, not dressed up as a fit.
*/
export function suggestCharacters(brief: StoryBrief, cast: CastMember[]) {
  const want = stems(`${brief.behaviour} ${brief.situation} ${brief.tension}`);
  const withheld: { id: string; name: string; reason: string }[] = [];
  const fits: Suggestion[] = [];
  for (const c of cast) {
    if (!c.approved) {
      withheld.push({ id: c.id, name: c.name, reason: "No approved story profile yet." });
      continue;
    }
    if (brief.audience && c.audience.length && !c.audience.includes(brief.audience)) {
      withheld.push({ id: c.id, name: c.name, reason: `Not approved for ${AUDIENCES[brief.audience]}.` });
      continue;
    }
    const reasons: string[] = [];
    const tensions: string[] = [];
    let score = 0;
    const facts = c.profile.facts.filter((f) => overlap(stems(f.text), want) > 0);
    if (facts.length) {
      score += 3 * facts.length;
      reasons.push(
        `Approved facts that connect: ${facts
          .slice(0, 2)
          .map((f) => `“${f.text}”`)
          .join("; ")}.`,
      );
    }
    const matters = overlap(stems(c.profile.matters), want);
    if (matters) {
      score += 2 * matters;
      reasons.push(`What matters to ${c.name} bears on this: ${c.profile.matters}`);
    }
    const eps = c.episodes.filter((e) => overlap(stems(`${e.title} ${e.summary} ${e.changes}`), want) > 0);
    if (eps.length) {
      score += 2 * eps.length;
      reasons.push(`Builds on an approved episode: “${eps[eps.length - 1].title}”. A return should show what’s changed, not repeat it.`);
    } else if (c.episodes.length)
      reasons.push(`${c.name} has ${c.episodes.length} approved ${c.episodes.length === 1 ? "episode" : "episodes"} to stay consistent with.`);
    // The anchor is the person it's happening to. A host can open or close a story, but isn't its subject.
    if (c.host) {
      score -= 100;
      tensions.push(`${c.name} is a practitioner in the stories: a good voice to open or close this one, but it needs someone it’s happening to.`);
    } else if (!score) tensions.push(`Nothing in ${c.name}’s approved story connects to this behaviour. A new or supporting character may serve it better.`);
    if (c.appearances >= CATCH_ALL) {
      score -= 3;
      tensions.push(`${c.name} already appears in ${c.appearances} places. Another problem attached to the same person may stop being believable.`);
    }
    fits.push({ id: c.id, name: c.name, score, reasons, tensions });
  }
  fits.sort((a, b) => b.score - a.score || a.name.localeCompare(b.name));
  return { fits, withheld };
}

// ---------------------------------------------------------------------------------------------
// Checking continuity
// ---------------------------------------------------------------------------------------------

export type Warning = { id: string; level: "block" | "warn"; text: string };
const RELATIONS = "son|daughter|husband|wife|partner|brother|sister|granddaughter|grandson|niece|nephew|neighbour|friend|cleaner|carer|doctor";

/**
  What an editor should look at before a plan goes further. A blocked item (an audience the character isn't approved
  for) has to be fixed; a warning can be answered with a correction or a recorded explanation.
*/
export function continuityCheck(
  plan: PlanData,
  cast: CastMember[],
  episodes: Episode[],
  moments: { id: string; kind: MomentKind; status: StoryStatus }[],
): Warning[] {
  const out: Warning[] = [];
  if (plan.mode === "none") return out;
  const byId = new Map(cast.map((c) => [c.id, c]));
  const used = [...new Set([plan.anchorId, ...plan.beats.map((b) => b.characterId)].filter((x) => x && x !== "new"))];
  const text = [
    plan.purpose,
    plan.tension,
    plan.decision,
    plan.effect,
    plan.transfer,
    plan.checkin,
    plan.ava,
    ...plan.beats.map((b) => `${b.text} ${b.action}`),
  ].join(" \n ");

  for (const id of used) {
    const c = byId.get(id);
    if (!c) continue;
    if (!c.approved)
      out.push({
        id: `unapproved:${id}`,
        level: "warn",
        text: `${c.name}’s story profile isn’t approved. What the plan says about them is a proposal until it is.`,
      });
    if (plan.audience && c.audience.length && !c.audience.includes(plan.audience))
      out.push({
        id: `audience:${id}`,
        level: "block",
        text: `${c.name} isn’t approved for ${AUDIENCES[plan.audience]}. Choose another character or change the audience.`,
      });
    // A relationship the plan leans on that the approved profile doesn't have.
    const safe = c.name.replace(/[^\w ]/g, "");
    for (const m of text.matchAll(new RegExp(`${safe}[’']s (${RELATIONS})\\b`, "gi"))) {
      const rel = m[1].toLowerCase();
      if (!c.profile.relationships.some((r) => r.relation.toLowerCase().includes(rel)))
        out.push({
          id: `relation:${id}:${rel}`,
          level: "warn",
          text: `The plan mentions ${c.name}’s ${rel}, who isn’t in the approved profile. Propose it as a new fact for the steward, or change the plan.`,
        });
    }
    if (c.appearances >= CATCH_ALL)
      out.push({
        id: `catchall:${id}`,
        level: "warn",
        text: `${c.name} already appears in ${c.appearances} places. Check this is still one believable life, not a collection of problems.`,
      });
  }

  // Story order: the beats shouldn't run backwards through approved episodes without saying so.
  const seq = new Map(episodes.map((e) => [e.id, e]));
  let last: Episode | null = null;
  for (const b of plan.beats) {
    const e = seq.get(b.episodeId);
    if (!e) continue;
    if (e.status !== "approved")
      out.push({ id: `episode:${e.id}`, level: "warn", text: `“${e.title}” isn’t an approved episode yet, so nothing in it is shared history.` });
    if (last && e.seq < last.seq)
      out.push({
        id: `order:${b.id}`,
        level: "warn",
        text: `“${e.title}” happens before “${last.title}” in the story, but comes after it in this plan. Say so in the beat, or reorder.`,
      });
    last = e;
  }

  if (plan.mode === "story") {
    const kinds = plan.beats.map((b) => b.kind);
    const choice = kinds.indexOf("choice");
    if (choice < 0)
      out.push({ id: "no-choice", level: "warn", text: "There’s no learner choice. Without one the story is something to read, not something to practise." });
    else if (!kinds.slice(choice + 1).includes("consequence"))
      out.push({ id: "no-consequence", level: "warn", text: "The learner makes a choice and the story never shows what came of it." });
    if (!kinds.includes("transfer") && !plan.transfer)
      out.push({
        id: "no-transfer",
        level: "warn",
        text: "Nothing carries this to the learner’s own work: add a related situation, a job aid or a next action.",
      });
    for (const b of plan.beats)
      if (b.kind === "consequence" && !b.hypothetical && !b.episodeId)
        out.push({
          id: `canon:${b.id}`,
          level: "warn",
          text: "A consequence that isn’t tied to an approved episode is a branch in one learner’s practice. Mark it hypothetical, or propose an episode for the steward.",
        });
  }
  if (!plan.sources)
    out.push({
      id: "no-source",
      level: "warn",
      text: "No approved source is named for the facts and procedure. Needs author or source: the story supplies no new rule.",
    });

  const known = new Map(moments.map((m) => [m.id, m]));
  const placed = plan.beats.flatMap((b, i) => b.momentIds.map((id) => ({ id, i })));
  for (const p of placed) {
    const m = known.get(p.id);
    if (!m) continue;
    if (m.status !== "approved")
      out.push({ id: `moment:${m.id}`, level: "warn", text: `A ${MOMENT_KINDS[m.kind].toLowerCase()} in this plan isn’t approved yet.` });
    if (m.kind === "opening_transmission" && placed.some((q) => q.i < p.i))
      out.push({ id: `opening:${m.id}`, level: "warn", text: "The opening transmission isn’t the first moment in the plan." });
  }
  return out.filter((w, i, all) => all.findIndex((x) => x.id === w.id) === i);
}

// ---------------------------------------------------------------------------------------------
// From a plan to an outline
// ---------------------------------------------------------------------------------------------

/** The kind of learner action each beat usually calls for. A beat, a page pattern and a block are different things. */
const BEAT_ACTIONS: Record<BeatKind, LearnerAction[]> = {
  goal: ["explain"],
  situation: ["explain", "explore"],
  clue: ["notice", "explore"],
  choice: ["decide", "converse"],
  consequence: ["decide", "reflect"],
  perspective: ["share", "explain"],
  transfer: ["reflect", "task"],
};
const BEAT_PATTERN: Record<BeatKind, "decide" | "say" | "do" | "notice" | "adapt"> = {
  goal: "decide",
  situation: "decide",
  clue: "notice",
  choice: "decide",
  consequence: "decide",
  perspective: "adapt",
  transfer: "do",
};
export type OutlineBlock = { type: string; label: string; why: string; topicCard: string | null };
export type OutlineStep = { beatId: string; beat: string; title: string; pattern: string; blocks: OutlineBlock[]; evidence: string; moments: number };

const pickBlock = (b: Beat): ActivityContract | undefined => {
  const want = stems(`${b.text} ${b.action}`);
  const ok = BLOCK_REGISTRY.filter((c) => BEAT_ACTIONS[b.kind].includes(c.action) && (b.evidence === "assessment" || c.evidence !== "assessed"));
  return ok.map((c) => ({ c, s: overlap(stems(`${c.purpose} ${c.goodFor.join(" ")}`), want) - c.minutes / 20 })).sort((x, y) => y.s - x.s)[0]?.c;
};

/**
  An editable outline from the plan's beats: one step per beat that has something in it, with the blocks the author
  chose or, failing that, the registry's best fit for that beat. Every block says why it's there. Only blocks the Hub
  has are ever offered.
*/
export function outlineFor(plan: PlanData, labels: Record<string, string>): OutlineStep[] {
  return plan.beats
    .filter((b) => b.text || b.action || b.blocks.length)
    .map((b) => {
      const chosen = b.blocks.map((t) => contractFor(t)).filter((c): c is ActivityContract => Boolean(c));
      const blocks = chosen.length ? chosen : [pickBlock(b)].filter((c): c is ActivityContract => Boolean(c));
      return {
        beatId: b.id,
        beat: BEAT_KINDS[b.kind],
        title: (b.action || b.text).split(/[.!?]/)[0].slice(0, 70) || BEAT_KINDS[b.kind],
        pattern: BEAT_PATTERN[b.kind],
        evidence: BEAT_EVIDENCE[b.evidence],
        moments: b.momentIds.length,
        blocks: blocks.map((c) => ({
          type: c.type,
          label: labels[c.type] ?? c.type,
          topicCard: c.topicCard,
          why: `Supports “${BEAT_KINDS[b.kind]}”: the learner ${c.purpose.charAt(0).toLowerCase()}${c.purpose.slice(1)}${b.action ? `, which is how they ${b.action.charAt(0).toLowerCase()}${b.action.slice(1).replace(/\.$/, "")}` : ""}. Evidence: ${EVIDENCE[c.evidence].toLowerCase()}.`,
        })),
      };
    });
}

// ---------------------------------------------------------------------------------------------
// Events
// ---------------------------------------------------------------------------------------------

/** Engagement only. None of these is an attempt, a completion or a learning outcome. */
export const STORY_EVENTS = [
  "story_check_in_opened",
  "story_question_selected",
  "story_audio_play_started",
  "story_history_opened",
  "story_appearance_link_followed",
  "story_moment_shown",
  "ava_transmission_started",
  "ava_transmission_ended",
  "ava_transmission_skipped",
  "ava_poster_shown",
] as const;
export type StoryEvent = (typeof STORY_EVENTS)[number];

/** What a learner's page gets for one placed moment: the pinned, approved revision and nothing unapproved. */
export type PlacedMoment = {
  placementId: string;
  /** An author's preview of a draft: nothing it does is recorded. */
  preview?: true;
  momentId: string;
  revision: number;
  kind: MomentKind;
  place: string;
  position: "before" | "after";
  speaker: { id: string; name: string; role: string };
  featured: { id: string; name: string } | null;
  whenLabel: string;
  role: string;
  script: string;
  nextAction: string;
  instruction: string;
  questions: Question[];
  hypothetical: boolean;
  video: { src: string; poster: string; captions: string; endFrame: string } | null;
  /** Checked recordings only: the script, and each answer by question id. */
  audio: { script: string | null; answers: Record<string, string> };
};
