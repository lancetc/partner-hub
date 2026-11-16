"use client";

import { useEffect, useRef, useState } from "react";
import { cx } from "@/lib/format";
import { Icon, type IconName } from "../Icon";

/*
  Resources: a referring (P1) partner's first steps, and who they'll work with. The diagram builds
  itself when it scrolls into view: each person appears in turn, the lines between them draw on, their
  labels follow, then a gentle flow keeps moving along the lines. With reduced motion it's all there at once.

  It's one drawing in a fixed 1200 × 700 frame that scales with the page, so the boxes and lines stay
  lined up at every width (on a phone it scrolls sideways rather than shrinking past reading).
*/

type Node = { id: string; x: number; y: number; w: number; h: number; title: string; sub?: string; body?: string; icon: IconName; tone: "peach" | "light" | "teal"; at: number };

const NODES: Node[] = [
  { id: "partner", x: 450, y: 40, w: 300, h: 92, title: "Referring Partner", sub: "(P1 Partner)", icon: "building", tone: "peach", at: 0 },
  { id: "client", x: 150, y: 205, w: 330, h: 115, title: "Client", sub: "(care recipient)", icon: "user", tone: "light", at: 0.9 },
  {
    id: "manager",
    x: 760,
    y: 200,
    w: 390,
    h: 135,
    title: "Trilogy Partnership Manager",
    body: "Owns the referring partner relationship, onboarding, Partner Hub and 30/60/90-day plan.",
    icon: "people",
    tone: "teal",
    at: 1.6,
  },
  {
    id: "carePartner",
    x: 425,
    y: 395,
    w: 350,
    h: 112,
    title: "Care Partner",
    body: "Trilogy Care case manager: goals, care plan, budget, upgrades.",
    icon: "clipboard",
    tone: "teal",
    at: 2.4,
  },
  {
    id: "coordinator",
    x: 425,
    y: 570,
    w: 350,
    h: 105,
    title: "Care Coordinator",
    body: "Sources and rosters services, manages providers.",
    icon: "calendar",
    tone: "teal",
    at: 3.1,
  },
];

/** The lines: where they run, their label and where it sits, and when they draw. `both`: arrows at each end. */
const EDGES: { id: string; from: string; to: string; d: string; label: string; lx: number; ly: number; at: number; both?: boolean }[] = [
  { id: "refers", from: "partner", to: "client", d: "M600 134 V160 H315 V198", label: "refers", lx: 455, ly: 160, at: 0.4 },
  { id: "support", from: "manager", to: "partner", d: "M600 138 V160 H955 V194", label: "onboarding and support", lx: 785, ly: 160, at: 1.2, both: true },
  { id: "handover", from: "manager", to: "carePartner", d: "M955 337 V355 H600 V388", label: "hands over referral", lx: 790, ly: 355, at: 2.05 },
  { id: "goals", from: "client", to: "carePartner", d: "M315 322 V355 H600 V388", label: "goals, plan and budget", lx: 452, ly: 355, at: 1.95 },
  { id: "together", from: "carePartner", to: "coordinator", d: "M600 509 V563", label: "works together", lx: 600, ly: 536, at: 2.8 },
  { id: "services", from: "coordinator", to: "client", d: "M423 622 H200 V328", label: "services coordinated", lx: 200, ly: 470, at: 3.45 },
];

const toneClass = {
  peach: "bg-[#fdebd3] ring-[#f5d2a4]",
  light: "bg-white ring-[#dbe7ec]",
  teal: "bg-[#e3f4f3] ring-[#bfe3e1]",
};

