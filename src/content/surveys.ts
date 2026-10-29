/*
  Survey questions. Kept small on purpose: a few taps on a phone, one optional comment.
  rating and confidence are 1 to 5; agree uses the five labels below; choice has its own options.
*/

export type SurveyQuestion =
  | { id: string; type: "rating" | "confidence"; prompt: string; required: boolean }
  | { id: string; type: "agree"; prompt: string; required: boolean }
  | { id: string; type: "choice"; prompt: string; required: boolean; options: string[] }
  | { id: string; type: "text"; prompt: string; required: boolean };

export const AGREE = ["Strongly disagree", "Disagree", "Neutral", "Agree", "Strongly agree"];
export const RATING_LABELS = { rating: ["Not at all", "Very much"], confidence: ["Not at all", "Very confident"] } as const;

export const questionTypes: { type: SurveyQuestion["type"]; label: string; hint: string }[] = [
  { type: "rating", label: "Rating", hint: "1 to 5" },
  { type: "confidence", label: "Confidence", hint: "How confident do you feel? 1 to 5" },
  { type: "agree", label: "Agree or disagree", hint: "Five-point scale" },
  { type: "choice", label: "Multiple choice", hint: "Pick one option" },
  { type: "text", label: "Comment", hint: "A short written answer" },
];

export const moduleFeedbackQuestions: SurveyQuestion[] = [
  { id: "useful", type: "rating", prompt: "How useful was this for your work?", required: true },
  { id: "clear", type: "rating", prompt: "How clear was the content?", required: true },
  { id: "confident", type: "confidence", prompt: "How confident do you feel putting this into practice?", required: true },
  { id: "apply", type: "agree", prompt: "I’ll do something differently because of this.", required: false },
  { id: "better", type: "text", prompt: "What would make it better?", required: false },
];

export const demoSurveys: {
  id: string;
  name: string;
  description: string;
  anonymous: boolean;
  required: boolean;
  questions: SurveyQuestion[];
  links: ["path" | "lesson", string][];
}[] = [
  {
    id: "sv-module-feedback",
    name: "Module feedback",
    description: "Asked when someone finishes a learning path.",
    anonymous: true,
    required: false,
    questions: moduleFeedbackQuestions,
    links: [
      ["path", "lp-welcome"],
      ["path", "lp-partner-onboarding"],
    ],
  },
  {
    id: "sv-lesson-check-in",
    name: "Quick topic check-in",
    description: "Two questions after a single topic.",
    anonymous: false,
    required: false,
    questions: [
      { id: "clear", type: "rating", prompt: "How clear was this topic?", required: true },
      { id: "missing", type: "text", prompt: "Anything we should add or explain better?", required: false },
    ],
    links: [["lesson", "legislative-framework"]],
  },
];
