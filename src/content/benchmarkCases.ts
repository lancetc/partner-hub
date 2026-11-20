import type { BenchmarkBlockData } from "@/lib/benchmark";

/*
  The starter case for the peer benchmark poll (docs/peer-benchmark-poll.md): two missed check-in calls, drafted
  from the PRD. It's fictional and has no sign-off, so a course using it can't be published until Care
  Operations, Clinical, Quality and Privacy have reviewed the wording, the reviewed next step, the escalation
  facts and the disclosure threshold. The policy is a placeholder until the approved unsuccessful-contact
  procedure is named. It never teaches a fixed "two missed calls" rule.
*/

const missedCheckIn: BenchmarkBlockData = {
  title: "Two missed check-in calls",
  intro: "Decide your next step, lock it in, then see how other people chose and what the reviewed guidance says.",
  scenario: {
    heading: "Mr Patel hasn’t answered two check-in calls",
    role: "You’re the Care Partner who calls Mr Patel for his scheduled check-ins.",
    facts: [
      "Mr Patel self-manages his services.",
      "He hasn’t answered two scheduled check-in calls.",
      "His daughter says, “Dad’s fine, just busy”, but she last spoke to him four days ago.",
      "Your last direct contact with him was a week ago.",
      "Nothing you’ve been told suggests a new symptom or immediate danger.",
    ],
    unknowns: [
      "Whether anyone has spoken with him directly since.",
      "What his agreed contact plan says about missed calls.",
      "Whether any worker has seen him.",
    ],
    question: "What is your next step?",
  },
  version: 1,
  choices: [
    {
      id: "pc-close",
      text: "Record the daughter’s reassurance as confirmation that he’s well, and close the check-in.",
      kind: "critical",
      feedback: "Her “he’s fine” is four days old and second-hand. It doesn’t confirm contact with him today, so the check-in isn’t done.",
    },
    {
      id: "pc-verify",
      text: "Verify when someone last had direct contact, retry through the agreed channels, check his contact plan, and use the approved unsuccessful-contact pathway with an owner and a timeframe.",
      kind: "preferred",
      feedback: "This checks the fact that matters (direct contact), uses his agreed plan, and follows the approved pathway with someone owning the next step.",
    },
    {
      id: "pc-welfare",
      text: "Request an immediate welfare check based only on the two missed calls, without reviewing the context or the procedure.",
      kind: "insufficient",
      feedback:
        "With no new concern in the facts, acting before checking the context and the procedure skips the steps that set the right urgency. A new acute concern would change that.",
    },
    {
      id: "pc-wait",
      text: "Wait for the next routine monthly check-in, without documenting or following up.",
      kind: "critical",
      feedback: "Unsuccessful contact needs following up and recording. Waiting a month with nothing on file leaves nobody owning it.",
    },
  ],
  askConfidence: true,
  askReason: true,
  perspective: {
    label: "Clinical and Quality perspective",
    critical: false,
    reasoning:
      "The daughter’s statement doesn’t confirm contact today. Check the last verified contact and Mr Patel’s agreed plan before deciding how urgent this is.",
    checkNext: "When anyone last spoke with him directly; the other channels he’s agreed to; what his contact or risk plan says about missed calls.",
    thresholds: "A new acute concern, or an unanswered door at a scheduled visit, would call for a different urgency under the applicable procedure.",
    distinguish: "",
    nextStep: "Document each attempt, assign a follow-up owner and a time, and take the route the reviewed procedure sets out.",
  },
  policy: { id: "approved-unsuccessful-contact-sop", title: "", url: "", version: "" },
  cohorts: [
    { id: "pc-partners", label: "Care Partners", audiences: ["partner"] },
    { id: "pc-coordinators", label: "Care coordinators", audiences: ["coordinator"] },
  ],
  minCohort: 20,
  batchMinutes: 15,
  community: {
    postId: "case-missed-check-in",
    rationales: [
      { commentId: "mci1", endorsedBy: "", endorsedOn: "" },
      { commentId: "mci2", endorsedBy: "", endorsedOn: "" },
    ],
  },
  reviewDue: "",
  approval: { owner: "", operations: "", clinical: "", quality: "", privacy: "", approvedOn: "" },
};

export const BENCHMARK_CASES: { id: string; name: string; teaches: string; data: BenchmarkBlockData }[] = [
  {
    id: "missed-check-in",
    name: "Two missed check-in calls",
    teaches: "A relative’s reassurance isn’t verified contact; the approved pathway sets the urgency, not the poll.",
    data: missedCheckIn,
  },
];
