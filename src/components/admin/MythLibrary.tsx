"use client";

import { useState } from "react";
import { useApi } from "@/lib/api";
import { cx } from "@/lib/format";
import {
  APPLICABILITY,
  CATEGORIES,
  cleanTile,
  CONTENT_STATUS,
  DEMO_LABEL,
  type ContentStatus,
  placeholdersIn,
  secondsToSay,
  SOURCE_TYPES,
  TILE_AUDIENCES,
  tileProblems,
  wordCount,
  type Applicability,
  type Category,
  type MythTileData,
  type SourceType,
  type TileAudience,
} from "@/lib/myths";
import type { LibraryTile, library, mythStats, openMythFlags } from "@/server/myths";
import { AdminShell, Badge, btn, ErrorNote, Field, input } from "./ui";
import { Icon } from "../Icon";

/*
  The Myth vs Reality tile library (docs/myth-vs-reality.md). Every course block and the Resources page show a
  tile's current approved version. Editing an approved tile starts a new draft version; approving it retires the
  old one, which stays in the history. Approval needs exact sources, a review date and the right reviewers.
  "Inaccurate or out of date" flags from learners land here.

  Statuses are read from the versions: Draft – pending compliance approval, Under review (paused or past its review
  date), Approved, Retired. Demonstration entries are labelled, and open in the Resources page's preview.
*/
const STATUS_TONE: Record<ContentStatus, "info" | "warn" | "good" | "neutral"> = {
  draft: "info",
  "under-review": "warn",
  approved: "good",
  retired: "neutral",
};

type Loaded = ReturnType<typeof library> & { flags: ReturnType<typeof openMythFlags>; stats: ReturnType<typeof mythStats> };
const area = cx(input, "min-h-20 py-2");
const group = "rounded-2xl bg-muted p-3";
const blankTile = (): MythTileData =>
  cleanTile({ category: "budget", audiences: ["partner", "coordinator", "staff"], placeholders: ["[Name]", "[Your name]"] });
const showDate = (d: string) => (d ? new Intl.DateTimeFormat("en-AU", { day: "numeric", month: "short", year: "numeric" }).format(new Date(d)) : "");

