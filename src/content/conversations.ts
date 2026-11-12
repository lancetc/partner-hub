/*
  Care Conversations: a deck of conversation cards for Care Partners, coordinators and Trilogy staff.
  Not a quiz: there's no right answer and no score. Draw a card, think about the question, flip it for
  a deeper one, then reflect privately, talk it over as a team, or share a perspective with the community.

  48 original cards in six themes (eight each). Each card has a question on the front and a follow-up
  on the back. The community responses are demonstration content, written as if from members of the
  Community (content/community.ts).
*/

export type ThemeId = "person" | "empathy" | "risk" | "communication" | "problems" | "celebrate";

export type Theme = { id: ThemeId; name: string; blurb: string; colour: string; ink: string; emoji: string };

export const themes: Theme[] = [
  { id: "person", name: "Person-centred care", blurb: "Seeing the person, their home and their way of doing things.", colour: "#008282", ink: "#ffffff", emoji: "🏡" },
  { id: "empathy", name: "Empathy", blurb: "Understanding what someone else is feeling, and looking after yourself too.", colour: "#c7393e", ink: "#ffffff", emoji: "💛" },
  { id: "risk", name: "Dignity of risk", blurb: "Respecting people's right to make their own choices, including risky ones.", colour: "#fab53d", ink: "#102a43", emoji: "⚖️" },
  { id: "communication", name: "Communication", blurb: "Saying hard things kindly, and checking you've been understood.", colour: "#3cb8b9", ink: "#102a43", emoji: "💬" },
  { id: "problems", name: "Problem solving", blurb: "Working through the tricky situations that don't come with a script.", colour: "#2d4875", ink: "#ffffff", emoji: "🧩" },
  { id: "celebrate", name: "Celebrating care", blurb: "Noticing what's going well, and the people who make it happen.", colour: "#7a4fa3", ink: "#ffffff", emoji: "🎉" },
];

export type ConversationCard = { id: string; theme: ThemeId; question: string; deeper: string };

