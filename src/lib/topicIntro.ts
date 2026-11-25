import type { Card, CardVisual, Lesson } from "@/content/lessons";
import { plainText } from "./richText";
import { materiallyChanged, secondsFor, snapshotOf, textHash, wordCount, type ContentSnapshot, type MediaProvider, type MediaStatus } from "./mediaStudio";

/*
  Topic Video Introductions (docs/topic-video-introductions.md). Every Topic opens with its Introduction card: the
  existing `presenter` card type, marked with `intro`. It is structural: always first, made with every new Topic,
  editable but never removed or moved. Learners see a portrait presenter (a video when one is approved, otherwise the
  presenter's placeholder portrait), the Topic's title and a short description, and "Let's get started".

  What learners see lives where it always has on a presenter card (heading, body, transcript, visual). The working
  copy lives in `intro`: the script being written, a video waiting for approval, the presenter profile and production.
  So editing a script, or uploading a new video, never changes the published introduction until the author approves it
  (and then publishes the Topic, as with any change). These are the rules the editor, the player and the server share.
*/

/** About 15 to 30 seconds spoken. */
export const INTRO_WORDS = { min: 35, max: 70 } as const;
/** The id a new Introduction card gets (with -2, -3… if a Topic already has a card called that). */
export const INTRO_CARD_ID = "topic-intro";
export const INTRO_LABEL = "Introduction";

export type IntroPicture = { src: string; width: number; height: number; position?: string };

/*
  Presenter profiles: who presents, independent of any one Topic. Stored in a small table (server/introPresenters.ts);
  this is the shape both sides use. Provider ids stay empty until a provider is set up.
*/
export type PresenterProfile = {
  id: string;
  name: string;
  description: string;
  portrait: IntroPicture;
  provider: MediaProvider;
  avatarId: string;
  voiceId: string;
  templateId: string;
  language: string;
  accent: string;
  deliveryStyle: string;
  /** Who the presenter suits (empty: everyone). Kept for presenters for different professional audiences later. */
  audience: string;
  active: boolean;
  isDefault: boolean;
};

/**
  The default presenter, seeded into the table on first use and used wherever the table can't be read. The portrait is
  an existing picture in the Hub's image library (a smiling coordinator in a teal blouse at her desk, in a bright
  office: approachable, professional, softly lit, with Trilogy Care's teal), cropped to a 9:16 window around her.
  Authors can replace it, or give any Topic its own placeholder, through the image library.
*/
export const DEFAULT_PRESENTER: PresenterProfile = {
  id: "learning-presenter",
  name: "Your learning presenter",
  description: "An approachable Trilogy Care learning presenter for Topic introductions. The portrait stands in until presenter videos are made.",
  portrait: { src: "/api/uploads/57497f37-a3dc-4248-8041-c233d56617ff.webp", width: 2400, height: 1340, position: "72% 40%" },
  provider: "synthesia",
  avatarId: "",
  voiceId: "",
  templateId: "",
  language: "en-AU",
  accent: "Australian",
  deliveryStyle: "Warm, conversational and professionally confident; unhurried, never salesy.",
  audience: "",
  active: true,
  isDefault: true,
};

export type IntroScript = {
  /** What the presenter says. (Not called `text`: lesson text fields are machine translated, and scripts stay in English.) */
  spoken: string;
  status: "draft" | "approved";
  /** 1 for the first script, one more each time an approved script is replaced. */
  version: number;
  origin: "ai" | "author" | "existing";
  /** The drafting model, for a script AI wrote. */
  model?: string;
  draftedAt?: string;
  approvedAt?: string;
  approvedBy?: string;
  /** The Topic when the script was approved, for the outdated flag. */
  basis?: ContentSnapshot;
  /** The Topic's version when the script was approved. */
  basedOn?: string;
};

export type IntroVideo = {
  src: string;
  poster?: string;
  captionsVtt?: string;
  seconds?: number;
  provider: MediaProvider;
  /** The provider's id for the generation (a Synthesia video id, say). */
  generationId?: string;
  /** The presenter profile it was made with. */
  profile?: string;
  /** The approved script it says. */
  scriptHash: string;
  at?: string;
  /** What it cost to make, in US dollars, where known. */
  cost?: number;
  approvedAt?: string;
  approvedBy?: string;
};

