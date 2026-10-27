"use client";

import { useEffect, useMemo, useState } from "react";
import "./player/fx.css";

/*
  A shower of brand-coloured confetti that bursts from the top of the screen and rains down, for
  finishing a learning path. Decorative only, never blocks clicks, and skipped when motion is reduced.
*/
const COLOURS = ["#ffc72c", "#0e7c7b", "#f26a36", "#2b6636", "#102a43", "#d32f2f", "#4cc3c9", "#ffc72c"];

export function Confetti({ pieces = 140, onDone }: { pieces?: number; onDone?: () => void }) {
  const [on, setOn] = useState(true);
  // Random per piece, fixed for this shower.
  const bits = useMemo(
    () =>
      Array.from({ length: pieces }, (_, i) => {
        const r = (n: number) => {
          const x = Math.sin((i + 1) * 9301 + n * 49297) * 233280;
          return x - Math.floor(x);
        };
        return {
          left: 50 + (r(1) - 0.5) * 30,
          dx: (r(2) - 0.5) * 110,
          burst: 8 + r(3) * 22,
          rot: (r(4) - 0.5) * 1440,
          t: 2.6 + r(5) * 2.2,
          d: r(6) * 0.6,
          w: 6 + r(7) * 7,
          tall: r(8) > 0.5,
          sway: (r(9) - 0.5) * 40,
          colour: COLOURS[i % COLOURS.length],
          round: i % 5 === 0,
        };
      }),
    [pieces],
  );
  useEffect(() => {
    const t = window.setTimeout(() => {
      setOn(false);
      onDone?.();
    }, 5600);
    return () => window.clearTimeout(t);
  }, [onDone]);
  if (!on) return null;
  return (
    <div aria-hidden className="confetti-layer pointer-events-none fixed inset-0 z-[80] overflow-hidden">
      {bits.map((b, i) => (
        <span
          key={i}
          className="confetti-piece absolute top-[-3vh]"
          style={
            {
              left: `${b.left}%`,
              width: b.w,
              height: b.tall ? b.w * 1.8 : b.w,
              "--dx": `${b.dx}vw`,
              "--burst": `${b.burst}vh`,
              "--r": `${b.rot}deg`,
              "--t": `${b.t}s`,
              "--d": `${b.d}s`,
              "--sway": `${b.sway}px`,
            } as React.CSSProperties
          }
        >
          <span style={{ background: b.colour, borderRadius: b.round ? "999px" : "2px" }} />
        </span>
      ))}
    </div>
  );
}
