"use client";

import Link from "next/link";
import Image from "next/image";
import { createContext, useContext, useLayoutEffect, useRef, useState } from "react";
import { cx } from "@/lib/format";
import { Icon } from "../Icon";
import { ThemeToggle } from "../ThemeToggle";
import { setAutoplay, stopAudio, useAutoplay } from "@/lib/audioPrefs";

/**
  Set when the player runs inside the lesson editor's preview window: the close button then
  closes that window instead of leaving for the Learning page.
*/
export const EmbeddedClose = createContext<(() => void) | null>(null);

/** `queued`: saved on this device, waiting for a connection to sync. */
export type SaveState = "idle" | "saving" | "saved" | "queued" | "error";

export function Frame({
  title,
  beats,
  closeHref = "/learning",
  closeLabel = "Close and return to Learning",
  saveState,
  onRetry,
  progress,
  review,
  fill = false,
  deck,
  footer,
  headerAction,
  children,
}: {
  title: string;
  beats: string[];
  closeHref?: string;
  /** What the close button says to screen readers, when it goes somewhere other than Learning. */
  closeLabel?: string;
  saveState: SaveState;
  onRetry?: () => void;
  progress: { beat: number; done: boolean } | null;
  review?: boolean;
  /** The card fills the whole content area instead of scrolling (full-screen video). */
  fill?: boolean;
  /**
    Shows the card as the top of a deck: up to two cards peek out behind it, and it can be
    swiped left for the next card or right to go back. `id` changes with each card.
  */
  deck?: {
    id: string;
    behind: number;
    onNext?: () => void;
    onBack?: () => void;
    /** A gradient (or other fill) behind the whole card. */ surface?: { style: React.CSSProperties; className: string };
  };
  footer?: React.ReactNode;
  children?: React.ReactNode;
  /** An extra button in the header for the card on screen, such as its bookmark. */
  headerAction?: React.ReactNode;
}) {
  const embeddedClose = useContext(EmbeddedClose);
  return (
    <div className="fixed inset-0 z-50 flex justify-center bg-strong sm:items-center sm:p-6">
      <section
        aria-label={title}
        className="flex h-dvh w-full max-w-[30rem] flex-col overflow-hidden bg-surface sm:h-[min(56rem,calc(100dvh-3rem))] sm:rounded-[2rem] sm:shadow-2xl"
      >
        <header className="flex items-center gap-2 border-b border-line px-3 py-2">
          {embeddedClose ? (
            <button
              type="button"
              onClick={embeddedClose}
              aria-label="Close the preview"
              className="inline-flex size-11 items-center justify-center rounded-full hover:bg-muted"
            >
              <Icon name="close" />
            </button>
          ) : (
            <Link href={closeHref} aria-label={closeLabel} className="inline-flex size-11 items-center justify-center rounded-full hover:bg-muted">
              <Icon name="close" />
            </Link>
          )}
          <Image src="/brand/trilogy-logo.svg" alt="Trilogy Care" width={1789} height={576} className="h-8 w-auto dark:hidden" />
          <Image src="/brand/trilogy-logo-dark.svg" alt="Trilogy Care" width={1789} height={576} className="hidden h-8 w-auto dark:block" />
          <span className="ml-auto" />
          <SaveIndicator state={saveState} onRetry={onRetry} />
          {headerAction}
          <AutoplayToggle />
          <ThemeToggle />
        </header>

        {progress && (
          <div className="px-4 pt-3">
            <ol className="flex gap-1.5" aria-label="Topic progress">
              {beats.map((b, i) => {
                const state = progress.done || i < progress.beat ? "done" : i === progress.beat ? "current" : "todo";
                return (
                  <li key={b} className="flex-1" aria-current={state === "current" ? "step" : undefined}>
                    <span className="sr-only">
                      {b}: {state === "done" ? "done" : state === "current" ? "current" : "not started"}
                    </span>
                    <span
                      aria-hidden
                      className={cx("block h-1.5 rounded-full", state === "done" ? "bg-action" : state === "current" ? "bg-action/60" : "bg-strong")}
                    />
                  </li>
                );
              })}
            </ol>
            <p className="mt-2 font-mulish text-xs font-semibold text-ink-muted">
              {progress.done ? "All steps complete" : `Step ${progress.beat + 1} of ${beats.length} · ${beats[progress.beat]}`}
              {review && " · Review mode"}
            </p>
          </div>
        )}

        {deck ? (
          <Deck deck={deck} fill={fill}>
            {children}
          </Deck>
        ) : (
          <div className={fill ? "min-h-0 flex-1 px-3 pb-3 pt-3" : "flex-1 overflow-y-auto px-4 pb-6 pt-4"}>{children}</div>
        )}

        {footer && <div className="relative border-t border-line bg-surface px-4 py-3 pb-[max(0.75rem,env(safe-area-inset-bottom))]">{footer}</div>}
      </section>
    </div>
  );
}

export function SaveIndicator({ state, onRetry }: { state: SaveState; onRetry?: () => void }) {
  if (state === "idle") return null;
  if (state === "error") {
    return (
      <button
        type="button"
        onClick={onRetry}
        className="inline-flex min-h-11 items-center gap-1.5 rounded-full border border-danger/60 px-3 text-sm font-medium"
        role="alert"
      >
        <Icon name="refresh" className="size-4 text-danger" /> Not saved. Retry
      </button>
    );
  }
  return (
    <span className="inline-flex items-center gap-1.5 px-2 font-mulish text-xs font-semibold text-ink-muted" role="status">
      {state === "saving" ? (
        "Saving…"
      ) : state === "queued" ? (
        <>
          <Icon name="check" className="size-4 text-gold" /> Saved on this device · will sync
        </>
      ) : (
        <>
          <Icon name="check" className="size-4 text-accent" /> Saved
        </>
      )}
    </span>
  );
}

