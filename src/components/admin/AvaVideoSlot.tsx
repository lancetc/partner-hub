"use client";

import { useRef, useState } from "react";
import { api, useApi } from "@/lib/api";
import { cx } from "@/lib/format";
import type { AvaVideoState } from "@/server/ava";
import { uploadAvaVideo } from "./avaUpload";
import { Badge, btn, ErrorNote, input } from "./ui";
import { Icon } from "../Icon";

/*
  Ava's video for one of her lines: a Magazine introduction (the course's, or a page's, in the editor's Audio guide strip),
  a Discovery Path's introduction (the path editor), or a Topic's presenter card (the Topic editor). A video made
  in ElevenLabs with the Laura avatar goes in here with its script: what it says, word for word (an interrupted
  transmission can break off). The script is what learners see on screen as she says it, each word lit in turn, and under
  Read script. On the page, Ava plays where the picture goes and the audio introduction steps aside; without a video the
  Audio guide stays. On a Path it plays at the top of the page; in a Topic, in the presenter card. The same videos are
  listed in Admin → AI Learning Guide → Ava's talking videos.
*/

type Where = "magazine" | "path" | "topic";
/** What the panel says in each place: where the video plays, what it replaces, and which script it can stand in for. */
const WHERE: Record<Where, { plays: string; script: string; stale: string }> = {
  magazine: {
    plays:
      "On the page it plays where the picture goes, then the picture takes over. Learners get the audio introduction beneath the heading as well; only one plays at a time.",
    script: "the Audio guide script below",
    stale: "The Audio guide script has changed since this video went in.",
  },
  path: {
    plays: "It plays at the top of the path’s page. Without one, Ava reads “What it covers” over her portrait.",
    script: "“What it covers” above",
    stale: "“What it covers” has changed since this video went in. Add the video’s own script above, or upload one that says the new words.",
  },
  topic: {
    plays: "It plays in this presenter card. Without one, Ava reads the presenter script over her portrait.",
    script: "the presenter script",
    stale: "The presenter script has changed since this video went in. Add the video’s own script above, or upload one that says the new words.",
  },
};

type Line = { key: string; state: AvaVideoState; src: string | null; transcript: string | null; uploaded: boolean; timing?: string | null };

