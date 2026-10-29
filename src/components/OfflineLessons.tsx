"use client";

import { useEffect, useState } from "react";
import Link from "next/link";
import { formatBytes, removeDownload, supportsOffline, useDownloads } from "@/lib/offlineLessons";
import { useHydrated } from "@/lib/store";
import { Icon } from "./Icon";

/* Profile and settings: lessons saved on this device for offline use, and how much space they take. */
export function OfflineLessons() {
  const hydrated = useHydrated();
  const { downloads } = useDownloads();
  const [space, setSpace] = useState<{ used: number; persisted: boolean } | null>(null);
  useEffect(() => {
    if (!hydrated || !navigator.storage?.estimate) return;
    void Promise.all([navigator.storage.estimate(), navigator.storage.persisted?.() ?? Promise.resolve(false)]).then(([e, p]) =>
      setSpace({ used: e.usage ?? 0, persisted: p }),
    );
  }, [hydrated, downloads.length]);

  return (
    <section className="mt-5 rounded-3xl border border-line bg-surface p-5">
      <h2 className="flex items-center gap-2 font-serif text-xl font-semibold">
        <Icon name="upload" className="size-5 rotate-180 text-accent" /> Offline topics
      </h2>
      {!hydrated ? null : !supportsOffline() ? (
        <p className="mt-2 text-ink-muted">This browser can’t save topics for offline use. Try Chrome, Edge or Safari.</p>
      ) : (
        <>
          <p className="mt-1 text-ink-muted">
            Topics saved on this device open without a connection. Use <strong>Download for offline</strong> on a topic or learning path. Anything you do
            offline is saved here and syncs when you’re back online.
          </p>
          {downloads.length ? (
            <ul className="mt-3 divide-y divide-line">
              {downloads.map((d) => (
                <li key={d.slug} className="flex flex-wrap items-center justify-between gap-2 py-2.5">
                  <span>
                    <Link href={`/learning/${d.slug}`} className="font-semibold hover:underline">
                      {d.title}
                    </Link>
                    <span className="block text-sm text-ink-muted">
                      {formatBytes(d.bytes)} · saved {new Date(d.savedAt).toLocaleDateString("en-AU", { day: "numeric", month: "short" })}
                    </span>
                  </span>
                  <button
                    type="button"
                    onClick={() => void removeDownload(d.slug)}
                    className="text-sm font-semibold text-ink-muted hover:text-ink hover:underline"
                  >
                    Remove
                  </button>
                </li>
              ))}
            </ul>
          ) : (
            <p className="mt-3 rounded-2xl bg-muted p-3 text-sm">No topics saved on this device yet.</p>
          )}
          {space && (
            <p className="mt-3 text-xs text-ink-muted">
              The hub is using {formatBytes(space.used)} on this device.{" "}
              {space.persisted ? "Your browser will keep it." : "On iPhone, add the hub to your Home Screen so saved topics aren’t cleared."}
            </p>
          )}
        </>
      )}
    </section>
  );
}
