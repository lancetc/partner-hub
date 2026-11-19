"use client";

import Link from "next/link";
import { useRef, useState } from "react";
import { api, useApi } from "@/lib/api";
import { formatDate } from "@/lib/format";
import { confirmAction } from "@/lib/confirm";
import { AdminShell, Badge, btn, ErrorNote, Field, input } from "./ui";
import { ImageDropZone } from "./ImagePicker";
import { Icon } from "../Icon";

/* eLearning: import SCORM ZIPs exported from Articulate Rise or Storyline, preview them, and publish. */

type Course = {
  id: string;
  title: string;
  description: string;
  poster: string | null;
  status: "draft" | "published" | "archived";
  standard: "scorm12" | "scorm2004";
  edition: string;
  version: number;
  launchHref: string;
  files: number;
  bytes: number;
  fileName: string | null;
  warnings: string[];
  uploadedAt: string;
  publishedAt: string | null;
  learnerAttempts: number;
};
type Data = { courses: Course[]; rejected: { at: string; fileName: string; reason: string }[] };

const mb = (n: number) => `${(n / 1048576).toFixed(n > 10 * 1048576 ? 0 : 1)} MB`;

export function ElearningAdmin() {
  const { data, error, reload } = useApi<Data>("/api/admin/elearning");
  const [busy, setBusy] = useState<string | null>(null);
  const [note, setNote] = useState<{ tone: "good" | "bad"; text: string; warnings?: string[] } | null>(null);
  // The course whose name and description are being edited: opened straight after an upload, so it gets named.
  const [editing, setEditing] = useState<string | null>(null);
  const file = useRef<HTMLInputElement>(null);

  const upload = async (f: File) => {
    setBusy("upload");
    setNote(null);
    try {
      const form = new FormData();
      form.append("file", f);
      const res = await fetch("/api/admin/elearning", { method: "POST", body: form });
      const out = (await res.json()) as { error?: string; courseId?: string; title?: string; edition?: string; warnings?: string[] };
      if (!res.ok) throw new Error(out.error ?? "The upload didn’t work.");
      setNote({ tone: "good", text: `Imported SCORM ${out.edition} as a draft. Name the course below, then preview and publish it.`, warnings: out.warnings });
      if (out.courseId) setEditing(out.courseId);
      reload();
    } catch (e) {
      setNote({ tone: "bad", text: e instanceof Error ? e.message : "The upload didn’t work." });
    } finally {
      setBusy(null);
      if (file.current) file.current.value = "";
    }
  };

  const remove = async (c: Course) => {
    const keep = c.learnerAttempts > 0;
    const ok = await confirmAction(
      keep
        ? `${c.learnerAttempts} learner ${c.learnerAttempts === 1 ? "attempt is" : "attempts are"} recorded on this course. It will be removed from eLearning for everyone, and those training records kept for reporting.`
        : "No learner has tried it, so the course and its files are removed for good. This can’t be undone.",
      { title: `Delete “${c.title}”?`, confirmLabel: "Delete course", danger: true },
    );
    if (!ok) return;
    setBusy(c.id);
    try {
      await api(`/api/admin/elearning/${c.id}`, { method: "DELETE" });
      setNote({ tone: "good", text: keep ? `Deleted “${c.title}”. Learners’ records on it are kept.` : `Deleted “${c.title}” and its files.` });
      reload();
    } catch (e) {
      setNote({ tone: "bad", text: e instanceof Error ? e.message : "That didn’t work." });
    } finally {
      setBusy(null);
    }
  };

  // The poster saves as soon as it's chosen, replaced or removed.
  const setPoster = async (c: Course, poster: string | null) => {
    setBusy(c.id);
    try {
      await api(`/api/admin/elearning/${c.id}`, { body: { action: "poster", poster } });
      setNote({ tone: "good", text: poster ? `Poster saved for “${c.title}”.` : `Poster removed from “${c.title}”.` });
      reload();
    } catch (e) {
      setNote({ tone: "bad", text: e instanceof Error ? e.message : "That didn’t work." });
    } finally {
      setBusy(null);
    }
  };

  const act = async (id: string, action: "publish" | "unpublish") => {
    setBusy(id);
    try {
      await api(`/api/admin/elearning/${id}`, { body: { action } });
      reload();
    } catch (e) {
      setNote({ tone: "bad", text: e instanceof Error ? e.message : "That didn’t work." });
    } finally {
      setBusy(null);
    }
  };

  return (
    <AdminShell title="eLearning">
      <div className="flex flex-wrap items-start justify-between gap-4">
        <p className="max-w-3xl text-ink-muted">
          SCORM courses exported from Articulate Rise 360 or Storyline 360. Upload the ZIP exactly as Articulate exports it: it’s checked, unpacked and
          added as a draft. Preview it as a learner would, then publish. Completion and scores come from what the course itself reports.
        </p>
        <label className={btn.primary + (busy === "upload" ? " pointer-events-none opacity-60" : " cursor-pointer")}>
          <Icon name="upload" className="size-4" /> {busy === "upload" ? "Importing…" : "Upload a SCORM ZIP"}
          <input
            ref={file}
            type="file"
            accept=".zip,application/zip"
            className="sr-only"
            disabled={busy === "upload"}
            onChange={(e) => e.target.files?.[0] && upload(e.target.files[0])}
          />
        </label>
      </div>

      {note && (
        <div role="status" className={`mt-4 rounded-2xl p-4 ring-1 ${note.tone === "good" ? "bg-success/10 ring-success/40" : "bg-danger/10 ring-danger/40"}`}>
          <p className="font-semibold">{note.text}</p>
          {!!note.warnings?.length && (
            <ul className="mt-2 list-disc pl-5 text-sm text-ink-muted">
              {note.warnings.map((w) => (
                <li key={w}>{w}</li>
              ))}
            </ul>
          )}
        </div>
      )}
      {error && (
        <div className="mt-4">
          <ErrorNote text={error} />
        </div>
      )}

      {!data ? (
        <p className="mt-6 text-ink-muted">Loading…</p>
      ) : !data.courses.length ? (
        <p className="mt-6 rounded-3xl border border-dashed border-line-strong p-6 text-center text-ink-muted">No courses yet. Upload a SCORM ZIP to start.</p>
      ) : (
        <ul className="mt-6 grid gap-4 md:grid-cols-2">
          {data.courses.map((c) => (
            <li key={c.id} className="flex flex-col gap-3 rounded-3xl border border-line bg-surface p-5">
              {/* The poster learners see on the course's tile in Magazine. */}
              <ImageDropZone
                picture={c.poster ? { src: c.poster, width: 1600, height: 1000 } : undefined}
                label="Drag a poster here"
                addLabel="Add poster image"
                aspect="aspect-[16/10]"
                onChange={(p) => setPoster(c, p?.src ?? null)}
              />
              <div className="flex flex-wrap gap-1.5">
                <Badge tone={c.status === "published" ? "good" : "neutral"}>{c.status === "published" ? "Published" : "Draft"}</Badge>
                <Badge tone="info">SCORM {c.edition}</Badge>
                <Badge>Version {c.version}</Badge>
              </div>
              {editing === c.id ? (
                <CourseDetailsForm
                  course={c}
                  onCancel={() => setEditing(null)}
                  onSaved={() => {
                    setEditing(null);
                    setNote({ tone: "good", text: "Course name and description saved." });
                    reload();
                  }}
                />
              ) : (
                <div className="flex items-start gap-2">
                  <div className="min-w-0 flex-1">
                    <h2 className="font-serif text-xl font-semibold leading-snug">{c.title}</h2>
                    {c.description ? (
                      <p className="mt-1 text-sm text-ink-muted">{c.description}</p>
                    ) : (
                      <p className="mt-1 text-sm italic text-ink-muted">No description yet.</p>
                    )}
                  </div>
                  <button type="button" className={btn.quiet + " shrink-0"} onClick={() => setEditing(c.id)}>
                    <Icon name="pen" className="size-4" /> Edit name
                  </button>
                </div>
              )}
              <dl className="grid grid-cols-[auto_1fr] gap-x-3 gap-y-1 text-sm">
                <dt className="text-ink-muted">Launch file</dt>
                <dd className="break-all font-mono text-xs leading-5">{c.launchHref}</dd>
                <dt className="text-ink-muted">Package</dt>
                <dd>
                  {c.files} files · {mb(c.bytes)}
                  {c.fileName ? ` · ${c.fileName}` : ""}
                </dd>
                <dt className="text-ink-muted">Imported</dt>
                <dd>{formatDate(c.uploadedAt)}</dd>
              </dl>
              {!!c.warnings.length && (
                <ul className="rounded-2xl bg-gold/15 p-3 text-sm">
                  {c.warnings.map((w) => (
                    <li key={w} className="flex gap-2">
                      <Icon name="alert" className="mt-0.5 size-4 shrink-0" /> {w}
                    </li>
                  ))}
                </ul>
              )}
              <div className="mt-auto flex flex-wrap gap-2">
                <Link href={`/elearning/${c.id}`} className={btn.secondary}>
                  <Icon name="play" className="size-4" /> {c.status === "published" ? "Open" : "Preview"}
                </Link>
                {c.status === "published" ? (
                  <button type="button" className={btn.quiet} disabled={busy === c.id} onClick={() => act(c.id, "unpublish")}>
                    Unpublish
                  </button>
                ) : (
                  <button type="button" className={btn.primary} disabled={busy === c.id} onClick={() => act(c.id, "publish")}>
                    Publish
                  </button>
                )}
                <button type="button" className={btn.quiet + " ml-auto"} disabled={busy === c.id} onClick={() => remove(c)}>
                  <Icon name="trash" className="size-4" /> Delete
                </button>
              </div>
            </li>
          ))}
        </ul>
      )}

      {!!data?.rejected.length && (
        <section className="mt-8">
          <h2 className="font-serif text-lg font-semibold">Recent uploads that were refused</h2>
          <ul className="mt-2 divide-y divide-line text-sm">
            {data.rejected.map((r) => (
              <li key={r.at + r.fileName} className="py-2">
                <span className="font-semibold">{r.fileName}</span> · {formatDate(r.at)}: <span className="text-ink-muted">{r.reason}</span>
              </li>
            ))}
          </ul>
        </section>
      )}
    </AdminShell>
  );
}

