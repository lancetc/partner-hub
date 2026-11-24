"use client";

import { useEffect, useId, useRef, useState } from "react";
import { api, useApi } from "@/lib/api";
import { cx } from "@/lib/format";
import {
  gateQuestion,
  GAP_STATUS,
  ISSUES,
  NOT_AN_INCIDENT_REPORT,
  REPLY_LABELS,
  RISK,
  AID_TEMPLATES,
  STEP_KINDS,
  UNCONTROLLED,
  type Issue,
  type StepKind,
} from "@/lib/playbook";
import type { ResolvedSnippet } from "@/server/playbooks";
import { Icon } from "../Icon";
import { aidEvent } from "../favourites/favApi";
import { Highlighter, SaveSection } from "../favourites/Highlighter";
import { SavedMarkChips, SavedMarks } from "../favourites/SavedMarks";
import { SaveNotice } from "../favourites/SaveNotice";

/*
  A Live SOP playbook card (docs/live-playbooks.md), the same wherever it's placed: a Magazine block, the playbook
  page, a saved Wallet reference. It shows the current approved release for the reader's role, or the fallback route
  when the procedure is withdrawn, unreleased or past a hard review date. Urgent help is always one click away, with
  no form in front of it. Ask a Lead checks a question before anything is shared, and says exactly where it went.
*/

type View = Extract<ResolvedSnippet, { permitted: true }>;
const secondary =
  "inline-flex min-h-11 items-center justify-center gap-2 rounded-full border border-line-strong bg-surface px-4 font-semibold hover:bg-muted disabled:cursor-not-allowed disabled:opacity-60";
const primary =
  "inline-flex min-h-11 items-center justify-center gap-2 rounded-full bg-action px-5 font-semibold text-on-action hover:opacity-90 disabled:cursor-not-allowed disabled:opacity-60";
const box = "rounded-2xl bg-bg p-4 ring-1 ring-line";
const warn = "rounded-2xl bg-[#fff1cc] p-3 text-[#4a3400] dark:bg-[#3d2f08] dark:text-[#ffd97a]";
const urgentTone = "rounded-2xl bg-[#fde2e0] p-4 text-[#5c1410] dark:bg-[#3d1512] dark:text-[#ffb4ab]";
const showDate = (d: string) =>
  /^\d{4}-\d{2}-\d{2}$/.test(d)
    ? new Intl.DateTimeFormat("en-AU", { day: "numeric", month: "short", year: "numeric", timeZone: "Australia/Sydney" }).format(
        new Date(`${d}T00:00:00+10:00`),
      )
    : "";

