"use client";

import Link from "next/link";
import { useRouter } from "next/navigation";
import { useMemo, useState } from "react";
import { api, useApi } from "@/lib/api";
import { cx } from "@/lib/format";
import { AdminShell, ErrorNote, input } from "./ui";
import { Icon } from "../Icon";
import { threadsOf, ThreadView, when, type ReviewAction, type ReviewComment } from "../ReviewThreads";

/*
  Every review comment in one place: what reviewers have said on topic cards, by topic, newest first.
  Reply and resolve here, or open the card in the editor to change it.
*/

type Topic = { slug: string; title: string; latest: string; comments: ReviewComment[] };
type Data = { topics: Topic[]; open: number };
type Show = "open" | "resolved" | "all";

const editLink = (slug: string, card?: string) => `/admin/lessons/${encodeURIComponent(slug)}/edit${card ? `?card=${encodeURIComponent(card)}` : ""}`;

export function AllComments() {
  const router = useRouter();
  const { data, error, reload } = useApi<Data>("/api/admin/review-comments");
  const [show, setShow] = useState<Show>("open");
  const [topic, setTopic] = useState("");
  const [person, setPerson] = useState("");
  const [actError, setActError] = useState<string | null>(null);

  const people = useMemo(
    () => [...new Set((data?.topics ?? []).flatMap((t) => t.comments.filter((c) => c.by.role === "Reviewer").map((c) => c.by.name)))].sort(),
    [data],
  );
  const all = useMemo(() => (data?.topics ?? []).flatMap((t) => threadsOf(t.comments)), [data]);
  const counts = {
    open: all.filter((t) => !t.resolved).length,
    resolved: all.filter((t) => t.resolved).length,
    reviewers: people.length,
    topics: data?.topics.length ?? 0,
  };

  // Threads that match the filters, newest activity first, still grouped by topic.
  const shown = (data?.topics ?? [])
    .filter((t) => !topic || t.slug === topic)
    .map((t) => ({
      ...t,
      threads: threadsOf(t.comments)
        .filter((th) => (show === "all" ? true : show === "open" ? !th.resolved : Boolean(th.resolved)))
        .filter((th) => !person || th.by.name === person || th.replies.some((r) => r.by.name === person))
        .sort((a, b) => latestOf(b).localeCompare(latestOf(a))),
    }))
    .filter((t) => t.threads.length);

  const act = (slug: string) => async (a: ReviewAction) => {
    try {
      await api(`/api/admin/lessons/${encodeURIComponent(slug)}/review`, { body: a });
      setActError(null);
      reload();
      return true;
    } catch (e) {
      setActError((e as Error).message);
      return false;
    }
  };

  return (
    <AdminShell title="Comments">
      <p className="max-w-3xl text-ink-muted">
        Everything reviewers have said about topic cards. Reply or resolve a comment here, or open the card in the editor to change it. Reviewers add their name
        the first time they press Comment on a card.
      </p>
      {(error || actError) && (
        <div className="mt-4">
          <ErrorNote text={(error || actError)!} />
        </div>
      )}
      {!data ? (
        <p className="mt-6 text-ink-muted">Loading…</p>
      ) : (
        <div className="mt-6 flex flex-col gap-6">
          <dl className="grid grid-cols-2 gap-3 sm:grid-cols-4">
            {(
              [
                ["Open", counts.open],
                ["Resolved", counts.resolved],
                ["Reviewers", counts.reviewers],
                ["Topics", counts.topics],
              ] as const
            ).map(([label, n]) => (
              <div key={label} className="rounded-2xl border border-line bg-surface p-4">
                <dt className="text-sm text-ink-muted">{label}</dt>
                <dd className="font-serif text-3xl font-semibold">{n}</dd>
              </div>
            ))}
          </dl>

          {counts.topics > 0 && (
            <div className="flex flex-wrap items-end gap-3">
              <div role="group" aria-label="Show" className="inline-flex rounded-full border border-line-strong p-1">
                {(["open", "resolved", "all"] as const).map((s) => (
                  <button
                    key={s}
                    type="button"
                    aria-pressed={show === s}
                    onClick={() => setShow(s)}
                    className={cx("min-h-10 rounded-full px-4 text-sm font-semibold", show === s ? "bg-action text-on-action" : "hover:bg-muted")}
                  >
                    {s === "open" ? `Open (${counts.open})` : s === "resolved" ? `Resolved (${counts.resolved})` : "All"}
                  </button>
                ))}
              </div>
              <label className="flex min-w-0 flex-col gap-1 text-sm font-semibold">
                Topic
                <select className={cx(input, "min-w-0 sm:w-72")} value={topic} onChange={(e) => setTopic(e.target.value)}>
                  <option value="">All topics</option>
                  {data.topics.map((t) => (
                    <option key={t.slug} value={t.slug}>
                      {t.title}
                    </option>
                  ))}
                </select>
              </label>
              {people.length > 0 && (
                <label className="flex min-w-0 flex-col gap-1 text-sm font-semibold">
                  Reviewer
                  <select className={cx(input, "min-w-0 sm:w-56")} value={person} onChange={(e) => setPerson(e.target.value)}>
                    <option value="">Everyone</option>
                    {people.map((p) => (
                      <option key={p} value={p}>
                        {p}
                      </option>
                    ))}
                  </select>
                </label>
              )}
            </div>
          )}

          {counts.topics === 0 ? (
            <p className="max-w-2xl rounded-3xl border border-line p-6 text-ink-muted">
              No comments yet. When reviewers press <strong>Comment</strong> at the bottom of a card, what they write appears here.
            </p>
          ) : !shown.length ? (
            <p className="text-ink-muted">{show === "open" ? "No open comments. Everything has been resolved." : "No comments match these filters."}</p>
          ) : (
            shown.map((t) => (
              <section key={t.slug} aria-labelledby={`topic-${t.slug}`} className="rounded-3xl border border-line bg-surface p-4 sm:p-5">
                <div className="flex flex-wrap items-baseline justify-between gap-2">
                  <h2 id={`topic-${t.slug}`} className="font-serif text-2xl font-semibold leading-tight">
                    {t.title}
                  </h2>
                  <Link href={editLink(t.slug)} className="inline-flex items-center gap-1 text-sm font-semibold text-accent hover:underline">
                    <Icon name="pen" className="size-4" /> Open the topic
                  </Link>
                </div>
                <ul className="mt-4 flex flex-col gap-4">
                  {t.threads.map((th) => (
                    <li key={th.id}>
                      <p className="mb-1.5 flex flex-wrap items-center gap-x-2 text-sm">
                        <span className="font-semibold">{th.heading || "A card"}</span>
                        <span className="text-ink-muted">· {when(latestOf(th))}</span>
                      </p>
                      <ul>
                        <ThreadView thread={th} canResolve act={act(t.slug)} showCard={() => router.push(editLink(t.slug, th.card))} />
                      </ul>
                    </li>
                  ))}
                </ul>
              </section>
            ))
          )}
        </div>
      )}
    </AdminShell>
  );
}

/** When a thread last had a comment: its first comment or its latest reply. */
function latestOf(t: ReviewComment & { replies: ReviewComment[] }) {
  return t.replies.reduce((at, r) => (r.at > at ? r.at : at), t.at);
}
