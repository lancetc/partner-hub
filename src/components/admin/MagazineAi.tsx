"use client";

import { useEffect, useRef, useState } from "react";
import { api, useApi } from "@/lib/api";
import { cx } from "@/lib/format";
import { BLOCK_LABELS, PAGE_TEMPLATES, SOURCE_FILE_TYPES, WHY_FIELDS, type BlockType, type BlockWhy, type Page, type PageTemplate } from "@/lib/magazine";
import { AI_MODES, CATALOGUE, catalogueEntry } from "@/lib/activityCatalogue";
import { btn, ErrorNote, Field, input } from "./ui";
import { readEvents } from "./BuildProgress";
import { Icon } from "../Icon";

/*
  Draft with AI, in the course outline: upload the source documents, say what learners should be able to
  do and how long the whole course should take, and Claude proposes an outline (pages, purpose, teaching
  pattern, time, interaction, sources, what's missing). Edit it, then generate pages one at a time or
  all together. Each generated page is added to the course as one change you can undo; a page that
  fails can be tried again on its own, and nothing you've written is touched.
*/

type Source = {
  id: string;
  name: string;
  kind: "pdf" | "text";
  pages: number | null;
  slides: number | null;
  words: number | null;
  authority: "authoritative" | "background";
  status: "ready" | "error";
  error: string | null;
};
type OutlinePage = {
  title: string;
  purpose: string;
  template: PageTemplate;
  minutes: number;
  required: boolean;
  interaction: string;
  sources: string[];
  missing: string[];
  activities?: Planned[];
};
/** A recommended activity in the outline (server/magazineDraft PlannedActivity). */
type Planned = { type: BlockType; mode: "configurable" | "recommend"; decision: "suggested" | "accepted" | "rejected"; why: BlockWhy };
type Specialist = { type: BlockType; label: string; why: BlockWhy; signoff: string };
type Plan = { sources: Source[]; brief: string; minutes: number | null; outline: OutlinePage[] | null; questions: string[] };
type Event =
  | { type: "phase"; phase: "reading" | "writing" | "checking" | "fixing"; issues?: number }
  | { type: "count"; what: string; n: number }
  | { type: "error"; error: string }
  | ({ type: "done" } & Record<string, unknown>);
type Job = { state: "idle" } | { state: "running"; text: string } | { state: "done"; specialist?: Specialist[] } | { state: "failed"; error: string };

/** What the author can swap a recommendation for: every activity the catalogue lets the Magazine builder use. */
const SWAPPABLE = CATALOGUE.filter((e) => e.builder === "magazine" && (e.ai.mode === "configurable" || e.ai.mode === "recommend"));

const TIMES = [10, 20, 30, 45, 60];
const TEMPLATES = (Object.keys(PAGE_TEMPLATES) as PageTemplate[]).filter((t) => t !== "blank");

const sizeOf = (s: Source) =>
  s.status === "error"
    ? null
    : s.pages
      ? `${s.pages} ${s.pages === 1 ? "page" : "pages"}`
      : s.slides
        ? `${s.slides} slides`
        : s.words
          ? `${s.words.toLocaleString("en-AU")} words`
          : null;

const phaseText = (e: Extract<Event, { type: "phase" }>, what: string) =>
  e.phase === "reading"
    ? "Reading the documents…"
    : e.phase === "writing"
      ? `Writing the ${what}…`
      : e.phase === "checking"
        ? "Checking it against the rules…"
        : `Fixing ${e.issues ?? "a few"} ${e.issues === 1 ? "problem" : "problems"}…`;

/** Posts to a streamed draft route, reporting progress; resolves with the "done" event's result. */
export async function stream<T>(url: string, payload: unknown, onProgress: (text: string) => void, what: string): Promise<T> {
  const res = await fetch(url, { method: "POST", headers: { "content-type": "application/json" }, body: JSON.stringify(payload) });
  if (!res.ok || !res.headers.get("content-type")?.includes("ndjson")) {
    const data = await res.json().catch(() => ({}));
    throw new Error((data as { error?: string }).error ?? "Claude couldn’t draft that. Try again.");
  }
  let result: T | null = null;
  let failure: string | null = null;
  await readEvents<Event>(res, (e) => {
    if (e.type === "phase") onProgress(phaseText(e, what));
    else if (e.type === "count" && e.n > 0)
      onProgress(`Writing the ${what}: ${e.n} ${e.what === "pages" ? (e.n === 1 ? "page" : "pages") : e.n === 1 ? "section" : "sections"} so far…`);
    else if (e.type === "error") failure = e.error;
    else if (e.type === "done") result = e as unknown as T;
  });
  if (failure) throw new Error(failure);
  if (!result) throw new Error("The draft stopped before it finished. Try again.");
  return result;
}

