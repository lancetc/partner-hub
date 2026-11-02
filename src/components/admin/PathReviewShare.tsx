"use client";

import { useState } from "react";
import { api, useApi } from "@/lib/api";
import { cx } from "@/lib/format";
import { confirmAction } from "@/lib/confirm";
import { Icon } from "../Icon";
import { when } from "../ReviewThreads";
import { btn, ErrorNote, input } from "./ui";

type Sharing = {
  link: { path: string; since: string } | null;
  topics: number;
  reviewers: { name: string; email: string; comments: number }[];
  /** This Mac's network addresses, when the author is on localhost: links others can open. */
  origins: string[];
};

/** The path editor's review link: one address for reviewers to work through every topic and comment on any card. */
export function PathReviewShare({ id }: { id: string }) {
  const url = `/api/admin/learning-paths/${encodeURIComponent(id)}/review`;
  const { data, error, setData } = useApi<Sharing>(url);
  const [busy, setBusy] = useState(false);
  const [problem, setProblem] = useState<string | null>(null);
  const [copied, setCopied] = useState(false);
  if (error) return <ErrorNote text={error} />;
  if (!data) return null;
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
        <Icon name="people" className="size-5 text-accent" /> Share for review
      </h2>
      <p className="mt-1 text-sm text-ink-muted">
        One private link to the whole path. Reviewers give their name and email once, then open each topic’s latest <strong>saved</strong> draft and comment on
        any card. Comments appear in each topic’s Comments tab.
      </p>
      {data.link ? (
        <>
          <div className="mt-4 flex flex-wrap items-center gap-2">
            <label className="min-w-0 flex-1">
              <span className="sr-only">Path review link</span>
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
          </div>
          <p className="mt-2 flex flex-wrap items-center gap-x-3 gap-y-1 text-sm text-ink-muted">
            <span>
              On since {when(data.link.since)}.{data.origins.length > 0 && " Uses this computer’s network address, so people on the same network can open it."}
            </span>
            <button
              type="button"
              disabled={busy}
              className="font-semibold text-accent underline-offset-4 hover:underline"
              onClick={async () =>
                (await confirmAction(
                  "The path link stops working straight away. Each topic’s own review link stays on, and comments are kept. Switching it on again makes a new link.",
                  { title: "Switch off the path review link?", confirmLabel: "Switch off", danger: true },
                )) && setOn(false)
              }
            >
              Switch off the link
            </button>
          </p>
          {data.origins.length > 1 && (
            <p className="mt-2 text-sm text-ink-muted">
              This computer is on more than one network. If the link doesn’t open for someone, try{" "}
              {data.origins.slice(1).map((o, i) => (
                <span key={o}>
                  {i > 0 && " or "}
                  <span className="break-all font-mono">{`${o}${data.link!.path}`}</span>
                </span>
              ))}
              .
            </p>
          )}
        </>
      ) : (
        <button type="button" disabled={busy || !data.topics} className={cx(btn.primary, "mt-4")} onClick={() => setOn(true)}>
          <Icon name="plus" className="size-4" /> {busy ? "Creating…" : "Create a review link"}
        </button>
      )}
      {problem && <ErrorNote text={problem} />}
      {data.reviewers.length > 0 && (
        <div className="mt-4">
          <h3 className="text-sm font-semibold">Comments so far</h3>
          <ul className="mt-1 flex flex-col gap-1 text-sm">
            {data.reviewers.map((r) => (
              <li key={r.email + r.name}>
                {r.name}{" "}
                <span className="text-ink-muted">
                  · {r.email} · {r.comments} {r.comments === 1 ? "comment" : "comments"}
                </span>
              </li>
            ))}
          </ul>
        </div>
      )}
    </section>
  );
}
