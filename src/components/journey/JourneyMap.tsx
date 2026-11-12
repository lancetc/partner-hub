"use client";

import Image from "next/image";
import { useEffect, useRef, useState } from "react";
import { between, forkAt, forks, phaseOf, phases, stages, type Between, type Fork, type JourneyText, type Stage } from "@/content/journey";
import { cx } from "@/lib/format";
import { Icon } from "../Icon";
import { StageArt } from "./JourneyArt";

/*
  The client journey: a short hero with a curve of how each stage feels, then a road running left
  to right through ten illustrated stages and the moments in between (often waiting). All text is
  shown plainly; which parts are suggestions awaiting validation is kept in the content
  (`suggested`), not marked on the page.

  Motion: the hero rises in, the curve draws itself, the road's lane markings flow, and each stop
  animates in as it scrolls into view. None of it plays for people who prefer reduced motion, and
  nothing is hidden unless the script that reveals it is running.
*/

const MOTION = `
@media (prefers-reduced-motion: no-preference) {
  .jm-rise { animation: jm-rise 0.7s cubic-bezier(0.2, 0.7, 0.2, 1) both; animation-delay: var(--d, 0s); }
  .jm-dash { animation: jm-dash 6s linear infinite; }
  .jm-lane { animation: jm-lane 1.4s linear infinite; }

  [data-anim] > li .jm-art,
  [data-anim] > li .jm-badge,
  [data-anim] > li .jm-card,
  [data-anim] > li .jm-sign { opacity: 0; }
  [data-anim] > li[data-shown] .jm-art { animation: jm-art 0.7s cubic-bezier(0.2, 0.7, 0.2, 1) both; }
  [data-anim] > li[data-shown] .jm-badge { animation: jm-badge 0.55s cubic-bezier(0.34, 1.56, 0.64, 1) 0.15s both; }
  [data-anim] > li[data-shown] .jm-card { animation: jm-card 0.6s ease-out 0.25s both; }
  [data-anim] > li[data-shown] .jm-sign { animation: jm-sign 0.9s ease-out 0.1s both; }
}
@keyframes jm-rise { from { opacity: 0; transform: translateY(16px); } to { opacity: 1; transform: none; } }
@keyframes jm-dash { to { stroke-dashoffset: -96; } }
@keyframes jm-lane { to { background-position-x: 18px; } }
@keyframes jm-art { from { opacity: 0; transform: translateY(20px) scale(0.92); } to { opacity: 1; transform: none; } }
@keyframes jm-badge { from { opacity: 0; transform: scale(0.3); } to { opacity: 1; transform: scale(1); } }
@keyframes jm-card { from { opacity: 0; transform: translateY(-14px); } to { opacity: 1; transform: none; } }
@keyframes jm-sign {
  0% { opacity: 0; transform: rotate(-7deg) translateY(10px); }
  55% { opacity: 1; transform: rotate(2.5deg); }
  80% { transform: rotate(-1deg); }
  100% { opacity: 1; transform: none; }
}
`;

export function JourneyMap() {
  return (
    <div className="pb-14">
      <style>{MOTION}</style>
      <Hero />
      <Road />
    </div>
  );
}

/* The top: what this is, and the feeling curve across all ten stages. Fixed brand colours, the same in light and dark. */
function Hero() {
  return (
    <section className="relative isolate overflow-hidden bg-[#102a43] text-white">
      {/* A winding road behind the title, its centre line moving. Decorative. */}
      <svg aria-hidden viewBox="0 0 1200 520" preserveAspectRatio="xMidYMid slice" className="absolute inset-0 -z-10 size-full opacity-[0.16]">
        <path d="M-40 420 C 220 300, 360 520, 600 380 S 980 140, 1240 220" fill="none" stroke="#4cc3c9" strokeWidth="70" strokeLinecap="round" />
        <path
          d="M-40 420 C 220 300, 360 520, 600 380 S 980 140, 1240 220"
          className="jm-dash"
          fill="none"
          stroke="#ffc72c"
          strokeWidth="5"
          strokeDasharray="26 22"
        />
      </svg>
      <div className="mx-auto max-w-6xl px-4 pb-6 pt-7 sm:px-6 lg:pb-8 lg:pt-9">
        <div className="flex flex-col gap-x-10 gap-y-3 lg:flex-row lg:items-end lg:justify-between">
          <div>
            <p className="jm-rise font-mulish text-xs font-extrabold uppercase tracking-[0.16em] text-[#ffc72c]">Trilogy Care · Client journey map</p>
            <h1
              className="jm-rise mt-1.5 max-w-2xl font-serif text-3xl font-semibold leading-[1.08] tracking-tight sm:text-4xl lg:text-5xl"
              style={{ "--d": "0.08s" } as React.CSSProperties}
            >
              The client journey, from first call to exit
            </h1>
            <p className="jm-rise mt-3 max-w-2xl text-white/85 sm:text-lg" style={{ "--d": "0.16s" } as React.CSSProperties}>
              What the client does, what Trilogy Care does, and how it feels at each stage, including the waits in between.
            </p>
          </div>
          <ul className="jm-rise flex shrink-0 flex-wrap gap-2 text-sm font-semibold lg:flex-col" style={{ "--d": "0.24s" } as React.CSSProperties}>
            {[
              { icon: "route" as const, text: `${stages.length} stages` },
              { icon: "clock" as const, text: `${between.length} moments in between` },
              { icon: "layers" as const, text: `${phases.length} phases` },
              { icon: "route" as const, text: `${forks.reduce((n, f) => n + f.paths.length, 0)} alternative paths` },
            ].map((x) => (
              <li key={x.text} className="inline-flex min-h-8 items-center gap-2 rounded-full bg-white/10 px-3 ring-1 ring-white/15">
                <Icon name={x.icon} className="size-4 text-[#4cc3c9]" /> {x.text}
              </li>
            ))}
          </ul>
        </div>
        <FeelingCurve />
      </div>
    </section>
  );
}

