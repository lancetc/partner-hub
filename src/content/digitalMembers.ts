/*
  Digital Members (Community → Digital Members, server/digitalMembers.ts): introductions to the fictional people
  learners meet in training. Each id is a row in the character photo library (docs/character-photos.md), which
  holds the name and portrait; this file holds how they're introduced. Where a character has approved story canon,
  the profile page uses its "what matters" and relationships instead of these.

  Everything here is written from what the training scenarios already say about each person, so a learner who
  meets them here meets the same person in the course. Keep it that way: don't add a fact here that a scenario
  contradicts.
*/

export const DIGITAL_GROUPS = [
  { id: "clients", label: "People we support" },
  { id: "family", label: "Family" },
  { id: "business", label: "Business owners and managers" },
  { id: "team", label: "Coordinators, Care Partners and workers" },
] as const;

const INDUCTION = { title: "Ready for Your First Shift: Contractor Induction", href: "/magazine/ready-for-your-first-shift-trilogy-care-contractor-induction" };
const CORDS_DAY = { title: "A Coordinator’s Day", href: "/play/coordinators-day" };
export type DigitalGroup = (typeof DIGITAL_GROUPS)[number]["id"];

export type DigitalMemberIntro = {
  /** The character library id. */
  id: string;
  group: DigitalGroup;
  /** How they're described on their card: "Lives at home, loves her roses". Empty uses the library role. */
  role: string;
  /** A first-person hello, in their voice. */
  hello: string;
  /** How they go about things, in their own words: the caption under their picture in an article. */
  approach: string;
  /** One line under the hello on their card. */
  tagline: string;
  /** Two or three short paragraphs, separated by a blank line. */
  about: string;
  matters?: string;
  /** What meeting them in training helps a learner practise. */
  themes: string[];
  /** Other digital members they know, by library id. */
  knows: { id: string; relation: string; note?: string }[];
  /** Places to meet them outside Magazine courses (which are found from the published courses themselves). */
  meet: { title: string; href: string }[];
};