export function MagazineAi({ guideId, onAddPage, startOpen }: { guideId: string; onAddPage: (page: Page) => void; startOpen: boolean }) {
  const { data, error } = useApi<Plan>(`/api/admin/magazine/${guideId}/ai`);
  return (
    <details open={startOpen} className="group rounded-2xl border-2 border-action/40 bg-tealtint">
      <summary className="flex min-h-14 cursor-pointer list-none items-center gap-3 px-4 sm:px-5">
        <Icon name="spark" className="size-5 text-accent" />
        <span className="flex-1">
          <span className="block font-serif text-xl font-semibold">Draft with AI</span>
          <span className="block text-sm text-ink-muted">Upload documents, set the time, review an outline, then generate pages.</span>
        </span>
        <Icon name="chevron-down" className="size-5 transition-transform group-open:rotate-180" />
      </summary>
      <div className="border-t border-line px-4 py-5 sm:px-5">
        {error && <ErrorNote text={error} />}
        {!data && !error && <p className="text-ink-muted">Loading…</p>}
        {data && <Drafter guideId={guideId} initial={data} onAddPage={onAddPage} />}
      </div>
    </details>
  );
}

function Drafter({ guideId, initial, onAddPage }: { guideId: string; initial: Plan; onAddPage: (page: Page) => void }) {
  const base = `/api/admin/magazine/${guideId}/ai`;
  const [sources, setSources] = useState(initial.sources);
  const [brief, setBrief] = useState(initial.brief);
  const [minutes, setMinutes] = useState<number | null>(initial.minutes);
  const [outline, setOutline] = useState<OutlinePage[] | null>(initial.outline);
  const [questions, setQuestions] = useState(initial.questions);
  const [uploading, setUploading] = useState(0);
  const [problem, setProblem] = useState<string | null>(null);
  const [outlineJob, setOutlineJob] = useState<Job>({ state: "idle" });
  const [jobs, setJobs] = useState<Record<number, Job>>({});
  const [running, setRunning] = useState(false);
  const fileInput = useRef<HTMLInputElement>(null);
  const loaded = useRef(true);

  // The brief, time and outline save as you change them (so a failed draft never loses them).
  useEffect(() => {
    if (loaded.current) {
      loaded.current = false;
      return;
    }
    const t = setTimeout(() => {
      api(base, { method: "PUT", body: { brief, minutes, outline } }).catch((e: Error) => setProblem(e.message));
    }, 800);
    return () => clearTimeout(t);
  }, [base, brief, minutes, outline]);

  const upload = async (files: FileList | null) => {
    if (!files?.length) return;
    setProblem(null);
    for (const file of Array.from(files)) {
      setUploading((n) => n + 1);
      try {
        const form = new FormData();
        form.append("file", file);
        const res = await fetch(`${base}/sources`, { method: "POST", body: form });
        const out = await res.json().catch(() => ({}));
        if (!res.ok) throw new Error((out as { error?: string }).error ?? `${file.name} didn’t upload.`);
        setSources((s) => [...s, out as Source]);
      } catch (e) {
        setProblem(e instanceof Error ? e.message : "That didn’t upload.");
      } finally {
        setUploading((n) => n - 1);
      }
    }
    if (fileInput.current) fileInput.current.value = "";
  };
  const setAuthority = async (s: Source, authority: Source["authority"]) => {
    try {
      const out = await api<Source>(`${base}/sources/${s.id}`, { method: "PATCH", body: { authority } });
      setSources((list) => list.map((x) => (x.id === s.id ? out : x)));
    } catch (e) {
      setProblem(e instanceof Error ? e.message : "That didn’t save.");
    }
  };
  const remove = async (s: Source) => {
    try {
      await api(`${base}/sources/${s.id}`, { method: "DELETE" });
      setSources((list) => list.filter((x) => x.id !== s.id));
    } catch (e) {
      setProblem(e instanceof Error ? e.message : "That didn’t work.");
    }
  };

  const ready = sources.filter((s) => s.status === "ready");
  const propose = async () => {
    setOutlineJob({ state: "running", text: "Starting…" });
    try {
      const out = await stream<{ outline: OutlinePage[]; questions: string[] }>(
        `${base}/outline`,
        { brief, minutes },
        (text) => setOutlineJob({ state: "running", text }),
        "outline",
      );
      loaded.current = true; // Saved by the server already.
      setOutline(out.outline);
      setQuestions(out.questions);
      setJobs({});
      setOutlineJob({ state: "done" });
    } catch (e) {
      setOutlineJob({ state: "failed", error: e instanceof Error ? e.message : "That didn’t work." });
    }
  };

  const generate = async (index: number) => {
    setJobs((j) => ({ ...j, [index]: { state: "running", text: "Starting…" } }));
    try {
      const out = await stream<{ page: Page; specialist?: Specialist[] }>(
        `${base}/page`,
        { index },
        (text) => setJobs((j) => ({ ...j, [index]: { state: "running", text } })),
        "page",
      );
      onAddPage(out.page);
      setJobs((j) => ({ ...j, [index]: { state: "done", specialist: out.specialist ?? [] } }));
      return true;
    } catch (e) {
      setJobs((j) => ({ ...j, [index]: { state: "failed", error: e instanceof Error ? e.message : "That didn’t work." } }));
      return false;
    }
  };
  const generateAll = async () => {
    if (!outline) return;
    setRunning(true);
    // One page at a time, in order; a page that fails is left to retry, and the rest carry on.
    for (let i = 0; i < outline.length; i++) if (jobs[i]?.state !== "done") await generate(i);
    setRunning(false);
  };

  const editPage = (i: number, patch: Partial<OutlinePage>) => setOutline((o) => o && o.map((p, j) => (j === i ? { ...p, ...patch } : p)));
  const movePage = (i: number, dir: -1 | 1) =>
    setOutline((o) => {
      if (!o || i + dir < 0 || i + dir >= o.length) return o;
      const next = [...o];
      [next[i], next[i + dir]] = [next[i + dir], next[i]];
      return next;
    });
  const total = outline?.reduce((n, p) => n + p.minutes, 0) ?? 0;
  const busy = outlineJob.state === "running" || running || Object.values(jobs).some((j) => j.state === "running");

  return (
    <div className="flex flex-col gap-6">
      {/* 1. Documents */}
      <section aria-labelledby="ai-docs" className="flex flex-col gap-3">
        <h3 id="ai-docs" className="font-semibold">
          1. Source documents
        </h3>
        <p className="text-sm text-ink-muted">
          PDF, Word, PowerPoint or text, up to 15 MB each, or an eLearning course as a SCORM package (.zip, up to 200 MB) to read its words from. Mark approved
          guidance as authoritative; anything else as background, so Claude doesn’t rest a claim on it alone. Learners never see these files.
        </p>
        <label
          onDragOver={(e) => e.preventDefault()}
          onDrop={(e) => {
            e.preventDefault();
            void upload(e.dataTransfer.files);
          }}
          className="flex cursor-pointer flex-col items-center gap-1 rounded-2xl border-2 border-dashed border-line-strong p-5 text-center hover:bg-muted"
        >
          <Icon name="upload" className="size-6 text-accent" />
          <span className="font-semibold">{uploading ? "Reading…" : "Upload documents"}</span>
          <span className="text-sm text-ink-muted">Drag files here or choose them</span>
          <input
            ref={fileInput}
            type="file"
            multiple
            accept={SOURCE_FILE_TYPES}
            className="sr-only"
            disabled={busy}
            onChange={(e) => void upload(e.target.files)}
          />
        </label>
        {sources.length > 0 && (
          <ul className="flex flex-col divide-y divide-line rounded-2xl border border-line">
            {sources.map((s) => (
              <li key={s.id} className="flex flex-wrap items-center gap-3 p-3">
                <Icon name={s.status === "error" ? "alert" : "file"} className={cx("size-5 shrink-0", s.status === "error" ? "text-danger" : "text-accent")} />
                <div className="min-w-0 flex-1">
                  <p className="truncate font-semibold">{s.name}</p>
                  {s.status === "error" ? (
                    <p className="text-sm text-danger">Couldn’t be read: {s.error} It isn’t used.</p>
                  ) : (
                    <p className="text-sm text-ink-muted">{[s.kind === "pdf" ? "PDF" : "Text", sizeOf(s)].filter(Boolean).join(" · ")}</p>
                  )}
                </div>
                {s.status === "ready" && (
                  <select
                    aria-label={`How Claude should treat ${s.name}`}
                    className="min-h-9 rounded-lg border border-line-strong bg-surface px-2 text-sm"
                    value={s.authority}
                    onChange={(e) => void setAuthority(s, e.target.value as Source["authority"])}
                    disabled={busy}
                  >
                    <option value="authoritative">Authoritative</option>
                    <option value="background">Background only</option>
                  </select>
                )}
                <button type="button" className={btn.quiet} onClick={() => void remove(s)} disabled={busy} aria-label={`Remove ${s.name}`}>
                  <Icon name="trash" className="size-4" /> Remove
                </button>
              </li>
            ))}
          </ul>
        )}
      </section>

      {/* 2. Brief and time */}
      <section aria-labelledby="ai-brief" className="flex flex-col gap-3">
        <h3 id="ai-brief" className="font-semibold">
          2. Brief and time
        </h3>
        <Field label="Brief" hint="What learners should be able to do, the situations they face, and anything Claude should know or avoid.">
          <textarea
            className={cx(input, "min-h-28 py-2")}
            value={brief}
            maxLength={4000}
            onChange={(e) => setBrief(e.target.value)}
            placeholder="Teach new coordinators to inspect a supplier invoice, spot missing detail and decide what to clarify before approval. Use the attached invoice guidance. Don’t invent rates or approval rules."
          />
        </Field>
        <fieldset>
          <legend className="text-sm font-semibold">Time to complete the whole course</legend>
          <div className="mt-2 flex flex-wrap items-center gap-2">
            {TIMES.map((t) => (
              <button
                key={t}
                type="button"
                aria-pressed={minutes === t}
                onClick={() => setMinutes(t)}
                className={cx(
                  "min-h-10 rounded-full px-4 text-sm font-semibold",
                  minutes === t ? "bg-action text-on-action" : "border border-line-strong hover:bg-muted",
                )}
              >
                {t} min
              </button>
            ))}
            <label className="flex items-center gap-2 text-sm">
              <span className="sr-only">Minutes</span>
              <input
                type="number"
                min={2}
                max={240}
                className={cx(input, "w-24")}
                value={minutes ?? ""}
                placeholder="Other"
                onChange={(e) => setMinutes(e.target.value ? Math.max(2, Math.min(240, Number(e.target.value))) : null)}
              />
              minutes
            </label>
          </div>
          <p className="mt-1 text-xs text-ink-muted">Claude plans the number of pages, and how much each holds, to fit this. A single short guide is fine.</p>
        </fieldset>
        <div className="flex flex-wrap items-center gap-3">
          <button type="button" className={btn.primary} onClick={() => void propose()} disabled={busy || (!brief.trim() && !ready.length)}>
            <Icon name="spark" className="size-4" /> {outline ? "Propose a new outline" : "Propose an outline"}
          </button>
          {outlineJob.state === "running" && (
            <p className="text-sm text-ink-muted" role="status">
              {outlineJob.text}
            </p>
          )}
          {outline && outlineJob.state !== "running" && (
            <p className="text-sm text-ink-muted">A new outline replaces this one. Pages already added stay as they are.</p>
          )}
        </div>
        {outlineJob.state === "failed" && <ErrorNote text={`${outlineJob.error} Your brief and documents are kept: try again.`} />}
      </section>

      {/* 3. Outline and pages */}
      {outline && (
        <section aria-labelledby="ai-outline" className="flex flex-col gap-3">
          <div className="flex flex-wrap items-end justify-between gap-2">
            <h3 id="ai-outline" className="font-semibold">
              3. Review the outline, then generate pages
            </h3>
            <p className={cx("text-sm", minutes && Math.abs(total - minutes) > minutes * 0.25 ? "font-semibold text-danger" : "text-ink-muted")} role="status">
              Adds up to {total} min{minutes ? ` of about ${minutes}` : ""}
            </p>
          </div>
          {questions.length > 0 && (
            <div className="rounded-2xl bg-gold/15 p-4 text-sm">
              <p className="font-semibold">Claude would like to know</p>
              <ul className="mt-1 list-disc pl-5">
                {questions.map((q, i) => (
                  <li key={i}>{q}</li>
                ))}
              </ul>
              <p className="mt-2 text-ink-muted">Add the answers to the brief and propose again, or edit the outline yourself.</p>
            </div>
          )}
          <ol className="flex flex-col gap-3">
            {outline.map((p, i) => {
              const job = jobs[i] ?? { state: "idle" };
              return (
                <li key={i} className="flex flex-col gap-3 rounded-2xl border border-line p-4">
                  <div className="flex flex-wrap items-start gap-3">
                    <span className="grid size-8 shrink-0 place-items-center rounded-full bg-tealtint font-mulish text-sm font-extrabold" aria-hidden>
                      {i + 1}
                    </span>
                    <div className="flex min-w-0 flex-1 flex-col gap-2">
                      <input
                        aria-label={`Page ${i + 1} title`}
                        className={cx(input, "font-semibold")}
                        value={p.title}
                        onChange={(e) => editPage(i, { title: e.target.value })}
                      />
                      <textarea
                        aria-label={`Page ${i + 1} purpose`}
                        className={cx(input, "min-h-16 py-2")}
                        value={p.purpose}
                        onChange={(e) => editPage(i, { purpose: e.target.value })}
                      />
                      <div className="flex flex-wrap items-center gap-x-4 gap-y-2 text-sm">
                        <label className="flex items-center gap-1.5">
                          Pattern
                          <select
                            className="min-h-9 rounded-lg border border-line-strong bg-surface px-2"
                            value={p.template}
                            onChange={(e) => editPage(i, { template: e.target.value as PageTemplate })}
                          >
                            {TEMPLATES.map((t) => (
                              <option key={t} value={t}>
                                {PAGE_TEMPLATES[t].label}: {PAGE_TEMPLATES[t].title}
                              </option>
                            ))}
                          </select>
                        </label>
                        <label className="flex items-center gap-1.5">
                          <input
                            type="number"
                            min={1}
                            max={60}
                            className="min-h-9 w-16 rounded-lg border border-line-strong bg-surface px-2"
                            value={p.minutes}
                            onChange={(e) => editPage(i, { minutes: Math.max(1, Math.min(60, Number(e.target.value) || 1)) })}
                          />
                          min
                        </label>
                        <label className="flex items-center gap-1.5">
                          <input
                            type="checkbox"
                            className="size-4 accent-[var(--color-action)]"
                            checked={p.required}
                            onChange={(e) => editPage(i, { required: e.target.checked })}
                          />
                          Required
                        </label>
                      </div>
                      <input
                        aria-label={`Page ${i + 1} interaction`}
                        className={input}
                        placeholder="Interaction (optional): the practice on this page"
                        value={p.interaction}
                        onChange={(e) => editPage(i, { interaction: e.target.value })}
                      />
                      {p.sources.length > 0 && <p className="text-xs text-ink-muted">Uses: {p.sources.join(", ")}</p>}
                      {p.missing.length > 0 && (
                        <p className="text-xs text-[#8a5a00] dark:text-[#ffd48a]">
                          <Icon name="alert" className="mr-1 inline size-3.5 align-[-2px]" />
                          Missing from the documents: {p.missing.join("; ")}
                        </p>
                      )}
                      <ActivityPlan page={i + 1} activities={p.activities ?? []} disabled={busy} onChange={(activities) => editPage(i, { activities })} />
                      {job.state === "done" && (job.specialist ?? []).length > 0 && (
                        <div className="rounded-xl bg-gold/15 p-3 text-sm">
                          <p className="font-semibold">Specialist setup still to do on this page</p>
                          <ul className="mt-1 list-disc pl-5">
                            {job.specialist!.map((s) => (
                              <li key={s.type}>
                                Add the <span className="font-semibold">{s.label}</span> from Add block, then set it up from its reviewed case.
                                {s.signoff ? ` Sign-off: ${s.signoff}.` : ""}
                              </li>
                            ))}
                          </ul>
                        </div>
                      )}
                    </div>
                    <div className="flex shrink-0 items-center gap-0.5">
                      <button
                        type="button"
                        aria-label={`Move page ${i + 1} up`}
                        className="grid size-9 place-items-center rounded-full hover:bg-muted disabled:opacity-30"
                        onClick={() => movePage(i, -1)}
                        disabled={busy || i === 0}
                      >
                        <Icon name="arrow-left" className="size-4 rotate-90" />
                      </button>
                      <button
                        type="button"
                        aria-label={`Move page ${i + 1} down`}
                        className="grid size-9 place-items-center rounded-full hover:bg-muted disabled:opacity-30"
                        onClick={() => movePage(i, 1)}
                        disabled={busy || i === outline.length - 1}
                      >
                        <Icon name="arrow-right" className="size-4 rotate-90" />
                      </button>
                      <button
                        type="button"
                        aria-label={`Remove page ${i + 1} from the outline`}
                        className="grid size-9 place-items-center rounded-full hover:bg-muted disabled:opacity-30"
                        onClick={() => setOutline((o) => o && o.filter((_, j) => j !== i))}
                        disabled={busy || outline.length <= 1}
                      >
                        <Icon name="trash" className="size-4" />
                      </button>
                    </div>
                  </div>
                  <div className="flex flex-wrap items-center gap-3 border-t border-line pt-3">
                    {job.state === "done" ? (
                      <p className="flex items-center gap-1.5 text-sm font-semibold text-[#0f5b3a] dark:text-[#8fe0b5]">
                        <Icon name="circle-check" className="size-4" /> Added to the course
                      </p>
                    ) : (
                      <button type="button" className={btn.secondary} onClick={() => void generate(i)} disabled={busy || !p.title.trim()}>
                        <Icon name="spark" className="size-4" /> {job.state === "failed" ? "Try this page again" : "Generate page"}
                      </button>
                    )}
                    {job.state === "running" && (
                      <p className="text-sm text-ink-muted" role="status">
                        {job.text}
                      </p>
                    )}
                    {job.state === "failed" && <p className="text-sm font-semibold text-danger">{job.error}</p>}
                    {job.state === "done" && (
                      <button type="button" className={btn.quiet} onClick={() => void generate(i)} disabled={busy}>
                        Generate another version
                      </button>
                    )}
                  </div>
                </li>
              );
            })}
          </ol>
          <div className="flex flex-wrap items-center gap-3">
            <button
              type="button"
              className={btn.secondary}
              onClick={() =>
                setOutline((o) => [
                  ...(o ?? []),
                  { title: "New page", purpose: "", template: "do", minutes: 5, required: true, interaction: "", sources: [], missing: [] },
                ])
              }
              disabled={busy || outline.length >= 10}
            >
              <Icon name="plus" className="size-4" /> Add a page to the outline
            </button>
            <button type="button" className={btn.primary} onClick={() => void generateAll()} disabled={busy}>
              <Icon name="spark" className="size-4" /> {Object.values(jobs).some((j) => j.state === "done") ? "Generate the rest" : "Generate all pages"}
            </button>
          </div>
          <p className="text-xs text-ink-muted">
            Each page is added to the course as you’d write it: check every claim against its source, fill in pictures, and clear the “Needs verification” flags
            before publishing. Undo removes a page you don’t want.
          </p>
        </section>
      )}
      {problem && <ErrorNote text={problem} />}
    </div>
  );
}

