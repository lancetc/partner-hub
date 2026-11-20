import { describe, expect, it } from "vitest";
import { BLOCK_LABELS } from "./magazine";
import {
  cleanMoment,
  cleanPlan,
  cleanProfile,
  continuityCheck,
  emptyMoment,
  emptyPlan,
  emptyProfile,
  momentProblems,
  outlineFor,
  profileChanges,
  profileProblems,
  scriptOf,
  splitHistory,
  starterBeats,
  suggestCharacters,
  TX,
  txNext,
  txTimer,
  type CastMember,
  type Episode,
  type HistoryItem,
  type TxEvent,
  type TxState,
} from "./story";

/* Story Plans: a coherent cast, history without spoilers, and a transmission that can't get stuck. */

const dot = (over: Partial<CastMember> = {}): CastMember => ({
  id: "dot",
  name: "Dot",
  host: false,
  approved: true,
  audience: [],
  appearances: 1,
  episodes: [],
  profile: {
    ...emptyProfile(),
    summary: "Dot lives at home and knows her own mind.",
    narrativeRole: "An older person living at home",
    matters: "Doing things for herself: the roses in her front garden.",
    relationships: [{ id: "fiona", name: "Fiona", relation: "daughter", note: "" }],
    facts: [{ id: "roses", text: "Dot tends the roses in her front garden.", source: "" }],
  },
  ...over,
});
const ava = (over: Partial<CastMember> = {}): CastMember => ({
  ...dot(),
  id: "ava",
  name: "Ava",
  profile: {
    ...emptyProfile(),
    summary: "A regional care coordinator.",
    narrativeRole: "Host",
    matters: "Checking the source.",
    facts: [{ id: "relay", text: "Ava sends field transmissions.", source: "" }],
  },
  ...over,
});
const episode = (id: string, seq: number, over: Partial<Episode> = {}): Episode => ({
  id,
  title: id,
  summary: "",
  whenLabel: "",
  seq,
  people: [{ characterId: "dot", role: "focus" }],
  changes: "",
  source: "",
  status: "approved",
  ...over,
});

describe("a character’s approved story", () => {
  it("keeps only what a profile can hold, and says what’s missing before approval", () => {
    const p = cleanProfile({
      summary: "x",
      facts: [{ text: "  A fact  " }, { text: "" }],
      relationships: [{ name: "Fiona" }],
      voice: { id: "<script>" },
      provenance: "real",
    });
    expect(p.facts).toEqual([{ id: "f1", text: "A fact", source: "" }]);
    expect(p.relationships).toEqual([]);
    expect(p.voice.id).toBe("");
    expect(p.provenance).toBe("fictional");
    expect(profileProblems(emptyProfile())).toHaveLength(4);
    expect(profileProblems(dot().profile)).toEqual([]);
  });

  it("lists what changed against the approved version, so an editor can check what already tells it", () => {
    const was = dot().profile;
    const now = {
      ...was,
      facts: [
        { id: "roses", text: "Dot tends the roses in her back garden.", source: "" },
        { id: "bowls", text: "She plays bowls.", source: "" },
      ],
      relationships: [],
    };
    expect(profileChanges(null, now)).toEqual([]);
    expect(profileChanges(was, was)).toEqual([]);
    expect(profileChanges(was, now)).toEqual([
      "Fact changed: “Dot tends the roses in her front garden.” becomes “Dot tends the roses in her back garden.”",
      "New fact: She plays bowls.",
      "Relationship removed: Fiona (daughter)",
    ]);
  });
});

describe("history", () => {
  const item = (id: string, seq: number): HistoryItem => ({
    id,
    episodeId: id,
    seq,
    whenLabel: "",
    title: id,
    summary: "",
    format: "Topic",
    href: `/topics/${id}`,
    role: "focus",
  });
  it("is told in story order, up to where the learner is, with later appearances held back", () => {
    const all = [item("markets", 30), item("thursday", 5), item("roses", 20)];
    const h = splitHistory(all, 20);
    expect(h.upTo.map((i) => i.id)).toEqual(["thursday", "roses"]);
    expect(h.later.map((i) => i.id)).toEqual(["markets"]);
    expect(splitHistory(all, null).later).toEqual([]);
    // An earlier episode published later still sorts earlier: order is the story's, not the calendar's.
    expect(splitHistory([...all, item("prequel", 1)], 5).upTo.map((i) => i.id)).toEqual(["prequel", "thursday"]);
  });
});