export function AvaVideoSlot({
  lineKey,
  script,
  where = "magazine",
  onUploaded,
}: {
  lineKey: string;
  script?: string;
  where?: Where;
  /** Told the video's shape once it's in (a Topic card sets itself to Ava's window, tall for a portrait video). */
  onUploaded?: (size: { width: number; height: number }) => void;
}) {
  const say = WHERE[where];
  const { data, error, setData } = useApi<Line>(`/api/admin/ava?key=${encodeURIComponent(lineKey)}`);
  // The script box: what the video says. Starts from what's saved, and is the author's while they edit it.
  const [edited, setEdited] = useState<string | null>(null);
  const words = edited ?? data?.transcript ?? "";
  const [busy, setBusy] = useState(false);
  const [problem, setProblem] = useState<string | null>(null);
  const [note, setNote] = useState<string | null>(null);
  const picker = useRef<HTMLInputElement>(null);
  const has = Boolean(data?.src && data.state !== "none");
  const changed = edited !== null && edited.trim() !== (data?.transcript ?? "").trim();

  const run = async (work: () => Promise<void>) => {
    setBusy(true);
    setProblem(null);
    setNote(null);
    try {
      await work();
    } catch (e) {
      setProblem(e instanceof Error ? e.message : "That didn’t work. Try again.");
    } finally {
      setBusy(false);
    }
  };
  const upload = (file: File) =>
    run(async () => {
      const r = await uploadAvaVideo(lineKey, file, words);
      setData({ key: lineKey, state: r.state, src: r.src ?? null, transcript: words.trim() || null, uploaded: true, timing: r.timing ?? null });
      setEdited(null);
      setNote(timingNote(r.timing));
      onUploaded?.({ width: r.width, height: r.height });
    });
  const saveWords = () =>
    run(async () => {
      const r = await api<Line>("/api/admin/ava", { body: { action: "words", key: lineKey, transcript: words } });
      setData(r);
      setEdited(null);
      setNote(timingNote(r.timing));
    });
  // ElevenLabs listens to the video and writes out what she says, each word timed to her voice (a small paid call).
  const hear = () =>
    run(async () => {
      if ((edited ?? data?.transcript ?? "").trim() && !window.confirm("Replace the script in the box with what ElevenLabs hears in the video?")) return;
      const r = await api<Line>("/api/admin/ava", { body: { action: "hear", key: lineKey } });
      setData(r);
      setEdited(null);
      setNote("Filled in from the video, each word timed to her voice. Read it through: fix any word it misheard, then Save the script.");
    });
  const remove = () =>
    run(async () => {
      if (
        !window.confirm(
          "Take Ava’s video off? Learners get what they had before it (the picture and Audio guide, or Ava’s voice over her portrait). The file stays in the image library.",
        )
      )
        return;
      await api("/api/admin/ava", { body: { action: "remove", key: lineKey } });
      setData({ key: lineKey, state: "none", src: null, transcript: null, uploaded: false, timing: null });
      setEdited(null);
    });

  return (
    <div className="flex flex-col gap-3 rounded-2xl border border-line bg-surface p-4">
      <div className="flex flex-wrap items-center gap-2">
        <Icon name="play" className="size-4 text-accent" />
        <h3 className="font-semibold">Ava’s video</h3>
        {data && has && (
          <Badge tone={data.state === "ready" ? "good" : "warn"}>
            {data.state === "ready" ? (where === "topic" ? "In the card" : "On the page") : "Out of date"}
          </Badge>
        )}
        {data && has && data.timing && <Badge tone="neutral">{data.timing === "aligned" ? "Words timed to her voice" : "Words timed evenly"}</Badge>}
      </div>
      <p className="text-sm text-ink-muted">
        A transmission from Ava, made in ElevenLabs with the Laura avatar, with her script so learners can follow her words. {say.plays}
      </p>
      {error && <ErrorNote text={error} />}
      {has && <video src={data!.src!} controls preload="metadata" className="aspect-video w-full max-w-md rounded-xl bg-black" />}

      {/* The script: always here, before and after the video goes in. */}
      <label className="flex flex-col gap-1 text-sm font-semibold">
        Ava’s script for this video
        <span className="font-normal text-ink-muted">
          Exactly what she says, word for word, so the words on screen keep up with her (an interrupted transmission can end mid-sentence on a dash).
          {script ? ` Leave it empty if the video says ${say.script} word for word.` : ""}
        </span>
        <textarea
          rows={6}
          className={cx(input, "font-serif text-[1.02rem] font-normal leading-relaxed")}
          value={words}
          placeholder={script ? `Or leave empty for ${say.script}: “${script.slice(0, 120)}${script.length > 120 ? "…" : ""}”` : "What Ava says in the video…"}
          onChange={(e) => setEdited(e.target.value)}
          disabled={busy}
        />
      </label>

      <input
        ref={picker}
        type="file"
        accept="video/mp4,video/webm,video/quicktime"
        className="sr-only"
        tabIndex={-1}
        aria-hidden
        onChange={(e) => {
          const file = e.target.files?.[0];
          e.target.value = "";
          if (file) void upload(file);
        }}
      />
      <div className="flex flex-wrap gap-2">
        <button type="button" className={has ? btn.quiet : btn.primary} disabled={busy || !data} onClick={() => picker.current?.click()}>
          <Icon name="upload" className="size-4" /> {busy ? "Working…" : has ? "Replace the video" : "Choose the video file"}
        </button>
        {has && data?.uploaded && (
          <button
            type="button"
            className={data.transcript ? btn.quiet : btn.primary}
            disabled={busy}
            onClick={() => void hear()}
            title="ElevenLabs listens to the video and types out what Ava says (a small charge to the Hub’s ElevenLabs account)"
          >
            <Icon name="mic" className="size-4" /> {busy ? "Working…" : "Fill in from the video"}
          </button>
        )}
        {has && (
          <button type="button" className={btn.primary} disabled={busy || !changed} onClick={() => void saveWords()}>
            <Icon name="check" className="size-4" /> Save the script
          </button>
        )}
        {has && (
          <button type="button" className={btn.quiet} disabled={busy} onClick={() => void remove()}>
            <Icon name="trash" className="size-4" /> Take it off
          </button>
        )}
      </div>
      {has && !data?.transcript && !note && (
        <p className="text-sm text-[#8a5a00] dark:text-[#ffd48a]">
          The video plays without words on screen until its script is in. Press Fill in from the video to have ElevenLabs type out what Ava says, or type it
          above and Save the script.
        </p>
      )}
      {data?.state === "stale" && <p className="text-sm text-[#8a5a00] dark:text-[#ffd48a]">{say.stale}</p>}
      {note && (
        <p role="status" className="rounded-xl bg-tealtint px-3 py-2 text-sm">
          {note}
        </p>
      )}
      {problem && <ErrorNote text={problem} />}
    </div>
  );
}

const timingNote = (timing?: string | null) =>
  timing === "aligned"
    ? "Saved. Each word is timed to her voice, so learners see it lit as she says it."
    : timing === "estimated"
      ? "Saved. The words are timed evenly across the video for now. Turn on Forced alignment for the Hub’s ElevenLabs key, then press Save the script again, to time them to her voice."
      : "Saved.";
