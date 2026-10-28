import type { Card, Lesson } from "./lessons";
import { GRADIENTS } from "./gradients";

/*
  Lesson themes: the look every card in a lesson gets unless it has its own background colour or
  photo. Built from the brand palette; each knows which text colour reads on it, and the colour of
  the small label above the heading. Accent colours are at least 4.5:1 against their background.
*/

export type CardSurface = {
  css: string;
  text: "light" | "dark";
  /** Colour of the label above the heading; the text colour when not set. */
  accent?: string;
};

type Theme = {
  label: string;
  description: string;
  /** The surface for a card, or null for a plain white card. */
  surface: (card: Card) => CardSurface | null;
};

const softTeal: CardSurface = { css: "linear-gradient(170deg, #f4fbfb 0%, #d7eff0 100%)", text: "dark", accent: "text-[#00666d]" };
const softNavy: CardSurface = { css: "linear-gradient(170deg, #f5f8fc 0%, #dbe5f1 100%)", text: "dark", accent: "text-[#2d4875]" };
/*
  Brand rhythm, soft navy, in the design system's colours: navy #102A43, yellow #FFC72C,
  orange #F26A36 and red #D32F2F (teal is kept for buttons). Brand orange is too light for white
  text, so orange cards use dark text.
*/
const brandNavy: CardSurface = { css: "linear-gradient(160deg, #36537f 0%, #2d4875 100%)", text: "light", accent: "text-[#ffc72c]" };
const brandOrange: CardSurface = { css: "linear-gradient(160deg, #f68b5e 0%, #f26a36 100%)", text: "dark", accent: "text-[#102a43]" };
const brandYellow: CardSurface = { css: "linear-gradient(160deg, #ffd968 0%, #ffc72c 100%)", text: "dark", accent: "text-[#102a43]" };
// What happens after a wrong choice: a soft red, with the label in a red deep enough to read.
const softRed: CardSurface = { css: "linear-gradient(170deg, #fff5f4 0%, #f9d6d3 100%)", text: "dark", accent: "text-[#b3261e]" };
const navy: CardSurface = { css: GRADIENTS.navy.css, text: "light", accent: "text-[#ffc72c]" };
const warm: CardSurface = { css: "linear-gradient(170deg, #fffdf6 0%, #fcefc6 100%)", text: "dark", accent: "text-[#b8441a]" };
// Labels stay white here: pale yellow on the lighter end of the teal is under 4.5:1.
const teal: CardSurface = { css: GRADIENTS.teal.css, text: "light" };
// Brand rhythm's recap: navy with a pale teal label, keeping the theme to teal, navy and white (no yellow).
const rhythmRecap: CardSurface = { css: GRADIENTS.navy.css, text: "light", accent: "text-[#9adfe2]" };
// Brand rhythm's content cards: the soft Mist background, with navy labels.
const rhythmMist: CardSurface = { css: GRADIENTS.mist.css, text: "dark", accent: "text-[#2d4875]" };

/** Cards that ask the learner something: in Brand rhythm they stand out in teal. */
const QUESTION_TYPES = ["quiz", "decision", "poll", "rating", "written", "response", "hotspot", "checklist", "calculator", "wall"];

export const THEMES = {
  classic: { label: "Classic", description: "White cards with teal accents.", surface: () => null },
  softTeal: { label: "Soft teal", description: "Pale teal cards. Calm, good for compliance topics.", surface: () => softTeal },
  navy: { label: "Navy", description: "Navy cards, white text, yellow accents. Bold, good for briefings.", surface: () => navy },
  warm: { label: "Warm", description: "Cream cards with orange accents. Friendly, good for onboarding and stories.", surface: () => warm },
  rhythm: {
    label: "Brand rhythm",
    description: "Mist content cards, teal question cards and a navy recap, so the lesson has a pace.",
    surface: (card) => (card.type === "summary" ? rhythmRecap : QUESTION_TYPES.includes(card.type) ? teal : rhythmMist),
  },
  rhythmNavy: {
    label: "Brand rhythm, soft navy",
    description: "Soft navy content cards, navy questions with yellow labels, orange role plays, a soft red after a wrong choice, and a yellow recap.",
    surface: (card) =>
      card.type === "summary"
        ? brandYellow
        : card.type === "decision"
          ? brandOrange
          : QUESTION_TYPES.includes(card.type)
            ? brandNavy
            : "emphasis" in card && card.emphasis === "consequence"
              ? softRed
              : softNavy,
  },
} as const satisfies Record<string, Theme>;

export type ThemeId = keyof typeof THEMES;
export const themeIds = Object.keys(THEMES) as ThemeId[];

/**
  What's behind a card with no full-background photo: its own colour, then the lesson's theme, then
  white (null). The dedicated audio card keeps its soft listening background unless the theme is light.
*/
export function cardSurface(lesson: Pick<Lesson, "theme">, card: Card): CardSurface | null {
  if (card.background) return GRADIENTS[card.background.gradient];
  const themed = THEMES[lesson.theme ?? "classic"]?.surface(card) ?? null;
  if (card.type === "listen") return themed?.text === "dark" ? themed : GRADIENTS.mist;
  return themed;
}
