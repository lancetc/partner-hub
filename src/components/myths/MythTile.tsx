"use client";

import { useRef, useState } from "react";
import { api } from "@/lib/api";
import { cx } from "@/lib/format";
import { CATEGORIES, NOT_SENT, placeholdersIn, SOURCE_TYPES, TILE_NOTICE, type MythEvent } from "@/lib/myths";
import type { ReaderTile } from "@/server/myths";
import { Icon } from "../Icon";

/*
  One Myth vs Reality tile (docs/myth-vs-reality.md), shared by the Magazine block and the Resources page.

  The front is a button ("You might hear" and the question) with its expanded state announced. Opening it shows
  the back instead of the front, never both: the answer, the exception, what to check for this person and the
  exact source, all together, so the caveat is never behind another click. A short turn plays unless reduced
  motion is on; it's decorative. "Send to Client" opens a preview of the approved email to edit locally and copy.
  The Hub never sends it, and says so. A tile under review can't be copied.
*/

export type TileMode = "learning" | "quick";
const secondary =
  "inline-flex min-h-11 items-center justify-center gap-2 rounded-full border border-line-strong bg-surface px-4 font-semibold hover:bg-muted disabled:cursor-not-allowed disabled:opacity-60";
const primary =
  "inline-flex min-h-11 items-center justify-center gap-2 rounded-full bg-action px-5 font-semibold text-on-action hover:opacity-90 disabled:cursor-not-allowed disabled:opacity-60";
const warn = "rounded-2xl bg-[#fff1cc] p-3 text-sm text-[#4a3400] dark:bg-[#3d2f08] dark:text-[#ffd97a]";
const showDate = (d: string) =>
  /^\d{4}-\d{2}-\d{2}$/.test(d)
    ? new Intl.DateTimeFormat("en-AU", { day: "numeric", month: "short", year: "numeric", timeZone: "UTC" }).format(new Date(`${d}T00:00:00Z`))
    : "";

