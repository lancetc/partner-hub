/*
  The Community: Care Partners and coordinators across Australia learning from each other.
  Spaces to post in, a feed of posts and replies, events to join, a member directory with what
  each person is happy to be asked about, and a leaderboard of points earned when others like
  what you share. Everything here is demonstration content. Times are given as hours ago (posts)
  or days ahead (events) so the demo always looks current.
*/

export type SpaceId = "start" | "wins" | "ask" | "tips" | "clinical" | "home" | "coordinators";

export type Space = { id: SpaceId; name: string; emoji: string; blurb: string };

export const spaces: Space[] = [
  { id: "start", name: "Start here", emoji: "👋", blurb: "Say hello and read the community guidelines." },
  { id: "wins", name: "Wins & thank-yous", emoji: "🎉", blurb: "Good moments with clients, and shout-outs to people who helped." },
  { id: "ask", name: "Ask the community", emoji: "💬", blurb: "Stuck on something? Someone has probably been there." },
  { id: "tips", name: "Tips & tools", emoji: "🧰", blurb: "Checklists, tricks and things that make visits easier." },
  { id: "clinical", name: "Clinical corner", emoji: "🩺", blurb: "Nurses, physios and OTs comparing notes." },
  { id: "home", name: "Home & garden", emoji: "🌿", blurb: "Cleaning, gardening, maintenance and modifications." },
  { id: "coordinators", name: "Coordinators' lounge", emoji: "☕", blurb: "Care coordinators sharing what works." },
];

export type Member = {
  id: string;
  name: string;
  role: string;
  region: string;
  joinedMonthsAgo: number;
  /** Points earned in the last 7 and 30 days, and in total. One point for each like on something you shared. */
  points: { week: number; month: number; all: number };
  bio: string;
  askMeAbout: string[];
  online?: boolean;
  /** The community team, who look after the space. */
  host?: boolean;
};

export const members: Member[] = [
  {
    id: "maya",
    name: "Maya Thompson",
    role: "Community host",
    region: "Brisbane, QLD",
    joinedMonthsAgo: 18,
    points: { week: 41, month: 160, all: 2240 },
    bio: "I look after the Community and the Partner Hub. Tell me what would make this space more useful.",
    askMeAbout: ["Using the Partner Hub", "Community events"],
    online: true,
    host: true,
  },
  {
    id: "priya",
    name: "Priya Raman",
    role: "Physiotherapist",
    region: "Ballarat, VIC",
    joinedMonthsAgo: 26,
    points: { week: 58, month: 212, all: 1890 },
    bio: "Home physio for 12 years. Falls prevention is my thing, and getting people back to the letterbox.",
    askMeAbout: ["Falls prevention", "Strength programs", "Mobility aids"],
    online: true,
  },
  {
    id: "dan",
    name: "Dan Kowalski",
    role: "Gardener and handyman",
    region: "Newcastle, NSW",
    joinedMonthsAgo: 14,
    points: { week: 37, month: 131, all: 1205 },
    bio: "Gardens, gutters, grab rails. If it's outside or screwed to a wall, I've probably fixed one.",
    askMeAbout: ["Raised garden beds", "Grab rails", "Summer garden prep"],
  },
  {
    id: "grace",
    name: "Grace Liu",
    role: "Registered nurse",
    region: "Hobart, TAS",
    joinedMonthsAgo: 31,
    points: { week: 33, month: 148, all: 1760 },
    bio: "Community nurse. Wounds, medication and the conversations nobody else wants to have.",
    askMeAbout: ["Wound care", "Medication reviews", "Hard conversations"],
    online: true,
  },
  {
    id: "tom",
    name: "Tom Fraser",
    role: "Care coordinator",
    region: "Geelong, VIC",
    joinedMonthsAgo: 22,
    points: { week: 29, month: 117, all: 1340 },
    bio: "Coordinator for about 90 clients. Spreadsheets by day, footy by night.",
    askMeAbout: ["Budgets and statements", "First 30 days with a new client"],
  },
  {
    id: "aroha",
    name: "Aroha Wiremu",
    role: "Occupational therapist",
    region: "Cairns, QLD",
    joinedMonthsAgo: 9,
    points: { week: 26, month: 95, all: 610 },
    bio: "OT keen on small changes that keep people independent: a stool in the shower, a rail by the step.",
    askMeAbout: ["Bathroom set-ups", "Home assessments", "Hot weather"],
    online: true,
  },
  {
    id: "sam",
    name: "Sam Okafor",
    role: "Cleaner",
    region: "Wollongong, NSW",
    joinedMonthsAgo: 11,
    points: { week: 22, month: 84, all: 540 },
    bio: "Domestic assistance across the Illawarra. I notice things, and I've learned to say something.",
    askMeAbout: ["Spotting changes early", "Hoarding and clutter"],
  },
  {
    id: "leanne",
    name: "Leanne Brooks",
    role: "Care coordinator",
    region: "Bunbury, WA",
    joinedMonthsAgo: 16,
    points: { week: 19, month: 77, all: 880 },
    bio: "Regional coordinator. Long drives, good podcasts and clients who keep me laughing.",
    askMeAbout: ["Regional and remote services", "Finding Care Partners"],
  },
  {
    id: "nick",
    name: "Nick Papadopoulos",
    role: "Podiatrist",
    region: "Adelaide, SA",
    joinedMonthsAgo: 7,
    points: { week: 15, month: 52, all: 310 },
    bio: "Feet first. Happy feet, fewer falls.",
    askMeAbout: ["Footwear", "Diabetic feet"],
  },
  {
    id: "jess",
    name: "Jess Nguyen",
    role: "Support worker",
    region: "Darwin, NT",
    joinedMonthsAgo: 2,
    points: { week: 12, month: 30, all: 30 },
    bio: "New to Trilogy and to aged care. Learning heaps. Ask me nothing yet!",
    askMeAbout: ["Being new"],
    online: true,
  },
  {
    id: "rob",
    name: "Rob Campbell",
    role: "Gardener",
    region: "Toowoomba, QLD",
    joinedMonthsAgo: 20,
    points: { week: 9, month: 44, all: 720 },
    bio: "Mowing, pruning, a chat over the fence.",
    askMeAbout: ["Low-maintenance gardens", "Storm clean-ups"],
  },
  {
    id: "mei",
    name: "Mei Chen",
    role: "Dietitian",
    region: "Canberra, ACT",
    joinedMonthsAgo: 5,
    points: { week: 8, month: 39, all: 205 },
    bio: "Food is medicine, and also joy. I help people eat well at home.",
    askMeAbout: ["Unplanned weight loss", "Texture-modified meals"],
  },
];

