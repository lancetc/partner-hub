import { ONE_DAY_VERSION, type Commitment, type OneDayData } from "@/lib/oneDay";

/*
  One Day, Five Perspectives starter case (docs/one-day-five-perspectives.md): Leila's Monday, from the PRD's canonical
  first-release sequence. Everyone is fictional. Mrs Patel, Dot and Fiona are the Hub's recurring characters (Dot keeps
  her roses, her Thursday bowls and her habit of doing things herself; Fiona works full time and worries). Mr Tan's
  physio query follows his Coordinator's Day story. Leila, Asha, Amira and the supplier and Trilogy Care staff are new
  fictional seeds, for the Character Library owner to check.

  It isn't a claim about real turnaround times, rates or who approves what at Trilogy Care: Operations, Quality,
  Billing, supplier onboarding and privacy review it before it's published, and it starts with no sign-off.

  State the day keeps:
    patel.cover   none | thursday | open | joy (an unapproved promise) | waiting-tue | promised (an unconfirmed promise)
    dot.plan      none | asked | removed | ignored | handed | emailed
    tan.status    none | review | vague | wrong
*/

const c = (id: string, thread: string, owner: string, action: string, due: string, status: Commitment["status"] = "open"): Commitment => ({
  id,
  thread,
  owner,
  action,
  due,
  status,
});

