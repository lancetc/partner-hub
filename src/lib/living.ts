import { AUDIENCES, type Audience } from "./story";

/*
  Living cases (docs/living-cases.md): a learner meets a person in one case, practises a decision, and is later
  invited back to a changed situation that tests the same judgement.

  Three things are kept here, as pure rules the pages, the server and the tests all share:
  - the return link: what an earlier appearance and a later episode have in common, and how they differ;
  - the Field Note: who is invited back, when, and what state their invitation is in;
  - the groupings the Signal Room reads evidence by, which never mix two versions of a question.

  What holds everywhere: a learner's answer never changes the shared story; a note can arrive once at most; and a
  score, however good, is never shown as proof that work changed.
*/

// ---------------------------------------------------------------------------------------------
// The return link
// ---------------------------------------------------------------------------------------------

export const RETURN_STATUS = { draft: "Draft", approved: "Approved", withdrawn: "Withdrawn" } as const;
export type ReturnStatus = keyof typeof RETURN_STATUS;
export const RETURN_PURPOSES = {
  transfer: "Tests the same judgement in a new situation",
  story: "Moves the story on in a way that helps the work decision",
} as const;
export type ReturnPurpose = keyof typeof RETURN_PURPOSES;

/** The beats an episode map can show. Not every case has every one. */
export const BEATS = {
  previous: { label: "Previous approved episode", kind: "canon", hint: "Where the shared story stood." },
  change: { label: "New development", kind: "canon", hint: "The one approved change in the person’s situation." },
  decision: { label: "Learner decision", kind: "branch", hint: "What the learner decides, with what they know now." },
  consequence: { label: "What their choice leads to", kind: "branch", hint: "Feedback on this learner’s attempt. It is never shared history." },
  response: { label: "The person’s response", kind: "canon", hint: "An approved line or story moment, in the person’s own words." },
  action: { label: "Next action at work", kind: "work", hint: "One thing to do, or a Job Aid to use." },
} as const;
export type BeatKey = keyof typeof BEATS;
export const BEAT_KINDS = {
  canon: "Shared story",
  branch: "This learner’s practice",
  work: "At work",
} as const;

/** Why one block sits where it does. The evidence it produces comes from the block registry, not from the author. */
export type Placement = {
  blockId: string;
  beat: BeatKey | "";
  /** What the learner actually does in this beat. */
  does: string;
  /** Why this block fits the behaviour and barrier. */
  why: string;
  /** A credible alternative that was considered. */
  alternative: string;
  /** Approved source or canon facts it rests on. */
  source: string;
  reviewer: string;
  /** Inputs still missing. */
  missing: string;
};

export type ReturnData = {
  purpose: ReturnPurpose;
  /** The work behaviour and barrier this answers to: copied from the response decision, or typed. */
  behaviour: string;
  barrier: string;
  /** Why a return to this person is useful here, in the author's words. */
  why: string;
  characterFit: string;
  /** Where we left this person: short, spoiler-safe, and enough for someone who never saw the first story. */
  recap: string;
  /** One approved development in their situation, preference or relationships. */
  changed: string;
  role: string;
  /** What the learner must decide, and the information they have now. */
  decide: string;
  perspective: string;
  /** How attempts are answered. Always this learner's own practice. */
  consequences: string;
  /** A next event proposed for the shared story. It is not canon until a steward approves an episode. */
  nextEvent: string;
  workAction: string;
  // The distinct transfer question.
  principle: string;
  cues: string;
  mistake: string;
  criteria: string;
  transfer: string;
  /** Earlier choice id → a line shown only to the learner who made that choice. */
  reflections: Record<string, string>;
  /** The earlier story must be finished first. Off unless an assignment says so. */
  prerequisite: boolean;
  placements: Placement[];
};

const text = (v: unknown, max: number) => (typeof v === "string" ? v.replace(/\s+\n/g, "\n").trim().slice(0, max) : "");
const ID = /^[\w:-]{1,80}$/;

export const emptyReturn = (): ReturnData => ({
  purpose: "transfer",
  behaviour: "",
  barrier: "",
  why: "",
  characterFit: "",
  recap: "",
  changed: "",
  role: "",
  decide: "",
  perspective: "",
  consequences: "",
  nextEvent: "",
  workAction: "",
  principle: "",
  cues: "",
  mistake: "",
  criteria: "",
  transfer: "",
  reflections: {},
  prerequisite: false,
  placements: [],
});

