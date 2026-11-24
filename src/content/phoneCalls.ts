import type { PhoneCallData, PhoneSource } from "@/lib/phonecall";
import { FIONA_GARDENER } from "./familyCalls";

/*
  The two pilot Tough Phone Call scenes (docs/tough-phone-call.md): a declined self-managed invoice, and a
  contractor who didn't arrive. Everyone in them is fictional. They start as drafts with no sign-off: Finance,
  Care Operations, Quality and Privacy have to review them, and the internal escalation route in the no-show
  scene is a placeholder until Care Operations supplies the approved one.
*/

const REVIEW = "2027-05-20";
const S: Record<string, PhoneSource> = {
  complaintsStandard: {
    id: "complaints-standard",
    title: "Aged Care Quality Standards, Outcome 2.6b: complaints and feedback",
    excerpt:
      "Providers encourage and support complaints without reprisal, acknowledge them and manage them transparently, respond in a timely way, and learn from them.",
    url: "https://www.agedcarequality.gov.au/strengthened-quality-standards/organisation/complaints-and-feedback-management-individuals",
    version: "Strengthened Quality Standards",
    effectiveFrom: "2025-11-01",
    reviewBy: REVIEW,
  },
  transparency: {
    id: "transparency",
    title: "Aged Care Quality Standards, Outcome 1.4: transparency and agreements",
    excerpt: "Agreements, fees and invoices are accurate, and explained in a way the older person can understand.",
    url: "https://www.agedcarequality.gov.au/strengthened-quality-standards/individual/transparency-and-agreements",
    version: "Strengthened Quality Standards",
    effectiveFrom: "2025-11-01",
    reviewBy: REVIEW,
  },
  rights: {
    id: "rights",
    title: "Statement of Rights",
    excerpt: "Older people have the right to information they can understand, to privacy, to make their own choices, and to have complaints dealt with fairly.",
    url: "https://www.agedcarequality.gov.au/older-people/your-rights/statement-rights",
    version: "Aged Care Act 2024",
    effectiveFrom: "2025-11-01",
    reviewBy: REVIEW,
  },
  tcComplaints: {
    id: "tc-complaints",
    title: "Trilogy Care: Feedback and complaints",
    excerpt:
      "A client can raise a concern, including about a provider or worker they chose, with their Care Partner or another channel. Trilogy Care acknowledges a complaint within two business days and answers within 28 days of acknowledging it, usually sooner. Those are outer limits, never a reason to delay urgent safety action.",
    url: "https://trilogycare.com.au/feedback",
    version: "Public page, checked 20 Nov 2026",
    effectiveFrom: "2026-11-20",
    reviewBy: REVIEW,
  },
  selfManagement: {
    id: "self-management",
    title: "Self-management by Support at Home participants",
    excerpt:
      "A participant can self-manage parts of their care, and the provider and participant agree the self-management activities and third-party workers in the care plan. The registered provider remains responsible for care and services, including care management.",
    url: "https://www.health.gov.au/our-work/support-at-home/delivering-services-for-support-at-home/self-management-by-support-at-home-participants",
    version: "Department of Health, Disability and Ageing",
    effectiveFrom: "2025-11-01",
    reviewBy: REVIEW,
  },
  billing: {
    id: "billing",
    title: "Trilogy Care: Support at Home billing changes",
    excerpt:
      "Invoices can be declined automatically, for example for missing itemisation, a client name that doesn’t match, ABN or GST differences, or a service the supplier isn’t approved to provide. The supplier corrects the invoice at source and resubmits it.",
    url: "https://trilogycare.com.au/support-at-home-billing-changes-what-you-need-to-know",
    version: "Public page, checked 20 Nov 2026",
    effectiveFrom: "2026-11-20",
    reviewBy: REVIEW,
  },
  missedVisit: {
    id: "missed-visit",
    title: "Missed essential visit: practice escalation route",
    excerpt:
      "Placeholder for this practice scene until Care Operations supplies the approved workflow: check on the client directly, contact the provider, and arrange a replacement visit today through the on-call route. In an emergency, call 000.",
    url: "",
    version: "Placeholder: needs Care Operations’ approved workflow",
    effectiveFrom: "2026-11-20",
    reviewBy: REVIEW,
  },
};

const UNSIGNED = { owner: "", finance: "", operations: "", quality: "", privacy: "", approvedOn: "" };

