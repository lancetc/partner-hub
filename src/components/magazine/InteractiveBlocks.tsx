"use client";

import { useEffect, useId, useRef, useState } from "react";
import { api } from "@/lib/api";
import { confirmAction } from "@/lib/confirm";
import { cx, formatMoney } from "@/lib/format";
import {
  CONFIDENCE_FACES,
  confidenceFace,
  OUTCOMES,
  VERDICTS,
  type Block,
  type BranchingBlock,
  type BudgetBlock,
  type ConfidenceBlock,
  type ConversationBlock,
  type FlashcardsBlock,
  type ProcessBlock,
  type ReflectionBlock,
  type SpotBlock,
  type TabsBlock,
  type TimelineBlock,
  type Verdict,
  type WallBlock,
  type PollBlock,
  type HotspotsBlock,
  type Media,
  type SortingBlock,
  type SequencingBlock,
  type MatchingBlock,
  type FillBlankBlock,
  blanksOf,
  sameAnswer,
  shuffleFor,
} from "@/lib/magazine";
import { RichText } from "../RichText";
import type { ReaderNote } from "@/server/magazine";
import { ReflectBlock } from "./ReflectBlocks";
import { GuidePlayer } from "./LearningGuide";
import { Roleplay } from "./Roleplay";
import { SignalCase } from "./SignalCase";
import { MissionBoard } from "./MissionBoard";
import { BalanceScale } from "./BalanceScale";
import { InvoiceXRay } from "./InvoiceXRay";
import { ExpectationReset } from "./ExpectationReset";
import { LineDrawer } from "./LineDrawer";
import { BridgePractice } from "./WhileYouWait";
import { SahJourney } from "./SahJourney";
import { PeerPoll } from "./PeerPoll";
import { MythTilesBlock } from "./MythTilesBlock";
import { BatonRelay } from "./BatonRelay";
import { RedPen } from "./RedPen";
import { NotesDeck } from "./NotesDeck";
import { PlaybookBlockView } from "./PlaybookBlock";
import { DocumentAuditor } from "./DocumentAuditor";
import { BudgetSandbox } from "./BudgetSandbox";
import type { GuideIdentity } from "@/lib/magazineGuide";
import "../player/fx.css";
import { Icon, type IconName } from "../Icon";
import { CharacterPortrait } from "../characters/CharacterPortrait";

/*
  The Magazine's interactive blocks as readers use them: flashcards, tabs, a timeline, process steps, a
  branching scenario, a conversation simulator, spot the mistake, a confidence check, a reflection with
  Claude's feedback, and a budget simulator. Each works by keyboard and screen reader, never moves by
  itself, and is practice: none of them is a test.
*/

/** A person in the scene, in a circle beside the question (as on a decision question). Sits in a flow-root box. */
function CirclePhoto({ media }: { media?: Media }) {
  if (!media?.src) return null;
  return (
    // eslint-disable-next-line @next/next/no-img-element
    <img
      src={media.src}
      alt={media.decorative ? "" : media.alt}
      loading="lazy"
      className="float-right -mt-8 mb-2 ml-4 size-24 rounded-full bg-muted object-cover shadow-md ring-4 ring-surface sm:size-32"
    />
  );
}

export type ReflectionSaved = { response: string; feedback: { summary: string; strengths: string[]; consider: string[] } | null; at?: string };

export type InteractiveContext = {
  answers: Record<string, string>;
  preview?: boolean;
  /** The course's id, for its insight walls. */
  guideId: string;
  rate: (blockId: string, rating: number) => Promise<void>;
  activity: (blockId: string, detail: { outcome?: string; score?: number; total?: number }) => void;
  /** The reader has worked through this block, for pages that ask for every activity. */
  engaged: (blockId: string) => void;
  reflections: Record<string, ReflectionSaved>;
  reflect: (blockId: string, response: string) => Promise<ReflectionSaved>;
  /** Reflect and apply: the learner's own entries by block, and saving one (a draft, a note, a pulse answer). */
  notes: Record<string, ReaderNote>;
  saveNote: (blockId: string, patch: { body?: string; choice?: string; status?: string; state?: "draft" | "saved" | "skipped" }) => Promise<ReaderNote>;
  /** Another block in the course, for a block that looks back at one. */
  find: (blockId: string) => Block | undefined;
  /** The learner opened a perspectives panel. */
  opened: (blockId: string) => void;
  /** The Hub's AI Learning Guide (its name, introduction and portrait), and what a learner did with a recording. */
  guide: GuideIdentity;
  guideEvent: (blockId: string, outcome: "started" | "paused" | "completed" | "transcript" | "read_first" | "source") => void;
};

const column = "mx-auto w-full max-w-[42rem]";
const kicker = "mb-2 flex items-center gap-2 font-mulish text-sm font-extrabold uppercase tracking-[0.12em] text-accent";
const VERDICT_LOOK: Record<Verdict, { icon: IconName; box: string }> = {
  best: { icon: "circle-check", box: "border-[#2f8f5b] bg-[#e9f6ef] dark:bg-[#17301f]" },
  acceptable: { icon: "info", box: "border-[#fab53d] bg-[#fff6e4] dark:bg-[#3a2f17]" },
  risky: { icon: "alert", box: "border-[#c7393e] bg-[#fdf1f0] dark:bg-[#3a1f1f]" },
};

export function InteractiveBlock({ block: b, ctx }: { block: Block; ctx: InteractiveContext }) {
  switch (b.type) {
    case "flashcards":
      return <Flashcards block={b} ctx={ctx} />;
    case "tabs":
      return <Tabs block={b} ctx={ctx} />;
    case "timeline":
      return <Timeline block={b} />;
    case "process":
      return <Process block={b} ctx={ctx} />;
    case "branching":
      return <Branching block={b} ctx={ctx} />;
    case "conversation":
      return <ConversationPractice block={b} ctx={ctx} />;
    case "spot":
      return <Spot block={b} ctx={ctx} />;
    case "confidence":
      return <Confidence block={b} ctx={ctx} />;
    case "reflection":
      return <Reflection block={b} ctx={ctx} />;
    case "budget":
      return <Budget block={b} ctx={ctx} />;
    case "signal":
      return <SignalCase block={b} ctx={ctx} />;
    case "mission":
      return <MissionBoard block={b} ctx={ctx} />;
    case "balance":
      return <BalanceScale block={b} ctx={ctx} />;
    case "xray":
      return <InvoiceXRay block={b} ctx={ctx} />;
    case "reset":
      return <ExpectationReset block={b} ctx={ctx} />;
    case "line":
      return <LineDrawer block={b} ctx={ctx} />;
    case "bridge":
      return <BridgePractice block={b} ctx={ctx} />;
    case "journey":
      return <SahJourney block={b} ctx={ctx} />;
    case "benchmark":
      return <PeerPoll block={b} ctx={ctx} />;
    case "myths":
      return <MythTilesBlock block={b} ctx={ctx} />;
    case "baton":
      return <BatonRelay block={b} ctx={ctx} />;
    case "redpen":
      return <RedPen block={b} ctx={ctx} />;
    case "mentor":
      return <NotesDeck block={b} ctx={ctx} />;
    case "playbook":
      return <PlaybookBlockView block={b} ctx={ctx} />;
    case "auditor":
      return <DocumentAuditor block={b} ctx={ctx} />;
    case "phonecall":
      return <Roleplay block={b} ctx={ctx} />;
    case "sandbox":
      return <BudgetSandbox block={b} ctx={ctx} />;
    case "wall":
      return <Wall block={b} ctx={ctx} />;
    case "poll":
      return <Poll block={b} ctx={ctx} />;
    case "hotspots":
      return <Hotspots block={b} ctx={ctx} />;
    case "sorting":
      return <Sorting block={b} ctx={ctx} />;
    case "sequencing":
      return <Sequencing block={b} ctx={ctx} />;
    case "matching":
      return <Matching block={b} ctx={ctx} />;
    case "fillblank":
      return <FillBlank block={b} ctx={ctx} />;
    case "journal":
    case "perspectives":
    case "pulse":
    case "action":
      return <ReflectBlock block={b} ctx={ctx} />;
    case "guide":
      return <GuidePlayer block={b} ctx={ctx} />;
    default:
      return null;
  }
}

// ---------------------------------------------------------------------------------------------------
// Flashcards: flip to reveal
// ---------------------------------------------------------------------------------------------------

function Flashcards({ block: b, ctx }: { block: FlashcardsBlock; ctx: InteractiveContext }) {
  const [flipped, setFlipped] = useState<Set<string>>(new Set());
  const all = flipped.size === b.cards.length;
  // Every card turned over at least once counts as done.
  const seen = useRef(new Set<string>());
  const saw = (ids: string[]) => {
    ids.forEach((id) => seen.current.add(id));
    if (b.cards.every((c) => seen.current.has(c.id))) ctx.engaged(b.id);
  };
  const toggle = (id: string) =>
    saw([id]) ??
    setFlipped((f) => {
      const next = new Set(f);
      if (next.has(id)) next.delete(id);
      else next.add(id);
      return next;
    });
  return (
    <div className="w-full">
      <div className="mb-3 flex flex-wrap items-center justify-between gap-2">
        <p className={cx(kicker, "mb-0")}>
          <Icon name="flashcards" className="size-5" /> Flashcards · {b.cards.length}
        </p>
        <button
          type="button"
          onClick={() => {
            if (!all) saw(b.cards.map((c) => c.id));
            setFlipped(all ? new Set() : new Set(b.cards.map((c) => c.id)));
          }}
          className="inline-flex min-h-10 items-center gap-1.5 rounded-full border border-line-strong px-4 text-sm font-semibold hover:bg-muted"
        >
          <Icon name="refresh" className="size-4" /> {all ? "Turn them all back" : "Turn them all over"}
        </button>
      </div>
      <ul className="grid gap-4 sm:grid-cols-2 lg:grid-cols-3">
        {b.cards.map((c, i) => {
          const on = flipped.has(c.id);
          return (
            <li key={c.id} className="mag-reveal-item [perspective:1200px]">
              <button
                type="button"
                onClick={() => toggle(c.id)}
                aria-pressed={on}
                aria-label={on ? `Card ${i + 1}, answer showing. Show the front.` : `Card ${i + 1}: ${c.front}. Show the answer.`}
                className={cx(
                  "relative grid min-h-52 w-full text-left transition-transform duration-500 [transform-style:preserve-3d] motion-reduce:transition-none",
                  on && "[transform:rotateY(180deg)]",
                )}
              >
                <span
                  className="col-start-1 row-start-1 flex flex-col gap-3 rounded-2xl border border-line-strong bg-surface p-5 shadow-sm [backface-visibility:hidden]"
                  aria-hidden={on}
                >
                  {c.media?.src && (
                    // eslint-disable-next-line @next/next/no-img-element
                    <img
                      src={c.media.src}
                      alt={c.media.decorative ? "" : c.media.alt}
                      className="-mx-5 -mt-5 mb-1 aspect-[16/9] w-[calc(100%+2.5rem)] max-w-none rounded-t-[calc(1rem-1px)] bg-muted object-cover"
                    />
                  )}
                  <span className="font-serif text-xl font-semibold leading-snug">{c.front}</span>
                  <span className="mt-auto inline-flex items-center gap-1 text-sm font-semibold text-accent">
                    <Icon name="refresh" className="size-4" /> Flip
                  </span>
                </span>
                <span
                  className="col-start-1 row-start-1 flex flex-col gap-2 rounded-2xl border-2 border-action bg-tealtint p-5 [backface-visibility:hidden] [transform:rotateY(180deg)]"
                  aria-hidden={!on}
                >
                  <span className="font-mulish text-xs font-extrabold uppercase tracking-[0.12em] text-accent">{c.front}</span>
                  <RichText text={c.back} className="leading-relaxed" />
                </span>
              </button>
            </li>
          );
        })}
      </ul>
    </div>
  );
}

