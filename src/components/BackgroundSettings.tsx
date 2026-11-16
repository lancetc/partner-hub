"use client";

import { useEffect, useId, useRef, useState, type CSSProperties } from "react";
import { api, useApi } from "@/lib/api";
import {
  BACKGROUND_EVENT,
  BRAND_COLOURS,
  backdropColour,
  pexelsSized,
  sameBackground,
  uploadSmallName,
  uploadUrl,
  type Background,
  type PexelsChoice,
} from "@/lib/background";
import { cx } from "@/lib/format";
import { Icon } from "./Icon";

/*
  Background, in Profile and settings: upload a photo, pick a Pexels stock photo, or one of the brand
  colours, or none. Picking a photo or colour previews it straight away, here and behind this page, and
  Save keeps it (on the server, so it follows the person to other devices). An upload is saved as soon
  as it's sent, like the profile picture.
*/

type Photos = { photos: PexelsChoice[]; configured: boolean; query: string; page: number; more: boolean };

const announce = (bg: Background) => window.dispatchEvent(new CustomEvent(BACKGROUND_EVENT, { detail: bg }));

/** A small, quick-loading version of a background, for the preview and the picker. */
function thumbStyle(bg: Background): CSSProperties {
  if (bg.kind === "pexels") return { backgroundColor: bg.color ?? undefined, backgroundImage: `url("${pexelsSized(bg.src, 640)}")` };
  if (bg.kind === "upload") return { backgroundColor: bg.color ?? undefined, backgroundImage: `url("${uploadUrl(uploadSmallName(bg.file))}")` };
  if (bg.kind === "colour") return { background: backdropColour(bg) ?? undefined };
  return {};
}

function describe(bg: Background) {
  if (bg.kind === "none") return "No background";
  if (bg.kind === "upload") return "Your photo";
  if (bg.kind === "pexels") return `Photo by ${bg.photographer} on Pexels`;
  return BRAND_COLOURS.find((c) => c.id === bg.id)?.label ?? "Colour";
}

export function BackgroundSettings() {
  const current = useApi<{ background: Background }>("/api/me/background");
  const saved = current.data?.background ?? null;
  const [pending, setPending] = useState<Background | null>(null);
  const shown = pending ?? saved;
  const [busy, setBusy] = useState<"save" | "upload" | null>(null);
  const [note, setNote] = useState<string | null>(null);
  const [problem, setProblem] = useState<string | null>(null);
  const savedRef = useRef<Background | null>(null);
  useEffect(() => {
    savedRef.current = saved;
  }, [saved]);

  // Leaving the page with an unsaved preview puts the saved background back.
  useEffect(
    () => () => {
      if (savedRef.current) announce(savedRef.current);
    },
    [],
  );

  function preview(bg: Background) {
    setNote(null);
    setProblem(null);
    const same = saved && sameBackground(bg, saved);
    setPending(same ? null : bg);
    announce(bg);
  }

  function cancel() {
    setPending(null);
    setProblem(null);
    if (saved) announce(saved);
  }

  function keep(bg: Background, message: string) {
    current.setData({ background: bg });
    setPending(null);
    announce(bg);
    setNote(message);
  }

  async function save() {
    if (!pending) return;
    setBusy("save");
    setProblem(null);
    try {
      const res = await api<{ background: Background }>("/api/me/background", { method: "PUT", body: pending });
      keep(res.background, "Background saved. It shows behind the main pages on all your devices.");
    } catch (e) {
      setProblem((e as Error).message);
    } finally {
      setBusy(null);
    }
  }

  async function upload(file: File) {
    setProblem(null);
    setNote(null);
    if (!file.type.startsWith("image/")) return setProblem("Choose a photo: a JPEG, PNG or WebP.");
    if (file.size > 15 * 1024 * 1024) return setProblem("That photo is over 15 MB. Try a smaller one.");
    setBusy("upload");
    try {
      const body = new FormData();
      body.append("file", file);
      const res = await fetch("/api/me/background/upload", { method: "POST", body });
      const data = (await res.json().catch(() => ({}))) as { background?: Background; error?: string };
      if (!res.ok || !data.background) throw new Error(data.error ?? "Couldn’t save that photo.");
      keep(data.background, "Your photo is now your background.");
    } catch (e) {
      setProblem((e as Error).message);
    } finally {
      setBusy(null);
    }
  }

  const is = (bg: Background) => Boolean(shown && sameBackground(bg, shown));

  return (
    <section id="background" className="mt-5 scroll-mt-24 rounded-3xl border border-line bg-surface p-5" aria-labelledby="background-heading">
      <h2 id="background-heading" className="flex items-center gap-2 font-serif text-xl font-semibold">
        <Icon name="image" className="size-5 text-accent" /> Background
      </h2>
      <p className="mt-1 text-ink-muted">
        Choose what shows behind the hub’s main pages: your own photo, a stock photo, or a colour. It’s saved to your account, so it follows you to other devices.
      </p>

      <Preview bg={shown} />

      <div className="mt-6 flex flex-col gap-6">
        <UploadPhoto busy={busy} onUpload={upload} has={saved?.kind === "upload"} />
        <StockPhotos is={is} onPick={preview} />
        <Colours is={is} onPick={preview} />
      </div>

      <div className="sticky bottom-20 z-10 mt-6 flex flex-wrap items-center gap-3 lg:bottom-4" aria-live="polite">
        {pending && (
          <div className="sticky flex w-full flex-wrap items-center gap-3 rounded-2xl border border-line bg-surface p-3 shadow-lg">
            <p className="min-w-0 flex-1 text-sm">
              <span className="font-semibold">Previewing:</span> {describe(pending)}
            </p>
            <button type="button" onClick={cancel} disabled={busy !== null} className="min-h-11 rounded-full px-4 font-semibold text-ink-muted hover:bg-muted hover:text-ink">
              Cancel
            </button>
            <button
              type="button"
              onClick={save}
              disabled={busy !== null}
              className="inline-flex min-h-11 items-center gap-2 rounded-full bg-action px-5 font-semibold text-on-action hover:bg-action-hover disabled:opacity-45"
            >
              {busy === "save" ? "Saving…" : "Save background"}
            </button>
          </div>
        )}
        {problem && (
          <p role="alert" className="w-full rounded-xl bg-orange/10 p-3 text-sm">
            {problem}
          </p>
        )}
        {note && !pending && <p className="text-sm text-ink-muted">{note}</p>}
      </div>
    </section>
  );
}

