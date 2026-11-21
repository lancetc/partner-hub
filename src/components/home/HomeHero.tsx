"use client";

import Image from "next/image";
import { useState } from "react";
import { useApi, type Me } from "@/lib/api";
import { useHydrated } from "@/lib/store";
import { greeting } from "../HomeWelcome";
import { ImageZoom } from "./ImageZoom";

/*
  The homepage's cover: the garden scene across the top, with the greeting set over its lower edge like a
  magazine masthead. Clicking the picture (or "Enlarge") opens it full screen, where it can be zoomed into.
  The greeting is worked out in the browser, where the person and their time of day are known; until then a
  plain welcome holds its place.
*/

const HERO = {
  src: "/images/home-hero.webp",
  width: 1672,
  height: 941,
  alt: "A sunny Queensland garden: an older woman chatting on the verandah of her home, while a nurse, a gardener, a cleaner, a support worker and a coordinator talk together on the path outside a small office.",
};

const step = (n: number) => ({ "--step": n }) as React.CSSProperties;

export function HomeHero() {
  const hydrated = useHydrated();
  const me = useApi<Me>("/api/me").data;
  const [zoom, setZoom] = useState(false);
  // Today, read only in the browser: the page is built ahead of time, when "now" would be the wrong day.
  const now = hydrated ? new Date() : null;
  const first = me?.user.name.trim().split(/\s+/)[0];
  const role = me
    ? me.user.audience === "coordinator"
      ? "Coordinator edition"
      : me.user.audience === "staff"
        ? "Trilogy Care edition"
        : "Care Partner edition"
    : "Partner Hub";
  const dateline = now?.toLocaleDateString("en-AU", { weekday: "long", day: "numeric", month: "long", year: "numeric" });

  return (
    // Fills the page's rounded sheet side to side and up to its top, cropped by its corners (globals.css, .hub-hero-bleed).
    <header data-build-step style={step(0)} className="hub-hero hub-hero-bleed relative isolate overflow-hidden bg-[#cfe6d2]">
      {/* The whole picture opens full screen to zoom into; its name says so to a screen reader. */}
      <button
        type="button"
        onClick={() => setZoom(true)}
        aria-label="Enlarge the picture"
        className="block w-full cursor-zoom-in focus-visible:outline-3 focus-visible:outline-offset-[-6px] focus-visible:outline-white"
      >
        {/* On a phone a near-square crop; wider up, a band whose height follows the sheet's width, up to 26rem. */}
        <span className="relative block aspect-[16/15] w-full sm:aspect-auto sm:h-[clamp(16rem,30cqw,26rem)]">
          {/* Anchored to the picture's bottom edge, with 20px of that edge trimmed: the picture's box runs 20px below the cover, which cuts it off. */}
          <span className="absolute inset-x-0 top-0 -bottom-5">
            <Image src={HERO.src} alt="" fill priority sizes="100vw" className="hub-hero-img object-cover object-bottom" />
          </span>
          {/* Shade behind the masthead, from the top, so the words always read against the sky and the trees. */}
          <span aria-hidden className="absolute inset-x-0 top-0 h-3/4 bg-gradient-to-b from-[#06223a]/85 via-[#06223a]/35 to-transparent sm:h-2/3" />
        </span>
      </button>

      {/* The masthead lines up with the page's content below it, and lets clicks through to the picture: it has no controls. */}
      <div className="pointer-events-none absolute inset-x-0 top-0 mx-auto max-w-7xl px-4 py-5 text-white sm:px-6 sm:py-8 lg:py-10">
        <p
          data-build-step
          style={step(0)}
          className="flex flex-wrap items-center gap-x-3 gap-y-1 font-mulish text-xs font-extrabold uppercase tracking-[0.16em] text-[#bdeeee]"
        >
          <span>{role}</span>
          {dateline && (
            <>
              <span aria-hidden className="h-px w-8 bg-[#bdeeee]/70" />
              <span className="font-bold normal-case tracking-normal text-white/85">{dateline}</span>
            </>
          )}
        </p>
        <h1
          id="workspace-heading"
          data-build-step
          style={step(1)}
          className="mt-2 max-w-3xl font-serif text-4xl font-semibold leading-[1.05] tracking-tight [text-shadow:0_2px_18px_rgb(0_0_0/0.35)] sm:text-5xl lg:text-6xl"
        >
          {now && first ? `${greeting(now)}, ${first}.` : "Welcome to the Partner Hub."}
        </h1>
        <p data-build-step style={step(1)} className="mt-2 max-w-xl text-lg text-white/90 [text-shadow:0_1px_10px_rgb(0_0_0/0.4)] sm:text-xl">
          Here’s what’s relevant to you this week.
        </p>
      </div>

      <ImageZoom src={HERO.src} alt={HERO.alt} width={HERO.width} height={HERO.height} open={zoom} onClose={() => setZoom(false)} />
    </header>
  );
}
