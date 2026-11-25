import type { Arc, Bible, CastMember, Episode, LifeEvent, LifeEventCategory } from "@/lib/livesInProgress";
import { emptyBible } from "@/lib/livesInProgress";

/*
  Lives in Progress demonstration content (docs/lives-in-progress.md). Seeded only on a demo Hub (a local
  development server, or HUB_LIVES_DEMO=1), never on Trilogy Care's servers unless someone sets that.

  Three existing Digital Members: Mrs Alvarez, Margaret Alder and Mr Okafor. Their Bibles are written from what the
  Hub already says about them (content/digitalMembers.ts, content/characters.ts, the Balance Scale, Spot the Signal,
  Red Pen and Spot the Hazard cases, the Community Atlas). Anything new is listed in the Bible's "reconcile" note for
  an author to accept or change; nothing here overwrites an established fact.

  Pictures are stand-ins from the image library, marked as placeholders, each with a note of what the real picture
  should show. No diary is recorded: an author records one from Admin → Lives in Progress, after approving the voice.

  The Life Event Bank (LIFE_EVENTS) is authoring material, not learner content, and is seeded on every Hub.
*/

const up = (file: string) => `/api/uploads/${file}`;

// Portraits already in the photo library, and stand-in scenes from the image library.
export const IMG = {
  alvarez: up("966ef4a0-357a-4401-8780-56bef1c80f34.webp"),
  alder: up("1c56f36c-8872-46ba-a80c-f5a726f36789.webp"),
  okafor: up("939a98e3-655e-4603-8277-82b9d1ba75ed.webp"),
  frontGate: up("3cf85f3a-345c-4736-b3af-c0c267e46580.webp"),
  walkerGarden: up("d26ae690-3c3f-4bf3-bf4f-8e555142adf8.webp"),
  kitchenCall: up("d91e77da-6269-48f3-90ca-777aaba36107.webp"),
  gardenPlan: up("b114e2ab-b344-4f01-b0f6-c03de0ddea49.webp"),
  fenceChat: up("dff8af44-a159-4e08-986c-4f2927d47b93.webp"),
  cuppa: up("33d75cb2-ee19-4f61-ae91-4eea77d0cb79.webp"),
  worriedPhone: up("b965803a-a988-4ea7-8d46-7136e336b4ee.webp"),
  phoneTable: up("27f9c2cd-a111-4ce7-b3c1-0b57279fcb4d.webp"),
  listening: up("264d2b68-21c3-4780-9bd9-612e0b46e89b.webp"),
  doorWave: up("c818c9d9-83e6-450e-bfd7-b069a643f3b9.webp"),
  outdoorTable: up("1b212eb4-9f04-401b-9b66-a22c53f18a2f.webp"),
  nurseNotes: up("aa95aa59-cb5e-41c0-9f1b-46551790e058.webp"),
  kitchenFrame: up("eb6e54e1-9d76-4915-b1b3-3f915bafa8ab.webp"),
  slidingDoor: up("c16e404c-5472-4117-8df0-5208df4e08d6.webp"),
  papers: up("373451b4-62b8-43fa-8def-e6a3bb971839.webp"),
  visitors: up("5d333d13-48cc-4e19-9a33-5794139275a2.webp"),
};

const bible = (fill: (b: Bible) => void): Bible => {
  const b = emptyBible();
  fill(b);
  return b;
};

// ---------------------------------------------------------------------------------------------
// Character Bibles
// ---------------------------------------------------------------------------------------------

