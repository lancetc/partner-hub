"use client";

import { useEffect, useLayoutEffect, useRef, useState } from "react";
import { cardSounds } from "@/lib/sfx";
import { allSlides, type Board, type Move } from "@/lib/coordinatorsDay";
import { cx } from "@/lib/format";

/*
  The Coordinator's Day board, like a snakes and ladders board on a painted Australian street: a
  wooden frame, a cream path winding up from Start, cream squares with gold edges, teal ladders
  (opportunities), orange slides (setbacks) and a teal pawn. A move walks the pawn square by square,
  or glides it up a ladder or down a slide; with reduced motion it simply appears there. Every square
  says what kind it is in words as well as colour.

  BOARD_IMAGE: the painted street behind the board (public/images/coordinators-day). Without it, a
  simpler street is drawn here instead.
*/

/** Four across, so a ladder up four squares always climbs straight up to the next row. */
const COLS = 4;
const CW = 168;
const CH = 122;
const PAD = 26;
/** Each square's tile, smaller than its cell so the painted street shows between them. */
const TW = 96;
const TH = 74;
const BOARD_IMAGE: string | null = "/images/coordinators-day/board-bg.webp";

export type SquareKind = "start" | "handover" | "ladder" | "top" | "slide" | "work";

export function squareKinds(board: Board): SquareKind[] {
  const end = board.squares.length - 1;
  const heads = new Set(allSlides(board).map((s) => s.from));
  return board.squares.map((_, i) =>
    i === 0 ? "start" : i === end ? "handover" : heads.has(i) ? "slide" : board.ladders.some((l) => l.from === i) ? "ladder" : board.ladders.some((l) => l.to === i) ? "top" : "work",
  );
}

/**
  Where each square's centre sits: left to right along each row, from the bottom up. A ladder (up four)
  climbs straight up its column, and a slide (back three) is a short drop.
*/
function layout(n: number) {
  const rows = Math.ceil(n / COLS);
  const at = (i: number) => {
    const row = Math.floor(i / COLS);
    const col = i % COLS;
    return { x: PAD + col * CW + CW / 2, y: PAD + (rows - 1 - row) * CH + CH / 2 };
  };
  return { rows, at, width: COLS * CW + PAD * 2, height: rows * CH + PAD * 2 };
}

const tile: Record<SquareKind, { fill: string; edge: string }> = {
  start: { fill: "#e2f3f1", edge: "#2a9d8f" },
  handover: { fill: "#fde4b2", edge: "#d9a441" },
  ladder: { fill: "#fbf1df", edge: "#d9a441" },
  top: { fill: "#fbf1df", edge: "#d9a441" },
  slide: { fill: "#f3dfcf", edge: "#8a5a36" },
  work: { fill: "#fbf1df", edge: "#d9a441" },
};
const kindLabel: Record<SquareKind, string> = {
  start: "Start",
  handover: "Finish",
  ladder: "Opportunity",
  top: "",
  slide: "Setback risk",
  work: "",
};

