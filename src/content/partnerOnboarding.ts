import type { IconName } from "@/components/Icon";

/*
  Partner onboarding, one per partner model (P1 referring, Brokered, Coordinator managed): the page's
  words and the who-does-what diagram (components/resources/PartnerOnboarding). Each model is its own
  copy so they can be worded and drawn differently. Brokered and Coordinator managed start as copies of
  P1 with their own partner at the top, ready to be adjusted.

  The diagram is drawn in a 1200 × 700 frame: boxes by position and size, lines as SVG paths, labels at
  a point. `at`: when, in seconds, each part appears as the diagram builds.
*/

export type OnboardingNode = {
  id: string;
  x: number;
  y: number;
  w: number;
  h: number;
  title: string;
  sub?: string;
  body?: string;
  icon: IconName;
  tone: "peach" | "light" | "teal";
  at: number;
};
export type OnboardingEdge = { id: string; from: string; to: string; d: string; label: string; lx: number; ly: number; at: number; both?: boolean };

export type OnboardingModelId = "p1" | "brokered" | "coordinator";

/** A "Who you'll work with" card: who they are, an icon, and its colours (the circle and the bar along the bottom). */
export type OnboardingRole = { title: string; body: string; icon: IconName; circle: string; bar: string };

export type Onboarding = {
  id: OnboardingModelId;
  href: string;
  /** The small label over the title, and on its box on Resources. */
  label: string;
  title: string;
  intro: string;
  lead: string;
  /** What the diagram shows, read out in place of the drawing. */
  description: string;
  nodes: OnboardingNode[];
  edges: OnboardingEdge[];
  /** A key under the diagram saying what each colour of box is (client, Trilogy Care, external). */
  key?: boolean;
  roles: OnboardingRole[];
  /** On its box on Resources. */
  box: { blurb: string; icon: IconName; tone: string };
};

const people = (partner: { title: string; sub: string }): OnboardingNode[] => [
  { id: "partner", x: 450, y: 40, w: 300, h: 92, title: partner.title, sub: partner.sub, icon: "building", tone: "peach", at: 0 },
  { id: "client", x: 150, y: 205, w: 330, h: 115, title: "Client", sub: "(care recipient)", icon: "user", tone: "light", at: 0.9 },
  {
    id: "manager",
    x: 760,
    y: 200,
    w: 390,
    h: 135,
    title: "Trilogy Partnership Manager",
    body: "Owns the referring partner relationship, onboarding, Partner Hub and 30/60/90-day plan.",
    icon: "people",
    tone: "teal",
    at: 1.6,
  },
  {
    id: "carePartner",
    x: 405,
    y: 395,
    w: 390,
    h: 112,
    title: "Trilogy Care Partner",
    body: "Trilogy Care case manager: goals, care plan, budget, upgrades.",
    icon: "clipboard",
    tone: "teal",
    at: 2.4,
  },
  { id: "coordinator", x: 425, y: 570, w: 350, h: 105, title: "Care Coordinator", body: "Sources and rosters services, manages providers.", icon: "calendar", tone: "teal", at: 3.1 },
];

const lines = (): OnboardingEdge[] => [
  { id: "refers", from: "partner", to: "client", d: "M600 134 V160 H315 V198", label: "refers", lx: 455, ly: 160, at: 0.4 },
  { id: "support", from: "manager", to: "partner", d: "M600 138 V160 H955 V194", label: "onboarding and support", lx: 785, ly: 160, at: 1.2, both: true },
  { id: "handover", from: "manager", to: "carePartner", d: "M955 337 V355 H600 V388", label: "hands over referral", lx: 790, ly: 355, at: 2.05 },
  { id: "goals", from: "client", to: "carePartner", d: "M315 322 V355 H600 V388", label: "goals, plan and budget", lx: 452, ly: 355, at: 1.95 },
  { id: "together", from: "carePartner", to: "coordinator", d: "M600 509 V563", label: "works together", lx: 600, ly: 536, at: 2.8 },
  { id: "services", from: "coordinator", to: "client", d: "M423 622 H200 V328", label: "services coordinated", lx: 200, ly: 470, at: 3.45 },
];

