import type { Beat, CastRole, MomentData, MomentKind, PlanData, Profile, StoryStatus } from "@/lib/story";
import { emptyMoment, emptyPlan } from "@/lib/story";

/*
  The Story Plan pilot (docs/story-plans.md): Dot, her daughter Fiona, and Ava, the stories' host. Fictional, and
  marked as sample canon. Dot's facts are the ones the Hub's existing activities already tell about her
  (Coordinator's Day, the Door Explorer, a Red Pen case), so the pilot starts consistent with what learners have
  seen. Ava's Outback Relay and the Mrs Bell story are the PRD's proposed pilot history: editable, versioned
  records for an editor to review, not product facts.
*/

export type PilotCharacter = {
  id: string;
  name: string;
  role: "participant" | "family" | "coordinator";
  look: string;
  steward: string;
  profile: Profile;
};

const voice = { id: "", name: "", reason: "" };
/** The Hub's default ElevenLabs narrator (server/tts.ts). Dot has no voice yet: none on the account suits an older Australian woman without caricature. */
const avaVoice = {
  id: "6UXvJKkwaqtXE3nZHvbF",
  name: "Claire - Calm & Friendly",
  reason: "A warm,  clear Australian voice,  already the Hub’s default narrator. A pilot choice to review.",
};

export const PILOT_CHARACTERS: PilotCharacter[] = [
  {
    id: "dot",
    name: "Dot",
    role: "participant",
    look: "A woman in her early eighties with short silver hair and gardening-weathered hands, in a soft cardigan, warm and direct.",
    steward: "Partner Enablement",
    profile: {
      provenance: "fictional",
      pronouns: "she/her",
      narrativeRole: "An older person living in her own home, who knows her own mind.",
      summary:
        "Dot lives at home with support from Trilogy Care. She is practical, funny and firm about doing things herself, in her own time. Her daughter Fiona is close and sometimes worries more than Dot would like.",
      matters: "Doing things for herself: the roses in her front garden, her bowls on Thursday mornings, and doing up her own buttons.",
      relationships: [
        { id: "fiona", name: "Fiona", relation: "daughter", note: "Helps with shopping and keeps an eye on how things are going." },
        { id: "lena", name: "Lena", relation: "cleaner", note: "Dot’s regular cleaner, whom she would rather wait for than replace." },
      ],
      facts: [
        { id: "roses", text: "Dot tends the roses in her front garden, and has for years.", source: "Door Explorer; the Story Plan pilot" },
        { id: "bowls", text: "She plays bowls on Thursday mornings.", source: "A Coordinator’s Day" },
        { id: "hands", text: "She has osteoarthritis in both hands and wants to keep doing her own buttons.", source: "Red Pen: Dot’s dressing goal" },
        { id: "lena", text: "She prefers her regular cleaner, Lena, and would rather wait than have someone new.", source: "A Coordinator’s Day" },
        { id: "fiona", text: "Her daughter Fiona can pick up shopping, and asks questions when a service changes.", source: "A Coordinator’s Day" },
      ],
      portrayal:
        "Dot has goals, opinions and a sense of humour. She is never there only to show a mistake or to reward the right answer. Let her speak for herself before anyone interprets her.",
      visual: "Short silver hair, a cardigan, gardening gloves or secateurs close by. At home, in the garden or out in her community.",
      never: "Never give Dot a diagnosis, a fall, a family dispute or an outcome that an approved episode hasn’t established.",
      voice,
    },
  },
  {
    id: "fiona",
    name: "Fiona",
    role: "family",
    look: "A woman in her fifties with shoulder-length brown hair, in work clothes, capable and a little tired.",
    steward: "Partner Enablement",
    profile: {
      provenance: "fictional",
      pronouns: "she/her",
      narrativeRole: "A daughter who supports her mother and worries about her.",
      summary: "Fiona is Dot’s daughter. She works full time, helps where she can, and tends to raise a concern by asking a pointed question.",
      matters: "Knowing her mum is safe, and being told when something changes.",
      relationships: [{ id: "dot", name: "Dot", relation: "mother", note: "" }],
      facts: [{ id: "shopping", text: "Fiona can pick up Dot’s shopping.", source: "A Coordinator’s Day" }],
      portrayal: "Fiona’s worry is reasonable and so is Dot’s independence. She is not an obstacle, and she isn’t always right.",
      visual: "",
      never: "Never make Fiona the decision-maker for Dot.",
      voice,
    },
  },
  {
    id: "ava",
    name: "Ava",
    role: "coordinator",
    look: "A woman in her thirties in practical field clothes with a scuffed notebook, standing by a small relay aerial under a wide night sky, observant and warm.",
    steward: "Partner Enablement",
    profile: {
      provenance: "fictional",
      pronouns: "she/her",
      narrativeRole: "A fictional care coordination practitioner, and the stories’ recurring host.",
      summary:
        "Ava is a regional care coordinator whose work takes her between homes, suppliers and communities. On the road she sends short field transmissions from a small mobile relay. She is observant, warm, occasionally dryly funny, and good at her job without knowing everything.",
      matters: "Finding out what a person is trying to keep in their life before settling on a solution, then coming back to see whether the plan worked.",
      relationships: [{ id: "bell", name: "Mrs Bell", relation: "former client", note: "The library request, early in Ava’s career." }],
      facts: [
        {
          id: "relay",
          text: "Ava sends short field transmissions from a small mobile relay when she’s on the road.",
          source: "Pilot canon: Ava’s Outback Relay",
        },
        {
          id: "bell",
          text: "Early in her career Ava arranged book deliveries for Mrs Bell, who had asked for help getting to the town library. Mrs Bell went for her Thursday friends as much as for the books.",
          source: "Pilot canon: the library request",
        },
        { id: "notebook", text: "She keeps a scuffed field notebook headed “What did I miss?”", source: "Pilot canon" },
        { id: "asks", text: "She asks what a person is trying to keep in their life before proposing an arrangement.", source: "Pilot canon" },
        {
          id: "blindspot",
          text: "Her blind spot: good listening alone can’t fix a missing agreement, a bad workflow or a supplier constraint.",
          source: "Pilot canon",
        },
      ],
      portrayal:
        "Reveal her history in fragments, never as a full origin speech. She addresses the learner as a fellow practitioner and leaves the judgement to them. The Hub’s Topic presenter is also called Ava: decide whether they are the same on-screen person before this profile is used with real learners.",
      visual:
        "A recognisable face and practical field clothing, the scuffed notebook, a relay aerial and stars. A town, an office or a remote setting are all fine; the relay is a storytelling device, not a claim about how Trilogy Care works.",
      never:
        "Never claims to have met a featured person, or to know an outcome, that an approved episode hasn’t established. Never speaks as a real Trilogy Care employee, and her experience never overrides approved guidance.",
      voice: avaVoice,
    },
  },
];

