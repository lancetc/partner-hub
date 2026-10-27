"use client";

import { useState } from "react";
import { useApi, type Me } from "@/lib/api";
import { cx } from "@/lib/format";
import { downloadLesson, removeDownload, supportsOffline, useDownloads } from "@/lib/offlineLessons";
import { useHydrated } from "@/lib/store";
import { Icon } from "./Icon";

/** "Download for offline" for one lesson, or for every lesson in a learning path. */
export function OfflineButton({ lessons, label, className }: { lessons: { slug: string; version?: string }[]; label?: string; className?: string }) {
  const hydrated = useHydrated();
  const me = useApi<Me>("/api/me").data;
  const { downloads, progress } = useDownloads();
  const [error, setError] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);
  if (!hydrated || !supportsOffline() || !lessons.length) return null;

  const saved = (slug: string) => downloads.find((d) => d.slug === slug);
  const all = lessons.every((l) => saved(l.slug));
  const outdated = lessons.some((l) => {
    const d = saved(l.slug);
    return d && l.version && d.version !== l.version;
  });
  const running = lessons.filter((l) => progress[l.slug] !== undefined);
  const pct = running.length ? Math.round((running.reduce((n, l) => n + progress[l.slug], 0) / lessons.length) * 100) : 0;

  async function download() {
    if (!me) return;
    setBusy(true);
    setError(null);
    try {
      for (const l of lessons) if (!saved(l.slug) || outdated) await downloadLesson(l.slug, me.user.id);
    } catch (e) {
      setError((e as Error).message);
    } finally {
      setBusy(false);
    }
  }

  async function remove() {
    for (const l of lessons) await removeDownload(l.slug);
  }

  const many = lessons.length > 1;
  return (
    <div className={cx("flex flex-wrap items-center gap-x-3 gap-y-1 text-sm", className)}>
      {busy || running.length ? (
        <span className="inline-flex min-h-10 items-center gap-2 font-semibold" role="status">
          <span aria-hidden className="size-4 animate-spin rounded-full border-2 border-action border-t-transparent" />
          Downloading… {pct}%
        </span>
      ) : all && !outdated ? (
        <>
          <span className="inline-flex min-h-10 items-center gap-1.5 font-semibold text-success">
            <Icon name="check" className="size-4" /> {many ? "Path available offline" : "Available offline"}
          </span>
          <button type="button" onClick={remove} className="font-semibold text-ink-muted underline-offset-4 hover:text-ink hover:underline">
            Remove
          </button>
        </>
      ) : (
        <button
          type="button"
          onClick={download}
          disabled={!me}
          className="inline-flex min-h-10 items-center gap-2 rounded-full border border-line-strong bg-surface px-3.5 font-semibold text-ink hover:bg-muted disabled:opacity-50"
        >
          <Icon name={outdated ? "refresh" : "upload"} className={cx("size-4", !outdated && "rotate-180")} />
          {outdated ? "Update offline copy" : (label ?? (many ? "Download path for offline" : "Download for offline"))}
        </button>
      )}
      {error && (
        <span role="alert" className="text-danger">
          {error}
        </span>
      )}
    </div>
  );
}
