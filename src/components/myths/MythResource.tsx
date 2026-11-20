"use client";

import { useState } from "react";
import { useApi } from "@/lib/api";
import { cx } from "@/lib/format";
import { CATEGORIES, matchTiles, TILE_AUDIENCES, TILE_NOTICE, type Category, type TileAudience } from "@/lib/myths";
import type { tilesFor } from "@/server/myths";
import { MythTile } from "./MythTile";

/*
  Myth vs Reality in Resources (docs/myth-vs-reality.md): every approved tile from the library, the same versions
  courses show. Search by a phrase someone used, and filter by topic and audience. Quick-reference: no practice step.
*/

type Loaded = ReturnType<typeof tilesFor>;
const chip = "min-h-11 rounded-full px-4 text-sm font-semibold ring-1";

export function MythResource() {
  const loaded = useApi<Loaded>("/api/myths");
  const [q, setQ] = useState("");
  const [category, setCategory] = useState<Category | "">("");
  const [audience, setAudience] = useState<TileAudience | "">("");
  const tiles = loaded.data ? matchTiles(loaded.data.tiles, q, category, audience) : [];
  return (
    <div className="mt-6">
      <div className="flex flex-col gap-3 rounded-3xl bg-surface p-4 ring-1 ring-line sm:p-5">
        <label className="flex flex-col gap-1">
          <span className="text-sm font-semibold">Search by what they said</span>
          <input
            type="search"
            className="min-h-11 rounded-xl border border-line-strong bg-bg px-3"
            placeholder="For example: roll over, self-manage, care plan"
            value={q}
            onChange={(e) => setQ(e.target.value)}
          />
        </label>
        <div role="group" aria-label="Topic" className="flex flex-wrap gap-2">
          {(["", ...Object.keys(CATEGORIES)] as (Category | "")[]).map((c) => (
            <button
              key={c || "all"}
              type="button"
              aria-pressed={category === c}
              className={cx(chip, category === c ? "bg-action text-on-action ring-action" : "bg-surface ring-line-strong hover:bg-muted")}
              onClick={() => setCategory(c)}
            >
              {c ? CATEGORIES[c] : "All topics"}
            </button>
          ))}
        </div>
        <label className="flex items-center gap-2 text-sm">
          <span className="font-semibold">For</span>
          <select
            className="min-h-11 rounded-xl border border-line-strong bg-bg px-3"
            value={audience}
            onChange={(e) => setAudience(e.target.value as TileAudience | "")}
          >
            <option value="">Everyone</option>
            {(Object.keys(TILE_AUDIENCES) as TileAudience[]).map((a) => (
              <option key={a} value={a}>
                {TILE_AUDIENCES[a]}
              </option>
            ))}
          </select>
        </label>
      </div>
      <p className="mt-3 text-sm text-ink-muted">{TILE_NOTICE}</p>
      {loaded.error ? (
        <p role="alert" className="mt-4">
          {loaded.error}
        </p>
      ) : !loaded.data ? (
        <p className="mt-4 text-ink-muted">Loading…</p>
      ) : (
        <>
          <p role="status" className="mt-3 text-sm font-semibold">
            {loaded.data.tiles.length === 0
              ? "No questions have been approved yet."
              : `${tiles.length} ${tiles.length === 1 ? "question" : "questions"}${q || category || audience ? " match" : ""}`}
          </p>
          <ul className="mt-3 grid gap-4 md:grid-cols-2 xl:grid-cols-3">
            {tiles.map((t) => (
              <li key={t.id}>
                <MythTile tile={t} mode="quick" practice={false} showCopy />
              </li>
            ))}
          </ul>
        </>
      )}
    </div>
  );
}
