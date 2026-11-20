/*
  Peer benchmark poll (docs/peer-benchmark-poll.md): a learner commits to a next step in a fictional grey-area
  case, then sees how peers chose, beside a reviewed perspective and moderated Community reasoning. Everything
  here is pure, so the server, the learner's page and the editor's preview run the same rules.

  - Peer results appear only after the learner's own first answer is locked. One vote per person per version.
  - A majority describes what people chose. It's never the answer key, and it never grades anyone.
  - Cohorts come from the person's verified Hub role at the time they vote. A group below the disclosure
    threshold is hidden, and so is any total that would let it be worked out by subtraction.
  - Results are served in batches, never vote by vote.
*/

export const AUDIENCES = { partner: "Care Partners", coordinator: "Care coordinators", staff: "Trilogy Care staff" } as const;
export type Audience = keyof typeof AUDIENCES;
const AUDIENCE_IDS = Object.keys(AUDIENCES) as Audience[];

export const KINDS = {
  preferred: "The reviewed next step",
  defensible: "Defensible, with a deciding fact",
  insufficient: "Not enough on its own",
  critical: "Needs a debrief",
} as const;
export type ChoiceKind = keyof typeof KINDS;

export const CONFIDENCE = { low: "Low", medium: "Medium", high: "High" } as const;
export type Confidence = keyof typeof CONFIDENCE;

export type BenchmarkChoice = { id: string; text: string; kind: ChoiceKind; feedback: string };
export type Cohort = { id: string; label: string; audiences: Audience[] };

export type BenchmarkBlockData = {
  title: string;
  intro: string;
  scenario: {
    heading: string;
    /** Who the learner is in the case. */
    role: string;
    facts: string[];
    unknowns: string[];
    question: string;
  };
  /** Raise it when the case changes materially. Votes on different versions are never blended. */
  version: number;
  choices: BenchmarkChoice[];
  askConfidence: boolean;
  askReason: boolean;
  /** The reviewed perspective, shown beside the results. Never derived from them. */
  perspective: {
    label: string;
    /** The case needs the approved escalation teaching point, whatever peers chose. */
    critical: boolean;
    reasoning: string;
    checkNext: string;
    /** Facts that would change the urgency. */
    thresholds: string;
    /** Where more than one action is defensible, the fact that tells them apart. */
    distinguish: string;
    nextStep: string;
  };
  policy: { id: string; title: string; url: string; version: string };
  cohorts: Cohort[];
  /** Fewer responses than this and a group isn't shown. */
  minCohort: number;
  /** Results are published in batches this many minutes apart. */
  batchMinutes: number;
  /** The canonical fictional-case thread, and the rationales from it shown as peer reasoning. */
  community: { postId: string; rationales: { commentId: string; endorsedBy: string; endorsedOn: string }[] };
  /** After this day (YYYY-MM-DD) the guidance and results pause until it's reviewed again. */
  reviewDue: string;
  approval: { owner: string; operations: string; clinical: string; quality: string; privacy: string; approvedOn: string };
};

export const POLL_NOTICE =
  "A fictional case for practice. Nothing here contacts anyone or starts a welfare check: a real concern goes through the operational process.";
export const NOT_A_SURVEY = "A self-selected training poll, not a representative survey. A majority is what people chose, not the right answer.";
export const RESULTS_EMPTY = "Results will appear once enough peers have responded.";
export const SUPPRESSED = "Not enough responses to display this group.";
export const PAUSED = "The reviewed guidance and peer results are paused while this case’s policy is reviewed. Your decision is saved.";
export const MIN_COHORT_FLOOR = 10;

// ---------------------------------------------------------------------------------------------
// Reading a block from stored JSON
// ---------------------------------------------------------------------------------------------

type Raw = Record<string, unknown>;
export type ParseHelpers = {
  str: (v: unknown, where: string, opts?: { required?: boolean; max?: number }) => string | undefined;
  idOf: (v: unknown, where: string) => string;
  list: (v: unknown, where: string, what: string, max: number) => Raw[];
  unfinished: (problem: string) => void;
};
const obj = (v: unknown): Raw => (v && typeof v === "object" ? (v as Raw) : {});
const oneOf = <T extends string>(v: unknown, all: readonly T[], d: T): T => (all.includes(v as T) ? (v as T) : d);
const date = (v: unknown) => (typeof v === "string" && /^\d{4}-\d{2}-\d{2}$/.test(v) ? v : "");
const int = (v: unknown, min: number, max: number, d: number) => (Number.isInteger(v) ? Math.min(max, Math.max(min, v as number)) : d);

