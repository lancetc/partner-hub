"use client";

import { useEffect, useState } from "react";
import { api, useApi } from "@/lib/api";
import { cx, formatDate } from "@/lib/format";
import {
  ASSET_LABELS,
  CRITICALITY,
  DOMAINS,
  RELATION_LABELS,
  RELATION_STAGE,
  RELATIONS,
  STAGE_LABELS,
  STAGES,
  type Criticality,
  type Relation,
  type Requirement,
  type Stage,
} from "@/lib/capability";
import type { rolePreview, searchAssets } from "@/server/capability";
import { Badge, btn, ErrorNote, Field, input } from "./ui";
import { Icon } from "../Icon";
import type { Framework } from "./CapabilityInsights";

/*
  The framework's two working tabs (docs/capability-intelligence.md).
  Framework: competencies (each wording approved by name) and what a role asks for, version by version,
  with a preview of what a new version changes before anyone releases it.
  Learning and evidence: which published learning introduces, practises or assesses each competency.
  A mapping counts for nothing until someone with the right to approves it.
*/

type Post = (body: Record<string, unknown>) => Promise<boolean>;
type Preview = ReturnType<typeof rolePreview>;
type Competency = Framework["competencies"][number];
type Role = Framework["roles"][number];

export function FrameworkTab({ data, post, setProblem, reload }: { data: Framework; post: Post; setProblem: (p: string | null) => void; reload: () => void }) {
  const [editing, setEditing] = useState<string | null>(null);
  const a = data.access;
  if (!data.competencies.length && !data.roles.length)
    return (
      <section className="rounded-3xl bg-surface p-5 ring-1 ring-line">
        <h2 className="font-serif text-xl font-semibold">Start with one role</h2>
        <p className="mt-1 max-w-3xl text-ink-muted">
          The pilot is one care coordinator role with twelve competencies. This adds them as <strong>drafts</strong>: starter wording for People & Culture,
          Quality and coordinators to rewrite. Nothing appears on anyone’s profile until a competency is approved and a role version is made active.
        </p>
        <div className="mt-3 flex flex-wrap gap-3">
          {a.domains.includes("partner") && (
            <button type="button" className={btn.primary} onClick={() => void post({ action: "pilot" })}>
              Add the care coordinator pilot as drafts
            </button>
          )}
          {a.manage && (
            <button type="button" className={btn.secondary} onClick={() => setEditing("new")}>
              Start with an empty framework
            </button>
          )}
          {!a.manage && <p>Only the framework’s owners can start it.</p>}
        </div>
        {editing === "new" && (
          <CompetencyForm onCancel={() => setEditing(null)} onSave={async (body) => (await post({ action: "competency", ...body })) && setEditing(null)} />
        )}
      </section>
    );
  const competencies = data.competencies.filter((c) => !c.retired);
  return (
    <div className="flex flex-col gap-6">
      <section aria-labelledby="fw-roles">
        <h2 id="fw-roles" className="font-serif text-2xl font-semibold">
          Roles
        </h2>
        <div className="mt-3 flex flex-col gap-4">
          {data.roles.map((r) => (
            <RoleCard key={r.id} role={r} competencies={competencies} canQuality={a.quality} post={post} setProblem={setProblem} reload={reload} />
          ))}
        </div>
        {a.manage && <AddRole domains={a.domains} post={post} />}
      </section>

      <section aria-labelledby="fw-comp">
        <div className="flex flex-wrap items-end justify-between gap-3">
          <div>
            <h2 id="fw-comp" className="font-serif text-2xl font-semibold">
              Competencies ({competencies.length})
            </h2>
            <p className="mt-1 max-w-3xl text-sm text-ink-muted">
              Each has a plain definition and the behaviours an assessor looks for. Rewording an approved competency starts a new draft version; the approved
              wording stays in use until the draft is approved. A high-risk competency is approved by Quality.
            </p>
          </div>
          {a.manage && editing !== "new" && (
            <button type="button" className={btn.secondary} onClick={() => setEditing("new")}>
              <Icon name="plus" className="size-4" /> Add a competency
            </button>
          )}
        </div>
        {editing === "new" && (
          <CompetencyForm onCancel={() => setEditing(null)} onSave={async (body) => (await post({ action: "competency", ...body })) && setEditing(null)} />
        )}
        <ul className="mt-3 flex flex-col gap-3">
          {competencies.map((c) => {
            const v = c.draft ?? c.current!;
            return (
              <li key={c.id} className="rounded-3xl bg-surface p-5 ring-1 ring-line">
                <div className="flex flex-wrap items-start justify-between gap-2">
                  <div>
                    <h3 className="font-serif text-xl font-semibold">{v.name}</h3>
                    <p className="text-sm text-ink-muted">
                      {c.group || "No group"} · id {c.id}
                      {v.owner ? ` · owner ${v.owner}` : ""}
                      {v.reviewDate ? ` · review ${formatDate(v.reviewDate)}` : ""}
                    </p>
                  </div>
                  <span className="flex flex-wrap gap-2">
                    {v.highRisk && <Badge tone="warn">High risk</Badge>}
                    {c.current && (
                      <Badge tone="good">
                        Version {c.current.version} approved by {c.current.approvedBy}
                      </Badge>
                    )}
                    {c.draft && <Badge tone="info">Draft version {c.draft.version}</Badge>}
                  </span>
                </div>
                {editing === c.id ? (
                  <CompetencyForm
                    competency={c}
                    onCancel={() => setEditing(null)}
                    onSave={async (body) => (await post({ action: "competency", id: c.id, ...body })) && setEditing(null)}
                  />
                ) : (
                  <>
                    <p className="mt-2">{v.definition || <span className="text-ink-muted">No definition yet.</span>}</p>
                    {v.behaviours.length > 0 && (
                      <ul className="mt-1 list-disc pl-5 text-sm">
                        {v.behaviours.map((b) => (
                          <li key={b}>{b}</li>
                        ))}
                      </ul>
                    )}
                    {v.source && <p className="mt-1 text-sm text-ink-muted">Source: {v.source}</p>}
                    {c.draft && c.current && (
                      <p className="mt-2 rounded-2xl bg-muted px-3 py-2 text-sm">
                        In use until this draft is approved: “{c.current.name}”, version {c.current.version}.
                      </p>
                    )}
                    <div className="mt-3 flex flex-wrap gap-2">
                      {a.manage && (
                        <button type="button" className={btn.secondary} onClick={() => setEditing(c.id)}>
                          <Icon name="pen" className="size-4" /> {c.draft ? "Edit the draft" : "Reword (starts a new version)"}
                        </button>
                      )}
                      {c.draft && (v.highRisk ? a.quality : a.manage || a.quality) && (
                        <button type="button" className={btn.primary} onClick={() => void post({ action: "approveCompetency", id: c.id })}>
                          Approve version {c.draft.version}
                        </button>
                      )}
                      {c.draft && v.highRisk && !a.quality && <p className="self-center text-sm text-ink-muted">Waiting for Quality to approve.</p>}
                    </div>
                  </>
                )}
              </li>
            );
          })}
        </ul>
      </section>
    </div>
  );
}

