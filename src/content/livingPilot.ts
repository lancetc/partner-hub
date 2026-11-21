import type { GuideDoc } from "@/lib/magazine";
import { emptyNote, emptyReturn, type NoteData, type ReturnData } from "@/lib/living";
import type { LearningDecision } from "@/lib/problemDesk";
import { emptyMoment, type MomentData } from "@/lib/story";
import type { PilotTheme } from "./problemPilot";

/*
  The living-cases pilot (docs/living-cases.md): Dot's return, a few weeks after the rose garden.

  Everything here is fictional pilot material for editorial approval. It is not an assertion that a new Dot event
  has been approved beyond the episode "A morning at the markets" already in the sample canon, and it describes no
  real client. The course is added as a draft by an author; nothing is published, released or sent by adding it.

  The return asks something new. In the rose garden the plausible mistake was acting on a family member's worry by
  taking something away. At the markets it is accepting a kind offer that quietly replaces the thing itself. The
  shared judgement is the same: find out what the person is trying to keep before agreeing to any change.

  It invents no clinical assessment, rate, entitlement or safety rule. The plan excerpt is fiction, written to say
  only what the approved episode "Dot and the roses" already established.
*/

export const RETURN_PILOT = {
  id: "ret-dot-markets",
  title: "Dot at the markets",
  standfirst: "A few weeks after the rose garden, Fiona has made a kind offer. Hear what Dot and Fiona each know before you answer either of them.",
  audience: ["coordinator"],
  completion: "decision",
  characterId: "dot",
  fromEpisode: "ep-roses",
  toEpisode: "ep-markets",
  /** The earlier decision, in the Dot and the rose garden pilot course. */
  fromPage: "rose-garden",
  fromBlock: "first-question",
  toPage: "the-markets",
  toBlock: "markets-question",
  themeId: "theme-ask-first",
} as const;

