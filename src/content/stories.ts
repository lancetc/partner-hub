/*
  Demonstration content for the prototype. None of these stories, people, dates or
  policy details are real Trilogy announcements; each is labelled as demo in the UI.
*/

import type { NarrationAudio, VideoEmbed } from "@/lib/magazine";
import type { StoryGlance, StoryPractice } from "@/lib/storyGlance";

export type CategoryId = "trilogy" | "policy" | "spotlight" | "case-study" | "learning" | "industry";

export const categories: { id: CategoryId; label: string }[] = [
  { id: "trilogy", label: "Trilogy stories" },
  { id: "policy", label: "Policy updates" },
  { id: "spotlight", label: "Partner spotlights" },
  { id: "case-study", label: "Case studies" },
  { id: "learning", label: "Learning" },
  { id: "industry", label: "Industry news" },
];

export const categoryLabel = (id: CategoryId) => categories.find((c) => c.id === id)?.label ?? id;

/** `p` text may use **bold**, *italic*, [links](https://…) and lists (lib/richText). */
export type StoryBlock =
  | { type: "p"; text: string }
  | { type: "h2"; text: string }
  /** A subheading, under an h2. */
  | { type: "h3"; text: string }
  | { type: "list"; items: string[] }
  | { type: "quote"; text: string; cite: string }
  /** A picture in the story: beside the text (left or right), centred, or the full width. */
  | {
      type: "image";
      src: string;
      width: number;
      height: number;
      alt: string;
      align: "left" | "right" | "center" | "full";
      caption?: string;
      /** Readers can open it full size, and zoom in on it (a slide, a chart, a document). */
      lightbox?: boolean;
    };

export type PolicyMeta = {
  status: "proposal" | "announced" | "in_effect" | "superseded";
  issuer: string;
  sourceTitle: string;
  sourceUrl: string;
  published: string;
  effective?: string;
  jurisdiction?: string;
  owner: string;
  reviewDate: string;
  correction?: string;
};

export type VisualVariant = "petals" | "rings" | "grid" | "wave" | "dots" | "arc";

export type Story = {
  slug: string;
  category: CategoryId;
  title: string;
  dek: string;
  byline: string;
  date: string;
  readMinutes: number;
  visual: {
    variant: VisualVariant;
    tone: "teal" | "navy" | "warm" | "gold" | "sky";
    icon: IconName;
    alt: string;
    /** Approved photograph; replaces the pattern artwork when present. */
    photo?: { src: string; width: number; height: number; position?: string };
  };
  body: StoryBlock[];
  policy?: PolicyMeta;
  relatedLesson?: string;
  relatedResources?: string[];
  audience: ("partner" | "coordinator")[];
  /** How the story appears in search results and when shared; the title and standfirst are used when these are empty. */
  seo?: { title?: string; description?: string };
  /**
    A voiced introduction (the owner, Nov 2026), as on Magazine pages: a short script read in the Magazine Editorial Voice
    (OpenAI's Alloy). Learners hear it only once an author approves the recording, and only while it matches the script.
  */
  narration?: StoryNarration;
  /** The homepage's lead story (the owner, Nov 2026), whatever its date. One at a time: featuring a story un-features the last. */
  featured?: boolean;
  /** The last day it stays pinned as the feature (YYYY-MM-DD); open-ended when not set. */
  featuredUntil?: string;
  /** An important business announcement: it leads for everyone who hasn't read it, for 30 days. */
  priority?: boolean;
  /** When it was last edited in admin (for search engines' "updated" date). */
  updated?: string;
  /** "At a glance": three to five takeaways under the hero, checked by an author (lib/storyGlance). */
  glance?: StoryGlance;
  /** "Put it into practice": a few optional things to try, with an optional personal checklist (lib/storyGlance). */
  practice?: StoryPractice;
  /** A video with the story: uploaded to the Hub, or on YouTube, Vimeo or Loom. */
  video?: StoryVideo;
};