// ---------------------------------------------------------------------------------------------------
// Tabs: one section at a time
// ---------------------------------------------------------------------------------------------------

function Tabs({ block: b, ctx }: { block: TabsBlock; ctx: InteractiveContext }) {
  const [at, setAt] = useState(0);
  const base = useId();
  const refs = useRef<(HTMLButtonElement | null)[]>([]);
  // Every tab opened counts as done; the first is open to start with.
  const opened = useRef(new Set<number>([0]));
  const open = (n: number) => {
    opened.current.add(n);
    if (opened.current.size >= b.tabs.length) ctx.engaged(b.id);
    setAt(n);
  };
  const go = (i: number) => {
    const n = (i + b.tabs.length) % b.tabs.length;
    open(n);
    refs.current[n]?.focus();
  };
  const tab = b.tabs[Math.min(at, b.tabs.length - 1)];
  if (!tab) return null;
  return (
    <div className={column}>
      <div role="tablist" aria-label="Sections" className="flex gap-1 overflow-x-auto overflow-y-hidden border-b border-line">
        {b.tabs.map((t, i) => (
          <button
            key={t.id}
            ref={(el) => {
              refs.current[i] = el;
            }}
            type="button"
            role="tab"
            id={`${base}-tab-${i}`}
            aria-selected={i === at}
            aria-controls={`${base}-panel`}
            tabIndex={i === at ? 0 : -1}
            onClick={() => open(i)}
            onKeyDown={(e) => {
              if (e.key === "ArrowRight") go(i + 1);
              if (e.key === "ArrowLeft") go(i - 1);
              if (e.key === "Home") go(0);
              if (e.key === "End") go(b.tabs.length - 1);
            }}
            className={cx(
              "-mb-px min-h-11 shrink-0 rounded-t-xl border-b-[3px] px-4 font-semibold",
              i === at ? "border-action bg-tealtint" : "border-transparent text-ink-muted hover:bg-muted hover:text-ink",
            )}
          >
            {t.label}
          </button>
        ))}
      </div>
      <div
        role="tabpanel"
        id={`${base}-panel`}
        aria-labelledby={`${base}-tab-${at}`}
        tabIndex={0}
        className="rounded-b-2xl border border-t-0 border-line bg-surface p-5 outline-none"
      >
        <RichText text={tab.body} className="text-[1.05rem] leading-relaxed" />
      </div>
    </div>
  );
}

// ---------------------------------------------------------------------------------------------------
// Timeline: events in order
// ---------------------------------------------------------------------------------------------------

function Timeline({ block: b }: { block: TimelineBlock }) {
  return (
    <ol className={cx(column, "relative flex flex-col gap-6 border-l-2 border-action/40 pl-6")}>
      {b.events.map((e) => (
        <li key={e.id} className="mag-reveal-item relative">
          <span className="absolute -left-[2.05rem] top-1 grid size-5 place-items-center rounded-full border-2 border-action bg-surface" aria-hidden>
            <span className="size-2 rounded-full bg-action" />
          </span>
          <p className="font-mulish text-xs font-extrabold uppercase tracking-[0.12em] text-accent">{e.when}</p>
          <p className="mt-0.5 font-serif text-xl font-semibold leading-snug">{e.title}</p>
          {e.body && <RichText text={e.body} className="mt-1 leading-relaxed" />}
        </li>
      ))}
    </ol>
  );
}

// ---------------------------------------------------------------------------------------------------
// Process steps: one at a time, or all
// ---------------------------------------------------------------------------------------------------

function Process({ block: b, ctx }: { block: ProcessBlock; ctx: InteractiveContext }) {
  const [at, setAt] = useState(0);
  const [all, setAll] = useState(false);
  const [done, setDone] = useState(false);
  const heading = useRef<HTMLParagraphElement>(null);
  const step = b.steps[Math.min(at, b.steps.length - 1)];
  if (!step) return null;
  const go = (n: number) => {
    setAt(n);
    if (n >= b.steps.length - 1) ctx.engaged(b.id);
    requestAnimationFrame(() => heading.current?.focus());
  };
  return (
    <div className={cx(column, "rounded-3xl border border-line-strong bg-surface p-5 sm:p-7")}>
      <div className="flex flex-wrap items-center justify-between gap-2">
        <p className={cx(kicker, "mb-0")}>
          <Icon name="steps" className="size-5" /> Process · {b.steps.length} steps
        </p>
        <button
          type="button"
          onClick={() => {
            setAll((a) => !a);
            ctx.engaged(b.id);
          }}
          className="text-sm font-semibold text-accent hover:underline"
        >
          {all ? "One step at a time" : "Show all steps"}
        </button>
      </div>
      {all ? (
        <ol className="mt-4 flex flex-col gap-4">
          {b.steps.map((st, i) => (
            <li key={st.id} className="mag-reveal-item flex gap-3">
              <span className="grid size-8 shrink-0 place-items-center rounded-full bg-action font-mulish text-sm font-extrabold text-on-action">{i + 1}</span>
              <span className="min-w-0">
                <span className="block font-semibold">{st.title}</span>
                {st.body && <RichText text={st.body} className="mt-1 text-ink-muted" />}
              </span>
            </li>
          ))}
        </ol>
      ) : (
        <>
          <div className="mt-4 flex gap-1" aria-hidden>
            {b.steps.map((st, i) => (
              <span key={st.id} className={cx("h-1.5 flex-1 rounded-full", i <= at ? "bg-action" : "bg-muted")} />
            ))}
          </div>
          <div className="mt-5 min-h-32" aria-live="polite">
            <p ref={heading} tabIndex={-1} className="text-sm font-semibold text-ink-muted outline-none">
              Step {at + 1} of {b.steps.length}
            </p>
            <p className="mt-1 font-serif text-2xl font-semibold">{step.title}</p>
            {step.body && <RichText text={step.body} className="mt-2 leading-relaxed" />}
          </div>
          <div className="mt-5 flex flex-wrap justify-between gap-2">
            <button
              type="button"
              onClick={() => go(at - 1)}
              disabled={at === 0}
              className="inline-flex min-h-11 items-center gap-1.5 rounded-full border border-line-strong px-4 font-semibold hover:bg-muted disabled:opacity-40"
            >
              <Icon name="arrow-left" className="size-4" /> Previous
            </button>
            {at < b.steps.length - 1 ? (
              <button
                type="button"
                onClick={() => go(at + 1)}
                className="inline-flex min-h-11 items-center gap-1.5 rounded-full bg-action px-5 font-semibold text-on-action hover:bg-action-hover"
              >
                Next step <Icon name="arrow-right" className="size-4" />
              </button>
            ) : done ? (
              <span className="inline-flex items-center gap-1.5 font-semibold text-[#0f5b3a] dark:text-[#8fe0b5]">
                <Icon name="circle-check" className="size-5" /> You’ve been through every step
              </span>
            ) : (
              <button
                type="button"
                onClick={() => {
                  setDone(true);
                  ctx.activity(b.id, { outcome: "finished", total: b.steps.length });
                }}
                className="inline-flex min-h-11 items-center gap-1.5 rounded-full bg-action px-5 font-semibold text-on-action hover:bg-action-hover"
              >
                <Icon name="check" className="size-4" /> Done
              </button>
            )}
          </div>
        </>
      )}
    </div>
  );
}

// ---------------------------------------------------------------------------------------------------
// Branching scenario: choices that change the story
// ---------------------------------------------------------------------------------------------------

const OUTCOME_LOOK = {
  good: "border-[#2f8f5b] bg-[#e9f6ef] dark:bg-[#17301f]",
  mixed: "border-[#fab53d] bg-[#fff6e4] dark:bg-[#3a2f17]",
  poor: "border-[#c7393e] bg-[#fdf1f0] dark:bg-[#3a1f1f]",
} as const;

