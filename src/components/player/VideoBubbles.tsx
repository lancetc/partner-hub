"use client";

import { useEffect, useRef, useState } from "react";
import { cx } from "@/lib/format";
import { Icon } from "../Icon";

export type Bubble = { src: string; poster?: string; label?: string };

/*
  Talking-head video bubbles: one or two short clips, shown as circles at the top of a card.
  Tap a circle to play it with sound; a ring around it shows how far through it is. Only one plays
  at a time. `onComplete` fires once every bubble has been watched to the end.
*/
export function VideoBubbles({ bubbles, onComplete, size = "player" }: { bubbles: Bubble[]; onComplete?: () => void; size?: "player" | "canvas" }) {
  const refs = useRef<(HTMLVideoElement | null)[]>([]);
  const [playing, setPlaying] = useState<number | null>(null);
  const [progress, setProgress] = useState<number[]>(() => bubbles.map(() => 0));
  const [ended, setEnded] = useState<boolean[]>(() => bubbles.map(() => false));
  const reported = useRef(false);
  const done = useRef(onComplete);
  useEffect(() => {
    done.current = onComplete;
  }, [onComplete]);

  function toggle(i: number) {
    const v = refs.current[i];
    if (!v) return;
    if (playing === i) {
      v.pause();
      return;
    }
    refs.current.forEach((o, j) => j !== i && o?.pause());
    if (v.ended) v.currentTime = 0;
    v.play().catch(() => {});
  }

  function markEnded(i: number) {
    setEnded((e) => {
      const next = e.map((x, j) => x || j === i);
      if (next.every(Boolean) && !reported.current) {
        reported.current = true;
        // Let the player know after this update settles.
        window.setTimeout(() => done.current?.(), 0);
      }
      return next;
    });
  }

  const dim = size === "canvas" ? (bubbles.length > 1 ? 84 : 104) : bubbles.length > 1 ? 120 : 150;
  const r = dim / 2 - 3;
  const c = 2 * Math.PI * r;

  return (
    <div className="flex items-start justify-center gap-4">
      {bubbles.map((b, i) => {
        const isPlaying = playing === i;
        return (
          <div key={b.src} className="flex flex-col items-center gap-1.5">
            <button
              type="button"
              onClick={() => toggle(i)}
              aria-label={`${isPlaying ? "Pause" : ended[i] ? "Play again" : "Play"} video${b.label ? `: ${b.label}` : ""}`}
              className="relative rounded-full shadow-lg focus-visible:outline-4 focus-visible:outline-offset-2"
              style={{ width: dim, height: dim }}
            >
              <video
                ref={(el) => {
                  refs.current[i] = el;
                }}
                src={b.src}
                poster={b.poster}
                preload="metadata"
                playsInline
                onLoadedMetadata={(e) => {
                  // Webcam recordings from Chrome don't store their length. Jumping far ahead makes the
                  // browser work it out; then go back to the start so the progress ring can fill.
                  const v = e.currentTarget;
                  if (Number.isFinite(v.duration)) return;
                  const back = () => {
                    v.removeEventListener("durationchange", back);
                    v.currentTime = 0;
                  };
                  v.addEventListener("durationchange", back);
                  v.currentTime = 1e9;
                }}
                onPlay={() => setPlaying(i)}
                onPause={() => setPlaying((p) => (p === i ? null : p))}
                onEnded={() => {
                  setPlaying((p) => (p === i ? null : p));
                  markEnded(i);
                }}
                onError={() => markEnded(i)}
                onTimeUpdate={(e) => {
                  const v = e.currentTarget;
                  const pct = v.duration ? v.currentTime / v.duration : 0;
                  setProgress((p) => p.map((x, j) => (j === i ? pct : x)));
                }}
                className="size-full rounded-full bg-[#102a43] object-cover"
              />
              {/* Progress ring. */}
              <svg aria-hidden viewBox={`0 0 ${dim} ${dim}`} className="pointer-events-none absolute inset-0 -rotate-90">
                <circle cx={dim / 2} cy={dim / 2} r={r} fill="none" stroke="rgb(255 255 255 / 0.55)" strokeWidth="4" />
                <circle
                  cx={dim / 2}
                  cy={dim / 2}
                  r={r}
                  fill="none"
                  stroke="#ffc72c"
                  strokeWidth="4"
                  strokeLinecap="round"
                  strokeDasharray={c}
                  strokeDashoffset={c * (1 - (progress[i] ?? 0))}
                />
              </svg>
              {!isPlaying && (
                <span aria-hidden className="absolute inset-0 grid place-items-center rounded-full bg-black/25">
                  <span className="grid size-11 place-items-center rounded-full bg-white/95 text-[#102a43] shadow-md">
                    <Icon name={ended[i] ? "refresh" : "play"} className={cx("size-5", !ended[i] && "ml-0.5")} />
                  </span>
                </span>
              )}
            </button>
            {b.label && <span className="max-w-[9rem] text-center text-xs font-semibold leading-tight">{b.label}</span>}
          </div>
        );
      })}
    </div>
  );
}
