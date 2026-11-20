/*
  Conversational roleplay (docs/voice-roleplay.md): a second way to do a Magazine conversation practice.
  Instead of choosing a response, the learner types or speaks one, and a fictional character replies.
  Shared by the server engine, the reader and the editor.

  What keeps it safe is that almost everything is authored. The scene's states, what counts as a good
  move, what's unsafe (with the caution to show), and the situations that stop the scene for escalation
  are all written and reviewed by people. A model only reads the learner's reply against that list,
  moves the scene at most one step, and writes the character's next line. It can't add a rule, and the
  debrief is assembled from the authored wording and the learner's own words, never from a model's opinion.
*/

export const DIMENSIONS = {
  listening: "Listening and validation",
  respect: "Respect and agency",
  communication: "Communication",
  context: "Context and unmet needs",
  safety: "Safety and scope",
  repair: "Repair and reflection",
} as const;
export type Dimension = keyof typeof DIMENSIONS;

/** Something worth doing in this scene, in words an assessor could point to. */
export type RoleplayMove = { id: string; dimension: Dimension; text: string; example: string };
/** Something that must never be rewarded, with the caution a learner is shown if they do it. */
export type RoleplayRisk = { id: string; text: string; caution: string };
/**
  A situation that ends ordinary conversation: the words that trigger it, what's shown instead of the
  character carrying on, and the escalation guidance for this role. Matched by rule, before any model runs.
*/
export type RoleplaySafety = { id: string; label: string; phrases: string[]; response: string; guidance: string };

export type Roleplay = {
  /** What the learner is practising. */
  goal: string;
  /** Who the learner is in the scene. */
  learnerRole: string;
  /** What the worker would actually know: care-plan facts and context. */
  facts: string[];
  /** Who the character is: history, preferences, what's worrying them. Not shown to the learner. */
  profile: string;
  /** The character's first line. */
  opening: string;
  /** "How the scene is going": its heading and its states from calmest to most concerning. The last is only ever reached by a safety rule. */
  meterTitle: string;
  states: string[];
  /** Where the scene starts (an index into states). */
  start: number;
  /** Keep the indicator hidden while they talk and show the timeline afterwards. */
  hideMeter: boolean;
  minTurns: number;
  maxTurns: number;
  moves: RoleplayMove[];
  risks: RoleplayRisk[];
  safety: RoleplaySafety[];
  /** The approved guidance behind the scene. */
  guidanceLabel: string;
  guidanceHref: string;
  /** Let learners speak their reply (when the Hub has voice switched on). */
  voice: boolean;
};

export const DEFAULT_STATES = ["Settled", "Uneasy", "Distressed", "Escalating", "Safety concern"];
export const DEFAULT_METER = "How the scene is going";
export const MAX_REPLY = 600;
export const TURN_RANGE = { min: 2, max: 8 };

export const FICTION_NOTICE = "This is a fictional AI character, for practice. Nothing here is advice about a real person.";
export const TEXT_NOTICE =
  "What you type is sent to an AI service to work out the character’s reply, and kept with your practice so you can see your debrief. Only you can read your conversation. Please don’t include a real person’s name or details.";
export const VOICE_NOTICE =
  "If you speak, your recording is sent to an AI speech service to turn it into text, then discarded: the Hub doesn’t keep the audio. You’ll see the text and can fix it before it’s sent.";
export const METER_NOTICE = "This shows how the made-up scene is going. It isn’t a measure of a real person’s distress, and it isn’t a score.";

export type TurnResult = {
  n: number;
  /** What the learner said, as submitted (after any correction). */
  text: string;
  mode: "text" | "voice";
  stateBefore: number;
  stateAfter: number;
  /** The character's reply, or the authored safety response. */
  reply: string;
  /** One line on where the scene is now: "Ruth feels heard, but is still worried about getting home." */
  caption: string;
  /** The scene has ended, and how. */
  ended: Outcome | null;
  /** A safety rule stopped the scene: its guidance. */
  safety: { label: string; guidance: string } | null;
};

export const OUTCOMES = {
  settled: "The scene settled",
  unresolved: "Calmer, but not resolved",
  support: "You asked for help",
  safety: "You reached a safety concern",
  ended: "You ended the practice",
} as const;
export type Outcome = keyof typeof OUTCOMES;

/** What the scene's end means, without making "quiet" the goal. */
export const OUTCOME_TEXT: Record<Outcome, string> = {
  settled: "In this scene, things settled. That won’t always happen, even when you do everything well.",
  unresolved: "In this scene, the person was still unsettled at the end. A respectful conversation that doesn’t resolve everything can still be good practice.",
  support: "Asking for help is often the right call. It isn’t a failure.",
  safety: "This situation needs escalating, not talking through. Recognising that is the skill.",
  ended: "You stopped part-way. What you’d said so far is below.",
};

