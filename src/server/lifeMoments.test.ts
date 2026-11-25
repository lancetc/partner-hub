import { afterEach, beforeEach, describe, expect, it } from "vitest";
import { openDb, type Db } from "./db";
import { userById, type User } from "./auth";
import { ensureCharacters } from "./characters";
import { ensureLives, livesChatContext, rememberConversation, seedLivesDemo } from "./livesInProgress";
import { livesAction } from "./livesAuthoring";
import { ensureMoments, momentAction, momentActivity, momentFeed, momentsAdmin, momentsReport, recordMomentAudio, seedMomentsDemo } from "./lifeMoments";
import { livesProposal } from "./livesAssist";
import { DEMO_MOMENTS } from "@/content/lifeMoments";
import { DEMO_ARCS } from "@/content/livesInProgress";
import { momentWhen } from "@/lib/lifeMoments";

/*
  Life Moments ("Meanwhile, in their lives…"): the demo is timed against the story, the feed shows only what's out
  and never gives an episode away, labels are honest, seen is per learner, the relationship line comes only from
  that learner's own memory, the chat knows moments that are out and nothing later, and authoring keeps a moment
  behind the episode it follows.
*/

let db: Db;
let jordan: User, riley: User, sam: User;
const seededAt = new Date("2026-11-25T00:00:00Z");
const key = process.env.OPENAI_API_KEY;

beforeEach(() => {
  process.env.OPENAI_API_KEY = "test-key";
  db = openDb(":memory:");
  jordan = userById(db, "jordan")!;
  riley = userById(db, "riley")!;
  sam = userById(db, "sam")!;
  ensureCharacters(db, seededAt);
  ensureLives(db, seededAt);
  seedLivesDemo(db, seededAt);
  ensureMoments(db, seededAt);
  seedMomentsDemo(db, seededAt);
});
afterEach(() => {
  if (key === undefined) delete process.env.OPENAI_API_KEY;
  else process.env.OPENAI_API_KEY = key;
});

const statusOf = (id: string) => (db.prepare("SELECT status FROM lip_moments WHERE id = ?").get(id) as { status: string }).status;
const scheduledTitles = () => DEMO_ARCS.flatMap((a) => a.episodes.filter((e) => e.number > a.currentNumber).map((e) => e.title));

describe("the demo moments", () => {
  it("are thirty or more, across the three demo members, seeded once", () => {
    expect(DEMO_MOMENTS.length).toBeGreaterThanOrEqual(30);
    seedMomentsDemo(db, new Date("2027-01-01T00:00:00Z"));
    expect(db.prepare("SELECT COUNT(*) AS n FROM lip_moments").get()).toMatchObject({ n: DEMO_MOMENTS.length });
    expect(new Set(DEMO_MOMENTS.map((m) => m.memberId))).toEqual(new Set(["mrs-alvarez", "margaret-alder", "mr-okafor"]));
    const statuses = new Set((db.prepare("SELECT status FROM lip_moments").all() as { status: string }[]).map((r) => r.status));
    for (const s of ["published", "scheduled", "draft", "in_review", "approved"]) expect(statuses.has(s)).toBe(true);
  });

  it("never go out before the episode they follow", () => {
    const rows = db
      .prepare("SELECT m.publish_at AS m, e.publish_at AS e FROM lip_moments m JOIN lip_episodes e ON e.id = m.episode_id WHERE m.episode_id != ''")
      .all() as { m: string; e: string }[];
    expect(rows.length).toBeGreaterThan(5);
    for (const r of rows) expect(r.m >= r.e).toBe(true);
  });
});