export function DayBoard({
  board,
  square,
  move,
  className,
  label,
  names = false,
  time = 9 * 60,
}: {
  board: Board;
  square: number;
  move?: Move;
  className?: string;
  label?: string;
  /** Show each square's name. Off by default: the names hint at what's coming. */
  names?: boolean;
  /** The game clock, in minutes: the light shifts from cool morning to golden afternoon. */
  time?: number;
}) {
  const named = (i: number) => (names ? board.squares[i] : `square ${i + 1}`);
  // Opportunity and Setback risk hint at what's coming too, so they show only with the names.
  const showKind = (k: SquareKind) => Boolean(kindLabel[k]) && (names || k === "start" || k === "handover");
  const { at, width, height } = layout(board.squares.length);
  const kinds = squareKinds(board);
  const id = `cd-${board.level}`;

  // The snakes: drawn below, and ridden by the pawn when it slides.
  const snakes = boardSnakes(board);

  /*
    The pawn moves itself, frame by frame, without re-rendering the board: a hop in a small arc for
    each square (slowly, so you can follow it), a steady climb up a ladder, or a ride down a snake's
    body. A sound for each (if sound effects are on), and a burst where it lands. With reduced motion
    it simply appears on its new square.
  */
  const pawnRef = useRef<SVGGElement>(null);
  const routeRef = useRef<SVGPathElement>(null);
  const handled = useRef(move?.n ?? 0);
  const [fx, setFx] = useState<{ kind: "ladder" | "slide" | "land"; x: number; y: number; n: number } | null>(null);
  const [moving, setMoving] = useState(false);
  useLayoutEffect(() => {
    const el = pawnRef.current;
    const route = routeRef.current;
    const { at } = layout(board.squares.length);
    const track = route ? measure(route, board.squares.map((_, i) => at(i))) : null;
    /** Where the pawn waits on square i: in the middle of the square, over its number. */
    const spot = (i: number) => (track ? track.point(track.along[i]) : pawnSpot(board, i));
    // The pawn is drawn around its middle, so it travels centred on the path.
    const put = (p: Pt) => el?.setAttribute("transform", `translate(${p.x.toFixed(1)} ${p.y.toFixed(1)})`);
    if (!move || move.n === handled.current) {
      put(spot(square));
      return;
    }
    handled.current = move.n;
    const reduce = window.matchMedia("(prefers-reduced-motion: reduce)").matches;
    if (reduce || move.kind === "stay") {
      put(spot(move.to));
      return;
    }
    // The legs of the journey: each a function from 0..1 to a point, with how long it takes.
    type Leg = { at: (t: number) => Pt; ms: number; ease: (t: number) => number; sound?: () => void };
    const inOut = (t: number) => (t < 0.5 ? 2 * t * t : 1 - (-2 * t + 2) ** 2 / 2);
    const easeIn = (t: number) => t * t * (1.4 - 0.4 * t);
    const legs: Leg[] = [];
    /*
      One square along the path, at an unhurried walk: from where the pawn waits on one square to where it
      waits on the next, following every curve of the line, with a small lift at each step.
    */
    const walk = (s: number, pace: number): Leg => {
      const a = track ? track.along[s] : 0;
      const b = track ? track.along[s + 1] : 0;
      const from = spot(s);
      const to = spot(s + 1);
      const len = track ? b - a : Math.hypot(to.x - from.x, to.y - from.y);
      const steps = Math.max(3, Math.round(len / 36));
      return {
        at: (t) => {
          const p = track ? track.point(a + (b - a) * t) : { x: from.x + (to.x - from.x) * t, y: from.y + (to.y - from.y) * t };
          return { x: p.x, y: p.y - Math.abs(Math.sin(Math.PI * t * steps)) * 4 };
        },
        ms: (3000 + len * 3.2) * pace,
        ease: inOut,
        sound: cardSounds.pickUp,
      };
    };
    if (move.kind === "step" || move.kind === "walk") {
      for (let s = move.from; s < move.to; s++) legs.push(walk(s, move.kind === "walk" ? 0.75 : 1));
    } else if (move.kind === "ladder") {
      const li = board.ladders.findIndex((l) => l.from === move.from && l.to === move.to);
      const ends = li >= 0 ? ladderEnds(board, board.ladders[li], li) : null;
      // Up the ladder itself, from its foot to its top, rung by rung: a little lift at each one.
      const along = alongLine(ends ? [spot(move.from), ends.foot, ends.top, spot(move.to)] : [spot(move.from), spot(move.to)]);
      legs.push({
        at: (t) => {
          const p = along(t);
          return { x: p.x, y: p.y - Math.abs(Math.sin(t * Math.PI * 6)) * 6 };
        },
        ms: 4000,
        ease: inOut,
        sound: cardSounds.ready,
      });
    } else if (move.kind === "slide") {
      const snake = boardSnakes(board).find((x) => x.from === move.from && x.to === move.to);
      const ride = snake ? [spot(move.from), ...snake.shape.points, spot(move.to)] : [spot(move.from), spot(move.to)];
      legs.push({
        // At an even pace along the snake (speeding up as it goes).
        at: alongLine(ride),
        ms: 4400,
        ease: easeIn,
        sound: () => cardSounds.swipe("next"),
      });
    }
    let raf = 0;
    let leg = 0;
    let started = 0;
    put(legs[0]?.at(0) ?? spot(move.to));
    const tick = (now: number) => {
      if (!started) {
        started = now;
        legs[leg]?.sound?.();
      }
      const L = legs[leg];
      const t = Math.min(1, (now - started) / L.ms);
      put(L.at(L.ease(t)));
      if (t < 1) {
        raf = requestAnimationFrame(tick);
        return;
      }
      leg++;
      if (leg < legs.length) {
        started = now;
        legs[leg].sound?.();
        raf = requestAnimationFrame(tick);
        return;
      }
      put(spot(move.to));
      setMoving(false);
      const end = spot(move.to);
      setFx({ kind: move.kind === "ladder" ? "ladder" : move.kind === "slide" ? "slide" : "land", x: end.x, y: end.y + 24, n: move.n });
    };
    raf = requestAnimationFrame((now) => {
      setMoving(true);
      tick(now);
    });
    return () => {
      cancelAnimationFrame(raf);
      setMoving(false);
    };
  }, [move, square, board]);
  // A burst lasts a moment.
  useEffect(() => {
    if (!fx) return;
    const t = window.setTimeout(() => setFx(null), 1100);
    return () => window.clearTimeout(t);
  }, [fx]);

  // The light through the day: cool in the morning, clear at midday, golden by late afternoon.
  const day = Math.min(1, Math.max(0, (time - 9 * 60) / (16.5 * 60 - 9 * 60)));
  const light = day < 0.5 ? { c: "#bcd6ea", o: 0.16 * (1 - day * 2) } : { c: "#ffb35c", o: 0.2 * (day - 0.5) * 2 };

  const path = board.squares.map((_, i) => at(i));
  const route = ribbon(path);
  const start = pawnSpot(board, square);
  return (
    <svg viewBox={`0 0 ${width} ${height}`} className={cx("cd-board block w-full", className)} role="img" aria-label={label ?? `${board.title} board: ${board.squares.length} squares, from Start of day to Handover.`}>
      <defs>
        <clipPath id={`${id}-frame`}>
          <rect x="8" y="8" width={width - 16} height={height - 16} rx="26" />
        </clipPath>
        <filter id={`${id}-lift`} x="-20%" y="-20%" width="140%" height="150%">
          <feDropShadow dx="0" dy="3" stdDeviation="3" floodColor="#5b4220" floodOpacity="0.25" />
        </filter>
        <filter id={`${id}-glow`} x="-50%" y="-50%" width="200%" height="200%">
          <feGaussianBlur stdDeviation="3" />
        </filter>
        <linearGradient id={`${id}-scales`} x1="0" y1="0" x2="1" y2="1">
          <stop offset="0" stopColor="#6b4527" />
          <stop offset="0.5" stopColor="#4a2f1b" />
          <stop offset="1" stopColor="#2e1c10" />
        </linearGradient>
        <radialGradient id={`${id}-sun`}>
          <stop offset="0" stopColor="#fff6d8" stopOpacity="0.55" />
          <stop offset="1" stopColor="#fff6d8" stopOpacity="0" />
        </radialGradient>
      </defs>

      {/* The scene behind, inside the wooden frame, with drifting gum leaves, dappled sun and the light of the hour. */}
      <g clipPath={`url(#${id}-frame)`}>
        {BOARD_IMAGE ? <image href={BOARD_IMAGE} x="0" y="0" width={width} height={height} preserveAspectRatio="xMidYMid slice" /> : <HomeScene width={width} height={height} />}
        <rect width={width} height={height} fill="#fffaf0" opacity="0.06" />
        <g className="cd-dapples" aria-hidden>
          <circle className="cd-dapple" cx={width * 0.25} cy={height * 0.3} r="120" fill={`url(#${id}-sun)`} />
          <circle className="cd-dapple cd-dapple-b" cx={width * 0.72} cy={height * 0.55} r="140" fill={`url(#${id}-sun)`} />
          <circle className="cd-dapple cd-dapple-c" cx={width * 0.45} cy={height * 0.82} r="110" fill={`url(#${id}-sun)`} />
        </g>
        <g className="cd-leaves" aria-hidden>
          {[0.12, 0.38, 0.63, 0.88].map((x, i) => (
            <g key={x} className={`cd-leaf cd-leaf-${i}`} style={{ "--x": `${x * width}px` } as React.CSSProperties}>
              <path d="M0 0 C6 -10 18 -12 26 -8 C18 -2 8 2 0 0 Z" fill={i % 2 ? "#7f9a62" : "#a4b77a"} opacity="0.85" />
              <path d="M0 0 L24 -7" stroke="#5f7748" strokeWidth="0.8" />
            </g>
          ))}
        </g>
        <rect width={width} height={height} fill={light.c} opacity={light.o} className="cd-hour" />
      </g>
      <rect x="8" y="8" width={width - 16} height={height - 16} rx="26" fill="none" stroke="#c99a5b" strokeWidth="12" />
      <rect x="15" y="15" width={width - 30} height={height - 30} rx="20" fill="none" stroke="#e9c994" strokeWidth="2" />

      {/* The path: a thin cream line, dashes flowing from Start to Handover, and a glow that travels it on a loop. */}
      <path ref={routeRef} d={route} fill="none" stroke="#fffaf0" strokeOpacity="0.9" strokeWidth="7" strokeLinejoin="round" strokeLinecap="round" />
      <path d={route} className="cd-path" fill="none" stroke="#1f8a7e" strokeOpacity="0.75" strokeWidth="2.5" strokeDasharray="3 9" strokeLinecap="round" />
      <path d={route} pathLength={1} className="cd-comet" fill="none" stroke="#fff3b0" strokeWidth="9" strokeLinecap="round" strokeDasharray="0.05 0.95" filter={`url(#${id}-glow)`} />
      <path d={route} pathLength={1} className="cd-comet" fill="none" stroke="#ffffff" strokeWidth="3" strokeLinecap="round" strokeDasharray="0.03 0.97" />

      {board.squares.map((_, i) => {
        const c = at(i);
        const k = kinds[i];
        const here = i === square;
        return (
          <g key={i} filter={`url(#${id}-lift)`}>
            <rect
              x={c.x - TW / 2}
              y={c.y - TH / 2}
              width={TW}
              height={TH}
              rx="14"
              fill={tile[k].fill}
              stroke={here ? "#008282" : tile[k].edge}
              strokeWidth={here ? 4.5 : 2.5}
            />
          </g>
        );
      })}
      {/* Where you are: a soft ring pulsing out from your square (once the pawn has arrived). */}
      {!moving && (
        <rect
          key={`here${square}`}
          className="cd-here"
          x={at(square).x - TW / 2}
          y={at(square).y - TH / 2}
          width={TW}
          height={TH}
          rx="14"
          fill="none"
          stroke="#00a3a3"
          strokeWidth="3"
        />
      )}

      {/* Ladders: two rails and rungs, from the middle of one square to the middle of the one above, leaning a little. */}
      {board.ladders.map((l, li) => {
        const { foot: a, top: b } = ladderEnds(board, l, li);
        const len = Math.hypot(b.x - a.x, b.y - a.y);
        const nx = (-(b.y - a.y) / len) * 11;
        const ny = ((b.x - a.x) / len) * 11;
        const rungs = Math.max(3, Math.floor(len / 22));
        return (
          <g key={`l${l.from}`} pointerEvents="none">
            <title>{`Ladder from ${named(l.from)} up to ${named(l.to)}`}</title>
            {[1, -1].map((side) => (
              <line key={side} x1={a.x + nx * side} y1={a.y + ny * side} x2={b.x + nx * side} y2={b.y + ny * side} stroke="#1f8a7e" strokeWidth="6" strokeLinecap="round" />
            ))}
            {Array.from({ length: rungs }, (_, r) => {
              const t = (r + 1) / (rungs + 1);
              const x = a.x + (b.x - a.x) * t;
              const y = a.y + (b.y - a.y) * t;
              return <line key={r} x1={x + nx} y1={y + ny} x2={x - nx} y2={y - ny} stroke="#2fa595" strokeWidth="4" strokeLinecap="round" />;
            })}
          </g>
        );
      })}

      {/* Slides: a snake, its head on the setback square and its tail on the work to redo. */}
      {snakes.map((sn) => (
        <g key={`s${sn.from}-${sn.to}`} pointerEvents="none">
          <title>{`Possible setback: slide from ${named(sn.from)} down to ${named(sn.to)}`}</title>
          <path d={sn.shape.body} fill={`url(#${id}-scales)`} stroke="#22140a" strokeWidth="1.2" strokeLinejoin="round" />
          <path d={sn.shape.spine} fill="none" stroke="#c9a05e" strokeWidth="3" strokeDasharray="1.5 7" strokeLinecap="round" opacity="0.9" />
          <g transform={`translate(${sn.shape.head.x} ${sn.shape.head.y}) rotate(${sn.shape.head.angle})`}>
            <g className="cd-snake-head" style={{ animationDelay: `${-sn.i * 0.7}s` }}>
              <path className="cd-tongue" style={{ animationDelay: `${-sn.i * 0.9}s` }} d="M10 0 l9 -3 M10 0 l9 3" stroke="#c0392b" strokeWidth="1.6" strokeLinecap="round" />
              <ellipse cx="0" cy="0" rx="13.5" ry="10.5" fill="#3b2416" stroke="#22140a" strokeWidth="1.2" />
              <circle cx="4" cy="-4.2" r="2.6" fill="#f6e7c1" />
              <circle cx="4" cy="4.2" r="2.6" fill="#f6e7c1" />
              <circle cx="4.8" cy="-4.2" r="1.2" fill="#111" />
              <circle cx="4.8" cy="4.2" r="1.2" fill="#111" />
            </g>
          </g>
        </g>
      ))}

      {/* Numbers and names, over the ladders and slides. */}
      {board.squares.map((name, i) => {
        const c = at(i);
        const k = kinds[i];
        return (
          <g key={`n${i}`} pointerEvents="none">
            <text
              x={c.x}
              y={names ? c.y - 12 : c.y + (showKind(k) ? 2 : 10)}
              textAnchor="middle"
              fontSize={names ? 20 : 28}
              fontWeight="800"
              fill="#1d2b4f"
              fontFamily="var(--font-mulish, sans-serif)"
            >
              {i + 1}
            </text>
            {names && (
              <foreignObject x={c.x - TW / 2 + 4} y={c.y - 9} width={TW - 8} height={28}>
                <p className="flex h-full items-start justify-center">
                  <span className="text-center text-[10.5px] font-semibold leading-[1.15] text-[#1d2b4f]">{name}</span>
                </p>
              </foreignObject>
            )}
            {showKind(k) && (
              <g>
                <rect x={c.x - 40} y={c.y + 19} width="80" height="14" rx="7" fill={k === "slide" ? "#4a2f1b" : k === "handover" ? "#b88320" : "#1f8a7e"} />
                <text x={c.x} y={c.y + 29.3} textAnchor="middle" fontSize="9" fontWeight="800" fill="#fff" fontFamily="var(--font-mulish, sans-serif)">
                  {kindLabel[k].toUpperCase()}
                </text>
              </g>
            )}
          </g>
        );
      })}

      {/* A burst where the pawn lands: sparkles up a ladder, dust off a snake, a ripple for a step. */}
      {fx && (
        <g key={fx.n} transform={`translate(${fx.x} ${fx.y})`} pointerEvents="none" aria-hidden>
          {fx.kind === "land" ? (
            <ellipse className="cd-ripple" rx="22" ry="7" fill="none" stroke="#1f8a7e" strokeWidth="2" />
          ) : (
            Array.from({ length: 10 }, (_, j) => {
              const ang = (j / 10) * Math.PI * 2;
              return (
                <circle
                  key={j}
                  className="cd-burst"
                  r={fx.kind === "ladder" ? 3.2 : 4.5}
                  fill={fx.kind === "ladder" ? (j % 2 ? "#fab53d" : "#3cb8b9") : "#a07a52"}
                  style={{ "--dx": `${Math.cos(ang) * 30}px`, "--dy": `${Math.sin(ang) * 22 - (fx.kind === "ladder" ? 10 : 0)}px` } as React.CSSProperties}
                />
              );
            })
          )}
        </g>
      )}

      {/* The pawn: moved by the code above; it bobs gently while it waits. */}
      <g ref={pawnRef} transform={`translate(${start.x} ${start.y})`} aria-hidden>
        <g className={cx("cd-pawn", moving && "cd-pawn-moving")}>
          <ellipse cx="0" cy="26" rx="17" ry="5" fill="#3b2a12" opacity="0.25" />
          <path d="M-15 24 C-15 12 -9 6 -6 2 C-11 -1 -12 -6 -12 -10 C-12 -18 -7 -24 0 -24 C7 -24 12 -18 12 -10 C12 -6 11 -1 6 2 C9 6 15 12 15 24 Z" fill="#0b8b88" stroke="#fff" strokeWidth="2.5" />
          <ellipse cx="-4" cy="-14" rx="3.5" ry="5" fill="#fff" opacity="0.35" />
        </g>
      </g>
    </svg>
  );
}

