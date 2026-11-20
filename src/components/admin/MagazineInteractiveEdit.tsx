"use client";

import { useState } from "react";
import { cx } from "@/lib/format";
import {
  OUTCOMES,
  VERDICTS,
  allBlocks,
  blanksOf,
  type Block,
  type BranchOutcome,
  type GuideDoc,
  type Verdict,
  CONFIDENCE_FACES,
  type Media,
  ACTION_STATUSES,
  PULSE_DEFAULTS,
  reflectChecks,
  BLOCK_LABELS,
} from "@/lib/magazine";
import { btn, Field, input } from "./ui";
import { DescribeButton, ImageDropZone, PictureButtons } from "./ImagePicker";
import { RichEditable } from "./RichEditable";
import { InlineText, MediaSlot, rid, VERDICT_TONE, type Update } from "./MagazineEditParts";
import { column } from "../magazine/GuideBlocks";
import { RoleplaySettings } from "./MagazineRoleplayEdit";
import { SignalEdit } from "./MagazineSignalEdit";
import { MissionEdit } from "./MagazineMissionEdit";
import { BalanceEdit } from "./MagazineBalanceEdit";
import { Icon, type IconName } from "../Icon";

/*
  The editors for the Magazine's interactive blocks: flashcards, tabs, a timeline, process steps, a
  branching scenario, a conversation simulator, spot the mistake, a confidence check, a reflection and a
  budget simulator. Like the rest of the editor, each is drawn much as learners see it, with its words
  edited in place; the few settings that aren't words sit in the panel beside the page.
*/

type Of<T extends Block["type"]> = Extract<Block, { type: T }>;

const kicker = "mb-2 flex items-center gap-2 font-mulish text-sm font-extrabold uppercase tracking-[0.12em] text-accent";
const card = "rounded-3xl border border-line-strong bg-surface p-5 shadow-sm sm:p-7";
const OUTCOME_TONE: Record<BranchOutcome, string> = {
  good: "border-[#2f8f5b] bg-[#e9f6ef] dark:bg-[#17301f]",
  mixed: "border-[#fab53d] bg-[#fff6e4] dark:bg-[#3a2f17]",
  poor: "border-[#c7393e] bg-[#fdf1f0] dark:bg-[#3a1f1f]",
};

type Photographed = Of<"sequencing"> | Of<"poll"> | Of<"wall"> | Of<"reflection"> | Of<"conversation">;

/**
  The optional photo in a circle beside the question: a link to add one, then the picture's controls
  (replace, crop, the library, AI, Pexels, remove) and its description. `context` helps AI describe it.
*/
function PhotoField({ block: b, update, context }: { block: Photographed; update: Update; context: string }) {
  const set = (fn: (x: Photographed) => void, key?: string) => update<Photographed>(b.id, fn, key);
  if (!b.media)
    return (
      <button
        type="button"
        className="mb-3 inline-flex items-center gap-1.5 self-start text-sm font-semibold text-accent hover:underline"
        onClick={() => set((x) => void (x.media = { src: "", alt: "" }))}
      >
        <Icon name="image" className="size-4" /> Add a photo (a circle beside the question)
      </button>
    );
  return (
    <div className="mb-5 flex flex-col gap-2 rounded-2xl bg-muted/50 p-3">
      {!b.media.src ? (
        <>
          <MediaSlot media={b.media} aspect="aspect-square max-w-48" onPick={(src) => set((x) => void (x.media = src ? { src, alt: "" } : undefined))} />
          <button type="button" className="self-start text-xs font-semibold text-accent hover:underline" onClick={() => set((x) => void delete x.media)}>
            Remove picture
          </button>
        </>
      ) : (
        <>
          <PictureButtons
            picture={{ src: b.media.src, width: 0, height: 0 }}
            onChange={(p, how, alt) =>
              set((x) => {
                if (!p) return void delete x.media;
                // A cropped copy keeps its description; a different picture needs a new one.
                const cropped = how === "crop";
                x.media = { src: p.src, alt: cropped ? (x.media?.alt ?? "") : (alt ?? ""), ...(x.media?.decorative && { decorative: true }) };
              })
            }
          />
          <DescribeButton src={b.media.src} context={context} onAlt={(alt) => set((x) => void (x.media!.alt = alt))} />
          <input
            className={cx(input, "min-h-10 text-sm", !b.media.alt && !b.media.decorative && "border-danger")}
            placeholder="Describe the picture"
            aria-label="Picture description"
            value={b.media.alt}
            disabled={b.media.decorative}
            onChange={(e) => set((x) => void (x.media!.alt = e.target.value), `${b.id}:alt`)}
          />
          <label className="flex items-center gap-1.5 text-xs">
            <input
              type="checkbox"
              className="size-4 accent-[var(--color-action)]"
              checked={Boolean(b.media.decorative)}
              onChange={(e) => set((x) => void (x.media!.decorative = e.target.checked || undefined))}
            />
            Decorative: it adds nothing the question doesn’t say
          </label>
        </>
      )}
    </div>
  );
}

/** The photo where readers see it: in a circle, floated beside the question (inside a flow-root box). */
function CircleShown({ media }: { media?: Media }) {
  if (!media?.src) return null;
  return (
    // eslint-disable-next-line @next/next/no-img-element
    <img
      src={media.src}
      alt={media.alt}
      className="float-right -mt-8 mb-2 ml-4 size-24 rounded-full bg-muted object-cover shadow-md ring-4 ring-surface sm:size-32"
    />
  );
}

function Kicker({ icon, children }: { icon: IconName; children: React.ReactNode }) {
  return (
    <p className={kicker}>
      <Icon name={icon} className="size-5" /> {children}
    </p>
  );
}

/** Move up, move down and remove, for one item in a list. */
function RowTools({
  what,
  index,
  count,
  min = 1,
  onMove,
  onRemove,
}: {
  what: string;
  index: number;
  count: number;
  min?: number;
  onMove: (dir: -1 | 1) => void;
  onRemove: () => void;
}) {
  const tool = "grid size-8 shrink-0 place-items-center rounded-full text-ink-muted hover:bg-muted hover:text-ink disabled:opacity-30";
  return (
    <span className="flex shrink-0 items-center">
      <button type="button" className={tool} aria-label={`Move ${what} ${index + 1} up`} title="Move up" disabled={index === 0} onClick={() => onMove(-1)}>
        <Icon name="arrow-up" className="size-4" />
      </button>
      <button
        type="button"
        className={tool}
        aria-label={`Move ${what} ${index + 1} down`}
        title="Move down"
        disabled={index === count - 1}
        onClick={() => onMove(1)}
      >
        <Icon name="arrow-down" className="size-4" />
      </button>
      <button type="button" className={tool} aria-label={`Remove ${what} ${index + 1}`} title="Remove" disabled={count <= min} onClick={onRemove}>
        <Icon name="close" className="size-4" />
      </button>
    </span>
  );
}

function AddButton({ children, onClick, disabled }: { children: React.ReactNode; onClick: () => void; disabled?: boolean }) {
  if (disabled) return null;
  return (
    <button type="button" className={cx(btn.quiet, "mt-3 self-start")} onClick={onClick}>
      <Icon name="plus" className="size-4" /> {children}
    </button>
  );
}

const move = <T,>(list: T[], i: number, dir: -1 | 1) => {
  const j = i + dir;
  if (j < 0 || j >= list.length) return;
  [list[i], list[j]] = [list[j], list[i]];
};

export function InteractiveEdit({ block: b, update }: { block: Block; update: Update }) {
  switch (b.type) {
    case "flashcards":
      return <FlashcardsEdit block={b} update={update} />;
    case "tabs":
      return <TabsEdit block={b} update={update} />;
    case "timeline":
      return <TimelineEdit block={b} update={update} />;
    case "process":
      return <ProcessEdit block={b} update={update} />;
    case "branching":
      return <BranchingEdit block={b} update={update} />;
    case "conversation":
      return <ConversationEdit block={b} update={update} />;
    case "spot":
      return <SpotEdit block={b} update={update} />;
    case "confidence":
      return <ConfidenceEdit block={b} update={update} />;
    case "reflection":
      return <ReflectionEdit block={b} update={update} />;
    case "budget":
      return <BudgetEdit block={b} update={update} />;
    case "signal":
      return <SignalEdit block={b} update={update} />;
    case "mission":
      return <MissionEdit block={b} update={update} />;
    case "balance":
      return <BalanceEdit block={b} update={update} />;
    case "wall":
      return <WallEdit block={b} update={update} />;
    case "poll":
      return <PollEdit block={b} update={update} />;
    case "hotspots":
      return <HotspotsEdit block={b} update={update} />;
    case "sorting":
      return <SortingEdit block={b} update={update} />;
    case "sequencing":
      return <SequencingEdit block={b} update={update} />;
    case "matching":
      return <MatchingEdit block={b} update={update} />;
    case "fillblank":
      return <FillBlankEdit block={b} update={update} />;
    case "journal":
      return <JournalEdit block={b} update={update} />;
    case "perspectives":
      return <PerspectivesEdit block={b} update={update} />;
    case "pulse":
      return <PulseEdit block={b} update={update} />;
    case "action":
      return <ActionEdit block={b} update={update} />;
    default:
      return null;
  }
}

// ---------------------------------------------------------------------------------------------------

function FlashcardsEdit({ block: b, update }: { block: Of<"flashcards">; update: Update }) {
  return (
    <div className="flex w-full flex-col">
      <Kicker icon="flashcards">Flashcards · {b.cards.length}</Kicker>
      <p className="mb-3 text-sm text-ink-muted">Each card shows its front; readers flip it to see the back.</p>
      <ul className="grid gap-4 sm:grid-cols-2">
        {b.cards.map((c, i) => (
          <li key={c.id} className="flex flex-col gap-3 rounded-2xl border border-line-strong bg-surface p-4 shadow-sm">
            <div className="flex items-center justify-between gap-2">
              <span className="text-xs font-bold uppercase tracking-wide text-ink-muted">Card {i + 1}</span>
              <RowTools
                what="card"
                index={i}
                count={b.cards.length}
                onMove={(d) => update<typeof b>(b.id, (x) => move(x.cards, i, d))}
                onRemove={() => update<typeof b>(b.id, (x) => void x.cards.splice(i, 1))}
              />
            </div>
            {c.media ? (
              <div className="flex flex-col gap-1.5">
                <MediaSlot
                  media={c.media}
                  aspect="aspect-[16/9]"
                  onPick={(src) => update<typeof b>(b.id, (x) => void (x.cards[i].media = src ? { src, alt: "" } : undefined))}
                />
                <input
                  className={cx(input, "min-h-9 text-sm", c.media.src && !c.media.alt && !c.media.decorative && "border-danger")}
                  placeholder="Describe the picture"
                  aria-label={`Card ${i + 1} picture description`}
                  value={c.media.alt}
                  disabled={c.media.decorative}
                  onChange={(e) => update<typeof b>(b.id, (x) => void (x.cards[i].media!.alt = e.target.value), `${b.id}:${c.id}:alt`)}
                />
                <label className="flex items-center gap-1.5 text-xs">
                  <input
                    type="checkbox"
                    className="size-4 accent-[var(--color-action)]"
                    checked={Boolean(c.media.decorative)}
                    onChange={(e) => update<typeof b>(b.id, (x) => void (x.cards[i].media!.decorative = e.target.checked || undefined))}
                  />
                  Decorative: it adds nothing the words don’t say
                </label>
                <button
                  type="button"
                  className="self-start text-xs font-semibold text-accent hover:underline"
                  onClick={() => update<typeof b>(b.id, (x) => void delete x.cards[i].media)}
                >
                  Remove picture
                </button>
              </div>
            ) : (
              <button
                type="button"
                className="inline-flex items-center gap-1 self-start text-xs font-semibold text-accent hover:underline"
                onClick={() => update<typeof b>(b.id, (x) => void (x.cards[i].media = { src: "", alt: "" }))}
              >
                <Icon name="image" className="size-3.5" /> Add a picture
              </button>
            )}
            <InlineText
              value={c.front}
              onChange={(v) => update<typeof b>(b.id, (x) => void (x.cards[i].front = v), `${b.id}:${c.id}:front`)}
              placeholder="Front: a term, question or situation"
              className="font-serif text-xl font-semibold leading-snug"
            />
            <div className="rounded-xl border-2 border-dashed border-action/60 bg-tealtint p-3">
              <p className="text-xs font-bold uppercase tracking-wide text-accent">Back</p>
              <RichEditable
                value={c.back}
                onChange={(v) => update<typeof b>(b.id, (x) => void (x.cards[i].back = v), `${b.id}:${c.id}:back`)}
                placeholder="What the reader learns when they flip it"
              />
            </div>
          </li>
        ))}
      </ul>
      <AddButton disabled={b.cards.length >= 30} onClick={() => update<typeof b>(b.id, (x) => void x.cards.push({ id: rid("card"), front: "", back: "" }))}>
        Add card
      </AddButton>
    </div>
  );
}