export function cleanReturn(v: unknown): ReturnData {
  const o = (v && typeof v === "object" ? v : {}) as Record<string, unknown>;
  const e = emptyReturn();
  const reflections: Record<string, string> = {};
  if (o.reflections && typeof o.reflections === "object")
    for (const [k, line] of Object.entries(o.reflections as Record<string, unknown>)) {
      const t = text(line, 280);
      if (ID.test(k) && t) reflections[k] = t;
    }
  const placements = (Array.isArray(o.placements) ? o.placements : [])
    .map((p): Placement | null => {
      const x = (p && typeof p === "object" ? p : {}) as Record<string, unknown>;
      if (typeof x.blockId !== "string" || !ID.test(x.blockId)) return null;
      return {
        blockId: x.blockId,
        beat: typeof x.beat === "string" && x.beat in BEATS ? (x.beat as BeatKey) : "",
        does: text(x.does, 400),
        why: text(x.why, 600),
        alternative: text(x.alternative, 300),
        source: text(x.source, 300),
        reviewer: text(x.reviewer, 120),
        missing: text(x.missing, 300),
      };
    })
    .filter((p): p is Placement => Boolean(p))
    .slice(0, 40);
  return {
    purpose: o.purpose === "story" ? "story" : "transfer",
    behaviour: text(o.behaviour, 400) || e.behaviour,
    barrier: text(o.barrier, 400),
    why: text(o.why, 800),
    characterFit: text(o.characterFit, 600),
    recap: text(o.recap, 600),
    changed: text(o.changed, 600),
    role: text(o.role, 240),
    decide: text(o.decide, 400),
    perspective: text(o.perspective, 240),
    consequences: text(o.consequences, 600),
    nextEvent: text(o.nextEvent, 600),
    workAction: text(o.workAction, 400),
    principle: text(o.principle, 400),
    cues: text(o.cues, 400),
    mistake: text(o.mistake, 400),
    criteria: text(o.criteria, 600),
    transfer: text(o.transfer, 400),
    reflections,
    prerequisite: o.prerequisite === true,
    placements,
  };
}

// The question an activity asks, as far as the checks need it.
export type Question = { prompt: string; choices: { id: string; text: string; verdict: string }[] };

