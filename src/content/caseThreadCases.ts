import type { CaseThreadData } from "@/lib/caseThread";

/*
  The two MVP cases for "What Would You Do?" Community Case Threads (docs/case-threads.md), from the PRD's section 3
  guardrails. Every person and detail is invented. The seed responses are fictional, written to show different good
  ways of speaking with the person while keeping the same safety boundary, and they say so wherever they appear.

  - Case A: Margaret wants a family friend for personal care. It keeps her choice, requires the provider to assess
    the worker's suitability and the funded service arrangement before approving, and never says informal help
    outside that arrangement is prohibited.
  - Case B: Graham refuses a safety check after a fall. It respects his informed choice while prompting immediate
    safety and a clinical response, and never labels the refusal itself a SIRS incident: incident assessment is the
    provider's decision through its incident process.

  The policy version, review date and approvals are left for the owners: Clinical, Quality, Learning and the
  Community owner confirm them before either case can be published.
*/

const HEALTH = "https://www.health.gov.au/our-work/support-at-home/delivering-services-for-support-at-home";
const unsigned = { owner: "", clinical: "", quality: "", community: "", approvedOn: "" };
const prompts = {
  say: "What would you say? Write the first two or three sentences.",
  do: "What would you do next: the checks or alternatives you’d explore, and what you’d record?",
  who: "Who needs to know, and when?",
};
const reflection = "What would you keep or change in your original response?";

/** Case A: a chosen family friend for funded personal care. */
export const CASE_FAMILY_FRIEND: CaseThreadData = {
  threadId: "wwyd-chosen-friend",
  title: "A worker the client trusts",
  audience: ["coordinator", "staff"],
  role: "You’re Margaret’s care partner (coordinator). She has rung you about her personal care.",
  aim: "Hold Margaret’s choice and the provider’s responsibility together: consider her request genuinely, explain what has to be checked before a funded worker can start, and explore alternatives with her.",
  scene:
    "Margaret self-manages her Support at Home services. She wants Jess, her niece’s friend, whom she has known for years, to help with showering and dressing. Jess has no documented insurance or completed suitability checks. Margaret says, “I chose her, and I don’t want a stranger in my bathroom.”\n\nHow do you handle the call without dismissing Margaret’s choice, or approving a funded service the provider can’t yet oversee?",
  people: ["Margaret", "Jess"],
  known: [
    "Margaret self-manages her Support at Home services and can choose her workers.",
    "Her approved plan includes help with showering and dressing three mornings a week.",
    "Jess has no documented insurance and no completed suitability checks.",
    "Margaret has known Jess for years and trusts her.",
  ],
  unknowns: [
    "Whether Jess could meet the worker suitability, insurance and agreement requirements, and how long that would take.",
    "What Margaret most wants from her personal care, and what worries her about someone she doesn’t know.",
    "Whether Margaret is managing safely this week, before anything is decided.",
    "Which operative agreement and policy version apply to a third-party worker for this service.",
  ],
  safetyCue:
    "If Margaret can’t shower or dress safely this week, that’s a care need to arrange now through the approved process. It doesn’t wait for the request to be assessed.",
  related: { title: "Your services and who can deliver them", href: "/topics" },
  prompts,
  words: { min: 100, max: 250 },
  checklist: [
    "Did I acknowledge Margaret’s choice and ask what matters to her?",
    "Did I check whether there’s a safety need this week?",
    "Did I explain what the provider has to check before a funded worker starts, without suggesting family or friends can never help her?",
    "Did I say who I’d involve, and when Margaret would hear back?",
    "Did I say what I’d record: the request, what was checked, the decision and the reasons?",
  ],
  reflection,
  caseNote: {
    title: "Case note: a chosen worker for funded personal care",
    summary:
      "Under self-management, Margaret can choose her workers. Trilogy Care, as the registered provider, stays responsible for funded services delivered through a third party, so it has to be able to meet worker suitability, insurance, service and care obligations before Jess delivers funded personal care.\n\nGenuinely consider the request. If the requirements can be met, explain the steps and timing. If they can’t, make and record a clear decision, explain the reasons to Margaret, and explore an alternative with her.",
    boundaries: [
      "Don’t approve an unchecked or uninsured worker for funded personal care.",
      "Don’t tell Margaret that family or friends can’t help her. Informal help outside the funded arrangement is her choice; this decision is about funded services.",
      "Answer from the operative agreement and current policy, not from a general rule about friends or family.",
      "Record the request, what was checked, the decision and the reasons, and tell Margaret what happens next and when.",
    ],
    teach:
      "“I understand why you trust her. Let’s talk about what you want from personal care, then check whether we can approve Jess for funded services and what evidence we’d need. I’ll explain the decision, and if the requirements can’t be met, we’ll look at another option together.”",
    sources: [
      {
        title: "Self-management by Support at Home participants (Department of Health, Disability and Ageing)",
        href: `${HEALTH}/self-management-by-support-at-home-participants`,
      },
      { title: "Services under Support at Home: third-party oversight", href: `${HEALTH}/services-under-support-at-home` },
      {
        title: "Support at Home program manual: a guide for registered providers",
        href: "https://www.health.gov.au/resources/publications/support-at-home-program-manual-a-guide-for-registered-providers",
      },
      {
        title: "Trilogy Care Third Party Contractor Agreement Template (public template, subject to the operative agreement)",
        href: "https://trilogycare.com.au/uploads/Third-Party-Contractor-Agreement-Template-1.pdf",
      },
    ],
  },
  policy: { title: "Third-party workers under self-management (operative agreement and policy)", version: "", owner: "Clinical and Quality" },
  reviewDue: "",
  seeds: [
    {
      id: "a-ask-first",
      name: "Priya",
      role: "Care partner, 6 years",
      body: "“Margaret, it makes complete sense that you want someone you know. Can I ask what matters most to you about those mornings?” Then I’d explain that before Jess can be paid from her package for showering, we need her insurance, her checks and an agreement in place, and that I’ll find out what that involves this week and ring her back on Thursday either way. I’d record the request in Margaret’s words.",
      why: "Asks what matters before explaining the checks, and gives a date to hear back.",
    },
    {
      id: "a-clear-decision",
      name: "Tom",
      role: "Senior care partner, 9 years",
      body: "I’d be straight that I can’t approve Jess for funded personal care today, and why: Trilogy Care is responsible for anyone it pays for that care. Then I’d send the request to the team that assesses third-party workers, with Margaret’s reasons written down so whoever decides reads them. If it’s a no, she hears it from me, with the reasons, and we look at the alternatives together.",
      why: "Clear about what can’t happen today without closing the door.",
    },
    {
      id: "a-informal-help",
      name: "Aisha",
      role: "Care partner, 4 years",
      body: "I’d make sure Margaret doesn’t walk away thinking friends aren’t allowed. Jess can still visit and help as a friend; that’s Margaret’s life. What we’re talking about is paying Jess from the package for personal care, and the checks that come with that. Putting it that way usually takes the heat out of the call.",
      why: "Separates informal help from a funded service.",
    },
    {
      id: "a-safety-now",
      name: "Ben",
      role: "Care partner, 7 years",
      body: "Before anything else I’d ask how she’s managing this week: is she getting in and out of the shower safely? If there’s a gap, I’d arrange cover through the usual process while the request is assessed, and ask whether she’d like to meet the worker first or choose the time. Then I’d note what we agreed and who’s following up.",
      why: "Checks the immediate need first, and offers a choice within it.",
    },
  ],
  approval: unsigned,
};

