"use client";

import Link from "next/link";
import { useRouter } from "next/navigation";
import { useMemo, useState } from "react";
import { api, useApi } from "@/lib/api";
import { confirmAction } from "@/lib/confirm";
import { cx, formatDate } from "@/lib/format";
import {
  ASSESSMENT_METHODS,
  CLASSIFICATIONS,
  EVIDENCE,
  EXPIRY,
  RECURRENCES,
  STATUS_LABELS,
  TEST_OUT,
  validMonths,
  type AssessmentMethod,
  type RegisterSettings,
  type RegisterStatus,
} from "@/lib/complianceRegister";
import { AdminShell, Badge, btn, ErrorNote, Field, input } from "./ui";
import { Icon } from "../Icon";

/*
  The compliance register: every mandatory topic with the organisation's rules for it, who is
  trained, what they demonstrated, when they completed it and when they need refreshing.
*/

type Counts = Record<RegisterStatus, number>;
type TopicSummary = {
  slug: string;
  title: string;
  version: string;
  settings: RegisterSettings;
  people: number;
  counts: Counts;
  policyChanged: boolean;
  updatedAt: string;
};
type Approval = {
  id: number;
  userId: string;
  name: string;
  org: string;
  slug: string;
  topic: string;
  path: string;
  score: number;
  total: number;
  percent: number;
  at: string;
};
type ListData = { topics: TopicSummary[]; approvals: Approval[]; canEdit: boolean; available: { slug: string; title: string }[] };
type PersonRow = {
  userId: string;
  name: string;
  email: string;
  org: string;
  status: RegisterStatus;
  statusLabel: string;
  completedAt: string | null;
  version: string | null;
  expiresAt: string | null;
  daysLeft: number | null;
  demonstrated: string[];
  missing: string[];
  pendingTestOut: { id: number; score: number; total: number; at: string } | null;
};
type TopicData = {
  slug: string;
  title: string;
  version: string;
  settings: RegisterSettings;
  detected: AssessmentMethod[];
  policyChanged: boolean;
  counts: Counts;
  people: PersonRow[];
  updatedAt: string;
  updatedBy: string;
  canEdit: boolean;
};

const TONE: Record<RegisterStatus, "good" | "warn" | "bad" | "info" | "neutral"> = {
  current: "good",
  due_soon: "warn",
  expired: "bad",
  refresher: "warn",
  evidence: "warn",
  approval: "info",
  in_progress: "neutral",
  not_trained: "neutral",
};
// The order they're listed in: what needs action first.
const ORDER: RegisterStatus[] = ["expired", "refresher", "evidence", "approval", "due_soon", "not_trained", "in_progress", "current"];
const recurrenceLabel = (months: number) => RECURRENCES.find((r) => r.months === months)?.label ?? `Every ${months} months`;
const trained = (c: Counts) => c.current + c.due_soon;

/** Approves or declines a test-out, after asking. */
async function decide(a: { id: number; name: string; topic: string; score: number; total: number }, approve: boolean) {
  const ok = await confirmAction(
    approve
      ? `${a.topic} will count as complete for ${a.name}, from the day they took the quiz (${a.score}/${a.total}).`
      : `${a.name} will need to work through ${a.topic} to complete it.`,
    approve
      ? { title: `Approve ${a.name}’s test-out?`, confirmLabel: "Approve" }
      : { title: `Decline ${a.name}’s test-out?`, confirmLabel: "Decline", danger: true },
  );
  if (!ok) return false;
  await api("/api/admin/compliance", { body: { action: "decide", id: a.id, approve } });
  return true;
}