/**
  The block's fields, checked. It needs two to six choices with one reviewed next step, cohorts that don't
  overlap (so nobody is counted twice), a disclosure threshold of at least ten, a review date, and sign-off from
  Care Operations, Clinical, Quality and Privacy with the policy's version.
*/
export function parseBenchmark(o: Raw, where: string, h: ParseHelpers): BenchmarkBlockData {
  const { str, idOf, list, unfinished } = h;
  const texts = (v: unknown, what: string, max: number, n: number) =>
    (Array.isArray(v) ? v : [])
      .slice(0, n)
      .map((x, i) => str(x, `${where} ${what} ${i + 1}`, { max }) ?? "")
      .filter(Boolean);
  const sc = obj(o.scenario);
  const scenario = {
    heading: str(sc.heading, `${where} scenario heading`, { required: true, max: 120 }) ?? "",
    role: str(sc.role, `${where}: the learner’s role in the case`, { max: 160 }) ?? "",
    facts: texts(sc.facts, "fact", 300, 8),
    unknowns: texts(sc.unknowns, "unknown", 300, 6),
    question: str(sc.question, `${where} question`, { required: true, max: 200 }) ?? "",
  };
  if (!scenario.facts.length) unfinished(`${where} needs the case’s facts.`);

  const choices = list(o.choices, where, "choices", 6).map((c, i): BenchmarkChoice => ({
    id: idOf(c.id, `${where} choice ${i + 1}`),
    text: str(c.text, `${where} choice ${i + 1}`, { required: true, max: 300 }) ?? "",
    kind: oneOf(c.kind, Object.keys(KINDS) as ChoiceKind[], "insufficient"),
    feedback: str(c.feedback, `${where} choice ${i + 1} feedback`, { required: true, max: 500 }) ?? "",
  }));
  if (choices.length < 2) unfinished(`${where} needs at least two choices.`);
  if (!choices.some((c) => c.kind === "preferred")) unfinished(`${where} needs a choice marked as the reviewed next step.`);

  const p = obj(o.perspective);
  const perspective = {
    label: str(p.label, `${where} perspective label`, { max: 80 }) || "Clinical and Quality perspective",
    critical: p.critical === true,
    reasoning: str(p.reasoning, `${where}: the reviewed reasoning`, { required: true, max: 800 }) ?? "",
    checkNext: str(p.checkNext, `${where}: what to check next`, { required: true, max: 600 }) ?? "",
    thresholds: str(p.thresholds, `${where}: facts that change the urgency`, { required: true, max: 600 }) ?? "",
    distinguish: str(p.distinguish, `${where}: the fact that tells defensible options apart`, { max: 600 }) ?? "",
    nextStep: str(p.nextStep, `${where}: the next step`, { required: true, max: 600 }) ?? "",
  };

  const pol = obj(o.policy);
  const policy = {
    id: str(pol.id, `${where} policy ID`, { max: 80 }) ?? "",
    title: str(pol.title, `${where} policy`, { max: 200 }) ?? "",
    url: typeof pol.url === "string" && /^https:\/\//.test(pol.url) ? pol.url.slice(0, 400) : "",
    version: str(pol.version, `${where} policy version`, { max: 80 }) ?? "",
  };

  const seen = new Set<Audience>();
  const cohorts = list(o.cohorts, where, "cohorts", 3).map((c, i): Cohort => {
    const audiences = [...new Set((Array.isArray(c.audiences) ? c.audiences : []).filter((a): a is Audience => AUDIENCE_IDS.includes(a as Audience)))];
    if (!audiences.length) unfinished(`${where} cohort ${i + 1} needs at least one verified role.`);
    for (const a of audiences) {
      if (seen.has(a)) unfinished(`${where}: ${AUDIENCES[a]} are in more than one cohort. Each person is counted once.`);
      seen.add(a);
    }
    return { id: idOf(c.id, `${where} cohort ${i + 1}`), label: str(c.label, `${where} cohort ${i + 1} label`, { required: true, max: 60 }) ?? "", audiences };
  });

  const cm = obj(o.community);
  const community = {
    postId: typeof cm.postId === "string" ? cm.postId.slice(0, 80) : "",
    rationales: list(cm.rationales, where, "peer rationales", 2).map((r) => ({
      commentId: typeof r.commentId === "string" ? r.commentId.slice(0, 80) : "",
      endorsedBy: str(r.endorsedBy, `${where} endorsement`, { max: 120 }) ?? "",
      endorsedOn: date(r.endorsedOn),
    })),
  };

  const a = obj(o.approval);
  const approval = {
    owner: str(a.owner, `${where} content owner`, { max: 120 }) ?? "",
    operations: str(a.operations, `${where} Care Operations reviewer`, { max: 120 }) ?? "",
    clinical: str(a.clinical, `${where} Clinical reviewer`, { max: 120 }) ?? "",
    quality: str(a.quality, `${where} Quality reviewer`, { max: 120 }) ?? "",
    privacy: str(a.privacy, `${where} Privacy reviewer`, { max: 120 }) ?? "",
    approvedOn: date(a.approvedOn),
  };
  const reviewDue = date(o.reviewDue);
  if (!benchmarkApproved({ approval, policy, reviewDue }))
    unfinished(
      `${where}: sign-off is required. Record the content owner, the Care Operations, Clinical, Quality and Privacy reviewers, the date, the policy and its version, and when it’s next reviewed.`,
    );
  return {
    title: str(o.title, `${where} title`, { required: true, max: 160 }) ?? "",
    intro: str(o.intro, `${where} introduction`, { max: 600 }) ?? "",
    scenario,
    version: int(o.version, 1, 999, 1),
    choices,
    askConfidence: o.askConfidence !== false,
    askReason: o.askReason !== false,
    perspective,
    policy,
    cohorts,
    minCohort: int(o.minCohort, MIN_COHORT_FLOOR, 500, 20),
    batchMinutes: int(o.batchMinutes, 5, 1440, 15),
    community,
    reviewDue,
    approval,
  };
}

