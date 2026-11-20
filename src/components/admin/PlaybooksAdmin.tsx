"use client";

import Link from "next/link";
import { useEffect, useState } from "react";
import { api, useApi } from "@/lib/api";
import { cx } from "@/lib/format";
import {
  GAP_STATUS,
  PB_AUDIENCES,
  RELEASE_STATUS,
  RISK,
  STEP_KINDS,
  type PbAudience,
  type ReleaseData,
  type Risk,
  type SnippetData,
  type Step,
  type StepKind,
} from "@/lib/playbook";
import type { playbookLibrary } from "@/server/playbooks";
import { AdminShell, Badge, btn, ErrorNote, Field, input } from "./ui";
import { Icon } from "../Icon";
import { AidDraftPanel, AidFields, AidOps, AidReleaseFields, AidUseReport, SimilarAids } from "./JobAidAdmin";

/*
  The playbook library for policy owners and learning authors (docs/live-playbooks.md). A snippet is a short,
  role-specific excerpt of an approved source section. Its steps change only through a release: drafted against the
  source as it is now, submitted, then approved by the owner (and Clinical and Quality for safety-critical ones),
  which every placement shows at once. A source change is flagged with a diff for the owner; readers keep the
  approved release until a new one is approved. Withdrawing a snippet switches every placement to its fallback.
*/

type Loaded = ReturnType<typeof playbookLibrary>;
type Row = Loaded["snippets"][number];
const tone = (r: string) => (r === "current" ? "good" : r === "review_due" ? "warn" : "bad");
const readinessText: Record<string, string> = { current: "Current", review_due: "Review due", fallback: "Showing fallback" };
const box = "rounded-2xl border border-line bg-surface p-4";
const area = "min-h-20 w-full rounded-xl border border-line-strong bg-surface px-3 py-2";
const blankRelease = (): ReleaseData => ({
  steps: [{ id: "s1", kind: "now", text: "", why: "", anchor: "" }],
  changeSummary: "",
  effectiveOn: "",
  reviewBy: "",
  ackRequired: false,
  quick: "",
  example: "",
  approvals: { owner: "", clinical: "", quality: "" },
  sourceVersion: 0,
  sourceChecksum: "",
  sourceText: "",
});