export function ComplianceRegister() {
  const router = useRouter();
  const { data, error, reload } = useApi<ListData>("/api/admin/compliance");
  const [adding, setAdding] = useState("");
  const [busy, setBusy] = useState(false);
  const [actError, setActError] = useState<string | null>(null);

  const totals = useMemo(() => {
    const t = { people: 0, trained: 0, dueSoon: 0, overdue: 0 };
    for (const x of data?.topics ?? []) {
      t.people += x.people;
      t.trained += trained(x.counts);
      t.dueSoon += x.counts.due_soon;
      t.overdue += x.counts.expired + x.counts.refresher;
    }
    return t;
  }, [data]);

  async function run(fn: () => Promise<unknown>) {
    setBusy(true);
    setActError(null);
    try {
      await fn();
      reload();
    } catch (e) {
      setActError((e as Error).message);
    } finally {
      setBusy(false);
    }
  }

  return (
    <AdminShell title="Compliance register">
      <p className="max-w-3xl text-ink-muted">
        Mandatory topics and the rules for each: how often it’s redone, how people are assessed, whether they can test out, who owns the competency and what
        counts as evidence. See who is trained, what they demonstrated, when they completed it and when they need refreshing.
      </p>
      {(error || actError) && (
        <div className="mt-4">
          <ErrorNote text={(error || actError)!} />
        </div>
      )}
      {!data ? (
        <p className="mt-6 text-ink-muted">Loading…</p>
      ) : (
        <div className="mt-6 flex flex-col gap-6">
          <dl className="grid grid-cols-2 gap-3 sm:grid-cols-4">
            {(
              [
                ["Topics on the register", String(data.topics.length)],
                ["Trained", totals.people ? `${Math.round((totals.trained / totals.people) * 100)}%` : "–"],
                ["Due in the next month", String(totals.dueSoon)],
                ["Expired or needs refresher", String(totals.overdue)],
              ] as const
            ).map(([label, n]) => (
              <div key={label} className="rounded-2xl border border-line bg-surface p-4">
                <dt className="text-sm text-ink-muted">{label}</dt>
                <dd className="font-serif text-3xl font-semibold">{n}</dd>
              </div>
            ))}
          </dl>

          {data.approvals.length > 0 && (
            <section aria-labelledby="approvals" className="rounded-3xl border-2 border-gold bg-surface p-4 sm:p-5">
              <h2 id="approvals" className="font-serif text-xl font-semibold">
                Test-outs waiting for approval <span className="text-ink-muted">({data.approvals.length})</span>
              </h2>
              <p className="mt-1 text-sm text-ink-muted">
                These people passed a path’s upfront quiz covering a topic that needs the competency owner’s approval. Until it’s approved, the topic isn’t
                complete for them.
              </p>
              <ul className="mt-3 flex flex-col divide-y divide-line">
                {data.approvals.map((a) => (
                  <li key={a.id} className="flex flex-wrap items-center justify-between gap-3 py-3">
                    <div className="min-w-0">
                      <p className="font-semibold">
                        {a.name} <span className="font-normal text-ink-muted">· {a.org}</span>
                      </p>
                      <p className="text-sm text-ink-muted">
                        {a.topic} · {a.score}/{a.total} ({a.percent}%) on the “{a.path}” quiz · {formatDate(a.at)}
                      </p>
                    </div>
                    {data.canEdit && (
                      <div className="flex gap-2">
                        <button type="button" className={btn.primary} disabled={busy} onClick={() => run(() => decide(a, true))}>
                          Approve
                        </button>
                        <button type="button" className={btn.secondary} disabled={busy} onClick={() => run(() => decide(a, false))}>
                          Decline
                        </button>
                      </div>
                    )}
                  </li>
                ))}
              </ul>
            </section>
          )}

          {data.topics.length === 0 ? (
            <p className="max-w-2xl rounded-3xl border border-line p-6 text-ink-muted">
              Nothing is on the register yet. {data.canEdit ? "Add a mandatory topic below to set its rules." : "A learning author adds mandatory topics here."}
            </p>
          ) : (
            <ul className="flex flex-col gap-3">
              {data.topics.map((t) => (
                <TopicCard key={t.slug} t={t} />
              ))}
            </ul>
          )}

          <div className="flex flex-wrap items-end gap-3">
            {data.canEdit && data.available.length > 0 && (
              <>
                <label className="flex min-w-0 flex-col gap-1 text-sm font-semibold">
                  Add a topic to the register
                  <select className={cx(input, "min-w-0 sm:w-96")} value={adding} onChange={(e) => setAdding(e.target.value)}>
                    <option value="">Choose a topic…</option>
                    {data.available.map((l) => (
                      <option key={l.slug} value={l.slug}>
                        {l.title}
                      </option>
                    ))}
                  </select>
                </label>
                <button
                  type="button"
                  className={btn.primary}
                  disabled={!adding || busy}
                  onClick={() =>
                    run(async () => {
                      await api("/api/admin/compliance", { body: { action: "add", slug: adding } });
                      router.push(`/admin/compliance/${encodeURIComponent(adding)}`);
                    })
                  }
                >
                  <Icon name="plus" className="size-4" /> Add to register
                </button>
              </>
            )}
            {data.topics.length > 0 && (
              <a href="/api/admin/compliance/csv" className={btn.secondary} download>
                <Icon name="doc" className="size-4" /> Download the register (CSV)
              </a>
            )}
          </div>
        </div>
      )}
    </AdminShell>
  );
}

