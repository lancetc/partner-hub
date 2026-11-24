"use client";

import Link from "next/link";
import { useEffect, useRef, useState } from "react";
import { api, useApi } from "@/lib/api";
import { cx } from "@/lib/format";
import { money } from "@/lib/quarterBudget";
import { WORKFLOW, WORKFLOW_ORDER, workflowProblem, type OwnerRole, type Workflow } from "@/lib/trustCheck";
import { DEMO_ISSUES } from "@/content/trustDemo";
import type { BoardState, demoView, getBoard, toolHome, TrustToolHome } from "@/server/trustTool";
import { Icon, type IconName } from "../Icon";
import { AidSection } from "../playbooks/AidSection";

/*
  The 28-Day Trust Check Work Tool, as a business owner uses it (docs/trust-check.md). A workbench over DEMO DATA
  ONLY: each demo issue with its workflow status (never a churn score), owner, last verified signal and next agreed
  contact, and the four questions the operational mode answers: What do we know? What did the person say? Who owns the
  action? What happened? A safety concern is shown first and stays with the urgent process. A complaint or incident
  reference is read-only: its status lives in its own system.

  The page offers only the moves the rules allow (the same `workflowProblem` the server runs), and a board saves
  privately to the business as numbered versions, with a key so a retried save never saves twice. There is no free
  text to type, so no participant detail can be entered.
*/

type Home = ReturnType<typeof toolHome>;
type Board = ReturnType<typeof getBoard>;
type Demo = ReturnType<typeof demoView>;
type IssueView = Demo["issues"][number];

const primary =
  "inline-flex min-h-11 items-center justify-center gap-2 rounded-full bg-action px-5 font-semibold text-on-action hover:opacity-90 disabled:cursor-not-allowed disabled:opacity-60";
const secondary =
  "inline-flex min-h-11 items-center justify-center gap-2 rounded-full border border-line-strong bg-surface px-4 font-semibold hover:bg-muted disabled:cursor-not-allowed disabled:opacity-60";
const box = "rounded-2xl bg-surface p-4 ring-1 ring-line";
const field = "min-h-11 w-full rounded-xl border border-line-strong bg-surface px-3";
const good = "bg-[#e3f4ea] text-[#0f5b3a] dark:bg-[#12392a] dark:text-[#8fe0b5]";
const warn = "bg-[#fff1cc] text-[#4a3400] dark:bg-[#3d2f08] dark:text-[#ffd97a]";
const bad = "bg-[#fde4e1] text-[#7a1d12] dark:bg-[#3f1712] dark:text-[#ffb4a8]";

/** Statuses are words with an icon shape; colour only repeats them. */
const STATUS_LOOK: Record<Workflow, { icon: IconName; cls: string }> = {
  needsVerification: { icon: "search", cls: warn },
  waitingOwner: { icon: "clock", cls: warn },
  actionDue: { icon: "alert", cls: warn },
  checking: { icon: "eye", cls: "bg-muted text-ink" },
  resolved: { icon: "check", cls: good },
  transferred: { icon: "route", cls: good },
  escalated: { icon: "shield", cls: bad },
};

/** A fresh key for one save or event, made when the person acts (never while drawing the page). */
const newKey = () => (typeof crypto !== "undefined" && "randomUUID" in crypto ? crypto.randomUUID() : `k-${performance.now().toString(36).replace(".", "")}`);