export function PlaybooksAdmin() {
  const lib = useApi<Loaded>("/api/admin/playbooks");
  const [open, setOpen] = useState<string | null>(null);
  // A link from the Problem desk or an export opens one Job Aid directly (?open=id).
  useEffect(() => {
    const id = new URLSearchParams(window.location.search).get("open");
    // Known only in the browser, after the page has drawn.
    // eslint-disable-next-line react-hooks/set-state-in-effect
    if (id) setOpen(id);
  }, []);
  const [problems, setProblems] = useState<string[]>([]);
  const [busy, setBusy] = useState(false);
  const act = async (body: Record<string, unknown>) => {
    setBusy(true);
    setProblems([]);
    try {
      const r = await fetch("/api/admin/playbooks", { method: "POST", headers: { "content-type": "application/json" }, body: JSON.stringify(body) });
      const j = await r.json();
      if (!r.ok) throw Object.assign(new Error(j.error), { problems: j.problems });
      lib.reload();
      return true;
    } catch (e) {
      setProblems((e as { problems?: string[] }).problems ?? [(e as Error).message]);
      return false;
    } finally {
      setBusy(false);
    }
  };

  if (lib.error)
    return (
      <AdminShell title="Job Aids">
        <ErrorNote text={lib.error} />
      </AdminShell>
    );
  if (!lib.data)
    return (
      <AdminShell title="Job Aids">
        <p className="text-ink-muted">Loading…</p>
      </AdminShell>
    );
  const data = lib.data;
  const row = data.snippets.find((s) => s.id === open);
  if (row)
    return (
      <AdminShell title={row.data.title || row.id} back={{ href: "/admin/playbooks", label: "Job Aids" }}>
        <button type="button" className={cx(btn.quiet, "-mt-4 mb-2")} onClick={() => (setOpen(null), setProblems([]))}>
          <Icon name="arrow-left" className="size-4" /> All playbooks
        </button>
        <Problems list={problems} />
        <SnippetEditor key={row.id} row={row} data={data} act={act} busy={busy} />
      </AdminShell>
    );

  const waiting = data.snippets.flatMap((s) => s.questions.filter((q) => q.status === "awaiting_review").map((q) => ({ ...q, snippet: s })));
  return (
    <AdminShell title="Job Aids">
      <p className="max-w-3xl text-ink-muted">
        Job Aids: short tools for a named task, written from an approved procedure and placed in courses and Topics by reference. Learners find them in Work
        Tools and save them to Favourites. A release needs the policy owner’s approval (and Clinical and Quality for safety-critical ones) before anyone sees
        it.{" "}
        <Link href="/tools" className="font-semibold text-accent underline">
          See Work Tools as a reader
        </Link>
        .
      </p>
      <Problems list={problems} />
      {waiting.length > 0 && (
        <section className={cx(box, "mt-4 border-[#b58a00]")} aria-labelledby="held">
          <h2 id="held" className="font-semibold">
            Questions waiting for privacy review ({waiting.length})
          </h2>
          <p className="text-sm text-ink-muted">
            Held because they might identify someone. Post them only if they don’t; otherwise decline with a note to the asker.
          </p>
          <ul className="mt-2 flex flex-col gap-2">
            {waiting.map((q) => (
              <li key={q.id} id={q.id} className="rounded-xl bg-muted p-3">
                <p className="text-xs text-ink-muted">
                  {q.snippet.data.title} · {q.issue}
                </p>
                <p className="mt-1">{q.question}</p>
                <GapButtons id={q.id} status={q.status} act={act} busy={busy} />
              </li>
            ))}
          </ul>
        </section>
      )}
      <ul className="mt-4 flex flex-col gap-2">
        {data.snippets.map((s) => (
          <li key={s.id} className={cx(box, "flex flex-wrap items-center gap-3")}>
            <div className="min-w-0 flex-1">
              <p className="font-semibold">{s.data.title || s.id}</p>
              <p className="text-sm text-ink-muted">
                {RISK[s.data.risk]} · {s.data.ownerTeam || "no owner"} · {s.current ? `release ${s.current.number} approved` : "no approved release"}
                {s.working ? ` · release ${s.working.number} ${RELEASE_STATUS[s.working.status].toLowerCase()}` : ""} · {s.placements.length}{" "}
                {s.placements.length === 1 ? "placement" : "placements"}
              </p>
            </div>
            <Badge tone={tone(s.readiness)}>{readinessText[s.readiness]}</Badge>
            {s.source.state === "changed" && <Badge tone="warn">Source changed</Badge>}
            {s.source.state === "unmapped" && <Badge tone="bad">Source unmapped</Badge>}
            {s.questions.some((q) => ["posted", "awaiting_review"].includes(q.status)) && <Badge tone="info">Open questions</Badge>}
            <button type="button" className={btn.secondary} onClick={() => setOpen(s.id)}>
              Open
            </button>
          </li>
        ))}
      </ul>
      <NewSnippet data={data} busy={busy} onMade={(id) => (lib.reload(), setOpen(id))} />
      <AidUseReport />
      <Sources data={data} act={act} busy={busy} />
      <Contacts data={data} act={act} busy={busy} />
    </AdminShell>
  );
}

type Act = (body: Record<string, unknown>) => Promise<boolean>;

function Problems({ list }: { list: string[] }) {
  if (!list.length) return null;
  return (
    <div role="alert" className="mt-3 rounded-2xl bg-[#fff1cc] p-3 text-[#4a3400] dark:bg-[#3d2f08] dark:text-[#ffd97a]">
      <p className="font-semibold">Not yet:</p>
      <ul className="list-disc pl-5">
        {list.map((p) => (
          <li key={p}>{p}</li>
        ))}
      </ul>
    </div>
  );
}