export function MythLibrary() {
  const loaded = useApi<Loaded>("/api/admin/myths");
  const [editing, setEditing] = useState<{ id: string; data: MythTileData } | null>(null);
  const [problem, setProblem] = useState<{ text: string; list: string[] } | null>(null);
  const [busy, setBusy] = useState(false);
  const [status, setStatus] = useState<ContentStatus | "">("");
  const act = async (body: Record<string, unknown>) => {
    setBusy(true);
    setProblem(null);
    try {
      const r = await fetch("/api/admin/myths", { method: "POST", headers: { "content-type": "application/json" }, body: JSON.stringify(body) });
      const j = await r.json();
      if (!r.ok) throw Object.assign(new Error(j.error ?? "That didn’t work."), { problems: j.problems as string[] | undefined });
      loaded.reload();
      return true;
    } catch (e) {
      setProblem({ text: (e as Error).message, list: (e as { problems?: string[] }).problems ?? [] });
      return false;
    } finally {
      setBusy(false);
    }
  };

  if (loaded.error)
    return (
      <AdminShell title="Myth vs Reality">
        <ErrorNote text={loaded.error} />
      </AdminShell>
    );
  if (!loaded.data)
    return (
      <AdminShell title="Myth vs Reality">
        <p className="text-ink-muted">Loading…</p>
      </AdminShell>
    );
  const d = loaded.data;

  if (editing)
    return (
      <AdminShell title={editing.id ? "Edit tile" : "New tile"} back={{ href: "/admin/myths", label: "Myth vs Reality" }}>
        <TileEditor
          value={editing.data}
          onChange={(data) => setEditing({ ...editing, data })}
          busy={busy}
          problem={problem}
          onCancel={() => {
            setEditing(null);
            setProblem(null);
          }}
          onSave={async () => {
            if (await act({ action: "save", id: editing.id || undefined, data: editing.data })) setEditing(null);
          }}
        />
      </AdminShell>
    );

  return (
    <AdminShell title="Myth vs Reality">
      <p className="max-w-3xl text-ink-muted">
        The client-question tiles used in courses and in Resources. Learners only ever see a tile’s approved version. Editing an approved tile starts a new
        draft; it goes live when it’s approved, and the old version stays in the history.
      </p>
      <div className="mt-4 flex flex-wrap gap-2">
        <button type="button" className={btn.primary} onClick={() => setEditing({ id: "", data: blankTile() })}>
          <Icon name="plus" className="size-4" /> New tile
        </button>
        <a href="/resources/myths" className={btn.secondary}>
          See it in Resources
        </a>
        <a href="/resources/myths?preview=1" className={btn.secondary}>
          Preview drafts and demo content
        </a>
      </div>
      {problem && (
        <div role="alert" className="mt-4 rounded-2xl bg-[#fff1cc] p-4 text-[#4a3400] dark:bg-[#3d2f08] dark:text-[#ffd97a]">
          <p className="font-semibold">{problem.list.length ? "Not yet:" : problem.text}</p>
          {problem.list.length > 0 && (
            <ul className="mt-1 list-disc pl-5">
              {problem.list.map((p) => (
                <li key={p}>{p}</li>
              ))}
            </ul>
          )}
        </div>
      )}

      {d.flags.length > 0 && (
        <section className="mt-6">
          <h2 className="font-serif text-2xl font-semibold">Flagged as out of date</h2>
          <ul className="mt-2 divide-y divide-line rounded-3xl border border-line bg-surface px-4">
            {d.flags.map((f) => (
              <FlagRow
                key={f.id}
                f={f}
                quote={d.tiles.find((t) => t.id === f.tileId)?.latest.data.quote ?? f.tileId}
                onResolve={(resolution) => act({ action: "resolve", flagId: f.id, resolution })}
              />
            ))}
          </ul>
        </section>
      )}

      <section className="mt-6">
        <h2 className="font-serif text-2xl font-semibold">Tiles</h2>
        <div role="group" aria-label="Status" className="mt-2 flex flex-wrap gap-2">
          {(["", ...Object.keys(CONTENT_STATUS)] as (ContentStatus | "")[]).map((s) => (
            <button
              key={s || "all"}
              type="button"
              aria-pressed={status === s}
              className={cx(
                "min-h-11 rounded-full px-4 text-sm font-semibold ring-1",
                status === s ? "bg-action text-on-action ring-action" : "bg-surface ring-line-strong hover:bg-muted",
              )}
              onClick={() => setStatus(s)}
            >
              {s ? CONTENT_STATUS[s] : "All"} ({s ? d.tiles.filter((t) => t.status === s).length : d.tiles.length})
            </button>
          ))}
        </div>
        <ul className="mt-3 flex flex-col gap-3">
          {d.tiles
            .filter((t) => !status || t.status === status)
            .map((t) => (
              <TileRow
                key={t.id}
                t={t}
                stats={d.stats[t.id] ?? {}}
                busy={busy}
                onEdit={() => setEditing({ id: t.id, data: structuredClone((t.draft ?? t.live ?? t.latest).data) })}
                onApprove={() => void act({ action: "approve", id: t.id })}
                onPause={(reason) => void act({ action: "pause", id: t.id, reason })}
                onResume={() => void act({ action: "resume", id: t.id })}
                onRetire={(reason) => void act({ action: "retire", id: t.id, reason })}
              />
            ))}
        </ul>
      </section>
    </AdminShell>
  );
}

