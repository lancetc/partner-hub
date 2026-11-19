"use client";

import { useMemo, useState } from "react";
import { cx } from "@/lib/format";
import { BLOCK_LABELS, type Block, type GuideDoc, type Page } from "@/lib/magazine";
import { btn, ErrorNote, input } from "./ui";
import { stream } from "./MagazineAi";
import { Icon } from "../Icon";

/*
  Revise with AI, once a course is built: say what you'd like changed, for the whole course or one page,
  and Claude reviews the course as it stands now (with its documents and brief) and proposes changes,
  page by page, each with why. Every change is shown beside what's there now. Apply the ones you want
  (each is one change, so Undo reverses it) and skip the rest. Nothing changes until you apply it, and
  blocks Claude leaves alone stay exactly as they are.
*/

export type RevisionChange =
  | { kind: "edit"; pageId: string; why: string; page: Page }
  | { kind: "add"; after: string | null; why: string; page: Page }
  | { kind: "remove"; pageId: string; why: string };
type Revision = { summary: string; changes: RevisionChange[] };
type Job = { state: "idle" } | { state: "running"; text: string } | { state: "failed"; error: string };
type Proposal = Revision & { scope: string; doc: GuideDoc; status: ("open" | "applied" | "skipped")[] };

const EXAMPLES = [
  "Review it for accuracy against the source documents and fix anything that’s wrong or unsupported.",
  "Make it shorter and plainer: cut repetition and keep sentences short.",
  "Add a practice activity wherever a page only explains.",
  "Check the tone suits Care Partners new to aged care, and simplify jargon.",
  "Update it for the latest version of the policy in the documents.",
];

