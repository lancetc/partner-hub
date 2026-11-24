"use client";

import { useApi } from "@/lib/api";
import type { Card } from "@/content/lessons";
import { Field, input } from "./ui";

/*
  Places a published Spot the Hazard scene on a Topic card, by reference (docs/spot-the-hazard.md), as the Practice lab
  field does for a Budget Decision Lab. The card stores only the course and block it points to: learners get the same
  approved variants, answer key and attempt as in the article. Only scenes in published courses are offered, so only
  a reviewed, signed-off scene can be placed.
*/

type Scene = { guide: string; guideTitle: string; block: string; title: string; eligible: { label: string; count: number }[] };

export function LessonSceneField({ card: c, set }: { card: Card; set: (fn: (c: Card) => void) => void }) {
  const scenes = useApi<{ scenes: Scene[] }>("/api/admin/hazard-scenes");
  const list = scenes.data?.scenes ?? [];
  const value = c.sceneRef ? `${c.sceneRef.guide}|${c.sceneRef.block}` : "";
  const placed = c.sceneRef && list.find((l) => l.guide === c.sceneRef!.guide && l.block === c.sceneRef!.block);
  return (
    <div className="flex flex-col gap-3 sm:col-span-2">
      <div>
        <p className="text-sm font-semibold">Spot the Hazard on this card</p>
        <p className="text-sm text-ink-muted">
          Place a Spot the Hazard scene from a published Magazine course. It’s the same scene, approved rooms and attempt as in the article, never a copy, and
          learners see it if they can read that course.
        </p>
      </div>
      <Field label="Scene">
        <select
          className={input}
          value={value}
          onChange={(e) =>
            set((x) => {
              const [guide, block] = e.target.value.split("|");
              if (!guide) delete x.sceneRef;
              else x.sceneRef = { guide, block, ...(x.sceneRef?.why && { why: x.sceneRef.why }) };
            })
          }
        >
          <option value="">None</option>
          {list.map((l) => (
            <option key={`${l.guide}|${l.block}`} value={`${l.guide}|${l.block}`}>
              {l.title} ({l.guideTitle}){l.eligible.some((r) => !r.count) ? " · no approved room for some roles" : ""}
            </option>
          ))}
          {c.sceneRef && !placed && <option value={value}>{`${c.sceneRef.block} in ${c.sceneRef.guide} (not published now)`}</option>}
        </select>
      </Field>
      {c.sceneRef && (
        <Field label="Why it belongs here" hint="Shown above the scene.">
          <input className={input} value={c.sceneRef.why ?? ""} onChange={(e) => set((x) => void (x.sceneRef && (x.sceneRef.why = e.target.value)))} />
        </Field>
      )}
      {scenes.error && <p className="text-sm text-ink-muted">The scenes couldn’t be listed: {scenes.error}</p>}
      {scenes.data && !list.length && <p className="text-sm text-ink-muted">No published course has a Spot the Hazard scene yet.</p>}
    </div>
  );
}
