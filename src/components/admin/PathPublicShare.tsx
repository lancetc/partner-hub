"use client";

import { useState } from "react";
import { api, useApi } from "@/lib/api";
import { cx } from "@/lib/format";
import { confirmAction } from "@/lib/confirm";
import { Icon } from "../Icon";
import { when } from "../ReviewThreads";
import { QrShare } from "./QrShare";
import { btn, ErrorNote, input } from "./ui";

type Sharing = {
  link: { path: string; since: string } | null;
  topics: { slug: string; title: string; completed: number }[];
  /** Anonymous counts since the path was first made public; null if it never has been. */
  stats: { opened: number; completed: number; lastCompletedAt: string | null } | null;
  /** This Mac's network addresses, when the author is on localhost: links others can open. */
  origins: string[];
};

/**
  The path editor's public link: anyone with it (or its QR code) can work through the path without
  signing in, for example clients. The hub counts, anonymously, how often it's opened and finished.
*/
export function PathPublicShare({ id }: { id: string }) {
  const url = `/api/admin/learning-paths/${encodeURIComponent(id)}/public`;
  const { data, error, setData } = useApi<Sharing>(url);
  const [busy, setBusy] = useState(false);
  const [problem, setProblem] = useState<string | null>(null);
  const [copied, setCopied] = useState(false);
  if (error) return <ErrorNote text={error} />;
  if (!data) return null;
  // On localhost, a network address others can open; otherwise the address the author is using.
  const full = data.link && typeof window !== "undefined" ? `${data.origins[0] ?? window.location.origin}${data.link.path}` : "";

  async function setOn(on: boolean) {
    setBusy(true);
    setProblem(null);
    try {
      setData(await api<Sharing>(url, { body: { on } }));
    } catch (e) {
      setProblem((e as Error).message);
    }
    setBusy(false);
  }

  return (
    <section className="rounded-3xl border border-line bg-surface p-5">
      <h2 className="flex items-center gap-2 font-serif text-xl font-semibold">
        <Icon name="qr" className="size-5 text-accent" /> Public link
      </h2>
      <p className="mt-1 text-sm text-ink-muted">
        Anyone with the link or QR code can work through this path <strong>without signing in</strong>, for example clients. Nothing about them is recorded: the
        hub only counts how often it’s opened and completed. Only published topics are included.
      </p>
      {data.link ? (
        <>
          <p className="mt-4 inline-flex items-center gap-1.5 rounded-full bg-tealtint px-3 py-1 text-sm font-semibold">
            <Icon name="check" className="size-4 text-accent" /> Public since {when(data.link.since)}
          </p>
          <div className="mt-3 flex flex-wrap items-center gap-2">
            <label className="min-w-0 flex-1">
              <span className="sr-only">Public link</span>
              <input readOnly value={full} onFocus={(e) => e.currentTarget.select()} className={cx(input, "font-mono text-sm")} />
            </label>
            <button
              type="button"
              className={btn.primary}
              onClick={async () => {
                await navigator.clipboard.writeText(full).catch(() => {});
                setCopied(true);
                window.setTimeout(() => setCopied(false), 2500);
              }}
            >
              <Icon name={copied ? "check" : "copy"} className="size-4" /> {copied ? "Copied" : "Copy link"}
            </button>
            <a href={data.link.path} target="_blank" rel="noopener" className={btn.secondary}>
              Open
            </a>
            <QrShare kind="open" id={id} />
          </div>
          <p className="mt-2 flex flex-wrap items-center gap-x-3 gap-y-1 text-sm text-ink-muted">
            {data.origins.length > 0 && <span>Uses this computer’s network address, so people on the same network can open it.</span>}
            <button
              type="button"
              disabled={busy}
              className="font-semibold text-accent underline-offset-4 hover:underline"
              onClick={async () =>
                (await confirmAction(
                  "The link and QR code stop working straight away, including any already handed out. The counts are kept. Making it public again gives it a new link and QR code.",
                  { title: "Make this path private again?", confirmLabel: "Make private", danger: true },
                )) && setOn(false)
              }
            >
              Make it private again
            </button>
          </p>
        </>
      ) : (
        <button type="button" disabled={busy || !data.topics.length} className={cx(btn.primary, "mt-4")} onClick={() => setOn(true)}>
          <Icon name="plus" className="size-4" /> {busy ? "Making it public…" : "Make this path public"}
        </button>
      )}
      {!data.link && !data.topics.length && <p className="mt-2 text-sm text-ink-muted">Publish at least one of its topics first.</p>}
      {problem && <ErrorNote text={problem} />}

      {data.stats && (
        <div className="mt-5 border-t border-line pt-4">
          <h3 className="font-semibold">Completions from the public link</h3>
          <dl className="mt-2 grid grid-cols-2 gap-2 sm:grid-cols-3">
            <div className="rounded-2xl bg-muted p-3">
              <dt className="text-sm text-ink-muted">Opened</dt>
              <dd className="font-mulish text-2xl font-extrabold">{data.stats.opened.toLocaleString("en-AU")}</dd>
            </div>
            <div className="rounded-2xl bg-muted p-3">
              <dt className="text-sm text-ink-muted">Completed the path</dt>
              <dd className="font-mulish text-2xl font-extrabold">{data.stats.completed.toLocaleString("en-AU")}</dd>
            </div>
            <div className="col-span-2 rounded-2xl bg-muted p-3 sm:col-span-1">
              <dt className="text-sm text-ink-muted">Last completed</dt>
              <dd className="mt-1 font-semibold">{data.stats.lastCompletedAt ? when(data.stats.lastCompletedAt) : "Not yet"}</dd>
            </div>
          </dl>
          {data.topics.length > 0 && (
            <table className="mt-3 w-full text-sm">
              <caption className="sr-only">Times each topic was completed from the public link</caption>
              <thead>
                <tr className="text-left text-ink-muted">
                  <th scope="col" className="py-1 font-medium">
                    Topic
                  </th>
                  <th scope="col" className="py-1 text-right font-medium">
                    Completed
                  </th>
                </tr>
              </thead>
              <tbody>
                {data.topics.map((t) => (
                  <tr key={t.slug} className="border-t border-line">
                    <td className="py-1.5 pr-3">{t.title}</td>
                    <td className="py-1.5 text-right font-semibold tabular-nums">{t.completed.toLocaleString("en-AU")}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          )}
          <p className="mt-2 text-xs text-ink-muted">
            Counted once per phone or computer, without knowing who it is. Someone who clears their browser or switches devices is counted again.
          </p>
        </div>
      )}
    </section>
  );
}