/** A small page over the background: a header bar and a card, both glass, so the effect can be judged before saving. */
function Preview({ bg }: { bg: Background | null }) {
  return (
    <figure className="mt-4">
      <div
        className="relative aspect-[16/9] overflow-hidden rounded-2xl border border-line bg-cover bg-center sm:aspect-[21/9]"
        style={bg ? thumbStyle(bg) : undefined}
      >
        {bg?.kind === "none" ? (
          <div className="absolute inset-0 bg-[#ffffff] dark:bg-[#2d4875]" />
        ) : (
          <div className="absolute inset-0" style={{ background: "var(--backdrop-veil)" }} />
        )}
        <div aria-hidden className="absolute inset-x-0 top-0 flex h-8 items-center gap-2 border-b border-white/40 bg-white/60 px-3 backdrop-blur-md dark:border-white/15 dark:bg-[#16264280]">
          <span className="h-2.5 w-14 rounded-full bg-[#102a43]/70 dark:bg-white/70" />
          <span className="ml-auto h-2.5 w-8 rounded-full bg-[#102a43]/30 dark:bg-white/30" />
          <span className="h-2.5 w-8 rounded-full bg-[#102a43]/30 dark:bg-white/30" />
        </div>
        <div
          aria-hidden
          className="absolute inset-x-[6%] bottom-0 top-12 rounded-t-2xl border border-white/60 bg-white/75 p-3 shadow-[inset_0_1px_0_rgb(255_255_255/0.85)] backdrop-blur-xl dark:border-white/15 dark:bg-[#162642bd] dark:shadow-[inset_0_1px_0_rgb(255_255_255/0.14)]"
        >
          <span className="block h-3 w-1/3 rounded-full bg-[#102a43]/80 dark:bg-white/85" />
          <span className="mt-2 block h-2 w-2/3 rounded-full bg-[#3d5068]/50 dark:bg-white/50" />
          <div className="mt-3 grid grid-cols-3 gap-2">
            {[0, 1, 2].map((i) => (
              <span key={i} className="h-10 rounded-lg border border-[#102a43]/10 bg-white/70 dark:border-white/15 dark:bg-white/10" />
            ))}
          </div>
        </div>
      </div>
      <figcaption className="mt-2 text-sm text-ink-muted">
        Preview{bg ? `: ${describe(bg)}` : ""}
        {bg?.kind === "pexels" && (
          <>
            {" · "}
            <a href={bg.photographerUrl} className="font-semibold text-accent underline underline-offset-2">
              {bg.photographer}
            </a>
            {" on "}
            <a href={bg.pageUrl} className="font-semibold text-accent underline underline-offset-2">
              Pexels
            </a>
          </>
        )}
      </figcaption>
    </figure>
  );
}