function TileRow({
  t,
  stats,
  busy,
  onEdit,
  onApprove,
  onPause,
  onResume,
  onRetire,
}: {
  t: LibraryTile;
  stats: Record<string, number>;
  busy: boolean;
  onEdit: () => void;
  onApprove: () => void;
  onPause: (reason: string) => void;
  onResume: () => void;
  onRetire: (reason: string) => void;
}) {
  const live = t.live;
  const ld = t.latest.data;
  return (
    <li className="rounded-3xl border border-line bg-surface p-4">
      <div className="flex flex-wrap items-start justify-between gap-3">
        <div className="min-w-0 flex-1">
          <p className="font-serif text-lg font-semibold">“{ld.quote.replace(/^[“"]|[”"]$/g, "")}”</p>
          <p className="mt-1 flex flex-wrap items-center gap-2 text-sm text-ink-muted">
            <span>{CATEGORIES[ld.category]}</span>
            <Badge tone={STATUS_TONE[t.status]}>{CONTENT_STATUS[t.status]}</Badge>
            {ld.demo && <Badge tone="warn">{DEMO_LABEL}</Badge>}
            {ld.anchors.some((a) => a.unverified) && <Badge tone="bad">Unverified source</Badge>}
            {live ? (
              live.state === "approved" ? (
                <Badge tone="good">Live: version {live.version}</Badge>
              ) : (
                <Badge tone="warn">Under review: version {live.version}</Badge>
              )
            ) : (
              <Badge>Not live</Badge>
            )}
            {t.draft && <Badge tone="info">Draft version {t.draft.version}</Badge>}
            {t.openFlags > 0 && <Badge tone="bad">{t.openFlags} flagged inaccurate or out of date</Badge>}
          </p>
          {(ld.lastReviewed || ld.contentOwner) && (
            <p className="mt-1 text-xs text-ink-muted">
              {[ld.lastReviewed && `Last reviewed ${showDate(ld.lastReviewed)}`, ld.contentOwner && `Owner: ${ld.contentOwner}`].filter(Boolean).join(" · ")}
            </p>
          )}
          <p className="mt-1 text-xs text-ink-muted">
            {stats.opened ?? 0} opens · {stats.source ?? 0} source opens · {stats.practice ?? 0} practised · {stats.copied ?? 0} copied (not sent) ·{" "}
            {stats.useful ?? 0} useful
          </p>
        </div>
        <div className="flex flex-wrap gap-2">
          <button type="button" className={btn.secondary} onClick={onEdit}>
            <Icon name="pen" className="size-4" /> {t.draft ? "Edit draft" : "Edit (new version)"}
          </button>
          {t.draft && (
            <button type="button" className={btn.primary} disabled={busy} onClick={onApprove}>
              Approve version {t.draft.version}
            </button>
          )}
          {live && !live.paused && live.state === "approved" && (
            <button
              type="button"
              className={btn.secondary}
              disabled={busy}
              onClick={() => {
                const reason = window.prompt("Why is it under review? Copying stops until it’s resumed or a new version is approved.");
                if (reason) onPause(reason);
              }}
            >
              Put under review
            </button>
          )}
          {live?.paused && (
            <button type="button" className={btn.secondary} disabled={busy} onClick={onResume}>
              Resume
            </button>
          )}
          {t.status !== "retired" && (
            <button
              type="button"
              className={btn.quiet}
              disabled={busy}
              onClick={() => {
                const reason = window.prompt("Why is it being retired? It leaves Resources and courses; every version stays in the history.");
                if (reason) onRetire(reason);
              }}
            >
              Retire
            </button>
          )}
        </div>
      </div>
      {t.draft && t.problems.length > 0 && (
        <details className="mt-2 text-sm">
          <summary className="cursor-pointer font-semibold">
            What’s needed before version {t.draft.version} can be approved ({t.problems.length})
          </summary>
          <ul className="mt-1 list-disc pl-5">
            {t.problems.map((p) => (
              <li key={p}>{p}</li>
            ))}
          </ul>
        </details>
      )}
      <details className="mt-2 text-sm">
        <summary className="cursor-pointer text-ink-muted">History</summary>
        <ul className="mt-1">
          {t.history.map((h) => (
            <li key={h.version}>
              Version {h.version}: {h.status}
              {h.approvedAt && `, approved ${showDate(h.approvedAt)}`} · last changed {showDate(h.updatedAt)}
            </li>
          ))}
        </ul>
      </details>
    </li>
  );
}

function FlagRow({ f, quote, onResolve }: { f: ReturnType<typeof openMythFlags>[number]; quote: string; onResolve: (resolution: string) => Promise<boolean> }) {
  const [note, setNote] = useState("");
  return (
    <li className="flex flex-col gap-2 py-3">
      <p>
        <span className="font-semibold">“{quote}”</span>{" "}
        <span className="text-ink-muted">
          · version {f.version} · {f.by}, {showDate(f.at)}
        </span>
      </p>
      <p>{f.note}</p>
      <div className="flex flex-wrap items-end gap-2">
        <Field label="What you did" className="min-w-64 flex-1">
          <input className={input} value={note} maxLength={300} onChange={(e) => setNote(e.target.value)} />
        </Field>
        <button type="button" className={btn.secondary} onClick={() => void onResolve(note)}>
          Resolve
        </button>
      </div>
    </li>
  );
}

