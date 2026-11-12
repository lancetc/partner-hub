"use client";

import Link from "next/link";
import { useRouter } from "next/navigation";
import { useState } from "react";
import { api, useApi } from "@/lib/api";
import { cx, formatDate } from "@/lib/format";
import { parseVideoLink, videoLinkFor } from "@/lib/videoLinks";
import { AdminShell, Badge, btn, ErrorNote, Field, input } from "./ui";
import { Icon } from "../Icon";
import { WebinarPlayer } from "../WebinarPlayer";
import { uploadVideo } from "./LessonEditor";
import { confirmAction } from "@/lib/confirm";
import { ImageDropZone } from "./ImagePicker";

/* Recorded webinars: add the recording and details, then publish for learners. */

type Video = { provider: "youtube" | "synthesia" | "upload"; id?: string; src?: string };
type Webinar = {
  id: string;
  title: string;
  summary: string;
  presenter: string;
  recordedOn: string;
  minutes: number;
  video: Video;
  thumbnail: string | null;
  audience: ("partner" | "coordinator")[];
  topics: string[];
  transcript: string;
  resources: { title: string; url: string }[];
  status: "draft" | "published";
  views?: number;
};

export function WebinarList() {
  const { data, error } = useApi<{ webinars: Webinar[] }>("/api/admin/webinars");
  return (
    <AdminShell title="Webinars">
      <div className="flex flex-wrap items-start justify-between gap-4">
        <p className="max-w-3xl text-ink-muted">
          Recorded webinars for partners and coordinators. Published recordings appear on the Webinars page, and you can feature them in email campaigns.
        </p>
        <Link href="/admin/webinars/new" className={btn.primary}>
          <Icon name="plus" className="size-4" /> Add a webinar
        </Link>
      </div>
      <PageText />
      {error && (
        <div className="mt-4">
          <ErrorNote text={error} />
        </div>
      )}
      {!data ? (
        <p className="mt-6 text-ink-muted">Loading…</p>
      ) : !data.webinars.length ? (
        <p className="mt-6 rounded-3xl border border-dashed border-line-strong p-6 text-center text-ink-muted">No webinars yet.</p>
      ) : (
        <ul className="mt-6 grid gap-4 md:grid-cols-2 xl:grid-cols-3">
          {data.webinars.map((w) => (
            <li key={w.id} className="relative flex flex-col overflow-hidden rounded-3xl border border-line bg-surface hover:border-line-strong">
              <div className="relative aspect-video bg-[#102a43]">
                {/* eslint-disable-next-line @next/next/no-img-element */}
                {w.thumbnail && <img src={w.thumbnail} alt="" className="absolute inset-0 size-full object-cover object-[50%_25%]" />}
                <span className="absolute bottom-2 right-2 rounded-full bg-black/60 px-2 py-0.5 text-xs font-bold text-white">{w.minutes} min</span>
              </div>
              <div className="flex flex-1 flex-col gap-1.5 p-4">
                <div className="flex flex-wrap gap-1.5">
                  <Badge tone={w.status === "published" ? "good" : "neutral"}>{w.status === "published" ? "Published" : "Draft"}</Badge>
                  {w.topics.map((t) => (
                    <Badge key={t}>{t}</Badge>
                  ))}
                </div>
                <h2 className="font-serif text-lg font-semibold leading-snug">
                  <Link href={`/admin/webinars/${w.id}`} className="after:absolute after:inset-0 after:content-[''] hover:underline">
                    {w.title}
                  </Link>
                </h2>
                <p className="text-sm text-ink-muted">
                  {formatDate(w.recordedOn)}
                  {w.presenter && ` · ${w.presenter}`}
                </p>
                <p className="mt-auto pt-2 text-sm">
                  <strong>{w.views ?? 0}</strong> watched
                </p>
              </div>
            </li>
          ))}
        </ul>
      )}
    </AdminShell>
  );
}

const blank: Webinar = {
  id: "",
  title: "",
  summary: "",
  presenter: "",
  recordedOn: new Date().toISOString().slice(0, 10),
  minutes: 45,
  video: { provider: "youtube", id: "" },
  thumbnail: null,
  audience: ["partner", "coordinator"],
  topics: [],
  transcript: "",
  resources: [],
  status: "draft",
};