/** The course's name and description, as learners see them in Magazine. */
function CourseDetailsForm({ course, onCancel, onSaved }: { course: Course; onCancel: () => void; onSaved: () => void }) {
  const [title, setTitle] = useState(course.title);
  const [description, setDescription] = useState(course.description);
  const [saving, setSaving] = useState(false);
  const [problem, setProblem] = useState<string | null>(null);
  const save = async (e: React.FormEvent) => {
    e.preventDefault();
    setSaving(true);
    setProblem(null);
    try {
      await api(`/api/admin/elearning/${course.id}`, { body: { action: "details", title, description } });
      onSaved();
    } catch (err) {
      setProblem(err instanceof Error ? err.message : "That didn’t save.");
    } finally {
      setSaving(false);
    }
  };
  return (
    <form onSubmit={save} className="flex flex-col gap-3 rounded-2xl bg-tealtint p-4">
      <Field label="Course name" hint="What learners see on its tile in Magazine.">
        <input className={input} value={title} maxLength={160} required autoFocus onFocus={(e) => e.target.select()} onChange={(e) => setTitle(e.target.value)} />
      </Field>
      <Field label="Description" hint="Optional. A line or two on what the course covers.">
        <textarea className={input + " min-h-24 py-2"} value={description} maxLength={1000} onChange={(e) => setDescription(e.target.value)} />
      </Field>
      {problem && <ErrorNote text={problem} />}
      <div className="flex flex-wrap gap-2">
        <button type="submit" className={btn.primary} disabled={saving || title.trim().length < 2}>
          {saving ? "Saving…" : "Save"}
        </button>
        <button type="button" className={btn.quiet} onClick={onCancel} disabled={saving}>
          Cancel
        </button>
      </div>
    </form>
  );
}
