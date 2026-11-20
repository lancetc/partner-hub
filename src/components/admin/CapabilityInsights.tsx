"use client";

import { useState } from "react";
import { api, useApi } from "@/lib/api";
import { cx, formatDateTime } from "@/lib/format";
import { cellText, CRITICALITY, DOMAINS, NO_EVIDENCE, STAGE_LABELS, type Stage } from "@/lib/capability";
import type { framework, heatmap, personCapabilities } from "@/server/capability";
import { AdminShell, Badge, btn, ErrorNote, input } from "./ui";
import { Icon } from "../Icon";
import { CompetencyCard } from "../capability/ProfileCards";
import { FrameworkTab, MappingsTab } from "./CapabilityFramework";
import { AccessTab, CorrectionsTab, PeopleTab } from "./CapabilityPeople";

/*
  Capability Insights (docs/capability-intelligence.md): for People & Culture, Partner Operations and
  Quality. Coverage for a role as counts (never a score), the framework and its versions, the learning
  mapped to it, people's roles, and correction requests. Each tab loads only what the signed-in person
  may see; the server decides.
*/

export type Framework = ReturnType<typeof framework>;
type Heat = ReturnType<typeof heatmap>;
type Person = ReturnType<typeof personCapabilities>;

const TABS = [
  { id: "coverage", label: "Coverage" },
  { id: "framework", label: "Framework" },
  { id: "mappings", label: "Learning and evidence" },
  { id: "people", label: "People" },
  { id: "corrections", label: "Corrections" },
  { id: "access", label: "Access" },
] as const;
type Tab = (typeof TABS)[number]["id"];

export function CapabilityInsights() {
  const { data, error, setData, reload } = useApi<Framework>("/api/admin/capabilities");
  const [tab, setTab] = useState<Tab>("coverage");
  const [problem, setProblem] = useState<string | null>(null);
  if (error)
    return (
      <AdminShell title="Capability Insights">
        <ErrorNote text={error} />
        <p className="mt-3 max-w-2xl text-ink-muted">
          Capability Insights is for the people who own the capability framework: People & Culture, Growth / Partner Operations and Quality. A superadmin gives
          that access. Your own capabilities are under My Capabilities in your account menu.
        </p>
      </AdminShell>
    );
  if (!data)
    return (
      <AdminShell title="Capability Insights">
        <p className="text-ink-muted">Loading…</p>
      </AdminShell>
    );
  /** Sends a change that answers with the whole framework. */
  const post = async (body: Record<string, unknown>) => {
    setProblem(null);
    try {
      setData(await api<Framework>("/api/admin/capabilities", { body }));
      return true;
    } catch (e) {
      setProblem(e instanceof Error ? e.message : "That didn’t save.");
      return false;
    }
  };
  const a = data.access;
  const shown = TABS.filter((t) => (t.id === "people" || t.id === "corrections" ? a.manage : t.id === "access" ? a.superadmin : true));
  return (
    <AdminShell title="Capability Insights">
      <p className="max-w-3xl text-ink-muted">
        What each role needs people to be able to do, the learning and assessment that count as evidence, and what has been recorded. It’s an evidence view:
        finishing a Topic shows <strong>Introduced</strong>, an approved assessment shows <strong>Demonstrated</strong>, and only a named person’s observation
        shows <strong>Verified at work</strong>. There is no score.
      </p>
      <div role="tablist" aria-label="Capability Insights" className="mt-4 flex flex-wrap gap-2">
        {shown.map((t) => (
          <button
            key={t.id}
            type="button"
            role="tab"
            id={`cap-tab-${t.id}`}
            aria-selected={tab === t.id}
            aria-controls="cap-panel"
            onClick={() => {
              setTab(t.id);
              setProblem(null);
            }}
            className={cx(
              "inline-flex min-h-11 items-center gap-2 rounded-full border px-4 font-semibold",
              tab === t.id ? "border-action bg-action text-on-action" : "border-line-strong bg-surface hover:bg-muted",
            )}
          >
            {t.label}
            {t.id === "mappings" && data.waiting + data.changed > 0 && (
              <span className="rounded-full bg-bg px-2 text-sm text-ink">{data.waiting + data.changed}</span>
            )}
          </button>
        ))}
      </div>
      {problem && (
        <div className="mt-3">
          <ErrorNote text={problem} />
        </div>
      )}
      <div id="cap-panel" role="tabpanel" aria-labelledby={`cap-tab-${tab}`} className="mt-5">
        {tab === "coverage" && <Coverage data={data} />}
        {tab === "framework" && <FrameworkTab data={data} post={post} setProblem={setProblem} reload={reload} />}
        {tab === "mappings" && <MappingsTab data={data} post={post} />}
        {tab === "people" && <PeopleTab />}
        {tab === "corrections" && <CorrectionsTab />}
        {tab === "access" && <AccessTab />}
      </div>
    </AdminShell>
  );
}

