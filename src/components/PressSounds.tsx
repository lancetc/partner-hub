"use client";

import { useEffect } from "react";
import { soundEffectsEnabled } from "@/lib/audioPrefs";
import { keyPresses, NO_PRESS_SOUND, PRESSABLE, soundFor } from "@/lib/pressSound";
import { pageActivated, uiSounds, unlockUiAudio } from "@/lib/sfx";

/*
  A soft click when a button is pressed, anywhere in the hub, with a very short vibration on phones
  that support it: one listener for the whole site rather than code in every button. Off with the
  Sound effects setting in Profile and settings; no vibration for people who prefer reduced motion.
  Sounds start after the first touch or key press, as browsers require. Anything marked
  data-press-sound="off" (a control that plays its own sound) stays quiet.
*/

/** The control a press landed on: the button around an icon, or the checkbox a label belongs to. */
function pressedControl(target: EventTarget | null): HTMLElement | null {
  if (!(target instanceof Element)) return null;
  const el = target.closest(PRESSABLE) ?? target.closest("label")?.control ?? null;
  return el instanceof HTMLElement ? el : null;
}

function play(el: HTMLElement) {
  if (!soundEffectsEnabled() || el.closest(NO_PRESS_SOUND)) return;
  const sound = soundFor({
    tag: el.tagName,
    role: el.getAttribute("role"),
    className: typeof el.className === "string" ? el.className : "",
    // :disabled also catches buttons inside a disabled fieldset.
    disabled: el.matches(":disabled") || el.getAttribute("aria-disabled") === "true",
    inputType: el instanceof HTMLInputElement ? el.type : null,
  });
  if (!sound) return;
  uiSounds[sound]();
  // The haptic part, on phones: a tap you can feel. Not for people who've asked for less motion.
  if (
    typeof navigator.vibrate === "function" &&
    pageActivated() &&
    matchMedia("(pointer: coarse)").matches &&
    !matchMedia("(prefers-reduced-motion: reduce)").matches
  ) {
    navigator.vibrate(sound === "press" ? 10 : 8);
  }
}

export function PressSounds() {
  useEffect(() => {
    // Pressing down, not letting go: the sound arrives with the touch, as a real button's would.
    const onPointer = (e: PointerEvent) => {
      if (e.button !== 0) return;
      const el = pressedControl(e.target);
      if (el) play(el);
    };
    // The keyboard presses buttons with Enter and Space (repeats from a held key don't count).
    const onKey = (e: KeyboardEvent) => {
      if (e.repeat) return;
      const el = pressedControl(e.target);
      if (el && keyPresses(e.key, el.tagName, el instanceof HTMLInputElement ? el.type : null)) play(el);
    };
    // A tap lifting off counts as permission to play on phones (going down doesn't): wake the audio then,
    // so the next press clicks straight away.
    const unlock = () => {
      if (soundEffectsEnabled()) unlockUiAudio();
    };
    document.addEventListener("pointerdown", onPointer, { capture: true, passive: true });
    document.addEventListener("keydown", onKey, { capture: true });
    document.addEventListener("pointerup", unlock, { capture: true, passive: true });
    return () => {
      document.removeEventListener("pointerdown", onPointer, { capture: true });
      document.removeEventListener("keydown", onKey, { capture: true });
      document.removeEventListener("pointerup", unlock, { capture: true });
    };
  }, []);
  return null;
}