const W = 1000;
const H = 220;
const PAD = 74;
const TOP = 54;
const BAND = 96;
const xAt = (i: number) => PAD + (i * (W - PAD * 2)) / (stages.length - 1);
const yAt = (score: number) => TOP + ((5 - score) / 4) * BAND;
const dotColour = (score: number) => (score >= 4 ? "#4cc3c9" : score >= 3 ? "#ffc72c" : "#f26a36");

/** A smooth line through the points (Catmull-Rom as cubic Béziers). */
function smooth(pts: [number, number][]) {
  let d = `M${pts[0][0]} ${pts[0][1]}`;
  for (let i = 0; i < pts.length - 1; i++) {
    const p0 = pts[i - 1] ?? pts[i];
    const p1 = pts[i];
    const p2 = pts[i + 1];
    const p3 = pts[i + 2] ?? p2;
    const c1 = [p1[0] + (p2[0] - p0[0]) / 6, p1[1] + (p2[1] - p0[1]) / 6];
    const c2 = [p2[0] - (p3[0] - p1[0]) / 6, p2[1] - (p3[1] - p1[1]) / 6];
    d += ` C${c1[0].toFixed(1)} ${c1[1].toFixed(1)}, ${c2[0].toFixed(1)} ${c2[1].toFixed(1)}, ${p2[0]} ${p2[1]}`;
  }
  return d;
}

