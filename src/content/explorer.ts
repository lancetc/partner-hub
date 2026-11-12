/*
  Neighbourhood Explorer: a small suburb where each house holds a client scenario. Each quest
  has three steps (what's in scope, the risks, what to do), each a choice of three with feedback.
  Demonstration content, written from the hub's existing topics; it needs subject matter review.
*/

export type Choice = {
  text: string;
  /** "best" earns full points; "partly" is reasonable but misses something; "no" is the wrong call. */
  verdict: "best" | "partly" | "no";
  /** What happens next, and why. */
  feedback: string;
};

export type QuestStep = { kind: "scope" | "risk" | "decide"; prompt: string; choices: Choice[] };

export type Quest = {
  id: string;
  client: string;
  title: string;
  /** One line for the quest card. */
  teaser: string;
  /** What the client says when you knock. */
  opening: string[];
  steps: QuestStep[];
  /** The rule of thumb to take away. */
  takeaway: string;
  topic: { slug: string; title: string };
  /** The client's look, for their portrait and sprite. */
  look: { skin: string; hair: string; shirt: string; glasses?: boolean; hat?: boolean; style?: "short" | "bun" | "pony" };
};

export const STEP_LABEL: Record<QuestStep["kind"], string> = {
  scope: "Check what’s in scope",
  risk: "Consider the risks",
  decide: "Decide what to do",
};

