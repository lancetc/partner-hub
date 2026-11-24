/*
  Community Atlas (Community → Atlas): where the Digital Members live, and what they have in common.

  Everyone here is fictional, and so is where they live: a town, never an address, placed at the town's centre.
  Nothing on the Atlas uses anyone's device location; "Near me" asks which town you'd like to start from.

  Topics are a small shared vocabulary, so people can find common ground across the country. `canHelp` and
  `askingAbout` are the topics a person would talk through with someone, and the topics they'd like help with.
*/

export const ATLAS_TOPICS = [
  "Hospital discharge",
  "Falls and safety at home",
  "Invoices and quotes",
  "Self-management",
  "Choice and control",
  "Working with families",
  "Incidents and speaking up",
  "Consent and privacy",
  "Clinical care at home",
  "Growing a business",
  "Checks and compliance",
  "Social connection",
  "Rural and remote",
] as const;
export type AtlasTopic = (typeof ATLAS_TOPICS)[number];

export const STATES = ["QLD", "NSW", "ACT", "VIC", "TAS", "SA", "WA", "NT"] as const;
export type AusState = (typeof STATES)[number];
export const STATE_NAMES: Record<AusState, string> = {
  QLD: "Queensland",
  NSW: "New South Wales",
  ACT: "Australian Capital Territory",
  VIC: "Victoria",
  TAS: "Tasmania",
  SA: "South Australia",
  WA: "Western Australia",
  NT: "Northern Territory",
};

export type Town = { name: string; state: AusState; lat: number; lng: number };

/**
  Town centres, to two decimal places: close enough for a map of the country, never a street. Members who join the
  Atlas choose the nearest town on this list, so a small place is never pinned on its own.
*/
export const TOWNS = {
  adelaide: { name: "Adelaide", state: "SA", lat: -34.93, lng: 138.6 },
  albany: { name: "Albany", state: "WA", lat: -35.02, lng: 117.88 },
  albury: { name: "Albury", state: "NSW", lat: -36.08, lng: 146.92 },
  aliceSprings: { name: "Alice Springs", state: "NT", lat: -23.7, lng: 133.88 },
  ballarat: { name: "Ballarat", state: "VIC", lat: -37.56, lng: 143.85 },
  bendigo: { name: "Bendigo", state: "VIC", lat: -36.76, lng: 144.28 },
  brisbane: { name: "Brisbane", state: "QLD", lat: -27.47, lng: 153.03 },
  broome: { name: "Broome", state: "WA", lat: -17.96, lng: 122.24 },
  bundaberg: { name: "Bundaberg", state: "QLD", lat: -24.87, lng: 152.35 },
  bunbury: { name: "Bunbury", state: "WA", lat: -33.33, lng: 115.64 },
  cairns: { name: "Cairns", state: "QLD", lat: -16.92, lng: 145.77 },
  canberra: { name: "Canberra", state: "ACT", lat: -35.28, lng: 149.13 },
  darwin: { name: "Darwin", state: "NT", lat: -12.46, lng: 130.84 },
  devonport: { name: "Devonport", state: "TAS", lat: -41.18, lng: 146.36 },
  dubbo: { name: "Dubbo", state: "NSW", lat: -32.25, lng: 148.6 },
  emerald: { name: "Emerald", state: "QLD", lat: -23.53, lng: 148.16 },
  geelong: { name: "Geelong", state: "VIC", lat: -38.15, lng: 144.36 },
  geraldton: { name: "Geraldton", state: "WA", lat: -28.77, lng: 114.61 },
  hobart: { name: "Hobart", state: "TAS", lat: -42.88, lng: 147.33 },
  ipswich: { name: "Ipswich", state: "QLD", lat: -27.61, lng: 152.76 },
  kalgoorlie: { name: "Kalgoorlie", state: "WA", lat: -30.75, lng: 121.47 },
  katherine: { name: "Katherine", state: "NT", lat: -14.47, lng: 132.26 },
  launceston: { name: "Launceston", state: "TAS", lat: -41.44, lng: 147.14 },
  longreach: { name: "Longreach", state: "QLD", lat: -23.44, lng: 144.25 },
  mackay: { name: "Mackay", state: "QLD", lat: -21.14, lng: 149.19 },
  melbourne: { name: "Melbourne", state: "VIC", lat: -37.81, lng: 144.96 },
  mildura: { name: "Mildura", state: "VIC", lat: -34.21, lng: 142.14 },
  mountGambier: { name: "Mount Gambier", state: "SA", lat: -37.83, lng: 140.78 },
  mountIsa: { name: "Mount Isa", state: "QLD", lat: -20.73, lng: 139.49 },
  newcastle: { name: "Newcastle", state: "NSW", lat: -32.93, lng: 151.78 },
  orange: { name: "Orange", state: "NSW", lat: -33.28, lng: 149.1 },
  parramatta: { name: "Parramatta", state: "NSW", lat: -33.82, lng: 151.0 },
  perth: { name: "Perth", state: "WA", lat: -31.95, lng: 115.86 },
  portLincoln: { name: "Port Lincoln", state: "SA", lat: -34.73, lng: 135.86 },
  portMacquarie: { name: "Port Macquarie", state: "NSW", lat: -31.43, lng: 152.91 },
  rockhampton: { name: "Rockhampton", state: "QLD", lat: -23.38, lng: 150.51 },
  sydney: { name: "Sydney", state: "NSW", lat: -33.87, lng: 151.21 },
  toowoomba: { name: "Toowoomba", state: "QLD", lat: -27.56, lng: 151.95 },
  townsville: { name: "Townsville", state: "QLD", lat: -19.26, lng: 146.82 },
  wagga: { name: "Wagga Wagga", state: "NSW", lat: -35.11, lng: 147.37 },
  warrnambool: { name: "Warrnambool", state: "VIC", lat: -38.38, lng: 142.48 },
  warwick: { name: "Warwick", state: "QLD", lat: -28.22, lng: 152.03 },
  whyalla: { name: "Whyalla", state: "SA", lat: -33.03, lng: 137.58 },
  wollongong: { name: "Wollongong", state: "NSW", lat: -34.43, lng: 150.89 },
  bathurst: { name: "Bathurst", state: "NSW", lat: -33.42, lng: 149.58 },
  burnie: { name: "Burnie", state: "TAS", lat: -41.05, lng: 145.91 },
  coffsHarbour: { name: "Coffs Harbour", state: "NSW", lat: -30.3, lng: 153.11 },
  gladstone: { name: "Gladstone", state: "QLD", lat: -23.85, lng: 151.26 },
  goldCoast: { name: "Gold Coast", state: "QLD", lat: -28, lng: 153.43 },
  herveyBay: { name: "Hervey Bay", state: "QLD", lat: -25.29, lng: 152.84 },
  lismore: { name: "Lismore", state: "NSW", lat: -28.81, lng: 153.28 },
  mandurah: { name: "Mandurah", state: "WA", lat: -32.53, lng: 115.72 },
  murrayBridge: { name: "Murray Bridge", state: "SA", lat: -35.12, lng: 139.27 },
  portHedland: { name: "Port Hedland", state: "WA", lat: -20.31, lng: 118.6 },
  shepparton: { name: "Shepparton", state: "VIC", lat: -36.38, lng: 145.4 },
  sunshineCoast: { name: "Sunshine Coast", state: "QLD", lat: -26.65, lng: 153.07 },
  tamworth: { name: "Tamworth", state: "NSW", lat: -31.09, lng: 150.93 },
  traralgon: { name: "Traralgon", state: "VIC", lat: -38.2, lng: 146.54 },
  palmerston: { name: "Palmerston", state: "NT", lat: -12.49, lng: 130.98 },
} satisfies Record<string, Town>;
export type TownId = keyof typeof TOWNS;