function GapButtons({ id, status, act, busy }: { id: string; status: string; act: Act; busy: boolean }) {
  const withNote = (q: string, action: string, needed: boolean) => {
    const note = window.prompt(q) ?? "";
    if (needed && note.trim().length < 3) return;
    void act({ action, gapId: id, note });
  };
  return (
    <div className="mt-2 flex flex-wrap gap-2">
      {status === "awaiting_review" && (
        <>
          <button type="button" className={btn.secondary} disabled={busy} onClick={() => void act({ action: "approve-post", gapId: id })}>
            Post it
          </button>
          <button
            type="button"
            className={btn.secondary}
            disabled={busy}
            onClick={() => withNote("Why isn’t it posted? The asker sees this.", "decline", true)}
          >
            Decline
          </button>
        </>
      )}
      {["posted", "answered"].includes(status) && (
        <button
          type="button"
          className={btn.secondary}
          disabled={busy}
          onClick={() => withNote("What will change in the procedure? (optional)", "policy-pending", false)}
        >
          Policy update pending
        </button>
      )}
      {["posted", "answered", "policy_update_pending"].includes(status) && (
        <button type="button" className={btn.secondary} disabled={busy} onClick={() => withNote("A closing note (optional)", "resolve", false)}>
          Resolve
        </button>
      )}
    </div>
  );
}

