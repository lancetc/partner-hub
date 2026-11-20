"use client";

import { useParams, useSearchParams } from "next/navigation";
import { useRef, useState } from "react";
import { api, useApi, type Me } from "@/lib/api";
import { cx, formatDate } from "@/lib/format";
import { allBlocks, type GuideBlock, type GuideDoc } from "@/lib/magazine";
import {
  GUIDE_MODES,
  GUIDE_PURPOSES,
  GUIDE_STATES,
  GUIDE_STEPS,
  guideChecks,
  guideScriptHash,
  guideSeconds,
  guideState,
  guideStep,
  guideWords,
  type GuideMode,
} from "@/lib/magazineGuide";
import { Badge, btn, ErrorNote, Field, input } from "./ui";
import { MediaSlot, type Update } from "./MagazineEditParts";
import { Icon } from "../Icon";

/*
  The AI Learning Guide block in the Magazine editor (docs/ai-learning-guide.md). Script first: the author
  writes (or AI-drafts) the script and it's approved; then the video or audio rendered from that script is
  uploaded with captions and a poster; then someone watches it through and marks it checked. Change the
  script and the approval and the recording both fall away, so what's said always matches what was approved.
*/

/** How long a recording runs, and a video's size, read in the browser before upload. */
function measure(file: File, kind: "video" | "audio") {
  return new Promise<{ seconds: number; width: number; height: number }>((resolve, reject) => {
    const el = document.createElement(kind);
    const url = URL.createObjectURL(file);
    el.preload = "metadata";
    el.onloadedmetadata = () => {
      const v = el as HTMLVideoElement;
      resolve({
        seconds: Number.isFinite(el.duration) ? Math.round(el.duration * 10) / 10 : 0,
        width: kind === "video" ? v.videoWidth || 1280 : 0,
        height: kind === "video" ? v.videoHeight || 720 : 0,
      });
      URL.revokeObjectURL(url);
    };
    el.onerror = () => {
      URL.revokeObjectURL(url);
      reject(new Error(`This browser can’t read that ${kind === "video" ? "video. Try an MP4" : "recording. Try an MP3"}.`));
    };
    el.src = url;
  });
}

async function upload(file: File, size = { width: 0, height: 0 }) {
  const form = new FormData();
  form.append("file", file);
  form.append("width", String(size.width));
  form.append("height", String(size.height));
  const res = await fetch("/api/admin/uploads", { method: "POST", body: form });
  const data = await res.json().catch(() => ({}));
  if (!res.ok) throw new Error(data.error ?? "The upload didn’t work.");
  return data.src as string;
}