/** Every field of a tile. Saving keeps it a draft; approval is a separate step with its own checks. */
function TileEditor({
  value: v,
  onChange,
  busy,
  problem,
  onSave,
  onCancel,
}: {
  value: MythTileData;
  onChange: (d: MythTileData) => void;
  busy: boolean;
  problem: { text: string; list: string[] } | null;
  onSave: () => void;
  onCancel: () => void;
}) {
  const set = (fn: (d: MythTileData) => void) => {
    const next = structuredClone(v);
    fn(next);
    onChange(next);
  };
  const toggle = <T extends string>(list: T[], x: T) => (list.includes(x) ? list.filter((y) => y !== x) : [...list, x]);
  const problems = tileProblems(v);
  const words = wordCount(v.answer);
  return (
    <div className="flex flex-col gap-4">
      <p className="rounded-2xl bg-muted p-3 text-sm">
        Saving keeps this a draft. Learners keep seeing the approved version until this one is approved. Use a fictional composite question, never a real
        client’s words or details.
      </p>
      <div className="grid gap-3 sm:grid-cols-2">
        <Field label="You might hear (the question)" className="sm:col-span-2">
          <input className={input} value={v.quote} maxLength={200} onChange={(e) => set((d) => void (d.quote = e.target.value))} />
        </Field>
        <Field label="Topic">
          <select className={input} value={v.category} onChange={(e) => set((d) => void (d.category = e.target.value as Category))}>
            {(Object.keys(CATEGORIES) as Category[]).map((c) => (
              <option key={c} value={c}>
                {CATEGORIES[c]}
              </option>
            ))}
          </select>
        </Field>
        <fieldset className="flex flex-wrap items-end gap-3">
          <legend className="text-sm font-semibold">For</legend>
          {(Object.keys(TILE_AUDIENCES) as TileAudience[]).map((a) => (
            <label key={a} className="flex min-h-11 items-center gap-2 text-sm">
              <input
                type="checkbox"
                className="size-5"
                checked={v.audiences.includes(a)}
                onChange={() => set((d) => void (d.audiences = toggle(d.audiences, a)))}
              />
              {TILE_AUDIENCES[a]}
            </label>
          ))}
        </fieldset>
        <fieldset className="flex flex-wrap gap-3 sm:col-span-2">
          <legend className="text-sm font-semibold">Applies to</legend>
          {(Object.keys(APPLICABILITY) as Applicability[]).map((a) => (
            <label key={a} className="flex min-h-11 items-center gap-2 text-sm">
              <input
                type="checkbox"
                className="size-5"
                checked={v.applicability.includes(a)}
                onChange={() => set((d) => void (d.applicability = toggle(d.applicability, a)))}
              />
              {APPLICABILITY[a]}
            </label>
          ))}
        </fieldset>
        <Field label="Myth" hint="What people believe, in a line.">
          <textarea className={area} value={v.myth ?? ""} maxLength={300} onChange={(e) => set((d) => void (d.myth = e.target.value))} />
        </Field>
        <Field label="Reality" hint="What’s actually so, in a line or two.">
          <textarea className={area} value={v.reality ?? ""} maxLength={600} onChange={(e) => set((d) => void (d.reality = e.target.value))} />
        </Field>
        <Field
          label="What to say in 30 seconds"
          hint={`${words} words, about ${secondsToSay(v.answer)} seconds to say.${words && (words < 60 || words > 85) ? " Aim for 60 to 85, but keep the exception even if it runs longer." : ""}`}
          className="sm:col-span-2"
        >
          <textarea className={cx(area, "min-h-32")} value={v.answer} maxLength={900} onChange={(e) => set((d) => void (d.answer = e.target.value))} />
        </Field>
        <Field label="Important exception" hint="One line, when the rule depends on program, history or approved services.">
          <textarea className={area} value={v.exception} maxLength={300} onChange={(e) => set((d) => void (d.exception = e.target.value))} />
        </Field>
        <Field label="What to check for this participant" hint="One to three, one per line. A single line written as a list shows as its items.">
          <textarea className={area} value={v.checks.join("\n")} onChange={(e) => set((d) => void (d.checks = e.target.value.split("\n").slice(0, 3)))} />
        </Field>
        <Field
          label="Search phrases"
          hint="The words people actually use, one per line, such as “lose my money” or “leftover funds”. Search finds the tile by these too."
          className="sm:col-span-2"
        >
          <textarea
            className={area}
            value={(v.searchPhrases ?? []).join("\n")}
            onChange={(e) => set((d) => void (d.searchPhrases = e.target.value.split("\n").slice(0, 24)))}
          />
        </Field>
        <Field label="If a family member asks (optional)" className="sm:col-span-2">
          <textarea className={area} value={v.familyWording} maxLength={600} onChange={(e) => set((d) => void (d.familyWording = e.target.value))} />
        </Field>
      </div>

      <div className={group}>
        <h3 className="font-semibold">Sources</h3>
        <p className="text-sm text-ink-muted">The exact section or clause. Label the authority accurately: guidance isn’t legislation.</p>
        {v.anchors.map((a, i) => (
          <div key={i} className="mt-2 grid gap-2 rounded-xl bg-surface p-3 sm:grid-cols-2">
            <Field label="Type">
              <select className={input} value={a.type} onChange={(e) => set((d) => void (d.anchors[i].type = e.target.value as SourceType))}>
                {(Object.keys(SOURCE_TYPES) as SourceType[]).map((s) => (
                  <option key={s} value={s}>
                    {SOURCE_TYPES[s]}
                  </option>
                ))}
              </select>
            </Field>
            <Field label="Publisher or owner">
              <input className={input} value={a.publisher} onChange={(e) => set((d) => void (d.anchors[i].publisher = e.target.value))} />
            </Field>
            <Field label="Document">
              <input className={input} value={a.document} onChange={(e) => set((d) => void (d.anchors[i].document = e.target.value))} />
            </Field>
            <Field label="Section or clause">
              <input className={input} value={a.section} onChange={(e) => set((d) => void (d.anchors[i].section = e.target.value))} />
            </Field>
            <Field label="Link" hint="https:// only.">
              <input type="url" className={input} value={a.url} onChange={(e) => set((d) => void (d.anchors[i].url = e.target.value))} />
            </Field>
            <Field label="Internal policy ID">
              <input className={input} value={a.internalId} onChange={(e) => set((d) => void (d.anchors[i].internalId = e.target.value))} />
            </Field>
            <Field label="Effective from">
              <input type="date" className={input} value={a.effective} onChange={(e) => set((d) => void (d.anchors[i].effective = e.target.value))} />
            </Field>
            <Field label="Last checked">
              <input type="date" className={input} value={a.verifiedOn} onChange={(e) => set((d) => void (d.anchors[i].verifiedOn = e.target.value))} />
            </Field>
            <label className="flex min-h-11 items-center gap-2 text-sm font-semibold sm:col-span-2">
              <input
                type="checkbox"
                className="size-5"
                checked={Boolean(a.unverified)}
                onChange={(e) => set((d) => void (d.anchors[i].unverified = e.target.checked))}
              />
              Unverified (pending internal verification): blocks approval
            </label>
            <div className="sm:col-span-2">
              <button type="button" className={btn.quiet} onClick={() => set((d) => void d.anchors.splice(i, 1))}>
                <Icon name="trash" className="size-4" /> Remove this source
              </button>
            </div>
          </div>
        ))}
        <button
          type="button"
          className={cx(btn.secondary, "mt-2")}
          disabled={v.anchors.length >= 4}
          onClick={() =>
            set(
              (d) =>
                void d.anchors.push({ type: "guidance", document: "", section: "", publisher: "", url: "", internalId: "", effective: "", verifiedOn: "" }),
            )
          }
        >
          <Icon name="plus" className="size-4" /> Add a source
        </button>
      </div>

      <div className={group}>
        <h3 className="font-semibold">The email reply</h3>
        <p className="text-sm text-ink-muted">
          Staff can copy it only once the tile is approved. From a draft or demo entry, a copy starts with a do-not-send line.
        </p>
        <div className="mt-2 grid gap-3">
          <Field label="Subject">
            <input className={input} value={v.message.subject} maxLength={160} onChange={(e) => set((d) => void (d.message.subject = e.target.value))} />
          </Field>
          <Field label="Body" hint="Never state a person’s balance, entitlement or approved services: it’s copied by staff after they’ve checked.">
            <textarea
              className={cx(area, "min-h-48")}
              value={v.message.body}
              maxLength={2000}
              onChange={(e) => set((d) => void (d.message.body = e.target.value))}
            />
          </Field>
          <Field
            label="Approved placeholders"
            hint={`In use: ${placeholdersIn(`${v.message.subject}\n${v.message.body}`).join(", ") || "none"}. Comma-separated, in square brackets.`}
          >
            <input
              className={input}
              value={v.placeholders.join(", ")}
              onChange={(e) =>
                set(
                  (d) =>
                    void (d.placeholders = e.target.value
                      .split(",")
                      .map((x) => x.trim())
                      .filter((x) => /^\[[^\]\n]{1,40}\]$/.test(x))),
                )
              }
            />
          </Field>
          <Field label="When copying is allowed (optional)">
            <input className={input} value={v.copyNote} maxLength={300} onChange={(e) => set((d) => void (d.copyNote = e.target.value))} />
          </Field>
        </div>
      </div>

      <div className={group}>
        <h3 className="font-semibold">Review and sign-off</h3>
        <div className="mt-2 flex flex-wrap gap-4">
          <label className="flex min-h-11 items-center gap-2 text-sm font-semibold">
            <input type="checkbox" className="size-5" checked={v.funding} onChange={(e) => set((d) => void (d.funding = e.target.checked))} />
            Covers funding or fees (Finance signs off)
          </label>
          <label className="flex min-h-11 items-center gap-2 text-sm font-semibold">
            <input type="checkbox" className="size-5" checked={v.clinical} onChange={(e) => set((d) => void (d.clinical = e.target.checked))} />
            Makes clinical claims (Clinical signs off)
          </label>
          <label className="flex min-h-11 items-center gap-2 text-sm font-semibold">
            <input type="checkbox" className="size-5" checked={v.aiDraft} onChange={(e) => set((d) => void (d.aiDraft = e.target.checked))} />
            AI-drafted, not yet checked by a person
          </label>
          <label className="flex min-h-11 items-center gap-2 text-sm font-semibold">
            <input type="checkbox" className="size-5" checked={Boolean(v.demo)} onChange={(e) => set((d) => void (d.demo = e.target.checked))} />
            Demonstration content (labelled “{DEMO_LABEL}”; blocks approval)
          </label>
        </div>
        <div className="mt-2 grid gap-3 sm:grid-cols-2">
          <Field label="Content owner" hint="The team that owns the content. Not a sign-off.">
            <input className={input} value={v.contentOwner ?? ""} maxLength={120} onChange={(e) => set((d) => void (d.contentOwner = e.target.value))} />
          </Field>
          <Field label="Last reviewed">
            <input type="date" className={input} value={v.lastReviewed ?? ""} onChange={(e) => set((d) => void (d.lastReviewed = e.target.value))} />
          </Field>
        </div>
        <div className="mt-2 grid gap-3 sm:grid-cols-2">
          {(
            [
              ["owner", "Claim owner"],
              ["quality", "Policy or Quality"],
              ["operations", "Care Operations"],
              ["finance", "Finance"],
              ["clinical", "Clinical"],
              ["communications", "Communications (plain language)"],
            ] as const
          ).map(([k, label]) => (
            <Field key={k} label={label}>
              <input className={input} value={v.approval[k]} maxLength={120} onChange={(e) => set((d) => void (d.approval[k] = e.target.value))} />
            </Field>
          ))}
          <Field label="Signed off on">
            <input type="date" className={input} value={v.approval.approvedOn} onChange={(e) => set((d) => void (d.approval.approvedOn = e.target.value))} />
          </Field>
          <Field label="Next review" hint="After this day the tile shows as under review and can’t be copied.">
            <input type="date" className={input} value={v.reviewDue} onChange={(e) => set((d) => void (d.reviewDue = e.target.value))} />
          </Field>
        </div>
      </div>

      {problems.length > 0 && (
        <div className="rounded-2xl bg-surface p-3 text-sm ring-1 ring-line">
          <p className="font-semibold">Before it can be approved</p>
          <ul className="mt-1 list-disc pl-5">
            {problems.map((p) => (
              <li key={p}>{p}</li>
            ))}
          </ul>
        </div>
      )}
      {problem && (
        <p role="alert" className="rounded-2xl bg-[#fff1cc] p-3 text-[#4a3400] dark:bg-[#3d2f08] dark:text-[#ffd97a]">
          {problem.text}
        </p>
      )}
      <div className="flex flex-wrap gap-2">
        <button type="button" className={btn.primary} disabled={busy} onClick={onSave}>
          Save draft
        </button>
        <button type="button" className={btn.secondary} onClick={onCancel}>
          Cancel
        </button>
      </div>
    </div>
  );
}
