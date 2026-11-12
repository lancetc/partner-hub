import type { IconName } from "@/components/Icon";

/*
  The Trilogy Care client journey, from enquiry to exit, from the Client Journey Map (v5).
  Each piece of text is a list of parts; a part marked `suggested` is a SUGGESTION awaiting
  validation (shaded italic in the original map), the rest comes from the original deck.
  The moments in between stages, the feeling scores and the phase names are suggestions too.
*/

export type Part = { text: string; suggested?: boolean };
export type JourneyText = Part[];

export type Stage = {
  n: number;
  title: string;
  /** The main role named in the deck; `confirm` when the owner is still "To confirm". */
  role: { text: string; confirm?: boolean };
  involved: JourneyText;
  touchpoint: JourneyText;
  client: JourneyText;
  trilogy: JourneyText;
  feeling: JourneyText;
  /** One or two words for the feeling, for the curve. */
  mood: string;
  /** How it feels, from 1 (low) to 5 (high), for the curve. A suggestion. */
  score: number;
  pain: JourneyText;
  /** A photo to show instead of the stage's drawing. */
  photo?: { src: string; alt: string };
};

/** Something that happens between two stages, often a wait. Always a suggestion. */
export type Between = { after: number; title: string; text: string; icon: IconName; wait?: boolean };

export type Phase = { name: string; stages: number[]; colour: string };

const s = (text: string): Part => ({ text, suggested: true });
const d = (text: string): Part => ({ text });

