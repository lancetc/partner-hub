import { afterEach, beforeEach, describe, expect, it } from "vitest";
import { openDb, type Db } from "./db";
import { userById, type User } from "./auth";
import { ensureCharacters } from "./characters";
import {
  ensureLives,
  forgetConversations,
  livesActivity,
  livesCards,
  livesChatContext,
  livesConversations,
  livesStory,
  publishDueEpisodes,
  rememberConversation,
  seedLivesDemo,
} from "./livesInProgress";
import { livesAction, livesAdmin, livesBible, livesReport, recordDiary } from "./livesAuthoring";
import { livesProposal } from "./livesAssist";
import { memberChatPreview, prepareMemberChat } from "./memberChat";
import { DIGITAL_MEMBERS } from "@/content/digitalMembers";
import { DEMO_ARCS, LIFE_EVENTS } from "@/content/livesInProgress";
import { LIFE_EVENT_CATEGORIES } from "@/lib/livesInProgress";

/*
  Lives in Progress (docs/lives-in-progress.md): the demo seeds once and keeps canon; learners only ever see what's
  out; episodes publish on schedule and tell followers; a character knows nothing unpublished or later, looks back
  properly, remembers each learner separately and never invents a past chat; nothing a learner does changes the
  shared story; authoring moves through review and approval; recording asks first and is never heard unchecked.
*/

let db: Db;
let jordan: User, riley: User, sam: User;
const seededAt = new Date("2026-11-25T00:00:00Z");
const key = process.env.OPENAI_API_KEY;
const ALVAREZ = "mrs-alvarez";
const ep = (n: number) => `arc-alvarez-garden-e${n}`;
const future = DEMO_ARCS[0].episodes.find((e) => e.number === 4)!;

beforeEach(() => {
  process.env.OPENAI_API_KEY = "test-key";
  db = openDb(":memory:");
  jordan = userById(db, "jordan")!;
  riley = userById(db, "riley")!;
  sam = userById(db, "sam")!;
  ensureCharacters(db, seededAt);
  ensureLives(db, seededAt);
  seedLivesDemo(db, seededAt);
});
afterEach(() => {
  if (key === undefined) delete process.env.OPENAI_API_KEY;
  else process.env.OPENAI_API_KEY = key;
});

const shared = () => JSON.stringify(db.prepare("SELECT id, status, data, publish_at FROM lip_episodes ORDER BY id").all());

describe("the seed", () => {
  it("fills the Life Event Bank with forty or more events across every category", () => {
    expect(LIFE_EVENTS.length).toBeGreaterThanOrEqual(40);
    expect(new Set(LIFE_EVENTS.map((e) => e.category))).toEqual(new Set(Object.keys(LIFE_EVENT_CATEGORIES)));
    expect(db.prepare("SELECT COUNT(*) AS n FROM lip_life_events").get()).toMatchObject({ n: LIFE_EVENTS.length });
  });

  it("seeds three existing members once, with six to twelve episodes each, and never changes their library rows", () => {
    const before = JSON.stringify(db.prepare("SELECT id, name, portrait, look FROM characters ORDER BY id").all());
    seedLivesDemo(db, new Date("2026-12-30T00:00:00Z"));
    expect(JSON.stringify(db.prepare("SELECT id, name, portrait, look FROM characters ORDER BY id").all())).toBe(before);
    const arcs = db.prepare("SELECT member_id, COUNT(*) AS n FROM lip_episodes GROUP BY member_id").all() as { member_id: string; n: number }[];
    expect(arcs.map((a) => a.member_id).sort()).toEqual(["margaret-alder", "mr-okafor", "mrs-alvarez"]);
    for (const a of arcs) expect(a.n).toBeGreaterThanOrEqual(6);
    for (const a of arcs) expect(DIGITAL_MEMBERS.some((m) => m.id === a.member_id)).toBe(true);
    expect(db.prepare("SELECT COUNT(*) AS n FROM lip_bibles WHERE approved IS NOT NULL").get()).toMatchObject({ n: 3 });
  });

  it("has past, current and upcoming episodes, and no recordings", () => {
    const rows = db.prepare("SELECT status, COUNT(*) AS n FROM lip_episodes GROUP BY status").all() as { status: string; n: number }[];
    expect(rows.find((r) => r.status === "published")!.n).toBeGreaterThan(3);
    expect(rows.find((r) => r.status === "scheduled")!.n).toBeGreaterThan(3);
    expect(db.prepare("SELECT COUNT(*) AS n FROM lip_episodes WHERE audio IS NOT NULL").get()).toMatchObject({ n: 0 });
  });
});