/** Video production. Nothing is ever sent to a provider without an author confirming it (docs/topic-video-introductions.md). */
export type IntroProduction = {
  state: "ready" | "generating" | "generated" | "failed";
  provider: MediaProvider;
  profile: string;
  scriptHash: string;
  at: string;
  by?: string;
  generationId?: string;
  estCost?: number | null;
  actualCost?: number | null;
  error?: string;
};

export type TopicIntro = {
  /** "intro": the introduction screen. "legacy": an existing presenter card adopted as it was (Ava's transmission, say). */
  layout?: "intro" | "legacy";
  /** The presenter profile; absent means the default presenter. */
  presenter?: string;
  /** This Topic's own placeholder portrait, instead of the presenter's. */
  placeholder?: IntroPicture;
  script?: IntroScript;
  /** The approved video's record; the video itself is the card's `visual.video`. */
  video?: IntroVideo;
  /** Uploaded or made, waiting for the author's approval. Learners never see it. */
  pendingVideo?: IntroVideo;
  production?: IntroProduction;
  /**
    How the card came to be: made with the Topic, added by the migration, an existing presenter card reused, or a picture
    title card folded into it.
  */
  origin?: "new" | "added" | "reused" | "folded";
};

type PresenterCard = Extract<Card, { type: "presenter" }>;
export type IntroCard = PresenterCard & { intro: TopicIntro };

export const isIntroCard = (c: Card | undefined | null): c is IntroCard => Boolean(c && c.type === "presenter" && c.intro);
/** The Topic's Introduction card: the first card when it's marked, else any marked card. */
export function introCardOf(l: Lesson): IntroCard | undefined {
  const first = l.nodes[l.start];
  if (isIntroCard(first)) return first;
  return Object.values(l.nodes).find(isIntroCard);
}
/** Learners see the introduction screen (not an adopted card's own look). */
export const usesIntroLayout = (c: Card | undefined | null): c is IntroCard => isIntroCard(c) && c.intro.layout !== "legacy";

/** A video learners can play on the card: a file, or a YouTube or Synthesia player. An AI presenter still waiting for its file isn't one. */
export function playableVideo(v: CardVisual): boolean {
  if (v.kind !== "presenter" || !v.video) return false;
  return Boolean(v.video.src) || v.video.provider === "youtube" || (v.video.provider === "synthesia" && Boolean(v.video.id));
}

// ---------------------------------------------------------------------------------------------
// Making sure every Topic has one
// ---------------------------------------------------------------------------------------------

export type PresenterLite = Pick<PresenterProfile, "id" | "name" | "portrait">;

/** The presenter's look on the card: their placeholder portrait (or the Topic's own), and their name. */
export function placeholderVisual(p: PresenterLite, own?: IntroPicture): Extract<CardVisual, { kind: "presenter" }> {
  const pic = own ?? p.portrait;
  return {
    kind: "presenter",
    name: p.name,
    synthetic: false,
    tone: "teal",
    alt: `${p.name}, the presenter of this topic`,
    photo: { src: pic.src, width: pic.width, height: pic.height, ...(pic.position && { position: pic.position }) },
  };
}
/** Where the picture's focus is, for a 9:16 crop: the Topic's own placeholder, else the presenter's. */
export function portraitPosition(c: IntroCard, presenter?: PresenterLite) {
  return (
    c.intro.placeholder?.position ?? (c.visual.kind === "presenter" ? c.visual.photo?.position : undefined) ?? presenter?.portrait.position ?? "center 30%"
  );
}

function freeId(l: Lesson) {
  let id = INTRO_CARD_ID;
  for (let n = 2; l.nodes[id]; n++) id = `${INTRO_CARD_ID}-${n}`;
  return id;
}

/** A new Introduction card for the Topic, in front of `next`. */
export function newIntroCard(l: Lesson, p: PresenterLite, next: string, origin: TopicIntro["origin"], id = freeId(l)): IntroCard {
  return {
    id,
    type: "presenter",
    beat: 0,
    label: INTRO_LABEL,
    heading: l.title,
    body: l.summary === "Coming soon." ? "" : l.summary,
    visual: placeholderVisual(p),
    transcript: "",
    durationSec: 0,
    next,
    // An opening screen, not a discussion point.
    comments: false,
    intro: { layout: "intro", origin },
  };
}

