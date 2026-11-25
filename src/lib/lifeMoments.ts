import { cleanFocus, cleanHref, cleanId, cleanImage, cleanResource, type LivesSettings, type Resource } from "./livesInProgress";

/*
  Life Moments ("Meanwhile, in their lives…", docs/lives-in-progress.md): small things that happen to the Digital
  Members between episodes, shown in a horizontal feed on the homepage. Part of Lives in Progress, not a separate
  system: a moment belongs to a member, may belong to an arc or episode, can come from the Life Event Bank, goes
  through the same draft → review → approval → scheduled → published states, and its voice message is recorded in
  the voice the Character Bible approved.

  Shared by the server and the browser: categories, the moment's shape and tidy-up, what it needs before approval,
  and the honest time labels ("This morning", "Yesterday", "Coming up on Friday"), always from real timestamps.
*/

export const MOMENT_CATEGORIES = {
  good_news: { label: "Good news", icon: "star" },
  everyday: { label: "Everyday life", icon: "home" },
  celebration: { label: "Celebration", icon: "spark" },
  reflection: { label: "Personal reflection", icon: "bulb" },
  voice: { label: "Voice message", icon: "mic" },
  new_chapter: { label: "New chapter", icon: "book" },
  changing: { label: "Changing circumstances", icon: "refresh" },
  upcoming: { label: "Upcoming event", icon: "calendar" },
  think: { label: "Something to think about", icon: "branch" },
  follow_up: { label: "Follow-up", icon: "arrow-right" },
  seasonal: { label: "Seasonal moment", icon: "sun" },
  checking_in: { label: "Just checking in", icon: "chat" },
  // The Living Calendar's event types (lib/livingCalendar), on the same records.
  milestone: { label: "Personal milestone", icon: "flag" },
  family: { label: "Family visit", icon: "people" },
  hobby: { label: "Hobby or interest", icon: "leaf" },
  appointment: { label: "Appointment", icon: "clock" },
  community: { label: "Community activity", icon: "heart" },
  quiet: { label: "Quiet moment", icon: "moon" },
} as const;
export type BuiltInCategory = keyof typeof MOMENT_CATEGORIES;
/** Icons an author may give a category they add. */
export const CATEGORY_ICONS = [
  "star",
  "home",
  "spark",
  "bulb",
  "mic",
  "book",
  "refresh",
  "calendar",
  "branch",
  "arrow-right",
  "sun",
  "chat",
  "heart",
  "leaf",
  "people",
  "flag",
  "clock",
  "moon",
] as const;

/** A category's label and icon, built-in or added in the settings. Unknown ones read as Everyday life. */
export function categoryOf(id: string, settings?: Pick<LivesSettings, "momentCategories">) {
  if (id in MOMENT_CATEGORIES) return { id, ...MOMENT_CATEGORIES[id as BuiltInCategory], like: id as BuiltInCategory };
  const extra = settings?.momentCategories.find((c) => c.id === id);
  if (extra) {
    const like = (extra.like in MOMENT_CATEGORIES ? extra.like : "everyday") as BuiltInCategory;
    return { id, label: extra.label, icon: extra.icon, like };
  }
  return { id: "everyday", ...MOMENT_CATEGORIES.everyday, like: "everyday" as BuiltInCategory };
}

/** What a card offers. "story" opens their story (at the moment's episode, if it has one); "chat" opens a conversation. */
export type MomentAction = "story" | "chat";