type Pt = { x: number; y: number };

/**
  A ladder runs from the middle of its foot square to the middle of its top square, leaning a little
  (one way, then the other, from ladder to ladder) so it looks set against the board by hand.
*/
function ladderEnds(board: Board, l: { from: number; to: number }, i: number) {
  const { at } = layout(board.squares.length);
  const a = at(l.from);
  const b = at(l.to);
  const lean = i % 2 ? 9 : -9;
  return { foot: { x: a.x - lean, y: a.y + 4 }, top: { x: b.x + lean, y: b.y - 4 } };
}

/** A point at fraction t of the way along a line through these points, measured by distance. */
function alongLine(points: Pt[]) {
  const lens = [0];
  for (let j = 1; j < points.length; j++) lens.push(lens[j - 1] + Math.hypot(points[j].x - points[j - 1].x, points[j].y - points[j - 1].y));
  const total = lens[lens.length - 1] || 1;
  return (t: number): Pt => {
    const d = t * total;
    let j = 1;
    while (j < lens.length - 1 && lens[j] < d) j++;
    const k = (d - lens[j - 1]) / (lens[j] - lens[j - 1] || 1);
    return { x: points[j - 1].x + (points[j].x - points[j - 1].x) * k, y: points[j - 1].y + (points[j].y - points[j - 1].y) * k };
  };
}