function TabsEdit({ block: b, update }: { block: Of<"tabs">; update: Update }) {
  const [at, setAt] = useState(0);
  const i = Math.min(at, b.tabs.length - 1);
  const tab = b.tabs[i];
  return (
    <div className={column}>
      <div className="flex flex-wrap items-end gap-1 border-b border-line">
        {b.tabs.map((t, n) => (
          <button
            key={t.id}
            type="button"
            onClick={() => setAt(n)}
            className={cx(
              "-mb-px min-h-11 rounded-t-xl border-b-[3px] px-4 font-semibold",
              n === i ? "border-action bg-tealtint" : "border-transparent text-ink-muted hover:bg-muted",
            )}
          >
            {t.label || `Tab ${n + 1}`}
          </button>
        ))}
        {b.tabs.length < 8 && (
          <button
            type="button"
            className="mb-1 ml-1 inline-flex min-h-9 items-center gap-1 rounded-full px-3 text-sm font-semibold text-accent hover:bg-muted"
            onClick={() => {
              update<typeof b>(b.id, (x) => void x.tabs.push({ id: rid("tab"), label: "", body: "" }));
              setAt(b.tabs.length);
            }}
          >
            <Icon name="plus" className="size-4" /> Tab
          </button>
        )}
      </div>
      {tab && (
        <div key={tab.id} className="rounded-b-2xl border border-t-0 border-line bg-surface p-5">
          <div className="flex items-center gap-2">
            <InlineText
              value={tab.label}
              onChange={(v) => update<typeof b>(b.id, (x) => void (x.tabs[i].label = v), `${b.id}:${tab.id}:label`)}
              placeholder="Tab name"
              className="min-w-0 flex-1 font-semibold"
            />
            <RowTools
              what="tab"
              index={i}
              count={b.tabs.length}
              min={2}
              onMove={(d) => {
                update<typeof b>(b.id, (x) => move(x.tabs, i, d));
                setAt(i + d);
              }}
              onRemove={() => {
                update<typeof b>(b.id, (x) => void x.tabs.splice(i, 1));
                setAt(Math.max(0, i - 1));
              }}
            />
          </div>
          <RichEditable
            value={tab.body}
            onChange={(v) => update<typeof b>(b.id, (x) => void (x.tabs[i].body = v), `${b.id}:${tab.id}:body`)}
            placeholder="What this tab says"
            className="mt-3 text-[1.05rem] leading-relaxed"
          />
        </div>
      )}
    </div>
  );
}

function TimelineEdit({ block: b, update }: { block: Of<"timeline">; update: Update }) {
  return (
    <div className={cx(column, "flex flex-col")}>
      <ol className="relative flex flex-col gap-6 border-l-2 border-action/40 pl-6">
        {b.events.map((e, i) => (
          <li key={e.id} className="relative">
            <span className="absolute -left-[2.05rem] top-1 grid size-5 place-items-center rounded-full border-2 border-action bg-surface" aria-hidden>
              <span className="size-2 rounded-full bg-action" />
            </span>
            <div className="flex items-start gap-2">
              <InlineText
                value={e.when}
                onChange={(v) => update<typeof b>(b.id, (x) => void (x.events[i].when = v), `${b.id}:${e.id}:when`)}
                placeholder="When (Day 1, Week 2, After the call…)"
                className="min-w-0 flex-1 font-mulish text-xs font-extrabold uppercase tracking-[0.12em] text-accent"
              />
              <RowTools
                what="event"
                index={i}
                count={b.events.length}
                min={2}
                onMove={(d) => update<typeof b>(b.id, (x) => move(x.events, i, d))}
                onRemove={() => update<typeof b>(b.id, (x) => void x.events.splice(i, 1))}
              />
            </div>
            <InlineText
              value={e.title}
              onChange={(v) => update<typeof b>(b.id, (x) => void (x.events[i].title = v), `${b.id}:${e.id}:title`)}
              placeholder="What happens"
              className="mt-0.5 font-serif text-xl font-semibold leading-snug"
            />
            <RichEditable
              value={e.body}
              onChange={(v) => update<typeof b>(b.id, (x) => void (x.events[i].body = v), `${b.id}:${e.id}:body`)}
              placeholder="More detail (optional)"
              className="mt-1 leading-relaxed"
            />
          </li>
        ))}
      </ol>
      <AddButton
        disabled={b.events.length >= 20}
        onClick={() => update<typeof b>(b.id, (x) => void x.events.push({ id: rid("event"), when: "", title: "", body: "" }))}
      >
        Add event
      </AddButton>
    </div>
  );
}

function ProcessEdit({ block: b, update }: { block: Of<"process">; update: Update }) {
  return (
    <div className={cx(column, card, "flex flex-col")}>
      <Kicker icon="steps">Process · {b.steps.length} steps</Kicker>
      <p className="text-sm text-ink-muted">Readers go through these one at a time, or open them all.</p>
      <ol className="mt-4 flex flex-col gap-4">
        {b.steps.map((st, i) => (
          <li key={st.id} className="flex gap-3">
            <span className="grid size-8 shrink-0 place-items-center rounded-full bg-action font-mulish text-sm font-extrabold text-on-action">{i + 1}</span>
            <div className="min-w-0 flex-1">
              <div className="flex items-start gap-2">
                <InlineText
                  value={st.title}
                  onChange={(v) => update<typeof b>(b.id, (x) => void (x.steps[i].title = v), `${b.id}:${st.id}:title`)}
                  placeholder={`Step ${i + 1}`}
                  className="min-w-0 flex-1 font-semibold"
                />
                <RowTools
                  what="step"
                  index={i}
                  count={b.steps.length}
                  min={2}
                  onMove={(d) => update<typeof b>(b.id, (x) => move(x.steps, i, d))}
                  onRemove={() => update<typeof b>(b.id, (x) => void x.steps.splice(i, 1))}
                />
              </div>
              <RichEditable
                value={st.body}
                onChange={(v) => update<typeof b>(b.id, (x) => void (x.steps[i].body = v), `${b.id}:${st.id}:body`)}
                placeholder="What to do, and why (optional)"
                className="mt-1 text-ink-muted"
              />
            </div>
          </li>
        ))}
      </ol>
      <AddButton disabled={b.steps.length >= 20} onClick={() => update<typeof b>(b.id, (x) => void x.steps.push({ id: rid("step"), title: "", body: "" }))}>
        Add step
      </AddButton>
    </div>
  );
}

// ---------------------------------------------------------------------------------------------------

