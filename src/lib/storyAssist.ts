import { contractFor } from "./blockRegistry";
import {
  BEAT_EVIDENCE,
  BEAT_KINDS,
  CAST_ROLES,
  type Beat,
  type BeatKind,
  type CastRole,
  type MomentKind,
  type Question,
  type TransmissionBeats,
} from "./story";

/*
  AI proposals for Story Plans (docs/story-plans.md). A model may draft; it never decides. Everything it returns is
  read against the Hub's own lists before an author sees it:

  - a character must be one with an approved profile who is allowed for the audience;
  - a fact must be one of that character's approved facts, named by its id;
  - a block must be one the Hub really has, a beat one of the plan's kinds;
  - anything else is dropped and said to have been dropped.

  A proposal changes nothing by itself. The author takes a field, a beat or a script line at a time, and saving and
  approving stay exactly as they were: an episode a model drafted is a draft episode until a steward approves it.
*/

export const PROPOSAL_KINDS = {
  plan: "A plan from the purpose",
  continuity: "A second look at continuity",
  episode: "A next episode",
  script: "A script",
} as const;
export type ProposalKind = keyof typeof PROPOSAL_KINDS;
export const PROPOSALS_PER_HOUR = 40;

/** What a model is shown of one character: approved, and nothing from a draft. */
export type CanonPerson = {
  id: string;
  name: string;
  revision: number;
  role: string;
  summary: string;
  matters: string;
  relationships: string[];
  portrayal: string;
  never: string;
  facts: { id: string; text: string }[];
  episodes: { id: string; title: string; whenLabel: string; summary: string; seq: number }[];
};
/** A fact a proposal leaned on, as the author sees it: whose, at which profile version, and the words. */
export type UsedFact = { ref: string; character: string; revision: number; text: string; episode?: true };

const str = (v: unknown, max: number) => (typeof v === "string" ? v.replace(/\s+/g, " ").trim().slice(0, max) : "");
const obj = (v: unknown) => (v && typeof v === "object" && !Array.isArray(v) ? (v as Record<string, unknown>) : {});
const list = (v: unknown, max: number) => (Array.isArray(v) ? v.slice(0, max) : []);
const texts = (v: unknown, max: number, len: number) =>
  list(v, max)
    .map((x) => str(x, len))
    .filter(Boolean);

const INLINE_REF = /\s?\[((?:[a-z0-9-]+:[a-z0-9-]+)|(?:ep-[a-z0-9-]+))\]/gi;
/**
  A model's reply with every citation it wrote into a sentence taken back out, and noted in `found`. A script line or
  a beat an author takes must be words a learner can read, never "Dot tends her roses [dot:roses]". The lists of
  ids themselves ("facts", "fact") are left as they are.
*/
export function liftRefs(raw: unknown, found: string[]): unknown {
  if (typeof raw === "string")
    return raw
      .replace(INLINE_REF, (_whole, ref: string) => {
        found.push(ref);
        return "";
      })
      .replace(/ +([.,;:])/g, "$1");
  if (Array.isArray(raw)) return raw.map((x) => liftRefs(x, found));
  if (raw && typeof raw === "object")
    return Object.fromEntries(Object.entries(raw).map(([k, v]) => [k, k === "facts" || k === "fact" ? v : liftRefs(v, found)]));
  return raw;
}

/** The canon as a model reads it. Each fact carries the id it must be cited by. */
export function canonBlock(people: CanonPerson[]) {
  const esc = (s: string) => s.replace(/</g, "‹").replace(/>/g, "›");
  return people
    .map(
      (p) =>
        `<person id="${p.id}" name="${esc(p.name)}">\n${esc([p.role, p.summary, p.matters && `What matters to them: ${p.matters}`].filter(Boolean).join(" "))}${
          p.relationships.length ? `\nPeople around them: ${esc(p.relationships.join("; "))}` : ""
        }${p.portrayal ? `\nHow to write them: ${esc(p.portrayal)}` : ""}${p.never ? `\nNever: ${esc(p.never)}` : ""}\nApproved facts:\n${
          p.facts.map((f) => `- [${p.id}:${f.id}] ${esc(f.text)}`).join("\n") || "- none recorded"
        }\nApproved episodes, in story order:\n${p.episodes.map((e) => `- [${e.id}] ${esc([e.whenLabel, e.title].filter(Boolean).join(": "))}. ${esc(e.summary)}`).join("\n") || "- none yet"}\n</person>`,
    )
    .join("\n");
}

