"use client";

import { useEffect, useState } from "react";
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

/** The same list without SCORM packages: a news story is written from words only. */
const WORDS_TYPES = DOCUMENT_TYPES.split(",")
  .filter((t) => !t.includes("zip"))
  .join(",");

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
        <input
          type="file"
          accept={scorm ? DOCUMENT_TYPES : WORDS_TYPES}
          className="sr-only"
          disabled={disabled}
          onChange={(e) => void choose(e.target.files?.[0])}
        />
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

/** One of several documents dropped for AI to work from (the Magazine), read in the browser like DocumentDrop's. */
export type DroppedDocument = { key: string; name: string; read: DraftSource };

/**
  DocumentDrop for several documents at once (New Magazine): the same drop zone, with what was read listed under it.
  Each is read here in the browser as it's added; onReadingChange says how many are still being read.
*/
export function DocumentsDrop({
  value,
  onChange,
  onReadingChange,
  disabled,
  label = "Drop the documents here",
  className,
}: {
  value: DroppedDocument[];
  onChange: React.Dispatch<React.SetStateAction<DroppedDocument[]>>;
  onReadingChange?: (n: number) => void;
  disabled?: boolean;
  label?: string;
  className?: string;
}) {
  const [over, setOver] = useState(false);
  const [reading, setReading] = useState(0);
  const [error, setError] = useState<string | null>(null);
  useEffect(() => onReadingChange?.(reading), [reading, onReadingChange]);

  function add(list: FileList | null | undefined) {
    // Copied now: the input is cleared straight after, which empties its live FileList.
    const files = Array.from(list ?? []).filter((f) => !value.some((x) => x.key === f.name + f.size));
    setError(null);
    for (const f of files) {
      if (!/\.(docx|pptx|pdf|txt|md|zip|doc|ppt)$/i.test(f.name)) {
        setError(`${f.name}: drop a Word (.docx), PowerPoint (.pptx), PDF, text file or SCORM package (.zip).`);
        continue;
      }
      setReading((n) => n + 1);
      readDraftSource(f)
        .then((read) => onChange((d) => (d.some((x) => x.key === f.name + f.size) ? d : [...d, { key: f.name + f.size, name: f.name, read }])))
        .catch((e: Error) => setError(`${f.name}: ${e.message || "it couldn’t be read."}`))
        .finally(() => setReading((n) => n - 1));
    }
  }

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
          add(e.dataTransfer.files);
        }}
        className={cx(
          "flex min-h-32 cursor-pointer flex-col items-center justify-center gap-1.5 rounded-2xl border-2 border-dashed p-4 text-center text-sm has-[:focus-visible]:outline-2",
          over ? "border-[#007f7e] bg-[#e6f3f1]" : "border-line-strong hover:border-action",
          disabled && "pointer-events-none opacity-60",
        )}
      >
        <input
          type="file"
          multiple
          accept={DOCUMENT_TYPES}
          className="sr-only"
          disabled={disabled}
          onChange={(e) => {
            add(e.target.files);
            e.target.value = "";
          }}
        />
        <Icon name="upload" className="size-5 text-accent" />
        <span className="font-semibold">{value.length ? "Drop more documents, or click to add them" : label}</span>
        <span className="text-xs text-ink-muted">
          Word, PowerPoint, PDF or text, or a SCORM package (.zip). Read on your computer: only the words are sent.
        </span>
        {reading > 0 && (
          <span className="text-xs text-ink-muted" role="status">
            Reading {reading === 1 ? "a document" : `${reading} documents`}…
          </span>
        )}
      </label>
      {value.length > 0 && (
        <ul className="mt-2 flex flex-col gap-1.5">
          {value.map((f) => (
            <li key={f.key} className="flex items-center gap-2 rounded-xl bg-surface px-3 py-2 text-sm">
              <Icon name="file" className="size-4 shrink-0 text-accent" />
              <span className="min-w-0 flex-1 truncate font-semibold">{f.name}</span>
              <span className="shrink-0 text-xs text-ink-muted">{describeSource(f.read)}</span>
              <button
                type="button"
                className="shrink-0 rounded-full p-1 text-ink-muted hover:bg-muted hover:text-danger"
                aria-label={`Remove ${f.name}`}
                disabled={disabled}
                onClick={() => onChange((d) => d.filter((x) => x.key !== f.key))}
              >
                <Icon name="close" className="size-4" />
              </button>
            </li>
          ))}
        </ul>
      )}
      {error && (
        <div className="mt-2">
          <ErrorNote text={error} />
        </div>
      )}
    </div>
  );
}
