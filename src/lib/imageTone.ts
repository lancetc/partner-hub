"use client";

import { useEffect, useState } from "react";

/*
  Is the part of a photo behind the card text light or dark? Measured once per image in the
  browser (on a tiny copy) and remembered, so text over a full-background photo stays readable.
*/

export type TextTone = "light" | "dark";
const cache = new Map<string, TextTone>();

/** Average brightness of the lower part of the image, where the text sits. Returns the text colour that reads best. */
function measure(img: HTMLImageElement): TextTone {
  const w = 32;
  const h = Math.max(1, Math.round((img.naturalHeight / img.naturalWidth) * w)) || 32;
  const canvas = document.createElement("canvas");
  canvas.width = w;
  canvas.height = h;
  const ctx = canvas.getContext("2d", { willReadFrequently: true });
  if (!ctx) return "light";
  ctx.drawImage(img, 0, 0, w, h);
  const top = Math.floor(h * 0.45);
  const { data } = ctx.getImageData(0, top, w, h - top);
  let sum = 0;
  for (let i = 0; i < data.length; i += 4) sum += (0.2126 * data[i] + 0.7152 * data[i + 1] + 0.0722 * data[i + 2]) / 255;
  const brightness = sum / (data.length / 4);
  // Bright photos get dark text over a light fade; everything else gets white text over a dark fade.
  return brightness > 0.58 ? "dark" : "light";
}

/** The text colour for a photo: the author's choice, or measured when it's "auto". */
export function useTextTone(src: string | undefined, choice: "auto" | TextTone = "auto"): TextTone {
  const [measured, setMeasured] = useState<{ src: string; tone: TextTone } | null>(null);
  useEffect(() => {
    if (!src || choice !== "auto" || cache.has(src)) return;
    let live = true;
    const img = new Image();
    img.decoding = "async";
    img.onload = () => {
      let tone: TextTone = "light";
      try {
        tone = measure(img);
      } catch {
        // An image from another site can't be read; white text on the dark fade is the safe default.
      }
      cache.set(src, tone);
      if (live) setMeasured({ src, tone });
    };
    img.src = src;
    return () => {
      live = false;
    };
  }, [src, choice]);
  if (choice !== "auto") return choice;
  if (!src) return "light";
  return cache.get(src) ?? (measured?.src === src ? measured.tone : "light");
}

/*
  The panel questions and choices sit on over a coloured card or photo: solid warm ivory (#F3EDE1),
  so dark text stays readable on anything. In dark mode it stays frosted glass over the dark surface,
  since the choices inside follow the dark colours.
*/
const PANEL =
  "rounded-2xl p-3 text-ink shadow-[0_8px_28px_rgb(0_0_0/0.16)] [text-shadow:none] bg-[#F3EDE1] dark:border dark:border-white/15 dark:shadow-[inset_0_1px_0_rgb(255_255_255/0.6),0_8px_32px_rgb(0_0_0/0.18)] dark:backdrop-blur-[36px] dark:backdrop-saturate-[1.8]";
export const ON_COLOUR_PANEL = `${PANEL} dark:bg-surface/40`;
const ON_DARK_PANEL = `${PANEL} dark:bg-surface/55`;

/** Classes for text over a full-background photo. */
export const toneClasses = (tone: TextTone) =>
  tone === "dark"
    ? {
        text: "text-[#0a1a2e]",
        soft: "text-[#0a1a2e]/75",
        fade: "bg-gradient-to-t from-white/95 via-white/70 to-white/5",
        placeholder: "empty:before:text-[#0a1a2e]/45",
        panel: ON_COLOUR_PANEL,
      }
    : {
        text: "text-white [text-shadow:0_1px_2px_rgb(0_0_0/0.35)]",
        soft: "text-white",
        fade: "bg-gradient-to-t from-black/85 via-black/50 to-black/10",
        placeholder: "empty:before:text-white/60",
        panel: ON_DARK_PANEL,
      };

/**
  Card types whose questions and choices sit on a frosted panel when the card has a gradient or
  full-background photo, so their dark text stays readable. Used by the player and the editor.
*/
export const PANELLED_ON_COLOUR = ["decision", "quiz", "calculator", "widget", "poll", "rating", "response", "written", "hotspot", "checklist"] as const;
export const panelledOnColour = (type: string) => (PANELLED_ON_COLOUR as readonly string[]).includes(type);
