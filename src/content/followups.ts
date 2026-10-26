import type { CardVisual } from "./lessons";
import type { ScheduleConfig } from "@/lib/schedule";

/*
  Follow up activities: two or three cards built from the existing card types.
  1. A fresh question or decision before any explanation
  2. Feedback with the consequence, plus an optional explanation (audio with transcript)
  3. One practical takeaway, an approved reference and the next expected follow up
*/

export type FollowUpStage = "recall" | "scenario" | "apply" | "transfer" | "custom";

export type FollowUpOption = { id: string; label: string; correct: boolean; feedback: string };

export type FollowUpContent = {
  id: string;
  version: number;
  status: "draft" | "approved";
  title: string;
  stage: FollowUpStage;
  /** Concept tag used for reporting first attempt accuracy. */
  concept: string;
  objective: string;
  /** Role this variant is written for; undefined means the default for everyone. */
  role?: string;
  durationSec: number;
  question: {
    label: string;
    heading: string;
    body: string;
    prompt: string;
    visual: CardVisual;
    options: FollowUpOption[];
  };
  explain?: { heading: string; body: string; script?: string; audioSrc?: string };
  takeaway: { action: string; reference?: { title: string; url: string; issuer: string } };
  /** Approved material the activity was written from. */
  sources: { title: string; url: string }[];
  /** True while operational wording awaits subject matter approval. */
  draftWording: boolean;
};

export const stageLabel: Record<FollowUpStage, string> = {
  recall: "A quick recall",
  scenario: "A different request",
  apply: "Work it out",
  transfer: "Apply the principle",
  custom: "Follow up",
};

const changeGuide = {
  title: "Confirming a change to a visit (demo resource)",
  url: "/resources#change-request-guide",
  issuer: "Trilogy Care (demonstration source)",
};
const sources = [{ title: "A little extra time, lesson version 1.0-demo", url: "/learning/a-little-extra-time" }, { title: changeGuide.title, url: changeGuide.url }];
const objective = "Check the confirmation process before agreeing to change a visit.";

