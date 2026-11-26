"use client";

import { useMemo, useState } from "react";
import Link from "next/link";
import { api, useApi } from "@/lib/api";
import { cx } from "@/lib/format";
import { GUIDE_ROLES } from "@/lib/magazine";
import {
  ACTIVITY_KINDS,
  AI_MODES,
  APPROVAL,
  CHECKS,
  SURFACES,
  filterRows,
  type CatalogueFilters,
  type CatalogueRow,
  type CheckKey,
  type CheckState,
} from "@/lib/activityCatalogue";
import type { Inventory, ShowcasePick } from "@/server/activityCatalogue";
import { AdminShell, Badge, ErrorNote, Field, btn, input } from "./ui";
import { Icon } from "../Icon";

/*
  The Activity Catalogue for authors (docs/activity-catalogue-audit.md): every activity the Hub holds, read live from the
  catalogue and checked against what's actually published, with why each one is or isn't open to the AI builder. Filter
  it, open an entry for its detail, and export exactly what's on screen. The homepage picks are chosen here too.
*/

const box = "rounded-2xl border border-line bg-surface p-4";
const STATE_TONE: Record<CheckState, "good" | "warn" | "bad" | "neutral" | "info"> = {
  yes: "good",
  partial: "warn",
  no: "bad",
  unknown: "neutral",
  "n/a": "neutral",
};
const STATE_TEXT: Record<CheckState, string> = { yes: "Yes", partial: "Partly", no: "No", unknown: "Unknown", "n/a": "n/a" };
const EMPTY: CatalogueFilters = { q: "", kind: "", surface: "", role: "", ai: "", authoring: "", approval: "", health: "" };