export const stages: Stage[] = [
  {
    n: 1,
    title: "Enquiry and sign-up",
    role: { text: "Customer Service Representative (CSR)" },
    involved: [d("CSR; the client."), s("Family member or representative making the enquiry; My Aged Care assessor (source of the referral code).")],
    touchpoint: [d("CSR call, first point of contact")],
    client: [d("Shares basic details and My Aged Care referral code")],
    trilogy: [d("Explains services, fees and co-contributions; confirms funding; emails welcome pack")],
    feeling: [d("Curious, may be unsure about fees")],
    mood: "Curious",
    score: 3,
    pain: [s("Fees and co-contributions hard to understand on a first call")],
    photo: {
      src: "/images/journey-before.webp",
      alt: "An older woman and a younger family member at the kitchen table, looking at a laptop together, with a notebook and a cup of tea",
    },
  },
  {
    n: 2,
    title: "Initial questionnaire",
    role: { text: "To confirm", confirm: true },
    involved: [d("The client (completes questionnaire and e-signs)."), s("GP (health summary); family or representative helping; Intake team.")],
    touchpoint: [d("Online questionnaire (e-signature)")],
    client: [d("Health, needs, goals, GP health summary; books meeting")],
    trilogy: [s("Sends the questionnaire, supports completion, offers alternatives to GP summary or e-signature, books the meeting")],
    feeling: [s("Hopeful but possibly overwhelmed by paperwork")],
    mood: "Hopeful",
    score: 2.6,
    pain: [d("GP summary and e-signature may be barriers (alternatives offered)")],
    photo: {
      src: "/images/journey-questionnaire.webp",
      alt: "An older woman at her dining table reading through a printed questionnaire, pen in hand, with letters and a cup of tea beside her",
    },
  },
  {
    n: 3,
    title: "Welcome meeting",
    role: { text: "Intake / Assessment Team" },
    involved: [d("Intake / Assessment Team; family, friend or translator."), s("The client’s authorised representative or decision-maker, if there is one.")],
    touchpoint: [d("Phone meeting; family, friend or translator welcome")],
    client: [s("Shares goals and preferences, asks questions about fees, gives consent")],
    trilogy: [d("Co-design care plan, budget and goals; explain fees; obtain consents and verbal agreement or Zoho Sign")],
    feeling: [d("Supported, but information-heavy")],
    mood: "Supported",
    score: 3.2,
    pain: [s("Too much information to absorb in one meeting")],
    photo: {
      src: "/images/journey-welcome-meeting.webp",
      alt: "A smiling woman in a navy polo shirt talking with an older man over cups of tea at his kitchen table",
    },
  },
  {
    n: 4,
    title: "Care plan finalised and setup",
    role: { text: "Intake / Assessment and Admin Team" },
    involved: [d("Intake / Assessment and Admin Team; Lite n’ Easy and Cab Charge (referral partners)."), s("The client, to review and sign off the plan.")],
    touchpoint: [d("Care plan delivered by preferred method")],
    client: [s("Reviews the care plan, asks questions, confirms it reflects their goals")],
    trilogy: [d("CRM Booked → Meeting Held → Signed; risk profile; Lite n’ Easy / Cab Charge referrals; Portal and CRM setup; handover notes")],
    feeling: [s("Relieved to see a plan, wanting reassurance")],
    mood: "Relieved",
    score: 3.6,
    pain: [s("Delay between the meeting and receiving the plan")],
    photo: {
      src: "/images/journey-care-plan.webp",
      alt: "An older man explaining something to a woman in a navy polo shirt across his kitchen table, with cups of tea and biscuits between them",
    },
  },
  {
    n: 5,
    title: "Handover to Care Partner and Pod",
    role: { text: "Care Partner and Care Pod" },
    involved: [d("Care Partner; Care Pod (including backup cover)."), s("Outgoing Intake team member handing over; client and family as call recipients.")],
    touchpoint: [d("Introduction call")],
    client: [s("Meets their Care Partner, shares preferred contact method and how they like to be supported")],
    trilogy: [d("Assign named Care Partner; introduce pod and backup cover")],
    feeling: [s("Reassured by a named contact, or uncertain who to call")],
    mood: "Reassured",
    score: 3.8,
    pain: [s("Handover gaps, the client having to repeat their story")],
    photo: {
      src: "/images/journey-handover.webp",
      alt: "A smiling team member in a headset at his desk, with colleagues in matching navy polos working alongside him",
    },
  },
  {
    n: 6,
    title: "Services start",
    role: { text: "Care Team (SM, EC, IC) and Providers" },
    involved: [d("Care Team (SM, EC, IC); Approved Providers and support workers."), s("Care Partner (budget and compliance oversight); the client receiving services.")],
    touchpoint: [d("First services from commencement date; providers or support workers engaged")],
    client: [s("Welcomes new providers, gives feedback on first services")],
    trilogy: [d("Supplier compliance checks; services added to budget")],
    feeling: [s("Anticipation, some nerves about new people in the home")],
    mood: "Anticipation",
    score: 3.3,
    pain: [s("Delays finding or onboarding providers")],
    photo: {
      src: "/images/journey-services-start.webp",
      alt: "A gardener kneeling by a flowering hibiscus, chatting with an older woman on the path outside her brick home",
    },
  },
  {
    n: 7,
    title: "Ongoing care",
    role: { text: "Care Partner and Care Team" },
    involved: [d("Care Partner; Care Team."), s("Providers and support workers; client and family (bill approval, check-ins).")],
    touchpoint: [d("Care Partner check-ins, Portal, statements and bills")],
    client: [d("Can request updates any time (deck, stage 8)."), s("Reviews statements, approves or queries bills, raises changes in need.")],
    trilogy: [d("Track budget and approve bills")],
    feeling: [s("Settled and supported when things run smoothly")],
    mood: "Settled",
    score: 4.5,
    pain: [s("Unclear statements or bills, slow responses to queries")],
    photo: {
      src: "/images/journey-ongoing-care.webp",
      alt: "A support worker in a teal polo wiping down a kitchen bench while chatting with an older woman in her sunny kitchen",
    },
  },
  {
    n: 8,
    title: "Review and change",
    role: { text: "To confirm", confirm: true },
    involved: [s("Care Partner (leads the review); clinical or assessment staff if reassessment or upgrade needed; client and representative.")],
    touchpoint: [d("Review at least every 12 months or sooner; reassessment or upgrade")],
    client: [d("Can request updates any time")],
    trilogy: [s("Schedules and runs the review, updates the care plan and budget, records changes in CRM and Portal")],
    feeling: [s("Valued if listened to; anxious if worried about losing services")],
    mood: "Valued",
    score: 3.6,
    pain: [s("Unsure how often reviews happen or how to request a change")],
    photo: {
      src: "/images/journey-review.webp",
      alt: "An older woman pointing to a line in her paperwork while a smiling woman takes notes beside her at the dining table",
    },
  },
  {
    n: 9,
    title: "Feedback and complaints",
    role: { text: "To confirm", confirm: true },
    involved: [
      d("OPAN (external advocacy)."),
      s("Quality / Compliance team (independent of the subject of the complaint); General Manager (approval to close an unresolved complaint); client and an advocate."),
    ],
    touchpoint: [d("Complaints process; external advocacy such as OPAN")],
    client: [s("Raises a concern or compliment, may involve an advocate, expects to be kept informed")],
    trilogy: [s("Acknowledges and records the complaint, follows the complaints policy, keeps the client informed of outcome")],
    feeling: [s("Frustrated or worried; wants to be heard")],
    mood: "Wants to be heard",
    score: 1.7,
    pain: [s("Unclear process, slow response, fear of reprisal")],
    photo: {
      src: "/images/journey-feedback.webp",
      alt: "An older woman in her armchair raising a concern, while a woman on the sofa listens closely with a notebook on her lap",
    },
  },
  {
    n: 10,
    title: "Exit",
    role: { text: "To confirm", confirm: true },
    involved: [d("Family communication."), s("Care Partner; Finance (final billing); family or estate representative; Commonwealth (notifications).")],
    touchpoint: [d("Termination, transfer or death")],
    client: [s("Client or family confirms decision to leave, transfers or arranges final matters")],
    trilogy: [d("CRM closure, final billing, Commonwealth notifications and sensitive family communication")],
    feeling: [s("Sad, stressed or relieved depending on the reason for leaving")],
    mood: "Mixed",
    score: 2.2,
    pain: [s("Unclear steps, delays in final billing, insensitive communication")],
    photo: {
      src: "/images/journey-exit.webp",
      alt: "An older man waving goodbye from the doorway of his weatherboard home as a woman in a navy polo waves back on her way down the garden path",
    },
  },
];

