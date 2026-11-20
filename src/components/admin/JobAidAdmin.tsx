"use client";

import Link from "next/link";
import { useEffect, useState } from "react";
import { api, useApi } from "@/lib/api";
import { cx } from "@/lib/format";
import {
  AID_TEMPLATES,
  REVIEW_DECISIONS,
  safeAidLink,
  STEP_KINDS,
  type AidTemplate,
  type ReleaseData,
  type ReviewDecision,
  type SnippetData,
  type StepKind,
} from "@/lib/playbook";
import type { AidDraft, similarAids } from "@/server/aidDraft";
import type { AidReport } from "@/server/favourites";
import { Badge, btn, ErrorNote, Field, input } from "./ui";
import { Icon } from "../Icon";

/*
  What makes a playbook a Job Aid, for its owners (docs/job-aids.md): how the tool is used, when to use it, the
  quick action shown where it's embedded, its Topic placements, how it's being used, and the decision at review.
  Used inside the library screen (PlaybooksAdmin).
*/

const box = "rounded-2xl border border-line bg-surface p-4";
const area = "min-h-20 w-full rounded-xl border border-line-strong bg-surface px-3 py-2";
type Aid = AidReport["aids"][number];
const dateText = (d: string) =>
  d ? new Date(`${d.slice(0, 10)}T00:00:00Z`).toLocaleDateString("en-AU", { day: "numeric", month: "short", year: "numeric", timeZone: "UTC" }) : "";

/** The Job Aid's own settings: template, trigger, time to use, and where to go from here. */
export function AidFields({ sn, edit }: { sn: SnippetData; edit: (fn: (x: SnippetData) => void) => void }) {
  return (
    <>
      <Field label="Kind of tool" hint={AID_TEMPLATES[sn.template].hint}>
        <select className={input} value={sn.template} onChange={(e) => edit((x) => void (x.template = e.target.value as AidTemplate))}>
          {(Object.keys(AID_TEMPLATES) as AidTemplate[]).map((t) => (
            <option key={t} value={t}>
              {AID_TEMPLATES[t].label}
            </option>
          ))}
        </select>
      </Field>
      <Field label="About how long to use (minutes)" hint="Leave at 0 to show nothing.">
        <input
          className={input}
          inputMode="numeric"
          value={sn.minutes || ""}
          onChange={(e) => edit((x) => void (x.minutes = Math.min(60, Number(e.target.value.replace(/\D/g, "")) || 0)))}
        />
      </Field>
      <Field label="Use when…" hint="The task the worker is doing, in their words. Needed before a release can be approved." className="sm:col-span-2">
        <input
          className={input}
          value={sn.trigger}
          maxLength={160}
          placeholder="You are about to approve a supplier invoice."
          onChange={(e) => edit((x) => void (x.trigger = e.target.value))}
        />
      </Field>
      <div className="sm:col-span-2">
        <p className="text-sm font-semibold">Where to go from here</p>
        <p className="text-xs text-ink-muted">
          Up to four links: the agreement, the form, the queue. A page on the Hub, a web address or an email. Phone numbers come from the contact directory.
        </p>
        {sn.links.map((l, i) => (
          <div key={i} className="mt-2 grid gap-2 sm:grid-cols-[minmax(0,1fr)_minmax(0,1.3fr)_auto]">
            <input
              className={input}
              aria-label={`Link ${i + 1} label`}
              placeholder="Current service agreements"
              value={l.label}
              onChange={(e) => edit((x) => void (x.links[i].label = e.target.value))}
            />
            <input
              className={cx(input, l.href && !safeAidLink(l.href) && "border-danger")}
              aria-label={`Link ${i + 1} address`}
              aria-invalid={Boolean(l.href) && !safeAidLink(l.href)}
              placeholder="/resources#agreements"
              value={l.href}
              onChange={(e) => edit((x) => void (x.links[i].href = e.target.value))}
            />
            <button type="button" className={btn.quiet} aria-label={`Remove link ${i + 1}`} onClick={() => edit((x) => void x.links.splice(i, 1))}>
              <Icon name="trash" className="size-4" />
            </button>
          </div>
        ))}
        {sn.links.length < 4 && (
          <button type="button" className={cx(btn.quiet, "mt-2")} onClick={() => edit((x) => void x.links.push({ label: "", href: "" }))}>
            <Icon name="plus" className="size-4" /> Add a link
          </button>
        )}
      </div>
      {sn.themeId && (
        <p className="text-sm sm:col-span-2">
          Answers a Problem desk theme:{" "}
          <Link href={`/admin/problems/${sn.themeId}`} className="font-semibold text-accent underline">
            open the theme
          </Link>
          .{" "}
          <button type="button" className="underline" onClick={() => edit((x) => void (x.themeId = ""))}>
            Unlink
          </button>
        </p>
      )}
    </>
  );
}