const client: OnboardingRole = { title: "Client", body: "The person receiving care.", icon: "user", circle: "bg-[#d7efee] text-[#007b7c]", bar: "bg-[#2a9d8f]" };
const carePartner: OnboardingRole = {
  title: "Trilogy Care Partner",
  body: "Trilogy Care case manager: plan and budget.",
  icon: "clipboard",
  circle: "bg-[#d4e8f2] text-[#1d2b4f]",
  bar: "bg-[#1d2b4f]",
};
const roles: OnboardingRole[] = [
  client,
  carePartner,
  { title: "Care Coordinator", body: "Arranges and rosters services.", icon: "calendar", circle: "bg-[#f8ead1] text-[#8a5a00]", bar: "bg-[#e0a030]" },
  { title: "Trilogy Partnership Manager", body: "Looks after the referring partner.", icon: "people", circle: "bg-[#f6dcdc] text-[#c7393e]", bar: "bg-[#c7393e]" },
];

/*
  Brokered: the brokered partner (external) is onboarded and supported by the Partnership Manager, who
  brings in Compliance to audit; works with the Care Partner; and coordinates and delivers the client's
  services. The client sets goals, plan and budget with the Care Partner.
*/
const brokeredPeople: OnboardingNode[] = [
  { id: "partner", x: 30, y: 300, w: 300, h: 92, title: "Brokered Partner", sub: "(External)", icon: "building", tone: "peach", at: 0 },
  {
    id: "manager",
    x: 515,
    y: 30,
    w: 345,
    h: 100,
    title: "Trilogy Partnership Manager",
    sub: "(Trilogy Care)",
    icon: "people",
    tone: "teal",
    at: 0.9,
  },
  { id: "compliance", x: 945, y: 30, w: 245, h: 100, title: "Compliance", sub: "(Trilogy Care)", icon: "shield", tone: "teal", at: 1.75 },
  {
    id: "carePartner",
    x: 850,
    y: 175,
    w: 330,
    h: 115,
    title: "Trilogy Care Partner",
    body: "Trilogy Care case manager: goals, care plan, budget, upgrades.",
    icon: "clipboard",
    tone: "teal",
    at: 2.55,
  },
  { id: "client", x: 560, y: 540, w: 300, h: 100, title: "Client", sub: "(care recipient)", icon: "user", tone: "light", at: 3.35 },
];
const brokeredLines: OnboardingEdge[] = [
  { id: "support", from: "partner", to: "manager", d: "M330 346 H395 V80 H508", label: "onboarding and support", lx: 395, ly: 215, at: 0.4 },
  { id: "audit", from: "manager", to: "compliance", d: "M860 80 H938", label: "audit", lx: 900, ly: 80, at: 1.3 },
  { id: "together", from: "partner", to: "carePartner", d: "M330 346 H1015 V297", label: "works together", lx: 690, ly: 346, at: 2.05 },
  { id: "delivers", from: "partner", to: "client", d: "M330 346 H420 V590 H553", label: "coordinates and delivers services", lx: 420, ly: 470, at: 2.9 },
  { id: "goals", from: "client", to: "carePartner", d: "M860 590 H930 V297", label: "goals, plan and budget", lx: 930, ly: 440, at: 3.7 },
];

/*
  Coordinator managed: the care coordinator (external) is onboarded and supported by the Partnership
  Manager, who brings in Compliance to audit. The care coordinator coordinates the client's services,
  works with the Care Partner, and sources services from a supplier, who delivers them to the client.
  The client sets goals, plan and budget with the Care Partner.
*/
const coordinatorPeople: OnboardingNode[] = [
  { id: "coordinator", x: 15, y: 190, w: 320, h: 100, title: "Care Coordinator", sub: "(External)", icon: "calendar", tone: "peach", at: 0 },
  {
    id: "manager",
    x: 400,
    y: 20,
    w: 345,
    h: 100,
    title: "Trilogy Partnership Manager",
    sub: "(Trilogy Care)",
    icon: "people",
    tone: "teal",
    at: 0.9,
  },
  { id: "compliance", x: 900, y: 20, w: 245, h: 100, title: "Compliance", sub: "(Trilogy Care)", icon: "shield", tone: "teal", at: 1.7 },
  { id: "client", x: 600, y: 190, w: 280, h: 100, title: "Client", sub: "(care recipient)", icon: "user", tone: "light", at: 2.45 },
  {
    id: "carePartner",
    x: 860,
    y: 330,
    w: 330,
    h: 115,
    title: "Trilogy Care Partner",
    body: "Trilogy Care case manager: goals, care plan, budget, upgrades.",
    icon: "clipboard",
    tone: "teal",
    at: 3.15,
  },
  { id: "supplier", x: 470, y: 540, w: 280, h: 100, title: "Supplier", sub: "(External)", icon: "briefcase", tone: "peach", at: 4.1 },
];
const coordinatorLines: OnboardingEdge[] = [
  { id: "support", from: "coordinator", to: "manager", d: "M335 240 H365 V70 H393", label: "onboarding and support", lx: 365, ly: 155, at: 0.4 },
  { id: "audit", from: "manager", to: "compliance", d: "M745 70 H893", label: "audit", lx: 820, ly: 70, at: 1.3 },
  { id: "services", from: "coordinator", to: "client", d: "M335 240 H593", label: "services coordinated", lx: 482, ly: 240, at: 2.0 },
  { id: "goals", from: "client", to: "carePartner", d: "M880 240 H1025 V323", label: "goals, plan and budget", lx: 1025, ly: 240, at: 2.75 },
  { id: "together", from: "coordinator", to: "carePartner", d: "M335 240 H575 V387 H853", label: "works together", lx: 670, ly: 387, at: 3.4 },
  { id: "sources", from: "coordinator", to: "supplier", d: "M335 240 H365 V590 H463", label: "sources services", lx: 365, ly: 430, at: 3.7 },
  { id: "delivers", from: "supplier", to: "client", d: "M750 590 H790 V297", label: "delivers services", lx: 790, ly: 480, at: 4.4 },
];