/** How each stage feels, as a line from low to high. Each dot jumps to its stage. */
function FeelingCurve() {
  const pts = stages.map((s, i) => [xAt(i), yAt(s.score)] as [number, number]);
  const line = smooth(pts);
  return (
    <figure className="jm-rise mt-5 rounded-3xl bg-white/[0.06] p-2.5 ring-1 ring-white/12 sm:p-4" style={{ "--d": "0.3s" } as React.CSSProperties}>
      <figcaption className="flex flex-wrap items-baseline justify-between gap-x-4 gap-y-1 px-1">
        <span className="font-serif text-lg font-semibold">How it feels</span>
        <span className="text-sm text-white/70">A suggestion from the Feeling row. Choose a stage to jump to it.</span>
      </figcaption>
      {/* Scrolls sideways inside the card on a phone, so the labels stay readable. */}
      <div className="-mx-1 mt-1 overflow-x-auto px-1 pb-1">
        <svg viewBox={`0 0 ${W} ${H}`} className="block w-full min-w-[680px]" role="group" aria-label="Feeling curve across the ten stages">
          <defs>
            <linearGradient id="journey-area" x1="0" y1="0" x2="0" y2="1">
              <stop offset="0" stopColor="#4cc3c9" stopOpacity="0.35" />
              <stop offset="1" stopColor="#4cc3c9" stopOpacity="0" />
            </linearGradient>
            <style>{`
              @media (prefers-reduced-motion: no-preference) {
                .journey-line { stroke-dasharray: 1600; stroke-dashoffset: 1600; animation: journey-draw 1.8s ease-out 0.5s forwards; }
                .journey-dot { opacity: 0; animation: journey-pop 0.4s ease-out forwards; }
              }
              @keyframes journey-draw { to { stroke-dashoffset: 0; } }
              @keyframes journey-pop { from { opacity: 0; transform: scale(0.4); } to { opacity: 1; transform: scale(1); } }
              .journey-stop:focus-visible circle.ring { stroke: #ffffff; stroke-width: 3; }
              .journey-stop:hover circle.ring { stroke: #ffffff; stroke-width: 2; }
            `}</style>
          </defs>

          {/* Phases as bands, with their names along the top. */}
          {phases.map((p) => {
            const first = stages.findIndex((s) => s.n === p.stages[0]);
            const last = stages.findIndex((s) => s.n === p.stages[p.stages.length - 1]);
            const step = (W - PAD * 2) / (stages.length - 1);
            const x0 = first === 0 ? 8 : xAt(first) - step / 2;
            const x1 = last === stages.length - 1 ? W - 8 : xAt(last) + step / 2;
            return (
              <g key={p.name}>
                <rect x={x0 + 3} y="6" width={x1 - x0 - 6} height={H - 12} rx="16" fill={p.colour} opacity="0.32" />
                <text x={(x0 + x1) / 2} y="27" textAnchor="middle" fill="#ffffff" opacity="0.85" fontSize="13" fontWeight="700" letterSpacing="1.5">
                  {p.name.toUpperCase()}
                </text>
              </g>
            );
          })}

          {/* Guide lines for high and low. */}
          {[5, 3, 1].map((v) => (
            <line key={v} x1={PAD - 30} x2={W - PAD + 30} y1={yAt(v)} y2={yAt(v)} stroke="#ffffff" strokeOpacity="0.12" strokeDasharray="4 6" />
          ))}
          <text x="16" y={yAt(5) + 5} fill="#ffffff" opacity="0.6" fontSize="13">
            Good
          </text>
          <text x="16" y={yAt(1) + 5} fill="#ffffff" opacity="0.6" fontSize="13">
            Hard
          </text>

          <path d={`${line} L${xAt(stages.length - 1)} ${yAt(1) + 24} L${xAt(0)} ${yAt(1) + 24} Z`} fill="url(#journey-area)" />
          <path d={line} className="journey-line" fill="none" stroke="#ffc72c" strokeWidth="4" strokeLinecap="round" />

          {/* Waits in between, as small clocks on the baseline. */}
          {between
            .filter((b) => b.wait && b.after > 0)
            .map((b) => {
              const x = (xAt(b.after - 1) + xAt(b.after)) / 2;
              return (
                <g key={b.after} transform={`translate(${x} ${H - 24})`} opacity="0.85">
                  <title>{b.title}</title>
                  <circle r="10" fill="#102a43" stroke="#ffffff" strokeOpacity="0.5" strokeDasharray="3 3" />
                  <path d="M0 -4.5 v4.5 l3 2.2" fill="none" stroke="#ffffff" strokeWidth="1.8" strokeLinecap="round" />
                </g>
              );
            })}
          <text x={W - 16} y={H - 20} textAnchor="end" fill="#ffffff" opacity="0.55" fontSize="12">
            ◷ a wait
          </text>

          {stages.map((s, i) => {
            const [x, y] = pts[i];
            return (
              <a key={s.n} href={`#stage-${s.n}`} className="journey-stop" aria-label={`Stage ${s.n}, ${s.title}: feels ${s.mood.toLowerCase()}`}>
                <g className="journey-dot" style={{ transformOrigin: `${x}px ${y}px`, transformBox: "view-box", animationDelay: `${0.6 + i * 0.12}s` }}>
                  <circle cx={x} cy={y} r="26" fill="transparent" />
                  <circle className="ring" cx={x} cy={y} r="15" fill={dotColour(s.score)} stroke="#102a43" strokeWidth="3" />
                  <text x={x} y={y + 5} textAnchor="middle" fontSize="14" fontWeight="800" fill="#102a43">
                    {s.n}
                  </text>
                  <text x={x} y={y + 33} textAnchor="middle" fontSize="13" fontWeight="600" fill="#ffffff">
                    {s.mood}
                  </text>
                </g>
              </a>
            );
          })}
        </svg>
      </div>
    </figure>
  );
}

/** Journey text, shown plainly. */
const Txt = ({ parts }: { parts: JourneyText }) => <>{parts.map((p) => p.text).join(" ")}</>;

/*
  The timeline: a road running left to right. Each stage has its illustration above the road, its
  number on it, and what happens below. The moments in between sit on the road as signposts.
  Rows line up across every column (CSS subgrid), so the road stays straight however long a card is.
*/