function CompetencyForm({
  competency,
  onSave,
  onCancel,
}: {
  competency?: Competency;
  onSave: (body: Record<string, unknown>) => Promise<unknown>;
  onCancel: () => void;
}) {
  const v = competency?.draft ?? competency?.current;
  return (
    <form
      className="mt-3 grid gap-3 rounded-2xl bg-muted p-4 sm:grid-cols-2"
      onSubmit={(e) => {
        e.preventDefault();
        const f = new FormData(e.currentTarget);
        void onSave({ ...Object.fromEntries(f), highRisk: f.get("highRisk") === "on" });
      }}
    >
      <Field label="Name" hint="A plain skill name a learner would recognise.">
        <input name="name" defaultValue={v?.name} required maxLength={80} className={input} />
      </Field>
      <Field label="Group" hint="For example: Working with clients.">
        <input name="group" defaultValue={competency?.group} maxLength={60} className={input} />
      </Field>
      <Field label="Definition" className="sm:col-span-2">
        <textarea name="definition" defaultValue={v?.definition} maxLength={600} className={cx(input, "min-h-20 py-2")} />
      </Field>
      <Field
        label="Observable behaviours, one per line"
        hint="What an assessor ticks when they watch someone do this. A sign-off needs every one seen."
        className="sm:col-span-2"
      >
        <textarea name="behaviours" defaultValue={v?.behaviours.join("\n")} className={cx(input, "min-h-28 py-2")} />
      </Field>
      <Field label="Owner">
        <input name="owner" defaultValue={v?.owner} maxLength={120} className={input} placeholder="Quality, People & Culture…" />
      </Field>
      <Field label="Review date">
        <input type="date" name="reviewDate" defaultValue={v?.reviewDate ?? ""} className={input} />
      </Field>
      <Field label="Source" hint="The policy or guidance this is drawn from." className="sm:col-span-2">
        <input name="source" defaultValue={v?.source} maxLength={300} className={input} />
      </Field>
      <label className="flex items-start gap-2 text-sm sm:col-span-2">
        <input type="checkbox" name="highRisk" defaultChecked={v?.highRisk} className="mt-0.5 size-4 accent-[var(--color-action)]" />
        <span>
          High risk
          <span className="block text-xs text-ink-muted">Quality approves its wording, any assessment mapped to it, and any role that includes it.</span>
        </span>
      </label>
      <div className="flex flex-wrap gap-2 sm:col-span-2">
        <button type="submit" className={btn.primary}>
          Save as a draft
        </button>
        <button type="button" className={btn.quiet} onClick={onCancel}>
          Cancel
        </button>
      </div>
    </form>
  );
}

