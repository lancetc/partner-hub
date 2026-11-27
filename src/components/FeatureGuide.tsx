"use client";

import Link from "next/link";
import { createContext, useContext, useId, useMemo, useRef, useState } from "react";
import { cx } from "@/lib/format";
import {
  BLOCK_FAMILIES,
  blockDemoHref,
  FEATURE_GROUPS,
  FEATURE_STATUS,
  FORMAT_GUIDES,
  PATH_FLOW,
  type Feature,
  type FeatureStatus,
  type FormatGuide,
} from "@/content/featureGuide";
import { BUILD_STAGES } from "@/lib/buildSequence";
import { Icon } from "./Icon";

/*
  The feature guide (the owner, Nov 2026): a button in the header, for everyone, that opens a window listing every
  feature added from the PRDs at a high level, grouped by where it lives, with what it is, who it's for and the problem
  it solves. The Magazine's practice blocks are listed in brief, with the Block showcase courses for the detail. Links
  into Admin, and the block demos (in staff-only showcase courses), show only to people who can author.
*/

const STATUS_TONE: Record<FeatureStatus, string> = {
  live: "bg-[#e3f5ee] text-[#155c3b] dark:bg-[#1f4a3a] dark:text-[#bdeed6]",
  draft: "bg-[#fff1d6] text-[#6b4a12] dark:bg-[#4a3a1a] dark:text-[#f5d9a0]",
  pilot: "bg-[#e6eef8] text-[#23466e] dark:bg-[#1f3550] dark:text-[#c5d8f0]",
  off: "bg-muted text-ink-muted",
  placeholder: "bg-muted text-ink-muted",
};

const ALL = "all";
const BLOCKS = "blocks";

function matches(f: Feature, q: string) {
  return [f.name, f.what, f.who, f.problem].join(" ").toLowerCase().includes(q);
}

/** Whether this person can use Admin: its links, and the Block showcase demos (staff-only courses), show only then. */
const CanAdmin = createContext(false);
const reachable = (href: string, admin: boolean) => admin || !href.startsWith("/admin");

export function FeatureGuideButton({ admin = false }: { admin?: boolean }) {
  const dialog = useRef<HTMLDialogElement>(null);
  const [open, setOpen] = useState(false);
  return (
    <>
      <button
        type="button"
        onClick={() => {
          setOpen(true);
          dialog.current?.showModal();
        }}
        className="mr-1 inline-flex min-h-11 min-w-11 items-center justify-center gap-2 rounded-full border border-line-strong px-3 text-base font-semibold text-ink hover:bg-muted sm:px-4 lg:max-xl:px-3"
      >
        <Icon name="spark" className="size-4" />
        <span className="hidden sm:inline lg:max-xl:hidden">Features</span>
        <span className="sr-only sm:hidden lg:max-xl:inline">Features</span>
      </button>
      <CanAdmin.Provider value={admin}>
        <dialog
          ref={dialog}
          aria-labelledby="feature-guide-title"
          onClose={() => setOpen(false)}
          onClick={(e) => e.target === e.currentTarget && dialog.current?.close()}
          className="m-auto h-[min(52rem,calc(100dvh-2rem))] w-[min(64rem,calc(100vw-2rem))] max-w-none overflow-hidden rounded-3xl bg-bg p-0 text-left text-ink shadow-2xl backdrop:bg-[#0b1626]/70"
        >
          {open && <FeatureGuide onClose={() => dialog.current?.close()} />}
        </dialog>
      </CanAdmin.Provider>
    </>
  );
}