/**
  The Introduction card made from a picture title card. It keeps the card's id, so a learner part-way through (whose saved
  attempt names that card) resumes on the Introduction card, and nothing that points at it needs relinking: `start` and
  its `next` stay as they were. Its label, heading and body (an ALIS support note included) become the introduction's;
  its photo becomes the Topic's own placeholder, with its crop position. A narration script it had becomes the
  introduction's draft script, for the author to rework (it isn't approved, and the card no longer reads it out).
*/
/** A production note left as a card's text ("Synthesia video to replace."): never a learner-facing description. */
const PRODUCTION_NOTE = /^\s*(synthesia\s+)?video\s+(to\s+(replace|come|follow)|pending|coming(\s+soon)?)\.?\s*$/i;

export function foldTitleCard(old: Extract<Card, { type: "image" }>, l: Lesson, p: PresenterLite): IntroCard {
  const photo = old.visual.kind === "illustration" ? old.visual.photo : undefined;
  const placeholder = photo && { src: photo.src, width: photo.width, height: photo.height, position: photo.position ?? "center" };
  const card = newIntroCard(l, p, old.next, "folded", old.id);
  card.beat = old.beat;
  card.label = old.label || INTRO_LABEL;
  card.heading = old.heading;
  // A production note isn't a description: the card shows the Topic's summary instead.
  card.body = PRODUCTION_NOTE.test(old.body) ? "" : old.body;
  if (old.stage) card.stage = old.stage;
  if (old.check) card.check = old.check;
  if (old.narration) card.narration = old.narration;
  if (old.audioSrc) card.audioSrc = old.audioSrc;
  if (placeholder) {
    card.intro.placeholder = placeholder;
    const v = placeholderVisual(p, placeholder);
    card.visual = { ...v, alt: (old.visual.kind === "illustration" && old.visual.alt) || v.alt };
  }
  if (old.narration?.trim()) card.intro.script = { spoken: old.narration.trim(), status: "draft", version: 1, origin: "existing" };
  return card;
}

const linear = (c: Card) => c.type !== "decision" && c.type !== "summary";

/** Points whatever led to `from` at `to` instead. */
function redirect(d: Lesson, from: string, to: string) {
  for (const n of Object.values(d.nodes)) {
    if (n.id === from) continue;
    if (linear(n) && "next" in n && n.next === from) (n as { next?: string }).next = to;
    if (n.type === "decision") for (const o of n.options) if (o.next === from) o.next = to || undefined;
  }
}

export type IntroPlan =
  | { action: "none"; id: string }
  | { action: "reuse"; id: string; video: boolean }
  | { action: "add"; id: string }
  | { action: "fold"; id: string }
  | { action: "move"; id: string }
  | { action: "dedupe"; id: string; extra: string[] };

/** Fields a picture title card can have and still fold into the Introduction card without losing anything learners see. */
const FOLDABLE = new Set([
  "id",
  "type",
  "beat",
  "stage",
  "label",
  "heading",
  "body",
  "visual",
  "next",
  "comments",
  "cta",
  "narration",
  "audioSrc",
  "textPosition",
  "background",
  "check",
]);

/**
  The Topic's first card when it's a picture or title card the Introduction card should take over (the owner's decision,
  Nov 2026: "fold them into the intro"): an `image` card that is the Topic's title card (called "intro", or headed with
  the Topic's title), with no picture credit, animation, key points, document or other content the Introduction card
  can't show.
*/
export function titleCardToFold(l: Lesson): Extract<Card, { type: "image" }> | undefined {
  const c = l.nodes[l.start];
  if (!c || c.type !== "image") return undefined;
  if (c.id !== "intro" && c.heading.trim() !== l.title.trim()) return undefined;
  if (Object.keys(c).some((k) => !FOLDABLE.has(k))) return undefined;
  const v = c.visual;
  if (v.kind !== "none" && v.kind !== "illustration") return undefined;
  if (v.kind === "illustration" && (v.photo?.credit || v.photo?.animated)) return undefined;
  return c;
}