/** The parts of a release only a Job Aid has: the quick action for an embedded section, and a worked example. */
export function AidReleaseFields({ rel, editRel }: { rel: ReleaseData; editRel: (fn: (x: ReleaseData) => void) => void }) {
  return (
    <>
      <Field
        label="The quick action"
        hint="One or two sentences shown where the tool is embedded in a course or a Topic. The steps are the full version."
        className="sm:col-span-3"
      >
        <textarea className={area} maxLength={320} value={rel.quick} onChange={(e) => editRel((x) => void (x.quick = e.target.value))} />
      </Field>
      <Field label="A worked example (optional)" hint="Made up. No real names, invoices or cases." className="sm:col-span-3">
        <textarea className={area} maxLength={900} value={rel.example} onChange={(e) => editRel((x) => void (x.example = e.target.value))} />
      </Field>
    </>
  );
}

/** An AI draft of the steps from the approved source section. Shown beside what's there; nothing is taken unless the author says so. */
export function AidDraftPanel({ id, dirtySettings, onUse }: { id: string; dirtySettings: boolean; onUse: (d: AidDraft) => void }) {
  const [draft, setDraft] = useState<AidDraft | null>(null);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState("");
  return (
    <div className="mt-3 rounded-2xl bg-muted p-4">
      <div className="flex flex-wrap items-center gap-2">
        <button
          type="button"
          className={btn.secondary}
          disabled={busy}
          onClick={async () => {
            setBusy(true);
            setError("");
            try {
              setDraft(await api<AidDraft>("/api/admin/playbooks", { body: { action: "draft", id } }));
            } catch (e) {
              setError(e instanceof Error ? e.message : "Nothing could be drafted.");
            } finally {
              setBusy(false);
            }
          }}
        >
          <Icon name="spark" className="size-4" /> {busy ? "Drafting…" : "Draft the steps from the source"}
        </button>
        <span className="text-sm text-ink-muted">
          A model reads the bound source section and nothing else. It can’t add a rule, approve or publish.
          {dirtySettings ? " Save the settings first, so it reads the right section." : ""}
        </span>
      </div>
      {error && (
        <div className="mt-2">
          <ErrorNote text={error} />
        </div>
      )}
      {draft && (
        <div className="mt-3 flex flex-col gap-2 rounded-xl bg-surface p-3 ring-1 ring-line">
          <p className="font-semibold">A draft to check against the source</p>
          {draft.quick && (
            <p>
              <span className="text-ink-muted">Quick action: </span>
              {draft.quick}
            </p>
          )}
          <ol className="list-decimal pl-5">
            {draft.steps.map((s, i) => (
              <li key={i}>
                <span className="text-xs font-semibold uppercase tracking-wide text-accent">{STEP_KINDS[s.kind as StepKind]}</span> {s.text}
                {s.why && <span className="text-ink-muted"> ({s.why})</span>}
              </li>
            ))}
          </ol>
          {draft.example && (
            <p className="text-sm">
              <span className="text-ink-muted">Example: </span>
              {draft.example}
            </p>
          )}
          {draft.gaps.length > 0 && (
            <div className="text-sm">
              <p className="font-semibold">The source doesn’t say</p>
              <ul className="list-disc pl-5">
                {draft.gaps.map((g) => (
                  <li key={g}>{g}</li>
                ))}
              </ul>
            </div>
          )}
          {draft.processFix && (
            <p className="text-sm">
              <span className="font-semibold">A Job Aid may not be enough: </span>
              {draft.processFix}
            </p>
          )}
          <p className="text-sm font-semibold">
            Read every step against the source section before you use it. A model can add or drop something without saying.
          </p>
          <div className="flex flex-wrap gap-2">
            <button
              type="button"
              className={btn.primary}
              onClick={() => {
                onUse(draft);
                setDraft(null);
              }}
            >
              Put these in the release to edit
            </button>
            <button type="button" className={btn.quiet} onClick={() => setDraft(null)}>
              Discard
            </button>
          </div>
        </div>
      )}
    </div>
  );
}

