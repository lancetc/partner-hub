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

export function soundFor(el: Pressed): PressSound {
  if (el.disabled) return null;
  const tag = el.tag.toLowerCase();
  if (tag === "textarea" || tag === "select") return null;
  if (tag === "input") return el.inputType === "checkbox" || el.inputType === "radio" ? "tick" : null;
  const buttonLike = tag === "button" || el.role === "button" || el.role === "tab" || el.role === "switch" || el.role === "menuitem" || el.role === "option";
  // A link only sounds when it's styled as a button (a pill or a tile), not when it's words in a sentence.
  const linkButton = tag === "a" && /\b(rounded-full|rounded-2xl|rounded-3xl|rounded-xl)\b/.test(el.className);
  if (!buttonLike && !linkButton) return null;
  return FILLED.test(el.className) ? "press" : "tick";
}

/** What can be pressed, for finding it from whatever was touched inside it (an icon, a label). */
export const PRESSABLE = "button, [role=button], [role=tab], [role=switch], [role=menuitem], [role=option], a, input[type=checkbox], input[type=radio]";
