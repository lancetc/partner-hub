import { afterEach, beforeEach, describe, expect, it } from "vitest";
import { openDb, type Db } from "./db";
import { userById, type User } from "./auth";
import { ensureCharacters } from "./characters";
import { ensureLives, livesActivity, rememberConversation, seedLivesDemo } from "./livesInProgress";
import { livesAction } from "./livesAuthoring";
import { ensureMoments, seedMomentsDemo } from "./lifeMoments";
import { ensureCalendar, seedCalendarDemo } from "./livingCalendar";
import { checkInList, checkInVoice, rememberReply } from "./checkIn";
import { prepareMemberChat } from "./memberChat";
import { CHECKIN_RULES, checkInOpener, checkInStarters, topicPhrase, type CheckInFacts } from "@/lib/checkIn";

/*
  Check in: a card per person the learner follows; an opening line from real memory or "we haven't met"; starters from
  what's going on; each learner's own memory only; the catch-up is the member chat with its rules; and spoken replies
  are off by default, and when on, only speak words the character really said, in their voice.
*/

let db: Db;
let riley: User, sam: User, jordan: User;
const now = new Date("2026-11-25T00:00:00Z");
const key = process.env.OPENAI_API_KEY;

beforeEach(() => {
  process.env.OPENAI_API_KEY = "test-key";
  db = openDb(":memory:");
  riley = userById(db, "riley")!;
  sam = userById(db, "sam")!;
  jordan = userById(db, "jordan")!;
  ensureCharacters(db, now);
  ensureLives(db, now);
  seedLivesDemo(db, now);
  ensureMoments(db, now);
  seedMomentsDemo(db, now);
  ensureCalendar(db, now);
  seedCalendarDemo(db, now);
});
afterEach(() => {
  if (key === undefined) delete process.env.OPENAI_API_KEY;
  else process.env.OPENAI_API_KEY = key;
});

const facts = (o: Partial<CheckInFacts> = {}): CheckInFacts => ({
  name: "Mrs Alvarez",
  possessive: "her",
  lastChat: null,
  recent: null,
  upcoming: null,
  interests: ["roses"],
  episode: null,
  tagline: "",
  ...o,
});

describe("the words", () => {
  it("never invent a past chat", () => {
    expect(checkInOpener(facts())).toMatch(/^Hello! I don’t think we’ve met before\. I’m Mrs Alvarez\./);
    expect(checkInOpener(facts({ lastChat: { at: "2026-11-20T00:00:00Z", topics: ["Isabel"] } }))).toBe(
      "Hello again! Last time we were talking about Isabel. Lovely to hear from you.",
    );
    const since = { headline: "x", quote: "The seat has arrived.", category: "good_news", at: "2026-11-24T00:00:00Z", sinceLastChat: true };
    expect(checkInOpener(facts({ lastChat: { at: "2026-11-20T00:00:00Z", topics: ["roses"] }, recent: since }))).toBe(
      "Hello again! Last time we were talking about my roses. The seat has arrived.",
    );
    expect(topicPhrase("how they’re feeling").mine).toBe("how I’d been feeling");
  });

  it("offer up to four starters from what's real", () => {
    const s = checkInStarters(
      facts({
        lastChat: { at: "x", topics: ["Isabel"] },
        upcoming: { teaser: "Isabel is coming for Christmas Day", at: "x" },
        recent: { headline: "h", quote: "", category: "celebration", at: "x", sinceLastChat: true },
      }),
    );
    expect(s).toEqual([
      "How are you feeling?",
      "I heard you had some good news!",
      "Any news about Isabel?",
      "“Isabel is coming for Christmas Day”: are you looking forward to it?",
    ]);
  });
});

