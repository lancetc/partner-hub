import type { Member, Post } from "@/content/community";

/*
  The Expectation Reset (docs/expectation-reset.md): a Magazine block with an illustrative waiting-period
  timeline and "How I Kept Them Warm" markers. Opening a marker shows where the story is, a reviewed check-in
  script, and up to three moderated peer approaches from the Community, each linking back to its post.

  - The months are story positions, never wait estimates or promises.
  - Peer posts stay in the Community. A lesson only refers to them, and follows their moderation: a withdrawn
    post disappears from the lesson at once. Popularity never makes a post authoritative.
  - Copying a phrase is a starting point. It sends nothing, records nothing and completes no follow-up.
*/

export type StoryNode = {
  id: string;
  /** A fictional story month, not an estimate. */
  month: number;
  label: string;
  summary: string;
};

export type Marker = {
  id: string;
  /** At a node, or between two nodes (without becoming a milestone itself). */
  anchor: { node: string; after: string; before: string };
  month: number;
  label: string;
  subtitle: string;
  theme: string;
  /** The stage tag a peer post has to match, such as "awaiting-allocation". */
  stage: string;
  roles: string[];
  story: { now: string; known: string[]; unknown: string[]; changed: string[] };
  /** "What would you say?" before the peers appear. */
  question: string;
  firstTake: boolean;
  featured: {
    text: string;
    /** The version addressed to the family member: only what the person has agreed they can receive. */
    family: string;
    why: string;
    reviewedBy: string;
    policyId: string;
    approvedOn: string;
    reviewDue: string;
  };
  /** The Community posts it may show, in order of preference. */
  postIds: string[];
  max: number;
  fallback: string;
  allowCopy: boolean;
  allowSave: boolean;
  /** Where something urgent goes: an approved pathway, never the Community. */
  urgent: string;
};

export type ResetBlockData = {
  title: string;
  intro: string;
  person: { name: string; about: string };
  family: { name: string; relation: string };
  /** What the person has agreed the family member can be told. */
  consent: string;
  nodes: StoryNode[];
  markers: Marker[];
  /** Whether the business has approved a free pre-onboarding chat, and its exact scope. */
  offer: { approved: boolean; scope: string };
  source: { title: string; version: string };
  approval: { owner: string; operations: string; quality: string; privacy: string; communications: string; approvedOn: string };
};

export const RESET_NOTICE =
  "An illustrative story with made-up people. The months are positions in the story, not wait estimates or promises. Nothing here contacts anyone or records a follow-up.";
export const PEER_LABEL = "Peer practice";
export const REVIEWED_LABEL = "Reviewed approach";
export const COPY_NOTE = "A starting point. Copying it doesn’t send a message, create a record or complete a follow-up.";
export const OFFER_UNAPPROVED = "Ask whether a pre-onboarding conversation is available. Don’t describe it as free or confirmed.";
export const EMPTY_PEERS = "More peer approaches will appear here.";

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
const date = (v: unknown) => (typeof v === "string" && /^\d{4}-\d{2}-\d{2}$/.test(v) ? v : "");
const ids = (v: unknown, max = 12) => (Array.isArray(v) ? v.filter((x): x is string => typeof x === "string").slice(0, max) : []);
const int = (v: unknown, lo: number, hi: number, d: number) =>
  v !== null && v !== "" && Number.isFinite(Number(v)) ? Math.min(hi, Math.max(lo, Math.round(Number(v)))) : d;

