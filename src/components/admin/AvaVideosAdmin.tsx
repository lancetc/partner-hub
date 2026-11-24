"use client";

import { useEffect, useRef, useState } from "react";
import { api, useApi } from "@/lib/api";
import { cx } from "@/lib/format";
import type { AvaVideoState } from "@/server/ava";
import { Badge, btn, ErrorNote, input } from "./ui";
import { uploadAvaVideo } from "./avaUpload";
import { Icon } from "../Icon";

/*
  Ava's talking videos (server/ava.ts), in Admin → AI Learning Guide: every line Ava speaks to learners (Discovery Path
  introductions, Magazine course and page introductions, Topic presenter cards), and its video. A line's video is either
  uploaded (made elsewhere, such as in ElevenLabs with the Laura avatar, saying the script word for word) or made here
  from Ava's portrait and her voice (a paid generation, a minute or two each). Learners see a video only while it still
  matches the script; until then they get the portrait with her voice.
*/

type Line = {
  key: string;
  kind: "path" | "course" | "page" | "topic";
  title: string;
  script: string;
  state: AvaVideoState;
  uploaded?: boolean;
  /** An uploaded video's own words, when it isn't the script word for word. */
  transcript?: string | null;
  error?: string;
};
type Data = { portrait: string; configured: boolean; lines: Line[] };

const STATE: Record<AvaVideoState, { label: string; tone: "neutral" | "info" | "bad" | "warn" | "good" }> = {
  none: { label: "Portrait and voice", tone: "neutral" },
  pending: { label: "Making the video…", tone: "info" },
  ready: { label: "Video ready", tone: "good" },
  stale: { label: "Video out of date", tone: "warn" },
  failed: { label: "Video failed", tone: "bad" },
};
const KIND = { path: "Discovery Path", course: "Magazine course", page: "Magazine page", topic: "Topic card" } as const;