export type AtlasPlace = {
  town: TownId;
  topics: AtlasTopic[];
  /** What they'd happily talk through with someone. */
  canHelp?: AtlasTopic[];
  /** What they'd like a hand with. */
  askingAbout?: AtlasTopic[];
};

/** Where each Digital Member lives, by library id (content/digitalMembers.ts). */
export const ATLAS_PLACES: Record<string, AtlasPlace> = {
  // Your guide, on the road through central Queensland.
  ava: {
    town: "emerald",
    topics: ["Rural and remote", "Choice and control", "Hospital discharge"],
    canHelp: ["Rural and remote", "Choice and control"],
    askingAbout: ["Hospital discharge"],
  },

  // People we support
  dot: { town: "bendigo", topics: ["Choice and control", "Falls and safety at home", "Working with families"] },
  "mrs-patel": { town: "parramatta", topics: ["Invoices and quotes", "Falls and safety at home"] },
  "mr-brennan": { town: "ballarat", topics: ["Invoices and quotes", "Choice and control"] },
  "mrs-wong": { town: "hobart", topics: ["Clinical care at home", "Invoices and quotes"] },
  arthur: { town: "wagga", topics: ["Working with families", "Consent and privacy", "Rural and remote"] },
  "mrs-alvarez": { town: "mildura", topics: ["Falls and safety at home", "Choice and control", "Rural and remote"] },
  "mr-okoro": { town: "darwin", topics: ["Self-management", "Checks and compliance", "Choice and control"] },
  "mrs-pearce": { town: "launceston", topics: ["Falls and safety at home", "Working with families"] },
  "mr-haddad": { town: "wollongong", topics: ["Hospital discharge", "Choice and control", "Working with families"] },
  "mrs-lin": { town: "perth", topics: ["Self-management", "Consent and privacy", "Working with families"] },
  "mr-nguyen": { town: "rockhampton", topics: ["Hospital discharge", "Clinical care at home"] },
  "mrs-nguyen": { town: "cairns", topics: ["Consent and privacy", "Choice and control"] },
  "mr-okafor": { town: "adelaide", topics: ["Falls and safety at home", "Incidents and speaking up"] },
  "helen-park": { town: "canberra", topics: ["Incidents and speaking up", "Social connection"] },
  "margaret-alder": { town: "portMacquarie", topics: ["Invoices and quotes", "Incidents and speaking up"] },
  "tom-reyes": { town: "broome", topics: ["Incidents and speaking up", "Working with families", "Rural and remote"] },
  "iris-kennedy": { town: "aliceSprings", topics: ["Social connection", "Rural and remote"] },
  alan: { town: "geraldton", topics: ["Falls and safety at home", "Choice and control"] },
  bill: { town: "mountGambier", topics: ["Social connection", "Consent and privacy"] },
  joan: { town: "bundaberg", topics: ["Clinical care at home", "Hospital discharge"] },
  margaret: { town: "albury", topics: ["Choice and control", "Social connection"] },
  rosa: { town: "katherine", topics: ["Consent and privacy", "Rural and remote"] },
  "mr-brooks": { town: "townsville", topics: ["Invoices and quotes", "Choice and control"] },

  // Family
  fiona: {
    town: "melbourne",
    topics: ["Working with families", "Falls and safety at home"],
    canHelp: ["Working with families"],
    askingAbout: ["Falls and safety at home"],
  },
  chloe: {
    town: "orange",
    topics: ["Working with families", "Invoices and quotes", "Consent and privacy"],
    askingAbout: ["Invoices and quotes"],
  },
  karen: {
    town: "newcastle",
    topics: ["Incidents and speaking up", "Working with families"],
    askingAbout: ["Incidents and speaking up"],
  },

  // Business owners and managers. Maya's in Toowoomba, as in the Atlas brief.
  maya: {
    town: "toowoomba",
    topics: ["Growing a business", "Hospital discharge", "Checks and compliance"],
    canHelp: ["Hospital discharge"],
    askingAbout: ["Growing a business"],
  },

  // Coordinators, Care Partners and workers
  sam: {
    town: "brisbane",
    topics: ["Checks and compliance"],
    canHelp: ["Checks and compliance"],
  },
  "elena-marino": {
    town: "warrnambool",
    topics: ["Choice and control", "Working with families", "Rural and remote"],
    canHelp: ["Choice and control", "Working with families"],
    askingAbout: ["Rural and remote"],
  },
  "mele-fonua": {
    town: "ipswich",
    topics: ["Hospital discharge", "Working with families", "Consent and privacy"],
    canHelp: ["Hospital discharge", "Consent and privacy"],
  },
  "nadia-costa": {
    town: "portLincoln",
    topics: ["Rural and remote", "Invoices and quotes"],
    canHelp: ["Invoices and quotes"],
    askingAbout: ["Rural and remote"],
  },
  "hana-mitchell": {
    town: "kalgoorlie",
    topics: ["Growing a business", "Checks and compliance", "Rural and remote"],
    canHelp: ["Checks and compliance"],
    askingAbout: ["Growing a business"],
  },
  "sione-taufa": {
    town: "mackay",
    topics: ["Growing a business", "Social connection"],
    canHelp: ["Growing a business"],
  },
  "claire-hollis": {
    town: "warwick",
    topics: ["Clinical care at home", "Hospital discharge", "Falls and safety at home"],
    canHelp: ["Clinical care at home", "Hospital discharge"],
  },
  "ray-donnelly": {
    town: "devonport",
    topics: ["Falls and safety at home", "Incidents and speaking up"],
    canHelp: ["Falls and safety at home"],
  },
};

