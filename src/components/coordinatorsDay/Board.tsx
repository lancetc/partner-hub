"use client";

import { useEffect, useMemo, useRef, useState } from "react";
import type { Board, Move } from "@/lib/coordinatorsDay";
import { cx } from "@/lib/format";

/*
  The Coordinator's Day board: the squares of the day in a winding path from the bottom left, the
  ladders (opportunities) and the marked slides (setbacks), and the learner's token. A move walks the
  token square by square, or glides up a ladder or down a slide; with reduced motion it simply appears
  there. Every square says what kind it is in words as well as colour.
*/

const COLS = 5;
const CW = 150;
const CH = 128;
const PAD = 14;

export type SquareKind = "start" | "handover" | "ladder" | "top" | "slide" | "work";

export function squareKinds(board: Board): SquareKind[] {
  const end = board.squares.length - 1;
  const heads = new Set(board.checkpoints.flatMap((c) => c.events.map((e) => e.from)));
  return board.squares.map((_, i) =>
    i === 0 ? "start" : i === end ? "handover" : board.ladders.some((l) => l.from === i) ? "ladder" : board.ladders.some((l) => l.to === i) ? "top" : heads.has(i) ? "slide" : "work",
  );
}

/** Where each square's centre sits. */
function layout(n: number) {
  const rows = Math.ceil(n / COLS);
  const at = (i: number) => {
    const row = Math.floor(i / COLS);
    const col = row % 2 === 0 ? i % COLS : COLS - 1 - (i % COLS);
    return { x: PAD + col * CW + CW / 2, y: PAD + (rows - 1 - row) * CH + CH / 2 };
  };
  return { rows, at, width: COLS * CW + PAD * 2, height: rows * CH + PAD * 2 };
}

const fill: Record<SquareKind, string> = {
  start: "#e8f3f3",
  handover: "#fde9c4",
  ladder: "#dff3ea",
  top: "#dff3ea",
  slide: "#fbe3e1",
  work: "#ffffff",
};
const kindLabel: Record<SquareKind, string> = {
  start: "Start",
  handover: "Finish",
  ladder: "Opportunity",
  top: "Milestone",
  slide: "Setback risk",
  work: "",
};

