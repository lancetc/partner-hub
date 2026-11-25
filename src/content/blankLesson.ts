import type { Lesson } from "./lessons";
import { DEFAULT_PRESENTER, newIntroCard, type PresenterLite } from "@/lib/topicIntro";

/**
  Starting point for a new lesson: its Introduction card (lib/topicIntro.ts: structural, always first, with the default
  presenter's placeholder until the server's default is known), a quick check and a summary.
*/
export function blankLesson(presenter: PresenterLite = DEFAULT_PRESENTER): Lesson {
  const l: Lesson = {
    slug: "new-lesson",
    version: "0.1",
    // The house style; authors can pick another on the Details tab.
    theme: "rhythm",
    title: "Untitled topic",
    summary: "",
    outcome: "",
    track: "partner",
    minutes: 4,
    beats: ["Introduction", "Practise", "Summary"],
    start: "intro",
    nodes: {
      check: {
        id: "check",
        beat: 1,
        label: "Quick check",
        type: "quiz",
        heading: "Quick check",
        body: "",
        visual: { kind: "none" },
        questions: [
          {
            id: "q1",
            prompt: "",
            options: [
              { id: "a", label: "" },
              { id: "b", label: "" },
            ],
            correct: "a",
            feedback: { correct: "", incorrect: "" },
          },
        ],
        next: "summary",
      },
      summary: {
        id: "summary",
        beat: 2,
        label: "Summary",
        type: "summary",
        heading: "What to remember",
        body: "",
        visual: { kind: "none" },
        action: "",
        points: [],
        cta: "Finish",
      },
    },
    completion: { type: "quiz", cardId: "check", label: "Answer the quick check" },
    owner: "Learning and Development",
    reviewDate: "2027-04-30",
    visual: { variant: "petals", tone: "teal", icon: "spark" },
  };
  // The heading and description start empty: learners see the Topic's title and summary until the author writes their own.
  l.nodes.intro = { ...newIntroCard(l, presenter, "check", "new", "intro"), heading: "", body: "" };
  return l;
}