/** The facts a proposal cited that are real, and the citations that weren't. */
export function resolveFacts(refs: unknown, people: CanonPerson[]): { used: UsedFact[]; unknown: string[] } {
  const used: UsedFact[] = [];
  const unknown: string[] = [];
  for (const raw of list(refs, 30)) {
    const ref = str(raw, 90).replace(/^\[|\]$/g, "");
    if (!ref) continue;
    // An approved episode can be cited by its own id: it's canon too.
    const inEpisode = people.find((p) => p.episodes.some((e) => e.id === ref));
    if (inEpisode) {
      const e = inEpisode.episodes.find((x) => x.id === ref)!;
      if (!used.some((u) => u.ref === ref))
        used.push({
          ref,
          character: inEpisode.name,
          revision: inEpisode.revision,
          text: `${[e.whenLabel, e.title].filter(Boolean).join(": ")}. ${e.summary}`,
          episode: true,
        });
      continue;
    }
    const [pid, fid] = ref.split(":");
    const person = people.find((p) => p.id === pid);
    const fact = person?.facts.find((f) => f.id === fid);
    if (person && fact) {
      if (!used.some((u) => u.ref === ref)) used.push({ ref, character: person.name, revision: person.revision, text: fact.text });
    } else if (!unknown.includes(ref)) unknown.push(ref);
  }
  return { used, unknown };
}

const words = (s: string) =>
  s
    .toLowerCase()
    .replace(/[^a-z0-9\s]/g, " ")
    .split(/\s+/)
    .filter(Boolean);
/**
  Whether a script recites a long approved fact word for word: ten words or more in a row. A returning character's
  history is referred to in a phrase, not read out again.
*/
export function repeatsCanon(script: string, facts: string[], run = 10): string | null {
  const said = ` ${words(script).join(" ")} `;
  for (const fact of facts) {
    const w = words(fact);
    for (let i = 0; i + run <= w.length; i++) if (said.includes(` ${w.slice(i, i + run).join(" ")} `)) return fact;
  }
  return null;
}

// ---------------------------------------------------------------------------------------------
// A plan from the purpose
// ---------------------------------------------------------------------------------------------

export const PLAN_TEXT_FIELDS = ["perspective", "tension", "decision", "effect", "transfer", "checkin", "ava"] as const;
export type PlanTextField = (typeof PLAN_TEXT_FIELDS)[number];
export type ProposedBeat = Beat & {
  /** Why this beat, and this block, help the behaviour. */
  why: string;
  facts: string[];
  /** The beat states or leans on a work rule: it needs an approved source, which fiction can't be. */
  guidance: boolean;
};
export type PlanProposal = {
  kind: "plan";
  /** Whether there is a choice of continuing character to offer. Not when the model named someone the rules don't allow. */
  anchorOffered: boolean;
  anchorId: string;
  anchorWhy: string;
  fields: Partial<Record<PlanTextField, string>>;
  beats: ProposedBeat[];
  used: UsedFact[];
  /** What the author or a source still has to supply. */
  missing: string[];
  /** What was taken out because it isn't on the Hub's lists. */
  dropped: string[];
};

/** Problems that make a reply unusable, for one corrected try. Smaller faults are dropped and reported instead. */
export function planIssues(raw: unknown): string[] {
  const o = obj(raw);
  const beats = list(o.beats, 20);
  const out: string[] = [];
  if (beats.length < 3) out.push("Give at least three beats.");
  if (beats.length > 9) out.push("Give at most nine beats.");
  if (beats.some((b) => !(str(obj(b).kind, 40) in BEAT_KINDS))) out.push(`Every beat's "kind" must be one of: ${Object.keys(BEAT_KINDS).join(", ")}.`);
  if (beats.some((b) => !str(obj(b).text, 600))) out.push('Every beat needs "text".');
  return out;
}