export type PilotEpisode = {
  id: string;
  title: string;
  summary: string;
  whenLabel: string;
  seq: number;
  people: { characterId: string; role: CastRole }[];
  changes: string;
  source: string;
  status: StoryStatus;
};

export const PILOT_EPISODES: PilotEpisode[] = [
  {
    id: "ep-thursday",
    title: "Thursday without Lena",
    summary:
      "Dot’s regular cleaner can’t come on Thursday. Dot would rather wait for her than have someone new, and Fiona wants to know why the cleaner isn’t coming.",
    whenLabel: "Some time ago",
    seq: 5,
    people: [
      { characterId: "dot", role: "focus" },
      { characterId: "fiona", role: "supporting" },
    ],
    changes: "Dot’s preference for her own cleaner, and Fiona’s habit of asking, are established.",
    source: "A Coordinator’s Day",
    status: "approved",
  },
  {
    id: "ep-library",
    title: "The library request",
    summary:
      "Early in her career, Ava arranged book deliveries for Mrs Bell, who had asked for help getting to the town library. It took another conversation to learn the visits were about her Thursday friends.",
    whenLabel: "Early in Ava’s career",
    seq: 10,
    people: [{ characterId: "ava", role: "focus" }],
    changes: "Ava starts the notebook headed “What did I miss?”",
    source: "Pilot canon, for editorial review. Not a real client story.",
    status: "approved",
  },
  {
    id: "ep-roses",
    title: "Dot and the roses",
    summary:
      "Dot wants to keep tending her roses. Fiona is worried about the ladder Dot uses to reach the higher branches. Dot’s coordinator has to find out what matters to Dot before suggesting any change.",
    whenLabel: "This spring",
    seq: 20,
    people: [
      { characterId: "dot", role: "focus" },
      { characterId: "fiona", role: "supporting" },
      { characterId: "ava", role: "supporting" },
    ],
    changes: "Fiona’s worry about the ladder is out in the open. Dot and her coordinator agree to make a plan together, and to check whether it works.",
    source: "The Story Plan pilot. The final feedback uses the approved guidance on choice and risk; the story supplies no new rule.",
    status: "approved",
  },
  {
    id: "ep-markets",
    title: "A morning at the markets",
    summary: "A few weeks on, Dot is thinking about the Saturday markets, where she likes to choose her own plants.",
    whenLabel: "A few weeks later",
    seq: 30,
    people: [{ characterId: "dot", role: "focus" }],
    changes: "The same question comes up in a new place: what Dot wants to keep doing, and how.",
    source: "The Story Plan pilot",
    status: "approved",
  },
  {
    id: "ep-invoice",
    title: "An invoice that looks right",
    summary: "Ava’s empathy doesn’t tell her whether an invoice matches the agreed service and rate. She has to check the source.",
    whenLabel: "Later that year",
    seq: 40,
    people: [{ characterId: "ava", role: "focus" }],
    changes: "Ava adds “Did I check the source?” to the notebook.",
    source: "Proposed. Links to the Problem desk’s sample invoice theme.",
    status: "draft",
  },
];

