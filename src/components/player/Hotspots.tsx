"use client";

import { useState } from "react";
import type { Card } from "@/content/lessons";
import { cx } from "@/lib/format";
import { hotspotsNeeded } from "@/lib/hotspots";
import { Icon } from "../Icon";
import { PhotoCredit } from "./CardVisual";

/*
  Hotspot card: a picture with spots to tap. In "explore" each spot has a marker; in "find" the
  learner taps where they think something is, and a hint pulses the rest after a few misses.
  Each spot found reveals its note below the picture. Spots are keyboard buttons too.
*/

type HotspotCard = Extract<Card, { type: "hotspot" }>;
const HINT_AFTER = 3;

export function Hotspots({
  card,
  found,
  onFind,
}: {
  card: HotspotCard;
  /** Spot ids found so far (kept with the learner's progress). */
  found: string[];
  onFind: (id: string) => void;
}) {
  const [active, setActive] = useState<string | null>(found.at(-1) ?? null);
  const [misses, setMisses] = useState(0);
  const [miss, setMiss] = useState<{ x: number; y: number; n: number } | null>(null);
  const [hint, setHint] = useState(false);
  const img = card.image;
  if (!img || !card.spots.length) return <p className="rounded-2xl bg-muted p-4 text-sm text-ink-muted">This activity isn’t set up yet.</p>;
  const find = card.mode === "find";
  const needed = hotspotsNeeded(card);
  const done = found.length >= needed;
  const current = card.spots.find((s) => s.id === active);

  function tap(id: string) {
    setActive(id);
    setMiss(null);
    if (!found.includes(id)) onFind(id);
  }

  return (
    <div className="flex flex-col gap-3">
      <p className="text-lg font-semibold">{card.prompt}</p>
      <div
        className={cx("relative w-full overflow-hidden rounded-2xl bg-muted", find && "cursor-crosshair")}
        style={{ aspectRatio: `${img.width} / ${img.height}` }}
        onClick={(e) => {
          // In find mode, a tap that isn't on a spot is a miss.
          if (!find || (e.target as HTMLElement).closest("[data-spot]")) return;
          const box = e.currentTarget.getBoundingClientRect();
          setMiss({ x: ((e.clientX - box.left) / box.width) * 100, y: ((e.clientY - box.top) / box.height) * 100, n: misses + 1 });
          setMisses((m) => m + 1);
        }}
      >
        {/* eslint-disable-next-line @next/next/no-img-element */}
        <img src={img.src} alt={img.alt} className="absolute inset-0 size-full select-none object-cover" draggable={false} />
        {card.spots.map((s, i) => {
          const isFound = found.includes(s.id);
          const show = !find || isFound || hint;
          return (
            <button
              key={s.id}
              type="button"
              data-spot
              onClick={() => tap(s.id)}
              aria-pressed={active === s.id}
              aria-label={isFound || !find ? `${s.label}${isFound ? ", found" : ""}` : `Search area ${i + 1}`}
              className="absolute grid -translate-x-1/2 -translate-y-1/2 place-items-center rounded-full focus-visible:outline-4 focus-visible:outline-offset-2"
              style={{ left: `${s.x}%`, top: `${s.y}%`, width: `${Math.max(2 * s.r, 9)}%`, aspectRatio: "1" }}
            >
              {show && (
                <span
                  aria-hidden
                  className={cx(
                    "relative grid size-8 place-items-center rounded-full font-mulish text-sm font-extrabold shadow-lg ring-2 ring-white transition-transform",
                    isFound ? "bg-success text-white" : "bg-action text-on-action",
                    active === s.id && "scale-110",
                  )}
                >
                  {!isFound && <span className="absolute inset-0 animate-ping rounded-full bg-action/50" />}
                  <span className="relative">{isFound ? <Icon name="check" className="fx-tick size-4" /> : i + 1}</span>
                </span>
              )}
            </button>
          );
        })}
        {miss && (
          <span
            key={miss.n}
            aria-hidden
            className="pointer-events-none absolute size-10 -translate-x-1/2 -translate-y-1/2 animate-ping rounded-full border-4 border-white/90"
            style={{ left: `${miss.x}%`, top: `${miss.y}%`, animationIterationCount: 1 }}
          />
        )}
        {img.credit && <PhotoCredit credit={img.credit} className="absolute bottom-2 right-2" />}
      </div>

      <p className="flex flex-wrap items-center justify-between gap-2 text-sm text-ink-muted" role="status">
        <span>
          {miss
            ? "Nothing there. Keep looking."
            : done
              ? needed < card.spots.length && found.length < card.spots.length
                ? "That’s enough to continue. You can keep exploring."
                : "You found them all."
              : `Found ${found.length} of ${needed}`}
        </span>
        {find && !done && misses >= HINT_AFTER && !hint && (
          <button type="button" onClick={() => setHint(true)} className="font-semibold text-accent hover:underline">
            Show me a hint
          </button>
        )}
      </p>

      {current && (
        <div aria-live="polite" className="fx-rise rounded-2xl border border-line bg-surface p-4 text-ink shadow-sm">
          <p className="flex items-center gap-2 font-semibold">
            <span className="grid size-6 place-items-center rounded-full bg-success text-white">
              <Icon name="check" className="size-3.5" />
            </span>
            {current.label}
          </p>
          <p className="mt-1.5 text-[1.02rem]">{current.text}</p>
        </div>
      )}
    </div>
  );
}
