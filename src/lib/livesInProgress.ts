/*
  Lives in Progress (docs/lives-in-progress.md): the Digital Members as people whose lives carry on. Authors keep a
  Character Bible, a supporting cast and a Life Event Bank, and write Story Arcs of episodes that publish on a
  schedule. Learners see the latest episode first, hear the person's audio diary, look back over their story, and
  chat with them: the existing Digital Member chat, now with memory.

  This file is shared by the server and the browser: the shapes, the tidy-up of anything saved, and the pure rules
  (what a learner may see, what the character may know, what a chat is remembered as).
*/

// ---------------------------------------------------------------------------------------------
// States and lists
// ---------------------------------------------------------------------------------------------

export const EPISODE_STATES = {
  draft: "Draft",
  in_review: "In review",
  approved: "Approved",
  scheduled: "Scheduled",
  published: "Published",
  archived: "Archived",
} as const;
export type EpisodeState = keyof typeof EPISODE_STATES;

/** Where an episode can go from each state. "Published" from approved or scheduled is "publish now". */
export const EPISODE_MOVES: Record<EpisodeState, EpisodeState[]> = {
  draft: ["in_review", "archived"],
  in_review: ["draft", "approved", "archived"],
  approved: ["draft", "scheduled", "published", "archived"],
  scheduled: ["approved", "published", "archived"],
  published: ["archived"],
  archived: ["draft"],
};

export const ARC_STATES = { draft: "Draft", in_review: "In review", approved: "Approved", archived: "Archived" } as const;
export type ArcState = keyof typeof ARC_STATES;
export const ARC_MOVES: Record<ArcState, ArcState[]> = {
  draft: ["in_review", "archived"],
  in_review: ["draft", "approved", "archived"],
  approved: ["draft", "archived"],
  archived: ["draft"],
};

export const LIFE_EVENT_CATEGORIES = {
  everyday: "Everyday life",
  independence: "Independence and personal choice",
  family: "Family relationships",
  connection: "Social connection and loneliness",
  health: "Health and mobility",
  money: "Financial concerns",
  service: "Service delivery",
  transitions: "Care transitions",
  culture: "Cultural preferences",
  community: "Community participation",
  changing: "Changing support needs",
  positive: "Positive experiences and achievements",
} as const;
export type LifeEventCategory = keyof typeof LIFE_EVENT_CATEGORIES;

export const INTERACTION_KINDS = {
  conversation: { label: "Have a conversation", hint: "Opens the chat with a first question already in mind." },
  decide: { label: "What would you do?", hint: "A situation and two to four responses. Each shows how the person reacts. It never changes the shared story." },
  perspective: { label: "Explore another perspective", hint: "Someone from the supporting cast, in their own words." },
  reflect: { label: "Reflect on the situation", hint: "A question to sit with, and the person’s own thoughts on it." },
  learn: { label: "Continue learning", hint: "A related Topic, Magazine course or Discovery Path." },
} as const;
export type InteractionKind = keyof typeof INTERACTION_KINDS;

export const RESOURCE_KINDS = { topic: "Topic", magazine: "Magazine", path: "Discovery Path", other: "Elsewhere in the Hub" } as const;
export type ResourceKind = keyof typeof RESOURCE_KINDS;

/** What learners do with a story, for the report. Every one of these is voluntary unless it says it came from assigned learning. */
export const ACTIVITY_KINDS = [
  "open",
  "episode_view",
  "audio_play",
  "audio_complete",
  "transcript",
  "interaction",
  "decision",
  "resource",
  "follow",
  "unfollow",
  "chat_start",
  // Life Moments on the homepage (lib/lifeMoments): the detail is the moment's id.
  "moment_seen",
  "moment_open",
  "moment_audio_play",
  "moment_audio_complete",
  "moment_transcript",
  "moment_chat",
  // The Living Calendar (lib/livingCalendar): a visit, a day explored, a filter used, an event opened.
  "calendar_visit",
  "calendar_day",
  "calendar_filter",
  "calendar_event",
  // Check in (lib/checkIn): a catch-up opened, and a reply spoken aloud.
  "checkin_open",
  "checkin_voice",
] as const;
export type ActivityKind = (typeof ACTIVITY_KINDS)[number];

// ---------------------------------------------------------------------------------------------
// Shapes
// ---------------------------------------------------------------------------------------------

export type Bible = {
  identity: { fullName: string; preferredName: string; age: string; birthDate: string; pronouns: string; culture: string; location: string; living: string };
  history: { background: string; work: string; events: string; family: string; relationships: string; achievements: string; careHistory: string };
  personality: {
    traits: string;
    communication: string;
    humour: string;
    emotions: string;
    expressions: string;
    likes: string;
    dislikes: string;
    values: string;
    frustrations: string;
    comforts: string;
  };
  daily: { interests: string; routines: string; social: string; favourites: string; goals: string; independence: string; challenges: string };
  care: { arrangements: string; health: string; preferences: string; network: string; decisions: string; history: string };
  media: {
    portrait: string;
    /** Where their face is in the portrait, as "x% y%", so a wide hero frames the whole face (empty: the Hub's default). */
    focus: string;
    references: string[];
    lifestyle: string[];
    voiceId: string;
    voiceName: string;
    delivery: string;
    visualGuide: string;
  };
  /** Where the facts come from, so a change can be checked against what already tells the story. */
  sources: string;
  /** Anything still to reconcile with established canon. Shown to authors, never to the AI or learners. */
  reconcile: string;
};

