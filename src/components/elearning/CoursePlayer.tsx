"use client";

import Link from "next/link";
import { useRouter, useSearchParams } from "next/navigation";
import { useCallback, useEffect, useRef, useState } from "react";
import { api, useApi } from "@/lib/api";
import { cx, formatDate } from "@/lib/format";
import { Icon } from "../Icon";
import { minutes, outcomeText, outcomeTone, type Outcome } from "./status";

/*
  The eLearning player. The course runs in a frame from the content origin (see the shell route), which
  runs the SCORM runtime and sends each commit here; this page saves it with the learner's sign-in.

  Saving: every commit carries the whole data model and a rising number, so only the newest unsent
  commit is kept, retried with backoff if the connection drops, and sent by sendBeacon if the page closes
  with one still waiting. The server ignores a number it has already seen. Completion is whatever the
  course reports: opening or closing this page never completes anything.
*/

type Attempt = {
  id: number;
  number: number;
  outcome: Outcome;
  score: number | null;
  scoreMax: number | null;
  totalSeconds: number;
  startedAt: string;
  lastActivityAt: string | null;
  completedAt: string | null;
  passedAt: string | null;
  endedAt: string | null;
};
type Info = { course: { id: string; title: string; description: string; edition: string; status: string }; preview: boolean; attempt: Attempt | null };
type Launch = {
  attempt: { id: number; number: number; session: string; resumed: boolean };
  contentOrigin: string;
  shellUrl: string;
  data: Record<string, string>;
};
type Pending = { seq: number; terminate: boolean; data: Record<string, string> };
type SaveState = "idle" | "saving" | "saved" | "retrying" | "error";

const sleep = (ms: number) => new Promise((r) => setTimeout(r, ms));