function FeatureGuide({ onClose }: { onClose: () => void }) {
  const admin = useContext(CanAdmin);
  const [group, setGroup] = useState<string>(ALL);
  const [query, setQuery] = useState("");
  const searchId = useId();
  const q = query.trim().toLowerCase();
  const total = FEATURE_GROUPS.reduce((n, g) => n + g.features.length, 0);
  const blockCount = BLOCK_FAMILIES.reduce((n, f) => n + f.blocks.length, 0);

  const groups = useMemo(
    () =>
      FEATURE_GROUPS.filter((g) => group === ALL || g.id === group)
        .map((g) => ({ ...g, features: q ? g.features.filter((f) => matches(f, q)) : g.features }))
        .filter((g) => g.features.length),
    [group, q],
  );
  const families = useMemo(
    () =>
      group === ALL || group === BLOCKS
        ? BLOCK_FAMILIES.map((f) => ({ ...f, blocks: q ? f.blocks.filter((b) => `${b.name} ${b.what}`.toLowerCase().includes(q)) : f.blocks })).filter(
            (f) => f.blocks.length,
          )
        : [],
    [group, q],
  );
  const chip = (on: boolean) =>
    cx(
      "min-h-9 shrink-0 rounded-full px-3.5 text-sm font-semibold transition-colors",
      on ? "bg-[#007f7e] text-white" : "border border-line-strong text-ink hover:bg-[#e6f3f1] hover:text-[#007f7e] dark:hover:bg-[#3cb8b9]/15",
    );

  return (
    <div className="flex h-full flex-col">
      <header className="border-b border-line bg-surface px-5 pb-4 pt-5 sm:px-7">
        <div className="flex items-start justify-between gap-4">
          <div>
            <p className="font-mulish text-xs font-extrabold uppercase tracking-[0.14em] text-accent">What we’ve built</p>
            <h2 id="feature-guide-title" className="mt-1 font-serif text-2xl font-semibold sm:text-3xl">
              The Hub’s features at a glance
            </h2>
            <p className="mt-1 max-w-2xl text-ink-muted">
              {total} features{admin && " from the PRDs"} and {blockCount} Magazine practice blocks, grouped by where they live. Each says what it is, who it’s
              for and the problem it solves.
            </p>
          </div>
          <button
            type="button"
            onClick={onClose}
            aria-label="Close"
            className="grid size-11 shrink-0 place-items-center rounded-full border border-line-strong hover:bg-muted"
          >
            <Icon name="close" className="size-4" />
          </button>
        </div>
        <div className="mt-4 flex flex-col gap-3 sm:flex-row sm:items-center">
          <label htmlFor={searchId} className="relative block shrink-0 sm:w-60">
            <span className="sr-only">Search features</span>
            <Icon name="search" className="pointer-events-none absolute left-3 top-1/2 size-4 -translate-y-1/2 text-ink-muted" />
            <input
              id={searchId}
              type="search"
              value={query}
              onChange={(e) => setQuery(e.target.value)}
              placeholder="Search features"
              className="min-h-11 w-full rounded-full border border-line-strong bg-bg pl-9 pr-3"
            />
          </label>
          <div role="group" aria-label="Where it lives" className="scrollbar-none -mx-5 flex gap-2 overflow-x-auto px-5 sm:mx-0 sm:flex-wrap sm:px-0">
            <button type="button" aria-pressed={group === ALL} className={chip(group === ALL)} onClick={() => setGroup(ALL)}>
              Everything
            </button>
            {FEATURE_GROUPS.map((g) => (
              <button key={g.id} type="button" aria-pressed={group === g.id} className={chip(group === g.id)} onClick={() => setGroup(g.id)}>
                {g.title.split(":")[0]}
              </button>
            ))}
            <button type="button" aria-pressed={group === BLOCKS} className={chip(group === BLOCKS)} onClick={() => setGroup(BLOCKS)}>
              Practice blocks
            </button>
          </div>
        </div>
      </header>

      <div className="min-h-0 flex-1 overflow-y-auto px-5 py-6 sm:px-7">
        {!groups.length && !families.length && <p className="text-ink-muted">Nothing matches “{query.trim()}”.</p>}
        {groups.map((g) => (
          <section key={g.id} aria-labelledby={`fg-${g.id}`} className="mb-10 last:mb-0">
            <h3 id={`fg-${g.id}`} className="font-serif text-xl font-semibold sm:text-2xl">
              {g.title} <span className="text-base font-normal text-ink-muted">({g.features.length})</span>
            </h3>
            <p className="mt-1 max-w-3xl text-ink-muted">{g.intro}</p>
            {/* What Topics and Discovery Paths are, why, and how they run: the formats, above the features around them. */}
            {FORMAT_GUIDES.some((f) => f.group === g.id) && !q && (
              <div className="mt-4 flex flex-col gap-4">
                {FORMAT_GUIDES.filter((f) => f.group === g.id).map((f) => (
                  <FormatPanel key={f.id} f={f} onNavigate={onClose} />
                ))}
              </div>
            )}
            <ul className="mt-4 grid gap-3 lg:grid-cols-2">
              {g.features.map((f) => (
                <FeatureCard key={f.name} f={f} onNavigate={onClose} />
              ))}
            </ul>
          </section>
        ))}
        {families.length > 0 && (
          <section aria-labelledby="fg-blocks" className="mb-2">
            <h3 id="fg-blocks" className="font-serif text-xl font-semibold sm:text-2xl">
              Magazine practice blocks <span className="text-base font-normal text-ink-muted">({blockCount})</span>
            </h3>
            <p className="mt-1 max-w-3xl text-ink-muted">
              Simulators, roleplays and calculators an author adds to a course page.{admin && " Select a block’s name to try it."} Each one starts from a
              fictional case and needs its reviewers’ sign-off before it’s published. The Block showcase courses have a page for each, with the block to try.
            </p>
            {admin && (
              <Link
                href="/admin/magazine"
                onClick={onClose}
                className="mt-3 inline-flex min-h-11 items-center gap-1.5 font-semibold text-accent transition-colors hover:text-[#007f7e]"
              >
                Open the Block showcase courses in Admin <Icon name="arrow-right" className="size-4" />
              </Link>
            )}
            {/* Why practice blocks, and how one runs: as the other areas are introduced. */}
            {!q &&
              FORMAT_GUIDES.filter((f) => f.group === "blocks").map((f) => (
                <div key={f.id} className="mt-4">
                  <FormatPanel f={f} onNavigate={onClose} />
                </div>
              ))}
            <div className="mt-4 grid gap-4 md:grid-cols-2">
              {families.map((fam) => (
                <div key={fam.title} className="rounded-2xl border border-line bg-surface p-4">
                  <h4 className="font-mulish text-xs font-extrabold uppercase tracking-[0.12em] text-ink-muted">{fam.title}</h4>
                  <ul className="mt-2 flex flex-col gap-2">
                    {fam.blocks.map((b) => (
                      <li key={b.name}>
                        {/* Each block's name opens its page in the Block showcase, with the block to try. */}
                        {admin ? (
                          <Link
                            href={blockDemoHref(b.type)}
                            onClick={onClose}
                            className="font-semibold text-[#007f7e] transition-colors hover:bg-[#e6f3f1] dark:text-[#7fd6d2] dark:hover:bg-[#3cb8b9]/15"
                          >
                            {b.name}
                          </Link>
                        ) : (
                          <span className="font-semibold">{b.name}</span>
                        )}{" "}
                        <span className="text-ink-muted">· {b.what}</span>
                      </li>
                    ))}
                  </ul>
                </div>
              ))}
            </div>
          </section>
        )}
      </div>
    </div>
  );
}