export function MythTile({
  tile: t,
  mode,
  practice,
  showCopy,
  guideId,
  preview,
  onOpened,
}: {
  tile: ReaderTile & { preview?: boolean };
  mode: TileMode;
  practice: boolean;
  showCopy: boolean;
  guideId?: string;
  /** The editor's preview: nothing is recorded. */
  preview?: boolean;
  onOpened?: (tileId: string) => void;
}) {
  const [open, setOpen] = useState(false);
  const front = useRef<HTMLButtonElement>(null);
  const back = useRef<HTMLHeadingElement>(null);
  const d = t.data;
  const log = (event: MythEvent) => {
    if (!preview && !t.preview) api("/api/myths", { body: { action: "event", event, tileId: t.id, version: t.version, guideId } }).catch(() => undefined);
  };
  const turn = (to: boolean) => {
    setOpen(to);
    if (to) {
      log("opened");
      onOpened?.(t.id);
    }
    requestAnimationFrame(() => (to ? back.current : front.current)?.focus());
  };

  if (!open)
    return (
      <button
        ref={front}
        type="button"
        aria-expanded={false}
        onClick={() => turn(true)}
        className="group flex h-full min-h-48 w-full flex-col rounded-3xl bg-surface p-5 text-left shadow-sm ring-1 ring-line transition hover:shadow-md hover:ring-action sm:p-6"
      >
        <span className="flex items-center justify-between gap-2">
          <span className="rounded-full bg-tealtint px-3 py-1 text-xs font-extrabold uppercase tracking-[0.1em] text-accent">{CATEGORIES[d.category]}</span>
          {t.state === "under-review" && <span className="text-xs font-semibold text-ink-muted">Under review</span>}
          {t.preview && <span className="text-xs font-semibold text-ink-muted">Draft</span>}
        </span>
        <span className="mt-3 text-sm font-semibold text-ink-muted">You might hear</span>
        <span className="mt-1 flex gap-2 font-serif text-xl font-semibold leading-snug">
          <span aria-hidden className="font-serif text-4xl leading-none text-accent">
            “
          </span>
          <span>{d.quote.replace(/^[“"]|[”"]$/g, "")}</span>
        </span>
        <span className="mt-auto inline-flex items-center gap-1 pt-4 text-sm font-semibold text-accent">
          <span className="sm:hidden">Open answer</span>
          <span className="hidden sm:inline">Flip for a clear answer</span>
          <Icon name="arrow-right" className="size-4 transition-transform group-hover:translate-x-1" />
        </span>
      </button>
    );

  return (
    <article aria-labelledby={`tile-${t.id}`} className="animate-tile-turn flex h-full flex-col rounded-3xl bg-surface p-5 shadow-md ring-2 ring-action sm:p-6">
      <div className="flex items-start justify-between gap-2">
        <p className="text-sm text-ink-muted">
          <span className="font-semibold">You might hear:</span> “{d.quote.replace(/^[“"]|[”"]$/g, "")}”
        </p>
        <button type="button" className="shrink-0 rounded-full p-2 hover:bg-muted" aria-label="Close this answer" aria-expanded onClick={() => turn(false)}>
          <Icon name="close" className="size-5" />
        </button>
      </div>
      {t.preview && <p className={cx(warn, "mt-2")}>Draft, not approved: learners don’t see this, and nothing can be copied.</p>}
      {t.state === "under-review" && !t.preview && (
        <p className={cx(warn, "mt-2")}>Under review: this answer is being checked. Its email can’t be copied until it’s approved again.</p>
      )}
      <h4 id={`tile-${t.id}`} ref={back} tabIndex={-1} className="mt-3 font-serif text-lg font-semibold outline-none">
        Here’s how it works
      </h4>
      <p className="mt-1">{d.answer}</p>
      {d.exception && (
        <div className="mt-3 rounded-2xl bg-muted p-3">
          <p className="text-sm font-semibold">Important exception</p>
          <p className="mt-0.5">{d.exception}</p>
        </div>
      )}
      <div className="mt-3">
        <p className="text-sm font-semibold">Check for this person</p>
        <ul className="mt-1 list-disc pl-5">
          {d.checks.filter(Boolean).map((c) => (
            <li key={c}>{c}</li>
          ))}
        </ul>
      </div>
      {d.familyWording && (
        <details className="mt-3">
          <summary className="cursor-pointer text-sm font-semibold">If a family member asks</summary>
          <p className="mt-1">{d.familyWording}</p>
        </details>
      )}
      <div className="mt-3">
        <p className="text-sm font-semibold">Source</p>
        <ul className="mt-1 flex flex-col gap-1 text-sm">
          {d.anchors.map((a, i) => (
            <li key={i}>
              {a.url ? (
                <a href={a.url} target="_blank" rel="noreferrer" className="font-semibold underline" onClick={() => log("source")}>
                  {a.document}
                </a>
              ) : (
                <span className="font-semibold">{a.document}</span>
              )}
              {a.section && <> → {a.section}</>}
              <span className="block text-ink-muted">
                {[SOURCE_TYPES[a.type], a.publisher, a.internalId && `Policy ${a.internalId}`, a.verifiedOn && `checked ${showDate(a.verifiedOn)}`]
                  .filter(Boolean)
                  .join(" · ")}
                {a.url && <span className="sr-only"> (opens in a new tab)</span>}
              </span>
            </li>
          ))}
        </ul>
        {d.reviewDue && (
          <p className="mt-1 text-xs text-ink-muted">
            Next review {showDate(d.reviewDue)} · version {t.version}
          </p>
        )}
      </div>
      <p className="mt-3 text-xs text-ink-muted">{TILE_NOTICE}</p>

      {showCopy && <Reply t={t} mode={mode} practice={practice} log={log} />}
      <Flags t={t} disabled={Boolean(preview || t.preview)} />
    </article>
  );
}

