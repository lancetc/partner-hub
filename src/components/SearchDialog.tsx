"use client";

import Link from "next/link";
import { useEffect, useMemo, useRef, useState } from "react";
import { stories, categoryLabel } from "@/content/stories";
import { lessons } from "@/content/lessons";
import { resources } from "@/content/resources";
import { HeaderIconButton } from "./IconButton";
import { Icon } from "./Icon";
import { useHub } from "@/lib/store";
import { api } from "@/lib/api";

type Result = { id: string; href: string; title: string; meta: string; text?: string; snippet?: string };

/*
  Search asks the server, which searches everything live on the hub (lib: server/search.ts). This
  smaller list, built into the page, is the fallback for when there's no connection.
*/
const index: Result[] = [
  ...stories.map((s) => ({
    id: `story:${s.slug}`,
    href: `/news/${s.slug}`,
    title: s.title,
    meta: categoryLabel(s.category),
    text: `${s.title} ${s.dek} ${s.body.map((b) => ("text" in b ? b.text : "items" in b ? b.items.join(" ") : "")).join(" ")}`,
  })),
  ...lessons
    .filter((l) => l.track !== "reinforcement")
    .map((l) => ({
      id: `lesson:${l.slug}`,
      href: `/learning/${l.slug}`,
      title: l.title,
      meta: `Topic · ${l.minutes} min`,
      text: `${l.title} ${l.summary} ${l.outcome}`,
    })),
  ...resources.map((r) => ({
    id: `resource:${r.id}`,
    href: `/resources#${r.id}`,
    title: r.title,
    meta: `Resource · ${r.kind}`,
    text: `${r.title} ${r.description} ${r.points.join(" ")}`,
  })),
];

export const searchIndex = index;

function offlineResults(q: string) {
  const terms = q.toLowerCase().split(/\s+/).filter(Boolean);
  return index.filter((r) => terms.every((t) => r.text!.toLowerCase().includes(t))).slice(0, 12);
}

/** Saved items' titles and links, from the server so topics made in the editor appear too. */
export function useSavedItems(ids: string[]) {
  const key = ids.join(",");
  const [items, setItems] = useState<Result[] | null>(null);
  useEffect(() => {
    if (!key) return;
    let live = true;
    api<{ results: Result[] }>(`/api/search?saved=${encodeURIComponent(key)}`).then(
      (r) => live && setItems(r.results),
      () => live && setItems(key.split(",").flatMap((id) => index.filter((r) => r.id === id))),
    );
    return () => {
      live = false;
    };
  }, [key]);
  // null while loading.
  return key ? items : [];
}

export function SearchButton() {
  const ref = useRef<HTMLDialogElement>(null);
  const [q, setQ] = useState("");
  const saved = useHub((s) => s.saved);

  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      const target = e.target as HTMLElement;
      if (e.key === "/" && !["INPUT", "TEXTAREA"].includes(target.tagName) && !target.isContentEditable) {
        e.preventDefault();
        ref.current?.showModal();
      }
    };
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, []);

  // Asks a moment after typing stops; the latest answer wins.
  const [found, setFound] = useState<{ q: string; results: Result[]; offline?: boolean } | null>(null);
  useEffect(() => {
    const query = q.trim();
    if (!query) return;
    let live = true;
    const t = window.setTimeout(() => {
      api<{ results: Result[] }>(`/api/search?q=${encodeURIComponent(query)}`).then(
        (r) => live && setFound({ q: query, results: r.results }),
        () => live && setFound({ q: query, results: offlineResults(query), offline: true }),
      );
    }, 200);
    return () => {
      live = false;
      window.clearTimeout(t);
    };
  }, [q]);
  const searching = Boolean(q.trim()) && found?.q !== q.trim();
  const results = useMemo(() => (q.trim() && found ? found.results : []), [q, found]);

  const savedItems = useSavedItems(saved) ?? [];
  const close = () => ref.current?.close();

  return (
    <>
      <HeaderIconButton label="Search the hub" icon="search" onClick={() => ref.current?.showModal()} />
      <dialog
        ref={ref}
        aria-label="Search"
        className="m-0 mx-auto mt-0 h-dvh max-h-none w-full max-w-none bg-bg p-0 text-ink backdrop:bg-[var(--overlay)] sm:mt-20 sm:h-auto sm:max-h-[75vh] sm:max-w-2xl sm:rounded-3xl sm:border sm:border-line"
        onClick={(e) => e.target === ref.current && close()}
        onClose={() => setQ("")}
      >
        <div className="flex items-center gap-2 border-b border-line p-3">
          <Icon name="search" className="ml-2 size-5 shrink-0 text-ink-muted" />
          <label htmlFor="hub-search" className="sr-only">
            Search topics, paths, webinars, news and resources
          </label>
          <input
            id="hub-search"
            autoFocus
            type="search"
            value={q}
            onChange={(e) => setQ(e.target.value)}
            placeholder="Search topics, paths, webinars, news and resources"
            className="min-h-11 w-full bg-transparent px-2 text-lg outline-none placeholder:text-ink-muted"
          />
          <HeaderIconButton label="Close search" icon="close" onClick={close} />
        </div>
        <div className="max-h-[calc(100dvh-4.5rem)] overflow-y-auto p-3 sm:max-h-[60vh]">
          {q ? (
            <>
              <p className="px-3 py-2 text-sm text-ink-muted" role="status">
                {searching && !results.length
                  ? "Searching…"
                  : results.length
                    ? `${results.length} result${results.length === 1 ? "" : "s"}${found?.offline ? " (offline: news, resources and some topics only)" : ""}`
                    : "No results. Try a different word."}
              </p>
              <ResultList items={results} onPick={close} />
            </>
          ) : (
            <>
              <h2 className="px-3 pt-2 font-mulish text-xs font-bold uppercase tracking-wider text-ink-muted">Saved items</h2>
              {savedItems.length ? (
                <ResultList items={savedItems} onPick={close} />
              ) : (
                <p className="px-3 py-3 text-ink-muted">Nothing saved yet. Use the bookmark on any story or topic.</p>
              )}
            </>
          )}
        </div>
      </dialog>
    </>
  );
}

function ResultList({ items, onPick }: { items: Result[]; onPick: () => void }) {
  return (
    <ul>
      {items.map((r) => (
        <li key={r.id}>
          <Link href={r.href} onClick={onPick} className="block rounded-2xl px-3 py-3 hover:bg-muted">
            <span className="block font-mulish text-xs font-bold uppercase tracking-wider text-accent">{r.meta}</span>
            <span className="block font-serif text-lg leading-snug">{r.title}</span>
            {r.snippet && <span className="mt-0.5 line-clamp-2 block text-sm text-ink-muted">{r.snippet}</span>}
          </Link>
        </li>
      ))}
    </ul>
  );
}
