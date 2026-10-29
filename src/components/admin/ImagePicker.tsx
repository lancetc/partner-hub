"use client";

import { useEffect, useMemo, useRef, useState } from "react";
import { useApi } from "@/lib/api";
import { cx } from "@/lib/format";
import { Icon } from "../Icon";
import { btn, ErrorNote } from "./ui";
import { uploadImage } from "./LessonEditor";

/*
  Choosing a picture: a drop zone (drag a file in, or upload), and a large, searchable image library
  in its own window. Uploads are converted and compressed on the server like every other picture.
*/

export type Picture = { src: string; width: number; height: number };
type Upload = Picture & { name: string; uploadedAt?: string };

/** Uploads the first image file in a drop or file picker, reporting progress and problems. */
function useUpload(onDone: (p: Picture) => void) {
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const upload = async (file?: File | null) => {
    if (!file) return;
    setBusy(true);
    setError(null);
    try {
      const p = await uploadImage(file);
      onDone({ src: p.src, width: p.width, height: p.height });
    } catch (e) {
      setError((e as Error).message);
    } finally {
      setBusy(false);
    }
  };
  return { busy, error, upload };
}

/** The image library, big enough to see what each picture is, with search and an upload tile. */
export function ImageLibraryDialog({ open, onClose, onPick, current }: { open: boolean; onClose: () => void; onPick: (p: Picture) => void; current?: string }) {
  const ref = useRef<HTMLDialogElement>(null);
  const [q, setQ] = useState("");
  const [over, setOver] = useState(false);
  const { data, error: loadError } = useApi<{ uploads: Upload[] }>(open ? "/api/admin/uploads" : null);
  const pick = (p: Picture) => {
    onPick(p);
    onClose();
  };
  const { busy, error, upload } = useUpload(pick);
  useEffect(() => {
    const d = ref.current;
    if (!d) return;
    if (open && !d.open) d.showModal();
    if (!open && d.open) d.close();
  }, [open]);
  const shown = useMemo(() => (data?.uploads ?? []).filter((u) => !q.trim() || u.name.toLowerCase().includes(q.trim().toLowerCase())), [data, q]);

  return (
    <dialog
      ref={ref}
      aria-labelledby="image-library-title"
      onClose={onClose}
      onClick={(e) => e.target === ref.current && onClose()}
      className="m-auto h-[min(48rem,92vh)] w-[min(64rem,96vw)] max-w-none rounded-3xl border border-line bg-bg p-0 text-ink backdrop:bg-[var(--overlay)]"
    >
      <div className="flex h-full flex-col">
        <header className="flex flex-wrap items-center gap-3 border-b border-line px-5 py-3">
          <h2 id="image-library-title" className="font-serif text-xl font-semibold">
            Image library
          </h2>
          <label className="ml-auto flex min-w-0 flex-1 items-center gap-2 rounded-full border border-line-strong bg-surface px-3 sm:max-w-xs">
            <Icon name="search" className="size-4 text-ink-muted" />
            <span className="sr-only">Search pictures by name</span>
            <input value={q} onChange={(e) => setQ(e.target.value)} placeholder="Search by name" className="min-h-10 w-full bg-transparent outline-none" />
          </label>
          <button type="button" onClick={onClose} aria-label="Close" className="grid size-10 place-items-center rounded-full hover:bg-muted">
            <Icon name="close" className="size-5" />
          </button>
        </header>
        <div className="min-h-0 flex-1 overflow-y-auto p-5">
          {(error || loadError) && (
            <div className="mb-3">
              <ErrorNote text={error ?? loadError!} />
            </div>
          )}
          <ul className="grid grid-cols-2 gap-4 sm:grid-cols-3 lg:grid-cols-4">
            <li>
              <label
                onDragOver={(e) => {
                  e.preventDefault();
                  setOver(true);
                }}
                onDragLeave={() => setOver(false)}
                onDrop={(e) => {
                  e.preventDefault();
                  setOver(false);
                  upload(e.dataTransfer.files[0]);
                }}
                className={cx(
                  "flex aspect-[4/3] cursor-pointer flex-col items-center justify-center gap-2 rounded-2xl border-2 border-dashed p-3 text-center text-sm",
                  over ? "border-action bg-tealtint" : "border-line-strong hover:border-action hover:bg-muted",
                )}
              >
                <Icon name="upload" className="size-6 text-accent" />
                <span className="font-semibold">{busy ? "Uploading…" : "Upload a picture"}</span>
                <span className="text-xs text-ink-muted">or drop one here</span>
                <input type="file" accept="image/*" className="sr-only" onChange={(e) => upload(e.target.files?.[0])} />
              </label>
            </li>
            {!data && !loadError && <li className="col-span-full p-2 text-ink-muted">Loading pictures…</li>}
            {shown.map((u) => (
              <li key={u.src}>
                <button
                  type="button"
                  onClick={() => pick(u)}
                  className={cx(
                    "group block w-full overflow-hidden rounded-2xl bg-surface text-left ring-2 transition-shadow",
                    current === u.src ? "ring-action" : "ring-line hover:ring-line-strong",
                  )}
                >
                  <span className="relative block aspect-[4/3] bg-muted">
                    {/* eslint-disable-next-line @next/next/no-img-element */}
                    <img src={u.src} alt="" loading="lazy" className="absolute inset-0 size-full object-cover" />
                    {current === u.src && (
                      <span className="absolute right-2 top-2 rounded-full bg-action px-2 py-0.5 text-xs font-bold text-on-action">In use</span>
                    )}
                  </span>
                  <span className="block truncate px-2.5 py-2 text-xs">
                    <span className="font-semibold">{u.name}</span>
                    <span className="text-ink-muted">
                      {" "}
                      · {u.width}×{u.height}
                    </span>
                  </span>
                </button>
              </li>
            ))}
            {data && !shown.length && q && <li className="col-span-full p-2 text-ink-muted">No pictures match “{q}”.</li>}
          </ul>
        </div>
      </div>
    </dialog>
  );
}

