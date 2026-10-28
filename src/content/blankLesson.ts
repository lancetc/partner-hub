import type { CardVisual as Visual, Lesson } from "./lessons";

/** Starting point for a new lesson: an introduction, a quick check and a summary. */
export function blankLesson(): Lesson {
  const v: Visual = { kind: "illustration", variant: "petals", tone: "teal", icon: "spark", alt: "" };
  return {
    slug: "new-lesson",
    version: "0.1",
    // The house style; authors can pick another on the Details tab.
    theme: "rhythm",
    title: "Untitled lesson",
    summary: "",
    outcome: "",
    track: "partner",
    minutes: 4,
    beats: ["Introduction", "Practise", "Summary"],
    start: "intro",
    nodes: {
      intro: { id: "intro", beat: 0, label: "Introduction", type: "image", heading: "", body: "", visual: v, next: "check" },
      check: {
        id: "check",
        beat: 1,
        label: "Quick check",
        type: "quiz",
        heading: "Quick check",
        body: "",
        visual: { kind: "none" },
        questions: [{ id: "q1", prompt: "", options: [{ id: "a", label: "" }, { id: "b", label: "" }], correct: "a", feedback: { correct: "", incorrect: "" } }],
        next: "summary",
      },
      summary: { id: "summary", beat: 2, label: "Summary", type: "summary", heading: "What to remember", body: "", visual: { kind: "none" }, action: "", points: [], cta: "Finish" },
    },
    completion: { type: "quiz", cardId: "check", label: "Answer the quick check" },
    owner: "Learning and Development",
    reviewDate: "2027-04-30",
    visual: { variant: "petals", tone: "teal", icon: "spark" },
  };
}