/** Case B: a safety check refused after a fall. */
export const CASE_REFUSED_CHECK: CaseThreadData = {
  threadId: "wwyd-refused-check",
  title: "A safety check refused after a fall",
  audience: ["coordinator", "staff"],
  role: "You’re Graham’s care partner (coordinator), on a scheduled phone check-in.",
  aim: "Respect Graham’s informed choice while checking his immediate safety, offering alternatives, involving the clinical team under approved policy and recording the conversation, without closing it as ‘refused’ or treating the refusal itself as an incident.",
  scene:
    "Graham, 84, lives alone and has domestic assistance and shopping support through Support at Home. On a scheduled check-in call he mentions that he slipped in the hallway two days ago, on the afternoon the floors were mopped, and “got himself up after a while”. He says he’s sore but fine.\n\nWhen you suggest a nurse visit or a GP review, he says: “I’m not having people fussing over me. If you send someone, I won’t open the door.”",
  people: ["Graham"],
  known: [
    "Graham lives alone, with domestic assistance and shopping support under Support at Home.",
    "He says he slipped two days ago, on the afternoon his floors were mopped, and got himself up after a while.",
    "He says he’s sore but fine, and he’s talking clearly on the phone.",
    "He has said no to a nurse visit and a GP review, and says he won’t open the door if someone is sent.",
  ],
  unknowns: [
    "Whether he hit his head, what hurts, and whether he can move, eat and use the bathroom safely.",
    "Whether anything has changed since the fall: new confusion, dizziness or more pain.",
    "Why he doesn’t want a visit: past experience, cost, pride, or worry about losing his independence.",
    "Whether the fall needs incident assessment because it may be connected with a service. That’s for the provider’s incident process to decide.",
  ],
  safetyCue:
    "If Graham describes signs of a serious injury, a knock to the head, new confusion, or can’t get up, follow the emergency pathway straight away: call 000, then the clinical team. Don’t wait for the conversation to finish.",
  related: { title: "Incident first steps", href: "/tools/sirs-first-steps" },
  prompts,
  words: { min: 100, max: 250 },
  checklist: [
    "Did I check for immediate danger, and do I know the emergency pathway?",
    "Did I listen to Graham’s reasons before offering options?",
    "Did I explain my concern in a way he could understand, without pressure or threats?",
    "Did I offer alternatives he might accept, and involve the clinical team under policy?",
    "Did I record the conversation, his choice and the follow-up, and leave incident assessment to the incident process?",
  ],
  reflection,
  caseNote: {
    title: "Case note: an informed choice after a fall",
    summary:
      "Graham has the right to make choices about his care, including ones that carry risk. Your job is to establish immediate safety and follow any emergency pathway, listen to his reasons, explain the concern in a way he understands, offer alternatives, and involve the clinical or care partner team under approved policy. Record the conversation, what he chose and the follow-up.\n\nAn informed refusal is not automatically a SIRS incident. A fall that may be connected with service delivery may need incident assessment, and the provider makes that decision through its incident process.",
    boundaries: [
      "Check immediate safety first. Signs of a serious injury, a knock to the head or new confusion go to the emergency pathway now.",
      "Don’t coerce, threaten or argue, and don’t close it as “the client said no, case closed”.",
      "Don’t label the refusal itself a SIRS incident. Whether the fall needs incident assessment is decided through the provider’s incident process.",
      "A real fall, injury or deterioration happening now goes through the approved clinical and incident pathway, never to this thread for a vote.",
    ],
    teach:
      "“Thanks for telling me, Graham. I’m not trying to take over; I’d just like to understand how you’re going. Did you hit your head, and where does it hurt? … You’re in charge of who comes in. Would it be easier if the nurse rang you first, or if we booked the GP at a time that suits you? Either way, I’ll note what we’ve agreed and ring you tomorrow.”",
    sources: [
      {
        title: "Aged Care Quality and Safety Commission: Strengthened Quality Standards, care and services",
        href: "https://www.agedcarequality.gov.au/strengthened-quality-standards/care-and-services",
      },
      {
        title: "Reportable incidents and SIRS provider guidelines (October 2026)",
        href: "https://www.agedcarequality.gov.au/sites/default/files/media/reportable_incidents_and_sirs_provider_guidelines.pdf",
      },
    ],
  },
  policy: { title: "Choice, supported risk and incident management (approved policy)", version: "", owner: "Clinical and Quality" },
  reviewDue: "",
  seeds: [
    {
      id: "b-slow-down",
      name: "Mei",
      role: "Care partner, 7 years",
      body: "I’d slow right down: “Graham, it’s your home and your call. I just want to know you’re OK.” Then the safety questions, plainly: did he hit his head, where does it hurt, can he get to the bathroom and make a meal. If anything sounds serious, I’d tell him I’m calling for help and why. If not, I’d offer the smallest step he’ll accept, like the nurse phoning him instead of visiting.",
      why: "Respects his control while still asking the safety questions directly.",
    },
    {
      id: "b-reason-behind",
      name: "Daniel",
      role: "Senior care partner, 11 years",
      body: "I’d ask what’s behind the no. Often it’s a fear of being moved out of home, so I’d say straight that a check is about keeping him safely at home. Then I’d write down his words, let the clinical team know today, and leave it to the incident process to decide whether the fall needs assessing. That isn’t a call I make on the phone.",
      why: "Finds the reason for the refusal, and leaves incident assessment to the process.",
    },
    {
      id: "b-keep-door-open",
      name: "Rosa",
      role: "Care partner, 3 years",
      body: "Two things I wouldn’t do: threaten to send someone anyway, or write “declined, closed”. I’d agree a follow-up call for tomorrow, ask whether he’d be happy for his daughter or a neighbour to look in, and record exactly what I offered and what he chose.",
      why: "Keeps the door open and the record clear.",
    },
    {
      id: "b-the-floors",
      name: "Hana",
      role: "Care partner, 5 years",
      body: "I’d also think about the floors. If he slipped after the mopping visit, I’d pass that to the team so the incident process can look at it, and ask for the floors to be left dry before the worker goes. Fixing the cause matters as much as the conversation.",
      why: "Notices the possible link to a service and passes it to the right process.",
    },
  ],
  approval: unsigned,
};

export const CASE_THREAD_CASES: { id: string; label: string; data: CaseThreadData }[] = [
  { id: "family-friend", label: "Case A: Margaret and a family friend for personal care", data: CASE_FAMILY_FRIEND },
  { id: "refused-check", label: "Case B: a safety check refused after a fall", data: CASE_REFUSED_CHECK },
];