export const seedFollowUps: FollowUpContent[] = [
  {
    id: "fu-extra-time-recall",
    version: 1,
    status: "approved",
    title: "A quick recall",
    stage: "recall",
    concept: "confirm-before-change",
    objective,
    durationSec: 45,
    question: {
      label: "Quick recall",
      heading: "What happens first?",
      body: "A client asks if you could stay an extra 20 minutes today.",
      prompt: "What should happen first?",
      visual: { kind: "illustration", variant: "rings", tone: "teal", icon: "clock", alt: "Teal rings suggesting a clock" },
      options: [
        { id: "a", label: "Stay, then mention it in your visit note", correct: false, feedback: "Noting it afterwards means the change wasn’t confirmed, and the client may not expect the extra cost." },
        { id: "b", label: "Say you’re happy to check, and contact the coordinator", correct: true, feedback: "Checking first means the client knows what to expect and the change is confirmed and recorded." },
        { id: "c", label: "Explain that extra time is never possible", correct: false, feedback: "Extra time can be possible. It just needs to be confirmed with the coordinator first." },
      ],
    },
    explain: {
      heading: "Check first, every time",
      body: "Even 20 minutes changes the service and the cost. A quick check keeps the client informed and the change on record.",
      script: "Twenty minutes doesn't sound like much, but at our example rate of eighty dollars an hour it adds about twenty-seven dollars. Checking with the coordinator first means the client isn't surprised, and the change is confirmed properly.",
    },
    takeaway: { action: "Before agreeing to extra time, check with the coordinator.", reference: changeGuide },
    sources,
    draftWording: true,
  },
  {
    id: "fu-extra-time-scenario",
    version: 1,
    status: "approved",
    title: "A different request",
    stage: "scenario",
    concept: "task-change-is-service-change",
    objective,
    durationSec: 60,
    question: {
      label: "A different request",
      heading: "Same time, different task",
      body: "Mara asks you to clean the oven instead of vacuuming. The visit length stays the same.",
      prompt: "What do you do?",
      visual: { kind: "illustration", variant: "wave", tone: "sky", icon: "home", alt: "Calm blue waves with a house motif" },
      options: [
        { id: "a", label: "Swap the tasks. It’s the same amount of time", correct: false, feedback: "Even with no change in time, a different task is a change to the service. It may not be in the plan, or it may need different equipment or safety checks." },
        { id: "b", label: "Check with the coordinator whether the swap is OK", correct: true, feedback: "The coordinator can confirm whether the task fits the plan. Mara knows her request has been passed on." },
        { id: "c", label: "Do the usual tasks and don’t mention it", correct: false, feedback: "Mara’s request isn’t passed on, and she may feel unheard. Let her know you’ll check." },
      ],
    },
    explain: { heading: "A change isn’t only about time", body: "Swapping, adding or dropping a task is a change to the service, so it gets the same quick check." },
    takeaway: { action: "Treat a changed task like changed time: check before you agree.", reference: changeGuide },
    sources,
    draftWording: true,
  },
  {
    id: "fu-extra-time-scenario-gardening",
    version: 1,
    status: "approved",
    title: "A different request (gardening)",
    stage: "scenario",
    concept: "task-change-is-service-change",
    objective,
    role: "gardening",
    durationSec: 60,
    question: {
      label: "A different request",
      heading: "Same time, different job",
      body: "Instead of mowing, the client asks you to prune a tall tree near the fence. The visit length stays the same.",
      prompt: "What do you do?",
      visual: { kind: "illustration", variant: "wave", tone: "gold", icon: "leaf", alt: "Soft gold waves with a leaf motif" },
      options: [
        { id: "a", label: "Prune the tree instead. It’s the same time", correct: false, feedback: "A different job is a change to the service, and working at height may need different equipment and safety checks." },
        { id: "b", label: "Check with the coordinator whether the change is OK", correct: true, feedback: "The coordinator can confirm whether the job fits the plan and is safe to do. The client knows you’ve passed it on." },
        { id: "c", label: "Mow as planned and don’t mention it", correct: false, feedback: "The client’s request isn’t passed on. Let them know you’ll check." },
      ],
    },
    explain: { heading: "A change isn’t only about time", body: "A different job is a change to the service, so it gets the same quick check, especially when safety is involved." },
    takeaway: { action: "Treat a changed job like changed time: check before you agree.", reference: changeGuide },
    sources,
    draftWording: true,
  },
  {
    id: "fu-extra-time-apply",
    version: 1,
    status: "approved",
    title: "Work it out",
    stage: "apply",
    concept: "time-cost-calculation",
    objective,
    durationSec: 75,
    question: {
      label: "Work it out",
      heading: "60 minutes becomes 105",
      body: "At an example rate of $80 an hour, a 60 minute visit is extended to 105 minutes.",
      prompt: "What’s the new total, and what needs to happen?",
      visual: { kind: "words", words: ["105 minutes", "$80 an hour", "Illustrative rate"], tone: "gold", alt: "Key words: 105 minutes, 80 dollars an hour, illustrative rate" },
      options: [
        { id: "a", label: "$140, and the extra 45 minutes is confirmed before you stay", correct: true, feedback: "Right on both counts. 105 ÷ 60 × $80 = $140, and the extra time needs confirming first." },
        { id: "b", label: "$140, and no check is needed if the client agrees", correct: false, feedback: "The total is right, but the client agreeing isn’t the same as the change being confirmed. Check with the coordinator first." },
        { id: "c", label: "$105, and the extra time is confirmed first", correct: false, feedback: "The process is right, but the total isn’t. 105 minutes is 1.75 hours, and 1.75 × $80 = $140." },
      ],
    },
    explain: {
      heading: "Both parts matter",
      body: "Getting the number right helps the client understand the change. Confirming it is what makes the change OK.",
      script: "A hundred and five minutes is an hour and three quarters. At eighty dollars an hour, that's a hundred and forty dollars, or sixty dollars more than planned. Knowing the number helps the conversation, but the coordinator still needs to confirm the change.",
    },
    takeaway: { action: "Work out the effect, then confirm the change before it happens.", reference: changeGuide },
    sources,
    draftWording: true,
  },
  {
    id: "fu-extra-time-transfer",
    version: 1,
    status: "approved",
    title: "Apply the principle",
    stage: "transfer",
    concept: "confirm-before-change",
    objective,
    durationSec: 60,
    question: {
      label: "Apply the principle",
      heading: "An extra day next week",
      body: "A client’s daughter asks if you could come on an extra day next week while she’s away.",
      prompt: "What’s the best response?",
      visual: { kind: "illustration", variant: "arc", tone: "teal", icon: "people", alt: "Teal arcs with a people motif" },
      options: [
        { id: "a", label: "Agree a time with her directly. She’s family", correct: false, feedback: "Family can make requests, but an extra visit is a change to the service that needs confirming through the coordinator." },
        { id: "b", label: "Thank her and pass the request to the coordinator to confirm", correct: true, feedback: "The coordinator can check the plan with the client and confirm what’s possible. Everyone knows what to expect." },
        { id: "c", label: "Say it’s not possible", correct: false, feedback: "It may be possible. Pass it on so the coordinator can check." },
      ],
    },
    takeaway: { action: "Whoever asks, and whatever the change, check before you agree.", reference: changeGuide },
    sources,
    draftWording: true,
  },
];