describe("what a learner sees", () => {
  it("leads with the current episode, lists what's out, and teases the next without giving it away", () => {
    const s = livesStory(db, riley, ALVAREZ, seededAt);
    expect(s.viewing?.number).toBe(3);
    expect(s.viewing?.title).toBe("A little setback in the garden");
    expect(s.timeline.map((t) => t.number)).toEqual([1, 2, 3]);
    expect(s.isNew).toBe(true);
    expect(s.upcoming?.teaser).toMatch(/Isabel has a plan/);
    const sent = JSON.stringify(s);
    expect(sent).not.toContain(future.title);
    expect(sent).not.toContain(future.diary.slice(0, 40));
    expect(sent).not.toContain(future.knowledge.slice(0, 40));
  });

  it("won't open an unpublished episode for a learner, even when asked by id or with preview", () => {
    const s = livesStory(db, riley, ALVAREZ, seededAt, { episode: ep(4), preview: true });
    expect(s.viewing?.number).toBe(3);
    expect(s.preview).toBe(false);
    const author = livesStory(db, jordan, ALVAREZ, seededAt, { episode: ep(4), preview: true });
    expect(author.viewing?.title).toBe(future.title);
    expect(author.viewing?.status).toBe("scheduled");
  });

  it("marks the card new until the episode is viewed", () => {
    expect(livesCards(db, riley, seededAt).get(ALVAREZ)).toMatchObject({ number: 3, isNew: true, audioSeconds: null });
    livesActivity(db, riley, ALVAREZ, { kind: "episode_view", episodeId: ep(3) }, seededAt);
    expect(livesCards(db, riley, seededAt).get(ALVAREZ)?.isNew).toBe(false);
    expect(livesCards(db, sam, seededAt).get(ALVAREZ)?.isNew).toBe(true);
  });

  it("looks back at an earlier episode as an earlier chapter", () => {
    const s = livesStory(db, riley, ALVAREZ, seededAt, { episode: ep(1) });
    expect(s.viewing?.number).toBe(1);
    expect(s.historical).toBe(true);
  });
});

describe("publishing on schedule", () => {
  it("publishes episodes when their time comes, and tells followers once", () => {
    livesActivity(db, riley, ALVAREZ, { kind: "follow" }, seededAt);
    livesActivity(db, sam, ALVAREZ, { kind: "follow", notify: false }, seededAt);
    const later = new Date(seededAt.getTime() + 7 * 86_400_000);
    expect(livesStory(db, riley, ALVAREZ, later).viewing?.number).toBe(4);
    publishDueEpisodes(db, later);
    // One notice per follower per person per day (server/livesInProgress notifyDaily).
    const notes = db.prepare("SELECT user_id, title FROM notifications WHERE source LIKE 'lives-day:mrs-alvarez:%'").all() as {
      user_id: string;
      title: string;
    }[];
    expect(notes).toEqual([{ user_id: "riley", title: `Mrs Alvarez: ${future.title}` }]);
    expect(db.prepare("SELECT COUNT(*) AS n FROM audit WHERE event = 'lives.episode_published'").get()).toMatchObject({ n: 3 });
  });
});

