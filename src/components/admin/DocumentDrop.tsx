"use client";

import { useState } from "react";
import { cx } from "@/lib/format";
import { describeSource, readDraftSource, type DraftSource } from "@/lib/documentText";
import { Icon } from "../Icon";
import { btn, ErrorNote } from "./ui";

/*
  Drop a document for AI to work from (the owner, Nov 2026), the same on New story, Topics, Discovery Paths, Challenges
  and the Magazine: Word, PowerPoint, PDF or text, read here in the browser so only its words are sent, however large the
  file; or a SCORM package, read on the server. It says what it read ("24 slides read · 3,412 words") before anything
  is generated.
*/

export const DOCUMENT_TYPES =
  ".docx,.pptx,.pdf,.txt,.md,.zip,application/pdf,application/vnd.openxmlformats-officedocument.wordprocessingml.document,application/vnd.openxmlformats-officedocument.presentationml.presentation,text/plain,application/zip";

export function DocumentDrop({
  value,
  onChange,
  disabled,
  label = "Drop a document here",
  scorm = true,
  className,
}: {
  value: DraftSource | null;
  onChange: (s: DraftSource | null) => void;
  disabled?: boolean;
  label?: string;
  /** Accept an eLearning course (SCORM .zip) too. */
  scorm?: boolean;
  className?: string;
}) {
  const [over, setOver] = useState(false);
  const [reading, setReading] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);

  async function choose(f: File | undefined | null) {
    if (!f) return;
    setError(null);
    if (!scorm && /\.zip$/i.test(f.name)) return setError("Drop a Word (.docx), PowerPoint (.pptx), PDF or text file.");
    if (!/\.(docx|pptx|pdf|txt|md|zip|doc|ppt)$/i.test(f.name))
      return setError(`Drop a Word (.docx), PowerPoint (.pptx), PDF${scorm ? ", text file or SCORM package (.zip)" : " or text file"}.`);
    setReading(f.name);
    onChange(null);
    try {
      onChange(await readDraftSource(f));
    } catch (e) {
      setError((e as Error).message || "That document couldn’t be read.");
    } finally {
      setReading(null);
    }
  }

  const name = value ? (value.kind === "scorm" ? value.file.name : value.doc.name) : null;
  return (
    <div className={className}>
      <label
        onDragOver={(e) => {
          e.preventDefault();
          setOver(true);
        }}
        onDragLeave={() => setOver(false)}
        onDrop={(e) => {
          e.preventDefault();
          setOver(false);
          void choose(e.dataTransfer.files?.[0]);
        }}
        className={cx(
          "flex min-h-32 cursor-pointer flex-col items-center justify-center gap-1.5 rounded-2xl border-2 border-dashed p-4 text-center text-sm has-[:focus-visible]:outline-2",
          over ? "border-[#007f7e] bg-[#e6f3f1]" : "border-line-strong hover:border-action",
          (disabled || reading) && "pointer-events-none opacity-60",
        )}
      >
        <input type="file" accept={DOCUMENT_TYPES} className="sr-only" disabled={disabled} onChange={(e) => void choose(e.target.files?.[0])} />
        <Icon name={value ? "file" : "upload"} className="size-5 text-accent" />
        {reading ? (
          <>
            <span className="font-semibold">{reading}</span>
            <span className="text-xs text-ink-muted" role="status">
              Reading it…
            </span>
          </>
        ) : value ? (
          <>
            <span className="max-w-full break-words font-semibold">{name}</span>
            <span className="text-xs text-ink-muted" role="status">
              {describeSource(value)} · click to change
            </span>
          </>
        ) : (
          <>
            <span className="font-semibold">{label}</span>
            <span className="text-xs text-ink-muted">
              Word, PowerPoint, PDF or text{scorm ? ", or a SCORM package (.zip)" : ""}. Read on your computer: only the words are sent.
            </span>
          </>
        )}
      </label>
      {value && !reading && (
        <button type="button" className={cx(btn.quiet, "mt-1")} onClick={() => onChange(null)} disabled={disabled}>
          <Icon name="close" className="size-4" /> Remove the document
        </button>
      )}
      {error && (
        <div className="mt-2">
          <ErrorNote text={error} />
        </div>
      )}
    </div>
  );
}