export type PathStep = {
  /** Stable key so reordering keeps identity. */
  key: string;
  /** A short follow up id, or `lesson:<slug>` for a short lesson played in the lesson player. */
  followUpId: string;
  /** Stage name shown on the topic timeline, such as Recall, Apply or Refresh. */
  stage?: string;
  /**
    Adaptive reinforcement: if the learner's first attempt on an earlier step in this path was
    not correct, release this activity instead. Dates stay the same; only the content changes.
  */
  adaptive?: { ifStruggled: string; note?: string };
  /** Approved role variants: role id → follow up id. */
  variants: Record<string, string>;
  gap: number;
  message: string;
  required: boolean;
  /** For required items: due this many weekdays after release. */
  dueWeekdays?: number;
  completionRule: "response_and_feedback" | "pass";
};

export type PathConfig = {
  name: string;
  description: string;
  owner: string;
  audience: ("partner" | "coordinator")[];
  objective: string;
  trigger: { type: "lesson_completion"; lessonSlug: string; lessonVersion: string } | { type: "manual" };
  schedule: Omit<ScheduleConfig, "timezone">;
  timezoneFallback: string;
  channel: "email" | "sms";
  reminders: { enabled: boolean; afterWeekdays: number };
};

/*
  A little extra time as a learning sequence, the same shape as Legislative Framework:
  Recall (week 2) → Apply (month 2) → Refresh (week 14), with an easier Refresh for anyone who struggled.
  Gardening partners get a gardening version of the Apply scenario.
*/
export const seedPath: { id: string; config: PathConfig; steps: PathStep[] } = {
  id: "path-extra-time",
  config: {
    name: "A little extra time: learning sequence",
    description: "Recall, apply and refresh the habit of confirming changes before they happen.",
    owner: "Learning team (demo)",
    audience: ["partner"],
    objective,
    trigger: { type: "lesson_completion", lessonSlug: "a-little-extra-time", lessonVersion: "1.0-demo" },
    schedule: { mode: "scheduled", unit: "calendar", deliveryDays: "weekdays", sendTime: "09:30", window: { start: "09:00", end: "17:00" } },
    timezoneFallback: "Australia/Brisbane",
    channel: "email",
    reminders: { enabled: true, afterWeekdays: 2 },
  },
  steps: [
    { key: "recall", stage: "Recall", followUpId: "lesson:et-recall", variants: {}, gap: 14, message: "Two quick questions on what to do when a client asks you to stay longer.", required: false, completionRule: "response_and_feedback" },
    {
      key: "apply",
      stage: "Apply",
      followUpId: "lesson:et-apply",
      variants: { gardening: "lesson:et-apply-gardening" },
      gap: 46,
      message: "A new situation: the time stays the same, but the task changes.",
      required: false,
      completionRule: "response_and_feedback",
    },
    {
      key: "refresh",
      stage: "Refresh",
      followUpId: "lesson:et-refresh",
      adaptive: { ifStruggled: "lesson:et-refresh-support", note: "Anyone who missed a first attempt earlier gets a reminder and extra practice." },
      variants: {},
      gap: 38,
      message: "One quick decision to keep the habit of checking first.",
      required: false,
      completionRule: "response_and_feedback",
    },
  ],
};

