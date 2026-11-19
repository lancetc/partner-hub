"use client";

import { usePathname, useRouter, useSearchParams } from "next/navigation";
import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { api, useApi } from "@/lib/api";
import { cx, formatDate, formatDateTime } from "@/lib/format";
import { MIN_SAMPLE, POOL_KINDS, QUERY_KEYS, STATUSES, SURFACES, VIEWS, type PoolQuery, type SortKey } from "@/lib/questionPool";
import type { listPool, PoolRow } from "@/server/questionPool";
import { AdminShell, Badge, btn, ErrorNote, input } from "./ui";
import { Icon } from "../Icon";
import { QuestionPanel } from "./QuestionPoolPanel";
import { PoolCoverage, PoolSources } from "./QuestionPoolCoverage";

/*
  The Question Pool (docs/question-pool.md): every question in the Hub's native quizzes, knowledge checks and
  practice, in one live table. Filtering, sorting and paging happen on the server, across the whole result;
  the filters live in the address, so a copied link shows the same view, and Export Excel uses them too.
*/

type List = ReturnType<typeof listPool>;
const COLUMNS: { key: SortKey; label: string; className?: string }[] = [
  { key: "id", label: "ID and title" },
  { key: "kind", label: "Question and type" },
  { key: "topic", label: "Topic and audience" },
  { key: "risk", label: "Risk and source" },
  { key: "status", label: "Status and owner" },
  { key: "review", label: "Approved and next review" },
  { key: "used", label: "Used in" },
  { key: "attempted", label: "Answers" },
];

const signalText = (r: PoolRow) => {
  const n = r.signals.reduce((a, s) => a + s.attempts, 0);
  if (!n) return "No answers yet";
  const c = r.signals.reduce((a, s) => a + s.correct, 0);
  return n >= MIN_SAMPLE ? `${Math.round((c / n) * 100)}% right of ${n}` : `${n} answer${n === 1 ? "" : "s"}: too few for a rate`;
};

