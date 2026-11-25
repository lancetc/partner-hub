"use client";

import { useEffect, useState } from "react";
import { useApi } from "@/lib/api";
import { cx } from "@/lib/format";
import { CATEGORIES, DEMO_LABEL, filterCategories, matchTiles, TILE_AUDIENCES, TILE_NOTICE, type Category, type TileAudience } from "@/lib/myths";
import type { tilesFor } from "@/server/myths";
import { MythTile } from "./MythTile";

/*
  Myth vs Reality in Resources (docs/myth-vs-reality.md). The live library: every approved, current tile, the same
  versions courses show. Search by a phrase someone used (in their words or the professional term), and filter by
  topic and audience. Quick-reference: no practice step. Approved tiles can be saved to Favourites and pinned.

  Authors can switch to the preview: drafts and demonstration entries too, each labelled on the card, under a
  banner that says learners don't see them. `?preview=1` opens it; `?tile=<id>` opens that tile (from a pin,
  a favourite or search).
*/

type Loaded = ReturnType<typeof tilesFor>;
const chip = "min-h-11 rounded-full px-4 text-sm font-semibold ring-1";

export function MythResource() {
  const [preview, setPreview] = useState(false);
  const [opened, setOpened] = useState("");
  const loaded = useApi<Loaded>(`/api/myths${preview ? "?preview=1" : ""}`);
  const [q, setQ] = useState("");
  const [category, setCategory] = useState<Category | "">("");
  const [audience, setAudience] = useState<TileAudience | "">("");
  // The page's own address, read once it's in the browser (no server render depends on it).
  useEffect(() => {
    const p = new URLSearchParams(window.location.search);
    /* eslint-disable react-hooks/set-state-in-effect -- read once from the address after hydration */
    if (p.get("preview") === "1") setPreview(true);
    setOpened(p.get("tile") ?? "");
    /* eslint-enable react-hooks/set-state-in-effect */
  }, []);
  const all = loaded.data?.tiles ?? [];
  const tiles = matchTiles(all, q, category, audience);
  const switchTo = (on: boolean) => {
    setPreview(on);
    const url = new URL(window.location.href);
    if (on) url.searchParams.set("preview", "1");
    else url.searchParams.delete("preview");
    window.history.replaceState(null, "", url);
  };
  return (
    <div className="mt-6">
      {loaded.data?.canPreview && (
        <div
          className={cx(
            "mb-4 rounded-3xl p-4 ring-1 sm:p-5",
            preview ? "bg-[#fff1cc] text-[#4a3400] ring-[#e0b44a] dark:bg-[#3d2f08] dark:text-[#ffd97a]" : "bg-surface ring-line",
          )}
        >
          <div className="flex flex-wrap items-center justify-between gap-3">
            <p className="font-semibold">{preview ? `Preview for authors · ${DEMO_LABEL}` : "You’re seeing the live library: approved entries only."}</p>
            <button
              type="button"
              aria-pressed={preview}
              className={cx(chip, "bg-surface text-ink ring-line-strong hover:bg-muted")}
              onClick={() => switchTo(!preview)}
            >
              {preview ? "Back to the live library" : "Show drafts and demo content"}
            </button>
          </div>
          {preview && (
            <p className="mt-1 text-sm">
              Drafts and demonstration entries are shown with the approved ones, each labelled. Learners don’t see them. None is an approved Trilogy Care
              communication: don’t send their wording, and anything copied from them starts with a do-not-send line.
            </p>
          )}
        </div>
      )}
      <div className="flex flex-col gap-3 rounded-3xl bg-surface p-4 ring-1 ring-line sm:p-5">
        <label className="flex flex-col gap-1">
          <span className="text-sm font-semibold">Search by what they said</span>
          <input
            type="search"
            className="min-h-11 rounded-xl border border-line-strong bg-bg px-3"
            placeholder="For example: lose my money, quarter end, my own gardener"
            value={q}
            onChange={(e) => setQ(e.target.value)}
          />
        </label>
        <div role="group" aria-label="Topic" className="flex flex-wrap gap-2">
          {(["", ...filterCategories(all)] as (Category | "")[]).map((c) => (
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
            {all.length === 0
              ? "No questions have been approved yet."
              : `${tiles.length} ${tiles.length === 1 ? "question" : "questions"}${q || category || audience ? " match" : ""}${preview ? " (preview)" : ""}`}
          </p>
          <ul className="mt-3 grid gap-4 md:grid-cols-2 xl:grid-cols-3">
            {tiles.map((t) => (
              <li key={`${t.id}:${t.version}`} id={`myth-${t.id}`}>
                <MythTile
                  tile={t}
                  mode="quick"
                  practice={false}
                  showCopy
                  fav={loaded.data!.favs[t.id] ?? null}
                  onFavChanged={loaded.reload}
                  startOpen={opened === t.id}
                />
              </li>
            ))}
          </ul>
        </>
      )}
    </div>
  );
}
