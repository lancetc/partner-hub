"use client";

import Link from "next/link";
import { useEffect, useMemo, useRef, useState } from "react";
import { api, useApi } from "@/lib/api";
import { confirmAction } from "@/lib/confirm";
import { cx, formatDate } from "@/lib/format";
import { costEstimateText, formatCost, formatSeconds, NARRATION_STATES, secondsFor, wordCount } from "@/lib/magazineNarration";
import { EXCITER_LABEL, EXCITER_VOICE, OUTDATED_EXCITER_NOTICE, exciterWarnings } from "@/lib/pathExciter";
import type { ExciterManagerRow, ExciterStats, ExciterView } from "@/server/pathExciter";
import { readEvents } from "./BuildProgress";
import { AdminShell, Badge, btn, ErrorNote, input } from "./ui";
import { Icon } from "../Icon";

/*
  The Discovery Exciter in the path editor, and the Discovery Path Introduction Manager (docs/discovery-exciter.md).
  Both work on the saved path through the server (server/pathExciter), which reuses the Magazine Audio Introductions'
  scripts, recording queue, voice and rules. Every paid action is a button an author presses and confirms: writing or
  editing a script never makes audio, and audio is never made by itself.
*/

type Speech = ExciterView["speech"];
const costLine = (chars: number, speech: Speech | null | undefined) => (speech ? costEstimateText(chars, speech) : "The cost estimate is loading.");
const SCRIPT_COST =
  "Writing scripts with AI is a small paid request each (Claude, or OpenAI when Claude isn’t connected); there’s no reliable per-request price here, so no estimate.";

/** Reads how long a recording plays, in the browser, before it's uploaded. */
function measureAudio(file: File) {
  return new Promise<number>((resolve, reject) => {
    const el = document.createElement("audio");
    const url = URL.createObjectURL(file);
    el.preload = "metadata";
    el.onloadedmetadata = () => {
      resolve(Number.isFinite(el.duration) ? Math.round(el.duration * 10) / 10 : 0);
      URL.revokeObjectURL(url);
    };
    el.onerror = () => {
      URL.revokeObjectURL(url);
      reject(new Error("This browser can’t read that recording. Try an MP3."));
    };
    el.src = url;
  });
}

type DraftEvent =
  | { type: "phase"; phase: string; pathId: string; n: number; of: number }
  | { type: "drafted"; pathId: string; ok: boolean; error?: string; words?: number }
  | { type: "error"; error: string }
  | { type: "done"; results: { pathId: string; ok: boolean; error?: string }[] };

/** AI drafts Exciters (one path or several), reporting progress as it goes. Resolves with the paths that failed. */
async function draftScripts(url: string, payload: unknown, progress: (text: string) => void, nameOf: (id: string) => string) {
  const res = await fetch(url, { method: "POST", headers: { "content-type": "application/json" }, body: JSON.stringify(payload) });
  if (!res.ok || !res.headers.get("content-type")?.includes("ndjson")) {
    const data = (await res.json().catch(() => ({}))) as { error?: string };
    throw new Error(data.error ?? "The scripts couldn’t be written. Try again.");
  }
  const failed: string[] = [];
  let error: string | null = null;
  await readEvents<DraftEvent>(res, (e) => {
    if (e.type === "phase")
      progress(
        `${e.of > 1 ? `${e.n} of ${e.of}: ` : ""}${e.phase === "writing" ? "Writing" : e.phase === "checking" ? "Checking" : "Tidying"} the introduction for ${nameOf(e.pathId)}…`,
      );
    else if (e.type === "drafted" && !e.ok) failed.push(`${nameOf(e.pathId)}: ${e.error ?? "it couldn’t be written"}`);
    else if (e.type === "error") error = e.error;
  });
  if (error) throw new Error(error);
  return failed;
}

// ---------------------------------------------------------------------------------------------
// The path editor's Discovery Exciter section
// ---------------------------------------------------------------------------------------------