export const DEMO_BIBLES: Record<string, Bible> = {
  "mrs-alvarez": bible((b) => {
    b.identity = {
      fullName: "Mrs Alvarez",
      preferredName: "Mrs Alvarez",
      age: "82",
      birthDate: "",
      pronouns: "she/her",
      culture: "Spanish heritage",
      location: "Mildura, Victoria",
      living: "Lives alone at home, with a front garden and a gravel path to the gate.",
    };
    b.history = {
      background: "",
      work: "",
      events: "A near miss on the uneven garden path, reported by her support worker.",
      family: "Her husband planted the roses. Her daughter, Isabel, visits on weekends.",
      relationships: "Her daughter Isabel; her weekly support worker Kylie; her neighbour Mr Petrakis.",
      achievements: "Her roses, which she has kept for decades.",
      careHistory:
        "A walker was recommended for moving around the house. An occupational therapist’s review of the path and outdoor aids was offered and she declined it for now; she may reconsider.",
    };
    b.personality = {
      traits: "Determined, warm, proud of her independence, quick to laugh.",
      communication: "Direct and lively. Says what she thinks, then offers you a cup of tea.",
      humour: "Teasing and a little dry, especially about getting old.",
      emotions: "Feels watched and ‘old’ when people fuss. Softens when someone asks what matters to her.",
      expressions: "“My garden, my way.” “I talk to them, you know. The roses.”",
      likes: "Roses, mornings in the garden, being asked rather than told.",
      dislikes: "The walker outdoors: it catches on the gravel and the neighbours watch.",
      values: "Doing things herself, in her own time. The garden as part of who she is.",
      frustrations: "Being treated as fragile. Plans made about her without her.",
      comforts: "The roses, the smell after watering, her daughter’s weekend visits.",
    };
    b.daily = {
      interests: "roses, gardening, her front garden",
      routines: "In the garden most mornings before the heat. Weekly support worker visit for domestic assistance.",
      social: "Her daughter at weekends; neighbours over the fence.",
      favourites: "Pruning, deadheading, watering at dawn.",
      goals: "Keep tending her roses, on her own terms.",
      independence: "Her garden and her own routine.",
      challenges: "The uneven gravel path; a walker that doesn’t suit outdoor ground.",
    };
    b.care = {
      arrangements: "Support at Home: a weekly support worker visit for domestic assistance, through her Care Partner.",
      health: "Uses a walker indoors as recommended. No diagnosis or new symptoms are part of her story.",
      preferences: "Asked, not told. Practical changes over restrictions.",
      network: "Daughter Isabel, support worker Kylie, her Care Partner, neighbour Mr Petrakis.",
      decisions: "She understands the risk of the garden path and accepts it. Her decision-making isn’t in question.",
      history: "After the near miss she chose a seat by the roses, levelled gravel by the gate and sturdier shoes.",
    };
    b.media = {
      portrait: IMG.alvarez,
      focus: "52% 40%",
      references: [IMG.alvarez],
      lifestyle: [IMG.walkerGarden, IMG.frontGate],
      voiceId: "openai:sage",
      voiceName: "Sage (OpenAI), as an 82-year-old woman",
      delivery:
        "An 82-year-old woman from Mildura, of Spanish heritage, talking about her own life: warm, lively and a little dry, unhurried and a little slower than usual, with natural pauses. Everyday Australian English with only the faintest trace of a Spanish lilt. Never theatrical, never frail, never a caricature.",
      visualGuide:
        "82, Spanish heritage, silver hair pinned back, gardening shirt, sun-touched skin, bright determined smile. A front garden of roses behind a gravel path, in a dry inland town.",
    };
    b.sources =
      "Introduction (content/digitalMembers.ts); character look (content/characters.ts); Balance Scale case “Mrs Alvarez and the garden” (content/balanceCases.ts); Community Atlas town (Mildura).";
    b.reconcile =
      "New in the demo, for an author to accept or change: her daughter’s name (Isabel), her support worker’s name (Kylie), and neighbour Mr Petrakis. The Balance Scale says her husband planted the roses and she lives alone; whether he has died isn’t established, so the demo never says. The PRD’s example has her daughter come round “yesterday” on a Wednesday; the Balance Scale says Isabel visits on weekends, so the demo says Sunday. Her introduction already tells the ending (the seat, the levelled gravel, the shoes): consider softening the About text while the arc runs. The Balance Scale’s “a week later she slips by the gate” is a practice consequence, not shared story, and the arc leaves it out.";
  }),

  "margaret-alder": bible((b) => {
    b.identity = {
      fullName: "Margaret Alder",
      preferredName: "Margaret (Mrs Alder to people she’s just met)",
      age: "Mid-eighties",
      birthDate: "",
      pronouns: "she/her",
      culture: "",
      location: "Port Macquarie, New South Wales",
      living: "Lives alone at home. Her daughter Dana doesn’t live with her.",
    };
    b.history = {
      background: "",
      work: "",
      events: "In November, an invoice showed six hours of cleaning when two were agreed, and there’s a withdrawal on her statement she can’t explain.",
      family: "Daughter Dana Alder, who rings and visits but lives elsewhere.",
      relationships: "Dana; her gardener, Col, who keeps the garden and notices things; her Care Partner.",
      achievements: "",
      careHistory: "Domestic assistance two hours a fortnight, from a cleaner engaged by her provider; a gardener.",
    };
    b.personality = {
      traits: "Gentle, sociable, polite to a fault; usually happy to chat.",
      communication: "Chatty and warm when she’s herself. Goes quiet and says “I’m fine” when she’s not.",
      humour: "Gentle, self-deprecating.",
      emotions: "Embarrassed easily; worries about being a bother and about losing her visits.",
      expressions: "“I’m fine, dear.” “I don’t want to make a fuss.”",
      likes: "A chat at the door, a cup of tea at three, her garden looking tidy.",
      dislikes: "Fuss. Feeling foolish.",
      values: "Politeness, trust, her own say.",
      frustrations: "Being talked about rather than talked to.",
      comforts: "Dana’s calls, a tidy kitchen, the garden from the window.",
    };
    b.daily = {
      interests: "tea and a chat, her garden, knitting",
      routines: "Tea at three. A fortnightly clean. The gardener’s visits.",
      social: "Dana’s calls; chats at the door with whoever comes.",
      favourites: "Chatting, the garden from the kitchen window.",
      goals: "To feel like herself again, and to keep her support.",
      independence: "Running her own home and her own money.",
      challenges: "Recently upset and withdrawn; worried about money and her visits.",
    };
    b.care = {
      arrangements: "Support at Home: domestic assistance two hours each fortnight, agreed with her and her Care Partner; a gardener.",
      health: "No health conditions are part of her story.",
      preferences: "Kind, unhurried people who explain things. Being asked before anything changes.",
      network: "Dana, her gardener Col, her Care Partner, her provider.",
      decisions: "It’s her account to give, if she wants to give it, at her pace. Who is with her when she does is her choice.",
      history: "Concerns about her cleaner were escalated to her provider on 20 November.",
    };
    b.media = {
      portrait: IMG.alder,
      focus: "50% 42%",
      references: [IMG.alder],
      lifestyle: [IMG.cuppa, IMG.phoneTable],
      voiceId: "openai:shimmer",
      voiceName: "Shimmer (OpenAI), as a woman in her mid-eighties",
      delivery:
        "A woman in her mid-eighties from Port Macquarie, talking about her own life: soft, polite and warm, a little slower than usual, with natural pauses and the odd gentle hesitation. Everyday Australian English. Quiet but never fragile, pitiful or theatrical.",
      visualGuide:
        "Mid-eighties, soft curled white hair, pearl earrings, knitted jumper, a gentle but tired expression. A neat coastal home with a garden she can see from the kitchen.",
    };
    b.sources =
      "Introduction (content/digitalMembers.ts); character look (content/characters.ts); Spot the Signal case “Money and pressure” (content/signalCases.ts); Community Atlas town (Port Macquarie).";
    b.reconcile =
      "New in the demo: her gardener’s name (Col), knitting as a pastime, and tea at three. The Spot the Signal case leaves open what the cleaner did: the demo never says, and the arc’s later episodes say only that a different cleaner comes while it’s looked into. Check that outcome with the Signal Room owners before scheduling episode 5. Episodes touch on financial abuse by a worker: keep them with a reviewer who knows SIRS.";
  }),

  "mr-okafor": bible((b) => {
    b.identity = {
      fullName: "Mr Okafor",
      preferredName: "Mr Okafor",
      age: "Early eighties",
      birthDate: "",
      pronouns: "he/him",
      culture: "Nigerian heritage",
      location: "Adelaide, South Australia",
      living: "Lives at home.",
    };
    b.history = {
      background: "",
      work: "",
      events: "Found sitting on the floor by his bed, unable to stand, with a sore left hip and unsure how long he’d been there.",
      family: "Family in the framed photos on his bedroom windowsill.",
      relationships: "His support worker Ben and his son Emeka (both new in the demo).",
      achievements: "",
      careHistory: "Since the fall: a hired height-adjustable bed, a shower commode and a walking frame.",
    };
    b.personality = {
      traits: "Calm, dignified, courteous, quietly stubborn.",
      communication: "Measured and polite. Asks for things to be explained.",
      humour: "Understated; a slow smile.",
      emotions: "Keeps worry to himself. Dislikes being hurried or talked over.",
      expressions: "“Tell me why, and I will do it.”",
      likes: "His radio, reading with his glasses on, the photos on the windowsill.",
      dislikes: "Fuss, being rushed, notes that don’t say what really happened.",
      values: "Dignity, honesty, doing things properly.",
      frustrations: "People deciding for him without explaining.",
      comforts: "The radio in the morning, his book, his family’s photos.",
    };
    b.daily = {
      interests: "the radio, reading, his family photos",
      routines: "The radio on first thing; reading in bed with his glasses.",
      social: "His son’s visits and calls.",
      favourites: "Listening to the radio; reading.",
      goals: "To get up and about safely, and walk to his letterbox again.",
      independence: "Getting himself up, in his own time, with the right equipment.",
      challenges: "Confidence after the fall; getting used to new equipment.",
    };
    b.care = {
      arrangements: "Support at Home: help to get up and shower.",
      health: "A sore left hip after the fall. No diagnosis is part of his story.",
      preferences: "Told what is happening and why, before anyone moves him or his things.",
      network: "Support worker Ben, his son Emeka, his coordinator.",
      decisions: "Chooses how he uses his equipment, once it’s explained.",
      history: "After the fall: a hired bed, a shower commode and a walking frame.",
    };
    b.media = {
      portrait: IMG.okafor,
      focus: "50% 36%",
      references: [IMG.okafor],
      lifestyle: [IMG.outdoorTable],
      voiceId: "openai:onyx",
      voiceName: "Onyx (OpenAI), as a man in his early eighties",
      delivery:
        "A man in his early eighties living in Adelaide, of Nigerian heritage, talking about his own life: deep, calm and measured, courteous and unhurried, a little slower than usual, with natural pauses and a slow smile in the voice. A light, natural Nigerian English accent, never exaggerated or a caricature. Never theatrical.",
      visualGuide:
        "Early eighties, Nigerian heritage, short white hair and beard, knitted vest over a shirt, calm and dignified. A tidy bedroom: radio and framed photos on the windowsill, glasses on a book.",
    };
    b.sources =
      "Introduction (content/digitalMembers.ts); character look (content/characters.ts); Red Pen case “Mr Okafor on the floor”; Spot the Hazard “Mr Okafor: before he gets up” (content/hazardScenes.ts); Community Atlas town (Adelaide).";
    b.reconcile =
      "Already inconsistent in the Hub: his introduction says he was found “one morning”; the Red Pen case says at a 2:00 pm visit. The demo says only that he was found on the floor. New in the demo: his son Emeka, his support worker Ben, and that he was checked over by paramedics and came home the same day (the existing cases don’t say what happened next). Episodes 6 and 7 are left in review and draft to show the workflow.";
  }),
};

// ---------------------------------------------------------------------------------------------
// Supporting cast
// ---------------------------------------------------------------------------------------------