const plain = (s: string) =>
  s
    .replace(/\[([^\]]+)\]\([^)]*\)/g, "$1")
    .replace(/\[\[([^|\]]+)[^\]]*\]\]/g, "$1")
    .replace(/[*_#>`]/g, "")
    .replace(/\s+/g, " ")
    .trim();

/** A block in a line: what kind it is, and its heading or first words. */
function describe(b: Block) {
  const o = b as unknown as Record<string, unknown>;
  const first = ["heading", "title", "prompt", "question", "statement", "label", "person", "body", "text"]
    .map((k) => o[k])
    .find((v) => typeof v === "string" && v.trim());
  const words = plain(String(first ?? ""));
  return { label: BLOCK_LABELS[b.type], words: words.length > 110 ? `${words.slice(0, 107)}…` : words };
}

/** One side of the comparison: the page's sections and blocks, each marked kept, new or removed. */
function PageColumn({ page, other, side }: { page: Page; other: Page | null; side: "now" | "proposed" }) {
  const otherIds = new Set(other?.sections.flatMap((s) => s.blocks.map((b) => b.id)) ?? []);
  return (
    <div className="min-w-0 rounded-xl border border-line bg-surface p-3">
      <p className="font-mulish text-xs font-extrabold uppercase tracking-[0.12em] text-ink-muted">{side === "now" ? "Now" : "Proposed"}</p>
      <p className="mt-1 font-semibold">{page.title || "Untitled page"}</p>
      {page.purpose && <p className="text-sm text-ink-muted">{page.purpose}</p>}
      {page.sections.map((s) => (
        <div key={s.id} className="mt-3">
          <p className="text-sm font-semibold">{s.title || "Untitled section"}</p>
          <ul className="mt-1 flex flex-col gap-1">
            {s.blocks.map((b) => {
              const d = describe(b);
              const same = otherIds.has(b.id);
              const tag = !other ? null : same ? null : side === "now" ? "Removed or rewritten" : "New or rewritten";
              return (
                <li
                  key={b.id}
                  className={cx(
                    "rounded-lg px-2 py-1 text-sm",
                    same ? "text-ink-muted" : side === "now" ? "bg-danger/10" : "bg-[#0f5b3a]/10 dark:bg-[#8fe0b5]/15",
                  )}
                >
                  <span className="font-semibold">{d.label}</span>
                  {d.words && <span>: {d.words}</span>}
                  {same && <span className="ml-1 text-xs">(unchanged)</span>}
                  {tag && (
                    <span className={cx("ml-1 text-xs font-semibold", side === "now" ? "text-danger" : "text-[#0f5b3a] dark:text-[#8fe0b5]")}>({tag})</span>
                  )}
                </li>
              );
            })}
          </ul>
        </div>
      ))}
    </div>
  );
}

export function MagazineRevise({
  guideId,
  doc,
  scope: startScope,
  onApply,
  onShow,
}: {
  guideId: string;
  doc: GuideDoc;
  /** "course", or the id of the page being edited. */
  scope: string;
  onApply: (changes: RevisionChange[]) => void;
  onShow?: (pageId: string) => void;
}) {
  const content = doc.pages.filter((p) => p.kind === "content");
  const [scope, setScope] = useState(startScope);
  const [prompt, setPrompt] = useState("");
  const [job, setJob] = useState<Job>({ state: "idle" });
  const [proposal, setProposal] = useState<Proposal | null>(null);
  const titleOf = (id: string | null) => {
    const i = doc.pages.findIndex((p) => p.id === id);
    return i < 0 ? null : `page ${i + 1}, “${doc.pages[i].title || "Untitled"}”`;
  };

  const propose = async () => {
    setJob({ state: "running", text: "Starting…" });
    setProposal(null);
    try {
      const out = await stream<Revision>(
        `/api/admin/magazine/${guideId}/ai/revise`,
        { prompt, scope, doc },
        (text) => setJob({ state: "running", text }),
        "changes",
      );
      setProposal({ summary: out.summary, changes: out.changes, scope, doc: structuredClone(doc), status: out.changes.map(() => "open") });
      setJob({ state: "idle" });
    } catch (e) {
      setJob({ state: "failed", error: e instanceof Error ? e.message : "That didn’t work." });
    }
  };

  const mark = (indexes: number[], status: "applied" | "skipped") =>
    setProposal((p) => p && { ...p, status: p.status.map((s, i) => (indexes.includes(i) ? status : s)) });
  const apply = (indexes: number[]) => {
    if (!proposal) return;
    onApply(indexes.map((i) => proposal.changes[i]));
    mark(indexes, "applied");
  };
  const open = proposal ? proposal.status.flatMap((s, i) => (s === "open" ? [i] : [])) : [];
  // A page edited since Claude read it: applying the change replaces those edits.
  const changedSince = useMemo(() => {
    if (!proposal) return new Set<string>();
    const then = new Map(proposal.doc.pages.map((p) => [p.id, JSON.stringify(p)]));
    return new Set(doc.pages.filter((p) => then.has(p.id) && then.get(p.id) !== JSON.stringify(p)).map((p) => p.id));
  }, [proposal, doc]);
  const running = job.state === "running";

  return (
    <details className="group rounded-2xl border-2 border-action/40 bg-tealtint">
      <summary className="flex min-h-14 cursor-pointer list-none items-center gap-3 px-4 sm:px-5">
        <Icon name="spark" className="size-5 text-accent" />
        <span className="flex-1">
          <span className="block font-serif text-xl font-semibold">Revise with AI</span>
          <span className="block text-sm text-ink-muted">
            {startScope === "course" ? "Review and update the whole course, or one page, with a prompt." : "Review and update this page with a prompt."}
          </span>
        </span>
        <Icon name="chevron-down" className="size-5 transition-transform group-open:rotate-180" />
      </summary>
      <div className="flex flex-col gap-4 border-t border-line px-4 py-5 sm:px-5">
        <label className="flex flex-col gap-1 text-sm font-semibold">
          What to revise
          <select className={cx(input, "font-normal")} value={scope} onChange={(e) => setScope(e.target.value)} disabled={running}>
            <option value="course">
              The whole course ({content.length} {content.length === 1 ? "page" : "pages"})
            </option>
            {doc.pages.map((p, i) =>
              p.kind === "content" ? (
                <option key={p.id} value={p.id}>
                  Page {i + 1}: {p.title || "Untitled"}
                </option>
              ) : null,
            )}
          </select>
        </label>
        <label className="flex flex-col gap-1 text-sm font-semibold">
          What should change?
          <textarea
            className={cx(input, "min-h-28 py-2 font-normal")}
            value={prompt}
            maxLength={2000}
            onChange={(e) => setPrompt(e.target.value)}
            disabled={running}
            placeholder="Review this for accuracy against the documents, make it more practical for new contractors, and add a decision about late cancellations."
          />
        </label>
        <div className="flex flex-wrap gap-2" aria-label="Examples">
          {EXAMPLES.map((ex) => (
            <button
              key={ex}
              type="button"
              disabled={running}
              onClick={() => setPrompt((p) => (p.trim() ? `${p.trim()} ${ex}` : ex))}
              className="rounded-full border border-line-strong px-3 py-1 text-left text-xs hover:bg-muted"
            >
              {ex}
            </button>
          ))}
        </div>
        <div className="flex flex-wrap items-center gap-3">
          <button type="button" className={btn.primary} onClick={() => void propose()} disabled={running || !prompt.trim()}>
            <Icon name="spark" className="size-4" /> Review and propose changes
          </button>
          {running && (
            <p className="text-sm text-ink-muted" role="status">
              {job.text}
            </p>
          )}
        </div>
        <p className="text-xs text-ink-muted">
          Claude reads the course as it is now, with its source documents and brief. Nothing changes until you apply it, and Undo reverses anything you apply.
        </p>
        {job.state === "failed" && <ErrorNote text={job.error} />}

        {proposal && (
          <section aria-label="Proposed changes" className="flex flex-col gap-4 border-t border-line pt-4">
            <div className="rounded-2xl bg-tealtint p-4">
              <p className="font-semibold">Claude’s review</p>
              <p className="mt-1 text-sm">{proposal.summary}</p>
            </div>
            {proposal.changes.length === 0 ? (
              <p className="text-sm text-ink-muted">No changes proposed.</p>
            ) : (
              <div className="flex flex-wrap items-center gap-3">
                <button type="button" className={btn.primary} onClick={() => apply(open)} disabled={!open.length}>
                  <Icon name="check" className="size-4" /> Apply all {open.length > 0 && `(${open.length})`}
                </button>
                <button type="button" className={btn.quiet} onClick={() => setProposal(null)}>
                  Discard the proposal
                </button>
              </div>
            )}
            {proposal.changes.map((c, i) => {
              const status = proposal.status[i];
              const pid = c.kind === "add" ? c.page.id : c.pageId;
              const before = c.kind === "add" ? null : (proposal.doc.pages.find((p) => p.id === c.pageId) ?? null);
              return (
                <article
                  key={i}
                  className={cx("flex flex-col gap-3 rounded-2xl border p-4", status === "open" ? "border-line-strong" : "border-line opacity-80")}
                >
                  <div className="flex flex-wrap items-center gap-2">
                    <span
                      className={cx(
                        "rounded-full px-2.5 py-0.5 text-xs font-bold",
                        c.kind === "remove"
                          ? "bg-danger/15 text-danger"
                          : c.kind === "add"
                            ? "bg-[#0f5b3a]/15 text-[#0f5b3a] dark:text-[#8fe0b5]"
                            : "bg-action/15 text-accent",
                      )}
                    >
                      {c.kind === "remove" ? "Remove page" : c.kind === "add" ? "New page" : "Revised page"}
                    </span>
                    <h3 className="font-semibold">
                      {c.kind === "add" ? c.page.title : (before?.title ?? "A page")}
                      {c.kind === "add" && <span className="font-normal text-ink-muted"> · after {titleOf(c.after) ?? "the start"}</span>}
                    </h3>
                  </div>
                  <p className="text-sm">{c.why}</p>
                  {c.kind !== "add" && changedSince.has(c.pageId) && status === "open" && (
                    <p className="flex items-center gap-1.5 text-sm font-semibold text-[#8a5a00] dark:text-[#ffd48a]">
                      <Icon name="alert" className="size-4" /> You’ve edited this page since Claude read it. Applying replaces those edits.
                    </p>
                  )}
                  {c.kind === "edit" && before && (
                    <div className="grid gap-3 md:grid-cols-2">
                      <PageColumn page={before} other={c.page} side="now" />
                      <PageColumn page={c.page} other={before} side="proposed" />
                    </div>
                  )}
                  {c.kind === "add" && <PageColumn page={c.page} other={null} side="proposed" />}
                  <div className="flex flex-wrap items-center gap-3">
                    {status === "open" ? (
                      <>
                        <button type="button" className={btn.secondary} onClick={() => apply([i])}>
                          <Icon name="check" className="size-4" /> {c.kind === "remove" ? "Remove the page" : "Apply"}
                        </button>
                        <button type="button" className={btn.quiet} onClick={() => mark([i], "skipped")}>
                          Skip
                        </button>
                      </>
                    ) : (
                      <p
                        className={cx(
                          "flex items-center gap-1.5 text-sm font-semibold",
                          status === "applied" ? "text-[#0f5b3a] dark:text-[#8fe0b5]" : "text-ink-muted",
                        )}
                      >
                        <Icon name={status === "applied" ? "circle-check" : "close"} className="size-4" /> {status === "applied" ? "Applied" : "Skipped"}
                      </p>
                    )}
                    {status === "applied" && c.kind !== "remove" && onShow && doc.pages.some((p) => p.id === pid) && (
                      <button type="button" className={btn.quiet} onClick={() => onShow(pid)}>
                        Open the page
                      </button>
                    )}
                  </div>
                </article>
              );
            })}
            {proposal.changes.length > 0 && (
              <p className="text-xs text-ink-muted">
                Check what’s applied as you would anything you write: new claims carry their source, and anything flagged “Needs verification” holds publishing
                until it’s signed off.
              </p>
            )}
          </section>
        )}
      </div>
    </details>
  );
}