export type Debrief = {
  outcome: Outcome;
  /** Up to two things they did, in the authored words, each with their own line as evidence. */
  didWell: { move: string; dimension: Dimension; quote: string; turn: number }[];
  /** One thing to try that they didn't do, with the author's example if there is one. */
  toTry: { move: string; dimension: Dimension; example: string } | null;
  /** Unsafe moves, with the authored caution. Shown even if the scene seemed to calm. */
  cautions: { risk: string; caution: string; quote: string; turn: number }[];
  /** A safety rule fired: what it was and what to do. */
  safety: { label: string; guidance: string } | null;
  /** Turns where it couldn't tell what they were doing. Said plainly rather than guessed. */
  unclear: number[];
  /** Each state the scene passed through, for the timeline. */
  timeline: { turn: number; state: number; caption: string }[];
  guidance: { label: string; href: string } | null;
};

/** Whether a learner's reply trips a safety rule: whole words or phrases, whatever the case or punctuation. */
export function safetyMatch(text: string, rules: RoleplaySafety[]): RoleplaySafety | null {
  const plain = ` ${text
    .toLowerCase()
    .replace(/[^\p{L}\p{N}\s]/gu, " ")
    .replace(/\s+/g, " ")
    .trim()} `;
  for (const r of rules)
    for (const p of r.phrases) {
      const phrase = p
        .toLowerCase()
        .replace(/[^\p{L}\p{N}\s]/gu, " ")
        .replace(/\s+/g, " ")
        .trim();
      if (phrase.length >= 3 && plain.includes(` ${phrase} `)) return r;
    }
  return null;
}

/** A quote only counts as evidence if the learner actually said it. */
export const said = (text: string, quote: string) => {
  const q = quote.trim().toLowerCase().replace(/\s+/g, " ");
  return q.length >= 3 && text.toLowerCase().replace(/\s+/g, " ").includes(q);
};

/**
  The next state the scene may move to: one step at most, never into the last state (that's a safety
  rule's to reach), never out of range. Whatever a model asks for is clamped to this.
*/
export function allowedState(before: number, wanted: unknown, states: number): number {
  const top = Math.max(0, states - 2);
  const w = Math.round(Number(wanted));
  if (!Number.isFinite(w)) return Math.min(before, top);
  return Math.min(top, Math.max(0, Math.max(before - 1, Math.min(before + 1, w))));
}

/** A model's line for the character is only used if it stays in the scene. */
export function replyProblem(reply: string): string | null {
  const r = reply.trim();
  if (r.length < 2) return "empty";
  if (r.length > 500) return "too long";
  if (/https?:\/\/|www\./i.test(r)) return "a link";
  if (/\b(as an ai|language model|i am an ai|i'm an ai|system prompt|my instructions|rubric|scor(e|ing))\b/i.test(r)) return "out of character";
  return null;
}

type TurnRecord = {
  n: number;
  text: string;
  moves: { id: string; quote: string }[];
  risks: { id: string; quote: string }[];
  unclear: boolean;
  stateAfter: number;
  caption: string;
};

/**
  The debrief, put together from what was authored and what the learner said. Two things done well, one
  to try, every caution, and an honest "couldn't tell" where that was the case. There is no score.
*/
export function buildDebrief(scene: Roleplay, turns: TurnRecord[], outcome: Outcome, safety: Debrief["safety"]): Debrief {
  const moveOf = new Map(scene.moves.map((m) => [m.id, m]));
  const riskOf = new Map(scene.risks.map((r) => [r.id, r]));
  const seen = new Set<string>();
  const didWell: Debrief["didWell"] = [];
  for (const t of turns)
    for (const m of t.moves) {
      const move = moveOf.get(m.id);
      if (!move || seen.has(m.id)) continue;
      seen.add(m.id);
      didWell.push({ move: move.text, dimension: move.dimension, quote: m.quote, turn: t.n });
    }
  const next = scene.moves.find((m) => !seen.has(m.id));
  const cautions: Debrief["cautions"] = [];
  for (const t of turns)
    for (const r of t.risks) {
      const risk = riskOf.get(r.id);
      if (risk && !cautions.some((c) => c.risk === risk.text)) cautions.push({ risk: risk.text, caution: risk.caution, quote: r.quote, turn: t.n });
    }
  return {
    outcome,
    didWell: didWell.slice(0, 2),
    toTry: next ? { move: next.text, dimension: next.dimension, example: next.example } : null,
    cautions,
    safety,
    unclear: turns.filter((t) => t.unclear).map((t) => t.n),
    timeline: [{ turn: 0, state: scene.start, caption: "" }, ...turns.map((t) => ({ turn: t.n, state: t.stateAfter, caption: t.caption }))],
    guidance: scene.guidanceLabel ? { label: scene.guidanceLabel, href: scene.guidanceHref } : null,
  };
}

/** A starting point for an author: structure to fill in, with nothing that reads as policy. */
export function blankRoleplay(): Roleplay {
  return {
    goal: "",
    learnerRole: "",
    facts: [],
    profile: "",
    opening: "",
    meterTitle: DEFAULT_METER,
    states: [...DEFAULT_STATES],
    start: 2,
    hideMeter: false,
    minTurns: 3,
    maxTurns: 6,
    moves: [],
    risks: [],
    safety: [],
    guidanceLabel: "",
    guidanceHref: "",
    voice: false,
  };
}
