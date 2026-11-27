"use client";

import { useState } from "react";
import { createPortal } from "react-dom";
import { cx } from "@/lib/format";
import { btn, ErrorNote, input } from "./ui";
import { Icon } from "../Icon";
import { appendDraftSource, type DraftSource } from "@/lib/documentText";
import { DocumentDrop } from "./DocumentDrop";
import { BuildProgress, readEvents, type BuildPhase, type BuildStep } from "./BuildProgress";

/*
  "Generate with AI" for learning paths and challenges: a brief and/or a document (read in the browser, so only its
  words are sent: the owner, Nov 2026), then the steps the AI works through, ticking off live as it writes. The result goes back to the editor to be
  reviewed before anything is applied or saved.
*/

type Event<R> =
  | { type: "phase"; phase: "reading" | "writing" | "checking" | "fixing"; issues?: number }
  | { type: "stages"; counts: Record<string, number>; details?: Record<string, string> }
  | ({ type: "done" } & R)
  | { type: "error"; error: string };

export function ClaudeDraftDialog<R>({
  title,
  intro,
  steps,
  endpoint,
  placeholder,
  extra,
  addFields,
  onDone,
  onClose,
}: {
  title: string;
  intro: React.ReactNode;
  steps: readonly BuildStep[];
  endpoint: string;
  placeholder: string;
  /** More settings, beside the document. */
  extra?: React.ReactNode;
  /** Adds those settings to the request. */
  addFields?: (form: FormData) => void;
  onDone: (result: R) => void;
  onClose: () => void;
}) {
  const [brief, setBrief] = useState("");
  const [source, setSource] = useState<DraftSource | null>(null);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [phase, setPhase] = useState<BuildPhase>("idle");
  const [counts, setCounts] = useState<Record<string, number>>({});
  const [details, setDetails] = useState<Record<string, string>>({});
  const [issues, setIssues] = useState<number | undefined>();
  const ready = brief.trim().length >= 10 || Boolean(source);

  async function generate() {
    setBusy(true);
    setError(null);
    setCounts({});
    setDetails({});
    setPhase(source ? "reading" : "writing");
    try {
      const form = new FormData();
      form.append("brief", brief);
      appendDraftSource(form, source);
      addFields?.(form);
      const res = await fetch(endpoint, { method: "POST", body: form });
      if (!res.ok) {
        const data = await res.json().catch(() => ({}));
        throw new Error(data.error ?? "It couldn’t be drafted. Try again.");
      }
      let result: R | null = null;
      await readEvents<Event<R>>(res, (e) => {
        if (e.type === "phase") {
          setPhase(e.phase);
          setIssues(e.issues);
        } else if (e.type === "stages") {
          setCounts(e.counts);
          setDetails(e.details ?? {});
        } else if (e.type === "error") throw new Error(e.error);
        else if (e.type === "done") result = e;
      });
      if (!result) throw new Error("The draft stopped before it was finished. Try again.");
      setPhase("done");
      onDone(result);
    } catch (e) {
      setError((e as Error).message);
      setPhase("idle");
    } finally {
      setBusy(false);
    }
  }

  return createPortal(
    <div
      role="dialog"
      aria-modal="true"
      aria-labelledby="claude-draft-title"
      className="fixed inset-0 z-50 grid place-items-center bg-[rgb(10_26_46/0.55)] p-3 sm:p-6"
    >
      <div className="flex max-h-[calc(100dvh-1.5rem)] w-[min(60rem,100%)] flex-col overflow-hidden rounded-3xl bg-surface text-ink shadow-2xl">
        <header className="flex items-start justify-between gap-3 border-b border-line p-5">
          <div>
            <h2 id="claude-draft-title" className="flex items-center gap-2 font-serif text-2xl font-semibold">
              <Icon name="spark" className="size-5 text-accent" /> {title}
            </h2>
            <p className="mt-1 text-sm text-ink-muted">{intro}</p>
          </div>
          <button
            type="button"
            onClick={onClose}
            disabled={busy}
            aria-label="Close"
            className="grid size-10 shrink-0 place-items-center rounded-full hover:bg-muted"
          >
            <Icon name="close" className="size-5" />
          </button>
        </header>
        <div className="min-h-0 flex-1 overflow-y-auto p-5">
          <div className="grid gap-4 lg:grid-cols-[minmax(0,1fr)_18rem]">
            <label className="flex flex-col gap-1 text-sm font-semibold">
              Brief
              <textarea
                rows={6}
                maxLength={4000}
                value={brief}
                onChange={(e) => setBrief(e.target.value)}
                disabled={busy}
                autoFocus
                className={cx(input, "py-2 font-normal leading-relaxed")}
                placeholder={placeholder}
              />
              <span className="text-xs font-normal text-ink-muted">Who it’s for, what they should be able to do, and anything it must include.</span>
            </label>
            <div className="flex flex-col gap-3">
              <div>
                <span className="text-sm font-semibold">Source document (optional)</span>
                <DocumentDrop value={source} onChange={setSource} disabled={busy} className="mt-1" />
              </div>
              {extra}
            </div>
          </div>
          <div className="mt-4">
            <BuildProgress steps={steps} phase={phase} counts={counts} details={details} issues={issues} />
          </div>
          {error && (
            <div className="mt-3">
              <ErrorNote text={error} />
            </div>
          )}
        </div>
        <footer className="flex flex-wrap items-center justify-end gap-3 border-t border-line p-5">
          <span className="mr-auto text-sm text-ink-muted">
            {busy
              ? "This usually takes a minute. Each step ticks off as it’s written."
              : "You review everything before it’s applied. Nothing is saved until you save."}
          </span>
          <button type="button" className={btn.secondary} onClick={onClose} disabled={busy}>
            Cancel
          </button>
          <button type="button" className={btn.primary} onClick={generate} disabled={busy || !ready}>
            <Icon name="spark" className="size-4" /> {busy ? "Writing…" : "Generate"}
          </button>
        </footer>
      </div>
    </div>,
    document.body,
  );
}