function AddRole({ domains, post }: { domains: ("internal" | "partner")[]; post: Post }) {
  const [open, setOpen] = useState(false);
  if (!open)
    return (
      <button type="button" className={cx(btn.secondary, "mt-3")} onClick={() => setOpen(true)}>
        <Icon name="plus" className="size-4" /> Add a role
      </button>
    );
  return (
    <form
      className="mt-3 grid gap-3 rounded-2xl bg-muted p-4 sm:grid-cols-3"
      onSubmit={async (e) => {
        e.preventDefault();
        if (await post({ action: "role", ...Object.fromEntries(new FormData(e.currentTarget)) })) setOpen(false);
      }}
    >
      <Field label="Role">
        <input name="name" required maxLength={80} className={input} />
      </Field>
      <Field label="Job family">
        <input name="jobFamily" maxLength={80} className={input} />
      </Field>
      <Field label="Who it’s for" hint="Employees and partners are kept as separate populations.">
        <select name="domain" className={input}>
          {domains.map((d) => (
            <option key={d} value={d}>
              {DOMAINS[d]}
            </option>
          ))}
        </select>
      </Field>
      <div className="flex gap-2 sm:col-span-3">
        <button type="submit" className={btn.primary}>
          Add role
        </button>
        <button type="button" className={btn.quiet} onClick={() => setOpen(false)}>
          Cancel
        </button>
      </div>
    </form>
  );
}