/**
  The block's fields, checked. Publishing needs at least two story nodes, every marker anchored to a node or
  between two, a reviewed script with its reviewer, approval and review dates, a family version, where urgent
  things go, and sign-off from Care Operations, Quality, Privacy and Communications.
*/
export function parseReset(o: Raw, where: string, h: ParseHelpers): ResetBlockData {
  const { str, idOf, list, unfinished } = h;
  const texts = (v: unknown, what: string, max: number, n: number) =>
    (Array.isArray(v) ? v : [])
      .slice(0, n)
      .map((x, i) => str(x, `${where} ${what} ${i + 1}`, { max }) ?? "")
      .filter(Boolean);
  const nodes = list(o.nodes, where, "story points", 12).map((n, i): StoryNode => ({
    id: idOf(n.id, `${where} story point ${i + 1}`),
    month: int(n.month, 0, 36, i),
    label: str(n.label, `${where} story point ${i + 1}`, { required: true, max: 80 }) ?? "",
    summary: str(n.summary, `${where} story point ${i + 1} summary`, { max: 400 }) ?? "",
  }));
  if (nodes.length < 2) unfinished(`${where} needs at least two story points.`);
  nodes.sort((a, b) => a.month - b.month);
  const nodeIds = new Set(nodes.map((n) => n.id));
  const markers = list(o.markers, where, "markers", 6).map((m, i): Marker => {
    const at = `${where} marker ${i + 1}`;
    const a = obj(m.anchor);
    const node = typeof a.node === "string" && nodeIds.has(a.node) ? a.node : "";
    const after = !node && typeof a.after === "string" && nodeIds.has(a.after) ? a.after : "";
    const before = !node && typeof a.before === "string" && nodeIds.has(a.before) ? a.before : "";
    if (!node && !(after && before)) unfinished(`${at} needs a story point, or two story points to sit between.`);
    if (after && before && nodes.findIndex((n) => n.id === after) >= nodes.findIndex((n) => n.id === before))
      unfinished(`${at}: the first story point must come before the second.`);
    const f = obj(m.featured);
    const s = obj(m.story);
    return {
      id: idOf(m.id, at),
      anchor: { node, after, before },
      month: int(m.month, 0, 36, 0),
      label: str(m.label, `${at} label`, { required: true, max: 60 }) ?? "",
      subtitle: str(m.subtitle, `${at} subtitle`, { max: 120 }) ?? "",
      theme: str(m.theme, `${at} theme`, { max: 80 }) ?? "",
      stage: str(m.stage, `${at} stage tag`, { required: true, max: 60 }) ?? "",
      roles: ids(m.roles, 6),
      story: {
        now: str(s.now, `${at}: where the story is`, { required: true, max: 600 }) ?? "",
        known: texts(s.known, `${at.replace(where, "").trim()} known`, 240, 6),
        unknown: texts(s.unknown, `${at.replace(where, "").trim()} unknown`, 240, 6),
        changed: texts(s.changed, `${at.replace(where, "").trim()} changed`, 240, 6),
      },
      question: str(m.question, `${at} question`, { max: 240 }) ?? "",
      firstTake: m.firstTake === true,
      featured: {
        text: str(f.text, `${at}: the reviewed script`, { required: true, max: 1200 }) ?? "",
        family: str(f.family, `${at}: the version for the family`, { required: true, max: 1200 }) ?? "",
        why: str(f.why, `${at}: why it works`, { required: true, max: 600 }) ?? "",
        reviewedBy: str(f.reviewedBy, `${at}: who reviewed the script`, { max: 120 }) ?? "",
        policyId: str(f.policyId, `${at}: the policy or SOP`, { max: 80 }) ?? "",
        approvedOn: date(f.approvedOn),
        reviewDue: date(f.reviewDue),
      },
      postIds: ids(m.postIds, 12),
      max: int(m.max, 0, 3, 3),
      fallback: str(m.fallback, `${at} fallback`, { max: 240 }) ?? "",
      allowCopy: m.allowCopy !== false,
      allowSave: m.allowSave !== false,
      urgent: str(m.urgent, `${at}: where something urgent goes`, { required: true, max: 400 }) ?? "",
    };
  });
  if (!markers.length) unfinished(`${where} needs at least one marker.`);
  for (const m of markers)
    if (!m.featured.reviewedBy || !m.featured.approvedOn || !m.featured.reviewDue)
      unfinished(`${where} marker “${m.label}”: record who reviewed the script, when, and when it’s due for review.`);
  const off = obj(o.offer);
  const offer = { approved: off.approved === true, scope: str(off.scope, `${where}: the approved offer’s scope`, { max: 400 }) ?? "" };
  if (offer.approved && !offer.scope) unfinished(`${where}: an approved offer needs its exact scope.`);
  const s = obj(o.source);
  const ap = obj(o.approval);
  const approval = {
    owner: str(ap.owner, `${where} content owner`, { max: 120 }) ?? "",
    operations: str(ap.operations, `${where} Care Operations reviewer`, { max: 120 }) ?? "",
    quality: str(ap.quality, `${where} Quality reviewer`, { max: 120 }) ?? "",
    privacy: str(ap.privacy, `${where} Privacy reviewer`, { max: 120 }) ?? "",
    communications: str(ap.communications, `${where} Communications reviewer`, { max: 120 }) ?? "",
    approvedOn: date(ap.approvedOn),
  };
  const source = { title: str(s.title, `${where} source`, { max: 200 }) ?? "", version: str(s.version, `${where} source version`, { max: 80 }) ?? "" };
  if (!resetApproved({ approval, source }))
    unfinished(
      `${where}: sign-off is required. Record the content owner, the Care Operations, Quality, Privacy and Communications reviewers, the date, and the source and its version.`,
    );
  const p = obj(o.person);
  const fam = obj(o.family);
  return {
    title: str(o.title, `${where} title`, { required: true, max: 160 }) ?? "",
    intro: str(o.intro, `${where} introduction`, { max: 600 }) ?? "",
    person: {
      name: str(p.name, `${where}: the person’s name`, { required: true, max: 80 }) ?? "",
      about: str(p.about, `${where}: about the person`, { max: 400 }) ?? "",
    },
    family: {
      name: str(fam.name, `${where}: the family member’s name`, { max: 80 }) ?? "",
      relation: str(fam.relation, `${where}: relationship`, { max: 60 }) ?? "",
    },
    consent: str(o.consent, `${where}: what the family member may be told`, { required: true, max: 400 }) ?? "",
    nodes,
    markers,
    offer,
    source,
    approval,
  };
}