export function PlaybookCard({ snippetId, preview }: { snippetId: string; preview?: boolean }) {
  const body = useRef<HTMLDivElement>(null);
  const [notice, setNotice] = useState<{ first: boolean } | null>(null);
  const [saveError, setSaveError] = useState("");
  const url = `/api/playbooks/${snippetId}`;
  const loaded = useApi<ResolvedSnippet>(url);
  const [urgent, setUrgent] = useState(false);
  const [asking, setAsking] = useState<string | null>(null);
  const [ticked, setTicked] = useState<string[]>([]);
  const viewed = useRef(false);
  const v = loaded.data;
  // Remember which release this reader has seen, so the next change is summarised for them.
  useEffect(() => {
    if (!v || !v.permitted || !v.release || viewed.current || preview) return;
    viewed.current = true;
    // Where they came from (Work Tools, a placement, Favourites) is counted with the view.
    const from = new URLSearchParams(window.location.search).get("from") ?? (window.location.search.includes("fav=") ? "favourites" : "work-tools");
    api(url, { body: { action: "viewed", from, key: `${Date.now().toString(36)}-${Math.random().toString(36).slice(2, 8)}` } }).catch(() => undefined);
  }, [v, url, preview]);

  if (loaded.error) return <Frame title="Playbook">{<p role="alert">{loaded.error}</p>}</Frame>;
  if (!v) return <Frame title="Playbook">{<p className="text-ink-muted">Loading the current release…</p>}</Frame>;
  if (!v.permitted)
    return (
      <Frame title="Playbook">
        <p>{v.message}</p>
      </Frame>
    );

  const post = async (body: Record<string, unknown>) => {
    await api(url, { body });
    loaded.reload();
  };
  const steps = v.release?.steps ?? [];
  const safety = v.risk === "safety_critical";

  return (
    <Frame title={v.title} risk={v.risk} template={AID_TEMPLATES[v.template].label}>
      {/* This reader's earlier highlights in the aid, marked where they still stand word for word (favourites/SavedMarks). */}
      <SavedMarks root={body} source="aid" id={v.id} off={preview || !v.release || v.readiness === "fallback"}>
        <div ref={body} data-hl="aid">
          {v.trigger && (
            <p className="text-lg">
              <span className="font-semibold">Use when:</span> {v.trigger}
            </p>
          )}
          <p className={v.trigger ? "mt-1" : "text-lg"}>{v.purpose}</p>
          <p className="mt-1 text-sm text-ink-muted">
            {v.roleLabel}
            {v.minutes > 0 && ` · about ${v.minutes} min`}
          </p>

          {(safety || v.readiness === "fallback") && (
            <div className="mt-3">
              <button type="button" className={cx(secondary, "border-[#b3261e] text-[#b3261e]")} aria-expanded={urgent} onClick={() => setUrgent(!urgent)}>
                <Icon name="alert" className="size-4" /> Urgent help
              </button>
              {urgent && <UrgentRoute v={v} />}
            </div>
          )}

          {v.readiness === "fallback" ? (
            <div className={cx(warn, "mt-4")} role="status">
              <p className="font-semibold">Procedure temporarily unavailable</p>
              {v.withdrawnReason && <p className="mt-1 text-sm">{v.withdrawnReason}</p>}
              <p className="mt-2">{v.fallback.text}</p>
              <Contacts list={v.fallback.contacts} />
            </div>
          ) : (
            v.release && (
              <>
                <p className="mt-3 inline-flex flex-wrap items-center gap-x-2 gap-y-1 rounded-full bg-tealtint px-3 py-1 text-sm font-semibold">
                  <Icon name="circle-check" className="size-4" /> Approved · effective {showDate(v.release.effectiveOn)} · owner {v.ownerTeam} · release{" "}
                  {v.release.number}
                </p>
                {v.readiness === "review_due" && (
                  <p className={cx(warn, "mt-2 text-sm")}>
                    Due for review since {showDate(v.release.reviewBy)}. Its owner is checking it; it’s still the approved version.
                  </p>
                )}
                {v.pending === "changed" && (
                  <p className={cx(warn, "mt-2 text-sm")}>
                    For owners and leads: the source has changed. A new release is waiting for owner review; readers still see this one.
                  </p>
                )}
                {v.pending === "unmapped" && (
                  <p className={cx(warn, "mt-2 text-sm")}>For owners and leads: the source section can’t be found. Map it in the playbook library.</p>
                )}
                {v.updatedSince.length > 0 && (
                  <div className={cx(box, "mt-3")}>
                    <p className="font-semibold">Updated since you last viewed</p>
                    <ul className="mt-1 list-disc pl-5 text-sm">
                      {v.updatedSince.map((u) => (
                        <li key={u.number}>
                          Release {u.number}: {u.summary}
                        </li>
                      ))}
                    </ul>
                  </div>
                )}
                {v.release.ackRequired && !preview && (
                  <div className="mt-3 flex flex-wrap items-center gap-2">
                    {v.acked ? (
                      <span className="text-sm font-semibold">You’ve acknowledged release {v.release.number}.</span>
                    ) : (
                      <button type="button" className={secondary} onClick={() => void post({ action: "ack" })}>
                        I’ve read this release
                      </button>
                    )}
                  </div>
                )}

                {(Object.keys(STEP_KINDS) as StepKind[]).map((kind) => {
                  const list = steps.filter((s) => s.kind === kind && s.text.trim());
                  if (!list.length) return null;
                  return (
                    <section key={kind} aria-label={v.groups[kind]} className={cx("mt-4", kind === "now" && "rounded-2xl ring-2 ring-[#b3261e]/40 p-3")}>
                      <h4 className="text-sm font-extrabold uppercase tracking-[0.12em] text-accent">{v.groups[kind]}</h4>
                      <ol className="mt-2 flex flex-col gap-2">
                        {list.map((s) => {
                          const n = steps.indexOf(s) + 1;
                          return (
                            <li key={s.id} className="grid grid-cols-[2rem_1fr] gap-2">
                              <span className="font-serif text-lg font-semibold text-accent" aria-hidden>
                                {n}
                              </span>
                              <div>
                                <label className="flex items-start gap-2">
                                  <input
                                    type="checkbox"
                                    className="mt-1 size-5 shrink-0"
                                    checked={ticked.includes(s.id)}
                                    onChange={() => setTicked(ticked.includes(s.id) ? ticked.filter((x) => x !== s.id) : [...ticked, s.id])}
                                  />
                                  <span className="text-lg">
                                    <span className="sr-only">Step {n}: </span>
                                    {s.text}
                                  </span>
                                </label>
                                <div className="mt-1 flex flex-wrap gap-3 pl-7 text-sm">
                                  {s.why && (
                                    <details>
                                      <summary className="cursor-pointer font-semibold text-accent">Why this matters</summary>
                                      <p className="mt-1">{s.why}</p>
                                    </details>
                                  )}
                                  <button type="button" className="font-semibold text-accent underline" onClick={() => setAsking(s.id)}>
                                    Ask about this step
                                  </button>
                                </div>
                              </div>
                            </li>
                          );
                        })}
                      </ol>
                    </section>
                  );
                })}
                <p className="mt-2 text-xs text-ink-muted">Ticks are a reading aid on this screen only. They don’t record that anything was done.</p>
                {v.release.example && (
                  <details className={cx(box, "mt-3")}>
                    <summary className="cursor-pointer font-semibold">A worked example (made up)</summary>
                    <p className="mt-2">{v.release.example}</p>
                  </details>
                )}
                {v.links.length > 0 && (
                  <div className={cx(box, "mt-3")}>
                    <p className="font-semibold">Where to go from here</p>
                    <ul className="mt-1 flex flex-col gap-1">
                      {v.links.map((l) => (
                        <li key={l.href}>
                          <a
                            href={l.href}
                            target="_blank"
                            rel="noreferrer"
                            className="inline-flex min-h-11 items-center gap-1.5 font-semibold text-accent underline underline-offset-2"
                            onClick={() => !preview && aidEvent({ event: "current_source_opened", snippetId: v.id, place: "aid-link" })}
                          >
                            {l.label} <Icon name="external" className="size-4" />
                          </a>
                        </li>
                      ))}
                    </ul>
                  </div>
                )}
                {v.contacts.length > 0 && (
                  <div className={cx(box, "mt-3")}>
                    <p className="font-semibold">Contacts for your role</p>
                    <Contacts list={v.contacts} />
                  </div>
                )}
              </>
            )
          )}
        </div>
        {!preview && v.release && v.readiness !== "fallback" && <Highlighter root={body} source="aid" id={v.id} />}
        <SavedMarkChips blockId="aid" className="mt-3" />
      </SavedMarks>

      <div className="mt-4 flex flex-wrap gap-2 border-t border-line pt-4">
        <SourceButton v={v} />
        <button
          type="button"
          className={secondary}
          aria-pressed={v.saved}
          disabled={preview}
          onClick={async () => {
            setSaveError("");
            try {
              const r = await api<{ saved: boolean; first: boolean }>(url, { body: { action: "save", on: !v.saved } });
              setNotice((n) => (r.saved ? { first: r.first || Boolean(n?.first) } : null));
              loaded.reload();
            } catch (e) {
              // Not saved, and it says so.
              setSaveError(e instanceof Error ? e.message : "That couldn’t be saved. Try again.");
            }
          }}
        >
          <Icon name={v.saved ? "bookmark-filled" : "bookmark"} className="size-4" /> {v.saved ? "In your Favourites" : "Save to Favourites"}
        </button>
        {!preview && v.release && v.readiness !== "fallback" && <SaveSection source="aid" id={v.id} sectionId="aid" label="Save the key step" />}
        <button type="button" className={secondary} onClick={() => setAsking("")} disabled={preview}>
          <Icon name="chat" className="size-4" /> Flag a policy gap / Ask a lead
        </button>
      </div>
      {saveError && (
        <p role="alert" className="mt-2 text-sm font-semibold text-danger">
          {saveError}
        </p>
      )}
      {notice && <SaveNotice first={notice.first} onClose={() => setNotice(null)} />}
      {asking !== null && <AskForm v={v} stepId={asking} onClose={() => setAsking(null)} onDone={() => loaded.reload()} />}
      <Questions v={v} onChange={() => loaded.reload()} url={url} />
      <p className="mt-4 text-xs text-ink-muted">{UNCONTROLLED}</p>
    </Frame>
  );
}