export type LifeMoment = {
  id: string;
  memberId: string;
  /** Story-linked moments: the arc and episode they belong to. Everyday moments have neither. */
  arcId: string;
  episodeId: string;
  category: string;
  headline: string;
  /** A sentence or two, in the third person. */
  body: string;
  /** Their own words. */
  quote: string;
  image: string;
  imageAlt: string;
  focus: string;
  /** A stand-in from the library: learners see the member's portrait instead. */
  placeholder: boolean;
  imagePrompt: string;
  /** A voice message's script, and its transcript. */
  audioScript: string;
  action: MomentAction;
  /** The card's button: "Listen to her message", "Leave a birthday greeting". Empty: chosen from the category. */
  actionLabel: string;
  /** For "chat": the learner's first question, or the greeting they start with. */
  opener: string;
  /** When it happens in their life, if that's not when it's shared: a future date makes it "Coming up". */
  eventAt: string;
  expiresAt: string;
  featured: boolean;
  /** 0 to 10: higher comes sooner in the feed. */
  priority: number;
  learning: Resource[];
  /** The Life Event Bank entry it comes from. */
  lifeEventId: string;
  /** The Living Calendar (lib/livingCalendar): a time of day ("14:30"), empty for all day, and when it ends. */
  time: string;
  endTime: string;
  /** Other Digital Members who share it: one record, on each of their calendars. */
  alsoMembers: string[];
  /** Supporting cast who are part of it (ids in lip_cast). */
  cast: string[];
  /**
    Shown on the calendar before it's shared, as `teaser` alone on the day it happens: "Mrs Alvarez turns 83". Nothing
    else about it (the headline, words, outcome or recording) reaches a learner until it's shared.
  */
  showAhead: boolean;
  teaser: string;
  /** Tells followers when it's shared (a milestone, a birthday, a voice message). Never for everyday moments. */
  notify: boolean;
  /** The routine it happened as part of: on that day the calendar shows this moment instead of the routine. */
  routineId: string;
  /** For authors: what it draws on (Bible facts, an episode), so continuity can be checked. */
  continuity: string;
};

const obj = (v: unknown) => (v && typeof v === "object" && !Array.isArray(v) ? (v as Record<string, unknown>) : {});
const str = (v: unknown, max: number) => (typeof v === "string" ? v.replace(/\r\n/g, "\n").trim().slice(0, max) : "");
const iso = (v: unknown) => {
  const s = str(v, 40);
  const t = Date.parse(s);
  return s && Number.isFinite(t) ? new Date(t).toISOString() : "";
};

export function cleanMoment(raw: unknown): Omit<LifeMoment, "memberId"> & { memberId: string } {
  const o = obj(raw);
  return {
    id: cleanId(o.id),
    memberId: cleanId(o.memberId),
    arcId: cleanId(o.arcId),
    episodeId: cleanId(o.episodeId),
    category: typeof o.category === "string" && /^(x-)?[a-z_-]{2,40}$/.test(o.category) ? o.category : "everyday",
    headline: str(o.headline, 140),
    body: str(o.body, 400),
    quote: str(o.quote, 400),
    image: cleanImage(o.image),
    imageAlt: str(o.imageAlt, 300),
    focus: cleanFocus(o.focus),
    placeholder: o.placeholder === true,
    imagePrompt: str(o.imagePrompt, 1200),
    audioScript: str(o.audioScript, 1500),
    action: o.action === "chat" ? "chat" : "story",
    actionLabel: str(o.actionLabel, 60),
    opener: str(o.opener, 200),
    eventAt: iso(o.eventAt),
    expiresAt: iso(o.expiresAt),
    featured: o.featured === true,
    priority: Math.min(10, Math.max(0, Math.round(Number(o.priority) || 0))),
    learning: (Array.isArray(o.learning) ? o.learning : [])
      .slice(0, 3)
      .map(cleanResource)
      .filter((r): r is Resource => Boolean(r) && Boolean(cleanHref(r!.href))),
    lifeEventId: cleanId(o.lifeEventId),
    continuity: str(o.continuity, 800),
    time: typeof o.time === "string" && /^([01]\d|2[0-3]):[0-5]\d$/.test(o.time) ? o.time : "",
    endTime: typeof o.endTime === "string" && /^([01]\d|2[0-3]):[0-5]\d$/.test(o.endTime) ? o.endTime : "",
    alsoMembers: (Array.isArray(o.alsoMembers) ? o.alsoMembers : []).map(cleanId).filter(Boolean).slice(0, 6),
    cast: (Array.isArray(o.cast) ? o.cast : []).map(cleanId).filter(Boolean).slice(0, 8),
    showAhead: o.showAhead === true,
    teaser: str(o.teaser, 140),
    notify: o.notify === true,
    routineId: cleanId(o.routineId),
  };
}

