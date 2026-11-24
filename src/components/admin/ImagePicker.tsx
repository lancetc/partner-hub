"use client";

import { useEffect, useMemo, useRef, useState } from "react";
import { createPortal } from "react-dom";
import { api, useApi } from "@/lib/api";
import { cx } from "@/lib/format";
import { Icon } from "../Icon";
import { ImageGenerator } from "./ImageGenerator";
import { ImageCropper } from "./ImageCropper";
import { btn, ErrorNote } from "./ui";
import { PexelsPicker, uploadImage } from "./LessonEditor";

/*
  Choosing a picture: a drop zone (drag a file in, or upload), and a large, searchable image library
  in its own window. Uploads are converted and compressed on the server like every other picture.
*/

export type Picture = { src: string; width: number; height: number };
/** A library picture: its file name, and the title and description (alt text) written for it in the image library. */
type Upload = Picture & { name: string; title?: string; alt?: string; uploadedAt?: string };
/** A picked picture, with its library description when it has one, offered as its alt text where it’s placed. */
export type PickedPicture = Picture & { alt?: string };

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
export function ImageLibraryDialog({
  open,
  onClose,
  onPick,
  current,
}: {
  open: boolean;
  onClose: () => void;
  onPick: (p: PickedPicture) => void;
  current?: string;
}) {
  const ref = useRef<HTMLDialogElement>(null);
  const [q, setQ] = useState("");
  const [over, setOver] = useState(false);
  const { data, error: loadError } = useApi<{ uploads: Upload[] }>(open ? "/api/admin/uploads" : null);
  const pick = (p: PickedPicture) => {
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
  // Search looks through each picture’s title, description and file name.
  const shown = useMemo(() => {
    const words = q.trim().toLowerCase();
    return (data?.uploads ?? []).filter((u) => !words || [u.title ?? "", u.alt ?? "", u.name].some((t) => t.toLowerCase().includes(words)));
  }, [data, q]);

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
                  onClick={() => pick({ src: u.src, width: u.width, height: u.height, ...(u.alt ? { alt: u.alt } : {}) })}
                  title={u.alt || u.title || u.name}
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
                    <span className="font-semibold">{u.title || u.name}</span>
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
  addLabel,
}: {
  picture?: Picture;
  onChange: (p: Picture | undefined, how?: "crop" | "pexels", alt?: string) => void;
  label?: string;
  aspect?: string;
  preview?: React.ReactNode;
  /** With no picture yet, a button that says what to add (e.g. "Add poster image"), beside Image library. */
  addLabel?: string;
}) {
  const [over, setOver] = useState(false);
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
      <PictureActions picture={picture} onChange={onChange} upload={upload} busy={busy} addLabel={addLabel} />
      {error && <ErrorNote text={error} />}
    </div>
  );
}