export function PartnerOnboardingDiagram() {
  const box = useRef<HTMLDivElement>(null);
  const [shown, setShown] = useState(false);
  // Build once, the first time most of it is on screen.
  useEffect(() => {
    const el = box.current;
    if (!el) return;
    const io = new IntersectionObserver(
      ([e]) => {
        if (e.isIntersecting) {
          setShown(true);
          io.disconnect();
        }
      },
      { threshold: 0.35 },
    );
    io.observe(el);
    return () => io.disconnect();
  }, []);
  const delay = (s: number) => ({ "--at": `${s}s` }) as React.CSSProperties;

  return (
    <div ref={box}>
      {/* On a phone the drawing would shrink past reading, so the same six connections come as a list. */}
      <ol className={cx("onboarding-list flex flex-col gap-3 sm:hidden", shown && "is-shown")} aria-label="Who works with whom">
        {EDGES.map((e, i) => {
          const from = NODES.find((n) => n.id === e.from)!;
          const to = NODES.find((n) => n.id === e.to)!;
          return (
            <li key={e.id} className="onb-row rounded-3xl bg-[#f3f9f9] p-4 ring-1 ring-[#d6ebea]" style={delay(i * 0.25)}>
              <MiniNode node={from} />
              <p className="my-1.5 ml-5 flex items-center gap-2 border-l-2 border-[#0f4c5c] py-1.5 pl-4 text-sm font-semibold text-[#0f2f3a]">
                <Icon name={e.both ? "refresh" : "arrow-right"} className="size-4 rotate-90 text-[#007b7c]" /> {e.label}
              </p>
              <MiniNode node={to} />
            </li>
          );
        })}
      </ol>

      <svg
        viewBox="0 0 1200 700"
        role="img"
        aria-labelledby="onboarding-diagram-title"
        className={cx("onboarding-diagram hidden w-full sm:block", shown && "is-shown")}
      >
        <title id="onboarding-diagram-title">
          Who does what: the referring partner refers the client and is onboarded and supported by the Trilogy Partnership Manager, who hands the referral
          to the Care Partner. The Care Partner sets the client’s goals, plan and budget, and works with the Care Coordinator, who coordinates the
          client’s services.
        </title>
        <defs>
          <marker id="onb-arrow" viewBox="0 0 10 10" refX="8" refY="5" markerWidth="7" markerHeight="7" orient="auto-start-reverse">
            <path d="M0 0 L10 5 L0 10 z" fill="#0f4c5c" />
          </marker>
        </defs>

        {/* Lines first, so the boxes sit over their ends. */}
        {EDGES.map((e) => (
          <g key={e.id} className="onb-edge" style={delay(e.at)}>
            <path d={e.d} pathLength={1} className="onb-line" fill="none" stroke="#0f4c5c" strokeWidth="3" />
            {/* The arrowheads on their own, so they appear once the line has drawn up to them. */}
            <path d={e.d} className="onb-arrows" fill="none" stroke="none" markerEnd="url(#onb-arrow)" markerStart={e.both ? "url(#onb-arrow)" : undefined} />
            <path d={e.d} className="onb-flow" fill="none" stroke="#3cb8b9" strokeWidth="7" strokeLinecap="round" />
          </g>
        ))}

        {EDGES.map((e) => (
          <foreignObject key={`l-${e.id}`} x={e.lx - 130} y={e.ly - 20} width={260} height={40} className="onb-label" style={delay(e.at + 0.45)}>
            <div className="flex h-full items-center justify-center">
              <span className="whitespace-nowrap rounded-full bg-[#e8f3f3] px-4 py-1.5 font-sans text-[17px] font-semibold text-[#0f2f3a] shadow-sm ring-1 ring-[#cfe6e5]">
                {e.label}
              </span>
            </div>
          </foreignObject>
        ))}

        {NODES.map((n) => (
          <foreignObject key={n.id} x={n.x} y={n.y} width={n.w} height={n.h} className="onb-node" style={delay(n.at)}>
            <div className={cx("flex h-full items-center gap-4 rounded-[28px] px-5 shadow-[0_8px_24px_rgba(16,42,67,0.10)] ring-1", toneClass[n.tone])}>
              <span
                className={cx(
                  "grid size-14 shrink-0 place-items-center rounded-full",
                  n.tone === "teal" ? "bg-[#008282] text-white" : n.tone === "peach" ? "bg-[#fbd9ad] text-[#102a43]" : "bg-[#cfe8f3] text-[#102a43]",
                )}
              >
                <Icon name={n.icon} className="size-7" />
              </span>
              <span className="min-w-0 text-[#102a43]">
                <span className="block font-sans text-[22px] font-extrabold leading-tight">{n.title}</span>
                {n.sub && <span className="block text-[16px] text-[#3d5068]">{n.sub}</span>}
                {n.body && <span className="mt-0.5 block text-[14.5px] leading-snug text-[#3d5068]">{n.body}</span>}
              </span>
            </div>
          </foreignObject>
        ))}
      </svg>
    </div>
  );
}

/** One person in the phone list: their icon and name. */
function MiniNode({ node: n }: { node: Node }) {
  return (
    <span className="flex items-center gap-3">
      <span
        className={cx(
          "grid size-10 shrink-0 place-items-center rounded-full",
          n.tone === "teal" ? "bg-[#008282] text-white" : n.tone === "peach" ? "bg-[#fbd9ad] text-[#102a43]" : "bg-[#cfe8f3] text-[#102a43]",
        )}
        aria-hidden
      >
        <Icon name={n.icon} className="size-5" />
      </span>
      <span className="font-semibold leading-tight text-ink">
        {n.title} {n.sub && <span className="font-normal text-ink-muted">{n.sub}</span>}
      </span>
    </span>
  );
}

const ROLES: { title: string; body: string; icon: IconName; circle: string; bar: string }[] = [
  { title: "Client", body: "The person receiving care.", icon: "user", circle: "bg-[#d7efee] text-[#007b7c]", bar: "bg-[#2a9d8f]" },
  { title: "Care Partner", body: "Trilogy Care case manager: plan and budget.", icon: "clipboard", circle: "bg-[#d4e8f2] text-[#1d2b4f]", bar: "bg-[#1d2b4f]" },
  { title: "Care Coordinator", body: "Arranges and rosters services.", icon: "calendar", circle: "bg-[#f8ead1] text-[#8a5a00]", bar: "bg-[#e0a030]" },
  { title: "Trilogy Partnership Manager", body: "Looks after the referring partner.", icon: "people", circle: "bg-[#f6dcdc] text-[#c7393e]", bar: "bg-[#c7393e]" },
];

/** The four people a partner works with, joined in a row. */
export function PartnerRoles() {
  return (
    <ol className="grid gap-4 sm:grid-cols-2 lg:grid-cols-4">
      {ROLES.map((r, i) => (
        <li key={r.title} className="relative flex flex-col items-center rounded-3xl bg-surface px-5 pb-7 pt-6 text-center shadow-sm ring-1 ring-line">
          <span className={cx("grid size-20 place-items-center rounded-full", r.circle)} aria-hidden>
            <Icon name={r.icon} className="size-9" />
          </span>
          <h3 className="mt-4 font-serif text-xl font-semibold leading-tight">{r.title}</h3>
          <p className="mt-1 text-ink-muted">{r.body}</p>
          <span aria-hidden className={cx("absolute inset-x-0 bottom-0 h-2 rounded-b-3xl", r.bar)} />
          {/* The joins between cards, on a computer where they sit in a row. */}
          {i < ROLES.length - 1 && (
            <span aria-hidden className="absolute -right-[19px] top-[3.75rem] z-10 hidden size-[22px] place-items-center rounded-full bg-surface ring-2 ring-[#3cb8b9] lg:grid">
              <span className="size-2.5 rounded-full bg-[#3cb8b9]" />
            </span>
          )}
        </li>
      ))}
    </ol>
  );
}
