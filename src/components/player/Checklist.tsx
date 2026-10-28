"use client";

import type { Card } from "@/content/lessons";
import { allTicked } from "@/lib/checklist";
import { cx } from "@/lib/format";
import { Icon } from "../Icon";
import { Burst } from "./Burst";

/*
  Checklist card: tap each item to tick it. An item's note appears once it's ticked. Ticks are kept
  with the learner's progress, so they're still there if they come back.
*/

type ChecklistCard = Extract<Card, { type: "checklist" }>;

export function Checklist({ card, ticked, onChange }: { card: ChecklistCard; ticked: string[]; onChange: (ticked: string[]) => void }) {
  const done = allTicked(card, ticked);
  const count = card.items.filter((i) => ticked.includes(i.id)).length;
  return (
    <fieldset className="flex flex-col gap-2">
      <legend className="mb-2 text-lg font-semibold">{card.prompt}</legend>
      {card.items.map((item) => {
        const on = ticked.includes(item.id);
        return (
          <label
            key={item.id}
            className={cx(
              "fx-press relative flex min-h-14 cursor-pointer gap-3 rounded-2xl border-2 px-4 py-3 transition-colors",
              on ? "fx-pop border-success bg-success/10" : "border-line-strong bg-surface hover:bg-muted",
            )}
          >
            <input
              type="checkbox"
              className="peer sr-only"
              checked={on}
              onChange={() => onChange(on ? ticked.filter((t) => t !== item.id) : [...ticked, item.id])}
            />
            <span
              aria-hidden
              className={cx(
                "mt-0.5 grid size-6 shrink-0 place-items-center rounded-md border-2 transition-colors peer-focus-visible:outline-3 peer-focus-visible:outline-offset-2 peer-focus-visible:outline-action",
                on ? "border-success bg-success text-white" : "border-line-strong bg-surface",
              )}
            >
              {on && <Icon name="check" className="fx-tick size-4" />}
            </span>
            <span className="min-w-0 flex-1">
              <span className="block text-[1.02rem] font-medium">{item.text}</span>
              {on && item.note && <span className="fx-rise mt-1 block text-[0.95rem] text-ink-muted">{item.note}</span>}
            </span>
            {/* The item that completes the list gets a little celebration. */}
            {done && item.id === ticked[ticked.length - 1] && <Burst distance={40} />}
          </label>
        );
      })}
      <p className="text-sm text-ink-muted" role="status">
        {done ? "All done." : `${count} of ${card.items.length} ticked${card.requireAll ? ". Tick them all to continue." : "."}`}
      </p>
    </fieldset>
  );
}