function BranchingEdit({ block: b, update }: { block: Of<"branching">; update: Update }) {
  const label = (id: string) => {
    const n = b.scenes.findIndex((s) => s.id === id);
    const sc = b.scenes[n];
    if (!sc) return "";
    const words = sc.text
      .replace(/<[^>]+>/g, " ")
      .trim()
      .split(/\s+/)
      .slice(0, 6)
      .join(" ");
    return `Scene ${n + 1}${sc.ending ? " (ending)" : ""}${words ? `: ${words}…` : ""}`;
  };
  return (
    <div className={cx(column, card, "flex flex-col")}>
      <Kicker icon="branch">Branching scenario</Kicker>
      <InlineText
        value={b.title}
        onChange={(v) => update<typeof b>(b.id, (x) => void (x.title = v), `${b.id}:title`)}
        placeholder="Scenario title (optional)"
        className="font-serif text-2xl font-semibold"
      />
      <p className="mt-1 text-sm text-ink-muted">Readers start at scene 1. Each choice leads to another scene; an ending closes the story with how it went.</p>
      <ol className="mt-4 flex flex-col gap-4">
        {b.scenes.map((sc, i) => (
          <li
            key={sc.id}
            id={`scene-${sc.id}`}
            className={cx("rounded-2xl border p-4", sc.ending ? OUTCOME_TONE[sc.ending.outcome] + " border-l-4" : "border-line")}
          >
            <div className="flex flex-wrap items-center justify-between gap-2">
              <span className="text-xs font-bold uppercase tracking-wide text-ink-muted">
                Scene {i + 1}
                {i === 0 && " · the start"}
              </span>
              <span className="flex items-center gap-2">
                <label className="flex items-center gap-1.5 text-sm">
                  <input
                    type="checkbox"
                    className="size-4 accent-[var(--color-action)]"
                    checked={Boolean(sc.ending)}
                    disabled={i === 0}
                    onChange={(e) =>
                      update<typeof b>(b.id, (x) => {
                        const s = x.scenes[i];
                        if (e.target.checked) {
                          s.ending = { outcome: "good", summary: "" };
                          s.choices = [];
                        } else {
                          delete s.ending;
                          s.choices = [{ id: rid("choice"), text: "", next: "" }];
                        }
                      })
                    }
                  />
                  An ending
                </label>
                <RowTools
                  what="scene"
                  index={i}
                  count={b.scenes.length}
                  onMove={(d) => update<typeof b>(b.id, (x) => move(x.scenes, i, d))}
                  onRemove={() =>
                    update<typeof b>(b.id, (x) => {
                      x.scenes.splice(i, 1);
                      // Choices that led here now lead nowhere, for the author to point elsewhere.
                      for (const s of x.scenes) for (const c of s.choices) if (c.next === sc.id) c.next = "";
                    })
                  }
                />
              </span>
            </div>
            <RichEditable
              value={sc.text}
              onChange={(v) => update<typeof b>(b.id, (x) => void (x.scenes[i].text = v), `${b.id}:${sc.id}:text`)}
              placeholder="What happens in this scene"
              className="mt-2 leading-relaxed"
            />
            {sc.ending ? (
              <div className="mt-3 flex flex-col gap-2">
                <label className="flex items-center gap-2 text-sm font-semibold">
                  How it went
                  <select
                    className="min-h-9 rounded-lg border border-line-strong bg-surface px-2 text-sm font-normal"
                    value={sc.ending.outcome}
                    onChange={(e) => update<typeof b>(b.id, (x) => void (x.scenes[i].ending!.outcome = e.target.value as BranchOutcome))}
                  >
                    {(Object.keys(OUTCOMES) as BranchOutcome[]).map((o) => (
                      <option key={o} value={o}>
                        {OUTCOMES[o]}
                      </option>
                    ))}
                  </select>
                </label>
                <RichEditable
                  value={sc.ending.summary}
                  onChange={(v) => update<typeof b>(b.id, (x) => void (x.scenes[i].ending!.summary = v), `${b.id}:${sc.id}:summary`)}
                  placeholder="What this ending teaches: what went well or what to do differently"
                />
              </div>
            ) : (
              <ul className="mt-3 flex flex-col gap-2">
                {sc.choices.map((c, j) => (
                  <li key={c.id} className="flex flex-col gap-2 rounded-xl bg-muted/60 p-3 sm:flex-row sm:items-start">
                    <InlineText
                      value={c.text}
                      onChange={(v) => update<typeof b>(b.id, (x) => void (x.scenes[i].choices[j].text = v), `${b.id}:${c.id}:text`)}
                      placeholder={`Choice ${j + 1}`}
                      className="min-w-0 flex-1"
                    />
                    <select
                      aria-label={`Where choice ${j + 1} leads`}
                      className={cx(
                        "min-h-9 max-w-full rounded-lg border bg-surface px-2 text-sm sm:max-w-56",
                        c.next ? "border-line-strong" : "border-danger",
                      )}
                      value={c.next}
                      onChange={(e) =>
                        update<typeof b>(b.id, (x) => {
                          if (e.target.value === "new") {
                            const id = rid("scene");
                            x.scenes.push({ id, text: "", choices: [{ id: rid("choice"), text: "", next: "" }] });
                            x.scenes[i].choices[j].next = id;
                          } else x.scenes[i].choices[j].next = e.target.value;
                        })
                      }
                    >
                      <option value="">Leads to…</option>
                      {b.scenes
                        .filter((s) => s.id !== sc.id)
                        .map((s) => (
                          <option key={s.id} value={s.id}>
                            {label(s.id)}
                          </option>
                        ))}
                      <option value="new">A new scene</option>
                    </select>
                    <button
                      type="button"
                      aria-label={`Remove choice ${j + 1}`}
                      disabled={sc.choices.length <= 1}
                      onClick={() => update<typeof b>(b.id, (x) => void x.scenes[i].choices.splice(j, 1))}
                      className="grid size-8 shrink-0 place-items-center rounded-full text-ink-muted hover:bg-muted disabled:opacity-30"
                    >
                      <Icon name="close" className="size-4" />
                    </button>
                  </li>
                ))}
                {sc.choices.length < 4 && (
                  <li>
                    <button
                      type="button"
                      className={btn.quiet}
                      onClick={() => update<typeof b>(b.id, (x) => void x.scenes[i].choices.push({ id: rid("choice"), text: "", next: "" }))}
                    >
                      <Icon name="plus" className="size-4" /> Add choice
                    </button>
                  </li>
                )}
              </ul>
            )}
          </li>
        ))}
      </ol>
      <div className="flex flex-wrap gap-2">
        <AddButton
          disabled={b.scenes.length >= 30}
          onClick={() =>
            update<typeof b>(b.id, (x) => void x.scenes.push({ id: rid("scene"), text: "", choices: [{ id: rid("choice"), text: "", next: "" }] }))
          }
        >
          Add scene
        </AddButton>
        <AddButton
          disabled={b.scenes.length >= 30}
          onClick={() =>
            update<typeof b>(b.id, (x) => void x.scenes.push({ id: rid("scene"), text: "", choices: [], ending: { outcome: "good", summary: "" } }))
          }
        >
          Add ending
        </AddButton>
      </div>
    </div>
  );
}

function ConversationEdit({ block: b, update }: { block: Of<"conversation">; update: Update }) {
  return (
    <div className={cx(column, card, "flex flex-col")}>
      <PhotoField block={b} update={update} context={[b.person, b.role, b.setting].filter(Boolean).join(", ")} />
      <Kicker icon="chat">Conversation practice</Kicker>
      <div className="flow-root">
        <CircleShown media={b.media} />
        <div className="flex flex-wrap items-baseline gap-x-2">
          <InlineText
            value={b.person}
            onChange={(v) => update<typeof b>(b.id, (x) => void (x.person = v), `${b.id}:person`)}
            placeholder="Their name"
            className="font-serif text-2xl font-semibold"
          />
          <InlineText
            value={b.role}
            onChange={(v) => update<typeof b>(b.id, (x) => void (x.role = v), `${b.id}:role`)}
            placeholder="Who they are (a client’s daughter…)"
            className="text-ink-muted"
          />
        </div>
        <InlineText
          value={b.setting}
          onChange={(v) => update<typeof b>(b.id, (x) => void (x.setting = v), `${b.id}:setting`)}
          placeholder="The situation, in a sentence or two"
          multiline
          className="mt-1 text-ink-muted"
        />
      </div>
      <ol className="mt-5 flex flex-col gap-5">
        {b.turns.map((t, i) => (
          <li key={t.id} className="flex flex-col gap-3 rounded-2xl border border-line p-4">
            <div className="flex items-center justify-between gap-2">
              <span className="text-xs font-bold uppercase tracking-wide text-ink-muted">Turn {i + 1}</span>
              <RowTools
                what="turn"
                index={i}
                count={b.turns.length}
                onMove={(d) => update<typeof b>(b.id, (x) => move(x.turns, i, d))}
                onRemove={() => update<typeof b>(b.id, (x) => void x.turns.splice(i, 1))}
              />
            </div>
            <div className="max-w-[85%] self-start rounded-2xl rounded-bl-sm bg-muted px-4 py-2.5">
              <span className="block text-xs font-bold text-ink-muted">{b.person || "They"} say</span>
              <InlineText
                value={t.line}
                onChange={(v) => update<typeof b>(b.id, (x) => void (x.turns[i].line = v), `${b.id}:${t.id}:line`)}
                placeholder="What they say"
                multiline
              />
            </div>
            <p className="text-sm font-semibold">What the learner could say</p>
            {t.responses.map((r, j) => (
              <div key={r.id} className="flex flex-col gap-2 rounded-xl border border-line-strong p-3">
                <div className="flex items-start gap-2">
                  <InlineText
                    value={r.text}
                    onChange={(v) => update<typeof b>(b.id, (x) => void (x.turns[i].responses[j].text = v), `${b.id}:${r.id}:text`)}
                    placeholder={`Response ${j + 1}`}
                    className="min-w-0 flex-1"
                  />
                  <select
                    aria-label={`How good is response ${j + 1}`}
                    className="min-h-9 rounded-lg border border-line-strong bg-surface px-2 text-sm"
                    value={r.verdict}
                    onChange={(e) => update<typeof b>(b.id, (x) => void (x.turns[i].responses[j].verdict = e.target.value as Verdict))}
                  >
                    {(Object.keys(VERDICTS) as Verdict[]).map((v) => (
                      <option key={v} value={v}>
                        {VERDICTS[v]}
                      </option>
                    ))}
                  </select>
                  <button
                    type="button"
                    aria-label={`Remove response ${j + 1}`}
                    disabled={t.responses.length <= 2}
                    onClick={() => update<typeof b>(b.id, (x) => void x.turns[i].responses.splice(j, 1))}
                    className="grid size-8 shrink-0 place-items-center rounded-full text-ink-muted hover:bg-muted disabled:opacity-30"
                  >
                    <Icon name="close" className="size-4" />
                  </button>
                </div>
                <div className={cx("rounded-lg border-l-4 p-2.5", VERDICT_TONE[r.verdict])}>
                  <p className="text-xs font-bold uppercase tracking-wide">Coaching</p>
                  <InlineText
                    value={r.feedback}
                    onChange={(v) => update<typeof b>(b.id, (x) => void (x.turns[i].responses[j].feedback = v), `${b.id}:${r.id}:feedback`)}
                    placeholder="Why this lands well, or doesn’t"
                    multiline
                  />
                </div>
                <div className="rounded-lg bg-muted/60 p-2.5">
                  <p className="text-xs font-bold uppercase tracking-wide text-ink-muted">{b.person || "They"} reply (optional)</p>
                  <InlineText
                    value={r.reply}
                    onChange={(v) => update<typeof b>(b.id, (x) => void (x.turns[i].responses[j].reply = v), `${b.id}:${r.id}:reply`)}
                    placeholder="How they react to this"
                    multiline
                  />
                </div>
              </div>
            ))}
            {t.responses.length < 4 && (
              <button
                type="button"
                className={cx(btn.quiet, "self-start")}
                onClick={() =>
                  update<typeof b>(b.id, (x) => void x.turns[i].responses.push({ id: rid("resp"), text: "", verdict: "risky", feedback: "", reply: "" }))
                }
              >
                <Icon name="plus" className="size-4" /> Add response
              </button>
            )}
          </li>
        ))}
      </ol>
      <AddButton
        disabled={b.turns.length >= 12}
        onClick={() =>
          update<typeof b>(
            b.id,
            (x) =>
              void x.turns.push({
                id: rid("turn"),
                line: "",
                responses: [
                  { id: rid("resp"), text: "", verdict: "best", feedback: "", reply: "" },
                  { id: rid("resp"), text: "", verdict: "risky", feedback: "", reply: "" },
                ],
              }),
          )
        }
      >
        Add turn
      </AddButton>
    </div>
  );
}

// ---------------------------------------------------------------------------------------------------

