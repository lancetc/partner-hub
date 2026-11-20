import { beforeEach, describe, expect, it, vi } from "vitest";
import {
  liftRefs,
  repeatsCanon,
  resolveFacts,
  scriptIssues,
  type CanonPerson,
  type EpisodeProposal,
  type PlanProposal,
  type ScriptProposal,
} from "@/lib/storyAssist";
import { lessons } from "@/content/lessons";
import { ordered } from "@/lib/lessonGraph";
import { openDb, type Db } from "./db";
import { HttpError, userById, type User } from "./auth";
import { characterDetail, momentDetail, planDetail, recordStoryEvent, storyAction, storyFor } from "./story";
import { storyProposal } from "./storyAssist";
import { storyReport, THIN_SAMPLE } from "./storyReport";

/*
  Story Plans, step 6. AI proposals: what a model is shown, what is taken out of what it returns, and that asking
  saves and approves nothing. The report: engagement, learning evidence and the work measure, kept apart.
*/

const model = vi.hoisted(() => ({ ready: true, reply: {} as unknown, prompts: [] as string[], issues: [] as string[][] }));
vi.mock("./openaiText", async (original) => ({
  ...(await original<typeof import("./openaiText")>()),
  claudeConfigured: () => false,
  openaiReady: () => model.ready,
  // As the real one does: the reply has to pass the checks, or the proposal fails.
  openaiJson: async (prompt: string, check: (v: unknown) => string[]) => {
    model.prompts.push(prompt);
    const issues = check(model.reply);
    model.issues.push(issues);
    if (issues.length) throw new HttpError(502, `The draft didn’t pass the checks:\n${issues.join("\n")}`);
    return model.reply;
  },
}));
vi.mock("./tts", () => ({
  ttsConfig: () => ({ apiKey: "", voiceId: "", modelId: "", configured: false }),
  narratorName: () => "The Hub narrator",
  narration: async () => ({ audio: Buffer.from("ID3"), words: [] }),
}));

let db: Db;
let jordan: User, riley: User;
const now = new Date("2026-11-21T00:00:00Z");
const act = (input: Record<string, unknown>) => storyAction(db, jordan, input, now) as unknown as Record<string, string>;
const plan = () => planDetail(db, jordan, "plan-dot-roses", now);
const propose = (input: Record<string, unknown>, user = jordan, at = now) => storyProposal(db, user, input, at);
const lastPrompt = () => model.prompts[model.prompts.length - 1];

const BELL =
  "Early in her career Ava arranged book deliveries for Mrs Bell, who had asked for help getting to the town library. Mrs Bell went for her Thursday friends as much as for the books.";

beforeEach(() => {
  db = openDb(":memory:");
  [jordan, riley] = ["jordan", "riley"].map((id) => userById(db, id)!);
  Object.assign(model, { ready: true, reply: {} });
  model.prompts.length = 0;
  model.issues.length = 0;
});