function Branching({ block: b, ctx }: { block: BranchingBlock; ctx: InteractiveContext }) {
  const start = b.scenes[0]?.id;
  // The path so far: each scene visited and the choice made there.
  const [path, setPath] = useState<{ scene: string; choice?: string }[]>(start ? [{ scene: start }] : []);
  const current = useRef<HTMLDivElement>(null);
  if (!start) return null;
  const scene = (id: string) => b.scenes.find((sc) => sc.id === id);
  const here = scene(path[path.length - 1].scene);
  const choose = (choiceId: string, next: string) => {
    const after = [...path.slice(0, -1), { ...path[path.length - 1], choice: choiceId }, { scene: next }];
    setPath(after);
    const end = scene(next)?.ending;
    if (end) {
      ctx.activity(b.id, { outcome: end.outcome, score: after.length - 1 });
      ctx.engaged(b.id);
    }
    requestAnimationFrame(() => current.current?.focus());
  };
  return (
    <div className={cx(column, "rounded-3xl border border-line-strong bg-surface p-5 sm:p-7")}>
      <p className={kicker}>
        <Icon name="branch" className="size-5" /> Branching scenario
      </p>
      {b.title && <p className="font-serif text-2xl font-semibold">{b.title}</p>}
      <ol className="mt-4 flex flex-col gap-4">
        {path.slice(0, -1).map((step, i) => {
          const sc = scene(step.scene);
          const choice = sc?.choices.find((c) => c.id === step.choice);
          return (
            <li key={i} className="flex flex-col gap-2 text-ink-muted">
              <RichText text={sc?.text ?? ""} className="leading-relaxed" />
              {choice && (
                <p className="self-end rounded-2xl rounded-br-sm bg-tealtint px-4 py-2 text-ink">
                  <span className="sr-only">You chose: </span>
                  {choice.text}
                </p>
              )}
            </li>
          );
        })}
      </ol>
      {here && (
        <div ref={current} tabIndex={-1} className="mt-4 flex flex-col gap-3 outline-none" aria-live="polite">
          <RichText text={here.text} className="text-[1.08rem] leading-relaxed" />
          {here.ending ? (
            <div className={cx("rounded-2xl border-l-4 p-5", OUTCOME_LOOK[here.ending.outcome])}>
              <p className="font-bold">{OUTCOMES[here.ending.outcome]}</p>
              <RichText text={here.ending.summary} className="mt-1 leading-relaxed" />
            </div>
          ) : (
            <div className="flex flex-col gap-2" role="group" aria-label="What do you do?">
              <p className="font-semibold">What do you do?</p>
              {here.choices.map((c) => (
                <button
                  key={c.id}
                  type="button"
                  onClick={() => choose(c.id, c.next)}
                  className="rounded-2xl border border-line-strong p-4 text-left hover:border-action hover:bg-tealtint"
                >
                  {c.text}
                </button>
              ))}
            </div>
          )}
        </div>
      )}
      {path.length > 1 && (
        <button
          type="button"
          onClick={() => setPath([{ scene: start }])}
          className="mt-5 inline-flex min-h-10 items-center gap-1.5 self-start text-sm font-semibold text-accent hover:underline"
        >
          <Icon name="refresh" className="size-4" /> {here?.ending ? "Try another path" : "Start again"}
        </button>
      )}
    </div>
  );
}

// ---------------------------------------------------------------------------------------------------
// Conversation simulator: choose what to say, see how it lands
// ---------------------------------------------------------------------------------------------------

function Conversation({ block: b, ctx }: { block: ConversationBlock; ctx: InteractiveContext }) {
  const [turn, setTurn] = useState(0);
  // What they settled on at each turn, and whether their first choice there was the best one.
  const [said, setSaid] = useState<string[]>([]);
  const [picked, setPicked] = useState<string | null>(null);
  const [firstBest, setFirstBest] = useState<boolean[]>([]);
  const coaching = useRef<HTMLDivElement>(null);
  const done = turn >= b.turns.length;
  const t = b.turns[turn];
  const response = t?.responses.find((r) => r.id === picked);
  const pick = (id: string) => {
    if (picked === null && firstBest.length === turn) setFirstBest((f) => [...f, t.responses.find((r) => r.id === id)?.verdict === "best"]);
    setPicked(id);
    requestAnimationFrame(() => coaching.current?.focus());
  };
  const next = () => {
    setSaid((s) => [...s, picked!]);
    setPicked(null);
    const n = turn + 1;
    setTurn(n);
    if (n >= b.turns.length) {
      ctx.activity(b.id, { outcome: "finished", score: firstBest.filter(Boolean).length, total: b.turns.length });
      ctx.engaged(b.id);
    }
  };
  const restart = () => {
    setTurn(0);
    setSaid([]);
    setPicked(null);
    setFirstBest([]);
  };
  const them = (text: string, key: string) => (
    <p key={key} className="max-w-[85%] self-start rounded-2xl rounded-bl-sm bg-muted px-4 py-2.5">
      <span className="block text-xs font-bold text-ink-muted">{b.person}</span>
      {text}
    </p>
  );
  const you = (text: string, key: string) => (
    <p key={key} className="max-w-[85%] self-end rounded-2xl rounded-br-sm bg-action px-4 py-2.5 text-on-action">
      <span className="block text-xs font-bold opacity-80">You</span>
      {text}
    </p>
  );
  return (
    <div className={cx(column, "rounded-3xl border border-line-strong bg-surface p-5 sm:p-7")}>
      <p className={kicker}>
        <Icon name="chat" className="size-5" /> Conversation practice
      </p>
      <div className="flow-root">
        <CirclePhoto media={b.media} />
        {!b.media?.src && <CharacterPortrait name={b.person} size="lg" className="float-right mb-2 ml-4" />}
        <p className="font-serif text-2xl font-semibold">
          {b.person}
          {b.role && <span className="font-sans text-base font-normal text-ink-muted"> · {b.role}</span>}
        </p>
        {b.setting && <p className="mt-1 text-ink-muted">{b.setting}</p>}
      </div>
      <div className="mt-5 flex flex-col gap-3">
        {b.turns.slice(0, turn).map((tt, i) => {
          const r = tt.responses.find((x) => x.id === said[i]);
          return [them(tt.line, `l${i}`), r && you(r.text, `y${i}`), r?.reply && them(r.reply, `r${i}`)];
        })}
        {!done && t && (
          <>
            {them(t.line, "now")}
            <div className="mt-2 flex flex-col gap-2" role="group" aria-label="What do you say?">
              <p className="text-sm font-semibold">What do you say?</p>
              {t.responses.map((r) => (
                <button
                  key={r.id}
                  type="button"
                  onClick={() => pick(r.id)}
                  aria-pressed={picked === r.id}
                  className={cx("rounded-2xl border p-3 text-left", picked === r.id ? "border-action bg-tealtint" : "border-line-strong hover:bg-muted")}
                >
                  “{r.text}”
                </button>
              ))}
            </div>
            {response && (
              <div ref={coaching} tabIndex={-1} className="flex flex-col gap-3 outline-none" aria-live="polite">
                {response.reply && them(response.reply, "reply")}
                <div className={cx("rounded-2xl border-l-4 p-4", VERDICT_LOOK[response.verdict].box)}>
                  <p className="flex items-center gap-2 font-bold">
                    <Icon name={VERDICT_LOOK[response.verdict].icon} className="size-5" /> {VERDICTS[response.verdict]}
                  </p>
                  <p className="mt-1 leading-relaxed">{response.feedback}</p>
                </div>
                <div className="flex flex-wrap gap-2">
                  <button
                    type="button"
                    onClick={next}
                    className="inline-flex min-h-11 items-center gap-1.5 rounded-full bg-action px-5 font-semibold text-on-action hover:bg-action-hover"
                  >
                    {turn < b.turns.length - 1 ? "Carry on" : "Finish"} <Icon name="arrow-right" className="size-4" />
                  </button>
                  {response.verdict !== "best" && (
                    <button
                      type="button"
                      onClick={() => setPicked(null)}
                      className="inline-flex min-h-11 items-center rounded-full border border-line-strong px-4 font-semibold hover:bg-muted"
                    >
                      Try another response
                    </button>
                  )}
                </div>
              </div>
            )}
          </>
        )}
        {done && (
          <div className="rounded-2xl bg-tealtint p-4">
            <p className="font-semibold">Conversation finished</p>
            <p className="mt-1 text-sm">
              Your first choice was the best one in {firstBest.filter(Boolean).length} of {b.turns.length} {b.turns.length === 1 ? "turn" : "turns"}.
            </p>
            <button
              type="button"
              onClick={restart}
              className="mt-3 inline-flex min-h-10 items-center gap-1.5 text-sm font-semibold text-accent hover:underline"
            >
              <Icon name="refresh" className="size-4" /> Practise it again
            </button>
          </div>
        )}
      </div>
    </div>
  );
}

// ---------------------------------------------------------------------------------------------------
// Spot the mistake: click the errors on a picture or document
// ---------------------------------------------------------------------------------------------------

/** How near a click has to be to a mistake, in percent of the picture. */
const NEAR = 8;