function UploadPhoto({ busy, has, onUpload }: { busy: "save" | "upload" | null; has: boolean; onUpload: (f: File) => void }) {
  const id = useId();
  const input = useRef<HTMLInputElement>(null);
  return (
    <div>
      <h3 className="font-semibold">Your own photo</h3>
      <p className="text-sm text-ink-muted">A landscape photo works best. It’s resized for phones and large screens, and only shown to you.</p>
      <label
        htmlFor={id}
        className="mt-2 inline-flex min-h-11 cursor-pointer items-center gap-2 rounded-full bg-[#008282] px-4 font-semibold text-white hover:bg-[#006b6b] has-[:disabled]:opacity-60"
      >
        <Icon name="upload" className="size-4" /> {busy === "upload" ? "Uploading…" : has ? "Upload a different photo" : "Upload a photo"}
        <input
          ref={input}
          id={id}
          type="file"
          accept="image/jpeg,image/png,image/webp"
          disabled={busy !== null}
          className="sr-only"
          onChange={(e) => {
            const f = e.target.files?.[0];
            if (f) onUpload(f);
            e.target.value = "";
          }}
        />
      </label>
    </div>
  );
}

function StockPhotos({ is, onPick }: { is: (bg: Background) => boolean; onPick: (bg: Background) => void }) {
  const [draft, setDraft] = useState("");
  const [query, setQuery] = useState("");
  const [extra, setExtra] = useState<{ query: string; pages: Photos[] }>({ query: "", pages: [] });
  const [loadingMore, setLoadingMore] = useState(false);
  const [moreError, setMoreError] = useState<string | null>(null);
  const first = useApi<Photos>(`/api/me/background/photos?q=${encodeURIComponent(query)}`);
  const firstPage = first.data && first.data.query === query.trim().slice(0, 100) ? first.data : null;
  const pages = firstPage ? [firstPage, ...(extra.query === query ? extra.pages : [])] : [];
  const photos = pages.flatMap((p) => p.photos);
  const last = pages.at(-1);

  async function more() {
    if (!last) return;
    setLoadingMore(true);
    setMoreError(null);
    try {
      const next = await api<Photos>(`/api/me/background/photos?q=${encodeURIComponent(query)}&page=${last.page + 1}`);
      setExtra((x) => ({ query, pages: [...(x.query === query ? x.pages : []), next] }));
    } catch (e) {
      setMoreError((e as Error).message);
    } finally {
      setLoadingMore(false);
    }
  }

  return (
    <div>
      <h3 className="font-semibold">Stock photos</h3>
      <p className="text-sm text-ink-muted">
        Free photos from{" "}
        <a href="https://www.pexels.com" className="font-semibold text-accent underline underline-offset-2">
          Pexels
        </a>
        , with each photographer credited.
      </p>
      {firstPage?.configured !== false ? (
        <form
          role="search"
          className="mt-3 flex gap-2"
          onSubmit={(e) => {
            e.preventDefault();
            setQuery(draft.trim());
          }}
        >
          <label className="min-w-0 flex-1">
            <span className="sr-only">Search Pexels photos</span>
            <input
              type="search"
              value={draft}
              onChange={(e) => setDraft(e.target.value)}
              placeholder="Search, like beach or garden"
              className="min-h-11 w-full rounded-xl border border-line-strong bg-surface px-3"
            />
          </label>
          <button type="submit" className="inline-flex min-h-11 items-center gap-1.5 rounded-full border border-line-strong px-4 font-semibold hover:bg-muted">
            <Icon name="search" className="size-4" /> Search
          </button>
          {query && (
            <button
              type="button"
              onClick={() => {
                setDraft("");
                setQuery("");
              }}
              className="min-h-11 rounded-full px-3 font-semibold text-ink-muted hover:bg-muted hover:text-ink"
            >
              Clear
            </button>
          )}
        </form>
      ) : (
        <p className="mt-2 text-sm text-ink-muted">Here’s a selection to choose from. (Searching Pexels needs its API key on the server.)</p>
      )}
      {first.error && (
        <p role="alert" className="mt-3 rounded-xl bg-orange/10 p-3 text-sm">
          {first.error}
        </p>
      )}
      {!firstPage && !first.error && <p className="mt-3 text-sm text-ink-muted">Loading photos…</p>}
      {firstPage && photos.length === 0 && <p className="mt-3 text-sm text-ink-muted">No photos found for “{query}”. Try another word.</p>}
      <ul className="mt-3 grid grid-cols-2 gap-2 sm:grid-cols-3">
        {photos.map((p) => {
          const selected = is(p);
          return (
            <li key={p.id}>
              <button
                type="button"
                aria-pressed={selected}
                onClick={() => onPick(p)}
                className={cx(
                  "group relative block aspect-[3/2] w-full overflow-hidden rounded-xl border-2 text-left",
                  selected ? "border-action" : "border-transparent hover:border-line-strong",
                )}
                style={{ backgroundColor: p.color ?? undefined }}
              >
                {/* eslint-disable-next-line @next/next/no-img-element -- Pexels' own small size, lazy-loaded */}
                <img src={pexelsSized(p.src, 480, 320)} alt={p.alt} loading="lazy" decoding="async" width={480} height={320} className="size-full object-cover" />
                <span className="absolute inset-x-0 bottom-0 truncate bg-gradient-to-t from-black/70 to-transparent px-2 pb-1 pt-4 text-xs text-white">{p.photographer}</span>
                {selected && (
                  <span className="absolute right-1.5 top-1.5 grid size-6 place-items-center rounded-full bg-action text-on-action">
                    <Icon name="check" className="size-4" />
                  </span>
                )}
              </button>
            </li>
          );
        })}
      </ul>
      {last?.more && (
        <button
          type="button"
          onClick={more}
          disabled={loadingMore}
          className="mt-3 inline-flex min-h-11 items-center rounded-full border border-line-strong px-4 font-semibold hover:bg-muted disabled:opacity-60"
        >
          {loadingMore ? "Loading…" : "More photos"}
        </button>
      )}
      {moreError && <p className="mt-2 text-sm font-semibold text-danger">{moreError}</p>}
      <p className="mt-2 text-xs text-ink-muted">
        Photos provided by{" "}
        <a href="https://www.pexels.com" className="underline underline-offset-2">
          Pexels
        </a>
        .
      </p>
    </div>
  );
}

