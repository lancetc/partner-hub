/*
  The homepage cover's picture for each part of the day (components/home/HomeHero.tsx), by the visitor's own clock.
  This is the one place to change them: swap a src (same 1672 × 941 framing, so the masthead and the persona card
  still sit right) or move an hour, and the first-paint script, the cover and the zoom all follow.

  Before the page draws, a tiny script in the root layout (daypartScript) marks <html> with the part of the day and
  the one after it. CSS shows that picture and quietly lays out the next one so the browser loads it early; nothing
  else is fetched. If the page stays open past a boundary, the cover fades across to the next picture.
*/

export const HOME_SCENES = {
  day: {
    src: "/images/home-hero-day.webp",
    from: 5, // 5:00 am to 4:59 pm
    alt: "A sunny Queensland garden in the morning: an older woman chatting on the verandah of her home, while a nurse, a gardener, a cleaner, a support worker and coordinators talk together on the path outside a small office.",
  },
  evening: {
    src: "/images/home-hero-evening.webp",
    from: 17, // 5:00 pm to 8:59 pm
    alt: "The same Queensland garden at dusk, lamps glowing on the verandah and the path, as the care team laughs together outside the lit office.",
  },
  night: {
    src: "/images/home-hero-night.webp",
    from: 21, // 9:00 pm to 4:59 am
    alt: "The same Queensland garden at night under a starry sky, the verandah and office softly lit, the care team still chatting on the path.",
  },
} as const;
export type Daypart = keyof typeof HOME_SCENES;
export const HOME_SCENE_SIZE = { width: 1672, height: 941 };

/** The parts of the day in clock order, each with the hour it starts. */
const ORDER = (Object.keys(HOME_SCENES) as Daypart[]).sort((a, b) => HOME_SCENES[a].from - HOME_SCENES[b].from);

export function daypartAt(d: Date): Daypart {
  const h = d.getHours();
  // The last part that has started today, or (before the first one starts) the one still running from last night.
  return [...ORDER].reverse().find((p) => h >= HOME_SCENES[p].from) ?? ORDER[ORDER.length - 1];
}

export const daypartAfter = (p: Daypart): Daypart => ORDER[(ORDER.indexOf(p) + 1) % ORDER.length];

/** Milliseconds from `d` until the next part of the day starts. */
export function msUntilNextDaypart(d: Date): number {
  const next = new Date(d);
  next.setHours(HOME_SCENES[daypartAfter(daypartAt(d))].from, 0, 0, 0);
  if (next <= d) next.setDate(next.getDate() + 1);
  return next.getTime() - d.getTime();
}

/**
  Runs before first paint (app/layout): sets data-daypart and data-daypart-next on <html> from the visitor's clock,
  so the right picture is there from the first frame. Built from HOME_SCENES, so the hours live in one place.
*/
export const daypartScript = `(function(){try{var o=${JSON.stringify(ORDER.map((p) => [p, HOME_SCENES[p].from]))},h=new Date().getHours(),i=o.length-1;for(var k=0;k<o.length;k++)if(h>=o[k][1])i=k;var d=document.documentElement;d.setAttribute("data-daypart",o[i][0]);d.setAttribute("data-daypart-next",o[(i+1)%o.length][0])}catch(e){}})()`;