export const quests: Quest[] = [
  {
    id: "dot",
    client: "Dot",
    title: "Dot’s request",
    teaser: "Dot has asked for help with something that might be outside her current plan.",
    opening: [
      "Oh good, you’re here. Come in, love.",
      "My cleaner, Jess, comes on Thursdays. I’ve been a bit wobbly in the shower lately, so I asked her to help me have one tomorrow. Just this once. She said she’d check. That’s fine, isn’t it?",
    ],
    steps: [
      {
        kind: "scope",
        prompt: "Jess is booked for cleaning (domestic assistance). Is helping Dot shower part of that service?",
        choices: [
          {
            text: "Yes. It’s all help at home, and Dot has asked.",
            verdict: "no",
            feedback: "Showering is personal care, a different service from cleaning. Each service is delivered by a worker trained and approved for it.",
          },
          {
            text: "No. Showering is personal care, a different service that needs a trained worker.",
            verdict: "best",
            feedback: "Right. Cleaning and personal care are separate services in Dot’s plan, delivered by different, suitably trained workers.",
          },
          {
            text: "Only if Dot signs a note saying it was her choice.",
            verdict: "no",
            feedback: "A signed note doesn’t change what the service is, or make the worker trained for it. Dot’s choice matters, and the way to honour it is to arrange the right service.",
          },
        ],
      },
      {
        kind: "risk",
        prompt: "What’s the biggest risk if Jess helps “just this once”?",
        choices: [
          {
            text: "Jess runs late for her next client.",
            verdict: "no",
            feedback: "Possible, but small next to the real risk: a fall in the shower with someone not trained in safe personal care.",
          },
          {
            text: "Dot slips, and Jess isn’t trained, insured or approved to give personal care.",
            verdict: "best",
            feedback: "Yes. Bathrooms are where many falls happen. Personal care needs training in safe moving and assisting, and the service needs to be in Dot’s plan.",
          },
          {
            text: "Dot might ask again next week.",
            verdict: "partly",
            feedback: "Likely, and worth thinking about, but the bigger risk is today: a fall with an untrained worker. Dot asking again is a sign her needs have changed.",
          },
        ],
      },
      {
        kind: "decide",
        prompt: "What should happen now?",
        choices: [
          {
            text: "Let Jess help this once, then sort it out later.",
            verdict: "no",
            feedback: "“Just this once” is when accidents happen. It also hides a real change in Dot’s needs from the people who can plan for it.",
          },
          {
            text: "Tell Dot it’s not allowed, and leave it there.",
            verdict: "partly",
            feedback: "Jess shouldn’t help, but stopping there leaves Dot without help she needs, and she may try alone. Follow it up.",
          },
          {
            text: "Kindly explain, keep Dot safe today, and call her Care Partner to arrange personal care.",
            verdict: "best",
            feedback: "That’s it. Dot’s need is real. Her Care Partner can add personal care to her plan with a trained worker, and review whether her needs have changed.",
          },
        ],
      },
    ],
    takeaway: "If a client asks for something outside the service you’re there for, don’t do it “just this once”. Tell their Care Partner the same day so the right help can be arranged.",
    topic: { slug: "working-with-your-care-partner", title: "Working with your Care Partner" },
    look: { skin: "#f2c9a5", hair: "#e3e6ea", shirt: "#8e5aa8", glasses: true, style: "bun" },
  },
  {
    id: "ron",
    client: "Ron",
    title: "Ron’s gutters",
    teaser: "Ron wants his gardener to stay longer and clear the gutters.",
    opening: [
      "G’day! Mia’s doing a beaut job on the hedges.",
      "While she’s here, could she grab the ladder and clear the gutters? Storm season’s coming. I’ll pay for the extra hour, no worries.",
    ],
    steps: [
      {
        kind: "scope",
        prompt: "Mia is booked for two hours of gardening. Is clearing the gutters part of today’s visit?",
        choices: [
          {
            text: "Yes. It’s outside, so it counts as gardening.",
            verdict: "no",
            feedback: "Gutter cleaning is home maintenance at height, not gardening. It’s a different service, with its own safety requirements.",
          },
          {
            text: "Not as booked. It’s a different task, and extra time has to be agreed first.",
            verdict: "best",
            feedback: "Right. A different task, and extra time, both need to be checked and approved before anyone starts.",
          },
          {
            text: "Yes, as long as Ron pays Mia directly.",
            verdict: "no",
            feedback: "Cash on the side sits outside Ron’s plan and his budget records, and Mia wouldn’t be covered for it. Changes go through his coordinator.",
          },
        ],
      },
      {
        kind: "risk",
        prompt: "What are the risks of saying yes on the spot?",
        choices: [
          {
            text: "None. Ron has offered to pay.",
            verdict: "no",
            feedback: "Paying doesn’t remove the risks: a fall from a ladder, and an unapproved charge against Ron’s budget.",
          },
          {
            text: "A fall from the ladder, and a cost Ron’s budget hasn’t approved.",
            verdict: "best",
            feedback: "Exactly. Work at height needs the right equipment and training, and extra hours change what Ron pays from his budget.",
          },
          {
            text: "The hedges won’t get finished.",
            verdict: "partly",
            feedback: "True, but minor. The bigger risks are a fall from height and an unapproved cost.",
          },
        ],
      },
      {
        kind: "decide",
        prompt: "What should Mia do?",
        choices: [
          {
            text: "Do the gutters quickly. It’s only half an hour.",
            verdict: "no",
            feedback: "Quick jobs at height cause serious injuries. And the extra time wouldn’t be approved.",
          },
          {
            text: "Thank Ron, finish the hedges, and check with his coordinator about the gutters.",
            verdict: "best",
            feedback: "That’s the way. The coordinator can confirm the cost with Ron and arrange the right person and equipment for the gutters.",
          },
          {
            text: "Tell Ron to find someone himself.",
            verdict: "partly",
            feedback: "Saying no is right, but Ron has a real need before storm season. Passing it to his coordinator gets it done properly.",
          },
        ],
      },
    ],
    takeaway: "Don’t agree to extra time or a different task on the spot. Check with the client’s coordinator first, and mention the cost in plain words.",
    topic: { slug: "who-to-contact-and-when", title: "Who to contact and when" },
    look: { skin: "#e8b48f", hair: "#cfd3d8", shirt: "#3d7a4a", hat: true, style: "short" },
  },
  {
    id: "margaret",
    client: "Margaret",
    title: "Something’s not right",
    teaser: "Margaret doesn’t seem herself today, and there’s a bruise on her arm.",
    opening: [
      "Oh, hello. Are you new? I don’t think we’ve met.",
      "(You’ve visited Margaret every week for a year. She seems unsure where she is, and there’s a large bruise on her forearm she can’t explain.)",
    ],
    steps: [
      {
        kind: "scope",
        prompt: "Is noticing and passing on a change like this part of your role?",
        choices: [
          {
            text: "No. My job is the service I’m booked for.",
            verdict: "no",
            feedback: "Everyone who visits is part of keeping clients safe. Noticing and reporting changes is part of every role.",
          },
          {
            text: "Yes. Everyone who visits watches for changes and reports them.",
            verdict: "best",
            feedback: "Right. You might be the only person who sees Margaret this week. Passing on what you notice is part of the job.",
          },
          {
            text: "Only if Margaret asks me to tell someone.",
            verdict: "no",
            feedback: "Margaret may not be able to ask today. A sudden change and an unexplained injury need to be reported either way.",
          },
        ],
      },
      {
        kind: "risk",
        prompt: "What could the confusion and bruise mean?",
        choices: [
          {
            text: "Probably nothing. Everyone has off days.",
            verdict: "no",
            feedback: "It might be nothing, but sudden confusion can signal an infection or other illness, and an unexplained injury can mean a fall, or harm by someone else.",
          },
          {
            text: "Illness, a fall, or possibly harm. It needs to be looked at.",
            verdict: "best",
            feedback: "Yes. You don’t need to know the cause. Your part is to notice, keep her safe, record it and report it.",
          },
          {
            text: "She’s just tired.",
            verdict: "partly",
            feedback: "Maybe, but a sudden change plus an unexplained bruise is more than tiredness. Report it and let others look into it.",
          },
        ],
      },
      {
        kind: "decide",
        prompt: "What should you do?",
        choices: [
          {
            text: "Make sure she’s safe now, write down what you saw, and tell her coordinator today.",
            verdict: "best",
            feedback: "That’s it. If she seems unwell call for medical help, and if you suspect harm it may be a serious incident to report under SIRS. Her coordinator will guide the next steps.",
          },
          {
            text: "Mention it at next week’s visit if she’s still the same.",
            verdict: "no",
            feedback: "A week is too long. Sudden confusion and an unexplained injury need to be reported the same day.",
          },
          {
            text: "Ask a neighbour to keep an eye on her.",
            verdict: "partly",
            feedback: "Kind, but it shares her private information and doesn’t get her the help she may need. Tell her coordinator.",
          },
        ],
      },
    ],
    takeaway: "If something has changed, or you see an injury nobody can explain, keep the client safe, write down what you saw and tell their coordinator the same day.",
    topic: { slug: "sirs-in-depth-know-what-to-report", title: "SIRS in depth: know what to report" },
    look: { skin: "#f5d3b8", hair: "#bfc5cc", shirt: "#c4566e", style: "bun" },
  },
  {
    id: "ken",
    client: "Ken",
    title: "Over the fence",
    teaser: "Ken’s neighbour wants to know how he is after his hospital stay.",
    opening: [
      "(You’re leaving Ken’s place when his neighbour leans over the fence.)",
      "You’re Ken’s carer, aren’t you? I heard he was in hospital. Is it his heart again? I worry, you know. What’s going on with him?",
    ],
    steps: [
      {
        kind: "scope",
        prompt: "Is Ken’s health information yours to share with his neighbour?",
        choices: [
          {
            text: "Yes. The neighbour clearly cares about him.",
            verdict: "no",
            feedback: "Caring doesn’t give a right to Ken’s private information. It’s his to share, not yours.",
          },
          {
            text: "No. It’s Ken’s private information, even confirming you visit him.",
            verdict: "best",
            feedback: "Right. Even saying you’re his carer or that he was in hospital shares private information.",
          },
          {
            text: "Only the general picture, not the details.",
            verdict: "partly",
            feedback: "Even the general picture is Ken’s to share. Keep it to a friendly, polite response.",
          },
        ],
      },
      {
        kind: "risk",
        prompt: "What could go wrong if you answer?",
        choices: [
          {
            text: "Ken loses trust, and his private information spreads around the street.",
            verdict: "best",
            feedback: "Yes. Clients need to trust that what happens in their home stays private. It also breaks the Code of Conduct.",
          },
          {
            text: "Nothing. Neighbours talk anyway.",
            verdict: "no",
            feedback: "They might, but not because of you. Sharing breaks Ken’s trust and his privacy.",
          },
          {
            text: "The neighbour might be upset if you don’t answer.",
            verdict: "partly",
            feedback: "A polite reply usually handles that. Ken’s privacy comes first.",
          },
        ],
      },
      {
        kind: "decide",
        prompt: "What do you say?",
        choices: [
          {
            text: "“He’s doing much better, the hospital sorted his heart out.”",
            verdict: "no",
            feedback: "That confirms he was in hospital and why. It’s Ken’s private health information.",
          },
          {
            text: "Walk off without saying anything.",
            verdict: "partly",
            feedback: "It keeps his privacy, but a friendly word works better and keeps the neighbourhood on side.",
          },
          {
            text: "“I can’t talk about anyone I visit, sorry. Why not pop over and say hello to him?”",
            verdict: "best",
            feedback: "Perfect. Polite, private, and it points the neighbour to Ken himself, who can share what he chooses.",
          },
        ],
      },
    ],
    takeaway: "What you see and hear in a client’s home stays private. Be friendly, don’t confirm anything, and suggest people ask the client themselves.",
    topic: { slug: "aged-care-code-of-conduct", title: "Aged Care Code of Conduct" },
    look: { skin: "#d9a07c", hair: "#9aa1a9", shirt: "#3b6ea8", glasses: true, style: "short" },
  },
];

/* Scoring */

/** Points for a step answered best on the first try, and on a later try. */
export const POINTS = { first: 50, later: 20, questBonus: 50 } as const;
/** Points between levels. */
export const LEVEL_SIZE = 200;

export type Badge = { id: string; name: string; description: string };
export const badges: Badge[] = [
  { id: "first-knock", name: "First knock", description: "Finish your first quest." },
  { id: "scope-keeper", name: "Scope keeper", description: "Help Dot the right way." },
  { id: "safe-hands", name: "Safe hands", description: "Keep Ron off the ladder." },
  { id: "sharp-eye", name: "Sharp eye", description: "Spot what’s changed for Margaret." },
  { id: "good-neighbour", name: "Good neighbour", description: "Keep Ken’s business private." },
  { id: "first-try", name: "Spot on", description: "Finish a quest with every step right first time." },
  { id: "local", name: "Local legend", description: "Finish all four houses." },
];
