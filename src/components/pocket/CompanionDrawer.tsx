"use client";

import Link from "next/link";
import { useCallback, useEffect, useRef, useState } from "react";
import { api, useApi } from "@/lib/api";
import { cx } from "@/lib/format";
import type { DrawerData, DrawerItem, PocketResult } from "@/server/pocketPlaybook";
import type { FavouriteItem } from "@/server/favourites";
import { Icon } from "../Icon";
import { newKey, OPEN_EVENT, pocketEvent, type OpenDetail } from "./pocketApi";
import { PocketTool } from "./PocketTool";

/*
  The Companion Drawer (docs/pocket-playbook.md): Favourites and Work Tools in one place, opened from the Favourites
  control in the header (and its cell in the phone bar). The owner removed Work Tools from the header ("it's covered
  by Favourites"), so this is that one control: Pinned, Recent, Search Work Tools and Favourites. A pinned tool is
  two activations away from any page: Favourites, then the tool.

  - A native modal dialog: focus stays inside while it's open, Escape closes it, and focus goes back to the control
    that opened it. The page behind keeps its place.
  - A full-height sheet on a phone (safe-area aware), a right-hand drawer from tablet width.
  - One tool open at a time, with Back to tools. Closing the drawer unmounts the tool, so anything typed into the
    Quick-Calc is gone.
*/

type Found = { tools: PocketResult[]; highlights: PocketResult[]; learning: PocketResult[]; none: boolean };
type Open = { id: string; script?: string; from: string; back?: string };

const STATE_NOTE: Record<DrawerItem["state"], string> = {
  current: "",
  draft: "Draft",
  review_due: "Review due",
  updated: "Updated since you pinned this",
  unavailable: "Unavailable",
};
/** After React has drawn: a timer rather than an animation frame, which a background tab may never give. */
const afterRender = (fn: () => void) => window.setTimeout(fn, 0);
const section = "mt-5";
const kicker = "font-mulish text-xs font-extrabold uppercase tracking-[0.12em] text-accent";