export const RETURN_PILOT_DOC: GuideDoc = {
  schema: 2,
  relay: { enabled: true, work: true, sources: ["playbooks", "topics", "resources"], routes: [] },
  pages: [
    {
      id: "the-markets",
      title: "Dot at the markets",
      purpose: "A few weeks later, the same question turns up somewhere new.",
      template: "blank",
      kind: "content",
      required: true,
      relay: {
        purpose: "Help the learner see that the question they asked about the roses applies again at the markets, and find their own first question.",
        beat: "Transfer: the same question in a new place",
        episode: "ep-markets",
        activity: "markets-question",
        characters: [
          { id: "dot", revision: 0 },
          { id: "fiona", revision: 0 },
        ],
        opening: "We’ve moved on a few weeks. Dot’s talking about the Saturday markets now. What do you notice that’s the same as last time?",
        prompts: ["What’s the same here?", "What does Dot want to keep doing?", "What would I ask first?"],
        hold: ["why-it-matters"],
        redirect: "Whether Dot should go to the markets. That is hers to decide with her coordinator, and the course doesn’t rule on it.",
        notes: "",
      },
      sections: [
        {
          id: "saturday",
          title: "Saturday",
          blocks: [
            {
              id: "markets-scene",
              type: "text",
              body: "A few weeks on, Dot mentions the Saturday markets. She likes to choose her own plants there. It’s a fair walk from the car park, and Fiona has offered to pick the plants up for her instead.",
            },
            {
              id: "dot-message",
              type: "text",
              heading: "A message from Dot",
              level: 3,
              body: "“I’d like to get back to the Saturday markets before the season’s over. I like to pick my own. You can’t tell a seedling from a photograph.”",
            },
            {
              id: "fiona-note",
              type: "text",
              heading: "A note from Fiona",
              level: 3,
              body: "“Mum mentioned the markets. It’s a long way from the car park and the ground is rough near the stalls. I’m there most Saturdays anyway, so I’ve told her I’ll pick up whatever she wants.”",
            },
            {
              id: "plan-excerpt",
              type: "callout",
              style: "example",
              label: "From Dot’s support plan (a fictional excerpt)",
              body: "What matters to Dot: choosing and tending her own garden. Agreed in spring: any change is worked out with Dot, and checked afterwards to see whether it worked for her.",
            },
          ],
        },
        {
          id: "two-views",
          title: "Two ways of seeing it",
          blocks: [
            {
              id: "dot-and-fiona",
              type: "perspectives",
              prompt: "Dot and Fiona each know something the other hasn’t said. Open both before you decide.",
              views: [
                {
                  id: "dot",
                  title: "Dot",
                  reasoning:
                    "The markets are where she chooses. She walks the stalls, handles the seedlings and talks to the growers she has bought from for years. Plants arriving at the door are not the same thing.",
                  misses: "How she would manage the walk from the car park on a busy morning, and what she would want if it turned out to be too much.",
                },
                {
                  id: "fiona",
                  title: "Fiona",
                  reasoning:
                    "She has seen the distance and the rough ground, and she is there most Saturdays anyway. Picking the plants up costs her nothing and takes away the part she worries about.",
                  misses: "What the morning is for. Nobody has asked Dot whether it is the plants she wants, or the choosing.",
                },
              ],
            },
          ],
        },
        {
          id: "markets-move",
          title: "Your move",
          blocks: [
            {
              id: "markets-question",
              type: "decision",
              context: "Fiona’s offer is kind, and Dot hasn’t said no to it.",
              prompt: "Before you answer either of them, what would you clarify?",
              choices: [
                {
                  id: "what-it-gives",
                  text: "With Dot: which part of a Saturday at the markets she would most want to keep, if getting there had to change.",
                  verdict: "best",
                  feedback:
                    "This finds out what the offer would replace. If it is the choosing Dot values, a delivery removes it, however kindly meant. Once you know, the walk becomes something to solve with her.",
                },
                {
                  id: "how-far",
                  text: "With Fiona: exactly how far the walk is, and what the ground is like.",
                  verdict: "acceptable",
                  feedback:
                    "Worth knowing, and Fiona has seen it. It tells you about the obstacle, though, before you know what the outing is for. Dot is still the person to ask first.",
                },
                {
                  id: "accept-offer",
                  text: "Nothing more. Thank Fiona, and let Dot know the plants will be collected for her.",
                  verdict: "risky",
                  feedback:
                    "It solves getting plants to the house. Nobody has asked Dot whether that is what she wanted from a Saturday morning, and a plan made without her is one she may quietly work around.",
                },
              ],
            },
            {
              id: "say-it",
              type: "journal",
              prompt: "Write the first thing you would say to Dot.",
              scaffold: "One or two sentences, in your own words. Only you can see this.",
              minutes: 2,
            },
            {
              id: "how-sure",
              type: "confidence",
              statement: "I could ask that question in a real conversation this week.",
              low: "Not yet",
              high: "Yes",
            },
          ],
        },
        {
          id: "afterwards",
          title: "Afterwards",
          blocks: [
            {
              id: "why-it-matters",
              type: "text",
              heading: "A kind offer can replace the thing itself",
              body: "At the rose garden the risk was taking something away. Here it is a helpful swap that nobody checked with Dot. The question underneath is the same one: what is she trying to keep doing, and how?",
            },
            {
              id: "this-week",
              type: "callout",
              style: "tip",
              label: "This week",
              body: "Before you agree to a helpful offer on someone’s behalf, ask them what the thing it replaces gives them. Write down what you agreed, and when you’ll check it worked.",
            },
          ],
        },
      ],
    },
  ],
};