export type Comment = { id: string; authorId: string; hoursAgo: number; body: string; likes: number };

export type Post = {
  id: string;
  space: SpaceId;
  authorId: string;
  hoursAgo: number;
  title: string;
  body: string;
  likes: number;
  comments: Comment[];
  pinned?: boolean;
  poll?: { options: { id: string; label: string; votes: number }[] };
};

export const posts: Post[] = [
  {
    id: "welcome",
    space: "start",
    authorId: "maya",
    hoursAgo: 24 * 20,
    pinned: true,
    title: "Welcome to the Community! Start here 👋",
    body: "This is a space for Care Partners and coordinators to learn from each other. Introduce yourself below: what you do, where you work, and one thing you're good at.\n\nThree guidelines: be kind; protect client privacy (no names, addresses or photos of clients); and this isn't the place for anything urgent. If a client is unwell or unsafe, call their coordinator or the care line straight away.",
    likes: 96,
    comments: [
      { id: "w1", authorId: "jess", hoursAgo: 30, body: "Hi everyone! Jess from Darwin, two months in. Everyone's been so welcoming.", likes: 14 },
      { id: "w2", authorId: "priya", hoursAgo: 28, body: "Welcome Jess! Shout if you ever want a hand with transfers or mobility questions.", likes: 9 },
    ],
  },
  {
    id: "letterbox",
    space: "wins",
    authorId: "priya",
    hoursAgo: 3,
    title: "She walked to the letterbox 🎉",
    body: "Six months ago one of my clients couldn't get to the front door without her frame and a rest. Today she walked to the letterbox and back, collected her own mail, and told me the gas bill was a disgrace. Twelve weeks of sit-to-stands and a lot of stubbornness, mostly hers.",
    likes: 47,
    comments: [
      { id: "l1", authorId: "grace", hoursAgo: 2, body: "This made my day. The complaining about the bill is the best part.", likes: 11 },
      { id: "l2", authorId: "tom", hoursAgo: 2, body: "Love it. Mind if I share this (no details) with her family at the next review?", likes: 4 },
      { id: "l3", authorId: "priya", hoursAgo: 1, body: "@Tom of course, she'd love that.", likes: 3 },
    ],
  },
  {
    id: "shower",
    space: "ask",
    authorId: "sam",
    hoursAgo: 6,
    title: "Client keeps saying no to showers. What's worked for you?",
    body: "I'm not doing personal care, but I'm there twice a week and I can tell it's been a while. Her coordinator knows. Has anyone found a gentle way to help someone feel OK about it again?",
    likes: 23,
    comments: [
      {
        id: "s1",
        authorId: "aroha",
        hoursAgo: 5,
        body: "Often it's fear of falling or the cold, not the shower itself. A shower chair, a warm bathroom and a towel ready to wrap in can change everything. Worth asking for an OT visit.",
        likes: 18,
      },
      {
        id: "s2",
        authorId: "grace",
        hoursAgo: 4,
        body: "Agree with Aroha. Also check for pain, and whether a 'wash' at the basin feels less daunting to start with. Small steps.",
        likes: 12,
      },
      { id: "s3", authorId: "sam", hoursAgo: 3, body: "Thank you both, I'll mention the OT idea to her coordinator today.", likes: 5 },
    ],
  },
  {
    id: "heat",
    space: "tips",
    authorId: "aroha",
    hoursAgo: 20,
    title: "My hot weather checklist for summer visits ☀️",
    body: "Summer's nearly here up north. Before a hot day I check:\n• Is the fan or air con working, and do they know how to use it?\n• Water within reach, and something they like to drink\n• Curtains drawn on the hot side by mid-morning\n• Medications that need keeping cool\n• Someone checking in on the hottest afternoons\n\nWhat would you add?",
    likes: 39,
    comments: [
      { id: "h1", authorId: "mei", hoursAgo: 18, body: "Ice blocks and fruit count as fluids, and are much easier to say yes to than another glass of water.", likes: 15 },
      { id: "h2", authorId: "dan", hoursAgo: 16, body: "Get the air con filters cleaned before December. Half the 'broken' units I see are just clogged.", likes: 13 },
    ],
  },
  {
    id: "icebreaker",
    space: "start",
    authorId: "maya",
    hoursAgo: 28,
    title: "Quick poll: your go-to way to break the ice on a first visit?",
    body: "We're putting together tips for new Care Partners. Vote, then tell us your best line in the comments.",
    likes: 31,
    poll: {
      options: [
        { id: "photos", label: "Ask about the photos on the wall", votes: 64 },
        { id: "garden", label: "Compliment the garden", votes: 29 },
        { id: "cuppa", label: "Accept the cuppa, always", votes: 51 },
        { id: "pets", label: "Say hello to the pet first", votes: 22 },
      ],
    },
    comments: [{ id: "i1", authorId: "rob", hoursAgo: 26, body: "Pets first. The dog decides whether you're coming back.", likes: 17 }],
  },
  {
    id: "garden-beds",
    space: "home",
    authorId: "dan",
    hoursAgo: 46,
    title: "Raised beds at wheelchair height",
    body: "Built two raised beds for a client who'd given up on her veggie patch after moving to a wheelchair. 750 mm high with a lip to rest her arms on, and room underneath for her knees. First tomatoes are in. Happy to share the measurements if anyone's planning one.",
    likes: 34,
    comments: [
      { id: "g1", authorId: "aroha", hoursAgo: 40, body: "The knee clearance is the bit everyone forgets. Beautiful work.", likes: 8 },
      { id: "g2", authorId: "leanne", hoursAgo: 38, body: "Yes please on the measurements! I have a client in Busselton who'd love this.", likes: 6 },
    ],
  },
  {
    id: "weight",
    space: "clinical",
    authorId: "mei",
    hoursAgo: 52,
    title: "Unplanned weight loss: the signs anyone can notice",
    body: "You don't need scales to spot it. Watch for loose rings, belts on a new notch, clothes hanging differently, a fridge with the same food in it week after week. If you notice any of these, tell the coordinator. It's one of the earliest signs something's changed.",
    likes: 28,
    comments: [
      { id: "m1", authorId: "sam", hoursAgo: 50, body: "The fridge one is so true. I see it before anyone else does.", likes: 9 },
    ],
  },
  {
    id: "first-30",
    space: "coordinators",
    authorId: "tom",
    hoursAgo: 70,
    title: "What do you do in the first 30 days with a new client?",
    body: "I'm rewriting my own checklist. Mine includes a call in week one just to ask how it's going, and making sure they know who to call for what. What's on yours?",
    likes: 19,
    comments: [
      { id: "f1", authorId: "leanne", hoursAgo: 66, body: "A fridge magnet with my number on it. Sounds silly, gets used constantly.", likes: 11 },
      { id: "f2", authorId: "maya", hoursAgo: 60, body: "We're running a roundtable on exactly this. See Events!", likes: 4 },
    ],
  },
  {
    id: "thanks-nick",
    space: "wins",
    authorId: "leanne",
    hoursAgo: 96,
    title: "Shout-out to Nick 👏",
    body: "Nick spent half an hour on the phone helping a podiatrist in our region with footwear advice for a client with diabetes. Didn't have to, just did. This is what the community is for.",
    likes: 26,
    comments: [{ id: "n1", authorId: "nick", hoursAgo: 90, body: "Happy to help anytime. Feet are my favourite topic, unfortunately for my family.", likes: 10 }],
  },
  {
    id: "new-jess",
    space: "ask",
    authorId: "jess",
    hoursAgo: 120,
    title: "What do you wish you'd known in your first month?",
    body: "Two months in. Loving it, but some days I'm not sure I'm doing it right. What's the one thing you'd tell your first-month self?",
    likes: 42,
    comments: [
      { id: "j1", authorId: "grace", hoursAgo: 118, body: "You're allowed to say 'I don't know, I'll find out'. Clients trust that more than a guess.", likes: 21 },
      { id: "j2", authorId: "rob", hoursAgo: 110, body: "Write it down before you leave the driveway. You won't remember at 5pm.", likes: 16 },
      { id: "j3", authorId: "priya", hoursAgo: 100, body: "The small talk is the work. That's how you notice when something's off.", likes: 19 },
    ],
  },
];

