import { BARRIERS, type Barrier } from "./blockRegistry";
import { causalClaims, contains, distinctness, GIVES_AWAY, noteProblems, type NoteData, type Question, type ReturnData } from "./living";
import { liftRefs, repeatsCanon, resolveFacts, type CanonPerson, type UsedFact } from "./storyAssist";

/*
  AI proposals for living cases (docs/living-cases.md, phase 4): the opening of a return, a Field Note's hook, an
  alternate transfer question, and a summary of what the Signal Room shows. A model drafts; these rules read what
  came back against what the Hub knows before an author sees it. Everything here is pure, so the tests can show a
  bad draft being turned away without a model.

  The first rule runs before any model is asked: whether a story is a sensible response at all. Where the diagnosed
  barrier is one learning can't shift, or the response decision is to build nothing, no story is proposed.
*/

// ---------------------------------------------------------------------------------------------
// Whether to propose a story at all
// ---------------------------------------------------------------------------------------------

export type Decision = { decided: boolean; learning: string; barriers: Barrier[] } | null;

/** Rules, not a model. A linked theme must have a reviewed decision, and that decision must leave room for a story. */
export function storyGate(d: Decision): { ok: true } | { ok: false; reason: string } {
  // No theme linked: an author is working from a character or a blank draft, which is allowed.
  if (!d) return { ok: true };
  if (!d.decided)
    return { ok: false, reason: "The response decision for this theme isn’t approved yet. A return starts from a reviewed decision, not ahead of it." };
  const learnable = d.barriers.filter((b) => BARRIERS[b].learnable);
  if (d.barriers.length && !learnable.length)
    return {
      ok: false,
      reason: `No story is proposed. The diagnosed barrier (${d.barriers
        .map((b) => BARRIERS[b].label.toLowerCase())
        .join("; ")}) is one a course or a story can’t change. The response is a process or system fix.`,
    };
  if (d.learning === "none")
    return { ok: false, reason: "No story is proposed. The response decision is “No learning item”, and a return episode would be new learning." };
  if (d.learning === "reuse")
    return {
      ok: false,
      reason: "No story is proposed. The response decision is to reuse what already exists, as it is. Place that instead of writing a new episode.",
    };
  return { ok: true };
}

// ---------------------------------------------------------------------------------------------
// Reading what came back
// ---------------------------------------------------------------------------------------------

const str = (v: unknown, max: number) => (typeof v === "string" ? v.replace(/\s+/g, " ").trim().slice(0, max) : "");
const obj = (v: unknown) => (v && typeof v === "object" && !Array.isArray(v) ? (v as Record<string, unknown>) : {});
const list = (v: unknown, max: number) => (Array.isArray(v) ? v.slice(0, max) : []);
const texts = (v: unknown, max: number, len: number) =>
  list(v, max)
    .map((x) => str(x, len))
    // A model sometimes hands back the words that described the field. That isn't something an owner has to supply.
    .filter((x) => x && !/^(what (an owner|quality|operations)\b|\.\.\.|string$|n\/a$|none\.?$)/i.test(x));

/** A sentence that tells a worker what the rule is. Fiction is never the source for one. */
const RULE =
  /\b(must|always|never|required|requires|have to|has to|policy|entitle[ds]?|entitlement|mandatory|legally|the standard|is not allowed|are not allowed)\b/i;
/** A learner's choice written as if it had happened to the person in the shared story. */
const BRANCH = /\b(as you (chose|decided|asked)|because you|after you (asked|told|chose|decided)|since you (asked|chose))\b/i;

export const RETURN_FIELDS = ["recap", "changed", "decide", "principle", "cues", "mistake", "transfer", "workAction"] as const;
export type ReturnField = (typeof RETURN_FIELDS)[number];
export const RETURN_FIELD_LABELS: Record<ReturnField, string> = {
  recap: "Where we left this person",
  changed: "What changed",
  decide: "What the learner must decide",
  principle: "Shared principle",
  cues: "New work cues",
  mistake: "Different plausible mistake",
  transfer: "What would count as transfer",
  workAction: "Next action at work",
};

export type ReturnProposal = {
  kind: "return";
  fields: { field: ReturnField; text: string; needsSource: boolean }[];
  rationale: string;
  used: UsedFact[];
  missing: string[];
  dropped: string[];
};

