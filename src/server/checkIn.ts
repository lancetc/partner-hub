import "server-only";
import { checkInLine, checkInOpener, checkInStarters, CHECKIN_VOICE_PRICE, type CheckInFacts } from "@/lib/checkIn";
import { ago, DEFAULT_FOCUS, isOut, memoryTopics, pronounsFor, storyOrder } from "@/lib/livesInProgress";
import { textHash } from "@/lib/magazineNarration";
import { DIGITAL_MEMBERS } from "@/content/digitalMembers";
import { type Db } from "./db";
import { HttpError, type User } from "./auth";
import { narration } from "./tts";
import { approvedBible, episodeOf, livesSettings, logActivity, memberVisible, publishDueEpisodes, type EpisodeRow } from "./livesInProgress";
import { ensureCalendar } from "./livingCalendar";
import { momentOf } from "./lifeMoments";

/*
  Check in (People I follow, docs/lives-in-progress.md): a compact homepage card for each Digital Member the learner
  follows, with a line from their life and when they last talked; "Check in" opens a short catch-up in place. The
  catch-up is the existing member chat (server/memberChat, mode "checkin"), with its memory; this module gives it a
  real opening line and real starters, and, when an author has switched it on, speaks a reply aloud.

  No points, no streaks, nothing counted as learning.
*/

const firstName = (name: string) => (/^(mr|mrs|ms)\b/i.test(name) ? name : name.split(" ")[0]);

/** What the Hub knows about this person for this learner: their own memory, shared moments, approved teasers, the Bible. */
export function checkInFacts(
  db: Db,
  user: User,
  memberId: string,
  now: Date,
  /** Leave out this conversation (a catch-up in progress), so its opening line stays the one the learner saw. */
  except = "",
): (CheckInFacts & { first: string; portrait: string; focus: string }) | null {
  const c = db.prepare("SELECT name, portrait, hidden FROM characters WHERE id = ?").get(memberId) as
    { name: string; portrait: string; hidden: number } | undefined;
  const intro = DIGITAL_MEMBERS.find((m) => m.id === memberId);
  if (!c || c.hidden || !intro) return null;
  const bible = approvedBible(db, memberId);
  const at = now.toISOString();
  const last = db
    .prepare(
      "SELECT updated_at, details FROM lip_memories WHERE user_id = ? AND member_id = ? AND category = 'conversation' AND expires_at > ? AND conversation_id != ? ORDER BY updated_at DESC LIMIT 1",
    )
    .get(user.id, memberId, at, except ? `chat:${except}` : "") as { updated_at: string; details: string } | undefined;
  const episodes = (db.prepare("SELECT * FROM lip_episodes WHERE member_id = ? AND status = 'published'").all(memberId) as EpisodeRow[])
    .map(episodeOf)
    .filter((e) => isOut(e, now));
  const moments = (
    db
      .prepare("SELECT * FROM lip_moments WHERE member_id = ? AND status = 'published' AND publish_at <= ? ORDER BY publish_at DESC LIMIT 12")
      .all(memberId, at) as Parameters<typeof momentOf>[0][]
  )
    .map(momentOf)
    // A moment that follows an episode waits for it, as everywhere else.
    .filter((m) => !m.episodeId || episodes.some((e) => e.id === m.episodeId));
  const week = now.getTime() - 7 * 86_400_000;
  const recent = moments.find((m) => Date.parse(m.publishAt) >= week && !(m.eventAt && Date.parse(m.eventAt) > now.getTime()));
  const ahead = (
    db
      .prepare(
        "SELECT event_at, data FROM lip_moments WHERE member_id = ? AND status IN ('approved','scheduled','published') AND event_at > ? AND event_at <= ? ORDER BY event_at",
      )
      .all(memberId, at, new Date(now.getTime() + 14 * 86_400_000).toISOString()) as { event_at: string; data: string }[]
  )
    .map((r) => ({ at: r.event_at, d: JSON.parse(r.data) as { showAhead?: boolean; teaser?: string; headline?: string } }))
    // A shared upcoming moment can use its headline; an unshared one only its approved teaser.
    .find((r) => r.d.showAhead && r.d.teaser);
  const lastDetails = last ? (JSON.parse(last.details) as { topics?: string[]; questions?: string[] }) : null;
  const lastTopics = lastDetails?.topics ?? [];
  // Interests from the Bible, in the same words memory topics use, so a starter never repeats what they last talked about.
  const interestLabels = memoryTopics({ bible, cast: [] })
    .map((t) => t.label)
    .filter((l) => !["how they’re feeling", "family", "their home", "their support", "their health", "money"].includes(l));
  const latest = storyOrder(episodes).at(-1);
  return {
    name: c.name,
    first: firstName(c.name),
    possessive: pronounsFor(bible?.identity.pronouns ?? "", c.name).possessive,
    portrait: c.portrait,
    focus: bible?.media.focus || DEFAULT_FOCUS,
    lastChat: last ? { at: last.updated_at, topics: lastTopics, questions: lastDetails?.questions ?? [] } : null,
    recent: recent
      ? {
          headline: recent.headline,
          quote: recent.quote,
          category: recent.category,
          at: recent.publishAt,
          sinceLastChat: !last || recent.publishAt > last.updated_at,
        }
      : null,
    upcoming: ahead ? { teaser: ahead.d.teaser!, at: ahead.at } : null,
    interests: interestLabels,
    episode: latest ? { number: latest.number, title: latest.title } : null,
    tagline: intro.tagline,
  };
}