export function DayBoard({ board, square, move, className, label }: { board: Board; square: number; move?: Move; className?: string; label?: string }) {
  const { at, width, height } = layout(board.squares.length);
  const kinds = useMemo(() => squareKinds(board), [board]);
  const slides = useMemo(() => {
    const seen = new Map<string, { from: number; to: number }>();
    for (const c of board.checkpoints) for (const e of c.events) seen.set(`${e.from}-${e.to}`, { from: e.from, to: e.to });
    return [...seen.values()];
  }, [board]);

  // Where the token is drawn. It follows `square`: a new move walks it a square at a time, or glides it up a
  // ladder or down a slide; anything else (a resumed game, another level) puts it straight there.
  const handled = useRef(move?.n ?? 0);
  const [pos, setPos] = useState(square);
  const [glide, setGlide] = useState(false);
  useEffect(() => {
    const timers: number[] = [];
    const later = (ms: number, fn: () => void) => timers.push(window.setTimeout(fn, ms));
    if (!move || move.n === handled.current) {
      later(0, () => {
        setGlide(false);
        setPos(square);
      });
    } else {
      handled.current = move.n;
      const reduce = window.matchMedia("(prefers-reduced-motion: reduce)").matches;
      const walking = (move.kind === "step" || move.kind === "walk") && Math.abs(move.to - move.from) > 1;
      if (reduce || !walking) {
        later(0, () => {
          setGlide(move.kind === "ladder" || move.kind === "slide");
          setPos(move.to);
        });
      } else {
        for (let i = 1, s = move.from + 1; s <= move.to; i++, s++) {
          const step = s;
          later(i * 260, () => {
            setGlide(false);
            setPos(step);
          });
        }
      }
    }
    return () => timers.forEach((t) => window.clearTimeout(t));
  }, [move, square]);

  const token = at(pos);
  return (
    <svg viewBox={`0 0 ${width} ${height}`} className={cx("block w-full", className)} role="img" aria-label={label ?? `${board.title} board: ${board.squares.length} squares, from Start of day to Handover.`}>
      <defs>
        <marker id={`cd-slide-${board.level}`} viewBox="0 0 10 10" refX="7" refY="5" markerWidth="5" markerHeight="5" orient="auto">
          <path d="M0 0 L10 5 L0 10 z" fill="#c7393e" />
        </marker>
      </defs>

      {/* The path between squares. */}
      <polyline
        points={board.squares.map((_, i) => `${at(i).x},${at(i).y}`).join(" ")}
        fill="none"
        stroke="#9fc7c6"
        strokeWidth="6"
        strokeDasharray="2 12"
        strokeLinecap="round"
      />

      {board.squares.map((name, i) => {
        const c = at(i);
        const k = kinds[i];
        const here = i === square;

        return (
          <g key={i}>
            <rect
              x={c.x - CW / 2 + 6}
              y={c.y - CH / 2 + 6}
              width={CW - 12}
              height={CH - 12}
              rx="18"
              fill={fill[k]}
              stroke={here ? "#008282" : "#cfdedf"}
              strokeWidth={here ? 4 : 1.5}
            />
            <text x={c.x - CW / 2 + 18} y={c.y - CH / 2 + 30} fontSize="16" fontWeight="800" fill="#102a43" fontFamily="var(--font-mulish, sans-serif)">
              {i + 1}
            </text>
            {kindLabel[k] && (
              <text x={c.x + CW / 2 - 16} y={c.y - CH / 2 + 28} fontSize="11" fontWeight="700" fill={k === "slide" ? "#a12d31" : "#0f5b5b"} textAnchor="end" fontFamily="var(--font-mulish, sans-serif)">
                {kindLabel[k].toUpperCase()}
              </text>
            )}
          </g>
        );
      })}

      {/* Ladders: two rails and rungs, foot to top. */}
      {board.ladders.map((l) => {
        const a = at(l.from);
        const b = at(l.to);
        const len = Math.hypot(b.x - a.x, b.y - a.y);
        const nx = (-(b.y - a.y) / len) * 9;
        const ny = ((b.x - a.x) / len) * 9;
        const rungs = Math.max(2, Math.floor(len / 26));
        return (
          <g key={`l${l.from}`} opacity="0.9" pointerEvents="none">
            <title>{`Ladder from ${board.squares[l.from]} up to ${board.squares[l.to]}`}</title>
            <line x1={a.x + nx} y1={a.y + ny} x2={b.x + nx} y2={b.y + ny} stroke="#2a9d8f" strokeWidth="5" strokeLinecap="round" />
            <line x1={a.x - nx} y1={a.y - ny} x2={b.x - nx} y2={b.y - ny} stroke="#2a9d8f" strokeWidth="5" strokeLinecap="round" />
            {Array.from({ length: rungs }, (_, r) => {
              const t = (r + 1) / (rungs + 1);
              const x = a.x + (b.x - a.x) * t;
              const y = a.y + (b.y - a.y) * t;
              return <line key={r} x1={x + nx} y1={y + ny} x2={x - nx} y2={y - ny} stroke="#2a9d8f" strokeWidth="3.5" />;
            })}
            <Tag x={(a.x + b.x) / 2} y={(a.y + b.y) / 2 - 16} text={`↑ to ${board.squares[l.to]}`} tone="#0f5b5b" bg="#dff3ea" />
          </g>
        );
      })}

      {/* Slides: a curve from the setback square down to the work to redo. */}
      {slides.map((s, i) => {
        const a = at(s.from);
        const b = at(s.to);
        const sameRow = Math.abs(a.y - b.y) < 1;
        const mx = (a.x + b.x) / 2 + (sameRow ? 0 : i % 2 ? -50 : 50);
        const my = sameRow ? a.y + 62 : (a.y + b.y) / 2;
        return (
          <g key={`s${s.from}-${s.to}`} pointerEvents="none">
            <title>{`Possible setback: slide from ${board.squares[s.from]} down to ${board.squares[s.to]}`}</title>
            <path d={`M${a.x} ${a.y} Q${mx} ${my} ${b.x} ${b.y}`} fill="none" stroke="#c7393e" strokeOpacity="0.75" strokeWidth="9" strokeLinecap="round" markerEnd={`url(#cd-slide-${board.level})`} />
            <path d={`M${a.x} ${a.y} Q${mx} ${my} ${b.x} ${b.y}`} fill="none" stroke="#fff" strokeOpacity="0.8" strokeWidth="2" strokeDasharray="6 8" />
            <Tag x={mx} y={sameRow ? a.y + 36 : my} text={`↓ to ${board.squares[s.to]}`} tone="#a12d31" bg="#fbe3e1" />
          </g>
        );
      })}

      {/* The names, over the ladders and slides. */}
      {board.squares.map((name, i) => {
        const c = at(i);
        return (
          <foreignObject key={`n${i}`} x={c.x - CW / 2 + 12} y={c.y - 16} width={CW - 24} height={52} pointerEvents="none">
            <p className="flex h-full items-start justify-center">
              <span className="rounded-lg bg-white/85 px-1.5 py-0.5 text-center text-[15px] font-semibold leading-tight text-[#102a43] [box-decoration-break:clone]">{name}</span>
            </p>
          </foreignObject>
        );
      })}

      {/* The token. */}
      <g
        className={cx("cd-token", glide && "cd-token-glide")}
        style={{ transform: `translate(${token.x + 34}px, ${token.y + 30}px)` }}
        aria-hidden
      >
        <circle r="21" fill="#008282" stroke="#fff" strokeWidth="4" />
        <text textAnchor="middle" dy="5" fontSize="13" fontWeight="800" fill="#fff" fontFamily="var(--font-mulish, sans-serif)">
          You
        </text>
      </g>
    </svg>
  );
}