/** Where you can start "Near me" from: every town on the map, by state then name. No device location. */
export const START_TOWNS = (Object.entries(TOWNS) as [TownId, Town][]).sort(
  ([, a], [, b]) => STATES.indexOf(a.state) - STATES.indexOf(b.state) || a.name.localeCompare(b.name),
);

/** Kilometres between two towns, as the crow flies. */
export function kmBetween(a: Town, b: Town) {
  const rad = Math.PI / 180;
  const dLat = (b.lat - a.lat) * rad;
  const dLng = (b.lng - a.lng) * rad;
  const h = Math.sin(dLat / 2) ** 2 + Math.cos(a.lat * rad) * Math.cos(b.lat * rad) * Math.sin(dLng / 2) ** 2;
  return 2 * 6371 * Math.asin(Math.sqrt(h));
}

/** Why two people are shown together: the topics they share, and one helping where the other's asking. */
export function commonGround(a: AtlasPlace, b: AtlasPlace) {
  const shared = a.topics.filter((t) => b.topics.includes(t));
  const aHelpsB = (a.canHelp ?? []).filter((t) => (b.askingAbout ?? []).includes(t));
  const bHelpsA = (b.canHelp ?? []).filter((t) => (a.askingAbout ?? []).includes(t));
  return { shared, aHelpsB, bHelpsA, score: shared.length + 2 * (aHelpsB.length + bHelpsA.length) };
}