/** Where the pawn waits on a square: its middle, over the number. */
function pawnSpot(board: Board, i: number): Pt {
  return layout(board.squares.length).at(i);
}

/**
  The path as drawn, measured: where along it each square's centre falls, and the point at any distance
  along it. Past the end it carries straight on to the right (the top row runs left to right).
*/
function measure(el: SVGPathElement, centres: Pt[]) {
  const total = el.getTotalLength();
  const samples: Pt[] = [];
  for (let d = 0; d <= total; d += 2) samples.push(el.getPointAtLength(d));
  const along: number[] = [];
  let from = 0;
  for (const c of centres) {
    let best = from;
    for (let j = from; j < samples.length; j++) {
      if (Math.hypot(samples[j].x - c.x, samples[j].y - c.y) < Math.hypot(samples[best].x - c.x, samples[best].y - c.y)) best = j;
    }
    along.push(best * 2);
    from = best;
  }
  const point = (d: number): Pt => {
    if (d <= total) return el.getPointAtLength(Math.max(0, d));
    const end = el.getPointAtLength(total);
    return { x: end.x + (d - total), y: end.y };
  };
  return { along, point };
}

/** The board's snakes, one for each slide: head on the setback square, tail on the work to redo. */
function boardSnakes(board: Board) {
  const { at } = layout(board.squares.length);
  return allSlides(board).map((sl, i) => {
    const a = at(sl.from);
    const b = at(sl.to);
    const sameRow = Math.abs(a.y - b.y) < 1;
    // Along a row the snake dips into the gap below the squares; between rows it curves to one side.
    const head = sameRow ? { x: a.x - 22, y: a.y + 26 } : { x: a.x - 26, y: a.y + 20 };
    const tail = sameRow ? { x: b.x + 22, y: b.y + 30 } : { x: b.x + 18, y: b.y + 26 };
    const bend = sameRow ? { x: (head.x + tail.x) / 2, y: a.y + 104 } : { x: (head.x + tail.x) / 2 + (i % 2 ? -50 : 50), y: (head.y + tail.y) / 2 };
    return { ...sl, i, shape: snakeShape(head, bend, tail, i) };
  });
}
function snakeShape(head: Pt, bend: Pt, tail: Pt, seed: number) {
  const N = 48;
  const q = (t: number) => ({
    x: (1 - t) * (1 - t) * head.x + 2 * (1 - t) * t * bend.x + t * t * tail.x,
    y: (1 - t) * (1 - t) * head.y + 2 * (1 - t) * t * bend.y + t * t * tail.y,
  });
  const len = Math.hypot(tail.x - head.x, tail.y - head.y) + Math.hypot(bend.x - head.x, bend.y - head.y) * 0.5;
  const waves = Math.max(1.5, len / 95);
  const left: Pt[] = [];
  const right: Pt[] = [];
  const spine: Pt[] = [];
  for (let j = 0; j <= N; j++) {
    const t = j / N;
    const p = q(t);
    const p2 = q(Math.min(1, t + 0.01));
    const p1 = q(Math.max(0, t - 0.01));
    const dx = p2.x - p1.x;
    const dy = p2.y - p1.y;
    const m = Math.hypot(dx, dy) || 1;
    const nx = -dy / m;
    const ny = dx / m;
    // The wiggle settles at the head, so the head sits straight on its square.
    const wiggle = 9 * Math.sin((t * waves + (seed % 2) * 0.5) * Math.PI * 2) * Math.min(1, t * 4);
    const w = 8.5 * (1 - t) + 1.5 * t;
    const c = { x: p.x + nx * wiggle, y: p.y + ny * wiggle };
    spine.push(c);
    left.push({ x: c.x + nx * w, y: c.y + ny * w });
    right.push({ x: c.x - nx * w, y: c.y - ny * w });
  }
  const pts = (list: Pt[]) => list.map((p) => `${p.x.toFixed(1)} ${p.y.toFixed(1)}`).join(" L");
  const h = q(0);
  const h2 = q(0.04);
  const angle = (Math.atan2(h.y - h2.y, h.x - h2.x) * 180) / Math.PI;
  return {
    body: `M${pts(left)} L${pts(right.reverse())} Z`,
    spine: `M${pts(spine.slice(2, -3))}`,
    head: { x: h.x, y: h.y, angle },
    points: spine,
  };
}