export function CompanionDrawer() {
  const ref = useRef<HTMLDialogElement>(null);
  const trigger = useRef<HTMLElement | null>(null);
  const [opens, setOpens] = useState(0);
  const [tool, setTool] = useState<Open | null>(null);
  const [q, setQ] = useState("");
  const [arranging, setArranging] = useState(false);
  const loaded = useApi<DrawerData>(opens ? `/api/pocket?o=${opens}` : null);
  const d = loaded.data;

  const show = useCallback((detail: OpenDetail) => {
    trigger.current = detail.trigger;
    const dlg = ref.current;
    if (!dlg) return;
    setTool(detail.tool ? { id: detail.tool, from: "drawer" } : null);
    setOpens((n) => n + 1);
    if (!dlg.open) dlg.showModal();
    pocketEvent({ event: "work_tools_opened", place: "drawer" });
    afterRender(() => (dlg.querySelector("[data-drawer-heading], [data-tool-heading]") as HTMLElement | null)?.focus());
  }, []);
  useEffect(() => {
    const on = (e: Event) => show((e as CustomEvent<OpenDetail>).detail);
    window.addEventListener(OPEN_EVENT, on);
    return () => window.removeEventListener(OPEN_EVENT, on);
  }, [show]);

  const close = () => ref.current?.close();
  const openTool = (o: Open) => {
    setTool(o);
    afterRender(() => ref.current?.querySelector("[data-drawer-body]")?.scrollTo({ top: 0 }));
  };
  const backToTools = () => {
    const from = tool?.back;
    setTool(null);
    loaded.reload();
    // Back to the item that opened the tool, or the heading.
    afterRender(() => {
      const el = (from && ref.current?.querySelector(`[data-open-tool="${from}"]`)) || ref.current?.querySelector("[data-drawer-heading]");
      (el as HTMLElement | null)?.focus();
    });
  };
  // When a tool is opened inside the drawer, its heading takes focus so a screen reader starts there.
  useEffect(() => {
    if (!tool) return;
    const t = window.setTimeout(() => (ref.current?.querySelector("[data-tool-heading]") as HTMLElement | null)?.focus(), 150);
    return () => window.clearTimeout(t);
  }, [tool]);

  return (
    <dialog
      ref={ref}
      aria-labelledby="companion-title"
      className="m-0 h-dvh max-h-none w-full max-w-none bg-bg p-0 text-ink backdrop:bg-[var(--overlay)] sm:ml-auto sm:mr-0 sm:w-[30rem] sm:border-l sm:border-line"
      onClick={(e) => e.target === ref.current && close()}
      onClose={() => {
        // Nothing typed into a tool survives closing: the tool is unmounted with its state.
        setTool(null);
        setQ("");
        setArranging(false);
        const back = trigger.current;
        afterRender(() => back?.focus());
      }}
    >
      <div className="flex h-full flex-col pt-[env(safe-area-inset-top)]">
        <div className="flex items-center gap-2 border-b border-line px-3 py-2">
          {tool ? (
            <button type="button" onClick={backToTools} className="inline-flex min-h-11 items-center gap-1.5 rounded-full px-3 font-semibold hover:bg-muted">
              <Icon name="arrow-left" className="size-4" /> Back to tools
            </button>
          ) : null}
          <h2
            id="companion-title"
            data-drawer-heading
            tabIndex={-1}
            className={cx("min-w-0 flex-1 truncate px-1 font-serif text-xl font-semibold outline-none", tool && "sr-only")}
          >
            Favourites and Work Tools
          </h2>
          {tool && <span className="flex-1" />}
          <button
            type="button"
            onClick={close}
            aria-label="Close Favourites and Work Tools"
            className="grid size-11 shrink-0 place-items-center rounded-full hover:bg-muted"
          >
            <Icon name="close" className="size-5" />
          </button>
        </div>
        <div data-drawer-body className="min-h-0 flex-1 overflow-y-auto overscroll-contain px-4 pb-[calc(1.5rem+env(safe-area-inset-bottom))]">
          {tool ? (
            <PocketTool
              key={`${tool.id}:${tool.script ?? ""}`}
              id={tool.id}
              place={tool.from}
              script={tool.script}
              onOpenTool={(id) => openTool({ id, from: "drawer", back: tool.back })}
              onChanged={loaded.reload}
            />
          ) : (
            <Home
              d={d}
              error={loaded.error}
              q={q}
              setQ={setQ}
              arranging={arranging}
              setArranging={setArranging}
              reload={loaded.reload}
              openTool={openTool}
              close={close}
            />
          )}
        </div>
      </div>
    </dialog>
  );
}

