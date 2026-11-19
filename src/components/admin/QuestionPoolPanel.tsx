"use client";

import { useEffect, useRef, useState } from "react";
import { api, useApi } from "@/lib/api";
import { cx, formatDate } from "@/lib/format";
import { ACTIONS, DESIGNATIONS, MIN_SAMPLE, POOL_KINDS, STATUSES, SURFACES, type PoolContent, type ReviewAction } from "@/lib/questionPool";
import type { PoolDetail } from "@/server/questionPool";
import { Badge, btn, ErrorNote, input } from "./ui";
import { Icon } from "../Icon";

/*
  One question, beside the table: what learners see (with answers and feedback), its details and evidence,
  every place it's used, what a problem with it would touch, its versions and its review history; and the
  review steps. Opens as a side panel; Escape closes it and focus returns to the row.
*/

type Facets = { owners: { id: string; name: string }[]; sources: { id: string; title: string; status: string }[]; topics: string[] };

const CREDIT = { correct: "Best answer", partial: "Acceptable", none: "" } as const;

export function QuestionContent({ content, showAnswers }: { content: PoolContent; showAnswers: boolean }) {
  return (
    <div className="flex flex-col gap-3">
      {content.context && (
        <blockquote className="whitespace-pre-line rounded-2xl border-l-4 border-gold bg-muted/60 px-4 py-3 text-sm">{content.context}</blockquote>
      )}
      <p className="font-serif text-lg font-semibold leading-snug">{content.stem}</p>
      <ol className="flex flex-col gap-2">
        {content.options.map((o) => (
          <li
            key={o.id}
            className={cx(
              "rounded-2xl border-2 px-3 py-2 text-sm",
              showAnswers && o.credit === "correct"
                ? "border-[#2f8f5b] bg-[#e9f6ef] dark:bg-[#17301f]"
                : showAnswers && o.credit === "partial"
                  ? "border-[#fab53d]"
                  : "border-line",
            )}
          >
            <span>{o.text}</span>
            {showAnswers && CREDIT[o.credit] && <span className="ml-2 font-mulish text-xs font-extrabold uppercase tracking-wide">{CREDIT[o.credit]}</span>}
            {showAnswers && o.feedback && <span className="mt-1 block text-ink-muted">Feedback: {o.feedback}</span>}
          </li>
        ))}
      </ol>
      {showAnswers && (content.feedback?.correct || content.feedback?.incorrect) && (
        <dl className="grid gap-1 text-sm">
          {content.feedback.correct && (
            <div>
              <dt className="inline font-bold">If right: </dt>
              <dd className="inline">{content.feedback.correct}</dd>
            </div>
          )}
          {content.feedback.incorrect && (
            <div>
              <dt className="inline font-bold">If wrong: </dt>
              <dd className="inline">{content.feedback.incorrect}</dd>
            </div>
          )}
        </dl>
      )}
      {showAnswers && content.explanation && (
        <p className="text-sm">
          <span className="font-bold">Explanation: </span>
          {content.explanation}
        </p>
      )}
    </div>
  );
}

function Section({ title, children, open = true }: { title: string; children: React.ReactNode; open?: boolean }) {
  return (
    <details open={open} className="group rounded-2xl bg-surface ring-1 ring-line">
      <summary className="flex min-h-11 cursor-pointer items-center justify-between gap-2 px-4 font-semibold">
        {title}
        <Icon name="chevron-down" className="size-4 shrink-0 transition-transform group-open:rotate-180" />
      </summary>
      <div className="flex flex-col gap-3 px-4 pb-4">{children}</div>
    </details>
  );
}

const Label = ({ label, children }: { label: string; children: React.ReactNode }) => (
  <label className="flex flex-col gap-1 text-sm font-semibold">
    {label}
    {children}
  </label>
);