describe("what the character knows", () => {
  it("knows what's out and nothing later or unpublished", () => {
    const c = livesChatContext(db, riley, ALVAREZ, {}, seededAt)!;
    expect(c.brief).toContain("A little setback in the garden");
    expect(c.brief).toContain("Isabel saw her struggling with the gravel");
    expect(c.brief).not.toContain(future.title);
    expect(c.brief).not.toContain(future.knowledge);
    expect(c.brief).not.toContain("paving");
    expect(c.historical).toBe(false);
  });

  it("knows only what had happened by an earlier episode, and says it's an earlier chapter", () => {
    const c = livesChatContext(db, riley, ALVAREZ, { episodeId: ep(1) }, seededAt)!;
    expect(c.historical).toBe(true);
    expect(c.brief).toContain("Roses before breakfast");
    expect(c.brief).not.toContain("The walker stays inside");
    expect(c.brief).not.toContain("A little setback in the garden");
    expect(c.brief).toMatch(/earlier chapter/);
  });

  it("ignores a learner's request for an unpublished episode", () => {
    const c = livesChatContext(db, riley, ALVAREZ, { episodeId: ep(5), preview: true }, seededAt)!;
    expect(c.viewing?.number).toBe(3);
    expect(c.brief).not.toContain("Finding another way");
  });

  it("uses the approved Bible, not an unapproved draft", () => {
    const b = livesBible(db, jordan, ALVAREZ, seededAt);
    livesAction(
      db,
      jordan,
      { action: "bible.save", memberId: ALVAREZ, bible: { ...b.draft, personality: { ...b.draft.personality, traits: "UNAPPROVED-TRAIT" } } },
      seededAt,
    );
    expect(livesChatContext(db, riley, ALVAREZ, {}, seededAt)!.brief).not.toContain("UNAPPROVED-TRAIT");
    expect(() => livesAction(db, jordan, { action: "bible.approve", memberId: ALVAREZ }, seededAt)).toThrow(/Say why/);
    livesAction(db, jordan, { action: "bible.approve", memberId: ALVAREZ, note: "Trying a change" }, seededAt);
    expect(livesChatContext(db, riley, ALVAREZ, {}, seededAt)!.brief).toContain("UNAPPROVED-TRAIT");
  });

  it("is unchanged for a member without a story", () => {
    expect(livesChatContext(db, riley, "mrs-patel", {}, seededAt)).toBeNull();
    const brief = prepareMemberChat(db, riley, { memberId: "mrs-patel", messages: [{ role: "user", text: "Hello" }] }, seededAt).request;
    expect(brief.context).not.toMatch(/story so far/);
  });
});

