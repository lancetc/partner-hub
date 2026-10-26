"use client";

import Link from "next/link";
import { useState } from "react";
import { api, useApi } from "@/lib/api";
import { cx, formatDate } from "@/lib/format";
import { Icon } from "./Icon";
import { WebinarPlayer } from "./WebinarPlayer";

/* Learner-facing webinar recordings: a list with topic filters, and a watch page. */

type Webinar = {
  id: string;
  title: string;
  summary: string;
  presenter: string;
  recordedOn: string;
  minutes: number;
  video: { provider: "youtube" | "synthesia" | "upload"; id?: string; src?: string };
  thumbnail: string | null;
  topics: string[];
  transcript?: string;
  resources: { title: string; url: string }[];
  watched: boolean;
};

export function WebinarIndex() {
  const { data, error } = useApi<{ webinars: Webinar[] }>("/api/webinars");
  const [topic, setTopic] = useState<string | null>(null);
  const topics = [...new Set((data?.webinars ?? []).flatMap((w) => w.topics))];
  const shown = (data?.webinars ?? []).filter((w) => !topic || w.topics.includes(topic));
  return (
    <div className="mx-auto max-w-7xl px-4 pt-8 sm:px-6 lg:pt-10">
      <h1 className="font-serif text-4xl font-semibold tracking-tight sm:text-5xl">Webinars</h1>
      <p className="mt-2 max-w-2xl text-lg text-ink-muted">Recordings of our sessions for partners and coordinators. Watch when it suits you.</p>
      {topics.length > 1 && (
        <div className="mt-6 flex flex-wrap gap-2" role="group" aria-label="Filter by topic">
          {[null, ...topics].map((t) => (
            <button
              key={t ?? "all"}
              type="button"
              aria-pressed={topic === t}
              onClick={() => setTopic(t)}
              className={cx("min-h-10 rounded-full border px-4 text-sm font-medium", topic === t ? "border-action bg-tealtint" : "border-line-strong hover:bg-muted")}
            >
              {t ?? "All"}
            </button>
          ))}
        </div>
      )}
      {error && <p className="mt-6 text-ink-muted">Webinars couldn’t load: {error}</p>}
      {data && !shown.length && <p className="mt-6 text-ink-muted">No recordings yet. Check back soon.</p>}
      <ul className="mt-8 grid gap-x-8 gap-y-10 sm:grid-cols-2 lg:grid-cols-3">
        {shown.map((w) => (
          <li key={w.id} className="group relative flex flex-col gap-3">
            <div className="relative aspect-video overflow-hidden rounded-2xl bg-[#0f2642]">
              {/* eslint-disable-next-line @next/next/no-img-element */}
              {w.thumbnail && <img src={w.thumbnail} alt="" className="absolute inset-0 size-full object-cover object-[50%_25%] transition-transform group-hover:scale-[1.02]" />}
              <span className="absolute inset-0 grid place-items-center">
                <span className="grid size-14 place-items-center rounded-full bg-white/95 text-[#0f2642] shadow-lg">
                  <Icon name="play" className="ml-0.5 size-6" />
                </span>
              </span>
              <span className="absolute bottom-2 right-2 rounded-full bg-black/60 px-2 py-0.5 text-xs font-bold text-white">{w.minutes} min</span>
            </div>
            <p className="flex flex-wrap items-center gap-2 font-mulish text-xs font-extrabold uppercase tracking-[0.12em] text-accent">
              {formatDate(w.recordedOn)}
              {w.watched && (
                <span className="inline-flex items-center gap-1 normal-case tracking-normal text-ink-muted">
                  <Icon name="check" className="size-3.5" /> Watched
                </span>
              )}
            </p>
            <h2 className="font-serif text-xl font-semibold leading-snug">
              <Link href={`/webinars/${w.id}`} className="after:absolute after:inset-0 after:content-[''] group-hover:underline group-hover:underline-offset-4">
                {w.title}
              </Link>
            </h2>
            <p className="text-ink-muted">{w.summary}</p>
            {w.presenter && <p className="text-sm font-medium">{w.presenter}</p>}
          </li>
        ))}
      </ul>
    </div>
  );
}