describe("honest time labels", () => {
  const tz = "Australia/Brisbane";
  const now = new Date("2026-11-25T05:00:00Z"); // Wednesday 3 pm in Brisbane
  it("come from real timestamps", () => {
    expect(momentWhen("2026-11-25T04:30:00Z", "", now, tz)).toBe("Within the last hour");
    expect(momentWhen("2026-11-24T23:00:00Z", "", now, tz)).toBe("This morning"); // 9 am
    expect(momentWhen("2026-11-25T02:30:00Z", "", now, tz)).toBe("2 hours ago"); // 12:30 pm
    expect(momentWhen("2026-11-24T05:00:00Z", "", now, tz)).toBe("Yesterday");
    expect(momentWhen("2026-11-23T01:00:00Z", "", now, tz)).toBe("Earlier this week"); // Monday
    expect(momentWhen("2026-11-20T01:00:00Z", "", now, tz)).toBe("Last Friday");
    expect(momentWhen("2026-11-15T01:00:00Z", "", now, tz)).toBe("Last week");
    expect(momentWhen("2026-11-27T00:00:00Z", "2026-11-28T00:00:00Z", now, tz)).toBe("Coming up on Saturday");
    expect(momentWhen("2026-11-24T00:00:00Z", "2026-11-26T00:00:00Z", now, tz)).toBe("Coming up tomorrow");
    // Not out yet: no label at all, never a made-up one.
    expect(momentWhen("2026-11-26T00:00:00Z", "", now, tz)).toBe("");
  });
});

describe("the feed", () => {
  it("shows only what's out, puts new chapters first, mixes people, and gives nothing away", () => {
    const { cards } = momentFeed(db, riley, seededAt);
    expect(cards.length).toBeGreaterThan(6);
    expect(cards[0].kind).toBe("episode");
    const ids = new Set(cards.map((c) => c.id));
    for (const m of DEMO_MOMENTS.filter((x) => x.day > 0 || x.status)) expect(ids.has(m.id)).toBe(false);
    const count = new Map<string, number>();
    for (const c of cards) count.set(c.memberId, (count.get(c.memberId) ?? 0) + 1);
    for (const n of count.values()) expect(n).toBeLessThanOrEqual(3);
    for (let i = 1; i < cards.length; i++) if (cards[i].memberId === cards[i - 1].memberId) expect(new Set(cards.slice(i).map((c) => c.memberId)).size).toBe(1);
    const sent = JSON.stringify(momentFeed(db, riley, seededAt, { all: true }));
    for (const t of scheduledTitles()) expect(sent).not.toContain(t);
    expect(cards.every((c) => c.when)).toBe(true);
  });

  it("brings in scheduled moments when their time comes, and drops upcoming events after they happen", () => {
    const later = new Date(seededAt.getTime() + 2.2 * 86_400_000);
    const all = momentFeed(db, riley, later, { all: true }).cards;
    const saturday = all.find((c) => c.id === "lm-alv-saturday")!;
    expect(saturday.upcoming).toBe(true);
    expect(saturday.when).toMatch(/^Coming up/);
    expect(statusOf("lm-alv-saturday")).toBe("published");
    const afterwards = new Date(seededAt.getTime() + 6 * 86_400_000);
    expect(momentFeed(db, riley, afterwards, { all: true }).cards.some((c) => c.id === "lm-alv-saturday")).toBe(false);
  });

  it("keeps seen per learner", () => {
    const first = momentFeed(db, riley, seededAt).cards.find((c) => c.kind === "moment")!;
    expect(first.unread).toBe(true);
    momentActivity(db, riley, { kind: "seen", ids: [first.id] }, seededAt);
    expect(momentFeed(db, riley, seededAt, { all: true }).cards.find((c) => c.id === first.id)?.unread).toBe(false);
    expect(momentFeed(db, sam, seededAt, { all: true }).cards.find((c) => c.id === first.id)?.unread).toBe(true);
  });

  it("only says what a learner talked about when their own memory supports it", () => {
    rememberConversation(
      db,
      riley,
      "mrs-alvarez",
      "conv-riley-roses",
      null,
      [{ role: "user", text: "Have you spoken to Isabel lately?" }],
      new Date(seededAt.getTime() - 5 * 86_400_000),
    );
    const r = momentFeed(db, riley, seededAt, { all: true }).cards.filter((c) => c.relationship);
    expect(r.length).toBe(1);
    expect(r[0].relationship).toMatch(/^You last talked with Mrs Alvarez about Isabel\./);
    expect(momentFeed(db, sam, seededAt, { all: true }).cards.some((c) => c.relationship)).toBe(false);
  });

  it("won't count a moment that isn't out", () => {
    expect(momentActivity(db, riley, { kind: "open", id: "lm-alv-seat" }, seededAt)).toEqual({ ok: false });
    expect(momentActivity(db, riley, { kind: "seen", ids: ["lm-alv-seat", "lm-alv-sunday"] }, seededAt)).toEqual({ seen: 1 });
  });
});