type DemoCast = Omit<CastMember, "characterId"> & { characterId?: string };
export const DEMO_CAST: DemoCast[] = [
  {
    id: "alvarez-isabel",
    memberId: "mrs-alvarez",
    name: "Isabel",
    relation: "daughter",
    personality: "Loving, busy, a worrier. Organised; makes lists.",
    motivations: "Wants her mum safe, and is frightened of a phone call about a fall.",
    perspective: "Sees the garden as the danger, at first. Comes round when she sees her mum’s plan.",
    history: "Visits on weekends.",
  },
  {
    id: "alvarez-kylie",
    memberId: "mrs-alvarez",
    name: "Kylie",
    relation: "support worker",
    personality: "Cheerful, observant, practical.",
    motivations: "Wants Mrs Alvarez to keep her garden and stay on her feet.",
    perspective: "Reported the near miss because it was the right thing to do, not to take anything away.",
    history: "Visits weekly for domestic assistance.",
  },
  {
    id: "alvarez-petrakis",
    memberId: "mrs-alvarez",
    name: "Mr Petrakis",
    relation: "neighbour",
    personality: "Talkative, kind, fond of a cutting.",
    motivations: "Enjoys the chat over the fence.",
    perspective: "Thinks the roses are the best in the street and says so.",
    history: "Has lived next door for years.",
  },
  {
    id: "alder-dana",
    memberId: "margaret-alder",
    name: "Dana",
    relation: "daughter",
    personality: "Protective, quick to act, a bit sharp when she’s scared.",
    motivations: "Wants her mum safe and her money hers.",
    perspective: "Doesn’t live with her mum; hears things second-hand, which frightens her.",
    history: "Left the voicemail that brought the concerns together, on 20 November.",
  },
  {
    id: "alder-col",
    memberId: "margaret-alder",
    name: "Col",
    relation: "gardener",
    personality: "Quiet, steady, notices things.",
    motivations: "Likes Mrs Alder; didn’t like what he heard.",
    perspective: "Wrote down what he heard, word for word, and passed it on.",
    history: "Keeps her garden tidy.",
  },
  {
    id: "okafor-ben",
    memberId: "mr-okafor",
    name: "Ben",
    relation: "support worker",
    personality: "Calm, patient, explains before he does.",
    motivations: "Wants Mr Okafor up and about without another fall.",
    perspective: "Checks the bed brakes and the frame every time, and tells Mr Okafor why.",
    history: "Helps him get up and shower.",
  },
  {
    id: "okafor-emeka",
    memberId: "mr-okafor",
    name: "Emeka",
    relation: "son",
    personality: "Warm, anxious, phones often.",
    motivations: "Wants to know his father is all right without taking over.",
    perspective: "Would like more equipment and more visits than his father wants.",
    history: "Visits on Sundays.",
  },
];

// ---------------------------------------------------------------------------------------------
// The Life Event Bank: ordinary life as well as care, for any character
// ---------------------------------------------------------------------------------------------

type E = [id: string, category: LifeEventCategory, title: string, summary: string, themes: string[], sensitivity?: string];
const EVENTS: E[] = [
  [
    "unexpected-visit",
    "family",
    "A family member visits unexpectedly",
    "Someone turns up without warning, for good or bad reasons.",
    ["Family relationships", "Routines"],
  ],
  [
    "holiday-cover",
    "service",
    "A regular support worker goes on holiday",
    "A stand-in arrives who doesn’t know the routine.",
    ["Continuity of care", "Preferences"],
  ],
  [
    "declines-aid",
    "independence",
    "Declines a recommended mobility aid",
    "They say no to an aid someone has recommended.",
    ["Dignity of risk", "Choice and control"],
  ],
  ["birthday-coming", "positive", "A birthday is approaching", "A milestone birthday, and plans for how to mark it.", ["Person-centred care", "Connection"]],
  ["hobby-harder", "changing", "A favourite hobby becomes harder", "Something they love is getting harder to do.", ["Adapting support", "Identity"]],
  ["new-friend", "connection", "Makes a new friend", "A new friendship brightens the week.", ["Social connection", "Wellbeing"]],
  ["missed-appointment", "service", "A service appointment is missed", "Nobody comes, and nobody calls.", ["Service reliability", "Communication"]],
  ["budget-confusion", "money", "Confusing information about their budget", "A statement or letter doesn’t make sense to them.", ["Budgets", "Plain language"]],
  [
    "family-disagrees",
    "family",
    "A family member disagrees with a decision",
    "Someone close wants a different choice.",
    ["Supported decision-making", "Family"],
  ],
  ["achieves-goal", "positive", "Achieves a personal goal", "A goal they set themselves comes off.", ["Goals", "Celebrating progress"]],
  ["power-outage", "everyday", "A power outage on a hot day", "The fridge, the fan and the phone charger all stop.", ["Emergency planning", "Heat"]],
  ["new-recipe", "everyday", "Tries a new recipe", "Cooking something new, with mixed results.", ["Everyday life", "Independence"]],
  [
    "pet-sick",
    "everyday",
    "Their pet is unwell",
    "A trip to the vet, and worry about who’d look after the pet.",
    ["What matters", "Planning"],
    "Keep the pet’s outcome gentle.",
  ],
  ["grandchild-news", "positive", "Good news from a grandchild", "A wedding, a baby, a new job: news worth a phone call.", ["Connection", "Wellbeing"]],
  ["festival-food", "culture", "Preparing food for a cultural festival", "Cooking for a festival that matters to them.", ["Cultural preferences", "Identity"]],
  [
    "language-letter",
    "culture",
    "A letter that isn’t in their first language",
    "An official letter they’d rather read in their own language.",
    ["Interpreters", "Accessibility"],
  ],
  ["faith-day", "culture", "A day of faith clashes with a visit", "A visit is booked on a day they keep for worship.", ["Cultural respect", "Scheduling"]],
  ["volunteering", "community", "Starts volunteering", "They offer their skills at a local group.", ["Community participation", "Purpose"]],
  ["club-closes", "community", "A local club closes", "The group they’ve gone to for years shuts its doors.", ["Loneliness", "Finding new connections"]],
  ["bus-route-changes", "community", "The bus route changes", "The bus they rely on no longer stops nearby.", ["Transport", "Independence"]],
  [
    "quiet-christmas",
    "connection",
    "A quiet Christmas ahead",
    "Family are away for the holidays.",
    ["Loneliness", "Planning ahead"],
    "Avoid making loneliness the whole story.",
  ],
  ["phone-friend", "connection", "A weekly phone friend", "A call every Tuesday becomes the highlight of the week.", ["Social connection"]],
  ["neighbour-moves", "connection", "A neighbour moves away", "The person who checked in over the fence is leaving.", ["Informal support", "Change"]],
  ["near-miss", "health", "A near miss at home", "They nearly fall, but don’t.", ["Responding to incidents", "Falls"]],
  [
    "fall-at-home",
    "health",
    "A fall at home",
    "They fall and can’t get up for a while.",
    ["Incident response", "Clear notes"],
    "Don’t dramatise. Keep their dignity on the page.",
  ],
  ["new-equipment", "health", "New equipment arrives", "A bed, a frame or a rail they didn’t ask for.", ["Equipment", "Explaining why"]],
  ["hearing-aid", "health", "A new hearing aid", "Everything is suddenly too loud, then better.", ["Adjusting", "Communication"]],
  ["unexpected-bill", "money", "An unexpected bill", "A bill they weren’t expecting arrives.", ["Budgets", "Asking for help"]],
  [
    "invoice-wrong",
    "money",
    "An invoice doesn’t match the service",
    "More hours are charged than were agreed.",
    ["Invoice checks", "Financial abuse signals"],
    "Possible abuse: keep with a reviewer who knows SIRS.",
  ],
  ["scam-call", "money", "A scam phone call", "Someone rings claiming to be the bank.", ["Scams", "Speaking up"]],
  ["worker-change", "service", "A new support worker", "A new face, a new way of doing things.", ["Continuity", "Introductions"]],
  ["late-worker", "service", "The worker is late again", "Lateness becomes a pattern.", ["Service reliability", "Feedback"]],
  ["home-from-hospital", "transitions", "Home from hospital", "Coming home with new needs.", ["Discharge", "Handovers"]],
  ["respite-stay", "transitions", "A short respite stay", "A week away from home while a carer rests.", ["Respite", "Choice"]],
  ["moving-closer", "transitions", "Family suggest moving closer", "A suggestion to sell up and move nearer family.", ["Choice and control", "Family"]],
  ["more-help-needed", "changing", "Needs a little more help", "A task they managed alone now needs a hand.", ["Reviewing support", "Dignity"]],
  ["less-help-needed", "changing", "Needs less help than before", "Recovery means some support can stop.", ["Reablement", "Goals"]],
  [
    "driving-stops",
    "independence",
    "Stops driving",
    "The car keys go in the drawer.",
    ["Independence", "Transport"],
    "A real loss for many people: treat it as one.",
  ],
  ["says-no-shower", "independence", "Says not today to a shower", "They’d rather not, today.", ["Consent", "Respectful notes"]],
  ["first-smartphone", "positive", "Learns to video call", "A grandchild sets up the phone; the first call works.", ["Connection", "Digital skills"]],
  ["garden-prize", "positive", "Wins a prize at the local show", "Their roses, scones or quilt win a ribbon.", ["Achievement", "Identity"]],
  [
    "anniversary",
    "family",
    "A wedding anniversary",
    "A date that brings back memories, happy and sad.",
    ["Grief", "What matters"],
    "Can touch grief: let the person lead.",
  ],
  ["family-argument", "family", "Siblings argue about care", "Two adult children see things differently.", ["Family conflict", "The person’s voice"]],
  ["heatwave", "everyday", "A heatwave", "Days over forty, and the garden is suffering.", ["Heat planning", "Routines"]],
];

