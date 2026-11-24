"use client";

import { useApi } from "@/lib/api";
import type { Card } from "@/content/lessons";
import { Field, input } from "./ui";

/*
  Places a published 72-Hour Discharge Pivot on a Topic card, by reference (docs/discharge-pivot.md), as the Practice
  lab and Spot the Hazard fields do. The card stores only the course and block it points to: learners get the same
  reviewed scenario and attempt as in the article. Only simulations in published courses are offered, so only a
  signed-off one can be placed.
*/

type Pivot = { guide: string; guideTitle: string; block: string; title: string; usable: { ok: boolean } };

export function LessonDischargeField({ card: c, set }: { card: Card; set: (fn: (c: Card) => void) => void }) {
  const pivots = useApi<{ pivots: Pivot[] }>("/api/admin/discharge-pivots");
  const list = pivots.data?.pivots ?? [];
  const value = c.pivotRef ? `${c.pivotRef.guide}|${c.pivotRef.block}` : "";
  const placed = c.pivotRef && list.find((l) => l.guide === c.pivotRef!.guide && l.block === c.pivotRef!.block);
  return (
    <div className="flex flex-col gap-3 sm:col-span-2">
      <div>
        <p className="text-sm font-semibold">Discharge simulation on this card</p>
        <p className="text-sm text-ink-muted">
          Place a 72-Hour Discharge Pivot from a published Magazine course. It’s the same scenario and attempt as in the article, never a copy, and learners see
          it if they can read that course.
        </p>
      </div>
      <Field label="Simulation">
        <select
          className={input}
          value={value}
          onChange={(e) =>
            set((x) => {
              const [guide, block] = e.target.value.split("|");
              if (!guide) delete x.pivotRef;
              else x.pivotRef = { guide, block, ...(x.pivotRef?.why && { why: x.pivotRef.why }) };
            })
          }
        >
          <option value="">None</option>
          {list.map((l) => (
            <option key={`${l.guide}|${l.block}`} value={`${l.guide}|${l.block}`}>
              {l.title} ({l.guideTitle}){l.usable.ok ? "" : " · out of use while a source is reviewed"}
            </option>
          ))}
          {c.pivotRef && !placed && <option value={value}>{`${c.pivotRef.block} in ${c.pivotRef.guide} (not published now)`}</option>}
        </select>
      </Field>
      {c.pivotRef && (
        <Field label="Why it belongs here" hint="Shown above the simulation.">
          <input className={input} value={c.pivotRef.why ?? ""} onChange={(e) => set((x) => void (x.pivotRef && (x.pivotRef.why = e.target.value)))} />
        </Field>
      )}
      {pivots.error && <p className="text-sm text-ink-muted">The simulations couldn’t be listed: {pivots.error}</p>}
      {pivots.data && !list.length && <p className="text-sm text-ink-muted">No published course has a discharge simulation yet.</p>}
    </div>
  );
}