function SnippetEditor({ row, data, act, busy }: { row: Row; data: Loaded; act: Act; busy: boolean }) {
  const [sn, setSn] = useState<SnippetData>(row.data);
  const base = row.working?.data ?? row.current?.data;
  const [rel, setRel] = useState<ReleaseData>(base ? structuredClone(base) : blankRelease());
  const [dirty, setDirty] = useState(false);
  const [reply, setReply] = useState<Record<string, string>>({});
  const [replyProblem, setReplyProblem] = useState("");
  const src = data.sources.find((d) => d.id === sn.source.docId);
  const edit = (fn: (x: SnippetData) => void) => setSn((x) => (fn(x), { ...x }));
  const editRel = (fn: (x: ReleaseData) => void) => {
    setDirty(true);
    setRel((x) => {
      const y = structuredClone(x);
      fn(y);
      return y;
    });
  };
  const toggle = <T extends string>(list: T[], v: T) => (list.includes(v) ? list.filter((x) => x !== v) : [...list, v]);
  const step = (i: number, fn: (s: Step) => void) => editRel((x) => fn(x.steps[i]));
  const working = row.working;

  return (
    <div className="flex flex-col gap-4">
      <section className={box} aria-labelledby="state">
        <h2 id="state" className="font-semibold">
          Where it stands
        </h2>
        <div className="mt-2 flex flex-wrap items-center gap-2">
          <Badge tone={tone(row.readiness)}>{readinessText[row.readiness]}</Badge>
          {row.current && (
            <span className="text-sm">
              Release {row.current.number} approved {row.current.approvedAt.slice(0, 10)} · effective {row.current.data.effectiveOn} · review by{" "}
              {row.current.data.reviewBy}
            </span>
          )}
          {row.withdrawn && <span className="text-sm font-semibold">Withdrawn: {row.withdrawnReason}</span>}
        </div>
        <div className="mt-3 flex flex-wrap gap-2">
          {row.withdrawn ? (
            <button type="button" className={btn.secondary} disabled={busy} onClick={() => void act({ action: "restore", id: row.id })}>
              Restore
            </button>
          ) : (
            <button
              type="button"
              className={btn.danger}
              disabled={busy}
              onClick={() => {
                const reason = window.prompt("Why withdraw it? Every placement switches to the fallback route at once.");
                if (reason) void act({ action: "withdraw", id: row.id, reason });
              }}
            >
              Withdraw everywhere
            </button>
          )}
          <Link href={`/resources/playbooks/${row.id}`} className={btn.secondary}>
            View as a reader
          </Link>
        </div>
        {row.placements.length > 0 ? (
          <p className="mt-3 text-sm">
            Placed in:{" "}
            {row.placements.map((p, i) => (
              <span key={p.id}>
                {i > 0 && ", "}
                <Link href={`/admin/magazine/${p.id}`} className="font-semibold text-accent underline">
                  {p.title}
                </Link>
                {p.published ? "" : " (draft)"}
              </span>
            ))}
          </p>
        ) : (
          <p className="mt-3 text-sm text-ink-muted">Not placed in any course yet.</p>
        )}
        <details className="mt-2 text-sm">
          <summary className="cursor-pointer font-semibold">Release history</summary>
          <ul className="mt-1 list-disc pl-5">
            {row.history.map((h) => (
              <li key={h.number}>
                Release {h.number}: {RELEASE_STATUS[h.status]}
                {h.approvedAt ? ` ${h.approvedAt.slice(0, 10)}` : ""} · {h.summary || "no summary"}
              </li>
            ))}
          </ul>
        </details>
      </section>

      {row.source.state !== "current" && (
        <section className={cx(box, "border-[#b58a00]")} aria-labelledby="srcchg">
          <h2 id="srcchg" className="font-semibold">
            {row.source.state === "unmapped" ? "The source section can’t be found" : "The source has changed"}
          </h2>
          {row.source.state === "unmapped" ? (
            <p className="text-sm">Map the snippet to a section that exists (below) before drafting a release.</p>
          ) : (
            <>
              <p className="text-sm">
                Readers still see the approved release. Review the change, update the steps if needed, and save the draft to bind it to source version{" "}
                {row.source.version}.
              </p>
              <pre className="mt-2 overflow-x-auto whitespace-pre-wrap rounded-xl bg-muted p-3 text-sm">
                {row.source.diff.map((d, i) => (
                  <span
                    key={i}
                    className={cx(
                      "block",
                      d.kind === "add" && "bg-[#e3f4ea] dark:bg-[#12392a]",
                      d.kind === "del" && "bg-[#fde2e0] line-through dark:bg-[#3d1512]",
                    )}
                  >
                    {d.kind === "add" ? "+ " : d.kind === "del" ? "− " : "  "}
                    {d.text}
                  </span>
                ))}
              </pre>
            </>
          )}
        </section>
      )}

      <section className={box} aria-labelledby="settings">
        <h2 id="settings" className="font-semibold">
          Job Aid settings
        </h2>
        <div className="mt-2 grid gap-3 sm:grid-cols-2">
          <Field label="Title">
            <input className={input} value={sn.title} maxLength={120} onChange={(e) => edit((x) => void (x.title = e.target.value))} />
          </Field>
          <Field label="Role and setting shown on the card">
            <input className={input} value={sn.roleLabel} maxLength={120} onChange={(e) => edit((x) => void (x.roleLabel = e.target.value))} />
          </Field>
          <Field label="Purpose" className="sm:col-span-2">
            <input className={input} value={sn.purpose} maxLength={300} onChange={(e) => edit((x) => void (x.purpose = e.target.value))} />
          </Field>
          <AidFields sn={sn} edit={edit} />
          <Field label="Risk">
            <select className={input} value={sn.risk} onChange={(e) => edit((x) => void (x.risk = e.target.value as Risk))}>
              {(Object.keys(RISK) as Risk[]).map((r) => (
                <option key={r} value={r}>
                  {RISK[r]}
                </option>
              ))}
            </select>
          </Field>
          <Field label="Owning team">
            <input className={input} value={sn.ownerTeam} maxLength={80} onChange={(e) => edit((x) => void (x.ownerTeam = e.target.value))} />
          </Field>
          <fieldset className="flex flex-wrap gap-3 sm:col-span-2">
            <legend className="text-sm font-semibold">Who it’s for</legend>
            {(Object.keys(PB_AUDIENCES) as PbAudience[]).map((a) => (
              <label key={a} className="flex min-h-11 items-center gap-2 text-sm">
                <input
                  type="checkbox"
                  className="size-5"
                  checked={sn.audiences.includes(a)}
                  onChange={() => edit((x) => void (x.audiences = toggle(x.audiences, a)))}
                />
                {PB_AUDIENCES[a]}
              </label>
            ))}
          </fieldset>
          <Field label="Source record">
            <select className={input} value={sn.source.docId} onChange={(e) => edit((x) => void (x.source = { docId: e.target.value, anchor: "" }))}>
              <option value="">Choose…</option>
              {data.sources.map((d) => (
                <option key={d.id} value={d.id}>
                  {d.title} (v{d.version})
                </option>
              ))}
            </select>
          </Field>
          <Field label="Source section">
            <select className={input} value={sn.source.anchor} onChange={(e) => edit((x) => void (x.source.anchor = e.target.value))}>
              <option value="">Choose…</option>
              {src?.sections.map((s) => (
                <option key={s.anchor} value={s.anchor}>
                  {s.heading}
                </option>
              ))}
            </select>
          </Field>
          <Field label="Fallback, shown if the procedure is unavailable" className="sm:col-span-2">
            <textarea className={area} value={sn.fallback.text} maxLength={400} onChange={(e) => edit((x) => void (x.fallback.text = e.target.value))} />
          </Field>
          <fieldset className="flex flex-wrap gap-3">
            <legend className="text-sm font-semibold">Fallback contacts</legend>
            {data.contacts.map((c) => (
              <label key={c.key} className="flex min-h-11 items-center gap-2 text-sm">
                <input
                  type="checkbox"
                  className="size-5"
                  checked={sn.fallback.contactKeys.includes(c.key)}
                  onChange={() => edit((x) => void (x.fallback.contactKeys = toggle(x.fallback.contactKeys, c.key)))}
                />
                {c.label}
              </label>
            ))}
          </fieldset>
          <fieldset className="flex flex-wrap gap-3">
            <legend className="text-sm font-semibold">Contacts on the card</legend>
            {data.contacts.map((c) => (
              <label key={c.key} className="flex min-h-11 items-center gap-2 text-sm">
                <input
                  type="checkbox"
                  className="size-5"
                  checked={sn.contactKeys.includes(c.key)}
                  onChange={() => edit((x) => void (x.contactKeys = toggle(x.contactKeys, c.key)))}
                />
                {c.label}
              </label>
            ))}
          </fieldset>
        </div>
        <button type="button" className={cx(btn.primary, "mt-3")} disabled={busy} onClick={() => void act({ action: "save-snippet", id: row.id, data: sn })}>
          Save settings
        </button>
      </section>

      <section className={box} aria-labelledby="release">
        <h2 id="release" className="font-semibold">
          {working ? `Release ${working.number} (${RELEASE_STATUS[working.status].toLowerCase()})` : row.current ? "Next release" : "First release"}
        </h2>
        <p className="text-sm text-ink-muted">
          {working
            ? "Readers see the approved release until this one is approved."
            : "Starts from the approved steps. Saving creates a draft; readers see nothing new until it’s approved."}
          {" Contacts come from the directory: don’t type phone numbers into steps."}
        </p>
        {src && sn.source.anchor && (
          <details className="mt-2 text-sm">
            <summary className="cursor-pointer font-semibold">The source section, as it is now</summary>
            <p className="mt-1 whitespace-pre-line rounded-xl bg-muted p-3">{src.sections.find((s) => s.anchor === sn.source.anchor)?.text}</p>
          </details>
        )}
        <ol className="mt-3 flex flex-col gap-3">
          {rel.steps.map((s, i) => (
            <li key={s.id} className="rounded-xl bg-muted p-3">
              <div className="grid gap-2 sm:grid-cols-[10rem_1fr]">
                <Field label={`Step ${i + 1}`}>
                  <select className={input} value={s.kind} onChange={(e) => step(i, (x) => void (x.kind = e.target.value as StepKind))}>
                    {(Object.keys(STEP_KINDS) as StepKind[]).map((k) => (
                      <option key={k} value={k}>
                        {STEP_KINDS[k]}
                      </option>
                    ))}
                  </select>
                </Field>
                <Field label="What to do (one action)">
                  <input className={input} value={s.text} maxLength={400} onChange={(e) => step(i, (x) => void (x.text = e.target.value))} />
                </Field>
                <Field label="Why this matters (optional)" className="sm:col-span-2">
                  <input className={input} value={s.why} maxLength={400} onChange={(e) => step(i, (x) => void (x.why = e.target.value))} />
                </Field>
              </div>
              <div className="mt-2 flex flex-wrap gap-1">
                <button
                  type="button"
                  className={btn.quiet}
                  disabled={i === 0}
                  onClick={() => editRel((x) => void x.steps.splice(i - 1, 0, ...x.steps.splice(i, 1)))}
                >
                  <Icon name="arrow-up" className="size-4" /> Up
                </button>
                <button
                  type="button"
                  className={btn.quiet}
                  disabled={i === rel.steps.length - 1}
                  onClick={() => editRel((x) => void x.steps.splice(i + 1, 0, ...x.steps.splice(i, 1)))}
                >
                  <Icon name="arrow-down" className="size-4" /> Down
                </button>
                <button type="button" className={btn.quiet} onClick={() => editRel((x) => void x.steps.splice(i, 1))}>
                  <Icon name="trash" className="size-4" /> Remove
                </button>
              </div>
            </li>
          ))}
        </ol>
        {rel.steps.length < 9 && (
          <button
            type="button"
            className={cx(btn.secondary, "mt-2")}
            onClick={() => editRel((x) => x.steps.push({ id: `s${Date.now().toString(36)}`, kind: "then", text: "", why: "", anchor: "" }))}
          >
            <Icon name="plus" className="size-4" /> Add a step
          </button>
        )}
        <AidDraftPanel
          id={row.id}
          dirtySettings={JSON.stringify(sn) !== JSON.stringify(row.data)}
          onUse={(d) =>
            editRel((x) => {
              x.steps = d.steps.map((s, i) => ({ id: `s${Date.now().toString(36)}${i}`, kind: s.kind, text: s.text, why: s.why, anchor: sn.source.anchor }));
              x.quick = d.quick;
              x.example = d.example;
            })
          }
        />
        <div className="mt-3 grid gap-3 sm:grid-cols-3">
          <AidReleaseFields rel={rel} editRel={editRel} />
          <Field label="What changed (shown to readers)" className="sm:col-span-3">
            <input className={input} value={rel.changeSummary} maxLength={400} onChange={(e) => editRel((x) => void (x.changeSummary = e.target.value))} />
          </Field>
          <Field label="Effective from">
            <input type="date" className={input} value={rel.effectiveOn} onChange={(e) => editRel((x) => void (x.effectiveOn = e.target.value))} />
          </Field>
          <Field label="Review by">
            <input type="date" className={input} value={rel.reviewBy} onChange={(e) => editRel((x) => void (x.reviewBy = e.target.value))} />
          </Field>
          <label className="flex min-h-11 items-center gap-2 self-end text-sm">
            <input type="checkbox" className="size-5" checked={rel.ackRequired} onChange={(e) => editRel((x) => void (x.ackRequired = e.target.checked))} />
            Ask readers to acknowledge it
          </label>
          <Field label="Policy owner approval (name and role)">
            <input className={input} value={rel.approvals.owner} maxLength={120} onChange={(e) => editRel((x) => void (x.approvals.owner = e.target.value))} />
          </Field>
          <Field label="Clinical co-approval" hint={sn.risk === "safety_critical" ? "Required" : "Optional"}>
            <input
              className={input}
              value={rel.approvals.clinical}
              maxLength={120}
              onChange={(e) => editRel((x) => void (x.approvals.clinical = e.target.value))}
            />
          </Field>
          <Field label="Quality co-approval" hint={sn.risk === "safety_critical" ? "Required" : "Optional"}>
            <input
              className={input}
              value={rel.approvals.quality}
              maxLength={120}
              onChange={(e) => editRel((x) => void (x.approvals.quality = e.target.value))}
            />
          </Field>
        </div>
        {row.problems.length > 0 && !dirty && (
          <div className="mt-3 rounded-2xl bg-muted p-3 text-sm">
            <p className="font-semibold">Before it can be approved:</p>
            <ul className="list-disc pl-5">
              {row.problems.map((p) => (
                <li key={p}>{p}</li>
              ))}
            </ul>
          </div>
        )}
        <div className="mt-3 flex flex-wrap gap-2">
          <button
            type="button"
            className={btn.primary}
            disabled={busy}
            onClick={() => void act({ action: "save-release", id: row.id, data: rel }).then((ok) => ok && setDirty(false))}
          >
            Save draft
          </button>
          {working?.status === "draft" && !dirty && (
            <button type="button" className={btn.secondary} disabled={busy} onClick={() => void act({ action: "submit", id: row.id })}>
              Submit for approval
            </button>
          )}
          {working?.status === "in_review" && !dirty && (
            <button type="button" className={btn.secondary} disabled={busy} onClick={() => void act({ action: "approve", id: row.id })}>
              <Icon name="circle-check" className="size-4" /> Approve and release
            </button>
          )}
          {dirty && <span className="self-center text-sm text-ink-muted">Unsaved changes</span>}
        </div>
      </section>

      <AidOps id={row.id} released={Boolean(row.current)} />

      <section className={box} aria-labelledby="qs">
        <h2 id="qs" className="font-semibold">
          Questions ({row.questions.length})
        </h2>
        {replyProblem && (
          <p role="alert" className="mt-1 text-sm font-semibold">
            {replyProblem}
          </p>
        )}
        {row.questions.length === 0 ? (
          <p className="text-sm text-ink-muted">No questions yet.</p>
        ) : (
          <ul className="mt-2 flex flex-col gap-2">
            {row.questions.map((q) => (
              <li key={q.id} id={q.id} className="rounded-xl bg-muted p-3">
                <p className="text-xs text-ink-muted">
                  {GAP_STATUS[q.status]} · {q.issue} · release {q.releaseNumber} · {q.replies} {q.replies === 1 ? "reply" : "replies"}
                </p>
                <p className="mt-1">{q.question}</p>
                <GapButtons id={q.id} status={q.status} act={act} busy={busy} />
                {["posted", "answered", "policy_update_pending"].includes(q.status) && (
                  <div className="mt-2 flex flex-wrap items-end gap-2">
                    <Field label="Reply (general terms only)" className="min-w-56 flex-1">
                      <input className={input} value={reply[q.id] ?? ""} maxLength={1200} onChange={(e) => setReply({ ...reply, [q.id]: e.target.value })} />
                    </Field>
                    {(["lead", "policy"] as const).map((kind) => (
                      <button
                        key={kind}
                        type="button"
                        className={btn.secondary}
                        disabled={(reply[q.id] ?? "").trim().length < 3}
                        onClick={async () => {
                          setReplyProblem("");
                          try {
                            await api(`/api/playbooks/${row.id}`, { body: { action: "reply", gapId: q.id, body: reply[q.id], policy: kind === "policy" } });
                            setReply({ ...reply, [q.id]: "" });
                          } catch (e) {
                            setReplyProblem((e as Error).message);
                          }
                        }}
                      >
                        {kind === "lead" ? "Reply as lead" : "Reply as approved guidance"}
                      </button>
                    ))}
                  </div>
                )}
              </li>
            ))}
          </ul>
        )}
      </section>
    </div>
  );
}

