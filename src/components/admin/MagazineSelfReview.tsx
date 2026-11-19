"use client";

import { useMemo, useState } from "react";
import { api, useApi, type Me } from "@/lib/api";
import { confirmAction } from "@/lib/confirm";
import { cx, formatDate } from "@/lib/format";
import type { GuideDoc, Page, PracticeItem } from "@/lib/magazine";
import { pageSnapshot } from "@/lib/magazineNarration";
import { coverage, ITEM_STATES, itemProblems, itemState, itemVersion, PRACTICE_KINDS, REVIEW_SIZE } from "@/lib/magazineReview";
import { Badge, btn, ErrorNote, input } from "./ui";
import { Icon } from "../Icon";

/*
  Self-review for authors (docs/magazine-self-review.md): switch "Test myself" on for the course, see each
  reading page's approved questions, write or AI-draft more, and approve them. Learners only ever get approved
  questions whose page hasn't changed much since; editing an approved question makes it a draft again.
*/

type Draft = { title: string; standfirst: string; doc: GuideDoc };
type Change = (fn: (d: Draft) => void, tag?: string) => void;
type Stats = { items: Record<string, { answered: number; correct: number }>; started: number; finished: number; learners: number; sourceVisits: number };

const rid = () => `prq-${Math.random().toString(36).slice(2, 12)}`;
const pageName = (doc: GuideDoc, id: string) => {
  const i = doc.pages.findIndex((p) => p.id === id);
  return doc.pages[i]?.title || `Page ${i + 1}`;
};

/** In the editor's sidebar: on or off, how many questions are ready, and the way into them. */
export function SelfReviewPanel({ draft, change, onOpen }: { draft: Draft; change: Change; onOpen: () => void }) {
  const review = draft.doc.review;
  const cov = useMemo(() => coverage(draft.doc), [draft.doc]);
  const items = review?.items ?? [];
  const live = cov.reduce((n, c) => n + c.live, 0);
  const toCheck = cov.reduce((n, c) => n + c.review, 0);
  const drafts = cov.reduce((n, c) => n + c.draft, 0);
  const empty = cov.filter((c) => !c.live).length;
  return (
    <section aria-labelledby="self-review-h" className="flex flex-col gap-3 rounded-3xl bg-surface p-4 shadow-sm ring-1 ring-line">
      <h2 id="self-review-h" className="flex items-center gap-2 font-semibold">
        <Icon name="spark" className="size-4 text-accent" /> Self-review
      </h2>
      {!review ? (
        <>
          <p className="text-sm text-ink-muted">
            A <strong>Test myself</strong> button on each reading page: three quick questions with feedback, just for the learner. It never counts towards
            finishing the course.
          </p>
          <button
            type="button"
            className={btn.secondary}
            onClick={() => {
              change((d) => void (d.doc.review = { enabled: false, items: [] }));
              onOpen();
            }}
          >
            <Icon name="spark" className="size-4" /> Set up self-review
          </button>
        </>
      ) : (
        <>
          <label className="flex items-start gap-2 text-sm">
            <input
              type="checkbox"
              className="mt-0.5 size-4 accent-[var(--color-action)]"
              checked={review.enabled}
              onChange={(e) => change((d) => void (d.doc.review!.enabled = e.target.checked))}
            />
            <span>
              <span className="font-semibold">Enable self-review</span>
              <span className="block text-ink-muted">Learners see Test myself on reading pages once this is published.</span>
            </span>
          </label>
          <p className="text-sm" role="status">
            {live} approved{drafts ? `, ${drafts} draft${drafts === 1 ? "" : "s"}` : ""}
            {toCheck ? `, ${toCheck} to check again` : ""} ({items.length} in all)
          </p>
          {review.enabled && empty > 0 && (
            <p className="text-sm text-[#8a5a00] dark:text-[#ffd27a]">
              {empty} reading page{empty === 1 ? " has" : "s have"} no approved questions yet: publishing waits for at least one on each.
            </p>
          )}
          <button type="button" className={btn.secondary} onClick={onOpen}>
            <Icon name="list" className="size-4" /> Manage questions
          </button>
        </>
      )}
    </section>
  );
}