/** "How would you say it?" (optional, learning mode), then "Send to Client": an editable preview to copy. */
function Reply({ t, mode, practice, log }: { t: ReaderTile & { preview?: boolean }; mode: TileMode; practice: boolean; log: (e: MythEvent) => void }) {
  const [stage, setStage] = useState<"closed" | "practice" | "preview">("closed");
  const [said, setSaid] = useState("");
  const [subject, setSubject] = useState(t.data.message.subject);
  const [body, setBody] = useState(t.data.message.body);
  const [copy, setCopy] = useState<"" | "copied" | "failed">("");
  const panel = useRef<HTMLHeadingElement>(null);
  const fallback = useRef<HTMLTextAreaElement>(null);
  const practiceBox = useRef<HTMLTextAreaElement>(null);
  const text = `Subject: ${subject}\n\n${body}`;
  const left = placeholdersIn(`${subject}\n${body}`);
  const blocked = !t.copyable || Boolean(t.preview);
  const show = (s: typeof stage) => {
    setStage(s);
    // Practice goes straight to the box to type in; the preview starts at its heading.
    requestAnimationFrame(() => (s === "practice" ? practiceBox.current : panel.current)?.focus());
  };
  const doCopy = async () => {
    try {
      if (!navigator.clipboard) throw new Error("no clipboard");
      await navigator.clipboard.writeText(text);
      setCopy("copied");
      log("copied");
    } catch {
      setCopy("failed");
      log("copy-failed");
      requestAnimationFrame(() => fallback.current?.select());
    }
  };

  if (stage === "closed")
    return (
      <div className="mt-4 flex flex-wrap gap-2 border-t border-line pt-4">
        {mode === "learning" && practice ? (
          <button type="button" className={secondary} onClick={() => show("practice")}>
            <Icon name="mic" className="size-4" /> How would you say it?
          </button>
        ) : null}
        <button type="button" className={secondary} onClick={() => show("preview")}>
          <Icon name="mail" className="size-4" /> Send to Client
        </button>
      </div>
    );

  if (stage === "practice")
    return (
      <div className="mt-4 border-t border-line pt-4">
        <h5 ref={panel} tabIndex={-1} className="font-semibold outline-none">
          How would you say it?
        </h5>
        <label className="mt-1 flex flex-col gap-1">
          <span className="text-sm text-ink-muted">One sentence, in your own words. It isn’t saved.</span>
          <textarea
            ref={practiceBox}
            className="min-h-20 rounded-xl border border-line-strong bg-bg px-3 py-2"
            maxLength={300}
            value={said}
            onChange={(e) => setSaid(e.target.value)}
          />
        </label>
        <div className="mt-2 flex flex-wrap gap-2">
          <button
            type="button"
            className={primary}
            onClick={() => {
              if (said.trim()) log("practice");
              show("preview");
            }}
          >
            {said.trim() ? "Compare with the approved reply" : "Skip to the approved reply"}
          </button>
        </div>
      </div>
    );

  return (
    <div className="mt-4 border-t border-line pt-4">
      <h5 ref={panel} tabIndex={-1} className="font-semibold outline-none">
        Send to Client: review before you copy
      </h5>
      {said.trim() && (
        <p className="mt-1 rounded-xl bg-muted p-2 text-sm">
          <span className="font-semibold">You said:</span> {said}
        </p>
      )}
      {blocked ? (
        <p className={cx(warn, "mt-2")}>
          {t.preview ? "This is a draft, so it can’t be copied." : "This tile is under review, so its email can’t be copied until it’s approved again."}
        </p>
      ) : (
        <>
          <div className="mt-2 rounded-xl bg-muted p-3 text-sm">
            <p className="font-semibold">Before you use it, check for this person:</p>
            <ul className="mt-1 list-disc pl-5">
              {t.data.checks.filter(Boolean).map((c) => (
                <li key={c}>{c}</li>
              ))}
            </ul>
            {t.data.copyNote && <p className="mt-1">{t.data.copyNote}</p>}
          </div>
          <label className="mt-3 flex flex-col gap-1">
            <span className="text-sm font-semibold">Subject</span>
            <input className="min-h-11 rounded-xl border border-line-strong bg-bg px-3" value={subject} onChange={(e) => setSubject(e.target.value)} />
          </label>
          <label className="mt-2 flex flex-col gap-1">
            <span className="text-sm font-semibold">Email</span>
            <span className="text-xs text-ink-muted">Edits stay on this page only. Nothing is saved or sent.</span>
            <textarea
              className="min-h-56 rounded-xl border border-line-strong bg-bg px-3 py-2 leading-relaxed"
              value={body}
              onChange={(e) => setBody(e.target.value)}
            />
          </label>
          {left.length > 0 && <p className={cx(warn, "mt-2")}>Replace {left.join(" and ")} before you use this outside the Hub.</p>}
          <div className="mt-3 flex flex-wrap items-center gap-3">
            <button type="button" className={primary} onClick={() => void doCopy()}>
              <Icon name="copy" className="size-4" /> Copy email text
            </button>
            <span role="status" className="text-sm font-semibold">
              {copy === "copied" ? `${NOT_SENT}. Paste it into your email to send it yourself.` : ""}
            </span>
          </div>
          {copy === "failed" && (
            <div className="mt-3">
              <p className={warn}>Copying didn’t work here. Select the text below and copy it yourself, or try again.</p>
              <textarea
                ref={fallback}
                readOnly
                aria-label="Email text to copy"
                className="mt-2 min-h-40 w-full rounded-xl border border-line-strong bg-bg px-3 py-2"
                value={text}
              />
              <button type="button" className={cx(secondary, "mt-2")} onClick={() => void doCopy()}>
                <Icon name="refresh" className="size-4" /> Try again
              </button>
            </div>
          )}
        </>
      )}
      <button type="button" className={cx(secondary, "mt-3")} onClick={() => setStage("closed")}>
        Close the preview
      </button>
    </div>
  );
}

