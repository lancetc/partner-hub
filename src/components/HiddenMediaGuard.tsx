"use client";

import { useEffect } from "react";

/*
  Silence for pages you've left. With cacheComponents on, Next.js doesn't remove the page you navigate away from: it
  hides it with React's <Activity> (display: none) so coming back is instant (node_modules/next/dist/docs/01-app/
  02-guides/preserving-ui-state.md). A hidden <audio> or <video> keeps playing, so closing a Topic card left its
  narration talking over the Topics page. One watcher for the whole site, rather than code in every player: when part
  of the page is hidden, anything playing inside it is paused. Coming back shows it paused where it was.
*/

const pauseWithin = (root: Element) => {
  const media = root instanceof HTMLMediaElement ? [root] : [...root.querySelectorAll<HTMLMediaElement>("audio, video")];
  for (const m of media) if (!m.paused) m.pause();
};

export function HiddenMediaGuard() {
  useEffect(() => {
    const main = document.getElementById("main");
    if (!main) return;
    const observer = new MutationObserver((changes) => {
      for (const c of changes) {
        const el = c.target;
        if (el instanceof HTMLElement && el.style.display === "none") pauseWithin(el);
      }
    });
    observer.observe(main, { subtree: true, attributes: true, attributeFilter: ["style"] });
    return () => observer.disconnect();
  }, []);
  return null;
}
