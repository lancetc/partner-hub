"use client";

import { useEffect, useRef } from "react";

/*
  The homepage newspaper's arrival (the owner, Nov 2026): when the news first scrolls into view, it reveals itself in
  about a second: the masthead, its rule drawing across, the edition line and sections, the briefing, then the feature
  and its columns in a short stagger (globals.css, .nr-*). Only opacity and a small rise, so nothing shifts; once a
  visit. Everything is there from the start for screen readers and keyboards, and nothing waits for the narration.

  It never hides what someone has already seen: if the news is on screen when the page opens, there's no reveal. Nor
  with reduced motion, or while the homepage is building itself after signing in (html[data-build]).

  Also the root the Trilogy Briefing's narration cues look within ([data-news-root], BriefingStrip).
*/
export function NewsReveal({ children }: { children: React.ReactNode }) {
  const ref = useRef<HTMLDivElement>(null);
  useEffect(() => {
    const el = ref.current;
    if (!el || typeof IntersectionObserver === "undefined") return;
    if (matchMedia("(prefers-reduced-motion: reduce)").matches || document.documentElement.hasAttribute("data-build")) return;
    if (el.getBoundingClientRect().top < window.innerHeight * 0.92) return;
    el.classList.add("nr-wait");
    let done = 0;
    const io = new IntersectionObserver(
      ([e]) => {
        if (!e.isIntersecting) return;
        io.disconnect();
        el.classList.replace("nr-wait", "nr-run");
        done = window.setTimeout(() => el.classList.remove("nr-run"), 1500);
      },
      { threshold: 0.12 },
    );
    io.observe(el);
    return () => {
      io.disconnect();
      window.clearTimeout(done);
      el.classList.remove("nr-wait", "nr-run");
    };
  }, []);
  return (
    <div ref={ref} data-news-root>
      {children}
    </div>
  );
}