/** One format, explained: what it is, why it's built that way, and how it runs, step by step. */
function FormatPanel({ f, onNavigate }: { f: FormatGuide; onNavigate: () => void }) {
  const admin = useContext(CanAdmin);
  const steps =
    f.id === "topics"
      ? BUILD_STAGES.map((st) => ({ label: st.label, sub: st.makes, purpose: st.purpose }))
      : (f.steps ?? PATH_FLOW).map((st) => ({ label: st.label, sub: "", purpose: st.purpose }));
  const label = "font-mulish text-xs font-extrabold uppercase tracking-[0.12em] text-accent";
  return (
    <article className="rounded-3xl border border-line bg-gradient-to-br from-[#3cb8b9]/10 via-surface to-[#fab53d]/10 p-5 sm:p-6">
      <h4 className="font-serif text-2xl font-semibold">{f.title}</h4>
      <div className="mt-3 grid gap-5 lg:grid-cols-2">
        <div>
          <p className={label}>What it is</p>
          <p className="mt-1">{f.what}</p>
        </div>
        <div>
          <p className={label}>Why it’s built this way</p>
          <ul className="mt-1 flex flex-col gap-1">
            {f.why.map((w) => (
              <li key={w} className="flex gap-2">
                <Icon name="check" className="mt-1 size-4 shrink-0 text-accent" /> <span>{w}</span>
              </li>
            ))}
          </ul>
        </div>
      </div>
      <p className={cx(label, "mt-5")}>How it runs</p>
      <ol className={cx("mt-2 grid gap-2", f.id === "topics" ? "sm:grid-cols-2 lg:grid-cols-4" : "sm:grid-cols-2 lg:grid-cols-4")}>
        {steps.map((st, i) => (
          <li key={st.label} className="flex flex-col gap-1 rounded-2xl bg-surface p-3.5 ring-1 ring-line">
            <span className="flex items-center gap-2">
              <span className="grid size-7 shrink-0 place-items-center rounded-full bg-[#007f7e] font-mulish text-xs font-extrabold text-white" aria-hidden>
                {i + 1}
              </span>
              <span className="font-semibold leading-snug">
                {st.label}
                {st.sub && <span className="block text-xs font-normal text-ink-muted">{st.sub}</span>}
              </span>
            </span>
            <span className="text-sm text-ink-muted">{st.purpose}</span>
          </li>
        ))}
      </ol>
      <dl className="mt-4 grid gap-2 text-sm sm:grid-cols-2">
        {f.also.map((a) => (
          <div key={a.label}>
            <dt className="font-semibold">{a.label}</dt>
            <dd className="text-ink-muted">{a.text}</dd>
          </div>
        ))}
      </dl>
      <div className="mt-4 flex flex-wrap gap-x-4 gap-y-1">
        {f.links
          .filter((l) => reachable(l.href, admin))
          .map((l) => (
            <Link
              key={l.href}
              href={l.href}
              onClick={onNavigate}
              className="inline-flex min-h-9 items-center gap-1 text-sm font-semibold text-accent transition-colors hover:text-[#007f7e]"
            >
              {l.label} <Icon name="arrow-right" className="size-3.5" />
            </Link>
          ))}
      </div>
    </article>
  );
}