describe("the chat", () => {
  it("knows moments that are out, and nothing later", () => {
    const now = livesChatContext(db, riley, "mrs-alvarez", {}, seededAt)!.brief;
    expect(now).toContain("Isabel came for Sunday lunch");
    expect(now).not.toContain("paving brochures");
    expect(now).not.toContain("The seat by the roses has arrived");
    const back = livesChatContext(db, riley, "mrs-alvarez", { episodeId: "arc-alvarez-garden-e1" }, seededAt)!.brief;
    expect(back).not.toContain("Isabel came for Sunday lunch");
  });
});

describe("authoring", () => {
  it("is for authors, and keeps a moment behind the episode it follows", () => {
    expect(() => momentsAdmin(db, riley, seededAt)).toThrow(/author/i);
    const { id } = momentAction(db, jordan, { action: "moment.new", memberId: "mrs-alvarez" }, seededAt) as { id: string };
    momentAction(
      db,
      jordan,
      {
        action: "moment.save",
        moment: {
          id,
          headline: "The gravel by the gate is flat",
          quote: "Smooth as a bowling green.",
          arcId: "arc-alvarez-garden",
          episodeId: "arc-alvarez-garden-e5",
          publishAt: new Date(seededAt.getTime() + 3 * 86_400_000).toISOString(),
        },
      },
      seededAt,
    );
    momentAction(db, jordan, { action: "moment.status", id, status: "in_review" }, seededAt);
    momentAction(db, jordan, { action: "moment.status", id, status: "approved" }, seededAt);
    expect(() => momentAction(db, jordan, { action: "moment.status", id, status: "scheduled" }, seededAt)).toThrow(/give the story away/);
    momentAction(
      db,
      jordan,
      {
        action: "moment.save",
        moment: {
          ...momentsAdmin(db, jordan, seededAt).moments.find((m) => m.id === id)!,
          publishAt: new Date(seededAt.getTime() + 15 * 86_400_000).toISOString(),
        },
      },
      seededAt,
    );
    expect(statusOf(id)).toBe("draft");
    momentAction(db, jordan, { action: "moment.status", id, status: "in_review" }, seededAt);
    momentAction(db, jordan, { action: "moment.status", id, status: "approved" }, seededAt);
    momentAction(db, jordan, { action: "moment.status", id, status: "scheduled" }, seededAt);
    expect(statusOf(id)).toBe("scheduled");
  });

  it("needs a reason to correct a moment that's out", () => {
    expect(() => momentAction(db, jordan, { action: "moment.save", moment: { id: "lm-alv-sunday", headline: "x" } }, seededAt)).toThrow(/correcting/);
  });

  it("takes the assistant's fortnight as drafts only, without anyone it wasn't asked about", async () => {
    let prompt = "";
    const ask = async <T>(p: string) => {
      prompt = p;
      return {
        moments: [
          { memberId: "mrs-alvarez", day: 2, hour: 9, category: "everyday", headline: "A new watering can", lifeEventId: "le-made-up" },
          { memberId: "someone-else", day: 3, category: "everyday", headline: "Not asked for" },
        ],
      } as T;
    };
    const before = db.prepare("SELECT COUNT(*) AS n FROM lip_moments").get();
    const out = await livesProposal(db, jordan, { kind: "moments", memberIds: ["mrs-alvarez"], brief: { weeks: 2 } }, seededAt, ask);
    const proposals = (out.proposal as { moments: { headline: string; lifeEventId: string }[] }).moments;
    expect(proposals.map((p) => p.headline)).toEqual(["A new watering can"]);
    expect(proposals[0].lifeEventId).toBe("");
    expect(out.removed.length).toBe(2);
    expect(prompt).not.toContain("Isabel has other ideas");
    expect(db.prepare("SELECT COUNT(*) AS n FROM lip_moments").get()).toEqual(before);
    const { ids } = momentAction(db, jordan, { action: "moment.bulk", items: proposals.map((p) => ({ ...p, memberId: "mrs-alvarez" })) }, seededAt) as {
      ids: string[];
    };
    expect(statusOf(ids[0])).toBe("draft");
  });
});

