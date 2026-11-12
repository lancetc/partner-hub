"use client";

import { themeOf, type ConversationCard } from "@/content/conversations";
import { cx } from "@/lib/format";

/*
  A Care Conversations card. The front is the question, in its theme's colour; flipping it shows a
  deeper follow-up. It turns over in 3D, or simply swaps for people who prefer reduced motion.
  `onFlip` is left out where someone else flips it (a team session's participants).
*/

export function FlipCard({
  card,
  flipped,
  onFlip,
  size = "md",
  label,
}: {
  card: ConversationCard;
  flipped: boolean;
  onFlip?: () => void;
  size?: "sm" | "md" | "lg";
  /** Extra words for screen readers, such as "Card 5 of 48". */
  label?: string;
}) {
  const theme = themeOf(card.theme);
  const sizes = {
    sm: "w-full max-w-[16rem] aspect-[3/4]",
    md: "w-full max-w-sm aspect-[3/4]",
    lg: "w-full max-w-3xl aspect-[3/4] sm:aspect-[16/10]",
  };
  const question = { sm: "text-lg", md: "text-2xl sm:text-[1.7rem]", lg: "text-2xl sm:text-4xl lg:text-5xl" };
  const Wrapper = onFlip ? "button" : "div";
  return (
    <Wrapper
      {...(onFlip ? { type: "button" as const, onClick: onFlip, "aria-pressed": flipped } : {})}
      aria-label={`${label ? `${label}. ` : ""}${theme.name}. ${flipped ? `Go deeper: ${card.deeper}` : card.question}${onFlip ? (flipped ? " Tap to turn back." : " Tap to flip.") : ""}`}
      className={cx("group relative block select-none text-left [perspective:1400px]", sizes[size], onFlip && "cursor-pointer")}
    >
      <span
        aria-hidden
        className={cx(
          "absolute inset-0 block transition-transform duration-700 [transform-style:preserve-3d] motion-reduce:transition-none",
          flipped && "[transform:rotateY(180deg)]",
          onFlip && "group-focus-visible:outline group-focus-visible:outline-4 group-focus-visible:outline-offset-4 group-focus-visible:outline-focus",
          "rounded-[1.75rem]",
        )}
      >
        {/* Front: the question. */}
        <span
          className="absolute inset-0 flex flex-col overflow-hidden rounded-[1.75rem] p-6 shadow-xl [backface-visibility:hidden] motion-reduce:transition-opacity sm:p-8"
          style={{ background: theme.colour, color: theme.ink, opacity: flipped ? undefined : 1 }}
        >
          <Pattern colour={theme.ink} />
          <span className="relative flex items-center justify-between gap-2 font-mulish text-xs font-extrabold uppercase tracking-[0.16em] opacity-90">
            <span>{theme.name}</span>
            <span className="text-2xl" aria-hidden>
              {theme.emoji}
            </span>
          </span>
          <span className={cx("relative my-auto py-4 font-serif font-semibold leading-tight", question[size])}>{card.question}</span>
          {onFlip && <span className="relative font-mulish text-sm font-bold opacity-80">Tap to flip for a deeper question ↻</span>}
        </span>
        {/* Back: the deeper question. */}
        <span
          className="absolute inset-0 flex flex-col overflow-hidden rounded-[1.75rem] border-[6px] bg-white p-6 text-[#102a43] shadow-xl [backface-visibility:hidden] [transform:rotateY(180deg)] sm:p-8"
          style={{ borderColor: theme.colour }}
        >
          <span className="font-mulish text-xs font-extrabold uppercase tracking-[0.16em]" style={{ color: LABEL[theme.colour] ?? theme.colour }}>
            Go deeper
          </span>
          <span className={cx("my-auto py-4 font-serif font-semibold leading-tight", question[size])}>{card.deeper}</span>
          <span className="text-sm text-[#486581]">{card.question}</span>
        </span>
      </span>
    </Wrapper>
  );
}

/** Soft rings in the corner of the front, in the card's own ink colour. */
function Pattern({ colour }: { colour: string }) {
  return (
    <svg aria-hidden className="pointer-events-none absolute -bottom-16 -right-16 size-64 opacity-[0.13]" viewBox="0 0 200 200">
      {[30, 55, 80, 100].map((r) => (
        <circle key={r} cx="100" cy="100" r={r} fill="none" stroke={colour} strokeWidth="10" />
      ))}
    </svg>
  );
}

/** The theme colour is too light for small text on white for these two: a darker shade of each. (The back of the card is always white, in dark mode too, like a real card.) */
const LABEL: Record<string, string> = { "#fab53d": "#8a5a00", "#3cb8b9": "#1d6e6f" };