export function GuideEdit({ block: b, update }: { block: GuideBlock; update: Update }) {
  const me = useApi<Me>("/api/me").data;
  const params = useParams<{ id: string }>();
  const pageId = useSearchParams().get("page");
  const [busy, setBusy] = useState<string | null>(null);
  const [problem, setProblem] = useState<string | null>(null);
  const [watched, setWatched] = useState(false);
  const mediaInput = useRef<HTMLInputElement>(null);
  const captionsInput = useRef<HTMLInputElement>(null);
  const posterInput = useRef<HTMLInputElement>(null);
  const who = me?.user.name ?? "An author";
  const state = guideState(b);
  const step = guideStep(b);
  const hash = guideScriptHash(b.script);
  const needs = GUIDE_MODES[b.mode].needs;
  const m = b.media;
  const set = (fn: (x: GuideBlock) => void, tag?: string) => update<GuideBlock>(b.id, fn, tag);
  const run = async (label: string, fn: () => Promise<void>) => {
    setBusy(label);
    setProblem(null);
    try {
      await fn();
    } catch (e) {
      setProblem(e instanceof Error ? e.message : "That didn’t work. Try again.");
    } finally {
      setBusy(null);
    }
  };

  const draft = () =>
    run("draft", async () => {
      const out = await api<{ script: string; screenText: string }>(`/api/admin/magazine/${params.id}/guide`, {
        body: { pageId, purpose: b.purpose, mode: b.mode },
      });
      set((x) => {
        x.script = out.script;
        if (!x.screenText && out.screenText) x.screenText = out.screenText;
        x.status = "draft";
        delete x.approved;
      });
    });
  const pickMedia = (file: File | undefined) =>
    file &&
    run("media", async () => {
      const kind = needs;
      if (!file.type.startsWith(`${kind}/`))
        throw new Error(kind === "video" ? "That isn’t a video. Upload an MP4." : "That isn’t an audio file. Upload an MP3.");
      const info = await measure(file, kind);
      const src = await upload(file, info);
      // Uploaded as the recording of the script as it's approved now: change the script and it's out of date.
      set(
        (x) =>
          void (x.media = {
            kind,
            src,
            scriptHash: guideScriptHash(x.script),
            ...(info.seconds && { seconds: info.seconds }),
            producedBy: who,
            ...(x.media?.poster && { poster: x.media.poster }),
          }),
      );
      setWatched(false);
    });
  const pickCaptions = (file: File | undefined) =>
    file &&
    run("captions", async () => {
      if (!/\.vtt$/i.test(file.name)) throw new Error("Captions need to be a WebVTT file (.vtt).");
      const src = await upload(new File([file], file.name, { type: "text/vtt" }));
      set((x) => {
        if (x.media) {
          x.media.captions = src;
          delete x.media.checked;
        }
      });
    });
  const pickPoster = (file: File | undefined) =>
    file &&
    run("poster", async () => {
      if (!file.type.startsWith("image/")) throw new Error("The poster needs to be a picture.");
      const bmp = await createImageBitmap(file);
      const src = await upload(file, { width: bmp.width, height: bmp.height });
      bmp.close();
      set((x) => void (x.media && (x.media.poster = src)));
    });

  return (
    <div className="mx-auto flex w-full max-w-5xl flex-col gap-4 rounded-3xl border border-line-strong bg-surface p-5 shadow-sm sm:p-7">
      <div className="flex flex-wrap items-center gap-3">
        <p className="flex items-center gap-2 font-mulish text-sm font-extrabold uppercase tracking-[0.12em] text-accent">
          <Icon name="play" className="size-5" /> AI Learning Guide · Recorded
        </p>
        <Badge tone={GUIDE_STATES[state].tone}>{GUIDE_STATES[state].label}</Badge>
      </div>
      {/* Where it's up to. "Published" is the edition it goes out in. */}
      <ol aria-label="Progress" className="flex flex-wrap gap-x-1 gap-y-2 text-xs font-semibold">
        {GUIDE_STEPS.map((label, i) => (
          <li
            key={label}
            aria-current={i === step ? "step" : undefined}
            className={cx(
              "flex items-center gap-1 rounded-full px-2.5 py-1",
              i < step ? "bg-tealtint" : i === step ? "bg-action text-on-action" : "bg-muted text-ink-muted",
            )}
          >
            {i < step && <Icon name="check" className="size-3" />}
            {label}
          </li>
        ))}
      </ol>

      <div role="group" aria-label="How the guide appears" className="grid gap-2 sm:grid-cols-3">
        {(Object.keys(GUIDE_MODES) as GuideMode[]).map((k) => (
          <button
            key={k}
            type="button"
            aria-pressed={b.mode === k}
            onClick={() => set((x) => void (x.mode = k))}
            className={cx("rounded-2xl border-2 p-3 text-left", b.mode === k ? "border-action bg-tealtint" : "border-line-strong hover:border-action")}
          >
            <span className="font-semibold">{GUIDE_MODES[k].label}</span>
            <span className="mt-0.5 block text-sm text-ink-muted">{GUIDE_MODES[k].hint}</span>
          </button>
        ))}
      </div>

      <div className="grid gap-3 sm:grid-cols-[minmax(0,1fr)_12rem]">
        <Field label="What the guide is doing here" hint="It teaches by doing one of these; it never reads the page aloud.">
          <select className={input} value={b.purpose} onChange={(e) => set((x) => void (x.purpose = e.target.value as GuideBlock["purpose"]))}>
            {Object.entries(GUIDE_PURPOSES).map(([k, v]) => (
              <option key={k} value={k}>
                {v}
              </option>
            ))}
          </select>
        </Field>
        <Field label="Label in the frame" hint="Optional">
          <input
            className={input}
            placeholder="Case 03"
            value={b.caseLabel ?? ""}
            onChange={(e) => set((x) => void (x.caseLabel = e.target.value || undefined), `${b.id}:case`)}
          />
        </Field>
      </div>

      <Field label="Screen text" hint="One prompt or takeaway shown with the guide, not a slide of paragraphs.">
        <input
          className={input}
          placeholder="What matters to Dot?"
          value={b.screenText ?? ""}
          onChange={(e) => set((x) => void (x.screenText = e.target.value || undefined), `${b.id}:screen`)}
        />
      </Field>

      {/* 1. The script: the thing that's written, reviewed and approved. */}
      <div className="flex flex-col gap-2 rounded-2xl bg-muted/50 p-4">
        <div className="flex flex-wrap items-center gap-2">
          <p className="mr-auto font-semibold">1. The script</p>
          <span className="text-sm text-ink-muted">
            {guideWords(b.script)} words · about {guideSeconds(b.script)} sec
          </span>
          <button type="button" className={btn.secondary} disabled={Boolean(busy)} onClick={() => void draft()}>
            <Icon name="spark" className="size-4" /> {busy === "draft" ? "Drafting…" : "Draft with AI"}
          </button>
        </div>
        <textarea
          aria-label="The guide’s script"
          className={cx(input, "min-h-32 py-2 leading-relaxed")}
          placeholder="Dot has cared for her roses for years. She still wants to prune them herself, even though her family is worried. Before anyone changes the plan, what would you want to understand?"
          value={b.script}
          onChange={(e) => set((x) => void (x.script = e.target.value), `${b.id}:script`)}
        />
        <p className="text-sm text-ink-muted">
          This is exactly what learners can read instead of watching. The guide is a recording of a script: no “in my experience”, no real client details, and
          no policy the page doesn’t state.
        </p>
        <input
          className={cx(input, "text-sm")}
          aria-label="Pronunciation notes for whoever records it"
          placeholder="Pronunciation notes for the producer (optional): SIRS said as a word; Nguyen as “Win”"
          value={b.pronunciation ?? ""}
          onChange={(e) => set((x) => void (x.pronunciation = e.target.value || undefined), `${b.id}:pron`)}
        />
        <div className="flex flex-wrap items-center gap-2">
          {state === "draft" ? (
            <button
              type="button"
              className={btn.primary}
              disabled={!b.script.trim()}
              onClick={() =>
                set((x) => {
                  x.status = "approved";
                  x.approved = { by: who, at: new Date().toISOString(), hash: guideScriptHash(x.script) };
                })
              }
            >
              <Icon name="check" className="size-4" /> Approve the script
            </button>
          ) : (
            <>
              <p className="text-sm font-semibold text-[#0f5b3a] dark:text-[#8fe0b5]">
                Script approved by {b.approved?.by}, {b.approved ? formatDate(b.approved.at) : ""}
              </p>
              <button
                type="button"
                className={btn.quiet}
                onClick={() =>
                  set((x) => {
                    x.status = "draft";
                    delete x.approved;
                  })
                }
              >
                Back to draft
              </button>
            </>
          )}
          {b.approved && b.approved.hash !== hash && (
            <p className="text-sm font-semibold text-danger">The script changed after it was approved: approve it again.</p>
          )}
        </div>
      </div>

      {/* 2. The recording made from the approved script. */}
      <div className={cx("flex flex-col gap-3 rounded-2xl bg-muted/50 p-4", state === "draft" && "opacity-60")}>
        <p className="font-semibold">2. The recording ({needs === "video" ? "video" : "audio"})</p>
        <p className="text-sm text-ink-muted">
          Render it in ElevenLabs from the approved script, with the Hub’s guide and voice, then upload it here{needs === "video" ? " with its captions" : ""}.
          Don’t send real client names or details to the provider.
        </p>
        {state === "stale" && (
          <p className="rounded-xl bg-[#fdf1f0] px-3 py-2 text-sm font-semibold text-[#a12d31]">
            This recording was made from an earlier script. Upload a new one made from the approved script.
          </p>
        )}
        {m?.src &&
          (m.kind === "video" ? (
            <video src={m.src} poster={m.poster} controls preload="metadata" className="aspect-video w-full max-w-xl rounded-2xl bg-black">
              {m.captions && <track kind="captions" src={m.captions} srcLang="en" label="English" default />}
            </video>
          ) : (
            <audio src={m.src} controls preload="metadata" className="w-full max-w-xl" />
          ))}
        <div className="flex flex-wrap items-center gap-2">
          <input
            ref={mediaInput}
            type="file"
            accept={needs === "video" ? "video/mp4,video/webm" : "audio/mpeg"}
            className="sr-only"
            onChange={(e) => void pickMedia(e.target.files?.[0])}
          />
          <input ref={captionsInput} type="file" accept=".vtt,text/vtt" className="sr-only" onChange={(e) => void pickCaptions(e.target.files?.[0])} />
          <input ref={posterInput} type="file" accept="image/*" className="sr-only" onChange={(e) => void pickPoster(e.target.files?.[0])} />
          <button type="button" className={btn.secondary} disabled={state === "draft" || Boolean(busy)} onClick={() => mediaInput.current?.click()}>
            <Icon name="upload" className="size-4" /> {busy === "media" ? "Uploading…" : m?.src ? `Replace the ${needs}` : `Upload the ${needs}`}
          </button>
          {m?.kind === "video" && (
            <>
              <button type="button" className={btn.secondary} disabled={Boolean(busy)} onClick={() => captionsInput.current?.click()}>
                {busy === "captions" ? "Uploading…" : m.captions ? "Replace captions (.vtt)" : "Add captions (.vtt)"}
              </button>
              <button type="button" className={btn.secondary} disabled={Boolean(busy)} onClick={() => posterInput.current?.click()}>
                {busy === "poster" ? "Uploading…" : m.poster ? "Replace the poster" : "Add a poster frame"}
              </button>
            </>
          )}
          {m?.src && (
            <button type="button" className={btn.quiet} onClick={() => set((x) => void delete x.media)}>
              Remove the recording
            </button>
          )}
        </div>
        {m?.src && (
          <p className="text-sm text-ink-muted">
            {m.seconds ? `${m.seconds} seconds. ` : ""}
            {m.kind === "video" ? (m.captions ? "Captions added. " : "No captions yet. ") : "Learners can read the script instead. "}
            {m.producedBy ? `Uploaded by ${m.producedBy}.` : ""}
          </p>
        )}
      </div>

      {/* 3. A person watches it through. */}
      {m?.src && state !== "stale" && state !== "draft" && (
        <div className="flex flex-col gap-2 rounded-2xl bg-muted/50 p-4">
          <p className="font-semibold">3. Check the recording</p>
          {m.checked ? (
            <div className="flex flex-wrap items-center gap-2">
              <p className="text-sm font-semibold text-[#0f5b3a] dark:text-[#8fe0b5]">
                Checked by {m.checked.by}, {formatDate(m.checked.at)}
              </p>
              <button type="button" className={btn.quiet} onClick={() => set((x) => void (x.media && delete x.media.checked))}>
                Undo
              </button>
            </div>
          ) : (
            <>
              <label className="flex items-start gap-2 text-sm">
                <input
                  type="checkbox"
                  className="mt-0.5 size-4 accent-[var(--color-action)]"
                  checked={watched}
                  onChange={(e) => setWatched(e.target.checked)}
                />
                <span>
                  I watched all of it. It says the approved script, word for word; the pronunciation, lip sync and expression are right; nothing is cropped or
                  glitching{m.kind === "video" ? "; and the captions match" : ""}.
                </span>
              </label>
              <button
                type="button"
                className={cx(btn.primary, "self-start")}
                disabled={!watched || (m.kind === "video" && !m.captions)}
                onClick={() => set((x) => void (x.media && (x.media.checked = { by: who, at: new Date().toISOString() })))}
              >
                <Icon name="check" className="size-4" /> Mark the recording checked
              </button>
              {m.kind === "video" && !m.captions && <p className="text-sm text-ink-muted">Add the captions first.</p>}
            </>
          )}
        </div>
      )}

      {b.mode === "voice" && (
        <div className="flex flex-col gap-2 rounded-2xl bg-muted/50 p-4">
          <p className="font-semibold">What learners look at while the guide speaks</p>
          <div className="max-w-xl">
            <MediaSlot
              media={b.context ?? { src: "", alt: "" }}
              onPick={(src) => set((x) => void (x.context = src ? { src, alt: x.context?.alt ?? "" } : undefined))}
            />
          </div>
          {b.context?.src && (
            <input
              className={cx(input, "text-sm", !b.context.alt && "border-danger")}
              aria-label="Picture description"
              placeholder="Describe the picture or document"
              value={b.context.alt}
              onChange={(e) => set((x) => void (x.context && (x.context.alt = e.target.value)), `${b.id}:alt`)}
            />
          )}
        </div>
      )}
      {problem && <ErrorNote text={problem} />}
      <p className="text-sm text-ink-muted">
        Learners only get a recording that matches the approved script and has been checked. Until then, and if it’s ever withdrawn, they see the script as
        text.
      </p>
    </div>
  );
}