describe("a plan from the purpose", () => {
  const good = {
    anchorId: "dot",
    anchorWhy: "Dot’s roses are already part of her approved story.",
    fields: { tension: "Fiona’s concern arrives first.", decision: "What to ask Dot first." },
    beats: [
      { kind: "goal", text: "Dot explains why the roses matter.", characterId: "dot", facts: ["dot:roses"], why: "Her goal comes first." },
      {
        kind: "choice",
        text: "The coordinator decides what to ask.",
        action: "Choose a first question",
        blocks: ["decision"],
        evidence: "practice",
        why: "A real choice.",
      },
      { kind: "consequence", text: "Dot responds to what was asked.", characterId: "dot", hypothetical: false, guidance: true },
      { kind: "transfer", text: "The same question at the markets.", blocks: ["journal"] },
    ],
    missing: ["The approved guidance on choice and risk."],
  };

  it("is shown the author's plan and approved canon, and nothing from a draft or a withheld person", async () => {
    // An unapproved change to Dot, and a person the plan's audience may not meet.
    const dot = characterDetail(db, jordan, "dot", now);
    act({ action: "save-profile", id: "dot", profile: { ...dot.draft, summary: "A SECRET DRAFT REWRITE of Dot." }, steward: dot.steward, audience: [] });
    const fiona = characterDetail(db, jordan, "fiona", now);
    act({ action: "save-profile", id: "fiona", profile: fiona.draft, steward: fiona.steward, audience: ["partner"] });
    model.reply = good;
    const p = plan();
    await propose({ action: "propose", kind: "plan", id: p.id, title: p.title, data: p.data });
    const sent = lastPrompt();
    expect(sent).toContain("[dot:roses] Dot tends the roses in her front garden, and has for years.");
    expect(sent).toContain("Never: Never give Dot a diagnosis");
    expect(sent).toContain('"decision" (Decision question)');
    expect(sent).toContain("Learning purpose: When an older person’s preferred activity raises a practical risk");
    expect(sent).not.toContain("SECRET DRAFT REWRITE");
    // The plan is for coordinators, and Fiona is now only for Care Partners: she isn't in the room.
    expect(sent).not.toContain('<person id="fiona"');
    // A draft episode isn't canon either.
    expect(sent).not.toContain("An invoice that looks right");
    // Dot is offered as the person it happens to. Ava hosts the stories, so she isn't.
    expect(sent).toMatch(/- "dot" \(Dot\): /);
    expect(sent).not.toMatch(/- "ava" \(Ava\): /);
  });

  it("doesn't accept a reply with a beat of no known kind, or with too few beats", async () => {
    const p = plan();
    model.reply = { ...good, beats: [...good.beats, { kind: "nonsense", text: "A beat of no known kind." }] };
    await expect(propose({ kind: "plan", id: p.id, title: p.title, data: p.data })).rejects.toThrow(/didn’t pass the checks/);
    expect(model.issues[0].join(" ")).toContain('"kind" must be one of');
    model.reply = { ...good, beats: good.beats.slice(0, 2) };
    await expect(propose({ kind: "plan", id: p.id, title: p.title, data: p.data })).rejects.toThrow(/didn’t pass the checks/);
    expect(model.issues[1].join(" ")).toContain("at least three beats");
  });

  it("drops a character the rules don't offer, a block the Hub doesn't have and a fact that isn't approved", async () => {
    model.reply = {
      ...good,
      anchorId: "ava",
      beats: [
        ...good.beats,
        {
          kind: "clue",
          text: "A hologram of the garden appears.",
          characterId: "nobody",
          blocks: ["hologram", "decision"],
          facts: ["dot:unicorn", "[dot:bowls]"],
        },
      ],
    };
    const p = plan();
    const before = JSON.stringify(p.data);
    const out = (await propose({ action: "propose", kind: "plan", id: p.id, title: p.title, data: p.data })) as PlanProposal;
    // Taken out, so there is no proposal about who it happens to: not a proposal of "no one".
    expect(out).toMatchObject({ anchorId: "", anchorOffered: false, anchorWhy: "" });
    expect(out.dropped.join(" ")).toContain("“Ava” as the continuing character");
    expect(out.dropped.join(" ")).toContain("“hologram”: the Hub has no such block");
    expect(out.dropped.join(" ")).toContain("“dot:unicorn”: no approved fact has that id");
    expect(out.dropped.join(" ")).toContain("“nobody”, who has no approved profile");
    const clue = out.beats[4];
    expect(clue).toMatchObject({ kind: "clue", characterId: "", blocks: ["decision"], facts: ["dot:bowls"] });
    // What it leaned on, with whose profile and which version.
    expect(out.used).toEqual([
      { ref: "dot:roses", character: "Dot", revision: 1, text: "Dot tends the roses in her front garden, and has for years." },
      { ref: "dot:bowls", character: "Dot", revision: 1, text: "She plays bowls on Thursday mornings." },
    ]);
    // A consequence always belongs to the learner's own attempt, whatever the model said.
    expect(out.beats[2].hypothetical).toBe(true);
    // Work guidance in a beat, and no source named for it.
    expect(out.missing.join(" ")).toContain("relies on work guidance");
    expect(out.fields).toEqual({ tension: "Fiona’s concern arrives first.", decision: "What to ask Dot first." });
    // Asking saved nothing, and the record has no words in it.
    expect(JSON.stringify(plan().data)).toBe(before);
    const log = db.prepare("SELECT entity, next FROM audit WHERE event = 'story.ai_proposal'").all() as { entity: string; next: string }[];
    expect(log).toEqual([{ entity: "plan:plan-dot-roses", next: JSON.stringify({ kind: "plan", provider: "openai" }) }]);
  });

  it("is for authors, needs a purpose and a connection, and is limited", async () => {
    model.reply = good;
    const p = plan();
    await expect(propose({ kind: "plan", data: p.data }, riley)).rejects.toThrow();
    await expect(propose({ kind: "plan", data: { ...p.data, purpose: "Too short" } })).rejects.toThrow(/Write the learning purpose first/);
    await expect(propose({ kind: "nonsense" })).rejects.toThrow(/Unknown kind/);
    model.ready = false;
    await expect(propose({ kind: "plan", data: p.data })).rejects.toThrow(/Neither Claude nor OpenAI is connected/);
    model.ready = true;
    for (let i = 0; i < 40; i++) await propose({ kind: "plan", data: p.data });
    await expect(propose({ kind: "plan", data: p.data })).rejects.toThrow(/a lot of proposals/);
    await expect(propose({ kind: "plan", data: p.data }, jordan, new Date(now.getTime() + 61 * 60_000))).resolves.toBeTruthy();
  });
});