export const DIGITAL_MEMBERS: DigitalMemberIntro[] = [
  // ---------- Your guide ----------
  {
    id: "ava",
    group: "team",
    role: "Regional care coordinator, and your guide",
    hello: "Is this thing on? It’s Ava. I’ll be sending you field notes from the road. Pull up a chair.",
    approach: "Find out what someone’s trying to keep in their life first. Then come back and check the plan actually worked.",
    tagline: "Sends short transmissions from a little relay in her car, between homes, suppliers and towns.",
    about:
      "Ava is a regional care coordinator whose work takes her between people’s homes, suppliers and small communities. On the road she sends short field transmissions from a mobile relay, and she keeps a scuffed notebook headed “What did I miss?”.\n\nShe’s observant, warm and now and then dryly funny. She’s good at her job without knowing everything, and she’ll tell you when she got something wrong. Early on she arranged book deliveries for Mrs Bell, then found out Mrs Bell went to the library for her Thursday friends, not the books.",
    matters: "Finding out what a person is trying to keep in their life before settling on a solution, then coming back to see whether the plan worked.",
    themes: ["Listening first", "Coming back to check", "Learning from mistakes"],
    knows: [{ id: "dot", relation: "client she visits" }],
    meet: [INDUCTION],
  },

  // ---------- People we support ----------
  {
    id: "dot",
    group: "clients",
    role: "Lives at home, tends her roses",
    hello: "I’ll do my own buttons, thank you. It takes a while, but they’re my buttons.",
    approach: "Help me do it, don’t do it for me. I’ll tell you when I need more.",
    tagline: "Practical, funny and firm about doing things herself, in her own time.",
    about:
      "Dot lives at home with support from Trilogy Care. The roses in her front garden are her pride, and she never misses bowls on Thursday mornings. Osteoarthritis in both hands makes small jobs slow, and she’d still rather do them herself.\n\nShe likes her regular cleaner, Lena, and would rather wait for her than have someone new. Her daughter Fiona is close and sometimes worries more than Dot would like, especially about the ladder Dot uses for the roses.",
    themes: ["Choice and control", "Dignity of risk", "Goals in the person’s words"],
    knows: [{ id: "fiona", relation: "daughter" }],
    meet: [CORDS_DAY, { title: "Dot’s Week, Day 1: Welcome, Dot", href: "/topics/dots-week-day-1-welcome-dot" }],
  },
  {
    id: "mrs-patel",
    group: "clients",
    role: "Lives at home, planning a bathroom upgrade",
    hello: "My son does the paperwork. I just want a bathroom I can use safely.",
    approach: "Show me what it covers and what it doesn’t. I can make up my own mind once I know.",
    tagline: "Has a tradie’s quote for her bathroom, and a son with questions about it.",
    about:
      "Mrs Patel lives at home, and her son helps her with the paperwork. A tradie has quoted for work in her bathroom, and her son wants to know why the new tiles can’t be funded when the safety work can.\n\nMeeting her is a chance to practise reading a quote line by line: what her package can pay for, what it can’t, and how to explain the difference kindly.",
    themes: ["Reading quotes and invoices", "What packages can fund", "Explaining a no"],
    knows: [],
    meet: [],
  },
  {
    id: "mr-brennan",
    group: "clients",
    role: "Lives alone, handy around the house",
    hello: "It makes my life easier. Why can’t that go on my package?",
    approach: "Keep it simple and tell me straight. I don’t mind a no if I know why.",
    tagline: "Approved for home maintenance, with a hardware receipt that mixes repairs and shopping.",
    about:
      "Mr Brennan lives alone and is approved for home maintenance and repairs. Practical and good-humoured, he’d rather fix a thing than fuss about it.\n\nHis hardware receipt mixes a small safety repair with ordinary shopping, and his old microwave has just died. He’d like the new one on his package. You’ll help sort what’s funded from what isn’t.",
    themes: ["Everyday items vs funded supports", "Checking receipts", "Explaining a no"],
    knows: [],
    meet: [],
  },
  {
    id: "mrs-wong",
    group: "clients",
    role: "Receives nursing care at home",
    hello: "The dressings went on my package. Why can’t my tablets?",
    approach: "I ask because I want to understand, not to argue.",
    tagline: "Has nursing care for a leg ulcer, and a pharmacy receipt with a question attached.",
    about:
      "Mrs Wong receives nursing care at home for a leg ulcer. Calm and patient, she asks a fair question: if her wound dressings were funded, why not the tablets on the same pharmacy receipt?\n\nShe helps you practise telling a clinical consumable from an everyday medicine, and saying why in plain words.",
    themes: ["Pharmacy receipts", "Clinical supplies", "Plain explanations"],
    knows: [],
    meet: [],
  },
  {
    id: "arthur",
    group: "clients",
    role: "Lives at home, waiting for his services",
    hello: "I’d like to stay in charge, and to be taken seriously. And fewer phone calls, please.",
    approach: "Talk to me, not about me. Chloe helps, but I decide.",
    tagline: "82, approved for Support at Home and waiting in the Priority System.",
    about:
      "Arthur is 82 and lives at home. He wants to keep making his own decisions. Household tasks are getting harder, he dislikes paperwork, and he worries about fees.\n\nHe’s been approved and is waiting for his funding. He has agreed that his daughter Chloe can help with calls and arrangements, but detailed health and money matters still need his say-so. While he waits, Chloe mentions a “minor” fall.",
    themes: ["The client journey", "Waiting well", "Consent and family"],
    knows: [{ id: "chloe", relation: "daughter", note: "Helps with calls and arrangements" }],
    meet: [],
  },
  {
    id: "mrs-alvarez",
    group: "clients",
    role: "Lives at home, loves her rose garden",
    hello: "That walker catches on the gravel. I’ll manage my garden my way.",
    approach: "Make the path safer, not my life smaller.",
    tagline: "82, and she’d rather change the path than give up the roses.",
    about:
      "Mrs Alvarez is 82 and loves tending her roses. She won’t use the walker outdoors: it catches on the gravel and she feels self-conscious with it. After a near miss on the uneven path, she chose a seat by the roses, levelled gravel and sturdier shoes.\n\nHer decision-making isn’t in question. Meeting her is about weighing a real risk with someone who has every right to take it.",
    themes: ["Dignity of risk", "Balancing safety and choice", "Recording decisions"],
    knows: [],
    meet: [],
  },
  {
    id: "mr-okoro",
    group: "clients",
    role: "Self-managing, proud of his garden",
    hello: "Des has applied. Can he start Monday?",
    approach: "I know who I trust. Give them a fair go and I’ll wait for the checks.",
    tagline: "79, with a garden he’s kept for forty years and a neighbour he trusts with it.",
    about:
      "Mr Okoro is 79 and self-manages his care. His garden has been his pride for forty years. He wants to pay Des, a neighbour he has known for twenty years, as his funded gardener.\n\nHe knows who he trusts. He chooses to wait while Des gets his checks done, and then he’d quite like an answer.",
    themes: ["Self-management", "Worker checks", "Choice of supplier"],
    knows: [],
    meet: [],
  },
  {
    id: "mrs-pearce",
    group: "clients",
    role: "In her home of fifty years",
    hello: "I know where everything is. Please don’t move my belongings.",
    approach: "Go at my pace, and ask before you move anything.",
    tagline: "86, sorting her late sister’s things slowly, in her own hallway.",
    about:
      "Mrs Pearce is 86 and has lived in her house for fifty years. She has showering support twice a week and a fortnightly clean.\n\nThe boxes in her hallway are her late sister’s things, and she’s sorting them slowly. She agreed to a clear path, as long as she chooses what moves.",
    themes: ["Safe access at home", "Grief and belongings", "Agreeing a plan together"],
    knows: [],
    meet: [],
  },
  {
    id: "mr-haddad",
    group: "clients",
    role: "Coming home after a stay with family",
    hello: "When I’m home, I’d like help with my shower, from a man if possible.",
    approach: "Ask me how I’d like it done. Don’t assume.",
    tagline: "78, fully coordinated, starting services once he’s back from his daughter’s.",
    about:
      "Mr Haddad is 78 and fully coordinated by Trilogy Care. He wants help showering and a weekly clean, and he prefers a male worker for personal care.\n\nHe’s staying with his daughter Rania for about five weeks, so nothing starts until he’s home. His first service is booked for 21 December. Dignified and a little reserved, he appreciates being asked, not assumed.",
    themes: ["Worker preferences", "Planning a first month", "Cultural respect"],
    knows: [],
    meet: [],
  },
  {
    id: "mrs-lin",
    group: "clients",
    role: "Self-managing, runs her own affairs",
    hello: "She was fine. But I still prefer Lena.",
    approach: "I run my own affairs. Keep me in charge and keep me informed.",
    tagline: "83, lives alone, and chose Trilogy Care so she could keep her cleaner.",
    about:
      "Mrs Lin is 83, lives alone and likes to run her own affairs. She chose Trilogy Care so she could keep Lena, the cleaner she has known for years, but Lena’s checks have stalled.\n\nHer son Aaron may join scheduling calls but doesn’t see her finances. She’s confident and direct, and she’ll tell you exactly what she thinks of the stand-in.",
    themes: ["Self-management", "Keeping a trusted worker", "Privacy within families"],
    knows: [],
    meet: [],
  },
  {
    id: "mr-nguyen",
    group: "clients",
    role: "Home from hospital",
    hello: "I want to be home, and I’d like to keep my Thursday outing if it’s safe.",
    approach: "Get the handover right and I’ll be fine at home.",
    tagline: "79, lives alone, newly home with a wound to care for.",
    about:
      "Mr Nguyen is 79 and lives alone. He has just come home from hospital with a new wound-care need.\n\nHe wants to stay at home and keep his weekly Thursday social outing, if that’s safe. Getting him settled means passing the right information to the right people, quickly.",
    themes: ["Hospital discharge", "Handovers", "Keeping what matters"],
    knows: [],
    meet: [],
  },
  {
    id: "mrs-nguyen",
    group: "clients",
    role: "Likes things done her way",
    hello: "Not now, dear. I’d prefer to wash after lunch.",
    approach: "Ask me each time. My routine is mine.",
    tagline: "Gentle, and clear about when and how she’d like her support.",
    about:
      "Mrs Nguyen is in her mid-eighties. She’s gentle and knows her own routine: she’d rather shower after lunch than first thing, and she likes to butter her own toast.\n\nShe helps you practise writing notes that describe what happened and what she said, without labels like “refused” or “difficult”.",
    themes: ["Respectful notes", "Routines and preferences", "Consent every time"],
    knows: [],
    meet: [],
  },
  {
    id: "mr-okafor",
    group: "clients",
    role: "Lives at home",
    hello: "I slipped getting up. I’m not sure how long I’ve been here.",
    approach: "When something goes wrong, stay calm, help me, and write down what really happened.",
    tagline: "Found sitting by his bed one morning, and the note you write matters.",
    about:
      "Mr Okafor is in his early eighties, calm and dignified. One morning he’s found sitting on the floor by his bed, unable to stand, with a sore left hip and unsure how long he’s been there.\n\nMeeting him is about responding well when something goes wrong, and recording it clearly so the next person knows exactly what happened.",
    themes: ["Falls and urgent response", "Clear incident notes", "Escalation"],
    knows: [],
    meet: [],
  },
  {
    id: "helen-park",
    group: "clients",
    role: "Lives at home",
    hello: "I don’t want to be any trouble.",
    approach: "Notice the quiet things. People don’t always say when they’re unhappy.",
    tagline: "Composed and quiet, and someone has noticed she dreads Thursdays.",
    about:
      "Mrs Park is in her early eighties, composed and quietly observant. Her gardener overheard a care worker speak to her unkindly, and her son Daniel says she has started to dread Thursdays.\n\nMeeting her is about noticing the signals of possible harm, taking them seriously, and knowing what has to be reported.",
    themes: ["Spotting the signals", "Serious incidents (SIRS)", "Speaking up"],
    knows: [],
    meet: [],
  },
  {
    id: "margaret-alder",
    group: "clients",
    role: "Lives at home",
    hello: "I’m fine. I just don’t feel much like chatting today.",
    approach: "If something feels off, don’t wait to be sure. Ask, and pass it on.",
    tagline: "Usually chatty, lately upset, and the invoices don’t add up.",
    about:
      "Mrs Alder is in her mid-eighties, gentle and usually happy to chat. Lately she seems upset. Her invoice shows six hours when two were agreed, there’s a withdrawal no one can explain, and her daughter Dana doesn’t live with her.\n\nShe helps you practise recognising financial abuse, and acting on it without waiting to be certain.",
    themes: ["Financial abuse", "Invoice red flags", "Reporting concerns"],
    knows: [],
    meet: [],
  },
  {
    id: "tom-reyes",
    group: "clients",
    role: "Lives at home",
    hello: "Sorry, what day did you say it was?",
    approach: "If I’m not myself, check in kindly and follow it up.",
    tagline: "Easy-going, and lately not quite himself.",
    about:
      "Mr Reyes is in his late seventies and easy-going. Lately he has asked the gardener twice what day it is and couldn’t find his keys, which isn’t like him. His daughter Carla lives interstate and worries that a cousin is leaning on him for money.\n\nMeeting him is about telling what needs a report from what needs a conversation, and following up either way.",
    themes: ["Changes in a person", "Is it SIRS?", "Working with distant family"],
    knows: [],
    meet: [],
  },
  {
    id: "iris-kennedy",
    group: "clients",
    role: "Lives at home",
    hello: "Come in, come in. The kettle’s already on.",
    approach: "A good chat is half the visit.",
    tagline: "Bright, sociable and always glad of a visitor.",
    about:
      "Mrs Kennedy is in her eighties, with a bright smile and a floral blouse for every day of the week. She loves a visitor and a good chat.\n\nYou’ll meet her in training soon.",
    themes: ["Building rapport", "Social connection"],
    knows: [],
    meet: [],
  },
  {
    id: "alan",
    group: "clients",
    role: "Lives at home",
    hello: "Don’t tell anyone, or they’ll put me in a home.",
    approach: "Keep my trust and keep me safe. Both matter.",
    tagline: "Rubbing his hip after a slip in the bathroom, and hoping you won’t make a fuss.",
    about:
      "Alan lives at home and wants to stay there. On a morning visit you find him rubbing his hip: he slipped on the bath mat and doesn’t want anyone to know.\n\nHe’s worried about losing his independence, and gruffly grateful once it’s sorted. Meeting him is about reporting what you see while keeping his trust.",
    themes: ["Falls", "Reporting with respect", "Independence"],
    knows: [],
    meet: [INDUCTION],
  },
  {
    id: "bill",
    group: "clients",
    role: "Lives at home",
    hello: "Here’s fifty for your trouble. And add me on Facebook so the grandkids can see who looks after me!",
    approach: "I like to say thank you. Tell me nicely if it’s not allowed.",
    tagline: "Generous, jokey, and testing your boundaries without meaning to.",
    about:
      "Bill lives at home and you’ve been visiting him for a few months. He’s generous and jokey, and he thinks you’re a good egg.\n\nHe offers you $50 and asks to be Facebook friends before his grandkids visit on Sunday. Meeting him is about saying no to gifts and social media kindly, and keeping the relationship.",
    themes: ["Gifts", "Social media", "Professional boundaries"],
    knows: [],
    meet: [INDUCTION],
  },
  {
    id: "joan",
    group: "clients",
    role: "Lives at home",
    hello: "Do you have to ring someone for everything? Thank you, dear.",
    approach: "Do what you’re there to do, and tell me who can do the rest.",
    tagline: "Warm, a bit impatient, and asking for help that isn’t yours to give.",
    about:
      "Joan lives at home. Her eyesight is poor, so she asks you to pop her tablets out for her, and to change the dressing on her sore leg because the nurse isn’t due until Friday.\n\nShe’s warm and a little impatient. Meeting her is about knowing your scope, and what to do when someone asks for more.",
    themes: ["Your scope of work", "Medication support", "When to call"],
    knows: [],
    meet: [INDUCTION],
  },
  {
    id: "margaret",
    group: "clients",
    role: "Lives at home, likes her kitchen done first",
    hello: "So I don’t get a say in my own home?",
    approach: "Ask me first. It’s my home and my say.",
    tagline: "Your first-shift client, who’d like to be asked, not told.",
    about:
      "Margaret is the client on your first visit. She expected Trilogy Care to decide what she needs, likes her kitchen done first, and would like to move her visits from Thursdays to Tuesdays.\n\nShe can be a bit tart when she’s sidelined, and she’s pleased to be put in charge. Meeting her is about choice and control from day one.",
    themes: ["Your first shift", "Choice and control", "Changing a service"],
    knows: [],
    meet: [INDUCTION],
  },
  {
    id: "rosa",
    group: "clients",
    role: "Lives at home",
    hello: "I’d like to do my own buttons, love, even if it takes me a while.",
    approach: "Let me do what I can, and ask before you help.",
    tagline: "86 and independent: “I’m not helpless, you know.”",
    about:
      "Rosa is 86 and independent. She doesn’t usually let people into her wardrobe, and when she does, she’ll tell you it’s the blue cardigan she wants.\n\nMeeting her is about consent: asking before you help, and letting someone do what they can.",
    themes: ["Consent", "Doing with, not for", "Privacy at home"],
    knows: [],
    meet: [INDUCTION],
  },
  {
    id: "mr-brooks",
    group: "clients",
    role: "Supported by a cleaning supplier",
    hello: "The visits went well. I like the people from Tidy Homes.",
    approach: "If the visits are good, the paperwork should say so clearly.",
    tagline: "Happy with his service, and his invoice says just “Home help, 3 hours”.",
    about:
      "Mr Brooks is in his late seventies. Tidy Homes cleans for him on Tuesdays and helps with shopping on Thursdays, and he likes them.\n\nHis invoice says only “Home help, 3 hours”. Meeting him is about checking an invoice matches the service, even when everyone’s happy.",
    themes: ["Checking invoices", "Service descriptions", "Supplier conversations"],
    knows: [],
    meet: [],
  },

  // ---------- Family ----------
  {
    id: "fiona",
    group: "family",
    role: "Dot’s daughter",
    hello: "Why isn’t Mum’s cleaner coming? She sounded flat on the phone.",
    approach: "Tell me early when something changes. Mum still makes the call.",
    tagline: "Works full time, helps where she can, and asks pointed questions.",
    about:
      "Fiona is Dot’s daughter. She works full time, picks up Dot’s shopping when she can, and keeps an eye on how things are going.\n\nShe tends to raise a concern with a pointed question. Her worry is reasonable, and so is Dot’s independence: Fiona isn’t an obstacle, and she isn’t always right. She’s never the one who decides for Dot.",
    themes: ["Working with families", "Who decides", "Keeping people informed"],
    knows: [{ id: "dot", relation: "mother" }],
    meet: [CORDS_DAY],
  },
  {
    id: "chloe",
    group: "family",
    role: "Arthur’s daughter",
    hello: "Can we start privately next Monday? And do the costs just flip over automatically?",
    approach: "I’m here to help Dad, not to decide for him.",
    tagline: "Caring, busy and practical, helping her dad while working full time.",
    about:
      "Chloe is Arthur’s daughter. She works full time and Arthur has agreed she can help with his calls and arrangements.\n\nShe’s caring but busy, and practical to a fault. She calls Arthur’s fall “minor”. Meeting her is about helping a family member while remembering that Arthur is the one who decides.",
    themes: ["Authorised representatives", "Private services while waiting", "Fees"],
    knows: [{ id: "arthur", relation: "father" }],
    meet: [],
  },
  {
    id: "karen",
    group: "family",
    role: "A client’s daughter",
    hello: "Mum’s had three different workers this month and nobody tells us anything.",
    approach: "Keep us in the loop and we’ll work with you.",
    tagline: "Upset at the door, and calmer once she feels heard.",
    about:
      "Karen is a client’s daughter. She meets you at the door with a complaint: too many different workers, and no one keeping the family informed.\n\nShe calms down once she’s heard. Meeting her is about open disclosure, handling a complaint well, and passing it on.",
    themes: ["Complaints", "Open disclosure", "Staying calm"],
    knows: [],
    meet: [INDUCTION],
  },

  // ---------- Business owners and managers ----------
  {
    id: "maya",
    group: "business",
    role: "Runs a small Care Partner business",
    hello: "Do I recruit now, wait, or change the way we work? I’d like to get this one right.",
    approach: "Grow at the pace your team can carry, and keep enough in the bank to choose rather than react.",
    tagline: "Her business is growing faster than her team, and the cash has to last.",
    about:
      "Maya runs a small independent Care Partner business with one full-time coordinator. Together they support 35 people. Three new participants start each month and about one leaves, so onboarding and follow-up are piling up: callbacks are taking longer, and her coordinator has started working late.\n\nShe has $26,720 in the bank and keeps $10,000 aside as a reserve. Hiring too early could stretch the cash; waiting too long could stretch her team and the care. Meeting her is about planning capacity, margin and cash together, before the pressure decides for you.",
    matters: "Growing without letting service slip, looking after her team, and keeping enough cash in reserve to sleep at night.",
    themes: ["Growing your business", "When to hire", "Capacity, margin and cash"],
    knows: [],
    meet: [],
  },

  // ---------- Coordinators, Care Partners and workers ----------
  {
    id: "sam",
    group: "team",
    role: "Trilogy Care team member",
    hello: "Hi, it’s Sam from Trilogy Care. Quick one before your shift tomorrow.",
    approach: "A quick call early saves a cancelled shift later.",
    tagline: "Rings ahead when something needs sorting, like a lapsed certificate.",
    about:
      "Sam works in Trilogy Care’s team. The day before one of your shifts, Sam calls: your first aid certificate has lapsed.\n\nMeeting Sam is about keeping your checks and certificates current, and what happens when one runs out.",
    themes: ["Renewing your checks", "Compliance", "Working with Trilogy Care"],
    knows: [],
    meet: [INDUCTION],
  },
  {
    id: "elena-marino",
    group: "team",
    role: "Care coordinator",
    hello: "Let’s start with what matters to them, and work back from there.",
    approach: "Start with what matters to the person, then work back to the plan.",
    tagline: "A coordinator who never goes anywhere without her notebook.",
    about: "Elena is a care coordinator in her forties who never goes anywhere without her notebook.\n\nYou’ll meet her in training soon.",
    themes: ["Care coordination"],
    knows: [],
    meet: [],
  },
  {
    id: "mele-fonua",
    group: "team",
    role: "Care coordinator",
    hello: "Hello! What can I help you sort out today?",
    approach: "Clear plans, warm calls and no surprises.",
    tagline: "A coordinator with a warm hello and a clear plan.",
    about: "Mele is a care coordinator in her forties, warm and organised.\n\nYou’ll meet her in training soon.",
    themes: ["Care coordination"],
    knows: [],
    meet: [],
  },
  {
    id: "nadia-costa",
    group: "team",
    role: "Care coordinator",
    hello: "Good question. Let me find out properly and call you back.",
    approach: "I’d rather find out properly than guess.",
    tagline: "A coordinator who’d rather check than guess.",
    about: "Nadia is a care coordinator in her forties with a warm smile.\n\nYou’ll meet her in training soon.",
    themes: ["Care coordination"],
    knows: [],
    meet: [],
  },
  {
    id: "hana-mitchell",
    group: "team",
    role: "Care Partner",
    hello: "I write it down while it’s fresh. Future me always says thanks.",
    approach: "Write it down while it’s fresh. Good records protect everyone.",
    tagline: "A Care Partner with a notebook and good habits.",
    about: "Hana is a Care Partner in her thirties.\n\nYou’ll meet her in training soon.",
    themes: ["Running a care business", "Good records"],
    knows: [],
    meet: [],
  },
  {
    id: "sione-taufa",
    group: "team",
    role: "Care Partner",
    hello: "Always happy to swap notes with someone starting out.",
    approach: "Turn up when you said you would, and do what you said you’d do.",
    tagline: "A Care Partner who’s always on the move.",
    about: "Sione is a Care Partner in his thirties, usually with a backpack over one shoulder.\n\nYou’ll meet him in training soon.",
    themes: ["Running a care business"],
    knows: [],
    meet: [],
  },
  {
    id: "claire-hollis",
    group: "team",
    role: "Community nurse",
    hello: "If you’re not sure whether it’s clinical, ask me. That’s what I’m here for.",
    approach: "If you’re not sure it’s yours to do, ask. That’s what the team is for.",
    tagline: "A community nurse who visits people at home.",
    about: "Claire is a community nurse in her thirties who visits people in their homes.\n\nYou’ll meet her in training soon.",
    themes: ["Clinical care at home", "Knowing your scope"],
    knows: [],
    meet: [],
  },
  {
    id: "ray-donnelly",
    group: "team",
    role: "Gardener",
    hello: "I notice things out in the yard. Who do I tell?",
    approach: "Keep your eyes open while you work, and say something if you see something.",
    tagline: "A gardener who keeps an eye out while he works.",
    about: "Ray is a gardener in his sixties, rarely seen without his wide-brimmed hat.\n\nYou’ll meet him in training soon.",
    themes: ["Gardening services", "Noticing and reporting"],
    knows: [],
    meet: [],
  },
];