export function ActivityCatalogueAdmin() {
  const { data, error, setData } = useApi<Inventory>("/api/admin/activities");
  const [f, setF] = useState<CatalogueFilters>(EMPTY);
  const [open, setOpen] = useState<string | null>(null);
  const rows = useMemo(() => (data ? filterRows(data.rows, f) : []), [data, f]);
  const query = new URLSearchParams(Object.entries(f).filter(([, v]) => v) as [string, string][]).toString();
  const set = (k: keyof CatalogueFilters) => (e: React.ChangeEvent<HTMLInputElement | HTMLSelectElement>) => setF((x) => ({ ...x, [k]: e.target.value }));
  const selected = data?.rows.find((r) => r.id === open) ?? null;
  return (
    <AdminShell title="Activity Catalogue">
      <p className="max-w-3xl text-ink-muted">
        Every activity the Hub holds: Magazine blocks, Topic cards, Work Tools, calculators and games. Each one’s status is checked live against what’s
        published, and each says whether the AI builder may recommend or configure it, and why. A real activity that isn’t AI-ready stays here with the reason
        and the work it needs.
      </p>
      {error && <ErrorNote text={error} />}
      {!data ? (
        <p className="mt-4 text-ink-muted">Loading…</p>
      ) : (
        <>
          <Totals data={data} onAttention={() => setF({ ...EMPTY, health: "attention" })} />
          {data.testCourses.length > 0 && (
            <div className="mt-4 rounded-2xl bg-gold/15 p-4 text-sm" role="note">
              <p className="font-semibold">Test courses are published to learners</p>
              <p className="mt-1">
                {data.testCourses.map((t, i) => (
                  <span key={t.id}>
                    {i > 0 && ", "}
                    <Link className="font-semibold text-accent underline" href={`/admin/magazine/${t.id}`}>
                      {t.title}
                    </Link>
                  </span>
                ))}
                . They’re left out of the showcase and the directory; archive them in the Magazine if they’re no longer needed.
              </p>
            </div>
          )}
          {data.broken.length > 0 && (
            <div className="mt-4 rounded-2xl border border-danger/50 p-4 text-sm" role="alert">
              <p className="font-semibold">Published courses that don’t read</p>
              <ul className="mt-1 list-disc pl-5">
                {data.broken.map((b) => (
                  <li key={b.slug}>
                    {b.title}: {b.problem}
                  </li>
                ))}
              </ul>
            </div>
          )}

          <section aria-labelledby="ac-filters" className={cx(box, "mt-4")}>
            <h2 id="ac-filters" className="sr-only">
              Search and filters
            </h2>
            <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-4">
              <Field label="Search">
                <input type="search" className={input} value={f.q} onChange={set("q")} placeholder="Name, alias or what it’s for" />
              </Field>
              <Select label="Kind" value={f.kind} onChange={set("kind")} options={Object.entries(ACTIVITY_KINDS)} />
              <Select label="Surface" value={f.surface} onChange={set("surface")} options={Object.entries(SURFACES)} />
              <Select label="Designed for" value={f.role} onChange={set("role")} options={GUIDE_ROLES.map((r) => [r.value, r.label])} />
              <Select label="AI selection" value={f.ai} onChange={set("ai")} options={Object.entries(AI_MODES).map(([k, v]) => [k, v.label])} />
              <Select
                label="Authoring"
                value={f.authoring}
                onChange={set("authoring")}
                options={[
                  ["yes", "Authorable"],
                  ["partial", "Code or content only"],
                  ["no", "Not authorable"],
                ]}
              />
              <Select label="Approval" value={f.approval} onChange={set("approval")} options={Object.entries(APPROVAL)} />
              <Select
                label="Health"
                value={f.health}
                onChange={set("health")}
                options={[
                  ["attention", "Needs attention"],
                  ["broken", "Broken"],
                  ["ok", "OK"],
                ]}
              />
            </div>
            <div className="mt-3 flex flex-wrap items-center gap-3">
              <button
                type="button"
                className={cx(btn.secondary, f.health === "attention" && "bg-muted")}
                onClick={() => setF({ ...EMPTY, health: "attention" })}
              >
                <Icon name="alert" className="size-4" /> Needs attention
              </button>
              <button type="button" className={btn.quiet} onClick={() => setF(EMPTY)}>
                Clear filters
              </button>
              <a className={btn.secondary} href={`/api/admin/activities/export${query ? `?${query}` : ""}`}>
                <Icon name="file" className="size-4" /> Export these {rows.length} to Excel
              </a>
              <p className="text-sm text-ink-muted" role="status">
                {rows.length} of {data.rows.length} shown
              </p>
            </div>
          </section>

          <div className="mt-4 overflow-x-auto rounded-2xl border border-line">
            <table className="w-full min-w-[56rem] text-left text-sm">
              <caption className="sr-only">Activities, with their status. Choose a name for the detail.</caption>
              <thead className="bg-muted">
                <tr>
                  <th className="p-2">Activity</th>
                  <th className="p-2">Kind</th>
                  <th className="p-2">Surfaces</th>
                  <th className="p-2">AI selection</th>
                  {(["registered", "renderable", "authorable", "tracked", "promotable"] as CheckKey[]).map((k) => (
                    <th key={k} className="p-2">
                      {CHECKS[k]}
                    </th>
                  ))}
                  <th className="p-2">Approval</th>
                </tr>
              </thead>
              <tbody>
                {rows.map((r) => (
                  <tr key={r.id} className={cx("border-t border-line align-top", open === r.id && "bg-tealtint")}>
                    <td className="p-2">
                      <button
                        type="button"
                        className="text-left font-semibold text-accent underline-offset-2 hover:underline"
                        aria-expanded={open === r.id}
                        onClick={() => setOpen(open === r.id ? null : r.id)}
                      >
                        {r.name}
                      </button>
                      <span className="block font-mono text-xs text-ink-muted">{r.id}</span>
                      {r.health !== "ok" && (
                        <span className="mt-1 inline-block">
                          <Badge tone={r.health === "broken" ? "bad" : "warn"}>{r.health === "broken" ? "Broken" : "Needs attention"}</Badge>
                        </span>
                      )}
                    </td>
                    <td className="p-2">{ACTIVITY_KINDS[r.kind]}</td>
                    <td className="p-2">{r.surfaces.map((s) => SURFACES[s]).join(", ")}</td>
                    <td className="p-2">{AI_MODES[r.ai.mode].label}</td>
                    {(["registered", "renderable", "authorable", "tracked", "promotable"] as CheckKey[]).map((k) => (
                      <td key={k} className="p-2" title={r.checks[k].note}>
                        <Badge tone={STATE_TONE[r.checks[k].state]}>{STATE_TEXT[r.checks[k].state]}</Badge>
                      </td>
                    ))}
                    <td className="p-2">{APPROVAL[r.approval]}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
          {selected && <Detail row={selected} onClose={() => setOpen(null)} />}

          <Showcase data={data} onSaved={(showcase) => setData({ ...data, showcase })} />
          <Report data={data} />

          <section aria-labelledby="ac-excluded" className={cx(box, "mt-6")}>
            <h2 id="ac-excluded" className="font-semibold">
              Found and deliberately not catalogued ({data.excluded.length})
            </h2>
            <ul className="mt-2 flex flex-col gap-1 text-sm">
              {data.excluded.map((x) => (
                <li key={x.id}>
                  <span className="font-semibold">{x.name}</span> <span className="text-ink-muted">({x.where})</span>: {x.reason}
                </li>
              ))}
            </ul>
          </section>
        </>
      )}
    </AdminShell>
  );
}

function Select({
  label,
  value,
  onChange,
  options,
}: {
  label: string;
  value: string | undefined;
  onChange: (e: React.ChangeEvent<HTMLSelectElement>) => void;
  options: [string, string][];
}) {
  return (
    <Field label={label}>
      <select className={input} value={value ?? ""} onChange={onChange}>
        <option value="">All</option>
        {options.map(([v, l]) => (
          <option key={v} value={v}>
            {l}
          </option>
        ))}
      </select>
    </Field>
  );
}

function Totals({ data, onAttention }: { data: Inventory; onAttention: () => void }) {
  const t = data.totals;
  const items: [string, number, string][] = [
    ["Found in code", t.found, "Catalogued, plus those deliberately left out"],
    ["Catalogued", t.catalogued, "One entry per activity"],
    ["Registered", t.registered, "Known to the registry and parser, or a live route"],
    ["Authorable", t.authorable, "Built and configured in an editor"],
    ["AI-ready", t.aiReady, "The Magazine builder can recommend and configure it"],
    ["AI recommended only", t.aiRecommend, "Specialist setup required"],
    ["Tracked", t.tracked, "Events or attempts recorded on this Hub"],
    ["Promotable", t.promotable, "A published example or live tool to feature"],
    ["Broken", t.broken, "Refused by the parser or failing the catalogue check"],
    ["Unused blocks", t.orphaned, "Registered, in no course yet"],
    ["Excluded", t.excluded, "Found, deliberately not an activity"],
  ];
  return (
    <section aria-labelledby="ac-totals" className={cx(box, "mt-4")}>
      <div className="flex flex-wrap items-end justify-between gap-2">
        <h2 id="ac-totals" className="font-semibold">
          Live totals
        </h2>
        <p className="text-xs text-ink-muted">
          Checked {new Date(data.generatedAt).toLocaleString("en-AU")} · catalogue version {data.version} · demo sign-off {data.demoSignOff ? "on" : "off"} on
          this Hub
        </p>
      </div>
      <dl className="mt-2 grid grid-cols-2 gap-2 text-sm sm:grid-cols-4 lg:grid-cols-6">
        {items.map(([label, n, hint]) => (
          <div key={label} className="rounded-xl bg-muted p-3" title={hint}>
            <dt className="text-xs text-ink-muted">{label}</dt>
            <dd className="font-serif text-2xl font-semibold">{n}</dd>
          </div>
        ))}
        <div className="rounded-xl bg-gold/20 p-3">
          <dt className="text-xs">Needs attention</dt>
          <dd>
            <button type="button" className="font-serif text-2xl font-semibold underline" onClick={onAttention}>
              {t.attention}
            </button>
          </dd>
        </div>
      </dl>
    </section>
  );
}

function Detail({ row: r, onClose }: { row: CatalogueRow; onClose: () => void }) {
  return (
    <section aria-labelledby="ac-detail" className={cx(box, "mt-4 border-action")}>
      <div className="flex flex-wrap items-start justify-between gap-3">
        <div>
          <p className="font-mulish text-xs font-extrabold uppercase tracking-[0.12em] text-accent">
            {ACTIVITY_KINDS[r.kind]} · {r.category}
          </p>
          <h2 id="ac-detail" className="font-serif text-2xl font-semibold">
            {r.name}
          </h2>
          <p className="font-mono text-xs text-ink-muted">
            {r.id} · version {r.version}
            {r.aliases.length ? ` · also known as ${r.aliases.join(", ")}` : ""}
          </p>
        </div>
        <div className="flex flex-wrap gap-2">
          {r.actions.preview && (
            <Link className={btn.secondary} href={r.actions.preview}>
              <Icon name="eye" className="size-4" /> Preview
            </Link>
          )}
          {r.actions.builder && (
            <Link className={btn.secondary} href={r.actions.builder}>
              <Icon name="pen" className="size-4" /> Open in builder
            </Link>
          )}
          {r.actions.usage && (
            <a className={btn.secondary} href={r.actions.usage}>
              View usage
            </a>
          )}
          <button type="button" className={btn.quiet} onClick={onClose}>
            Close
          </button>
        </div>
      </div>
      <p className="mt-3 max-w-3xl">{r.purpose}</p>
      {r.attention.length > 0 && (
        <ul className="mt-3 list-disc rounded-xl bg-gold/15 p-3 pl-8 text-sm">
          {r.attention.map((a) => (
            <li key={a}>{a}</li>
          ))}
        </ul>
      )}
      <div className="mt-4 grid gap-4 lg:grid-cols-2">
        <div>
          <h3 className="font-semibold">Status</h3>
          <dl className="mt-1 flex flex-col gap-1 text-sm">
            {(Object.keys(CHECKS) as CheckKey[]).map((k) => (
              <div key={k} className="flex gap-2">
                <dt className="w-28 shrink-0">
                  <Badge tone={STATE_TONE[r.checks[k].state]}>{CHECKS[k]}</Badge>
                </dt>
                <dd>
                  <span className="font-semibold">{STATE_TEXT[r.checks[k].state]}.</span> {r.checks[k].note}
                </dd>
              </div>
            ))}
          </dl>
          <p className="mt-2 text-sm">
            <span className="font-semibold">Last validation:</span> {r.lastVerified},{" "}
            {r.validation.length ? r.validation.join(" ") : "passed the catalogue check."}
          </p>
        </div>
        <div className="flex flex-col gap-2 text-sm">
          <h3 className="font-semibold">AI selection: {AI_MODES[r.ai.mode].label}</h3>
          <p>{r.ai.reason}</p>
          {r.ai.constraints.length > 0 && <p>Rules: {r.ai.constraints.join("; ")}.</p>}
          {r.goodFor.length > 0 && (
            <p>
              <span className="font-semibold">Recommended for:</span> {r.goodFor.join("; ")}.
            </p>
          )}
          {r.poorFit && (
            <p>
              <span className="font-semibold">Not for:</span> {r.poorFit}
            </p>
          )}
          {r.inputs.length > 0 && (
            <p>
              <span className="font-semibold">Configuration needs:</span> {r.inputs.join(" ")}
            </p>
          )}
          {r.evidence && (
            <p>
              <span className="font-semibold">Evidence and completion:</span> {r.evidence}
            </p>
          )}
          {r.signoff && (
            <p>
              <span className="font-semibold">Sign-off:</span> {r.signoff}
            </p>
          )}
          <p>
            <span className="font-semibold">Tracked events:</span> {r.events.length ? r.events.join(", ") : "None declared"}. {r.observed} recorded on this Hub.
          </p>
          <p>
            <span className="font-semibold">Where it lives:</span> renderer <code>src/{r.renderer}</code>
            {r.schema && (
              <>
                , schema <code>src/{r.schema}</code>
              </>
            )}
            ; authored in {r.authoring}
            {r.route ? `; opens at ${r.route}` : ""}
            {r.admin ? (
              <>
                ;{" "}
                <Link className="text-accent underline" href={r.admin}>
                  its admin page
                </Link>
              </>
            ) : null}
            .
          </p>
          <p>
            <span className="font-semibold">Owner:</span> not recorded in code.
          </p>
        </div>
      </div>
      <div id={`usage-${r.id}`} className="mt-4 scroll-mt-24">
        <h3 className="font-semibold">Where it’s used</h3>
        {r.examples.length ? (
          <ul className="mt-1 flex flex-col gap-1 text-sm">
            {r.examples.map((e) => (
              <li key={e.guideId}>
                <Link className="text-accent underline" href={`/magazine/${e.slug}`}>
                  {e.title}
                </Link>{" "}
                <span className="text-ink-muted">
                  ({e.audience.length ? e.audience.join(", ") : "everyone"}
                  {e.demo ? "; demo edition, not reviewed" : ""}
                  {e.test ? "; test course" : ""})
                </span>{" "}
                ·{" "}
                <Link className="text-accent underline" href={`/admin/magazine/${e.guideId}`}>
                  edit
                </Link>
              </li>
            ))}
          </ul>
        ) : (
          <p className="text-sm text-ink-muted">{r.builder === "magazine" ? "No published course uses it." : "Not placed in courses."}</p>
        )}
        {r.drafts > 0 && (
          <p className="mt-1 text-sm text-ink-muted">
            In {r.drafts} live draft{r.drafts === 1 ? "" : "s"}.
          </p>
        )}
      </div>
    </section>
  );
}

/** The homepage picks: choose, order, schedule and switch off. Only published examples a learner can open are ever shown. */
function Showcase({ data, onSaved }: { data: Inventory; onSaved: (p: ShowcasePick[]) => void }) {
  const [picks, setPicks] = useState<ShowcasePick[]>(data.showcase);
  const [state, setState] = useState<{ busy: boolean; note: string | null; error: string | null }>({ busy: false, note: null, error: null });
  const choices = data.rows.filter((r) => r.homepage).flatMap((r) => r.examples.filter((e) => !e.test).map((e) => ({ r, e })));
  const [add, setAdd] = useState("");
  const edit = (i: number, patch: Partial<ShowcasePick>) => setPicks((p) => p.map((x, j) => (j === i ? { ...x, ...patch } : x)));
  const move = (i: number, dir: -1 | 1) =>
    setPicks((p) => {
      if (i + dir < 0 || i + dir >= p.length) return p;
      const n = [...p];
      [n[i], n[i + dir]] = [n[i + dir], n[i]];
      return n;
    });
  const save = async (next: ShowcasePick[] | null) => {
    setState({ busy: true, note: null, error: null });
    try {
      const out = await api<{ showcase: ShowcasePick[] }>("/api/admin/activities", { method: "PUT", body: { picks: next } });
      setPicks(out.showcase);
      onSaved(out.showcase);
      setState({ busy: false, note: next ? "Saved. The homepage shows the first four each person can open." : "Back to the starting picks.", error: null });
    } catch (e) {
      setState({ busy: false, note: null, error: e instanceof Error ? e.message : "That didn’t save." });
    }
  };
  const live = (p: ShowcasePick) => {
    const r = data.rows.find((x) => x.id === p.activity);
    const e = r?.examples.find((x) => x.slug === p.guide);
    if (!r || !e) return "Not shown: the course isn’t published or no longer holds this activity.";
    if (e.test) return "Not shown: a test course.";
    if (e.demo && !data.demoSignOff) return "Not shown: a demo edition, and demo sign-off is off on this Hub.";
    return `Shown to ${e.audience.length ? e.audience.join(", ") : "everyone"}${e.demo ? " (demo edition)" : ""}.`;
  };
  return (
    <section aria-labelledby="ac-showcase" className={cx(box, "mt-6")}>
      <h2 id="ac-showcase" className="font-semibold">
        Homepage showcase: “Practise the decisions you make every day”
      </h2>
      <p className="mt-1 max-w-3xl text-sm text-ink-muted">
        Each person sees the first four picks they can open, in this order. A pick whose course is unpublished, archived, outside their audience or no longer
        holds the activity disappears by itself. Nothing here changes the courses.
      </p>
      <ol className="mt-3 flex flex-col gap-2">
        {picks.map((p, i) => (
          <li key={`${p.id}-${i}`} className={cx("rounded-xl border border-line p-3", p.off && "opacity-60")}>
            <div className="grid gap-2 md:grid-cols-[minmax(0,2fr)_minmax(0,1fr)_auto]">
              <Field label={`Question ${i + 1}`}>
                <input className={input} value={p.question} maxLength={140} onChange={(e) => edit(i, { question: e.target.value })} />
              </Field>
              <Field label="Button">
                <input className={input} value={p.cta} maxLength={40} onChange={(e) => edit(i, { cta: e.target.value })} />
              </Field>
              <div className="flex items-end gap-1">
                <button type="button" aria-label={`Move pick ${i + 1} up`} className={btn.quiet} disabled={i === 0} onClick={() => move(i, -1)}>
                  <Icon name="arrow-left" className="size-4 rotate-90" />
                </button>
                <button type="button" aria-label={`Move pick ${i + 1} down`} className={btn.quiet} disabled={i === picks.length - 1} onClick={() => move(i, 1)}>
                  <Icon name="arrow-right" className="size-4 rotate-90" />
                </button>
                <button type="button" aria-label={`Remove pick ${i + 1}`} className={btn.quiet} onClick={() => setPicks((x) => x.filter((_, j) => j !== i))}>
                  <Icon name="trash" className="size-4" />
                </button>
              </div>
            </div>
            <div className="mt-2 flex flex-wrap items-end gap-3 text-sm">
              <span>
                {data.rows.find((r) => r.id === p.activity)?.name ?? p.activity} · <code>{p.guide}</code>
              </span>
              <label className="flex items-center gap-1.5">
                From
                <input
                  type="date"
                  className="min-h-9 rounded-lg border border-line-strong bg-surface px-2"
                  value={p.from ?? ""}
                  onChange={(e) => edit(i, { from: e.target.value || undefined })}
                />
              </label>
              <label className="flex items-center gap-1.5">
                To
                <input
                  type="date"
                  className="min-h-9 rounded-lg border border-line-strong bg-surface px-2"
                  value={p.to ?? ""}
                  onChange={(e) => edit(i, { to: e.target.value || undefined })}
                />
              </label>
              <label className="flex items-center gap-1.5">
                <input type="checkbox" className="size-4" checked={Boolean(p.off)} onChange={(e) => edit(i, { off: e.target.checked || undefined })} />
                Unfeature
              </label>
              <span className="text-ink-muted">{live(p)}</span>
            </div>
          </li>
        ))}
      </ol>
      <div className="mt-3 flex flex-wrap items-end gap-3">
        <Field label="Add a published example">
          <select className={input} value={add} onChange={(e) => setAdd(e.target.value)}>
            <option value="">Choose…</option>
            {choices.map(({ r, e }) => (
              <option key={`${r.id}|${e.slug}`} value={`${r.id}|${e.slug}`}>
                {r.name}: {e.title}
                {e.demo ? " (demo edition)" : ""}
              </option>
            ))}
          </select>
        </Field>
        <button
          type="button"
          className={btn.secondary}
          disabled={!add || picks.length >= 12}
          onClick={() => {
            const [activity, guide] = add.split("|");
            const title = choices.find((c) => c.r.id === activity && c.e.slug === guide)?.e.title ?? "";
            setPicks((p) => [...p, { id: `${activity}-${p.length + 1}`, activity, guide, question: title, cta: "Try it" }]);
            setAdd("");
          }}
        >
          <Icon name="plus" className="size-4" /> Add
        </button>
        <button type="button" className={btn.primary} disabled={state.busy} onClick={() => void save(picks)}>
          Save the picks
        </button>
        <button type="button" className={btn.quiet} disabled={state.busy} onClick={() => void save(null)}>
          Go back to the starting picks
        </button>
      </div>
      {state.note && (
        <p className="mt-2 text-sm" role="status">
          {state.note}
        </p>
      )}
      {state.error && <ErrorNote text={state.error} />}
    </section>
  );
}

const REPORT_COLUMNS: [string, string][] = [
  ["recommended", "Recommended by AI"],
  ["recommendation_accepted", "Accepted"],
  ["recommendation_rejected", "Rejected"],
  ["recommendation_edited", "Swapped in"],
  ["added_to_draft", "Added to a draft"],
  ["shown_on_homepage", "Shown on home"],
  ["opened", "Opened from home or directory"],
];

/** What the AI recommended and authors kept, and what the showcase led to: counts with the period, never a claim that work changed. */
function Report({ data }: { data: Inventory }) {
  const rows = data.report.rows;
  return (
    <section aria-labelledby="ac-report" className={cx(box, "mt-6")}>
      <h2 id="ac-report" className="font-semibold">
        Selection and showcase, since {new Date(data.report.since).toLocaleDateString("en-AU")}
      </h2>
      <p className="mt-1 max-w-3xl text-sm text-ink-muted">
        Counts of author decisions and homepage events, by activity. A course is counted once per recommendation. These show what was chosen and opened, not
        that anything changed at work: completions and scored outcomes are in each activity’s own report.
      </p>
      {!rows.length ? (
        <p className="mt-2 text-sm">Nothing recorded in this period yet.</p>
      ) : (
        <div className="mt-2 overflow-x-auto">
          <table className="w-full min-w-[40rem] text-left text-sm">
            <thead>
              <tr className="border-b border-line">
                <th className="p-2">Activity</th>
                {REPORT_COLUMNS.map(([, l]) => (
                  <th key={l} className="p-2">
                    {l}
                  </th>
                ))}
              </tr>
            </thead>
            <tbody>
              {rows.map((r) => (
                <tr key={r.id} className="border-b border-line">
                  <td className="p-2">{r.name}</td>
                  {REPORT_COLUMNS.map(([k]) => (
                    <td key={k} className="p-2">
                      {r[k] ?? 0}
                      {k === "recommendation_accepted" && r.recommended ? ` of ${r.recommended}` : ""}
                    </td>
                  ))}
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}
    </section>
  );
}