export type CommunityEvent = {
  id: string;
  title: string;
  host: string;
  /** Days from today, and the start time in Australian Eastern time (hours, 24-hour clock). */
  inDays: number;
  hour: number;
  minutes: number;
  where: string;
  blurb: string;
  going: number;
};

export const events: CommunityEvent[] = [
  {
    id: "cuppa",
    title: "Virtual cuppa: meet other Care Partners",
    host: "maya",
    inDays: 1,
    hour: 10,
    minutes: 30,
    where: "Online",
    blurb: "Thirty relaxed minutes to meet people doing the same work as you. Bring a cuppa.",
    going: 23,
  },
  {
    id: "falls",
    title: "Ask a physio: falls prevention at home",
    host: "priya",
    inDays: 4,
    hour: 12,
    minutes: 0,
    where: "Online",
    blurb: "Priya answers your questions, from loose rugs to getting up off the floor safely.",
    going: 41,
  },
  {
    id: "roundtable",
    title: "Coordinators' roundtable: the first 30 days",
    host: "tom",
    inDays: 8,
    hour: 14,
    minutes: 0,
    where: "Online",
    blurb: "Share your checklists for welcoming a new client, and steal the best ideas.",
    going: 17,
  },
  {
    id: "summer",
    title: "Working safely outdoors this summer",
    host: "dan",
    inDays: 13,
    hour: 7,
    minutes: 30,
    where: "Online",
    blurb: "Sun, heat and hydration for everyone who works outside. Early start, before it gets hot.",
    going: 12,
  },
];