export const PILOT_APPEARANCES = [
  {
    characterId: "dot",
    episodeId: "ep-thursday",
    kind: "other" as const,
    label: "A Coordinator’s Day",
    href: "/play/coordinators-day",
    type: "focus" as CastRole,
    summary: "Dot’s cleaner can’t come on Thursday, and a coordinator has to work out what Dot would prefer.",
  },
];

const m = (over: Partial<MomentData>): MomentData => ({ ...emptyMoment(), ...over });
export type PilotMoment = { id: string; kind: MomentKind; speakerId: string; featuredId: string; episodeId: string; data: MomentData };

export const PILOT_MOMENTS: PilotMoment[] = [
  {
    id: "mo-ava-opening",
    kind: "opening_transmission",
    speakerId: "ava",
    featuredId: "dot",
    episodeId: "ep-roses",
    data: m({
      title: "Ava opens “Dot and the roses”",
      purpose: "Hands the learner the first decision with only the backstory it needs, and hints at why Ava asks before she suggests.",
      role: "You’re Dot’s care coordinator, about to speak with her.",
      beats: {
        greeting: "Hi, I’m Ava, transmitting from the relay.",
        backstory:
          "Early in my career I learned that a quick fix can miss what someone was really asking for. Dot’s tended her roses for years, and her daughter Fiona’s worried about the ladder she uses.",
        problem: "Nobody’s asked Dot yet what the roses mean to her, or how she’d want to manage the high branches.",
        instruction: "Before suggesting a change, decide what you would ask Dot.",
        interruption: "Hang on, Fiona’s calling. She’s saying…",
      },
      nextAction: "Choose what to ask Dot first",
      source: "Illustrative script for editorial review. It establishes no policy rule.",
    }),
  },
  {
    id: "mo-new-information",
    kind: "new_information",
    speakerId: "ava",
    featuredId: "dot",
    episodeId: "ep-roses",
    data: m({
      title: "What Fiona actually fears",
      purpose: "Changes the problem after the first decision, so the learner looks at the plan again with what Dot and Fiona each said.",
      newInfo:
        "Fiona’s fear is the ladder on wet ground, not the gardening. The climbing rose over the arch is the one Dot is proudest of, and the only one she can’t reach from the ground.",
      text: "Ava again. Fiona rang back. It isn’t the gardening she minds: last month she found the ladder on wet ground by the fence. And Dot tells me the climbing rose over the arch is the one she’s proudest of. It’s the only one she can’t reach from the ground. What would you do with that?",
      nextAction: "Look at the plan again",
      role: "You’re still Dot’s coordinator. You now know what each of them is worried about.",
      source: "Illustrative. The story supplies no new rule.",
    }),
  },
  {
    id: "mo-dot-response",
    kind: "person_response",
    speakerId: "dot",
    featuredId: "",
    episodeId: "ep-roses",
    data: m({
      title: "Dot answers",
      purpose: "Lets Dot say how being asked first landed for her, before anyone interprets it.",
      text: "You asked me before you told me. That’s all I wanted. I’ll hear Fiona out about the ladder, if she’ll hear me out about the arch.",
      hypothetical: true,
      source: "A possible response inside one learner’s practice. It is not shared history.",
    }),
  },
  {
    id: "mo-ava-debrief",
    kind: "debrief",
    speakerId: "ava",
    featuredId: "dot",
    episodeId: "ep-roses",
    data: m({
      title: "Ava’s notebook",
      purpose: "Connects the story to one action at work, after Dot has spoken for herself.",
      text: "I nearly answered the ladder question before I asked what the roses meant. New line in the notebook: what is this person trying to keep? This week, before you suggest a change, ask that first. Then write down what you agreed, and when you’ll check it worked.",
      nextAction: "Take it to your next conversation",
      source: "Illustrative. Link the approved guidance on choice and risk beside this moment.",
    }),
  },
  {
    id: "mo-dot-checkin",
    kind: "check_in",
    speakerId: "dot",
    featuredId: "",
    episodeId: "ep-markets",
    data: m({
      title: "Check in with Dot: a few weeks later",
      whenLabel: "A few weeks later",
      purpose: "Shows the same principle turning up somewhere new, for anyone who wants to know how Dot is going.",
      text: "It’s Dot. The roses had a good spring. Fiona and I talked it through with my coordinator, and we settled on a way of doing the high branches that I’m happy with. Now I’ve got my eye on the Saturday markets. I like to choose my own plants.",
      questions: [
        {
          id: "plan",
          label: "How did you feel about the plan?",
          answer: "Better than I expected. Nobody told me to stop. They asked what I wanted to keep doing, and we worked backwards from there.",
        },
        {
          id: "fiona",
          label: "How is Fiona about it?",
          answer: "She still rings to check. But she came over and saw how we’d set things up, and she’s stopped mentioning the ladder.",
        },
        {
          id: "markets",
          label: "What’s next?",
          answer: "The markets on Saturday mornings. It’s a fair walk from the bus, so that’s the next thing to talk through.",
        },
      ],
      source: "Pilot canon for editorial review. Not an outcome for every practice branch.",
    }),
  },
];