export function QuestionPanel({ id, facets, onClose, onChanged }: { id: string; facets: Facets; onClose: () => void; onChanged: () => void }) {
  const { data, error, setData } = useApi<PoolDetail>(`/api/admin/questions/${id}`);
  const [busy, setBusy] = useState(false);
  const [problem, setProblem] = useState<string | null>(null);
  const [note, setNote] = useState("");
  const [asking, setAsking] = useState<ReviewAction | null>(null);
  const [showOld, setShowOld] = useState<number | null>(null);
  const heading = useRef<HTMLHeadingElement>(null);

  useEffect(() => {
    heading.current?.focus();
    const key = (e: KeyboardEvent) => e.key === "Escape" && onClose();
    window.addEventListener("keydown", key);
    return () => window.removeEventListener("keydown", key);
  }, [onClose]);

  const send = async (body: Record<string, unknown>) => {
    setBusy(true);
    setProblem(null);
    try {
      setData(await api<PoolDetail>(`/api/admin/questions/${id}`, { body }));
      onChanged();
      setAsking(null);
      setNote("");
      return true;
    } catch (e) {
      setProblem(e instanceof Error ? e.message : "That didn’t save. Try again.");
      return false;
    } finally {
      setBusy(false);
    }
  };
  const update = (patch: Record<string, unknown>) => void send({ action: "update", ...patch });

  const q = data;
  const current = q?.versions.find((v) => v.version === q.currentVersion);
  const firstReview = q && current?.status === "approved" && current.migrated;
  const allowed = (a: ReviewAction) => Boolean(current && (ACTIONS[a].from.includes(current.status) || (a === "approve" && firstReview)));
  const act = (a: ReviewAction) => {
    if (ACTIONS[a].needsNote || a === "approve") setAsking(a);
    else void send({ action: a });
  };

  return (
    <div className="fixed inset-0 z-50 flex justify-end bg-[#0b1626]/50" onMouseDown={(e) => e.target === e.currentTarget && onClose()}>
      <aside
        role="dialog"
        aria-modal="true"
        aria-labelledby="pool-panel-h"
        className="flex h-full w-[min(48rem,100vw)] flex-col overflow-y-auto bg-bg shadow-2xl"
      >
        <div className="sticky top-0 z-10 flex items-start justify-between gap-3 border-b border-line bg-bg px-5 py-4">
          <div className="min-w-0">
            <p className="font-mulish text-xs font-extrabold uppercase tracking-[0.14em] text-ink-muted">
              {id}
              {q && ` · ${POOL_KINDS[q.kind]} · version ${q.currentVersion}`}
            </p>
            <h2 id="pool-panel-h" ref={heading} tabIndex={-1} className="font-serif text-xl font-semibold outline-none">
              {q?.title ?? "Loading…"}
            </h2>
          </div>
          <button type="button" className={btn.quiet} onClick={onClose}>
            <Icon name="close" className="size-4" /> Close
          </button>
        </div>
        {error && (
          <div className="p-5">
            <ErrorNote text={error} />
          </div>
        )}
        {q && current && (
          <div className="flex flex-col gap-4 p-5">
            {/* Where it stands, and the next step. */}
            <div className="flex flex-col gap-3 rounded-2xl bg-surface p-4 ring-1 ring-line">
              <div className="flex flex-wrap items-center gap-2">
                <Badge tone={STATUSES[q.status].tone}>{STATUSES[q.status].label}</Badge>
                {q.risk === "high" && <Badge tone="bad">High-risk</Badge>}
                {firstReview && <Badge tone="warn">First review due</Badge>}
                {q.liveUnapproved && <Badge tone="bad">Live without approval</Badge>}
                {q.duplicate && <Badge tone="warn">Possible duplicate</Badge>}
                {q.source?.superseded && <Badge tone="bad">Source superseded</Badge>}
              </div>
              <p className="text-sm text-ink-muted">
                {STATUSES[q.status].meaning}
                {firstReview && " It was already live when the pool was set up, so it was recorded as approved: confirm it once someone has checked it."}
                {q.approvedVersion &&
                  q.approvedVersion !== q.currentVersion &&
                  ` Version ${q.approvedVersion} is the approved one${q.liveUses ? " learners have" : ""}.`}
              </p>
              {q.practiceOnly ? (
                <p className="text-sm">
                  This is a self-review question: it’s written and approved in its course (Self-review, then Manage questions). Flag or retire it here to stop
                  it being asked straight away.
                </p>
              ) : null}
              {asking ? (
                <div className="flex flex-col gap-2 rounded-2xl bg-muted/60 p-3">
                  <Label label={asking === "approve" ? "What you checked (optional, kept with the approval)" : "Why (kept in the history)"}>
                    <textarea className={cx(input, "min-h-20 py-2")} value={note} onChange={(e) => setNote(e.target.value)} />
                  </Label>
                  <div className="flex flex-wrap gap-2">
                    <button
                      type="button"
                      className={btn.primary}
                      disabled={busy || (ACTIONS[asking].needsNote && !note.trim())}
                      onClick={() => void send({ action: asking, note })}
                    >
                      {asking === "approve" && firstReview ? "Confirm: reviewed and approved" : ACTIONS[asking].label}
                    </button>
                    <button type="button" className={btn.quiet} onClick={() => setAsking(null)}>
                      Cancel
                    </button>
                  </div>
                </div>
              ) : (
                <div className="flex flex-wrap gap-2">
                  {allowed("submit") && !q.practiceOnly && (
                    <button type="button" className={btn.primary} disabled={busy} onClick={() => act("submit")}>
                      Submit for review
                    </button>
                  )}
                  {allowed("approve") && (!q.practiceOnly || firstReview) && (
                    <button
                      type="button"
                      className={btn.primary}
                      disabled={busy || Boolean(q.can.approve)}
                      title={q.can.approve ?? undefined}
                      onClick={() => act("approve")}
                    >
                      <Icon name="check" className="size-4" /> {firstReview ? "Confirm after review" : "Approve this version"}
                    </button>
                  )}
                  {allowed("request_changes") && (
                    <button type="button" className={btn.secondary} disabled={busy} onClick={() => act("request_changes")}>
                      Ask for changes
                    </button>
                  )}
                  {allowed("flag") && (
                    <button type="button" className={btn.secondary} disabled={busy} onClick={() => act("flag")}>
                      <Icon name="alert" className="size-4" /> Flag: needs review
                    </button>
                  )}
                  {allowed("retire") && (
                    <button type="button" className={btn.quiet} disabled={busy} onClick={() => act("retire")}>
                      Retire
                    </button>
                  )}
                  {allowed("restore") && (
                    <button type="button" className={btn.quiet} disabled={busy} onClick={() => act("restore")}>
                      Restore as a draft
                    </button>
                  )}
                </div>
              )}
              {allowed("approve") && q.can.approve && <p className="text-sm text-ink-muted">{q.can.approve}</p>}
              {problem && <ErrorNote text={problem} />}
            </div>

            <Section title="The question, as learners meet it">
              <QuestionContent content={current.content} showAnswers />
              <p className="text-xs text-ink-muted">
                The wording is changed where the question is used (its Topic or course). A change there becomes a new draft version here, and this one stays as
                it was.
              </p>
            </Section>

            <Section title="What it tests and who owns it">
              <div className="grid gap-3 sm:grid-cols-2">
                <Label label="Short title">
                  <input
                    className={input}
                    defaultValue={q.title}
                    key={`t${q.title}`}
                    onBlur={(e) => e.target.value !== q.title && update({ title: e.target.value })}
                  />
                </Label>
                <Label label="Decision or skill it tests">
                  <input
                    className={input}
                    defaultValue={q.skill}
                    key={`s${q.skill}`}
                    onBlur={(e) => e.target.value !== q.skill && update({ skill: e.target.value })}
                  />
                </Label>
                <Label label="Topic">
                  <input
                    className={input}
                    list="pool-topics"
                    defaultValue={q.topic}
                    key={`o${q.topic}`}
                    onBlur={(e) => e.target.value !== q.topic && update({ topic: e.target.value })}
                  />
                  <datalist id="pool-topics">
                    {facets.topics.map((t) => (
                      <option key={t} value={t} />
                    ))}
                  </datalist>
                </Label>
                <Label label="Audience">
                  <input
                    className={input}
                    defaultValue={q.audience}
                    key={`a${q.audience}`}
                    onBlur={(e) => e.target.value !== q.audience && update({ audience: e.target.value })}
                  />
                </Label>
                <Label label="Programme">
                  <input
                    className={input}
                    placeholder="Support at Home, induction…"
                    defaultValue={q.programme}
                    key={`p${q.programme}`}
                    onBlur={(e) => e.target.value !== q.programme && update({ programme: e.target.value })}
                  />
                </Label>
                <Label label="Intended use">
                  <select className={input} value={q.intendedUse} onChange={(e) => update({ intendedUse: e.target.value })}>
                    <option value="formative">Knowledge check</option>
                    <option value="assessed">Assessed quiz</option>
                    <option value="practice">Practice</option>
                    <option value="any">Any of these</option>
                  </select>
                </Label>
                <Label label="Owner">
                  <select className={input} value={q.owner?.id ?? ""} onChange={(e) => update({ owner: e.target.value })}>
                    <option value="">No owner yet</option>
                    {facets.owners.map((o) => (
                      <option key={o.id} value={o.id}>
                        {o.name}
                      </option>
                    ))}
                  </select>
                </Label>
                <Label label="Risk">
                  <select className={input} value={q.risk} onChange={(e) => update({ risk: e.target.value })}>
                    <option value="standard">Standard</option>
                    <option value="high">High-risk (needs Quality and Compliance or the Hub owner)</option>
                  </select>
                </Label>
                <Label label="Next review">
                  <input
                    type="date"
                    className={input}
                    defaultValue={q.nextReview ?? ""}
                    key={`n${q.nextReview}`}
                    onBlur={(e) => e.target.value !== (q.nextReview ?? "") && update({ nextReview: e.target.value })}
                  />
                </Label>
                <Label label="What should trigger a review sooner">
                  <input
                    className={input}
                    placeholder="A change to the Code, new SIRS guidance…"
                    defaultValue={q.reviewTrigger}
                    key={`r${q.reviewTrigger}`}
                    onBlur={(e) => e.target.value !== q.reviewTrigger && update({ reviewTrigger: e.target.value })}
                  />
                </Label>
              </div>
              <Label label="Tags (separate with commas)">
                <input
                  className={input}
                  defaultValue={q.tags.join(", ")}
                  key={`g${q.tags.join()}`}
                  onBlur={(e) => e.target.value !== q.tags.join(", ") && update({ tags: e.target.value.split(",").map((t) => t.trim()) })}
                />
              </Label>
            </Section>

            <Section title="Evidence: the source its answer rests on">
              <div className="grid gap-3 sm:grid-cols-2">
                <Label label="Source">
                  <select className={input} value={q.source?.id ?? ""} onChange={(e) => update({ sourceId: e.target.value })}>
                    <option value="">No source recorded</option>
                    {facets.sources.map((s) => (
                      <option key={s.id} value={s.id}>
                        {s.title}
                        {s.status === "superseded" ? " (superseded)" : ""}
                      </option>
                    ))}
                  </select>
                </Label>
                <Label label="Exact section or page">
                  <input
                    className={input}
                    defaultValue={q.sourceRef}
                    key={`f${q.sourceRef}`}
                    onBlur={(e) => e.target.value !== q.sourceRef && update({ sourceRef: e.target.value })}
                  />
                </Label>
              </div>
              <Label label="Why the best answer is right, in the source’s terms">
                <textarea
                  className={cx(input, "min-h-20 py-2")}
                  defaultValue={q.rationale}
                  key={`w${q.rationale}`}
                  onBlur={(e) => e.target.value !== q.rationale && update({ rationale: e.target.value })}
                />
              </Label>
              {q.sourceDetail && (
                <p className="text-sm text-ink-muted">
                  {q.sourceDetail.authority && `${q.sourceDetail.authority}. `}
                  {q.sourceDetail.effective && `In effect from ${formatDate(q.sourceDetail.effective)}. `}
                  {q.sourceDetail.url && (
                    <a href={q.sourceDetail.url} target="_blank" rel="noreferrer" className="font-semibold text-accent hover:underline">
                      Open the source
                    </a>
                  )}
                </p>
              )}
              <p className="text-xs text-ink-muted">
                Sources are added under the Sources tab. Changing an approved question’s source asks for it to be reviewed again.
              </p>
            </Section>

            <Section title={`Where it’s used (${q.liveUses} live, ${q.totalUses} in all)`}>
              {q.impact.placements > 0 && (
                <p className="rounded-2xl bg-tealtint px-3 py-2 text-sm">
                  <strong>If this question were wrong:</strong> it’s live in {q.impact.containers.length} place{q.impact.containers.length === 1 ? "" : "s"}
                  {q.impact.assessed ? `, ${q.impact.assessed} of them assessed` : ""}
                  {q.impact.practice ? `, ${q.impact.practice} as practice` : ""}, with {q.impact.attempts} first answer{q.impact.attempts === 1 ? "" : "s"} on
                  record. Flagging it doesn’t change anyone’s results.
                </p>
              )}
              {q.placements.length === 0 && <p className="text-sm">Not used anywhere.</p>}
              <ul className="flex flex-col divide-y divide-line">
                {q.placements.map((p, i) => (
                  <li key={i} className="flex flex-wrap items-baseline justify-between gap-x-3 gap-y-0.5 py-2 text-sm">
                    <span className="min-w-0">
                      <span className="font-semibold">{p.containerTitle}</span>
                      <span className="text-ink-muted">
                        {" "}
                        · {SURFACES[p.surface]}
                        {p.locationTitle ? ` · ${p.locationTitle}` : ""}
                      </span>
                    </span>
                    <span className="shrink-0 text-ink-muted">
                      v{p.version} · {p.release} · {DESIGNATIONS[p.designation]} ·{" "}
                      <span className={cx(p.current && p.live && "font-semibold text-ink")}>
                        {p.current ? (p.live ? "live now" : "in a draft") : "earlier"}
                      </span>
                    </span>
                  </li>
                ))}
              </ul>
            </Section>

            <Section title="How learners answer it" open={false}>
              {q.signalDetail.length === 0 && <p className="text-sm">No answers on record yet.</p>}
              {q.signalDetail.map((s) => (
                <p key={s.designation} className="text-sm">
                  <span className="font-semibold">{DESIGNATIONS[s.designation]}:</span> {s.attempts} first answer{s.attempts === 1 ? "" : "s"}
                  {s.attempts >= MIN_SAMPLE
                    ? `, ${Math.round((s.correct / s.attempts) * 100)}% right`
                    : `: not enough yet to show a rate (${MIN_SAMPLE} needed)`}
                  {s.lastAt ? `. Last answered ${formatDate(s.lastAt)}.` : "."}
                </p>
              ))}
              <p className="text-xs text-ink-muted">
                Totals only. A very easy or very hard question is a prompt to look, not proof it’s wrong; nothing changes automatically.
              </p>
            </Section>

            {q.duplicates.length > 0 && (
              <Section title="Possible duplicates">
                <p className="text-sm">The same question and best answer also appear as:</p>
                <ul className="list-disc pl-5 text-sm">
                  {q.duplicates.map((d) => (
                    <li key={d.id}>
                      {d.id}: {d.title} <span className="text-ink-muted">({d.topic})</span>
                    </li>
                  ))}
                </ul>
              </Section>
            )}

            <Section title={`Versions (${q.versions.length})`} open={false}>
              <ol className="flex flex-col gap-2">
                {q.versions.map((v) => (
                  <li key={v.version} className="rounded-2xl border border-line p-3 text-sm">
                    <div className="flex flex-wrap items-center gap-2">
                      <span className="font-semibold">Version {v.version}</span>
                      <Badge tone={STATUSES[v.status].tone}>{STATUSES[v.status].label}</Badge>
                      {v.live && <Badge tone="good">Live</Badge>}
                      <span className="text-ink-muted">
                        {formatDate(v.createdAt)}
                        {v.approvedAt
                          ? ` · approved ${formatDate(v.approvedAt)} by ${v.migrated ? "the set-up (already live)" : (v.approvedBy ?? "a reviewer")}`
                          : ""}
                      </span>
                      {v.version !== q.currentVersion && (
                        <button
                          type="button"
                          className="ml-auto font-semibold text-accent hover:underline"
                          onClick={() => setShowOld(showOld === v.version ? null : v.version)}
                        >
                          {showOld === v.version ? "Hide" : "Show"}
                        </button>
                      )}
                    </div>
                    {v.changeNote && <p className="mt-1 text-ink-muted">{v.changeNote}</p>}
                    {showOld === v.version && (
                      <div className="mt-3">
                        <QuestionContent content={v.content} showAnswers />
                      </div>
                    )}
                  </li>
                ))}
              </ol>
            </Section>

            <Section title="Review history" open={false}>
              <ol className="flex flex-col gap-2">
                {q.events.map((e) => (
                  <li key={e.id} className="text-sm">
                    <span className="font-semibold">{e.action.replace(/_/g, " ")}</span>
                    {e.version ? ` (v${e.version})` : ""} · {e.by} · {formatDate(e.at)}
                    {e.note && <span className="block text-ink-muted">{e.note}</span>}
                  </li>
                ))}
              </ol>
            </Section>
          </div>
        )}
      </aside>
    </div>
  );
}
