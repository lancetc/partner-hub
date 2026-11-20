"use client";

import { useRef, useState } from "react";
import Link from "next/link";
import { useApi } from "@/lib/api";
import type { MythBlock } from "@/lib/magazine";
import type { tilesFor } from "@/server/myths";
import { MythTile } from "../myths/MythTile";
import { Icon } from "../Icon";
import type { InteractiveContext } from "./InteractiveBlocks";

/*
  Myth vs Reality tiles in a Magazine course (docs/myth-vs-reality.md). The block holds only tile IDs: each tile
  comes from the library as its current approved version, so the course and the Resources page never drift
  apart. Opening the set number of tiles counts as working through the block; copying an email isn't needed.
  In the editor's preview an author sees drafts too, marked, and nothing is recorded.
*/

type Loaded = ReturnType<typeof tilesFor>;

export function MythTilesBlock({ block: b, ctx }: { block: MythBlock; ctx: InteractiveContext }) {
  const loaded = useApi<Loaded>(b.tileIds.length ? `/api/myths?ids=${b.tileIds.join(",")}${ctx.preview ? "&preview=1" : ""}` : null);
  const [opened, setOpened] = useState<string[]>([]);
  const done = useRef(false);
  const onOpened = (id: string) =>
    setOpened((o) => {
      const next = o.includes(id) ? o : [...o, id];
      if (!ctx.preview && !done.current && next.length >= b.toOpen) {
        done.current = true;
        ctx.activity(b.id, { outcome: "explored", score: next.length, total: b.tileIds.length });
        ctx.engaged(b.id);
      }
      return next;
    });

  return (
    <section aria-label={`Myth vs Reality: ${b.title}`} className="w-full rounded-3xl border border-line-strong bg-muted/40 p-5 sm:p-7">
      <p className="mb-2 flex items-center gap-2 font-mulish text-sm font-extrabold uppercase tracking-[0.12em] text-accent">
        <Icon name="flashcards" className="size-5" /> Myth vs Reality
      </p>
      <h3 className="font-serif text-2xl font-semibold">{b.title}</h3>
      {b.intro && <p className="mt-2 text-lg">{b.intro}</p>}
      <p className="mt-2 text-sm text-ink-muted">
        Open {b.toOpen === b.tileIds.length ? "each" : `${b.toOpen} of the ${b.tileIds.length}`} {b.tileIds.length === 1 ? "question" : "questions"}. Opened{" "}
        {Math.min(opened.length, b.tileIds.length)}.
      </p>
      {loaded.error ? (
        <p role="alert" className="mt-4">
          {loaded.error}
        </p>
      ) : !loaded.data ? (
        <p className="mt-4 text-ink-muted">Loading…</p>
      ) : (
        <>
          {loaded.data.missing.length > 0 && (
            <p className="mt-3 rounded-2xl bg-surface p-3 text-sm ring-1 ring-line">
              {ctx.preview
                ? `Not in the library: ${loaded.data.missing.join(", ")}.`
                : `${loaded.data.missing.length === 1 ? "One question is" : `${loaded.data.missing.length} questions are`} being reviewed and will appear once approved.`}
            </p>
          )}
          <ul className="mt-4 grid gap-4 md:grid-cols-2">
            {loaded.data.tiles.map((t) => (
              <li key={t.id}>
                <MythTile tile={t} mode={b.mode} practice={b.practice} showCopy={b.showCopy} guideId={ctx.guideId} preview={ctx.preview} onOpened={onOpened} />
              </li>
            ))}
          </ul>
        </>
      )}
      <p className="mt-4 text-sm">
        <Link href="/resources/myths" className="font-semibold text-accent underline">
          All client questions in Resources
        </Link>
      </p>
    </section>
  );
}