describe("a second look at continuity", () => {
  it("returns concerns of known kinds about real beats, each an editor can act on", async () => {
    const p = plan();
    model.reply = {
      concerns: [
        { kind: "contradiction", beatId: p.data.beats[0].id, text: "The beat has Dot giving up bowls.", fact: "dot:bowls" },
        { kind: "branch", beatId: "no-such-beat", text: "The consequence reads as shared history.", fact: "" },
        { kind: "made-up-kind", beatId: "", text: "Ignored." },
        { kind: "order", beatId: "", text: "" },
      ],
    };
    const out = await propose({ kind: "continuity", id: p.id, title: p.title, data: p.data });
    expect(out).toMatchObject({ kind: "continuity" });
    if (out.kind !== "continuity") throw new Error("wrong kind");
    expect(out.concerns).toEqual([
      {
        kind: "contradiction",
        beatId: p.data.beats[0].id,
        text: "The beat has Dot giving up bowls.",
        fact: { ref: "dot:bowls", character: "Dot", revision: 1, text: "She plays bowls on Thursday mornings." },
      },
      { kind: "branch", beatId: "", text: "The consequence reads as shared history.", fact: null },
    ]);
    expect(lastPrompt()).toContain(`<beat id="${p.data.beats[0].id}"`);
    expect(lastPrompt()).toContain("A rules-based check has already run");
    // The plan's own answered warnings are untouched: this is a second reader, not a gate.
    expect(JSON.stringify(plan().data)).toBe(JSON.stringify(p.data));
  });
});

describe("a next episode", () => {
  it("drafts from approved canon, and what comes back is only ever a draft episode", async () => {
    model.reply = {
      title: "The long-handled pruner",
      summary:
        "Dot tries a long-handled pruner her coordinator suggested, and finds she can reach the higher roses from the ground. She keeps the stepladder in the shed.",
      whenLabel: "Later that spring",
      changes: "Dot has a way of reaching the higher branches that she chose herself.",
      people: [
        { characterId: "dot", role: "focus" },
        { characterId: "fiona", role: "mention" },
        { characterId: "stranger", role: "focus" },
      ],
      facts: ["dot:roses", "fiona:nothing"],
      missing: ["Whether a pruner was really agreed in “Dot and the roses”."],
    };
    const out = (await propose({ kind: "episode", characterId: "dot", note: "Something small about the roses" })) as EpisodeProposal;
    expect(out).toMatchObject({
      kind: "episode",
      title: "The long-handled pruner",
      whenLabel: "Later that spring",
      source: "An AI draft, for editorial review. Not approved canon.",
    });
    expect(out.people).toEqual([
      { characterId: "dot", role: "focus" },
      { characterId: "fiona", role: "mention" },
    ]);
    // After everything of Dot's that is approved (the markets, at 30), in story order.
    expect(out.seq).toBe(40);
    expect(out.used.map((u) => u.ref)).toEqual(["dot:roses"]);
    expect(out.dropped.join(" ")).toContain("“stranger” in the episode");
    expect(out.boundaries.join(" ")).toContain("Dot: Never give Dot a diagnosis, a fall");
    expect(lastPrompt()).toContain("<author_note>Something small about the roses</author_note>");
    // Nothing was added to the story by asking.
    expect(characterDetail(db, jordan, "dot", now).episodes.map((e) => e.title)).not.toContain("The long-handled pruner");
    // Taking it makes a draft. Approving is still the steward's, through the action that was always there.
    const saved = act({
      action: "save-episode",
      title: out.title,
      summary: out.summary,
      whenLabel: out.whenLabel,
      seq: out.seq,
      people: out.people,
      changes: out.changes,
      source: out.source,
    });
    const ep = characterDetail(db, jordan, "dot", now).episodes.find((e) => e.id === saved.episodeId)!;
    expect(ep).toMatchObject({ status: "draft", seq: 40, source: "An AI draft, for editorial review. Not approved canon." });
    // And a draft episode is not shown to the next proposal as canon.
    await propose({ kind: "episode", characterId: "dot" });
    expect(lastPrompt()).not.toContain("The long-handled pruner");
  });

  it("needs an approved profile to build on, and a usable reply", async () => {
    const made = act({ action: "start-profile", name: "Someone New" });
    await expect(propose({ kind: "episode", characterId: made.id })).rejects.toThrow(/Approve this character’s story profile first/);
    model.reply = { title: "X", summary: "Too short." };
    await expect(propose({ kind: "episode", characterId: "dot" })).rejects.toThrow(/didn’t pass the checks/);
  });
});