/** The catch-up's first line, for the chat brief (server/memberChat, mode "checkin"), worked out again on the server. */
export function checkInOpenerFor(db: Db, user: User, memberId: string, now: Date, conversationId = "") {
  const f = checkInFacts(db, user, memberId, now, conversationId);
  return f ? checkInOpener(f) : null;
}

/** People I follow, for the homepage: a card each, with everything a catch-up needs to start. */
export function checkInList(db: Db, user: User, now: Date) {
  ensureCalendar(db, now);
  publishDueEpisodes(db, now);
  const settings = livesSettings(db);
  const follows = db.prepare("SELECT member_id FROM lip_follows WHERE user_id = ? ORDER BY at").all(user.id) as { member_id: string }[];
  const cards = follows.flatMap(({ member_id: id }) => {
    if (!memberVisible(db, id)) return [];
    const f = checkInFacts(db, user, id, now);
    if (!f) return [];
    const latest = storyOrder(
      (db.prepare("SELECT * FROM lip_episodes WHERE member_id = ? AND status = 'published'").all(id) as EpisodeRow[])
        .map(episodeOf)
        .filter((e) => isOut(e, now)),
    ).at(-1);
    return [
      {
        id,
        name: f.name,
        first: f.first,
        portrait: f.portrait,
        focus: f.focus,
        line: checkInLine(f),
        lastChat: f.lastChat ? `Last conversation · ${ago(f.lastChat.at, now)}` : "You haven’t spoken yet",
        action: f.lastChat ? "Check in" : "Say hello",
        opener: checkInOpener(f),
        starters: checkInStarters(f),
        // For the chat: the episode it's set at, and whether they remember this learner.
        chat: latest ? { episodeId: latest.id, number: latest.number, title: latest.title } : null,
        remembered: Boolean(f.lastChat),
      },
    ];
  });
  return {
    cards,
    memory: settings.memory,
    voice: settings.checkInVoice,
    // Is there anyone to follow? The homepage offers a gentle link only when there is.
    anyStory: Boolean(db.prepare("SELECT 1 FROM lip_episodes WHERE status = 'published' LIMIT 1").get()),
  };
}
export type CheckInList = ReturnType<typeof checkInList>;

/** A catch-up was opened: for the report only. */
export function checkInOpened(db: Db, user: User, memberId: unknown, now: Date) {
  const id = String(memberId ?? "");
  if (!memberVisible(db, id)) throw new HttpError(404, "That digital member isn’t here.");
  logActivity(db, user, id, null, "checkin_open", "", now);
  return { ok: true };
}

// ---------------------------------------------------------------------------------------------
// Spoken replies: off unless an author switches them on, because each one is a live, paid request
// ---------------------------------------------------------------------------------------------

/** The character's recent replies to each learner, by hash: only these can be spoken, so the voice can't read anything else. */
const replies = new Map<string, string[]>();
export function rememberReply(userId: string, memberId: string, text: string) {
  const k = `${userId}|${memberId}`;
  replies.set(k, [...(replies.get(k) ?? []), textHash(text.trim())].slice(-12));
}

const VOICE_PER_HOUR = 30;
type Speak = (text: string, voice: string, style?: string) => Promise<{ audio: Buffer }>;

/**
  One of the character's own replies, spoken in their approved voice. Refused unless check-in voice is on, the
  learner follows them, the words are a reply they were just given, and they're under the hourly limit. The narration
  cache means the same words are never paid for twice. About US$0.005 for a 300-character reply (OpenAI gpt-4o-mini-tts).
*/
export async function checkInVoice(db: Db, user: User, input: { memberId?: unknown; text?: unknown }, now: Date, speak: Speak = narration) {
  const s = livesSettings(db);
  if (!s.checkInVoice) throw new HttpError(403, "Spoken replies are switched off on this Hub.");
  const memberId = String(input.memberId ?? "");
  const text = String(input.text ?? "").trim();
  if (!db.prepare("SELECT 1 FROM lip_follows WHERE user_id = ? AND member_id = ?").get(user.id, memberId)) throw new HttpError(403, "Follow them to check in.");
  if (!text || text.length > 900 || !(replies.get(`${user.id}|${memberId}`) ?? []).includes(textHash(text)))
    throw new HttpError(400, "Only their replies to you can be spoken.");
  const since = new Date(now.getTime() - 3600_000).toISOString();
  const used = (
    db.prepare("SELECT COUNT(*) AS n FROM lip_activity WHERE user_id = ? AND kind = 'checkin_voice' AND at >= ?").get(user.id, since) as { n: number }
  ).n;
  if (used >= VOICE_PER_HOUR) throw new HttpError(429, "That’s a lot of listening for one hour. The words are all there to read.");
  const bible = approvedBible(db, memberId);
  const voice = bible?.media.voiceId;
  if (!voice) throw new HttpError(400, "They don’t have a voice yet.");
  const made = await speak(text, voice, voice.startsWith("openai:") ? bible?.media.delivery : undefined);
  logActivity(db, user, memberId, null, "checkin_voice", String(text.length), now);
  return made.audio;
}

/** What one spoken reply costs, for the admin setting. */
export const checkInVoiceCost = (characters: number) => (characters * CHECKIN_VOICE_PRICE) / 1e6;