/** The questions, page by page: coverage, writing, AI drafts, approval, and how each is doing. */
export function SelfReviewManager({
  guideId,
  draft,
  change,
  onClose,
  onPreview,
}: {
  guideId: string;
  draft: Draft;
  change: Change;
  onClose: () => void;
  onPreview: () => void;
}) {
  const doc = draft.doc;
  const cov = useMemo(() => coverage(doc), [doc]);
  const [pageId, setPageId] = useState<string>(cov[0]?.pageId ?? "");
  const page = doc.pages.find((p) => p.id === pageId);
  const me = useApi<Me>("/api/me").data;
  const stats = useApi<Stats>(`/api/admin/magazine/${guideId}/practice`).data;
  const [drafting, setDrafting] = useState(false);
  const [problem, setProblem] = useState<string | null>(null);
  const [showRetired, setShowRetired] = useState(false);
  const items = (doc.review?.items ?? []).filter((it) => it.pageId === pageId && (showRetired || it.status !== "retired"));
  const retired = (doc.review?.items ?? []).filter((it) => it.pageId === pageId && it.status === "retired").length;
  const who = me?.user.name ?? "An author";

  const edit = (id: string, fn: (it: PracticeItem) => void, tag?: string) =>
    change((d) => {
      const it = d.doc.review?.items.find((x) => x.id === id);
      if (it) fn(it);
    }, tag);

  const add = () =>
    change((d) => {
      d.doc.review ??= { enabled: false, items: [] };
      d.doc.review.items.push({
        id: rid(),
        kind: "scenario",
        pageId,
        ...(page?.sections[0] && { sectionId: page.sections[0].id }),
        prompt: "",
        choices: [
          { id: "c1", text: "" },
          { id: "c2", text: "" },
          { id: "c3", text: "" },
        ],
        answer: "c1",
        explanation: "",
        status: "draft",
        origin: { kind: "author", by: who, at: new Date().toISOString() },
      });
    });

  const aiDraft = async () => {
    setDrafting(true);
    setProblem(null);
    try {
      const out = await api<{ items: PracticeItem[] }>(`/api/admin/magazine/${guideId}/practice`, { body: { pageId, count: 3 } });
      change((d) => {
        d.doc.review ??= { enabled: false, items: [] };
        d.doc.review.items.push(...out.items);
      });
    } catch (e) {
      setProblem(e instanceof Error ? e.message : "Questions couldn’t be drafted. Try again.");
    } finally {
      setDrafting(false);
    }
  };

  return (
    <div role="dialog" aria-modal="true" aria-labelledby="self-review-manage-h" className="fixed inset-0 z-50 overflow-y-auto bg-[#0b1626]/70 p-4">
      <div className="mx-auto flex w-full max-w-6xl flex-col gap-4 rounded-3xl bg-bg p-5 shadow-2xl sm:p-7">
        <div className="flex flex-wrap items-start justify-between gap-3">
          <div>
            <h2 id="self-review-manage-h" className="flex items-center gap-2 font-serif text-2xl font-semibold">
              <Icon name="spark" className="size-6 text-accent" /> Self-review questions
            </h2>
            <p className="mt-1 max-w-3xl text-sm text-ink-muted">
              Learners get up to {REVIEW_SIZE} approved questions at a time on the page they’re reading, or the pages they’ve opened. Prefer a realistic
              decision to a fact check, with plausible wrong answers and feedback that teaches. Practice never counts towards finishing the course.
            </p>
          </div>
          <div className="flex flex-wrap items-center gap-2">
            <label className="flex items-center gap-2 rounded-full bg-surface px-3 py-2 text-sm font-semibold ring-1 ring-line">
              <input
                type="checkbox"
                className="size-4 accent-[var(--color-action)]"
                checked={Boolean(doc.review?.enabled)}
                onChange={(e) =>
                  change((d) => {
                    d.doc.review ??= { enabled: false, items: [] };
                    d.doc.review.enabled = e.target.checked;
                  })
                }
              />
              Enable self-review
            </label>
            <button type="button" className={btn.secondary} onClick={onPreview}>
              <Icon name="eye" className="size-4" /> Preview as a learner
            </button>
            <button type="button" className={btn.quiet} onClick={onClose}>
              Close
            </button>
          </div>
        </div>
        {stats && stats.started > 0 && (
          <p className="rounded-2xl bg-surface px-4 py-2 text-sm ring-1 ring-line">
            So far: {stats.started} review{stats.started === 1 ? "" : "s"} started by {stats.learners} learner{stats.learners === 1 ? "" : "s"},{" "}
            {stats.finished} finished, {stats.sourceVisits} visit{stats.sourceVisits === 1 ? "" : "s"} back to the course from a question. Totals only: no one’s
            answers are shown.
          </p>
        )}
        <div className="grid gap-5 lg:grid-cols-[17rem_minmax(0,1fr)]">
          {/* Coverage: each reading page's approved questions. */}
          <nav aria-label="Reading pages" className="flex flex-col gap-1.5">
            {cov.map((c) => (
              <button
                key={c.pageId}
                type="button"
                aria-current={c.pageId === pageId ? "page" : undefined}
                onClick={() => setPageId(c.pageId)}
                className={cx(
                  "flex flex-col gap-0.5 rounded-2xl border-2 px-3 py-2 text-left text-sm",
                  c.pageId === pageId ? "border-action bg-tealtint" : "border-transparent bg-surface ring-1 ring-line hover:border-action",
                )}
              >
                <span className="font-semibold">{pageName(doc, c.pageId)}</span>
                <span className={cx(c.live < REVIEW_SIZE ? "text-[#8a5a00] dark:text-[#ffd27a]" : "text-ink-muted")}>
                  {c.live} approved
                  {c.draft ? ` · ${c.draft} draft` : ""}
                  {c.review ? ` · ${c.review} to check` : ""}
                </span>
                {c.live > 0 && (
                  <span className="text-xs text-ink-muted">
                    {c.kinds.map((k) => PRACTICE_KINDS[k].label).join(", ")} · {c.anchored} of {c.live} linked to a section
                  </span>
                )}
              </button>
            ))}
          </nav>

          <div className="flex min-w-0 flex-col gap-4">
            {page ? (
              <>
                <div className="flex flex-wrap items-center gap-2">
                  <h3 className="mr-auto font-serif text-xl font-semibold">{pageName(doc, page.id)}</h3>
                  <button type="button" className={btn.primary} disabled={drafting} onClick={() => void aiDraft()}>
                    <Icon name="spark" className="size-4" /> {drafting ? "Drafting…" : "Draft questions from this page"}
                  </button>
                  <button type="button" className={btn.secondary} onClick={add}>
                    <Icon name="plus" className="size-4" /> Add a question
                  </button>
                </div>
                <p className="text-sm text-ink-muted">
                  AI drafts use only this page and the course’s uploaded source documents. Check every one against the page; nothing is shown to learners until
                  it’s approved.
                </p>
                {problem && <ErrorNote text={problem} />}
                {items.length === 0 && <p className="rounded-2xl bg-surface p-4 text-sm ring-1 ring-line">No questions for this page yet.</p>}
                {items.map((it) => (
                  <ItemEditor
                    key={it.id}
                    item={it}
                    doc={doc}
                    page={page}
                    who={who}
                    stats={stats?.items[it.id]}
                    edit={(fn, tag) => edit(it.id, fn, tag)}
                    remove={() => change((d) => void (d.doc.review!.items = d.doc.review!.items.filter((x) => x.id !== it.id)))}
                  />
                ))}
                {retired > 0 && (
                  <button type="button" className="self-start text-sm font-semibold text-accent hover:underline" onClick={() => setShowRetired((x) => !x)}>
                    {showRetired ? "Hide" : "Show"} {retired} retired question{retired === 1 ? "" : "s"}
                  </button>
                )}
              </>
            ) : (
              <p className="text-sm">This course has no reading pages yet.</p>
            )}
          </div>
        </div>
      </div>
    </div>
  );
}