function Spot({ block: b, ctx }: { block: SpotBlock; ctx: InteractiveContext }) {
  const [found, setFound] = useState<string[]>([]);
  const [shown, setShown] = useState(false);
  const [miss, setMiss] = useState<{ x: number; y: number } | null>(null);
  if (!b.media.src) return null;
  const left = b.mistakes.filter((m) => !found.includes(m.id));
  const click = (e: React.MouseEvent<HTMLButtonElement>) => {
    const r = e.currentTarget.getBoundingClientRect();
    const x = ((e.clientX - r.left) / r.width) * 100;
    const y = ((e.clientY - r.top) / r.height) * 100;
    const hit = left.map((m) => ({ m, d: Math.hypot(m.x - x, m.y - y) })).sort((a, z) => a.d - z.d)[0];
    if (hit && hit.d <= NEAR) {
      const next = [...found, hit.m.id];
      setFound(next);
      setMiss(null);
      if (next.length === b.mistakes.length) {
        ctx.activity(b.id, { outcome: "all found", score: next.length, total: b.mistakes.length });
        ctx.engaged(b.id);
      }
    } else {
      setMiss({ x, y });
      setTimeout(() => setMiss(null), 900);
    }
  };
  const visible = b.mistakes.filter((m) => shown || found.includes(m.id));
  return (
    <div className="w-full">
      <div className={column}>
        <p className={kicker}>
          <Icon name="search" className="size-5" /> Spot the mistake
        </p>
        <p className="font-serif text-xl font-semibold">{b.prompt}</p>
        <p className="mt-1 text-sm text-ink-muted">Click or tap where you see a mistake.</p>
      </div>
      <div className="relative mt-4">
        <button
          type="button"
          onClick={click}
          className="block w-full cursor-crosshair overflow-hidden rounded-2xl"
          aria-label={`${b.media.alt}. Click where you see a mistake. ${found.length} of ${b.mistakes.length} found.`}
        >
          {/* eslint-disable-next-line @next/next/no-img-element */}
          <img src={b.media.src} alt="" className="w-full bg-muted" />
        </button>
        {visible.map((m) => (
          <span
            key={m.id}
            className={cx(
              "pointer-events-none absolute grid size-8 -translate-x-1/2 -translate-y-1/2 place-items-center rounded-full border-2 border-white font-mulish text-sm font-extrabold text-white shadow-lg",
              found.includes(m.id) ? "bg-[#2f8f5b]" : "bg-[#c7393e]",
            )}
            style={{ left: `${m.x}%`, top: `${m.y}%` }}
            aria-hidden
          >
            {b.mistakes.indexOf(m) + 1}
          </span>
        ))}
        {miss && (
          <span
            className="pointer-events-none absolute -translate-x-1/2 -translate-y-full rounded-full bg-ink px-3 py-1 text-xs font-semibold text-surface"
            style={{ left: `${miss.x}%`, top: `${miss.y}%` }}
            aria-hidden
          >
            Not quite
          </span>
        )}
      </div>
      <div className={cx(column, "mt-4")}>
        <div className="flex flex-wrap items-center justify-between gap-2">
          <p className="font-semibold" role="status">
            Found {found.length} of {b.mistakes.length}
          </p>
          <span className="flex gap-3">
            {!shown && found.length < b.mistakes.length && (
              <button
                type="button"
                onClick={() => {
                  setShown(true);
                  ctx.engaged(b.id);
                }}
                className="text-sm font-semibold text-accent hover:underline"
              >
                Show the answers
              </button>
            )}
            {(found.length > 0 || shown) && (
              <button
                type="button"
                onClick={() => {
                  setFound([]);
                  setShown(false);
                }}
                className="text-sm font-semibold text-accent hover:underline"
              >
                Start again
              </button>
            )}
          </span>
        </div>
        {visible.length > 0 && (
          <ol className="mt-3 flex flex-col gap-2">
            {[...visible]
              .sort((a, z) => b.mistakes.indexOf(a) - b.mistakes.indexOf(z))
              .map((m) => (
                <li
                  key={m.id}
                  className={cx(
                    "rounded-2xl border-l-4 p-3",
                    found.includes(m.id) ? "border-[#2f8f5b] bg-[#e9f6ef] dark:bg-[#17301f]" : "border-[#c7393e] bg-[#fdf1f0] dark:bg-[#3a1f1f]",
                  )}
                >
                  <p className="font-semibold">
                    {b.mistakes.indexOf(m) + 1}. {m.label} {!found.includes(m.id) && <span className="text-sm font-normal text-ink-muted">(not found)</span>}
                  </p>
                  <p className="mt-0.5 text-sm">{m.explanation}</p>
                </li>
              ))}
          </ol>
        )}
      </div>
    </div>
  );
}

// ---------------------------------------------------------------------------------------------------
// Confidence check: rate 1 to 5, and see the change from an earlier one
// ---------------------------------------------------------------------------------------------------

function Confidence({ block: b, ctx }: { block: ConfidenceBlock; ctx: InteractiveContext }) {
  const saved = Number(ctx.answers[b.id]) || null;
  const [rating, setRating] = useState<number | null>(saved);
  const [problem, setProblem] = useState<string | null>(null);
  const earlier = b.compareWith ? Number(ctx.answers[b.compareWith]) || null : null;
  const name = useId();
  const choose = async (n: number) => {
    setRating(n);
    setProblem(null);
    try {
      await ctx.rate(b.id, n);
    } catch (e) {
      setProblem(e instanceof Error ? e.message : "That didn’t save.");
    }
  };
  const change = rating && earlier ? rating - earlier : null;
  return (
    <fieldset className={cx(column, "rounded-3xl border border-action/30 bg-tealtint p-5 sm:p-7")}>
      <legend className="sr-only">{b.statement}</legend>
      <p className={kicker}>
        <Icon name="gauge" className="size-5" /> Confidence check
      </p>
      <p className="font-serif text-xl font-semibold" aria-hidden>
        {b.statement}
      </p>
      {/* Five faces, worried to beaming; each is "n out of 5" to a screen reader. */}
      <div className="mt-4 grid grid-cols-5 gap-2">
        {CONFIDENCE_FACES.map((face, i) => {
          const n = i + 1;
          return (
            <label
              key={n}
              className={cx(
                "fx-press flex min-h-16 cursor-pointer items-center justify-center rounded-2xl border-2 bg-surface text-3xl leading-none transition-[filter,opacity] has-[:focus-visible]:outline has-[:focus-visible]:outline-2 has-[:focus-visible]:outline-focus sm:text-4xl",
                rating === n ? "fx-pop border-action ring-4 ring-action/25" : "border-line-strong hover:border-action",
                // Once one is chosen, the others step back a little.
                rating !== null && rating !== n && "opacity-60 grayscale-[40%] hover:opacity-100 hover:grayscale-0",
              )}
            >
              <input type="radio" name={name} value={n} checked={rating === n} onChange={() => void choose(n)} className="sr-only" />
              <span aria-hidden>{face}</span>
              <span className="sr-only">
                {n} out of 5{n === 1 ? `, ${b.low}` : n === 5 ? `, ${b.high}` : ""}
              </span>
            </label>
          );
        })}
      </div>
      <div className="mt-2 flex justify-between text-sm text-ink-muted" aria-hidden>
        <span>
          {CONFIDENCE_FACES[0]} {b.low}
        </span>
        <span>
          {b.high} {CONFIDENCE_FACES[4]}
        </span>
      </div>
      {rating && (
        <p className="mt-4 rounded-2xl bg-surface p-3 text-sm" role="status">
          {earlier ? (
            <>
              Earlier you chose <span aria-label={`${earlier} out of 5`}>{confidenceFace(earlier)}</span>; now{" "}
              <span aria-label={`${rating} out of 5`}>{confidenceFace(rating)}</span>.{" "}
              {change! > 0
                ? `That’s up ${change}: nice work.`
                : change === 0
                  ? "About the same: worth another look at anything still unclear."
                  : "Lower than before: that’s useful to know. Look back at what’s unclear."}
            </>
          ) : (
            <>
              Thanks: you chose <span aria-label={`${rating} out of 5`}>{confidenceFace(rating)}</span>.{" "}
              {b.compareWith ? "" : "You can see how it changes later on."}
            </>
          )}
        </p>
      )}
      {problem && <p className="mt-2 text-sm font-semibold text-danger">{problem}</p>}
    </fieldset>
  );
}

// ---------------------------------------------------------------------------------------------------
// Reflection: an answer in their own words, and Claude's feedback
// ---------------------------------------------------------------------------------------------------

function Reflection({ block: b, ctx }: { block: ReflectionBlock; ctx: InteractiveContext }) {
  const saved = ctx.reflections?.[b.id];
  const [text, setText] = useState(saved?.response ?? "");
  const [result, setResult] = useState<ReflectionSaved | null>(saved ?? null);
  const [busy, setBusy] = useState(false);
  const [problem, setProblem] = useState<string | null>(null);
  const id = useId();
  const count = text.split(/\s+/).filter(Boolean).length;
  const ask = async () => {
    setBusy(true);
    setProblem(null);
    try {
      setResult(await ctx.reflect(b.id, text));
      ctx.engaged(b.id);
    } catch (e) {
      setProblem(e instanceof Error ? e.message : "Feedback didn’t come through. Try again.");
    } finally {
      setBusy(false);
    }
  };
  const feedback = result?.feedback;
  const changed = result && result.response !== text.trim();
  return (
    <div className={cx(column, "rounded-3xl border border-line-strong bg-surface p-5 sm:p-7")}>
      <p className={kicker}>
        <Icon name="pen" className="size-5" /> Reflection
      </p>
      <div className="flow-root">
        <CirclePhoto media={b.media} />
        <label htmlFor={id} className="font-serif text-xl font-semibold">
          {b.prompt}
        </label>
      </div>
      <textarea
        id={id}
        className="mt-3 min-h-40 w-full rounded-2xl border border-line-strong bg-surface p-3 text-[1.02rem] leading-relaxed"
        value={text}
        onChange={(e) => setText(e.target.value)}
        maxLength={4000}
        placeholder="Write your answer in your own words."
      />
      <div className="mt-2 flex flex-wrap items-center justify-between gap-3">
        <span className="text-sm text-ink-muted">
          {count} {count === 1 ? "word" : "words"}
          {b.minWords ? ` · at least ${b.minWords}` : ""}
        </span>
        <button
          type="button"
          onClick={() => void ask()}
          disabled={busy || ctx.preview || count < Math.max(1, b.minWords)}
          className="inline-flex min-h-11 items-center gap-1.5 rounded-full bg-action px-5 font-semibold text-on-action hover:bg-action-hover disabled:opacity-50"
        >
          <Icon name="spark" className="size-4" /> {busy ? "Claude is reading…" : feedback && !changed ? "Ask again" : "Get feedback"}
        </button>
      </div>
      {ctx.preview && <p className="mt-2 text-sm text-ink-muted">Feedback works once the guide is published.</p>}
      {problem && <p className="mt-2 text-sm font-semibold text-danger">{problem}</p>}
      {feedback && (
        <div className="mt-5 rounded-2xl border-l-4 border-action bg-tealtint p-5" aria-live="polite">
          <p className="flex items-center gap-2 text-sm font-bold">
            <Icon name="spark" className="size-4" /> Feedback from Claude{" "}
            {changed && <span className="font-normal text-ink-muted">(on your earlier answer)</span>}
          </p>
          <p className="mt-2 leading-relaxed">{feedback.summary}</p>
          {feedback.strengths.length > 0 && (
            <>
              <p className="mt-3 font-semibold">What you did well</p>
              <ul className="mt-1 list-disc pl-5">
                {feedback.strengths.map((x, i) => (
                  <li key={i}>{x}</li>
                ))}
              </ul>
            </>
          )}
          {feedback.consider.length > 0 && (
            <>
              <p className="mt-3 font-semibold">To think about</p>
              <ul className="mt-1 list-disc pl-5">
                {feedback.consider.map((x, i) => (
                  <li key={i}>{x}</li>
                ))}
              </ul>
            </>
          )}
          <p className="mt-3 text-xs text-ink-muted">AI coaching to help you think it through. It’s not a mark, and your answer is kept for you only.</p>
        </div>
      )}
    </div>
  );
}