describe("story moments", () => {
  it("reads an opening transmission’s script from its beats, in order", () => {
    const d = {
      ...emptyMoment(),
      beats: { greeting: "Hi, I’m Ava.", backstory: "", problem: "Fiona’s worried.", instruction: "Decide what to ask Dot.", interruption: "Hang on…" },
    };
    expect(scriptOf("opening_transmission", d)).toBe("Hi, I’m Ava. Fiona’s worried. Decide what to ask Dot. Hang on…");
    expect(scriptOf("debrief", { ...d, text: "A note." })).toBe("A note.");
  });

  it("won’t approve a moment without its words, its reason and an approved speaker", () => {
    const ok = { speakerApproved: true, episodeApproved: true };
    expect(momentProblems("debrief", emptyMoment(), { speakerApproved: false, episodeApproved: false })).toHaveLength(4);
    expect(momentProblems("debrief", { ...emptyMoment(), text: "I nearly answered too soon.", purpose: "Connects the story to work." }, ok)).toEqual([]);
    expect(momentProblems("new_information", { ...emptyMoment(), text: "Fiona rang back.", purpose: "Changes the problem." }, ok)).toEqual([
      "Say what new information this brings.",
    ]);
    const checkin = {
      ...emptyMoment(),
      text: "It’s Dot. The roses are fine.",
      purpose: "Shows what came next.",
      questions: [{ id: "q1", label: "How are you?", answer: "" }],
    };
    expect(momentProblems("check_in", checkin, ok)).toEqual([
      "Say when this is in the story, in words: “A few weeks later”.",
      "Every question needs its wording and an approved answer.",
    ]);
  });

  it("needs an opening’s instruction, hand-off and, with a video, its poster, captions and a match check", () => {
    const ok = { speakerApproved: true, episodeApproved: null };
    const beats = { greeting: "Hi, I’m Ava.", backstory: "", problem: "", instruction: "Decide what to ask Dot.", interruption: "Fiona’s calling." };
    const base = { ...emptyMoment(), beats, purpose: "Hands over the first decision.", nextAction: "Choose what to ask", role: "You’re Dot’s coordinator." };
    expect(momentProblems("opening_transmission", base, ok)).toEqual([]);
    expect(momentProblems("opening_transmission", { ...base, beats: { ...beats, interruption: "" }, nextAction: "" }, ok)).toHaveLength(2);
    const video = { src: "/api/uploads/a.mp4", poster: "", captions: "", endFrame: "", checked: false };
    expect(momentProblems("opening_transmission", { ...base, video }, ok)).toHaveLength(3);
    expect(
      momentProblems("opening_transmission", { ...base, video: { ...video, poster: "/images/ava.webp", captions: "/api/uploads/a.vtt", checked: true } }, ok),
    ).toEqual([]);
  });

  it("accepts only site media, and at most four questions", () => {
    const d = cleanMoment({
      video: { src: "https://evil.example/a.mp4", poster: "/images/ava.webp" },
      questions: Array.from({ length: 6 }, (_, i) => ({ label: `Q${i}`, answer: "An answer." })),
    });
    expect(d.video.src).toBe("");
    expect(d.video.poster).toBe("/images/ava.webp");
    expect(d.questions).toHaveLength(4);
  });
});