const SEGMENTS: { key: Stage | "none"; label: string; style: React.CSSProperties }[] = [
  { key: "verified", label: "Verified at work", style: { background: "var(--color-action)" } },
  {
    key: "demonstrated",
    label: "Demonstrated",
    style: {
      background: "repeating-linear-gradient(45deg, var(--color-action) 0 3px, transparent 3px 6px)",
      outline: "1px solid var(--color-action)",
      outlineOffset: "-1px",
    },
  },
  {
    key: "practised",
    label: "Practised",
    style: {
      background: "radial-gradient(var(--color-action) 1.2px, transparent 1.6px) 0 0 / 6px 6px",
      outline: "1px solid var(--color-action)",
      outlineOffset: "-1px",
    },
  },
  { key: "introduced", label: "Introduced", style: { outline: "1px solid var(--color-action)", outlineOffset: "-1px" } },
  { key: "none", label: NO_EVIDENCE, style: { outline: "1px dashed var(--color-line-strong)", outlineOffset: "-1px" } },
];

function Coverage({ data }: { data: Framework }) {
  const roles = data.roles.filter((r) => r.canSeeAggregate);
  const [roleId, setRoleId] = useState(roles.find((r) => r.active)?.id ?? roles[0]?.id ?? "");
  const heat = useApi<Heat>(roleId ? `/api/admin/capabilities?view=heatmap&role=${roleId}` : null);
  const [person, setPerson] = useState<string | null>(null);
  if (!roles.length)
    return (
      <p className="rounded-2xl bg-muted px-4 py-3">
        {data.roles.length ? "You don’t have access to coverage for any role." : "There are no roles yet. Start on the Framework tab."}
      </p>
    );
  const h = heat.data?.role.id === roleId ? heat.data : null;
  return (
    <div className="flex flex-col gap-4">
      <div className="flex flex-wrap items-end gap-3">
        <label className="flex flex-col gap-1 text-sm font-semibold">
          Role
          <select
            className={cx(input, "min-w-64")}
            value={roleId}
            onChange={(e) => {
              setRoleId(e.target.value);
              setPerson(null);
            }}
          >
            {roles.map((r) => (
              <option key={r.id} value={r.id}>
                {r.name} ({r.domain === "internal" ? "employees" : "partners"})
              </option>
            ))}
          </select>
        </label>
        {h?.version && (
          <>
            <a className={btn.secondary} href={`/api/admin/capabilities/export?role=${roleId}`}>
              <Icon name="file" className="size-4" /> Export (.xlsx)
            </a>
            {h.canDrill && (
              <a className={btn.quiet} href={`/api/admin/capabilities/export?role=${roleId}&individual=1`}>
                Export with individual evidence
              </a>
            )}
          </>
        )}
      </div>
      {heat.error && <ErrorNote text={heat.error} />}
      {!h && !heat.error && <p className="text-ink-muted">Loading…</p>}
      {h && !h.version && (
        <p className="rounded-2xl bg-muted px-4 py-3">
          This role has no active version yet, so nothing is derived for anyone. Approve its competencies and make a version active on the Framework tab.
        </p>
      )}
      {h?.version && (
        <>
          <p className="text-sm text-ink-muted">
            <strong className="text-ink">{DOMAINS[h.role.domain]}</strong> only · {h.people} {h.people === 1 ? "person" : "people"} in this role · framework
            version {h.version.number} · read from the Hub’s records at {formatDateTime(h.asOf)}
            {h.unassigned > 0 ? ` · ${h.unassigned} in this population have no role set and aren’t counted` : ""}
            {h.canDrill ? "" : ` · groups of fewer than ${h.threshold} aren’t shown`}
            {` · ${h.observationsWaiting} observation${h.observationsWaiting === 1 ? "" : "s"} waiting`}
          </p>
          <ul className="flex flex-wrap gap-x-4 gap-y-1 text-sm" aria-label="Key">
            {SEGMENTS.map((s) => (
              <li key={s.key} className="inline-flex items-center gap-1.5">
                <span aria-hidden className="inline-block h-3 w-5 rounded-sm" style={s.style} /> {s.label}
              </li>
            ))}
          </ul>
          <div className="overflow-x-auto rounded-3xl bg-surface p-2 ring-1 ring-line">
            <table className="w-full min-w-[40rem] border-separate border-spacing-0 text-left text-sm">
              <thead>
                <tr>
                  <th scope="col" className="px-3 py-2 font-semibold">
                    Competency
                  </th>
                  {h.columns.map((c) => (
                    <th key={c.key} scope="col" className="px-3 py-2 font-semibold">
                      {c.label}
                    </th>
                  ))}
                </tr>
              </thead>
              <tbody>
                {h.rows.map((r) => (
                  <tr key={r.competencyId} className="align-top">
                    <th scope="row" className="max-w-64 border-t border-line px-3 py-3 font-semibold">
                      {r.name}
                      <span className="block font-normal text-ink-muted">
                        asks for {STAGE_LABELS[r.target].toLowerCase()}
                        {r.criticality === "high" ? ` · ${CRITICALITY.high.toLowerCase()}` : ""}
                      </span>
                      {r.noRoute && (
                        <span className="mt-1 block font-normal">
                          <Badge tone="warn">No approved way to show this yet</Badge>
                        </span>
                      )}
                      {r.people && (
                        <details className="mt-1 font-normal">
                          <summary className="min-h-9 cursor-pointer py-1 text-accent">People</summary>
                          <ul className="mt-1 flex flex-col gap-0.5">
                            {r.people.map((p) => (
                              <li key={p.id}>
                                <button type="button" className="text-left underline-offset-4 hover:underline" onClick={() => setPerson(p.id)}>
                                  {p.name}
                                </button>
                                <span className="text-ink-muted">
                                  {" "}
                                  · {p.highest ? STAGE_LABELS[p.highest] : NO_EVIDENCE}
                                  {p.stale ? " · needs refresh" : ""}
                                </span>
                              </li>
                            ))}
                          </ul>
                        </details>
                      )}
                    </th>
                    {r.cells.map((c, i) => (
                      <td key={h.columns[i].key} className="min-w-44 border-t border-line px-3 py-3">
                        {c.suppressed ? (
                          <span className="text-ink-muted">Fewer than {h.threshold} people: not shown</span>
                        ) : c.n === 0 ? (
                          <span className="text-ink-muted">No one</span>
                        ) : (
                          <>
                            <div className="flex h-3 overflow-hidden rounded-sm" aria-hidden>
                              {SEGMENTS.map((s) => (c[s.key] ? <span key={s.key} style={{ ...s.style, flexGrow: c[s.key], flexBasis: 0 }} /> : null))}
                            </div>
                            <p className="mt-1">
                              <strong>
                                {c.met} of {c.n}
                              </strong>{" "}
                              at what the role asks for
                            </p>
                            <p className="text-ink-muted">{cellText(c).replace(/^\d+ (person|people): /, "")}</p>
                          </>
                        )}
                      </td>
                    ))}
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
          <p className="max-w-3xl text-sm text-ink-muted">
            “No evidence yet” means nothing eligible has been recorded. Where a competency has no approved way to show it, that’s a gap in assessment coverage,
            not in people’s skills. These figures count what the Hub has recorded: they aren’t a count of observed competence unless the column says “verified
            at work”.
          </p>
          {person && <PersonPanel id={person} onClose={() => setPerson(null)} />}
        </>
      )}
    </div>
  );
}

function PersonPanel({ id, onClose }: { id: string; onClose: () => void }) {
  const { data, error } = useApi<Person>(`/api/admin/capabilities?view=person&person=${id}`);
  return (
    <section aria-label="One person’s evidence" className="rounded-3xl bg-muted p-4">
      <div className="flex flex-wrap items-center justify-between gap-2">
        <h2 className="font-serif text-xl font-semibold">{data ? data.person.name : "Loading…"}</h2>
        <button type="button" className={btn.quiet} onClick={onClose}>
          <Icon name="close" className="size-4" /> Close
        </button>
      </div>
      {error && <ErrorNote text={error} />}
      {data && (
        <>
          <p className="text-sm text-ink-muted">Opening someone’s record is logged. Their private notes, journals and Discovery Paths aren’t part of it.</p>
          <div className="mt-3 flex flex-col gap-3">
            {data.competencies.map((c) => (
              <CompetencyCard key={c.id} c={c} />
            ))}
          </div>
        </>
      )}
    </section>
  );
}