export function QuestionPool() {
  const router = useRouter();
  const pathname = usePathname();
  const params = useSearchParams();
  const tab = params.get("tab") === "coverage" ? "coverage" : params.get("tab") === "sources" ? "sources" : "questions";
  const query = useMemo(() => Object.fromEntries(QUERY_KEYS.map((k) => [k, params.get(k) ?? ""]).filter(([, v]) => v)) as PoolQuery, [params]);
  const qs = useMemo(() => new URLSearchParams(query as Record<string, string>).toString(), [query]);
  const { data, error, reload } = useApi<List>(tab === "questions" ? `/api/admin/questions?${qs}` : null);
  const [open, setOpen] = useState<string | null>(params.get("open"));
  const [selected, setSelected] = useState<string[]>([]);
  const [search, setSearch] = useState(query.q ?? "");
  const [busy, setBusy] = useState<string | null>(null);
  const [notice, setNotice] = useState<string | null>(null);
  const lastFocus = useRef<HTMLElement | null>(null);

  /** Changes the filters in the address (so the view can be linked to), back on page 1 unless paging. */
  const setQuery = useCallback(
    (patch: Record<string, string | null>, keepPage = false) => {
      const next = new URLSearchParams(params.toString());
      for (const [k, v] of Object.entries(patch)) {
        if (v) next.set(k, v);
        else next.delete(k);
      }
      if (!keepPage) next.delete("page");
      router.replace(`${pathname}?${next.toString()}`, { scroll: false });
    },
    [params, pathname, router],
  );

  // Search as you type, after a pause.
  useEffect(() => {
    if (search === (query.q ?? "")) return;
    const t = setTimeout(() => setQuery({ q: search || null }), 350);
    return () => clearTimeout(t);
  }, [search, query.q, setQuery]);

  const sortBy = (key: SortKey) => setQuery({ sort: key, dir: query.sort === key && query.dir !== "desc" ? "desc" : null });
  const view = query.view ?? "all";
  const filtered = Object.keys(query).some((k) => !["sort", "dir", "page", "view"].includes(k)) || view !== "all";
  const rows = data?.rows ?? [];
  const allOnPage = rows.length > 0 && rows.every((r) => selected.includes(r.id));

  const post = async (label: string, body: Record<string, unknown>, done: (out: Record<string, unknown>) => string) => {
    setBusy(label);
    setNotice(null);
    try {
      const out = await api<Record<string, unknown>>("/api/admin/questions", { body });
      setNotice(done(out));
      reload();
    } catch (e) {
      setNotice(e instanceof Error ? e.message : "That didn’t work. Try again.");
    } finally {
      setBusy(null);
    }
  };

  const openRow = (id: string, el: HTMLElement) => {
    lastFocus.current = el;
    setOpen(id);
  };

  const filter = (key: keyof PoolQuery, label: string, options: [string, string][]) => (
    <label className="flex flex-col gap-1 text-xs font-semibold">
      {label}
      <select className={cx(input, "min-h-10 text-sm")} value={query[key] ?? ""} onChange={(e) => setQuery({ [key]: e.target.value || null })}>
        <option value="">Any</option>
        {options.map(([v, l]) => (
          <option key={v} value={v}>
            {l}
          </option>
        ))}
      </select>
    </label>
  );

  return (
    <AdminShell title="Question Pool">
      <p className="max-w-3xl text-ink-muted">
        Every question in the Hub’s quizzes, knowledge checks and practice: what it tests, where it’s used, which source supports the answer, who approved which
        version, and when it’s next due for review.
      </p>
      <div role="tablist" aria-label="Question Pool" className="mt-4 flex flex-wrap gap-2 border-b border-line">
        {(
          [
            ["questions", "Questions"],
            ["coverage", "Coverage"],
            ["sources", "Sources"],
          ] as const
        ).map(([id, label]) => (
          <button
            key={id}
            role="tab"
            type="button"
            aria-selected={tab === id}
            onClick={() => router.replace(id === "questions" ? pathname : `${pathname}?tab=${id}`, { scroll: false })}
            className={cx(
              "-mb-px min-h-11 border-b-[3px] px-4 font-semibold",
              tab === id ? "border-action text-ink" : "border-transparent text-ink-muted hover:text-ink",
            )}
          >
            {label}
          </button>
        ))}
      </div>

      {tab === "coverage" && <PoolCoverage />}
      {tab === "sources" && <PoolSources />}
      {tab === "questions" && (
        <div className="mt-4 flex flex-col gap-4">
          {/* Built-in and saved views. */}
          <nav aria-label="Views" className="flex flex-wrap gap-2">
            {VIEWS.map((v) => (
              <button
                key={v.id}
                type="button"
                title={v.hint}
                aria-current={view === v.id ? "true" : undefined}
                onClick={() => setQuery({ view: v.id === "all" ? null : v.id })}
                className={cx(
                  "inline-flex min-h-9 items-center gap-1.5 rounded-full border px-3 text-sm font-semibold",
                  view === v.id ? "border-action bg-action text-on-action" : "border-line-strong bg-surface hover:border-action",
                )}
              >
                {v.label}
                {data && <span className={cx("rounded-full px-1.5 text-xs", view === v.id ? "bg-white/20" : "bg-muted")}>{data.views[v.id] ?? 0}</span>}
              </button>
            ))}
          </nav>
          {data && (data.saved.length > 0 || filtered) && (
            <div className="flex flex-wrap items-center gap-2 text-sm">
              <span className="font-semibold text-ink-muted">My views:</span>
              {data.saved.map((s) => (
                <span key={s.id} className="inline-flex items-center rounded-full border border-line-strong bg-surface">
                  <button
                    type="button"
                    className="min-h-9 pl-3 pr-1 font-semibold hover:underline"
                    onClick={() => router.replace(`${pathname}?${s.query}`, { scroll: false })}
                  >
                    {s.name}
                  </button>
                  <button
                    type="button"
                    aria-label={`Remove the view ${s.name}`}
                    className="grid size-8 place-items-center rounded-full text-ink-muted hover:bg-muted"
                    onClick={() => void post("view", { action: "view", remove: s.id }, () => "View removed.")}
                  >
                    <Icon name="close" className="size-3.5" />
                  </button>
                </span>
              ))}
              {filtered && (
                <button
                  type="button"
                  className="font-semibold text-accent hover:underline"
                  onClick={() => {
                    const name = window.prompt("Name this view (the filters and sorting you have now):");
                    if (name) void post("view", { action: "view", name, query: qs }, () => `Saved “${name}” to My views.`);
                  }}
                >
                  + Save this view
                </button>
              )}
            </div>
          )}

          {/* Search and filters. */}
          <div className="flex flex-col gap-3 rounded-3xl bg-surface p-4 ring-1 ring-line">
            <div className="flex flex-wrap items-end gap-3">
              <label className="flex min-w-[16rem] flex-1 flex-col gap-1 text-xs font-semibold">
                Search the question, title, ID, feedback and tags
                <input type="search" className={input} value={search} onChange={(e) => setSearch(e.target.value)} placeholder="petrol, Q-00042, hoist…" />
              </label>
              <button
                type="button"
                className={btn.secondary}
                disabled={Boolean(busy)}
                onClick={() =>
                  void post("sync", { action: "sync" }, (o) => {
                    const r = o.report as { newQuestions: number; newVersions: number; withdrawn: number };
                    return `Reconciled with the Hub’s content: ${r.newQuestions} new question${r.newQuestions === 1 ? "" : "s"}, ${r.newVersions} new version${r.newVersions === 1 ? "" : "s"}, ${r.withdrawn} withdrawn draft${r.withdrawn === 1 ? "" : "s"}.`;
                  })
                }
              >
                <Icon name="refresh" className="size-4" /> {busy === "sync" ? "Reconciling…" : "Reconcile now"}
              </button>
              {data && <ExportMenu qs={qs} total={data.total} filtered={filtered} answerKeys={data.me.answerKeys} />}
            </div>
            <div className="grid grid-cols-2 gap-3 md:grid-cols-4 xl:grid-cols-5">
              {filter(
                "status",
                "Status",
                Object.entries(STATUSES).map(([k, v]) => [k, v.label]),
              )}
              {filter("kind", "Type", Object.entries(POOL_KINDS))}
              {filter("surface", "Used as", Object.entries(SURFACES))}
              {filter("risk", "Risk", [
                ["high", "High-risk"],
                ["standard", "Standard"],
              ])}
              {filter("use", "Live use", [
                ["live", "In use now"],
                ["unused", "Not in use"],
              ])}
              {filter(
                "topic",
                "Topic",
                (data?.facets.topics ?? []).map((t) => [t, t]),
              )}
              {filter(
                "audience",
                "Audience",
                (data?.facets.audiences ?? []).map((t) => [t, t]),
              )}
              {filter("owner", "Owner", [["none", "No owner"], ...(data?.facets.owners ?? []).map((o): [string, string] => [o.id, o.name])])}
              {filter("source", "Source", [["none", "No source"], ...(data?.facets.sources ?? []).map((s): [string, string] => [s.id, s.title])])}
              {filter("due", "Review due", [
                ["overdue", "Overdue"],
                ["30", "In the next 30 days"],
                ["90", "In the next 90 days"],
              ])}
            </div>
            <div className="flex flex-wrap items-center gap-3 text-sm">
              <p role="status" aria-live="polite" className="font-semibold">
                {!data
                  ? "Loading…"
                  : data.total === 0
                    ? "No questions"
                    : `${(data.page - 1) * data.pageSize + 1} to ${Math.min(data.total, data.page * data.pageSize)} of ${data.total} question${data.total === 1 ? "" : "s"}`}
                {data && filtered && data.total !== data.poolSize ? ` (of ${data.poolSize} in the pool)` : ""}
              </p>
              {filtered && (
                <button
                  type="button"
                  className="font-semibold text-accent hover:underline"
                  onClick={() => {
                    setSearch("");
                    router.replace(pathname, { scroll: false });
                  }}
                >
                  Clear filters
                </button>
              )}
              {data?.syncedAt && <span className="ml-auto text-ink-muted">Reconciled with the Hub’s content {formatDateTime(data.syncedAt)}</span>}
            </div>
            {notice && (
              <p role="status" className="rounded-2xl bg-tealtint px-3 py-2 text-sm">
                {notice}
              </p>
            )}
          </div>
          {error && <ErrorNote text={error} />}

          {/* Several at once: details only, never approval or answers. */}
          {selected.length > 0 && data && (
            <BulkBar
              count={selected.length}
              owners={data.facets.owners}
              busy={Boolean(busy)}
              onClear={() => setSelected([])}
              onApply={(change) =>
                void post("bulk", { action: "bulk", ids: selected, ...change }, (o) => {
                  setSelected([]);
                  return `Updated ${o.done} question${o.done === 1 ? "" : "s"}${o.skipped ? `; ${o.skipped} couldn’t be submitted (only drafts can)` : ""}.`;
                })
              }
            />
          )}

          {data && data.total === 0 ? (
            <div className="rounded-3xl bg-surface p-8 text-center ring-1 ring-line">
              <p className="font-serif text-xl font-semibold">{data.poolSize === 0 ? "The pool is empty" : "No questions match these filters"}</p>
              <p className="mt-1 text-ink-muted">
                {data.poolSize === 0
                  ? "There are no questions in the Hub’s Topics or courses yet. They appear here as they’re written."
                  : `There are ${data.poolSize} questions in the pool. Clear or change the filters to see them.`}
              </p>
            </div>
          ) : (
            <>
              <div className="hidden overflow-x-auto rounded-3xl bg-surface ring-1 ring-line md:block">
                <table className="w-full min-w-[70rem] border-collapse text-left text-sm">
                  <caption className="sr-only">Questions in the pool. Column headings sort the whole result.</caption>
                  <thead className="border-b border-line bg-muted/40">
                    <tr>
                      <th scope="col" className="w-10 px-3 py-2">
                        <input
                          type="checkbox"
                          aria-label="Select every question on this page"
                          className="size-4 accent-[var(--color-action)]"
                          checked={allOnPage}
                          onChange={(e) =>
                            setSelected(
                              e.target.checked
                                ? [...new Set([...selected, ...rows.map((r) => r.id)])]
                                : selected.filter((id) => !rows.some((r) => r.id === id)),
                            )
                          }
                        />
                      </th>
                      {COLUMNS.map((c) => {
                        const on = (query.sort ?? "id") === c.key;
                        return (
                          <th
                            key={c.key}
                            scope="col"
                            aria-sort={on ? (query.dir === "desc" ? "descending" : "ascending") : "none"}
                            className="px-3 py-2 align-bottom"
                          >
                            <button
                              type="button"
                              onClick={() => sortBy(c.key)}
                              className="inline-flex items-center gap-1 font-mulish text-xs font-extrabold uppercase tracking-wide hover:text-accent"
                            >
                              {c.label}
                              <Icon
                                name="chevron-down"
                                className={cx("size-3.5 transition-transform", on ? "opacity-100" : "opacity-25", on && query.dir !== "desc" && "rotate-180")}
                              />
                            </button>
                          </th>
                        );
                      })}
                    </tr>
                  </thead>
                  <tbody>
                    {rows.map((r) => (
                      <tr key={r.id} className={cx("border-b border-line align-top last:border-0", open === r.id && "bg-tealtint/60")}>
                        <td className="px-3 py-3">
                          <input
                            type="checkbox"
                            aria-label={`Select ${r.id}`}
                            className="size-4 accent-[var(--color-action)]"
                            checked={selected.includes(r.id)}
                            onChange={(e) => setSelected(e.target.checked ? [...selected, r.id] : selected.filter((x) => x !== r.id))}
                          />
                        </td>
                        <th scope="row" className="max-w-[16rem] px-3 py-3 font-normal">
                          <button type="button" className="text-left font-semibold text-accent hover:underline" onClick={(e) => openRow(r.id, e.currentTarget)}>
                            {r.id}
                          </button>
                          <span className="block">{r.title}</span>
                        </th>
                        <td className="max-w-[22rem] px-3 py-3">
                          <span className="line-clamp-2">{r.stem}</span>
                          <span className="text-ink-muted">{POOL_KINDS[r.kind]}</span>
                        </td>
                        <td className="max-w-[14rem] px-3 py-3">
                          {r.topic}
                          <span className="block text-ink-muted">{r.audience || "No audience set"}</span>
                        </td>
                        <td className="max-w-[14rem] px-3 py-3">
                          {r.risk === "high" ? <Badge tone="bad">High-risk</Badge> : "Standard"}
                          <span className={cx("block", !r.source && !r.sourceRef && "text-ink-muted")}>
                            {r.source ? r.source.title : r.sourceRef || "No source"}
                            {r.source?.superseded && " (superseded)"}
                          </span>
                        </td>
                        <td className="px-3 py-3">
                          <span className="flex flex-wrap gap-1">
                            <Badge tone={STATUSES[r.status].tone}>{STATUSES[r.status].label}</Badge>
                            {r.unreviewed && r.status === "approved" && <Badge tone="warn">First review due</Badge>}
                            {r.liveUnapproved && <Badge tone="bad">Live, not approved</Badge>}
                          </span>
                          <span className="mt-1 block text-ink-muted">{r.owner?.name ?? "No owner"}</span>
                        </td>
                        <td className="px-3 py-3">
                          {r.approvedVersion ? `v${r.approvedVersion}${r.approvedAt ? `, ${formatDate(r.approvedAt)}` : ""}` : "Not approved"}
                          <span className="block text-ink-muted">{r.nextReview ? `Review ${formatDate(r.nextReview)}` : "No review date"}</span>
                        </td>
                        <td className="px-3 py-3">
                          <button type="button" className="font-semibold text-accent hover:underline" onClick={(e) => openRow(r.id, e.currentTarget)}>
                            {r.liveUses} live
                          </button>
                          <span className="block text-ink-muted">
                            {r.surfaces.map((s) => SURFACES[s]).join(", ") || "Not placed"}
                            {r.duplicate && " · possible duplicate"}
                          </span>
                        </td>
                        <td className="px-3 py-3">
                          {signalText(r)}
                          <span className="block text-ink-muted">{r.lastAttempt ? `Last ${formatDate(r.lastAttempt)}` : ""}</span>
                        </td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
              {/* On a phone: the same rows as cards. */}
              <ul className="flex flex-col gap-2 md:hidden">
                {rows.map((r) => (
                  <li key={r.id} className="rounded-2xl bg-surface p-3 ring-1 ring-line">
                    <button type="button" className="text-left" onClick={(e) => openRow(r.id, e.currentTarget)}>
                      <span className="font-semibold text-accent">{r.id}</span> <span className="font-semibold">{r.title}</span>
                    </button>
                    <p className="mt-1 flex flex-wrap gap-1">
                      <Badge tone={STATUSES[r.status].tone}>{STATUSES[r.status].label}</Badge>
                      {r.risk === "high" && <Badge tone="bad">High-risk</Badge>}
                      {r.unreviewed && r.status === "approved" && <Badge tone="warn">First review due</Badge>}
                    </p>
                    <p className="mt-1 text-sm text-ink-muted">
                      {POOL_KINDS[r.kind]} · {r.topic} · {r.liveUses} live
                    </p>
                  </li>
                ))}
              </ul>
              {data && data.total > data.pageSize && (
                <nav aria-label="Pages" className="flex items-center justify-center gap-3 text-sm">
                  <button
                    type="button"
                    className={btn.secondary}
                    disabled={data.page <= 1}
                    onClick={() => setQuery({ page: data.page > 2 ? String(data.page - 1) : null }, true)}
                  >
                    Previous
                  </button>
                  <span>
                    Page {data.page} of {Math.ceil(data.total / data.pageSize)}
                  </span>
                  <button
                    type="button"
                    className={btn.secondary}
                    disabled={data.page * data.pageSize >= data.total}
                    onClick={() => setQuery({ page: String(data.page + 1) }, true)}
                  >
                    Next
                  </button>
                </nav>
              )}
            </>
          )}
        </div>
      )}

      {open && data && (
        <QuestionPanel
          key={open}
          id={open}
          facets={data.facets}
          onClose={() => {
            setOpen(null);
            lastFocus.current?.focus();
          }}
          onChanged={reload}
        />
      )}
    </AdminShell>
  );
}

/** Export Excel: says what will be in the file before it's made. */
function ExportMenu({ qs, total, filtered, answerKeys }: { qs: string; total: number; filtered: boolean; answerKeys: boolean }) {
  const [keys, setKeys] = useState(false);
  const [versions, setVersions] = useState(false);
  const href = `/api/admin/questions/export?${qs}${qs ? "&" : ""}${keys && answerKeys ? "keys=1&" : ""}${versions ? "versions=1" : ""}`;
  return (
    <details className="relative">
      <summary className={cx(btn.primary, "cursor-pointer list-none")}>
        <Icon name="doc" className="size-4" /> Export Excel
      </summary>
      <div className="absolute right-0 z-20 mt-2 flex w-[22rem] flex-col gap-3 rounded-2xl bg-surface p-4 text-sm shadow-xl ring-1 ring-line">
        <p>
          <strong>{filtered ? `The ${total} question${total === 1 ? "" : "s"} matching your filters` : `The whole pool (${total} questions)`}</strong>, as a
          snapshot at this moment. It’s for review and audits: nothing is imported back from it.
        </p>
        <label className="flex items-start gap-2">
          <input type="checkbox" className="mt-0.5 size-4 accent-[var(--color-action)]" checked={versions} onChange={(e) => setVersions(e.target.checked)} />
          Include every version, not just the current one
        </label>
        <label className={cx("flex items-start gap-2", !answerKeys && "text-ink-muted")}>
          <input
            type="checkbox"
            className="mt-0.5 size-4 accent-[var(--color-action)]"
            checked={keys && answerKeys}
            disabled={!answerKeys}
            onChange={(e) => setKeys(e.target.checked)}
          />
          <span>
            Include answers and feedback
            <span className="block text-ink-muted">
              {answerKeys
                ? "The file is then confidential and marked so. Each export is logged."
                : "For reviewers and Hub administrators. Your export has the inventory without answers."}
            </span>
          </span>
        </label>
        <p className="text-ink-muted">No learner names or answers are ever exported.</p>
        <a href={href} download className={btn.primary}>
          <Icon name="doc" className="size-4" /> Download .xlsx
        </a>
      </div>
    </details>
  );
}

function BulkBar({
  count,
  owners,
  busy,
  onApply,
  onClear,
}: {
  count: number;
  owners: { id: string; name: string }[];
  busy: boolean;
  onApply: (change: Record<string, unknown>) => void;
  onClear: () => void;
}) {
  const [owner, setOwner] = useState("");
  const [tag, setTag] = useState("");
  const [due, setDue] = useState("");
  return (
    <div role="region" aria-label="Selected questions" className="flex flex-wrap items-end gap-3 rounded-3xl border-2 border-action bg-surface p-4 text-sm">
      <p className="font-semibold">{count} selected</p>
      <label className="flex flex-col gap-1 text-xs font-semibold">
        Owner
        <select className={cx(input, "min-h-10")} value={owner} onChange={(e) => setOwner(e.target.value)}>
          <option value="">Don’t change</option>
          {owners.map((o) => (
            <option key={o.id} value={o.id}>
              {o.name}
            </option>
          ))}
        </select>
      </label>
      <label className="flex flex-col gap-1 text-xs font-semibold">
        Add a tag
        <input className={cx(input, "min-h-10")} value={tag} onChange={(e) => setTag(e.target.value)} />
      </label>
      <label className="flex flex-col gap-1 text-xs font-semibold">
        Next review
        <input type="date" className={cx(input, "min-h-10")} value={due} onChange={(e) => setDue(e.target.value)} />
      </label>
      <button
        type="button"
        className={btn.primary}
        disabled={busy || (!owner && !tag && !due)}
        onClick={() => onApply({ ...(owner && { owner }), ...(tag && { tag }), ...(due && { nextReview: due }) })}
      >
        Apply
      </button>
      <button type="button" className={btn.secondary} disabled={busy} onClick={() => onApply({ submit: true })}>
        Submit drafts for review
      </button>
      <button type="button" className={btn.quiet} onClick={onClear}>
        Clear selection
      </button>
      <p className="w-full text-xs text-ink-muted">Approval and answers are never changed in bulk: each question’s reasoning is checked one at a time.</p>
    </div>
  );
}