/** The cream path: straight along each row, then a sweep up and back to the start of the next row. */
function ribbon(p: { x: number; y: number }[]) {
  let d = `M${p[0].x} ${p[0].y}`;
  for (let i = 1; i < p.length; i++) {
    const a = p[i - 1];
    const b = p[i];
    if (Math.abs(a.y - b.y) < 1) d += ` L${b.x} ${b.y}`;
    else {
      const mid = (a.y + b.y) / 2;
      d += ` C${a.x + 70} ${a.y} ${a.x + 70} ${mid} ${a.x} ${mid} L${b.x} ${mid} C${b.x - 70} ${mid} ${b.x - 70} ${b.y} ${b.x} ${b.y}`;
    }
  }
  return d;
}

/** The drawn street behind the board: sky, gum trees, a Queenslander and a brick house, a fence and lawn. */
function HomeScene({ width: w, height: h }: { width: number; height: number }) {
  return (
    <g>
      <defs>
        <linearGradient id="cd-sky" x1="0" y1="0" x2="0" y2="1">
          <stop offset="0" stopColor="#cfe6ee" />
          <stop offset="0.55" stopColor="#eef3e6" />
          <stop offset="1" stopColor="#dfe8c9" />
        </linearGradient>
      </defs>
      <rect width={w} height={h} fill="url(#cd-sky)" />
      {/* Distant gums. */}
      {[60, 210, 380, 560, 720].map((x, i) => (
        <g key={x} opacity="0.55">
          <ellipse cx={x} cy={150 + (i % 2) * 20} rx="90" ry="70" fill="#9fb98f" />
          <ellipse cx={x + 40} cy={120 + (i % 2) * 20} rx="60" ry="50" fill="#b3c7a2" />
        </g>
      ))}
      {/* A Queenslander: white weatherboards, red tin roof, verandah. */}
      <g opacity="0.85">
        <polygon points={`20,${h - 260} 150,${h - 330} 280,${h - 260}`} fill="#b8483a" />
        <rect x="35" y={h - 262} width="230" height="120" fill="#f6f1e6" />
        {Array.from({ length: 9 }, (_, i) => (
          <line key={i} x1="35" y1={h - 250 + i * 13} x2="265" y2={h - 250 + i * 13} stroke="#e2dccd" strokeWidth="1.5" />
        ))}
        <rect x="25" y={h - 160} width="250" height="10" fill="#e9e1cf" />
        {Array.from({ length: 8 }, (_, i) => (
          <rect key={i} x={30 + i * 34} y={h - 200} width="4" height="42" fill="#e9e1cf" />
        ))}
        <rect x="70" y={h - 235} width="36" height="44" fill="#8fb0b8" />
        <rect x="190" y={h - 235} width="36" height="44" fill="#8fb0b8" />
      </g>
      {/* A brick house with a tiled roof. */}
      <g opacity="0.8">
        <polygon points={`${w - 280},${h - 230} ${w - 170},${h - 290} ${w - 60},${h - 230}`} fill="#c0643f" />
        <rect x={w - 268} y={h - 232} width="196" height="104" fill="#c98b6b" />
        <rect x={w - 230} y={h - 205} width="40" height="36" fill="#94b2bb" />
        <rect x={w - 150} y={h - 205} width="40" height="36" fill="#94b2bb" />
      </g>
      {/* Lawn and a picket fence. */}
      <rect x="0" y={h - 140} width={w} height="140" fill="#b7cc8d" />
      <g opacity="0.9">
        <rect x="0" y={h - 112} width={w} height="5" fill="#fbf8f1" />
        {Array.from({ length: Math.ceil(w / 22) }, (_, i) => (
          <path key={i} d={`M${i * 22 + 4} ${h - 84} V${h - 124} l4 -6 l4 6 V${h - 84} Z`} fill="#fbf8f1" />
        ))}
      </g>
      {/* Gum leaves framing the top corners, shrubs at the bottom. */}
      {[
        [10, 10, 1],
        [w - 10, 10, -1],
      ].map(([x, y, dir]) => (
        <g key={x} opacity="0.75">
          {Array.from({ length: 7 }, (_, i) => (
            <ellipse
              key={i}
              cx={x + dir * (20 + i * 22)}
              cy={y + 18 + (i % 3) * 14}
              rx="22"
              ry="7"
              fill={i % 2 ? "#6f8f63" : "#86a676"}
              transform={`rotate(${dir * (25 + i * 9)} ${x + dir * (20 + i * 22)} ${y + 18 + (i % 3) * 14})`}
            />
          ))}
        </g>
      ))}
      {[40, w - 60].map((x) => (
        <g key={x} opacity="0.8">
          <ellipse cx={x} cy={h - 20} rx="70" ry="40" fill="#7d9c64" />
          <ellipse cx={x + 30} cy={h - 40} rx="40" ry="28" fill="#93b179" />
          <circle cx={x - 20} cy={h - 50} r="5" fill="#d1495b" />
          <circle cx={x + 14} cy={h - 58} r="5" fill="#d1495b" />
        </g>
      ))}
    </g>
  );
}