export function CoursePlayer({ id }: { id: string }) {
  const router = useRouter();
  const ownWindow = useSearchParams().get("window") === "1";
  const { data: info, error, setData } = useApi<Info>(`/api/elearning/${id}`);
  const [launch, setLaunch] = useState<Launch | null>(null);
  const [launchError, setLaunchError] = useState<string | null>(null);
  const [save, setSave] = useState<{ state: SaveState; message?: string; at?: Date }>({ state: "idle" });
  const [finished, setFinished] = useState(false);
  const [exiting, setExiting] = useState(false);
  const frame = useRef<HTMLIFrameElement>(null);
  const pending = useRef<Pending | null>(null);
  const sending = useRef(false);
  const exited = useRef<(() => void) | null>(null);
  const started = useRef(false);

  const attemptUrl = launch ? `/api/elearning/attempts/${launch.attempt.id}` : null;

  // Sends the newest waiting commit, retrying until it's saved or refused.
  const pump = useCallback(async () => {
    if (sending.current || !launch || !attemptUrl) return;
    sending.current = true;
    let backoff = 1000;
    while (pending.current) {
      const item = pending.current;
      pending.current = null;
      setSave({ state: "saving" });
      try {
        const res = await fetch(attemptUrl, {
          method: "POST",
          headers: { "content-type": "application/json" },
          body: JSON.stringify({ session: launch.attempt.session, ...item }),
          keepalive: JSON.stringify(item.data).length < 60_000,
        });
        if (res.status >= 500) throw new Error("server");
        const out = (await res.json()) as { error?: string; attempt?: Attempt };
        if (!res.ok) {
          setSave({ state: "error", message: out.error ?? "Your progress couldn’t be saved." });
          break;
        }
        backoff = 1000;
        if (out.attempt) setData((d) => (d ? { ...d, attempt: out.attempt! } : d));
        setSave({ state: "saved", at: new Date() });
      } catch {
        // Keep the newest commit (it holds everything); a newer one replaces this one but keeps "finished".
        // A message may have queued a newer commit while this one was in flight.
        const newer = pending.current as Pending | null;
        if (newer) newer.terminate ||= item.terminate;
        else pending.current = item;
        setSave({ state: "retrying", message: "Connection lost. Your progress will save when it’s back." });
        await sleep(backoff);
        backoff = Math.min(backoff * 2, 15_000);
      }
    }
    sending.current = false;
  }, [launch, attemptUrl, setData]);

  // Messages from the course's frame, and only from it.
  useEffect(() => {
    if (!launch) return;
    const onMessage = (e: MessageEvent) => {
      if (e.origin !== launch.contentOrigin || e.source !== frame.current?.contentWindow) return;
      const m = e.data as { type?: string; seq?: number; terminate?: boolean; data?: Record<string, string> };
      if (m.type === "scorm:ready") frame.current?.contentWindow?.postMessage({ type: "hub:start", data: launch.data }, launch.contentOrigin);
      else if (m.type === "scorm:save" && typeof m.seq === "number" && m.data) {
        const next = { seq: m.seq, terminate: Boolean(m.terminate), data: m.data };
        if (pending.current && pending.current.terminate) next.terminate = true;
        pending.current = next;
        void pump();
      } else if (m.type === "scorm:finished") setFinished(true);
      else if (m.type === "scorm:exited") exited.current?.();
    };
    window.addEventListener("message", onMessage);
    // If the page closes with a commit still waiting, hand it to the browser to deliver.
    const onHide = () => {
      if (pending.current && attemptUrl)
        navigator.sendBeacon(attemptUrl, new Blob([JSON.stringify({ session: launch.attempt.session, ...pending.current })], { type: "text/plain" }));
    };
    window.addEventListener("pagehide", onHide);
    return () => {
      window.removeEventListener("message", onMessage);
      window.removeEventListener("pagehide", onHide);
    };
  }, [launch, pump, attemptUrl]);

  const start = useCallback(
    async (restart = false) => {
      setLaunchError(null);
      setFinished(false);
      try {
        setLaunch(await api<Launch>(`/api/elearning/${id}`, { body: { restart } }));
      } catch (e) {
        setLaunchError(e instanceof Error ? e.message : "The course couldn’t be opened.");
      }
    },
    [id],
  );

  // Opened in its own window: start straight away.
  useEffect(() => {
    if (ownWindow && info && !started.current) {
      started.current = true;
      void start();
    }
  }, [ownWindow, info, start]);

  // Exit: ask the course to finish (which saves), wait briefly for that to land, then leave.
  const exit = async () => {
    setExiting(true);
    if (launch && frame.current?.contentWindow) {
      await Promise.race([
        new Promise<void>((r) => {
          exited.current = r;
          frame.current?.contentWindow?.postMessage({ type: "hub:exit" }, launch.contentOrigin);
        }),
        sleep(3000),
      ]);
      for (let i = 0; i < 20 && (pending.current || sending.current); i++) await sleep(200);
    }
    if (ownWindow) window.close();
    router.push("/elearning");
  };

  if (error) return <Message title="Course not found" text={error} />;
  if (!info) return <p className="mx-auto max-w-7xl px-4 py-10 text-ink-muted">Loading…</p>;
  const a = info.attempt;
  const outcome: Outcome = a?.outcome ?? "not_started";
  const canResume = a && !a.endedAt && a.outcome !== "not_started";

  return (
    <div className={cx("mx-auto flex max-w-[1400px] flex-col px-3 pb-4 pt-3 sm:px-5", launch && "min-h-[calc(100dvh-5rem)]")}>
      <div className="flex flex-wrap items-center gap-x-4 gap-y-2 rounded-2xl bg-surface/90 px-4 py-2.5 ring-1 ring-line">
        <nav aria-label="Breadcrumb" className="min-w-0 flex-1 text-sm">
          <Link href="/elearning" className="font-semibold text-accent hover:underline">
            eLearning
          </Link>{" "}
          <span className="text-ink-muted">›</span> <span className="font-semibold">{info.course.title}</span>
          {info.preview && <span className="ml-2 rounded-full bg-gold/25 px-2 py-0.5 text-xs font-bold">Preview: draft, not counted</span>}
        </nav>
        <span className={cx("rounded-full px-2.5 py-0.5 font-mulish text-xs font-bold", outcomeTone[outcome])} aria-live="polite">
          {outcomeText[outcome]}
          {a?.score != null ? ` · ${a.score}${a.scoreMax ? `/${a.scoreMax}` : ""}` : ""}
        </span>
        {launch && <SaveIndicator save={save} />}
        {launch && (
          <span className="flex gap-1">
            {!ownWindow && (
              <button
                type="button"
                className="inline-flex min-h-10 items-center gap-1.5 rounded-full px-3 text-sm font-semibold text-accent hover:bg-muted"
                onClick={() => {
                  void exit();
                  window.open(`/elearning/${id}?window=1`, "_blank", "noopener");
                }}
              >
                <Icon name="external" className="size-4" /> New window
              </button>
            )}
            <button type="button" disabled={exiting} onClick={exit} className="inline-flex min-h-10 items-center gap-1.5 rounded-full bg-[#1d2b4f] px-4 text-sm font-semibold text-white hover:bg-[#2d4875] disabled:opacity-60">
              {exiting ? "Saving…" : "Exit course"}
            </button>
          </span>
        )}
      </div>

      {save.state === "error" && <p role="alert" className="mt-3 rounded-2xl bg-[#fbe3e1] p-3 text-[#7a1f23]">{save.message}</p>}
      {finished && !exiting && (
        <p role="status" className="mt-3 rounded-2xl bg-[#e3f4f3] p-3 text-[#0f5b5b]">
          The course has finished{save.state === "saved" ? " and your progress is saved" : ""}. Outcome: <strong>{outcomeText[outcome]}</strong>
          {a?.score != null ? `, score ${a.score}${a.scoreMax ? ` of ${a.scoreMax}` : ""}` : ""}.
        </p>
      )}

      {launch ? (
        <iframe
          ref={frame}
          key={launch.attempt.session}
          src={launch.shellUrl}
          title={info.course.title}
          className="mt-3 w-full flex-1 rounded-2xl bg-white ring-1 ring-line"
          style={{ minHeight: "min(80dvh, 900px)" }}
          // A separate origin keeps the course away from the Hub; these let it run as Articulate expects.
          sandbox="allow-scripts allow-same-origin allow-forms allow-popups allow-popups-to-escape-sandbox allow-downloads allow-modals"
          allow="fullscreen; autoplay; clipboard-write"
          allowFullScreen
        />
      ) : (
        <section className="mx-auto mt-8 w-full max-w-2xl rounded-3xl bg-surface p-6 ring-1 ring-line">
          <p className="font-mulish text-xs font-extrabold uppercase tracking-[0.14em] text-accent">eLearning · SCORM {info.course.edition}</p>
          <h1 className="mt-1 font-serif text-3xl font-semibold">{info.course.title}</h1>
          {info.course.description && <p className="mt-2 text-ink-muted">{info.course.description}</p>}
          {a && (
            <p className="mt-4 text-sm text-ink-muted">
              Attempt {a.number}: {outcomeText[a.outcome].toLowerCase()}
              {a.lastActivityAt ? `, last opened ${formatDate(a.lastActivityAt)}` : ""}
              {a.totalSeconds ? `, ${minutes(a.totalSeconds)} so far` : ""}.
            </p>
          )}
          {launchError && <p className="mt-4 rounded-2xl bg-[#fbe3e1] p-3 text-[#7a1f23]">{launchError}</p>}
          <div className="mt-5 flex flex-wrap gap-2">
            <button type="button" onClick={() => start()} className="inline-flex min-h-12 items-center gap-2 rounded-full bg-[#008282] px-6 font-semibold text-white hover:bg-[#006b6b]">
              {canResume ? "Resume course" : a?.endedAt ? "Start a new attempt" : "Start course"} <Icon name="arrow-right" className="size-4" />
            </button>
            {canResume && (
              <button type="button" onClick={() => start(true)} className="inline-flex min-h-12 items-center rounded-full px-5 font-semibold text-accent ring-1 ring-line hover:bg-muted">
                Start again
              </button>
            )}
          </div>
          {canResume && <p className="mt-3 text-sm text-ink-muted">Starting again begins a new attempt. Your earlier attempt is kept.</p>}
        </section>
      )}
    </div>
  );
}

function SaveIndicator({ save }: { save: { state: SaveState; message?: string } }) {
  const text = { idle: "Not saved yet", saving: "Saving…", saved: "Progress saved", retrying: "Waiting to save", error: "Not saved" }[save.state];
  return (
    <span className={cx("text-sm", save.state === "error" || save.state === "retrying" ? "font-semibold text-[#a12d31]" : "text-ink-muted")} title={save.message} aria-live="polite">
      {text}
    </span>
  );
}

function Message({ title, text }: { title: string; text: string }) {
  return (
    <div className="mx-auto max-w-2xl px-4 py-12">
      <h1 className="font-serif text-3xl font-semibold">{title}</h1>
      <p className="mt-2 text-ink-muted">{text}</p>
      <Link href="/elearning" className="mt-4 inline-block font-semibold text-accent hover:underline">
        Back to eLearning
      </Link>
    </div>
  );
}