/** The original single-question follow ups as a path. Kept for engine tests of that activity type. */
export const classicPathSteps: PathStep[] = [
  { key: "s1", followUpId: "fu-extra-time-recall", variants: {}, gap: 2, message: "A 45 second recall on what to do when a client asks for extra time.", required: false, completionRule: "response_and_feedback" },
  { key: "s2", followUpId: "fu-extra-time-scenario", variants: { gardening: "fu-extra-time-scenario-gardening" }, gap: 5, message: "A new situation: the time stays the same, but the task changes.", required: false, completionRule: "response_and_feedback" },
  { key: "s3", followUpId: "fu-extra-time-apply", variants: {}, gap: 7, message: "Work out a new total and decide what needs confirming.", required: false, completionRule: "response_and_feedback" },
  { key: "s4", followUpId: "fu-extra-time-transfer", variants: {}, gap: 16, message: "One last scenario to apply the same principle somewhere new.", required: false, completionRule: "response_and_feedback" },
];

/*
  Legislative Framework as one topic with four experiences delivered over time:
  Learn (day 0, the base lesson) → Recall (week 2) → Apply (month 2) → Refresh (week 14).
  Gaps are measured from the previous release: 14, then 46 (day 60), then 38 (day 98).
  Refresh adapts: anyone who missed a first attempt earlier gets the support version.
*/
export const seedSequencePath: { id: string; config: PathConfig; steps: PathStep[] } = {
  id: "path-legislative-framework",
  config: {
    name: "Legislative Framework: learning sequence",
    description: "One topic, four experiences: learn, recall, apply and refresh. Each follow up asks you to recall or apply before it explains.",
    owner: "Quality and practice (draft)",
    audience: ["partner", "coordinator"],
    objective: "Recognise what each part of the framework does, and when to check the current requirements.",
    trigger: { type: "lesson_completion", lessonSlug: "legislative-framework", lessonVersion: "1.0" },
    schedule: { mode: "scheduled", unit: "calendar", deliveryDays: "weekdays", sendTime: "09:30", window: { start: "09:00", end: "17:00" } },
    timezoneFallback: "Australia/Brisbane",
    channel: "email",
    reminders: { enabled: true, afterWeekdays: 2 },
  },
  steps: [
    { key: "recall", stage: "Recall", followUpId: "lesson:lf-recall", variants: {}, gap: 14, message: "Two minutes to recall what the parts of the framework do.", required: false, completionRule: "response_and_feedback" },
    { key: "apply", stage: "Apply", followUpId: "lesson:lf-apply", variants: {}, gap: 46, message: "A realistic privacy request to work through.", required: false, completionRule: "response_and_feedback" },
    {
      key: "refresh",
      stage: "Refresh",
      followUpId: "lesson:lf-refresh",
      adaptive: { ifStruggled: "lesson:lf-refresh-support", note: "Anyone who missed a first attempt earlier gets a reminder and extra practice." },
      variants: {},
      gap: 38,
      message: "One quick decision to keep the framework fresh.",
      required: false,
      completionRule: "response_and_feedback",
    },
  ],
};