/** Space on each side of the timeline, so its first stop lines up with the page content above. */
const GUTTER = "max(1rem, calc((100vw - 72rem) / 2 + 1.5rem))";

function Road() {
  const scroller = useRef<HTMLDivElement>(null);
  const track = useRef<HTMLOListElement>(null);
  const [edge, setEdge] = useState({ start: true, end: false });

  useEffect(() => {
    const el = scroller.current;
    if (!el) return;
    const update = () => setEdge({ start: el.scrollLeft < 8, end: el.scrollLeft + el.clientWidth > el.scrollWidth - 8 });
    update();
    el.addEventListener("scroll", update, { passive: true });
    window.addEventListener("resize", update);
    // A link to a stage or phase (from the feeling curve or the phase links) brings it into view on both axes,
    // clear of the sticky header.
    const reveal = () => {
      const target = /^#((stage|phase)-\d+|fork-[a-z-]+)$/.test(location.hash) ? document.querySelector<HTMLElement>(location.hash) : null;
      if (!target) return;
      const stop = target.closest("li") ?? target;
      const reduce = window.matchMedia("(prefers-reduced-motion: reduce)").matches;
      // A stop shows from the top of the timeline; the side roads sit lower down, so they're brought up themselves.
      const top = target.id.startsWith("fork-") ? target.getBoundingClientRect().top - 110 : el.getBoundingClientRect().top - 140;
      requestAnimationFrame(() => {
        el.scrollTo({ left: stop.offsetLeft - parseFloat(getComputedStyle(el).paddingLeft), behavior: reduce ? "auto" : "smooth" });
        window.scrollTo({ top: top + window.scrollY, behavior: reduce ? "auto" : "smooth" });
      });
    };
    reveal();
    window.addEventListener("hashchange", reveal);
    return () => {
      el.removeEventListener("scroll", update);
      window.removeEventListener("resize", update);
      window.removeEventListener("hashchange", reveal);
    };
  }, []);

  // Each stop animates in the first time it comes into view (across the page or along the road).
  useEffect(() => {
    const ol = track.current;
    if (!ol || window.matchMedia("(prefers-reduced-motion: reduce)").matches || !("IntersectionObserver" in window)) return;
    const stops = [...ol.children] as HTMLElement[];
    const seen = new IntersectionObserver(
      (entries) => {
        for (const e of entries)
          if (e.isIntersecting) {
            (e.target as HTMLElement).dataset.shown = "";
            seen.unobserve(e.target);
          }
      },
      { threshold: 0.15 },
    );
    stops.forEach((li) => seen.observe(li));
    ol.dataset.anim = "";
    return () => seen.disconnect();
  }, []);

  const move = (dir: 1 | -1) => {
    const el = scroller.current;
    if (!el) return;
    const reduce = window.matchMedia("(prefers-reduced-motion: reduce)").matches;
    el.scrollBy({ left: dir * Math.min(el.clientWidth * 0.8, 900), behavior: reduce ? "auto" : "smooth" });
  };

  const items: React.ReactNode[] = [];
  // Which grid column each stage lands in, so a fork's side roads can sit under exactly those stages.
  const column: Record<number, number> = {};
  stages.forEach((s) => {
    const b = between.find((x) => x.after === s.n - 1);
    if (b) items.push(<Moment key={`b${b.after}`} b={b} first={b.after === 0} />);
    items.push(<StageStop key={s.n} s={s} />);
    column[s.n] = items.length;
  });
  const sideRoads = forks.map((f) => <ForkLanes key={f.id} f={f} from={column[f.from]} to={column[f.to]} />);

  return (
    <section aria-labelledby="journey-timeline" className="mt-7">
      <div className="mx-auto flex max-w-6xl flex-wrap items-center justify-between gap-x-6 gap-y-3 px-4 sm:px-6">
        <div className="min-w-0">
          <h2 id="journey-timeline" className="font-serif text-2xl font-semibold tracking-tight">
            The journey, stage by stage
          </h2>
          <p className="text-sm text-ink-muted">Scroll sideways, or use the arrows, to follow the road.</p>
        </div>
        <div className="flex flex-wrap items-center gap-2">
          <nav aria-label="Phases" className="flex flex-wrap gap-1.5">
            {phases.map((p) => (
              <a
                key={p.name}
                href={`#phase-${p.stages[0]}`}
                className="inline-flex min-h-11 items-center gap-2 rounded-full border border-line-strong px-3 text-sm font-semibold hover:bg-muted"
              >
                <span className="size-2.5 rounded-full" style={{ background: p.colour }} aria-hidden />
                {p.name}
              </a>
            ))}
          </nav>
          <span className="flex gap-1.5">
            <button
              type="button"
              onClick={() => move(-1)}
              disabled={edge.start}
              aria-label="Earlier in the journey"
              className="grid size-11 place-items-center rounded-full border border-line-strong bg-surface hover:bg-muted disabled:opacity-35"
            >
              <Icon name="arrow-left" className="size-5" />
            </button>
            <button
              type="button"
              onClick={() => move(1)}
              disabled={edge.end}
              aria-label="Later in the journey"
              className="grid size-11 place-items-center rounded-full bg-action text-on-action hover:bg-action-hover disabled:opacity-35"
            >
              <Icon name="arrow-right" className="size-5" />
            </button>
          </span>
        </div>
      </div>

      <div className="relative mt-3">
        {/* Fades at the edges hint there's more to either side. */}
        <div
          aria-hidden
          className={cx("pointer-events-none absolute inset-y-0 left-0 z-20 w-10 bg-gradient-to-r from-bg to-transparent transition-opacity", edge.start && "opacity-0")}
        />
        <div
          aria-hidden
          className={cx("pointer-events-none absolute inset-y-0 right-0 z-20 w-10 bg-gradient-to-l from-bg to-transparent transition-opacity", edge.end && "opacity-0")}
        />
        <div
          ref={scroller}
          role="region"
          aria-label="Client journey timeline, from left to right"
          tabIndex={0}
          className="snap-x snap-proximity overflow-x-auto overscroll-x-contain pb-4 pt-1 focus-visible:outline-2 focus-visible:outline-offset-[-2px] focus-visible:outline-focus motion-safe:scroll-smooth"
          style={{ paddingInline: GUTTER, scrollPaddingInline: GUTTER }}
        >
          {/* Four rows per stop (phase, picture, road, card), and a fifth for side roads where the journey forks. */}
          <ol ref={track} className="grid w-max auto-cols-max grid-flow-col grid-rows-[auto_auto_auto_auto_auto] gap-x-3">
            {items}
            <EndStop />
            {sideRoads}
          </ol>
        </div>
      </div>
    </section>
  );
}