/**
  A picture's buttons: Crop, Replace, Image library, Generate with AI and Remove (or, with no picture yet,
  the add button). Shared by the picture box and pictures shown elsewhere, like a decision's photo.
*/
export function PictureActions({
  picture,
  onChange,
  upload,
  busy,
  addLabel,
}: {
  picture?: Picture;
  /** "crop" when it is a cropped copy of the same picture; a description comes with a Pexels photo. */
  onChange: (p: Picture | undefined, how?: "crop" | "pexels", alt?: string) => void;
  upload: (file?: File | null) => void;
  busy: boolean;
  addLabel?: string;
}) {
  const [library, setLibrary] = useState(false);
  const [generating, setGenerating] = useState(false);
  const [cropping, setCropping] = useState(false);
  const [pexels, setPexels] = useState(false);
  return (
    <>
      <div className="flex flex-wrap gap-2">
        {!picture && addLabel && (
          <label className={cx(btn.primary, "cursor-pointer", busy && "pointer-events-none opacity-60")}>
            <Icon name="plus" className="size-4" /> {busy ? "Uploading…" : addLabel}
            <input type="file" accept="image/*" className="sr-only" disabled={busy} onChange={(e) => upload(e.target.files?.[0])} />
          </label>
        )}
        {picture && (
          <button type="button" className={btn.secondary} onClick={() => setCropping(true)}>
            <Icon name="crop" className="size-4" /> Crop
          </button>
        )}
        {picture && (
          <label className={cx(btn.secondary, "cursor-pointer")}>
            <Icon name="upload" className="size-4" /> Replace
            <input type="file" accept="image/*" className="sr-only" onChange={(e) => upload(e.target.files?.[0])} />
          </label>
        )}
        <button type="button" className={btn.secondary} onClick={() => setLibrary(true)}>
          <Icon name="image" className="size-4" /> Image library
        </button>
        <button type="button" className={btn.secondary} onClick={() => setGenerating(true)}>
          <Icon name="spark" className="size-4" /> Generate with AI
        </button>
        <button type="button" className={btn.secondary} onClick={() => setPexels(true)}>
          <Icon name="search" className="size-4" /> Pexels
        </button>
        {picture && (
          <button type="button" className={btn.quiet} onClick={() => onChange(undefined)}>
            Remove
          </button>
        )}
      </div>
      {/* A library picture brings its description with it, as the alt text to start from. */}
      <ImageLibraryDialog
        open={library}
        onClose={() => setLibrary(false)}
        onPick={(p) => onChange({ src: p.src, width: p.width, height: p.height }, undefined, p.alt)}
        current={picture?.src}
      />
      {pexels && (
        <Overlay>
          <div
            role="dialog"
            aria-modal="true"
            aria-label="Find a photo on Pexels"
            className="fixed inset-0 z-50 grid place-items-center overflow-y-auto bg-[#0b1626]/70 p-4"
          >
            <div className="w-full max-w-3xl rounded-3xl bg-surface p-5 shadow-2xl">
              <PexelsPicker
                onClose={() => setPexels(false)}
                onPicked={(p, alt) => {
                  onChange({ src: p.src, width: p.width, height: p.height }, "pexels", alt);
                  setPexels(false);
                }}
              />
            </div>
          </div>
        </Overlay>
      )}
      {cropping && picture && (
        <ImageCropper
          picture={picture}
          onClose={() => setCropping(false)}
          onDone={(p) => {
            onChange(p, "crop");
            setCropping(false);
          }}
        />
      )}
      {generating && (
        <Overlay>
          <div
            role="dialog"
            aria-modal="true"
            aria-label="Generate a picture"
            className="fixed inset-0 z-50 grid place-items-center overflow-y-auto bg-[#0b1626]/70 p-4"
          >
            <div className="w-full max-w-2xl rounded-3xl bg-surface p-5 shadow-2xl">
              <div className="mb-3 flex items-center justify-between gap-2">
                <h2 className="flex items-center gap-2 font-serif text-xl font-semibold">
                  <Icon name="spark" className="size-5 text-accent" /> Generate a picture
                </h2>
                <button type="button" className={btn.quiet} onClick={() => setGenerating(false)}>
                  Close
                </button>
              </div>
              <ImageGenerator
                useLabel="Use this picture"
                defaultAspect="3:2"
                onUse={(p) => {
                  onChange(p);
                  setGenerating(false);
                }}
              />
            </div>
          </div>
        </Overlay>
      )}
    </>
  );
}

/**
  A pop-up window drawn at the top of the page, not inside whatever opened it: a picture box in the
  editor's scrolling sidebar would otherwise trap it in its own layer, under the page.
*/
export function Overlay({ children }: { children: React.ReactNode }) {
  return createPortal(children, document.body);
}

/** The picture buttons on their own, uploading for themselves: for a picture shown somewhere else on the page. */
export function PictureButtons({
  picture,
  onChange,
}: {
  picture?: Picture;
  onChange: (p: Picture | undefined, how?: "crop" | "pexels", alt?: string) => void;
}) {
  const { busy, error, upload } = useUpload(onChange);
  return (
    <div className="flex flex-col gap-2">
      <PictureActions picture={picture} onChange={onChange} upload={upload} busy={busy} />
      {busy && <p className="text-sm text-ink-muted">Uploading…</p>}
      {error && <ErrorNote text={error} />}
    </div>
  );
}

/**
  Describe with AI: asks OpenAI to suggest the picture's description (its alt text), with a line about
  where it sits for context. The suggestion lands in the box to read and edit.
*/
export function DescribeButton({ src, context, onAlt, className }: { src: string; context?: string; onAlt: (alt: string) => void; className?: string }) {
  const [busy, setBusy] = useState(false);
  const [problem, setProblem] = useState<string | null>(null);
  if (!src) return null;
  return (
    <span className={cx("inline-flex flex-col gap-1", className)}>
      <button
        type="button"
        disabled={busy}
        onClick={async () => {
          setBusy(true);
          setProblem(null);
          try {
            const r = await api<{ alt: string }>("/api/admin/describe-image", { body: { src, context } });
            onAlt(r.alt);
          } catch (e) {
            setProblem(e instanceof Error ? e.message : "That didn’t work.");
          } finally {
            setBusy(false);
          }
        }}
        className="inline-flex items-center gap-1 self-start text-xs font-semibold text-accent hover:underline disabled:opacity-50"
      >
        <Icon name="spark" className="size-3.5" /> {busy ? "Describing…" : "Describe with AI"}
      </button>
      {problem && <span className="text-xs text-danger">{problem}</span>}
    </span>
  );
}