function Frame({ title, risk, template, children }: { title: string; risk?: string; template?: string; children: React.ReactNode }) {
  return (
    <section aria-label={`Job Aid: ${title}`} className="w-full rounded-3xl border border-line-strong bg-surface p-5 sm:p-7 print:border-black">
      <p className="mb-2 flex flex-wrap items-center gap-2 font-mulish text-sm font-extrabold uppercase tracking-[0.12em] text-accent">
        <Icon name="clipboard" className="size-5" /> Work tool{template ? ` · ${template}` : ""}
        {risk ? ` · ${RISK[risk as keyof typeof RISK]}` : ""}
      </p>
      <h3 className="font-serif text-2xl font-semibold">{title}</h3>
      <div className="mt-1">{children}</div>
    </section>
  );
}

function Contacts({ list }: { list: { key: string; label: string; route: string }[] }) {
  return (
    <ul className="mt-1 flex flex-col gap-1">
      {list.map((c) => (
        <li key={c.key}>
          <span className="font-semibold">{c.label}:</span> {c.route || "Not set up for your role yet. Ask your team lead for the route."}
        </li>
      ))}
    </ul>
  );
}

/** Urgent help, with no form in front of it: 000 under the approved wording, and the role's escalation contact. */
function UrgentRoute({ v }: { v: View }) {
  return (
    <div className={cx(urgentTone, "mt-2")} role="region" aria-label="Urgent help">
      <p className="font-semibold">If someone is in immediate danger, call 000.</p>
      <p className="mt-1">Then use the escalation route for your role, now. Don’t wait for an answer in the Hub.</p>
      <Contacts list={v.fallback.contacts.length ? v.fallback.contacts : v.contacts} />
      <p className="mt-2 text-sm">{NOT_AN_INCIDENT_REPORT}</p>
    </div>
  );
}