describe("a script for a moment", () => {
  const beats = {
    greeting: "Ava here, on the relay outside town.",
    backstory: "Dot has tended her front roses for years. I once learned the hard way to ask before arranging.",
    problem: "Fiona has rung about the ladder, and nobody has asked Dot yet.",
    instruction: "When this ends, choose what you would ask Dot first.",
    interruption: "Hang on, that’s Fiona calling back now.",
  };

  it("refuses a script that recites Ava's backstory word for word", async () => {
    expect(repeatsCanon(`As you know: ${BELL}`, [BELL])).toBe(BELL);
    expect(repeatsCanon("I once sent books to someone who wanted her Thursday friends.", [BELL])).toBeNull();
    model.reply = { beats: { ...beats, backstory: BELL }, nextAction: "Ask Dot" };
    await expect(propose({ kind: "script", id: "mo-ava-opening" })).rejects.toThrow(/didn’t pass the checks/);
    expect(model.issues[0].join(" ")).toContain("Don't recite an approved fact word for word");
  });

  it("drafts the five beats from the speaker, the person it's about and the story so far, and changes nothing", async () => {
    model.reply = {
      beats,
      nextAction: "Ask Dot first",
      facts: ["dot:roses", "ava:bell", "dot:made-up"],
      guidance: ["You must report it within a day."],
      missing: [],
    };
    const before = momentDetail(db, jordan, "mo-ava-opening", now);
    const out = (await propose({ kind: "script", id: "mo-ava-opening" })) as ScriptProposal;
    expect(out).toMatchObject({ kind: "script", moment: "opening_transmission", beats, nextAction: "Ask Dot first", text: "", questions: [] });
    expect(out.used.map((u) => `${u.character} v${u.revision}: ${u.ref}`)).toEqual(["Dot v1: dot:roses", "Ava v1: ava:bell"]);
    expect(out.guidance).toEqual(["You must report it within a day."]);
    expect(out.dropped.join(" ")).toContain("“dot:made-up”");
    const sent = lastPrompt();
    expect(sent).toContain('<person id="ava" name="Ava">');
    expect(sent).toContain('<person id="dot" name="Dot">');
    // Fiona isn't the speaker or the person it's about, and the markets haven't happened yet at this point.
    expect(sent).not.toContain('<person id="fiona"');
    expect(sent).toContain("Dot and the roses");
    expect(sent).not.toContain("A morning at the markets");
    expect(sent).toContain("referred to in a phrase and never recited");
    // The moment, its approved version and its recordings are exactly as they were.
    const after = momentDetail(db, jordan, "mo-ava-opening", now);
    expect(JSON.stringify([after.draft, after.approved, after.revision, after.status, after.audio])).toBe(
      JSON.stringify([before.draft, before.approved, before.revision, before.status, before.audio]),
    );
  });

  it("drafts a check-in as an update and two to four questions, in the character's own voice", async () => {
    model.reply = {
      text: "The roses are coming on. I had a go with the kneeler and it suits me.",
      questions: [{ label: "How is the plan going?", answer: "Better than I thought it would, if I’m honest." }],
    };
    expect(scriptIssues(model.reply, "check_in", []).join(" ")).toContain("two to four questions");
    await expect(propose({ kind: "script", id: "mo-dot-checkin" })).rejects.toThrow(/didn’t pass the checks/);
    model.reply = {
      text: "The roses are coming on. I had a go with the kneeler and it suits me.",
      questions: [
        { label: "How is the plan going?", answer: "Better than I thought it would, if I’m honest." },
        { label: "What about the markets?", answer: "I’m thinking about Saturday. I like to choose my own plants." },
      ],
      facts: ["dot:roses"],
    };
    const out = (await propose({ kind: "script", id: "mo-dot-checkin" })) as ScriptProposal;
    expect(out.questions.map((q) => q.label)).toEqual(["How is the plan going?", "What about the markets?"]);
    expect(out.beats).toBeNull();
    // This check-in sits at the markets episode, so that episode is part of the story so far.
    expect(lastPrompt()).toContain("A morning at the markets");
    await expect(propose({ kind: "script", id: "no-such-moment" })).rejects.toThrow();
  });

  it("takes citation ids back out of the words an author might use, and counts them as citations", async () => {
    model.reply = {
      beats: {
        ...beats,
        backstory: "Dot has tended her front roses for years [dot:roses] [dot:hands]. I ask before I arrange [ava:asks].",
        problem: "Fiona has rung about the ladder [ep-roses], and nobody has asked Dot.",
      },
      facts: [],
    };
    const out = (await propose({ kind: "script", id: "mo-ava-opening" })) as ScriptProposal;
    expect(out.beats!.backstory).toBe("Dot has tended her front roses for years. I ask before I arrange.");
    expect(out.beats!.problem).toBe("Fiona has rung about the ladder, and nobody has asked Dot.");
    expect(out.used.map((u) => u.ref)).toEqual(["dot:roses", "dot:hands", "ava:asks", "ep-roses"]);
    expect(JSON.stringify(out.beats)).not.toContain("[");
    // A script with no button wording is still a draft.
    expect(out.nextAction).toBe("");
    const found: string[] = [];
    expect(liftRefs({ text: "Keep [this] and (that) [dot:roses].", facts: ["[dot:bowls]"], n: 3 }, found)).toEqual({
      text: "Keep [this] and (that).",
      facts: ["[dot:bowls]"],
      n: 3,
    });
    expect(found).toEqual(["dot:roses"]);
  });

  it("resolves a fact only when the id is a real one", () => {
    const people: CanonPerson[] = [
      {
        id: "dot",
        name: "Dot",
        revision: 3,
        role: "",
        summary: "",
        matters: "",
        relationships: [],
        portrayal: "",
        never: "",
        facts: [{ id: "roses", text: "Roses." }],
        episodes: [],
      },
    ];
    expect(resolveFacts(["dot:roses", "[dot:roses]", "dot:lilies", "ava:roses", 7, ""], people)).toEqual({
      used: [{ ref: "dot:roses", character: "Dot", revision: 3, text: "Roses." }],
      unknown: ["dot:lilies", "ava:roses"],
    });
    // An approved episode is canon too, and can be cited by its id. One that isn't in the list can't.
    const withEpisode = [
      { ...people[0], episodes: [{ id: "ep-roses", title: "Dot and the roses", whenLabel: "This spring", summary: "Fiona is worried.", seq: 20 }] },
    ];
    expect(resolveFacts(["ep-roses", "ep-later"], withEpisode)).toEqual({
      used: [{ ref: "ep-roses", character: "Dot", revision: 3, text: "This spring: Dot and the roses. Fiona is worried.", episode: true }],
      unknown: ["ep-later"],
    });
  });
});