export function WebinarWatch({ id }: { id: string }) {
  const { data, error } = useApi<Webinar>(`/api/webinars/${id}`);
  const [watched, setWatched] = useState<boolean | null>(null);
  const [transcript, setTranscript] = useState(false);
  const isWatched = watched ?? data?.watched ?? false;
  const mark = () => api(`/api/webinars/${id}`, { body: { action: "watched" } }).then(() => setWatched(true), () => {});
  if (error) return <p className="mx-auto max-w-4xl px-4 py-10 text-ink-muted">{error}</p>;
  if (!data) return <p className="mx-auto max-w-4xl px-4 py-10 text-ink-muted">Loading…</p>;
  return (
    <div className="mx-auto max-w-4xl px-4 pt-6 sm:px-6 lg:pt-8">
      <Link href="/webinars" className="inline-flex min-h-11 items-center gap-2 text-sm font-medium text-ink-muted hover:text-ink">
        <Icon name="arrow-left" className="size-4" /> All webinars
      </Link>
      <WebinarPlayer video={data.video} title={data.title} poster={data.thumbnail} onEnded={mark} />
      <div className="mt-6 flex flex-wrap items-start justify-between gap-4">
        <div className="min-w-0 flex-1">
          <p className="font-mulish text-xs font-extrabold uppercase tracking-[0.12em] text-accent">
            Webinar · {formatDate(data.recordedOn)} · {data.minutes} min
          </p>
          <h1 className="mt-1 font-serif text-3xl font-semibold leading-tight sm:text-4xl">{data.title}</h1>
          {data.presenter && <p className="mt-2 font-medium">{data.presenter}</p>}
        </div>
        <button
          type="button"
          onClick={mark}
          disabled={isWatched}
          className={cx("inline-flex min-h-11 items-center gap-2 rounded-full px-5 font-semibold", isWatched ? "bg-tealtint text-accent" : "bg-action text-on-action hover:bg-action-hover")}
        >
          <Icon name="check" className="size-4" /> {isWatched ? "Watched" : "Mark as watched"}
        </button>
      </div>
      <p className="mt-4 max-w-2xl text-lg">{data.summary}</p>
      {data.topics.length > 0 && (
        <div className="mt-3 flex flex-wrap gap-1.5">
          {data.topics.map((t) => (
            <span key={t} className="rounded-full bg-muted px-3 py-1 text-sm">
              {t}
            </span>
          ))}
        </div>
      )}
      {data.resources.length > 0 && (
        <section className="mt-8">
          <h2 className="font-serif text-xl font-semibold">Resources</h2>
          <ul className="mt-2 flex flex-col gap-2">
            {data.resources.map((r) => (
              <li key={r.url}>
                <a href={r.url} target="_blank" rel="noreferrer" className="inline-flex min-h-11 items-center gap-2 rounded-2xl border border-line px-4 hover:bg-muted">
                  <Icon name="external" className="size-4 text-accent" /> {r.title}
                </a>
              </li>
            ))}
          </ul>
        </section>
      )}
      {data.transcript && (
        <section className="mt-8 pb-10">
          <button type="button" aria-expanded={transcript} onClick={() => setTranscript((t) => !t)} className="inline-flex min-h-11 items-center gap-2 font-semibold text-accent">
            {transcript ? "Hide the transcript" : "Read the transcript"} <Icon name="chevron-down" className={cx("size-4 transition-transform", transcript && "rotate-180")} />
          </button>
          {transcript && <p className="mt-2 whitespace-pre-line rounded-2xl bg-muted p-4 leading-relaxed">{data.transcript}</p>}
        </section>
      )}
    </div>
  );
}