const intro =
  "From referral to your first service, onboarding takes five steps. We handle the call, the client agreement and the budget meeting. You make the referral, sign your contractor agreement and deliver the care.";
const lead = "All you need to start is one referral code.";
const describe = (partner: string) =>
  `Who does what: the ${partner} refers the client and is onboarded and supported by the Trilogy Partnership Manager, who hands the referral to the Trilogy Care Partner. The Trilogy Care Partner sets the client’s goals, plan and budget, and works with the Care Coordinator, who coordinates the client’s services.`;

export const ONBOARDING: Record<OnboardingModelId, Onboarding> = {
  p1: {
    id: "p1",
    href: "/resources/partner-onboarding",
    label: "P1 partner onboarding",
    title: "Your first steps as a Trilogy Care partner",
    intro,
    lead,
    description: describe("referring partner"),
    nodes: people({ title: "Referring Partner", sub: "(P1 Partner)" }),
    edges: lines(),
    roles,
    box: { blurb: "From referral to your first service, and who you’ll work with.", icon: "building", tone: "bg-[#fdebd3]" },
  },
  brokered: {
    id: "brokered",
    href: "/resources/brokered-onboarding",
    label: "Brokered partner onboarding",
    title: "Your first steps as a brokered partner",
    intro,
    lead,
    description:
      "Who does what: the brokered partner is onboarded and supported by the Trilogy Partnership Manager, who brings in Compliance to audit. The brokered partner works with the Trilogy Care Partner, and coordinates and delivers the client’s services. The client sets their goals, plan and budget with the Trilogy Care Partner.",
    nodes: brokeredPeople,
    edges: brokeredLines,
    key: true,
    roles: [
      client,
      carePartner,
      { title: "Trilogy Partnership Manager", body: "Onboards and supports the brokered partner.", icon: "people", circle: "bg-[#f6dcdc] text-[#c7393e]", bar: "bg-[#c7393e]" },
      { title: "Compliance", body: "Audits the partnership.", icon: "shield", circle: "bg-[#f8ead1] text-[#8a5a00]", bar: "bg-[#e0a030]" },
    ],
    box: { blurb: "How the brokered model works, and who you’ll work with.", icon: "briefcase", tone: "bg-[#e3f4f3]" },
  },
  coordinator: {
    id: "coordinator",
    href: "/resources/coordinator-managed-onboarding",
    label: "Coordinator managed onboarding",
    title: "Your first steps as a coordinator managed partner",
    intro,
    lead,
    description:
      "Who does what: the care coordinator is onboarded and supported by the Trilogy Partnership Manager, who brings in Compliance to audit. The care coordinator coordinates the client’s services, works with the Trilogy Care Partner, and sources services from a supplier, who delivers them to the client. The client sets their goals, plan and budget with the Trilogy Care Partner.",
    nodes: coordinatorPeople,
    edges: coordinatorLines,
    key: true,
    roles: [
      client,
      carePartner,
      { title: "Trilogy Partnership Manager", body: "Onboards and supports the care coordinator.", icon: "people", circle: "bg-[#f6dcdc] text-[#c7393e]", bar: "bg-[#c7393e]" },
      { title: "Supplier", body: "Delivers the services you source.", icon: "briefcase", circle: "bg-[#f8ead1] text-[#8a5a00]", bar: "bg-[#e0a030]" },
    ],
    box: { blurb: "How the coordinator managed model works, and who you’ll work with.", icon: "calendar", tone: "bg-[#e6eef8]" },
  },
};

export const ONBOARDING_MODELS = [ONBOARDING.p1, ONBOARDING.brokered, ONBOARDING.coordinator];
