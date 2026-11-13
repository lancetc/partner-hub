"use client";

import { useEffect } from "react";
import { soundEffectsEnabled } from "@/lib/audioPrefs";
import { PRESSABLE, soundFor } from "@/lib/pressSound";
import { uiSounds } from "@/lib/sfx";

/*
  A soft click when a button is pressed, anywhere in the hub, with a very short vibration on phones
  that support it: one listener for the whole site rather than code in every button. Off with the
  Sound effects setting in Profile and settings; no vibration for people who prefer reduced motion.
  Sounds start after the first touch or key press, as browsers require.
*/

function play(target: EventTarget | null) {
  if (!soundEffectsEnabled() || !(target instanceof Element)) return;
  const el = target.closest(PRESSABLE);
  if (!(el instanceof HTMLElement)) return;
  const sound = soundFor({
    tag: el.tagName,
    role: el.getAttribute("role"),
    className: typeof el.className === "string" ? el.className : "",
    disabled: (el as HTMLButtonElement).disabled === true || el.getAttribute("aria-disabled") === "true",
    inputType: el instanceof HTMLInputElement ? el.type : null,
  });
  if (!sound) return;
  uiSounds[sound]();
  // The haptic part, on phones: a tap you can feel. Not for people who've asked for less motion.
  if (typeof navigator.vibrate === "function" && matchMedia("(pointer: coarse)").matches && !matchMedia("(prefers-reduced-motion: reduce)").matches) {
    navigator.vibrate(sound === "press" ? 10 : 6);
  }
}

export function PressSounds() {
  useEffect(() => {
    // Pressing down, not letting go: the sound arrives with the touch, as a real button's would.
    const onPointer = (e: PointerEvent) => {
      if (e.button === 0) play(e.target);
    };
    // The keyboard presses buttons with Enter and Space (repeats from a held key don't count).
    const onKey = (e: KeyboardEvent) => {
      if ((e.key === "Enter" || e.key === " ") && !e.repeat) play(e.target);
    };
    document.addEventListener("pointerdown", onPointer, { capture: true, passive: true });
    document.addEventListener("keydown", onKey, { capture: true });
    return () => {
      document.removeEventListener("pointerdown", onPointer, { capture: true });
      document.removeEventListener("keydown", onKey, { capture: true });
    };
  }, []);
  return null;
}