export function returnIssues(raw: unknown): string[] {
  const o = obj(obj(raw).fields);
  const out: string[] = [];
  if (str(o.recap, 900).length < 30) out.push('Give "fields.recap": where we left the person, in two sentences.');
  if (str(o.changed, 900).length < 20) out.push('Give "fields.changed": the one development.');
  if (str(o.decide, 900).length < 20) out.push('Give "fields.decide": what the learner must decide.');
  for (const f of RETURN_FIELDS) if (str(o[f], 2000).length > 600) out.push(`Keep "fields.${f}" under 600 characters.`);
  return out;
}

export function readReturnProposal(raw: unknown, ctx: { allowed: CanonPerson[]; later: { title: string; summary: string }[] }): ReturnProposal {
  const inline: string[] = [];
  const o = obj(liftRefs(raw, inline));
  const given = obj(o.fields);
  const dropped: string[] = [];
  const facts = ctx.allowed.flatMap((p) => p.facts.map((f) => f.text));
  const fields: ReturnProposal["fields"] = [];
  for (const field of RETURN_FIELDS) {
    const text = str(given[field], 600);
    if (!text) continue;
    const label = RETURN_FIELD_LABELS[field];
    // What happens later in the story is held back from learners, so it can't be in an opening.
    const gives = ctx.later.find((e) => contains(text, `${e.title} ${e.summary}`) >= GIVES_AWAY);
    if (gives) {
      dropped.push(`${label}: it gave away a later episode, “${gives.title}”.`);
      continue;
    }
    if (BRANCH.test(text)) {
      dropped.push(`${label}: it wrote a learner’s choice as if it had happened in the shared story.`);
      continue;
    }
    if (repeatsCanon(text, facts)) {
      dropped.push(`${label}: it recited an approved fact word for word. A return refers to the past in a phrase.`);
      continue;
    }
    fields.push({ field, text, needsSource: RULE.test(text) });
  }
  const { used, unknown } = resolveFacts([...list(o.facts, 30), ...inline], ctx.allowed);
  for (const ref of unknown) dropped.push(`A fact cited as “${ref}”: no approved fact has that id.`);
  return { kind: "return", fields, rationale: str(o.rationale, 500), used, missing: texts(o.missing, 8, 300), dropped };
}

export type NoteProposal = { kind: "note"; hooks: string[]; rationale: string; dropped: string[] };
export function readNoteProposal(raw: unknown, note: NoteData): NoteProposal {
  const o = obj(raw);
  const dropped: string[] = [];
  const hooks: string[] = [];
  for (const h of texts(o.hooks, 5, 240)) {
    const problems = noteProblems({ ...note, hook: h });
    if (problems.length) dropped.push(`“${h.slice(0, 60)}${h.length > 60 ? "…" : ""}”: ${problems[0]}`);
    else if (RULE.test(h)) dropped.push(`“${h.slice(0, 60)}${h.length > 60 ? "…" : ""}”: it states a rule. A note is an invitation, not guidance.`);
    else if (!hooks.includes(h)) hooks.push(h);
  }
  return { kind: "note", hooks: hooks.slice(0, 3), rationale: str(o.rationale, 400), dropped };
}

export type QuestionProposal = {
  kind: "question";
  context: string;
  prompt: string;
  choices: { id: string; text: string; verdict: "best" | "acceptable" | "risky"; feedback: string; needsSource: boolean }[];
  rationale: string;
  missing: string[];
  dropped: string[];
};
const VERDICTS = ["best", "acceptable", "risky"] as const;
const toQuestion = (raw: unknown): Question => {
  const o = obj(raw);
  return {
    prompt: str(o.prompt, 400),
    choices: list(o.choices, 5).map((c, i) => ({ id: `c${i + 1}`, text: str(obj(c).text, 300), verdict: str(obj(c).verdict, 20) })),
  };
};
/** An alternate that is the page's own question again is no alternate. */
const sameAsCurrent = (q: Question, current: Question | null) =>
  Boolean(current) && distinctness(current, q).problems.length > 0
    ? "This is the question the page already has. An alternate asks it a different way, with different options."
    : "";