function Tag({ x, y, text, tone, bg }: { x: number; y: number; text: string; tone: string; bg: string }) {
  const w = Math.min(190, 18 + text.length * 7.2);
  return (
    <g>
      <rect x={x - w / 2} y={y - 13} width={w} height={24} rx="12" fill={bg} stroke={tone} strokeOpacity="0.35" />
      <text x={x} y={y + 4} textAnchor="middle" fontSize="12" fontWeight="700" fill={tone} fontFamily="var(--font-mulish, sans-serif)">
        {text}
      </text>
    </g>
  );
}

/** On a phone: the token's square and the next few, in a row. */
export function DayTrack({ board, square }: { board: Board; square: number }) {
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
              "relative flex min-w-0 flex-1 flex-col rounded-2xl p-2 text-[0.72rem] leading-tight ring-1 transition-colors duration-300",
              i === square ? "bg-[#008282] text-white ring-[#008282]" : "text-[#102a43] ring-line",
            )}
            style={i === square ? undefined : { background: fill[k] }}
          >
            <span className="font-mulish font-extrabold">{i + 1}</span>
            <span className="mt-0.5 font-semibold">{board.squares[i]}</span>
            {kindLabel[k] && <span className={cx("mt-auto pt-1 font-mulish text-[0.62rem] font-bold uppercase", i === square ? "text-white/85" : "text-ink-muted")}>{kindLabel[k]}</span>}
            {ladder && <span className={cx("text-[0.62rem] font-semibold", i === square ? "text-white" : "text-[#0f5b5b]")}>↑ {board.squares[ladder.to]}</span>}
            {i === square && <span className="sr-only">(you are here)</span>}
          </li>
        );
      })}
    </ol>
  );
}
