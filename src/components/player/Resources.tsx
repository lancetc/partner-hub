"use client";

import { useState } from "react";
import type { Card } from "@/content/lessons";
import { cx } from "@/lib/format";
import { Icon, type IconName } from "../Icon";
import { PdfReader } from "./CardDocument";

/*
  Resources card: a list of PDFs, websites and toolkits. Uploaded PDFs open in the lesson's own
  reader; websites and other links open in a new tab. It never holds up the lesson.
*/

type ResourcesCard = Extract<Card, { type: "resources" }>;
type Item = ResourcesCard["items"][number];

export const RESOURCE_KINDS: Record<Item["kind"], { label: string; plural: string; icon: IconName }> = {
  pdf: { label: "PDF", plural: "PDFs", icon: "file" },
  link: { label: "Website", plural: "websites", icon: "external" },
  toolkit: { label: "Toolkit", plural: "toolkits", icon: "folder" },
  video: { label: "Video", plural: "videos", icon: "play" },
};

export const fileSize = (bytes?: number) =>
  !bytes ? "" : bytes >= 1024 * 1024 ? `${(bytes / 1024 / 1024).toFixed(1)} MB` : `${Math.max(1, Math.round(bytes / 1024))} KB`;

/** PDFs uploaded to the hub (not other sites' files, which usually can't be read across sites). */
const ownPdf = (item: Item) => item.kind === "pdf" && item.url.startsWith("/");

/** The site a link goes to, without "www.", so learners can see where they're headed. Hub files have none. */
export function siteOf(url: string) {
  if (url.startsWith("/")) return null;
  try {
    return new URL(url).hostname.replace(/^www\./, "");
  } catch {
    return null;
  }
}

/** One resource's tile: shared by the card and the editor's preview, so they always look the same. */
export const resourceTile = (compact = false) =>
  cx(
    "group flex w-full items-center rounded-2xl bg-surface text-left text-ink shadow-sm ring-1 ring-line transition [text-shadow:none] hover:shadow-md hover:ring-action",
    compact ? "gap-2 p-2" : "gap-3 p-3 pr-2.5",
  );

export function ResourceTileBody({ item, compact = false }: { item: Item; compact?: boolean }) {
  const kind = RESOURCE_KINDS[item.kind];
  const site = siteOf(item.url);
  // Government sources get a building, the sign of an official site; anything else shows what it is.
  const official = Boolean(site?.endsWith(".gov.au"));
  const inside = ownPdf(item);
  return (
    <>
      <span
        aria-hidden
        className={cx("grid shrink-0 place-items-center bg-tealtint text-accent", compact ? "size-8 rounded-lg" : "size-11 rounded-xl")}
      >
        <Icon name={official ? "landmark" : kind.icon} className={compact ? "size-4" : "size-5"} />
      </span>
      <span className="min-w-0 flex-1">
        <span className={cx("line-clamp-2 font-semibold leading-snug group-hover:underline", compact && "text-[0.8rem]")}>{item.title}</span>
        <span className={cx("block truncate text-ink-muted", compact ? "text-[0.65rem]" : "text-xs")}>
          {item.source || [kind.label, fileSize(item.bytes)].filter(Boolean).join(" · ")}
        </span>
        {site && <span className={cx("block truncate font-semibold text-accent", compact ? "text-[0.65rem]" : "text-xs")}>{site}</span>}
        {inside && item.source && fileSize(item.bytes) && (
          <span className={cx("block text-ink-muted", compact ? "text-[0.65rem]" : "text-xs")}>PDF · {fileSize(item.bytes)}</span>
        )}
        {item.description && !compact && <span className="mt-1 line-clamp-2 block text-sm text-ink-muted">{item.description}</span>}
      </span>
      <span
        aria-hidden
        className={cx(
          "grid shrink-0 place-items-center rounded-full bg-tealtint text-accent transition-colors group-hover:bg-action group-hover:text-on-action",
          compact ? "size-7" : "size-9",
        )}
      >
        <Icon name={inside ? "doc" : "external"} className={compact ? "size-3.5" : "size-4"} />
      </span>
    </>
  );
}

export function Resources({ card }: { card: ResourcesCard }) {
  const items = card.items.filter((i) => i.title.trim() && i.url.trim());
  const [reading, setReading] = useState<Item | null>(null);
  if (!items.length) return <p className="rounded-2xl bg-muted p-4 text-sm text-ink-muted">No resources added yet.</p>;
  return (
    <ul className="flex flex-col gap-2.5 text-ink">
      {items.map((item) => {
        if (ownPdf(item))
          return (
            <li key={item.id}>
              <button type="button" onClick={() => setReading(item)} className={resourceTile()}>
                <ResourceTileBody item={item} />
              </button>
            </li>
          );
        return (
          <li key={item.id}>
            <a href={item.url} rel="noreferrer" className={resourceTile()}>
              <ResourceTileBody item={item} />
              <span className="sr-only"> (leaves the topic; Back returns to this card)</span>
            </a>
          </li>
        );
      })}
      {reading && <PdfReader pdf={{ src: reading.url, title: reading.title }} onClose={() => setReading(null)} />}
    </ul>
  );
}