function AutoplayToggle() {
  const on = useAutoplay();
  return (
    <button
      type="button"
      aria-pressed={on}
      aria-label={on ? "Mute card audio" : "Turn card audio on"}
      title={on ? "Mute: stop audio and don’t play it automatically" : "Audio off: press to play cards automatically again"}
      onClick={() => {
        setAutoplay(!on);
        if (on) stopAudio();
      }}
      className={cx("inline-flex size-11 items-center justify-center rounded-full hover:bg-muted", on ? "text-accent" : "text-ink-muted")}
    >
      <Icon name={on ? "volume" : "volume-off"} className="size-5" />
    </button>
  );
}

/** Things a swipe should never start on: controls, media and text the learner is editing. */
const NO_SWIPE = "button, a, input, textarea, select, label, video, iframe, audio, [contenteditable], [role=slider], [data-no-swipe]";
const SWIPE_AT = 90;

/**
  The current card on top of a small stack. Cards behind it peek out to the right, the way a
  deck of cards does. Dragging sideways tilts the card; let go past the threshold to swipe.
*/
function Deck({ deck, fill, children }: { deck: NonNullable<Parameters<typeof Frame>[0]["deck"]>; fill: boolean; children: React.ReactNode }) {
  const start = useRef<{ x: number; y: number; pointer: number; active: boolean } | null>(null);
  // The drag offset belongs to one card, so a new card always starts square.
  const [drag, setDrag] = useState<{ id: string; dx: number; dragging: boolean }>({ id: deck.id, dx: 0, dragging: false });
  const dx = drag.id === deck.id ? drag.dx : 0;
  const dragging = drag.id === deck.id && drag.dragging;
  const behind = Math.max(0, Math.min(2, deck.behind));

  const resist = (mx: number) => ((mx < 0 && !deck.onNext) || (mx > 0 && !deck.onBack) ? mx * 0.2 : mx);

  // The card box stays the same element from card to card, so it would keep the last card's scroll
  // and open the next one part way down. Each new card starts at its top, before it's drawn, along
  // with any scroll area inside it (a full-photo card scrolls within itself).
  const cardRef = useRef<HTMLDivElement>(null);
  useLayoutEffect(() => {
    const el = cardRef.current;
    if (!el) return;
    el.scrollTop = 0;
    el.querySelectorAll<HTMLElement>(".overflow-y-auto").forEach((s) => (s.scrollTop = 0));
  }, [deck.id]);

  return (
    <div className="relative min-h-0 flex-1 bg-strong/60 py-3 pl-3 pr-7">
      {/* Cards waiting behind this one. */}
      {[2, 1].map((i) =>
        i <= behind ? (
          <div
            key={i}
            aria-hidden
            className={cx("absolute left-3 rounded-[1.75rem] shadow-md ring-1 ring-line", i === 1 ? "bg-tealtint" : "bg-muted")}
            style={{ top: `${0.75 + i * 0.9}rem`, bottom: `${0.75 + i * 0.9}rem`, right: `${1.75 - i * 0.7}rem` }}
          />
        ) : null,
      )}
      <div
        ref={cardRef}
        className={cx(
          "deck-card [scrollbar-width:none] [&::-webkit-scrollbar]:hidden relative h-full touch-pan-y overflow-y-auto overscroll-contain rounded-[1.75rem] bg-surface shadow-xl ring-1 ring-line",
          fill ? "overflow-hidden" : "px-4 pb-6 pt-4",
          !dragging && "transition-transform duration-200 ease-out",
          deck.surface?.className,
        )}
        style={{ ...deck.surface?.style, ...(dx ? { transform: `translateX(${dx}px) rotate(${dx / 28}deg)` } : {}) }}
        onPointerDown={(e) => {
          if ((e.pointerType === "mouse" && e.button !== 0) || (e.target as HTMLElement).closest(NO_SWIPE)) return;
          start.current = { x: e.clientX, y: e.clientY, pointer: e.pointerId, active: false };
        }}
        onPointerMove={(e) => {
          const s = start.current;
          if (!s || e.pointerId !== s.pointer) return;
          const mx = e.clientX - s.x;
          const my = e.clientY - s.y;
          if (!s.active) {
            // Only a clearly sideways drag is a swipe; anything else is scrolling.
            if (Math.abs(mx) > 12 && Math.abs(mx) > Math.abs(my) * 1.5) {
              s.active = true;
              // Keep following the finger even if it leaves the card. The pointer can already be gone.
              try {
                e.currentTarget.setPointerCapture(e.pointerId);
              } catch {}
            } else if (Math.abs(my) > 12) {
              start.current = null;
            }
            return;
          }
          setDrag({ id: deck.id, dx: resist(mx), dragging: true });
        }}
        onPointerUp={() => {
          const s = start.current;
          start.current = null;
          if (!s?.active) return;
          if (dx <= -SWIPE_AT && deck.onNext) deck.onNext();
          else if (dx >= SWIPE_AT && deck.onBack) deck.onBack();
          setDrag({ id: deck.id, dx: 0, dragging: false });
        }}
        onPointerCancel={() => {
          start.current = null;
          setDrag({ id: deck.id, dx: 0, dragging: false });
        }}
      >
        {children}
      </div>
    </div>
  );
}