/**
  A page's recommended activities, as the build plan the author reviews: each with “Why this block?” (the behaviour,
  evidence, the option considered instead, what the learner does and what's measured, the review owner and source).
  The author accepts or rejects each, edits the reasons, swaps it for another catalogue activity, reorders or removes
  it. A rejected one is never written into the page; a specialist one is added by hand after its reviewed setup.
*/
function ActivityPlan({ page, activities, disabled, onChange }: { page: number; activities: Planned[]; disabled: boolean; onChange: (a: Planned[]) => void }) {
  if (!activities.length) return null;
  const set = (i: number, patch: Partial<Planned>) => onChange(activities.map((a, j) => (j === i ? { ...a, ...patch } : a)));
  const move = (i: number, dir: -1 | 1) => {
    if (i + dir < 0 || i + dir >= activities.length) return;
    const next = [...activities];
    [next[i], next[i + dir]] = [next[i + dir], next[i]];
    onChange(next);
  };
  return (
    <div className="rounded-xl border border-line bg-surface p-3">
      <p className="text-sm font-semibold">Recommended activities</p>
      <p className="text-xs text-ink-muted">
        Chosen from the Activity Catalogue. Accept, change or reject each before generating; a rejected activity isn’t written.
      </p>
      <ol className="mt-2 flex flex-col gap-2">
        {activities.map((a, i) => {
          const e = catalogueEntry(a.type);
          return (
            <li key={`${a.type}-${i}`} className={cx("rounded-lg border border-line p-2", a.decision === "rejected" && "opacity-60")}>
              <div className="flex flex-wrap items-center gap-2 text-sm">
                <span className="font-semibold">{BLOCK_LABELS[a.type]}</span>
                <span className="rounded-full bg-muted px-2 py-0.5 text-xs">
                  {a.mode === "configurable" ? "AI writes a draft" : "Specialist setup required"}
                </span>
                <span className="text-xs text-ink-muted">{a.decision === "suggested" ? "Suggested" : a.decision === "accepted" ? "Accepted" : "Rejected"}</span>
                <span className="ml-auto flex items-center gap-1">
                  <button
                    type="button"
                    className={btn.quiet}
                    disabled={disabled}
                    aria-pressed={a.decision === "accepted"}
                    onClick={() => set(i, { decision: "accepted" })}
                  >
                    Accept
                  </button>
                  <button
                    type="button"
                    className={btn.quiet}
                    disabled={disabled}
                    aria-pressed={a.decision === "rejected"}
                    onClick={() => set(i, { decision: "rejected" })}
                  >
                    Reject
                  </button>
                  <button
                    type="button"
                    aria-label={`Move ${BLOCK_LABELS[a.type]} up on page ${page}`}
                    className="grid size-8 place-items-center rounded-full hover:bg-muted disabled:opacity-30"
                    disabled={disabled || i === 0}
                    onClick={() => move(i, -1)}
                  >
                    <Icon name="arrow-left" className="size-4 rotate-90" />
                  </button>
                  <button
                    type="button"
                    aria-label={`Move ${BLOCK_LABELS[a.type]} down on page ${page}`}
                    className="grid size-8 place-items-center rounded-full hover:bg-muted disabled:opacity-30"
                    disabled={disabled || i === activities.length - 1}
                    onClick={() => move(i, 1)}
                  >
                    <Icon name="arrow-right" className="size-4 rotate-90" />
                  </button>
                  <button
                    type="button"
                    aria-label={`Remove ${BLOCK_LABELS[a.type]} from page ${page}`}
                    className="grid size-8 place-items-center rounded-full hover:bg-muted disabled:opacity-30"
                    disabled={disabled}
                    onClick={() => onChange(activities.filter((_, j) => j !== i))}
                  >
                    <Icon name="trash" className="size-4" />
                  </button>
                </span>
              </div>
              {a.why.rationale && <p className="mt-1 text-sm">{a.why.rationale}</p>}
              <details className="mt-1 text-sm">
                <summary className="cursor-pointer font-semibold text-accent">Why this block?</summary>
                <div className="mt-2 flex flex-col gap-2">
                  <label className="flex flex-col gap-1">
                    <span className="text-xs font-semibold">Swap for another activity</span>
                    <select
                      className="min-h-9 rounded-lg border border-line-strong bg-surface px-2"
                      value={a.type}
                      disabled={disabled}
                      onChange={(ev) => {
                        const to = catalogueEntry(ev.target.value);
                        if (!to || to.ai.mode === "human" || to.ai.mode === "unavailable") return;
                        set(i, { type: to.id as BlockType, mode: to.ai.mode, decision: "accepted", why: { ...a.why, owner: to.signoff || a.why.owner } });
                      }}
                    >
                      {SWAPPABLE.map((s) => (
                        <option key={s.id} value={s.id}>
                          {s.name} ({AI_MODES[s.ai.mode].label})
                        </option>
                      ))}
                    </select>
                  </label>
                  {WHY_FIELDS.map(([k, label]) => (
                    <label key={k} className="flex flex-col gap-1">
                      <span className="text-xs font-semibold">{label}</span>
                      <textarea
                        className={cx(input, "min-h-10 py-1.5 text-sm")}
                        value={a.why[k] ?? ""}
                        disabled={disabled}
                        onChange={(ev) => set(i, { why: { ...a.why, [k]: ev.target.value } })}
                      />
                    </label>
                  ))}
                  {e && <p className="text-xs text-ink-muted">Catalogue: {e.ai.reason}</p>}
                </div>
              </details>
            </li>
          );
        })}
      </ol>
    </div>
  );
}