/**
  A model's plan, held to the Hub's lists. `fits`: the characters the rules allow for this brief; `allowed`: every
  approved character the audience may meet (for a beat's speaker).
*/
export function readPlanProposal(raw: unknown, ctx: { fits: string[]; allowed: CanonPerson[] }): PlanProposal {
  const inline: string[] = [];
  const o = obj(liftRefs(raw, inline));
  const dropped: string[] = [];
  const ids = new Set(ctx.allowed.map((p) => p.id));
  const name = (id: string) => ctx.allowed.find((p) => p.id === id)?.name ?? id;
  let anchorId = str(o.anchorId, 60);
  let anchorOffered = true;
  if (anchorId && anchorId !== "new" && !ctx.fits.includes(anchorId)) {
    dropped.push(`“${name(anchorId)}” as the continuing character: the rules don’t offer them for this brief.`);
    anchorId = "";
    // Taken out is not the same as "no continuing character": there is no proposal about who it happens to.
    anchorOffered = false;
  }
  const fields: PlanProposal["fields"] = {};
  for (const k of PLAN_TEXT_FIELDS) {
    const v = str(obj(o.fields)[k] ?? o[k], k === "decision" || k === "checkin" ? 400 : k === "perspective" ? 300 : 600);
    if (v) fields[k] = v;
  }
  const allRefs: unknown[] = [];
  const beats = list(o.beats, 9).map((x, i): ProposedBeat => {
    const b = obj(x);
    let characterId = str(b.characterId, 60);
    if (characterId && !ids.has(characterId)) {
      dropped.push(`A beat spoke for “${characterId}”, who has no approved profile for this audience.`);
      characterId = "";
    }
    const blocks = list(b.blocks, 4).map((t) => str(t, 40));
    const real = blocks.filter((t) => contractFor(t));
    for (const t of blocks) if (t && !contractFor(t)) dropped.push(`A block called “${t}”: the Hub has no such block.`);
    const refs = list(b.facts, 6);
    allRefs.push(...refs);
    const kind = str(b.kind, 40) as BeatKind;
    return {
      id: `ai${i + 1}`,
      kind: kind in BEAT_KINDS ? kind : "situation",
      text: str(b.text, 600),
      characterId,
      episodeId: "",
      action: str(b.action, 300),
      source: "",
      blocks: real,
      evidence: str(b.evidence, 20) in BEAT_EVIDENCE ? (str(b.evidence, 20) as Beat["evidence"]) : kind === "choice" ? "practice" : "explanation",
      // A consequence that hangs on the learner's choice is theirs alone: never the shared story.
      hypothetical: b.hypothetical === true || kind === "consequence",
      momentIds: [],
      why: str(b.why, 400),
      facts: refs.map((r) => str(r, 90).replace(/^\[|\]$/g, "")).filter(Boolean),
      guidance: b.guidance === true,
    };
  });
  const { used, unknown } = resolveFacts([...allRefs, ...inline], ctx.allowed);
  for (const ref of unknown) dropped.push(`A fact cited as “${ref}”: no approved fact has that id.`);
  const known = new Set(used.map((u) => u.ref));
  for (const b of beats) b.facts = b.facts.filter((f) => known.has(f));
  const missing = texts(o.missing, 8, 300);
  const sourced = str(o.sources, 600);
  if (beats.some((b) => b.guidance) && !sourced)
    missing.push("A beat relies on work guidance. Name the approved source that governs it under Sources and boundaries.");
  return { kind: "plan", anchorOffered, anchorId, anchorWhy: anchorOffered ? str(o.anchorWhy, 400) : "", fields, beats, used, missing, dropped };
}

// ---------------------------------------------------------------------------------------------
// A second look at continuity
// ---------------------------------------------------------------------------------------------

export const CONCERN_KINDS = {
  contradiction: "Contradicts an approved fact",
  unsupported: "Not supported by an approved fact or source",
  order: "A time or order problem",
  relationship: "A changed relationship",
  audience: "May reach the wrong audience",
  unanswered: "A beat left unanswered",
  repetitive: "Leans on the same thing again",
  branch: "A learner’s branch written as shared story",
} as const;
export type ConcernKind = keyof typeof CONCERN_KINDS;
export type Concern = { kind: ConcernKind; beatId: string; text: string; fact: UsedFact | null };
export type ContinuityProposal = { kind: "continuity"; concerns: Concern[]; dropped: string[] };