/** What happens in the gaps. `after: 0` comes before the first stage. All suggestions for validation. */
export const between: Between[] = [
  {
    after: 0,
    title: "Thinking about support at home",
    text: "An older person, or their son or daughter, starts looking for help at home. My Aged Care assesses them, and they wait to hear they’re approved and for the referral code they’ll need when they call Trilogy Care.",
    icon: "clock",
    wait: true,
  },
  {
    after: 1,
    title: "The welcome pack arrives",
    text: "Reading about services and fees at home, often with family. The questionnaire is on its way.",
    icon: "mail",
  },
  {
    after: 2,
    title: "Waiting on the GP",
    text: "Booking a GP appointment for the health summary. The welcome meeting is on the calendar.",
    icon: "calendar",
    wait: true,
  },
  {
    after: 3,
    title: "Waiting for the care plan",
    text: "The plan, budget and consents are written up and signed. Days can feel long here.",
    icon: "clock",
    wait: true,
  },
  {
    after: 4,
    title: "Behind the scenes",
    text: "CRM and Portal set up, risk profile done, Lite n’ Easy and Cab Charge referrals sent. The client doesn’t see most of this.",
    icon: "layers",
  },
  {
    after: 5,
    title: "Finding the right providers",
    text: "Providers are found and compliance-checked. The client waits for a commencement date.",
    icon: "search",
    wait: true,
  },
  {
    after: 6,
    title: "The first statement",
    text: "Routines settle in and the first statement and bills arrive to review.",
    icon: "money",
  },
  {
    after: 7,
    title: "Needs change",
    text: "Health or circumstances change. If a reassessment or upgrade is needed, the client waits on the result.",
    icon: "clock",
    wait: true,
  },
  {
    after: 8,
    title: "Something to say",
    text: "A concern or a compliment builds. It can come up at any stage, not only after a review.",
    icon: "chat",
  },
  {
    after: 9,
    title: "Circumstances change",
    text: "A move into residential care, a change of provider, or the end of life.",
    icon: "route",
  },
];

/**
  Where the road splits: stages that run differently for some clients, shown as side roads that
  rejoin the main road afterwards. `from` and `to` are the first and last stages affected.
*/
export type Fork = {
  id: string;
  from: number;
  to: number;
  /** What decides which way the client goes, e.g. "Package type". */
  by: string;
  intro: string;
  paths: { name: string; who: string; text: JourneyText; colour: string }[];
};

export const forks: Fork[] = [
  {
    id: "package",
    from: 5,
    to: 7,
    by: "Package type",
    intro: "Stages 5 to 7 run a little differently depending on the client’s package.",
    paths: [
      {
        name: "Fully Coordinated",
        who: "With a Care Coordinator",
        text: [s("An independent Care Coordinator, chosen by the client, arranges services and submits budgets. Trilogy Care’s Care Partner approves them.")],
        colour: "#0e7c7b",
      },
      {
        name: "Self-Managed Plus",
        who: "With a Care Partner (optional)",
        text: [s("An optional third-party Care Partner acts as the link between the client, their family and the rest of their Care Circle.")],
        colour: "#c4471b",
      },
    ],
  },
];

/** The fork, if any, that a stage is part of. */
export const forkAt = (n: number) => forks.find((f) => n >= f.from && n <= f.to);

/** Stages grouped for the road. A suggestion, to make the journey easier to scan. */
export const phases: Phase[] = [
  { name: "Getting started", stages: [1, 2, 3], colour: "#0e7c7b" },
  { name: "Setting up care", stages: [4, 5, 6], colour: "#1e3a5c" },
  { name: "Living with care", stages: [7, 8, 9], colour: "#c4471b" },
  { name: "Leaving", stages: [10], colour: "#3d5068" },
];

export const phaseOf = (n: number) => phases.find((p) => p.stages.includes(n))!;