type Places = { topics: { ref: string; title: string; places: { id: string; label: string }[] }[] };

/** Where the aid is placed, how it's being used, and the owner's decision at review. */
export function AidOps({ id, released }: { id: string; released: boolean }) {
  const report = useApi<AidReport>("/api/admin/playbooks?view=report");
  const places = useApi<Places>("/api/admin/story?view=places").data;
  const [topic, setTopic] = useState("");
  const [card, setCard] = useState("");
  const [why, setWhy] = useState("");
  const [decision, setDecision] = useState<ReviewDecision>("keep");
  const [note, setNote] = useState("");
  const [error, setError] = useState("");
  const aid = report.data?.aids.find((a) => a.id === id);
  const topicPlacements = useApi<{ aids: { placementId: string; card: string; why: string }[] }>(
    topic ? `/api/playbooks?topic=${encodeURIComponent(topic)}` : null,
  );
  const act = async (body: Record<string, unknown>) => {
    setError("");
    try {
      await api("/api/admin/playbooks", { body: { id, ...body } });
      report.reload();
      topicPlacements.reload();
      return true;
    } catch (e) {
      setError(e instanceof Error ? e.message : "That didn’t work.");
      return false;
    }
  };
  const cards = places?.topics.find((t) => t.ref === topic)?.places ?? [];
  return (
    <section className={box} aria-labelledby="aid-ops">
      <h2 id="aid-ops" className="font-semibold">
        Placements, use and review
      </h2>
      {error && (
        <div className="mt-2">
          <ErrorNote text={error} />
        </div>
      )}
      <div className="mt-3 grid gap-4 lg:grid-cols-2">
        <div>
          <p className="text-sm font-semibold">Where it’s placed</p>
          <p className="text-xs text-ink-muted">
            Every placement points to this one aid and shows its current approved release. In a Magazine course, add the <strong>Job Aid</strong> block. On a
            Topic, place it on a card here.
          </p>
          <ul className="mt-2 flex flex-col gap-1 text-sm">
            <li>
              <Link href={`/tools/${id}`} className="font-semibold text-accent underline">
                Work Tools
              </Link>{" "}
              {released ? "· always" : "· once a release is approved"}
            </li>
            {aid?.placements.map((p, i) => (
              <li key={i}>
                {p.kind}: {p.title} {p.live ? "" : <span className="text-ink-muted">(not live)</span>}
              </li>
            ))}
          </ul>
          <div className="mt-3 grid gap-2">
            <Field label="Place it on a Topic card">
              <select
                className={input}
                value={topic}
                onChange={(e) => {
                  setTopic(e.target.value);
                  setCard("");
                }}
              >
                <option value="">Choose a Topic</option>
                {places?.topics.map((t) => (
                  <option key={t.ref} value={t.ref}>
                    {t.title}
                  </option>
                ))}
              </select>
            </Field>
            {topic && (
              <>
                <Field label="Card">
                  <select className={input} value={card} onChange={(e) => setCard(e.target.value)}>
                    <option value="">Choose a card</option>
                    {cards.map((c) => (
                      <option key={c.id} value={c.id}>
                        {c.label}
                      </option>
                    ))}
                  </select>
                </Field>
                <Field label="Why it belongs here" hint="Shown with it: why to use it at work, at this point.">
                  <input className={input} maxLength={300} value={why} onChange={(e) => setWhy(e.target.value)} />
                </Field>
                <div>
                  <button
                    type="button"
                    className={btn.secondary}
                    disabled={!card}
                    onClick={async () => {
                      if (await act({ action: "place-topic", slug: topic, card, why })) setWhy("");
                    }}
                  >
                    Place it on this card
                  </button>
                </div>
                {topicPlacements.data?.aids
                  .filter((a) => (a as { snippetId?: string }).snippetId === id)
                  .map((a) => (
                    <p key={a.placementId} className="text-sm">
                      On “{cards.find((c) => c.id === a.card)?.label ?? a.card}”.{" "}
                      <button
                        type="button"
                        className="font-semibold underline"
                        onClick={() => void act({ action: "unplace-topic", placementId: a.placementId })}
                      >
                        Take it off
                      </button>
                    </p>
                  ))}
              </>
            )}
          </div>
        </div>
        <div>
          <p className="text-sm font-semibold">Use in the last 30 days</p>
          {!aid ? (
            <p className="text-sm text-ink-muted">Loading…</p>
          ) : (
            <>
              <dl className="mt-1 grid grid-cols-2 gap-x-4 gap-y-1 text-sm">
                <dt className="text-ink-muted">People who opened it</dt>
                <dd className="tabular-nums">
                  {aid.viewers} of {aid.eligible} eligible{aid.thin && " (few)"}
                </dd>
                <dt className="text-ink-muted">Opened from a placement</dt>
                <dd className="tabular-nums">{aid.fromPlacement}</dd>
                <dt className="text-ink-muted">In Favourites now</dt>
                <dd className="tabular-nums">{aid.savedNow}</dd>
                <dt className="text-ink-muted">Returns from Favourites</dt>
                <dd className="tabular-nums">{aid.returns}</dd>
                <dt className="text-ink-muted">Source links opened</dt>
                <dd className="tabular-nums">{aid.sourceClicks}</dd>
                <dt className="text-ink-muted">Issues reported</dt>
                <dd className="tabular-nums">{aid.issues}</dd>
              </dl>
              <p className="mt-1 text-xs text-ink-muted">
                Adoption, with its denominator. Opening or saving a tool doesn’t show the task was done well: that’s the practice block’s and the work measure’s
                job.
              </p>
            </>
          )}
          <p className="mt-4 text-sm font-semibold">Decision at review</p>
          {aid?.review && (
            <p className="text-sm">
              <Badge tone="info">{aid.review.decision}</Badge> {dateText(aid.review.at)}: {aid.review.note}
            </p>
          )}
          <div className="mt-2 grid gap-2">
            <select className={input} aria-label="Decision" value={decision} onChange={(e) => setDecision(e.target.value as ReviewDecision)}>
              {(Object.keys(REVIEW_DECISIONS) as ReviewDecision[]).map((d) => (
                <option key={d} value={d}>
                  {REVIEW_DECISIONS[d]}
                </option>
              ))}
            </select>
            <input
              className={input}
              aria-label="What the decision rests on"
              placeholder="What it rests on: use, feedback, practice evidence, the work measure"
              maxLength={500}
              value={note}
              onChange={(e) => setNote(e.target.value)}
            />
            <div>
              <button
                type="button"
                className={btn.secondary}
                disabled={note.trim().length < 3}
                onClick={async () => {
                  if (await act({ action: "review", decision, note })) setNote("");
                }}
              >
                Record the decision
              </button>
            </div>
            <p className="text-xs text-ink-muted">Recording “withdraw” doesn’t withdraw it: use Withdraw above, which takes effect at once everywhere.</p>
          </div>
        </div>
      </div>
    </section>
  );
}