/** The road under one column: a band with moving lane markings, reaching back across the gap before it. */
function RoadPiece({ first = false, last = false }: { first?: boolean; last?: boolean }) {
  const ends = cx(first ? "left-1/2" : "-left-3", last ? "right-1/2" : "right-0");
  return (
    <>
      <span aria-hidden className={cx("absolute top-1/2 h-3 -translate-y-1/2 bg-strong", ends, first && "rounded-l-full", last && "rounded-r-full")} />
      <span
        aria-hidden
        className={cx("jm-lane absolute top-1/2 h-0.5 -translate-y-1/2 opacity-60", ends)}
        style={{ backgroundImage: "repeating-linear-gradient(90deg, var(--accent) 0 9px, transparent 9px 18px)" }}
      />
    </>
  );
}

/** The phase band along the top: a coloured line, named where the phase begins. */
function PhaseBand({ n, named }: { n: number; named: boolean }) {
  const p = phaseOf(n);
  const index = phases.indexOf(p) + 1;
  const range = p.stages.length > 1 ? `Stages ${p.stages[0]}–${p.stages[p.stages.length - 1]}` : `Stage ${p.stages[0]}`;
  return (
    <div className="flex flex-col justify-end gap-1.5 pb-2.5">
      {named && (
        <h3
          id={`phase-${n}`}
          className="inline-flex min-h-7 w-max scroll-mt-24 items-center gap-x-2 self-start whitespace-nowrap rounded-full px-3 py-0.5 font-mulish text-[0.7rem] font-extrabold uppercase tracking-[0.12em] text-white shadow-sm"
          style={{ background: p.colour }}
        >
          <span className="opacity-75">Phase {index}</span> {p.name}
          <span className="font-sans font-semibold normal-case tracking-normal opacity-80">· {range}</span>
        </h3>
      )}
      <span aria-hidden className="-mr-3 h-1.5 rounded-full" style={{ background: p.colour }} />
    </div>
  );
}