// ---------------------------------------------------------------------------------------------------
// Budget simulator: a fictional quarterly budget to plan services against
// ---------------------------------------------------------------------------------------------------

function Budget({ block: b, ctx }: { block: BudgetBlock; ctx: InteractiveContext }) {
  const fresh = () => Object.fromEntries(b.services.map((s) => [s.id, { on: true, perWeek: s.perWeek, cost: s.cost }]));
  const [plan, setPlan] = useState<Record<string, { on: boolean; perWeek: number; cost: number }>>(fresh);
  const set = (id: string, patch: Partial<{ on: boolean; perWeek: number; cost: number }>) => {
    ctx.engaged(b.id);
    setPlan((p) => ({ ...p, [id]: { ...p[id], ...patch } }));
  };
  const quarter = (id: string) => {
    const p = plan[id];
    return p?.on ? p.cost * p.perWeek * b.weeks : 0;
  };
  const spent = b.services.reduce((n, s) => n + quarter(s.id), 0);
  const left = b.budget - spent;
  const used = b.budget ? Math.min(100, (spent / b.budget) * 100) : 0;
  return (
    <div className={cx(column, "rounded-3xl border border-line-strong bg-surface p-5 sm:p-7")}>
      <p className={kicker}>
        <Icon name="money" className="size-5" /> Budget simulator
      </p>
      {b.title && <p className="font-serif text-2xl font-semibold">{b.title}</p>}
      <p className="mt-1 text-sm text-ink-muted">
        A {b.weeks}-week budget of {formatMoney(b.budget)}. Change how often each service happens and what it costs, and watch the balance. The figures are made
        up for practice.
      </p>
      <div className="mt-4 rounded-2xl bg-muted p-4" role="status" aria-live="polite">
        <div className="flex flex-wrap items-end justify-between gap-2">
          <p>
            <span className="block text-sm text-ink-muted">Planned</span>
            <span className="font-mulish text-2xl font-extrabold tabular-nums">{formatMoney(spent)}</span>
          </p>
          <p className="text-right">
            <span className="block text-sm text-ink-muted">{left >= 0 ? "Left in the budget" : "Over budget by"}</span>
            <span className={cx("font-mulish text-2xl font-extrabold tabular-nums", left >= 0 ? "text-[#0f5b3a] dark:text-[#8fe0b5]" : "text-danger")}>
              {formatMoney(Math.abs(left))}
            </span>
          </p>
        </div>
        <div className="mt-3 h-3 overflow-hidden rounded-full bg-surface" aria-hidden>
          <div
            className={cx("h-full rounded-full transition-[width]", left >= 0 ? "bg-action" : "bg-danger")}
            style={{ width: `${left >= 0 ? used : 100}%` }}
          />
        </div>
      </div>
      <ul className="mt-4 flex flex-col divide-y divide-line">
        {b.services.map((s) => {
          const p = plan[s.id];
          if (!p) return null;
          return (
            <li key={s.id} className="flex flex-col gap-2 py-4">
              <div className="flex flex-wrap items-center justify-between gap-2">
                <label className="flex items-center gap-2 font-semibold">
                  <input type="checkbox" className="size-5 accent-[var(--color-action)]" checked={p.on} onChange={(e) => set(s.id, { on: e.target.checked })} />
                  {s.name}
                </label>
                <span className="font-mulish font-extrabold tabular-nums">{formatMoney(quarter(s.id))}</span>
              </div>
              <div className={cx("grid gap-3 sm:grid-cols-[minmax(0,1fr)_9rem]", !p.on && "opacity-50")}>
                <label className="flex flex-col gap-1 text-sm">
                  <span>
                    <strong>{p.perWeek}</strong> {s.unit}
                    {p.perWeek === 1 ? "" : "s"} a week
                  </span>
                  <input
                    type="range"
                    min={0}
                    max={s.max}
                    step={0.5}
                    value={p.perWeek}
                    disabled={!p.on}
                    onChange={(e) => set(s.id, { perWeek: Number(e.target.value) })}
                    className="accent-[var(--color-action)]"
                    aria-label={`${s.name}: ${s.unit}s a week`}
                  />
                </label>
                <label className="flex flex-col gap-1 text-sm">
                  Cost per {s.unit}
                  <span className="relative">
                    <span className="pointer-events-none absolute left-3 top-1/2 -translate-y-1/2 text-ink-muted">$</span>
                    <input
                      type="number"
                      min={0}
                      step={0.5}
                      value={p.cost}
                      disabled={!p.on}
                      onChange={(e) => set(s.id, { cost: Math.max(0, Number(e.target.value) || 0) })}
                      className="min-h-10 w-full rounded-xl border border-line-strong bg-surface pl-6 pr-2"
                    />
                  </span>
                </label>
              </div>
            </li>
          );
        })}
      </ul>
      <button
        type="button"
        onClick={() => setPlan(fresh())}
        className="mt-2 inline-flex min-h-10 items-center gap-1.5 self-start text-sm font-semibold text-accent hover:underline"
      >
        <Icon name="refresh" className="size-4" /> Start again
      </button>
    </div>
  );
}

// ---------------------------------------------------------------------------------------------------
// Insight wall: answer the question, then read what colleagues shared
// ---------------------------------------------------------------------------------------------------

type WallPost = { id: number; text: string; by: string | null; at: string; edited: boolean; likes: number; liked: boolean; mine: boolean; canHide: boolean };
type WallView = { prompt: string; anonymous: boolean; total: number; mine: WallPost | null; posts: WallPost[]; open: boolean };

const ago = (iso: string) => {
  const mins = Math.max(0, Math.round((Date.now() - new Date(iso).getTime()) / 60000));
  if (mins < 2) return "just now";
  if (mins < 60) return `${mins} min ago`;
  const h = Math.round(mins / 60);
  if (h < 24) return `${h} h ago`;
  const d = Math.round(h / 24);
  return d < 14 ? `${d} day${d === 1 ? "" : "s"} ago` : new Date(iso).toLocaleDateString("en-AU", { day: "numeric", month: "short" });
};