export function TrustCheckTool() {
  const home = useApi<Home>("/api/tools/trust-check");
  const [state, setState] = useState<BoardState | null>(null);
  const [board, setBoard] = useState<Board | null>(null);
  const [picked, setPicked] = useState<string>("");
  const [name, setName] = useState("");
  const [busy, setBusy] = useState(false);
  const [msg, setMsg] = useState("");
  const [err, setErr] = useState("");
  const pendingKey = useRef<string | null>(null);
  const opened = useRef(false);

  const h = home.data;
  const access = h && h.access ? (h as TrustToolHome) : null;
  useEffect(() => {
    if (!access || opened.current) return;
    opened.current = true;
    void api("/api/tools/trust-check", { body: { action: "event", event: "trust_check_opened", idem: newKey() } }).catch(() => undefined);
  }, [access]);

  if (home.error)
    return (
      <p role="alert" className="mt-6">
        {home.error}
      </p>
    );
  if (!h) return <p className="mt-6 text-ink-muted">Loading…</p>;
  if (!access)
    return (
      <div className={cx(box, "mt-6")}>
        <p className="font-semibold">This Work Tool is for Care Partner business owners and the people they authorise.</p>
        <p className="mt-1">{h.notice}</p>
        <p className="mt-2">
          You can practise the decisions with a fictional case: the 28-Day Trust Check in the{" "}
          <Link href="/magazine" className="font-semibold text-accent underline underline-offset-2">
            Magazine
          </Link>
          .
        </p>
      </div>
    );

  const base: BoardState = state ?? board?.state ?? { issues: {} };
  const view = board && !state ? board.demo : access.demo;
  // The board's local edits, shown over the view the server last sent.
  const issues: IssueView[] = view.issues.map((x) => {
    const local = base.issues[x.id];
    if (!local || !state) return x;
    const src = DEMO_ISSUES.find((d) => d.id === x.id)!;
    const ev = src.evidence.filter((e) => local.evidence.includes(e.id));
    return {
      ...x,
      status: local.status,
      statusLabel: WORKFLOW[local.status],
      owner: local.owner,
      ownerLabel: local.owner ? (access.owners.find((o) => o.id === local.owner)?.label ?? "") : "Not yet named",
      happened: x.happened.map((e) => ({ ...e, ticked: local.evidence.includes(e.id) })),
      moves: WORKFLOW_ORDER.map((w) => ({ id: w, label: WORKFLOW[w], why: w === local.status ? "" : workflowProblem(src, w, ev) })),
    };
  });
  const ordered = [...issues.filter((x) => x.safety), ...issues.filter((x) => !x.safety)];
  const current = issues.find((x) => x.id === picked) ?? null;

  const event = (e: string, ref = "") =>
    void api("/api/tools/trust-check", { body: { action: "event", event: e, ref, idem: newKey() } }).catch(() => undefined);
  const edit = (id: string, patch: Partial<{ status: Workflow; owner: OwnerRole | ""; evidence: string[] }>) => {
    const x = issues.find((i) => i.id === id)!;
    const now = base.issues[id] ?? { status: x.status, owner: x.owner, evidence: x.happened.filter((e) => e.ticked).map((e) => e.id) };
    setState({ issues: { ...base.issues, [id]: { ...now, ...patch } } });
    pendingKey.current = null;
    setMsg("");
    setErr("");
  };
  const save = async () => {
    setBusy(true);
    setErr("");
    pendingKey.current ??= newKey();
    try {
      const b = await api<Board & { replayed?: boolean; unchanged?: boolean }>("/api/tools/trust-check", {
        body: { id: board?.id, name: name || board?.name, state: base, idem: pendingKey.current },
      });
      setBoard(b);
      setState(null);
      pendingKey.current = null;
      setMsg(b.unchanged ? "Nothing changed since the last version." : `Saved as version ${b.version}. Private to ${access.access.orgName}.`);
    } catch (e) {
      setErr(e instanceof Error ? e.message : "That didn’t save.");
    } finally {
      setBusy(false);
    }
  };
  const open = async (id: string) => {
    setBusy(true);
    try {
      const b = await api<Board>(`/api/tools/trust-check?id=${encodeURIComponent(id)}`);
      setBoard(b);
      setState(null);
      setName(b.name);
      setMsg(`Opened version ${b.version}.`);
    } catch (e) {
      setErr(e instanceof Error ? e.message : "That didn’t open.");
    } finally {
      setBusy(false);
    }
  };
  const pick = (id: string) => {
    setPicked(id);
    event("signal_viewed", id);
    requestAnimationFrame(() => document.getElementById("tc-issue-heading")?.focus());
  };

  return (
    <div className="mt-6 flex flex-col gap-5">
      <p role="note" className={cx(warn, "flex items-start gap-2 rounded-2xl px-4 py-3 font-semibold")}>
        <Icon name="info" className="mt-0.5 size-5 shrink-0" />
        <span>{access.notice}</span>
      </p>

      <div className="grid gap-5 lg:grid-cols-[minmax(0,1fr)_minmax(0,1.3fr)]">
        <section aria-labelledby="tc-bench" className={cx("min-w-0", current ? "hidden lg:block" : "")}>
          <h2 id="tc-bench" className="font-serif text-2xl font-semibold">
            Follow-ups
          </h2>
          <p className="mt-1 text-sm text-ink-muted">
            Workflow statuses, not risk bands. Nobody here is labelled; each card names the type of problem, its owner and the next agreed contact.
          </p>
          <ul className="mt-3 flex flex-col gap-3">
            {ordered.map((x) => (
              <li key={x.id}>
                <button
                  type="button"
                  onClick={() => pick(x.id)}
                  aria-current={picked === x.id ? "true" : undefined}
                  className={cx(
                    "flex w-full flex-col gap-1 rounded-2xl bg-surface p-4 text-left ring-1 transition hover:ring-action",
                    picked === x.id ? "ring-2 ring-action" : "ring-line",
                    x.safety && "border-l-8 border-[#b42318]",
                  )}
                >
                  <span className="flex flex-wrap items-center gap-2">
                    <span className="font-semibold">{x.label}</span>
                    <span className="text-sm text-ink-muted">· {x.theme}</span>
                  </span>
                  <StatusPill status={x.status} label={x.statusLabel} />
                  {x.safety && (
                    <span className="text-sm font-semibold">Safety concern: follows the urgent clinical and incident process now, never the 28-day queue.</span>
                  )}
                  <span className="text-sm">
                    <span className="font-semibold">Owner:</span> {x.ownerLabel} · <span className="font-semibold">Last verified:</span> {x.lastVerified} ·{" "}
                    <span className="font-semibold">Next contact:</span> {x.nextContact}
                  </span>
                </button>
              </li>
            ))}
          </ul>
        </section>

        <section aria-label="The selected follow-up" className={cx("min-w-0", current ? "" : "hidden lg:block")}>
          {!current ? (
            <p className={cx(box, "text-ink-muted")}>Choose a follow-up to see what’s known, what the person said, who owns the action and what happened.</p>
          ) : (
            <IssueDetail
              x={current}
              owners={access.owners}
              busy={busy}
              onBack={() => setPicked("")}
              edit={edit}
              onEvidence={(id) => event("followup_checkpoint_viewed", id)}
            />
          )}
        </section>
      </div>

      <section aria-labelledby="tc-save" className={box}>
        <h2 id="tc-save" className="font-serif text-xl font-semibold">
          Save this board
        </h2>
        <p className="mt-1 text-sm text-ink-muted">
          Private to {access.access.orgName}. Each save is a new numbered version; nothing is overwritten. It holds statuses, owners and ticked records only.
        </p>
        <div className="mt-3 flex flex-wrap items-end gap-3">
          <label className="flex min-w-0 flex-1 flex-col gap-1 font-semibold">
            Board name
            <input className={field} value={name} maxLength={60} placeholder="For example: November follow-ups" onChange={(e) => setName(e.target.value)} />
          </label>
          <button type="button" className={primary} disabled={busy || (!board && !name.trim())} onClick={save}>
            <Icon name="check" className="size-4" /> {board ? "Save a new version" : "Save"}
          </button>
        </div>
        <p role="status" className="mt-2 text-sm">
          {msg}
        </p>
        {err && (
          <p role="alert" className={cx(bad, "mt-2 rounded-xl px-3 py-2 text-sm")}>
            {err}
          </p>
        )}
        {access.boards.length > 0 && (
          <div className="mt-3">
            <h3 className="font-semibold">Saved boards</h3>
            <ul className="mt-1 flex flex-col gap-1">
              {access.boards.map((b) => (
                <li key={b.id}>
                  <button type="button" className="min-h-11 text-left font-semibold text-accent underline underline-offset-2" onClick={() => open(b.id)}>
                    {b.name}
                  </button>{" "}
                  <span className="text-sm text-ink-muted">
                    {b.versions} {b.versions === 1 ? "version" : "versions"}
                    {b.updatedBy && ` · last by ${b.updatedBy}`}
                  </span>
                </li>
              ))}
            </ul>
          </div>
        )}
      </section>

      <AidSection snippetId="trust-check-plan" why="The check-in questions and the action plan, for real follow-ups." place="tool:trust-check" />

      <section aria-labelledby="tc-practice" className={box}>
        <h2 id="tc-practice" className="font-serif text-xl font-semibold">
          Practise a case
        </h2>
        <p className="mt-1">
          Mrs Patel’s Week 8: a fictional case with two missed cleans, a disputed charge and a worried daughter, in the{" "}
          <Link href="/magazine" className="font-semibold text-accent underline underline-offset-2">
            Magazine
          </Link>{" "}
          once it’s published. For the money side, the Quarterly Budget Decision Lab.
        </p>
      </section>

      <details className={box}>
        <summary className="min-h-11 cursor-pointer font-semibold">Before a pilot: the data sources and settings still to approve</summary>
        <h3 className="mt-3 font-semibold">Data sources (none connected)</h3>
        <ul className="mt-1 flex flex-col gap-2">
          {access.dataSources.map((s) => (
            <li key={s.id} className="text-sm">
              <span className="font-semibold">{s.label}</span> ({s.system}, owner: {s.owner}): {s.needs}.{" "}
              <span className="inline-flex items-center gap-1 font-semibold">
                <Icon name="lock" className="size-3.5" /> Not connected
              </span>
            </li>
          ))}
        </ul>
        <h3 className="mt-3 font-semibold">Settings</h3>
        <dl className="mt-1 grid gap-2 text-sm sm:grid-cols-[minmax(0,14rem)_1fr]">
          {access.settings.map((s) => (
            <div key={s.label} className="contents">
              <dt className="font-semibold">{s.label}</dt>
              <dd>
                {s.value} <span className="text-ink-muted">({s.owner})</span>
              </dd>
            </div>
          ))}
        </dl>
      </details>
    </div>
  );
}