function TopicCard({ t }: { t: TopicSummary }) {
  const s = t.settings;
  const percent = t.people ? Math.round((trained(t.counts) / t.people) * 100) : 0;
  return (
    <li>
      <Link
        href={`/admin/compliance/${encodeURIComponent(t.slug)}`}
        className="block rounded-3xl border border-line bg-surface p-4 hover:border-line-strong sm:p-5"
      >
        <div className="flex flex-wrap items-start justify-between gap-2">
          <div className="min-w-0">
            <div className="flex flex-wrap gap-1.5">
              <Badge tone={s.classification === "recommended" ? "neutral" : "info"}>{CLASSIFICATIONS[s.classification]}</Badge>
              {t.policyChanged && <Badge tone="warn">Topic changed since policy approval</Badge>}
            </div>
            <h2 className="mt-2 font-serif text-xl font-semibold leading-snug">{t.title}</h2>
            <p className="mt-1 text-sm text-ink-muted">
              {recurrenceLabel(s.recurrenceMonths)} · Test-out: {TEST_OUT[s.testOut].toLowerCase()} · Owner: {s.owner || "not set"}
              {s.policyName && ` · ${s.policyName}${s.policyVersion ? ` ${s.policyVersion}` : ""}`}
            </p>
          </div>
          <span className="font-serif text-2xl font-semibold tabular-nums">{percent}%</span>
        </div>
        <div className="mt-3 h-2 overflow-hidden rounded-full bg-muted" role="img" aria-label={`${trained(t.counts)} of ${t.people} people trained`}>
          <div className="h-full rounded-full bg-[#0e7c7b]" style={{ width: `${percent}%` }} />
        </div>
        <p className="mt-2 flex flex-wrap gap-x-3 gap-y-1 text-xs text-ink-muted">
          <span>
            {trained(t.counts)} of {t.people} trained
          </span>
          {ORDER.filter((k) => k !== "current" && t.counts[k]).map((k) => (
            <span key={k} className={cx((k === "expired" || k === "refresher") && "font-semibold text-danger")}>
              {t.counts[k]} {STATUS_LABELS[k].toLowerCase()}
            </span>
          ))}
        </p>
      </Link>
    </li>
  );
}

/* One topic on the register: its settings, and every person's record. */
export function RegisterTopic({ slug }: { slug: string }) {
  const { data, error, reload } = useApi<TopicData>(`/api/admin/compliance/${encodeURIComponent(slug)}`);
  return (
    <AdminShell title={data?.title ?? "Compliance register"} back={{ href: "/admin/compliance", label: "Compliance register" }}>
      {error ? (
        <ErrorNote text={error} />
      ) : !data ? (
        <p className="text-ink-muted">Loading…</p>
      ) : (
        <div className="grid gap-6 lg:grid-cols-[minmax(0,1fr)_26rem]">
          <People data={data} reload={reload} />
          <aside>
            <SettingsForm key={data.updatedAt} data={data} reload={reload} />
          </aside>
        </div>
      )}
    </AdminShell>
  );
}