/** The return link: what the two stories share and how they differ. A draft, for a reviewer to approve. */
export const RETURN_PILOT_DATA: ReturnData = {
  ...emptyReturn(),
  purpose: "transfer",
  behaviour: "Ask the person what an activity gives them, and how they manage it now, before proposing or agreeing to any change.",
  barrier: "Suspected: people recognise the principle in the story they have seen, and don’t carry it to a situation that looks different.",
  why: "Practice results on the rose garden were good and the signals continued. A return to the same person, in a situation that looks different, tests whether the judgement travels. Dot is already known, so the page can be short.",
  characterFit:
    "Dot’s approved story is about doing things for herself, and “A morning at the markets” is already an approved episode. Fiona’s worry is reasonable in both. Nothing new has to be invented about either of them.",
  recap:
    "In spring, Dot’s daughter Fiona was worried about the ladder Dot uses for her roses. Dot and her coordinator agreed to work out any change together, and to check afterwards whether it worked.",
  changed:
    "A few weeks on, Dot wants to get back to the Saturday markets, where she chooses her own plants. Fiona has offered to collect the plants for her instead.",
  role: "You’re Dot’s care coordinator.",
  decide: "Fiona’s offer sounds helpful and Dot hasn’t refused it. Decide what you would clarify before you answer either of them.",
  perspective: "The coordinator, hearing from Dot and from Fiona separately.",
  consequences: "Each option has its own feedback on what that choice would leave unknown. None of it happens to Dot: it is feedback on one learner’s attempt.",
  nextEvent: "",
  workAction: "Before agreeing to a helpful offer on someone’s behalf, ask them what the thing it replaces gives them.",
  principle: "Find out what the person is trying to keep doing before proposing or agreeing to a change.",
  cues: "No one is asking for anything to stop. A family member has offered help, the person hasn’t objected, and saying yes would be the easy thing.",
  mistake: "Accepting a kind substitution on the person’s behalf. The first story’s mistake was removing a risk without asking; this one looks like helping.",
  criteria:
    "Best: asks Dot what the outing gives her before responding to the offer. Works with care: gathers facts about the obstacle from Fiona first. Not the best: accepts the offer for Dot. For Quality and Operations to confirm.",
  transfer: "A first answer that goes to Dot’s purpose, from a learner who has not seen this situation before, whether or not they saw the rose garden.",
  reflections: {
    "ask-dot": "Last time you asked Dot about the roses before anything else. What might you ask her about the markets?",
    "offer-gardener": "Last time you began with an offer of help. Fiona has made one here. What would you want to know before it’s accepted?",
    "ladder-goes": "Last time you started from Fiona’s concern. She has one again. What might Dot say if she were asked first?",
  },
  placements: [
    {
      blockId: "markets-scene",
      beat: "change",
      does: "Reads the one thing that has changed since spring.",
      why: "The learner needs the new situation in two sentences before any voice interprets it. Text is the lightest way to give it.",
      alternative: "An opening transmission from Ava. Too much ceremony for a five-minute return.",
      source: "Approved episode: A morning at the markets.",
      reviewer: "Character steward",
      missing: "",
    },
    {
      blockId: "dot-message",
      beat: "change",
      does: "Reads Dot’s own words about what she wants.",
      why: "Dot speaks before anyone interprets her. The barrier is treating the family’s account as the whole problem, so her voice comes first.",
      alternative: "A recorded check-in with Dot. Needs an approved voice, which she doesn’t have yet.",
      source: "Dot’s approved profile: she chooses and tends her own garden.",
      reviewer: "Character steward",
      missing: "",
    },
    {
      blockId: "fiona-note",
      beat: "change",
      does: "Reads Fiona’s note, with her offer and the reason for it.",
      why: "The offer has to look reasonable, or declining it is too easy. Fiona’s worry is fair in both stories.",
      alternative: "Folding it into the scene. Keeping it in her words lets the learner weigh it as a real message.",
      source: "Fiona’s approved profile.",
      reviewer: "Character steward",
      missing: "",
    },
    {
      blockId: "plan-excerpt",
      beat: "previous",
      does: "Checks what was agreed with Dot in spring.",
      why: "It puts the earlier agreement in front of the learner as a work artefact, without making the first story a prerequisite.",
      alternative: "A link back to the first story. That would make it feel required.",
      source: "Approved episode: Dot and the roses. A fictional excerpt, not a real plan format.",
      reviewer: "Quality",
      missing: "Quality to confirm that a plan excerpt may be shown this way.",
    },
    {
      blockId: "dot-and-fiona",
      beat: "decision",
      does: "Opens each person’s view, and what each of them hasn’t said.",
      why: "The judgement is noticing what is still unasked. Seeing what each view misses is practice at exactly that.",
      alternative: "A conversation simulator. More than this decision needs, and far longer to review.",
      source: "Approved profiles for Dot and Fiona.",
      reviewer: "Character steward",
      missing: "",
    },
    {
      blockId: "markets-question",
      beat: "decision",
      does: "Chooses what to clarify first, and reads feedback on that choice.",
      why: "The transfer question. It is a different judgement from the rose garden: the pull here is to accept help, not to remove a risk.",
      alternative: "A Question Pool item, if this is ever to be assessed. For now it is practice.",
      source: "The approved guidance on choice and risk, for the feedback. The story supplies no rule.",
      reviewer: "Quality and Care Operations",
      missing: "Quality to confirm the response criteria and each line of feedback.",
    },
    {
      blockId: "say-it",
      beat: "decision",
      does: "Writes the first thing they would say to Dot. Private to them.",
      why: "Choosing an option is recognition. Putting it in their own words is closer to the call they’ll make.",
      alternative: "A Reflection with feedback. That sends a learner’s words to a model, which this pilot avoids.",
      source: "",
      reviewer: "",
      missing: "",
    },
    {
      blockId: "how-sure",
      beat: "action",
      does: "Says how ready they feel to ask it at work.",
      why: "An optional self-report, kept apart from whether the answer was the best one.",
      alternative: "Leaving it out. It costs ten seconds and shows where confidence and correctness part.",
      source: "",
      reviewer: "",
      missing: "",
    },
    {
      blockId: "why-it-matters",
      beat: "consequence",
      does: "Reads how this situation differs from the rose garden.",
      why: "Names the shared principle after the attempt, so the learner works it out first.",
      alternative: "Putting it before the decision. That would give the answer away.",
      source: "The approved guidance on choice and risk.",
      reviewer: "Quality",
      missing: "",
    },
    {
      blockId: "this-week",
      beat: "action",
      does: "Takes one action to their next conversation.",
      why: "The suspected barrier is carrying the judgement to work. One concrete prompt is the lightest thing that might help.",
      alternative: "The Job Aid “Ask before changing the plan”, placed by reference once its release is approved.",
      source: "",
      reviewer: "Quality",
      missing: "The Job Aid’s approved release.",
    },
  ],
};