function Home({
  d,
  error,
  q,
  setQ,
  arranging,
  setArranging,
  reload,
  openTool,
  close,
}: {
  d: DrawerData | null;
  error: string | null;
  q: string;
  setQ: (q: string) => void;
  arranging: boolean;
  setArranging: (b: boolean) => void;
  reload: () => void;
  openTool: (o: Open) => void;
  close: () => void;
}) {
  const [found, setFound] = useState<(Found & { q: string }) | null>(null);
  const session = useRef("");
  const counted = useRef(new Set<string>());
  // Search a moment after typing stops. The phrase goes to the server to be answered and isn't kept there.
  useEffect(() => {
    const query = q.trim();
    if (!query) return;
    let live = true;
    const t = window.setTimeout(() => {
      api<Found>(`/api/pocket?q=${encodeURIComponent(query)}`).then(
        (r) => {
          if (!live) return;
          setFound({ ...r, q: query });
          // A count of searches that found nothing: never the words.
          if (r.none && !counted.current.has(query)) {
            counted.current.add(query);
            if (!session.current) session.current = newKey("s");
            pocketEvent({ event: "search_no_result", place: "drawer", key: `${session.current}-${counted.current.size}` });
          }
        },
        () => live && setFound({ tools: [], highlights: [], learning: [], none: true, q: query }),
      );
    }, 300);
    return () => {
      live = false;
      window.clearTimeout(t);
    };
  }, [q]);
  const results = q.trim() && found?.q === q.trim() ? found : null;

  const pin = async (it: DrawerItem, on: boolean) => {
    await api("/api/pocket", { body: { action: "pin", kind: it.kind, id: it.id, on } }).catch(() => undefined);
    reload();
  };
  const move = async (from: number, to: number) => {
    if (!d || to < 0 || to >= d.pinned.length) return;
    const ids = d.pinned.map((p) => p.favId);
    const [x] = ids.splice(from, 1);
    ids.splice(to, 0, x);
    await api("/api/pocket", { body: { action: "reorder", ids } }).catch(() => undefined);
    reload();
  };

  return (
    <div className="pt-3">
      <label className="flex flex-col gap-1 font-semibold">
        Search Work Tools
        <span className="relative">
          <Icon name="search" className="pointer-events-none absolute left-3 top-1/2 size-5 -translate-y-1/2 text-ink-muted" />
          <input
            type="search"
            value={q}
            onChange={(e) => setQ(e.target.value)}
            autoComplete="off"
            placeholder="What’s happening? e.g. “gardener contribution”"
            className="min-h-12 w-full rounded-2xl border border-line-strong bg-surface pl-10 pr-3 text-base font-normal"
          />
        </span>
      </label>
      {error && (
        <p role="alert" className="mt-3 font-semibold">
          {error}
        </p>
      )}

      {q.trim() ? (
        <Results results={results} openTool={openTool} close={close} />
      ) : !d ? (
        <p className="mt-4 text-ink-muted">Loading…</p>
      ) : (
        <>
          <section aria-labelledby="drawer-pinned" className={section}>
            <div className="flex items-center justify-between gap-2">
              <h3 id="drawer-pinned" className={kicker}>
                Pinned for this work
              </h3>
              {d.pinned.length > 1 && (
                <button
                  type="button"
                  aria-pressed={arranging}
                  onClick={() => setArranging(!arranging)}
                  className="min-h-11 px-2 text-sm font-semibold underline"
                >
                  {arranging ? "Done" : "Arrange"}
                </button>
              )}
            </div>
            {d.pinned.length ? (
              <ul className="mt-2 flex flex-col gap-2">
                {d.pinned.map((it, i) => (
                  <li key={`${it.kind}:${it.id}`} className="flex items-stretch gap-1">
                    <ItemLink it={it} openTool={openTool} close={close} />
                    {arranging && (
                      <span className="flex shrink-0 items-center">
                        <button
                          type="button"
                          aria-label={`Move ${it.title} up`}
                          disabled={i === 0}
                          onClick={() => void move(i, i - 1)}
                          className="grid size-11 place-items-center rounded-full hover:bg-muted disabled:opacity-30"
                        >
                          <Icon name="arrow-up" className="size-4" />
                        </button>
                        <button
                          type="button"
                          aria-label={`Move ${it.title} down`}
                          disabled={i === d.pinned.length - 1}
                          onClick={() => void move(i, i + 1)}
                          className="grid size-11 place-items-center rounded-full hover:bg-muted disabled:opacity-30"
                        >
                          <Icon name="arrow-down" className="size-4" />
                        </button>
                        <button
                          type="button"
                          aria-label={`Unpin ${it.title} (it stays in Favourites)`}
                          onClick={() => void pin(it, false)}
                          className="min-h-11 rounded-full px-2 text-sm font-semibold underline"
                        >
                          Unpin
                        </button>
                      </span>
                    )}
                  </li>
                ))}
              </ul>
            ) : (
              <p className="mt-1 text-sm text-ink-muted">
                Nothing pinned yet. Open a tool and choose <strong>Pin to dashboard</strong>: it’ll be here and on your Hub home.
              </p>
            )}
          </section>

          {d.recent.length > 0 && (
            <section aria-labelledby="drawer-recent" className={section}>
              <h3 id="drawer-recent" className={kicker}>
                Recent
              </h3>
              <ul className="mt-2 flex flex-col gap-2">
                {d.recent.map((it) => (
                  <li key={`${it.kind}:${it.id}`} className="flex">
                    <ItemLink it={it} openTool={openTool} close={close} />
                  </li>
                ))}
              </ul>
            </section>
          )}

          <section aria-labelledby="drawer-tools" className={section}>
            <h3 id="drawer-tools" className={kicker}>
              Live call tools
            </h3>
            <ul className="mt-2 flex flex-col gap-2">
              {d.tools
                .filter((t) => !d.pinned.some((p) => p.kind === "tool" && p.id === t.id))
                .map((it) => (
                  <li key={it.id} className="flex">
                    <ItemLink it={it} openTool={openTool} close={close} />
                  </li>
                ))}
            </ul>
            <Link href="/tools" onClick={close} className="mt-2 inline-flex min-h-11 items-center gap-1 font-semibold text-accent underline underline-offset-2">
              All Work Tools <Icon name="arrow-right" className="size-4" />
            </Link>
          </section>

          <section aria-labelledby="drawer-favourites" className={section}>
            <h3 id="drawer-favourites" className={kicker}>
              Favourites
            </h3>
            {d.favourites.items.length ? (
              <ul className="mt-2 flex flex-col gap-1">
                {d.favourites.items.map((f) => (
                  <FavLink key={f.id} f={f} close={close} />
                ))}
              </ul>
            ) : (
              <p className="mt-1 text-sm text-ink-muted">Saved Job Aids and highlights appear here.</p>
            )}
            <Link
              href="/favourites"
              onClick={close}
              className="mt-2 inline-flex min-h-11 items-center gap-1 font-semibold text-accent underline underline-offset-2"
            >
              All Favourites{d.favourites.count ? ` (${d.favourites.count})` : ""} <Icon name="arrow-right" className="size-4" />
            </Link>
          </section>
          <p className="mt-6 text-xs text-ink-muted">
            Your pins and recent tools are private to you. A tool is a way into approved guidance: it doesn’t file a report, set a rate or change any record.
          </p>
        </>
      )}
    </div>
  );
}