export function WebinarEditor({ id }: { id?: string }) {
  const { data, error } = useApi<Webinar>(id ? `/api/admin/webinars/${id}` : null);
  if (id && (error || !data))
    return (
      <AdminShell title="Webinar" back={{ href: "/admin/webinars", label: "Webinars" }}>
        {error ? <ErrorNote text={error} /> : <p className="text-ink-muted">Loading…</p>}
      </AdminShell>
    );
  return <Form key={data?.id ?? "new"} initial={data ?? blank} isNew={!id} />;
}

function Form({ initial, isNew }: { initial: Webinar; isNew: boolean }) {
  const router = useRouter();
  const [w, setW] = useState<Webinar>(initial);
  const [link, setLink] = useState(
    initial.video.provider !== "upload" && initial.video.id ? videoLinkFor({ provider: initial.video.provider, id: initial.video.id }) : "",
  );
  const [topics, setTopics] = useState(initial.topics.join(", "));
  const [dirty, setDirty] = useState(false);
  const [busy, setBusy] = useState(false);
  const [note, setNote] = useState<{ text: string; ok: boolean } | null>(null);
  const set = (patch: Partial<Webinar>) => {
    setW((x) => ({ ...x, ...patch }));
    setDirty(true);
    setNote(null);
  };
  const parsed = parseVideoLink(link);

  async function run(fn: () => Promise<void>, ok: string) {
    setBusy(true);
    setNote(null);
    try {
      await fn();
      setNote({ text: ok, ok: true });
    } catch (e) {
      setNote({ text: (e as Error).message, ok: false });
    } finally {
      setBusy(false);
    }
  }
  const payload = () => ({
    ...w,
    topics: topics
      .split(",")
      .map((t) => t.trim())
      .filter(Boolean),
  });
  const save = async () => {
    if (isNew) {
      const r = await api<{ id: string }>("/api/admin/webinars", { body: payload() });
      router.push(`/admin/webinars/${r.id}`);
      return;
    }
    await api(`/api/admin/webinars/${w.id}`, { method: "PUT", body: payload() });
    setDirty(false);
  };

  return (
    <AdminShell title={isNew ? "Add a webinar" : w.title || "Webinar"} back={{ href: "/admin/webinars", label: "Webinars" }}>
      <div className="grid gap-6 xl:grid-cols-[minmax(0,1fr)_26rem]">
        <fieldset disabled={busy} className="flex min-w-0 flex-col gap-5">
          <section className="grid gap-4 rounded-3xl border border-line bg-surface p-5 sm:grid-cols-2">
            <Field label="Title" className="sm:col-span-2">
              <input className={input} value={w.title} onChange={(e) => set({ title: e.target.value })} />
            </Field>
            <Field label="Summary" hint="One or two sentences shown on the Webinars page and in emails." className="sm:col-span-2">
              <textarea
                rows={3}
                className="w-full rounded-xl border border-line-strong bg-surface px-3 py-2"
                value={w.summary}
                onChange={(e) => set({ summary: e.target.value })}
              />
            </Field>
            <Field label="Presenter">
              <input className={input} value={w.presenter} onChange={(e) => set({ presenter: e.target.value })} />
            </Field>
            <div className="grid grid-cols-2 gap-3">
              <Field label="Recorded on">
                <input type="date" className={input} value={w.recordedOn} onChange={(e) => set({ recordedOn: e.target.value })} />
              </Field>
              <Field label="Length (min)">
                <input type="number" min={0} className={input} value={w.minutes} onChange={(e) => set({ minutes: Number(e.target.value) })} />
              </Field>
            </div>
            <Field label="Topics" hint="Comma separated, for filtering." className="sm:col-span-2">
              <input
                className={input}
                value={topics}
                placeholder="Support at Home, Invoicing"
                onChange={(e) => {
                  setTopics(e.target.value);
                  setDirty(true);
                }}
              />
            </Field>
            <fieldset className="sm:col-span-2">
              <legend className="text-sm font-semibold">Who it’s for</legend>
              <div className="mt-1 flex flex-wrap gap-2">
                {(["partner", "coordinator"] as const).map((g) => (
                  <label
                    key={g}
                    className={cx(
                      "flex min-h-11 cursor-pointer items-center gap-2 rounded-full border px-4",
                      w.audience.includes(g) ? "border-action bg-tealtint" : "border-line-strong",
                    )}
                  >
                    <input
                      type="checkbox"
                      className="size-4 accent-[var(--action)]"
                      checked={w.audience.includes(g)}
                      onChange={(e) => set({ audience: e.target.checked ? [...w.audience, g] : w.audience.filter((x) => x !== g) })}
                    />
                    {g === "partner" ? "Care Partners" : "Care coordinators"}
                  </label>
                ))}
              </div>
            </fieldset>
          </section>

          <section className="flex flex-col gap-3 rounded-3xl border border-line bg-surface p-5">
            <h2 className="font-serif text-xl font-semibold">Recording</h2>
            <Field label="YouTube or Synthesia link">
              <input
                className={input}
                value={link}
                placeholder="https://www.youtube.com/watch?v=…"
                onChange={(e) => {
                  setLink(e.target.value);
                  const p = parseVideoLink(e.target.value);
                  if (p) set({ video: { provider: p.provider, id: p.id } });
                }}
              />
            </Field>
            {link && (
              <p role="status" className={cx("text-xs font-semibold", parsed ? "text-accent" : "text-danger")}>
                {parsed ? `${parsed.provider === "youtube" ? "YouTube" : "Synthesia"} video found.` : "That isn’t a YouTube or Synthesia link we can play."}
              </p>
            )}
            <div className="flex flex-wrap items-center gap-2">
              <span className="text-sm text-ink-muted">or</span>
              <label className={cx(btn.secondary, "cursor-pointer")}>
                <input
                  type="file"
                  accept="video/mp4,video/webm,video/quicktime"
                  className="sr-only"
                  onChange={(e) => {
                    const f = e.target.files?.[0];
                    e.target.value = "";
                    if (!f) return;
                    run(async () => {
                      const v = await uploadVideo(f, f.name);
                      setLink("");
                      set({ video: { provider: "upload", src: v.src }, thumbnail: w.thumbnail ?? v.poster ?? null });
                    }, "Recording uploaded.");
                  }}
                />
                <Icon name="upload" className="size-4" /> Upload the recording
              </label>
              {w.video.provider === "upload" && w.video.src && <Badge tone="good">Uploaded video</Badge>}
            </div>
            <p className="text-xs text-ink-muted">Uploads up to 80 MB. For long recordings, YouTube (unlisted is fine) streams better.</p>
          </section>

          <section className="flex flex-col gap-3 rounded-3xl border border-line bg-surface p-5">
            <h2 className="font-serif text-xl font-semibold">Thumbnail, resources and transcript</h2>
            <div className="max-w-sm">
              <p className="mb-1.5 text-sm font-semibold">Thumbnail</p>
              <ImageDropZone
                picture={w.thumbnail ? { src: w.thumbnail, width: 1600, height: 900 } : undefined}
                label="Drag a thumbnail here"
                aspect="aspect-video"
                onChange={(p) => set({ thumbnail: p?.src ?? null })}
              />
            </div>
            <div className="flex flex-col gap-2">
              <p className="text-sm font-semibold">Resources</p>
              {w.resources.map((r, i) => (
                <div key={i} className="grid gap-2 sm:grid-cols-[1fr_1fr_auto]">
                  <input
                    className={input}
                    placeholder="Title"
                    value={r.title}
                    onChange={(e) => set({ resources: w.resources.map((x, j) => (j === i ? { ...x, title: e.target.value } : x)) })}
                  />
                  <input
                    className={input}
                    placeholder="https://"
                    value={r.url}
                    onChange={(e) => set({ resources: w.resources.map((x, j) => (j === i ? { ...x, url: e.target.value } : x)) })}
                  />
                  <button
                    type="button"
                    className={btn.quiet}
                    onClick={() => set({ resources: w.resources.filter((_, j) => j !== i) })}
                    aria-label="Remove resource"
                  >
                    <Icon name="trash" className="size-4" />
                  </button>
                </div>
              ))}
              <button type="button" className={cx(btn.quiet, "self-start")} onClick={() => set({ resources: [...w.resources, { title: "", url: "" }] })}>
                <Icon name="plus" className="size-4" /> Add a resource
              </button>
            </div>
            <Field label="Transcript" hint="Helps people who can’t listen, and makes the recording searchable.">
              <textarea
                rows={6}
                className="w-full rounded-xl border border-line-strong bg-surface px-3 py-2 text-sm"
                value={w.transcript}
                onChange={(e) => set({ transcript: e.target.value })}
              />
            </Field>
          </section>
        </fieldset>

        <aside className="flex flex-col gap-3 xl:sticky xl:top-24 xl:self-start">
          {(w.video.id || w.video.src) && <WebinarPlayer video={w.video} title={w.title} poster={w.thumbnail} />}
          <div className="flex flex-col gap-3 rounded-3xl border border-line bg-surface p-4">
            <div className="flex items-center gap-2">
              <Badge tone={w.status === "published" ? "good" : "neutral"}>{w.status === "published" ? "Published" : "Draft"}</Badge>
              {!isNew && w.status === "published" && (
                <Link href={`/webinars/${w.id}`} className="text-sm font-semibold text-accent hover:underline" target="_blank">
                  View as a learner
                </Link>
              )}
            </div>
            {note && <p className={cx("rounded-xl p-2 text-sm", note.ok ? "bg-tealtint" : "bg-orange/10")}>{note.text}</p>}
            <div className="flex flex-wrap gap-2">
              <button type="button" className={btn.primary} disabled={busy || (!dirty && !isNew)} onClick={() => run(save, "Saved.")}>
                {isNew ? "Save as draft" : dirty ? "Save" : "Saved"}
              </button>
              {!isNew && (
                <button
                  type="button"
                  className={btn.secondary}
                  disabled={busy}
                  onClick={() =>
                    run(
                      async () => {
                        if (dirty) await save();
                        const publish = w.status !== "published";
                        await api(`/api/admin/webinars/${w.id}`, { body: { action: publish ? "publish" : "unpublish" } });
                        setW((x) => ({ ...x, status: publish ? "published" : "draft" }));
                      },
                      w.status === "published" ? "Unpublished." : "Published. It’s on the Webinars page now.",
                    )
                  }
                >
                  {w.status === "published" ? "Unpublish" : "Publish"}
                </button>
              )}
              {!isNew && w.status === "draft" && (
                <button
                  type="button"
                  className={btn.quiet}
                  disabled={busy}
                  onClick={async () =>
                    (await confirmAction("It’s removed from the admin list for good.", {
                      title: "Delete this webinar?",
                      confirmLabel: "Delete",
                      danger: true,
                    })) && run(async () => (await api(`/api/admin/webinars/${w.id}`, { method: "DELETE" }), router.push("/admin/webinars")), "Deleted.")
                  }
                >
                  <Icon name="trash" className="size-4" /> Delete
                </button>
              )}
            </div>
          </div>
        </aside>
      </div>
    </AdminShell>
  );
}