const STOP = new Set(
  "a an and are as at be before but by can do does for from had has have her him his how i if in is it its of on or she so than that the their them then there they this to was we what when which who will with would you your".split(
    " ",
  ),
);
const wordSet = (s: string) =>
  new Set(
    s
      .toLowerCase()
      .replace(/[’']/g, "")
      .replace(/[^\p{L}\p{N}]+/gu, " ")
      .split(" ")
      .filter((w) => w.length > 1 && !STOP.has(w)),
  );
/** How much two pieces of wording share: 0 is nothing, 1 is the same words. */
export function overlap(a: string, b: string) {
  const x = wordSet(a);
  const y = wordSet(b);
  if (!x.size || !y.size) return 0;
  let both = 0;
  for (const w of x) if (y.has(w)) both += 1;
  return both / (x.size + y.size - both);
}

/**
  How much of one piece of writing turns up in another: the share of its words that are there. Used to notice an
  opening that tells a later episode, where the opening is longer than the episode's own summary.
*/
export function contains(textIn: string, of: string) {
  const x = wordSet(textIn);
  const y = wordSet(of);
  if (!x.size || y.size < 4) return 0;
  let both = 0;
  for (const w of y) if (x.has(w)) both += 1;
  return both / y.size;
}
/** Half of a later episode's own words, in one part of an opening, is that episode being told. */
export const GIVES_AWAY = 0.5;

/**
  Whether a return asks something new. A return that repeats the first question, or whose best answer is the
  first one again, tests memory of the story and not the judgement. This reads wording only: whether the
  judgement is really the same one in a new place is for the author and the reviewer.
*/
export function distinctness(first: Question | null, second: Question | null): { ok: boolean; problems: string[] } {
  if (!first || !second) return { ok: true, problems: [] };
  const problems: string[] = [];
  if (overlap(first.prompt, second.prompt) >= 0.7) problems.push("The question is worded almost as it was the first time.");
  const best = (q: Question) => q.choices.filter((c) => c.verdict === "best");
  for (const a of best(first))
    for (const b of best(second))
      if (overlap(a.text, b.text) >= 0.7) problems.push("The best answer is almost word for word the best answer from the first story.");
  const same = second.choices.filter((b) => first.choices.some((a) => overlap(a.text, b.text) >= 0.8)).length;
  if (second.choices.length && same === second.choices.length && !problems.length) problems.push("Every option repeats one from the first story.");
  return { ok: !problems.length, problems: [...new Set(problems)] };
}

export type ReturnContext = {
  character: { name: string; approved: boolean } | null;
  fromEpisode: { title: string; seq: number; approved: boolean } | null;
  toEpisode: { title: string; seq: number; approved: boolean } | null;
  first: Question | null;
  second: Question | null;
  /** The blocks on the return page, as the Hub has them. `known` is false for a block type the registry doesn't hold. */
  blocks: { id: string; type: string; label: string; known: boolean }[];
  target: { exists: boolean; published: boolean; relayEpisode: string; toEpisodeId: string } | null;
  /** Approved episodes later in the story than the return's own: their titles, to check nothing gives them away. */
  later: { title: string; summary: string }[];
};

/**
  What stands between a return and its approval (blocking), and what a reviewer should look at (warnings). Canon is
  checked first: a return can only point at approved episodes, in story order, for an approved character.
*/
export function returnProblems(r: ReturnData, c: ReturnContext): { blocking: string[]; warnings: string[] } {
  const blocking: string[] = [];
  const warnings: string[] = [];
  if (!c.character) warnings.push("No returning character is chosen. That’s allowed: say why in the fit, or use a Story Plan for a new person.");
  else if (!c.character.approved) blocking.push(`${c.character.name}’s story profile isn’t approved yet.`);
  if (!c.fromEpisode) blocking.push("Choose the earlier episode this returns to.");
  else if (!c.fromEpisode.approved) blocking.push(`The earlier episode, “${c.fromEpisode.title}”, isn’t approved.`);
  if (!c.toEpisode) blocking.push("Choose the episode the return tells.");
  else if (!c.toEpisode.approved) blocking.push(`“${c.toEpisode.title}” is a proposed event. A steward has to approve it before it is shared story.`);
  if (c.fromEpisode && c.toEpisode && c.toEpisode.seq <= c.fromEpisode.seq) blocking.push("The return sits before the episode it returns to, in story order.");
  if (r.recap.length < 30) blocking.push("Write the recap: where we left this person, for someone who never saw the first story.");
  if (r.changed.length < 20) blocking.push("Say what has changed for them.");
  if (r.decide.length < 20) blocking.push("Say what the learner must decide.");
  if (r.principle.length < 15) blocking.push("Name the principle the two stories share.");
  if (r.cues.length < 15) blocking.push("Describe the new cues: what is different about this situation at work.");
  if (r.mistake.length < 15) blocking.push("Describe the different plausible mistake.");
  if (r.criteria.length < 15) blocking.push("Record the approved response criteria.");
  if (r.transfer.length < 15) blocking.push("Say what would count as transfer.");
  if (!c.target?.exists) blocking.push("Choose the Magazine page that tells the return.");
  if (!c.second) blocking.push("Choose the activity that asks the transfer question.");
  const d = distinctness(c.first, c.second);
  for (const p of d.problems) blocking.push(p);
  if (!c.first) warnings.push("No earlier activity is linked, so a returning learner gets the neutral recap and nothing can be compared.");
  if (c.target?.exists && c.target.relayEpisode && c.target.relayEpisode !== c.target.toEpisodeId)
    warnings.push("Ava Relay on that page sits at a different episode from this return. Check what she may refer to.");
  for (const e of c.later) {
    const told = [r.recap, r.changed, r.decide].some((t) => contains(t, `${e.title} ${e.summary}`) >= GIVES_AWAY);
    if (told) blocking.push(`The opening gives away a later episode, “${e.title}”.`);
  }
  if (/\b(as you (chose|decided)|because you|after you (asked|told|chose))\b/i.test(`${r.changed} ${r.recap} ${r.nextEvent}`))
    blocking.push("The shared story is written as if it followed from a learner’s answer. Keep what a learner chose in the feedback on their attempt.");
  const unknown = c.blocks.filter((b) => !b.known);
  if (unknown.length) blocking.push(`Needs implementation: ${unknown.map((b) => b.label).join(", ")} isn’t a block the Hub has.`);
  const reasoned = new Set(r.placements.filter((p) => p.why.length >= 20 && p.does.length >= 10).map((p) => p.blockId));
  const unreasoned = c.blocks.filter((b) => b.known && !reasoned.has(b.id));
  if (c.blocks.length && unreasoned.length)
    blocking.push(
      `${unreasoned.length === 1 ? "One block has" : `${unreasoned.length} blocks have`} no reason yet: ${unreasoned
        .slice(0, 3)
        .map((b) => b.label)
        .join("; ")}${unreasoned.length > 3 ? "…" : ""}.`,
    );
  for (const p of r.placements)
    if (/^\s*(it(’|')?s )?(very |more |highly )?(engaging|interactive|fun)\.?\s*$/i.test(p.why))
      blocking.push("“Engaging” or “interactive” isn’t a reason for a block. Say what the learner does and why that fits the barrier.");
  if (!r.workAction) warnings.push("There’s no next action at work.");
  if (!Object.keys(r.reflections).length && c.first) warnings.push("No private lines are written, so a returning learner sees the neutral recap.");
  return { blocking: [...new Set(blocking)], warnings };
}

// ---------------------------------------------------------------------------------------------
// Field Notes
// ---------------------------------------------------------------------------------------------

export const NOTE_REASONS = {
  return: "{name} has a new decision",
  unsure: "A question you were unsure about",
  guidance: "Guidance changed for a task you do",
  rehearsal: "A short rehearsal for a task you do",
} as const;
export type NoteReason = keyof typeof NOTE_REASONS;
export const NOTE_STATUS = { draft: "Draft", live: "Released", withdrawn: "Withdrawn" } as const;
export type NoteStatus = keyof typeof NOTE_STATUS;
export const NOTE_DEFAULTS = { delayDays: 14, expiresDays: 90, snoozeDays: 7 } as const;
/** At most this many Field Notes may reach one person in this many days, across every note. */
export const NOTE_CAP = { count: 1, days: 14 } as const;

export type NoteData = {
  reason: NoteReason;
  /** The one line a learner sees. It may be read on a shared screen, so it never refers to what they answered. */
  hook: string;
  minutes: number;
  /** Empty is everyone who may read the page. */
  audience: Audience[];
  /** Days after the earlier decision was answered. */
  delayDays: number;
  /** A Field Note is an invitation. Assigning something is a separate, explicit decision made elsewhere. */
  optional: true;
  /** Days after delivery before an unopened note quietly goes. */
  expiresDays: number;
  /** In the Hub only. Email and SMS need an approved delivery choice, and none is built. */
  channel: "hub";
};
export const emptyNote = (): NoteData => ({
  reason: "return",
  hook: "",
  minutes: 5,
  audience: [],
  delayDays: NOTE_DEFAULTS.delayDays,
  optional: true,
  expiresDays: NOTE_DEFAULTS.expiresDays,
  channel: "hub",
});
const int = (v: unknown, min: number, max: number, d: number) => (Number.isFinite(Number(v)) ? Math.max(min, Math.min(max, Math.round(Number(v)))) : d);
export function cleanNote(v: unknown): NoteData {
  const o = (v && typeof v === "object" ? v : {}) as Record<string, unknown>;
  return {
    reason: typeof o.reason === "string" && o.reason in NOTE_REASONS ? (o.reason as NoteReason) : "return",
    hook: text(o.hook, 200),
    minutes: int(o.minutes, 1, 60, 5),
    audience: Array.isArray(o.audience) ? o.audience.filter((a): a is Audience => typeof a === "string" && a in AUDIENCES) : [],
    delayDays: int(o.delayDays, 0, 180, NOTE_DEFAULTS.delayDays),
    optional: true,
    expiresDays: int(o.expiresDays, 7, 365, NOTE_DEFAULTS.expiresDays),
    channel: "hub",
  };
}
/** What a note needs before it can be released. */
export function noteProblems(n: NoteData): string[] {
  const out: string[] = [];
  if (n.hook.length < 12) out.push("Write the one-line hook.");
  if (n.hook.length > 160) out.push("Keep the hook to a line: 160 characters at most.");
  // A note can be read over someone's shoulder. What a person answered stays on the page they open.
  if (/\b(you (chose|answered|picked|said|got)|your (answer|score|result|attempt)|last time you)\b/i.test(n.hook))
    out.push("The hook mentions the learner’s own answer. A note may be read on a shared screen: keep that for the page.");
  return out;
}
export const reasonText = (reason: NoteReason, name: string) => NOTE_REASONS[reason].replace("{name}", name || "This story");

const DAY = 86_400_000;
export const addDays = (iso: string, days: number) => new Date(Date.parse(iso) + days * DAY).toISOString();
export const daysBetween = (a: string, b: string) => Math.max(0, Math.round((Date.parse(b) - Date.parse(a)) / DAY));

export type Delivery = {
  eligibleAt: string;
  dueAt: string;
  deliveredAt: string | null;
  openedAt: string | null;
  dismissedAt: string | null;
  snoozedUntil: string | null;
};
export type NoteState = "scheduled" | "new" | "read" | "snoozed" | "dismissed" | "expired";
/** Where one person's note stands. Dismissing or expiring never touches the page it points to. */
export function noteState(d: Delivery, now: Date, expiresDays: number): NoteState {
  const at = now.toISOString();
  if (!d.deliveredAt) return "scheduled";
  if (d.dismissedAt) return "dismissed";
  if (d.snoozedUntil && d.snoozedUntil > at) return "snoozed";
  if (d.openedAt) return "read";
  if (addDays(d.deliveredAt, expiresDays) <= at) return "expired";
  return "new";
}
/** Whether another note may reach someone now, given when their earlier ones arrived. */
export function capAllows(delivered: string[], now: Date, cap: { count: number; days: number } = NOTE_CAP) {
  const since = new Date(now.getTime() - cap.days * DAY).toISOString();
  return delivered.filter((t) => t > since).length < cap.count;
}

export const LIVING_EVENTS = [
  "field_note_eligible",
  "field_note_delivered",
  "field_note_opened",
  "field_note_dismissed",
  "field_note_snoozed",
  "return_episode_opened",
  "character_history_followed",
  "transfer_activity_started",
  "transfer_response_submitted",
] as const;
export type LivingEvent = (typeof LIVING_EVENTS)[number];
/** The ones a learner's page reports. The rest are recorded by the server as they happen. */
export const LIVING_CLIENT_EVENTS: readonly LivingEvent[] = ["return_episode_opened", "character_history_followed", "transfer_activity_started"];

// ---------------------------------------------------------------------------------------------
// Reading evidence
// ---------------------------------------------------------------------------------------------

/** Under this many people, a figure is marked as resting on few. */
export const THIN = 10;

export const COHORTS = {
  returned: "Answered the first decision, then came back",
  fresh: "Came to the return without the first",
} as const;
export type Cohort = keyof typeof COHORTS;

/** One published version's results on one question. `rubric` identifies the question and its marking as they were. */
export type VersionResult = { revision: number; rubric: string; answered: number; best: number };
/**
  Versions that may be read as one series: only those whose question and marking were the same. A change to the
  wording or to which answer is best starts a new series; it is never averaged into the old one.
*/
export function seriesByRubric<T extends { rubric: string; revision: number }>(rows: T[]): { rubric: string; rows: T[] }[] {
  const out: { rubric: string; rows: T[] }[] = [];
  for (const r of [...rows].sort((a, b) => a.revision - b.revision)) {
    const last = out.at(-1);
    if (last && last.rubric === r.rubric) last.rows.push(r);
    else out.push({ rubric: r.rubric, rows: [r] });
  }
  return out;
}

export const median = (nums: number[]) => {
  if (!nums.length) return null;
  const s = [...nums].sort((a, b) => a - b);
  return s.length % 2 ? s[(s.length - 1) / 2] : Math.round((s[s.length / 2 - 1] + s[s.length / 2]) / 2);
};

export const INTERPRETATIONS = {
  improved: "Improved",
  mixed: "Mixed",
  no_change: "No observed change",
  too_early: "Too early or insufficient data",
} as const;
export type Interpretation = keyof typeof INTERPRETATIONS;

/**
  Wording that says the learning caused a result. A chart can show two things moving; it can't show why. Used to
  refuse a drafted summary, and to prompt a person who writes one.
*/
const CAUSAL =
  /\b(caus(ed|es|ing)|led to|leads to|resulted in|results in|thanks to|as a result of|because of|due to|drove|driven by|proves?|proved|proof that|demonstrates that|worked\b|was effective|is effective|(training|course|episode|learning|story|module|return|note) (has |have |had )?(reduced|improved|fixed|cut|lowered|raised|increased|changed|solved))\b/i;
export function causalClaims(textIn: string): string[] {
  return textIn
    .split(/(?<=[.!?])\s+/)
    .map((s) => s.trim())
    .filter((s) => s && CAUSAL.test(s))
    .slice(0, 5);
}