export const LEILAS_MONDAY: OneDayData = {
  title: "One Day, Five Perspectives: Leila’s Monday",
  intro:
    "Follow a working day with Leila, a Care Coordinator, across three people’s stories. Make her decisions, step briefly into other people’s shoes, and keep track of what Leila actually knows.",
  version: ONE_DAY_VERSION,
  day: "Monday, 8:30 am to 5:00 pm",
  coordinator: "leila",
  threads: [
    { id: "patel", name: "Mrs Patel", goal: "A reliable Tuesday cleaner, so she can host her book group.", pattern: "dots" },
    { id: "dot", name: "Dot", goal: "To keep tending her roses herself.", pattern: "stripes" },
    { id: "tan", name: "Mr Tan", goal: "To understand a physio charge, and whether future visits will cost more.", pattern: "waves" },
  ],
  actors: [
    { id: "mrs-patel", name: "Mrs Patel", lane: "clients", thread: "patel", about: "In her late seventies. Hosts a book group at home on Tuesday afternoons." },
    {
      id: "asha",
      name: "Asha",
      lane: "clients",
      badge: "Mrs Patel’s daughter",
      thread: "patel",
      about: "Helps her mum with appointment changes, within the limits Mrs Patel has chosen.",
    },
    { id: "dot", name: "Dot", lane: "clients", thread: "dot", about: "84. Practical, funny and firm about doing things herself. Her roses are her pride." },
    {
      id: "fiona",
      name: "Fiona",
      lane: "clients",
      badge: "Dot’s daughter",
      thread: "dot",
      about: "Works full time. Wants to know her mum is safe and to be told when something changes.",
    },
    { id: "mr-tan", name: "Mr Tan", lane: "clients", thread: "tan", about: "Sees a physio fortnightly to keep walking. Careful with money." },
    { id: "leila", name: "Leila", lane: "coordinator", about: "A Care Coordinator keeping planned care running, returning calls and recording next steps." },
    {
      id: "amira",
      name: "Amira",
      lane: "principal",
      badge: "Care Partner principal",
      about: "Runs the local Care Partner business. Helps with priorities and contractor continuity, within her approved access.",
    },
    { id: "cleaner", name: "Brightway Home Services", lane: "suppliers", badge: "Cleaning", about: "Mrs Patel’s cleaning company. Rosters a week ahead." },
    { id: "gardener", name: "Sam", lane: "suppliers", badge: "Gardener", about: "Dot’s gardener, every second Wednesday." },
    { id: "physio", name: "Kiran", lane: "suppliers", badge: "Physiotherapist", about: "Mr Tan’s physio." },
    { id: "onboarding", name: "Priya", lane: "trilogy", badge: "Supplier onboarding", about: "Checks new workers’ evidence before they’re approved." },
    { id: "quality", name: "Helen", lane: "trilogy", badge: "Quality", about: "Reviews proposed plans where there’s a risk question." },
    { id: "billing", name: "Tom", lane: "trilogy", badge: "Billing", about: "Checks invoices against the approved rate." },
  ],
  facts: [
    // Known to Leila when the day starts
    {
      id: "t-queued",
      thread: "tan",
      kind: "status",
      text: "Mr Tan’s invoice query is in Billing’s queue, and Leila promised him an update today.",
      holders: ["leila", "billing", "mr-tan"],
    },
    {
      id: "p-asha-scope",
      thread: "patel",
      kind: "fact",
      text: "Mrs Patel has asked that Asha help with appointment changes. Her budget and health details aren’t part of that.",
      holders: ["leila", "mrs-patel", "asha"],
    },
    {
      id: "p-budget",
      thread: "patel",
      kind: "fact",
      text: "Mrs Patel’s remaining quarterly budget, and a recent hospital visit.",
      holders: ["leila", "mrs-patel"],
      private: true,
    },
    // Mrs Patel
    { id: "p-cancel", thread: "patel", kind: "status", text: "Mrs Patel’s Tuesday cleaner has cancelled tomorrow’s visit.", holders: ["cleaner", "mrs-patel"] },
    { id: "p-thursday", thread: "patel", kind: "status", text: "Brightway can offer Thursday at 10 am, and nothing sooner.", holders: ["cleaner"] },
    {
      id: "p-bookgroup",
      thread: "patel",
      kind: "preference",
      text: "Mrs Patel hosts her book group on Tuesday afternoons; that’s why the Tuesday clean matters.",
      holders: ["mrs-patel", "asha"],
    },
    { id: "p-strangers", thread: "patel", kind: "preference", text: "She doesn’t want someone she hasn’t met turning up on Thursday.", holders: ["mrs-patel"] },
    {
      id: "p-candidate",
      thread: "patel",
      kind: "status",
      text: "Another cleaner, Joy, is under review by supplier onboarding: her police check and insurance evidence are pending. She isn’t approved.",
      holders: ["onboarding", "amira"],
    },
    { id: "p-joy-keen", thread: "patel", kind: "belief", text: "Joy has told Amira she’d love some Tuesday work.", holders: ["amira"] },
    { id: "p-local-gap", thread: "patel", kind: "fact", text: "No approved local cleaner has Tuesday capacity this week or next.", holders: ["amira"] },
    {
      id: "p-wait",
      thread: "patel",
      kind: "preference",
      text: "Mrs Patel would rather wait for next Tuesday than have Thursday, if Tuesday can be confirmed.",
      holders: ["mrs-patel"],
    },
    { id: "p-roster", thread: "patel", kind: "status", text: "Brightway won’t know about next Tuesday until Friday’s roster is done.", holders: ["cleaner"] },
    // Dot
    {
      id: "d-ladder",
      thread: "dot",
      kind: "fact",
      text: "Dot has been using a stepladder to reach the climbing roses on the back fence.",
      holders: ["dot", "fiona"],
    },
    { id: "d-fiona-worry", thread: "dot", kind: "preference", text: "Fiona is frightened Dot will fall, and wants the ladder gone.", holders: ["fiona"] },
    {
      id: "d-roses",
      thread: "dot",
      kind: "preference",
      text: "Pruning her roses is the part of the week Dot loves most; she’s done it for forty years.",
      holders: ["dot"],
    },
    {
      id: "d-low-ok",
      thread: "dot",
      kind: "preference",
      text: "Dot would let someone else do the high climbers, as long as she keeps the low beds.",
      holders: ["dot"],
    },
    {
      id: "d-gardener-high",
      thread: "dot",
      kind: "status",
      text: "Sam can do the high pruning on his visit in two weeks, not this week.",
      holders: ["gardener"],
    },
    { id: "d-quality", thread: "dot", kind: "status", text: "Quality can review a proposed plan this week; it doesn’t decide it today.", holders: ["quality"] },
    // Mr Tan
    {
      id: "t-invoice",
      thread: "tan",
      kind: "fact",
      text: "Mr Tan’s statement shows a higher physio rate for his session on the 3rd.",
      holders: ["mr-tan", "billing"],
    },
    { id: "t-worry", thread: "tan", kind: "preference", text: "Mr Tan is worried future visits will cost more and he’ll have to stop.", holders: ["mr-tan"] },
    { id: "t-agreement", thread: "tan", kind: "fact", text: "Mr Tan’s service agreement lists the physio at the original rate.", holders: ["billing"] },
    {
      id: "t-proposed",
      thread: "tan",
      kind: "belief",
      text: "Kiran is proposing a higher rate for future sessions. It hasn’t been agreed.",
      holders: ["physio"],
    },
  ],
  start: { "patel.cover": "none", "dot.plan": "none", "tan.status": "none" },
  events: [
    {
      id: "e-plan",
      time: "08:30",
      title: "Plan the day",
      lane: "coordinator",
      actor: "leila",
      kind: "scheduled",
      artefact: {
        kind: "plan",
        from: "Leila’s task list",
        body: "Mrs Patel: cleaning tomorrow (Tuesday). Dot: asked for a chat about her garden. Mr Tan: update promised today on his invoice query (with Billing). New messages will come in through the day.",
      },
      lenses: [
        {
          actor: "amira",
          knows: "The local cleaners I work with are stretched early in the week.",
          wants: "To help Leila keep services running without promising anything I can’t deliver.",
          canDecide: "Which of my approved contractors I ask, and when I raise a capacity gap.",
          needs: "To hear exactly what kind of gap it is (which day, and why it matters) before I go looking.",
          facts: ["p-local-gap"],
        },
        {
          actor: "billing",
          knows: "Mr Tan’s query is in my queue. I can check an invoice against the agreed rate.",
          wants: "The right rate paid, and the participant told through the right process.",
          canDecide: "Whether a charge matches the approved rate. Not what to tell Mr Tan about his own contributions.",
          needs: "Leila to tell me if he calls again, and not to promise him an answer before I’ve checked.",
          facts: ["t-agreement"],
        },
      ],
      decision: {
        prompt: "How does Leila order her day?",
        options: [
          {
            id: "list",
            text: "Put each promise on the list with a time (Mr Tan’s update by 2 pm, Dot’s call before lunch) and leave room for whatever comes in.",
            feedback:
              "A plan that shows every promise, with a time, means a busy morning can’t quietly bury Mr Tan’s update. Leaving room is realistic: something always comes in.",
            effect: {
              score: { prioritisation: 3 },
              commit: [c("c-tan", "tan", "leila", "Give Mr Tan the update promised on his invoice query", "Today, by 2 pm")],
            },
          },
          {
            id: "first",
            text: "Start with whatever comes in first and work down from there.",
            feedback: "Working in arrival order feels responsive, but it hides the promise to Mr Tan. Nothing on the list says when his update is due.",
            effect: { score: { prioritisation: 1 } },
          },
          {
            id: "tan-first",
            text: "Ring Mr Tan straight away and tell him the old rate still stands.",
            needs: ["t-agreement"],
            feedback: "Leila hasn’t seen his agreement or heard from Billing yet, so she can’t tell him which rate stands.",
            effect: { score: { prioritisation: 1, accuracy: 1 } },
          },
        ],
      },
    },
    {
      id: "e-cancel",
      time: "09:10",
      title: "Cleaner cancelled",
      lane: "suppliers",
      thread: "patel",
      actor: "cleaner",
      kind: "unexpected",
      artefact: {
        kind: "message",
        from: "Brightway Home Services",
        body: "Sorry, Rosa is off sick tomorrow, so we’ve had to cancel Mrs Patel’s Tuesday clean. We can send someone on Thursday at 10 am.",
      },
      tells: ["p-cancel", "p-thursday"],
      lenses: [
        {
          actor: "mrs-patel",
          knows: "Brightway rang me: my cleaner can’t come tomorrow.",
          wants: "My Tuesday clean. My book group comes on Tuesday afternoon, and I don’t want a stranger arriving on Thursday.",
          canDecide: "What suits me, and who I let into my home.",
          needs: "Someone to ask me what would actually help, not just fill a gap on any day.",
          facts: ["p-bookgroup", "p-strangers"],
          reply: {
            prompt: "As Mrs Patel, what do you say if Thursday is offered?",
            options: [
              {
                id: "tuesday",
                text: "“Thursday’s no good. Tuesday is the day that matters to me.”",
                sounds: "Clear and polite. Leila only hears this if she asks you.",
              },
              {
                id: "fine",
                text: "“I suppose Thursday will have to do.”",
                sounds: "Agreeable, but it hides what matters. A coordinator who asks a second question would hear more.",
              },
            ],
          },
        },
        {
          actor: "asha",
          knows: "Mum’s clean is off tomorrow. I help her with appointment changes.",
          wants: "It sorted quickly so Mum isn’t stressed before book group.",
          canDecide: "Appointment changes, within the limits Mum has set.",
          needs: "To know what’s confirmed. I don’t see Mum’s budget or health details, and that’s her choice.",
          facts: ["p-asha-scope", "p-bookgroup"],
        },
        {
          actor: "cleaner",
          knows: "Rosa is off sick. Thursday at 10 is the only gap we have this week.",
          wants: "To keep the client if we can.",
          canDecide: "Which of our rostered staff can go, and when.",
          needs: "A yes or no on Thursday by the end of today.",
          facts: ["p-thursday"],
        },
      ],
      decision: {
        prompt: "What does Leila do first?",
        options: [
          {
            id: "ask",
            text: "Call Mrs Patel: tell her about the cancellation, ask what matters about the day and the person, and say she’ll check what’s possible.",
            feedback:
              "Asking turned up what the message didn’t say: Tuesday matters because of her book group, and she doesn’t want a stranger on Thursday. Now Leila knows it too, with a time and a source.",
            effect: {
              tell: ["p-bookgroup", "p-strangers"],
              score: { voice: 3, accuracy: 3 },
              commit: [c("c-patel", "patel", "leila", "Call Mrs Patel back with what’s confirmed", "Today, by 11 am")],
            },
          },
          {
            id: "thursday",
            text: "Accept Thursday at 10 and let Mrs Patel know it’s sorted.",
            feedback:
              "Thursday is a real offer, but no one asked Mrs Patel what she wanted. A replacement on any day isn’t the same as a solution, and it may come back later.",
            effect: { set: { "patel.cover": "thursday" }, score: { voice: 0, adaptation: 1 } },
          },
          {
            id: "keep-tuesday",
            text: "Tell Mrs Patel she’ll keep her Tuesday slot, since that’s when she hosts book group.",
            needs: ["p-bookgroup"],
            feedback: "No one has told Leila about the book group. You heard it as Mrs Patel; Leila would have to ask her first.",
            effect: { score: { voice: 1 } },
          },
          {
            id: "asha-budget",
            text: "Text Asha everything, including what’s left in her mum’s budget, so she can sort it out.",
            feedback:
              "Asha helps with appointments, within limits Mrs Patel chose. Her mum’s budget and health details aren’t hers to receive. Tell Asha what she needs for the appointment change, and nothing more.",
            effect: { flag: ["private-shared"], score: { boundaries: 0 } },
          },
        ],
      },
    },
    {
      id: "e-supplier",
      time: "10:30",
      title: "Supplier update",
      lane: "trilogy",
      thread: "patel",
      actor: "onboarding",
      kind: "waiting",
      artefact: {
        kind: "email",
        from: "Priya, supplier onboarding",
        body: "Joy’s application is under review. Her police check and insurance evidence are still pending, so she isn’t approved to deliver services yet. I’ll update you when it’s complete.",
      },
      tells: ["p-candidate"],
      lenses: [
        {
          actor: "amira",
          knows: "Joy is keen. But no approved cleaner I work with has Tuesday free.",
          wants: "To help, without counting someone who isn’t approved yet.",
          canDecide: "Who I ask among approved contractors, and when to raise a repeated gap.",
          needs: "Leila to tell me it’s a Tuesday gap and why, so I look for the right thing.",
          facts: ["p-local-gap", "p-joy-keen"],
        },
        {
          actor: "onboarding",
          knows: "Joy’s evidence is pending. Until it’s complete, she isn’t approved.",
          wants: "No one delivering care before the checks are done.",
          canDecide: "When a worker’s onboarding is complete. Not when it will be.",
          needs: "No one to promise Joy to a client in the meantime.",
          facts: ["p-candidate"],
        },
      ],
      decision: {
        prompt: "What does Leila tell Mrs Patel, and who does she ask for help?",
        options: [
          {
            id: "truthful",
            text: "Tell Mrs Patel what’s confirmed (Thursday is available; Tuesday isn’t yet), ask Amira to look for approved Tuesday cover because of the book group, and say when she’ll call next.",
            needs: ["p-bookgroup"],
            feedback:
              "An honest update with an owner and a time. Amira now knows it’s a Tuesday continuity gap, not just ‘any clean this week’. No cover exists yet, and that’s all right to say.",
            effect: {
              set: { "patel.cover": "open" },
              score: { handoff: 3, accuracy: 3, boundaries: 3 },
              commit: [
                c("c-patel", "patel", "leila", "Call Mrs Patel with an update on Tuesday cover", "Today, 3 pm"),
                c("c-amira", "patel", "amira", "Look for approved Tuesday cover near Mrs Patel", "Today, 3 pm", "waiting"),
              ],
            },
          },
          {
            id: "joy",
            text: "Tell Mrs Patel that Joy can do Tuesdays.",
            feedback:
              "Joy isn’t approved. Her checks are pending, and an enthusiastic message isn’t confirmed cover. Promising her gives Mrs Patel a false assurance.",
            effect: { set: { "patel.cover": "joy" }, flag: ["unapproved-worker"], score: { accuracy: 0, boundaries: 0 } },
          },
          {
            id: "any",
            text: "Ask Amira to find any cleaner this week, and tell Mrs Patel she’ll be in touch.",
            feedback: "Amira is looking, but for the wrong thing: any day, not Tuesday. And ‘I’ll be in touch’ gives Mrs Patel no time to expect a call.",
            effect: {
              set: { "patel.cover": "open" },
              score: { handoff: 1, accuracy: 2 },
              commit: [c("c-amira", "patel", "amira", "Find any cleaner for Mrs Patel this week", "This week", "waiting")],
            },
          },
          {
            id: "wait",
            text: "Say nothing until onboarding approves Joy.",
            feedback: "Waiting for an approval no one has promised leaves Mrs Patel without news. She doesn’t need a fix to deserve an update.",
            effect: { set: { "patel.cover": "open" }, score: { prioritisation: 1, voice: 0 } },
          },
        ],
      },
    },
    {
      id: "e-roses",
      time: "11:00",
      title: "Dot’s roses",
      lane: "clients",
      thread: "dot",
      actor: "fiona",
      kind: "scheduled",
      artefact: {
        kind: "message",
        from: "Fiona",
        body: "Mum was up the ladder at the roses again on Saturday. Can you just take the ladder away? I can’t keep worrying about this.",
      },
      tells: ["d-ladder", "d-fiona-worry"],
      lenses: [
        {
          actor: "dot",
          knows: "Fiona’s been on at me about the ladder again.",
          wants: "My roses. Forty years I’ve pruned them. I’m not having them taken off me.",
          canDecide: "How I spend my days, and what help I accept.",
          needs: "Someone to ask me what I’d settle for, instead of deciding over my head.",
          facts: ["d-roses", "d-low-ok"],
          reply: {
            prompt: "As Dot, what do you say if someone asks about the high climbers?",
            options: [
              { id: "deal", text: "“Sam can do the tall ones. The low beds are mine.”", sounds: "A workable middle. Leila only hears it if she asks Dot." },
              { id: "no", text: "“Nobody touches my roses.”", sounds: "Firm. Underneath it is a fear of losing something she loves." },
            ],
          },
        },
        {
          actor: "fiona",
          knows: "Mum was up the ladder on Saturday.",
          wants: "To know she’s safe. I work full time; I can’t be there every weekend.",
          canDecide: "What I ask for. Not what Mum does in her own garden.",
          needs: "To be told what’s agreed, if Mum’s happy for me to know.",
          facts: ["d-fiona-worry"],
        },
        {
          actor: "gardener",
          knows: "I’m at Dot’s every second Wednesday.",
          wants: "To help, within what I’m booked to do.",
          canDecide: "What I can fit into a visit.",
          needs: "To be asked before anyone tells Dot what I’ll do.",
          facts: ["d-gardener-high"],
        },
      ],
      decision: {
        prompt: "How does Leila respond?",
        options: [
          {
            id: "ask-dot",
            text: "Call Dot: ask what the roses mean to her and what she’d let someone else do, tell her Fiona is worried, and say she’ll ask Sam and Quality about a plan.",
            feedback:
              "Dot said she’d let Sam do the high climbers if she keeps the low beds. That’s her voice in the plan, and it takes Fiona’s worry seriously without taking the roses away.",
            effect: {
              tell: ["d-roses", "d-low-ok"],
              set: { "dot.plan": "asked" },
              score: { voice: 3, boundaries: 2 },
              commit: [c("c-dot", "dot", "leila", "Tell Dot, and Fiona if Dot agrees, what’s agreed and who does what", "Today, by 4:30")],
            },
          },
          {
            id: "remove",
            text: "Agree with Fiona and arrange for the ladder to be taken away.",
            feedback:
              "Removing the ladder without speaking to Dot takes away something she loves, and her trust with it. Fiona’s worry is real; so is Dot’s choice.",
            effect: { set: { "dot.plan": "removed" }, flag: ["removed-activity"], score: { voice: 0 } },
          },
          {
            id: "leave",
            text: "Tell Fiona it’s her mum’s choice, and leave it there.",
            feedback: "Dot’s choice matters, but a fall risk has been raised. Leaving it there ignores the risk and leaves Fiona worried and unheard.",
            effect: { set: { "dot.plan": "ignored" }, score: { voice: 1, accuracy: 1 } },
          },
        ],
      },
    },
    {
      id: "e-document",
      time: "12:15",
      title: "Document and hand off",
      lane: "coordinator",
      thread: "dot",
      actor: "leila",
      kind: "scheduled",
      artefact: {
        kind: "note",
        from: "Sam, gardener (text)",
        body: "Happy to do Dot’s high pruning on my visit in two weeks. Can’t do it this week. Dot’s file is open for Leila’s note.",
      },
      tells: ["d-gardener-high"],
      lenses: [
        {
          actor: "quality",
          knows: "Nothing yet, unless Leila sends it.",
          wants: "A proposed plan, the risk question and Dot’s own view, so I can review it properly.",
          canDecide: "Advice on the risk, through our review. Not today, and not by email alone.",
          needs: "The plan, who suggested it, and what Dot wants.",
          facts: ["d-quality"],
        },
      ],
      decision: {
        prompt: "What goes on Dot’s file?",
        options: [
          {
            id: "full",
            text: "“Dot wants to keep pruning the low beds; she’s happy for Sam to do the high climbers (his visit in two weeks). Fiona worried about the ladder. Asked Quality to review the plan. Leila to call Dot, and Fiona with Dot’s OK, by 4:30.”",
            needs: ["d-low-ok"],
            feedback: "Facts, Dot’s preference, the open risk question, an owner and a time. Anyone picking this up tomorrow would know where it stands.",
            effect: {
              set: { "dot.plan": "handed" },
              score: { handoff: 3, accuracy: 3 },
              commit: [c("c-quality", "dot", "quality", "Review Dot’s proposed garden plan", "This week", "waiting")],
            },
          },
          {
            id: "emailed",
            text: "“Emailed Quality about Dot’s ladder. Done.”",
            feedback: "Sending an email isn’t an outcome. Quality hasn’t reviewed anything yet, and nothing records what Dot wants or who calls her.",
            effect: { set: { "dot.plan": "emailed" }, flag: ["sent-as-done"], score: { handoff: 0 } },
          },
          {
            id: "fiona-only",
            text: "“Fiona wants the ladder gone. Waiting on Quality.”",
            feedback: "It names an owner, but Dot isn’t in her own note. The next reader would only hear Fiona’s side.",
            effect: {
              set: { "dot.plan": "handed" },
              score: { handoff: 1, voice: 0 },
              commit: [c("c-quality", "dot", "quality", "Review the ladder risk at Dot’s", "This week", "waiting")],
            },
          },
        ],
      },
    },
    {
      id: "e-tan",
      time: "13:30",
      title: "Mr Tan’s rate question",
      lane: "clients",
      thread: "tan",
      actor: "mr-tan",
      kind: "scheduled",
      artefact: {
        kind: "call",
        from: "Mr Tan",
        body: "My statement says the physio charged more for my session on the 3rd. Is it going up for every visit now? I can’t keep going if it is.",
      },
      tells: ["t-invoice", "t-worry"],
      lenses: [
        {
          actor: "physio",
          knows: "I’ve sent a higher rate. I want it for future sessions.",
          wants: "A rate that covers my costs.",
          canDecide: "What I propose. Not what Mr Tan’s agreement says.",
          needs: "An answer through Billing.",
          facts: ["t-proposed"],
        },
        {
          actor: "billing",
          knows: "His agreement has the physio at the original rate.",
          wants: "The 3rd checked against the agreement before anyone says it’s right or wrong.",
          canDecide: "Whether a charge matches the approved rate.",
          needs: "Leila to send the query through, not to settle it on the phone.",
          facts: ["t-agreement"],
        },
      ],
      decision: {
        prompt: "What does Leila tell Mr Tan?",
        options: [
          {
            id: "separate",
            text: "Check his agreement and the invoice; tell him the 3rd is being checked by Billing against his agreed rate, no new rate has been agreed for future visits, and when she’ll call back.",
            feedback:
              "She separated the past session from a proposed future rate, didn’t guess at his contribution, routed the discrepancy and gave him a time. An update can say a review is under way.",
            effect: {
              tell: ["t-agreement"],
              set: { "tan.status": "review" },
              score: { accuracy: 3, boundaries: 3, voice: 2, handoff: 3 },
              commit: [
                c("c-tan", "tan", "leila", "Give Mr Tan the update promised on his invoice query", "Today, by 2 pm", "done"),
                c("c-billing", "tan", "billing", "Check the 3rd’s invoice against Mr Tan’s agreed rate", "Wednesday", "waiting"),
                c("c-tan2", "tan", "leila", "Call Mr Tan with Billing’s answer", "Wednesday"),
              ],
            },
          },
          {
            id: "approved",
            text: "Tell him the higher rate has been approved and applies from now on.",
            feedback:
              "Nothing has been approved. Telling him so makes a decision that belongs to the provider and Billing, and it may frighten him off his physio.",
            effect: { set: { "tan.status": "wrong" }, flag: ["approval-made"], score: { accuracy: 0, boundaries: 0 } },
          },
          {
            id: "authorise",
            text: "Tell him she’ll approve the higher charge for the 3rd so Kiran gets paid.",
            feedback: "A disputed past charge needs Billing’s review. Leila can’t authorise it, in the simulation or at work.",
            effect: { set: { "tan.status": "wrong" }, flag: ["retro-authorised"], score: { boundaries: 0 } },
          },
          {
            id: "vague",
            text: "Say she’ll look into it and get back to him.",
            feedback: "Kind, but empty: no owner, no time, and nothing about his real worry, whether future visits will cost more.",
            effect: {
              set: { "tan.status": "vague" },
              score: { accuracy: 1, handoff: 1 },
              commit: [
                c("c-tan", "tan", "leila", "Give Mr Tan the update promised on his invoice query", "Today, by 2 pm", "done"),
                c("c-tan2", "tan", "leila", "Get back to Mr Tan", "Not set"),
              ],
            },
          },
        ],
      },
    },
    {
      id: "e-patel-change",
      time: "15:00",
      title: "Mrs Patel changes the plan",
      lane: "clients",
      thread: "patel",
      actor: "mrs-patel",
      kind: "revised",
      changed: true,
      when: { key: "patel.cover", is: ["none", "thursday", "open"] },
      artefact: {
        kind: "call",
        from: "Mrs Patel",
        body: "I’ve been thinking. Thursday is no help to me. I’d rather wait until next Tuesday, if you can confirm it.",
      },
      tells: ["p-wait"],
      lenses: [
        {
          actor: "cleaner",
          knows: "Next week’s roster isn’t done until Friday.",
          wants: "Not to promise a Tuesday we can’t staff.",
          canDecide: "Our roster, on Friday.",
          needs: "Leila to wait for Friday, or find someone else.",
          facts: ["p-roster"],
        },
        {
          actor: "amira",
          knows: "No approved cleaner nearby has Tuesday this week or next. It keeps happening early in the week.",
          wants: "To raise the pattern, not just patch this week.",
          canDecide: "Whether I escalate the early-week gap to Operations.",
          needs: "Leila’s go-ahead and the details of what Mrs Patel needs.",
          facts: ["p-local-gap"],
        },
      ],
      decision: {
        prompt: "Mrs Patel’s request has changed. What does Leila do?",
        options: [
          {
            id: "revise",
            text: "Revise the plan: cancel Thursday if it’s booked, check nothing can’t wait until Tuesday, ask Brightway and Amira about next Tuesday, and promise a call on Friday.",
            feedback:
              "Her changed preference is new evidence, and it changes the status of the morning’s ‘solution’. Leila reopened it, checked the impact of waiting, and owns the callback.",
            effect: {
              set: { "patel.cover": "waiting-tue" },
              score: { adaptation: 3, voice: 3 },
              commit: [
                c("c-patel", "patel", "leila", "Call Mrs Patel on Friday about next Tuesday", "Friday"),
                c("c-amira", "patel", "amira", "Escalate the repeated early-week cleaning gap", "This week", "escalated"),
              ],
            },
          },
          {
            id: "insist",
            text: "Tell her Thursday is the best she can do.",
            feedback: "It ignores what she just told you. The plan should move when the person’s request does.",
            effect: { score: { adaptation: 0, voice: 1 } },
          },
          {
            id: "promise",
            text: "Promise her next Tuesday.",
            feedback: "Brightway can’t confirm next Tuesday until Friday. A promise now is an unconfirmed visit.",
            effect: { set: { "patel.cover": "promised" }, flag: ["unapproved-worker"], score: { accuracy: 0 } },
          },
        ],
      },
    },
    {
      id: "e-patel-correct",
      time: "15:00",
      title: "Mrs Patel asks about Joy",
      lane: "clients",
      thread: "patel",
      actor: "mrs-patel",
      kind: "revised",
      changed: true,
      when: { key: "patel.cover", is: ["joy"] },
      artefact: {
        kind: "call",
        from: "Mrs Patel",
        body: "Asha says the new cleaner, Joy, is coming on Tuesday. Is that right? I’d like to know who’s coming into my home.",
      },
      lenses: [
        {
          actor: "onboarding",
          knows: "Joy’s evidence is still pending.",
          wants: "No one delivering care before the checks are done.",
          canDecide: "When onboarding is complete.",
          needs: "The promise corrected.",
          facts: ["p-candidate"],
        },
      ],
      decision: {
        prompt: "What does Leila say?",
        options: [
          {
            id: "correct",
            text: "Tell her she got it wrong: Joy isn’t approved yet, so she can’t promise her. Say what is confirmed, and when she’ll call next.",
            feedback: "Owning the mistake quickly is the recovery. Mrs Patel now has a true picture and a time to expect a call.",
            effect: {
              set: { "patel.cover": "open" },
              score: { adaptation: 2, accuracy: 2 },
              commit: [c("c-patel", "patel", "leila", "Call Mrs Patel with an update on Tuesday cover", "Tomorrow, 10 am")],
            },
          },
          {
            id: "in-hand",
            text: "Say it’s all in hand.",
            feedback: "The false assurance stands, and now Mrs Patel is expecting someone who can’t come.",
            effect: { score: { adaptation: 0, accuracy: 0 } },
          },
        ],
      },
    },
    {
      id: "e-close",
      time: "16:30",
      title: "Close the loop",
      lane: "coordinator",
      actor: "leila",
      kind: "scheduled",
      closing: true,
      artefact: {
        kind: "note",
        from: "Leila’s handover",
        body: "Before 5 pm, give each person’s story an honest status. A clear status isn’t always a finished fix: some things stay open with an owner and a date.",
      },
      lenses: [],
    },
  ],
  truths: [
    {
      thread: "patel",
      key: "patel.cover",
      accept: {
        "waiting-tue": ["callback", "waiting"],
        open: ["waiting", "callback", "escalated"],
        thursday: ["done"],
        none: ["waiting", "callback"],
        joy: [],
        promised: [],
      },
    },
    {
      thread: "dot",
      key: "dot.plan",
      accept: {
        handed: ["waiting", "callback"],
        asked: ["callback", "waiting"],
        emailed: ["waiting"],
        removed: ["escalated"],
        ignored: ["callback"],
        none: ["callback"],
      },
    },
    { thread: "tan", key: "tan.status", accept: { review: ["waiting", "callback"], vague: ["callback"], wrong: ["escalated"], none: ["callback"] } },
  ],
  links: [
    { label: "The Coordinator’s Day", why: "More practice keeping promises across a busy day, with Dot and Mr Tan.", href: "/play/coordinators-day" },
    { label: "Your services and who can deliver them", why: "Who can deliver what, and what ‘approved’ means for a worker.", href: "/topics" },
    { label: "The client journey", why: "Where a day like this sits in a participant’s whole journey.", href: "/journey" },
  ],
  approval: { owner: "", story: "", operations: "", quality: "", billing: "", supplier: "", privacy: "", approvedOn: "", reviewBy: "" },
};

export const ONE_DAY_CASES: { id: string; label: string; data: OneDayData }[] = [
  { id: "leila-monday", label: "Leila’s Monday (Mrs Patel, Dot and Mr Tan)", data: LEILAS_MONDAY },
];