function NewSnippet({ data, busy, onMade }: { data: Loaded; busy: boolean; onMade: (id: string) => void }) {
  const [title, setTitle] = useState("");
  return (
    <section className={cx(box, "mt-6")} aria-labelledby="new">
      <h2 id="new" className="font-semibold">
        New Job Aid
      </h2>
      <p className="text-sm text-ink-muted">One aid per task. Before starting one, check whether an existing aid should be reused or revised.</p>
      <div className="mt-2 flex flex-wrap items-end gap-2">
        <Field label="Title" className="min-w-64 flex-1">
          <input className={input} value={title} maxLength={120} onChange={(e) => setTitle(e.target.value)} />
        </Field>
        <button
          type="button"
          className={btn.secondary}
          disabled={busy || title.trim().length < 3}
          onClick={async () => {
            const r = await fetch("/api/admin/playbooks", {
              method: "POST",
              headers: { "content-type": "application/json" },
              body: JSON.stringify({
                action: "save-snippet",
                data: {
                  title,
                  audiences: ["staff"],
                  risk: "operational",
                  source: { docId: data.sources[0]?.id ?? "", anchor: "" },
                  fallback: { text: "", contactKeys: [] },
                },
              }),
            });
            const j = await r.json();
            if (r.ok && j.id) {
              setTitle("");
              onMade(j.id);
            }
          }}
        >
          <Icon name="plus" className="size-4" /> Create
        </button>
      </div>
      <SimilarAids title={title} onOpen={onMade} />
    </section>
  );
}

