"use client";

import Link from "next/link";
import { cx } from "@/lib/format";
import { btn, input } from "./ui";
import { Icon } from "../Icon";

/*
  The admin lists for Topics, Discovery Paths and Magazine share one layout, the Topics one: a heading
  with the New button, a line about the list, a toolbar (search, filters, sort and a count), portrait
  cards (picture with status badges, a details line, who it's for, the title, an Edit button the width
  of the card, then a secondary link and Delete), and the deleted ones to restore at the bottom.
*/

export function AdminListHeader({ title, action, children }: { title: string; action?: React.ReactNode; children?: React.ReactNode }) {
  return (
    <>
      <div className="mb-4 flex flex-wrap items-center justify-between gap-3">
        <h2 className="font-serif text-xl font-semibold">{title}</h2>
        {action}
      </div>
      {children && <div className="max-w-3xl text-ink-muted">{children}</div>}
    </>
  );
}

export type ToolbarSelect = { label: string; value: string; onChange: (v: string) => void; options: { value: string; label: string }[] };

/** Search, filters and sort, with how many show. */
export function AdminToolbar({
  search,
  selects,
  count,
}: {
  search: { value: string; onChange: (v: string) => void; placeholder: string };
  selects: ToolbarSelect[];
  count: string;
}) {
  return (
    <div className="mt-6 flex flex-wrap items-end gap-3">
      <label className="flex min-w-[14rem] flex-1 flex-col gap-1 text-sm font-semibold sm:max-w-xs">
        Search
        <span className="relative">
          <Icon name="search" className="pointer-events-none absolute left-3 top-1/2 size-4 -translate-y-1/2 text-ink-muted" />
          <input
            type="search"
            className={cx(input, "pl-9 font-normal")}
            placeholder={search.placeholder}
            value={search.value}
            onChange={(e) => search.onChange(e.target.value)}
          />
        </span>
      </label>
      {selects.map((s) => (
        <label key={s.label} className="flex flex-col gap-1 text-sm font-semibold">
          {s.label}
          <select className={cx(input, "w-auto font-normal")} value={s.value} onChange={(e) => s.onChange(e.target.value)}>
            {s.options.map((o) => (
              <option key={o.value} value={o.value}>
                {o.label}
              </option>
            ))}
          </select>
        </label>
      ))}
      <p className="ml-auto pb-2.5 text-sm text-ink-muted" role="status">
        {count}
      </p>
    </div>
  );
}

/** The cards in a grid: three across on a wide screen, or four for smaller cards. */
export function AdminGrid({ children, columns = 3 }: { children: React.ReactNode; columns?: 3 | 4 }) {
  return (
    <ul className={columns === 4 ? "mt-4 grid gap-5 sm:grid-cols-2 lg:grid-cols-3 xl:grid-cols-4" : "mt-4 grid gap-5 sm:grid-cols-2 lg:grid-cols-3"}>
      {children}
    </ul>
  );
}

export function AdminEmpty({ text, onClear }: { text: string; onClear?: () => void }) {
  return (
    <p className="mt-4 rounded-3xl border border-dashed border-line-strong p-6 text-center text-ink-muted">
      {text}{" "}
      {onClear && (
        <button type="button" className="font-semibold text-accent hover:underline" onClick={onClear}>
          Clear search and filters
        </button>
      )}
    </p>
  );
}

/** A teal cover with an icon, for something without a picture of its own. */
export function PlainCover({ icon }: { icon: React.ComponentProps<typeof Icon>["name"] }) {
  return (
    <div className="grid aspect-[4/3] place-items-center bg-[#008282] text-white" aria-hidden>
      <Icon name={icon} className="size-12" />
    </div>
  );
}