const beat = (id: string, kind: Beat["kind"], text: string, over: Partial<Beat> = {}): Beat => ({
  id,
  kind,
  text,
  characterId: "",
  episodeId: "ep-roses",
  action: "",
  source: "",
  blocks: [],
  evidence: "explanation",
  hypothetical: false,
  momentIds: [],
  ...over,
});

export const PILOT_PLAN: { id: string; title: string; data: PlanData } = {
  id: "plan-dot-roses",
  title: "Dot and the roses: ask before you suggest",
  data: {
    ...emptyPlan(),
    mode: "story",
    target: "course",
    audience: "coordinator",
    purpose:
      "When an older person’s preferred activity raises a practical risk, coordinators ask what matters to the person and agree a workable plan with them, instead of answering from the family’s concern alone.",
    anchorId: "dot",
    perspective: "The learner is Dot’s coordinator. Dot and Fiona each speak for themselves.",
    tension: "Fiona’s concern arrives first and sounds urgent. It’s quicker to act on it than to ask Dot what the roses mean to her.",
    decision: "What to ask Dot before suggesting any change.",
    effect:
      "Asked first, Dot stays part of the plan. Told first, she may stop mentioning what she does. These are possible responses inside the practice, not Dot’s shared story.",
    transfer: "The same question in a new place: Dot and the Saturday markets. A prompt for the learner’s next real conversation.",
    sources: "The approved guidance on choice and risk governs the final feedback. The story is illustrative and supplies no new rule.",
    checkin: "A few weeks later, Dot says how the plan felt and what she’s thinking about next.",
    ava: "Ava opens and is cut off by Fiona’s call. She returns once with what Fiona actually fears, and closes with a line from her notebook.",
    beats: [
      beat("goal", "goal", "Dot explains why the roses matter, in her own words.", { characterId: "dot" }),
      beat("situation", "situation", "Fiona raises the ladder. The coordinator has heard from Fiona and not yet from Dot.", {
        characterId: "fiona",
        momentIds: ["mo-ava-opening"],
      }),
      beat("choice", "choice", "The coordinator decides what to ask Dot first.", {
        action: "Choose what to ask Dot before suggesting a change",
        evidence: "practice",
        blocks: ["decision"],
      }),
      beat("clue", "clue", "Fiona rings back: it’s the wet ground, not the gardening. Dot names the rose that matters most.", {
        action: "Revisit the plan with what each of them said",
        evidence: "practice",
        momentIds: ["mo-new-information"],
      }),
      beat("consequence", "consequence", "Dot responds to being asked first.", { characterId: "dot", hypothetical: true, momentIds: ["mo-dot-response"] }),
      beat("transfer", "transfer", "Ava’s notebook line, and the learner’s own next conversation.", {
        action: "Write the question you’ll ask first this week",
        blocks: ["action"],
        momentIds: ["mo-ava-debrief"],
      }),
    ],
  },
};