/** The full approved source, if the reader's role may see it; otherwise say they're seeing an approved excerpt. */
function SourceButton({ v }: { v: View }) {
  const [open, setOpen] = useState(false);
  return (
    <>
      <button type="button" className={secondary} aria-expanded={open} onClick={() => setOpen(!open)}>
        <Icon name="doc" className="size-4" /> Open full approved SOP
      </button>
      {open && (
        <div className={cx(box, "w-full")}>
          {v.source ? (
            <>
              <p className="font-semibold">{v.source.title}</p>
              <p className="text-sm text-ink-muted">
                {v.source.heading} · {v.source.system} · owner {v.source.owner} · source version {v.source.version}
              </p>
              <p className="mt-2 whitespace-pre-line">{v.source.text}</p>
            </>
          ) : (
            <p>You can see this approved excerpt, but not the full source for your role. For more, use the contacts above.</p>
          )}
        </div>
      )}
    </>
  );
}

/**
  Ask a Lead. The question is checked before anything is shared: urgent concerns get the urgent route; anything that
  might identify someone is held for review. The reader sees exactly what would be posted, and who'd see it.
*/
function AskForm({ v, stepId, onClose, onDone }: { v: View; stepId: string; onClose: () => void; onDone: () => void }) {
  const ids = useId();
  const [step, setStep] = useState(stepId);
  const [issue, setIssue] = useState<Issue>("unclear");
  const [text, setText] = useState("");
  const [isUrgent, setIsUrgent] = useState(false);
  const [result, setResult] = useState<{ route: string; status?: string | null; held?: string[] } | null>(null);
  const [problem, setProblem] = useState("");
  const [busy, setBusy] = useState(false);
  // A retry key. randomUUID needs a secure page, so there's a fallback for plain-http reviewers on the office network.
  const [key] = useState(() =>
    typeof crypto !== "undefined" && typeof crypto.randomUUID === "function"
      ? crypto.randomUUID()
      : `k-${Date.now().toString(36)}-${Math.random().toString(36).slice(2, 10)}`,
  );
  const first = useRef<HTMLHeadingElement>(null);
  useEffect(() => first.current?.focus(), []);
  const gate = gateQuestion(text);
  const answered = v.questions.filter((q) => (!step || q.stepId === step) && (q.status === "answered" || q.status === "resolved"));
  const stepText = v.release?.steps.find((s) => s.id === step)?.text;
  const send = async () => {
    setBusy(true);
    setProblem("");
    try {
      const r = await api<{ route: string; status: string | null; held?: string[] }>(`/api/playbooks/${v.id}`, {
        body: { action: "ask", stepId: step, issue, question: text, urgent: isUrgent, idempotencyKey: key },
      });
      setResult(r);
      onDone();
    } catch (e) {
      setProblem(e instanceof Error ? e.message : "That didn’t send. Try again: it won’t be posted twice.");
    } finally {
      setBusy(false);
    }
  };

  if (result)
    return (
      <div className={cx(result.route === "urgent" ? urgentTone : box, "mt-3")} role="status">
        {result.route === "urgent" ? (
          <>
            <p className="font-semibold">Use the urgent escalation route now</p>
            <p className="mt-1">This sounds urgent, so nothing has been posted or queued. If someone is in immediate danger, call 000. Then contact:</p>
            <Contacts list={v.fallback.contacts.length ? v.fallback.contacts : v.contacts} />
            <p className="mt-2 text-sm">{NOT_AN_INCIDENT_REPORT}</p>
          </>
        ) : result.route === "review" ? (
          <>
            <p className="font-semibold">Awaiting privacy review</p>
            <p className="mt-1">
              It might include {result.held?.join(" and ") || "identifying details"}, so a lead will review it before anyone else sees it. Nothing has been
              posted yet.
            </p>
          </>
        ) : (
          <>
            <p className="font-semibold">Posted to this playbook’s questions</p>
            <p className="mt-1">The lead for this playbook has been alerted. You’ll see answers below.</p>
          </>
        )}
        <button type="button" className={cx(secondary, "mt-3")} onClick={onClose}>
          Close
        </button>
      </div>
    );

  return (
    <div className={cx(box, "mt-3 w-full")}>
      <h4 ref={first} tabIndex={-1} className="font-serif text-lg font-semibold outline-none">
        Flag a policy gap / Ask a lead
      </h4>
      <label className="mt-2 flex min-h-11 items-center gap-2 font-semibold text-[#b3261e]">
        <input type="checkbox" className="size-5" checked={isUrgent} onChange={(e) => setIsUrgent(e.target.checked)} />
        This is about something happening now, a specific person, or a possible incident
      </label>
      {isUrgent || gate.urgent ? (
        <div className={cx(urgentTone, "mt-2")}>
          <p className="font-semibold">Use the urgent escalation route now, not this form.</p>
          <p className="mt-1">If someone is in immediate danger, call 000. Then contact:</p>
          <Contacts list={v.fallback.contacts.length ? v.fallback.contacts : v.contacts} />
          <p className="mt-2 text-sm">{NOT_AN_INCIDENT_REPORT}</p>
        </div>
      ) : (
        <>
          <label className="mt-2 flex flex-col gap-1">
            <span className="text-sm font-semibold">Which step?</span>
            <select className="min-h-11 rounded-xl border border-line-strong bg-surface px-3" value={step} onChange={(e) => setStep(e.target.value)}>
              <option value="">The whole procedure</option>
              {v.release?.steps.map((s, i) => (
                <option key={s.id} value={s.id}>
                  Step {i + 1}: {s.text.slice(0, 70)}
                </option>
              ))}
            </select>
          </label>
          <fieldset className="mt-2">
            <legend className="text-sm font-semibold">What’s the issue?</legend>
            {(Object.keys(ISSUES) as Issue[]).map((k) => (
              <label key={k} className="flex min-h-10 items-center gap-2 text-sm">
                <input type="radio" name={`${ids}-issue`} className="size-5" checked={issue === k} onChange={() => setIssue(k)} />
                {ISSUES[k]}
              </label>
            ))}
          </fieldset>
          {answered.length > 0 && (
            <div className="mt-2 rounded-xl bg-muted p-3 text-sm">
              <p className="font-semibold">Already answered:</p>
              <ul className="mt-1 list-disc pl-5">
                {answered.slice(0, 3).map((q) => (
                  <li key={q.id}>
                    {q.question}{" "}
                    <span className="text-ink-muted">
                      ({q.replies.length} {q.replies.length === 1 ? "reply" : "replies"}, below)
                    </span>
                  </li>
                ))}
              </ul>
              <button type="button" className={cx(secondary, "mt-2 min-h-9 text-sm")} onClick={onClose}>
                This answers it
              </button>
            </div>
          )}
          <label className="mt-2 flex flex-col gap-1">
            <span className="text-sm font-semibold">Your question, in general terms</span>
            <span className="text-xs text-ink-muted">
              Leave out names, addresses, clinical observations, visit dates, incident IDs, and anything that identifies a client or supplier.
            </span>
            <textarea
              className="min-h-24 rounded-xl border border-line-strong bg-surface px-3 py-2"
              maxLength={800}
              value={text}
              onChange={(e) => setText(e.target.value)}
            />
          </label>
          {gate.identifying.length > 0 && (
            <p className={cx(warn, "mt-2 text-sm")}>
              It looks like this includes {gate.identifying.join(" and ")}. If you send it, it’ll be held for a lead’s privacy review before anyone else sees
              it.
            </p>
          )}
          {text.trim().length >= 10 && (
            <div className="mt-2 rounded-xl bg-muted p-3 text-sm">
              <p className="font-semibold">What will be shared</p>
              <p className="mt-1">
                “{v.title}”, release {v.release?.number ?? "–"}
                {stepText ? `, “${stepText.slice(0, 80)}”` : ""} · {ISSUES[issue]}
              </p>
              <p className="mt-1">“{text.trim()}”</p>
              <p className="mt-1 text-ink-muted">
                {gate.identifying.length ? "Seen first by a lead, for review." : "Visible to everyone who can see this playbook, with your answer from a lead."}
              </p>
            </div>
          )}
          {problem && (
            <p role="alert" className={cx(warn, "mt-2")}>
              {problem}
            </p>
          )}
          <div className="mt-3 flex flex-wrap gap-2">
            <button type="button" className={primary} disabled={busy || text.trim().length < 10} onClick={() => void send()}>
              {gate.identifying.length ? "Send for review" : "Post the question"}
            </button>
            <button type="button" className={secondary} onClick={onClose}>
              Cancel
            </button>
          </div>
        </>
      )}
    </div>
  );
}