describe("relationship memory", () => {
  const chat = (u: User, text: string, conversationId: string, extra: Record<string, unknown> = {}) =>
    prepareMemberChat(db, u, { memberId: ALVAREZ, messages: [{ role: "user", text }], conversationId, ...extra }, seededAt).request;

  it("never invents a past conversation", () => {
    expect(chat(riley, "Hello there", "conv-riley-1").context).toMatch(/haven't talked with this learner before\. Never suggest you have/);
  });

  it("remembers a learner's own chat, and nobody else's", () => {
    chat(riley, "How are the roses doing? Have you spoken to Isabel?", "conv-riley-1");
    const later = new Date(seededAt.getTime() + 2 * 86_400_000);
    const rileyBrief = livesChatContext(db, riley, ALVAREZ, {}, later)!.brief;
    expect(rileyBrief).toContain("How are the roses doing?");
    expect(rileyBrief).toMatch(/2 days ago, around Episode 3/);
    const samBrief = livesChatContext(db, sam, ALVAREZ, {}, later)!.brief;
    expect(samBrief).not.toContain("roses doing");
    expect(samBrief).toMatch(/haven't talked with this learner before/);
    expect(livesConversations(db, sam, ALVAREZ, later)).toEqual([]);
    expect(livesConversations(db, riley, ALVAREZ, later)[0].details.topics).toContain("Isabel");
  });

  it("keeps the learner's side only, scrubbed, and never a real person's details", () => {
    rememberConversation(
      db,
      riley,
      ALVAREZ,
      "conv-riley-2",
      null,
      [
        { role: "user", text: "Can you call me on 0412 345 678 or email riley@example.com? What do you think?" },
        { role: "assistant", text: "AI-REPLY-SHOULD-NOT-BE-KEPT" },
        { role: "user", text: "My client Mrs Smith has the same walker, is that normal?" },
      ],
      seededAt,
    );
    const kept = JSON.stringify(db.prepare("SELECT summary, details FROM lip_memories WHERE user_id = 'riley'").all());
    expect(kept).not.toContain("0412");
    expect(kept).not.toContain("riley@example.com");
    expect(kept).not.toContain("AI-REPLY");
    expect(kept).not.toContain("Mrs Smith");
  });

  it("starts fresh when asked, and forgets on request", () => {
    chat(riley, "Do you still talk to the roses?", "conv-riley-3");
    expect(chat(riley, "Hi again", "conv-riley-4", { fresh: true }).context).toMatch(/chose to start fresh/);
    expect(forgetConversations(db, riley, ALVAREZ, null, seededAt).forgotten).toBeGreaterThan(0);
    expect(livesChatContext(db, riley, ALVAREZ, {}, seededAt)!.brief).toMatch(/haven't talked with this learner before/);
    // The audit says a learner cleared their memory, never what it was.
    expect(JSON.stringify(db.prepare("SELECT * FROM audit WHERE event = 'lives.memory_cleared'").all())).not.toContain("roses");
  });

  it("doesn't bring later memories into an earlier chapter", () => {
    chat(riley, "Are you cross about the wobble by the gate?", "conv-riley-5", { episodeId: ep(3) });
    expect(livesChatContext(db, riley, ALVAREZ, { episodeId: ep(3) }, seededAt)!.brief).toContain("wobble by the gate");
    expect(livesChatContext(db, riley, ALVAREZ, { episodeId: ep(1) }, seededAt)!.brief).not.toContain("wobble by the gate");
  });

  it("remembers a what-if as a what-if, and lets memories lapse", () => {
    livesActivity(db, riley, ALVAREZ, { kind: "decision", episodeId: ep(3), interactionId: "i2", optionId: "o2" }, seededAt);
    expect(livesChatContext(db, riley, ALVAREZ, {}, seededAt)!.brief).toMatch(/imagined a what-if.*It did not happen/);
    const muchLater = new Date(seededAt.getTime() + 400 * 86_400_000);
    expect(livesConversations(db, riley, ALVAREZ, muchLater)).toEqual([]);
  });

  it("is never shown to authors in the report", () => {
    chat(riley, "What colour are your favourite roses?", "conv-riley-6");
    const report = JSON.stringify(livesReport(db, jordan, seededAt));
    expect(report).not.toContain("favourite roses");
    expect(JSON.stringify(livesAdmin(db, jordan, seededAt))).not.toContain("favourite roses");
  });
});

describe("the shared story", () => {
  it("doesn't change because of anything a learner does", () => {
    const before = shared();
    livesActivity(db, riley, ALVAREZ, { kind: "decision", episodeId: ep(3), interactionId: "i2", optionId: "o3" }, seededAt);
    livesActivity(db, riley, ALVAREZ, { kind: "episode_view", episodeId: ep(3) }, seededAt);
    prepareMemberChat(
      db,
      riley,
      { memberId: ALVAREZ, messages: [{ role: "user", text: "What if you stopped gardening?" }], conversationId: "conv-x-1" },
      seededAt,
    );
    expect(shared()).toBe(before);
  });

  it("refuses a choice that isn't in the episode", () => {
    expect(() => livesActivity(db, riley, ALVAREZ, { kind: "decision", episodeId: ep(3), interactionId: "i2", optionId: "o9" }, seededAt)).toThrow(
      /isn’t part/,
    );
  });
});

describe("authoring", () => {
  const arcId = DEMO_ARCS[0].id;
  it("is for authors only", () => {
    expect(() => livesAdmin(db, riley, seededAt)).toThrow(/author/i);
    expect(() => livesAction(db, sam, { action: "episode.new", arcId }, seededAt)).toThrow(/author/i);
  });

  it("moves an episode through review, approval and scheduling, with checks", () => {
    const { id } = livesAction(db, jordan, { action: "episode.new", arcId }, seededAt) as { id: string };
    expect(() => livesAction(db, jordan, { action: "episode.status", id, status: "in_review" }, seededAt)).toThrow(/isn’t ready/);
    expect(() => livesAction(db, jordan, { action: "episode.status", id, status: "published" }, seededAt)).toThrow(/can’t go/);
    livesAction(
      db,
      jordan,
      {
        action: "episode.save",
        episode: {
          id,
          number: 7,
          title: "A cutting for Mr Petrakis",
          publishAt: "2027-01-20T23:00:00.000Z",
          story: "Mrs Alvarez takes a rose cutting next door, and stays for a long cup of coffee.",
          quote: "He’s been after one for years.",
          diary: "I took Mr Petrakis a cutting today. He’s been after one for years. We had coffee on his verandah and he told me all about his tomatoes.",
        },
      },
      seededAt,
    );
    livesAction(db, jordan, { action: "episode.status", id, status: "in_review" }, seededAt);
    livesAction(db, jordan, { action: "episode.status", id, status: "approved" }, seededAt);
    livesAction(db, jordan, { action: "episode.status", id, status: "scheduled" }, seededAt);
    expect(livesStory(db, riley, ALVAREZ, seededAt).timeline.some((t) => t.id === id)).toBe(false);
    // Changing an approved or scheduled episode sends it back to draft.
    const r = livesAction(
      db,
      jordan,
      { action: "episode.save", episode: { id, title: "A cutting, and coffee", publishAt: "2027-01-20T23:00:00.000Z" } },
      seededAt,
    ) as {
      status: string;
    };
    expect(r.status).toBe("draft");
  });

  it("needs a reason to correct an episode that's out", () => {
    expect(() => livesAction(db, jordan, { action: "episode.save", episode: { id: ep(1), title: "Roses" } }, seededAt)).toThrow(/Say what you’re correcting/);
  });

  it("can't schedule an episode in an arc that isn't approved", () => {
    const { id: newArc } = livesAction(db, jordan, { action: "arc.duplicate", id: arcId }, seededAt) as { id: string };
    const copy = db.prepare("SELECT id FROM lip_episodes WHERE arc_id = ? AND number = 1").get(newArc) as { id: string };
    livesAction(db, jordan, { action: "episode.save", episode: { ...DEMO_ARCS[0].episodes[0], id: copy.id, publishAt: "2027-03-01T00:00:00.000Z" } }, seededAt);
    livesAction(db, jordan, { action: "episode.status", id: copy.id, status: "in_review" }, seededAt);
    livesAction(db, jordan, { action: "episode.status", id: copy.id, status: "approved" }, seededAt);
    expect(() => livesAction(db, jordan, { action: "episode.status", id: copy.id, status: "scheduled" }, seededAt)).toThrow(/Approve the arc/);
  });
});

describe("audio diaries", () => {
  const fake = { speak: async () => ({ audio: Buffer.from("fake mp3"), words: [{ end: 31.4 }] }), save: async () => ({ src: "/api/uploads/fake.mp3" }) };

  it("need an approved voice, ask first, and aren't heard until checked", async () => {
    // The demo Bibles come with voices: take Mrs Alvarez's away to see the refusal.
    const v = livesBible(db, jordan, ALVAREZ, seededAt);
    livesAction(db, jordan, { action: "bible.save", memberId: ALVAREZ, bible: { ...v.draft, media: { ...v.draft.media, voiceId: "" } } }, seededAt);
    livesAction(db, jordan, { action: "bible.approve", memberId: ALVAREZ, note: "No voice yet" }, seededAt);
    await expect(recordDiary(db, jordan, { episodeId: ep(3), confirm: true }, seededAt, fake)).rejects.toThrow(/Choose and approve a voice/);
    const b = livesBible(db, jordan, ALVAREZ, seededAt);
    livesAction(
      db,
      jordan,
      { action: "bible.save", memberId: ALVAREZ, bible: { ...b.draft, media: { ...b.draft.media, voiceId: "openai:sage", voiceName: "Sage" } } },
      seededAt,
    );
    livesAction(db, jordan, { action: "bible.approve", memberId: ALVAREZ, note: "Voice chosen" }, seededAt);
    let spoken = 0;
    const counting = { ...fake, speak: async () => (spoken++, fake.speak()) };
    const asked = await recordDiary(db, jordan, { episodeId: ep(3) }, seededAt, counting);
    expect(asked.recorded).toBe(false);
    expect(asked.estimate.characters).toBeGreaterThan(100);
    expect(spoken).toBe(0);
    await expect(recordDiary(db, riley, { episodeId: ep(3), confirm: true }, seededAt, counting)).rejects.toThrow(/author/i);
    const made = await recordDiary(db, jordan, { episodeId: ep(3), confirm: true }, seededAt, counting);
    expect(made.recorded).toBe(true);
    expect(spoken).toBe(1);
    expect(livesStory(db, riley, ALVAREZ, seededAt).viewing?.diary.audio).toBeNull();
    livesAction(db, jordan, { action: "audio.check", id: ep(3), ok: true }, seededAt);
    expect(livesStory(db, riley, ALVAREZ, seededAt).viewing?.diary.audio?.seconds).toBe(31.4);
    expect(livesCards(db, riley, seededAt).get(ALVAREZ)?.audioSeconds).toBe(31);
  });

  it("won't record a draft", async () => {
    await expect(recordDiary(db, jordan, { episodeId: "arc-okafor-steady-e7", confirm: true }, seededAt, fake)).rejects.toThrow(/Approve the episode/);
  });
});

describe("the AI Story Assistant", () => {
  it("proposes without saving, takes out what isn't real, and audits only that it was asked", async () => {
    const before = shared();
    let prompt = "";
    const ask = async <T>(p: string) => {
      prompt = p;
      return {
        title: "A new chapter",
        summary: "S",
        episodes: [{ title: "One", cast: ["alvarez-isabel", "nobody-real"], events: ["le-new-friend", "le-made-up"] }, { title: "Two" }, { title: "Three" }],
      } as T;
    };
    const out = await livesProposal(db, jordan, { kind: "arc", memberId: ALVAREZ, brief: { theme: "Friendship" } }, seededAt, ask);
    const proposal = out.proposal as { episodes: { cast: string[]; events: string[] }[] };
    expect(proposal.episodes[0].cast).toEqual(["alvarez-isabel"]);
    expect(proposal.episodes[0].events).toEqual(["le-new-friend"]);
    expect(out.removed.length).toBe(2);
    expect(prompt).toContain("A little setback in the garden");
    expect(prompt).not.toContain(future.title);
    expect(shared()).toBe(before);
    expect(JSON.stringify(db.prepare("SELECT next FROM audit WHERE event = 'lives.assist'").all())).not.toContain("A new chapter");
    await expect(livesProposal(db, riley, { kind: "arc", memberId: ALVAREZ }, seededAt, ask)).rejects.toThrow(/author/i);
  });
});

describe("the chat preview for authors", () => {
  it("shows the story layers with the house rules first", () => {
    const p = memberChatPreview(db, jordan, ALVAREZ, seededAt);
    expect(p.rules).toMatch(/^You are playing a fictional person/);
    expect(p.rules).toMatch(/Being a person, not a tutor/);
    expect(p.context).toMatch(/Your story so far/);
  });
});

describe("the hero picture", () => {
  it("frames the portrait on the face set in the Bible, and never shows learners a stand-in of someone else", () => {
    const s = livesStory(db, riley, ALVAREZ, seededAt);
    expect(s.viewing?.hero.src).toBe(s.member.portrait);
    expect(s.viewing?.hero.focus).toBe("52% 40%");
    expect(s.member.focus).toBe("52% 40%");
    // Episode 1's picture is a placeholder from the library: learners get her portrait, in the hero and the timeline.
    const first = livesStory(db, riley, ALVAREZ, seededAt, { episode: ep(1) });
    expect(first.viewing?.hero.src).toBe(s.member.portrait);
    expect(first.timeline.every((t) => t.thumb === s.member.portrait)).toBe(true);
    // An author previewing sees the stand-in, marked.
    const author = livesStory(db, jordan, ALVAREZ, seededAt, { episode: ep(1), preview: true });
    expect(author.viewing?.hero.src).not.toBe(s.member.portrait);
    expect(author.viewing?.hero.placeholder).toBe(true);
  });
});