/**
  What a Topic needs so it opens with its Introduction card. An existing first presenter card is reused (its video and
  script with it), never duplicated; a picture title card is folded into it; a marked card elsewhere is moved to the
  front; a second marked card loses its mark.
*/
export function planIntro(l: Lesson): IntroPlan {
  const marked = Object.values(l.nodes).filter(isIntroCard);
  const first = l.nodes[l.start];
  if (marked.length > 1) {
    const keep = isIntroCard(first) ? first.id : marked[0].id;
    return { action: "dedupe", id: keep, extra: marked.map((c) => c.id).filter((id) => id !== keep) };
  }
  if (marked.length === 1) return marked[0].id === l.start ? { action: "none", id: l.start } : { action: "move", id: marked[0].id };
  if (first?.type === "presenter") return { action: "reuse", id: first.id, video: playableVideo(first.visual) };
  if (titleCardToFold(l)) return { action: "fold", id: l.start };
  return { action: "add", id: freeId(l) };
}

/**
  The Topic with its Introduction card first. Returns the same object when nothing needs doing, so callers can tell.
  Deterministic: the same Topic and presenter always give the same card, so the editor and the server agree.
  Nothing else changes: no other card's id, content or order, the completion rule, or the Topic's version. (A folded title
  card becomes the Introduction card, keeping its id and place.)
*/
export function withIntroCard(l: Lesson, p: PresenterLite): Lesson {
  const plan = planIntro(l);
  if (plan.action === "none") return l;
  const d = structuredClone(l);
  if (plan.action === "dedupe") {
    for (const id of plan.extra) delete (d.nodes[id] as PresenterCard).intro;
    return plan.id === d.start ? d : withIntroCard(d, p);
  }
  if (plan.action === "add") {
    d.nodes[plan.id] = newIntroCard(d, p, d.start, "added", plan.id);
    d.start = plan.id;
    return d;
  }
  if (plan.action === "fold") {
    d.nodes[plan.id] = foldTitleCard(titleCardToFold(d)!, d, p);
    return d;
  }
  if (plan.action === "move") {
    const c = d.nodes[plan.id] as IntroCard;
    redirect(d, c.id, c.next ?? "");
    c.next = d.start;
    d.start = c.id;
    c.beat = 0;
    return d;
  }
  // Reuse: the first presenter card becomes the Introduction card, as it is. Its words are its approved script.
  const c = d.nodes[plan.id] as PresenterCard;
  const spoken = (c.transcript ?? "").trim();
  const v = c.visual.kind === "presenter" ? c.visual.video : undefined;
  c.intro = {
    layout: "legacy",
    origin: "reused",
    ...(wordCount(spoken) >= 5 && {
      script: { spoken, status: "approved" as const, version: 1, origin: "existing" as const, basis: introSnapshot(d), basedOn: d.version },
    }),
    ...(v &&
      plan.video && {
        video: {
          src: v.src ?? "",
          ...(v.poster && { poster: v.poster }),
          ...(v.captionsVtt && { captionsVtt: v.captionsVtt }),
          provider: v.provider,
          ...(v.provider === "synthesia" && { generationId: v.id }),
          scriptHash: textHash(spoken),
        },
      }),
  };
  return d;
}

/**
  A Topic redrafted from scratch (Draft with Claude replaces every card) keeps the Introduction card it had, with its
  script and media, in front of the new cards. With none to keep, it gets a new one.
*/
export function carryIntro(from: Lesson, to: Lesson, p: PresenterLite): Lesson {
  const kept = introCardOf(from);
  if (!kept || introCardOf(to) || to.nodes[to.start]?.type === "presenter") return withIntroCard(to, p);
  const d = structuredClone(to);
  const id = d.nodes[kept.id] ? freeId(d) : kept.id;
  d.nodes[id] = { ...structuredClone(kept), id, beat: 0, next: d.start };
  d.start = id;
  return d;
}

// ---------------------------------------------------------------------------------------------
// The outdated flag: what the Topic said when the script was approved
// ---------------------------------------------------------------------------------------------

/** Card fields that aren't the Topic's content (ids, files, layout, settings, and the introduction's own working copy). */
const NOT_CONTENT = new Set([
  "id",
  "type",
  "next",
  "beat",
  "stage",
  "visual",
  "src",
  "url",
  "audioSrc",
  "width",
  "height",
  "bubbles",
  "background",
  "textPosition",
  "requireComplete",
  "comments",
  "check",
  "emphasis",
  "correct",
  "intro",
  "widget",
  "calc",
  "labRef",
  "sceneRef",
  "pivotRef",
  "figure",
  "pdf",
]);
function strings(v: unknown, out: string[]) {
  if (typeof v === "string") out.push(v);
  else if (Array.isArray(v)) v.forEach((x) => strings(x, out));
  else if (v && typeof v === "object") for (const [k, x] of Object.entries(v)) if (!NOT_CONTENT.has(k)) strings(x, out);
}