export const LIFE_EVENTS: LifeEvent[] = EVENTS.map(([id, category, title, summary, themes, sensitivity]) => ({
  id: `le-${id}`,
  title,
  category,
  summary,
  suits: category === "money" ? "Anyone managing a budget or bills" : "Anyone living at home with support",
  impact:
    category === "positive"
      ? "Lifts their week"
      : category === "everyday" || category === "culture"
        ? "Colour and texture"
        : "Unsettling, then a chance to adapt",
  themes,
  complications: "",
  cast: "",
  resolutions: "",
  sensitivity: sensitivity ?? "",
}));

// ---------------------------------------------------------------------------------------------
// Arcs and episodes
// ---------------------------------------------------------------------------------------------

/** A demo arc: dates are set from the day the demo is seeded, so there are past, current and upcoming episodes. */
export type DemoArc = Omit<Arc, "startDate" | "endDate"> & {
  /** Which episode is out on the day it's seeded. */
  currentNumber: number;
  episodes: (Omit<Episode, "publishAt" | "audio" | "reviewNote" | "status" | "arcId" | "memberId" | "id"> & { status?: Episode["status"] })[];
};

const ph = (hero: string, heroAlt: string, prompt: string, thumb = hero) => ({ hero, heroAlt, thumb, placeholder: true, prompt, focus: "" });
const talk = (id: string, label: string, body: string) => ({ id, kind: "conversation" as const, label, body, castId: "", options: [], thought: "", href: "" });
const view = (id: string, label: string, castId: string, body: string) => ({
  id,
  kind: "perspective" as const,
  label,
  body,
  castId,
  options: [],
  thought: "",
  href: "",
});
const reflect = (id: string, label: string, body: string, thought: string) => ({
  id,
  kind: "reflect" as const,
  label,
  body,
  castId: "",
  options: [],
  thought,
  href: "",
});
const learn = (id: string, label: string, body: string, href: string) => ({
  id,
  kind: "learn" as const,
  label,
  body,
  castId: "",
  options: [],
  thought: "",
  href,
});
const decide = (id: string, body: string, options: [string, string][]) => ({
  id,
  kind: "decide" as const,
  label: "What would you do?",
  body,
  castId: "",
  options: options.map(([text, response], i) => ({ id: `o${i + 1}`, text, response })),
  thought: "",
  href: "",
});

const CHOICE_COURSE = {
  kind: "magazine" as const,
  title: "What would you do? Two conversations about choice",
  href: "/magazine/what-would-you-do-two-conversations-about-choice",
};
const NOTICING = { kind: "topic" as const, title: "Noticing a change", href: "/topics/noticing-a-change" };
const HAZARD_COURSE = { kind: "magazine" as const, title: "Look before you help: spot the hazard", href: "/magazine/look-before-you-help-spot-the-hazard" };
const SIRS2 = {
  kind: "path" as const,
  title: "SIRS 2: Managing an incident from start to finish",
  href: "/discovery/lp-sirs-2-managing-an-incident-from-start-t",
};
const SIRS3 = {
  kind: "path" as const,
  title: "SIRS 3: Recognising and reporting incidents in home care",
  href: "/discovery/lp-sirs-3-recognising-and-reporting-inciden",
};