const deck: Record<ThemeId, [string, string][]> = {
  person: [
    ["Think of a client whose routine surprised you. What did you learn when you asked why it mattered to them?", "How did knowing their reason change the way you supported them?"],
    ["What's one small thing you do on every visit that says “this is your home, not my workplace”?", "What would someone new need to know to do the same?"],
    ["When a family's wishes differ from the client's, whose voice do you hear first, and why?", "What helps you keep the client at the centre without shutting the family out?"],
    ["What has a client taught you about themselves that wasn't in any care plan?", "How could that knowledge reach the next person who supports them?"],
    ["What does a good day look like for one of your clients, in their words rather than yours?", "Which part of that good day can you influence?"],
    ["How do you find out what someone enjoyed before they needed support?", "How have you brought one of those interests back into their week?"],
    ["When have you slowed down so a client could do something for themselves?", "What did it cost you in time, and what did it give them?"],
    ["What question do you wish you'd asked a client sooner?", "What stops us asking the important questions early?"],
  ],
  empathy: [
    ["Think of a client who seemed difficult at first. What was going on for them that you understood later?", "What helped you see past the behaviour?"],
    ["How do you notice when a client is lonely, even when they say they're fine?", "What's one thing you've done about it that helped?"],
    ["When a client is grieving, what do you say, and what do you avoid saying?", "Who taught you that, or how did you learn it?"],
    ["What would it feel like to need help with something you've always done on your own?", "How does imagining that change the way you offer help?"],
    ["Describe a moment when listening helped more than doing.", "How do you tell when someone needs listening rather than fixing?"],
    ["How do you look after yourself after a visit that stays with you?", "What would you want a colleague to do for you after a day like that?"],
    ["When a client is angry with you, what helps you stay steady?", "What have you learned about what usually sits underneath the anger?"],
    ["How might a client from another culture or generation see your visit differently from how you see it?", "What have you changed after realising that?"],
  ],
  risk: [
    ["A client wants to keep climbing a ladder to clear their gutters. Where do you start the conversation?", "How do you balance their choice with their safety, and who else needs to know?"],
    ["What does the right to take risks mean to you, in someone's own home?", "Where does that right meet your duty of care?"],
    ["Think of a time a client chose something you wouldn't have chosen for them. How did you respond?", "Looking back, would you respond the same way?"],
    ["How do you tell the difference between a risk someone understands and one they don't?", "What would you do differently in each case?"],
    ["When has being overly cautious taken something important away from a client?", "What would a better balance have looked like?"],
    ["A client wants to keep driving and their family is worried. What would you ask first?", "Who should be part of the decision, and how do you keep the client in it?"],
    ["How do you record a client's informed choice so the next person understands it?", "What makes a note respectful as well as useful?"],
    ["What helps a client make a risky choice more safely, without taking the choice away?", "Share an example where a small change made a big difference."],
  ],
  communication: [
    ["How do you explain a change to someone's services so it doesn't feel like something is being taken away?", "Which words do you avoid, and what do you say instead?"],
    ["A client nods along, but you're not sure they've understood. What do you do?", "How do you check understanding without making them feel tested?"],
    ["How do you raise a concern with a coordinator so it's acted on, not just noted?", "What makes a handover clear?"],
    ["Think of a conversation about money that went well. What made it work?", "What would you tell someone who's dreading that conversation?"],
    ["How do you talk with a client who has hearing loss or memory changes?", "What's one technique you'd teach a new colleague?"],
    ["When you have to say no, how do you say it so the relationship stays strong?", "What do you offer alongside the no?"],
    ["What's the most useful question you ask at the start of a visit?", "Why does it work?"],
    ["How do you keep a family informed without breaching the client's privacy?", "Where have you found that line hardest to hold?"],
  ],
  problems: [
    ["A trusted worker and a client disagree about what help should be provided. How would you start resolving it?", "Whose perspectives do you need before anything is decided?"],
    ["You arrive and something doesn't feel right, but you can't name it. What do you do next?", "What have you learned to trust about that feeling?"],
    ["A client keeps cancelling visits at the last minute. What might be behind it?", "How would you find out without making them feel judged?"],
    ["A client's needs have clearly changed since their last assessment. What are your first three steps?", "Who do you bring in, and how quickly?"],
    ["Two services a client relies on keep clashing on timing. How would you sort it out?", "How do you keep the client's preferences ahead of everyone's convenience?"],
    ["A client asks you to do something that isn't in their plan. How do you respond in the moment?", "What happens after the visit?"],
    ["Think of a problem you solved with a creative, low-cost idea. What was it?", "How could others use the same idea?"],
    ["When something is beyond your role, how do you hand it on without the client feeling passed around?", "What does a good warm handover sound like?"],
  ],
  celebrate: [
    ["What moment this month reminded you why you do this work?", "Who else played a part in that moment?"],
    ["Which colleague's work do you admire, and what do they do differently?", "Have you told them?"],
    ["What's a small win with a client that nobody else would notice?", "Why did it matter so much?"],
    ["What has a client said that has stayed with you?", "How has it changed the way you work?"],
    ["What skill have you got better at in the last year?", "What helped you grow it?"],
    ["Describe a time teamwork made something possible for a client.", "What made that team work so well?"],
    ["What does a great day at work look like for you?", "What's one thing that would make more days like that?"],
    ["If you could thank one client for something they taught you, what would you say?", "What would you want a new starter to learn from them?"],
  ],
};

export const cards: ConversationCard[] = themes.flatMap((t) => deck[t.id].map(([question, deeper], i) => ({ id: `${t.id}-${i + 1}`, theme: t.id, question, deeper })));

export const themeOf = (id: ThemeId) => themes.find((t) => t.id === id)!;
export const cardById = (id: string) => cards.find((c) => c.id === id);