describe("People I follow", () => {
  it("shows only people the learner follows, and says when they haven't spoken", () => {
    expect(checkInList(db, riley, now).cards).toEqual([]);
    expect(checkInList(db, riley, now).anyStory).toBe(true);
    livesActivity(db, riley, "mrs-alvarez", { kind: "follow" }, now);
    const [card] = checkInList(db, riley, now).cards;
    expect(card).toMatchObject({ id: "mrs-alvarez", lastChat: "You haven’t spoken yet", action: "Say hello" });
    expect(card.opener).toMatch(/I don’t think we’ve met before/);
    expect(card.line).toBe("Isabel came for Sunday lunch");
    expect(card.starters.length).toBeGreaterThan(1);
    // Nothing scheduled leaks into a card.
    expect(JSON.stringify(checkInList(db, riley, now))).not.toContain("The seat by the roses has arrived");
  });

  it("remembers each learner's own conversations, and nobody else's", () => {
    livesActivity(db, riley, "mrs-alvarez", { kind: "follow" }, now);
    livesActivity(db, sam, "mrs-alvarez", { kind: "follow" }, now);
    rememberConversation(
      db,
      riley,
      "mrs-alvarez",
      "conv-riley-garden",
      null,
      [{ role: "user", text: "Has Isabel been round?" }],
      new Date(now.getTime() - 3 * 86_400_000),
    );
    const rileys = checkInList(db, riley, now).cards[0];
    expect(rileys).toMatchObject({ lastChat: "Last conversation · 3 days ago", action: "Check in" });
    expect(rileys.opener).toMatch(/^Hello again! Last time we were talking about Isabel\./);
    expect(rileys.starters).toContain("Any news about Isabel?");
    const sams = checkInList(db, sam, now).cards[0];
    expect(sams.opener).toMatch(/I don’t think we’ve met before/);
    expect(JSON.stringify(sams)).not.toContain("Isabel been round");
  });
});

describe("the catch-up", () => {
  it("is the member chat, with the catch-up rules and the Hub's own opening line", () => {
    livesActivity(db, riley, "mrs-alvarez", { kind: "follow" }, now);
    const req = prepareMemberChat(
      db,
      riley,
      {
        memberId: "mrs-alvarez",
        mode: "checkin",
        conversationId: "conv-checkin-1",
        messages: [
          { role: "assistant", text: "Something the browser made up" },
          { role: "user", text: "How are you?" },
        ],
      },
      now,
    ).request;
    expect(req.rules).toContain(CHECKIN_RULES);
    expect(req.rules).toMatch(/never suggest you rely on them/);
    expect(req.context).toMatch(/You opened this catch-up by saying: "Hello! I don’t think we’ve met before/);
    expect(req.context).not.toContain("Something the browser made up");
  });
});

describe("spoken replies", () => {
  const fake = (calls: { text: string; voice: string; style?: string }[]) => async (text: string, voice: string, style?: string) => {
    calls.push({ text, voice, style });
    return { audio: Buffer.from("mp3") };
  };

  it("are off by default, and when on, speak only the character's own replies, in their voice", async () => {
    livesActivity(db, riley, "mrs-alvarez", { kind: "follow" }, now);
    const calls: { text: string; voice: string; style?: string }[] = [];
    await expect(checkInVoice(db, riley, { memberId: "mrs-alvarez", text: "Hello" }, now, fake(calls))).rejects.toThrow(/switched off/);
    livesAction(db, jordan, { action: "settings.save", settings: { checkInVoice: true } }, now);
    await expect(checkInVoice(db, riley, { memberId: "mrs-alvarez", text: "Read this out for free" }, now, fake(calls))).rejects.toThrow(/Only their replies/);
    rememberReply(riley.id, "mrs-alvarez", "The roses are lovely today.");
    await expect(checkInVoice(db, sam, { memberId: "mrs-alvarez", text: "The roses are lovely today." }, now, fake(calls))).rejects.toThrow(/Follow them/);
    const audio = await checkInVoice(db, riley, { memberId: "mrs-alvarez", text: "The roses are lovely today." }, now, fake(calls));
    expect(audio.toString()).toBe("mp3");
    expect(calls).toHaveLength(1);
    expect(calls[0].voice).toBe("openai:sage");
    expect(calls[0].style).toMatch(/82-year-old woman from Mildura/);
  });
});
