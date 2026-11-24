/*
  The portrait card the Community's people share (Digital Members and Members): a tall card in a soft white frame,
  the person's picture filling it, and their name and details on a pale fade at the foot. Class names only, so each
  card keeps its own markup (one is a link to a profile, the other a card with a button).
*/

export const portraitCard = {
  /** The soft white frame around the picture. */
  frame:
    "group block rounded-[2rem] bg-white/85 p-2 shadow-[0_24px_48px_-24px_rgba(16,42,67,0.45)] ring-1 ring-black/5 transition dark:bg-white/10 dark:ring-white/10",
  /** Lifts a little on hover, for a card that opens something. */
  lift: "motion-safe:hover:-translate-y-1 hover:shadow-[0_28px_56px_-24px_rgba(16,42,67,0.55)] focus-visible:outline-3 focus-visible:outline-offset-2 focus-visible:outline-[#008282]",
  /** The picture's window: tall, rounded, with a neutral backdrop for a picture still loading. */
  window: "relative aspect-[3/4.2] overflow-hidden rounded-[1.6rem] bg-gradient-to-b from-[#dfe7ec] to-[#cdd8de] dark:from-[#1d3049] dark:to-[#13233a]",
  /** The pale fade up from the foot, so the words read over any picture. */
  fade: "absolute inset-x-0 bottom-0 h-[58%] bg-gradient-to-t from-white via-white/90 to-transparent dark:from-[#13233a] dark:via-[#13233a]/90",
  /** The words at the foot. */
  foot: "absolute inset-x-0 bottom-0 flex flex-col gap-1 p-4",
  name: "flex items-center gap-2 text-[1.2rem] font-semibold leading-tight tracking-tight text-ink",
  /** The white pill button, bottom right. */
  pill: "inline-flex min-h-10 shrink-0 items-center gap-1.5 whitespace-nowrap rounded-full bg-white px-3.5 text-sm font-semibold text-ink shadow-[0_6px_16px_-6px_rgba(16,42,67,0.35)] ring-1 ring-black/5 transition hover:bg-[#e8f6f6] dark:bg-white/15 dark:text-white dark:ring-white/10",
  /** A wavy badge shape for the small mark beside a name. */
  badge:
    "grid size-6 shrink-0 place-items-center rounded-full text-white shadow-sm [clip-path:polygon(50%_0,61%_9%,75%_6%,80%_20%,94%_25%,91%_39%,100%_50%,91%_61%,94%_75%,80%_80%,75%_94%,61%_91%,50%_100%,39%_91%,25%_94%,20%_80%,6%_75%,9%_61%,0_50%,9%_39%,6%_25%,20%_20%,25%_6%,39%_9%)]",
};