function FeatureCard({ f, onNavigate }: { f: Feature; onNavigate: () => void }) {
  const admin = useContext(CanAdmin);
  return (
    <li className="flex flex-col gap-2 rounded-2xl border border-line bg-surface p-4">
      <div className="flex flex-wrap items-start justify-between gap-2">
        <h4 className="font-serif text-lg font-semibold leading-snug">{f.name}</h4>
        {f.status && <span className={cx("shrink-0 rounded-full px-2.5 py-0.5 text-xs font-semibold", STATUS_TONE[f.status])}>{FEATURE_STATUS[f.status]}</span>}
      </div>
      <p>{f.what}</p>
      <dl className="grid gap-1 text-sm">
        <div>
          <dt className="inline font-semibold">Who it’s for: </dt>
          <dd className="inline text-ink-muted">{f.who}</dd>
        </div>
        <div>
          <dt className="inline font-semibold">The problem it solves: </dt>
          <dd className="inline text-ink-muted">{f.problem}</dd>
        </div>
      </dl>
      <div className="mt-auto flex flex-wrap gap-x-4 gap-y-1 pt-1">
        {f.links
          .filter((l) => reachable(l.href, admin))
          .map((l) => (
            <Link
              key={l.href + l.label}
              href={l.href}
              onClick={onNavigate}
              className="inline-flex min-h-9 items-center gap-1 text-sm font-semibold text-accent transition-colors hover:text-[#007f7e]"
            >
              {l.label} <Icon name="arrow-right" className="size-3.5" />
            </Link>
          ))}
      </div>
    </li>
  );
}