export function readContinuity(raw: unknown, ctx: { beatIds: string[]; allowed: CanonPerson[] }): ContinuityProposal {
  const dropped: string[] = [];
  const concerns = list(obj(raw).concerns, 8).flatMap((x): Concern[] => {
    const inline: string[] = [];
    const c = obj(liftRefs(x, inline));
    const kind = str(c.kind, 30) as ConcernKind;
    const text = str(c.text, 400);
    if (!(kind in CONCERN_KINDS) || !text) return [];
    // The fact it named, or failing that the first one it cited in the sentence.
    const { used, unknown } = resolveFacts(c.fact ? [c.fact] : inline.slice(0, 1), ctx.allowed);
    for (const ref of unknown) dropped.push(`A fact cited as “${ref}”: no approved fact has that id.`);
    const beatId = str(c.beatId, 40);
    return [{ kind, beatId: ctx.beatIds.includes(beatId) ? beatId : "", text, fact: used[0] ?? null }];
  });
  return { kind: "continuity", concerns, dropped };
}

// ---------------------------------------------------------------------------------------------
// A next episode
// ---------------------------------------------------------------------------------------------

export type EpisodeProposal = {
  kind: "episode";
  title: string;
  summary: string;
  whenLabel: string;
  changes: string;
  people: { characterId: string; role: CastRole }[];
  /** After the last approved episode it follows, in story order. */
  seq: number;
  source: string;
  used: UsedFact[];
  /** The "never" lines of everyone in it, for the steward to read it against. */
  boundaries: string[];
  missing: string[];
  dropped: string[];
};

export function episodeIssues(raw: unknown): string[] {
  const o = obj(raw);
  const out: string[] = [];
  if (str(o.title, 200).length < 3) out.push('Give the episode a "title".');
  if (str(o.summary, 800).length < 30) out.push('Give a "summary" of two or three sentences.');
  if (str(o.summary, 2000).length > 600) out.push("Keep the summary under 600 characters.");
  return out;
}

export function readEpisodeProposal(raw: unknown, ctx: { characterId: string; allowed: CanonPerson[] }): EpisodeProposal {
  const inline: string[] = [];
  const o = obj(liftRefs(raw, inline));
  const dropped: string[] = [];
  const ids = new Set(ctx.allowed.map((p) => p.id));
  const people = list(o.people, 6).flatMap((x) => {
    const p = obj(x);
    const characterId = str(p.characterId, 60);
    if (!ids.has(characterId)) {
      if (characterId) dropped.push(`“${characterId}” in the episode: they have no approved profile.`);
      return [];
    }
    const role = str(p.role, 20) as CastRole;
    return [{ characterId, role: role in CAST_ROLES ? role : ("supporting" as CastRole) }];
  });
  // The episode is this character's: they're in it, as its focus unless the draft says otherwise.
  const cast = people.some((p) => p.characterId === ctx.characterId) ? people : [{ characterId: ctx.characterId, role: "focus" as CastRole }, ...people];
  const unique = cast.filter((p, i) => cast.findIndex((x) => x.characterId === p.characterId) === i);
  const { used, unknown } = resolveFacts([...list(o.facts, 30), ...inline], ctx.allowed);
  for (const ref of unknown) dropped.push(`A fact cited as “${ref}”: no approved fact has that id.`);
  const me = ctx.allowed.find((p) => p.id === ctx.characterId);
  const last = Math.max(0, ...(me?.episodes.map((e) => e.seq) ?? []));
  return {
    kind: "episode",
    title: str(o.title, 120),
    summary: str(o.summary, 600),
    whenLabel: str(o.whenLabel, 80),
    changes: str(o.changes, 400),
    people: unique,
    seq: last + 10,
    source: "An AI draft, for editorial review. Not approved canon.",
    used,
    boundaries: unique.flatMap((p) => {
      const person = ctx.allowed.find((c) => c.id === p.characterId);
      return person?.never ? [`${person.name}: ${person.never}`] : [];
    }),
    missing: texts(o.missing, 8, 300),
    dropped,
  };
}