/** The Bible's sections and fields, in order, with labels, for the editor and for the chat brief. */
export const BIBLE_SECTIONS = [
  {
    key: "identity",
    label: "Identity",
    fields: [
      ["fullName", "Full name"],
      ["preferredName", "Preferred name"],
      ["age", "Age"],
      ["birthDate", "Date of birth (where relevant)"],
      ["pronouns", "Pronouns"],
      ["culture", "Cultural background (where relevant)"],
      ["location", "General location"],
      ["living", "Living arrangements"],
    ],
  },
  {
    key: "history",
    label: "Personal history",
    fields: [
      ["background", "Childhood and background"],
      ["work", "Previous work"],
      ["events", "Important life events"],
      ["family", "Family history"],
      ["relationships", "Significant relationships"],
      ["achievements", "Personal achievements"],
      ["careHistory", "Past experiences with care and support"],
    ],
  },
  {
    key: "personality",
    label: "Personality",
    fields: [
      ["traits", "Traits"],
      ["communication", "Communication style"],
      ["humour", "Sense of humour"],
      ["emotions", "Emotional tendencies"],
      ["expressions", "Common expressions"],
      ["likes", "Likes"],
      ["dislikes", "Dislikes"],
      ["values", "Personal values"],
      ["frustrations", "Things that frustrate them"],
      ["comforts", "Things that bring comfort"],
    ],
  },
  {
    key: "daily",
    label: "Daily life",
    fields: [
      ["interests", "Interests and hobbies"],
      ["routines", "Daily routines"],
      ["social", "Social connections"],
      ["favourites", "Favourite activities"],
      ["goals", "Personal goals"],
      ["independence", "Sources of independence"],
      ["challenges", "Current challenges"],
    ],
  },
  {
    key: "care",
    label: "Care context",
    fields: [
      ["arrangements", "Support arrangements"],
      ["health", "Health and mobility considerations"],
      ["preferences", "Preferences about care"],
      ["network", "Support network"],
      ["decisions", "Important decisions and boundaries"],
      ["history", "Fictional care history"],
    ],
  },
] as const satisfies readonly { key: Exclude<keyof Bible, "media" | "sources" | "reconcile">; label: string; fields: readonly (readonly [string, string])[] }[];

export const emptyBible = (): Bible => ({
  identity: { fullName: "", preferredName: "", age: "", birthDate: "", pronouns: "", culture: "", location: "", living: "" },
  history: { background: "", work: "", events: "", family: "", relationships: "", achievements: "", careHistory: "" },
  personality: {
    traits: "",
    communication: "",
    humour: "",
    emotions: "",
    expressions: "",
    likes: "",
    dislikes: "",
    values: "",
    frustrations: "",
    comforts: "",
  },
  daily: { interests: "", routines: "", social: "", favourites: "", goals: "", independence: "", challenges: "" },
  care: { arrangements: "", health: "", preferences: "", network: "", decisions: "", history: "" },
  media: { portrait: "", focus: "", references: [], lifestyle: [], voiceId: "", voiceName: "", delivery: "", visualGuide: "" },
  sources: "",
  reconcile: "",
});

export type CastMember = {
  id: string;
  memberId: string;
  name: string;
  relation: string;
  /** A character in the photo library, when they have a picture there. */
  characterId: string;
  personality: string;
  motivations: string;
  perspective: string;
  history: string;
};

export type LifeEvent = {
  id: string;
  title: string;
  category: LifeEventCategory;
  summary: string;
  /** Who it suits: "Anyone living at home", "Someone who self-manages". */
  suits: string;
  impact: string;
  themes: string[];
  complications: string;
  cast: string;
  resolutions: string;
  sensitivity: string;
};

export type Arc = {
  id: string;
  memberId: string;
  title: string;
  summary: string;
  starting: string;
  theme: string;
  cast: string[];
  learning: string[];
  behaviour: string;
  plannedEpisodes: number;
  startDate: string;
  endDate: string;
  schedule: string;
  resolution: string;
  /** Life Event Bank entries it draws on. */
  events: string[];
  /** The member's active primary storyline. */
  primary: boolean;
};

export type Resource = { kind: ResourceKind; title: string; href: string };
export type DecideOption = { id: string; text: string; response: string };
export type Interaction = {
  id: string;
  kind: InteractionKind;
  label: string;
  /** conversation: the opening question. decide: the situation. reflect: the question. perspective: their words. learn: a line about it. */
  body: string;
  /** perspective: who is speaking (a supporting cast id). */
  castId: string;
  /** decide: two to four responses, each with how the person reacts. */
  options: DecideOption[];
  /** reflect: the person's own thoughts. */
  thought: string;
  /** learn: which of the episode's resources. */
  href: string;
};

export type DiaryAudio = {
  src: string;
  seconds: number;
  /** The script and voice it was made from: a changed script needs a new recording. */
  scriptHash: string;
  voice: string;
  voiceName: string;
  at: string;
  by: string;
  characters: number;
  /** Learners hear it only once an author has listened and ticked that it matches. */
  checked: { by: string; at: string } | null;
};