export const DEMO_ARCS: DemoArc[] = [
  // ---------------- Mrs Alvarez ----------------
  {
    id: "arc-alvarez-garden",
    memberId: "mrs-alvarez",
    title: "The Garden Is Still Mine",
    summary:
      "Over six weeks, Mrs Alvarez keeps tending her roses while her mobility changes and her daughter worries. A near miss on the gravel path tests everyone, and together they find practical changes that keep the garden hers.",
    starting: "Mrs Alvarez gardens most mornings. She uses her walker indoors but leaves it at the back door: it catches on the gravel.",
    theme: "Maintaining independence while responding to changing mobility and family concerns.",
    cast: ["alvarez-isabel", "alvarez-kylie", "alvarez-petrakis"],
    learning: [
      "Understanding the person",
      "Dignity of risk",
      "Responding to incidents",
      "Supported decision-making",
      "Person-centred problem-solving",
      "Balancing safety and independence",
    ],
    behaviour: "Ask what someone is trying to keep in their life before suggesting a restriction.",
    plannedEpisodes: 6,
    schedule: "Wednesdays, 9 am",
    resolution: "A seat by the roses, levelled gravel by the gate and sturdier shoes. The garden stays hers.",
    events: ["le-declines-aid", "le-near-miss", "le-family-disagrees", "le-achieves-goal"],
    primary: true,
    currentNumber: 3,
    episodes: [
      {
        number: 1,
        title: "Roses before breakfast",
        summary: "Meet Mrs Alvarez: her home, her garden and her love of roses.",
        story:
          "Mrs Alvarez is in the garden before the heat comes up, as she is most mornings. The roses along the front path are her pride, and she has opinions about every one of them.",
        dialogue: "My husband planted those roses. I talk to them, you know. Don’t laugh. They listen better than most people.",
        quote: "My husband planted those roses. I talk to them.",
        diary:
          "Good morning. It’s early, the sprinkler’s ticking and the roses are drinking it up. People ask why I bother at my age. I tell them: because it’s the best part of my day. I deadhead, I water, I have a little chat with them. My husband planted these. When I’m out here I don’t feel eighty-two. I feel like me.",
        media: ph(
          IMG.frontGate,
          "An older woman at her front gate on a sunny morning (a stand-in picture).",
          "Mrs Alvarez, 82, Spanish heritage, silver hair pinned back, in her front garden at dawn among roses, a gravel path to the gate, inland Victorian town light.",
        ),
        cast: ["alvarez-petrakis"],
        resources: [],
        interactions: [
          talk("i1", "Ask about the roses", "Which rose is your favourite, and why?"),
          reflect(
            "i2",
            "Reflect on the situation",
            "What does the garden give her that nothing else does?",
            "It’s not the flowers, really. It’s that I still look after something. Out there I’m not being looked after. I’m doing the looking after.",
          ),
          view(
            "i3",
            "Hear from her neighbour",
            "alvarez-petrakis",
            "Best roses in the street. I tell her every week. She pretends she doesn’t care what I think, then she gives me a cutting.",
          ),
        ],
        knowledge: "She has told learners about her roses, her husband planting them and her mornings in the garden.",
        outcomes: "",
        teaser: "Next week: the walker gets left at the back door.",
      },
      {
        number: 2,
        title: "The walker stays inside",
        summary: "Why she avoids her walker outdoors.",
        story:
          "Mrs Alvarez uses her walker around the house, as she agreed. But every morning it stays parked at the back door. Her support worker, Kylie, has noticed.",
        dialogue: "It catches on the gravel and I have to stare at my feet the whole time. And the neighbours watch. I feel old with it.",
        quote: "It catches on the gravel. And the neighbours watch.",
        diary:
          "Kylie saw the walker at the back door again today. She didn’t say anything, but she gave it a look. Here’s the thing. Inside, fine, I use it. Outside, the wheels dig into the gravel and I’m staring at my feet instead of my roses. And Mr Petrakis is over the fence. I feel like an old woman with it. I know I am an old woman. I just don’t want to feel like one in my own garden.",
        media: ph(
          IMG.walkerGarden,
          "An older woman with a walker at a garden bed (a stand-in picture).",
          "Mrs Alvarez at her back door, the walker parked beside it, looking out at the gravel path and roses. Morning light, a little defiant.",
        ),
        cast: ["alvarez-kylie"],
        resources: [CHOICE_COURSE],
        interactions: [
          decide("i1", "Kylie sees the walker parked at the back door while Mrs Alvarez heads out to the roses. If you were Kylie, what would you say?", [
            ["“You need to take the walker, Mrs Alvarez.”", "Do I now? I’ve been walking this path for forty years. I’ll thank you to let me decide that."],
            [
              "“What is it about the walker, out here?”",
              "Well, since you ask. It catches on the gravel, and I feel like everyone’s watching me with it. Sit down, I’ll tell you.",
            ],
            ["Say nothing and let it go.", "She didn’t say a word. I was glad, at the time. Later I thought: does nobody notice anything?"],
          ]),
          view(
            "i2",
            "Hear from Kylie",
            "alvarez-kylie",
            "I’m not there to take her garden off her. But I see the gravel by the gate and I see her feet. Somebody has to say something kindly.",
          ),
          talk("i3", "Have a conversation", "What would make the garden path easier for you?"),
        ],
        knowledge: "She has explained why the walker stays inside: it catches on the gravel and she feels watched and old with it.",
        outcomes: "",
        teaser: "Next week: a wobble on the path.",
      },
      {
        number: 3,
        title: "A little setback in the garden",
        summary: "A near miss in the garden.",
        story:
          "This morning, Mrs Alvarez nearly lost her balance on the gravel path on her way to the roses. Her daughter is worried, but Mrs Alvarez has some strong opinions about what should happen next.",
        dialogue: "I didn’t fall. I wobbled. There’s a difference, and I’d like everyone to remember it.",
        quote: "I didn’t fall. I wobbled. There’s a difference.",
        diary:
          "My daughter came round on Sunday and saw me struggling with the gravel. Now she’s talking about getting rid of the garden altogether. I know she means well, but those roses are part of who I am. This morning I had a wobble by the gate. I grabbed the post, I was fine. Kylie wrote it down, which is her job. But I won’t be told to sit inside and watch my garden through a window.",
        media: ph(
          IMG.alvarez,
          "Mrs Alvarez, smiling, silver hair pinned back.",
          "Mrs Alvarez at the gate post on the gravel path, a rose bush beside her, steadying herself, determined rather than frightened. Soft morning light.",
        ),
        cast: ["alvarez-isabel", "alvarez-kylie"],
        resources: [NOTICING, CHOICE_COURSE],
        interactions: [
          talk("i1", "Have a conversation", "How are you feeling after this morning?"),
          decide("i2", "Kylie has just seen Mrs Alvarez steady herself on the gate post. Nobody is hurt. What would you do first?", [
            [
              "Check she’s all right, and listen to what happened.",
              "She asked if I was all right before anything else. I liked that. Then she wanted to know exactly where I wobbled, which was fair.",
            ],
            ["Ring her daughter straight away.", "Before asking me? I was standing right there. I’d have told Isabel myself, thank you."],
            ["Tell her the garden isn’t safe any more.", "Not safe? It’s my garden. I’d rather have a word with the gravel."],
          ]),
          view(
            "i3",
            "Hear from her daughter",
            "alvarez-isabel",
            "Every time the phone rings I think it’s the call. Mum laughs it off. I just want her to be here for a long time.",
          ),
          learn("i4", "Continue learning", "Noticing a change: what to do when something shifts.", NOTICING.href),
        ],
        knowledge:
          "She nearly lost her balance on the gravel by the gate and steadied herself on the post. She wasn’t hurt. Kylie recorded it. Isabel saw her struggling with the gravel on Sunday and wants to get rid of the garden. Mrs Alvarez is firm that she won’t give the garden up.",
        outcomes: "A near miss was recorded by her support worker. No injury.",
        teaser: "Next week: Isabel has a plan, and her mum has opinions about it.",
      },
      {
        number: 4,
        title: "Isabel has other ideas",
        summary: "Her daughter suggests restricting gardening.",
        story: "Isabel arrives on Saturday with brochures for paving and a list. Mrs Alvarez puts the kettle on and prepares for an argument.",
        dialogue: "She’s my daughter and I love her. But it’s my life, and she’s not the one who gets to decide how much of it is left.",
        quote: "It’s my life. She doesn’t get to decide how much is left.",
        diary:
          "Isabel came with paving brochures. Paving! Over my roses. We had words. Then her voice cracked and I realised she wasn’t being bossy, she was scared. So I said: all right, you tell me what frightens you, and I’ll tell you what matters to me, and we’ll see where they meet. We didn’t finish. But we’re talking, which is something.",
        media: ph(
          IMG.kitchenCall,
          "A woman on a call in her kitchen with a photo of an older woman (a stand-in picture).",
          "Mrs Alvarez and her daughter Isabel, about fifty, at a kitchen table with paving brochures and two cups of tea. Tension softening.",
        ),
        cast: ["alvarez-isabel"],
        resources: [CHOICE_COURSE],
        interactions: [
          view(
            "i1",
            "Hear from Isabel",
            "alvarez-isabel",
            "I came with brochures because I didn’t know what else to bring. I think I wanted a plan more than I wanted paving.",
          ),
          decide("i2", "Isabel asks the Care Partner to ‘stop Mum gardening’. What would you say to Isabel?", [
            [
              "“It’s her decision, but let’s talk about what worries you.”",
              "Isabel told me what the Care Partner said. ‘Her decision, your worries, both matter.’ I could have kissed them.",
            ],
            ["“We’ll put a stop to it.”", "Behind my back? That would have been the end of my trust, I can tell you."],
            ["“That’s between you and your mum.”", "Well, it is. But it would have been nice if somebody helped us talk."],
          ]),
          talk("i3", "Have a conversation", "What would you like Isabel to understand?"),
        ],
        knowledge: "Isabel wants paving over the roses. They argued, then started talking about what frightens Isabel and what matters to her mum.",
        outcomes: "They agreed to talk it through with her Care Partner.",
        teaser: "Next week: a different kind of plan.",
      },
      {
        number: 5,
        title: "Finding another way",
        summary: "She explores alternatives with her support network.",
        story:
          "Her Care Partner sits with Mrs Alvarez, Isabel and a pot of tea. Instead of what she should stop, they talk about what would make the path work.",
        dialogue: "Make the path safer, not my life smaller. That’s all I’ve been saying for weeks.",
        quote: "Make the path safer, not my life smaller.",
        diary:
          "We made a list. A proper one, Isabel was pleased. A seat by the roses, so I can rest halfway. The gravel by the gate levelled out, where I wobbled. And shoes with a decent grip, which I’ll admit my old ones weren’t. They offered an OT to look at the path. Not yet, I said. Maybe later. It felt like my plan, not theirs.",
        media: ph(
          IMG.gardenPlan,
          "A gardener showing an older woman a plan in her front garden (a stand-in picture).",
          "Mrs Alvarez with her Care Partner and Isabel in the front garden, pointing at the gravel by the gate, a garden seat being measured.",
        ),
        cast: ["alvarez-isabel", "alvarez-kylie"],
        resources: [CHOICE_COURSE],
        interactions: [
          reflect(
            "i1",
            "Reflect on the situation",
            "What made this plan feel like hers?",
            "Nobody told me what I couldn’t do. They asked what I wanted to keep, and then we fixed the path around it.",
          ),
          talk("i2", "Have a conversation", "Which change are you happiest about?"),
        ],
        knowledge:
          "She chose a seat by the roses, levelled gravel by the gate and sturdier shoes. An OT review of the path was offered; she declined it for now and may reconsider.",
        outcomes:
          "Her plan: a seat by the roses, levelled gravel by the gate, sturdier shoes. OT review offered and declined for now. Her Care Partner will check in.",
        teaser: "Next week: something in the garden is ready.",
      },
      {
        number: 6,
        title: "The roses are blooming again",
        summary: "Practical changes let her keep enjoying her garden.",
        story: "The seat is in, the gravel by the gate is flat, and the roses have decided to put on a show.",
        dialogue: "I sat on my new seat this morning and had my tea with the roses. Isabel took a photo. She says I looked smug. I was.",
        quote: "I had my tea with the roses this morning.",
        diary:
          "The first big bloom of the season. I sat on my seat, I had my tea, I didn’t wobble once. Isabel sent the photo to everyone. Mr Petrakis came to the fence and said, see, best roses in the street. I told him not to sound so surprised.",
        media: ph(
          IMG.fenceChat,
          "Two neighbours chatting over a garden fence (a stand-in picture).",
          "Mrs Alvarez on a garden seat among roses in full bloom, a cup of tea, her neighbour smiling over the fence.",
        ),
        cast: ["alvarez-isabel", "alvarez-petrakis"],
        resources: [],
        interactions: [talk("i1", "Have a conversation", "How does it feel to be back in the garden?")],
        knowledge: "The changes are done and the roses are blooming. She’s gardening and happy.",
        outcomes: "The garden is hers. The plan is working.",
        teaser: "",
      },
    ],
  },

  // ---------------- Margaret Alder ----------------
  {
    id: "arc-alder-own-words",
    memberId: "margaret-alder",
    title: "In My Own Words",
    summary:
      "Margaret has always loved a chat. Lately she’s gone quiet. Over six weeks the people around her notice, listen, and make sure her account is heard and her support carries on, at her pace.",
    starting: "Margaret is chatty and sociable, with a fortnightly clean, a gardener and her daughter Dana on the phone.",
    theme: "Being believed and staying in charge after financial pressure from a worker.",
    cast: ["alder-dana", "alder-col"],
    learning: [
      "Noticing a change in someone",
      "Recognising financial abuse signals",
      "Escalating without waiting to be sure",
      "Letting the person tell it their way",
    ],
    behaviour: "If something feels off, ask, and pass it on, without waiting to be certain.",
    plannedEpisodes: 6,
    schedule: "Wednesdays, 9 am",
    resolution: "Margaret is chatting at the door again, with her support in place and her money in her own hands.",
    events: ["le-invoice-wrong", "le-worker-change", "le-phone-friend"],
    primary: true,
    currentNumber: 3,
    episodes: [
      {
        number: 1,
        title: "Tea at three",
        summary: "Meet Margaret: chatty, kind, and fond of a cup of tea at three.",
        story: "At three o’clock every day, Margaret puts the kettle on, whoever is around. Today it’s Col, her gardener, who’s just finished the hedges.",
        dialogue: "Sit down, dear, it’s three o’clock. I won’t have anyone working through tea.",
        quote: "Sit down, dear, it’s three o’clock.",
        diary:
          "Col did the hedges today and they look lovely. I made him sit for a cup of tea, he always says he hasn’t time and then has two biscuits. Dana rang on Sunday, she’s busy with work, but she always rings. I like my little routine. The house is quiet, but there’s always someone to have a chat with.",
        media: ph(
          IMG.cuppa,
          "A support worker sharing a cup of tea with an older woman (a stand-in picture).",
          "Margaret Alder, mid-eighties, soft curled white hair, pearl earrings, knitted jumper, pouring tea at her kitchen table, the garden through the window.",
        ),
        cast: ["alder-col"],
        resources: [],
        interactions: [
          talk("i1", "Have a conversation", "What do you like to chat about over tea?"),
          view("i2", "Hear from Col", "alder-col", "She makes me sit down for tea every time. I’ve given up arguing. Best part of the job, honestly."),
        ],
        knowledge: "She has shared her routine: tea at three, Col’s visits, Dana’s Sunday calls.",
        outcomes: "",
        teaser: "Next week: tea at three is a bit quieter.",
      },
      {
        number: 2,
        title: "Not much like chatting",
        summary: "Margaret goes quiet, and doesn’t say why.",
        story: "Col finishes the garden and the kettle doesn’t go on. Margaret says she’s fine. She just doesn’t feel much like chatting today.",
        dialogue: "I’m fine. I just don’t feel much like chatting today.",
        quote: "I just don’t feel much like chatting today.",
        diary:
          "I didn’t make tea today. Col looked at me as if I’d grown another head. I’m fine. I just don’t feel much like chatting. Some things are a bit muddled at the moment, and I don’t want to make a fuss about it. I’m sure it’ll sort itself out.",
        media: ph(
          IMG.worriedPhone,
          "An older woman with a concerned expression in her armchair (a stand-in picture).",
          "Margaret in her armchair, the teapot untouched on the side table, looking out of the window, a little withdrawn. Muted afternoon light.",
        ),
        cast: ["alder-col"],
        resources: [NOTICING],
        interactions: [
          reflect(
            "i1",
            "Reflect on the situation",
            "What might ‘I’m fine’ be covering?",
            "When you’re embarrassed, ‘I’m fine’ is the easiest thing to say. It doesn’t mean you want people to stop asking.",
          ),
          talk("i2", "Have a conversation", "You seem a bit quiet today. Is everything all right?"),
        ],
        knowledge: "She has been quiet and says she’s fine, but things feel muddled and she doesn’t want to make a fuss.",
        outcomes: "",
        teaser: "Next week: someone picks up the phone.",
      },
      {
        number: 3,
        title: "Dana rings the office",
        summary: "Dana’s call brings the worries together.",
        story:
          "Last Thursday, Dana left a message with Margaret’s provider: her mum had mentioned something about her bank card. Today, Margaret is embarrassed, and worried her visits might stop.",
        dialogue: "I didn’t want Dana to make a fuss. I thought if I kept quiet, everything would carry on as normal.",
        quote: "I thought if I kept quiet, everything would carry on as normal.",
        diary:
          "Dana rang the office. I’m cross with her, and I’m not. I’ve been told some things I didn’t like hearing, and I was told to keep them to myself or my visits might stop. I believed it. I feel very silly. But the lady who rang me back was kind. She said I wasn’t in trouble, and nobody was going to stop my help. I’d like to believe that too.",
        media: ph(
          IMG.phoneTable,
          "An older woman on the phone at her kitchen table (a stand-in picture).",
          "Margaret at her kitchen table on the phone, a cup of tea going cold, relieved and anxious at once. Natural light, coastal home.",
        ),
        cast: ["alder-dana", "alder-col"],
        resources: [SIRS3],
        interactions: [
          view(
            "i1",
            "Hear from Dana",
            "alder-dana",
            "Mum said something about her card and her PIN, almost in passing. I don’t live with her. I couldn’t check. So I rang, and I’m so glad I did.",
          ),
          view(
            "i2",
            "Hear from Col",
            "alder-col",
            "I heard the cleaner say ‘keep this between us’. I didn’t like it. I wrote it down, exactly, and told the office.",
          ),
          reflect(
            "i3",
            "Reflect on the situation",
            "What would make it easier for her to say what happened?",
            "Being asked kindly, at my kitchen table, with nobody rushing me. And being told I’m not in trouble, before anything else.",
          ),
          learn("i4", "Continue learning", "Recognising and reporting incidents in home care.", SIRS3.href),
        ],
        knowledge:
          "Dana left a message with her provider on 20 November. Margaret was told by a worker to keep things to herself or her visits might stop, and believed it. Someone from the provider rang her back kindly and told her she isn’t in trouble and her help will carry on. She feels embarrassed and silly.",
        outcomes: "The concerns have been passed on to her provider. Her support is carrying on.",
        teaser: "Next week: Margaret decides how she’d like to tell it.",
      },
      {
        number: 4,
        title: "At my kitchen table",
        summary: "Margaret tells her own account, her way.",
        story: "Margaret chooses where, when and who. Her kitchen table, after lunch, with Dana on the speakerphone.",
        dialogue: "They let me tell it from the start, in my own words. Nobody finished my sentences for me.",
        quote: "Nobody finished my sentences for me.",
        diary:
          "I told it from the beginning. The extra hours, the card, what was said to me. They wrote down my words, not their words. Dana was on the speaker and didn’t interrupt once, which must have nearly killed her. I felt lighter afterwards. Silly, perhaps. But lighter.",
        media: ph(
          IMG.listening,
          "A support worker listening closely to an older woman in an armchair (a stand-in picture).",
          "Margaret at her kitchen table speaking while a kind listener takes notes, a phone on speaker beside the teapot.",
        ),
        cast: ["alder-dana"],
        resources: [SIRS3],
        interactions: [
          reflect(
            "i1",
            "Reflect on the situation",
            "Why did it matter that her words were written down, not someone else’s?",
            "Because it happened to me. If they’d written their version, it would have been their story.",
          ),
          talk("i2", "Have a conversation", "How did it feel to tell it your way?"),
        ],
        knowledge: "She gave her own account at her kitchen table, with Dana on the phone. Her words were written down as she said them. She feels lighter.",
        outcomes: "Her own account is on record.",
        teaser: "Next week: a new face on cleaning day.",
      },
      {
        number: 5,
        title: "A new face on Thursday",
        summary: "A different cleaner comes, and Margaret is nervous, then relieved.",
        story: "Cleaning day comes round, and a different cleaner knocks at the door. Margaret has rehearsed what she’ll say.",
        dialogue: "She told me exactly what she’d do and how long it would take. Two hours. I nearly hugged her.",
        quote: "Two hours. I nearly hugged her.",
        diary:
          "A new girl came on Thursday. I was nervous all morning. She showed me her card and told me exactly what she’d do and how long. Two hours, like it’s meant to be. She even had a cup of tea at three. I’ve asked Dana to help me look over my statements each month. That was my idea.",
        media: ph(
          IMG.doorWave,
          "An older woman waving from her front door as a support worker arrives (a stand-in picture).",
          "Margaret at her front door greeting a new cleaner, cautious but warming, a bright morning.",
        ),
        cast: ["alder-dana"],
        resources: [],
        interactions: [talk("i1", "Have a conversation", "How did cleaning day go?")],
        knowledge: "A different cleaner now comes for two hours. Margaret asked Dana to help her look over her statements each month.",
        outcomes: "A different cleaner while things are looked into. Margaret and Dana check statements together monthly, at Margaret’s suggestion.",
        teaser: "Next week: the kettle’s on.",
      },
      {
        number: 6,
        title: "Back to chatting",
        summary: "Margaret is herself again.",
        story: "Tea at three is back. So is Margaret.",
        dialogue: "I’ve decided I’m allowed to make a fuss when something’s wrong. It only took me eighty-odd years.",
        quote: "I’m allowed to make a fuss when something’s wrong.",
        diary:
          "Col did the roses today and I made him two cups of tea, to make up for the week I didn’t. Dana says I sound like myself. I feel like myself. If something feels wrong now, I say so. It turns out people would rather you did.",
        media: ph(
          IMG.alder,
          "Margaret Alder, gentle smile, pearl earrings.",
          "Margaret laughing at her front door with Col and a teapot, the garden tidy, warm afternoon light.",
        ),
        cast: ["alder-col", "alder-dana"],
        resources: [],
        interactions: [talk("i1", "Have a conversation", "What’s different now?")],
        knowledge: "She’s chatting again and feels like herself. She now speaks up when something feels wrong.",
        outcomes: "She’s back to her routine, with her support in place.",
        teaser: "",
        status: "approved",
      },
    ],
  },

  // ---------------- Mr Okafor ----------------
  {
    id: "arc-okafor-steady",
    memberId: "mr-okafor",
    title: "Steady On",
    summary:
      "After a fall at home, Mr Okafor rebuilds his confidence. New equipment arrives, a careful support worker explains everything, and he sets himself a goal: to walk to his letterbox again.",
    starting: "Mr Okafor lives at home, with his radio, his books and his family photos. One day he’s found on the floor by his bed.",
    theme: "Rebuilding confidence after a fall, with explanations rather than instructions.",
    cast: ["okafor-ben", "okafor-emeka"],
    learning: [
      "Responding to a fall",
      "Clear, honest notes",
      "Explaining equipment before using it",
      "Checking before a transfer",
      "Goals in the person’s words",
    ],
    behaviour: "Tell the person what you’re checking and why, before you help them move.",
    plannedEpisodes: 7,
    schedule: "Wednesdays, 9 am",
    resolution: "He walks to his letterbox with his frame, and his son stops ringing twice a day.",
    events: ["le-fall-at-home", "le-new-equipment", "le-achieves-goal", "le-unexpected-visit"],
    primary: true,
    currentNumber: 4,
    episodes: [
      {
        number: 1,
        title: "The radio on the windowsill",
        summary: "Meet Mr Okafor: calm, dignified, and particular about his mornings.",
        story: "Mr Okafor starts every day the same way: the radio on the windowsill, his glasses on his book, and a look at the photos of his family.",
        dialogue: "A man should start his day with the news and a good book. The news is usually bad. The book is usually better.",
        quote: "The news is usually bad. The book is usually better.",
        diary:
          "Good morning. The radio is on, as always. My glasses are on my book, which is where I left them, which is a small victory at my age. I look at the photos on the windowsill every morning. My son, his children. I like an orderly day. I like to know what is happening, and why.",
        media: ph(
          IMG.outdoorTable,
          "A smiling older man at an outdoor table with a book (a stand-in picture).",
          "Mr Okafor, early eighties, Nigerian heritage, short white hair and beard, knitted vest, in his bedroom by the window with a radio and framed photos, morning light.",
        ),
        cast: [],
        resources: [],
        interactions: [
          talk("i1", "Have a conversation", "What are you reading at the moment?"),
          reflect(
            "i2",
            "Reflect on the situation",
            "Why might an orderly morning matter so much to him?",
            "When you are older, people start arranging your life for you. My mornings, I arrange myself.",
          ),
        ],
        knowledge: "He has shared his mornings: the radio, his book and glasses, his family photos.",
        outcomes: "",
        teaser: "Next week: a morning that doesn’t go to plan.",
      },
      {
        number: 2,
        title: "A morning on the floor",
        summary: "He’s found on the floor by his bed after a fall.",
        story:
          "Mr Okafor slipped getting up and couldn’t stand. When his support worker arrived, he was sitting on the floor by his bed, his left hip sore, not sure how long he’d been there.",
        dialogue: "I slipped getting up. I’m not sure how long I’ve been here. I would like whoever writes this down to write it down properly.",
        quote: "I would like whoever writes this down to write it down properly.",
        diary:
          "I will tell you plainly. I slipped getting out of bed, and I could not get up. My hip was sore. I sat there, and I listened to the radio, and I waited. Ben found me. He did not move me. He made me comfortable and he called for help, and the paramedics checked me over. I came home the same day. I was more embarrassed than hurt. But I was frightened, a little.",
        media: ph(
          IMG.nurseNotes,
          "A nurse taking notes at a table with an older man (a stand-in picture).",
          "Mr Okafor in his armchair, later that day, a blanket over his knees, calm but tired, a support worker writing notes nearby. Dignified framing; no fall shown.",
        ),
        cast: ["okafor-ben"],
        resources: [SIRS2],
        interactions: [
          decide("i1", "You arrive and find Mr Okafor on the floor by his bed. He can’t stand and his hip hurts. What do you do first?", [
            ["Help him up onto the bed.", "No. If they had tried to lift me, with my hip like that, I think I would have shouted. Ben knew better."],
            [
              "Stay with him, keep him comfortable, and call for help.",
              "That is what Ben did. He sat with me, put a pillow behind me, and told me exactly who he was calling.",
            ],
            [
              "Write a quick note that he had a minor fall.",
              "Minor? I was on the floor, I could not stand, and nobody knew how long for. Write what happened.",
            ],
          ]),
          view(
            "i2",
            "Hear from Ben",
            "okafor-ben",
            "I wanted to lift him. You always do. But you don’t move someone who can’t stand and has a sore hip. You stay, you call, you write down what you saw.",
          ),
          learn("i3", "Continue learning", "Managing an incident from start to finish.", SIRS2.href),
        ],
        knowledge:
          "He slipped getting up and couldn’t stand; his left hip was sore and he didn’t know how long he’d been on the floor. Ben stayed with him without moving him and called for help. Paramedics checked him over and he came home the same day. He was embarrassed and a little frightened.",
        outcomes: "He was checked over and came home the same day. The fall was reported.",
        teaser: "Next week: deliveries he didn’t order.",
      },
      {
        number: 3,
        title: "Furniture I didn’t ask for",
        summary: "A hired bed, a shower commode and a walking frame arrive.",
        story: "A van pulls up with a height-adjustable bed, a shower commode and a walking frame. Mr Okafor watches them carried in, arms folded.",
        dialogue: "They brought a new bed into my house. Nobody asked me where I would like it. Tell me why, and I will do it.",
        quote: "Tell me why, and I will do it.",
        diary:
          "A new bed. It goes up, it goes down, it has brakes, like a car. A chair for the shower. A frame with little rubber feet. My son is very pleased. I am less pleased. Nobody asked me where I wanted any of it. Then Ben sat down and explained each thing, what it was for, what to watch for. After that, I didn’t mind so much.",
        media: ph(
          IMG.kitchenFrame,
          "A support worker at a kitchen table with an older couple and a walking frame (a stand-in picture).",
          "Mr Okafor in his bedroom with a new height-adjustable bed, arms folded, Ben beside him explaining the bed controls.",
        ),
        cast: ["okafor-ben", "okafor-emeka"],
        resources: [HAZARD_COURSE],
        interactions: [
          view(
            "i1",
            "Hear from Emeka",
            "okafor-emeka",
            "I asked for all of it. I’d have asked for more. Dad says I fuss. I do fuss. I’m two suburbs away and I can’t be there every morning.",
          ),
          reflect(
            "i2",
            "Reflect on the situation",
            "What changed when Ben explained each thing?",
            "It stopped being something done to me. It became something I chose to use.",
          ),
          talk("i3", "Have a conversation", "What do you make of the new bed?"),
        ],
        knowledge:
          "He now has a hired height-adjustable bed with brakes, a shower commode and a walking frame. He was annoyed not to be asked, until Ben explained each one.",
        outcomes: "The equipment is in place: a hired bed, a shower commode, a walking frame.",
        teaser: "Next week: Ben checks something before Mr Okafor gets up.",
      },
      {
        number: 4,
        title: "Brakes on",
        summary: "A careful check before he moves.",
        story: "Before Mr Okafor moves from the bed to the chair, Ben stops, crouches, and checks every wheel. Mr Okafor asks why. Ben tells him.",
        dialogue: "He checks the brakes every time and tells me what he’s doing. I have started checking them myself. Don’t tell him.",
        quote: "He checks the brakes every time. I’ve started checking them myself.",
        diary:
          "Every morning Ben does the same thing before I get up. Brakes on, each wheel. The frame, the little rubber feet. He tells me what he is looking at. Yesterday one of the feet was worn. He didn’t just swap the frame, he told me, and asked what I wanted to use until it was fixed. That is a man who does things properly. I have started checking the brakes myself.",
        media: ph(
          IMG.okafor,
          "Mr Okafor, calm and dignified, white beard.",
          "Ben crouching to check a bed brake while Mr Okafor watches from the edge of the bed, frame in front of him, radio on the windowsill.",
        ),
        cast: ["okafor-ben"],
        resources: [HAZARD_COURSE, SIRS2],
        interactions: [
          talk("i1", "Have a conversation", "How are you finding the new routine?"),
          decide("i2", "You’re about to help Mr Okafor from the bed to the chair and notice a brake is off. What would you do?", [
            ["Stop, tell him why, and put the brake on before anything moves.", "That is the right order. Tell me first, then fix it. Then we go."],
            ["Hold the bed steady with your knee and carry on.", "With my hip? I would rather wait a minute than go on the floor again."],
            ["Carry on, and mention it afterwards.", "Afterwards is a funny time to mention a brake."],
          ]),
          view(
            "i3",
            "Hear from Ben",
            "okafor-ben",
            "It takes thirty seconds. Brakes, frame tips, the mat. I say it out loud so he knows. Now he says it with me.",
          ),
          learn("i4", "Continue learning", "Look before you help: spot the hazard.", HAZARD_COURSE.href),
        ],
        knowledge:
          "Ben checks the bed brakes, the frame tips and the mat each morning and tells him why. A frame tip was worn; Ben told him and asked what he wanted to use until it was fixed. He has started checking the brakes himself.",
        outcomes: "A worn frame tip was reported for replacement.",
        teaser: "Next week: he sets himself a goal.",
      },
      {
        number: 5,
        title: "The walk to the letterbox",
        summary: "He sets a goal, in his own words.",
        story: "Asked what he wants from the next few weeks, Mr Okafor doesn’t hesitate. He wants to walk to his own letterbox, and fetch his own mail.",
        dialogue: "I would like to collect my own letters. It is not a big thing. It is my thing.",
        quote: "It is not a big thing. It is my thing.",
        diary:
          "They asked me what I wanted. Not what I needed. What I wanted. I said, I want to walk to my letterbox and fetch my own letters. It is perhaps fifteen metres. My son thinks that is ambitious. I think it is overdue. We have made a plan. A little further each day, with the frame, with Ben beside me.",
        media: ph(
          IMG.slidingDoor,
          "An older man at an open sliding door looking out at a garden (a stand-in picture).",
          "Mr Okafor at his front door with his walking frame, looking down the path to the letterbox, determined.",
        ),
        cast: ["okafor-ben", "okafor-emeka"],
        resources: [],
        interactions: [talk("i1", "Have a conversation", "Why the letterbox?")],
        knowledge: "His goal is to walk to his letterbox with his frame and fetch his own mail. They have a plan: a little further each day with Ben.",
        outcomes: "His goal, in his words, is in his plan.",
        teaser: "Next week: a note he gets to read.",
      },
      {
        number: 6,
        title: "What the note said",
        summary: "He reads the progress notes about him.",
        story: "Mr Okafor asks to read what has been written about him since the fall.",
        dialogue: "The first note said ‘minor fall’. The later ones said what happened. I know which ones I trust.",
        quote: "I know which notes I trust.",
        diary:
          "I asked to see my notes. One early one said I had a minor fall and was fine. I was not fine, I was on the floor. The later ones, Ben’s, say what happened and what I said. I would like every note about me to be like those.",
        media: ph(
          IMG.papers,
          "A woman and an older man looking through papers at a table (a stand-in picture).",
          "Mr Okafor at his table reading a printed note through his glasses, Ben beside him.",
        ),
        cast: ["okafor-ben"],
        resources: [],
        interactions: [talk("i1", "Have a conversation", "What makes a good note, to you?")],
        knowledge: "He read his notes. An early one played down the fall; later ones described what happened and what he said.",
        outcomes: "",
        teaser: "Next week: someone is waiting at the front gate.",
        status: "in_review",
      },
      {
        number: 7,
        title: "Sunday visitors",
        summary: "His son and grandchildren visit, and he meets them at the letterbox.",
        story: "Emeka arrives on Sunday with the grandchildren. His father is waiting at the letterbox.",
        dialogue: "I was at the letterbox when they arrived. Emeka didn’t say anything for a moment. Then he laughed.",
        quote: "I was at the letterbox when they arrived.",
        diary: "Draft: Mr Okafor describes meeting his family at the letterbox, frame and all.",
        media: ph(
          IMG.visitors,
          "A young man visiting an older couple in their living room (a stand-in picture).",
          "Mr Okafor at his letterbox with his frame, greeting his son and two grandchildren on a Sunday afternoon.",
        ),
        cast: ["okafor-emeka"],
        resources: [],
        interactions: [],
        knowledge: "",
        outcomes: "",
        teaser: "",
        status: "draft",
      },
    ],
  },
];