/** In the side panel: the decision it's feedback on, who owns the script, what it rests on, and this block's checks. */
export function LearningGuideSettings({ block: b, update, doc }: { block: GuideBlock; update: Update; doc: GuideDoc }) {
  const set = (fn: (x: GuideBlock) => void, tag?: string) => update<GuideBlock>(b.id, fn, tag);
  const blocks = allBlocks(doc);
  const decisions = blocks
    .slice(
      0,
      blocks.findIndex((x) => x.id === b.id),
    )
    .filter((x) => x.type === "decision");
  const checks = guideChecks(b, doc);
  return (
    <>
      <Field label="Feedback on a decision" hint="The guide stays hidden until the learner has answered it, so it can’t signal the answer.">
        <select className={input} value={b.after ?? ""} onChange={(e) => set((x) => void (x.after = e.target.value || undefined))}>
          <option value="">No: show it straight away</option>
          {b.after && !decisions.some((d) => d.id === b.after) && <option value={b.after}>(The linked decision isn’t available)</option>}
          {decisions.map((d) => (
            <option key={d.id} value={d.id}>
              {d.type === "decision" ? d.prompt.slice(0, 70) || "An untitled decision" : ""}
            </option>
          ))}
        </select>
      </Field>
      <Field label="Script owner" hint="The person accountable for what the guide says here.">
        <input className={input} value={b.owner ?? ""} onChange={(e) => set((x) => void (x.owner = e.target.value || undefined), `${b.id}:owner`)} />
      </Field>
      <Field label="Source the script’s facts come from">
        <input
          className={input}
          placeholder="Induction, Lesson 2.1"
          value={b.source?.label ?? ""}
          onChange={(e) => set((x) => void (x.source = e.target.value ? { ...x.source, label: e.target.value } : undefined), `${b.id}:src`)}
        />
      </Field>
      {b.source && (
        <Field label="Link to the source (optional)">
          <input
            className={input}
            placeholder="https://… or a page on the Hub"
            value={b.source.href ?? ""}
            onChange={(e) => set((x) => void (x.source = { label: x.source!.label, ...(e.target.value && { href: e.target.value }) }), `${b.id}:href`)}
          />
        </Field>
      )}
      <Field label="Content reviewed by" hint="Shown to learners as “Content reviewed by … · date”, and only when both are filled in. Enter a real review.">
        <input
          className={input}
          placeholder="Quality and Compliance"
          value={b.reviewed?.by ?? ""}
          onChange={(e) =>
            set(
              (x) => void (x.reviewed = e.target.value ? { by: e.target.value, on: x.reviewed?.on ?? new Date().toISOString().slice(0, 10) } : undefined),
              `${b.id}:rby`,
            )
          }
        />
      </Field>
      {b.reviewed && (
        <Field label="Reviewed on">
          <input
            type="date"
            className={input}
            value={b.reviewed.on}
            onChange={(e) => set((x) => void (x.reviewed && e.target.value && (x.reviewed.on = e.target.value)))}
          />
        </Field>
      )}
      {checks.length > 0 && (
        <ul className="flex list-disc flex-col gap-1 rounded-2xl bg-muted px-7 py-2 text-sm">
          {checks.map((c) => (
            <li key={c.text} className={cx(c.blocks && "font-semibold text-danger")}>
              {c.text.charAt(0).toUpperCase() + c.text.slice(1)}
            </li>
          ))}
        </ul>
      )}
    </>
  );
}