// ---------------------------------------------------------------------------------------------
// A script for a moment
// ---------------------------------------------------------------------------------------------

export type ScriptProposal = {
  kind: "script";
  moment: MomentKind;
  beats: TransmissionBeats | null;
  text: string;
  nextAction: string;
  newInfo: string;
  questions: Question[];
  used: UsedFact[];
  /** Sentences that state work guidance: each needs an approved source, or to go. */
  guidance: string[];
  missing: string[];
  dropped: string[];
};
const BEAT_KEYS: (keyof TransmissionBeats)[] = ["greeting", "backstory", "problem", "instruction", "interruption"];
const count = (s: string) => words(s).length;

export function scriptText(raw: unknown, moment: MomentKind) {
  const o = obj(raw);
  const b = obj(o.beats);
  return moment === "opening_transmission"
    ? BEAT_KEYS.map((k) => str(b[k], 600)).join(" ")
    : [str(o.text, 1200), ...list(o.questions, 4).map((q) => `${str(obj(q).label, 120)} ${str(obj(q).answer, 700)}`)].join(" ");
}

/** What makes a script unusable, for one corrected try. `facts`: every long approved fact the speaker could recite. */
export function scriptIssues(raw: unknown, moment: MomentKind, facts: string[]): string[] {
  const o = obj(raw);
  const out: string[] = [];
  if (moment === "opening_transmission") {
    const b = obj(o.beats);
    for (const k of BEAT_KEYS) if (!str(b[k], 600)) out.push(`Write the "${k}" beat.`);
    const n = count(scriptText(raw, moment));
    if (n > 190) out.push(`The transmission is ${n} words. Keep it under 170: it's a short field message.`);
  } else {
    const n = count(str(o.text, 2000));
    if (n < 8) out.push('Write the "text".');
    if (n > 150) out.push(`The text is ${n} words. Keep it under 130.`);
    if (moment === "check_in") {
      const qs = list(o.questions, 8);
      if (qs.length < 2 || qs.length > 4) out.push("Give two to four questions a learner can choose, each with the character's answer.");
      if (qs.some((q) => !str(obj(q).label, 120) || !str(obj(q).answer, 700))) out.push('Every question needs a "label" and an "answer".');
    }
  }
  const recited = repeatsCanon(scriptText(raw, moment), facts);
  if (recited)
    out.push(`Don't recite an approved fact word for word ("${recited.slice(0, 70)}…"). People who know the character have heard it: refer to it in a phrase.`);
  return out;
}

export function readScriptProposal(raw: unknown, moment: MomentKind, allowed: CanonPerson[]): ScriptProposal {
  const inline: string[] = [];
  const o = obj(liftRefs(raw, inline));
  const b = obj(o.beats);
  const dropped: string[] = [];
  const { used, unknown } = resolveFacts([...list(o.facts, 30), ...inline], allowed);
  for (const ref of unknown) dropped.push(`A fact cited as “${ref}”: no approved fact has that id.`);
  return {
    kind: "script",
    moment,
    beats:
      moment === "opening_transmission"
        ? {
            greeting: str(b.greeting, 300),
            backstory: str(b.backstory, 400),
            problem: str(b.problem, 400),
            instruction: str(b.instruction, 300),
            interruption: str(b.interruption, 300),
          }
        : null,
    text: moment === "opening_transmission" ? "" : str(o.text, 900),
    nextAction: str(o.nextAction ?? b.nextAction, 120),
    newInfo: moment === "new_information" ? str(o.newInfo, 400) : "",
    questions:
      moment === "check_in"
        ? list(o.questions, 4)
            .map((q, i) => ({ id: `ai${i + 1}`, label: str(obj(q).label, 80), answer: str(obj(q).answer, 500) }))
            .filter((q) => q.label && q.answer)
        : [],
    used,
    guidance: texts(o.guidance, 6, 300),
    missing: texts(o.missing, 8, 300),
    dropped,
  };
}

export type Proposal = PlanProposal | ContinuityProposal | EpisodeProposal | ScriptProposal;