/** What a moment needs before it goes for review or approval. */
export function momentProblems(
  m: Pick<LifeMoment, "headline" | "body" | "quote" | "category" | "audioScript" | "action" | "opener">,
  publishAt: string,
): string[] {
  const out: string[] = [];
  if (!m.headline) out.push("Give it a headline.");
  if (!m.body && !m.quote) out.push("Add a line about what happened, or their own words.");
  if (!publishAt) out.push("Set when it’s shared.");
  if (m.category === "voice" && m.audioScript.length < 30) out.push("A voice message needs its script: learners read it until it’s recorded.");
  if (m.action === "chat" && !m.opener) out.push("A card that opens a conversation needs the learner’s first line.");
  return out;
}

/** The button a card offers, from its category, unless an author wrote one. */
export function actionLabel(m: Pick<LifeMoment, "action" | "actionLabel" | "category">, first: string, possessive: string, hasEpisode: boolean) {
  if (m.actionLabel) return m.actionLabel;
  if (m.action === "chat") return `Have a conversation with ${first}`;
  if (m.category === "new_chapter") return "Read the latest chapter";
  if (m.category === "follow_up") return "See what happened next";
  if (hasEpisode) return `Continue ${possessive} story`;
  return `Catch up with ${first}`;
}

// ---------------------------------------------------------------------------------------------
// Honest time labels
// ---------------------------------------------------------------------------------------------

/** A date's year, month, day, weekday (0 = Monday) and hour in a time zone. */
function local(t: number, timeZone: string) {
  const parts = new Intl.DateTimeFormat("en-AU", {
    timeZone,
    year: "numeric",
    month: "numeric",
    day: "numeric",
    hour: "numeric",
    hourCycle: "h23",
    weekday: "short",
  }).formatToParts(new Date(t));
  const get = (k: string) => parts.find((p) => p.type === k)?.value ?? "";
  const weekday = ["Mon", "Tue", "Wed", "Thu", "Fri", "Sat", "Sun"].indexOf(get("weekday"));
  return { day: Date.UTC(Number(get("year")), Number(get("month")) - 1, Number(get("day"))) / 86_400_000, weekday, hour: Number(get("hour")) };
}

/**
  When a moment happened, in words, from real timestamps only: when it was shared, or for something still to come,
  when it will happen. Never a made-up "2 minutes ago".
*/
export function momentWhen(publishedAt: string, eventAt: string, now: Date, timeZone = "Australia/Sydney"): string {
  const n = now.getTime();
  const fmt = (t: number, o: Intl.DateTimeFormatOptions) => new Date(t).toLocaleDateString("en-AU", { timeZone, ...o });
  const today = local(n, timeZone);
  const ev = eventAt ? Date.parse(eventAt) : NaN;
  if (Number.isFinite(ev) && ev > n) {
    const d = local(ev, timeZone).day - today.day;
    if (d <= 0) return "Later today";
    if (d === 1) return "Coming up tomorrow";
    if (d < 7) return `Coming up on ${fmt(ev, { weekday: "long" })}`;
    return `Coming up on ${fmt(ev, { weekday: "long", day: "numeric", month: "long" })}`;
  }
  const t = Date.parse(publishedAt);
  if (!Number.isFinite(t) || t > n) return "";
  const then = local(t, timeZone);
  const days = today.day - then.day;
  const hours = Math.floor((n - t) / 3_600_000);
  if (days === 0) {
    if (hours < 1) return "Within the last hour";
    if (then.hour < 12 && today.hour >= 12) return "This morning";
    if (hours === 1) return "An hour ago";
    if (hours <= 6) return `${hours} hours ago`;
    return "Earlier today";
  }
  if (days === 1) return "Yesterday";
  if (days < 7 && then.weekday < today.weekday) return "Earlier this week";
  if (days < 7) return `Last ${fmt(t, { weekday: "long" })}`;
  if (days < 14) return "Last week";
  return fmt(t, { day: "numeric", month: "long" });
}