function ItemEditor({
  item: it,
  doc,
  page,
  who,
  stats,
  edit,
  remove,
}: {
  item: PracticeItem;
  doc: GuideDoc;
  page: Page;
  who: string;
  stats?: { answered: number; correct: number };
  edit: (fn: (it: PracticeItem) => void, tag?: string) => void;
  remove: () => void;
}) {
  const state = itemState(it, doc);
  const problems = itemProblems(it, doc);
  const edited = it.status === "approved" && it.approved && it.approved.version !== itemVersion(it);
  const approve = () =>
    edit((x) => {
      x.status = "approved";
      x.basis = pageSnapshot(page);
      x.approved = { by: who, at: new Date().toISOString(), version: itemVersion(x) };
    });
  const tag = (field: string) => `${it.id}:${field}`;
  return (
    <article className={cx("flex flex-col gap-3 rounded-3xl bg-surface p-4 ring-1 sm:p-5", state === "review" ? "ring-2 ring-[#fab53d]" : "ring-line")}>
      <div className="flex flex-wrap items-center gap-2">
        <select
          aria-label="Kind of question"
          className={cx(input, "min-h-9 w-auto text-sm")}
          value={it.kind}
          onChange={(e) => edit((x) => void (x.kind = e.target.value === "spot" ? "spot" : "scenario"))}
        >
          {Object.entries(PRACTICE_KINDS).map(([k, v]) => (
            <option key={k} value={k}>
              {v.label}
            </option>
          ))}
        </select>
        <Badge tone={ITEM_STATES[state].tone === "good" ? "good" : ITEM_STATES[state].tone === "warn" ? "warn" : "neutral"}>
          {edited ? "Edited since approval: approve again" : ITEM_STATES[state].label}
        </Badge>
        {stats && stats.answered > 0 && (
          <span className="text-xs text-ink-muted">
            Answered {stats.answered} time{stats.answered === 1 ? "" : "s"} · {Math.round((stats.correct / stats.answered) * 100)}% right
            {stats.answered >= 5 && stats.correct / stats.answered < 0.4 ? " · often confuses learners" : ""}
          </span>
        )}
      </div>
      <p className="text-xs text-ink-muted">
        {it.origin
          ? it.origin.kind === "ai"
            ? `Drafted by AI for ${it.origin.by}, ${formatDate(it.origin.at)}.`
            : `Written by ${it.origin.by}, ${formatDate(it.origin.at)}.`
          : ""}
        {it.origin?.note ? ` ${it.origin.note}` : ""}
        {it.approved && !edited && it.status === "approved" ? ` Approved by ${it.approved.by}, ${formatDate(it.approved.at)}.` : ""}
      </p>
      <PlainField label={it.kind === "spot" ? "The question (which detail needs attention?)" : "The situation and question"}>
        <textarea className={cx(input, "min-h-20 py-2")} value={it.prompt} onChange={(e) => edit((x) => void (x.prompt = e.target.value), tag("prompt"))} />
      </PlainField>
      {it.kind === "spot" && (
        <PlainField label="The short example (fictional: a note, message or record with one issue in it)">
          <textarea
            className={cx(input, "min-h-24 py-2")}
            value={it.example ?? ""}
            onChange={(e) => edit((x) => void (x.example = e.target.value), tag("example"))}
          />
        </PlainField>
      )}
      <fieldset className="flex flex-col gap-2">
        <legend className="mb-1 text-sm font-semibold">Answers: mark the best one; the others should be plausible mistakes</legend>
        {it.choices.map((c, j) => (
          <div key={c.id} className={cx("flex flex-col gap-1.5 rounded-2xl border-2 p-3", it.answer === c.id ? "border-[#2f8f5b]" : "border-line")}>
            <div className="flex items-center gap-2">
              <label className="flex shrink-0 items-center gap-1.5 text-xs font-semibold">
                <input
                  type="radio"
                  name={`best-${it.id}`}
                  className="size-4 accent-[var(--color-action)]"
                  checked={it.answer === c.id}
                  onChange={() => edit((x) => void (x.answer = c.id))}
                />
                Best
              </label>
              <input
                className={cx(input, "min-h-10 text-sm")}
                aria-label={`Answer ${j + 1}`}
                value={c.text}
                onChange={(e) => edit((x) => void (x.choices[j].text = e.target.value), tag(`c${j}`))}
              />
              {it.choices.length > 3 && (
                <button
                  type="button"
                  aria-label={`Remove answer ${j + 1}`}
                  className="grid size-9 shrink-0 place-items-center rounded-full text-ink-muted hover:bg-muted"
                  onClick={() =>
                    edit((x) => {
                      x.choices.splice(j, 1);
                      if (!x.choices.some((y) => y.id === x.answer)) x.answer = x.choices[0].id;
                    })
                  }
                >
                  <Icon name="close" className="size-4" />
                </button>
              )}
            </div>
            {it.answer !== c.id && (
              <input
                className={cx(input, "min-h-9 text-sm")}
                aria-label={`Why answer ${j + 1} falls short`}
                placeholder="Why it falls short (optional, shown if they choose it)"
                value={c.feedback ?? ""}
                onChange={(e) => edit((x) => void (x.choices[j].feedback = e.target.value || undefined), tag(`f${j}`))}
              />
            )}
          </div>
        ))}
        {it.choices.length < 4 && (
          <button
            type="button"
            className="self-start text-sm font-semibold text-accent hover:underline"
            onClick={() =>
              edit((x) => {
                let n = x.choices.length + 1;
                while (x.choices.some((c) => c.id === `c${n}`)) n++;
                x.choices.push({ id: `c${n}`, text: "" });
              })
            }
          >
            + Add an answer
          </button>
        )}
      </fieldset>
      <PlainField label="Why the best answer works (and what’s behind the tempting wrong one)">
        <textarea
          className={cx(input, "min-h-20 py-2")}
          value={it.explanation}
          onChange={(e) => edit((x) => void (x.explanation = e.target.value), tag("explanation"))}
        />
      </PlainField>
      <div className="grid gap-3 sm:grid-cols-2">
        <PlainField label="See this in the course: the section it comes from">
          <select className={cx(input, "text-sm")} value={it.sectionId ?? ""} onChange={(e) => edit((x) => void (x.sectionId = e.target.value || undefined))}>
            <option value="">The top of the page</option>
            {page.sections.map((s) => (
              <option key={s.id} value={s.id}>
                {s.title}
              </option>
            ))}
          </select>
        </PlainField>
        <PlainField label="Source document and place (optional)">
          <input
            className={cx(input, "text-sm")}
            value={it.source ?? ""}
            onChange={(e) => edit((x) => void (x.source = e.target.value || undefined), tag("source"))}
          />
        </PlainField>
      </div>
      {state !== "live" && state !== "retired" && problems.length > 0 && (
        <ul className="list-disc rounded-2xl bg-muted px-8 py-2 text-sm">
          {problems.map((p) => (
            <li key={p}>{p}</li>
          ))}
        </ul>
      )}
      <div className="flex flex-wrap items-center gap-2">
        {state !== "live" && state !== "retired" && (
          <button type="button" className={btn.primary} disabled={problems.length > 0} onClick={approve}>
            <Icon name="check" className="size-4" /> {state === "review" ? "Still right: approve again" : "Approve"}
          </button>
        )}
        {state === "live" && (
          <button type="button" className={btn.secondary} onClick={() => edit((x) => void (x.status = "draft"))}>
            Back to draft
          </button>
        )}
        {it.status !== "retired" ? (
          it.approved ? (
            <button type="button" className={btn.quiet} onClick={() => edit((x) => void (x.status = "retired"))}>
              Retire
            </button>
          ) : (
            <button
              type="button"
              className={btn.quiet}
              onClick={async () => {
                if (
                  await confirmAction("This draft question is removed from the course.", {
                    title: "Delete this question?",
                    confirmLabel: "Delete",
                    danger: true,
                  })
                )
                  remove();
              }}
            >
              <Icon name="trash" className="size-4" /> Delete
            </button>
          )
        ) : (
          <button type="button" className={btn.quiet} onClick={() => edit((x) => void (x.status = "draft"))}>
            Restore as a draft
          </button>
        )}
      </div>
    </article>
  );
}

function PlainField({ label, children }: { label: string; children: React.ReactNode }) {
  return (
    <label className="flex flex-col gap-1 text-sm font-semibold">
      {label}
      {children}
    </label>
  );
}