describe("voice messages", () => {
  const fake = { speak: async () => ({ audio: Buffer.from("fake"), words: [{ end: 18.2 }] }), save: async () => ({ src: "/api/uploads/fake-moment.mp3" }) };
  it("ask first, need an approved voice, and aren't heard until checked", async () => {
    // The demo Bibles come with voices: take Mrs Alvarez's away to see the refusal.
    const v = JSON.parse((db.prepare("SELECT draft FROM lip_bibles WHERE character_id = 'mrs-alvarez'").get() as { draft: string }).draft);
    livesAction(db, jordan, { action: "bible.save", memberId: "mrs-alvarez", bible: { ...v, media: { ...v.media, voiceId: "" } } }, seededAt);
    livesAction(db, jordan, { action: "bible.approve", memberId: "mrs-alvarez", note: "No voice yet" }, seededAt);
    await expect(recordMomentAudio(db, jordan, { momentId: "lm-alv-voice-walker", confirm: true }, seededAt, fake)).rejects.toThrow(/approve a voice/);
    const b = (db.prepare("SELECT draft FROM lip_bibles WHERE character_id = 'mrs-alvarez'").get() as { draft: string }).draft;
    livesAction(
      db,
      jordan,
      { action: "bible.save", memberId: "mrs-alvarez", bible: { ...JSON.parse(b), media: { ...JSON.parse(b).media, voiceId: "openai:sage" } } },
      seededAt,
    );
    livesAction(db, jordan, { action: "bible.approve", memberId: "mrs-alvarez", note: "Voice" }, seededAt);
    let spoken = 0;
    const counting = { ...fake, speak: async () => (spoken++, fake.speak()) };
    expect((await recordMomentAudio(db, jordan, { momentId: "lm-alv-voice-walker" }, seededAt, counting)).recorded).toBe(false);
    expect(spoken).toBe(0);
    await recordMomentAudio(db, jordan, { momentId: "lm-alv-voice-walker", confirm: true }, seededAt, counting);
    expect(spoken).toBe(1);
    const card = () => momentFeed(db, riley, seededAt, { all: true }).cards.find((c) => c.id === "lm-alv-voice-walker")!;
    expect(card().audio).toBeNull();
    momentAction(db, jordan, { action: "moment.audio.check", id: "lm-alv-voice-walker", ok: true }, seededAt);
    expect(card().audio?.seconds).toBe(18.2);
  });
});

describe("the report", () => {
  it("counts by category and holds no one's words", () => {
    momentActivity(db, riley, { kind: "seen", ids: ["lm-alv-sunday", "lm-ald-photos"] }, seededAt);
    momentActivity(db, riley, { kind: "open", id: "lm-alv-sunday" }, seededAt);
    const r = momentsReport(db, jordan, seededAt);
    expect(r.impressions).toBe(2);
    expect(r.opens).toBe(1);
    expect(r.byCategory.find((c) => c.id === "everyday")?.opened).toBe(1);
  });
});