/** What the Topic says now, leaving out its Introduction card: for noticing it has moved on since the script was approved. */
export function introSnapshot(l: Lesson): ContentSnapshot {
  const all: string[] = [l.title, l.summary, l.outcome];
  // A new title, outcome or question always asks for a look.
  const key: string[] = [l.title, l.outcome];
  for (const n of Object.values(l.nodes)) {
    if (isIntroCard(n)) continue;
    strings(n, all);
    if (n.type === "quiz") n.questions.forEach((q) => key.push(q.prompt));
    if (n.type === "decision") key.push(n.prompt);
  }
  return snapshotOf(all.join(" "), key.join("|"));
}

export const introOutdated = (l: Lesson, c: IntroCard) => {
  const b = c.intro.script?.status === "approved" ? c.intro.script.basis : undefined;
  return Boolean(b && materiallyChanged(b, introSnapshot(l)));
};

// ---------------------------------------------------------------------------------------------
// Statuses
// ---------------------------------------------------------------------------------------------

/** The production statuses (the PRD's eleven), each mapped onto the shared media vocabulary (lib/mediaStudio). */
export const INTRO_STATUSES = {
  placeholder: { label: "Placeholder", tone: "neutral", media: "script_approved", hint: "Live with an approved script and the placeholder portrait." },
  script_required: { label: "Script required", tone: "warn", media: "needs_script", hint: "No script yet." },
  script_drafted: { label: "Script drafted", tone: "info", media: "script_draft", hint: "A script waiting for approval." },
  script_approved: { label: "Script approved", tone: "info", media: "script_approved", hint: "Approved; publish the Topic to make it live." },
  ready_for_production: { label: "Ready for production", tone: "info", media: "queued", hint: "Prepared for video; nothing is sent until an author confirms." },
  generating: { label: "Generating video", tone: "info", media: "making", hint: "The provider is making the video." },
  generated: { label: "Video generated", tone: "info", media: "made", hint: "Made; attach it to preview and approve." },
  awaiting_approval: { label: "Awaiting approval", tone: "warn", media: "awaiting_approval", hint: "A video to approve, or an approved one to publish." },
  published: { label: "Published", tone: "good", media: "live", hint: "Learners see the video." },
  requires_review: { label: "Requires review", tone: "warn", media: "review", hint: "The Topic or script changed since this was approved." },
  failed: { label: "Generation failed", tone: "bad", media: "failed", hint: "The video couldn't be made. Try again." },
} as const satisfies Record<string, { label: string; tone: "neutral" | "info" | "warn" | "good" | "bad"; media: MediaStatus; hint: string }>;
export type IntroStatus = keyof typeof INTRO_STATUSES;

export type IntroState = {
  status: IntroStatus;
  script: "required" | "drafted" | "approved" | "review";
  video: "placeholder" | "ready" | "generating" | "generated" | "awaiting_approval" | "approved" | "published" | "failed";
  outdated: boolean;
  /** Why it needs a look. */
  reasons: string[];
  words: number;
  seconds: number;
};

