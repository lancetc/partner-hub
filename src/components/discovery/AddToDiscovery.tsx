"use client";

import Link from "next/link";
import { useId, useRef, useState } from "react";
import { api } from "@/lib/api";
import { cx } from "@/lib/format";
import { KIND_LABELS } from "@/lib/discovery";
import type { itemInPaths } from "@/server/discovery";
import { Icon } from "../Icon";
import { dbtn, dinput, Problem } from "./parts";

/*
  "Add to my Discovery Path" (docs/discovery-paths.md), on a Topic's start screen and a Magazine page.
  Pick one of your paths or start a new one with this in it. A Magazine page that isn't offered by itself
  adds its whole course instead, and says so. Nothing is recorded as done by saving.
*/

type Data = ReturnType<typeof itemInPaths>;

export function AddToDiscovery({ itemKey, className, tone = "plain" }: { itemKey: string; className?: string; tone?: "plain" | "onDark" }) {
  const ids = useId();
  const dialog = useRef<HTMLDialogElement>(null);
  const [isOpen, setIsOpen] = useState(false);
  const [data, setData] = useState<Data | null>(null);
  const [problem, setProblem] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);
  const [added, setAdded] = useState<{ id: string; title: string } | null>(null);

  const load = async () => {
    setProblem(null);
    try {
      setData(await api<Data>(`/api/discovery?item=${encodeURIComponent(itemKey)}`));
    } catch (e) {
      setProblem(e instanceof Error ? e.message : "That didn’t load.");
    }
  };
  const open = () => {
    setIsOpen(true);
    setAdded(null);
    setData(null);
    dialog.current?.showModal();
    void load();
  };

  const add = async (path: { id: string; title: string }) => {
    if (!data?.item) return;
    setBusy(true);
    setProblem(null);
    try {
      await api(`/api/discovery/${path.id}`, { body: { action: "add", key: data.item.key, from: "content" } });
      setAdded(path);
      setData({ ...data, paths: data.paths.map((p) => (p.id === path.id ? { ...p, has: true } : p)) });
    } catch (e) {
      setProblem(e instanceof Error ? e.message : "That didn’t save.");
    } finally {
      setBusy(false);
    }
  };
  const create = async (title: string) => {
    if (!data?.item) return;
    setBusy(true);
    setProblem(null);
    try {
      const made = await api<{ path: { id: string; title: string } }>("/api/discovery", { body: { title, steps: [{ key: data.item.key }] } });
      setAdded({ id: made.path.id, title: made.path.title });
      setData({ ...data, paths: [{ id: made.path.id, title: made.path.title, has: true }, ...data.paths] });
    } catch (e) {
      setProblem(e instanceof Error ? e.message : "That didn’t save.");
    } finally {
      setBusy(false);
    }
  };

  const item = data?.item ?? null;
  return (
    <>
      <button
        type="button"
        onClick={open}
        className={cx(
          "inline-flex min-h-10 items-center gap-1.5 rounded-full border px-3 text-sm font-semibold",
          tone === "onDark" ? "border-white/40 text-white hover:bg-white/10" : "border-line-strong bg-surface hover:bg-muted",
          className,
        )}
      >
        <Icon name="route" className="size-4" /> Add to my Discovery Path
      </button>
      <dialog
        ref={dialog}
        aria-labelledby={`${ids}-t`}
        onClose={() => setIsOpen(false)}
        onClick={(e) => e.target === e.currentTarget && dialog.current?.close()}
        className="m-auto max-h-[90vh] w-[min(32rem,calc(100vw-2rem))] max-w-none overflow-y-auto rounded-3xl bg-bg p-0 text-left text-ink shadow-2xl backdrop:bg-[#0b1626]/70"
      >
        {isOpen && (
          <div className="flex flex-col gap-4 p-5 sm:p-6">
            <div className="flex items-start justify-between gap-3">
              <h2 id={`${ids}-t`} className="font-serif text-2xl font-semibold">
                Add to my Discovery Path
              </h2>
              <button type="button" className={dbtn.icon} aria-label="Close" onClick={() => dialog.current?.close()}>
                <Icon name="close" className="size-4" />
              </button>
            </div>
            {problem && <Problem text={problem} onRetry={data ? undefined : () => void load()} />}
            {!data && !problem && <p className="text-ink-muted">Loading your paths…</p>}
            {data && !item && <p>This can’t be added to a Discovery Path. You can still add Topics and Magazine courses that are open to you.</p>}
            {data && item && (
              <>
                <p>
                  <span className="font-semibold">{item.title}</span>{" "}
                  <span className="text-ink-muted">
                    ({KIND_LABELS[item.kind]}, about {item.minutes} min)
                  </span>
                </p>
                {data.wholeCourse && (
                  <p className="rounded-2xl bg-muted px-3 py-2 text-sm">
                    This page relies on the rest of its course, so it isn’t saved by itself: the whole course is added, and it opens where you left off.
                  </p>
                )}
                <div aria-live="polite">
                  {added && (
                    <p className="flex flex-wrap items-center gap-2 font-semibold text-success">
                      <Icon name="circle-check" className="size-5" /> Added to “{added.title}”.
                      <Link href={`/discovery/${added.id}`} className="underline underline-offset-4">
                        Open the path
                      </Link>
                    </p>
                  )}
                </div>
                {data.paths.length > 0 && (
                  <ul className="flex flex-col divide-y divide-line rounded-2xl bg-surface px-4 ring-1 ring-line">
                    {data.paths.map((p) => (
                      <li key={p.id} className="flex items-center justify-between gap-3 py-2">
                        <span className="min-w-0 truncate">{p.title}</span>
                        {p.has ? (
                          <Link href={`/discovery/${p.id}`} className="inline-flex min-h-11 shrink-0 items-center gap-1.5 text-sm font-semibold text-success">
                            <Icon name="check" className="size-4" /> In this path
                          </Link>
                        ) : (
                          <button type="button" className={cx(dbtn.secondary, "shrink-0")} disabled={busy} onClick={() => void add(p)}>
                            <Icon name="plus" className="size-4" /> Add<span className="sr-only"> to {p.title}</span>
                          </button>
                        )}
                      </li>
                    ))}
                  </ul>
                )}
                <form
                  className="flex flex-col gap-2"
                  onSubmit={(e) => {
                    e.preventDefault();
                    const title = String(new FormData(e.currentTarget).get("title") ?? "").trim();
                    void create(title);
                    e.currentTarget.reset();
                  }}
                >
                  <label htmlFor={`${ids}-new`} className="font-semibold">
                    {data.paths.length ? "Or start a new path with this" : "Start a path with this"}
                  </label>
                  <div className="flex flex-wrap gap-2">
                    <input id={`${ids}-new`} name="title" maxLength={80} className={cx(dinput, "min-w-0 flex-1 basis-48")} placeholder="Name it (optional)" />
                    <button type="submit" className={dbtn.primary} disabled={busy}>
                      Create path
                    </button>
                  </div>
                </form>
                <p className="text-sm text-ink-muted">A Discovery Path is your own collection. Saving something to one doesn’t mark it as done.</p>
              </>
            )}
          </div>
        )}
      </dialog>
    </>
  );
}
