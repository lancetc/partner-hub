import type { ResetBlockData } from "@/lib/reset";

/*
  The starter case for the Expectation Reset (docs/expectation-reset.md): Arthur and his daughter Chloe, waiting
  for funding. Fictional, drafted from the PRD. The scripts have no reviewer recorded, so they show as under review
  and can't be copied until they're reviewed, and a course using the case can't be published until Care
  Operations, Quality, Privacy and Communications have signed it off. The months are story positions only.
*/

const URGENT =
  "If Arthur or Chloe mentions a fall, a hospital stay, a carer who isn’t coping or anything urgent, follow the approved clinical and escalation pathway now. Don’t wait for the next check-in, and don’t take it to the Community.";

const arthur: ResetBlockData = {
  title: "Arthur’s wait: keeping in touch, honestly",
  intro: "Arthur is approved and waiting for funding. Open each marker to see how coordinators keep in useful contact without promising what nobody knows.",
  person: { name: "Arthur", about: "Wants to stay at home and have fewer calls." },
  family: { name: "Chloe", relation: "daughter" },
  consent: "Arthur has agreed Chloe may receive general progress updates, but not his detailed financial information.",
  nodes: [
    {
      id: "ar-n-nod",
      month: 0,
      label: "Notice of Decision",
      summary: "Arthur is assessed and approved for ongoing Support at Home services, and receives his Notice of Decision.",
    },
    { id: "ar-n-m3", month: 3, label: "Month 3: still waiting", summary: "Approved and actively seeking services. Funding isn’t allocated yet." },
    { id: "ar-n-m5", month: 5, label: "Month 5: still waiting", summary: "Still waiting for funding to be allocated." },
    {
      id: "ar-n-alloc",
      month: 6,
      label: "Funding allocated (in this story)",
      summary: "In this story, funding is allocated in month 6. Real waits vary with priority and approval date.",
    },
  ],
  markers: [
    {
      id: "ar-m3",
      anchor: { node: "ar-n-m3", after: "", before: "" },
      month: 3,
      label: "Month 3",
      subtitle: "A useful check-in when the date is still unknown",
      theme: "Contact rhythm",
      stage: "awaiting-allocation",
      roles: ["care_coordinator", "care_partner"],
      story: {
        now: "Arthur has been approved for three months. He’s chosen Trilogy Care and is waiting for funding to be allocated.",
        known: ["His approval and Notice of Decision are in place.", "He’s actively seeking services."],
        unknown: ["When funding will be allocated."],
        changed: ["He’s said the weekly calls are tiring when there’s no news."],
      },
      question: "",
      firstTake: false,
      featured: {
        text: "Arthur, your approval is in place, and you’re still waiting for funding to be allocated. I don’t have a start date for you yet. Would a short check-in every couple of weeks suit you, or would you rather I only call if something changes?",
        family:
          "Chloe, Arthur’s approval is in place and he’s still waiting for funding to be allocated. There isn’t a start date yet. Arthur’s chosen how often he’d like to hear from us, and I’ll let you know if anything changes.",
        why: "It says what’s known and what isn’t, and lets Arthur choose how often he hears from us.",
        reviewedBy: "",
        policyId: "",
        approvedOn: "",
        reviewDue: "",
      },
      postIds: ["waiting-rhythm", "waiting-changed", "waiting-promise"],
      max: 3,
      fallback: "",
      allowCopy: true,
      allowSave: true,
      urgent: URGENT,
    },
    {
      id: "ar-m4",
      anchor: { node: "", after: "ar-n-m3", before: "ar-n-m5" },
      month: 4,
      label: "Month 4",
      subtitle: "When the family calls again",
      theme: "Family updates",
      stage: "awaiting-allocation",
      roles: ["care_coordinator", "care_partner"],
      story: {
        now: "Arthur has a Notice of Decision and is actively seeking ongoing services. Funding is not yet allocated. Chloe calls again, asking whether it will start next month.",
        known: [
          "Arthur’s approval is in place.",
          "He wants to stay at home, and have fewer calls.",
          "Chloe may receive general progress updates, not his detailed financial information.",
        ],
        unknown: ["When funding will be allocated."],
        changed: ["Chloe is anxious, and calling more often."],
      },
      question: "What would you say to Arthur, or to Chloe?",
      firstTake: true,
      featured: {
        text: "Arthur, your approval is in place, and you are still waiting for funding to be allocated. I don’t have a confirmed start date to give you today. Would a short check-in next fortnight suit you, or would you prefer an update only if something changes? Has anything changed about the help you need since we last spoke? I’ll record what we decide and let you know who to contact sooner if your situation changes.",
        family:
          "Chloe, Arthur’s approval is in place and he’s still waiting for funding to be allocated, so I can’t give you a start date yet. I’ll keep you both updated the way Arthur has asked. If anything changes with his health or how he’s managing, call me sooner.",
        why: "It checks Arthur’s preferred contact rhythm, states the known status accurately, asks about changed needs, and makes the next step clear. The version for Chloe stays within what Arthur has agreed she can be told.",
        reviewedBy: "",
        policyId: "",
        approvedOn: "",
        reviewDue: "",
      },
      postIds: ["waiting-rhythm", "waiting-chat", "waiting-promise"],
      max: 3,
      fallback: "",
      allowCopy: true,
      allowSave: true,
      urgent: URGENT,
    },
    {
      id: "ar-m5",
      anchor: { node: "ar-n-m5", after: "", before: "" },
      month: 5,
      label: "Month 5",
      subtitle: "When something might have changed",
      theme: "Changed needs",
      stage: "awaiting-allocation",
      roles: ["care_coordinator", "care_partner"],
      story: {
        now: "Arthur is still waiting. On the last call he sounded more tired than usual.",
        known: ["His approval is in place.", "Funding isn’t allocated yet."],
        unknown: ["Whether his needs have changed.", "When funding will be allocated."],
        changed: ["He may be finding things harder at home."],
      },
      question: "",
      firstTake: false,
      featured: {
        text: "Arthur, you’re still waiting for funding, and I don’t have a date yet. Has anything changed since we last spoke: your health, getting around, or how things are at home? If it has, there may be things we can do now, like asking for your support plan to be reviewed.",
        family:
          "Chloe, there’s no date yet for Arthur’s funding. If you’ve noticed any change in how he’s managing, please tell me: there may be things we can do now rather than waiting.",
        why: "It puts changed needs first. A change may call for a Support Plan Review, which doesn’t wait for funding.",
        reviewedBy: "",
        policyId: "",
        approvedOn: "",
        reviewDue: "",
      },
      postIds: ["waiting-changed", "waiting-chat"],
      max: 3,
      fallback: "",
      allowCopy: true,
      allowSave: true,
      urgent: URGENT,
    },
  ],
  offer: { approved: false, scope: "" },
  source: { title: "", version: "" },
  approval: { owner: "", operations: "", quality: "", privacy: "", communications: "", approvedOn: "" },
};

export const RESET_CASES = [
  { id: "arthur", name: "Arthur and Chloe: waiting for funding", teaches: "Honest updates, contact rhythm, family consent and changed needs", data: arthur },
] as const;