function StatusPill({ status, label }: { status: Workflow; label: string }) {
  const look = STATUS_LOOK[status];
  return (
    <span className={cx("inline-flex w-fit items-center gap-1 rounded-full px-2.5 py-0.5 text-sm font-semibold", look.cls)}>
      <Icon name={look.icon} className="size-4" /> {label}
    </span>
  );
}

/** One follow-up's four questions. Exported for the static render checks in the tests. */
export function IssueDetail({
  x,
  owners,
  busy,
  onBack,
  edit,
  onEvidence,
}: {
  x: IssueView;
  owners: TrustToolHome["owners"];
  busy: boolean;
  onBack: () => void;
  edit: (id: string, patch: Partial<{ status: Workflow; owner: OwnerRole | ""; evidence: string[] }>) => void;
  onEvidence: (id: string) => void;
}) {
  const blocked = x.moves.filter((m) => m.why);
  return (
    <article className="flex flex-col gap-4 rounded-3xl bg-muted p-4 sm:p-5">
      <button type="button" className={cx(secondary, "w-fit lg:hidden")} onClick={onBack}>
        Back to the follow-ups
      </button>
      <header>
        <h2 id="tc-issue-heading" tabIndex={-1} className="font-serif text-2xl font-semibold">
          {x.label}: {x.theme}
        </h2>
        <StatusPill status={x.status} label={x.statusLabel} />
      </header>
      {x.safety && (
        <p className={cx(bad, "rounded-2xl px-4 py-3 font-semibold")}>
          A possible safety concern. It follows the current clinical and incident process now: it isn’t held for a 28-day check, and its status can’t be changed
          here.
        </p>
      )}

      <section aria-labelledby={`${x.id}-know`} className={box}>
        <h3 id={`${x.id}-know`} className="font-semibold">
          What do we know?
        </h3>
        <ul className="mt-2 flex flex-col gap-2">
          {x.know.map((k) => (
            <li key={k.id}>
              <p className="font-semibold">{k.title}</p>
              <p>{k.noticed}</p>
              <p className="text-sm text-ink-muted">
                {k.source} · {k.reliability} · updated {k.updated || "not given"}
              </p>
            </li>
          ))}
        </ul>
        {x.budget && (
          <table className="mt-3 w-full text-sm">
            <caption className="text-left font-semibold">The budget, kept apart (demo figures)</caption>
            <tbody>
              {x.budget.lines.map((l) => (
                <tr key={l.id} className="border-t border-line">
                  <th scope="row" className="py-1 pr-2 text-left font-normal">
                    {l.label}
                    {l.estimate && <span className="text-ink-muted"> (estimate)</span>}
                  </th>
                  <td className="py-1 text-right tabular-nums">{l.cents === null ? "Not known" : money(l.cents)}</td>
                </tr>
              ))}
            </tbody>
          </table>
        )}
        <p className="mt-3 text-sm">
          <span className="font-semibold">What the signals support:</span> {x.triage.label}. {x.triage.why.join(" ")}
        </p>
      </section>

      <section aria-labelledby={`${x.id}-said`} className={box}>
        <h3 id={`${x.id}-said`} className="font-semibold">
          What did the person say?
        </h3>
        <p className="mt-1">{x.said}</p>
      </section>

      <section aria-labelledby={`${x.id}-owns`} className={box}>
        <h3 id={`${x.id}-owns`} className="font-semibold">
          Who owns the action?
        </h3>
        <label className="mt-2 flex flex-col gap-1 text-sm font-semibold">
          Accountable owner
          <select className={field} value={x.owner} disabled={busy || x.safety} onChange={(e) => edit(x.id, { owner: e.target.value as OwnerRole | "" })}>
            <option value="">Not yet named</option>
            {owners.map((o) => (
              <option key={o.id} value={o.id}>
                {o.label}
              </option>
            ))}
          </select>
        </label>
        {x.complaintRef && (
          <p className="mt-2 text-sm">
            <span className="font-semibold">Complaint {x.complaintRef}</span> is in the complaints system, with its own owner and status. This tool links to it;
            it can’t close, withdraw or downgrade it.
          </p>
        )}
        {x.incidentRef && (
          <p className="mt-2 text-sm">
            <span className="font-semibold">Incident {x.incidentRef}</span> is in the incident system. Nothing clinical is copied here.
          </p>
        )}
      </section>

      <section aria-labelledby={`${x.id}-happened`} className={box}>
        <h3 id={`${x.id}-happened`} className="font-semibold">
          What happened?
        </h3>
        {x.happened.length ? (
          <fieldset className="mt-2">
            <legend className="text-sm text-ink-muted">Tick the records you’re relying on. A booking or a message isn’t delivery.</legend>
            <ul className="mt-1 flex flex-col gap-1">
              {x.happened.map((e) => (
                <li key={e.id}>
                  <label className="flex min-h-11 items-start gap-2">
                    <input
                      type="checkbox"
                      className="mt-1 size-5"
                      checked={e.ticked}
                      disabled={busy || x.safety}
                      onChange={(ev) => {
                        onEvidence(e.id);
                        const now = x.happened.filter((y) => y.ticked).map((y) => y.id);
                        edit(x.id, { evidence: ev.target.checked ? [...now, e.id] : now.filter((y) => y !== e.id) });
                      }}
                    />
                    <span>
                      <span className="font-semibold">{e.title}</span> ({e.kind}): {e.noticed}
                    </span>
                  </label>
                </li>
              ))}
            </ul>
          </fieldset>
        ) : (
          <p className="mt-1 text-sm text-ink-muted">No follow-up records yet.</p>
        )}
        <label className="mt-3 flex flex-col gap-1 text-sm font-semibold">
          Status
          <select className={field} value={x.status} disabled={busy || x.safety} onChange={(e) => edit(x.id, { status: e.target.value as Workflow })}>
            {x.moves.map((m) => (
              <option key={m.id} value={m.id} disabled={Boolean(m.why)}>
                {m.label}
                {m.why ? " (not yet)" : ""}
              </option>
            ))}
          </select>
        </label>
        {blocked.length > 0 && !x.safety && (
          <ul className="mt-2 flex flex-col gap-1 text-sm">
            {blocked.map((m) => (
              <li key={m.id}>
                <span className="font-semibold">{m.label}:</span> {m.why}
              </li>
            ))}
          </ul>
        )}
      </section>
    </article>
  );
}