export const benchmarkApproved = (b: { approval: BenchmarkBlockData["approval"]; policy: { title: string; version: string }; reviewDue: string }) =>
  Boolean(
    b.approval.owner &&
    b.approval.operations &&
    b.approval.clinical &&
    b.approval.quality &&
    b.approval.privacy &&
    b.approval.approvedOn &&
    b.policy.title &&
    b.policy.version &&
    b.reviewDue,
  );

/** Past its review date, the guidance and results pause until it's reviewed. */
export const benchmarkStale = (b: Pick<BenchmarkBlockData, "reviewDue">, today: string) => Boolean(b.reviewDue && today && b.reviewDue < today);

/** The reader's copy: the case and the choices, without how each choice reads or the reviewed perspective. */
export function benchmarkForReaders<T extends BenchmarkBlockData>(b: T): T {
  return {
    ...b,
    choices: b.choices.map((c) => ({ ...c, kind: "insufficient" as const, feedback: "" })),
    perspective: { label: b.perspective.label, critical: false, reasoning: "", checkNext: "", thresholds: "", distinguish: "", nextStep: "" },
  };
}

export function freshBenchmark(data: BenchmarkBlockData, tag = Math.random().toString(36).slice(2, 7)): BenchmarkBlockData {
  const re = (id: string) => (id ? `${id.replace(/-x[a-z0-9]{5}$/, "")}-x${tag}` : "");
  const c = structuredClone(data);
  return { ...c, choices: c.choices.map((x) => ({ ...x, id: re(x.id) })), cohorts: c.cohorts.map((x) => ({ ...x, id: re(x.id) })) };
}

/**
  Which votes belong together: the author's version, plus a fingerprint of the choices, the cohorts and the
  policy. Changing any of them starts a fresh tally, so incompatible votes are never blended.
*/
export function versionKey(b: Pick<BenchmarkBlockData, "version" | "choices" | "cohorts" | "policy">): string {
  const s = JSON.stringify([b.choices.map((c) => [c.id, c.text]), b.cohorts.map((c) => [c.id, c.audiences]), b.policy.id, b.policy.version]);
  let h = 5381;
  for (let i = 0; i < s.length; i++) h = ((h * 33) ^ s.charCodeAt(i)) >>> 0;
  return `v${b.version}-${h.toString(36)}`;
}

/** The cohort a verified role belongs to, or "" when it's in none (counted in "All" only). */
export const cohortOf = (b: Pick<BenchmarkBlockData, "cohorts">, audience: string) =>
  b.cohorts.find((c) => c.audiences.includes(audience as Audience))?.id ?? "";

// ---------------------------------------------------------------------------------------------
// Results
// ---------------------------------------------------------------------------------------------

export type Vote = { choice: string; cohort: string };
export type ResultRow = { choiceId: string; text: string; count: number; pct: number };
export type ResultGroup = { id: string; label: string; shown: boolean; n: number | null; rows: ResultRow[] };
export type Results = { asOf: string; total: number | null; empty: boolean; groups: ResultGroup[] };

const rowsOf = (b: Pick<BenchmarkBlockData, "choices">, votes: Vote[]): ResultRow[] =>
  b.choices.map((c) => {
    const count = votes.filter((v) => v.choice === c.id).length;
    return { choiceId: c.id, text: c.text, count, pct: votes.length ? Math.round((count / votes.length) * 100) : 0 };
  });