function Sources({ data, act, busy }: { data: Loaded; act: Act; busy: boolean }) {
  const [editing, setEditing] = useState<{ docId: string; anchor: string; text: string } | null>(null);
  return (
    <section className={cx(box, "mt-4")} aria-labelledby="sources">
      <h2 id="sources" className="font-semibold">
        Source records
      </h2>
      <p className="text-sm text-ink-muted">
        The approved procedure text that snippets are drawn from. Editing a section creates a new source version and flags every snippet drawn from it for its
        owner. Readers keep the approved release until a new one is approved.
      </p>
      {data.sources.map((d) => (
        <div key={d.id} className="mt-3">
          <p className="font-semibold">
            {d.title}{" "}
            <span className="font-normal text-ink-muted">
              · {d.system} · owner {d.owner} · version {d.version}
            </span>
          </p>
          <ul className="mt-1 flex flex-col gap-2">
            {d.sections.map((s) => (
              <li key={s.anchor} className="rounded-xl bg-muted p-3 text-sm">
                <p className="font-semibold">{s.heading}</p>
                {editing?.docId === d.id && editing.anchor === s.anchor ? (
                  <>
                    <textarea className={cx(area, "mt-1 min-h-40")} value={editing.text} onChange={(e) => setEditing({ ...editing, text: e.target.value })} />
                    <div className="mt-2 flex gap-2">
                      <button
                        type="button"
                        className={btn.primary}
                        disabled={busy}
                        onClick={() => void act({ action: "save-source", ...editing }).then((ok) => ok && setEditing(null))}
                      >
                        Save as a new version
                      </button>
                      <button type="button" className={btn.secondary} onClick={() => setEditing(null)}>
                        Cancel
                      </button>
                    </div>
                  </>
                ) : (
                  <>
                    <p className="mt-1 whitespace-pre-line">{s.text}</p>
                    <button type="button" className={cx(btn.quiet, "mt-1")} onClick={() => setEditing({ docId: d.id, anchor: s.anchor, text: s.text })}>
                      <Icon name="pen" className="size-4" /> Edit section
                    </button>
                  </>
                )}
              </li>
            ))}
          </ul>
        </div>
      ))}
    </section>
  );
}