describe("the story report", () => {
  const guide = () =>
    db.prepare("SELECT id, slug, draft FROM magazine_guides WHERE status = 'published' ORDER BY id LIMIT 1").get() as {
      id: string;
      slug: string;
      draft: string;
    };
  const card = ordered(lessons[0]).find((c) => c.type !== "listen" && c.visual.kind !== "presenter")!.id;

  it("counts reach and engagement by character, episode and moment version, and holds no one's answers", () => {
    const g = guide();
    const page = (JSON.parse(g.draft) as { pages: { id: string; sections: { blocks: { id: string }[] }[] }[] }).pages[0];
    act({ action: "place", id: "mo-dot-checkin", kind: "guide", ref: g.id, place: page.sections[0].blocks[0].id });
    act({ action: "place", id: "mo-ava-opening", kind: "topic", ref: lessons[0].slug, place: card });
    const placed = storyFor(db, riley, { guide: g.id }, now).moments.find((m) => m.momentId === "mo-dot-checkin")!;
    const opening = storyFor(db, riley, { topic: lessons[0].slug }, now).moments.find((m) => m.momentId === "mo-ava-opening")!;
    const send = (user: User, event: string, placementId: string, key: string, detail = "") =>
      recordStoryEvent(db, user, { event, placementId, key, detail }, now);
    send(riley, "story_check_in_opened", placed.placementId, "open-0001");
    send(riley, "story_check_in_opened", placed.placementId, "open-0001");
    send(riley, "story_question_selected", placed.placementId, "question-01", "plan");
    send(riley, "story_history_opened", placed.placementId, "history-001");
    send(jordan, "story_check_in_opened", placed.placementId, "open-0002");
    send(riley, "ava_transmission_started", opening.placementId, "start-0001");
    send(riley, "ava_transmission_skipped", opening.placementId, "skip-00001");

    const r = storyReport(db, jordan, { from: "2026-11-01", to: "2026-11-30" }, now);
    expect(r.totals).toMatchObject({ exposed: 2, placements: 2 });
    expect(r.thinSample).toBe(THIN_SAMPLE);
    const dot = r.characters.find((c) => c.name === "Dot")!;
    expect(dot).toMatchObject({ exposed: 2, thin: true, checkInOpens: 2, checkInPeople: 2, questions: 1, historyOpens: 1, placed: 2 });
    // Ava opened the Topic's story; she also features nowhere else here.
    expect(r.characters.find((c) => c.name === "Ava")).toMatchObject({ exposed: 1, checkInOpens: 0 });
    expect(r.episodes.find((e) => e.title === "A morning at the markets")).toMatchObject({ exposed: 2, checkInOpens: 2 });
    const checkIn = r.moments.find((m) => m.id === "mo-dot-checkin")!;
    expect(checkIn).toMatchObject({ revision: 1, current: true, exposed: 2, checkInOpens: 2, questions: 1, speaker: "Dot" });
    expect(checkIn.places).toHaveLength(1);
    expect(r.moments.find((m) => m.id === "mo-ava-opening")).toMatchObject({ started: 1, skipped: 1, ended: 0 });
    // A skipped transmission or an opened check-in is in the engagement figures only.
    expect(r.learning.topicPlacements).toBe(1);
    expect(JSON.stringify(r)).not.toContain("riley");
    expect(JSON.stringify(r)).not.toContain('"plan"');
    expect(() => storyReport(db, riley, {}, now)).toThrow();
    // Outside the dates, the people aren't counted, and the dates are always given back.
    const before = storyReport(db, jordan, { from: "2026-10-01", to: "2026-10-31" }, now);
    expect(before.range).toEqual({ from: "2026-10-01", to: "2026-10-31" });
    expect(before.totals.exposed).toBe(0);
    expect(before.characters.find((c) => c.name === "Dot")).toMatchObject({ exposed: 0, thin: false, placed: 2 });
  });

  it("points an editor at what to look at: a placement left behind, a link that won't open, a plan with open warnings", () => {
    const g = guide();
    const page = (JSON.parse(g.draft) as { pages: { id: string; sections: { blocks: { id: string }[] }[] }[] }).pages[0];
    act({ action: "place", id: "mo-ava-debrief", kind: "guide", ref: g.id, place: `page:${page.id}` });
    // The debrief is revised and approved again: the placement still shows what it was placed with.
    const d = momentDetail(db, jordan, "mo-ava-debrief", now);
    act({
      action: "save-moment",
      id: "mo-ava-debrief",
      featuredId: d.featuredId,
      episodeId: d.episodeId,
      data: { ...d.draft, text: `${d.draft.text} One more line.` },
    });
    act({ action: "approve-moment", id: "mo-ava-debrief" });
    // An appearance that points at a Topic that isn't there.
    db.prepare(
      "INSERT INTO story_appearances (id, character_id, episode_id, kind, ref, created_by, created_at) VALUES ('ap-gone', 'dot', 'ep-roses', 'topic', 'a-topic-that-has-gone', 'jordan', ?)",
    ).run(now.toISOString());
    const r = storyReport(db, jordan, {}, now);
    expect(r.diagnostics.behind).toEqual([{ moment: expect.any(String), where: expect.stringContaining("top of the page"), revision: 1 }]);
    expect(r.diagnostics.brokenLinks).toEqual([{ character: "Dot", label: "a-topic-that-has-gone", format: "Topic" }]);
    // The debrief at its old version is its own row, so the two versions can be compared.
    expect(r.moments.filter((m) => m.id === "mo-ava-debrief").map((m) => [m.revision, m.current])).toEqual([[1, false]]);
    expect(r.diagnostics.recommended).toEqual([]);
    expect(r.diagnostics.unanswered).toEqual([]);
    expect(r.work).toEqual([]);
  });
});