/**
  Sent back to the model to fix: the shape, exactly one best answer, a question that isn't the first story's again,
  and (for an alternate) one that isn't the page's present question either.
*/
export function questionIssues(raw: unknown, first: Question | null, current: Question | null = null): string[] {
  const q = toQuestion(raw);
  const out: string[] = [];
  if (q.prompt.length < 15) out.push('Give the "prompt".');
  if (q.choices.length < 3 || q.choices.length > 4) out.push('Give three or four "choices".');
  if (q.choices.some((c) => c.text.length < 10)) out.push('Every choice needs its "text".');
  if (q.choices.some((c) => !VERDICTS.includes(c.verdict as (typeof VERDICTS)[number])))
    out.push('Each choice’s "verdict" is "best", "acceptable" or "risky".');
  if (q.choices.filter((c) => c.verdict === "best").length !== 1) out.push("Exactly one choice is the best one.");
  if (list(obj(raw).choices, 5).some((c) => str(obj(c).feedback, 800).length < 20))
    out.push('Every choice needs "feedback" on what that choice would leave unknown.');
  for (const p of distinctness(first, q).problems) out.push(`${p} Ask about a different judgement in the new situation.`);
  const same = sameAsCurrent(q, current);
  if (same) out.push(same);
  return out;
}
export function readQuestionProposal(raw: unknown, first: Question | null, current: Question | null = null): QuestionProposal {
  const found: string[] = [];
  const o = obj(liftRefs(raw, found));
  const dropped: string[] = [];
  const choices = list(o.choices, 4).map((c, i) => {
    const x = obj(c);
    const feedback = str(x.feedback, 500);
    const verdict = (
      VERDICTS.includes(str(x.verdict, 20) as (typeof VERDICTS)[number]) ? str(x.verdict, 20) : "acceptable"
    ) as QuestionProposal["choices"][number]["verdict"];
    return { id: `option-${i + 1}`, text: str(x.text, 280), verdict, feedback, needsSource: RULE.test(feedback) || RULE.test(str(x.text, 280)) };
  });
  const q: Question = { prompt: str(o.prompt, 400), choices: choices.map((c) => ({ id: c.id, text: c.text, verdict: c.verdict })) };
  // Checked again here, not only when asking: a draft that slipped through is said to repeat, and isn't offered.
  for (const p of distinctness(first, q).problems) dropped.push(p);
  const same = sameAsCurrent(q, current);
  if (same) dropped.push(same);
  if (choices.some((c) => BRANCH.test(c.feedback))) dropped.push("Feedback that writes the choice as shared story. Feedback is about one learner’s attempt.");
  return {
    kind: "question",
    context: str(o.context, 240),
    prompt: dropped.length ? "" : q.prompt,
    choices: dropped.length ? [] : choices,
    rationale: str(o.rationale, 500),
    missing: texts(o.missing, 8, 300),
    dropped,
  };
}

export type SummaryProposal = { kind: "summary"; text: string; dropped: string[] };
const numbersIn = (s: string) => (s.match(/\d+(?:\.\d+)?/g) ?? []).map((n) => String(Number(n)));
/**
  Sent back to the model to fix: a summary may describe what the page shows, and nothing else. It may not say the
  learning caused anything, and every number in it has to be one that is on the page.
*/
export function summaryIssues(raw: unknown, shown: string): string[] {
  const text = str(obj(raw).text, 2000);
  const out: string[] = [];
  if (text.length < 60) out.push('Give "text": three to five plain sentences.');
  if (text.length > 900) out.push("Keep it under 900 characters.");
  for (const c of causalClaims(text))
    out.push(`This says or implies cause, which the figures can’t show: “${c.slice(0, 120)}”. Describe what moved and when, and no more.`);
  const allowed = new Set(numbersIn(shown));
  const made = [...new Set(numbersIn(text))].filter((n) => !allowed.has(n));
  if (made.length) out.push(`These figures aren’t on the page: ${made.slice(0, 6).join(", ")}. Use only figures you were given.`);
  return out;
}
export function readSummary(raw: unknown, shown: string): SummaryProposal {
  const text = str(obj(raw).text, 900);
  const dropped = summaryIssues({ text }, shown);
  return { kind: "summary", text: dropped.length ? "" : text, dropped };
}

export type LivingProposal = ReturnProposal | NoteProposal | QuestionProposal | SummaryProposal;

/** What a model is told about a return in progress: the author's own fields. Never a case, a complaint or a learner's answer. */
export const returnBrief = (title: string, r: ReturnData) =>
  [
    `Working title: ${title}`,
    r.behaviour && `Work behaviour wanted: ${r.behaviour}`,
    r.barrier && `Barrier, and how sure anyone is: ${r.barrier}`,
    r.why && `Why a return: ${r.why}`,
    r.recap && `Recap so far: ${r.recap}`,
    r.changed && `What changed, so far: ${r.changed}`,
    r.decide && `Decision, so far: ${r.decide}`,
    r.principle && `Shared principle: ${r.principle}`,
    r.cues && `New cues: ${r.cues}`,
    r.mistake && `Different plausible mistake: ${r.mistake}`,
  ]
    .filter(Boolean)
    .join("\n");
