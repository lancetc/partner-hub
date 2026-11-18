"use client";

import Link from "next/link";
import { useRef, useState } from "react";
import { api, useApi } from "@/lib/api";
import { formatDate } from "@/lib/format";
import { confirmAction } from "@/lib/confirm";
import { AdminShell, Badge, btn, ErrorNote } from "./ui";
import { Icon } from "../Icon";

/* eLearning: import SCORM ZIPs exported from Articulate Rise or Storyline, preview them, and publish. */

type Course = {
  id: string;
  title: string;
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
  const file = useRef<HTMLInputElement>(null);

  const upload = async (f: File) => {
    setBusy("upload");
    setNote(null);
    try {
      const form = new FormData();
      form.append("file", f);
      const res = await fetch("/api/admin/elearning", { method: "POST", body: form });
      const out = (await res.json()) as { error?: string; title?: string; edition?: string; warnings?: string[] };
      if (!res.ok) throw new Error(out.error ?? "The upload didn’t work.");
      setNote({ tone: "good", text: `Imported “${out.title}” (SCORM ${out.edition}) as a draft. Preview it, then publish.`, warnings: out.warnings });
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
              <div className="flex flex-wrap gap-1.5">
                <Badge tone={c.status === "published" ? "good" : "neutral"}>{c.status === "published" ? "Published" : "Draft"}</Badge>
                <Badge tone="info">SCORM {c.edition}</Badge>
                <Badge>Version {c.version}</Badge>
              </div>
              <h2 className="font-serif text-xl font-semibold leading-snug">{c.title}</h2>
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