/** "Useful", or "Wording looks out of date" with a note for the library's review queue. */
function Flags({ t, disabled }: { t: ReaderTile; disabled: boolean }) {
  const [useful, setUseful] = useState(false);
  const [outdated, setOutdated] = useState<"" | "writing" | "sent">("");
  const [note, setNote] = useState("");
  const [problem, setProblem] = useState("");
  const send = (kind: "useful" | "outdated") =>
    api("/api/myths", { body: { action: "flag", kind, tileId: t.id, version: t.version, note } })
      .then(() => (kind === "useful" ? setUseful(true) : setOutdated("sent")))
      .catch((e: Error) => setProblem(e.message));
  if (disabled) return null;
  return (
    <div className="mt-4 flex flex-col gap-2 border-t border-line pt-3 text-sm">
      <div className="flex flex-wrap items-center gap-2">
        <button type="button" className={cx(secondary, "min-h-10 px-3 text-sm")} disabled={useful} onClick={() => void send("useful")}>
          <Icon name="heart" className="size-4" /> {useful ? "Marked useful" : "Useful"}
        </button>
        {outdated === "" && (
          <button type="button" className={cx(secondary, "min-h-10 px-3 text-sm")} onClick={() => setOutdated("writing")}>
            <Icon name="flag" className="size-4" /> Wording looks out of date
          </button>
        )}
        {outdated === "sent" && <span role="status">Thanks: it’s with the content owner to check.</span>}
      </div>
      {outdated === "writing" && (
        <form
          className="flex flex-col gap-2"
          onSubmit={(e) => {
            e.preventDefault();
            void send("outdated");
          }}
        >
          <label className="flex flex-col gap-1">
            <span className="font-semibold">What looks out of date?</span>
            <textarea
              className="min-h-16 rounded-xl border border-line-strong bg-bg px-3 py-2"
              maxLength={600}
              value={note}
              onChange={(e) => setNote(e.target.value)}
            />
          </label>
          <div className="flex gap-2">
            <button type="submit" className={cx(primary, "min-h-10 text-sm")} disabled={note.trim().length < 5}>
              Send to the content owner
            </button>
            <button type="button" className={cx(secondary, "min-h-10 text-sm")} onClick={() => setOutdated("")}>
              Cancel
            </button>
          </div>
        </form>
      )}
      {problem && (
        <p role="alert" className={warn}>
          {problem}
        </p>
      )}
    </div>
  );
}