/** Something that happens between two stages: a signpost on the road. */
function Moment({ b, first }: { b: Between; first: boolean }) {
  // It belongs to the phase it follows on from (the first one before stage 1).
  const n = Math.max(b.after, 1);
  // The first card, with its picture, is the tallest: it hangs below the road so the pictures above stay close to it.
  const below = b.after === 0;
  const post = <span aria-hidden className="mx-auto block h-3.5 w-0.5 border-l-2 border-dashed border-line-strong" />;
  const card = (
    <div className="rounded-2xl border-2 border-dashed border-line-strong bg-surface p-3">
      {/* Before stage 1 has its own picture: an older man and a younger family member talking it over at home. */}
      {below && (
        <div className="relative -mx-0.5 -mt-0.5 mb-2.5 aspect-[1376/768] overflow-hidden rounded-xl ring-1 ring-black/5">
          <Image
            src="/images/journey-before-it-starts.webp"
            alt="An older man and a younger family member talking over cups of tea at the kitchen table"
            fill
            sizes="14rem"
            className="object-cover"
          />
        </div>
      )}
      <p className="flex flex-wrap items-center gap-1.5 font-mulish text-[0.7rem] font-extrabold uppercase tracking-[0.12em] text-ink-muted">
        {below ? "Before it starts" : `Between ${b.after} and ${b.after + 1}`}
        {b.wait && (
          <span className="inline-flex items-center gap-1 rounded-full bg-orange/15 px-2 py-0.5 normal-case tracking-normal text-warm">
            <Icon name="clock" className="size-3.5" /> Waiting
          </span>
        )}
      </p>
      <h4 className="mt-1 font-serif text-base font-semibold leading-snug">{b.title}</h4>
      <p className="mt-0.5 text-sm leading-snug text-ink-muted">{b.text}</p>
    </div>
  );
  return (
    // minmax(0, 1fr): a long phase label overflows visibly instead of widening the column into the next one.
    <li className="row-span-4 grid w-[min(70vw,13.5rem)] snap-start grid-cols-[minmax(0,1fr)] grid-rows-subgrid">
      <PhaseBand n={n} named={first} />
      {/* A post joins the card to the road, from above or below. The sign swings in from the post. */}
      {below ? (
        <div />
      ) : (
        <div className="jm-sign origin-bottom self-end">
          {card}
          {post}
        </div>
      )}
      <div className="relative flex h-12 items-center justify-center">
        <RoadPiece first={first} />
        <span className="jm-badge relative z-10 grid size-9 place-items-center rounded-full border-2 border-dashed border-accent/60 bg-bg text-accent">
          <Icon name={b.icon} className="size-4" />
        </span>
      </div>
      {below ? (
        <div className="jm-sign -mt-1.5 origin-top self-start">
          {post}
          {card}
        </div>
      ) : (
        <div />
      )}
    </li>
  );
}