describe("the opening transmission’s stage", () => {
  const run = (events: TxEvent[], reduced = false, from: TxState = "ready") => events.reduce((s, e) => txNext(s, e, reduced), from);

  it("goes static, video, end flash, frame hidden, empty stage, poster, then begins", () => {
    const path: TxState[] = [];
    let s: TxState = "ready";
    for (const e of ["play", "static_done", "ended", "flash_done", "hidden", "hold_done", "begin"] as TxEvent[]) path.push((s = txNext(s, e)));
    expect(path).toEqual(["static", "playing", "flash", "hiding", "empty", "poster", "begun"]);
  });

  it("holds the empty stage for three seconds, counted from when the frame has gone", () => {
    expect(TX.hold).toBe(3000);
    expect(txTimer("empty")).toEqual({ ms: 3000, event: "hold_done" });
    // The wait belongs to the empty stage only: the flash and the fade each finish first.
    expect(txTimer("flash")).toEqual({ ms: TX.endFlash, event: "flash_done" });
    expect(txTimer("hiding")).toEqual({ ms: TX.fadeOut, event: "hidden" });
    expect(txTimer("playing")).toBeNull();
    expect(txTimer("poster")).toBeNull();
    expect(TX.endFlash).toBeLessThanOrEqual(350);
    expect(TX.fadeOut).toBeLessThanOrEqual(200);
  });

  it("ignores a second ended event and a late timer", () => {
    expect(run(["play", "static_done", "ended", "ended"])).toBe("flash");
    expect(run(["play", "static_done", "ended", "flash_done", "hidden", "ended", "flash_done", "hidden"])).toBe("empty");
    expect(run(["play", "static_done", "ended", "flash_done", "hidden", "hold_done", "hold_done", "ended"])).toBe("poster");
    expect(txNext("ready", "hold_done")).toBe("ready");
    expect(txNext("begun", "ended")).toBe("begun");
  });

  it("skips or fails straight to the activity, with no forced wait", () => {
    for (const s of ["ready", "static", "playing", "flash", "hiding", "empty", "poster"] as TxState[]) {
      expect(txNext(s, "skip")).toBe("begun");
      expect(txNext(s, "fail")).toBe("begun");
    }
    expect(txNext("empty", "skip_wait")).toBe("poster");
    // Coming back to the tab part-way through settles on the poster instead of firing late.
    for (const s of ["flash", "hiding", "empty"] as TxState[]) expect(txNext(s, "settle")).toBe("poster");
    expect(txNext("playing", "settle")).toBe("playing");
  });

  it("can be replayed from the poster or after beginning, and only from there", () => {
    expect(txNext("poster", "replay")).toBe("static");
    expect(txNext("begun", "replay")).toBe("static");
    expect(txNext("playing", "replay")).toBe("playing");
    expect(txNext("empty", "replay")).toBe("empty");
  });

  it("has no static, flash or wait with reduced motion", () => {
    expect(run(["play"], true)).toBe("playing");
    expect(run(["play", "ended"], true)).toBe("poster");
    expect(run(["play", "ended", "begin"], true)).toBe("begun");
    expect(txNext("poster", "replay", true)).toBe("playing");
  });
});

describe("finding a fitting character", () => {
  const brief = {
    behaviour: "Ask what matters to the person before suggesting a change to how she tends her roses",
    situation: "",
    tension: "The family’s concern arrives first",
    audience: "coordinator" as const,
  };

  it("ranks on the approved story’s connection to the behaviour, and gives the reasons", () => {
    const { fits, withheld } = suggestCharacters(brief, [
      ava(),
      dot({ episodes: [episode("Dot and the roses", 20, { summary: "Dot wants to keep tending her roses." })] }),
    ]);
    expect(withheld).toEqual([]);
    expect(fits.map((f) => f.id)).toEqual(["dot", "ava"]);
    expect(fits[0].reasons.join(" ")).toMatch(/Approved facts that connect: “Dot tends the roses/);
    expect(fits[0].reasons.join(" ")).toMatch(/Builds on an approved episode/);
    expect(fits[0].tensions).toEqual([]);
    // An unrelated character is flagged, not dressed up as a fit.
    expect(fits[1].score).toBe(0);
    expect(suggestCharacters(brief, [ava({ host: true })]).fits[0].tensions[0]).toMatch(/is a practitioner in the stories/);
    expect(fits[1].tensions[0]).toMatch(/Nothing in Ava’s approved story connects/);
  });

  it("withholds a character who isn’t approved, or isn’t for this audience", () => {
    const { fits, withheld } = suggestCharacters(brief, [dot({ approved: false }), ava({ audience: ["staff"] })]);
    expect(fits).toEqual([]);
    expect(withheld).toEqual([
      { id: "dot", name: "Dot", reason: "No approved story profile yet." },
      { id: "ava", name: "Ava", reason: "Not approved for Care Coordinators." },
    ]);
  });

  it("warns when a familiar face is collecting every problem", () => {
    const { fits } = suggestCharacters(brief, [dot({ appearances: 7 })]);
    expect(fits[0].tensions.join(" ")).toMatch(/already appears in 7 places/);
  });
});