/**
  A news story's video (the owner, Nov 2026), such as a recorded interview. Uploaded to the Hub (`src`, with a WebVTT
  captions file if there is one) or on YouTube, Vimeo or Loom (`embed`). It never plays by itself. `placement`: after
  At a glance and before the story ("top"), after the story's opening paragraphs ("opening"), or at the end ("end").
*/
export type StoryVideo = {
  title: string;
  src?: string;
  embed?: VideoEmbed;
  poster?: string;
  captions?: string;
  caption?: string;
  transcript?: string;
  placement: "top" | "opening" | "end";
};

export type StoryNarration = { script: string; audio?: NarrationAudio; approved?: boolean };

export type IconName = "clock" | "shield" | "heart" | "leaf" | "chat" | "home" | "spark" | "doc" | "people" | "sun" | "route" | "book";

export const stories: Story[] = [
  {
    slug: "partners-shaping-the-hub",
    category: "trilogy",
    title: "Partners and coordinators are shaping the new Partner Hub",
    dek: "The Partner Hub has grown a lot since the pilot began, shaped by Care Partners and coordinators. Here’s what’s new, and how to tell us what works.",
    byline: "Trilogy Care team",
    date: "2026-10-21T22:00:00Z",
    readMinutes: 2,
    visual: {
      variant: "petals",
      tone: "navy",
      icon: "people",
      alt: "The Trilogy Care team standing and kneeling in front of a wall reading “Our mission: Empowering older Australians to live independently in the home they love for longer”",
      photo: { src: "/images/team.jpeg", width: 640, height: 456 },
    },
    audience: ["partner", "coordinator"],
    relatedLesson: "a-little-extra-time",
    relatedResources: ["hub-guide", "support-contacts"],
    body: [
      {
        type: "p",
        text: "The Partner Hub brings news, practical learning, tools and onboarding into one place. It’s built for the people who deliver and coordinate support every day: physiotherapists, nurses, gardeners, cleaners, Care Partners, and internal and external care coordinators. Your feedback in the pilot has shaped what came next.",
      },
      { type: "h2", text: "What’s new" },
      { type: "h3", text: "Learning that fits the day" },
      {
        type: "list",
        items: [
          "**Topics** of about ten minutes, each built around a realistic situation and a decision, with your place saved and a download for offline.",
          "**Discovery Paths** for each role, with a voiced introduction, a quiz and a certificate, and **My Discovery** to build your own.",
          "**Magazine courses** for when you have longer: story-led, with simulations, roleplays and calculators built in.",
          "**Ava**, a care coordinator out on the road, who checks in on how you’re going.",
        ],
      },
      { type: "h3", text: "Help at the point of work" },
      {
        type: "list",
        items: [
          "**Work Tools** with short, approved Job Aids for the task in front of you.",
          "**Favourites** for the lines and tools you use most, and a **Companion Drawer** with golden scripts and a co-contribution quick-calc for live calls.",
          "**Myth vs Reality**: approved answers to the questions clients ask most.",
        ],
      },
      { type: "h3", text: "Learning from each other" },
      {
        type: "list",
        items: [
          "**Community** case threads, where experienced coordinators share how they’d handle a dilemma.",
          "**Digital Members**: the fictional people in your training, whose lives carry on between courses.",
          "**Business Field Notes**, where Care Partner principals share honest business decisions with each other.",
        ],
      },
      { type: "h3", text: "For Care Partner businesses" },
      {
        type: "list",
        items: [
          "Planning labs for when to hire, whether you can take on the next ten clients, what a missed service really costs and whether you can fund the next 90 days.",
          "A **Local Referral Studio** to practise a truthful conversation with a GP practice or hospital social worker.",
          "A private **Caseload-to-Margin** calculator for your own planning.",
        ],
      },
      { type: "h3", text: "Onboarding and requirements" },
      {
        type: "list",
        items: [
          "**Your setup** shows what you need to do and what we’re still checking.",
          "Onboarding courses chosen for your role.",
          "**Required training** and policy acknowledgements, each with a due date, in one place.",
        ],
      },
      {
        type: "p",
        text: "Much of what you see is still demonstration content. It helps us check the experience before real requirements and policy are connected, and every practice case uses fictional people.",
      },
      { type: "quote", text: "If a lesson helps you decide what to do on your next visit, it has done its job.", cite: "Pilot learning lead (demo)" },
      { type: "h2", text: "Tell us what works" },
      {
        type: "p",
        text: "Use the feedback link on any Topic, or talk with your coordinator. We’re especially keen to hear where something was unclear, took longer than it should, or didn’t match how the work really happens.",
      },
    ],
  },
  {
    slug: "extra-visit-time-briefing",
    category: "policy",
    title: "From 3 November, confirm extra visit time before you stay",
    dek: "A demonstration briefing: what changed, who it affects and what to do when a client asks you to stay longer.",
    byline: "Care Partnerships (demo)",
    date: "2026-10-20T23:30:00Z",
    readMinutes: 3,
    visual: {
      variant: "rings",
      tone: "teal",
      icon: "clock",
      alt: "An older woman talking with a younger woman over cups of tea at a kitchen table at home",
      photo: { src: "/images/people.png", width: 1536, height: 1024, position: "center 25%" },
    },
    audience: ["partner", "coordinator"],
    relatedLesson: "extra-time-briefing",
    relatedResources: ["change-request-guide"],
    policy: {
      status: "announced",
      issuer: "Trilogy Care (demonstration source)",
      sourceTitle: "Service change confirmation process (demo document)",
      sourceUrl: "https://trilogycare.com.au/",
      published: "2026-10-20",
      effective: "2026-11-03",
      jurisdiction: "All states and territories (demo)",
      owner: "Head of Care Partnerships (demo)",
      reviewDate: "2027-04-20",
    },
    body: [
      { type: "h2", text: "What changed" },
      {
        type: "p",
        text: "From the effective date, any extension to a planned visit needs to be confirmed through the care coordinator before the extra time is delivered. Previously, short extensions could be noted afterwards.",
      },
      { type: "h2", text: "Who it affects" },
      { type: "p", text: "All Care Partners delivering scheduled visits, and the coordinators who confirm changes." },
      { type: "h2", text: "What to do" },
      {
        type: "list",
        items: [
          "Tell the client you are happy to check",
          "Contact the coordinator using the usual channel",
          "Only stay longer once the change is confirmed",
          "Record what was agreed in your visit note",
        ],
      },
      { type: "p", text: "This is demonstration content. The real process must be approved by the responsible Trilogy owner before it is used." },
    ],
  },
  {
    slug: "garden-partner-spotlight",
    category: "spotlight",
    title: "“I notice the small things”: a garden partner on safe, steady visits",
    dek: "How a regular gardening visit became a quiet check-in, and why good handover notes matter.",
    byline: "Partner stories (demo)",
    date: "2026-10-19T01:00:00Z",
    readMinutes: 5,
    visual: { variant: "wave", tone: "gold", icon: "leaf", alt: "Soft gold waves with a leaf motif" },
    audience: ["partner"],
    relatedResources: ["visit-note-template"],
    body: [
      {
        type: "p",
        text: "Our demo partner, Jordan, has looked after the same handful of gardens for three years. The work is practical: mowing, pruning, clearing gutters before storm season. The relationships are what make it last.",
      },
      {
        type: "quote",
        text: "If the path is getting mossy or the hose is left out, I mention it. It is usually nothing, but sometimes it matters.",
        cite: "Jordan, garden partner (demo)",
      },
      { type: "h2", text: "A good note is short and specific" },
      {
        type: "p",
        text: "Jordan keeps visit notes to what changed and what someone else might need to know. That habit makes it easier for coordinators to act early.",
      },
    ],
  },
  {
    slug: "coordinator-case-change-in-needs",
    category: "case-study",
    title: "When a weekly call reveals a change in needs",
    dek: "A coordinator case study about listening, checking and escalating at the right time.",
    byline: "Care coordination (demo)",
    date: "2026-10-17T03:00:00Z",
    readMinutes: 6,
    visual: { variant: "arc", tone: "sky", icon: "chat", alt: "Overlapping arcs suggesting a conversation" },
    audience: ["coordinator"],
    relatedLesson: "noticing-a-change",
    body: [
      {
        type: "p",
        text: "In this demonstration case, a coordinator noticed that a client who usually chatted about their week sounded tired and was repeating questions. The coordinator slowed down, asked open questions and confirmed what support was already in place.",
      },
      { type: "h2", text: "What helped" },
      {
        type: "list",
        items: [
          "Asking how the week had been, then pausing",
          "Checking recent visit notes from partners",
          "Following the escalation process instead of solving everything on the call",
        ],
      },
      { type: "p", text: "Practise a similar conversation in the coordinator scenario lesson." },
    ],
  },
  {
    slug: "three-minute-lessons",
    category: "learning",
    title: "Learning that fits between visits",
    dek: "Why Topics are short, built around one decision, and easy to pick up and put down, and how a Topic works, card by card.",
    byline: "Learning team (demo)",
    date: "2026-10-16T22:00:00Z",
    readMinutes: 2,
    visual: { variant: "grid", tone: "teal", icon: "book", alt: "Tiled teal squares like a set of cards" },
    audience: ["partner", "coordinator"],
    relatedLesson: "a-little-extra-time",
    body: [
      {
        type: "p",
        text: "Care work doesn’t leave much time at a desk. Between one visit and the next there might be ten minutes in the car, or a quiet half hour at the end of the day. Topics are built for those gaps.",
      },
      { type: "h2", text: "One idea, about ten minutes" },
      {
        type: "p",
        text: "Each Topic focuses on one useful outcome, the kind of thing you’ll use on your next visit or call. You see one card at a time, with short text on screen and the explaining in narration you can listen to. Audio and video are optional: everything essential is there to read.",
      },
      { type: "h2", text: "How a Topic runs" },
      { type: "p", text: "Every Topic follows the same seven steps, so you always know where you are:" },
      {
        type: "list",
        items: [
          "**Hook.** A presenter opens with a moment from a working day, and why it matters.",
          "**Show.** A realistic, fictional situation you can picture, which the rest of the Topic comes back to.",
          "**Explain.** The key ideas, two or three cards, short and to the point.",
          "**Choose.** You make the call in the situation.",
          "**Feedback.** What happens after each choice, with a way to try again, and what good looked like.",
          "**Apply.** A quick check on the key ideas, then a short “Your turn” about your own work, with an example answer to compare.",
          "**Recap.** Two to four points to remember, and one thing to do on the job.",
        ],
      },
      { type: "h2", text: "Practice, not just reading" },
      {
        type: "p",
        text: "The heart of every Topic is a decision. Reading about a rule is one thing; deciding what to do when a client asks you to stay longer, or a family member wants their mum’s budget details, is another. Seeing what happens after a poorer choice, then trying again, is how judgement builds.",
      },
      { type: "h2", text: "Made for a working day" },
      {
        type: "list",
        items: [
          "**Your place is saved** as you go, so you can leave mid-Topic and pick it up later.",
          "**Download for offline** keeps a Topic, or a whole path, on your device for when reception drops.",
          "**Listen instead of reading** when you’re between appointments: each card has narration.",
          "**Save what helps.** Highlight a line or save a Topic to Favourites to find it again in a hurry.",
        ],
      },
      { type: "h2", text: "From Topics to paths" },
      {
        type: "p",
        text: "Topics stand on their own, but they add up. A **Discovery Path** puts them in order for a role or a goal, with a voiced introduction, a quiz and a certificate. Your manager might assign one, or you can build your own in **My Discovery** by saying what you want to get better at.",
      },
      { type: "h2", text: "When you’ve got longer" },
      {
        type: "p",
        text: "For deeper, story-led learning there’s the **Magazine**: longer courses with practice built in, for when you have time at a desk. Topics and Magazine courses work together: a Topic to get the idea, a course to practise it properly.",
      },
    ],
  },
  {
    slug: "winter-visit-checklist",
    category: "industry",
    title: "Preparing for winter visits: warmth, footing and daylight",
    dek: "A practical reminder for partners working outdoors and in homes as the weather turns.",
    byline: "Industry roundup (demo)",
    date: "2026-10-15T00:00:00Z",
    readMinutes: 4,
    visual: {
      variant: "dots",
      tone: "navy",
      icon: "sun",
      alt: "An older couple sitting at a kitchen table going through paperwork together, beside a Trilogy home and flower graphic",
      photo: { src: "/images/jill.jpeg", width: 576, height: 300, position: "70% center" },
    },
    audience: ["partner"],
    body: [
      {
        type: "p",
        text: "Shorter days and wet surfaces change how visits feel. Plan outdoor tasks for daylight, check paths and steps, and mention anything that could make the home less safe.",
      },
      {
        type: "list",
        items: [
          "Check heating is working where it is part of your service",
          "Note slippery or poorly lit areas",
          "Allow extra travel time and tell your coordinator early if you are delayed",
        ],
      },
    ],
  },
  {
    slug: "onboarding-made-clearer",
    category: "trilogy",
    title: "Onboarding now shows what is with you, and what is with us",
    dek: "The new checklist separates tasks you need to do from checks our team is completing.",
    byline: "Partner onboarding (demo)",
    date: "2026-10-14T23:00:00Z",
    readMinutes: 2,
    visual: { variant: "grid", tone: "sky", icon: "doc", alt: "Pale blue tiles like a checklist" },
    audience: ["partner"],
    body: [
      {
        type: "p",
        text: "Uploading a document is not the same as it being verified. The checklist now shows each step clearly: received, in review, action required or verified.",
      },
      { type: "p", text: "You can keep learning while we check your documents." },
    ],
  },
  {
    slug: "handover-template-proposal",
    category: "policy",
    title: "Proposal: a shorter handover note template",
    dek: "A proposed template for partner visit notes is open for feedback. Nothing changes yet.",
    byline: "Quality and practice (demo)",
    date: "2026-10-13T22:00:00Z",
    readMinutes: 3,
    visual: { variant: "rings", tone: "warm", icon: "doc", alt: "Terracotta rings around a document icon" },
    audience: ["partner", "coordinator"],
    relatedResources: ["visit-note-template"],
    policy: {
      status: "proposal",
      issuer: "Trilogy Care (demonstration source)",
      sourceTitle: "Visit note template consultation (demo)",
      sourceUrl: "https://trilogycare.com.au/",
      published: "2026-10-13",
      owner: "Quality and Practice Lead (demo)",
      reviewDate: "2026-12-13",
    },
    body: [
      {
        type: "p",
        text: "This is a proposal only. The draft template asks for three things: what you did, what you noticed and what someone else needs to know.",
      },
      { type: "p", text: "Share feedback with your coordinator. We will publish a briefing if and when the template is adopted." },
    ],
  },
  {
    slug: "physio-spotlight",
    category: "spotlight",
    title: "Small goals, steady progress: a physiotherapy partner’s approach",
    dek: "How one physiotherapy partner sets goals clients care about, builds progress into everyday routines, and keeps families and coordinators in the loop.",
    byline: "Partner stories (demo)",
    date: "2026-10-12T01:00:00Z",
    readMinutes: 2,
    visual: { variant: "arc", tone: "teal", icon: "heart", alt: "A physiotherapist working with an older client at home" },
    audience: ["partner"],
    body: [
      {
        type: "p",
        text: "Our demo physiotherapy partner, Priya, starts every program with the same question: *what do you want to be able to do again?* It might be reaching the letterbox, getting into the garden, or walking to the bus stop for the Tuesday social group.",
      },
      { type: "h2", text: "Goals in the client’s own words" },
      {
        type: "p",
        text: "Priya writes each goal the way the client says it, then breaks it into steps she can measure. “I want to get to the letterbox” becomes standing from a chair without using her hands, then walking to the front door, then to the gate, and finally the letterbox and back without a rest.",
      },
      {
        type: "quote",
        text: "People don’t come to physio to do exercises. They come to get a piece of their life back. I start there.",
        cite: "Priya, physiotherapy partner (demo)",
      },
      { type: "h2", text: "Progress built into the day" },
      {
        type: "p",
        text: "Home programs work best when they fit what the person already does. Priya links exercises to daily routines: sit-to-stands before morning tea, heel raises while the kettle boils, a lap of the hallway after lunch. Short, regular practice beats a long list nobody keeps up.",
      },
      {
        type: "list",
        items: [
          "Three or four exercises at most, each tied to something they do every day.",
          "A large-print sheet on the fridge, with a picture of each one.",
          "A simple tick-box for the week, so progress is something they can see.",
        ],
      },
      { type: "h2", text: "Plain words for families and coordinators" },
      {
        type: "p",
        text: "Because each goal is in the client’s own words, progress is easy to explain. Instead of a list of measurements, Priya’s notes say what’s changed in their life: “Mrs Hall walked to her letterbox and back this week with her stick, without stopping.” Families understand it straight away, and so does the coordinator planning the next quarter.",
      },
      { type: "h2", text: "Working with the coordinator" },
      {
        type: "p",
        text: "Priya keeps the coordinator close, especially when things change. A fall, a new walking aid, a hospital stay or a goal that’s been reached are all reasons to call. Physio often stops after a hospital admission and doesn’t restart, and a quick message to the coordinator is how it gets back into the plan.",
      },
      {
        type: "list",
        items: [
          "**Report changes early**, especially falls, new pain or a drop in confidence.",
          "**Agree the plan and its cost** before adding sessions, so it fits the person’s budget and they understand their contribution.",
          "**Respect the person’s choices.** If they want to keep gardening on uneven ground, work out how to do it more safely together, rather than telling them to stop.",
        ],
      },
      { type: "h2", text: "What coordinators can take from it" },
      {
        type: "p",
        text: "Start with what matters to the person, and the rest of the plan follows. Goals in their own words make it easier to choose services, to explain the budget, and to see whether the support is working. If a client’s physio has quietly stopped, it’s worth asking why.",
      },
      {
        type: "p",
        text: "On the Hub, *Look before you help: spot the hazard* and the Dignity of Risk practice in the Magazine are good next steps for thinking about safety and choice at home.",
      },
    ],
  },
  {
    slug: "case-study-cleaning-routine",
    category: "case-study",
    title: "Rearranging a cleaning routine around a client’s energy",
    dek: "How a partner and coordinator adjusted the order of tasks without changing the service.",
    byline: "Care coordination (demo)",
    date: "2026-10-10T02:00:00Z",
    readMinutes: 4,
    visual: {
      variant: "wave",
      tone: "sky",
      icon: "home",
      alt: "An older couple smiling and holding hands on a couch at home, beside a Trilogy Care booklet graphic",
      photo: { src: "/images/karen.jpeg", width: 311, height: 162, position: "70% center" },
    },
    audience: ["partner"],
    body: [
      {
        type: "p",
        text: "In this demo case, a client found mornings tiring. The partner suggested starting with quieter tasks and leaving vacuuming until later. The coordinator confirmed the change suited the plan.",
      },
    ],
  },
  {
    slug: "coordinator-learning-path",
    category: "learning",
    title: "A new learning path for coordinators",
    dek: "Your guide to the Partner Hub as a Care Coordinator: where to start, the paths and courses that build your practice, and the tools you’ll reach for between visits.",
    byline: "Learning team (demo)",
    date: "2026-10-08T22:00:00Z",
    readMinutes: 5,
    visual: { variant: "dots", tone: "teal", icon: "route", alt: "Teal dots forming a path" },
    audience: ["coordinator"],
    relatedLesson: "noticing-a-change",
    body: [
      {
        type: "p",
        text: "Care Coordinators are at the centre of everything Trilogy Care does, and the Partner Hub has grown up around your work. This is a short tour: where to start, what to do next, and where to find help in the middle of a busy day.",
      },
      { type: "h2", text: "Start with your setup" },
      {
        type: "p",
        text: "**Your setup**, in the account menu, shows what you need to do before you start and what Trilogy Care is still checking. Once you’re active it becomes **Your profile and requirements**. Your onboarding courses are chosen for your role, and they start with a short *Get to know you* step so the Hub can point you to the right things.",
      },
      {
        type: "p",
        text: "Anything you’re required to complete, like a policy to read and acknowledge or a path you’ve been assigned, shows in **Required training** with its due date.",
      },
      { type: "h2", text: "Your Discovery Paths" },
      {
        type: "p",
        text: "A Discovery Path is a route through short Topics in order, grouped into chapters, with a voiced introduction, a quiz and a certificate at the end. Two are written for you:",
      },
      { type: "h3", text: "Care Coordination" },
      {
        type: "p",
        text: "Everything you need to start coordinating care with Trilogy Care: meet your team, learn the rules that protect older people, then practise the everyday work of case notes, budgets, weekly checks and incident reporting. It’s for new coordinators in the weeks before their first clients, and a handy refresher for everyone else.",
      },
      { type: "h3", text: "Support at Home in Practice" },
      {
        type: "p",
        text: "The second stage, for your first six months: the money conversations, working with your Care Partner and the Trilogy Care Portal, managing budgets through real quarters, AT–HM requests, and responding well when things go wrong. Each Topic stands on its own, so start with whatever comes up first with your clients.",
      },
      {
        type: "p",
        text: "Alongside them: **Aged Care in a Nutshell**, a 30-minute orientation to the whole system; **Getting Invoices Paid**, for working with suppliers; and the three **SIRS** paths on incident management. Your manager may assign a path with a due date, and you can build your own in **My Discovery** from what you want to get better at.",
      },
      { type: "h2", text: "Topics: ten minutes between visits" },
      {
        type: "p",
        text: "Topics are the Hub’s microlearning. Each one takes about ten minutes, one card at a time, and keeps your place so you can stop and pick it up later. Every Topic follows the same shape: a hook, a realistic situation, the key ideas, a decision, what happens next, a quick check and a summary to take away. There’s more on how they work in [Learning that fits between visits](/news/three-minute-lessons).",
      },
      { type: "h2", text: "Magazine courses: when you have longer" },
      {
        type: "p",
        text: "The Magazine holds longer, story-led courses for a desk and a coffee. Each page has a voiced introduction you can listen to, and most have practice built in. For coordinators, start with:",
      },
      {
        type: "list",
        items: [
          "**Dot at quarter end: what’s really left?** Reading a sizeable balance late in the quarter, and planning with Dot, not around her.",
          "**Dot comes home: the 72-hour discharge pivot.** Bringing someone home from hospital safely when the handover has gaps.",
          "**Mrs Patel’s Week 8.** Recovering a service that’s gone wrong, and hearing what she wants.",
          "**Can this be funded? A quote and an invoice, line by line.** Telling “could be funded” from “approved for this person”.",
          "**Fiona calls: when the gardener doesn’t come.** A difficult family call, practised with a fictional caller.",
          "**What would you do? Two conversations about choice.** Real dilemmas, and how experienced coordinators handled them.",
        ],
      },
      { type: "h2", text: "Practice that feels like the job" },
      {
        type: "p",
        text: "Many courses include practice blocks: simulations and roleplays built on fictional cases, so you can make a call, see what happens and try again without anyone getting hurt. A few you’ll meet:",
      },
      {
        type: "list",
        items: [
          "**Tough Phone Call:** take a hard call from a fictional client or family member, and get a debrief in your own words.",
          "**Spot the Signal:** find the concern hidden across a few ordinary updates.",
          "**Where Is the Line?** Decide, request by request, what’s within your role.",
          "**Red Pen:** mark up a weak case note or care plan goal, then rewrite it.",
          "**Invoice X-Ray:** read a quote or invoice line by line before it’s approved.",
          "**Pass the Baton:** hand a case on so nothing falls between roles.",
        ],
      },
      { type: "h2", text: "Help in the middle of the day" },
      {
        type: "list",
        items: [
          "**Work Tools** hold short, approved Job Aids for the task in front of you, always the current version, with a route to urgent help.",
          "**Favourites**, in the header, keep the lines you’ve highlighted and the tools you use most. It also opens the Companion Drawer, with golden scripts, a co-contribution quick-calc and incident first steps for use on a live call.",
          "**Myth vs Reality** gives a 30-second, approved answer to the questions clients ask most, with an email reply to copy.",
          "The **Glossary** explains Support at Home terms in plain words, and the **client journey map** shows all ten stages from enquiry to exit.",
        ],
      },
      { type: "h2", text: "Learning from each other" },
      {
        type: "p",
        text: "The **Community** is where coordinators compare notes. In *What Would You Do?* case threads you write your own first take on a fictional dilemma before reading a reviewed case note and how others responded. You’ll also meet the **Digital Members**, the fictional people who turn up across your training, and follow their lives as they carry on. And Ava, a care coordinator out on the road, checks in from time to time to see how you’re going.",
      },
      { type: "h2", text: "Seeing your progress" },
      {
        type: "p",
        text: "**Your learning** on the Topics page shows what’s required, what’s in progress and what you’ve finished, with certificates for each path. **My Capabilities** brings together the evidence of what you can do, so it’s about capability, not just completions.",
      },
      { type: "h2", text: "Tell us what’s missing" },
      {
        type: "p",
        text: "The Hub keeps changing with your feedback. Use the feedback link on any Topic, or tell your team leader what would help. If there’s a situation you keep meeting that isn’t covered yet, ask for it in My Discovery: the learning team sees every request.",
      },
    ],
  },
  {
    slug: "sector-workforce-roundup",
    category: "industry",
    title: "Around the sector: workforce, training and in-home support",
    dek: "A demonstration roundup format for industry news, with sources listed for every item.",
    byline: "Industry roundup (demo)",
    date: "2026-10-06T23:00:00Z",
    readMinutes: 5,
    visual: {
      variant: "petals",
      tone: "sky",
      icon: "spark",
      alt: "An older couple sitting at a kitchen table going through paperwork together, beside a Trilogy home and flower graphic",
      photo: { src: "/images/jill.jpeg", width: 576, height: 300, position: "70% center" },
    },
    audience: ["partner", "coordinator"],
    body: [
      { type: "p", text: "Roundups will summarise relevant sector news with a clear source and date for each item. This demonstration shows the format only." },
    ],
  },
];

export const storyBySlug = (slug: string) => stories.find((s) => s.slug === slug);

export const policyStatusLabel: Record<PolicyMeta["status"], string> = {
  proposal: "Proposal — not in effect",
  announced: "Announced — not yet in effect",
  in_effect: "In effect",
  superseded: "Superseded",
};
