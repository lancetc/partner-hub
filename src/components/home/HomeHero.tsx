"use client";

import Image from "next/image";
import { useEffect, useState } from "react";
import { daypartAfter, daypartAt, HOME_SCENE_SIZE, HOME_SCENES, msUntilNextDaypart, type Daypart } from "@/lib/homeScenes";
import { useApi, type Me } from "@/lib/api";
import { browsingRole } from "@/lib/magazine";
import { homeParts } from "@/lib/homeLayout";
import { useHydrated } from "@/lib/store";
import { greeting } from "../HomeWelcome";
import { ImageZoom } from "./ImageZoom";
import { HomePersona } from "./HomePersona";

/*
  The homepage's cover: the garden scene across the top, with the greeting set over its lower edge like a
  magazine masthead. Clicking the picture (or "Enlarge") opens it full screen, where it can be zoomed into.
  The greeting is worked out in the browser, where the person and their time of day are known; until then a
  plain welcome holds its place.
*/

const step = (n: number) => ({ "--step": n }) as React.CSSProperties;
const SCENES = Object.entries(HOME_SCENES) as [Daypart, (typeof HOME_SCENES)[Daypart]][];
/** How long the old picture stays under the new one while it fades in (globals.css, .hub-hero-scene). */
const FADE_MS = 2600;

/**
  Keeps <html>'s time of day current while the page stays open: at each boundary (and when the tab comes back after
  the device slept) the picture fades across to the next one. The first one was chosen before first paint.
*/
function useDaypartClock() {
  useEffect(() => {
    const root = document.documentElement;
    let timer = 0;
    let settle = 0;
    const sync = () => {
      const now = daypartAt(new Date());
      const was = root.getAttribute("data-daypart");
      if (was !== now) {
        // The old picture stays put underneath while the new one fades in over it, then steps aside.
        if (was) root.setAttribute("data-daypart-prev", was);
        root.setAttribute("data-daypart", now);
        window.clearTimeout(settle);
        settle = window.setTimeout(() => root.removeAttribute("data-daypart-prev"), FADE_MS);
      }
      // The next picture is laid out (and so loaded) ahead of time, so the change never flashes.
      root.setAttribute("data-daypart-next", daypartAfter(now));
      window.clearTimeout(timer);
      timer = window.setTimeout(sync, msUntilNextDaypart(new Date()) + 500);
    };
    sync();
    const onShow = () => document.visibilityState === "visible" && sync();
    document.addEventListener("visibilitychange", onShow);
    return () => {
      window.clearTimeout(timer);
      window.clearTimeout(settle);
      document.removeEventListener("visibilitychange", onShow);
    };
  }, []);
}

const EDITIONS = {
  partner: "Supplier edition",
  coordinator: "Care Coordinator edition",
  owner: "Care Partner edition",
  staff: "Trilogy Care edition",
} as const;

export function HomeHero() {
  const hydrated = useHydrated();
  const me = useApi<Me>("/api/me").data;
  // The picture to enlarge: whichever is showing when it's clicked.
  const [zoom, setZoom] = useState<Daypart | null>(null);
  useDaypartClock();
  // Today, read only in the browser: the page is built ahead of time, when "now" would be the wrong day.
  const now = hydrated ? new Date() : null;
  const first = me?.user.name.trim().split(/\s+/)[0];
  // The masthead's edition, named as the demo profiles are (lib/magazine browsingRole): Supplier, Care Coordinator,
  // Care Partner, or Trilogy Care for staff and administrators.
  const viewer = me ? { audience: me.user.audience, role: me.user.role, canAuthor: me.canAuthor } : null;
  const role = viewer ? EDITIONS[browsingRole(viewer) ?? "staff"] : "Partner Hub";
  // The Digital Member who floats on the picture belongs to Lives in Progress, so only for those whose homepage has it.
  const persona = viewer ? homeParts(viewer).includes("lives") : false;
  const dateline = now?.toLocaleDateString("en-AU", { weekday: "long", day: "numeric", month: "long", year: "numeric" });

  return (
    // Fills the page's rounded sheet side to side and up to its top, cropped by its corners (globals.css, .hub-hero-bleed).
    <header data-build-step style={step(0)} className="hub-hero hub-hero-bleed relative isolate overflow-hidden bg-[#cfe6d2]">
      {/* The whole picture opens full screen to zoom into; its name says so to a screen reader. */}
      <button
        type="button"
        onClick={() => setZoom((document.documentElement.getAttribute("data-daypart") as Daypart | null) ?? daypartAt(new Date()))}
        aria-label="Enlarge the picture"
        className="block w-full cursor-zoom-in focus-visible:outline-3 focus-visible:outline-offset-[-6px] focus-visible:outline-white"
      >
        {/* On a phone a near-square crop; wider up, a band whose height follows the sheet's width, up to 26rem. */}
        <span className="relative block aspect-[16/15] w-full sm:aspect-auto sm:h-[clamp(16rem,30cqw,26rem)]">
          {/* Anchored to the picture's bottom edge, with 20px of that edge trimmed: the picture's box runs 20px below the cover, which cuts it off. */}
          {/* isolate: the pictures' stacking (the new one fading in over the old) stays inside this box, under the shade, the masthead and the card. */}
          <span className="absolute inset-x-0 top-0 -bottom-5 isolate">
            {/*
              One picture for each part of the day (lib/homeScenes). CSS shows the one <html> is marked with and lays out
              the next so it loads early; the third isn't laid out, so a lazy picture isn't fetched until it's needed.
            */}
            {SCENES.map(([part, s]) => (
              <Image
                key={part}
                src={s.src}
                alt=""
                fill
                loading="lazy"
                fetchPriority="high"
                sizes="100vw"
                data-scene={part}
                className="hub-hero-scene object-cover object-[50%_85%]"
              />
            ))}
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

      {/* "Since your last visit": a small note at the picture's bottom left, drawn here by the workspace (HomeWorkspace). */}
      <div className="pointer-events-none absolute inset-x-0 bottom-0 mx-auto max-w-7xl px-4 pb-4 sm:px-6 sm:pb-5">
        <div id="home-hero-note" className="pointer-events-auto w-fit max-w-full empty:hidden" />
      </div>

      {/* A different Digital Member on each visit, floating in the middle of the picture's right side, close to the edge. Wide screens only: on narrower ones it would cover the greeting. */}
      {persona && (
        <div className="pointer-events-none absolute inset-0 mx-auto hidden max-w-7xl items-center justify-end px-4 sm:px-6 xl:flex">
          <div>
            <HomePersona />
          </div>
        </div>
      )}

      <ImageZoom
        src={HOME_SCENES[zoom ?? "day"].src}
        alt={HOME_SCENES[zoom ?? "day"].alt}
        width={HOME_SCENE_SIZE.width}
        height={HOME_SCENE_SIZE.height}
        open={zoom !== null}
        onClose={() => setZoom(null)}
      />
    </header>
  );
}
