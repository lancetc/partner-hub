"use client";

import { useMemo, useRef, useState } from "react";
import Link from "next/link";
import { api, useApi } from "@/lib/api";
import { confirmAction } from "@/lib/confirm";
import { cx, formatDate } from "@/lib/format";
import { AdminShell, btn, ErrorNote } from "./ui";
import { LIBRARY, PexelsPicker, replaceImage, uploadImage } from "./LessonEditor";
import { ImageGenerator } from "./ImageGenerator";
import { ImageCropper } from "./ImageCropper";
import { Icon } from "../Icon";

/*
  The image library, on its own page: every picture authors can choose from (uploads, AI pictures, Pexels
  photos and the Hub's built-in ones). Add pictures; replace one everywhere it's used; crop a copy; see
  where each is used; delete one (the file is kept, so anything still using it keeps showing it) or
  bring a deleted one back; and tidy away duplicate copies.
*/

type Item = {
  src: string;
  width: number;
  height: number;
  /** The file's own name, as it arrived. */
  name?: string;
  /** Its title in the library; empty when nobody has named it and its file name says nothing. */
  title?: string;
  /** Its description for screen readers, offered as alt text wherever it's placed. */
  alt?: string;
  uploadedAt?: string;
  credit?: { name: string; source: string };
};
type Library = { uploads: Item[]; deleted: Item[]; hiddenBuiltIns: string[] };
type Usage = { lessons: { slug: string; title: string }[]; magazines?: { id: string; title: string }[] };

const fileOf = (src: string) => src.split("/").pop() ?? "";
const isUpload = (src: string) => src.startsWith("/api/uploads/");
const usageUrl = (src: string) =>
  isUpload(src) ? `/api/admin/uploads/${encodeURIComponent(fileOf(src))}` : `/api/admin/uploads/built-in?src=${encodeURIComponent(src)}`;
/** What to call it: its title, else (for an upload nobody has named) "Untitled picture", else the built-in file's name. */
const nameOf = (p: Item) => p.title || (isUpload(p.src) ? "Untitled picture" : p.name || fileOf(p.src));
/** An upload without a description, which the library asks for. Built-in pictures are described where they're used. */
const needsWords = (p: Item) => isUpload(p.src) && !p.alt;