function Questions({ v, onChange, url }: { v: View; onChange: () => void; url: string }) {
  const [reply, setReply] = useState<Record<string, string>>({});
  const [problem, setProblem] = useState("");
  if (!v.questions.length) return null;
  const send = async (body: Record<string, unknown>) => {
    setProblem("");
    try {
      await api(url, { body });
      onChange();
    } catch (e) {
      setProblem(e instanceof Error ? e.message : "That didn’t work.");
    }
  };
  return (
    <section aria-label="Questions about this playbook" className="mt-5">
      <h4 className="font-semibold">Questions about this playbook</h4>
      <p className="text-xs text-ink-muted">Answers here are guidance, not the procedure. Only the policy owner changes the steps above.</p>
      {problem && (
        <p role="alert" className={cx(warn, "mt-2 text-sm")}>
          {problem}
        </p>
      )}
      <ul className="mt-2 flex flex-col gap-2">
        {v.questions.map((q) => {
          const stepN = (v.release?.steps.findIndex((s) => s.id === q.stepId) ?? -1) + 1;
          return (
            <li key={q.id} className={box}>
              <p className="text-xs text-ink-muted">
                {GAP_STATUS[q.status]} · {q.issue}
                {stepN > 0 && ` · step ${stepN}`} · asked about release {q.releaseNumber}
                {q.mine && " · yours"}
              </p>
              <p className="mt-1">{q.question}</p>
              {q.note && <p className="mt-1 text-sm">Note from a lead: {q.note}</p>}
              <ul className="mt-2 flex flex-col gap-2">
                {q.replies.map((r) => (
                  <li key={r.id} className="border-l-4 border-line-strong pl-3 text-sm">
                    <span className="font-semibold">{REPLY_LABELS[r.label]}</span>
                    {r.stale && (
                      <span className="ml-2 rounded-full bg-[#fff1cc] px-2 text-xs font-semibold text-[#4a3400]">
                        About an earlier release: check the steps above
                      </span>
                    )}
                    <p>{r.body}</p>
                  </li>
                ))}
              </ul>
              {["posted", "answered", "policy_update_pending"].includes(q.status) && (
                <div className="mt-2 flex flex-wrap items-end gap-2">
                  <label className="flex min-w-56 flex-1 flex-col gap-1 text-sm">
                    <span className="font-semibold">Reply (general terms only)</span>
                    <input
                      className="min-h-10 rounded-xl border border-line-strong bg-surface px-3"
                      value={reply[q.id] ?? ""}
                      maxLength={1200}
                      onChange={(e) => setReply({ ...reply, [q.id]: e.target.value })}
                    />
                  </label>
                  <button
                    type="button"
                    className={cx(secondary, "min-h-10 text-sm")}
                    disabled={(reply[q.id] ?? "").trim().length < 3}
                    onClick={() => void send({ action: "reply", gapId: q.id, body: reply[q.id] }).then(() => setReply({ ...reply, [q.id]: "" }))}
                  >
                    Reply
                  </button>
                  {q.mine && (
                    <button type="button" className={cx(secondary, "min-h-10 text-sm")} onClick={() => void send({ action: "close", gapId: q.id })}>
                      Close as answered
                    </button>
                  )}
                </div>
              )}
            </li>
          );
        })}
      </ul>
    </section>
  );
}
