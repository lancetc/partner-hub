/*
  Gradient card backgrounds, built from the Trilogy Care brand palette: navy #102a43, teal #0e7c7b,
  yellow #ffc72c and red #d32f2f, plus three light tints. Green, orange and sunset are no longer
  offered but still render on cards that use them. Each preset
  knows which text colour reads on it, so authors pick a look, not a contrast setting. White text
  needs at least 4.5:1, so the orange card starts a shade deeper than the brand orange.
*/

type Gradient = { label: string; css: string; text: "light" | "dark"; /** Kept so older cards still render; not offered to authors. */ legacy?: true };

const navy = "linear-gradient(160deg, #1e3a5c 0%, #102a43 100%)";
const mist = "linear-gradient(170deg, #f2fafb 0%, #cdeaec 100%)";
const cream = "linear-gradient(170deg, #fffaeb 0%, #fde7a6 100%)";

export const GRADIENTS = {
  navy: { label: "Navy", css: navy, text: "light" },
  teal: { label: "Teal", css: "linear-gradient(160deg, #0e7c7b 0%, #005f65 100%)", text: "light" },
  green: { label: "Green", css: "linear-gradient(160deg, #2b6636 0%, #1c4624 100%)", text: "light", legacy: true },
  red: { label: "Red", css: "linear-gradient(160deg, #d32f2f 0%, #a62a15 100%)", text: "light" },
  orange: { label: "Orange", css: "linear-gradient(160deg, #c94c1f 0%, #9e3a16 100%)", text: "light", legacy: true },
  yellow: { label: "Yellow", css: "linear-gradient(160deg, #fdc94a 0%, #ffc72c 100%)", text: "dark" },
  sunset: { label: "Sunset", css: "linear-gradient(160deg, #ffc72c 0%, #f08a4b 100%)", text: "dark", legacy: true },
  mist: { label: "Mist", css: mist, text: "dark" },
  sky: { label: "Sky", css: "linear-gradient(170deg, #f3f6fa 0%, #d6e1ee 100%)", text: "dark" },
  cream: { label: "Cream", css: cream, text: "dark" },
  // Earlier presets, kept so cards already using them still render.
  lilac: { label: "Lilac", css: mist, text: "dark", legacy: true },
  blush: { label: "Blush", css: cream, text: "dark", legacy: true },
  violet: { label: "Violet", css: navy, text: "light", legacy: true },
} as const satisfies Record<string, Gradient>;

export type GradientId = keyof typeof GRADIENTS;
/** The presets authors can pick from. */
export const gradientIds = (Object.keys(GRADIENTS) as GradientId[]).filter((g) => !("legacy" in GRADIENTS[g]));