export function ImageLibraryAdmin() {
  const { data, error, reload } = useApi<Library>("/api/admin/uploads");
  const [query, setQuery] = useState("");
  const [tab, setTab] = useState<"library" | "deleted">("library");
  const [note, setNote] = useState<string | null>(null);
  const [problem, setProblem] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);
  const [adding, setAdding] = useState<"ai" | "pexels" | null>(null);
  const [cropping, setCropping] = useState<Item | null>(null);
  const [usage, setUsage] = useState<Record<string, Usage | "loading">>({});
  // The picture whose title and description are open for editing, and whether only undescribed ones are shown.
  const [editing, setEditing] = useState<string | null>(null);
  const [needsOnly, setNeedsOnly] = useState(false);
  const uploadInput = useRef<HTMLInputElement>(null);
  const replaceInput = useRef<HTMLInputElement>(null);
  const replaceFor = useRef<Item | null>(null);

  const hidden = useMemo(() => data?.hiddenBuiltIns ?? [], [data]);
  const library: Item[] = useMemo(() => [...(data?.uploads ?? []), ...LIBRARY.filter((p) => !hidden.includes(p.src))], [data, hidden]);
  const deleted: Item[] = useMemo(() => [...(data?.deleted ?? []), ...LIBRARY.filter((p) => hidden.includes(p.src))], [data, hidden]);
  const q = query.trim().toLowerCase();
  // Search looks through each picture's title, description and file name.
  const list = (tab === "library" ? library : deleted).filter(
    (p) => (!q || [nameOf(p), p.alt ?? "", p.name ?? ""].some((t) => t.toLowerCase().includes(q))) && (!needsOnly || needsWords(p)),
  );
  const needCount = library.filter(needsWords).length;

  const run = async (fn: () => Promise<string | void>) => {
    setProblem(null);
    setNote(null);
    setBusy(true);
    try {
      const done = await fn();
      if (done) setNote(done);
      reload();
    } catch (e) {
      setProblem(e instanceof Error ? e.message : "That didn’t work.");
    } finally {
      setBusy(false);
    }
  };
  const whereUsed = async (p: Item) => {
    setUsage((u) => ({ ...u, [p.src]: "loading" }));
    try {
      const u = await api<Usage>(usageUrl(p.src));
      setUsage((x) => ({ ...x, [p.src]: u }));
      return u;
    } catch (e) {
      setUsage((x) => {
        const next = { ...x };
        delete next[p.src];
        return next;
      });
      throw e;
    }
  };
  const usedIn = (u: Usage) => [...u.lessons.map((l) => `the topic “${l.title}”`), ...(u.magazines ?? []).map((m) => `the Magazine course “${m.title}”`)];

  const upload = (files: FileList | null) =>
    run(async () => {
      const all = Array.from(files ?? []);
      const added: string[] = [];
      for (const f of all) added.push((await uploadImage(f)).src);
      if (uploadInput.current) uploadInput.current.value = "";
      // Straight into naming and describing the first new one, while what it shows is fresh in mind.
      if (added[0]) {
        setTab("library");
        setEditing(added[0]);
      }
      return all.length
        ? `Added ${all.length} ${all.length === 1 ? "picture" : "pictures"}. Give ${all.length === 1 ? "it" : "each"} a title and a description so authors and screen readers know what it shows.`
        : undefined;
    });
  const remove = (p: Item) =>
    run(async () => {
      const where = usedIn(await whereUsed(p));
      const ok = await confirmAction(
        where.length
          ? `It’s still used in ${where.join(", ")}. Those keep showing it, but it can’t be picked from the library again until you restore it.`
          : "It leaves the image library. You can restore it from Deleted.",
        { title: `Delete “${nameOf(p)}”?`, confirmLabel: "Delete", danger: true },
      );
      if (!ok) return;
      if (isUpload(p.src)) await api(usageUrl(p.src), { method: "DELETE" });
      else await api("/api/admin/uploads/built-in", { body: { src: p.src, hidden: true } });
      return `Deleted “${nameOf(p)}”. It’s under Deleted if you need it back.`;
    });
  const restore = (p: Item) =>
    run(async () => {
      if (isUpload(p.src)) await api(usageUrl(p.src), { body: { action: "restore" } });
      else await api("/api/admin/uploads/built-in", { body: { src: p.src, hidden: false } });
      return `“${nameOf(p)}” is back in the library.`;
    });
  const replace = (p: Item, file: File) =>
    run(async () => {
      const where = usedIn(await whereUsed(p));
      const ok = await confirmAction(
        where.length
          ? `Everywhere it’s used changes to the new picture, in ${where.join(", ")}, including what learners see now.`
          : "The new picture takes its place in the library.",
        { title: `Replace “${nameOf(p)}” with “${file.name}”?`, confirmLabel: "Replace" },
      );
      if (!ok) return;
      const next = await replaceImage(fileOf(p.src), file);
      return next.lessons.length ? `Replaced in ${next.lessons.length} ${next.lessons.length === 1 ? "place" : "places"}.` : "Picture replaced.";
    });
  const merge = () =>
    run(async () => {
      const r = await api<{ pictures: number; removed: number }>("/api/admin/uploads/duplicates", { body: {} });
      return r.removed
        ? `Removed ${r.removed} duplicate ${r.removed === 1 ? "copy" : "copies"} of ${r.pictures} ${r.pictures === 1 ? "picture" : "pictures"}. Everything uses the copy kept.`
        : "No duplicates: each picture is in the library once.";
    });

  return (
    <AdminShell title="Image library">
      <div className="flex flex-col gap-5">
        <p className="max-w-3xl text-ink-muted">
          Every picture authors can choose from in Topics, the Magazine and News. Replacing a picture changes it everywhere it’s used. Deleting one takes it out
          of the library, but anything still using it keeps showing it, and you can bring it back.
        </p>
        <div className="flex flex-wrap items-center gap-2">
          <label className={cx(btn.primary, "cursor-pointer", busy && "pointer-events-none opacity-60")}>
            <Icon name="upload" className="size-4" /> Upload pictures
            <input ref={uploadInput} type="file" accept="image/*" multiple className="sr-only" onChange={(e) => void upload(e.target.files)} />
          </label>
          <button type="button" className={btn.secondary} onClick={() => setAdding("ai")}>
            <Icon name="spark" className="size-4" /> Generate with AI
          </button>
          <button type="button" className={btn.secondary} onClick={() => setAdding("pexels")}>
            <Icon name="search" className="size-4" /> Pexels
          </button>
          <Link href="/admin/images/characters" className={btn.secondary}>
            <Icon name="people" className="size-4" /> Character photos
          </Link>
          <button type="button" className={btn.quiet} onClick={() => void merge()} disabled={busy}>
            <Icon name="copy" className="size-4" /> Tidy duplicates
          </button>
        </div>
        <div className="flex flex-wrap items-center gap-3">
          <div role="group" aria-label="Show" className="inline-flex gap-1 rounded-full border border-line-strong bg-surface p-1 text-sm font-semibold">
            {(
              [
                ["library", `In the library (${library.length})`],
                ["deleted", `Deleted (${deleted.length})`],
              ] as const
            ).map(([v, label]) => (
              <button
                key={v}
                type="button"
                aria-pressed={tab === v}
                onClick={() => setTab(v)}
                className={cx("min-h-9 rounded-full px-4", tab === v ? "bg-action text-on-action" : "hover:bg-muted")}
              >
                {label}
              </button>
            ))}
          </div>
          {tab === "library" && (
            <button
              type="button"
              aria-pressed={needsOnly}
              onClick={() => setNeedsOnly((v) => !v)}
              className={cx(
                "min-h-9 rounded-full border px-4 text-sm font-semibold",
                needsOnly ? "border-action bg-action text-on-action" : "border-line-strong bg-surface hover:bg-muted",
              )}
            >
              Needs a description ({needCount})
            </button>
          )}
          <label className="relative min-w-60 flex-1">
            <span className="sr-only">Search by title or description</span>
            <Icon name="search" className="pointer-events-none absolute left-3 top-1/2 size-4 -translate-y-1/2 text-ink-muted" />
            <input
              type="search"
              value={query}
              onChange={(e) => setQuery(e.target.value)}
              placeholder="Search by title or description…"
              className="min-h-11 w-full rounded-full border border-line-strong bg-surface pl-9 pr-3"
            />
          </label>
        </div>
        {busy && (
          <p className="text-sm text-ink-muted" role="status">
            Working…
          </p>
        )}
        {note && (
          <p className="rounded-2xl bg-tealtint p-3 text-sm" role="status">
            {note}
          </p>
        )}
        {(problem || error) && <ErrorNote text={problem ?? error ?? ""} />}
        {!data && !error && <p className="text-ink-muted">Loading the library…</p>}
        {data && list.length === 0 && (
          <p className="text-ink-muted">{query ? "No pictures match that name." : tab === "deleted" ? "Nothing deleted." : "No pictures yet."}</p>
        )}
        <ul className="grid grid-cols-2 gap-4 sm:grid-cols-3 xl:grid-cols-4">
          {list.map((p) => {
            const u = usage[p.src];
            return (
              <li key={p.src} className="flex flex-col overflow-hidden rounded-2xl border border-line bg-surface">
                <a href={p.src} target="_blank" rel="noreferrer" className="block bg-muted" title="Open full size">
                  {/* eslint-disable-next-line @next/next/no-img-element */}
                  <img src={p.src} alt="" loading="lazy" className={cx("aspect-[4/3] w-full object-cover", tab === "deleted" && "opacity-60")} />
                </a>
                <div className="flex flex-1 flex-col gap-1 p-3 text-sm">
                  <p className={cx("truncate font-semibold", !p.title && isUpload(p.src) && "italic text-ink-muted")} title={nameOf(p)}>
                    {nameOf(p)}
                  </p>
                  {editing === p.src ? (
                    <PictureDetails
                      p={p}
                      onCancel={() => setEditing(null)}
                      onSaved={(title) => {
                        setEditing(null);
                        setNote(`Saved the details for “${title || "Untitled picture"}”.`);
                        reload();
                      }}
                    />
                  ) : p.alt ? (
                    <p className="line-clamp-2 text-xs text-ink-muted" title={p.alt}>
                      {p.alt}
                    </p>
                  ) : needsWords(p) ? (
                    <p className="inline-flex w-fit items-center gap-1 rounded-full bg-[#fff4d6] px-2 py-0.5 text-xs font-semibold text-[#7a4b00]">
                      <Icon name="alert" className="size-3.5" /> No description yet
                    </p>
                  ) : null}
                  <p className="text-xs text-ink-muted">
                    {p.width && p.height ? `${p.width} × ${p.height}` : ""}
                    {p.uploadedAt ? ` · ${formatDate(p.uploadedAt)}` : isUpload(p.src) ? "" : " · Built in"}
                    {p.credit ? ` · ${p.credit.source}: ${p.credit.name}` : ""}
                  </p>
                  {u === "loading" && <p className="text-xs text-ink-muted">Checking where it’s used…</p>}
                  {u && u !== "loading" && (
                    <p className="text-xs">
                      {usedIn(u).length ? (
                        <>
                          Used in{" "}
                          {[
                            ...u.lessons.map((l) => (
                              <Link key={l.slug} href={`/admin/lessons/${l.slug}`} className="font-semibold text-accent hover:underline">
                                {l.title}
                              </Link>
                            )),
                            ...(u.magazines ?? []).map((m) => (
                              <Link key={m.id} href={`/admin/magazine/${m.id}`} className="font-semibold text-accent hover:underline">
                                {m.title}
                              </Link>
                            )),
                          ].reduce<React.ReactNode[]>((acc, el, i) => (i ? [...acc, ", ", el] : [el]), [])}
                        </>
                      ) : (
                        "Not used anywhere."
                      )}
                    </p>
                  )}
                  <div className="mt-auto flex flex-wrap gap-1 pt-2">
                    {tab === "library" ? (
                      <>
                        {isUpload(p.src) && editing !== p.src && (
                          <button type="button" className={cx(btn.quiet, "min-h-8 px-2 text-xs")} onClick={() => setEditing(p.src)}>
                            Details
                          </button>
                        )}
                        <button
                          type="button"
                          className={cx(btn.quiet, "min-h-8 px-2 text-xs")}
                          onClick={() => void whereUsed(p).catch((e: Error) => setProblem(e.message))}
                        >
                          Where used
                        </button>
                        {isUpload(p.src) && (
                          <button
                            type="button"
                            className={cx(btn.quiet, "min-h-8 px-2 text-xs")}
                            disabled={busy}
                            onClick={() => {
                              replaceFor.current = p;
                              replaceInput.current?.click();
                            }}
                          >
                            Replace
                          </button>
                        )}
                        <button type="button" className={cx(btn.quiet, "min-h-8 px-2 text-xs")} onClick={() => setCropping(p)} title="Saves a cropped copy">
                          Crop a copy
                        </button>
                        <button type="button" className={cx(btn.quiet, "min-h-8 px-2 text-xs text-danger")} disabled={busy} onClick={() => void remove(p)}>
                          Delete
                        </button>
                      </>
                    ) : (
                      <button type="button" className={cx(btn.secondary, "min-h-8 px-3 text-xs")} disabled={busy} onClick={() => void restore(p)}>
                        Restore
                      </button>
                    )}
                  </div>
                </div>
              </li>
            );
          })}
        </ul>
        <input
          ref={replaceInput}
          type="file"
          accept="image/*"
          className="sr-only"
          onChange={(e) => {
            const f = e.target.files?.[0];
            const p = replaceFor.current;
            e.target.value = "";
            if (f && p) void replace(p, f);
          }}
        />
      </div>
      {cropping && (
        <ImageCropper
          picture={cropping}
          onClose={() => setCropping(null)}
          onDone={() => {
            setCropping(null);
            setNote("Saved a cropped copy to the library. The original is unchanged.");
            reload();
          }}
        />
      )}
      {adding && (
        <div
          role="dialog"
          aria-modal="true"
          aria-label={adding === "ai" ? "Generate a picture" : "Find a photo on Pexels"}
          className="fixed inset-0 z-50 grid place-items-center overflow-y-auto bg-[#0b1626]/70 p-4"
        >
          <div className="w-full max-w-3xl rounded-3xl bg-surface p-5 shadow-2xl">
            {adding === "ai" ? (
              <>
                <div className="mb-3 flex items-center justify-between gap-2">
                  <h2 className="flex items-center gap-2 font-serif text-xl font-semibold">
                    <Icon name="spark" className="size-5 text-accent" /> Generate a picture
                  </h2>
                  <button type="button" className={btn.quiet} onClick={() => setAdding(null)}>
                    Done
                  </button>
                </div>
                <ImageGenerator useLabel="Done" defaultAspect="3:2" onMade={reload} onUse={() => setAdding(null)} />
              </>
            ) : (
              <PexelsPicker
                onClose={() => setAdding(null)}
                onPicked={() => {
                  setAdding(null);
                  setNote("Added the Pexels photo to the library.");
                  reload();
                }}
              />
            )}
          </div>
        </div>
      )}
    </AdminShell>
  );
}