function SpotEdit({ block: b, update }: { block: Of<"spot">; update: Update }) {
  // The mistake whose marker the next click on the picture moves; with none, a click adds one.
  const [placing, setPlacing] = useState<string | null>(null);
  const click = (e: React.MouseEvent<HTMLButtonElement>) => {
    const r = e.currentTarget.getBoundingClientRect();
    const x = Math.round(((e.clientX - r.left) / r.width) * 1000) / 10;
    const y = Math.round(((e.clientY - r.top) / r.height) * 1000) / 10;
    if (placing) {
      update<typeof b>(b.id, (v) => {
        const m = v.mistakes.find((n) => n.id === placing);
        if (m) Object.assign(m, { x, y });
      });
      setPlacing(null);
    } else if (b.mistakes.length < 15) update<typeof b>(b.id, (v) => void v.mistakes.push({ id: rid("mistake"), x, y, label: "", explanation: "" }));
  };
  return (
    <div className="flex w-full flex-col">
      <div className={column}>
        <Kicker icon="search">Spot the mistake</Kicker>
        <InlineText
          value={b.prompt}
          onChange={(v) => update<typeof b>(b.id, (x) => void (x.prompt = v), `${b.id}:prompt`)}
          placeholder="What to look for (Find the five errors in this invoice)"
          className="font-serif text-xl font-semibold"
        />
      </div>
      <div className="relative mt-4">
        {b.media.src ? (
          <>
            <button
              type="button"
              onClick={click}
              className="block w-full cursor-crosshair overflow-hidden rounded-2xl ring-action focus-visible:ring-2"
              aria-label={placing ? "Click where this mistake is" : "Click a mistake on the picture to mark it"}
            >
              {/* eslint-disable-next-line @next/next/no-img-element */}
              <img src={b.media.src} alt={b.media.alt} className="w-full bg-muted" />
            </button>
            {b.mistakes.map((m, i) => (
              <span
                key={m.id}
                className={cx(
                  "pointer-events-none absolute grid size-8 -translate-x-1/2 -translate-y-1/2 place-items-center rounded-full border-2 border-white font-mulish text-sm font-extrabold text-white shadow-lg",
                  placing === m.id ? "animate-pulse bg-action" : "bg-[#c7393e]",
                )}
                style={{ left: `${m.x}%`, top: `${m.y}%` }}
                aria-hidden
              >
                {i + 1}
              </span>
            ))}
            <p className="mt-2 text-center text-sm text-ink-muted">
              {placing ? "Click the picture where this mistake is." : "Click the picture on each mistake to mark it. Readers find them the same way."}
            </p>
            {!b.media.alt && (
              <p className="mt-1 text-center text-sm font-semibold text-danger">Describe the picture in the panel, for readers who can’t see it.</p>
            )}
          </>
        ) : (
          <MediaSlot media={b.media} onPick={(src) => update<typeof b>(b.id, (x) => void (x.media.src = src ?? ""))} />
        )}
      </div>
      <ol className={cx(column, "mt-4 flex flex-col gap-2")}>
        {b.mistakes.map((m, i) => (
          <li key={m.id} className="flex flex-col gap-1.5 rounded-2xl border border-line p-3">
            <div className="flex items-start gap-2">
              <span className="grid size-7 shrink-0 place-items-center rounded-full bg-[#c7393e] font-mulish text-xs font-extrabold text-white">{i + 1}</span>
              <InlineText
                value={m.label}
                onChange={(v) => update<typeof b>(b.id, (x) => void (x.mistakes[i].label = v), `${b.id}:${m.id}:label`)}
                placeholder="The mistake (Wrong GST amount)"
                className="min-w-0 flex-1 font-semibold"
              />
              <button
                type="button"
                className={cx(btn.quiet, "min-h-8 px-2 text-xs")}
                onClick={() => setPlacing(placing === m.id ? null : m.id)}
                disabled={!b.media.src}
              >
                {placing === m.id ? "Cancel" : "Move"}
              </button>
              <button
                type="button"
                aria-label={`Remove mistake ${i + 1}`}
                onClick={() => update<typeof b>(b.id, (x) => void x.mistakes.splice(i, 1))}
                className="grid size-8 shrink-0 place-items-center rounded-full text-ink-muted hover:bg-muted"
              >
                <Icon name="close" className="size-4" />
              </button>
            </div>
            <InlineText
              value={m.explanation}
              onChange={(v) => update<typeof b>(b.id, (x) => void (x.mistakes[i].explanation = v), `${b.id}:${m.id}:explanation`)}
              placeholder="Why it’s wrong, and what it should be"
              multiline
              className="ml-9 text-sm"
            />
          </li>
        ))}
      </ol>
    </div>
  );
}

function ConfidenceEdit({ block: b, update }: { block: Of<"confidence">; update: Update }) {
  return (
    <div className={cx(column, card)}>
      <Kicker icon="gauge">Confidence check</Kicker>
      <InlineText
        value={b.statement}
        onChange={(v) => update<typeof b>(b.id, (x) => void (x.statement = v), `${b.id}:statement`)}
        placeholder="How confident are you handling an incident report?"
        className="font-serif text-xl font-semibold"
      />
      <div className="mt-4 grid grid-cols-5 gap-2" aria-hidden>
        {CONFIDENCE_FACES.map((face) => (
          <span
            key={face}
            className="flex min-h-16 items-center justify-center rounded-2xl border-2 border-line-strong bg-surface text-3xl leading-none sm:text-4xl"
          >
            {face}
          </span>
        ))}
      </div>
      <div className="mt-2 flex justify-between gap-4 text-sm text-ink-muted">
        <span className="flex gap-1">
          {CONFIDENCE_FACES[0]}{" "}
          <InlineText value={b.low} onChange={(v) => update<typeof b>(b.id, (x) => void (x.low = v), `${b.id}:low`)} placeholder="Not confident" />
        </span>
        <span className="flex gap-1">
          {CONFIDENCE_FACES[4]}{" "}
          <InlineText value={b.high} onChange={(v) => update<typeof b>(b.id, (x) => void (x.high = v), `${b.id}:high`)} placeholder="Very confident" />
        </span>
      </div>
      <p className="mt-3 text-sm text-ink-muted">
        {b.compareWith
          ? "Readers see how their rating changed since the earlier check."
          : "To show the change, add a second check later and compare it with this one in the panel."}
      </p>
    </div>
  );
}

function ReflectionEdit({ block: b, update }: { block: Of<"reflection">; update: Update }) {
  return (
    <div className={cx(column, card)}>
      <PhotoField block={b} update={update} context={b.prompt} />
      <Kicker icon="pen">Reflection</Kicker>
      <div className="flow-root">
        <CircleShown media={b.media} />
        <InlineText
          value={b.prompt}
          onChange={(v) => update<typeof b>(b.id, (x) => void (x.prompt = v), `${b.id}:prompt`)}
          placeholder="The question (How would you handle…?)"
          multiline
          className="font-serif text-xl font-semibold"
        />
      </div>
      <div className="mt-3 min-h-24 rounded-2xl border border-dashed border-line-strong p-3 text-ink-muted" aria-hidden>
        The reader writes their answer here, then asks Claude for feedback.
      </div>
      <div className="mt-4 rounded-2xl bg-tealtint p-4">
        <p className="flex items-center gap-2 text-sm font-bold">
          <Icon name="spark" className="size-4" /> What a good answer covers
        </p>
        <p className="text-xs text-ink-muted">For Claude’s feedback only. Readers don’t see this.</p>
        <InlineText
          value={b.guidance}
          onChange={(v) => update<typeof b>(b.id, (x) => void (x.guidance = v), `${b.id}:guidance`)}
          placeholder="The points you’d look for: respecting the client’s choice, talking through the risks, recording the conversation…"
          multiline
          className="mt-2"
        />
      </div>
    </div>
  );
}

function PollEdit({ block: b, update }: { block: Of<"poll">; update: Update }) {
  return (
    <div className={cx(column, card, "flex flex-col")}>
      <PhotoField block={b} update={update} context={b.question} />
      <Kicker icon="sliders">Poll</Kicker>
      <div className="flow-root">
        <CircleShown media={b.media} />
        <InlineText
          value={b.question}
          onChange={(v) => update<typeof b>(b.id, (x) => void (x.question = v), `${b.id}:question`)}
          placeholder="The question (How often do you review a client’s budget?)"
          className="font-serif text-xl font-semibold"
        />
      </div>
      <ul className="mt-4 flex flex-col gap-2">
        {b.options.map((op, i) => (
          <li key={op.id} className="flex items-center gap-2 rounded-2xl border border-line-strong p-3">
            <span className="size-5 shrink-0 rounded-full border-2 border-line-strong" aria-hidden />
            <InlineText
              value={op.text}
              onChange={(v) => update<typeof b>(b.id, (x) => void (x.options[i].text = v), `${b.id}:${op.id}`)}
              placeholder={`Option ${i + 1}`}
              className="min-w-0 flex-1"
            />
            <RowTools
              what="option"
              index={i}
              count={b.options.length}
              min={2}
              onMove={(d) => update<typeof b>(b.id, (x) => move(x.options, i, d))}
              onRemove={() => update<typeof b>(b.id, (x) => void x.options.splice(i, 1))}
            />
          </li>
        ))}
      </ul>
      <AddButton disabled={b.options.length >= 6} onClick={() => update<typeof b>(b.id, (x) => void x.options.push({ id: rid("opt"), text: "" }))}>
        Add option
      </AddButton>
    </div>
  );
}

function WallEdit({ block: b, update }: { block: Of<"wall">; update: Update }) {
  return (
    <div className={cx(column, card)}>
      <PhotoField block={b} update={update} context={b.prompt} />
      <Kicker icon="people">Insight wall</Kicker>
      <div className="flow-root">
        <CircleShown media={b.media} />
        <InlineText
          value={b.prompt}
          onChange={(v) => update<typeof b>(b.id, (x) => void (x.prompt = v), `${b.id}:prompt`)}
          placeholder="The question everyone answers (What’s one thing that helps a worried family member feel heard?)"
          multiline
          className="font-serif text-xl font-semibold"
        />
      </div>
      <div className="mt-3 rounded-2xl border border-dashed border-line-strong p-3">
        <InlineText
          value={b.placeholder ?? ""}
          onChange={(v) => update<typeof b>(b.id, (x) => void (x.placeholder = v || undefined), `${b.id}:placeholder`)}
          placeholder="Hint in the answer box (optional): Share what works for you…"
          className="text-ink-muted"
        />
      </div>
      <div className="mt-3 flex flex-col gap-2 opacity-70" aria-hidden>
        {[0, 1].map((i) => (
          <div key={i} className="rounded-2xl bg-muted p-3 text-sm text-ink-muted">
            A colleague’s answer shows here once the reader has posted theirs.
          </div>
        ))}
      </div>
    </div>
  );
}