export function PathExciterSection({ id, name, dirty, savedAt }: { id: string; name: string; dirty: boolean; savedAt: number }) {
  const [view, setView] = useState<ExciterView | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [working, setWorking] = useState<string | null>(null);
  // The script as the author is typing it; null when it's the saved one.
  const [typed, setTyped] = useState<string | null>(null);
  const [asking, setAsking] = useState(false);
  const [note, setNote] = useState("");
  const [sample, setSample] = useState(false);
  const scriptBox = useRef<HTMLTextAreaElement>(null);
  const file = useRef<HTMLInputElement>(null);
  const [version, setVersion] = useState(0);
  const url = `/api/admin/learning-paths/${encodeURIComponent(id)}/exciter`;

  // Loaded again after the path is saved (its freshness may have changed), and while a recording is being made.
  useEffect(() => {
    let live = true;
    api<ExciterView>(url).then(
      (v) => live && (setView(v), setError(null)),
      (e: Error) => live && setError(e.message),
    );
    return () => {
      live = false;
    };
  }, [url, savedAt, version]);
  const waiting = view?.job && (view.job.status === "queued" || view.job.status === "running");
  useEffect(() => {
    if (!waiting) return;
    const t = setTimeout(() => setVersion((v) => v + 1), 2500);
    return () => clearTimeout(t);
  }, [waiting, view]);

  const run = async (label: string, fn: () => Promise<ExciterView | void>) => {
    setWorking(label);
    setError(null);
    try {
      const v = await fn();
      if (v) setView(v);
    } catch (e) {
      setError(e instanceof Error ? e.message : "That didn’t work.");
    } finally {
      setWorking(null);
    }
  };
  const act = (body: Record<string, unknown>, label = "Saving…") => run(label, () => api<ExciterView>(url, { body }));

  const generateAudio = async (fresh: boolean) => {
    if (!view?.working) return;
    const ok = await confirmAction(
      `${fresh ? "A new take of" : "Audio for"} “${name}”’s introduction in the Magazine Editorial Voice${view.exciter?.curious ? ", with the curious delivery" : ""}, made in the background. ${costLine(view.working.script.trim().length, view.speech)} You listen to it and approve it before learners hear it.`,
      { title: fresh ? "Regenerate the audio?" : "Generate the audio?", confirmLabel: fresh ? "Regenerate audio" : "Generate audio" },
    );
    if (ok) await act({ action: "queue", confirmed: true, fresh }, "Asking for the audio…");
  };
  const writeScript = async () => {
    setAsking(false);
    if (
      view?.working &&
      !(await confirmAction(
        `AI writes a new draft from the whole saved path${note ? ", with your note" : ""}. It replaces the script you’re working on (the published introduction keeps playing until a replacement is approved). ${SCRIPT_COST}`,
        { title: "Regenerate the script?", confirmLabel: "Regenerate script" },
      ))
    )
      return;
    await run("Starting…", async () => {
      const failed = await draftScripts(
        `${url}/draft`,
        { note },
        (t) => setWorking(t),
        () => name,
      );
      if (failed.length) throw new Error(failed.join("\n"));
      setNote("");
      setTyped(null);
      return api<ExciterView>(url);
    });
  };
  const upload = async (f: File | undefined) => {
    if (!f) return;
    await run("Uploading…", async () => {
      if (!f.type.startsWith("audio/")) throw new Error("That isn’t an audio file. Upload an MP3.");
      const seconds = await measureAudio(f);
      const form = new FormData();
      form.append("file", f);
      form.append("width", "0");
      form.append("height", "0");
      const res = await fetch("/api/admin/uploads", { method: "POST", body: form });
      const data = (await res.json().catch(() => ({}))) as { src?: string; error?: string };
      if (!res.ok || !data.src) throw new Error(data.error ?? "The upload didn’t work.");
      return api<ExciterView>(url, { body: { action: "upload", src: data.src, seconds } });
    });
  };

  if (!view)
    return (
      <section id="exciter" className="rounded-3xl border border-line bg-surface p-5">
        <h2 className="font-serif text-xl font-semibold">Discovery Exciter</h2>
        {error ? <ErrorNote text={error} /> : <p className="mt-2 text-ink-muted">Loading…</p>}
      </section>
    );

  const w = view.working;
  const n = view.exciter;
  const script = typed ?? w?.script ?? "";
  const words = wordCount(script);
  const warnings = typed !== null ? exciterWarnings(typed, view.description) : view.warnings;
  const busy = Boolean(working);
  const state = NARRATION_STATES[view.state];
  const recorded = w?.audio;
  const failed = view.job?.status === "failed" && w && (!w.audio || w.audio.at < view.job.createdAt) ? view.job : null;
  const making = view.audioStatus === "Queued" ? "Audio queued…" : view.audioStatus === "Generating" ? "Making the audio…" : null;

  return (
    <section id="exciter" aria-labelledby="path-exciter" className="flex flex-col gap-4 rounded-3xl border border-line bg-surface p-5">
      <div className="flex flex-wrap items-start justify-between gap-2">
        <div>
          <h2 id="path-exciter" className="font-serif text-xl font-semibold">
            Discovery Exciter
          </h2>
          <p className="mt-1 text-sm text-ink-muted">
            The spoken introduction at the top of the path page (“{EXCITER_LABEL}”). A short story that makes people curious about the path, written for the
            ear. It isn’t the description, which stays as text. Recorded in the Magazine Editorial Voice. Learners hear it only once you approve the audio, and
            never have to.
          </p>
        </div>
        <Link href="/admin/learning-paths/introductions" className={cx(btn.quiet, "shrink-0")}>
          <Icon name="list" className="size-4" /> All path introductions
        </Link>
      </div>

      <div className="flex flex-wrap items-center gap-1.5">
        <Badge tone={state.tone}>{state.label}</Badge>
        {view.live && <Badge tone="good">{view.replacing ? "Published version kept" : "Learners hear this"}</Badge>}
        {n?.hidden && <Badge tone="warn">Turned off for learners</Badge>}
        {view.outdated && <Badge tone="warn">May be out of date</Badge>}
        {w?.version && <span className="text-xs text-ink-muted">Script v{w.version}</span>}
        {w?.source === "seed" && <span className="text-xs text-ink-muted">· a starting draft to review</span>}
      </div>

      {dirty && (
        <p className="rounded-xl bg-muted p-3 text-sm">
          Save your changes to the path first: the Exciter is written from, and checked against, the saved path.
        </p>
      )}

      {view.outdated && (
        <div role="note" className="flex flex-col gap-2 rounded-xl border border-gold bg-gold/10 p-3 text-sm">
          <p className="font-semibold">{OUTDATED_EXCITER_NOTICE}</p>
          <div className="flex flex-wrap gap-2">
            <button type="button" className={btn.secondary} disabled={busy} onClick={() => void act({ action: "still-fine" })}>
              <Icon name="check" className="size-4" /> It’s still appropriate
            </button>
            <button type="button" className={btn.quiet} onClick={() => scriptBox.current?.focus()}>
              <Icon name="pen" className="size-4" /> Update the script
            </button>
            <button type="button" className={btn.quiet} disabled={busy} onClick={() => void writeScript()}>
              <Icon name="spark" className="size-4" /> Regenerate the script
            </button>
            {w?.status === "approved" && (
              <button type="button" className={btn.quiet} disabled={busy || Boolean(making)} onClick={() => void generateAudio(true)}>
                <Icon name="volume" className="size-4" /> Generate replacement audio
              </button>
            )}
          </div>
          <p className="text-xs text-ink-muted">Nothing changes by itself: learners keep hearing the approved introduction until you approve a new one.</p>
        </div>
      )}
      {view.replacing && (
        <p className="rounded-xl bg-tealtint p-3 text-sm">
          You’re working on a replacement. Learners keep hearing the published introduction until you approve this one for publication.{" "}
          <button type="button" className="font-semibold text-accent underline" disabled={busy} onClick={() => void act({ action: "discard" })}>
            Discard the replacement
          </button>
        </p>
      )}

      {/* The script */}
      {w || typed !== null ? (
        <div className="flex flex-col gap-1">
          <label className="flex flex-col gap-1 text-sm font-semibold">
            Script
            <textarea
              ref={scriptBox}
              aria-label={`Discovery Exciter script for ${name}`}
              className={cx(input, "min-h-40 py-2 font-serif text-[1.02rem] font-normal leading-relaxed")}
              value={script}
              maxLength={1200}
              disabled={busy}
              // Typing never makes audio: the author saves, approves and asks for audio separately.
              onChange={(e) => setTyped(e.target.value)}
            />
          </label>
          <p
            className={cx(
              "text-xs",
              words < view.range.min * 0.6 || words > view.range.max * 1.1 ? "font-semibold text-[#8a5a00] dark:text-[#ffd48a]" : "text-ink-muted",
            )}
          >
            {words} words · about {formatSeconds(secondsFor(words))} spoken · aim for {view.range.min} to {view.range.max} words (30 to 60 seconds)
          </p>
          {warnings.length > 0 && (
            <ul className="flex flex-col gap-1 text-sm text-[#8a5a00] dark:text-[#ffd48a]">
              {warnings.map((x) => (
                <li key={x} className="flex items-start gap-1.5">
                  <Icon name="alert" className="mt-0.5 size-4 shrink-0" /> {x}
                </li>
              ))}
            </ul>
          )}
          {view.state === "rerecord" && typed === null && (
            <p className="text-sm text-danger">The script has changed since this audio was made. Generate the audio again, or upload a new recording.</p>
          )}
        </div>
      ) : (
        <p className="text-sm text-ink-muted">No Discovery Exciter yet. Generate one from the whole path, or write your own.</p>
      )}

      <div className="flex flex-wrap items-center gap-2">
        {typed !== null && (
          <>
            <button
              type="button"
              className={btn.primary}
              disabled={busy || !typed.trim()}
              onClick={() => void act({ action: "save", script: typed }).then(() => setTyped(null))}
            >
              Save script
            </button>
            <button type="button" className={btn.quiet} disabled={busy} onClick={() => setTyped(null)}>
              Cancel
            </button>
          </>
        )}
        {typed === null && !w && (
          <button type="button" className={btn.quiet} disabled={busy} onClick={() => setTyped("")}>
            <Icon name="pen" className="size-4" /> Write my own
          </button>
        )}
        {typed === null && (
          <button type="button" className={btn.secondary} disabled={busy || dirty} onClick={() => setAsking((a) => !a)} aria-expanded={asking}>
            <Icon name="spark" className="size-4" /> {w ? "Regenerate script" : "Generate script"}
          </button>
        )}
        {typed === null && w?.status === "draft" && (
          <button type="button" className={btn.primary} disabled={busy || dirty || !w.script.trim()} onClick={() => void act({ action: "approve-script" })}>
            <Icon name="check" className="size-4" /> Approve script
          </button>
        )}
        {typed === null && w?.status === "approved" && !w.audio && (
          <button type="button" className={btn.quiet} disabled={busy} onClick={() => void act({ action: "to-draft" })}>
            Back to draft
          </button>
        )}
      </div>
      {asking && (
        <form
          className="flex flex-wrap items-end gap-2"
          onSubmit={(e) => {
            e.preventDefault();
            void writeScript();
          }}
        >
          <label className="flex min-w-60 flex-1 flex-col gap-1 text-sm">
            Anything to steer it? (optional)
            <input
              className={input}
              value={note}
              maxLength={600}
              onChange={(e) => setNote(e.target.value)}
              placeholder="Open with the moment a client says no"
            />
          </label>
          <button type="submit" className={btn.secondary} disabled={busy}>
            <Icon name="spark" className="size-4" /> {w ? "Write it again" : "Write it"}
          </button>
          <p className="basis-full text-xs text-ink-muted">AI reads the whole saved path: its Topics, outcomes, audience and structure. {SCRIPT_COST}</p>
        </form>
      )}

      {/* The audio */}
      {w && typed === null && (
        <div className="flex flex-col gap-2 rounded-xl bg-muted/50 p-3">
          <p className="text-sm font-semibold">Audio</p>
          {recorded ? (
            <div className="flex flex-col gap-1">
              {/* Preview: the script above is its transcript. Never plays by itself. */}
              <audio controls preload="none" src={recorded.src} className="h-10 w-full" aria-label={`Preview the audio for ${name}`} />
              <p className="text-xs text-ink-muted">
                {formatSeconds(recorded.seconds)} · {recorded.provider === "upload" ? "uploaded" : `made ${formatDate(recorded.at)}`}
                {recorded.model ? ` · ${recorded.model}` : ""}
                {(recorded as { delivery?: string }).delivery === "curious" ? " · curious delivery" : ""}
                {recorded.cost !== undefined ? ` · ${formatCost(recorded.cost)} (estimate)` : ""}
                {recorded.pending ? " · waiting for your approval" : n?.approvedBy && !view.replacing ? ` · approved by ${n.approvedBy}` : ""}
              </p>
            </div>
          ) : (
            <p className="text-sm text-ink-muted">{w.status === "approved" ? "No audio yet." : "Approve the script first; then generate the audio."}</p>
          )}
          {making && (
            <p className="text-sm font-semibold text-ink-muted" role="status">
              {making}
            </p>
          )}
          {failed && (
            <div className="flex flex-wrap items-center gap-2 text-sm">
              <span className="text-danger">The audio couldn’t be made: {failed.error}</span>
              <button type="button" className={btn.quiet} disabled={busy} onClick={() => void act({ action: "retry", jobId: failed.id })}>
                <Icon name="refresh" className="size-4" /> Try again
              </button>
            </div>
          )}
          <div className="flex flex-wrap items-center gap-2">
            {w.status === "approved" && (
              <button
                type="button"
                className={recorded ? btn.quiet : btn.primary}
                disabled={busy || Boolean(making) || view.speech.configured === false}
                onClick={() => void generateAudio(Boolean(recorded))}
              >
                <Icon name="volume" className="size-4" /> {recorded ? "Regenerate audio" : "Generate audio"}
              </button>
            )}
            {w.status === "approved" && recorded?.pending && view.state !== "rerecord" && (
              <button type="button" className={btn.primary} disabled={busy} onClick={() => void act({ action: "approve-audio" }, "Approving…")}>
                <Icon name="check" className="size-4" /> Approve for publication
              </button>
            )}
            <button type="button" className={btn.quiet} disabled={busy} onClick={() => file.current?.click()}>
              <Icon name="upload" className="size-4" /> Upload replacement audio
            </button>
            <input
              ref={file}
              type="file"
              accept="audio/mpeg,.mp3"
              className="hidden"
              onChange={(e) => void upload(e.target.files?.[0]).finally(() => (e.target.value = ""))}
            />
            <button type="button" className={btn.quiet} onClick={() => setSample((s) => !s)} aria-expanded={sample}>
              <Icon name="play" className="size-4" /> Preview the voice
            </button>
          </div>
          {w.status === "approved" && <p className="text-xs text-ink-muted">{costLine(w.script.trim().length, view.speech)}</p>}
          {view.speech.configured === false && (
            <p className="text-xs text-ink-muted">OpenAI isn’t connected on this server, so audio can’t be generated here.</p>
          )}
          {sample && (
            // A sample of the Magazine Editorial Voice: made once per voice and model, then kept.
            <audio
              controls
              preload="none"
              src={`/api/admin/magazine/voices/preview?voice=${encodeURIComponent(EXCITER_VOICE)}`}
              className="h-10 w-full"
              aria-label="A sample of the Magazine Editorial Voice"
            />
          )}
          <label className="flex items-start gap-2 text-sm">
            <input
              type="checkbox"
              className="mt-0.5 size-4 accent-[var(--action)]"
              checked={Boolean(n?.curious)}
              disabled={busy}
              onChange={(e) => void act({ action: "curious", on: e.target.checked })}
            />
            <span>
              Slightly more curious delivery
              <span className="block text-xs text-ink-muted">The same voice, a little more exploratory. Applies to the next audio you generate.</span>
            </span>
          </label>
        </div>
      )}

      {/* Visibility and removing */}
      {n && typed === null && (
        <div className="flex flex-wrap items-center gap-3 text-sm">
          <label className="flex items-center gap-2">
            <input
              type="checkbox"
              className="size-4 accent-[var(--action)]"
              checked={!n.hidden}
              disabled={busy}
              onChange={(e) => void act({ action: "visible", on: e.target.checked })}
            />
            Show to learners
          </label>
          <button
            type="button"
            className={btn.quiet}
            disabled={busy}
            onClick={async () => {
              if (
                await confirmAction(
                  view.live
                    ? "Learners stop hearing this introduction straight away. The recording stays in the media library."
                    : "The script (and any audio for it) is removed from this path. The recording stays in the media library.",
                  { title: "Remove the Discovery Exciter?", confirmLabel: "Remove", danger: true },
                )
              )
                await act({ action: "remove" });
            }}
          >
            <Icon name="trash" className="size-4" /> Remove
          </button>
        </div>
      )}
      {working && (
        <p className="text-sm text-ink-muted" role="status">
          {working}
        </p>
      )}
      {error && <ErrorNote text={error} />}
    </section>
  );
}