export const RETURN_PILOT_NOTE: NoteData = {
  ...emptyNote(),
  reason: "return",
  hook: "Dot has another outing in mind. Fiona has a concern. Before you suggest a plan, hear what each of them knows.",
  minutes: 5,
  audience: ["coordinator"],
};

/** Dot's own words afterwards: one possible response in a learner's practice. A draft until a steward approves it. */
export const RETURN_PILOT_MOMENT: { id: string; data: MomentData } = {
  id: "mo-dot-markets",
  data: {
    ...emptyMoment(),
    title: "Dot, after the markets question",
    purpose: "Lets Dot say what being asked made possible, before anyone interprets it.",
    text: "It’s the choosing I go for. If Fiona wants to carry the trays back to the car, she’s welcome.",
    hypothetical: true,
    source: "A possible response inside one learner’s practice. It is not shared history.",
  },
};

// ---------------------------------------------------------------------------------------------
// Signal Room samples
// ---------------------------------------------------------------------------------------------

export type SignalTheme = PilotTheme & {
  cases: (PilotTheme["cases"][number] & { party?: string })[];
  checks?: { kind: string; ref: string; title: string; shared: string; missing: string; decision: LearningDecision }[];
  approved?: boolean;
};

/*
  Two synthetic themes, marked as sample data. Every reference, party, figure and owner is made up. They exist so
  the chain can be followed end to end: a signal, a reviewed response, Dot's return, what learners did, and a work
  measure that is kept apart from any score. No figure here is a Trilogy Care result.

  The first has one case that the same business raised three times (one case, three contacts, two repeat
  contacts), and a separate case from the same business that is not merged into it. The second is a theme whose
  right answer is a Portal change: no learning item, and no story.
*/
export const SIGNAL_THEMES: SignalTheme[] = [
  {
    id: RETURN_PILOT.themeId,
    title: "Changes to a person’s routine agreed before asking them",
    description:
      "Synthetic sample. Complaints and questions suggest a change to something a person values is sometimes agreed with a family member, or arranged as a favour, before the person is asked what they want to keep doing. De-identified summaries only; the real records would stay in their own systems.",
    status: "plan",
    statusNote: "",
    risk: "elevated",
    roles: "Care Coordinators",
    segment: "Coordinator-managed, all states",
    denominator: 420,
    denominatorNote: "Plan changes recorded a month, from the Quality report (fictional figure).",
    owner: "Quality lead (fictional)",
    priorityNote: "It recurs, it goes to a person’s choice and control, and one business has raised the same case three times.",
    verified: true,
    approved: true,
    diagnosis: {
      situation: "a family member raises a concern, or offers help, about something an older person values",
      role: "some Care Coordinators",
      observed: "agree the change with the family member before asking the person",
      desired: "ask the person what the activity gives them, and how they manage it now, before proposing or agreeing to any change",
      barriers: [
        {
          id: "b-judgement",
          barrier: "judgement",
          text: "They apply “ask first” to a safety worry, and don’t see that a kind offer is the same situation",
          evidence: "Good first answers on the rose garden practice; the later cases were all offers of help, not safety concerns.",
          confidence: "suspected",
          validator: "Quality lead (fictional)",
        },
        {
          id: "b-habit",
          barrier: "habit",
          text: "Saying yes to a helpful family member is quick and feels like good service",
          evidence: "Two team leaders said so in supervision. Not checked more widely.",
          confidence: "suspected",
          validator: "Care Operations (fictional)",
        },
      ],
      unknowns: "Whether newer coordinators are over-represented, and how often a person later says they hadn’t agreed without it becoming a complaint.",
      checkedWith: "Two team leaders and the Quality lead read three de-identified case summaries together.",
      verified: true,
    },
    response: {
      problem:
        "Five linked cases since June: a change to something the person valued was agreed with someone else first. One business raised the same case three times.",
      audience: "Care Coordinators",
      audienceSize: 180,
      desired: "Ask the person what the activity gives them, and how they manage it now, before proposing or agreeing to any change.",
      barrierSummary: "Suspected: the judgement isn’t carried from a safety concern to a kind offer. Suspected: saying yes is the quick habit.",
      learning: "new",
      why: "The first Dot story already practises asking first, and its practice results are reasonable, so repeating it would teach what people can already do there. The gap looks like transfer. A short return to the same person, in a situation that looks different, tests that. A conversation prompt at the point of work and a line in supervision answer the habit, which a course alone won’t shift.",
      measure: {
        name: "Plan changes reversed at the person’s request, per 100 plan changes",
        definition:
          "Plan changes later reversed or amended because the person said they hadn’t agreed, divided by plan changes recorded in the month, times 100.",
        owner: "Quality lead (fictional)",
        link: "",
      },
      baseline: { window: "June to August 2026", note: "About 7 per 100 (90 of 1,262). Entered by hand; fictional figures." },
      lag: "A reversal is recorded at the next plan review, so allow about six weeks after any change.",
      competing: "A new plan-change form went live in the Portal on 1 October 2026. It asks for the person’s own words, and would move this measure by itself.",
      reviewOn: "2027-02-01",
      effort: { authorHours: 5, reviewHours: 3, learnerMinutes: 5, supportHours: 1, maintenance: "Review when the guidance on choice and risk changes." },
      assignment: { required: false, roles: "Care Coordinators", reason: "An optional invitation to people who met the first story. Not mandatory.", due: "" },
      owner: "Quality lead (fictional)",
      brief: { hasArtefact: true, hasSource: true, assessed: false },
    },
    checks: [
      {
        kind: "course",
        ref: "dot-and-the-rose-garden",
        title: "Dot and the rose garden",
        shared: "Asking Dot what the roses mean to her before proposing a change.",
        missing: "The same judgement where nobody is asking for anything to stop.",
        decision: "new",
      },
      {
        kind: "other",
        ref: "/play/coordinators-day",
        title: "A Coordinator’s Day",
        shared: "Finding out what Dot would prefer when her cleaner can’t come.",
        missing: "A family member’s offer or concern.",
        decision: "reuse",
      },
      {
        kind: "job_aid",
        ref: "ask-before-changing-the-plan",
        title: "Job Aid: Ask before changing the plan",
        shared: "The questions to ask, at the point of work.",
        missing: "An approved release.",
        decision: "reuse",
      },
    ],
    cases: [
      {
        source: "complaint",
        ref: "SAMPLE-CMP-3101",
        party: "Partner business A",
        summary: "A person’s weekly outing was replaced with a delivery after a relative offered. The business says the person was not asked.",
        events: [
          ["initial", "2026-06-09", "Raised by the partner business."],
          ["repeat", "2026-07-02", "The same business again: the change went ahead and the person has stopped mentioning the outing."],
          ["repeat", "2026-08-18", "The same business a third time: still unresolved."],
        ],
      },
      {
        source: "complaint",
        ref: "SAMPLE-CMP-3140",
        party: "Partner business B",
        summary: "A regular worker was swapped at a relative’s request. The person had preferred to wait for their usual worker.",
        events: [
          ["initial", "2026-07-21", "Raised by the person’s representative."],
          ["update", "2026-07-28", "New information: the swap had been agreed by phone with the relative."],
          ["close", "2026-08-30", "The usual worker was restored."],
        ],
      },
      {
        source: "community",
        ref: "SAMPLE-COM-2207",
        summary: "A coordinator asked in the community how to respond when a family member has already arranged a change.",
        events: [["initial", "2026-08-05", "Question posted."]],
      },
      {
        source: "webinar",
        ref: "SAMPLE-WEB-0912",
        summary: "A webinar question: is a relative’s agreement enough to change a service?",
        events: [["initial", "2026-09-12", "Asked in the monthly webinar."]],
      },
      {
        source: "complaint",
        ref: "SAMPLE-CMP-3266",
        party: "Partner business A",
        summary: "A different person at the same business: a gardening visit was moved to a day the person is usually out, at a relative’s suggestion.",
        events: [["initial", "2026-10-03", "A separate case. It shares the theme and is not an update to SAMPLE-CMP-3101."]],
      },
      {
        source: "portal",
        ref: "SAMPLE-POR-5521",
        summary: "A Portal question about how to record a change of visit day.",
        falseMatch: true,
        events: [["initial", "2026-09-20", "About recording, not about who was asked."]],
      },
    ],
    actions: [
      {
        prior: true,
        kind: "comms",
        title: "A reminder in the coordinator bulletin",
        owner: "Partner communications (fictional)",
        audience: "All Care Coordinators",
        intended: "Ask the person before agreeing a change.",
        on: "2026-07-14",
        due: "",
        status: "done",
        result: "no_change",
        interpretation: "No change in the following month’s figure. The bulletin has no read data.",
        snapshot: "7.1 per 100 in July, 6.9 in August (fictional).",
        snapshotAt: "2026-09-05",
      },
      {
        prior: true,
        kind: "learning",
        title: "Dot and the rose garden: the first story",
        owner: "Partner Enablement",
        audience: "Care Coordinators",
        intended: "Ask what an activity means to the person before proposing a change.",
        on: "2026-08-25",
        due: "",
        status: "done",
        result: "mixed",
        interpretation:
          "Most first answers in practice were the best choice. The reversal rate did not move in the month after, and the newer cases were offers of help, not safety worries.",
        snapshot: "6.5 per 100 in September (fictional).",
        snapshotAt: "2026-10-08",
      },
      {
        prior: false,
        kind: "portal",
        title: "New plan-change form asks for the person’s own words",
        owner: "Portal product owner (fictional)",
        audience: "Everyone who records a plan change",
        intended: "The person’s view is recorded before a change is saved.",
        on: "2026-10-01",
        due: "",
        status: "done",
        result: "",
        interpretation: "",
        snapshot: "",
        snapshotAt: "",
      },
      {
        prior: false,
        kind: "coaching",
        title: "Team leaders raise it in supervision",
        owner: "Care Operations (fictional)",
        audience: "Care Coordinators, through their team leaders",
        intended: "A coordinator can say what the person wanted to keep, for any change they agreed that month.",
        on: "2026-10-20",
        due: "",
        status: "in_progress",
        result: "",
        interpretation: "",
        snapshot: "",
        snapshotAt: "",
      },
      {
        prior: false,
        kind: "learning",
        title: "Dot at the markets: a return episode with a new decision",
        owner: "Partner Enablement",
        audience: "Care Coordinators who met the first story, and anyone who finds it",
        intended: "Ask what an activity gives the person when the pull is to accept help, not only when there is a safety worry.",
        on: "",
        due: "2026-12-01",
        status: "planned",
        result: "",
        interpretation: "",
        snapshot: "",
        snapshotAt: "",
      },
      {
        prior: false,
        kind: "job_aid",
        title: "Ask before changing the plan: a conversation prompt",
        owner: "Quality lead (fictional)",
        audience: "Care Coordinators",
        intended: "The question is to hand at the point of work.",
        on: "",
        due: "2026-12-15",
        status: "planned",
        result: "",
        interpretation: "",
        snapshot: "",
        snapshotAt: "",
      },
    ],
    metrics: [
      { metric: "work", bucket: "2026-06", numerator: 31, denominator: 420, note: "Fictional sample figure." },
      { metric: "work", bucket: "2026-07", numerator: 29, denominator: 410, note: "Fictional sample figure." },
      { metric: "work", bucket: "2026-08", numerator: 30, denominator: 432, note: "Fictional sample figure." },
      { metric: "work", bucket: "2026-09", numerator: 27, denominator: 415, note: "Fictional sample figure." },
      { metric: "work", bucket: "2026-10", numerator: 22, denominator: 428, note: "Fictional sample figure. The new Portal form went live on the 1st." },
    ],
  },
  {
    id: "theme-contact-on-file",
    title: "Coordinators can’t see who the person has said may speak for them",
    description:
      "Synthetic sample. When a relative rings, the person’s recorded wishes about who may be told what are two screens away from the call record. De-identified summaries only.",
    status: "plan",
    statusNote: "",
    risk: "routine",
    roles: "Care Coordinators",
    segment: "All",
    denominator: null,
    denominatorNote: "",
    owner: "Portal product owner (fictional)",
    priorityNote: "A small number of cases, and the cause looks like the screen, not the person using it.",
    verified: true,
    approved: true,
    diagnosis: {
      situation: "a relative rings about a person’s services",
      role: "Care Coordinators",
      observed: "answer from memory, or put the caller on hold to find the consent record",
      desired: "see the person’s recorded wishes on the call record before discussing anything",
      barriers: [
        {
          id: "b-access",
          barrier: "access",
          text: "The consent record is two screens away from the call record, and slow to load",
          evidence: "Walked through with three coordinators: each took over a minute to find it.",
          confidence: "known",
          validator: "Portal product owner (fictional)",
        },
      ],
      unknowns: "How often a call is answered without the record being opened.",
      checkedWith: "Three coordinators and the Portal product owner.",
      verified: true,
    },
    response: {
      problem: "Two linked cases: information was discussed with a relative before the person’s recorded wishes were checked.",
      audience: "Care Coordinators",
      audienceSize: 180,
      desired: "See the person’s recorded wishes on the call record before discussing anything.",
      barrierSummary: "Known: the record is hard to reach during a call. Coordinators already know to check it.",
      learning: "none",
      why: "Everyone asked knew the rule and wanted to follow it. The barrier is getting to the record during a call, which a course or a story can’t change. Show the person’s wishes on the call record.",
      measure: {
        name: "Calls from a relative where the consent record was opened first",
        definition: "Of logged calls from a relative, the share where the consent record was opened before the call note was saved.",
        owner: "Portal product owner (fictional)",
        link: "",
      },
      baseline: { window: "", note: "Not collected yet. The Portal team will add the count with the change." },
      lag: "None once the count exists.",
      competing: "",
      reviewOn: "2027-01-15",
      effort: { authorHours: 0, reviewHours: 0, learnerMinutes: 0, supportHours: 0, maintenance: "" },
      assignment: { required: false, roles: "", reason: "", due: "" },
      owner: "Portal product owner (fictional)",
      brief: { hasArtefact: false, hasSource: true, assessed: false },
    },
    checks: [
      {
        kind: "other",
        ref: "/resources",
        title: "Existing guidance on who may be told what",
        shared: "The rule itself, which coordinators already follow when they can see the record.",
        missing: "Nothing that learning could add.",
        decision: "none",
      },
    ],
    cases: [
      {
        source: "complaint",
        ref: "SAMPLE-CMP-3310",
        party: "Partner business C",
        summary: "A relative was told about a change of service the person had asked to keep private.",
        events: [
          ["initial", "2026-09-02", "Raised by the person."],
          ["close", "2026-09-19", "Apology made; wishes re-recorded."],
        ],
      },
      {
        source: "portal",
        ref: "SAMPLE-POR-5604",
        summary: "A coordinator asked where the consent record is while on a call.",
        events: [["initial", "2026-10-11", "Portal question."]],
      },
    ],
    actions: [
      {
        prior: false,
        kind: "portal",
        title: "Show the person’s recorded wishes on the call record",
        owner: "Portal product owner (fictional)",
        audience: "Everyone who takes calls",
        intended: "The record is in view before anything is discussed.",
        on: "",
        due: "2026-12-10",
        status: "planned",
        result: "",
        interpretation: "",
        snapshot: "",
        snapshotAt: "",
      },
    ],
    metrics: [],
  },
];