describe("checking continuity", () => {
  const plan = () => ({
    ...emptyPlan(),
    anchorId: "dot",
    purpose: "Ask Dot before suggesting a change.",
    sources: "The approved guidance on choice and risk.",
    transfer: "The markets.",
    beats: starterBeats(),
  });

  it("passes a plan that has a choice, a consequence, a transfer and a source", () => {
    expect(continuityCheck(plan(), [dot()], [], [])).toEqual([]);
    expect(continuityCheck({ ...emptyPlan(), mode: "none" }, [dot()], [], [])).toEqual([]);
  });

  it("flags a relationship the approved profile doesn’t have", () => {
    const p = { ...plan(), tension: "Dot’s son thinks she should stop. Dot’s daughter isn’t so sure." };
    const w = continuityCheck(p, [dot()], [], []);
    expect(w).toEqual([
      {
        id: "relation:dot:son",
        level: "warn",
        text: "The plan mentions Dot’s son, who isn’t in the approved profile. Propose it as a new fact for the steward, or change the plan.",
      },
    ]);
  });

  it("blocks a character outside the plan’s audience, and warns about unapproved or overused ones", () => {
    const w = continuityCheck({ ...plan(), audience: "partner" }, [dot({ audience: ["coordinator"], approved: false, appearances: 6 })], [], []);
    expect(w.map((x) => `${x.level}:${x.id}`)).toEqual(["warn:unapproved:dot", "block:audience:dot", "warn:catchall:dot"]);
  });

  it("notices a story with no decision, no consequence, no transfer or no source", () => {
    const none = { ...plan(), transfer: "", sources: "", beats: [] };
    expect(continuityCheck(none, [dot()], [], []).map((w) => w.id)).toEqual(["no-choice", "no-transfer", "no-source"]);
    const half = { ...plan(), beats: starterBeats().filter((b) => b.kind !== "consequence") };
    expect(continuityCheck(half, [dot()], [], []).map((w) => w.id)).toEqual(["no-consequence"]);
  });

  it("keeps a learner’s branch out of shared history, and beats in story order", () => {
    const beats = starterBeats().map((b) =>
      b.kind === "consequence"
        ? { ...b, hypothetical: false }
        : b.kind === "goal"
          ? { ...b, episodeId: "markets" }
          : b.kind === "situation"
            ? { ...b, episodeId: "roses" }
            : b,
    );
    const w = continuityCheck(
      { ...plan(), beats },
      [dot()],
      [episode("roses", 20, { title: "Dot and the roses" }), episode("markets", 30, { title: "The markets", status: "draft" })],
      [],
    );
    expect(w.map((x) => x.id)).toEqual(["episode:markets", "order:beat2", "canon:beat5"]);
    expect(w[1].text).toMatch(/“Dot and the roses” happens before “The markets” in the story/);
  });

  it("checks the moments a plan places", () => {
    const beats = starterBeats().map((b, i) => (i === 0 ? { ...b, momentIds: ["debrief"] } : i === 1 ? { ...b, momentIds: ["opening"] } : b));
    const w = continuityCheck(
      { ...plan(), beats },
      [dot()],
      [],
      [
        { id: "opening", kind: "opening_transmission", status: "approved" },
        { id: "debrief", kind: "debrief", status: "draft" },
      ],
    );
    expect(w.map((x) => x.id)).toEqual(["moment:debrief", "opening:opening"]);
  });
});

describe("from a plan to an outline", () => {
  it("offers only blocks the Hub has, each with why it’s there", () => {
    const p = cleanPlan({
      beats: [
        { kind: "goal", text: "Dot explains why the roses matter." },
        {
          kind: "choice",
          text: "Decide what to ask Dot first.",
          action: "Choose what to ask Dot",
          blocks: ["decision", "made-up-block"],
          evidence: "practice",
        },
        { kind: "transfer", text: "" },
      ],
    });
    expect(p.beats[1].blocks).toEqual(["decision"]);
    const o = outlineFor(p, BLOCK_LABELS);
    expect(o).toHaveLength(2);
    expect(o[1]).toMatchObject({ beat: "Learner choice", pattern: "decide", evidence: "Unscored practice", title: "Choose what to ask Dot" });
    expect(o[1].blocks[0].label).toBe(BLOCK_LABELS.decision);
    expect(o[1].blocks[0].why).toMatch(/^Supports “Learner choice”: the learner .* Evidence: /);
    // A beat with no chosen block gets the registry's best fit, never an assessed one unless the beat is an assessment.
    expect(o[0].blocks).toHaveLength(1);
    expect(Object.keys(BLOCK_LABELS)).toContain(o[0].blocks[0].type);
  });
});