export const PHONE_CALLS: { id: string; label: string; data: PhoneCallData }[] = [
  {
    id: "declined-invoice",
    label: "The declined gardener invoice",
    data: {
      title: "The declined gardener invoice",
      person: "Karen",
      role: "says she’s Mr Hale’s daughter",
      setting: "A weekday morning. Karen has called you directly, and you have Mr Hale’s file open.",
      roleplay: {
        goal: "Take a frustrated family member’s call about a declined invoice: acknowledge it, check what you can share, find the real reason, and agree a safe next step.",
        learnerRole: "Mr Hale’s Care Partner at Trilogy Care",
        facts: [
          "Mr Hale, 84, self-manages his gardening. His gardener, Ben, has worked for him for years.",
          "His invoice shows as declined. The reason, and what you can share with this caller, aren’t on screen yet: use the case tools.",
        ],
        profile:
          "Karen Hale, 56, Mr Hale’s daughter. She lives 40 minutes away and helps her dad with paperwork. Ben told her dad his October invoice was “knocked back”, and her dad is now worried he owes Ben money and that Ben will stop coming. Karen believes “self-managed” means Trilogy Care isn’t involved. She doesn’t know the reason it was declined, only that Ben said something about having to “split it up”. She doesn’t know that her dad has agreed to her getting general updates, but not his invoices or account details. She wants Ben paid this week. If she’s told her dad’s details need checking first, she’s irritated but accepts it once she hears why. She eases a little with a concrete next step, but stays worried until she knows Ben will keep coming. She doesn’t raise anything about her dad’s health; nothing in this call is about his safety.",
        opening: "Why was Dad’s gardener invoice declined? You said he was self-managed! He’s been using Ben for years.",
        meterTitle: "Caller concern",
        states: ["Easing", "Steady", "High", "Very high", "Safety concern"],
        start: 2,
        hideMeter: false,
        minTurns: 4,
        maxTurns: 6,
        moves: [
          {
            id: "acknowledge",
            dimension: "listening",
            text: "Acknowledges the frustration and the worry about Ben before explaining anything",
            example: "I can hear how frustrating that is, especially when your dad has worked with Ben for years.",
          },
          {
            id: "permission",
            dimension: "respect",
            text: "Says they’ll check what Mr Hale has agreed to share before discussing his invoice, while still taking the concern",
            example: "Before I go into his invoice, I’ll check what your dad has asked us to share with you. I can still take down what’s happened.",
          },
          {
            id: "impact",
            dimension: "context",
            text: "Asks whether the delay is affecting a visit or support Mr Hale needs",
            example: "Has this affected a visit he needs this week?",
          },
          {
            id: "real-reason",
            dimension: "context",
            text: "Says they’ll find the actual reason in the record, or confirm it with billing, rather than guessing",
            example: "Let me look at the invoice record so I can give your dad the real reason, not a guess.",
          },
          {
            id: "self-managed",
            dimension: "communication",
            text: "Explains that self-managing is Mr Hale’s choice of worker, and Trilogy Care still checks invoices as his provider",
            example: "Your dad chooses Ben, and we still check each invoice before it’s paid. That’s part of our job as his provider.",
          },
          {
            id: "involve",
            dimension: "respect",
            text: "Keeps Mr Hale at the centre: offers to speak with him, or asks what he wants",
            example: "Would your dad like me to call him directly about this?",
          },
          {
            id: "next-step",
            dimension: "repair",
            text: "Agrees a next step: what they’ll do, who’ll act, and how Mr Hale or Karen will hear back",
            example: "I’ll look into it today and call your dad by Thursday to tell him where it’s up to.",
          },
          {
            id: "complaint",
            dimension: "repair",
            text: "Offers to record a complaint if the caller wants to make one, and says what happens next",
            example: "If you’d like to make a complaint about this, I can record it now. You’ll hear that it’s been received within two business days.",
          },
        ],
        risks: [
          {
            id: "promise",
            text: "Promises the invoice will be paid, or paid by a certain time",
            caution: "A promise like this can calm a caller, but it isn’t yours to make: payment depends on a corrected invoice being checked and approved.",
          },
          {
            id: "guess",
            text: "Gives a reason for the decline that isn’t in the record, or guesses (the reason shown in the invoice record is accurate)",
            caution: "An invented reason sends everyone in the wrong direction. Find the actual reason, or say you’ll confirm it.",
          },
          {
            id: "blame",
            text: "Blames Mr Hale, Karen or Ben, or says self-management makes it their problem",
            caution: "Self-managing doesn’t end Trilogy Care’s responsibility as the provider. Blame also closes down the conversation.",
          },
          {
            id: "recode",
            text: "Suggests changing the service type, rate or invoice so it goes through",
            caution:
              "Invoices are corrected at source by the supplier. Changing a service or rate to make an invoice pass isn’t something a Care Partner does.",
          },
          {
            id: "dismiss",
            text: "Argues, talks over the caller, or tells them to calm down",
            caution: "Arguing or telling someone to calm down usually raises the temperature, and stops you hearing what matters to them.",
          },
        ],
        safety: [
          {
            id: "alter-record",
            label: "Changing a supplier’s invoice or record",
            phrases: ["change the invoice", "change the service type", "recode it", "change the rate", "edit the invoice"],
            response:
              "Stop here. Changing a supplier’s invoice, service type or rate to get it paid isn’t something a Care Partner does, even to help a client.",
            guidance:
              "The supplier corrects the invoice at source and resubmits it. Your part is to find the actual reason, tell the client (or the person they’ve authorised) what’s needed, and follow up. If you think the record itself is wrong, raise it with the billing team.",
          },
        ],
        guidanceLabel: "Trilogy Care: Support at Home billing changes",
        guidanceHref: "https://trilogycare.com.au/support-at-home-billing-changes-what-you-need-to-know",
        voice: true,
      },
      phone: {
        kind: "billing",
        client: "Mr Hale",
        claims: "Says she’s Karen, Mr Hale’s daughter",
        permission: {
          state: "limited",
          detail: "Mr Hale has named Karen as a contact for scheduling and general updates. He hasn’t agreed to her receiving his invoices or account details.",
        },
        minutes: "4–7",
        actions: [
          {
            id: "check-caller",
            kind: "permission",
            label: "Check caller and permissions",
            facts: [
              "Karen Hale is listed as Mr Hale’s daughter, a contact for scheduling and general updates.",
              "Mr Hale hasn’t agreed to her receiving his invoices or account details.",
            ],
          },
          {
            id: "invoice",
            kind: "record",
            label: "Open invoice record",
            facts: [
              "Invoice INV-PRACTICE-0418 from Ben’s Gardens (fictional): “Garden work, October”, $260.",
              "Declined automatically: missing itemisation. It needs the date, hours and task for each visit.",
              "Ben’s Gardens is approved for gardening, and its name and ABN match the record.",
            ],
          },
          {
            id: "care-plan",
            kind: "record",
            label: "Open care plan",
            facts: [
              "Approved service: gardening, fortnightly, self-managed with Ben’s Gardens (fictional).",
              "Mr Hale chose to self-manage his gardening in March 2026. Trilogy Care remains his provider and checks invoices before they’re paid.",
            ],
          },
          {
            id: "effects",
            kind: "wellbeing",
            label: "Ask about immediate effects",
            facts: ["Nothing in the file suggests Mr Hale is without care he needs. Ben’s next visit is booked for next Tuesday."],
          },
          {
            id: "record-complaint",
            kind: "complaint",
            label: "Record a complaint",
            facts: ["Recorded for this practice: the concern, who raised it, and the next step. Nothing is created in a real system."],
          },
        ],
        restricted: ["itemised", "itemisation", "itemise", "itemized", "itemization", "260", "0418", "split it by visit"],
        dims: {
          acknowledge: "deescalation",
          permission: "privacy",
          impact: "safety",
          "real-reason": "facts",
          "self-managed": "facts",
          involve: "empathy",
          "next-step": "ownership",
          complaint: "ownership",
          promise: "facts",
          guess: "facts",
          blame: "empathy",
          recode: "facts",
          dismiss: "deescalation",
        },
        cite: {
          permission: "rights",
          "real-reason": "billing",
          "self-managed": "self-management",
          involve: "rights",
          complaint: "tc-complaints",
          "next-step": "complaints-standard",
          promise: "transparency",
          guess: "billing",
          blame: "self-management",
          recode: "billing",
        },
        alternatives: {
          promise: "“I can’t promise when it’ll be paid, but I’ll find out exactly what’s needed today and let your dad know.”",
          guess: "“Let me check the record so I give you the real reason, rather than a guess.”",
          blame: "“Your dad chooses Ben, and we’re still responsible for checking invoices. Let’s work out what’s needed.”",
          recode: "“The invoice has to be corrected by Ben, so I’ll let your dad know what Ben needs to change.”",
          dismiss: "“I can hear this has been really frustrating. Tell me what’s worrying you most.”",
        },
        urgent: null,
        sources: [S.rights, S.transparency, S.selfManagement, S.billing, S.complaintsStandard, S.tcComplaints],
        approval: UNSIGNED,
      },
    },
  },
  {
    id: "no-show",
    label: "The contractor didn’t arrive",
    data: {
      title: "The contractor didn’t arrive",
      person: "Michelle",
      role: "Mrs Duffy’s daughter",
      setting: "11.40 on a weekday. Michelle has called you directly, and you have Mrs Duffy’s file open.",
      roleplay: {
        goal: "Take a call about a missed visit: check how the client is now, treat a gap in essential help as urgent, take ownership, and agree what happens next.",
        learnerRole: "Mrs Duffy’s Care Partner at Trilogy Care",
        facts: ["Mrs Duffy, 88, lives alone. A personal care visit was booked for 8 am today with a contracted provider."],
        profile:
          "Michelle Duffy, 59, Mrs Duffy’s daughter and her authorised representative. She works an hour away. She rang her mum at 11 and her mum said nobody had come. Her mum needs a prompt for her morning tablets from her blister pack and help to shower. Her mum sounded flat, said she hadn’t taken her tablets because she was waiting for the carer, and hadn’t had breakfast. Michelle is angry but reasonable: she wants someone with her mum today, and she wants to know why nobody came. An apology on its own doesn’t settle her; she eases when the Care Partner checks on her mum and arranges help today. She doesn’t know why the worker didn’t come. She never gives medical details beyond what’s here.",
        opening: "Mum waited all morning. Nobody came, and she needs help today.",
        meterTitle: "Caller concern",
        states: ["Easing", "Steady", "High", "Very high", "Safety concern"],
        start: 2,
        hideMeter: false,
        minTurns: 4,
        maxTurns: 6,
        moves: [
          {
            id: "acknowledge",
            dimension: "listening",
            text: "Acknowledges what happened and how worrying it is, without being defensive",
            example: "That’s really worrying, and I’m sorry your mum’s been waiting all morning.",
          },
          {
            id: "wellbeing",
            dimension: "safety",
            text: "Asks how Mrs Duffy is right now: whether she’s safe, has had her tablets, and whether anyone is with her",
            example: "How is your mum right now? Has she been able to take her tablets, and is anyone with her?",
          },
          {
            id: "act-now",
            dimension: "safety",
            text: "Treats it as urgent: says they’ll check on Mrs Duffy and arrange help today, before anything routine",
            example: "I’m going to call your mum now, and arrange for someone to get to her today.",
          },
          {
            id: "find-out",
            dimension: "context",
            text: "Says they’ll find out from the provider what happened, without guessing or blaming the worker",
            example: "I’ll find out from the provider what happened this morning, and make sure it doesn’t happen again.",
          },
          {
            id: "involve",
            dimension: "respect",
            text: "Keeps Mrs Duffy involved: offers to call her directly or check what she wants",
            example: "I’ll talk with your mum too, so she knows what’s happening.",
          },
          {
            id: "own-it",
            dimension: "repair",
            text: "Takes ownership: says what they’ll do, who’ll act, and when they’ll call back",
            example: "I’ll call you back by 1 o’clock to tell you who’s coming and when.",
          },
          {
            id: "complaint",
            dimension: "repair",
            text: "Offers to record a complaint about the missed visit, without making it the first response",
            example: "Once your mum’s sorted, I can record a complaint about this if you’d like.",
          },
        ],
        risks: [
          {
            id: "routine",
            text: "Treats it as routine rescheduling (another day) without checking on Mrs Duffy",
            caution: "A missed visit that includes medication and personal care can leave someone without essential help. Check on them and act today.",
          },
          {
            id: "promise-time",
            text: "Promises a specific time someone will arrive at Mrs Duffy’s that hasn’t been confirmed (saying when they’ll call the caller back is fine)",
            caution: "A time you can’t confirm may reassure now and let everyone down later. Say what you’re doing and when you’ll call back.",
          },
          {
            id: "blame",
            text: "Guesses why the worker didn’t come, or blames the worker, Mrs Duffy or the family",
            caution: "You don’t know yet what happened. Find out, and keep the focus on getting Mrs Duffy the help she needs.",
          },
          {
            id: "process-first",
            text: "Leads with the complaints process or timeframes before checking on Mrs Duffy (offering a complaint once she’s been helped is fine)",
            caution: "The complaints timeframes are outer limits, never a reason to put safety second. Check on her first.",
          },
          {
            id: "dismiss",
            text: "Argues, talks over the caller, or tells them to calm down",
            caution: "Arguing or telling someone to calm down usually raises the temperature, and stops you hearing what matters.",
          },
        ],
        safety: [
          {
            id: "medication-advice",
            label: "Giving medication advice",
            phrases: ["double dose", "take two doses", "take double", "skip her tablets", "take them all now", "take her tablets late"],
            response: "Stop here. Advice about doses or timing isn’t something to give over the phone in this role.",
            guidance:
              "Don’t advise on medication. Check how Mrs Duffy is, and use the approved escalation route: arrange for a worker or nurse to see her today, and call 000 if she seems unwell or in danger.",
          },
        ],
        guidanceLabel: "Trilogy Care: Feedback and complaints",
        guidanceHref: "https://trilogycare.com.au/feedback",
        voice: true,
      },
      phone: {
        kind: "service",
        client: "Mrs Duffy",
        claims: "Says she’s Michelle, Mrs Duffy’s daughter",
        permission: { state: "authorised", detail: "Mrs Duffy has named Michelle as her authorised representative for her services." },
        minutes: "4–7",
        actions: [
          {
            id: "check-caller",
            kind: "permission",
            label: "Check caller and permissions",
            facts: ["Michelle Duffy is Mrs Duffy’s daughter and authorised representative for her services."],
          },
          {
            id: "service-log",
            kind: "record",
            label: "Open service log",
            facts: [
              "Personal care booked 8 to 9 am today with Coastal Care Co (fictional). Not marked as attended. No cancellation recorded.",
              "The visit includes a prompt for morning tablets from a blister pack, and help to shower.",
            ],
          },
          {
            id: "care-plan",
            kind: "record",
            label: "Open care plan",
            facts: [
              "Mrs Duffy needs a prompt for her morning tablets and standby help to shower.",
              "Practice escalation route for a missed essential visit (placeholder until Care Operations approves one): check on her directly, contact the provider, and arrange a replacement visit today through the on-call line.",
            ],
          },
          {
            id: "welfare",
            kind: "escalate",
            label: "Check on Mrs Duffy and arrange help today",
            facts: [
              "Done, for this practice: you’ve rung Mrs Duffy, who answered and says she feels tired, and asked the on-call team to arrange a replacement visit today.",
              "If she hadn’t answered, or seemed unwell, the approved route would be an urgent welfare check, or 000 in an emergency.",
            ],
          },
          {
            id: "record-complaint",
            kind: "complaint",
            label: "Record a complaint",
            facts: ["Recorded for this practice: the missed visit, who raised it, and the next step. Nothing is created in a real system."],
          },
        ],
        restricted: [],
        dims: {
          acknowledge: "deescalation",
          wellbeing: "safety",
          "act-now": "safety",
          "find-out": "facts",
          involve: "empathy",
          "own-it": "ownership",
          complaint: "ownership",
          routine: "safety",
          "promise-time": "facts",
          blame: "empathy",
          "process-first": "safety",
          dismiss: "deescalation",
        },
        cite: {
          "act-now": "missed-visit",
          wellbeing: "missed-visit",
          involve: "rights",
          complaint: "tc-complaints",
          "own-it": "complaints-standard",
          routine: "missed-visit",
          "process-first": "tc-complaints",
        },
        alternatives: {
          routine: "“Before anything else, let’s make sure your mum’s OK. I’m going to call her now and arrange help today.”",
          "promise-time": "“I’m arranging someone now, and I’ll call you back by 1 o’clock to tell you who’s coming and when.”",
          blame: "“I don’t know yet what happened, and I’ll find out. Right now, let’s get your mum the help she needs.”",
          "process-first": "“First, let’s make sure your mum’s safe and gets her help today. Then we can talk about making a complaint.”",
          dismiss: "“You’ve every reason to be upset. Tell me how your mum sounded when you spoke to her.”",
        },
        urgent: {
          cue: "And she says she hasn’t had her morning tablets. She’s on her own, and she sounded really flat.",
          afterTurn: 1,
          actionId: "welfare",
          moveIds: ["act-now"],
        },
        sources: [S.missedVisit, S.rights, S.complaintsStandard, S.tcComplaints],
        approval: UNSIGNED,
      },
    },
  },
  // A Tough Family Call (lib/familyCall): Fiona and Dot’s missed garden visit, with its own engine and five-dimension rubric.
  { id: "fiona-gardener", label: "Tough Family Call: Fiona and the missed garden visit", data: FIONA_GARDENER },
];
