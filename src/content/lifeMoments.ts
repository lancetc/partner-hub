/*
  Life Moments demonstration content ("Meanwhile, in their lives…", docs/lives-in-progress.md). Seeded only on a demo
  Hub (a local development server, or HUB_LIVES_DEMO=1), with the demo arcs, and marked Demo.

  Every moment is timed against its member's demo arc: `day` and `hour` count from when the arc's current episode
  went out, so nothing is shared before the episode it depends on, and nothing hints at an episode still to come.
  Facts come from each member's Character Bible; anything new is listed in RECONCILE for an author. No voice
  message is recorded: learners read them until an author records one.
*/

export type DemoMoment = {
  id: string;
  memberId: string;
  /** The arc whose current episode anchors the dates. */
  arc: string;
  /** Story-linked: the episode it belongs to (by number in that arc). */
  episode?: number;
  day: number;
  hour?: number;
  status?: "draft" | "in_review" | "approved";
  category: string;
  headline: string;
  body?: string;
  quote?: string;
  audioScript?: string;
  action?: "story" | "chat";
  actionLabel?: string;
  opener?: string;
  /** When it happens, in days from the anchor, for upcoming events. */
  eventDay?: number;
  image?: string;
  imageAlt?: string;
  featured?: boolean;
  priority?: number;
  lifeEventId?: string;
  continuity: string;
  /** The Living Calendar: time of day, shown ahead as a teaser, tells followers, the routine it belongs to, who else shares it. */
  time?: string;
  showAhead?: boolean;
  teaser?: string;
  notify?: boolean;
  routineId?: string;
  alsoMembers?: string[];
  cast?: string[];
};

const A = "arc-alvarez-garden";
const M = "arc-alder-own-words";
const O = "arc-okafor-steady";