// ---------------------------------------------------------------------------------------------
// The Discovery Path Introduction Manager
// ---------------------------------------------------------------------------------------------

type ManagerData = {
  rows: ExciterManagerRow[];
  speech: Speech | null;
  perHour: number;
  stats: { paths: ExciterStats[]; listeners: number; seconds: number };
};

const scriptLabel = (r: ExciterManagerRow) =>
  r.scriptStatus === "none" ? "None" : `${r.scriptStatus === "approved" ? "Approved" : "Draft"}${r.version ? ` · v${r.version}` : ""}`;
const needsAudio = (r: ExciterManagerRow) =>
  r.scriptStatus === "approved" && (r.audioStatus === "None" || r.audioStatus === "Doesn’t match the script" || r.audioStatus === "Failed");

export function PathIntroductionManager() {
  const { data, error: loadError, reload } = useApi<ManagerData>("/api/admin/learning-paths/introductions");
  const [tab, setTab] = useState<"paths" | "listening">("paths");
  const [outdatedOnly, setOutdatedOnly] = useState(false);
  const [selected, setSelected] = useState<Set<string>>(new Set());
  const [working, setWorking] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [notice, setNotice] = useState<string | null>(null);
  const [playing, setPlaying] = useState<string | null>(null);
  const preview = useRef<HTMLAudioElement>(null);

  const rows = useMemo(() => data?.rows ?? [], [data]);
  const shown = outdatedOnly ? rows.filter((r) => r.outdated || r.state === "review" || r.state === "rerecord") : rows;
  const nameOf = (id: string) => rows.find((r) => r.id === id)?.name ?? id;
  const waiting = rows.some((r) => r.job && (r.job.status === "queued" || r.job.status === "running"));
  useEffect(() => {
    if (!waiting) return;
    const t = setTimeout(reload, 3000);
    return () => clearTimeout(t);
  }, [waiting, data, reload]);

  const bulk = async (label: string, fn: () => Promise<string | void>) => {
    setWorking(label);
    setError(null);
    setNotice(null);
    try {
      const msg = await fn();
      if (msg) setNotice(msg);
      setSelected(new Set());
    } catch (e) {
      setError(e instanceof Error ? e.message : "That didn’t work.");
    } finally {
      setWorking(null);
      reload();
    }
  };
  const writeScripts = async (ids: string[], missingOnly: boolean) => {
    if (!ids.length) return setNotice(missingOnly ? "Every path already has a script." : "Select the paths first.");
    const ok = await confirmAction(
      `AI writes ${ids.length === 1 ? "a Discovery Exciter" : `${ids.length} Discovery Exciters`} from each whole path, one at a time, as drafts for you to review.${missingOnly ? "" : " Each replaces the script being worked on; published introductions keep playing until a replacement is approved."} No audio is made. ${SCRIPT_COST}`,
      {
        title: missingOnly ? "Generate missing scripts?" : "Regenerate the selected scripts?",
        confirmLabel: missingOnly ? "Generate scripts" : "Regenerate scripts",
      },
    );
    if (!ok) return;
    await bulk("Starting…", async () => {
      const failed = await draftScripts(
        "/api/admin/learning-paths/introductions/draft",
        { pathIds: ids, confirmed: true, missingOnly },
        (t) => setWorking(t),
        nameOf,
      );
      if (failed.length) throw new Error(`Some scripts weren’t written:\n${failed.join("\n")}`);
      return `${ids.length === 1 ? "The script is" : "The scripts are"} in, as drafts to review.`;
    });
  };
  const approveScripts = async (ids: string[]) => {
    if (!ids.length) return setNotice("There are no draft scripts to approve.");
    const ok = await confirmAction(
      `Approve ${ids.length === 1 ? "this script" : `these ${ids.length} scripts`} as they stand: ${ids.map(nameOf).join(", ")}. Have you read each one? Approving makes no audio.`,
      { title: "Approve the scripts?", confirmLabel: "Approve scripts" },
    );
    if (!ok) return;
    await bulk("Approving…", async () => {
      const r = await api<{ approved: string[] }>("/api/admin/learning-paths/introductions", {
        body: { action: "approve-scripts", pathIds: ids, confirmed: true },
      });
      return `${r.approved.length} ${r.approved.length === 1 ? "script" : "scripts"} approved.`;
    });
  };
  const generateAudio = async (ids: string[], fresh: boolean) => {
    const eligible = rows.filter((r) => ids.includes(r.id) && r.scriptStatus === "approved");
    if (!eligible.length) return setNotice("Only approved scripts can be recorded. Approve the scripts first.");
    const chars = eligible.reduce((n, r) => n + r.characters, 0);
    const ok = await confirmAction(
      `${fresh ? "New takes" : "Audio"} for ${eligible.length} ${eligible.length === 1 ? "introduction" : "introductions"} in the Magazine Editorial Voice, made in the background, one at a time. ${costLine(chars, data?.speech)} You listen to each and approve it before learners hear it.`,
      { title: fresh ? "Regenerate the audio?" : "Generate the audio?", confirmLabel: fresh ? "Regenerate audio" : "Generate audio" },
    );
    if (!ok) return;
    await bulk("Asking for the audio…", async () => {
      const r = await api<{ queued: unknown[]; skipped: { pathId: string; reason: string }[] }>("/api/admin/learning-paths/introductions", {
        body: { action: "queue-audio", pathIds: eligible.map((x) => x.id), confirmed: true, fresh },
      });
      return `${r.queued.length} queued.${r.skipped.length ? ` Skipped: ${r.skipped.map((s) => `${nameOf(s.pathId)} (${s.reason})`).join("; ")}` : ""} Recordings arrive as they’re made; keep working.`;
    });
  };
  const play = (r: ExciterManagerRow) => {
    const el = preview.current;
    const src = r.audio?.src;
    if (!el || !src) return;
    if (playing === r.id) {
      el.pause();
      setPlaying(null);
      return;
    }
    el.src = src;
    void el.play().catch(() => setPlaying(null));
    setPlaying(r.id);
  };

  const missing = rows.filter((r) => r.scriptStatus === "none").map((r) => r.id);
  const drafts = rows.filter((r) => r.scriptStatus === "draft").map((r) => r.id);
  const toRecord = rows.filter(needsAudio).map((r) => r.id);
  const sel = [...selected];
  const outdatedCount = rows.filter((r) => r.outdated || r.state === "review" || r.state === "rerecord").length;
  const busy = Boolean(working);

  return (
    <AdminShell title="Discovery Path introductions" back={{ href: "/admin/learning-paths", label: "Discovery Paths" }}>
      <p className="mb-4 max-w-3xl text-ink-muted">
        Every Discovery Path’s Discovery Exciter: the short spoken introduction learners can play at the top of the path (“{EXCITER_LABEL}”), in the Magazine
        Editorial Voice. Scripts start as drafts; nothing is recorded until you ask, and nothing reaches learners until you approve its audio.
      </p>
      {loadError && <ErrorNote text={loadError} />}
      {!data ? (
        !loadError && <p className="text-ink-muted">Loading…</p>
      ) : (
        <>
          <div role="tablist" aria-label="View" className="mb-4 flex gap-1">
            {(["paths", "listening"] as const).map((t) => (
              <button
                key={t}
                type="button"
                role="tab"
                aria-selected={tab === t}
                onClick={() => setTab(t)}
                className={cx("min-h-10 rounded-full px-4 text-sm font-semibold", tab === t ? "bg-action text-on-action" : "hover:bg-muted")}
              >
                {t === "paths" ? "Introductions" : "Listening"}
              </button>
            ))}
          </div>
          {tab === "listening" ? (
            <Listening data={data} />
          ) : (
            <>
              <div className="mb-3 flex flex-wrap items-center gap-2">
                <button type="button" className={btn.secondary} disabled={busy || !missing.length} onClick={() => void writeScripts(missing, true)}>
                  <Icon name="spark" className="size-4" /> Generate missing scripts{missing.length ? ` (${missing.length})` : ""}
                </button>
                <button
                  type="button"
                  className={btn.secondary}
                  disabled={busy || !(sel.length ? sel.filter((s) => drafts.includes(s)) : drafts).length}
                  onClick={() => void approveScripts(sel.length ? sel.filter((s) => drafts.includes(s)) : drafts)}
                >
                  <Icon name="check" className="size-4" /> Approve {sel.length ? "selected" : "all"} scripts
                </button>
                <button type="button" className={btn.secondary} disabled={busy || !toRecord.length} onClick={() => void generateAudio(toRecord, false)}>
                  <Icon name="volume" className="size-4" /> Generate audio for approved scripts{toRecord.length ? ` (${toRecord.length})` : ""}
                </button>
                <label className="ml-auto flex min-h-10 items-center gap-2 text-sm">
                  <input type="checkbox" className="size-4 accent-[var(--action)]" checked={outdatedOnly} onChange={(e) => setOutdatedOnly(e.target.checked)} />
                  Outdated only{outdatedCount ? ` (${outdatedCount})` : ""}
                </label>
              </div>
              {sel.length > 0 && (
                <div className="mb-3 flex flex-wrap items-center gap-2 rounded-2xl bg-tealtint px-3 py-2 text-sm">
                  <span className="font-semibold">{sel.length} selected</span>
                  <button type="button" className={btn.quiet} disabled={busy} onClick={() => void writeScripts(sel, false)}>
                    <Icon name="spark" className="size-4" /> Regenerate scripts
                  </button>
                  <button type="button" className={btn.quiet} disabled={busy} onClick={() => void generateAudio(sel, true)}>
                    <Icon name="volume" className="size-4" /> Regenerate audio
                  </button>
                  <button type="button" className={btn.quiet} onClick={() => setSelected(new Set())}>
                    Clear
                  </button>
                </div>
              )}
              {data.speech && (
                <p className="mb-3 text-xs text-ink-muted">
                  Audio: {data.speech.model} ({data.speech.provider})
                  {data.speech.pricePerMillionChars !== null ? `, US$${data.speech.pricePerMillionChars} per million characters (to verify)` : ""}
                  {data.speech.configured ? "" : ". Not connected on this server, so audio can’t be generated here"}. Up to {data.perHour} recordings an hour.
                </p>
              )}
              {working && (
                <p role="status" className="mb-3 text-sm font-semibold text-ink-muted">
                  {working}
                </p>
              )}
              {notice && (
                <p role="status" className="mb-3 whitespace-pre-line rounded-2xl bg-tealtint p-3 text-sm">
                  {notice}
                </p>
              )}
              {error && <ErrorNote text={error} />}
              <audio ref={preview} preload="none" className="hidden" onEnded={() => setPlaying(null)} onPause={() => setPlaying(null)} />
              <ul className="mt-2 flex flex-col gap-3">
                {shown.map((r) => (
                  <li key={r.id} className="rounded-2xl border border-line bg-surface p-4">
                    <div className="flex items-start gap-3">
                      <input
                        type="checkbox"
                        aria-label={`Select ${r.name}`}
                        className="mt-1 size-5 shrink-0 accent-[var(--action)]"
                        checked={selected.has(r.id)}
                        onChange={(e) =>
                          setSelected((s) => {
                            const next = new Set(s);
                            if (e.target.checked) next.add(r.id);
                            else next.delete(r.id);
                            return next;
                          })
                        }
                      />
                      <div className="min-w-0 flex-1">
                        <div className="flex flex-wrap items-start justify-between gap-2">
                          <h2 className="font-semibold leading-snug">
                            <Link href={`/admin/learning-paths/${encodeURIComponent(r.id)}#exciter`} className="hover:underline">
                              {r.name}
                            </Link>
                          </h2>
                          <div className="flex flex-wrap items-center gap-1.5">
                            {r.published && <Badge tone="good">{r.replacing ? "Published version kept" : "Learners hear this"}</Badge>}
                            {r.hidden && <Badge tone="warn">Turned off</Badge>}
                            {r.outdated && <Badge tone="warn">Review: path changed</Badge>}
                            <Badge tone={NARRATION_STATES[r.state].tone}>{NARRATION_STATES[r.state].label}</Badge>
                          </div>
                        </div>
                        {r.script && <p className="mt-1.5 line-clamp-2 font-serif text-[0.98rem] text-ink-muted">{r.script}</p>}
                        <dl className="mt-2 grid grid-cols-2 gap-x-4 gap-y-1 text-sm sm:grid-cols-3 lg:grid-cols-6">
                          <Fact label="Script" value={`${scriptLabel(r)}${r.words ? ` · ${r.words} words` : ""}`} />
                          <Fact
                            label="Audio"
                            value={r.job?.status === "failed" && r.audioStatus === "Failed" ? `Failed: ${r.job.error ?? ""}` : r.audioStatus}
                          />
                          <Fact label="Approval" value={r.approvedBy ? `${r.approvedBy}${r.approvedAt ? `, ${formatDate(r.approvedAt)}` : ""}` : "Not yet"} />
                          <Fact label="Duration" value={r.words || r.audio ? `${formatSeconds(r.seconds)}${r.estimated ? " (est.)" : ""}` : "–"} />
                          <Fact label="Last updated" value={r.updatedAt ? formatDate(r.updatedAt) : "–"} />
                          <Fact label="Review" value={r.outdated ? "Path changed" : r.warnings.length ? `${r.warnings.length} to check` : "–"} />
                        </dl>
                        <div className="mt-2 flex flex-wrap gap-2">
                          {r.audio && (
                            <button type="button" className={btn.quiet} onClick={() => play(r)} aria-pressed={playing === r.id}>
                              <Icon name={playing === r.id ? "pause" : "play"} className="size-4" /> {playing === r.id ? "Pause" : "Preview"}
                            </button>
                          )}
                          <Link href={`/admin/learning-paths/${encodeURIComponent(r.id)}#exciter`} className={btn.quiet}>
                            <Icon name="pen" className="size-4" /> Edit
                          </Link>
                        </div>
                      </div>
                    </div>
                  </li>
                ))}
                {!shown.length && <li className="rounded-2xl border border-dashed border-line-strong p-4 text-center text-ink-muted">Nothing needs review.</li>}
              </ul>
            </>
          )}
        </>
      )}
    </AdminShell>
  );
}