/**
  Where a Topic's introduction stands, from its draft (and the published Topic, to tell what learners see now).
  An outdated script or a video that no longer says the approved words asks for review; learners keep what's
  published until a replacement is approved.
*/
export function introState(l: Lesson, published?: Lesson | null): IntroState {
  const c = introCardOf(l);
  const live = published ? introCardOf(published) : undefined;
  const s = c?.intro.script;
  const spoken = s?.spoken.trim() ?? "";
  const words = wordCount(spoken);
  const reasons: string[] = [];
  const outdated = Boolean(c && introOutdated(l, c));
  if (outdated) reasons.push("The Topic has changed since the script was approved.");
  const hasVideo = Boolean(c && playableVideo(c.visual));
  if (c?.intro.video && s?.status === "approved" && c.intro.video.scriptHash !== textHash(spoken)) reasons.push("The video doesn't say the approved script.");
  if (c?.intro.video?.profile && c.intro.presenter && c.intro.video.profile !== c.intro.presenter)
    reasons.push("The video was made with a different presenter.");
  const p = c?.intro.production;
  const videoLive = hasVideo && Boolean(live && c && playableVideo(live.visual) && sameVideo(live.visual, c.visual));
  const video: IntroState["video"] =
    p?.state === "failed"
      ? "failed"
      : p?.state === "generating"
        ? "generating"
        : c?.intro.pendingVideo
          ? "awaiting_approval"
          : p?.state === "generated"
            ? "generated"
            : hasVideo
              ? videoLive
                ? "published"
                : "approved"
              : p?.state === "ready"
                ? "ready"
                : "placeholder";
  const script: IntroState["script"] = !spoken ? "required" : s?.status === "draft" ? "drafted" : reasons.length ? "review" : "approved";
  const status: IntroStatus =
    video === "failed"
      ? "failed"
      : video === "generating"
        ? "generating"
        : video === "generated"
          ? "generated"
          : reasons.length
            ? "requires_review"
            : video === "awaiting_approval" || video === "approved"
              ? "awaiting_approval"
              : video === "published"
                ? "published"
                : video === "ready"
                  ? "ready_for_production"
                  : script === "required"
                    ? "script_required"
                    : script === "drafted"
                      ? "script_drafted"
                      : live && live.transcript.trim() === spoken
                        ? "placeholder"
                        : "script_approved";
  return { status, script, video, outdated, reasons, words, seconds: words ? secondsFor(words) : 0 };
}

function sameVideo(a: CardVisual, b: CardVisual) {
  if (a.kind !== "presenter" || b.kind !== "presenter") return false;
  return (a.video?.src ?? a.video?.id) === (b.video?.src ?? b.video?.id);
}

// ---------------------------------------------------------------------------------------------
// Checks on a script
// ---------------------------------------------------------------------------------------------

const FORMULAIC =
  /^\W*(welcome( back)? to\b|hello and welcome|hi( there)?,? and welcome|in (today[’']s|this) (lesson|module|session|topic|course|training)|today,? we(['’]ll| will| are going to)|this (module|lesson|topic|session|training) (will|is going to|covers|is about))/i;
const CLAIM =
  /\b(by law|legally|legislation|the (Aged Care )?Act\b|regulations? (say|require)|the Commission (says|requires)|mandatory|subsid(y|ies)|fee schedule|price cap|dosage|dose|diagnos\w*|prescri\w*|clinical advice)\b/i;