/** Everyone in the community. The directory shows the most active members. */
export const COMMUNITY_SIZE = 1248;

export const memberById = (id: string) => members.find((m) => m.id === id);

/** Points needed to reach each level: the first few come quickly, the top ones take years. */
export const LEVELS = [0, 5, 20, 65, 155, 515, 2015, 8015, 33015];

export function levelFor(points: number) {
  let level = 1;
  for (let i = 0; i < LEVELS.length; i++) if (points >= LEVELS[i]) level = i + 1;
  const next = LEVELS[level];
  return { level, next: next ?? null, toNext: next === undefined ? 0 : next - points };
}

/** "Just now", "5m", "3h", "2d", "3w": short, as feeds show it. */
export function ago(hours: number) {
  if (hours < 1 / 60) return "Just now";
  if (hours < 1) return `${Math.round(hours * 60)}m`;
  if (hours < 24) return `${Math.round(hours)}h`;
  if (hours < 24 * 7) return `${Math.round(hours / 24)}d`;
  return `${Math.round(hours / 24 / 7)}w`;
}

export const initials = (name: string) =>
  name
    .split(/\s+/)
    .filter(Boolean)
    .map((w) => w[0])
    .slice(0, 2)
    .join("")
    .toUpperCase();

const AVATAR = ["#008282", "#c7393e", "#3cb8b9", "#b8772a", "#2d4875", "#7a4fa3"];
/** The same colour for a person every time. */
export function avatarColour(id: string) {
  let h = 0;
  for (const c of id) h = (h * 31 + c.charCodeAt(0)) >>> 0;
  return AVATAR[h % AVATAR.length];
}

/** "Top": most engaged recently, weighting comments over likes and fading with age. Pinned posts stay first either way. */
export function sortPosts<T extends { hoursAgo: number; likes: number; comments: unknown[]; pinned?: boolean }>(list: T[], by: "latest" | "top") {
  const score = (p: T) => (p.likes + 3 * p.comments.length) / Math.pow(p.hoursAgo + 2, 0.8);
  return [...list].sort((a, b) => Number(Boolean(b.pinned)) - Number(Boolean(a.pinned)) || (by === "latest" ? a.hoursAgo - b.hoursAgo : score(b) - score(a)));
}
