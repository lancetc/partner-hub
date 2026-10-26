"use client";

import { useEffect, useSyncExternalStore } from "react";
import { HeaderIconButton } from "./IconButton";

type Theme = "light" | "dark";
const KEY = "tc-theme";

function subscribe(cb: () => void) {
  const observer = new MutationObserver(cb);
  observer.observe(document.documentElement, { attributes: true, attributeFilter: ["data-theme"] });
  return () => observer.disconnect();
}

const read = (): Theme => (document.documentElement.dataset.theme === "dark" ? "dark" : "light");

function apply(theme: Theme) {
  document.documentElement.dataset.theme = theme;
}

/**
  Switching only changes an attribute on <html>, so card position, answers, uploads and
  scroll position are untouched.
*/
export function ThemeToggle() {
  const theme = useSyncExternalStore(subscribe, read, () => "light" as Theme);

  // Follow system changes until the person makes an explicit choice.
  useEffect(() => {
    const mq = window.matchMedia("(prefers-color-scheme: dark)");
    const onChange = () => {
      try {
        if (!localStorage.getItem(KEY)) apply(mq.matches ? "dark" : "light");
      } catch {}
    };
    mq.addEventListener("change", onChange);
    return () => mq.removeEventListener("change", onChange);
  }, []);

  const next: Theme = theme === "dark" ? "light" : "dark";
  return (
    <HeaderIconButton
      label={`Switch to ${next} theme`}
      icon={theme === "dark" ? "sun" : "moon"}
      onClick={() => {
        apply(next);
        try {
          localStorage.setItem(KEY, next);
        } catch {}
      }}
    />
  );
}