/** Perspectives shared by community members on some cards (demonstration content). Member ids are from content/community.ts. */
export type SharedPerspective = { id: string; cardId: string; memberId: string; text: string; appreciations: number; daysAgo: number };

export const perspectives: SharedPerspective[] = [
  {
    id: "p1",
    cardId: "problems-1",
    memberId: "tom",
    text: "I start by talking to each of them separately. Nine times out of ten they want the same thing for the client and just disagree on how. Then one conversation together, with the client leading.",
    appreciations: 14,
    daysAgo: 2,
  },
  {
    id: "p2",
    cardId: "problems-1",
    memberId: "grace",
    text: "Ask the client what a good outcome looks like before anyone suggests a solution. It takes the heat out of it.",
    appreciations: 9,
    daysAgo: 3,
  },
  {
    id: "p3",
    cardId: "risk-1",
    memberId: "dan",
    text: "I don't lead with “you shouldn't”. I ask what they're worried will happen if the gutters aren't cleared. Usually it's storms. Then we talk about other ways to get that job done.",
    appreciations: 21,
    daysAgo: 5,
  },
  {
    id: "p4",
    cardId: "empathy-2",
    memberId: "sam",
    text: "The TV is on but nobody's watching it. Two cups on the drying rack when only one person lives there. Little things.",
    appreciations: 17,
    daysAgo: 1,
  },
  {
    id: "p5",
    cardId: "person-2",
    memberId: "aroha",
    text: "I knock and wait to be invited in, even when I have a key. Every single time.",
    appreciations: 25,
    daysAgo: 4,
  },
  {
    id: "p6",
    cardId: "celebrate-1",
    memberId: "priya",
    text: "A client walking to her letterbox after six months. She complained about the gas bill and I nearly cried.",
    appreciations: 31,
    daysAgo: 1,
  },
  {
    id: "p7",
    cardId: "communication-2",
    memberId: "leanne",
    text: "I ask them to tell me what they'll say to their daughter about it tonight. If they can explain it, they've got it.",
    appreciations: 12,
    daysAgo: 6,
  },
];

/** The ISO week number, used to pick the community's card of the week. */
export function isoWeek(d: Date) {
  const t = new Date(Date.UTC(d.getFullYear(), d.getMonth(), d.getDate()));
  const day = t.getUTCDay() || 7;
  t.setUTCDate(t.getUTCDate() + 4 - day);
  const yearStart = new Date(Date.UTC(t.getUTCFullYear(), 0, 1));
  return Math.ceil(((t.getTime() - yearStart.getTime()) / 86_400_000 + 1) / 7);
}

/** One card for the whole community each week, the same for everyone, working through the deck in a fixed spread-out order. */
export function cardOfTheWeek(d: Date) {
  const n = (isoWeek(d) + d.getFullYear() * 53) % cards.length;
  // Step through the deck 13 at a time: 13 and 48 share no factors, so every card comes up, and a step of
  // more than one theme's eight cards means consecutive weeks always change theme.
  return cards[(n * 13) % cards.length];
}

/** A shuffled copy, the same for the same seed (so a team session shows everyone the same order). */
export function shuffled<T>(list: T[], seed: number) {
  const out = [...list];
  let s = seed >>> 0 || 1;
  const rand = () => {
    // mulberry32
    s = (s + 0x6d2b79f5) >>> 0;
    let x = Math.imul(s ^ (s >>> 15), 1 | s);
    x = (x + Math.imul(x ^ (x >>> 7), 61 | x)) ^ x;
    return ((x ^ (x >>> 14)) >>> 0) / 4294967296;
  };
  for (let i = out.length - 1; i > 0; i--) {
    const j = Math.floor(rand() * (i + 1));
    [out[i], out[j]] = [out[j], out[i]];
  }
  return out;
}

/** The cards to play: one theme, or all of them. */
export const deckFor = (theme: ThemeId | "all") => (theme === "all" ? cards : cards.filter((c) => c.theme === theme));