export const resetApproved = (b: { approval: ResetBlockData["approval"]; source: { title: string; version: string } }) =>
  Boolean(
    b.approval.owner &&
    b.approval.operations &&
    b.approval.quality &&
    b.approval.privacy &&
    b.approval.communications &&
    b.approval.approvedOn &&
    b.source.title &&
    b.source.version,
  );

export function freshReset(data: ResetBlockData, tag = Math.random().toString(36).slice(2, 7)): ResetBlockData {
  const re = (id: string) => (id ? `${id.replace(/-x[a-z0-9]{5}$/, "")}-x${tag}` : "");
  const c = structuredClone(data);
  return {
    ...c,
    nodes: c.nodes.map((n) => ({ ...n, id: re(n.id) })),
    markers: c.markers.map((m) => ({ ...m, id: re(m.id), anchor: { node: re(m.anchor.node), after: re(m.anchor.after), before: re(m.anchor.before) } })),
  };
}

// ---------------------------------------------------------------------------------------------
// Which peer posts a marker can show
// ---------------------------------------------------------------------------------------------

/** A reviewed script past its review date: shown as under review, and it can't be copied. */
export const isStale = (m: Pick<Marker, "featured">, today: string) => !m.featured.reviewDue || m.featured.reviewDue < today;

export type PeerCard = {
  postId: string;
  title: string;
  /** Name and role, or role only, as the contributor chose. */
  author: string;
  role: string;
  verified: boolean;
  /** Days since it was posted, from the Community. */
  daysAgo: number;
  when: string;
  script: string;
  next: string;
  likes: number;
  comments: number;
  offer: boolean;
  differs: string;
  reviewDue: string;
};