export const DEMO_MOMENTS: DemoMoment[] = [
  // ---------------- Mrs Alvarez (episode 3 is "now"; 1 and 2 were a week and two weeks ago) ----------------
  {
    id: "lm-alv-deadheading",
    memberId: "mrs-alvarez",
    arc: A,
    day: -12,
    hour: 2,
    category: "everyday",
    headline: "Mrs Alvarez spent the morning deadheading her roses",
    quote: "If you don’t take the old ones off, they stop trying. Same as people, really.",
    continuity: "Bible: in the garden most mornings; roses.",
  },
  {
    id: "lm-alv-husband",
    memberId: "mrs-alvarez",
    arc: A,
    day: -10,
    hour: 5,
    category: "reflection",
    headline: "A memory from the rose bed",
    body: "Mrs Alvarez found the old label her husband wrote for the first rose he planted.",
    quote: "His handwriting was terrible. I’ve kept it anyway.",
    continuity: "Balance Scale: her husband planted the roses. The label is new.",
  },
  {
    id: "lm-alv-petrakis",
    memberId: "mrs-alvarez",
    arc: A,
    day: -8,
    hour: 3,
    category: "checking_in",
    headline: "Mr Petrakis is after a cutting again",
    quote: "He asks every spring. I make him wait. It’s more fun that way.",
    continuity: "Cast: Mr Petrakis, neighbour, fond of a cutting.",
  },
  {
    id: "lm-alv-voice-walker",
    memberId: "mrs-alvarez",
    arc: A,
    episode: 2,
    day: -6,
    hour: 4,
    category: "voice",
    headline: "Mrs Alvarez has something to share",
    audioScript:
      "Hello, it’s me. Kylie asked me again about the walker today. She was kind about it, I’ll give her that. I told her what I tell everyone: it’s fine for the hallway. The garden is a different story.",
    continuity: "Episode 2: the walker stays inside; Kylie noticed.",
  },
  {
    id: "lm-alv-heat",
    memberId: "mrs-alvarez",
    arc: A,
    day: -4,
    hour: -2,
    category: "seasonal",
    headline: "Watering before the heat",
    body: "It’s going to be a warm one in Mildura, so Mrs Alvarez was out with the hose at six.",
    quote: "The roses and I agree: nothing important happens after eleven in summer.",
    lifeEventId: "le-heatwave",
    continuity: "Bible: gardens before the heat; Atlas town Mildura.",
  },
  {
    id: "lm-alv-sunday",
    memberId: "mrs-alvarez",
    arc: A,
    day: -3,
    hour: 6,
    category: "everyday",
    headline: "Isabel came for Sunday lunch",
    quote: "She brought a cake from the shop and pretended she made it. I let her.",
    continuity: "Isabel visits on weekends; episode 3’s diary says she came round on Sunday. Nothing about the wobble, which is today’s episode.",
  },
  {
    id: "lm-alv-afterwards",
    memberId: "mrs-alvarez",
    arc: A,
    episode: 3,
    day: 0,
    hour: 7,
    category: "follow_up",
    headline: "Mrs Alvarez is back in the garden this afternoon",
    body: "A cup of tea first, then the roses. She says she’s fine, and she’d like that noted.",
    action: "chat",
    actionLabel: "Ask how she’s feeling",
    opener: "How are you feeling after this morning?",
    continuity: "After episode 3 (the wobble by the gate).",
  },
  {
    id: "lm-alv-voice-roses",
    memberId: "mrs-alvarez",
    arc: A,
    episode: 3,
    day: 1,
    hour: 3,
    category: "voice",
    headline: "A voice message from Mrs Alvarez",
    audioScript:
      "Well. The roses don’t know anything happened, and I’m not going to tell them. Isabel rang twice today. Twice! I told her I’m standing in the garden talking to her, so clearly I’m still upright.",
    continuity: "After episode 3. Isabel is worried (episode 3).",
  },
  {
    id: "lm-alv-saturday",
    memberId: "mrs-alvarez",
    arc: A,
    day: 2,
    hour: 2,
    eventDay: 4,
    category: "upcoming",
    headline: "Isabel is coming on Saturday",
    quote: "She says she wants to talk. I’ll make the good coffee.",
    continuity: "Isabel visits on weekends. Says nothing about her plan (episode 4).",
  },
  {
    id: "lm-alv-paving",
    memberId: "mrs-alvarez",
    arc: A,
    episode: 4,
    day: 8,
    hour: 3,
    category: "think",
    headline: "There are paving brochures on Mrs Alvarez’s table",
    quote: "I haven’t thrown them out. I haven’t read them either.",
    continuity: "After episode 4 (Isabel’s brochures).",
  },
  {
    id: "lm-alv-seat",
    memberId: "mrs-alvarez",
    arc: A,
    episode: 5,
    day: 15,
    hour: 4,
    category: "good_news",
    headline: "The seat by the roses has arrived",
    quote: "It’s green. I wanted green. Isabel wanted beige. I won.",
    featured: true,
    continuity: "After episode 5 (the seat, the levelled gravel, the shoes).",
  },
  {
    id: "lm-alv-christmas",
    memberId: "mrs-alvarez",
    arc: A,
    day: 23,
    hour: 3,
    category: "seasonal",
    headline: "Roses for the Christmas table",
    quote: "Red ones, of course. My husband would have insisted.",
    status: "draft",
    continuity: "A draft for an author to finish.",
  },

  // ---------------- Margaret Alder (episode 3 is "now") ----------------
  {
    id: "lm-ald-knitting",
    memberId: "margaret-alder",
    arc: M,
    day: -13,
    hour: 5,
    category: "everyday",
    headline: "Margaret has started a new scarf",
    quote: "It’s for Dana, but don’t tell her. It’ll be ready by winter. Possibly next winter.",
    continuity: "Knitting is new (listed in the Bible to reconcile).",
  },
  {
    id: "lm-ald-hedges",
    memberId: "margaret-alder",
    arc: M,
    day: -11,
    hour: 6,
    category: "voice",
    headline: "Margaret has something to share",
    quote: "Two biscuits. He always says he hasn’t time.",
    audioScript:
      "Hello, it’s Margaret. Col finished the hedges this afternoon, and they look lovely. I made him sit down for a cup of tea. He says he hasn’t time, every single week, and every single week he has two biscuits.",
    continuity: "Episode 1: tea at three; Col the gardener.",
  },
  {
    id: "lm-ald-photos",
    memberId: "margaret-alder",
    arc: M,
    day: -9,
    hour: 4,
    category: "reflection",
    headline: "Margaret spent the afternoon looking through old photographs",
    quote: "Dana at five, with a gap in her teeth and a very serious face. She hasn’t changed.",
    continuity: "Bible: daughter Dana. The photographs are new.",
  },
  {
    id: "lm-ald-quiet",
    memberId: "margaret-alder",
    arc: M,
    episode: 2,
    day: -6,
    hour: 6,
    category: "checking_in",
    headline: "A quiet day at Margaret’s",
    body: "The kettle didn’t go on at three today.",
    continuity: "After episode 2 (not much like chatting). Says nothing about why.",
  },
  {
    id: "lm-ald-voice-dana",
    memberId: "margaret-alder",
    arc: M,
    episode: 3,
    day: 1,
    hour: 9,
    category: "voice",
    headline: "Margaret has recorded a short update",
    audioScript:
      "Dana rang again tonight. We had a proper talk, the two of us, for the first time in a while. I told her I was cross with her. Then I told her thank you. Both are true.",
    continuity: "After episode 3 (Dana rang the office).",
  },
  {
    id: "lm-ald-jasmine",
    memberId: "margaret-alder",
    arc: M,
    day: 3,
    hour: 5,
    category: "good_news",
    headline: "Col planted jasmine by the back door",
    quote: "He says it’ll smell lovely by Christmas. I said I’d hold him to that.",
    continuity: "Cast: Col. The jasmine is new.",
  },
  {
    id: "lm-ald-lighter",
    memberId: "margaret-alder",
    arc: M,
    episode: 4,
    day: 8,
    hour: 4,
    category: "follow_up",
    headline: "Margaret says she feels lighter",
    quote: "Telling it was the hard part. Now it’s told.",
    continuity: "After episode 4 (her own account).",
  },
  {
    id: "lm-ald-two-hours",
    memberId: "margaret-alder",
    arc: M,
    episode: 5,
    day: 15,
    hour: 2,
    category: "good_news",
    headline: "Cleaning day went well",
    quote: "Two hours, like it’s meant to be. And she had a cup of tea.",
    continuity: "After episode 5 (a new face on Thursday). Never says what the first cleaner did.",
  },
  {
    id: "lm-ald-cards",
    memberId: "margaret-alder",
    arc: M,
    day: 18,
    hour: 4,
    category: "seasonal",
    headline: "Margaret is writing her Christmas cards",
    quote: "Forty-one this year. I’ve never been one for a short list.",
    action: "chat",
    actionLabel: "Ask who’s on the list",
    opener: "Who’s on your Christmas card list this year?",
    continuity: "Everyday moment; no new facts beyond a fondness for cards.",
  },
  {
    id: "lm-ald-birthday",
    memberId: "margaret-alder",
    arc: M,
    day: 21,
    hour: 3,
    category: "celebration",
    headline: "It’s Dana’s birthday next week",
    quote: "I’ve finished the scarf. Mostly.",
    status: "in_review",
    continuity: "Dana’s birthday is new: needs approval before it becomes shared story.",
  },

  // ---------------- Mr Okafor (episode 4 is "now"; 1 to 3 were the three weeks before) ----------------
  {
    id: "lm-oka-radio",
    memberId: "mr-okafor",
    arc: O,
    day: -20,
    hour: 1,
    category: "everyday",
    headline: "Mr Okafor’s morning: the news, then his book",
    quote: "The news is mostly weather this week. A relief.",
    continuity: "Episode 1 and Spot the Hazard: radio and book by the bed.",
  },
  {
    id: "lm-oka-kitchen-radio",
    memberId: "mr-okafor",
    arc: O,
    day: -17,
    hour: 5,
    category: "reflection",
    headline: "A memory of another radio",
    quote: "My mother kept a radio in the kitchen too. She sang over the top of it, badly. I miss that noise.",
    continuity: "His mother is new (listed to reconcile).",
  },
  {
    id: "lm-oka-home",
    memberId: "mr-okafor",
    arc: O,
    episode: 2,
    day: -12,
    hour: 4,
    category: "voice",
    headline: "Mr Okafor is home and resting",
    quote: "My hip is complaining. I am ignoring it politely.",
    audioScript:
      "Good afternoon. I am home, and I am resting, as I have been told to. My hip is complaining. I am ignoring it politely. Emeka has rung three times today. I have answered twice.",
    continuity: "After episode 2 (the fall; home the same day).",
  },
  {
    id: "lm-oka-emeka-calls",
    memberId: "mr-okafor",
    arc: O,
    day: -10,
    hour: 7,
    category: "changing",
    headline: "Emeka is calling twice a day now",
    quote: "Morning and night, like medicine. I tell him I am fine. He calls anyway. He is a good son.",
    continuity: "Cast: Emeka phones often.",
  },
  {
    id: "lm-oka-remote",
    memberId: "mr-okafor",
    arc: O,
    episode: 3,
    day: -5,
    hour: 5,
    category: "everyday",
    headline: "Mr Okafor has worked out the bed’s remote. Mostly.",
    quote: "Up, down, and once, by accident, both ends at once. I looked like a sandwich.",
    continuity: "After episode 3 (the hired bed).",
  },
  {
    id: "lm-oka-tip",
    memberId: "mr-okafor",
    arc: O,
    episode: 4,
    day: 2,
    hour: 3,
    category: "follow_up",
    headline: "The new rubber foot for his frame has arrived",
    quote: "Ben fitted it and showed me. I checked it myself afterwards. Old habits.",
    continuity: "After episode 4 (the worn frame tip was reported).",
  },
  {
    id: "lm-oka-sunday",
    memberId: "mr-okafor",
    arc: O,
    day: 3,
    hour: 2,
    eventDay: 4,
    category: "upcoming",
    headline: "Emeka is visiting on Sunday",
    quote: "He says he will cook. I have hidden the good knives.",
    continuity: "Cast: Emeka visits on Sundays.",
  },
  {
    id: "lm-oka-voice-metres",
    memberId: "mr-okafor",
    arc: O,
    episode: 5,
    day: 9,
    hour: 4,
    category: "voice",
    headline: "A voice message from Mr Okafor",
    audioScript: "Good afternoon. Eleven metres today, with the frame, and Ben beside me. The letterbox is fifteen. I am not in a hurry. But I am counting.",
    featured: true,
    continuity: "After episode 5 (the letterbox goal).",
  },
  {
    id: "lm-oka-library",
    memberId: "mr-okafor",
    arc: O,
    day: 12,
    hour: 3,
    category: "everyday",
    headline: "A new library book for Mr Okafor",
    quote: "Emeka brought me a thick one. I think it is a hint that I should sit down more.",
    status: "approved",
    continuity: "Everyday moment, approved and waiting to be scheduled.",
  },
  {
    id: "lm-oka-greeting",
    memberId: "mr-okafor",
    arc: O,
    day: 16,
    hour: 3,
    category: "celebration",
    headline: "Mr Okafor’s grandson has finished school",
    quote: "The first in our family to finish here. I would like to tell everyone. I am telling you.",
    action: "chat",
    actionLabel: "Send your congratulations",
    opener: "Congratulations to your grandson!",
    status: "draft",
    continuity: "A grandson is new (the photos on his windowsill are of family). Draft: needs approval.",
  },
];

/** New details in the demo moments, for an author to accept or change. */
export const RECONCILE = [
  "Mrs Alvarez: the label her husband wrote for the first rose.",
  "Margaret Alder: knitting a scarf for Dana; old photographs; jasmine by the back door; forty-one Christmas cards; Dana’s birthday (in review).",
  "Mr Okafor: his mother’s kitchen radio; a grandson finishing school (draft).",
  "The PRD’s examples (Robert’s 85th birthday; Margaret’s grandson bringing groceries) aren’t used: no Robert exists, and Margaret Alder has no grandson in the Hub.",
];