function Colours({ is, onPick }: { is: (bg: Background) => boolean; onPick: (bg: Background) => void }) {
  const none: Background = { kind: "none" };
  return (
    <div>
      <h3 className="font-semibold">Colours</h3>
      <p className="text-sm text-ink-muted">Trilogy Care’s colours, plain or as a gradient. Or no background, for the classic look.</p>
      <ul className="mt-3 grid grid-cols-3 gap-2 sm:grid-cols-5">
        {BRAND_COLOURS.map((c) => {
          const bg: Background = { kind: "colour", id: c.id };
          const selected = is(bg);
          return (
            <li key={c.id}>
              <button
                type="button"
                aria-pressed={selected}
                onClick={() => onPick(bg)}
                className={cx("flex w-full flex-col gap-1 rounded-xl border-2 p-1 text-left", selected ? "border-action" : "border-transparent hover:border-line-strong")}
              >
                <span className="relative block h-14 w-full rounded-lg border border-line" style={{ background: c.css }}>
                  {selected && (
                    <span className="absolute right-1 top-1 grid size-6 place-items-center rounded-full bg-action text-on-action">
                      <Icon name="check" className="size-4" />
                    </span>
                  )}
                </span>
                <span className="px-1 text-xs font-medium">{c.label}</span>
              </button>
            </li>
          );
        })}
        <li>
          <button
            type="button"
            aria-pressed={is(none)}
            onClick={() => onPick(none)}
            className={cx("flex w-full flex-col gap-1 rounded-xl border-2 p-1 text-left", is(none) ? "border-action" : "border-transparent hover:border-line-strong")}
          >
            <span className="relative grid h-14 w-full place-items-center rounded-lg border border-dashed border-line-strong text-ink-muted">
              {is(none) ? (
                <span className="grid size-6 place-items-center rounded-full bg-action text-on-action">
                  <Icon name="check" className="size-4" />
                </span>
              ) : (
                <Icon name="close" className="size-5" />
              )}
            </span>
            <span className="px-1 text-xs font-medium">None</span>
          </button>
        </li>
      </ul>
    </div>
  );
}