/** On the library's front page: use of every Job Aid in a date range, with its denominator. */
export function AidUseReport() {
  const [from, setFrom] = useState("");
  const [to, setTo] = useState("");
  const { data: r } = useApi<AidReport>(`/api/admin/playbooks?${new URLSearchParams({ view: "report", ...(from && { from }), ...(to && { to }) })}`);
  if (!r) return null;
  return (
    <section className={cx(box, "mt-6")} aria-labelledby="aid-use">
      <div className="flex flex-wrap items-end justify-between gap-3">
        <div>
          <h2 id="aid-use" className="font-semibold">
            How Job Aids are being used
          </h2>
          <p className="max-w-3xl text-sm text-ink-muted">
            Adoption evidence, with who could have used each one. A saved or opened tool is never a completion, a pass or a work result. No one’s Favourites or
            highlights are shown: only counts. {r.totals.peopleWithFavourites} {r.totals.peopleWithFavourites === 1 ? "person has" : "people have"} something in
            Favourites; {r.totals.passagesSaved} {r.totals.passagesSaved === 1 ? "passage was" : "passages were"} highlighted in these dates.
          </p>
        </div>
        <div className="flex gap-2">
          <Field label="From">
            <input type="date" className={input} value={from || r.range.from} onChange={(e) => setFrom(e.target.value)} />
          </Field>
          <Field label="To">
            <input type="date" className={input} value={to || r.range.to} onChange={(e) => setTo(e.target.value)} />
          </Field>
        </div>
      </div>
      <div className="mt-3 overflow-x-auto">
        <table className="w-full min-w-[52rem] text-left text-sm">
          <caption className="sr-only">Use of each Job Aid</caption>
          <thead className="text-ink-muted">
            <tr>
              {["Job Aid", "Release", "Eligible", "Opened it", "From a placement", "Saves", "Returns", "Source links", "Updates seen", "Issues", "Review"].map(
                (h, i) => (
                  <th key={h} scope="col" className={cx("py-1.5 pr-3 font-medium", i > 1 && i < 10 && "text-right")}>
                    {h}
                  </th>
                ),
              )}
            </tr>
          </thead>
          <tbody>
            {r.aids.map((a: Aid) => (
              <tr key={a.id} className="border-t border-line align-top">
                <th scope="row" className="py-1.5 pr-3 font-medium">
                  {a.title}
                  <span className="block text-xs font-normal text-ink-muted">
                    {a.template} · {a.owner || "no owner"} · {a.placements.length} {a.placements.length === 1 ? "placement" : "placements"}
                    {a.withdrawn && " · withdrawn"}
                  </span>
                </th>
                <td className="py-1.5 pr-3">{a.release ? `${a.release}${a.reviewBy ? ` · review by ${dateText(a.reviewBy)}` : ""}` : "None approved"}</td>
                <td className="py-1.5 pr-3 text-right tabular-nums">{a.eligible}</td>
                <td className="py-1.5 pr-3 text-right tabular-nums">
                  {a.viewers}
                  {a.thin && (
                    <span className="ml-1 text-xs text-ink-muted" title={`Fewer than ${r.thin} people: too few to read anything from`}>
                      (few)
                    </span>
                  )}
                </td>
                <td className="py-1.5 pr-3 text-right tabular-nums">{a.fromPlacement}</td>
                <td className="py-1.5 pr-3 text-right tabular-nums">{a.saves}</td>
                <td className="py-1.5 pr-3 text-right tabular-nums">{a.returns}</td>
                <td className="py-1.5 pr-3 text-right tabular-nums">{a.sourceClicks}</td>
                <td className="py-1.5 pr-3 text-right tabular-nums">{a.updatesSeen}</td>
                <td className="py-1.5 pr-3 text-right tabular-nums">{a.issues}</td>
                <td className="py-1.5 pr-3">{a.review ? a.review.decision : "Not yet"}</td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
    </section>
  );
}

type Similar = ReturnType<typeof similarAids>;
/** Before a new aid is started: the ones that already look like this task, and whether to reuse, revise or start new. */
export function SimilarAids({ title, onOpen }: { title: string; onOpen: (id: string) => void }) {
  const [asked, setAsked] = useState("");
  useEffect(() => {
    const t = window.setTimeout(() => setAsked(title.trim().length >= 4 ? title.trim() : ""), 400);
    return () => window.clearTimeout(t);
  }, [title]);
  const found = useApi<Similar>(asked ? `/api/admin/playbooks?view=similar&title=${encodeURIComponent(asked)}` : null).data;
  if (!asked || !found) return null;
  return (
    <div className="mt-2 rounded-xl bg-muted p-3 text-sm" role="status">
      <p className="font-semibold">
        {found.suggestion.action === "new"
          ? "Nothing like it yet"
          : found.suggestion.action === "revise"
            ? "Revise one that’s there?"
            : "Reuse one that’s there?"}
      </p>
      <p>{found.suggestion.text}</p>
      {found.similar.length > 0 && (
        <ul className="mt-1 flex flex-col gap-1">
          {found.similar.map((s) => (
            <li key={s.id}>
              <button type="button" className="font-semibold text-accent underline" onClick={() => onOpen(s.id)}>
                {s.title}
              </button>
              {s.trigger && <span className="text-ink-muted"> · Use when: {s.trigger}</span>} <span className="text-ink-muted">{s.why}</span>
            </li>
          ))}
        </ul>
      )}
    </div>
  );
}