/**
  The posts a marker may show: in its list, approved for learning, the contributor's role verified and their
  consent given, matching the marker's stage and a role it's for, within the review date, and not withdrawn in
  the Community. Ranked by a blend of helpfulness and recency, never by votes alone, and capped.
*/
export function eligiblePosts(
  m: Pick<Marker, "postIds" | "stage" | "roles" | "max">,
  posts: Post[],
  members: Pick<Member, "id" | "name" | "role">[],
  withdrawn: Set<string>,
  today: string,
): PeerCard[] {
  const byId = new Map(posts.map((p) => [p.id, p]));
  return m.postIds
    .map((id) => byId.get(id))
    .filter((p): p is Post & { learning: NonNullable<Post["learning"]> } => {
      const l = p?.learning;
      return Boolean(
        p &&
        l &&
        !withdrawn.has(p.id) &&
        l.reuse === "approved" &&
        l.consent &&
        l.verified &&
        l.stages.includes(m.stage) &&
        (!m.roles.length || l.roles.some((r) => m.roles.includes(r))) &&
        l.reviewDue >= today,
      );
    })
    .map((p) => {
      const who = members.find((x) => x.id === p.authorId);
      const helpful = p.likes + 2 * p.comments.length;
      return {
        card: {
          postId: p.id,
          title: p.title,
          author: p.learning.attribution === "name" && who ? who.name : "",
          role: who?.role ?? "",
          verified: p.learning.verified,
          daysAgo: Math.floor(p.hoursAgo / 24),
          when: p.learning.when,
          script: p.learning.script,
          next: p.learning.next,
          likes: p.likes,
          comments: p.comments.length,
          offer: Boolean(p.learning.offer),
          differs: p.learning.differs ?? "",
          reviewDue: p.learning.reviewDue,
        },
        rank: helpful - p.hoursAgo / 24,
      };
    })
    .sort((a, b) => b.rank - a.rank)
    .slice(0, m.max)
    .map((x) => x.card);
}

// ---------------------------------------------------------------------------------------------
// The learner's own progress, and the copy checks
// ---------------------------------------------------------------------------------------------

export type ResetProgress = {
  opened: string[];
  /** Private first takes, by marker. Only the learner reads them back. */
  takes: Record<string, string>;
  /** Saved phrases: "featured:<marker>" or "post:<id>". */
  saved: string[];
};
export const emptyProgress = (): ResetProgress => ({ opened: [], takes: {}, saved: [] });
export function cleanProgress(b: ResetBlockData, raw: unknown): ResetProgress {
  const r = obj(raw);
  const markerIds = new Set(b.markers.map((m) => m.id));
  const postIds = new Set(b.markers.flatMap((m) => m.postIds));
  const takes: Record<string, string> = {};
  for (const [k, v] of Object.entries(obj(r.takes))) if (markerIds.has(k) && typeof v === "string") takes[k] = v.slice(0, 1500);
  return {
    opened: [...new Set(ids(r.opened, 12).filter((x) => markerIds.has(x)))],
    takes,
    saved: [
      ...new Set(
        ids(r.saved, 30).filter((x) => (x.startsWith("featured:") && markerIds.has(x.slice(9))) || (x.startsWith("post:") && postIds.has(x.slice(5)))),
      ),
    ],
  };
}

/** The checks before a phrase can be copied. The family version also needs the person's information-sharing choice checked. */
export function copyChecks(forFamily: boolean, person: string, family: string) {
  return [
    { id: "status", label: `I’ve checked ${person}’s current status in the record` },
    { id: "next", label: "I’ve agreed the next contact and who owns it" },
    ...(forFamily ? [{ id: "consent", label: `I’ve checked what ${person} has agreed ${family || "the family"} can be told` }] : []),
  ];
}

/** Where each marker sits on the story's line: at a node, or between two. */
export function markerPosition(b: Pick<ResetBlockData, "nodes">, m: Pick<Marker, "anchor">) {
  const i = b.nodes.findIndex((n) => n.id === m.anchor.node);
  if (i >= 0) return { at: i, between: null as null | [number, number] };
  const a = b.nodes.findIndex((n) => n.id === m.anchor.after);
  const c = b.nodes.findIndex((n) => n.id === m.anchor.before);
  return { at: -1, between: a >= 0 && c >= 0 ? ([a, c] as [number, number]) : null };
}

export const EVENTS = ["opened", "featured", "peer_viewed", "saved", "discussion", "take", "copied", "flagged"] as const;
export type ResetEvent = (typeof EVENTS)[number];