function Contacts({ data, act, busy }: { data: Loaded; act: Act; busy: boolean }) {
  const [draft, setDraft] = useState<Record<string, Record<PbAudience, string>>>(() => Object.fromEntries(data.contacts.map((c) => [c.key, { ...c.routes }])));
  return (
    <section className={cx(box, "mt-4")} aria-labelledby="contacts">
      <h2 id="contacts" className="font-semibold">
        Contact directory
      </h2>
      <p className="text-sm text-ink-muted">
        Escalation routes by role. Playbook steps point here instead of carrying phone numbers, so a change reaches every card at once. A release can’t be
        approved while a contact it uses is blank for one of its audiences.
      </p>
      {data.contacts.map((c) => (
        <div key={c.key} className="mt-3 rounded-xl bg-muted p-3">
          <p className="font-semibold">{c.label}</p>
          <div className="mt-1 grid gap-2 sm:grid-cols-3">
            {(Object.keys(PB_AUDIENCES) as PbAudience[]).map((a) => (
              <Field key={a} label={PB_AUDIENCES[a]}>
                <input
                  className={input}
                  value={draft[c.key]?.[a] ?? ""}
                  maxLength={200}
                  onChange={(e) => setDraft({ ...draft, [c.key]: { ...draft[c.key], [a]: e.target.value } })}
                />
              </Field>
            ))}
          </div>
          <button
            type="button"
            className={cx(btn.secondary, "mt-2")}
            disabled={busy}
            onClick={() => void act({ action: "save-contact", key: c.key, routes: draft[c.key] })}
          >
            Save routes
          </button>
        </div>
      ))}
    </section>
  );
}