function Wall({ block: b, ctx }: { block: WallBlock; ctx: InteractiveContext }) {
  const key = `magazine:${ctx.guideId}`;
  const [wall, setWall] = useState<WallView | null>(null);
  const [text, setText] = useState("");
  const [editing, setEditing] = useState(false);
  const [busy, setBusy] = useState(false);
  const [problem, setProblem] = useState<string | null>(null);
  const id = useId();

  useEffect(() => {
    // A preview is of the draft, which the wall doesn't know about yet.
    if (ctx.preview) return;
    let live = true;
    api<WallView>(`/api/walls?lesson=${encodeURIComponent(key)}&card=${encodeURIComponent(b.id)}`).then(
      (w) => {
        if (!live) return;
        setWall(w);
        if (w.mine) ctx.engaged(b.id);
      },
      (e) => live && setProblem((e as Error).message),
    );
    return () => {
      live = false;
    };
    // Loaded once per block: ctx is new on every render, and only its engaged() is used here.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [key, b.id, ctx.preview]);

  async function send(body: Record<string, unknown>) {
    setBusy(true);
    setProblem(null);
    try {
      const w = await api<WallView>("/api/walls", { body });
      setWall(w);
      if (w.mine) ctx.engaged(b.id);
      return true;
    } catch (e) {
      setProblem((e as Error).message);
      return false;
    } finally {
      setBusy(false);
    }
  }

  const mine = wall?.mine ?? null;
  const showForm = !mine || editing;
  const others = wall?.posts ?? [];
  return (
    <div
      className={cx(
        column,
        // A sunlit wall with a plant on the right: the words sit on its plain left side, softened so they read well.
        "relative overflow-hidden rounded-3xl border border-line-strong bg-surface bg-cover bg-right-bottom p-5 sm:p-7",
        "bg-[url(/images/magazine/insight-wall.webp)]",
      )}
    >
      <span
        aria-hidden
        className="pointer-events-none absolute inset-0 bg-gradient-to-r from-[#fbf7f2]/90 via-[#fbf7f2]/70 to-[#fbf7f2]/10 dark:from-[#0b1626]/90 dark:via-[#0b1626]/80 dark:to-[#0b1626]/50"
      />
      <div className="relative">
        <p className={kicker}>
          <Icon name="people" className="size-5" /> Insight wall
        </p>
        <div className="flow-root">
          <CirclePhoto media={b.media} />
          <p className="font-serif text-xl font-semibold" id={`${id}-q`}>
            {b.prompt}
          </p>
        </div>
        {showForm ? (
          <div className="mt-3 flex flex-col gap-2">
            <textarea
              aria-labelledby={`${id}-q`}
              aria-describedby={`${id}-note`}
              className="min-h-28 w-full rounded-2xl border border-line-strong bg-surface p-3 leading-relaxed"
              value={text}
              maxLength={600}
              onChange={(e) => setText(e.target.value)}
              placeholder={b.placeholder || "Share what works for you."}
              disabled={busy || ctx.preview}
            />
            <p id={`${id}-note`} className="text-sm text-ink-muted">
              Others reading this course will see what you post{b.anonymous ? ", without your name" : " with your first name and role"}. Leave out client names
              and details.
            </p>
            <div className="flex flex-wrap items-center gap-2">
              <button
                type="button"
                disabled={busy || ctx.preview || text.trim().length < 3}
                onClick={async () => {
                  if (await send({ action: "post", lesson: key, card: b.id, text })) setEditing(false);
                }}
                className="inline-flex min-h-11 items-center gap-2 rounded-full bg-action px-5 font-semibold text-on-action hover:bg-action-hover disabled:opacity-45"
              >
                <Icon name="chat" className="size-4" /> {busy ? "Posting…" : editing ? "Save" : "Post to the wall"}
              </button>
              {editing && (
                <button type="button" className="min-h-11 px-3 font-medium text-ink-muted" onClick={() => setEditing(false)}>
                  Cancel
                </button>
              )}
            </div>
            {ctx.preview && <p className="text-sm text-ink-muted">The wall opens once the guide is published.</p>}
            {!mine && wall && wall.total > 0 && (
              <p className="text-sm font-semibold text-accent">
                {wall.total} {wall.total === 1 ? "person has" : "people have"} shared. Post yours to see theirs.
              </p>
            )}
          </div>
        ) : (
          <div className="mt-3 rounded-2xl border-2 border-action/40 bg-tealtint p-3">
            <div className="flex items-center justify-between gap-2">
              <p className="font-mulish text-xs font-extrabold uppercase tracking-[0.12em] text-accent">Your post</p>
              <button
                type="button"
                className="min-h-9 px-2 text-sm font-semibold text-accent"
                onClick={() => {
                  setText(mine!.text);
                  setEditing(true);
                }}
              >
                Edit
              </button>
            </div>
            <p className="mt-1 whitespace-pre-line">{mine!.text}</p>
          </div>
        )}
        {problem && (
          <p role="alert" className="mt-3 rounded-2xl bg-orange/10 p-3 text-sm">
            {problem}
          </p>
        )}
        {(mine || wall?.open) && (
          <section aria-label="What others shared" className="mt-4 flex flex-col gap-2">
            <p className="font-mulish text-xs font-extrabold uppercase tracking-[0.12em] text-ink-muted">
              What others shared {others.length > 0 && `· ${others.length}`}
            </p>
            {!others.length && <p className="text-sm text-ink-muted">You’re the first. Come back later to see what others add.</p>}
            <ul className="grid gap-2 sm:grid-cols-2">
              {others.map((p) => (
                <li key={p.id} className="flex flex-col rounded-2xl bg-surface/90 p-3 shadow-sm ring-1 ring-line">
                  <p className="whitespace-pre-line">{p.text}</p>
                  <div className="mt-auto flex flex-wrap items-center gap-x-3 gap-y-1 pt-2 text-xs text-ink-muted">
                    {p.by && <span className="font-semibold text-ink">{p.by}</span>}
                    <span>
                      {ago(p.at)}
                      {p.edited && " · edited"}
                    </span>
                    <button
                      type="button"
                      aria-pressed={p.liked}
                      disabled={busy}
                      onClick={() => send({ action: p.liked ? "unlike" : "like", post: p.id })}
                      className={cx(
                        "ml-auto inline-flex min-h-9 items-center gap-1 rounded-full px-2.5 font-semibold",
                        p.liked ? "bg-action text-on-action" : "bg-surface text-ink ring-1 ring-line hover:bg-tealtint",
                      )}
                    >
                      <Icon name="heart" className="size-3.5" /> Helpful{p.likes ? ` · ${p.likes}` : ""}
                    </button>
                    {p.canHide && (
                      <button
                        type="button"
                        disabled={busy}
                        onClick={async () =>
                          (await confirmAction("It stays on record but nobody sees it on the wall.", {
                            title: "Hide this post?",
                            confirmLabel: "Hide post",
                          })) && send({ action: "hide", post: p.id })
                        }
                        className="min-h-9 px-1 font-semibold text-ink-muted hover:text-ink"
                      >
                        Hide
                      </button>
                    )}
                  </div>
                </li>
              ))}
            </ul>
          </section>
        )}
      </div>
    </div>
  );
}

// ---------------------------------------------------------------------------------------------------
// Poll: a vote each, and everyone's answers shown back
// ---------------------------------------------------------------------------------------------------

type PollView = { counts: Record<string, number>; total: number; mine: string | null };

function Poll({ block: b, ctx }: { block: PollBlock; ctx: InteractiveContext }) {
  const key = `magazine:${ctx.guideId}`;
  const [view, setView] = useState<PollView | null>(null);
  const [busy, setBusy] = useState(false);
  const [problem, setProblem] = useState<string | null>(null);
  // An author's preview shows how it works without voting.
  const [previewVote, setPreviewVote] = useState<string | null>(null);
  const name = useId();

  useEffect(() => {
    if (ctx.preview) return;
    let live = true;
    api<PollView>(`/api/polls?lesson=${encodeURIComponent(key)}&card=${encodeURIComponent(b.id)}`).then(
      (v) => {
        if (!live) return;
        setView(v);
        if (v.mine) ctx.engaged(b.id);
      },
      (e) => live && setProblem((e as Error).message),
    );
    return () => {
      live = false;
    };
    // Loaded once per block: ctx is new on every render, and only its engaged() is used here.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [key, b.id, ctx.preview]);

  async function vote(option: string) {
    ctx.engaged(b.id);
    if (ctx.preview) return setPreviewVote(option);
    setBusy(true);
    setProblem(null);
    try {
      setView(await api<PollView>("/api/polls", { body: { lesson: key, card: b.id, option } }));
    } catch (e) {
      setProblem((e as Error).message);
    } finally {
      setBusy(false);
    }
  }

  const mine = ctx.preview ? previewVote : (view?.mine ?? null);
  const shown = mine !== null;
  const total = ctx.preview ? (previewVote ? 1 : 0) : (view?.total ?? 0);
  const count = (id: string) => (ctx.preview ? (previewVote === id ? 1 : 0) : (view?.counts[id] ?? 0));
  const pct = (id: string) => (total ? Math.round((count(id) / total) * 100) : 0);
  return (
    <fieldset className={cx(column, "rounded-3xl border border-line-strong bg-surface p-5 sm:p-7")}>
      <legend className="sr-only">{b.question}</legend>
      <p className={kicker}>
        <Icon name="sliders" className="size-5" /> Poll
      </p>
      <div className="flow-root">
        <CirclePhoto media={b.media} />
        <p className="font-serif text-xl font-semibold" aria-hidden>
          {b.question}
        </p>
      </div>
      <div className="mt-4 flex flex-col gap-2">
        {b.options.map((op) => {
          const chosen = mine === op.id;
          return (
            <label
              key={op.id}
              className={cx(
                "relative flex min-h-12 cursor-pointer items-center gap-3 overflow-hidden rounded-2xl border-2 px-4 py-2 has-[:focus-visible]:outline has-[:focus-visible]:outline-2 has-[:focus-visible]:outline-focus",
                chosen ? "border-action" : "border-line-strong hover:bg-muted",
              )}
            >
              {shown && (
                <span
                  className="absolute inset-y-0 left-0 bg-tealtint transition-[width] motion-reduce:transition-none"
                  style={{ width: `${pct(op.id)}%` }}
                  aria-hidden
                />
              )}
              <input
                type="radio"
                name={name}
                value={op.id}
                checked={chosen}
                disabled={busy}
                onChange={() => void vote(op.id)}
                className="relative size-4 accent-[var(--color-action)]"
              />
              <span className="relative min-w-0 flex-1">{op.text}</span>
              {shown && (
                <span className="relative font-mulish font-extrabold tabular-nums">
                  {pct(op.id)}%{chosen && <span className="sr-only"> (your vote)</span>}
                </span>
              )}
            </label>
          );
        })}
      </div>
      <p className="mt-3 text-sm text-ink-muted" role="status">
        {shown
          ? `${total} ${total === 1 ? "vote" : "votes"} so far. You can change yours.`
          : ctx.preview
            ? "Readers see everyone’s answers after they vote. Nothing is recorded in a preview."
            : "Vote to see what everyone else said."}
      </p>
      {problem && <p className="mt-2 text-sm font-semibold text-danger">{problem}</p>}
    </fieldset>
  );
}

// ---------------------------------------------------------------------------------------------------
// Hotspots: points on a picture to open
// ---------------------------------------------------------------------------------------------------

function Hotspots({ block: b, ctx }: { block: HotspotsBlock; ctx: InteractiveContext }) {
  const [open, setOpen] = useState<string | null>(null);
  const [seen, setSeen] = useState<string[]>([]);
  const panel = useRef<HTMLDivElement>(null);
  if (!b.media.src) return null;
  const show = (id: string) => {
    setOpen(id);
    if (!seen.includes(id)) {
      const next = [...seen, id];
      setSeen(next);
      if (next.length === b.spots.length) {
        ctx.activity(b.id, { outcome: "explored", score: next.length, total: b.spots.length });
        ctx.engaged(b.id);
      }
    }
    requestAnimationFrame(() => panel.current?.focus());
  };
  const at = b.spots.findIndex((s) => s.id === open);
  const spot = b.spots[at];
  return (
    <div className="w-full">
      <div className={column}>
        <p className={kicker}>
          <Icon name="pin" className="size-5" /> Hotspots
        </p>
        {b.prompt && <p className="font-serif text-xl font-semibold">{b.prompt}</p>}
        <p className="mt-1 text-sm text-ink-muted">Select each numbered point to find out more.</p>
      </div>
      <div className="relative mt-4">
        {/* eslint-disable-next-line @next/next/no-img-element */}
        <img src={b.media.src} alt={b.media.alt} className="w-full rounded-2xl bg-muted" />
        {b.spots.map((s, i) => (
          <button
            key={s.id}
            type="button"
            onClick={() => show(s.id)}
            aria-expanded={open === s.id}
            aria-label={`${i + 1}. ${s.title}${seen.includes(s.id) ? " (opened)" : ""}`}
            className={cx(
              "absolute grid size-10 -translate-x-1/2 -translate-y-1/2 place-items-center rounded-full border-[3px] border-white font-mulish font-extrabold shadow-lg outline-offset-2 transition-transform hover:scale-110 motion-reduce:transition-none",
              open === s.id
                ? "scale-110 bg-ink text-surface"
                : seen.includes(s.id)
                  ? "bg-[#2f8f5b] text-white"
                  : "animate-pulse bg-action text-on-action motion-reduce:animate-none",
            )}
            style={{ left: `${s.x}%`, top: `${s.y}%` }}
          >
            {seen.includes(s.id) && open !== s.id ? <Icon name="check" className="size-5" /> : i + 1}
          </button>
        ))}
      </div>
      <div className={cx(column, "mt-4")}>
        <p className="text-sm font-semibold" role="status">
          Opened {seen.length} of {b.spots.length}
        </p>
        {spot && (
          <div ref={panel} tabIndex={-1} className="mt-2 rounded-2xl border-l-4 border-action bg-tealtint p-4 outline-none" aria-live="polite">
            <div className="flex items-start justify-between gap-2">
              <p className="font-semibold">
                {at + 1}. {spot.title}
              </p>
              <button
                type="button"
                aria-label="Close"
                onClick={() => setOpen(null)}
                className="grid size-8 shrink-0 place-items-center rounded-full hover:bg-surface"
              >
                <Icon name="close" className="size-4" />
              </button>
            </div>
            <RichText text={spot.body} className="mt-1 leading-relaxed" />
            {at < b.spots.length - 1 && (
              <button
                type="button"
                onClick={() => show(b.spots[at + 1].id)}
                className="mt-3 inline-flex items-center gap-1 text-sm font-semibold text-accent hover:underline"
              >
                Next point <Icon name="arrow-right" className="size-4" />
              </button>
            )}
          </div>
        )}
      </div>
    </div>
  );
}

// ---------------------------------------------------------------------------------------------------
// Shared by the checked activities: the score, the feedback, and trying again
// ---------------------------------------------------------------------------------------------------

function Checked({ score, total, feedback, onRetry, onShow }: { score: number; total: number; feedback?: string; onRetry?: () => void; onShow?: () => void }) {
  const all = score === total;
  return (
    <div className={cx("mt-4 rounded-2xl border-l-4 p-4", all ? VERDICT_LOOK.best.box : VERDICT_LOOK.acceptable.box)} role="status">
      <p className="flex items-center gap-2 font-bold">
        <Icon name={all ? "circle-check" : "info"} className="size-5" /> {all ? `All ${total} right` : `${score} of ${total} right`}
      </p>
      {feedback && <RichText text={feedback} className="mt-1 leading-relaxed" />}
      {(onRetry || onShow) && (
        <div className="mt-3 flex flex-wrap gap-3">
          {onRetry && (
            <button type="button" onClick={onRetry} className="inline-flex min-h-10 items-center gap-1.5 text-sm font-semibold text-accent hover:underline">
              <Icon name="refresh" className="size-4" /> Try again
            </button>
          )}
          {onShow && (
            <button type="button" onClick={onShow} className="inline-flex min-h-10 items-center text-sm font-semibold text-accent hover:underline">
              Show the answers
            </button>
          )}
        </div>
      )}
    </div>
  );
}

const checkButton =
  "mt-4 inline-flex min-h-11 items-center gap-1.5 rounded-full bg-action px-5 font-semibold text-on-action hover:bg-action-hover disabled:opacity-45";
const rightMark = (ok: boolean) => (
  <span className={cx("inline-flex shrink-0 items-center gap-1 text-sm font-semibold", ok ? "text-[#0f5b3a] dark:text-[#8fe0b5]" : "text-danger")}>
    <Icon name={ok ? "circle-check" : "alert"} className="size-4" /> {ok ? "Right" : "Not quite"}
  </span>
);

// ---------------------------------------------------------------------------------------------------
// Sorting: put each item in its group
// ---------------------------------------------------------------------------------------------------

function Sorting({ block: b, ctx }: { block: SortingBlock; ctx: InteractiveContext }) {
  const order = shuffleFor(b.id, b.items.length).map((i) => b.items[i]);
  const [placed, setPlaced] = useState<Record<string, string>>({});
  const [checked, setChecked] = useState(false);
  const [shown, setShown] = useState(false);
  const attempts = useRef(0);
  const right = (id: string) => placed[id] === b.items.find((it) => it.id === id)?.group;
  const score = b.items.filter((it) => right(it.id)).length;
  const loose = order.filter((it) => !placed[it.id]);
  const check = () => {
    attempts.current += 1;
    setChecked(true);
    ctx.engaged(b.id);
    ctx.activity(b.id, { outcome: `attempt ${attempts.current}`, score: b.items.filter((it) => placed[it.id] === it.group).length, total: b.items.length });
  };
  return (
    <div className={cx(column, "rounded-3xl border border-line-strong bg-surface p-5 sm:p-7")}>
      <p className={kicker}>
        <Icon name="sorting" className="size-5" /> Sorting
      </p>
      <p className="font-serif text-xl font-semibold">{b.prompt}</p>
      {loose.length > 0 && (
        <ul className="mt-4 flex flex-col gap-2" aria-label="To sort">
          {loose.map((it) => (
            <li key={it.id} className="rounded-2xl border border-line-strong p-3">
              <p className="font-semibold">{it.text}</p>
              <div className="mt-2 flex flex-wrap gap-1.5" role="group" aria-label={`Where does “${it.text}” belong?`}>
                {b.groups.map((g) => (
                  <button
                    key={g.id}
                    type="button"
                    onClick={() => setPlaced((p) => ({ ...p, [it.id]: g.id }))}
                    className="min-h-9 rounded-full border border-line-strong px-3 text-sm font-semibold hover:border-action hover:bg-tealtint"
                  >
                    {g.label}
                  </button>
                ))}
              </div>
            </li>
          ))}
        </ul>
      )}
      <div className={cx("mt-4 grid gap-3", b.groups.length > 2 ? "sm:grid-cols-2 lg:grid-cols-3" : "sm:grid-cols-2")}>
        {b.groups.map((g) => {
          const here = order.filter((it) => (shown ? it.group : placed[it.id]) === g.id);
          return (
            <section key={g.id} aria-label={g.label} className="flex min-h-28 flex-col rounded-2xl bg-muted p-3">
              <h4 className="font-mulish text-xs font-extrabold uppercase tracking-[0.12em] text-accent">{g.label}</h4>
              <ul className="mt-2 flex flex-col gap-1.5">
                {here.map((it) => (
                  <li key={it.id} className="rounded-xl bg-surface p-2.5 text-sm shadow-sm">
                    <div className="flex items-start justify-between gap-2">
                      <span>{it.text}</span>
                      {checked && !shown ? (
                        rightMark(right(it.id))
                      ) : !shown ? (
                        <button
                          type="button"
                          aria-label={`Take “${it.text}” out of ${g.label}`}
                          onClick={() =>
                            setPlaced((p) => {
                              const next = { ...p };
                              delete next[it.id];
                              return next;
                            })
                          }
                          className="grid size-7 shrink-0 place-items-center rounded-full text-ink-muted hover:bg-muted"
                        >
                          <Icon name="close" className="size-3.5" />
                        </button>
                      ) : null}
                    </div>
                    {(checked || shown) && it.feedback && <p className="mt-1 text-xs text-ink-muted">{it.feedback}</p>}
                  </li>
                ))}
              </ul>
            </section>
          );
        })}
      </div>
      {!checked && !shown && (
        <button type="button" className={checkButton} disabled={loose.length > 0} onClick={check}>
          <Icon name="check" className="size-4" /> {loose.length ? `Sort ${loose.length} more to check` : "Check"}
        </button>
      )}
      {checked && !shown && (
        <Checked
          score={score}
          total={b.items.length}
          onRetry={
            score < b.items.length
              ? () => {
                  // Wrong ones go back to be sorted again.
                  setPlaced((p) => Object.fromEntries(Object.entries(p).filter(([id, g]) => b.items.find((it) => it.id === id)?.group === g)));
                  setChecked(false);
                }
              : undefined
          }
          onShow={score < b.items.length ? () => setShown(true) : undefined}
        />
      )}
    </div>
  );
}

// ---------------------------------------------------------------------------------------------------
// Sequencing: put the steps in order
// ---------------------------------------------------------------------------------------------------

function Sequencing({ block: b, ctx }: { block: SequencingBlock; ctx: InteractiveContext }) {
  const [order, setOrder] = useState(() => shuffleFor(b.id, b.steps.length).map((i) => b.steps[i].id));
  const [checked, setChecked] = useState(false);
  const attempts = useRef(0);
  const [said, setSaid] = useState("");
  const text = (id: string) => b.steps.find((s) => s.id === id)?.text ?? "";
  const ok = (id: string, i: number) => b.steps[i]?.id === id;
  const score = order.filter(ok).length;
  const move = (i: number, dir: -1 | 1) => {
    const j = i + dir;
    if (j < 0 || j >= order.length) return;
    setChecked(false);
    setOrder((o) => {
      const next = [...o];
      [next[i], next[j]] = [next[j], next[i]];
      return next;
    });
    setSaid(`“${text(order[i])}” moved to position ${j + 1}.`);
  };

  // Dragging a step: with a mouse anywhere on it, on a touch screen by its grip (so the page still scrolls).
  // It moves into the slot under the pointer as it goes; the arrows do the same from the keyboard.
  const [dragging, setDragging] = useState<string | null>(null);
  // The step being dragged and the order so far, kept outside render so quick moves are never missed.
  const drag = useRef<{ id: string; order: string[] } | null>(null);
  const rows = useRef(new Map<string, HTMLLIElement>());
  const startDrag = (e: React.PointerEvent, id: string) => {
    if ((e.target as HTMLElement).closest("button")) return;
    if (e.pointerType !== "mouse" && !(e.target as HTMLElement).closest("[data-grip]")) return;
    e.preventDefault();
    try {
      (e.currentTarget as HTMLElement).setPointerCapture(e.pointerId);
    } catch {}
    drag.current = { id, order };
    setDragging(id);
    setChecked(false);
  };
  const dragTo = (e: React.PointerEvent) => {
    const d = drag.current;
    if (!d) return;
    // The slot: how many of the other steps sit above the pointer.
    const others = d.order.filter((x) => x !== d.id);
    const slot = others.filter((x) => {
      const r = rows.current.get(x)?.getBoundingClientRect();
      return r ? r.top + r.height / 2 < e.clientY : false;
    }).length;
    if (d.order.indexOf(d.id) === slot) return;
    d.order = [...others.slice(0, slot), d.id, ...others.slice(slot)];
    setOrder(d.order);
  };
  const endDrag = () => {
    const d = drag.current;
    if (!d) return;
    drag.current = null;
    setSaid(`“${text(d.id)}” is now step ${d.order.indexOf(d.id) + 1}.`);
    setDragging(null);
  };

  return (
    <div className={cx(column, "rounded-3xl border border-line-strong bg-surface p-5 sm:p-7")}>
      <p className={kicker}>
        <Icon name="sequencing" className="size-5" /> Sequencing
      </p>
      <div className="flow-root">
        <CirclePhoto media={b.media} />
        <p className="font-serif text-xl font-semibold">{b.prompt}</p>
        <p className="mt-1 text-sm text-ink-muted">Drag the steps into order, or use the arrows.</p>
      </div>
      <ol className="mt-4 flex flex-col gap-2">
        {order.map((id, i) => (
          <li
            key={id}
            ref={(el) => {
              if (el) rows.current.set(id, el);
              else rows.current.delete(id);
            }}
            onPointerDown={(e) => startDrag(e, id)}
            onPointerMove={dragTo}
            onPointerUp={endDrag}
            onPointerCancel={endDrag}
            className={cx(
              "flex select-none items-center gap-3 rounded-2xl border-2 bg-surface p-3 transition-shadow",
              dragging
                ? dragging === id
                  ? "relative z-10 cursor-grabbing border-action shadow-xl ring-4 ring-action/20"
                  : "border-line-strong"
                : "cursor-grab",
              !dragging && (checked ? (ok(id, i) ? "border-[#2f8f5b]" : "border-[#c7393e]") : "border-line-strong hover:border-action"),
            )}
          >
            <span data-grip aria-hidden className="-ml-1 grid h-9 w-6 shrink-0 cursor-grab touch-none place-items-center text-ink-muted">
              <Icon name="grip" className="size-4" />
            </span>
            <span className="grid size-8 shrink-0 place-items-center rounded-full bg-muted font-mulish text-sm font-extrabold">{i + 1}</span>
            <span className="min-w-0 flex-1">{text(id)}</span>
            {checked && rightMark(ok(id, i))}
            <span className="flex shrink-0">
              <button
                type="button"
                onClick={() => move(i, -1)}
                disabled={i === 0}
                aria-label={`Move “${text(id)}” up`}
                className="grid size-9 place-items-center rounded-full hover:bg-muted disabled:opacity-30"
              >
                <Icon name="arrow-up" className="size-4" />
              </button>
              <button
                type="button"
                onClick={() => move(i, 1)}
                disabled={i === order.length - 1}
                aria-label={`Move “${text(id)}” down`}
                className="grid size-9 place-items-center rounded-full hover:bg-muted disabled:opacity-30"
              >
                <Icon name="arrow-down" className="size-4" />
              </button>
            </span>
          </li>
        ))}
      </ol>
      <p className="sr-only" aria-live="polite">
        {said}
      </p>
      {!checked && (
        <button
          type="button"
          className={checkButton}
          onClick={() => {
            attempts.current += 1;
            setChecked(true);
            ctx.engaged(b.id);
            ctx.activity(b.id, { outcome: `attempt ${attempts.current}`, score, total: b.steps.length });
          }}
        >
          <Icon name="check" className="size-4" /> Check the order
        </button>
      )}
      {checked && (
        <Checked
          score={score}
          total={b.steps.length}
          feedback={score === b.steps.length ? b.feedback : undefined}
          onRetry={score < b.steps.length ? () => setChecked(false) : undefined}
          onShow={
            score < b.steps.length
              ? () => {
                  setOrder(b.steps.map((s) => s.id));
                  setChecked(true);
                }
              : undefined
          }
        />
      )}
    </div>
  );
}

// ---------------------------------------------------------------------------------------------------
// Matching: pair each item with its match
// ---------------------------------------------------------------------------------------------------

function Matching({ block: b, ctx }: { block: MatchingBlock; ctx: InteractiveContext }) {
  const options = shuffleFor(b.id, b.pairs.length).map((i) => b.pairs[i]);
  const [chosen, setChosen] = useState<Record<string, string>>({});
  const [checked, setChecked] = useState(false);
  const attempts = useRef(0);
  const name = useId();
  const score = b.pairs.filter((p) => chosen[p.id] === p.id).length;
  const done = b.pairs.every((p) => chosen[p.id]);
  return (
    <div className={cx(column, "rounded-3xl border border-line-strong bg-surface p-5 sm:p-7")}>
      <p className={kicker}>
        <Icon name="matching" className="size-5" /> Matching
      </p>
      <p className="font-serif text-xl font-semibold">{b.prompt}</p>
      <ul className="mt-4 flex flex-col gap-2">
        {b.pairs.map((p, i) => {
          const ok = chosen[p.id] === p.id;
          return (
            <li
              key={p.id}
              className={cx(
                "grid gap-2 rounded-2xl border-2 p-3 sm:grid-cols-[minmax(0,1fr)_minmax(0,1.3fr)] sm:items-center",
                checked ? (ok ? "border-[#2f8f5b]" : "border-[#c7393e]") : "border-line-strong",
              )}
            >
              <label htmlFor={`${name}-${i}`} className="font-semibold">
                {p.left}
              </label>
              <div className="flex items-center gap-2">
                <select
                  id={`${name}-${i}`}
                  value={chosen[p.id] ?? ""}
                  onChange={(e) => {
                    setChecked(false);
                    setChosen((c) => ({ ...c, [p.id]: e.target.value }));
                  }}
                  className="min-h-11 w-full min-w-0 rounded-xl border border-line-strong bg-surface px-2"
                >
                  <option value="">Choose a match…</option>
                  {options.map((o) => (
                    <option key={o.id} value={o.id}>
                      {o.right}
                    </option>
                  ))}
                </select>
                {checked && rightMark(ok)}
              </div>
            </li>
          );
        })}
      </ul>
      {!checked && (
        <button
          type="button"
          className={checkButton}
          disabled={!done}
          onClick={() => {
            attempts.current += 1;
            setChecked(true);
            ctx.engaged(b.id);
            ctx.activity(b.id, { outcome: `attempt ${attempts.current}`, score, total: b.pairs.length });
          }}
        >
          <Icon name="check" className="size-4" /> {done ? "Check" : "Match them all to check"}
        </button>
      )}
      {checked && (
        <Checked
          score={score}
          total={b.pairs.length}
          feedback={score === b.pairs.length ? b.feedback : undefined}
          onRetry={score < b.pairs.length ? () => setChecked(false) : undefined}
          onShow={
            score < b.pairs.length
              ? () => {
                  setChosen(Object.fromEntries(b.pairs.map((p) => [p.id, p.id])));
                  setChecked(true);
                }
              : undefined
          }
        />
      )}
    </div>
  );
}

// ---------------------------------------------------------------------------------------------------
// Fill in the blank
// ---------------------------------------------------------------------------------------------------

function FillBlank({ block: b, ctx }: { block: FillBlankBlock; ctx: InteractiveContext }) {
  const parts = blanksOf(b.text);
  const gaps = parts.filter((p): p is { answers: string[] } => "answers" in p);
  const [typed, setTyped] = useState<string[]>(() => gaps.map(() => ""));
  const [checked, setChecked] = useState(false);
  const attempts = useRef(0);
  const ok = (i: number) => gaps[i].answers.some((a) => sameAnswer(typed[i] ?? "", a));
  const score = gaps.filter((_, i) => ok(i)).length;
  // Which gap each piece of the text is, counting from 0.
  const gapAt = parts.map((_, k) => parts.slice(0, k).filter((x) => "answers" in x).length);
  return (
    <div className={cx(column, "rounded-3xl border border-line-strong bg-surface p-5 sm:p-7")}>
      <p className={kicker}>
        <Icon name="blank" className="size-5" /> Fill in the blank
      </p>
      {b.prompt && <p className="font-serif text-xl font-semibold">{b.prompt}</p>}
      <p className="mt-3 whitespace-pre-line text-[1.08rem] leading-[2.4]">
        {parts.map((p, k) => {
          if ("text" in p) return <span key={k}>{p.text}</span>;
          const i = gapAt[k];
          const width = Math.max(6, ...p.answers.map((a) => a.length)) + 2;
          return (
            <span key={k} className="inline-flex flex-col align-baseline">
              <input
                aria-label={`Gap ${i + 1}`}
                value={typed[i] ?? ""}
                onChange={(e) => {
                  setChecked(false);
                  setTyped((t) => t.map((v, j) => (j === i ? e.target.value : v)));
                }}
                style={{ width: `${width}ch` }}
                className={cx(
                  "mx-1 inline-block rounded-lg border-b-2 bg-muted px-2 py-0.5 text-center font-semibold leading-normal",
                  checked ? (ok(i) ? "border-[#2f8f5b]" : "border-[#c7393e]") : "border-action",
                )}
              />
              {checked && !ok(i) && <span className="mx-1 text-center text-xs font-semibold leading-tight text-danger">{p.answers[0]}</span>}
            </span>
          );
        })}
      </p>
      {!checked && (
        <button
          type="button"
          className={checkButton}
          disabled={typed.every((t) => !t.trim())}
          onClick={() => {
            attempts.current += 1;
            setChecked(true);
            ctx.engaged(b.id);
            ctx.activity(b.id, { outcome: `attempt ${attempts.current}`, score, total: gaps.length });
          }}
        >
          <Icon name="check" className="size-4" /> Check
        </button>
      )}
      {checked && <Checked score={score} total={gaps.length} feedback={b.feedback} onRetry={score < gaps.length ? () => setChecked(false) : undefined} />}
    </div>
  );
}

/**
  A conversation practice is either free conversation (the learner types or speaks, lib/roleplay) or a
  choice of responses. A block set to free conversation still has its choices: they're what the learner
  gets if they'd rather, or if the character can't reply.
*/
function ConversationPractice({ block: b, ctx }: { block: ConversationBlock; ctx: InteractiveContext }) {
  const [choices, setChoices] = useState(false);
  const scene = b.roleplay;
  if (scene && !choices) return <Roleplay block={{ ...b, roleplay: scene }} ctx={ctx} onChoices={() => setChoices(true)} />;
  return (
    <>
      <Conversation block={b} ctx={ctx} />
      {scene && (
        <p className="mx-auto mt-2 w-full max-w-[46rem]">
          <button type="button" className="min-h-11 font-semibold text-accent underline-offset-4 hover:underline" onClick={() => setChoices(false)}>
            Back to saying it in your own words
          </button>
        </p>
      )}
    </>
  );
}