/** One stage: the illustration above the road, its number on it, and what happens below. */
function StageStop({ s }: { s: Stage }) {
  const phase = phaseOf(s.n);
  const fork = forkAt(s.n);
  return (
    <li id={`stage-${s.n}`} className="row-span-4 grid w-[min(84vw,20rem)] scroll-mt-24 snap-start grid-cols-[minmax(0,1fr)] grid-rows-subgrid">
      <PhaseBand n={s.n} named={phase.stages[0] === s.n && s.n !== 1} />
      {/* Smaller than the card below, centred over the stop. A photo, where the stage has one, fills the same frame. */}
      <div className="jm-art relative mx-auto aspect-[400/260] w-[78%] self-end overflow-hidden rounded-2xl shadow-lg ring-1 ring-black/5">
        {s.photo ? (
          <Image src={s.photo.src} alt={s.photo.alt} fill sizes="16rem" className="object-cover" />
        ) : (
          <StageArt n={s.n} className="block size-full" />
        )}
      </div>
      <div className="relative flex h-12 items-center justify-center">
        <RoadPiece />
        <span
          className="jm-badge relative z-10 grid size-11 place-items-center rounded-full font-serif text-xl font-semibold text-white shadow-md ring-4 ring-bg"
          style={{ background: phase.colour }}
          aria-hidden
        >
          {s.n}
        </span>
      </div>
      <article className="jm-card self-start rounded-2xl border border-line bg-surface p-4 text-sm shadow-sm">
        <p className="flex flex-wrap items-center gap-x-2 gap-y-1 font-mulish text-[0.7rem] font-extrabold uppercase tracking-[0.12em]">
          <span className="text-accent">Stage {s.n}</span>
          <span className="text-ink-muted">· {phase.name}</span>
          {s.n === 9 && <span className="rounded-full bg-muted px-2 py-0.5 normal-case tracking-normal text-ink">Can happen at any stage</span>}
        </p>
        <h3 className="mt-0.5 font-serif text-xl font-semibold leading-tight">{s.title}</h3>

        {/* The role named in the deck; stages whose owner isn't settled yet show none. */}
        {!s.role.confirm && (
          <span className="mt-2 inline-flex items-center gap-1.5 rounded-full bg-tealtint px-2.5 py-0.5 text-xs font-semibold">
            <Icon name="people" className="size-3.5 text-accent" /> {s.role.text}
          </span>
        )}
        {fork && (
          <a
            href={`#fork-${fork.id}`}
            className="ml-1 mt-2 inline-flex items-center gap-1 rounded-full border border-dashed border-accent/60 px-2.5 py-0.5 text-xs font-semibold text-accent hover:bg-tealtint"
          >
            <Icon name="route" className="size-3.5" /> Varies by {fork.by.toLowerCase()}
          </a>
        )}
        <p className="mt-2 flex items-start gap-1.5 text-ink-muted">
          <Icon name="pin" className="mt-0.5 size-3.5 shrink-0 text-accent" />
          <span>
            <span className="font-semibold text-ink">Touchpoint: </span>
            <Txt parts={s.touchpoint} />
          </span>
        </p>

        <div className="mt-2.5 grid gap-2">
          <section className="rounded-xl bg-tealtint px-3 py-2">
            <h4 className="flex items-center gap-1.5 font-mulish text-[0.7rem] font-extrabold uppercase tracking-[0.12em]">
              <Icon name="user" className="size-3.5 text-accent" /> The client
            </h4>
            <p className="mt-0.5 leading-snug">
              <Txt parts={s.client} />
            </p>
          </section>
          <section className="rounded-xl bg-muted px-3 py-2">
            <h4 className="flex items-center gap-1.5 font-mulish text-[0.7rem] font-extrabold uppercase tracking-[0.12em]">
              <Icon name="building" className="size-3.5 text-accent" /> Trilogy Care
            </h4>
            <p className="mt-0.5 leading-snug">
              <Txt parts={s.trilogy} />
            </p>
          </section>
        </div>

        <section className="mt-2.5 flex items-start gap-2.5">
          <Mood score={s.score} />
          <div className="min-w-0">
            <h4 className="font-mulish text-[0.7rem] font-extrabold uppercase tracking-[0.12em]">
              Feeling <span className="font-sans font-semibold normal-case tracking-normal text-ink-muted">· {s.mood}</span>
            </h4>
            <p className="leading-snug">
              <Txt parts={s.feeling} />
            </p>
          </div>
        </section>

        <section className="mt-2.5 rounded-xl border border-orange/40 bg-orange/10 px-3 py-2">
          <h4 className="flex items-center gap-1.5 font-mulish text-[0.7rem] font-extrabold uppercase tracking-[0.12em] text-warm">
            <Icon name="alert" className="size-3.5" /> Pain point
          </h4>
          <p className="mt-0.5 leading-snug">
            <Txt parts={s.pain} />
          </p>
        </section>

        <details className="group mt-2.5 rounded-xl border border-line">
          <summary className="flex min-h-11 cursor-pointer list-none items-center justify-between gap-3 px-3 font-semibold">
            <span className="flex items-center gap-2">
              <Icon name="people" className="size-4 text-accent" /> Who’s involved
            </span>
            <Icon name="chevron-down" className="size-4 text-ink-muted transition-transform group-open:rotate-180" />
          </summary>
          <p className="px-3 pb-3 leading-snug text-ink-muted">
            <Txt parts={s.involved} />
          </p>
        </details>
      </article>
    </li>
  );
}

/** The end of the road. */
function EndStop() {
  return (
    <li className="row-span-4 grid w-36 snap-start grid-rows-subgrid">
      <div />
      <div />
      <div className="relative flex h-12 items-center justify-center">
        <RoadPiece last />
        <span className="jm-badge relative z-10 grid size-11 place-items-center rounded-full bg-[#102a43] text-[#ffc72c] ring-4 ring-bg">
          <Icon name="heart" className="size-5" />
        </span>
      </div>
      <p className="text-center text-sm font-semibold text-ink-muted">The end of the journey</p>
    </li>
  );
}

/** A curve from one point to two lanes (or back), drawn to fill its box. Lanes sit at a quarter and three quarters down. */
function Junction({ merge = false }: { merge?: boolean }) {
  const lanes = merge ? ["M0 25 C 55 25, 45 50, 100 50", "M0 75 C 55 75, 45 50, 100 50"] : ["M0 50 C 55 50, 45 25, 100 25", "M0 50 C 55 50, 45 75, 100 75"];
  return (
    <svg aria-hidden viewBox="0 0 100 100" preserveAspectRatio="none" className="block size-full overflow-visible">
      {lanes.map((d) => (
        <path key={d} d={d} fill="none" stroke="var(--surface-strong)" strokeWidth="12" vectorEffect="non-scaling-stroke" />
      ))}
      {lanes.map((d) => (
        <path
          key={`${d}-line`}
          d={d}
          fill="none"
          stroke="var(--accent)"
          strokeOpacity="0.6"
          strokeWidth="2"
          strokeDasharray="9 9"
          vectorEffect="non-scaling-stroke"
        />
      ))}
      <circle cx={merge ? 100 : 0} cy="50" r="7" fill="var(--accent)" vectorEffect="non-scaling-stroke" />
    </svg>
  );
}