/**
  Disclosure-checked results. A cohort below the threshold is hidden (no count, no percentages). "All" is shown
  only if it's over the threshold and what it holds beyond the shown cohorts is either nothing or over the
  threshold too, so a hidden group can never be worked out by subtracting one total from another.
*/
export function aggregate(b: Pick<BenchmarkBlockData, "choices" | "cohorts" | "minCohort">, votes: Vote[], asOf: string): Results {
  const min = Math.max(MIN_COHORT_FLOOR, b.minCohort);
  const cohorts = b.cohorts.map((c) => {
    const mine = votes.filter((v) => v.cohort === c.id);
    return { c, mine, shown: mine.length >= min };
  });
  const remainder = votes.length - cohorts.filter((x) => x.shown).reduce((n, x) => n + x.mine.length, 0);
  const allShown = votes.length >= min && (remainder === 0 || remainder >= min);
  const group = (id: string, label: string, shown: boolean, vs: Vote[]): ResultGroup => ({
    id,
    label,
    shown,
    n: shown ? vs.length : null,
    rows: shown ? rowsOf(b, vs) : [],
  });
  return {
    asOf,
    total: allShown ? votes.length : null,
    empty: !cohorts.some((x) => x.shown) && !allShown,
    groups: [group("all", "All eligible respondents", allShown, votes), ...cohorts.map((x) => group(x.c.id, x.c.label, x.shown, x.mine))],
  };
}

/** The batch a moment falls in: results include votes locked before this time. */
export function batchCutoff(now: Date, minutes: number): Date {
  const ms = Math.max(5, minutes) * 60_000;
  return new Date(Math.floor(now.getTime() / ms) * ms);
}

/** How a locked choice reads against the reviewed key. Never against the vote share. */
export function readChoice(b: Pick<BenchmarkBlockData, "choices">, choiceId: string) {
  const c = b.choices.find((x) => x.id === choiceId);
  return c ? { choiceId: c.id, text: c.text, kind: c.kind, label: KINDS[c.kind], feedback: c.feedback } : null;
}
export type ChoiceReading = NonNullable<ReturnType<typeof readChoice>>;

// ---------------------------------------------------------------------------------------------
// Peer reasoning from the Community
// ---------------------------------------------------------------------------------------------

type PostLike = { id: string; title: string; comments: { id: string; authorId: string; body: string; likes: number }[] };
type MemberLike = { id: string; name: string; role: string };
export type PeerReason = { commentId: string; body: string; name: string; role: string; likes: number; endorsedBy: string; endorsedOn: string };

/**
  The rationales the author chose from the case thread, most liked first. Nothing shows if the thread is
  withdrawn in the Community. Likes only order them: they never change the reviewed guidance, and "Reviewed and
  endorsed" shows only when a reviewer and date are recorded.
*/
export function peerReasoning(b: Pick<BenchmarkBlockData, "community">, posts: PostLike[], members: MemberLike[], withdrawn: Set<string>) {
  const post = posts.find((p) => p.id === b.community.postId);
  if (!post || withdrawn.has(post.id)) return { thread: null, reasons: [] as PeerReason[] };
  const reasons = b.community.rationales
    .map((r) => {
      const c = post.comments.find((x) => x.id === r.commentId);
      if (!c) return null;
      const who = members.find((m) => m.id === c.authorId);
      return {
        commentId: c.id,
        body: c.body,
        name: who?.name ?? "",
        role: who?.role ?? "",
        likes: c.likes,
        endorsedBy: r.endorsedBy && r.endorsedOn ? r.endorsedBy : "",
        endorsedOn: r.endorsedBy && r.endorsedOn ? r.endorsedOn : "",
      };
    })
    .filter((x): x is PeerReason => Boolean(x))
    .sort((x, y) => y.likes - x.likes);
  return { thread: { id: post.id, title: post.title }, reasons };
}

// ---------------------------------------------------------------------------------------------
// The editor's preview
// ---------------------------------------------------------------------------------------------

export const SIMS = {
  empty: "No responses yet",
  small: "One cohort too small to show",
  enough: "Enough responses (a labelled sample)",
  offline: "Results service unavailable",
  stale: "Policy past its review date",
} as const;
export type Sim = keyof typeof SIMS;

/** A made-up spread for the editor's preview, so an author can see the panel. It's never stored or served as results. */
export function sampleVotes(b: Pick<BenchmarkBlockData, "choices" | "cohorts">, sim: Sim): Vote[] {
  if (sim === "empty" || sim === "offline" || sim === "stale" || !b.choices.length) return [];
  const sizes = b.cohorts.map((_, i) => (sim === "small" ? (i === 0 ? 46 : 6) : i === 0 ? 64 : 27));
  const out: Vote[] = [];
  b.cohorts.forEach((c, i) => {
    for (let k = 0; k < sizes[i]; k++)
      out.push({ cohort: c.id, choice: b.choices[(k * 7 + i * 3) % 5 < 3 ? 1 % b.choices.length : (k + i) % b.choices.length].id });
  });
  return out;
}
