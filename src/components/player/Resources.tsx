"use client";

import type { Card } from "@/content/lessons";
import { Icon, type IconName } from "../Icon";

/* Resources card: a list of PDFs, websites and toolkits, each opening in a new tab. It never holds up the lesson. */

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

export function Resources({ card }: { card: ResourcesCard }) {
  const items = card.items.filter((i) => i.title.trim() && i.url.trim());
  if (!items.length) return <p className="rounded-2xl bg-muted p-4 text-sm text-ink-muted">No resources added yet.</p>;
  return (
    <ul className="flex flex-col gap-2 text-ink">
      {items.map((item) => {
        const kind = RESOURCE_KINDS[item.kind];
        return (
          <li key={item.id}>
            <a
              href={item.url}
              target="_blank"
              rel="noreferrer"
              className="group flex items-start gap-3 rounded-2xl border border-line bg-surface p-3 shadow-sm transition-colors hover:border-action"
            >
              <span className="grid size-9 shrink-0 place-items-center rounded-lg bg-tealtint text-accent" aria-hidden>
                <Icon name={kind.icon} className="size-4" />
              </span>
              <span className="min-w-0 flex-1">
                <span className="block font-semibold leading-snug group-hover:underline">{item.title}</span>
                <span className="block text-xs text-ink-muted">{[kind.label, fileSize(item.bytes), item.source].filter(Boolean).join(" · ")}</span>
                {item.description && <span className="mt-1 line-clamp-2 block text-sm text-ink-muted">{item.description}</span>}
              </span>
              <Icon name="external" className="mt-1 size-4 shrink-0 text-ink-muted group-hover:text-accent" />
              <span className="sr-only"> (opens in a new tab)</span>
            </a>
          </li>
        );
      })}
    </ul>
  );
}