/** The Webinars page's own heading and introduction. */
function PageText() {
  const { data } = useApi<{ heading: string; intro: string }>("/api/admin/webinars/page");
  const [draft, setDraft] = useState<{ heading: string; intro: string } | null>(null);
  const [busy, setBusy] = useState(false);
  const [note, setNote] = useState<{ text: string; ok: boolean } | null>(null);
  const v = draft ?? data;
  if (!v) return null;
  async function save() {
    setBusy(true);
    setNote(null);
    try {
      const r = await api<{ heading: string; intro: string }>("/api/admin/webinars/page", { method: "PUT", body: v });
      setDraft(r);
      setNote({ text: "Saved. The Webinars page is updated.", ok: true });
    } catch (e) {
      setNote({ text: (e as Error).message, ok: false });
    } finally {
      setBusy(false);
    }
  }
  return (
    <details className="mt-5 rounded-2xl border border-line bg-surface p-4">
      <summary className="cursor-pointer font-semibold">Page heading and introduction</summary>
      <div className="mt-3 grid max-w-3xl gap-3">
        <Field label="Heading">
          <input className={input} value={v.heading} onChange={(e) => setDraft({ ...v, heading: e.target.value })} />
        </Field>
        <Field label="Introduction" hint="Shown under the heading on the Webinars page.">
          <textarea
            rows={2}
            className="w-full rounded-xl border border-line-strong bg-surface px-3 py-2"
            value={v.intro}
            onChange={(e) => setDraft({ ...v, intro: e.target.value })}
          />
        </Field>
        <div className="flex flex-wrap items-center gap-3">
          <button type="button" className={btn.primary} disabled={busy || !draft} onClick={save}>
            {busy ? "Saving…" : "Save"}
          </button>
          <a href="/webinars" target="_blank" rel="noopener" className="text-sm font-semibold text-accent hover:underline">
            View the page
          </a>
          {note && <span className={cx("text-sm", note.ok ? "text-ink-muted" : "font-semibold text-danger")}>{note.text}</span>}
        </div>
      </div>
    </details>
  );
}