function BudgetEdit({ block: b, update }: { block: Of<"budget">; update: Update }) {
  const num = (v: string) => Math.max(0, Number(v) || 0);
  const planned = b.services.reduce((n, s) => n + s.cost * s.perWeek * b.weeks, 0);
  return (
    <div className={cx(column, card, "flex flex-col")}>
      <Kicker icon="money">Budget simulator</Kicker>
      <InlineText
        value={b.title}
        onChange={(v) => update<typeof b>(b.id, (x) => void (x.title = v), `${b.id}:title`)}
        placeholder="Whose budget (Margaret’s quarterly budget)"
        className="font-serif text-2xl font-semibold"
      />
      <div className="mt-3 grid gap-3 sm:grid-cols-2">
        <Field label="Budget for the period ($)">
          <input
            type="number"
            min={1}
            step={50}
            className={input}
            value={b.budget}
            onChange={(e) => update<typeof b>(b.id, (x) => void (x.budget = num(e.target.value)), `${b.id}:budget`)}
          />
        </Field>
        <Field label="Weeks it covers" hint="13 weeks is a quarter.">
          <input
            type="number"
            min={1}
            max={52}
            className={input}
            value={b.weeks}
            onChange={(e) => update<typeof b>(b.id, (x) => void (x.weeks = Math.min(52, Math.max(1, Math.round(num(e.target.value))))), `${b.id}:weeks`)}
          />
        </Field>
      </div>
      <p className="mt-2 text-sm text-ink-muted">
        As set, the plan starts at <strong>${Math.round(planned).toLocaleString("en-AU")}</strong> of ${b.budget.toLocaleString("en-AU")}. Readers change how
        often and what each service costs.
      </p>
      <div className="mt-4 overflow-x-auto">
        <table className="w-full min-w-[34rem] text-sm">
          <thead>
            <tr className="text-left text-ink-muted">
              <th className="pb-2 font-semibold">Service</th>
              <th className="pb-2 font-semibold">Unit</th>
              <th className="pb-2 font-semibold">Cost ($)</th>
              <th className="pb-2 font-semibold">A week</th>
              <th className="pb-2 font-semibold">Most a week</th>
              <th />
            </tr>
          </thead>
          <tbody>
            {b.services.map((s, i) => (
              <tr key={s.id} className="border-t border-line">
                <td className="py-1.5 pr-2">
                  <input
                    className={cx(input, "min-h-9")}
                    aria-label={`Service ${i + 1} name`}
                    placeholder="Personal care"
                    value={s.name}
                    onChange={(e) => update<typeof b>(b.id, (x) => void (x.services[i].name = e.target.value), `${b.id}:${s.id}:name`)}
                  />
                </td>
                <td className="py-1.5 pr-2">
                  <input
                    className={cx(input, "min-h-9 w-24")}
                    aria-label={`Service ${i + 1} unit`}
                    placeholder="hour"
                    value={s.unit}
                    onChange={(e) => update<typeof b>(b.id, (x) => void (x.services[i].unit = e.target.value), `${b.id}:${s.id}:unit`)}
                  />
                </td>
                <td className="py-1.5 pr-2">
                  <input
                    type="number"
                    min={0}
                    step={0.5}
                    className={cx(input, "min-h-9 w-24")}
                    aria-label={`Service ${i + 1} cost`}
                    value={s.cost}
                    onChange={(e) => update<typeof b>(b.id, (x) => void (x.services[i].cost = num(e.target.value)), `${b.id}:${s.id}:cost`)}
                  />
                </td>
                <td className="py-1.5 pr-2">
                  <input
                    type="number"
                    min={0}
                    step={0.5}
                    className={cx(input, "min-h-9 w-20")}
                    aria-label={`Service ${i + 1} times a week`}
                    value={s.perWeek}
                    onChange={(e) =>
                      update<typeof b>(b.id, (x) => void (x.services[i].perWeek = Math.min(x.services[i].max, num(e.target.value))), `${b.id}:${s.id}:perWeek`)
                    }
                  />
                </td>
                <td className="py-1.5 pr-2">
                  <input
                    type="number"
                    min={1}
                    step={1}
                    className={cx(input, "min-h-9 w-20")}
                    aria-label={`Service ${i + 1} most a week`}
                    value={s.max}
                    onChange={(e) =>
                      update<typeof b>(
                        b.id,
                        (x) => {
                          const sv = x.services[i];
                          sv.max = Math.max(1, num(e.target.value));
                          sv.perWeek = Math.min(sv.perWeek, sv.max);
                        },
                        `${b.id}:${s.id}:max`,
                      )
                    }
                  />
                </td>
                <td className="py-1.5">
                  <button
                    type="button"
                    aria-label={`Remove service ${i + 1}`}
                    disabled={b.services.length <= 1}
                    onClick={() => update<typeof b>(b.id, (x) => void x.services.splice(i, 1))}
                    className="grid size-8 place-items-center rounded-full text-ink-muted hover:bg-muted disabled:opacity-30"
                  >
                    <Icon name="close" className="size-4" />
                  </button>
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
      <AddButton
        disabled={b.services.length >= 12}
        onClick={() => update<typeof b>(b.id, (x) => void x.services.push({ id: rid("svc"), name: "", unit: "hour", cost: 0, perWeek: 1, max: 7 }))}
      >
        Add service
      </AddButton>
    </div>
  );
}

// ---------------------------------------------------------------------------------------------------
// The panel beside the page
// ---------------------------------------------------------------------------------------------------

export function InteractiveSettings({ block: b, update, doc }: { block: Block; update: Update; doc: GuideDoc }) {
  switch (b.type) {
    case "flashcards":
      return (
        <p className="text-sm text-ink-muted">
          Readers flip each card to see the back, or turn them all over at once. A picture on a card needs a description.
        </p>
      );
    case "tabs":
      return (
        <p className="text-sm text-ink-muted">
          One tab shows at a time. Use it to compare two to eight things side by side, such as Self Managed and Fully Coordinated.
        </p>
      );
    case "timeline":
      return <p className="text-sm text-ink-muted">Events read top to bottom, in the order you give them.</p>;
    case "process":
      return <p className="text-sm text-ink-muted">Readers step through it with Previous and Next, or open all the steps at once.</p>;
    case "branching": {
      const reachable = new Set<string>();
      const walk = (id: string) => {
        if (reachable.has(id)) return;
        reachable.add(id);
        b.scenes.find((s) => s.id === id)?.choices.forEach((c) => c.next && walk(c.next));
      };
      if (b.scenes[0]) walk(b.scenes[0].id);
      const stranded = b.scenes.map((s, i) => (reachable.has(s.id) ? null : i + 1)).filter(Boolean);
      const endings = b.scenes.filter((s) => s.ending).length;
      return (
        <div className="flex flex-col gap-2 text-sm">
          <p className="text-ink-muted">Readers start at scene 1 and choose their way to an ending. They can go back and try another path.</p>
          <p>
            {b.scenes.length} scenes, {endings} {endings === 1 ? "ending" : "endings"}.
          </p>
          {stranded.length > 0 && <p className="font-semibold text-danger">No choice leads to scene {stranded.join(", ")}, so readers can’t reach it.</p>}
        </div>
      );
    }
    case "conversation":
      // Choices only, or free conversation as well (the scene an AI character works within).
      return <RoleplaySettings block={b} update={update} />;
    case "spot":
      return (
        <>
          <ImageDropZone
            picture={b.media.src ? { src: b.media.src, width: 1600, height: 1000 } : undefined}
            onChange={(p) => update<typeof b>(b.id, (x) => void (x.media.src = p?.src ?? ""))}
            label="Drag the document or picture here"
            addLabel="Add picture"
          />
          <Field
            label="Description for screen readers"
            hint="What the picture is, such as “A supplier invoice for personal care in March”. The mistakes are listed for readers who can’t see it."
          >
            <textarea
              className={cx(input, "min-h-20 py-2")}
              value={b.media.alt}
              onChange={(e) => update<typeof b>(b.id, (x) => void (x.media.alt = e.target.value), `${b.id}:alt`)}
            />
          </Field>
          <p className="text-sm text-ink-muted">A reader’s click counts if it’s close to a marker. They can also show the answers.</p>
        </>
      );
    case "confidence": {
      const earlier = allBlocks(doc).filter((x): x is Of<"confidence"> => x.type === "confidence" && x.id !== b.id);
      return (
        <Field label="Compare with an earlier check" hint="Readers see how their rating changed. Put this one after the check it compares with.">
          <select
            className={input}
            value={b.compareWith ?? ""}
            onChange={(e) => update<typeof b>(b.id, (x) => void (x.compareWith = e.target.value || undefined))}
          >
            <option value="">None: this is the first check</option>
            {earlier.map((c) => (
              <option key={c.id} value={c.id}>
                {c.statement || "An untitled check"}
              </option>
            ))}
          </select>
        </Field>
      );
    }
    case "reflection":
      return (
        <>
          <Field label="Fewest words" hint="So the feedback has something to work with. 0 for no minimum.">
            <input
              type="number"
              min={0}
              max={300}
              step={5}
              className={input}
              value={b.minWords}
              onChange={(e) =>
                update<typeof b>(b.id, (x) => void (x.minWords = Math.min(300, Math.max(0, Math.round(Number(e.target.value) || 0)))), `${b.id}:minWords`)
              }
            />
          </Field>
          <p className="text-sm text-ink-muted">
            Claude reads the answer with your guidance and replies with what went well and what to think about. It’s coaching, not a mark, and only the reader
            sees it.
          </p>
        </>
      );
    case "hotspots":
      return (
        <>
          <ImageDropZone
            picture={b.media.src ? { src: b.media.src, width: 1600, height: 1000 } : undefined}
            onChange={(p) => update<typeof b>(b.id, (x) => void (x.media.src = p?.src ?? ""))}
            label="Drag the picture here"
            addLabel="Add picture"
          />
          <Field
            label="Description for screen readers"
            hint="What the picture is, such as “A care plan with its sections labelled”. Each point’s title and text are read out too."
          >
            <textarea
              className={cx(input, "min-h-20 py-2")}
              value={b.media.alt}
              onChange={(e) => update<typeof b>(b.id, (x) => void (x.media.alt = e.target.value), `${b.id}:alt`)}
            />
          </Field>
          <p className="text-sm text-ink-muted">
            Readers open each numbered point. Use it to explore a screen, a form or a room, not for anything they must get right.
          </p>
        </>
      );
    case "sorting":
      return (
        <p className="text-sm text-ink-muted">
          Readers tap a group for each item, then check. Wrong ones go back to try again, with your reason shown for each. It’s practice: it doesn’t count
          towards completion.
        </p>
      );
    case "sequencing":
      return <p className="text-sm text-ink-muted">Readers move the steps with up and down buttons, then check. They can try again or see the right order.</p>;
    case "matching":
      return <p className="text-sm text-ink-muted">Readers choose a match for each item from a list, then check. Keep it to eight pairs or fewer.</p>;
    case "fillblank":
      return (
        <p className="text-sm text-ink-muted">
          Readers type each answer. Capitals, spacing and a full stop at the end don’t matter; add other accepted answers after a bar.
        </p>
      );
    case "poll":
      return (
        <p className="text-sm text-ink-muted">
          Each reader votes once and can change their vote. Everyone’s answers show as percentages after they vote. Use it for opinions and practice, not to
          test a right answer: that’s what a decision question is for.
        </p>
      );
    case "wall":
      return (
        <>
          <label className="flex items-start gap-2 text-sm">
            <input
              type="checkbox"
              className="mt-0.5 size-4 accent-[var(--color-action)]"
              checked={Boolean(b.anonymous)}
              onChange={(e) => update<typeof b>(b.id, (x) => void (x.anonymous = e.target.checked || undefined))}
            />
            <span>
              <span className="font-semibold">Anonymous</span>
              <span className="block text-ink-muted">Posts show without the person’s name and role.</span>
            </span>
          </label>
          <p className="text-sm text-ink-muted">
            Everyone reading the course answers the same question. Others’ answers open once they’ve posted theirs. Authors and organisation admins can hide a
            post. Answers carry over when you publish a new edition, as long as the block stays.
          </p>
        </>
      );
    case "signal":
      return (
        <p className="text-sm text-ink-muted">
          A training case: nothing a learner does in it contacts anyone. Its answers are a regulatory judgement, so it can’t be published until Clinical and
          Quality approval and the source version are recorded in the block. Use Preview to work it through as a learner.
        </p>
      );
    case "mission":
      return (
        <p className="text-sm text-ink-muted">
          A training case: nothing a learner does in it rosters, starts care, issues a statement or contacts anyone. It can’t be published until Care
          Operations, Supplier Compliance, Finance and Quality sign-off and the source version are recorded in the block. Use Preview to work it through.
        </p>
      );
    case "balance":
      return (
        <p className="text-sm text-ink-muted">
          A training case: nothing a learner does in it changes a real care plan or record. It can’t be published until Clinical, Quality and Care Operations
          sign-off (and WHS, where workers are at risk) and the source version are recorded in the block. Use Preview to work it through.
        </p>
      );
    case "budget":
      return <p className="text-sm text-ink-muted">The figures are for practice. Flag the block Illustrative below so reviewers know they’re made up.</p>;
    case "journal":
    case "perspectives":
    case "pulse":
    case "action":
      return <ReflectSettings block={b} update={update} doc={doc} />;
    default:
      return null;
  }
}

// ---------------------------------------------------------------------------------------------------
// Hotspots, sorting, sequencing, matching and fill in the blank
// ---------------------------------------------------------------------------------------------------

function HotspotsEdit({ block: b, update }: { block: Of<"hotspots">; update: Update }) {
  // The point whose marker the next click on the picture moves; with none, a click adds one.
  const [placing, setPlacing] = useState<string | null>(null);
  const click = (e: React.MouseEvent<HTMLButtonElement>) => {
    const r = e.currentTarget.getBoundingClientRect();
    const x = Math.round(((e.clientX - r.left) / r.width) * 1000) / 10;
    const y = Math.round(((e.clientY - r.top) / r.height) * 1000) / 10;
    if (placing) {
      update<typeof b>(b.id, (v) => {
        const p = v.spots.find((n) => n.id === placing);
        if (p) Object.assign(p, { x, y });
      });
      setPlacing(null);
    } else if (b.spots.length < 12) update<typeof b>(b.id, (v) => void v.spots.push({ id: rid("spot"), x, y, title: "", body: "" }));
  };
  return (
    <div className="flex w-full flex-col">
      <div className={column}>
        <Kicker icon="pin">Hotspots</Kicker>
        <InlineText
          value={b.prompt}
          onChange={(v) => update<typeof b>(b.id, (x) => void (x.prompt = v), `${b.id}:prompt`)}
          placeholder="What to explore (optional): Find out what each part of the care plan is for"
          className="font-serif text-xl font-semibold"
        />
      </div>
      <div className="relative mt-4">
        {b.media.src ? (
          <>
            <button
              type="button"
              onClick={click}
              className="block w-full cursor-crosshair overflow-hidden rounded-2xl"
              aria-label={placing ? "Click where this point goes" : "Click the picture to add a point"}
            >
              {/* eslint-disable-next-line @next/next/no-img-element */}
              <img src={b.media.src} alt={b.media.alt} className="w-full bg-muted" />
            </button>
            {b.spots.map((p, i) => (
              <span
                key={p.id}
                className={cx(
                  "pointer-events-none absolute grid size-9 -translate-x-1/2 -translate-y-1/2 place-items-center rounded-full border-[3px] border-white font-mulish text-sm font-extrabold shadow-lg",
                  placing === p.id ? "animate-pulse bg-ink text-surface" : "bg-action text-on-action",
                )}
                style={{ left: `${p.x}%`, top: `${p.y}%` }}
                aria-hidden
              >
                {i + 1}
              </span>
            ))}
            <p className="mt-2 text-center text-sm text-ink-muted">
              {placing ? "Click the picture where this point goes." : "Click the picture to add a point, then write what it shows."}
            </p>
            {!b.media.alt && (
              <p className="mt-1 text-center text-sm font-semibold text-danger">Describe the picture in the panel, for readers who can’t see it.</p>
            )}
          </>
        ) : (
          <MediaSlot media={b.media} onPick={(src) => update<typeof b>(b.id, (x) => void (x.media.src = src ?? ""))} />
        )}
      </div>
      <ol className={cx(column, "mt-4 flex flex-col gap-2")}>
        {b.spots.map((p, i) => (
          <li key={p.id} className="flex flex-col gap-1.5 rounded-2xl border border-line p-3">
            <div className="flex items-start gap-2">
              <span className="grid size-7 shrink-0 place-items-center rounded-full bg-action font-mulish text-xs font-extrabold text-on-action">{i + 1}</span>
              <InlineText
                value={p.title}
                onChange={(v) => update<typeof b>(b.id, (x) => void (x.spots[i].title = v), `${b.id}:${p.id}:title`)}
                placeholder="What this point is (Goals)"
                className="min-w-0 flex-1 font-semibold"
              />
              <button type="button" className={cx(btn.quiet, "min-h-8 px-2 text-xs")} onClick={() => setPlacing(placing === p.id ? null : p.id)}>
                {placing === p.id ? "Cancel" : "Move"}
              </button>
              <RowTools
                what="point"
                index={i}
                count={b.spots.length}
                onMove={(d) => update<typeof b>(b.id, (x) => move(x.spots, i, d))}
                onRemove={() => update<typeof b>(b.id, (x) => void x.spots.splice(i, 1))}
              />
            </div>
            <RichEditable
              value={p.body}
              onChange={(v) => update<typeof b>(b.id, (x) => void (x.spots[i].body = v), `${b.id}:${p.id}:body`)}
              placeholder="What readers learn when they open it"
              className="ml-9 text-sm"
            />
          </li>
        ))}
      </ol>
    </div>
  );
}

function SortingEdit({ block: b, update }: { block: Of<"sorting">; update: Update }) {
  return (
    <div className={cx(column, card, "flex flex-col")}>
      <Kicker icon="sorting">Sorting</Kicker>
      <InlineText
        value={b.prompt}
        onChange={(v) => update<typeof b>(b.id, (x) => void (x.prompt = v), `${b.id}:prompt`)}
        placeholder="What to do (Sort each service into its Support at Home category)"
        className="font-serif text-xl font-semibold"
      />
      <p className="mt-4 text-sm font-semibold">Groups</p>
      <ul className="mt-1 flex flex-wrap gap-2">
        {b.groups.map((g, i) => (
          <li key={g.id} className="flex items-center gap-1 rounded-full bg-muted py-1 pl-3 pr-1">
            <InlineText
              value={g.label}
              onChange={(v) => update<typeof b>(b.id, (x) => void (x.groups[i].label = v), `${b.id}:${g.id}`)}
              placeholder={`Group ${i + 1}`}
              className="min-w-16 font-semibold"
            />
            <button
              type="button"
              aria-label={`Remove group ${i + 1}`}
              disabled={b.groups.length <= 2}
              onClick={() =>
                update<typeof b>(b.id, (x) => {
                  x.groups.splice(i, 1);
                  for (const it of x.items) if (it.group === g.id) it.group = x.groups[0]?.id ?? "";
                })
              }
              className="grid size-7 place-items-center rounded-full text-ink-muted hover:bg-surface disabled:opacity-30"
            >
              <Icon name="close" className="size-3.5" />
            </button>
          </li>
        ))}
        {b.groups.length < 4 && (
          <li>
            <button type="button" className={btn.quiet} onClick={() => update<typeof b>(b.id, (x) => void x.groups.push({ id: rid("group"), label: "" }))}>
              <Icon name="plus" className="size-4" /> Group
            </button>
          </li>
        )}
      </ul>
      <p className="mt-4 text-sm font-semibold">Items, and where each belongs</p>
      <ul className="mt-1 flex flex-col gap-2">
        {b.items.map((it, i) => (
          <li key={it.id} className="flex flex-col gap-1.5 rounded-2xl border border-line p-3">
            <div className="flex flex-wrap items-start gap-2">
              <InlineText
                value={it.text}
                onChange={(v) => update<typeof b>(b.id, (x) => void (x.items[i].text = v), `${b.id}:${it.id}:text`)}
                placeholder={`Item ${i + 1}`}
                className="min-w-0 flex-1 font-semibold"
              />
              <select
                aria-label={`Group for item ${i + 1}`}
                className="min-h-9 rounded-lg border border-line-strong bg-surface px-2 text-sm"
                value={it.group}
                onChange={(e) => update<typeof b>(b.id, (x) => void (x.items[i].group = e.target.value))}
              >
                {b.groups.map((g, n) => (
                  <option key={g.id} value={g.id}>
                    {g.label || `Group ${n + 1}`}
                  </option>
                ))}
              </select>
              <RowTools
                what="item"
                index={i}
                count={b.items.length}
                min={2}
                onMove={(d) => update<typeof b>(b.id, (x) => move(x.items, i, d))}
                onRemove={() => update<typeof b>(b.id, (x) => void x.items.splice(i, 1))}
              />
            </div>
            <InlineText
              value={it.feedback}
              onChange={(v) => update<typeof b>(b.id, (x) => void (x.items[i].feedback = v), `${b.id}:${it.id}:feedback`)}
              placeholder="Why it belongs there (shown after checking)"
              className="text-sm text-ink-muted"
            />
          </li>
        ))}
      </ul>
      <AddButton
        disabled={b.items.length >= 16}
        onClick={() => update<typeof b>(b.id, (x) => void x.items.push({ id: rid("item"), text: "", group: x.groups[0]?.id ?? "", feedback: "" }))}
      >
        Add item
      </AddButton>
    </div>
  );
}

function FeedbackField({ value, onChange }: { value: string; onChange: (v: string) => void }) {
  return (
    <div className="mt-4 rounded-2xl border-l-4 border-[#2f8f5b] bg-[#e9f6ef] p-3 dark:bg-[#17301f]">
      <p className="text-xs font-bold uppercase tracking-wide">Feedback after checking</p>
      <RichEditable value={value} onChange={onChange} placeholder="Why this is the right answer, so it sticks" />
    </div>
  );
}

function SequencingEdit({ block: b, update }: { block: Of<"sequencing">; update: Update }) {
  return (
    <div className={cx(column, card, "flex flex-col")}>
      <PhotoField block={b} update={update} context={b.prompt} />
      <Kicker icon="sequencing">Sequencing</Kicker>
      <div className="flow-root">
        <CircleShown media={b.media} />
        <InlineText
          value={b.prompt}
          onChange={(v) => update<typeof b>(b.id, (x) => void (x.prompt = v), `${b.id}:prompt`)}
          placeholder="What to put in order (Put the incident report steps in order)"
          className="font-serif text-xl font-semibold"
        />
        <p className="mt-1 text-sm text-ink-muted">Write the steps in the right order. Readers get them shuffled.</p>
      </div>
      <ol className="mt-4 flex flex-col gap-2">
        {b.steps.map((st, i) => (
          <li key={st.id} className="flex items-center gap-2 rounded-2xl border border-line-strong p-3">
            <span className="grid size-8 shrink-0 place-items-center rounded-full bg-muted font-mulish text-sm font-extrabold">{i + 1}</span>
            <InlineText
              value={st.text}
              onChange={(v) => update<typeof b>(b.id, (x) => void (x.steps[i].text = v), `${b.id}:${st.id}`)}
              placeholder={`Step ${i + 1}`}
              className="min-w-0 flex-1"
            />
            <RowTools
              what="step"
              index={i}
              count={b.steps.length}
              min={3}
              onMove={(d) => update<typeof b>(b.id, (x) => move(x.steps, i, d))}
              onRemove={() => update<typeof b>(b.id, (x) => void x.steps.splice(i, 1))}
            />
          </li>
        ))}
      </ol>
      <AddButton disabled={b.steps.length >= 10} onClick={() => update<typeof b>(b.id, (x) => void x.steps.push({ id: rid("step"), text: "" }))}>
        Add step
      </AddButton>
      <FeedbackField value={b.feedback} onChange={(v) => update<typeof b>(b.id, (x) => void (x.feedback = v), `${b.id}:feedback`)} />
    </div>
  );
}

function MatchingEdit({ block: b, update }: { block: Of<"matching">; update: Update }) {
  return (
    <div className={cx(column, card, "flex flex-col")}>
      <Kicker icon="matching">Matching</Kicker>
      <InlineText
        value={b.prompt}
        onChange={(v) => update<typeof b>(b.id, (x) => void (x.prompt = v), `${b.id}:prompt`)}
        placeholder="What to match (Match each term to what it means)"
        className="font-serif text-xl font-semibold"
      />
      <p className="mt-1 text-sm text-ink-muted">Write each pair. Readers get the right-hand side shuffled.</p>
      <ul className="mt-4 flex flex-col gap-2">
        {b.pairs.map((p, i) => (
          <li key={p.id} className="grid items-start gap-2 rounded-2xl border border-line-strong p-3 sm:grid-cols-[minmax(0,1fr)_auto_minmax(0,1.3fr)_auto]">
            <InlineText
              value={p.left}
              onChange={(v) => update<typeof b>(b.id, (x) => void (x.pairs[i].left = v), `${b.id}:${p.id}:l`)}
              placeholder="Term"
              className="font-semibold"
            />
            <Icon name="arrow-right" className="mt-1 hidden size-4 text-ink-muted sm:block" />
            <InlineText
              value={p.right}
              onChange={(v) => update<typeof b>(b.id, (x) => void (x.pairs[i].right = v), `${b.id}:${p.id}:r`)}
              placeholder="Its match"
            />
            <RowTools
              what="pair"
              index={i}
              count={b.pairs.length}
              min={2}
              onMove={(d) => update<typeof b>(b.id, (x) => move(x.pairs, i, d))}
              onRemove={() => update<typeof b>(b.id, (x) => void x.pairs.splice(i, 1))}
            />
          </li>
        ))}
      </ul>
      <AddButton disabled={b.pairs.length >= 8} onClick={() => update<typeof b>(b.id, (x) => void x.pairs.push({ id: rid("pair"), left: "", right: "" }))}>
        Add pair
      </AddButton>
      <FeedbackField value={b.feedback} onChange={(v) => update<typeof b>(b.id, (x) => void (x.feedback = v), `${b.id}:feedback`)} />
    </div>
  );
}

function FillBlankEdit({ block: b, update }: { block: Of<"fillblank">; update: Update }) {
  const gaps = blanksOf(b.text).filter((p) => "answers" in p).length;
  return (
    <div className={cx(column, card, "flex flex-col")}>
      <Kicker icon="blank">Fill in the blank</Kicker>
      <InlineText
        value={b.prompt}
        onChange={(v) => update<typeof b>(b.id, (x) => void (x.prompt = v), `${b.id}:prompt`)}
        placeholder="Instructions (optional): Complete the sentences"
        className="font-serif text-xl font-semibold"
      />
      <textarea
        aria-label="Text with gaps"
        className="mt-3 min-h-28 w-full rounded-2xl border border-line-strong bg-surface p-3 leading-relaxed"
        value={b.text}
        placeholder="An incident must be reported within [[24 hours|a day]] of becoming aware of it."
        onChange={(e) => update<typeof b>(b.id, (x) => void (x.text = e.target.value), `${b.id}:text`)}
      />
      <p className="mt-1 text-sm text-ink-muted">
        Put each answer in [[double brackets]]. Add other accepted answers after a bar: [[24 hours|a day]].{" "}
        {gaps ? `${gaps} ${gaps === 1 ? "gap" : "gaps"}.` : "No gaps yet."}
      </p>
      <FeedbackField value={b.feedback} onChange={(v) => update<typeof b>(b.id, (x) => void (x.feedback = v), `${b.id}:feedback`)} />
    </div>
  );
}

// ---------------------------------------------------------------------------------------------
// Reflect and apply: a private journal, curated perspectives, a pulse check and an action note
// ---------------------------------------------------------------------------------------------

/** What learners are told about privacy, shown in the editor so authors see it too. */
function PrivacyPreview({ children }: { children: React.ReactNode }) {
  return (
    <p className="mt-3 flex items-start gap-2 text-sm text-ink-muted">
      <Icon name="lock" className="mt-0.5 size-4 shrink-0" />
      <span>{children}</span>
    </p>
  );
}

function JournalEdit({ block: b, update }: { block: Of<"journal">; update: Update }) {
  return (
    <div className={cx(column, card)}>
      <Kicker icon="pen">{b.revisits ? "Revisit your note" : "Private journal"}</Kicker>
      <InlineText
        value={b.prompt}
        onChange={(v) => update<typeof b>(b.id, (x) => void (x.prompt = v), `${b.id}:prompt`)}
        placeholder={b.revisits ? "The question now (What would you now ask Dot?)" : "A short, specific prompt, close to the case it’s about"}
        multiline
        className="font-serif text-xl font-semibold"
      />
      <InlineText
        value={b.scaffold ?? ""}
        onChange={(v) => update<typeof b>(b.id, (x) => void (x.scaffold = v || undefined), `${b.id}:scaffold`)}
        placeholder="A way in (optional): What would you ask first?"
        className="mt-1 text-ink-muted"
      />
      <div className="mt-3 min-h-24 rounded-2xl border border-dashed border-line-strong p-3 text-ink-muted" aria-hidden>
        {b.revisits
          ? "The learner sees what they wrote earlier beside this, and adds a dated follow-up. Both are kept."
          : "The learner writes a few sentences here. It autosaves as they type."}
      </div>
      <PrivacyPreview>
        <strong className="text-ink">Private note.</strong> Only the learner sees it, in My Notes. It isn’t graded, shown to you or managers, posted, or sent to
        AI. {b.required ? "A response is asked for: writing, or “Prefer not to write”, both count." : "Optional: it never holds up finishing the page."}
      </PrivacyPreview>
    </div>
  );
}

function PerspectivesEdit({ block: b, update }: { block: Of<"perspectives">; update: Update }) {
  const g = b.guidance;
  return (
    <div className={cx("mx-auto w-full max-w-5xl", card)}>
      <Kicker icon="people">Compare perspectives</Kicker>
      <InlineText
        value={b.prompt}
        onChange={(v) => update<typeof b>(b.id, (x) => void (x.prompt = v), `${b.id}:prompt`)}
        placeholder="What’s being compared (Two ways to respond to the complaint)"
        className="font-serif text-xl font-semibold"
      />
      <p className="mt-1 text-sm text-ink-muted">
        Two or three defensible viewpoints, each with what it might miss. Learners open them themselves; none is ranked or “the answer”.
      </p>
      <ol className={cx("mt-4 grid gap-4", b.views.length >= 3 ? "md:grid-cols-3" : "md:grid-cols-2")}>
        {b.views.map((v, i) => (
          <li key={v.id} className="flex flex-col gap-2 rounded-2xl border border-line p-4">
            <div className="flex items-center justify-between gap-2">
              <span className="text-xs font-bold uppercase tracking-wide text-ink-muted">Perspective {i + 1}</span>
              <RowTools
                what="perspective"
                index={i}
                count={b.views.length}
                min={2}
                onMove={(d) => update<typeof b>(b.id, (x) => move(x.views, i, d))}
                onRemove={() => update<typeof b>(b.id, (x) => void x.views.splice(i, 1))}
              />
            </div>
            <InlineText
              value={v.title}
              onChange={(t) => update<typeof b>(b.id, (x) => void (x.views[i].title = t), `${b.id}:${v.id}:title`)}
              placeholder="The viewpoint, in their words (I want to reassure the client straight away)"
              multiline
              className="font-serif text-lg font-semibold"
            />
            <p className="text-sm font-bold">The reasoning</p>
            <InlineText
              value={v.reasoning}
              onChange={(t) => update<typeof b>(b.id, (x) => void (x.views[i].reasoning = t), `${b.id}:${v.id}:reasoning`)}
              placeholder="Why someone would see it this way"
              multiline
            />
            <p className="text-sm font-bold">What it might miss</p>
            <InlineText
              value={v.misses}
              onChange={(t) => update<typeof b>(b.id, (x) => void (x.views[i].misses = t), `${b.id}:${v.id}:misses`)}
              placeholder="The risk or gap in it"
              multiline
            />
          </li>
        ))}
      </ol>
      <AddButton
        disabled={b.views.length >= 3}
        onClick={() => update<typeof b>(b.id, (x) => void x.views.push({ id: rid("view"), title: "", reasoning: "", misses: "" }))}
      >
        Add a perspective
      </AddButton>
      {g ? (
        <div className="mt-4 rounded-2xl border-l-4 border-action bg-tealtint p-4">
          <div className="flex items-center justify-between gap-2">
            <p className="flex items-center gap-2 font-mulish text-sm font-extrabold uppercase tracking-wide">
              <Icon name="doc" className="size-4" /> What the guidance says
            </p>
            <button
              type="button"
              className="text-xs font-semibold text-accent hover:underline"
              onClick={() => update<typeof b>(b.id, (x) => void delete x.guidance)}
            >
              Remove
            </button>
          </div>
          <InlineText
            value={g.body}
            onChange={(t) => update<typeof b>(b.id, (x) => void (x.guidance!.body = t), `${b.id}:guidance`)}
            placeholder="The policy or safety step that applies, from its approved source. Shown apart from the viewpoints."
            multiline
            className="mt-1"
          />
          <p className="mt-2 text-xs text-ink-muted">
            Add its source and who reviewed it in the panel. Flag the block “Needs verification” so its policy owner checks it.
          </p>
        </div>
      ) : (
        <button
          type="button"
          className="mt-3 inline-flex items-center gap-1.5 text-sm font-semibold text-accent hover:underline"
          onClick={() => update<typeof b>(b.id, (x) => void (x.guidance = { body: "" }))}
        >
          <Icon name="doc" className="size-4" /> Add “What the guidance says” (when a policy or safety step applies)
        </button>
      )}
    </div>
  );
}

function PulseEdit({ block: b, update }: { block: Of<"pulse">; update: Update }) {
  return (
    <div className={cx(column, card, "flex flex-col")}>
      <Kicker icon="gauge">Pulse check</Kicker>
      <InlineText
        value={b.question}
        onChange={(v) => update<typeof b>(b.id, (x) => void (x.question = v), `${b.id}:question`)}
        placeholder={b.kind === "view" ? "A viewpoint to choose (Which part would you check first?)" : "How confident are you that you could…?"}
        className="font-serif text-xl font-semibold"
      />
      <ul className="mt-4 flex flex-col gap-2">
        {b.options.map((o, i) => (
          <li key={o.id} className="flex items-center gap-2 rounded-2xl border-2 border-line-strong px-3 py-2">
            <InlineText
              value={o.label}
              onChange={(v) => update<typeof b>(b.id, (x) => void (x.options[i].label = v), `${b.id}:${o.id}`)}
              placeholder={`Response ${i + 1}`}
              className="min-w-0 flex-1 font-semibold"
            />
            <RowTools
              what="response"
              index={i}
              count={b.options.length}
              min={2}
              onMove={(d) => update<typeof b>(b.id, (x) => move(x.options, i, d))}
              onRemove={() => update<typeof b>(b.id, (x) => void x.options.splice(i, 1))}
            />
          </li>
        ))}
      </ul>
      <AddButton disabled={b.options.length >= 5} onClick={() => update<typeof b>(b.id, (x) => void x.options.push({ id: rid("opt"), label: "" }))}>
        Add a response
      </AddButton>
      <PrivacyPreview>One tap, no right answer and no score. Only the learner sees their response; no group results are shown.</PrivacyPreview>
    </div>
  );
}

function ActionEdit({ block: b, update }: { block: Of<"action">; update: Update }) {
  return (
    <div className={cx(column, card, "flex flex-col")}>
      <Kicker icon="target">{b.revisits ? "Back to your action" : "Action note"}</Kicker>
      <InlineText
        value={b.prompt}
        onChange={(v) => update<typeof b>(b.id, (x) => void (x.prompt = v), `${b.id}:prompt`)}
        placeholder={b.revisits ? "Did you try it? What happened?" : "Ask for one concrete action (Choose one thing to try on your next invoice review)"}
        multiline
        className="font-serif text-xl font-semibold"
      />
      {b.revisits ? (
        <>
          <div className="mt-3 flex flex-wrap gap-2" aria-hidden>
            {Object.values(ACTION_STATUSES).map((l) => (
              <span key={l} className="rounded-full border-2 border-line-strong px-4 py-2 font-semibold">
                {l}
              </span>
            ))}
          </div>
          <p className="mt-2 text-sm text-ink-muted">The learner sees the action they chose earlier, picks how it went, and can add a private reflection.</p>
        </>
      ) : (
        <>
          <InlineText
            value={b.timing ?? ""}
            onChange={(v) => update<typeof b>(b.id, (x) => void (x.timing = v || undefined), `${b.id}:timing`)}
            placeholder="When it’s worth trying (optional): On your next invoice review"
            className="mt-1 text-ink-muted"
          />
          <ul className="mt-4 flex flex-col gap-2">
            {b.suggestions.map((sg, i) => (
              <li key={sg.id} className="flex items-center gap-2 rounded-2xl border-2 border-line-strong p-3">
                <span className="size-5 shrink-0 rounded-full border-2 border-line-strong" aria-hidden />
                <InlineText
                  value={sg.text}
                  onChange={(v) => update<typeof b>(b.id, (x) => void (x.suggestions[i].text = v), `${b.id}:${sg.id}`)}
                  placeholder="A specific action (On my next invoice review, I will…)"
                  multiline
                  className="min-w-0 flex-1"
                />
                <RowTools
                  what="action"
                  index={i}
                  count={b.suggestions.length}
                  min={b.allowOwn === false ? 2 : 0}
                  onMove={(d) => update<typeof b>(b.id, (x) => move(x.suggestions, i, d))}
                  onRemove={() => update<typeof b>(b.id, (x) => void x.suggestions.splice(i, 1))}
                />
              </li>
            ))}
            {b.allowOwn !== false && (
              <li className="flex items-center gap-2 rounded-2xl border-2 border-dashed border-line-strong p-3 text-ink-muted" aria-hidden>
                <span className="size-5 shrink-0 rounded-full border-2 border-line-strong" /> Write my own
              </li>
            )}
          </ul>
          <AddButton disabled={b.suggestions.length >= 4} onClick={() => update<typeof b>(b.id, (x) => void x.suggestions.push({ id: rid("act"), text: "" }))}>
            Add a suggested action
          </AddButton>
        </>
      )}
      <PrivacyPreview>
        <strong className="text-ink">Private note.</strong> Saved to the learner’s My Notes, where they can say later whether they tried it. No reminder is
        sent, and nothing follows if they don’t.
      </PrivacyPreview>
    </div>
  );
}

/** The panel's settings for the reflect-and-apply blocks: pairing, whether a response is asked for, and what this block's own checks say. */
function ReflectSettings({ block: b, update, doc }: { block: Of<"journal"> | Of<"perspectives"> | Of<"pulse"> | Of<"action">; update: Update; doc: GuideDoc }) {
  const blocks = allBlocks(doc);
  const at = blocks.findIndex((x) => x.id === b.id);
  const before = blocks.slice(0, at);
  const label = (x: Block) =>
    (x.type === "journal" || x.type === "action" || x.type === "decision" ? x.prompt : x.type === "pulse" ? x.question : "").slice(0, 70) ||
    `An untitled ${x.type}`;
  const checks = reflectChecks(b, doc);
  const notes = checks.length > 0 && (
    <ul className="flex list-disc flex-col gap-1 rounded-2xl bg-muted px-7 py-2 text-sm">
      {checks.map((c) => (
        <li key={c.text} className={cx(c.blocks && "font-semibold text-danger")}>
          {c.text.charAt(0).toUpperCase() + c.text.slice(1)}
        </li>
      ))}
    </ul>
  );
  const required = (b.type === "journal" || b.type === "action") && (
    <label className="flex items-start gap-2 text-sm">
      <input
        type="checkbox"
        className="mt-0.5 size-4 accent-[var(--color-action)]"
        checked={Boolean(b.required)}
        onChange={(e) => update<typeof b>(b.id, (x) => void (x.required = e.target.checked || undefined))}
      />
      <span>
        <span className="font-semibold">Ask for a response before finishing the page</span>
        <span className="block text-ink-muted">
          Off by default. When on, saving a note counts, and so does “Prefer not to write: mark as reviewed”: no one has to disclose something personal. Length
          and content are never checked.
        </span>
      </span>
    </label>
  );
  if (b.type === "journal") {
    const earlier = before.filter((x): x is Of<"journal"> => x.type === "journal" && !x.revisits);
    return (
      <>
        <Field
          label="Revisit an earlier journal"
          hint="Learners see what they wrote then beside this prompt, and add a follow-up. Put this block later in the course."
        >
          <select className={input} value={b.revisits ?? ""} onChange={(e) => update<typeof b>(b.id, (x) => void (x.revisits = e.target.value || undefined))}>
            <option value="">None: this is a first note</option>
            {b.revisits && !earlier.some((x) => x.id === b.revisits) && <option value={b.revisits}>(The linked journal isn’t available)</option>}
            {earlier.map((x) => (
              <option key={x.id} value={x.id}>
                {label(x)}
              </option>
            ))}
          </select>
        </Field>
        <Field label="About how long it takes (minutes)" hint="Shown beside the heading, and counted in the page’s reading time.">
          <input
            type="number"
            min={1}
            max={30}
            className={input}
            value={b.minutes ?? ""}
            onChange={(e) => update<typeof b>(b.id, (x) => void (x.minutes = Number(e.target.value) || undefined), `${b.id}:minutes`)}
          />
        </Field>
        {required}
        {notes}
      </>
    );
  }
  if (b.type === "action") {
    const earlier = before.filter((x): x is Of<"action"> => x.type === "action" && !x.revisits);
    return (
      <>
        <Field
          label="Come back to an earlier action"
          hint="Asks whether they tried it: Tried it, Not yet or Adjusted my plan, with an optional private reflection."
        >
          <select className={input} value={b.revisits ?? ""} onChange={(e) => update<typeof b>(b.id, (x) => void (x.revisits = e.target.value || undefined))}>
            <option value="">None: this asks for a new action</option>
            {b.revisits && !earlier.some((x) => x.id === b.revisits) && <option value={b.revisits}>(The linked action isn’t available)</option>}
            {earlier.map((x) => (
              <option key={x.id} value={x.id}>
                {label(x)}
              </option>
            ))}
          </select>
        </Field>
        {!b.revisits && (
          <label className="flex items-start gap-2 text-sm">
            <input
              type="checkbox"
              className="mt-0.5 size-4 accent-[var(--color-action)]"
              checked={b.allowOwn !== false}
              onChange={(e) => update<typeof b>(b.id, (x) => void (e.target.checked ? delete x.allowOwn : (x.allowOwn = false)))}
            />
            <span className="font-semibold">Learners can write their own action</span>
          </label>
        )}
        {required}
        {notes}
      </>
    );
  }
  if (b.type === "pulse") {
    const earlier = before.filter((x): x is Of<"pulse"> => x.type === "pulse");
    const pair = earlier.find((x) => x.id === b.compareWith);
    return (
      <>
        <Field label="What it asks for" hint="Either way it isn’t scored, and there’s no right answer.">
          <select
            className={input}
            value={b.kind}
            onChange={(e) =>
              update<typeof b>(b.id, (x) => {
                x.kind = e.target.value === "view" ? "view" : "confidence";
                // A fresh confidence scale gets labels to start from.
                if (x.kind === "confidence" && x.options.every((o) => !o.label))
                  x.options = PULSE_DEFAULTS.confidence.map((l, i) => ({ id: `o${i + 1}`, label: l }));
              })
            }
          >
            <option value="confidence">Confidence (a labelled scale)</option>
            <option value="view">A viewpoint (a clearly worded choice)</option>
          </select>
        </Field>
        <Field label="Pair with an earlier pulse check" hint="Learners see how their own view changed. Both must ask the same thing, with the same labels.">
          <select
            className={input}
            value={b.compareWith ?? ""}
            onChange={(e) => update<typeof b>(b.id, (x) => void (x.compareWith = e.target.value || undefined))}
          >
            <option value="">None: this is the first</option>
            {b.compareWith && !pair && <option value={b.compareWith}>(The linked pulse check isn’t available)</option>}
            {earlier.map((x) => (
              <option key={x.id} value={x.id}>
                {label(x)}
              </option>
            ))}
          </select>
        </Field>
        {pair && (pair.question !== b.question || pair.options.map((o) => o.label).join("|") !== b.options.map((o) => o.label).join("|")) && (
          <button
            type="button"
            className={btn.secondary}
            onClick={() =>
              update<typeof b>(b.id, (x) => {
                x.question = pair.question;
                x.kind = pair.kind;
                x.options = pair.options.map((o) => ({ ...o }));
              })
            }
          >
            Use the same question and labels as its pair
          </button>
        )}
        {notes}
      </>
    );
  }
  const g = b.guidance;
  const responses = before.filter((x) => x.type === "journal" || x.type === "decision" || x.type === "pulse" || x.type === "action");
  return (
    <>
      <Field
        label="Show after the learner’s own response"
        hint="They’re invited to answer that first. They can still compare without answering: it’s never forced."
      >
        <select className={input} value={b.after ?? ""} onChange={(e) => update<typeof b>(b.id, (x) => void (x.after = e.target.value || undefined))}>
          <option value="">On its own</option>
          {b.after && !responses.some((x) => x.id === b.after) && <option value={b.after}>(The linked block isn’t available)</option>}
          {responses.map((x) => (
            <option key={x.id} value={x.id}>
              {BLOCK_LABELS[x.type]}: {label(x)}
            </option>
          ))}
        </select>
      </Field>
      {g && (
        <>
          <Field label="Guidance: its approved source">
            <input
              className={input}
              placeholder="Complaints policy, section 3"
              value={g.source?.label ?? ""}
              onChange={(e) =>
                update<typeof b>(
                  b.id,
                  (x) => void (x.guidance!.source = e.target.value ? { ...x.guidance!.source, label: e.target.value } : undefined),
                  `${b.id}:gsrc`,
                )
              }
            />
          </Field>
          {g.source && (
            <Field label="Link to the source (optional)">
              <input
                className={input}
                placeholder="https://… or a page on the Hub"
                value={g.source.href ?? ""}
                onChange={(e) =>
                  update<typeof b>(
                    b.id,
                    (x) => void (x.guidance!.source = { label: x.guidance!.source!.label, ...(e.target.value && { href: e.target.value }) }),
                    `${b.id}:ghref`,
                  )
                }
              />
            </Field>
          )}
          <Field label="Reviewed by">
            <input
              className={input}
              placeholder="Name or role of the policy owner"
              value={g.reviewedBy ?? ""}
              onChange={(e) => update<typeof b>(b.id, (x) => void (x.guidance!.reviewedBy = e.target.value || undefined), `${b.id}:gby`)}
            />
          </Field>
          <Field label="Reviewed on">
            <input
              type="date"
              className={input}
              value={g.reviewedOn ?? ""}
              onChange={(e) => update<typeof b>(b.id, (x) => void (x.guidance!.reviewedOn = e.target.value || undefined))}
            />
          </Field>
        </>
      )}
      <p className="text-sm text-ink-muted">Curated viewpoints only for now: learners don’t post here. Moderated peer sharing comes with the later pilot.</p>
      {notes}
    </>
  );
}