function People({ data, reload }: { data: TopicData; reload: () => void }) {
  const [show, setShow] = useState<RegisterStatus | "all">("all");
  const [q, setQ] = useState("");
  const [busy, setBusy] = useState(false);
  const [actError, setActError] = useState<string | null>(null);
  const needle = q.trim().toLowerCase();
  const rows = data.people
    .filter((p) => (show === "all" || p.status === show) && (!needle || `${p.name} ${p.org} ${p.email}`.toLowerCase().includes(needle)))
    .sort(
      (a, b) => ORDER.indexOf(a.status) - ORDER.indexOf(b.status) || (a.expiresAt ?? "9").localeCompare(b.expiresAt ?? "9") || a.name.localeCompare(b.name),
    );
  const months = validMonths(data.settings);

  return (
    <section aria-labelledby="people" className="flex min-w-0 flex-col gap-4">
      <div className="flex flex-wrap items-baseline justify-between gap-2">
        <h2 id="people" className="font-serif text-2xl font-semibold">
          Who is trained
        </h2>
        <a href={`/api/admin/compliance/csv?topic=${encodeURIComponent(data.slug)}`} className="text-sm font-semibold text-accent hover:underline" download>
          Download CSV
        </a>
      </div>
      <p className="-mt-2 text-sm text-ink-muted">
        {months ? `Training lasts ${months === 12 ? "a year" : `${months} months`} from completion.` : "Training doesn’t expire."} Live version {data.version}.
      </p>
      {actError && <ErrorNote text={actError} />}
      <div className="flex flex-wrap gap-1" role="group" aria-label="Filter by status">
        {(["all", ...ORDER] as const)
          .filter((k) => k === "all" || data.counts[k] > 0)
          .map((k) => (
            <button
              key={k}
              type="button"
              aria-pressed={show === k}
              onClick={() => setShow(k)}
              className={cx(
                "min-h-9 rounded-full border px-3 text-sm font-semibold",
                show === k ? "border-action bg-action text-on-action" : "border-line-strong text-ink-muted hover:text-ink",
              )}
            >
              {k === "all" ? `Everyone ${data.people.length}` : `${STATUS_LABELS[k]} ${data.counts[k]}`}
            </button>
          ))}
      </div>
      {data.people.length > 6 && (
        <input type="search" className={input} placeholder="Search by name, email or organisation" value={q} onChange={(e) => setQ(e.target.value)} />
      )}
      {!rows.length ? (
        <p className="rounded-2xl border border-line p-4 text-ink-muted">{data.people.length ? "Nobody matches." : "Nobody this topic applies to yet."}</p>
      ) : (
        <ul className="flex flex-col divide-y divide-line rounded-3xl border border-line bg-surface">
          {rows.map((p) => (
            <li key={p.userId} className="grid gap-2 p-4 sm:grid-cols-[minmax(0,1fr)_11rem]">
              <div className="min-w-0">
                <div className="flex flex-wrap items-center gap-2">
                  <span className="font-semibold">{p.name}</span>
                  <Badge tone={TONE[p.status]}>{p.statusLabel}</Badge>
                </div>
                <p className="text-xs text-ink-muted">
                  {p.org} · {p.email}
                </p>
                {p.demonstrated.length > 0 && (
                  <ul className="mt-2 flex flex-col gap-1 text-sm">
                    {p.demonstrated.map((d) => (
                      <li key={d} className="flex items-start gap-2">
                        <Icon name="check" className="mt-0.5 size-4 shrink-0 text-accent" />
                        <span>{d}</span>
                      </li>
                    ))}
                  </ul>
                )}
                {p.missing.length > 0 && <p className="mt-1 text-sm text-danger">Still needs {p.missing.join(" and ")}.</p>}
                {p.status === "refresher" && <p className="mt-1 text-sm">The topic has had an important change since they did version {p.version}.</p>}
                {p.pendingTestOut && data.canEdit && (
                  <div className="mt-2 flex flex-wrap gap-2">
                    {([true, false] as const).map((approve) => (
                      <button
                        key={String(approve)}
                        type="button"
                        className={approve ? btn.primary : btn.secondary}
                        disabled={busy}
                        onClick={async () => {
                          setBusy(true);
                          setActError(null);
                          try {
                            if (await decide({ ...p.pendingTestOut!, name: p.name, topic: data.title }, approve)) reload();
                          } catch (e) {
                            setActError((e as Error).message);
                          } finally {
                            setBusy(false);
                          }
                        }}
                      >
                        {approve ? "Approve test-out" : "Decline"}
                      </button>
                    ))}
                  </div>
                )}
              </div>
              <dl className="grid grid-cols-2 gap-x-3 text-sm sm:grid-cols-1 sm:text-right">
                <div>
                  <dt className="text-xs text-ink-muted">Completed</dt>
                  <dd>{p.completedAt ? `${formatDate(p.completedAt)} · v${p.version}` : "–"}</dd>
                </div>
                <div className="sm:mt-1">
                  <dt className="text-xs text-ink-muted">Refresh by</dt>
                  <dd className={cx(p.status === "expired" && "font-semibold text-danger")}>
                    {p.expiresAt ? formatDate(p.expiresAt) : p.completedAt ? "Doesn’t expire" : "–"}
                    {p.daysLeft !== null && p.completedAt && (
                      <span className="block text-xs text-ink-muted">
                        {p.daysLeft > 0 ? `in ${p.daysLeft} ${p.daysLeft === 1 ? "day" : "days"}` : p.daysLeft === 0 ? "today" : `${-p.daysLeft} days ago`}
                      </span>
                    )}
                  </dd>
                </div>
              </dl>
            </li>
          ))}
        </ul>
      )}
    </section>
  );
}