function Fact({ label, value }: { label: string; value: string }) {
  return (
    <div className="min-w-0">
      <dt className="text-xs text-ink-muted">{label}</dt>
      <dd className="truncate font-medium" title={value}>
        {value}
      </dd>
    </div>
  );
}

function Listening({ data }: { data: ManagerData }) {
  const name = (id: string) => data.rows.find((r) => r.id === id)?.name ?? "A deleted path";
  const pct = (v: number | null) => (v === null ? "–" : `${v}%`);
  return (
    <div className="flex flex-col gap-3">
      <p className="max-w-3xl text-sm text-ink-muted">
        Totals only, never who. {data.stats.listeners} {data.stats.listeners === 1 ? "person has" : "people have"} listened, for{" "}
        {formatSeconds(data.stats.seconds)} in all. Listening is never needed to finish a path. The progression shares are shown only for groups of five people
        or more, and are a prompt, not evidence that the introduction worked.
      </p>
      {!data.stats.paths.length ? (
        <p className="rounded-2xl border border-dashed border-line-strong p-4 text-center text-ink-muted">No listening yet.</p>
      ) : (
        <ul className="flex flex-col gap-3">
          {data.stats.paths.map((s) => (
            <li key={s.pathId} className="rounded-2xl border border-line bg-surface p-4">
              <h2 className="font-semibold">{name(s.pathId)}</h2>
              <dl className="mt-2 grid grid-cols-2 gap-x-4 gap-y-1 text-sm sm:grid-cols-4">
                <Fact label="Plays" value={String(s.plays)} />
                <Fact label="Listeners" value={String(s.listeners)} />
                <Fact label="Time listened" value={formatSeconds(s.seconds)} />
                <Fact label="Average reached" value={pct(s.percent)} />
                <Fact label="Listened to the end" value={String(s.completed)} />
                <Fact label="Replays" value={String(s.replays)} />
                <Fact label="Transcript opens" value={String(s.transcripts)} />
                <Fact
                  label="Speeds"
                  value={
                    Object.entries(s.speeds)
                      .map(([k, v]) => `${k} ${v}`)
                      .join(", ") || "–"
                  }
                />
                <Fact label="Went on to a Topic" value={pct(s.startedAfterListening)} />
                <Fact label="Finished the path (listened)" value={pct(s.finishedAfterListening)} />
                <Fact label="Finished (didn’t listen)" value={pct(s.finishedWithoutListening)} />
              </dl>
            </li>
          ))}
        </ul>
      )}
    </div>
  );
}
