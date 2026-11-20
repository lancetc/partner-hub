"use client";

import Link from "next/link";
import { useApi } from "@/lib/api";
import { cx } from "@/lib/format";
import type { MythBlock } from "@/lib/magazine";
import { CATEGORIES, MODES, type Mode } from "@/lib/myths";
import type { library } from "@/server/myths";
import { Badge, btn, Field, input } from "./ui";
import type { Update } from "./MagazineEditParts";
import { Icon } from "../Icon";

/*
  The editor for a Myth vs Reality block (docs/myth-vs-reality.md): which library tiles to show and in what order,
  learning or quick-reference mode, and how many to open. The tiles themselves are written and approved in the
  library, so every course shows the same approved version.
*/

type Loaded = ReturnType<typeof library>;
const group = "rounded-2xl bg-muted p-3";

export function MythEdit({ block: b, update }: { block: MythBlock; update: Update }) {
  const set = (fn: (x: MythBlock) => void, tag?: string) => update<MythBlock>(b.id, fn, tag && `${b.id}:${tag}`);
  const lib = useApi<Loaded>("/api/admin/myths");
  const tiles = lib.data?.tiles ?? [];
  const byId = new Map(tiles.map((t) => [t.id, t]));
  const notLive = b.tileIds.filter((id) => byId.get(id)?.live?.state !== "approved");
  return (
    <div className="w-full rounded-3xl border border-line-strong bg-surface p-5 shadow-sm sm:p-7">
      <p className="mb-2 flex items-center gap-2 font-mulish text-sm font-extrabold uppercase tracking-[0.12em] text-accent">
        <Icon name="flashcards" className="size-5" /> Myth vs Reality tiles
      </p>
      {lib.data && (
        <p
          role="status"
          className={cx(
            "rounded-2xl px-4 py-3 text-sm font-semibold",
            notLive.length
              ? "bg-[#fff1cc] text-[#4a3400] dark:bg-[#3d2f08] dark:text-[#ffd97a]"
              : "bg-[#e3f4ea] text-[#0f5b3a] dark:bg-[#12392a] dark:text-[#8fe0b5]",
          )}
        >
          {notLive.length
            ? `${notLive.length} of these tiles ${notLive.length === 1 ? "isn’t" : "aren’t"} live in the library yet (no approved version, or under review). The course can’t be published until ${notLive.length === 1 ? "it is" : "they are"}.`
            : "Every tile here has an approved version in the library."}
        </p>
      )}
      <div className="mt-3 grid gap-3 sm:grid-cols-2">
        <Field label="Title">
          <input className={input} value={b.title} maxLength={160} onChange={(e) => set((x) => void (x.title = e.target.value), "title")} />
        </Field>
        <Field label="Mode">
          <select
            className={input}
            value={b.mode}
            onChange={(e) =>
              set((x) => {
                x.mode = e.target.value as Mode;
                if (x.mode === "quick") x.practice = false;
              })
            }
          >
            {(Object.keys(MODES) as Mode[]).map((m) => (
              <option key={m} value={m}>
                {MODES[m]}
              </option>
            ))}
          </select>
        </Field>
        <Field label="Introduction" className="sm:col-span-2">
          <input className={input} value={b.intro} maxLength={600} onChange={(e) => set((x) => void (x.intro = e.target.value), "intro")} />
        </Field>
        <label className="flex min-h-11 items-center gap-2 text-sm font-semibold">
          <input
            type="checkbox"
            className="size-5"
            checked={b.practice}
            disabled={b.mode === "quick"}
            onChange={(e) => set((x) => void (x.practice = e.target.checked))}
          />
          Ask “How would you say it?” before the approved reply
        </label>
        <label className="flex min-h-11 items-center gap-2 text-sm font-semibold">
          <input type="checkbox" className="size-5" checked={b.showCopy} onChange={(e) => set((x) => void (x.showCopy = e.target.checked))} />
          Offer “Send to Client” (copy only, never sent)
        </label>
        <Field label="Tiles to open for the block to count as done">
          <input
            type="number"
            min={1}
            max={Math.max(1, b.tileIds.length)}
            className={input}
            value={b.toOpen}
            onChange={(e) => set((x) => void (x.toOpen = Math.max(1, Math.min(Math.max(1, x.tileIds.length), Math.round(Number(e.target.value) || 1)))))}
          />
        </Field>
      </div>

      <div className={cx(group, "mt-3")}>
        <div className="flex flex-wrap items-center justify-between gap-2">
          <h4 className="font-semibold">Tiles, in order</h4>
          <Link href="/admin/myths" className={btn.quiet} target="_blank">
            Open the library <Icon name="external" className="size-4" />
          </Link>
        </div>
        {lib.error && <p className="text-sm">{lib.error}</p>}
        {!lib.data && !lib.error && <p className="text-sm text-ink-muted">Loading the library…</p>}
        <ul className="mt-2 flex flex-col gap-2">
          {b.tileIds.map((id, i) => {
            const t = byId.get(id);
            return (
              <li key={id} className="flex flex-wrap items-center gap-2 rounded-xl bg-surface p-3">
                <span className="min-w-0 flex-1">
                  <span className="font-semibold">“{t?.latest.data.quote.replace(/^[“"]|[”"]$/g, "") ?? id}”</span>{" "}
                  {t ? <TileBadge t={t} /> : lib.data && <Badge tone="bad">Not in the library</Badge>}
                </span>
                <button
                  type="button"
                  className={btn.quiet}
                  aria-label="Move up"
                  disabled={i === 0}
                  onClick={() => set((x) => void x.tileIds.splice(i - 1, 0, ...x.tileIds.splice(i, 1)))}
                >
                  <Icon name="arrow-up" className="size-4" />
                </button>
                <button
                  type="button"
                  className={btn.quiet}
                  aria-label="Remove from this block"
                  onClick={() =>
                    set((x) => {
                      x.tileIds.splice(i, 1);
                      x.toOpen = Math.max(1, Math.min(x.toOpen, x.tileIds.length));
                    })
                  }
                >
                  <Icon name="trash" className="size-4" />
                </button>
              </li>
            );
          })}
        </ul>
        {tiles.some((t) => !b.tileIds.includes(t.id)) && (
          <div className="mt-3">
            <p className="text-sm font-semibold">Add from the library</p>
            <ul className="mt-1 flex flex-col gap-1">
              {tiles
                .filter((t) => !b.tileIds.includes(t.id))
                .map((t) => (
                  <li key={t.id}>
                    <button
                      type="button"
                      className="flex w-full items-center gap-2 rounded-xl p-2 text-left text-sm hover:bg-surface disabled:opacity-50"
                      disabled={b.tileIds.length >= 8}
                      onClick={() => set((x) => void x.tileIds.push(t.id))}
                    >
                      <Icon name="plus" className="size-4" />
                      <span className="flex-1">
                        “{t.latest.data.quote.replace(/^[“"]|[”"]$/g, "")}” <span className="text-ink-muted">· {CATEGORIES[t.latest.data.category]}</span>
                      </span>
                      <TileBadge t={t} />
                    </button>
                  </li>
                ))}
            </ul>
          </div>
        )}
      </div>
    </div>
  );
}

function TileBadge({ t }: { t: Loaded["tiles"][number] }) {
  if (t.live?.state === "approved") return <Badge tone="good">Live</Badge>;
  if (t.live) return <Badge tone="warn">Under review</Badge>;
  return <Badge>Draft only</Badge>;
}