/** On a phone: the pawn's square and the next few, in a row. */
export function DayTrack({ board, square, names = false }: { board: Board; square: number; names?: boolean }) {
  const kinds = squareKinds(board);
  const from = Math.max(0, square - 1);
  const to = Math.min(board.squares.length - 1, from + 3);
  const ids = Array.from({ length: to - from + 1 }, (_, i) => from + i);
  return (
    <ol className="flex items-stretch gap-2" aria-label="Nearby squares">
      {ids.map((i) => {
        const k = kinds[i];
        const ladder = board.ladders.find((l) => l.from === i);
        return (
          <li
            key={i}
            aria-current={i === square ? "step" : undefined}
            className={cx(
              "relative flex min-w-0 flex-1 flex-col rounded-2xl border-2 p-2 text-[0.72rem] leading-tight transition-colors duration-300",
              i === square ? "border-[#008282] bg-[#008282] text-white" : "text-[#1d2b4f]",
            )}
            style={i === square ? undefined : { background: tile[k].fill, borderColor: tile[k].edge }}
          >
            <span className="font-mulish text-base font-extrabold">{i + 1}</span>
            {names && <span className="mt-0.5 font-semibold">{board.squares[i]}</span>}
            {kindLabel[k] && (names || k === "start" || k === "handover") && (
              <span className={cx("mt-auto pt-1 font-mulish text-[0.62rem] font-bold uppercase", i === square ? "text-white/85" : "text-ink-muted")}>{kindLabel[k]}</span>
            )}
            {ladder && names && <span className={cx("text-[0.62rem] font-semibold", i === square ? "text-white" : "text-[#0f5b5b]")}>↑ {board.squares[ladder.to]}</span>}
            {i === square && <span className="sr-only">(you are here)</span>}
          </li>
        );
      })}
    </ol>
  );
}