/**
  A picture's title and description, edited in place. The title is how authors find it; the description is offered as
  its alt text wherever it's placed, so it says what the picture shows for someone who can't see it.
*/
function PictureDetails({ p, onCancel, onSaved }: { p: Item; onCancel: () => void; onSaved: (title: string) => void }) {
  const [title, setTitle] = useState(p.title ?? "");
  const [alt, setAlt] = useState(p.alt ?? "");
  const [saving, setSaving] = useState(false);
  const [problem, setProblem] = useState<string | null>(null);
  const save = async () => {
    setSaving(true);
    setProblem(null);
    try {
      await api(usageUrl(p.src), { body: { action: "describe", title, alt } });
      onSaved(title.trim());
    } catch (e) {
      setProblem((e as Error).message);
      setSaving(false);
    }
  };
  return (
    <form
      className="mt-1 flex flex-col gap-2 rounded-xl bg-muted p-2.5"
      onSubmit={(e) => {
        e.preventDefault();
        void save();
      }}
    >
      <label className="flex flex-col gap-1 text-xs font-semibold">
        Title
        <input
          value={title}
          onChange={(e) => setTitle(e.target.value)}
          maxLength={120}
          placeholder="Maya at her kitchen table"
          className="min-h-9 rounded-lg border border-line-strong bg-surface px-2 text-sm font-normal"
        />
      </label>
      <label className="flex flex-col gap-1 text-xs font-semibold">
        Description (alt text)
        <textarea
          value={alt}
          onChange={(e) => setAlt(e.target.value)}
          maxLength={300}
          rows={3}
          placeholder="What the picture shows, for someone who can’t see it."
          className="rounded-lg border border-line-strong bg-surface px-2 py-1.5 text-sm font-normal"
        />
      </label>
      {p.name && <p className="truncate text-xs text-ink-muted">File: {p.name}</p>}
      {problem && <p className="text-xs font-semibold text-danger">{problem}</p>}
      <div className="flex gap-1">
        <button type="submit" className={cx(btn.primary, "min-h-8 px-3 text-xs")} disabled={saving}>
          {saving ? "Saving…" : "Save"}
        </button>
        <button type="button" className={cx(btn.quiet, "min-h-8 px-3 text-xs")} onClick={onCancel} disabled={saving}>
          Cancel
        </button>
      </div>
    </form>
  );
}