function SettingsForm({ data, reload }: { data: TopicData; reload: () => void }) {
  const router = useRouter();
  const [s, setS] = useState<RegisterSettings>(data.settings);
  const [dirty, setDirty] = useState(false);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [notice, setNotice] = useState<string | null>(null);
  const set = (patch: Partial<RegisterSettings>) => {
    setS((x) => ({ ...x, ...patch }));
    setDirty(true);
    setNotice(null);
  };
  const select = "min-h-11 w-full rounded-xl border border-line-strong bg-surface px-3 text-[0.98rem]";

  async function save() {
    setBusy(true);
    setError(null);
    try {
      await api(`/api/admin/compliance/${encodeURIComponent(data.slug)}`, { method: "PUT", body: s });
      setDirty(false);
      setNotice("Saved. Everyone’s status is worked out again from these rules.");
      reload();
    } catch (e) {
      setError((e as Error).message);
    } finally {
      setBusy(false);
    }
  }

  return (
    <section aria-labelledby="register-settings" className="rounded-3xl border border-line bg-surface p-5 lg:sticky lg:top-24">
      <h2 id="register-settings" className="font-serif text-xl font-semibold">
        Register settings
      </h2>
      <p className="mt-1 text-sm text-ink-muted">
        Last changed by {data.updatedBy}, {formatDate(data.updatedAt)}.
      </p>
      <fieldset disabled={!data.canEdit} className="mt-4 grid gap-4">
        <Field label="Topic classification">
          <select className={select} value={s.classification} onChange={(e) => set({ classification: e.target.value as RegisterSettings["classification"] })}>
            {Object.entries(CLASSIFICATIONS).map(([k, v]) => (
              <option key={k} value={k}>
                {v}
              </option>
            ))}
          </select>
        </Field>
        <Field label="Recurrence" hint="How often people have to do it again.">
          <select className={select} value={s.recurrenceMonths} onChange={(e) => set({ recurrenceMonths: Number(e.target.value) })}>
            {RECURRENCES.map((r) => (
              <option key={r.months} value={r.months}>
                {r.label}
              </option>
            ))}
          </select>
        </Field>
        <fieldset>
          <legend className="text-sm font-semibold">Assessment method</legend>
          <p className="text-xs text-ink-muted">Ticked from what the topic’s cards use; change it if the assessment happens elsewhere too.</p>
          <div className="mt-2 grid grid-cols-2 gap-1.5">
            {(Object.keys(ASSESSMENT_METHODS) as AssessmentMethod[]).map((m) => (
              <label key={m} className="flex min-h-10 items-center gap-2 text-sm">
                <input
                  type="checkbox"
                  className="size-5 accent-[var(--action)]"
                  checked={s.assessment.includes(m)}
                  onChange={(e) => set({ assessment: e.target.checked ? [...s.assessment, m] : s.assessment.filter((x) => x !== m) })}
                />
                <span>
                  {ASSESSMENT_METHODS[m]}
                  {data.detected.includes(m) && <span className="block text-xs text-ink-muted">In the topic</span>}
                </span>
              </label>
            ))}
          </div>
        </fieldset>
        <Field label="Test-out allowed" hint="What a pass of a learning path’s upfront quiz does for this topic.">
          <select className={select} value={s.testOut} onChange={(e) => set({ testOut: e.target.value as RegisterSettings["testOut"] })}>
            {Object.entries(TEST_OUT).map(([k, v]) => (
              <option key={k} value={k}>
                {v}
              </option>
            ))}
          </select>
        </Field>
        <p className="-mt-2 text-xs text-ink-muted">
          {s.testOut === "allowed"
            ? "A pass completes the topic straight away."
            : s.testOut === "approval"
              ? "A pass waits for the competency owner to approve it on the register before the topic counts as complete."
              : "Everyone works through the topic, even after passing a path’s upfront quiz."}
        </p>
        <Field label="Competency owner" hint="The team or person accountable, e.g. Compliance team.">
          <input className={input} value={s.owner} maxLength={120} onChange={(e) => set({ owner: e.target.value })} />
        </Field>
        <Field label="Completion evidence" hint="What has to be on record for someone to count as trained.">
          <select className={select} value={s.evidence} onChange={(e) => set({ evidence: e.target.value as RegisterSettings["evidence"] })}>
            {Object.entries(EVIDENCE).map(([k, v]) => (
              <option key={k} value={k}>
                {v}
              </option>
            ))}
          </select>
        </Field>
        <Field label="Expiry">
          <select className={select} value={s.expiry} onChange={(e) => set({ expiry: e.target.value as RegisterSettings["expiry"] })}>
            {Object.entries(EXPIRY).map(([k, v]) => (
              <option key={k} value={k}>
                {v}
              </option>
            ))}
          </select>
        </Field>
        {s.expiry === "months" && (
          <Field label="Training lasts (months)">
            <input
              type="number"
              min={1}
              max={120}
              className={input}
              value={s.expiryMonths ?? ""}
              onChange={(e) => set({ expiryMonths: e.target.value ? Number(e.target.value) : null })}
            />
          </Field>
        )}
        {s.expiry === "cycle" && !s.recurrenceMonths && <p className="-mt-2 text-xs text-ink-muted">Once only, so training doesn’t expire.</p>}
        <Field label="Due soon from (days before expiry)">
          <input type="number" min={0} max={180} className={input} value={s.dueSoonDays} onChange={(e) => set({ dueSoonDays: Number(e.target.value) })} />
        </Field>

        <fieldset className="rounded-2xl border border-line p-3">
          <legend className="px-1 text-sm font-semibold">Content version, linked to approved policy</legend>
          <div className="grid gap-3">
            <Field label="Policy">
              <input
                className={input}
                value={s.policyName}
                maxLength={160}
                placeholder="e.g. Incident Management Policy"
                onChange={(e) => set({ policyName: e.target.value })}
              />
            </Field>
            <div className="grid grid-cols-[7rem_minmax(0,1fr)] gap-3">
              <Field label="Version">
                <input
                  className={input}
                  value={s.policyVersion}
                  maxLength={40}
                  placeholder="e.g. v3.2"
                  onChange={(e) => set({ policyVersion: e.target.value })}
                />
              </Field>
              <Field label="Link">
                <input className={input} value={s.policyUrl} maxLength={500} placeholder="https://…" onChange={(e) => set({ policyUrl: e.target.value })} />
              </Field>
            </div>
            <p className="text-sm">
              {s.approvedVersion ? (
                <>
                  Topic version <strong>{s.approvedVersion}</strong> is approved against this policy.
                  {s.approvedVersion !== data.version && (
                    <span className="block text-danger">The live topic is now version {data.version}: check it still matches.</span>
                  )}
                </>
              ) : (
                <span className="text-ink-muted">No topic version has been approved against the policy yet.</span>
              )}
            </p>
            {s.approvedVersion !== data.version && data.canEdit && (
              <button type="button" className={btn.secondary} onClick={() => set({ approvedVersion: data.version })}>
                <Icon name="check" className="size-4" /> Approve version {data.version} against the policy
              </button>
            )}
            {s.policyUrl && (
              <a
                href={s.policyUrl}
                target="_blank"
                rel="noreferrer"
                className="inline-flex items-center gap-1 text-sm font-semibold text-accent hover:underline"
              >
                Open the policy <Icon name="external" className="size-4" />
              </a>
            )}
          </div>
        </fieldset>
      </fieldset>
      {error && (
        <div className="mt-4">
          <ErrorNote text={error} />
        </div>
      )}
      {notice && (
        <p role="status" className="mt-4 rounded-2xl bg-tealtint p-3 text-sm">
          {notice}
        </p>
      )}
      {data.canEdit && (
        <div className="mt-4 flex flex-wrap gap-2">
          <button type="button" className={btn.primary} disabled={!dirty || busy} onClick={save}>
            {busy ? "Saving…" : "Save settings"}
          </button>
          <button
            type="button"
            className={btn.quiet}
            disabled={busy}
            onClick={async () => {
              if (
                !(await confirmAction("Completions and test-out decisions stay on record. You can add the topic back at any time.", {
                  title: `Take “${data.title}” off the register?`,
                  confirmLabel: "Take it off",
                  danger: true,
                }))
              )
                return;
              try {
                await api(`/api/admin/compliance/${encodeURIComponent(data.slug)}`, { method: "DELETE" });
                router.push("/admin/compliance");
              } catch (e) {
                setError((e as Error).message);
              }
            }}
          >
            Take off the register
          </button>
        </div>
      )}
    </section>
  );
}