export type EpisodeMedia = {
  hero: string;
  heroAlt: string;
  thumb: string;
  /** A stand-in from the library until a real picture is made: authors see it marked. */
  placeholder: boolean;
  /** What the real picture should show, for whoever makes it. */
  prompt: string;
  /** The hero's focal point, "x% y%": the part of the picture that stays in view. Empty: the Hub's default. */
  focus: string;
};

/** Where a hero picture is framed when no one has said: a little above the middle, where faces usually are. */
export const DEFAULT_FOCUS = "50% 35%";
/** A focal point as "x% y%", each 0 to 100, or "" for the default. */
export const cleanFocus = (v: unknown) => {
  const m = typeof v === "string" ? /^\s*(\d{1,3}(?:\.\d+)?)%\s+(\d{1,3}(?:\.\d+)?)%\s*$/.exec(v) : null;
  if (!m) return "";
  const c = (n: string) => Math.min(100, Math.max(0, Math.round(Number(n))));
  return `${c(m[1])}% ${c(m[2])}%`;
};

export type Episode = {
  id: string;
  arcId: string;
  memberId: string;
  number: number;
  title: string;
  publishAt: string;
  /** For authors: what happens, in a sentence or two. */
  summary: string;
  /** For learners: the opening lines under the title, as in a documentary. */
  story: string;
  /** First-person words for the episode page. */
  dialogue: string;
  /** The line on the homepage card. */
  quote: string;
  /** The audio diary, in their own words. */
  diary: string;
  audio: DiaryAudio | null;
  media: EpisodeMedia;
  cast: string[];
  resources: Resource[];
  interactions: Interaction[];
  /** What the character knows, feels or has decided after this episode: narrative memory for the chat. */
  knowledge: string;
  /** Approved consequences: what has actually changed. */
  outcomes: string;
  /** A teaser for the next episode, shown once this one is out. It mustn't give the next event away. */
  teaser: string;
  status: EpisodeState;
  reviewNote: string;
};

export type LivesSettings = {
  /** Characters remember a learner's earlier chats (relationship memory). */
  memory: boolean;
  /** Days a memory is kept after the conversation it came from. */
  retentionDays: number;
  /** Most memories per learner and character given to the AI (the newest). */
  memoriesInBrief: number;
  /** Following someone turns on new-episode notifications unless the learner turns them off. */
  notifyByDefault: boolean;
  /** Life Moments: about how many a day across everyone, for the assistant's proposed schedules (1 to 5). */
  momentsPerDay: number;
  /** Life Moment categories an author has added, each shown like one of the built-in ones (`like`). */
  momentCategories: { id: string; label: string; icon: string; like: string }[];
  /** The Living Calendar's editorial balance, in per cent (lib/livingCalendar BALANCE_BUCKETS). */
  balance: { everyday: number; social: number; celebration: number; story: number; care: number };
  /**
    "A little serendipity": how proposed schedules vary. At most this many moments on one day across everyone; about
    this share of days with none; and whether one person can appear on two days running.
  */
  variety: { maxPerDay: number; quietDays: number; consecutive: boolean };
  /**
    Check in (lib/checkIn): let learners hear a character's replies spoken. Each one is a live, paid speech request,
    so it's off unless an author switches it on.
  */
  checkInVoice: boolean;
};
export const DEFAULT_LIVES_SETTINGS: LivesSettings = {
  memory: true,
  retentionDays: 180,
  memoriesInBrief: 6,
  notifyByDefault: true,
  momentsPerDay: 2,
  momentCategories: [],
  balance: { everyday: 35, social: 25, celebration: 15, story: 15, care: 10 },
  variety: { maxPerDay: 3, quietDays: 15, consecutive: false },
  checkInVoice: false,
};

// ---------------------------------------------------------------------------------------------
// Tidying anything saved
// ---------------------------------------------------------------------------------------------

const obj = (v: unknown) => (v && typeof v === "object" && !Array.isArray(v) ? (v as Record<string, unknown>) : {});
const str = (v: unknown, max: number) => (typeof v === "string" ? v.replace(/\r\n/g, "\n").trim().slice(0, max) : "");
const list = (v: unknown, max: number) => (Array.isArray(v) ? v.slice(0, max) : []);
export const cleanId = (v: unknown) => (typeof v === "string" && /^[\w-]{1,60}$/.test(v) ? v : "");
const strings = (v: unknown, max: number, each: number) =>
  list(v, max)
    .map((x) => str(x, each))
    .filter(Boolean);