/**
  A picture field that's a drop zone: drag an image onto it, upload, or choose from the library.
  `preview` replaces the plain picture when the field has its own way of showing one.
*/
export function ImageDropZone({
  picture,
  onChange,
  label = "Drag an image here",
  aspect = "aspect-[16/10]",
  preview,
}: {
  picture?: Picture;
  onChange: (p: Picture | undefined) => void;
  label?: string;
  aspect?: string;
  preview?: React.ReactNode;
}) {
  const [over, setOver] = useState(false);
  const [library, setLibrary] = useState(false);
  const { busy, error, upload } = useUpload(onChange);
  return (
    <div className="flex flex-col gap-2">
      <div
        onDragOver={(e) => {
          e.preventDefault();
          setOver(true);
        }}
        onDragLeave={() => setOver(false)}
        onDrop={(e) => {
          e.preventDefault();
          setOver(false);
          upload(e.dataTransfer.files[0]);
        }}
        className={cx(
          "relative overflow-hidden rounded-2xl",
          aspect,
          !picture && "border-2 border-dashed",
          over ? "border-action ring-4 ring-action/40" : "border-line-strong",
        )}
      >
        {picture ? (
          (preview ?? (
            // eslint-disable-next-line @next/next/no-img-element
            <img src={picture.src} alt="" className="absolute inset-0 size-full object-cover" />
          ))
        ) : (
          <label className="absolute inset-0 flex cursor-pointer flex-col items-center justify-center gap-1.5 p-4 text-center text-sm hover:bg-muted">
            <Icon name="image" className="size-7 text-accent" />
            <span className="font-semibold">{label}</span>
            <span className="text-xs text-ink-muted">or click to upload</span>
            <input type="file" accept="image/*" className="sr-only" onChange={(e) => upload(e.target.files?.[0])} />
          </label>
        )}
        {(busy || (over && picture)) && (
          <span className="absolute inset-0 grid place-items-center bg-black/50 px-4 text-center font-semibold text-white">
            {busy ? "Uploading…" : "Drop to replace this picture"}
          </span>
        )}
      </div>
      <div className="flex flex-wrap gap-2">
        {picture && (
          <label className={cx(btn.secondary, "cursor-pointer")}>
            <Icon name="upload" className="size-4" /> Replace
            <input type="file" accept="image/*" className="sr-only" onChange={(e) => upload(e.target.files?.[0])} />
          </label>
        )}
        <button type="button" className={btn.secondary} onClick={() => setLibrary(true)}>
          <Icon name="image" className="size-4" /> Image library
        </button>
        {picture && (
          <button type="button" className={btn.quiet} onClick={() => onChange(undefined)}>
            Remove
          </button>
        )}
      </div>
      {error && <ErrorNote text={error} />}
      <ImageLibraryDialog open={library} onClose={() => setLibrary(false)} onPick={onChange} current={picture?.src} />
    </div>
  );
}
