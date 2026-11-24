"use client";

import { useApi } from "@/lib/api";
import type { Card } from "@/content/lessons";
import { Field, input } from "./ui";

/*
  Places a published Quarterly Budget Decision Lab on a Topic card, by reference (docs/budget-decision-lab.md). The card
  stores only the course and block it points to: learners get the same block, rule set and attempt as in the article,
  and a later published version of the article shows here too. Only labs in published courses are offered, so only a
  reviewed, signed-off lab can be placed.
*/

type Lab = { guide: string; guideId: string; guideTitle: string; block: string; title: string; participant: string; ruleSet: string; status: string };

export function LessonLabField({ card: c, set }: { card: Card; set: (fn: (c: Card) => void) => void }) {
  const labs = useApi<{ labs: Lab[] }>("/api/admin/budget-labs");
  const list = labs.data?.labs ?? [];
  const value = c.labRef ? `${c.labRef.guide}|${c.labRef.block}` : "";
  const placed = c.labRef && list.find((l) => l.guide === c.labRef!.guide && l.block === c.labRef!.block);
  return (
    <div className="flex flex-col gap-3 sm:col-span-2">
      <div>
        <p className="text-sm font-semibold">Practice lab on this card</p>
        <p className="text-sm text-ink-muted">
          Place a Quarterly Budget Decision Lab from a published Magazine course. It’s the same block, rules and attempt as in the article, never a copy, and
          learners see it if they can read that course.
        </p>
      </div>
      <Field label="Lab">
        <select
          className={input}
          value={value}
          onChange={(e) =>
            set((x) => {
              const [guide, block] = e.target.value.split("|");
              if (!guide) delete x.labRef;
              else x.labRef = { guide, block, ...(x.labRef?.why && { why: x.labRef.why }) };
            })
          }
        >
          <option value="">None</option>
          {list.map((l) => (
            <option key={`${l.guide}|${l.block}`} value={`${l.guide}|${l.block}`}>
              {l.title} ({l.guideTitle}){l.status === "current" ? "" : ` · ${l.status}`}
            </option>
          ))}
          {c.labRef && !placed && <option value={value}>{`${c.labRef.block} in ${c.labRef.guide} (not published now)`}</option>}
        </select>
      </Field>
      {c.labRef && (
        <Field label="Why it belongs here" hint="Shown above the lab.">
          <input className={input} value={c.labRef.why ?? ""} onChange={(e) => set((x) => void (x.labRef && (x.labRef.why = e.target.value)))} />
        </Field>
      )}
      {labs.error && <p className="text-sm text-ink-muted">The labs couldn’t be listed: {labs.error}</p>}
      {labs.data && !list.length && <p className="text-sm text-ink-muted">No published course has a Quarterly Budget Decision Lab yet.</p>}
    </div>
  );
}