/**
  Where the road splits: side roads under the stages that run differently (by package type, say),
  rejoining the main road after the last of them. Placed under those stages' columns, below their cards.
*/
function ForkLanes({ f, from, to }: { f: Fork; from: number; to: number }) {
  return (
    <li id={`fork-${f.id}`} className="mt-5 scroll-mt-24" style={{ gridColumn: `${from} / ${to + 1}`, gridRow: 5 }}>
      <div className="jm-card rounded-3xl border-2 border-dashed border-line-strong bg-surface p-4 sm:p-5">
        <div className="flex flex-wrap items-end justify-between gap-x-6 gap-y-2">
          <div className="max-w-2xl">
            <p className="flex items-center gap-1.5 font-mulish text-[0.7rem] font-extrabold uppercase tracking-[0.12em] text-accent">
              <Icon name="route" className="size-3.5" /> Where the road splits · Stages {f.from}–{f.to}
            </p>
            <h3 className="mt-0.5 font-serif text-xl font-semibold leading-tight">Two ways through, by {f.by.toLowerCase()}</h3>
            <p className="mt-0.5 text-sm text-ink-muted">{f.intro}</p>
          </div>
          <p className="inline-flex items-center gap-1.5 text-sm font-semibold text-ink-muted">
            Rejoins the main road at stage {f.to + 1} <Icon name="arrow-right" className="size-4" />
          </p>
        </div>

        <div className="mt-4 grid grid-cols-[3rem_minmax(0,1fr)_3rem] sm:grid-cols-[5rem_minmax(0,1fr)_5rem]">
          <Junction />
          {/* Equal rows with no gap, so each side road runs through a quarter and three quarters of the way down. */}
          <div className="grid auto-rows-fr">
            {f.paths.map((p) => (
              <div key={p.name} className="relative flex items-center py-2">
                <span aria-hidden className="absolute inset-x-0 top-1/2 h-3 -translate-y-1/2 bg-strong" />
                <span
                  aria-hidden
                  className="jm-lane absolute inset-x-0 top-1/2 h-0.5 -translate-y-1/2 opacity-60"
                  style={{ backgroundImage: "repeating-linear-gradient(90deg, var(--accent) 0 9px, transparent 9px 18px)" }}
                />
                <div className="relative z-10 mx-auto flex w-full max-w-2xl items-start gap-3 rounded-2xl border border-line bg-surface p-3 shadow-sm">
                  <span aria-hidden className="mt-1 h-10 w-1.5 shrink-0 rounded-full" style={{ background: p.colour }} />
                  <div className="min-w-0 text-sm">
                    <p className="flex flex-wrap items-center gap-x-2 gap-y-1">
                      <span className="rounded-full px-2.5 py-0.5 font-mulish text-xs font-extrabold text-white" style={{ background: p.colour }}>
                        {p.name}
                      </span>
                      <span className="font-semibold">{p.who}</span>
                    </p>
                    <p className="mt-1 leading-snug text-ink-muted">
                      <Txt parts={p.text} />
                    </p>
                  </div>
                </div>
              </div>
            ))}
          </div>
          <Junction merge />
        </div>
      </div>
    </li>
  );
}

/** A small meter for how a stage feels, from 1 (hard) to 5 (good). */
function Mood({ score }: { score: number }) {
  const colour = dotColour(score);
  return (
    <span
      className="grid size-8 shrink-0 place-items-center rounded-full"
      style={{ background: colour }}
      role="img"
      aria-label={`Feels about ${Math.round(score)} out of 5`}
    >
      <svg viewBox="0 0 24 24" className="size-5" aria-hidden>
        <circle cx="9" cy="10" r="1.6" fill="#102a43" />
        <circle cx="15" cy="10" r="1.6" fill="#102a43" />
        {/* The mouth curves with the score. */}
        <path d={`M7.5 15.5 Q12 ${15.5 + (score - 3) * 2.2} 16.5 15.5`} fill="none" stroke="#102a43" strokeWidth="1.8" strokeLinecap="round" />
      </svg>
    </span>
  );
}