function ItemLink({ it, openTool, close }: { it: DrawerItem; openTool: (o: Open) => void; close: () => void }) {
  const inner = (
    <>
      <span
        aria-hidden
        className={cx("grid size-10 shrink-0 place-items-center rounded-xl", it.state === "unavailable" ? "bg-muted" : "bg-action text-on-action")}
      >
        <Icon
          name={it.kind === "job_aid" ? "clipboard" : it.label === "Calculator" ? "money" : it.label === "Escalation path" ? "alert" : "chat"}
          className="size-5"
        />
      </span>
      <span className="min-w-0 flex-1">
        <span className="block font-semibold leading-snug">{it.title}</span>
        <span className="block text-sm text-ink-muted">
          {it.label}
          {STATE_NOTE[it.state] && <span className="font-semibold text-ink"> · {STATE_NOTE[it.state]}</span>}
        </span>
      </span>
      {it.pinned && <Icon name="pin" className="size-4 shrink-0 text-accent" />}
    </>
  );
  const cls = "flex min-h-14 min-w-0 flex-1 items-center gap-3 rounded-2xl border border-line bg-surface px-3 py-2 text-left hover:ring-1 hover:ring-action";
  return it.inDrawer ? (
    <button type="button" data-open-tool={it.id} className={cls} onClick={() => openTool({ id: it.id, from: "drawer", back: it.id })}>
      {inner}
    </button>
  ) : (
    <Link href={it.href} onClick={close} className={cls}>
      {inner}
    </Link>
  );
}

function FavLink({ f, close }: { f: FavouriteItem; close: () => void }) {
  return (
    <li>
      <Link
        href={f.href}
        onClick={() => {
          void api("/api/favourites", { body: { action: "opened", id: f.id, key: newKey("fav") } }).catch(() => undefined);
          close();
        }}
        className="flex min-h-11 flex-col justify-center rounded-xl px-2 py-1 hover:bg-muted"
      >
        <span className="font-semibold leading-snug">{f.title}</span>
        <span className="text-xs text-ink-muted">
          {f.label}
          {f.state !== "current" &&
            ` · ${f.state === "updated" ? "Updated" : f.state === "changed" ? "Guidance changed" : f.state === "superseded" ? "Superseded" : f.state === "unavailable" ? "Unavailable" : "Moved"}`}
        </span>
      </Link>
    </li>
  );
}

