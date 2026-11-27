"use client";

import { useEffect, useRef, useState } from "react";
import type { Lesson } from "@/content/lessons";
import { api, useApi } from "@/lib/api";
import { cx } from "@/lib/format";
import { HOUSE_STYLE, type ImageModel } from "@/lib/imageModels";
import { Icon } from "../Icon";
import { btn, ErrorNote, input } from "./ui";

/*
  Make a picture from a description, with the image model and settings of your choice: OpenAI directly
  (with the hub's OpenAI key), or the models offered through ElevenLabs. Finished pictures go into the
  image library, and the button under each puts it where it's wanted (a topic's poster, a Magazine picture).
*/

type Photo = { src: string; width: number; height: number };
type Check = { id: string; status: "pending" | "generating" | "completed" | "failed"; photo?: Photo; error?: string; prompt?: string };
type Made = { id: string; photo: Photo; prompt: string; model: string };

const POLL_MS = 3000;
const GIVE_UP_MS = 4 * 60_000;

export function ImageGenerator({
  lesson: l,
  onUse,
  onMade,
  useLabel = "Use as poster",
  defaultAspect = "16:9",
  start,
  references = [],
}: {
  lesson?: Lesson;
  /** Pictures of the people in it, to keep how they look (GPT Image only): sent with the description. */
  references?: string[];
  /** A starting description from somewhere else (a card: "Start from this card"), offered beside the box. */
  start?: { label: string; prompt: string };
  onUse: (p: Photo, alt: string) => void;
  onMade?: () => void;
  useLabel?: string;
  defaultAspect?: string;
}) {
  const options = useApi<{ configured: boolean; models: ImageModel[]; defaultModel?: string }>("/api/admin/image-gen").data;
  // Opened from a card, the description starts written from it ("Start from this card" puts it back after edits).
  const [prompt, setPrompt] = useState(start?.prompt ?? "");
  // Empty until the author picks one: the hub's default is used (OpenAI when its key is set).
  const [modelId, setModelId] = useState("");
  const [aspect, setAspect] = useState(defaultAspect);
  const [resolution, setResolution] = useState("1K");
  const [quality, setQuality] = useState("medium");
  const [houseStyle, setHouseStyle] = useState(true);
  const [working, setWorking] = useState<{ started: number; status: string } | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [made, setMade] = useState<Made[]>([]);
  const [elapsed, setElapsed] = useState(0);
  const live = useRef(true);
  useEffect(() => {
    live.current = true;
    return () => {
      live.current = false;
    };
  }, []);
  useEffect(() => {
    if (!working) return;
    const t = window.setInterval(() => setElapsed(Math.round((Date.now() - working.started) / 1000)), 1000);
    return () => window.clearInterval(t);
  }, [working]);

  // The model chosen, else the hub's default (OpenAI when its key is set), else the first on offer.
  const model = options?.models.find((m) => m.id === modelId) ?? options?.models.find((m) => m.id === options.defaultModel) ?? options?.models[0];
  const shape = model && !model.aspects.includes(aspect) ? (model.aspects.includes("3:2") ? "3:2" : model.aspects[0]) : aspect;

  function pickModel(id: string) {
    const m = options?.models.find((x) => x.id === id);
    if (!m) return;
    setModelId(id);
    // Keep the shape and size if the new model takes them.
    if (!m.aspects.includes(aspect)) setAspect(m.aspects[0]);
    if (m.resolutions && !m.resolutions.includes(resolution)) setResolution(m.resolutions[0]);
    if (m.qualities && !m.qualities.includes(quality)) setQuality(m.defaultQuality ?? m.qualities[0]);
  }

  async function generate() {
    if (!model) return;
    setError(null);
    setWorking({ started: Date.now(), status: "pending" });
    setElapsed(0);
    try {
      const first = await api<Check>("/api/admin/image-gen", {
        body: {
          prompt,
          model: model.id,
          aspect: shape,
          resolution: model.resolutions ? resolution : undefined,
          quality: model.qualities ? quality : undefined,
          houseStyle,
          lesson: l?.slug,
          ...(references.length && model.id === "openai" && { references }),
        },
      });
      // OpenAI answers in one go; ElevenLabs is checked every few seconds until it's finished.
      if (first.status === "completed" && first.photo) {
        setMade((m) => [{ id: first.id, photo: first.photo!, prompt: first.prompt ?? prompt, model: model.label }, ...m]);
        onMade?.();
        return;
      }
      const id = first.id;
      const started = Date.now();
      // Check every few seconds until it's finished.
      while (live.current) {
        await new Promise((r) => setTimeout(r, POLL_MS));
        if (!live.current) return;
        const c = await api<Check>(`/api/admin/image-gen?id=${encodeURIComponent(id)}`);
        if (c.status === "completed" && c.photo) {
          setMade((m) => [{ id, photo: c.photo!, prompt: c.prompt ?? prompt, model: model.label }, ...m]);
          onMade?.();
          break;
        }
        if (c.status === "failed") throw new Error(c.error ?? "The picture couldn’t be made.");
        setWorking((w) => (w ? { ...w, status: c.status } : w));
        if (Date.now() - started > GIVE_UP_MS)
          throw new Error("ElevenLabs is taking a long time. The picture may still arrive in the image library; check again in a few minutes.");
      }
    } catch (e) {
      if (live.current) setError((e as Error).message);
    } finally {
      if (live.current) setWorking(null);
    }
  }

  if (!options) return <p className="text-sm text-ink-muted">Loading image models…</p>;
  if (!options.configured)
    return (
      <p className="text-sm text-ink-muted">
        Image generation needs an OpenAI key (OPENAI_API_KEY) or an ElevenLabs key with image access (ELEVENLABS_API_KEY). Add one to .env.local and restart the
        server.
      </p>
    );

  const choice = "flex flex-col gap-1.5 text-sm font-semibold";
  return (
    <div className="flex flex-col gap-3">
      <label className={choice}>
        <span className="flex flex-wrap items-center justify-between gap-2">
          Describe the picture
          {start ? (
            <button type="button" className="text-xs font-semibold text-accent hover:underline" onClick={() => setPrompt(start.prompt)}>
              {start.label}
            </button>
          ) : (
            l && (
              <button
                type="button"
                className="text-xs font-semibold text-accent hover:underline"
                onClick={() => {
                  const about = l.summary.trim().replace(/\.$/, "");
                  setPrompt(`A poster photo for a topic called “${l.title}”${about ? `, about ${about[0].toLowerCase()}${about.slice(1)}` : ""}.`);
                }}
              >
                Start from the topic
              </button>
            )
          )}
        </span>
        <textarea
          rows={3}
          maxLength={2000}
          value={prompt}
          onChange={(e) => setPrompt(e.target.value)}
          placeholder="e.g. An older woman and her care coordinator chatting over a cup of tea at a sunny kitchen table"
          className="rounded-xl border border-line-strong bg-surface p-2.5 text-base font-normal"
        />
      </label>

      <label className={choice}>
        Image model
        <select className={input} value={model?.id} onChange={(e) => pickModel(e.target.value)}>
          {(["Google", "OpenAI"] as const).map((maker) => (
            <optgroup key={maker} label={maker}>
              {options.models
                .filter((m) => m.maker === maker)
                .map((m) => (
                  <option key={m.id} value={m.id}>
                    {m.label}
                  </option>
                ))}
            </optgroup>
          ))}
        </select>
        {model && <span className="text-xs font-normal text-ink-muted">{model.note}</span>}
      </label>

      <div className="flex flex-wrap gap-3">
        <label className={cx(choice, "min-w-28 flex-1")}>
          Shape
          <select className={input} value={shape} onChange={(e) => setAspect(e.target.value)}>
            {model?.aspects.map((a) => (
              <option key={a} value={a}>
                {a}
                {a === "16:9" ? " (best for posters)" : ""}
              </option>
            ))}
          </select>
        </label>
        {model?.resolutions && (
          <label className={cx(choice, "min-w-24 flex-1")}>
            Size
            <select className={input} value={resolution} onChange={(e) => setResolution(e.target.value)}>
              {model.resolutions.map((r) => (
                <option key={r} value={r}>
                  {r}
                </option>
              ))}
            </select>
          </label>
        )}
        {model?.qualities && (
          <label className={cx(choice, "min-w-24 flex-1")}>
            Quality
            <select className={cx(input, "capitalize")} value={quality} onChange={(e) => setQuality(e.target.value)}>
              {model.qualities.map((q) => (
                <option key={q} value={q}>
                  {q}
                </option>
              ))}
            </select>
          </label>
        )}
      </div>

      <label className="flex items-start gap-2 text-sm">
        <input type="checkbox" checked={houseStyle} onChange={(e) => setHouseStyle(e.target.checked)} className="mt-1 size-4 accent-[var(--action)]" />
        <span>
          <span className="font-semibold">Trilogy Care photo style</span>
          <span className="block text-xs text-ink-muted">Adds: {HOUSE_STYLE}</span>
        </span>
      </label>
      {references.length > 0 && (
        <p className={cx("rounded-xl px-3 py-2 text-sm", model?.id === "openai" ? "bg-tealtint" : "bg-[#fab53d]/15")}>
          {model?.id === "openai"
            ? `Keeping people looking the same: ${references.length} reference ${references.length === 1 ? "picture" : "pictures"} sent with the description.`
            : "Reference pictures work with GPT Image (your OpenAI key). Choose it above to keep people looking the same."}
        </p>
      )}

      <div className="flex flex-wrap items-center gap-3">
        <button type="button" className={btn.primary} onClick={generate} disabled={Boolean(working) || prompt.trim().length < 3}>
          <Icon name="spark" className="size-4" /> {working ? "Making your picture…" : "Generate"}
        </button>
        {working && (
          <span role="status" className="text-sm text-ink-muted">
            {model?.id === "openai" ? "Drawing" : working.status === "generating" ? "Drawing" : "Queued"} · {elapsed}s. Usually 10 to 60 seconds.
          </span>
        )}
      </div>
      <p className="text-xs text-ink-muted">
        {model?.id === "openai"
          ? "Each picture is charged to your OpenAI account; higher quality costs more. Every picture is kept in the image library."
          : "Each picture uses ElevenLabs credits; bigger sizes and higher quality cost more. Pictures that fail aren’t charged."}
      </p>
      {error && <ErrorNote text={error} />}

      {made.length > 0 && (
        <ul className="grid gap-3 sm:grid-cols-2">
          {made.map((m) => (
            <li key={m.id} className="overflow-hidden rounded-2xl border border-line bg-surface">
              {/* eslint-disable-next-line @next/next/no-img-element */}
              <img src={m.photo.src} alt="" className="aspect-[16/10] w-full object-cover" />
              <div className="flex flex-col gap-2 p-2.5">
                <p className="line-clamp-2 text-xs text-ink-muted">
                  {m.model}: {m.prompt}
                </p>
                <button type="button" className={cx(btn.secondary, "min-h-10")} onClick={() => onUse(m.photo, m.prompt)}>
                  <Icon name="check" className="size-4" /> {useLabel}
                </button>
              </div>
            </li>
          ))}
        </ul>
      )}
    </div>
  );
}
