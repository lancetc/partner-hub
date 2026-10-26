/*
  Demonstration content for the prototype. None of these stories, people, dates or
  policy details are real Trilogy announcements; each is labelled as demo in the UI.
*/

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

export type StoryBlock =
  | { type: "p"; text: string }
  | { type: "h2"; text: string }
  | { type: "list"; items: string[] }
  | { type: "quote"; text: string; cite: string };

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
};

export type IconName =
  | "clock"
  | "shield"
  | "heart"
  | "leaf"
  | "chat"
  | "home"
  | "spark"
  | "doc"
  | "people"
  | "sun"
  | "route"
  | "book";

export const stories: Story[] = [
  {
    slug: "partners-shaping-the-hub",
    category: "trilogy",
    title: "Partners and coordinators are shaping the new Partner Hub",
    dek: "Short lessons, clearer onboarding and news that explains what changes in practice. Here is what the pilot is testing, and how to tell us what works.",
    byline: "Trilogy Care team",
    date: "2026-10-21T22:00:00Z",
    readMinutes: 4,
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
      { type: "p", text: "The Partner Hub brings news, practical learning and onboarding into one place. It is built for the people who deliver and coordinate support every day: physiotherapists, nurses, gardeners, cleaners, and internal and external care coordinators." },
      { type: "h2", text: "What the pilot is testing" },
      { type: "list", items: ["Lessons of two to five minutes that you can finish between visits", "Scenarios where your choice changes what happens next", "An onboarding checklist that shows what you need to do and what we are still checking", "Short policy briefings that start with what changes for you"] },
      { type: "p", text: "Everything you see in this prototype is demonstration content. It helps us check the experience before real requirements and policy are connected." },
      { type: "quote", text: "If a lesson helps you decide what to do on your next visit, it has done its job.", cite: "Pilot learning lead (demo)" },
      { type: "h2", text: "Tell us what works" },
      { type: "p", text: "Use the feedback link on any lesson, or talk with your coordinator. We are especially keen to hear where something was unclear or took longer than it should." },
    ],
  },
  {
    slug: "extra-visit-time-briefing",
    category: "policy",
    title: "From 3 November, confirm extra visit time before you stay",
    dek: "A demonstration briefing: what changed, who it affects and what to do when a client asks you to stay longer.",
    byline: "Service Partnerships (demo)",
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
      owner: "Head of Service Partnerships (demo)",
      reviewDate: "2027-04-20",
    },
    body: [
      { type: "h2", text: "What changed" },
      { type: "p", text: "From the effective date, any extension to a planned visit needs to be confirmed through the care coordinator before the extra time is delivered. Previously, short extensions could be noted afterwards." },
      { type: "h2", text: "Who it affects" },
      { type: "p", text: "All service partners delivering scheduled visits, and the coordinators who confirm changes." },
      { type: "h2", text: "What to do" },
      { type: "list", items: ["Tell the client you are happy to check", "Contact the coordinator using the usual channel", "Only stay longer once the change is confirmed", "Record what was agreed in your visit note"] },
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
      { type: "p", text: "Our demo partner, Jordan, has looked after the same handful of gardens for three years. The work is practical: mowing, pruning, clearing gutters before storm season. The relationships are what make it last." },
      { type: "quote", text: "If the path is getting mossy or the hose is left out, I mention it. It is usually nothing, but sometimes it matters.", cite: "Jordan, garden partner (demo)" },
      { type: "h2", text: "A good note is short and specific" },
      { type: "p", text: "Jordan keeps visit notes to what changed and what someone else might need to know. That habit makes it easier for coordinators to act early." },
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
      { type: "p", text: "In this demonstration case, a coordinator noticed that a client who usually chatted about their week sounded tired and was repeating questions. The coordinator slowed down, asked open questions and confirmed what support was already in place." },
      { type: "h2", text: "What helped" },
      { type: "list", items: ["Asking how the week had been, then pausing", "Checking recent visit notes from partners", "Following the escalation process instead of solving everything on the call"] },
      { type: "p", text: "Practise a similar conversation in the coordinator scenario lesson." },
    ],
  },
  {
    slug: "three-minute-lessons",
    category: "learning",
    title: "Learning that fits between visits",
    dek: "Why the new lessons are short, visual and built around a single decision.",
    byline: "Learning team (demo)",
    date: "2026-10-16T22:00:00Z",
    readMinutes: 3,
    visual: { variant: "grid", tone: "teal", icon: "book", alt: "Tiled teal squares like a set of cards" },
    audience: ["partner", "coordinator"],
    relatedLesson: "a-little-extra-time",
    body: [
      { type: "p", text: "Each lesson focuses on one useful outcome. You will see one card at a time, with a short explanation and one clear action. Audio and video are optional: everything essential is available to read." },
      { type: "p", text: "Your place is saved as you go, so you can leave and resume later." },
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
    visual: { variant: "dots", tone: "navy", icon: "sun", alt: "An older couple sitting at a kitchen table going through paperwork together, beside a Trilogy home and flower graphic", photo: { src: "/images/jill.jpeg", width: 576, height: 300, position: "70% center" } },
    audience: ["partner"],
    body: [
      { type: "p", text: "Shorter days and wet surfaces change how visits feel. Plan outdoor tasks for daylight, check paths and steps, and mention anything that could make the home less safe." },
      { type: "list", items: ["Check heating is working where it is part of your service", "Note slippery or poorly lit areas", "Allow extra travel time and tell your coordinator early if you are delayed"] },
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
      { type: "p", text: "Uploading a document is not the same as it being verified. The checklist now shows each step clearly: received, in review, action required or verified." },
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
      { type: "p", text: "This is a proposal only. The draft template asks for three things: what you did, what you noticed and what someone else needs to know." },
      { type: "p", text: "Share feedback with your coordinator. We will publish a briefing if and when the template is adopted." },
    ],
  },
  {
    slug: "physio-spotlight",
    category: "spotlight",
    title: "Small goals, steady progress: a physiotherapy partner’s approach",
    dek: "Setting goals clients care about, and explaining them in plain words.",
    byline: "Partner stories (demo)",
    date: "2026-10-12T01:00:00Z",
    readMinutes: 5,
    visual: { variant: "arc", tone: "teal", icon: "heart", alt: "Teal arcs with a heart motif" },
    audience: ["partner"],
    body: [
      { type: "p", text: "Our demo physiotherapy partner, Priya, starts each program by asking what the client wants to be able to do again. It might be reaching the letterbox or getting into the garden." },
      { type: "p", text: "Goals expressed in the client’s own words make it easier to explain progress to families and coordinators." },
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
    visual: { variant: "wave", tone: "sky", icon: "home", alt: "An older couple smiling and holding hands on a couch at home, beside a Trilogy Care booklet graphic", photo: { src: "/images/karen.jpeg", width: 311, height: 162, position: "70% center" } },
    audience: ["partner", "coordinator"],
    body: [
      { type: "p", text: "In this demo case, a client found mornings tiring. The partner suggested starting with quieter tasks and leaving vacuuming until later. The coordinator confirmed the change suited the plan." },
    ],
  },
  {
    slug: "coordinator-learning-path",
    category: "learning",
    title: "A new learning path for coordinators",
    dek: "Scenario practice for judgement, communication and escalation.",
    byline: "Learning team (demo)",
    date: "2026-10-08T22:00:00Z",
    readMinutes: 2,
    visual: { variant: "dots", tone: "teal", icon: "route", alt: "Teal dots forming a path" },
    audience: ["coordinator"],
    relatedLesson: "noticing-a-change",
    body: [
      { type: "p", text: "The coordinator path starts with a scenario about noticing a change in a client’s needs. More scenarios will follow after the pilot." },
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
    visual: { variant: "petals", tone: "sky", icon: "spark", alt: "An older couple sitting at a kitchen table going through paperwork together, beside a Trilogy home and flower graphic", photo: { src: "/images/jill.jpeg", width: 576, height: 300, position: "70% center" } },
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