function Results({ results, openTool, close }: { results: Found | null; openTool: (o: Open) => void; close: () => void }) {
  if (!results)
    return (
      <p role="status" className="mt-4 text-ink-muted">
        Searching…
      </p>
    );
  if (results.none)
    return (
      <div role="status" className="mt-4 rounded-2xl bg-muted p-4">
        <p className="font-semibold">No reliable result.</p>
        <p className="mt-1">Don’t guess. Ask your team lead, or the owner of the process. If someone may be at risk, use the incident route now.</p>
        <div className="mt-3 flex flex-wrap gap-2">
          <button
            type="button"
            onClick={() => openTool({ id: "incident-first-steps", from: "search" })}
            className="inline-flex min-h-11 items-center gap-2 rounded-full border border-line-strong bg-surface px-4 font-semibold"
          >
            <Icon name="alert" className="size-4" /> Incident first steps
          </button>
          <ReportMissing />
        </div>
      </div>
    );
  const group = (title: string, items: PocketResult[]) =>
    items.length > 0 && (
      <section className="mt-4" aria-label={title}>
        <h3 className={kicker}>{title}</h3>
        <ul className="mt-2 flex flex-col gap-2">
          {items.map((r) => (
            <li key={`${r.kind}:${r.id}`}>
              {r.inDrawer ? (
                <button
                  type="button"
                  className="flex min-h-14 w-full flex-col rounded-2xl border border-line bg-surface px-3 py-2 text-left hover:ring-1 hover:ring-action"
                  onClick={() => openTool(r.kind === "script" ? { id: "golden-scripts", script: r.id, from: "search" } : { id: r.id, from: "search" })}
                >
                  <ResultText r={r} />
                </button>
              ) : (
                <Link
                  href={r.href}
                  onClick={close}
                  className="flex min-h-14 flex-col rounded-2xl border border-line bg-surface px-3 py-2 hover:ring-1 hover:ring-action"
                >
                  <ResultText r={r} />
                </Link>
              )}
            </li>
          ))}
        </ul>
      </section>
    );
  return (
    <div role="status" aria-live="polite">
      <p className="sr-only">{results.tools.length + results.highlights.length + results.learning.length} results</p>
      {/* Work tools first: each says whether it is an approved tool or a pilot draft. */}
      {group("Work tools", results.tools)}
      {group("Your saved highlights", results.highlights)}
      {group("Learning examples", results.learning)}
      <div className="mt-4">
        <ReportMissing />
      </div>
    </div>
  );
}

function ResultText({ r }: { r: PocketResult }) {
  return (
    <>
      <span className="font-semibold leading-snug">{r.title}</span>
      {r.task && <span className="text-sm text-ink-muted">{r.task}</span>}
      <span className="text-xs font-semibold">{r.status}</span>
      {r.warning && (
        <span className="mt-1 rounded-lg bg-[#fff1cc] px-2 py-0.5 text-xs font-semibold text-[#4a3400] dark:bg-[#3d2f08] dark:text-[#ffd97a]">{r.warning}</span>
      )}
    </>
  );
}

/** "Report missing guidance": a count for the owners, with no words, so nothing identifying is kept. */
function ReportMissing() {
  const [done, setDone] = useState(false);
  return done ? (
    <span role="status" className="inline-flex min-h-11 items-center text-sm font-semibold">
      Thanks: the owners see a count of missing guidance.
    </span>
  ) : (
    <button
      type="button"
      onClick={() => {
        pocketEvent({ event: "tool_issue_reported", issue: "missing", place: "drawer" });
        setDone(true);
      }}
      className="inline-flex min-h-11 items-center gap-2 rounded-full border border-line-strong bg-surface px-4 text-sm font-semibold"
    >
      <Icon name="flag" className="size-4" /> Report missing guidance
    </button>
  );
}