const clampInt = (v: unknown, lo: number, hi: number, d: number) => {
  const n = Math.round(Number(v));
  return Number.isFinite(n) ? Math.min(hi, Math.max(lo, n)) : d;
};
/** A picture the Hub serves: one of its own files or an upload. Anything else is dropped. */
export const cleanImage = (v: unknown) => {
  const s = str(v, 300);
  return /^\/(images|api\/uploads)\/[\w./-]+$/.test(s) && !s.includes("..") ? s : "";
};
/** A link inside the Hub. Outside links aren't offered to learners from a story. */
export const cleanHref = (v: unknown) => {
  const s = str(v, 300);
  return /^\/[\w\-/?=&#.%]*$/.test(s) && !s.startsWith("//") ? s : "";
};
const iso = (v: unknown) => {
  const s = str(v, 40);
  const t = Date.parse(s);
  return s && Number.isFinite(t) ? new Date(t).toISOString() : "";
};
const day = (v: unknown) => {
  const s = str(v, 10);
  return /^\d{4}-\d{2}-\d{2}$/.test(s) ? s : "";
};

export function cleanBible(raw: unknown): Bible {
  const o = obj(raw);
  const b = emptyBible();
  for (const section of BIBLE_SECTIONS) {
    const from = obj(o[section.key]);
    const to = b[section.key] as Record<string, string>;
    for (const [k] of section.fields) to[k] = str(from[k], k === "age" || k === "pronouns" || k === "birthDate" ? 60 : 1200);
  }
  const m = obj(o.media);
  b.media = {
    portrait: cleanImage(m.portrait),
    references: list(m.references, 8).map(cleanImage).filter(Boolean),
    lifestyle: list(m.lifestyle, 12).map(cleanImage).filter(Boolean),
    // An ElevenLabs voice id, or one of OpenAI's named voices, as for a character's story voice (lib/story cleanProfile).
    voiceId: typeof m.voiceId === "string" && (/^[A-Za-z0-9]{8,40}$/.test(m.voiceId) || /^openai:[a-z]{2,20}$/.test(m.voiceId)) ? m.voiceId : "",
    voiceName: str(m.voiceName, 80),
    delivery: str(m.delivery, 600),
    visualGuide: str(m.visualGuide, 1200),
    focus: cleanFocus(m.focus),
  };
  b.sources = str(o.sources, 1500);
  b.reconcile = str(o.reconcile, 2000);
  return b;
}

export function cleanCast(raw: unknown, memberId: string): Omit<CastMember, "id"> & { id: string } {
  const o = obj(raw);
  return {
    id: cleanId(o.id),
    memberId,
    name: str(o.name, 80),
    relation: str(o.relation, 80),
    characterId: cleanId(o.characterId),
    personality: str(o.personality, 600),
    motivations: str(o.motivations, 600),
    perspective: str(o.perspective, 600),
    history: str(o.history, 800),
  };
}

export function cleanLifeEvent(raw: unknown): LifeEvent {
  const o = obj(raw);
  return {
    id: cleanId(o.id),
    title: str(o.title, 120),
    category: typeof o.category === "string" && o.category in LIFE_EVENT_CATEGORIES ? (o.category as LifeEventCategory) : "everyday",
    summary: str(o.summary, 600),
    suits: str(o.suits, 300),
    impact: str(o.impact, 300),
    themes: strings(o.themes, 8, 60),
    complications: str(o.complications, 600),
    cast: str(o.cast, 300),
    resolutions: str(o.resolutions, 600),
    sensitivity: str(o.sensitivity, 400),
  };
}

export function cleanArc(raw: unknown): Arc {
  const o = obj(raw);
  return {
    id: cleanId(o.id),
    memberId: cleanId(o.memberId),
    title: str(o.title, 120),
    summary: str(o.summary, 1500),
    starting: str(o.starting, 800),
    theme: str(o.theme, 300),
    cast: list(o.cast, 12).map(cleanId).filter(Boolean),
    learning: strings(o.learning, 12, 200),
    behaviour: str(o.behaviour, 600),
    plannedEpisodes: clampInt(o.plannedEpisodes, 1, 24, 6),
    startDate: day(o.startDate),
    endDate: day(o.endDate),
    schedule: str(o.schedule, 120),
    resolution: str(o.resolution, 800),
    events: list(o.events, 24).map(cleanId).filter(Boolean),
    primary: o.primary === true,
  };
}

export const emptyMedia = (): EpisodeMedia => ({ hero: "", heroAlt: "", thumb: "", placeholder: false, prompt: "", focus: "" });

export function cleanInteraction(raw: unknown, i: number): Interaction | null {
  const o = obj(raw);
  const kind = typeof o.kind === "string" && o.kind in INTERACTION_KINDS ? (o.kind as InteractionKind) : null;
  if (!kind) return null;
  return {
    id: cleanId(o.id) || `i${i + 1}`,
    kind,
    label: str(o.label, 120) || INTERACTION_KINDS[kind].label,
    body: str(o.body, 1200),
    castId: cleanId(o.castId),
    options:
      kind === "decide"
        ? list(o.options, 4)
            .map((x, j) => {
              const p = obj(x);
              return { id: cleanId(p.id) || `o${j + 1}`, text: str(p.text, 240), response: str(p.response, 800) };
            })
            .filter((p) => p.text)
        : [],
    thought: kind === "reflect" ? str(o.thought, 1200) : "",
    href: kind === "learn" ? cleanHref(o.href) : "",
  };
}

export function cleanResource(raw: unknown): Resource | null {
  const o = obj(raw);
  const href = cleanHref(o.href);
  const title = str(o.title, 160);
  if (!href || !title) return null;
  const kind = typeof o.kind === "string" && o.kind in RESOURCE_KINDS ? (o.kind as ResourceKind) : resourceKindOf(href);
  return { kind, title, href };
}

export const resourceKindOf = (href: string): ResourceKind =>
  href.startsWith("/topics/") ? "topic" : href.startsWith("/magazine/") ? "magazine" : href.startsWith("/discovery/") ? "path" : "other";

/** An episode as an author saves it. The audio, status and dates of review are the server's, not the form's. */
export function cleanEpisode(raw: unknown): Omit<Episode, "audio" | "status" | "reviewNote"> {
  const o = obj(raw);
  const m = obj(o.media);
  return {
    id: cleanId(o.id),
    arcId: cleanId(o.arcId),
    memberId: cleanId(o.memberId),
    number: clampInt(o.number, 1, 99, 1),
    title: str(o.title, 120),
    publishAt: iso(o.publishAt),
    summary: str(o.summary, 1200),
    story: str(o.story, 1500),
    dialogue: str(o.dialogue, 2500),
    quote: str(o.quote, 200),
    diary: str(o.diary, 3000),
    media: {
      hero: cleanImage(m.hero),
      heroAlt: str(m.heroAlt, 300),
      thumb: cleanImage(m.thumb),
      placeholder: m.placeholder === true,
      prompt: str(m.prompt, 1200),
      focus: cleanFocus(m.focus),
    },
    cast: list(o.cast, 12).map(cleanId).filter(Boolean),
    resources: list(o.resources, 6)
      .map(cleanResource)
      .filter((r): r is Resource => Boolean(r)),
    interactions: list(o.interactions, 6)
      .map(cleanInteraction)
      .filter((x): x is Interaction => Boolean(x)),
    knowledge: str(o.knowledge, 1500),
    outcomes: str(o.outcomes, 1200),
    teaser: str(o.teaser, 300),
  };
}

export function cleanLivesSettings(raw: unknown): LivesSettings {
  const o = obj(raw);
  const d = DEFAULT_LIVES_SETTINGS;
  return {
    memory: typeof o.memory === "boolean" ? o.memory : d.memory,
    retentionDays: clampInt(o.retentionDays, 7, 730, d.retentionDays),
    memoriesInBrief: clampInt(o.memoriesInBrief, 1, 20, d.memoriesInBrief),
    notifyByDefault: typeof o.notifyByDefault === "boolean" ? o.notifyByDefault : d.notifyByDefault,
    momentsPerDay: clampInt(o.momentsPerDay, 1, 5, d.momentsPerDay),
    momentCategories: list(o.momentCategories, 20)
      .map((x) => {
        const c = obj(x);
        const label = str(c.label, 40);
        const id =
          cleanId(c.id) ||
          `x-${label
            .toLowerCase()
            .replace(/[^a-z0-9]+/g, "-")
            .slice(0, 30)}`;
        return { id: id.startsWith("x-") ? id : `x-${id}`, label, icon: str(c.icon, 20) || "spark", like: str(c.like, 20) || "everyday" };
      })
      .filter((c) => c.label && c.id.length > 2),
    balance: (() => {
      const b = obj(o.balance);
      const k = d.balance;
      return {
        everyday: clampInt(b.everyday, 0, 100, k.everyday),
        social: clampInt(b.social, 0, 100, k.social),
        celebration: clampInt(b.celebration, 0, 100, k.celebration),
        story: clampInt(b.story, 0, 100, k.story),
        care: clampInt(b.care, 0, 100, k.care),
      };
    })(),
    variety: (() => {
      const v = obj(o.variety);
      const k = d.variety;
      return {
        maxPerDay: clampInt(v.maxPerDay, 1, 5, k.maxPerDay),
        quietDays: clampInt(v.quietDays, 0, 60, k.quietDays),
        consecutive: typeof v.consecutive === "boolean" ? v.consecutive : k.consecutive,
      };
    })(),
    checkInVoice: o.checkInVoice === true,
  };
}

// ---------------------------------------------------------------------------------------------
// What an episode needs before review, and before it goes out
// ---------------------------------------------------------------------------------------------

/** Problems that stop an episode going for review or being approved. */
export function episodeProblems(e: Pick<Episode, "title" | "story" | "quote" | "diary" | "publishAt" | "interactions" | "teaser">): string[] {
  const out: string[] = [];
  if (!e.title) out.push("Give the episode a title.");
  if (e.story.length < 40) out.push("Write the opening lines learners read under the title.");
  if (!e.quote) out.push("Add the line for the homepage card.");
  if (e.diary.length < 40) out.push("Write the audio diary script: learners can read it even before it’s recorded.");
  if (!e.publishAt) out.push("Set when it goes out.");
  for (const i of e.interactions) {
    if (i.kind === "decide" && i.options.length < 2) out.push(`“${i.label}” needs at least two responses.`);
    if (i.kind === "decide" && i.options.some((o) => !o.response)) out.push(`Each response in “${i.label}” needs the person’s reaction.`);
    if (i.kind === "perspective" && (!i.castId || !i.body)) out.push(`“${i.label}” needs someone from the supporting cast and their words.`);
    if (i.kind === "reflect" && !i.body) out.push(`“${i.label}” needs its question.`);
    if (i.kind === "learn" && !i.href) out.push(`“${i.label}” needs one of the episode’s learning links.`);
  }
  return out;
}

const INSTRUCTIONAL =
  /\b(dignity of risk is|it is important to|best practice|you should always|you must|in accordance with|the principle of|learners? (will|should)|learning objective)\b/i;
/**
  Rules, not a model: what an author should look at before approving. A first-person line that lectures, an episode
  that reveals the next one's title, a supporting character the cast doesn't have, a teaser that gives the next
  event away, or a story that is all problems and no ordinary life.
*/
export function consistencyCheck(input: {
  bible: Bible | null;
  cast: Pick<CastMember, "id" | "name">[];
  episodes: Pick<Episode, "id" | "number" | "title" | "dialogue" | "diary" | "teaser" | "cast" | "interactions" | "status" | "story">[];
}): { episodeId: string | null; text: string }[] {
  const out: { episodeId: string | null; text: string }[] = [];
  const castIds = new Set(input.cast.map((c) => c.id));
  const live = input.episodes.filter((e) => e.status !== "archived").sort((a, b) => a.number - b.number);
  if (!input.bible) out.push({ episodeId: null, text: "There’s no approved Character Bible yet: the chat falls back to the introduction alone." });
  const numbers = new Set<number>();
  for (const e of live) {
    if (numbers.has(e.number)) out.push({ episodeId: e.id, text: `Two episodes are numbered ${e.number}.` });
    numbers.add(e.number);
    for (const words of [e.dialogue, e.diary])
      if (INSTRUCTIONAL.test(words))
        out.push({ episodeId: e.id, text: `Episode ${e.number}: a first-person line sounds like a lesson (“${INSTRUCTIONAL.exec(words)?.[0]}”).` });
    for (const c of e.cast) if (!castIds.has(c)) out.push({ episodeId: e.id, text: `Episode ${e.number} names someone who isn’t in the supporting cast.` });
    for (const i of e.interactions)
      if (i.kind === "perspective" && i.castId && !castIds.has(i.castId))
        out.push({ episodeId: e.id, text: `Episode ${e.number}: “${i.label}” is from someone who isn’t in the supporting cast.` });
    const next = live.find((n) => n.number === e.number + 1);
    if (next && e.teaser && next.title && e.teaser.toLowerCase().includes(next.title.toLowerCase()))
      out.push({ episodeId: e.id, text: `Episode ${e.number}’s teaser gives away the next episode’s title.` });
  }
  const heavy = /\b(fall|fell|abuse|incident|hospital|worried|setback|missed|disagree|argument|upset|pain)\b/i;
  if (live.length >= 4 && live.every((e) => heavy.test(`${e.title} ${e.story}`)))
    out.push({ episodeId: null, text: "Every episode is about a problem. Give them an ordinary day, a good moment or a laugh too." });
  return out;
}

// ---------------------------------------------------------------------------------------------
// What a learner may see, and what the character may know
// ---------------------------------------------------------------------------------------------

/** Out for learners: published, and its time has come. Nothing else is ever sent to a learner's browser. */
export const isOut = (e: Pick<Episode, "status" | "publishAt">, now: Date) =>
  e.status === "published" && Boolean(e.publishAt) && Date.parse(e.publishAt) <= now.getTime();

/** Order across arcs: an arc's place is its first episode's date, then episodes in number order. */
export function storyOrder<T extends Pick<Episode, "arcId" | "number" | "publishAt">>(episodes: T[]): T[] {
  const start = new Map<string, number>();
  for (const e of episodes) {
    const t = Date.parse(e.publishAt) || 0;
    start.set(e.arcId, Math.min(start.get(e.arcId) ?? Infinity, t));
  }
  return [...episodes].sort(
    (a, b) => (start.get(a.arcId) ?? 0) - (start.get(b.arcId) ?? 0) || (a.arcId < b.arcId ? -1 : a.arcId > b.arcId ? 1 : 0) || a.number - b.number,
  );
}

/** What the person knows at one point in their story: the published episodes up to and including it, in order. */
export function knownAt<T extends Pick<Episode, "id" | "arcId" | "number" | "publishAt" | "status">>(episodes: T[], now: Date, at?: string | null): T[] {
  const out = storyOrder(episodes.filter((e) => isOut(e, now)));
  if (!at) return out;
  const i = out.findIndex((e) => e.id === at);
  return i < 0 ? out : out.slice(0, i + 1);
}

// ---------------------------------------------------------------------------------------------
// Pronouns and labels
// ---------------------------------------------------------------------------------------------

export type Pronouns = { subject: string; object: string; possessive: string };
export function pronounsFor(pronouns: string, name: string): Pronouns {
  const p = pronouns.toLowerCase();
  if (/\bshe\b|\bher\b/.test(p) || (!p && /^(mrs|ms|miss)\b/i.test(name))) return { subject: "she", object: "her", possessive: "her" };
  if (/\bhe\b|\bhim\b/.test(p) || (!p && /^mr\b/i.test(name))) return { subject: "he", object: "him", possessive: "his" };
  return { subject: "they", object: "them", possessive: "their" };
}
export const cap = (s: string) => s.charAt(0).toUpperCase() + s.slice(1);
export const episodeLabel = (n: number) => `Episode ${String(n).padStart(2, "0")}`;

/** "Wednesday 25 November", in Australian English. */
export const episodeDate = (isoDate: string, timeZone?: string) =>
  isoDate ? new Date(isoDate).toLocaleDateString("en-AU", { weekday: "long", day: "numeric", month: "long", ...(timeZone && { timeZone }) }) : "";

// ---------------------------------------------------------------------------------------------
// Relationship memory: what a chat is remembered as
// ---------------------------------------------------------------------------------------------

export type MemoryDetails = { topics: string[]; questions: string[]; suggestions: string[]; decisions: string[] };
export type Turn = { role: "user" | "assistant"; text: string };

const PERSONAL = [
  /[\w.+-]+@[\w-]+\.[\w.]+/g, // email addresses
  /\b(?:\+?61|0)[\s-]?\d(?:[\s-]?\d){7,9}\b/g, // phone numbers
  /\bhttps?:\/\/\S+/gi, // links
  /\b\d{6,}\b/g, // long numbers: account, client or card numbers
];
/** A learner's words with anything identifying taken out, before anything is kept. */
export const scrub = (text: string) =>
  PERSONAL.reduce((s, re) => s.replace(re, "[removed]"), text)
    .replace(/\s+/g, " ")
    .trim();
/** Words about a real person, which are never kept, even scrubbed. */
const REAL = /\b(my|our|a) (real )?(client|participant|customer|resident|patient)s?\b|\breal (client|person|participant)\b/i;
const SUGGESTION = /\b(you could|you should|have you (thought|considered|tried)|what about|why not|maybe you|it might help|try (using|asking|talking))\b/i;

const sentences = (text: string) =>
  text
    .split(/(?<=[.?!])\s+/)
    .map((s) => s.trim())
    .filter(Boolean);
const short = (s: string, n: number) => (s.length > n ? `${s.slice(0, n - 1).trimEnd()}…` : s);

/**
  What a conversation is remembered as: the topics that came up (from a fixed list for this person, never the
  learner's own words), up to three of the learner's questions and two of their suggestions, scrubbed. Never the
  character's replies, so a remembered "fact" can't be something the AI made up.
*/
export function rememberChat(turns: Turn[], topics: { label: string; words: string[] }[]): MemoryDetails & { summary: string } {
  const said = turns.filter((t) => t.role === "user").map((t) => t.text);
  const all = said.join(" \n ");
  const found = topics.filter((t) => t.words.some((w) => w && new RegExp(`\\b${w.replace(/[.*+?^${}()|[\]\\]/g, "\\$&")}`, "i").test(all))).map((t) => t.label);
  const keep = (s: string) => !REAL.test(s);
  const questions = said
    .flatMap(sentences)
    .filter((s) => s.endsWith("?") && keep(s))
    .map((s) => short(scrub(s), 140))
    .slice(-3);
  const suggestions = said
    .flatMap(sentences)
    .filter((s) => SUGGESTION.test(s) && keep(s))
    .map((s) => short(scrub(s), 160))
    .slice(-2);
  const topicsOut = [...new Set(found)].slice(0, 6);
  const summary = topicsOut.length ? `Talked about ${listWords(topicsOut)}.` : questions.length ? "A short chat, mostly questions." : "A short chat.";
  return { summary, topics: topicsOut, questions, suggestions, decisions: [] };
}

export const listWords = (items: string[]) => (items.length <= 1 ? (items[0] ?? "") : `${items.slice(0, -1).join(", ")} and ${items.at(-1)}`);

/** "3 days ago", for the brief and the learner's list of conversations. */
export function ago(thenIso: string, now: Date) {
  const days = Math.floor((now.getTime() - Date.parse(thenIso)) / 86_400_000);
  if (days <= 0) return "earlier today";
  if (days === 1) return "yesterday";
  if (days < 14) return `${days} days ago`;
  if (days < 60) return `${Math.round(days / 7)} weeks ago`;
  return `${Math.round(days / 30)} months ago`;
}

// ---------------------------------------------------------------------------------------------
// The chat brief: four layers of memory
// ---------------------------------------------------------------------------------------------

/** How a Lives in Progress character behaves in a chat, on top of the house rules (lib/memberChat). */
export const LIVES_RULES = `Being a person, not a tutor:
- You are living your own life. Talk about it the way a real person would: what happened, how you feel, what you want. Never explain principles, policies or "what learners should know". Never say things like "dignity of risk is important because".
- Keep your personality, opinions and way of speaking. You may disagree, push back gently, change the subject or ask the learner a question. Don't praise every answer.
- What has happened in your life is only what's in "Your story so far". Don't invent new events, diagnoses, decisions or outcomes. If asked about something that hasn't happened, say you don't know yet, or that you'll see.
- If the learner explores a "what if", treat it as a what-if: imagine it with them, and be clear it's not what actually happened.
- If someone asks for real clinical, regulatory, funding or policy advice, say you're not the one to ask, and suggest Ask Trilogy on the Partner Hub homepage or the Hub's Topics.`;

export type BriefEpisode = Pick<Episode, "id" | "number" | "title" | "publishAt" | "story" | "knowledge" | "outcomes"> & { arcTitle: string };
export type BriefMemory = { at: string; episodeNumber: number | null; category: "conversation" | "hypothetical"; summary: string; details: MemoryDetails };

/** Identity memory: the approved Character Bible, section by section, leaving out anything empty and the authors' own notes. */
export function bibleBrief(b: Bible) {
  const parts: string[] = [];
  for (const section of BIBLE_SECTIONS) {
    const values = b[section.key] as Record<string, string>;
    const lines = section.fields.filter(([k]) => values[k]).map(([k, label]) => `- ${label}: ${values[k]}`);
    if (lines.length) parts.push(`${section.label}:\n${lines.join("\n")}`);
  }
  return parts.join("\n\n");
}

/**
  The story layers of a chat brief, for one learner and one point in the story:
  - narrative memory: the published episodes up to the one they're viewing, never anything later or unpublished;
  - current episode: the one they're viewing, and whether it's an earlier chapter;
  - relationship memory: this learner's own earlier chats, only those from that point in the story or before.
*/
export function storyBrief(input: {
  name: string;
  bible: Bible | null;
  cast: Pick<CastMember, "name" | "relation" | "personality" | "perspective">[];
  known: BriefEpisode[];
  viewing: BriefEpisode | null;
  historical: boolean;
  memories: BriefMemory[] | null;
  now: Date;
  /** Life Moments that are out (lib/lifeMoments): small things from between episodes, and what's coming up. */
  moments?: { at: string; headline: string; text: string; upcoming: boolean }[];
  /** The Living Calendar (lib/livingCalendar): their usual routines, and what's coming up (the teaser only). */
  routines?: string[];
  ahead?: { when: string; teaser: string }[];
}) {
  const out: string[] = [];
  if (input.bible) out.push(`Your Character Bible (who you are; this never changes in a chat):\n\n${bibleBrief(input.bible)}`);
  if (input.cast.length)
    out.push(
      `People in your life:\n${input.cast.map((c) => `- ${c.name} (${c.relation})${c.personality ? `: ${c.personality}` : ""}${c.perspective ? ` Their view: ${c.perspective}` : ""}`).join("\n")}`,
    );
  out.push(
    input.known.length
      ? `Your story so far (what has actually happened, in order; nothing after this has happened yet):\n${input.known
          .map(
            (e) =>
              `- Episode ${e.number}, "${e.title}" (${e.arcTitle}): ${e.story}${e.knowledge ? ` What you know or feel now: ${e.knowledge}` : ""}${e.outcomes ? ` What changed: ${e.outcomes}` : ""}`,
          )
          .join("\n")}`
      : "Your story so far: nothing has been shared with learners yet. Talk about your everyday life from your profile.",
  );
  if (input.moments?.length)
    out.push(
      `Lately (small things from your days that have been shared; mention them only if it comes up):\n${input.moments
        .map((m) => `- ${m.upcoming ? "Coming up" : ago(m.at, input.now)}: ${m.headline}.${m.text ? ` ${m.text}` : ""}`)
        .join("\n")}`,
    );
  if (input.routines?.length)
    out.push(`Your usual week (routines; a particular day only happened if it's in your story):\n${input.routines.map((r) => `- ${r}`).join("\n")}`);
  if (input.ahead?.length)
    out.push(`Coming up (planned; you don't know how they'll go, so don't say):\n${input.ahead.map((a) => `- ${a.when}: ${a.teaser}`).join("\n")}`);
  if (input.viewing)
    out.push(
      input.historical
        ? `This conversation is set back at Episode ${input.viewing.number}, "${input.viewing.title}". It's an earlier chapter: you don't know anything that happens after it, so don't mention it, even if asked.`
        : `The learner is looking at your latest episode, Episode ${input.viewing.number}, "${input.viewing.title}". It's on your mind.`,
    );
  if (input.memories === null)
    out.push("Earlier chats: the learner chose to start fresh. Treat this as a first conversation, and don't mention any earlier one.");
  else if (!input.memories.length) out.push("Earlier chats: you haven't talked with this learner before. Never suggest you have.");
  else
    out.push(
      `Earlier chats with this learner (kept by the Hub; nothing else passed between you, so mention only these, naturally and briefly):\n${input.memories
        .map((m) => {
          const when = `${ago(m.at, input.now)}${m.episodeNumber ? `, around Episode ${m.episodeNumber}` : ""}`;
          if (m.category === "hypothetical") return `- ${when}: together you imagined a what-if: ${m.details.decisions.join("; ")}. It did not happen.`;
          const bits = [
            m.details.topics.length && `you talked about ${listWords(m.details.topics)}`,
            m.details.questions.length && `they asked ${m.details.questions.map((q) => `"${q}"`).join(", ")}`,
            m.details.suggestions.length && `they suggested ${m.details.suggestions.map((s) => `"${s}"`).join(", ")}`,
          ].filter(Boolean);
          return `- ${when}: ${bits.length ? bits.join("; ") : m.summary}`;
        })
        .join("\n")}`,
    );
  return out.join("\n\n");
}

/** Topics a chat can be remembered by, for one person: the people in their life and their interests, plus everyday ones. */
export function memoryTopics(input: { bible: Bible | null; cast: Pick<CastMember, "name" | "relation">[] }) {
  const out: { label: string; words: string[] }[] = [];
  for (const c of input.cast) {
    const first = c.name.replace(/^(mr|mrs|ms|dr)\s+/i, "").split(" ")[0];
    out.push({ label: c.name, words: [first, c.relation.split(/[ ,(]/)[0]].filter((w) => w.length > 2) });
  }
  for (const item of (input.bible?.daily.interests ?? "").split(/[,;\n]| and /)) {
    const label = item.trim().replace(/\.$/, "");
    const word = label
      .split(" ")
      .filter((w) => w.length > 3)
      .at(-1);
    if (label && word && label.length < 40) out.push({ label: label.toLowerCase(), words: [word.replace(/s$/, "")] });
  }
  out.push(
    { label: "how they’re feeling", words: ["feel", "feeling", "okay", "alright", "how are you"] },
    { label: "family", words: ["family", "daughter", "son", "grandchild", "grandkid"] },
    { label: "their home", words: ["home", "house", "kitchen", "garden"] },
    { label: "their support", words: ["support worker", "coordinator", "care partner", "carer", "support"] },
    { label: "their health", words: ["health", "doctor", "hip", "fall", "walker", "frame", "mobility"] },
    { label: "money", words: ["money", "invoice", "bank", "budget", "bill"] },
  );
  return out;
}