/** One item, as a portrait card, like a topic on the Topics list. */
export function AdminCard({
  cover,
  badges,
  meta,
  chips,
  title,
  href,
  children,
  editHref,
  editLabel,
  secondary,
  onDelete,
  deleteLabel,
  deleting = false,
  disabled = false,
}: {
  /** The picture, 4:3. */
  cover: React.ReactNode;
  badges?: React.ReactNode;
  meta: string;
  /** Who it's for. */
  chips?: string[];
  title: string;
  /** Where the title goes (the live page), if anywhere yet. */
  href?: string | null;
  children?: React.ReactNode;
  editHref?: string;
  editLabel: string;
  /** Beside Delete: Preview, View live, a QR code. */
  secondary?: React.ReactNode;
  onDelete?: () => void;
  deleteLabel: string;
  deleting?: boolean;
  disabled?: boolean;
}) {
  return (
    <li className="flex flex-col overflow-hidden rounded-3xl border border-line bg-surface shadow-sm transition-shadow hover:shadow-md">
      <div className="relative">
        {cover}
        {badges && <div className="absolute left-3 right-3 top-3 flex flex-wrap gap-1.5 *:bg-surface! *:shadow-sm">{badges}</div>}
      </div>
      <div className="flex flex-1 flex-col gap-2 p-4">
        <p className="font-mulish text-xs font-extrabold uppercase tracking-[0.12em] text-accent">{meta}</p>
        {chips &&
          (chips.length > 0 ? (
            <ul aria-label="Audience" className="flex flex-wrap gap-1.5">
              {chips.map((a) => (
                <li key={a} className="inline-flex items-center gap-1 rounded-full bg-tealtint px-2.5 py-0.5 text-xs font-semibold">
                  <Icon name="people" className="size-3.5 text-accent" /> {a}
                </li>
              ))}
            </ul>
          ) : (
            <p className="text-xs text-ink-muted">Audience not set</p>
          ))}
        <h3 className="font-serif text-lg font-semibold leading-snug">
          {href ? (
            <Link href={href} className="hover:underline">
              {title}
            </Link>
          ) : (
            title
          )}
        </h3>
        {children}
        <div className="mt-auto flex flex-col gap-2 pt-2">
          {editHref && (
            <Link href={editHref} className={cx(btn.primary, "w-full justify-center")}>
              {editLabel}
            </Link>
          )}
          <div className="flex items-center justify-between gap-2">
            {secondary ?? <span />}
            {onDelete && (
              <button
                type="button"
                onClick={onDelete}
                disabled={disabled}
                aria-label={`${deleteLabel}: ${title}`}
                title={deleteLabel}
                className="grid size-10 place-items-center rounded-full text-danger hover:bg-danger/10 disabled:opacity-50"
              >
                {deleting ? (
                  <span className="size-4 animate-spin rounded-full border-2 border-current border-t-transparent" />
                ) : (
                  <Icon name="trash" className="size-4" />
                )}
              </button>
            )}
          </div>
        </div>
      </div>
    </li>
  );
}

/** A quiet link beside Delete on a card. */
export const cardLink = "inline-flex min-h-10 items-center gap-1.5 rounded-full px-2 text-sm font-semibold text-accent hover:bg-muted";

/** The deleted ones, to restore. */
export function DeletedList({
  title,
  note,
  items,
  onRestore,
  busyId,
}: {
  title: string;
  note: string;
  items: { id: string; title: string; detail: string; canRestore?: boolean }[];
  onRestore: (id: string) => void;
  busyId?: string | null;
}) {
  if (!items.length) return null;
  return (
    <details className="mt-8 rounded-3xl border border-line bg-surface p-5">
      <summary className="cursor-pointer font-serif text-lg font-semibold">
        {title} ({items.length})
      </summary>
      <p className="mt-2 text-sm text-ink-muted">{note}</p>
      <ul className="mt-3 divide-y divide-line">
        {items.map((d) => (
          <li key={d.id} className="flex flex-wrap items-center justify-between gap-3 py-3">
            <span>
              <span className="font-semibold">{d.title}</span>
              <span className="block text-sm text-ink-muted">{d.detail}</span>
            </span>
            {d.canRestore !== false && (
              <button type="button" className={btn.secondary} disabled={Boolean(busyId)} onClick={() => onRestore(d.id)}>
                <Icon name="refresh" className="size-4" /> {busyId === d.id ? "Restoring…" : "Restore"}
              </button>
            )}
          </li>
        ))}
      </ul>
    </details>
  );
}

export const deletedOn = (iso: string) => `deleted ${new Date(iso).toLocaleDateString("en-AU", { day: "numeric", month: "short", year: "numeric" })}`;
