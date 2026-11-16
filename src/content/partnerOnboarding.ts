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
    box: { blurb: "From referral to your first service, and who you’ll work with.", icon: "building", tone: "bg-[#fdebd3]" },
  },
  brokered: {
    id: "brokered",
    href: "/resources/brokered-onboarding",
    label: "Brokered partner onboarding",
    title: "Your first steps as a brokered partner",
    intro,
    lead,
    description: describe("brokered partner"),
    nodes: people({ title: "Brokered Partner", sub: "(Brokered)" }),
    edges: lines(),
    box: { blurb: "How the brokered model works, and who you’ll work with.", icon: "briefcase", tone: "bg-[#e3f4f3]" },
  },
  coordinator: {
    id: "coordinator",
    href: "/resources/coordinator-managed-onboarding",
    label: "Coordinator managed onboarding",
    title: "Your first steps as a coordinator managed partner",
    intro,
    lead,
    description: describe("coordinator managed partner"),
    nodes: people({ title: "Partner", sub: "(Coordinator managed)" }),
    edges: lines(),
    box: { blurb: "How the coordinator managed model works, and who you’ll work with.", icon: "calendar", tone: "bg-[#e6eef8]" },
  },
};

export const ONBOARDING_MODELS = [ONBOARDING.p1, ONBOARDING.brokered, ONBOARDING.coordinator];