const FIGURE = /\$\s?\d|\b\d+(\.\d+)?\s?(%|per ?cent)|\b(19|20)\d{2}\b/i;
const norm = (s: string) => (s.toLowerCase().match(/[\p{L}\p{N}’']+/gu) ?? []) as string[];
/** The longest run of 8 or more words the script shares with `text`: read aloud rather than introduced. */
function sharedRun(script: string, text: string) {
  const w = norm(script);
  const runs = new Set<string>();
  const t = norm(text);
  for (let i = 0; i + 8 <= t.length; i++) runs.add(t.slice(i, i + 8).join(" "));
  for (let i = 0; i + 8 <= w.length; i++) if (runs.has(w.slice(i, i + 8).join(" "))) return true;
  return false;
}

/** Warnings for the author: the length, a formulaic opening, a claim or figure to check, or the description read aloud. */
export function introScriptWarnings(script: string, l: Pick<Lesson, "summary" | "outcome">): string[] {
  const out: string[] = [];
  const n = wordCount(script);
  if (!n) return out;
  if (n < INTRO_WORDS.min) out.push(`Short: ${n} words (aim for ${INTRO_WORDS.min} to ${INTRO_WORDS.max}, about 15 to 30 seconds).`);
  if (n > INTRO_WORDS.max) out.push(`Long: ${n} words (aim for ${INTRO_WORDS.min} to ${INTRO_WORDS.max}, about 15 to 30 seconds).`);
  if (FORMULAIC.test(script.trim())) out.push("It opens like a training module. Open with a question, a situation or a challenge instead.");
  const claim = CLAIM.exec(script)?.[0];
  if (claim) out.push(`It may make a regulatory, financial or clinical claim (“${claim}”): leave that to the Topic and its sources.`);
  if (FIGURE.test(script)) out.push("It mentions a figure or date: check it's right, or leave it to the Topic.");
  if (sharedRun(script, `${l.summary} ${l.outcome}`)) out.push("It reads the Topic's description or outcome aloud. Introduce it in your own words.");
  return out;
}
export const withinWordBounds = (script: string) => {
  const n = wordCount(script);
  return n >= INTRO_WORDS.min && n <= INTRO_WORDS.max;
};

// ---------------------------------------------------------------------------------------------
// Author actions (pure: the editor applies them to its draft)
// ---------------------------------------------------------------------------------------------

/** The Introduction card in a draft, for changing. */
function cardIn(d: Lesson) {
  const c = introCardOf(d);
  if (!c) throw new Error("This topic has no introduction card.");
  return c;
}

/** A new or edited script: a draft again, one version on from an approved one. The published introduction is untouched. */
export function setScript(d: Lesson, spoken: string, origin: IntroScript["origin"], at: string, model?: string) {
  const c = cardIn(d);
  const prev = c.intro.script;
  c.intro.script = {
    spoken,
    status: "draft",
    version: prev ? (prev.status === "approved" ? prev.version + 1 : prev.version) : 1,
    origin,
    ...(model && { model }),
    draftedAt: at,
  };
}

/**
  Approves the script for publication: it becomes the card's transcript (what learners' captions and transcript show,
  and what a video is made from), with the Topic as it stands now as its basis for the outdated flag.
*/
export function approveScript(d: Lesson, by: string, at: string) {
  const c = cardIn(d);
  const s = c.intro.script;
  if (!s?.spoken.trim()) throw new Error("Write the script first.");
  c.intro.script = { ...s, status: "approved", approvedBy: by, approvedAt: at, basis: introSnapshot(d), basedOn: d.version };
  c.transcript = s.spoken.trim();
  c.durationSec = secondsFor(wordCount(c.transcript));
  // Production that was prepared for an earlier script has to be prepared again.
  if (c.intro.production && c.intro.production.scriptHash !== textHash(c.transcript) && c.intro.production.state === "ready") delete c.intro.production;
}

/** The author has looked again after the Topic changed and the script still stands: the basis moves to now. */
export function confirmStillCurrent(d: Lesson, by: string, at: string) {
  const c = cardIn(d);
  if (c.intro.script?.status !== "approved") throw new Error("Approve the script first.");
  c.intro.script = { ...c.intro.script, basis: introSnapshot(d), basedOn: d.version, approvedBy: by, approvedAt: at };
}

/** Chooses the presenter (null: the default). Without an approved video, the card shows their placeholder at once. */
export function setPresenter(d: Lesson, p: PresenterLite | null, fallback: PresenterLite) {
  const c = cardIn(d);
  if (p && p.id !== fallback.id) c.intro.presenter = p.id;
  else delete c.intro.presenter;
  if (!playableVideo(c.visual)) {
    c.visual = placeholderVisual(p ?? fallback, c.intro.placeholder);
    c.intro.layout = "intro";
  }
}

/** This Topic's own placeholder portrait (undefined: back to the presenter's). */
export function setPlaceholder(d: Lesson, pic: IntroPicture | undefined, presenter: PresenterLite) {
  const c = cardIn(d);
  if (pic) c.intro.placeholder = pic;
  else delete c.intro.placeholder;
  if (!playableVideo(c.visual)) {
    c.visual = placeholderVisual(presenter, pic);
    c.intro.layout = "intro";
  }
}

/** A video made elsewhere (or by a provider), waiting for the author to preview and approve it. */
export function attachVideo(d: Lesson, v: Omit<IntroVideo, "scriptHash"> & { scriptHash?: string }) {
  const c = cardIn(d);
  c.intro.pendingVideo = { ...v, scriptHash: v.scriptHash ?? textHash(c.transcript.trim()) };
}
export function discardPendingVideo(d: Lesson) {
  delete cardIn(d).intro.pendingVideo;
}

/** Approves the waiting video for publication: it replaces the placeholder (or the earlier video) when the Topic is published. */
export function approveVideo(d: Lesson, by: string, at: string) {
  const c = cardIn(d);
  const v = c.intro.pendingVideo;
  if (!v) throw new Error("There's no video waiting for approval.");
  const visual =
    c.visual.kind === "presenter" ? c.visual : placeholderVisual({ id: "", name: "Presenter", portrait: { src: v.poster ?? "", width: 720, height: 1280 } });
  c.visual = {
    ...visual,
    synthetic: v.provider === "synthesia" || v.provider === "elevenlabs",
    video: {
      provider: "upload",
      id: v.generationId ?? "",
      title: `Introduction to ${d.title}`,
      orientation: "portrait",
      src: v.src,
      ...((v.poster ?? visual.photo?.src) && { poster: v.poster ?? visual.photo?.src }),
      ...(v.captionsVtt && { captionsVtt: v.captionsVtt }),
    },
  };
  c.intro.video = { ...v, approvedBy: by, approvedAt: at };
  delete c.intro.pendingVideo;
  if (c.intro.production?.state === "generated") delete c.intro.production;
  c.intro.layout = "intro";
}

/**
  Prepares the approved script for video production with the presenter's provider. Nothing is sent: generation needs
  the provider switched on and an author confirming it, one Topic at a time.
*/
export function prepareForProduction(d: Lesson, p: Pick<PresenterProfile, "id" | "provider">, by: string, at: string, estCost: number | null = null) {
  const c = cardIn(d);
  if (c.intro.script?.status !== "approved" || !c.transcript.trim()) throw new Error("Approve the script before preparing it for production.");
  c.intro.production = { state: "ready", provider: p.provider, profile: p.id, scriptHash: textHash(c.transcript.trim()), at, by, estCost };
}
export function cancelProduction(d: Lesson) {
  const c = cardIn(d);
  if (c.intro.production?.state === "ready" || c.intro.production?.state === "failed") delete c.intro.production;
}

/** Switches an adopted card to the introduction screen, or back to how it looked. */
export function setLayout(d: Lesson, layout: "intro" | "legacy") {
  cardIn(d).intro.layout = layout;
}

// ---------------------------------------------------------------------------------------------
// Sound when the card opens (the owner's override of PRD section 4, Nov 2026)
// ---------------------------------------------------------------------------------------------

/**
  What the Introduction card says when it has no video: the approved script (its transcript), else the narration it
  brought from a folded title card, else its title and description (the Topic's when the card has none of its own).
  A draft script is never spoken: it isn't approved. The server reads the same words for /api/tts (server/tts.ts).
*/
export function introSpokenText(c: IntroCard, l: Pick<Lesson, "title" | "summary">): string {
  const said = c.transcript.trim() || c.narration?.trim();
  if (said) return said;
  const heading = plainText(c.heading.trim() || l.title).trim();
  const body = plainText(c.body.trim() || l.summary).trim();
  return [heading && (/[.!?]$/.test(heading) ? heading : `${heading}.`), body].filter(Boolean).join(" ");
}

/**
  Starts the card's sound when it opens: the video with its sound, or the spoken introduction. "off" when the learner
  has turned card audio off; "blocked" when the browser refuses to start sound without a tap (the card then shows
  "Tap to listen"). Never throws, and a start that hasn't happened within `waitMs` (a browser that neither plays nor
  refuses, say a page in the background) counts as blocked, so the card is never left silent with nothing to press.
*/
export async function autoStartIntro(
  media: Pick<HTMLMediaElement, "play"> | null | undefined,
  enabled: boolean,
  waitMs = 6000,
): Promise<"playing" | "blocked" | "off"> {
  if (!enabled) return "off";
  if (!media) return "blocked";
  let timer: ReturnType<typeof setTimeout> | undefined;
  try {
    const started = media.play().then(() => "playing" as const);
    const late = new Promise<"blocked">((resolve) => (timer = setTimeout(() => resolve("blocked"), waitMs)));
    return await Promise.race([started, late]);
  } catch {
    return "blocked";
  } finally {
    clearTimeout(timer);
  }
}

// ---------------------------------------------------------------------------------------------
// Analytics: ids and numbers only, with placeholder and video engagement kept apart
// ---------------------------------------------------------------------------------------------

/**
  What the Introduction card records: seen; the video played, how far it got (25/50/75/100), replayed, captions turned
  on; moving on ("continue", or "skip" from a video intro before pressing play); and the time on the card ("leave",
  in seconds). `media` says whether the learner had a video or the placeholder. Never what anyone typed or said.
*/
export const INTRO_EVENTS = ["view", "play", "progress", "complete", "replay", "captions", "continue", "skip", "leave"] as const;
export type IntroEvent = (typeof INTRO_EVENTS)[number];
export type IntroEventInput = {
  slug: string;
  card: string;
  version: string;
  event: IntroEvent;
  media: "video" | "placeholder";
  /** Seconds on the card ("leave"), or into the video. */
  seconds?: number;
  /** How far through the video, in percent. */
  percent?: number;
  key?: string;
  at?: string;
};