export function AvaVideosAdmin() {
  const { data, error, setData } = useApi<Data>("/api/admin/ava");
  const [problem, setProblem] = useState<string | null>(null);
  const [note, setNote] = useState<string | null>(null);
  const [busy, setBusy] = useState<string | null>(null);
  const [filter, setFilter] = useState("");
  const [open, setOpen] = useState<string | null>(null);
  // The line whose upload is being set up, and what its video says.
  const [composing, setComposing] = useState<string | null>(null);
  const [words, setWords] = useState("");
  const picker = useRef<HTMLInputElement>(null);
  const uploadFor = useRef<string | null>(null);

  const update = (key: string, patch: Partial<Line>) =>
    setData((d) => (d ? { ...d, lines: d.lines.map((l) => (l.key === key ? { ...l, error: undefined, ...patch } : l)) } : d));

  // While any video is being made, ask ElevenLabs where it's up to every ten seconds.
  const pendingKey = (data?.lines.filter((l) => l.state === "pending").map((l) => l.key) ?? []).join("|");
  useEffect(() => {
    if (!pendingKey) return;
    const t = window.setInterval(async () => {
      for (const key of pendingKey.split("|")) {
        try {
          const r = await api<{ state: AvaVideoState; error?: string }>("/api/admin/ava", { body: { action: "check", key } });
          setData((d) => (d ? { ...d, lines: d.lines.map((l) => (l.key === key ? { ...l, state: r.state, error: r.error } : l)) } : d));
        } catch (e) {
          setProblem(e instanceof Error ? e.message : "Couldn’t check on the video.");
        }
      }
    }, 10_000);
    return () => window.clearInterval(t);
  }, [pendingKey, setData]);

  const run = async (key: string, work: () => Promise<void>) => {
    setProblem(null);
    setNote(null);
    setBusy(key);
    try {
      await work();
    } catch (e) {
      setProblem(e instanceof Error ? e.message : "That didn’t work. Try again.");
    } finally {
      setBusy(null);
    }
  };
  const make = (key: string) =>
    run(key, async () => {
      const r = await api<{ state: AvaVideoState }>("/api/admin/ava", { body: { action: "make", key } });
      update(key, { state: r.state, uploaded: false });
    });
  const remove = (key: string) =>
    run(key, async () => {
      if (!window.confirm("Stop using this video? Learners get Ava’s portrait with her voice again. The file stays in the image library.")) return;
      const r = await api<{ state: AvaVideoState }>("/api/admin/ava", { body: { action: "remove", key } });
      update(key, { state: r.state, uploaded: false });
    });
  const upload = (key: string, file: File) =>
    run(key, async () => {
      const r = await uploadAvaVideo(key, file, words);
      update(key, { state: r.state, uploaded: true, transcript: words.trim() || null });
      setComposing(null);
      setNote("Video uploaded. Learners see it wherever this line plays.");
    });
  // ElevenLabs listens to an uploaded video and writes out what Ava says, each word timed to her voice (a small paid call).
  const hear = (l: Line) =>
    run(l.key, async () => {
      if (l.transcript && !window.confirm("Replace this video’s script with what ElevenLabs hears in it?")) return;
      const r = await api<{ state: AvaVideoState; transcript: string | null }>("/api/admin/ava", { body: { action: "hear", key: l.key } });
      update(l.key, { state: r.state, transcript: r.transcript });
      setOpen(l.key);
      setNote(`Filled in “${l.title}” from its video. Read it through and fix any misheard word in the Magazine editor (Ava’s video).`);
    });
  const copy = async (l: Line) => {
    try {
      await navigator.clipboard.writeText(l.script);
      setNote(`Copied the script for “${l.title}”.`);
    } catch {
      setOpen(l.key);
    }
  };

  const shown = (data?.lines ?? []).filter(
    (l) => !filter.trim() || `${l.title} ${KIND[l.kind]} ${l.script}`.toLowerCase().includes(filter.trim().toLowerCase()),
  );

  return (
    <section aria-labelledby="ava-videos" className="mt-5 rounded-3xl bg-surface p-5 ring-1 ring-line">
      <div className="flex flex-wrap items-start gap-4">
        {data && (
          // eslint-disable-next-line @next/next/no-img-element
          <img src={data.portrait} alt="" className="aspect-video w-40 shrink-0 rounded-xl bg-muted object-cover object-[center_20%]" />
        )}
        <div className="min-w-0 flex-1">
          <h2 id="ava-videos" className="font-serif text-xl font-semibold">
            Ava’s talking videos
          </h2>
          <p className="mt-1 max-w-3xl text-sm text-ink-muted">
            Each line Ava speaks can play as a video in her transmission window. <strong>Upload a video</strong> made elsewhere (in ElevenLabs with the Laura
            avatar, say): copy the script and have it said word for word, because a video stops playing if the script changes. Or{" "}
            <strong>make the video</strong> here from the portrait above and her voice: a paid generation that needs the Image &amp; Video permission on the
            ElevenLabs key. Until a line has a video, learners see the portrait while she speaks.
          </p>
        </div>
      </div>
      {error && <ErrorNote text={error} />}
      {problem && (
        <p role="alert" className="mt-3 rounded-2xl bg-[#fdf1f0] px-3 py-2 text-sm font-semibold text-[#a12d31]">
          {problem}
        </p>
      )}
      {note && (
        <p role="status" className="mt-3 rounded-2xl bg-tealtint px-3 py-2 text-sm font-semibold">
          {note}
        </p>
      )}
      <input
        ref={picker}
        type="file"
        accept="video/mp4,video/webm,video/quicktime"
        className="sr-only"
        tabIndex={-1}
        aria-hidden
        onChange={(e) => {
          const file = e.target.files?.[0];
          const key = uploadFor.current;
          e.target.value = "";
          if (file && key) void upload(key, file);
        }}
      />
      {!data ? (
        <p className="mt-3 text-ink-muted">Loading…</p>
      ) : data.lines.length === 0 ? (
        <p className="mt-3 rounded-2xl bg-muted px-4 py-3 text-sm">Ava has no lines yet.</p>
      ) : (
        <>
          <label className="mt-4 flex max-w-md flex-col gap-1 text-xs font-semibold">
            Find a line by course, page, path or words
            <input type="search" className={cx(input, "min-h-10")} value={filter} onChange={(e) => setFilter(e.target.value)} />
          </label>
          <ul className="mt-3 flex flex-col divide-y divide-line">
            {shown.map((l) => (
              <li key={l.key} className="flex flex-col gap-2 py-3 text-sm">
                <div className="flex flex-wrap items-center gap-2">
                  <span className="font-semibold">{l.title}</span>
                  <span className="text-ink-muted">{KIND[l.kind]}</span>
                  <Badge tone={STATE[l.state].tone}>{STATE[l.state].label}</Badge>
                  {l.uploaded && <Badge tone="info">{l.transcript ? "Uploaded, its own words" : "Uploaded"}</Badge>}
                </div>
                {open === l.key ? (
                  <p className="whitespace-pre-line rounded-2xl bg-muted px-3 py-2 leading-relaxed">{l.transcript || l.script}</p>
                ) : (
                  <p className="line-clamp-2 text-ink-muted">“{l.transcript || l.script}”</p>
                )}
                {composing === l.key && (
                  // Before choosing the file: what the video says, when it isn't this line's script word for word.
                  <div className="flex flex-col gap-2 rounded-2xl bg-muted p-3">
                    <label className="flex flex-col gap-1 font-semibold">
                      What this video says
                      <span className="font-normal text-ink-muted">
                        Paste the transmission’s own script (it can break off mid-sentence). Learners see it on screen as she speaks, and under Full script.
                        Leave it empty if the video says the script above word for word.
                      </span>
                      <textarea rows={5} className={cx(input, "font-normal")} value={words} onChange={(e) => setWords(e.target.value)} />
                    </label>
                    <div className="flex flex-wrap gap-2">
                      <button
                        type="button"
                        className={btn.primary}
                        disabled={busy !== null}
                        onClick={() => {
                          uploadFor.current = l.key;
                          picker.current?.click();
                        }}
                      >
                        <Icon name="upload" className="size-4" /> {busy === l.key ? "Uploading…" : "Choose the video file"}
                      </button>
                      <button type="button" className={btn.quiet} onClick={() => setComposing(null)}>
                        Cancel
                      </button>
                    </div>
                  </div>
                )}
                {l.error && <p className="text-[#a12d31]">{l.error}</p>}
                {l.state === "stale" && l.uploaded && (
                  <p className="text-ink-muted">The script has changed since this video was uploaded. Upload one that says the new words.</p>
                )}
                <div className="flex flex-wrap items-center gap-2">
                  <button type="button" className={btn.quiet} onClick={() => void copy(l)}>
                    <Icon name="copy" className="size-4" /> Copy the script
                  </button>
                  <button type="button" className={btn.quiet} aria-expanded={open === l.key} onClick={() => setOpen(open === l.key ? null : l.key)}>
                    <Icon name="doc" className="size-4" /> {open === l.key ? "Hide the script" : "Show the script"}
                  </button>
                  <button
                    type="button"
                    className={btn.secondary}
                    disabled={busy !== null}
                    aria-expanded={composing === l.key}
                    onClick={() => {
                      setComposing(l.key);
                      setWords(l.transcript ?? "");
                    }}
                  >
                    <Icon name="upload" className="size-4" /> {busy === l.key ? "Working…" : "Upload a video"}
                  </button>
                  {l.state !== "pending" && (
                    <button type="button" className={btn.quiet} disabled={busy !== null || !data.configured} onClick={() => void make(l.key)}>
                      <Icon name="play" className="size-4" /> {l.state === "none" ? "Make the video" : "Make it from the portrait"}
                    </button>
                  )}
                  {l.uploaded && (l.state === "ready" || l.state === "stale") && (
                    <button
                      type="button"
                      className={btn.quiet}
                      disabled={busy !== null}
                      onClick={() => void hear(l)}
                      title="ElevenLabs listens to the video and types out what Ava says (a small charge to the Hub’s ElevenLabs account)"
                    >
                      <Icon name="mic" className="size-4" /> {busy === l.key ? "Working…" : "Fill in from the video"}
                    </button>
                  )}
                  {(l.state === "ready" || l.state === "stale" || l.state === "failed") && (
                    <button type="button" className={btn.quiet} disabled={busy !== null} onClick={() => void remove(l.key)}>
                      <Icon name="trash" className="size-4" /> Remove the video
                    </button>
                  )}
                </div>
              </li>
            ))}
          </ul>
        </>
      )}
    </section>
  );
}
