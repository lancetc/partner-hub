/*
  Which sound a press makes (see components/PressSounds): a fuller "press" for the main action on a
  screen (a filled, coloured button), a light "tick" for everything else you can press (toggles, tabs,
  chips, menu items, outlined buttons and button-like links), and nothing for text you type into,
  disabled controls, or plain links in a paragraph.
*/

export type PressSound = "press" | "tick" | null;

export type Pressed = {
  tag: string;
  role: string | null;
  className: string;
  disabled: boolean;
  /** For an <input>, its type: checkboxes and radios tick; text fields are silent. */
  inputType?: string | null;
};

// Filled buttons in the hub's colours: the main action.
// (Tailwind's arbitrary colours end in "]", which isn't a word boundary, so whole classes are matched by spaces.)
const FILLED = /(^|\s)bg-(action|navy|\[#(008282|006b6b|102a43|1d2b4f|c7393e|fab53d|0e7c7b)\])(?=\s|$)/;

const BUTTON_ROLES = new Set(["button", "tab", "switch", "menuitem", "menuitemcheckbox", "menuitemradio", "option", "checkbox", "radio"]);

export function soundFor(el: Pressed): PressSound {
  if (el.disabled) return null;
  const tag = el.tag.toLowerCase();
  if (tag === "textarea" || tag === "select") return null;
  if (tag === "input") return el.inputType === "checkbox" || el.inputType === "radio" ? "tick" : null;
  const buttonLike = tag === "button" || tag === "summary" || (el.role !== null && BUTTON_ROLES.has(el.role));
  // A link only sounds when it's styled as a button (a pill or a tile), not when it's words in a sentence.
  const linkButton = tag === "a" && /\b(rounded-full|rounded-2xl|rounded-3xl|rounded-xl)\b/.test(el.className);
  if (!buttonLike && !linkButton) return null;
  return FILLED.test(el.className) ? "press" : "tick";
}

/**
  Whether a key presses this control, as the browser does it: Enter follows a link and presses a button,
  Space presses a button or flips a checkbox, and neither does both everywhere.
*/
export function keyPresses(key: string, tag: string, inputType?: string | null): boolean {
  if (key !== "Enter" && key !== " ") return false;
  const t = tag.toLowerCase();
  if (t === "a") return key === "Enter";
  if (t === "input") return key === " " && (inputType === "checkbox" || inputType === "radio");
  return true;
}

/** What can be pressed, for finding it from whatever was touched inside it (an icon, a label). */
export const PRESSABLE = `button, summary, a, input[type=checkbox], input[type=radio], ${[...BUTTON_ROLES].map((r) => `[role=${r}]`).join(", ")}`;

/**
  Put this attribute on a control, or anything around it, that already makes its own sound when pressed
  (a game's answer buttons, say), so the press doesn't click on top of it.
*/
export const NO_PRESS_SOUND = "[data-press-sound=off]";