function RoleCard({
  role,
  competencies,
  canQuality,
  post,
  setProblem,
  reload,
}: {
  role: Role;
  competencies: Competency[];
  canQuality: boolean;
  post: Post;
  setProblem: (p: string | null) => void;
  reload: () => void;
}) {
  const [editing, setEditing] = useState(false);
  const [rows, setRows] = useState<Requirement[]>([]);
  const [note, setNote] = useState("");
  const [preview, setPreview] = useState<Preview | null>(null);
  const nameOf = (id: string) => {
    const c = competencies.find((x) => x.id === id);
    return (c?.current ?? c?.draft)?.name ?? id;
  };
  // The draft's preview, when there is one.
  useEffect(() => {
    if (!role.draft || !role.canManage) return;
    let live = true;
    api<Preview>(`/api/admin/capabilities?view=preview&role=${role.id}`).then(
      (p) => live && setPreview(p),
      () => {},
    );
    return () => {
      live = false;
    };
  }, [role.id, role.draft, role.canManage]);

  const start = () => {
    setRows((role.draft ?? role.active)?.requirements ?? []);
    setNote(role.draft?.note ?? "");
    setEditing(true);
  };
  const act = async (body: Record<string, unknown>) => {
    setProblem(null);
    try {
      const out = await api<Preview>("/api/admin/capabilities", { body: { ...body, roleId: role.id } });
      setPreview(out);
      reload();
      return true;
    } catch (e) {
      setProblem(e instanceof Error ? e.message : "That didn’t save.");
      return false;
    }
  };
  const unused = competencies.filter((c) => !rows.some((r) => r.competencyId === c.id));
  const set = (id: string, patch: Partial<Requirement>) => setRows(rows.map((r) => (r.competencyId === id ? { ...r, ...patch } : r)));
  const draft = preview?.roleId === role.id ? preview.draft : null;
  return (
    <article className="rounded-3xl bg-surface p-5 ring-1 ring-line">
      <div className="flex flex-wrap items-start justify-between gap-2">
        <div>
          <h3 className="font-serif text-xl font-semibold">{role.name}</h3>
          <p className="text-sm text-ink-muted">
            {DOMAINS[role.domain]}
            {role.jobFamily ? ` · ${role.jobFamily}` : ""} · {role.people} {role.people === 1 ? "person" : "people"} in this role
          </p>
        </div>
        <span className="flex flex-wrap gap-2">
          {role.active ? (
            <Badge tone="good">
              Version {role.active.version} active, approved by {role.active.approvedBy}
            </Badge>
          ) : (
            <Badge>No active version</Badge>
          )}
          {role.draft && <Badge tone="info">Draft version {role.draft.version}</Badge>}
        </span>
      </div>

      {role.active && !editing && (
        <ul className="mt-3 flex flex-col divide-y divide-line text-sm">
          {role.active.requirements.map((r) => (
            <li key={r.competencyId} className="flex flex-wrap justify-between gap-2 py-1.5">
              <span>{nameOf(r.competencyId)}</span>
              <span className="text-ink-muted">
                {STAGE_LABELS[r.target]} · {CRITICALITY[r.criticality]} · competency version {r.version}
                {r.refreshMonths ? ` · refresh every ${r.refreshMonths} months` : ""}
              </span>
            </li>
          ))}
        </ul>
      )}
      {role.history.length > 0 && (
        <p className="mt-2 text-sm text-ink-muted">
          Earlier versions kept:{" "}
          {role.history
            .map((h) => `version ${h.version} (${h.approvedAt ? formatDate(h.approvedAt) : "?"} to ${h.retiredAt ? formatDate(h.retiredAt) : "?"})`)
            .join(", ")}
        </p>
      )}

      {editing ? (
        <div className="mt-3 rounded-2xl bg-muted p-4">
          <h4 className="font-semibold">What the next version asks for</h4>
          <p className="text-sm text-ink-muted">Nobody’s profile changes until this is made active.</p>
          <div className="mt-2 overflow-x-auto">
            <table className="w-full min-w-[40rem] text-left text-sm">
              <thead className="text-ink-muted">
                <tr>
                  <th scope="col" className="py-1 pr-2 font-semibold">
                    Competency
                  </th>
                  <th scope="col" className="px-2 py-1 font-semibold">
                    Evidence asked for
                  </th>
                  <th scope="col" className="px-2 py-1 font-semibold">
                    Criticality
                  </th>
                  <th scope="col" className="px-2 py-1 font-semibold">
                    Refresh (months)
                  </th>
                  <th scope="col" className="py-1 pl-2">
                    <span className="sr-only">Remove</span>
                  </th>
                </tr>
              </thead>
              <tbody>
                {rows.map((r) => (
                  <tr key={r.competencyId}>
                    <th scope="row" className="py-1 pr-2 font-semibold">
                      {nameOf(r.competencyId)}
                    </th>
                    <td className="px-2 py-1">
                      <select
                        aria-label={`Evidence asked for: ${nameOf(r.competencyId)}`}
                        className={cx(input, "min-h-10")}
                        value={r.target}
                        onChange={(e) => set(r.competencyId, { target: e.target.value as Stage })}
                      >
                        {STAGES.map((s) => (
                          <option key={s} value={s}>
                            {STAGE_LABELS[s]}
                          </option>
                        ))}
                      </select>
                    </td>
                    <td className="px-2 py-1">
                      <select
                        aria-label={`Criticality: ${nameOf(r.competencyId)}`}
                        className={cx(input, "min-h-10")}
                        value={r.criticality}
                        onChange={(e) => set(r.competencyId, { criticality: e.target.value as Criticality })}
                      >
                        {(Object.keys(CRITICALITY) as Criticality[]).map((c) => (
                          <option key={c} value={c}>
                            {CRITICALITY[c]}
                          </option>
                        ))}
                      </select>
                    </td>
                    <td className="px-2 py-1">
                      <input
                        aria-label={`Refresh in months: ${nameOf(r.competencyId)}`}
                        type="number"
                        min={1}
                        max={120}
                        className={cx(input, "min-h-10 w-24")}
                        value={r.refreshMonths ?? ""}
                        placeholder="Never"
                        onChange={(e) => set(r.competencyId, { refreshMonths: e.target.value ? Number(e.target.value) : null })}
                      />
                    </td>
                    <td className="py-1 pl-2">
                      <button
                        type="button"
                        className={btn.quiet}
                        aria-label={`Remove ${nameOf(r.competencyId)}`}
                        onClick={() => setRows(rows.filter((x) => x.competencyId !== r.competencyId))}
                      >
                        <Icon name="trash" className="size-4" />
                      </button>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
          {unused.length > 0 && (
            <label className="mt-2 flex flex-wrap items-center gap-2 text-sm font-semibold">
              Add a competency
              <select
                className={cx(input, "min-h-10 w-auto")}
                value=""
                onChange={(e) =>
                  e.target.value &&
                  setRows([...rows, { competencyId: e.target.value, version: 0, target: "demonstrated", criticality: "core", refreshMonths: null }])
                }
              >
                <option value="">Choose…</option>
                {unused.map((c) => (
                  <option key={c.id} value={c.id}>
                    {(c.current ?? c.draft)?.name}
                  </option>
                ))}
              </select>
            </label>
          )}
          <Field label="Note on this version" className="mt-2">
            <input className={input} value={note} maxLength={400} onChange={(e) => setNote(e.target.value)} />
          </Field>
          <div className="mt-3 flex flex-wrap gap-2">
            <button
              type="button"
              className={btn.primary}
              onClick={async () => (await act({ action: "roleDraft", requirements: rows, note })) && setEditing(false)}
            >
              Save the draft and preview
            </button>
            <button type="button" className={btn.quiet} onClick={() => setEditing(false)}>
              Cancel
            </button>
          </div>
        </div>
      ) : (
        role.canManage && (
          <button type="button" className={cx(btn.secondary, "mt-3")} onClick={start}>
            <Icon name="pen" className="size-4" /> {role.draft ? "Edit the draft" : role.active ? "Draft the next version" : "Set what this role asks for"}
          </button>
        )
      )}

      {draft && !editing && (
        <div className="mt-3 rounded-2xl bg-muted p-4" aria-live="polite">
          <h4 className="font-semibold">What making version {draft.version} active would change</h4>
          <p className="text-sm text-ink-muted">
            It applies to {draft.people} {draft.people === 1 ? "person" : "people"} straight away. Evidence already recorded is kept; each profile is read again
            against the new version.
          </p>
          <ul className="mt-2 flex flex-col divide-y divide-line text-sm">
            {draft.rows.map((r) => (
              <li key={r.competencyId} className="py-2">
                <p className="flex flex-wrap items-center gap-2">
                  <span className="font-semibold">{r.name}</span>
                  {r.change !== "same" && <Badge tone={r.change === "added" ? "good" : "info"}>{r.change === "added" ? "Added" : "Changed"}</Badge>}
                  {r.highRisk && <Badge tone="warn">High risk</Badge>}
                  <span className="text-ink-muted">
                    asks for {STAGE_LABELS[r.target].toLowerCase()}
                    {r.was && r.was.target !== r.target ? ` (was ${STAGE_LABELS[r.was.target].toLowerCase()})` : ""} · mapped learning: {r.mappings.introduced}{" "}
                    introduce, {r.mappings.practised} practise, {r.mappings.demonstrated} assess
                  </span>
                </p>
                {[...r.problems, ...r.warnings].map((w) => (
                  <p key={w} className="text-ink-muted">
                    {w}
                  </p>
                ))}
              </li>
            ))}
            {draft.removed.map((r) => (
              <li key={r.competencyId} className="py-2">
                <span className="font-semibold">{r.name}</span> <Badge tone="bad">Removed</Badge>{" "}
                <span className="text-ink-muted">Evidence people have for it is kept, but it stops showing on their profile.</span>
              </li>
            ))}
          </ul>
          {draft.qualityBy && (
            <p className="mt-2 text-sm">
              Reviewed by Quality: {draft.qualityBy}
              {draft.qualityAt ? `, ${formatDate(draft.qualityAt)}` : ""}
            </p>
          )}
          {draft.blocked.length > 0 && (
            <div className="mt-2">
              <ErrorNote text={`Can’t be made active yet: ${draft.blocked.join(" ")}`} />
            </div>
          )}
          <div className="mt-3 flex flex-wrap gap-2">
            {draft.needsQuality && !draft.qualityBy && canQuality && (
              <button type="button" className={btn.secondary} onClick={() => void act({ action: "roleQuality" })}>
                Record Quality’s review
              </button>
            )}
            {role.canManage && (
              <button
                type="button"
                className={btn.primary}
                disabled={draft.blocked.length > 0}
                onClick={async () => {
                  if (
                    !window.confirm(
                      `Make version ${draft.version} of “${role.name}” active for ${draft.people} ${draft.people === 1 ? "person" : "people"}? Your name is recorded as the approver.`,
                    )
                  )
                    return;
                  if (await post({ action: "roleActivate", roleId: role.id })) setPreview(null);
                }}
              >
                Make version {draft.version} active
              </button>
            )}
          </div>
        </div>
      )}
    </article>
  );
}

// ---------------------------------------------------------------------------------------------
// Learning and evidence
// ---------------------------------------------------------------------------------------------

type Assets = ReturnType<typeof searchAssets>;

export function MappingsTab({ data, post }: { data: Framework; post: Post }) {
  const [adding, setAdding] = useState<string | null>(null);
  const a = data.access;
  const competencies = data.competencies.filter((c) => !c.retired);
  if (!competencies.length) return <p className="rounded-2xl bg-muted px-4 py-3">Add competencies on the Framework tab first.</p>;
  return (
    <div className="flex flex-col gap-4">
      <p className="max-w-3xl text-ink-muted">
        Say which published learning <strong>introduces</strong>, <strong>practises</strong> or <strong>assesses</strong> each competency. Authors can propose a
        mapping; it counts for nothing until the framework’s owner approves it, by name. An assessment for a high-risk competency is approved by Quality. When
        the content is republished, its mapping is flagged for another look.
      </p>
      {competencies.map((c) => {
        const v = c.current ?? c.draft!;
        return (
          <section key={c.id} aria-label={v.name} className="rounded-3xl bg-surface p-5 ring-1 ring-line">
            <div className="flex flex-wrap items-start justify-between gap-2">
              <h2 className="font-serif text-xl font-semibold">{v.name}</h2>
              <span className="flex flex-wrap gap-2">
                {v.highRisk && <Badge tone="warn">High risk</Badge>}
                {RELATIONS.map((r) => {
                  const n = c.mappings.filter((m) => m.relation === r && m.status === "approved").length;
                  return (
                    <Badge key={r} tone={n ? "good" : "neutral"}>
                      {n} {RELATION_LABELS[r].toLowerCase()}
                    </Badge>
                  );
                })}
              </span>
            </div>
            {c.mappings.length === 0 ? (
              <p className="mt-2 text-sm text-ink-muted">Nothing is mapped to this yet, so everyone reads “No evidence yet” for it.</p>
            ) : (
              <ul className="mt-2 flex flex-col divide-y divide-line text-sm">
                {c.mappings.map((m) => {
                  const mayApprove = m.relation === "assesses" && v.highRisk ? a.quality : a.manage || a.quality;
                  return (
                    <li key={m.id} className="flex flex-col gap-1 py-2.5">
                      <p className="flex flex-wrap items-center gap-2">
                        <Badge tone="info">{RELATION_LABELS[m.relation]}</Badge>
                        <span className="font-semibold">{m.label}</span>
                        <span className="text-ink-muted">
                          {ASSET_LABELS[m.kind]}
                          {m.parent ? ` in “${m.parent}”` : ""} · shows {STAGE_LABELS[RELATION_STAGE[m.relation]]}
                        </span>
                        {m.status === "suggested" && <Badge tone="warn">Suggested{m.source === "ai" ? " by AI" : ""}: counts for nothing yet</Badge>}
                        {m.status === "approved" && !m.changed && !m.missing && <Badge tone="good">Approved by {m.decidedBy}</Badge>}
                        {m.status === "rejected" && <Badge>Rejected by {m.decidedBy}</Badge>}
                        {m.changed && <Badge tone="warn">Content changed since it was approved</Badge>}
                        {m.missing && <Badge tone="bad">No longer published</Badge>}
                      </p>
                      <p className="text-ink-muted">
                        Proposed by {m.proposedBy}, {formatDate(m.proposedAt)}
                        {m.rationale ? `: ${m.rationale}` : ""}
                        {m.note ? ` · Reviewer’s note: ${m.note}` : ""}
                      </p>
                      {mayApprove && (m.status === "suggested" || m.changed) && (
                        <div className="flex flex-wrap gap-2">
                          <button type="button" className={btn.secondary} onClick={() => void post({ action: "decide", id: m.id, approve: true })}>
                            {m.changed ? "Approve again as it now reads" : "Approve"}
                          </button>
                          <button
                            type="button"
                            className={btn.quiet}
                            onClick={() => {
                              const note = window.prompt("Reject this mapping? It will stop counting as evidence.\n\nWhy (shown to authors):");
                              if (note !== null) void post({ action: "decide", id: m.id, approve: false, note });
                            }}
                          >
                            Reject
                          </button>
                        </div>
                      )}
                      {m.status === "suggested" && !mayApprove && (
                        <p className="text-ink-muted">
                          {m.relation === "assesses" && v.highRisk ? "Waiting for Quality." : "Waiting for the framework’s owner."}
                        </p>
                      )}
                    </li>
                  );
                })}
              </ul>
            )}
            {(a.author || a.manage) &&
              (adding === c.id ? (
                <AddMapping
                  onCancel={() => setAdding(null)}
                  onAdd={async (assetKey, relation, rationale) =>
                    (await post({ action: "propose", competencyId: c.id, assetKey, relation, rationale })) && setAdding(null)
                  }
                />
              ) : (
                <button type="button" className={cx(btn.secondary, "mt-3")} onClick={() => setAdding(c.id)}>
                  <Icon name="plus" className="size-4" /> Map learning to this
                </button>
              ))}
          </section>
        );
      })}
    </div>
  );
}

function AddMapping({ onAdd, onCancel }: { onAdd: (assetKey: string, relation: Relation, rationale: string) => Promise<unknown>; onCancel: () => void }) {
  const [q, setQ] = useState("");
  const [rationale, setRationale] = useState("");
  const found = useApi<Assets>(`/api/admin/capabilities?view=assets&q=${encodeURIComponent(q)}`);
  return (
    <div className="mt-3 rounded-2xl bg-muted p-4">
      <div className="grid gap-3 sm:grid-cols-2">
        <Field label="Find a published Topic, Magazine course or page, or a path quiz">
          <input type="search" className={input} value={q} onChange={(e) => setQ(e.target.value)} autoFocus />
        </Field>
        <Field label="Why it fits (optional)" hint="Shown to the reviewer.">
          <input className={input} value={rationale} maxLength={400} onChange={(e) => setRationale(e.target.value)} />
        </Field>
      </div>
      {found.error && <ErrorNote text={found.error} />}
      <ul className="mt-2 flex max-h-80 flex-col divide-y divide-line overflow-y-auto text-sm">
        {(found.data?.assets ?? []).map((x) => (
          <li key={x.key} className="flex flex-wrap items-center justify-between gap-2 py-2">
            <span>
              <span className="font-semibold">{x.label}</span>{" "}
              <span className="text-ink-muted">
                {ASSET_LABELS[x.kind]}
                {x.parent ? ` in “${x.parent}”` : ""}
              </span>
            </span>
            <span className="flex flex-wrap gap-1.5">
              {RELATIONS.filter((r) => x.relations.includes(r)).map((r) => (
                <button key={r} type="button" className={btn.secondary} onClick={() => void onAdd(x.key, r, rationale)}>
                  {RELATION_LABELS[r]}
                </button>
              ))}
            </span>
          </li>
        ))}
        {found.data && found.data.assets.length === 0 && <li className="py-2 text-ink-muted">Nothing published matches.</li>}
      </ul>
      <p className="mt-2 text-sm text-ink-muted">
        A piece of learning is only offered for what it can show: something with no decisions can introduce but not practise, and only a path quiz or a Topic
        with an assessed quiz can assess.
      </p>
      <button type="button" className={cx(btn.quiet, "mt-2")} onClick={onCancel}>
        Done
      </button>
    </div>
  );
}
