"use client";

import Link from "next/link";
import { useRouter } from "next/navigation";
import { useState } from "react";
import { api, useApi } from "@/lib/api";
import { cx } from "@/lib/format";
import { confirmAction } from "@/lib/confirm";
import { COMPLETION_MODES, GUIDE_AUDIENCES, UNTITLED_COURSE, type CompletionMode, type GuideAudience } from "@/lib/magazine";
import { wordsAsFile } from "@/lib/documentText";
import { AiWriterBox } from "./AiWriterBox";
import { DocumentsDrop, type DroppedDocument } from "./DocumentDrop";
import { TemplatePicker, type TemplateChoice } from "./MagazineTemplates";
import { AdminShell, Badge, btn, ErrorNote, Field, input } from "./ui";
import { AdminCard, AdminEmpty, AdminGrid, AdminListHeader, AdminToolbar, DeletedList, PlainCover, cardLink, deletedOn } from "./AdminCards";
import { Icon } from "../Icon";

/*
  Magazine: every guide and course, laid out like Topics and Discovery Paths: find one, Edit it, or
  Delete it (it can be restored from Deleted guides and courses; learners' records are kept). New
  Magazine starts one, by hand or drafted with AI.
*/

type Row = {
  id: string;
  slug: string;
  title: string;
  standfirst: string;
  cover: string | null;
  format: string;
  pages: number;
  minutes: number;
  status: "draft" | "in_review" | "approved" | "published" | "archived";
  audience: GuideAudience[];
  completion: CompletionMode;
  changed: boolean;
  publishedNumber: number | null;
  savedAt: string;
  updatedAt: string;
  blocking: number;
  started: number;
  completed: number;
};

export function statusBadge(g: Pick<Row, "status" | "changed" | "publishedNumber">) {
  if (g.status === "archived") return <Badge>Deleted</Badge>;
  if (!g.publishedNumber) return <Badge tone="warn">Draft, not published</Badge>;
  return g.changed ? (
    <Badge tone="info">Edition {g.publishedNumber} live · changes not published</Badge>
  ) : (
    <Badge tone="good">Edition {g.publishedNumber} live</Badge>
  );
}

const SORTS = {
  attention: "Needs attention first",
  edited: "Recently edited",
  az: "Title A–Z",
  za: "Title Z–A",
  shortest: "Shortest first",
  longest: "Longest first",
} as const;
type Sort = keyof typeof SORTS;
/** Lower comes first: drafts, then unpublished changes, then the rest. */
const attention = (g: Row) => (!g.publishedNumber ? 0 : g.changed ? 1 : 2);
const byTitle = (a: Row, b: Row) => a.title.localeCompare(b.title, "en-AU", { sensitivity: "base" });
const COMPARE: Record<Sort, (a: Row, b: Row) => number> = {
  attention: (a, b) => attention(a) - attention(b) || byTitle(a, b),
  edited: (a, b) => b.updatedAt.localeCompare(a.updatedAt) || byTitle(a, b),
  az: byTitle,
  za: (a, b) => byTitle(b, a),
  shortest: (a, b) => a.minutes - b.minutes || byTitle(a, b),
  longest: (a, b) => b.minutes - a.minutes || byTitle(a, b),
};
const AUDIENCE_LABEL = Object.fromEntries(GUIDE_AUDIENCES.map((a) => [a.value, a.label])) as Record<GuideAudience, string>;

export function MagazineAdmin() {
  const { data, error, reload } = useApi<{ guides: Row[] }>("/api/admin/magazine");
  const [creating, setCreating] = useState(false);
  const [busy, setBusy] = useState<string | null>(null);
  const [problem, setProblem] = useState<string | null>(null);
  const [q, setQ] = useState("");
  const [kind, setKind] = useState("all");
  const [audience, setAudience] = useState("all");
  const [sort, setSort] = useState<Sort>("attention");

  /** Delete takes it out of Magazine (it can be restored); restore brings it back as it was. */
  async function lifecycle(g: Row, action: "archive" | "restore") {
    if (
      action === "archive" &&
      !(await confirmAction(
        "Learners won’t see it any more and it leaves this list. Their progress and completions are kept, and you can restore it from Deleted guides and courses.",
        { title: `Delete “${g.title || "Untitled guide"}”?`, confirmLabel: g.pages > 1 ? "Delete course" : "Delete guide", danger: true },
      ))
    )
      return;
    setBusy(g.id);
    setProblem(null);
    try {
      await api(`/api/admin/magazine/${g.id}`, { body: { action } });
    } catch (e) {
      setProblem((e as Error).message);
    } finally {
      setBusy(null);
      reload();
    }
  }

  const all = data?.guides ?? [];
  const live = all.filter((g) => g.status !== "archived");
  const deleted = all.filter((g) => g.status === "archived");
  const needle = q.trim().toLowerCase();
  const shown = live
    .filter(
      (g) =>
        (kind === "all" || (kind === "course") === g.pages > 1) &&
        (audience === "all" || (audience === "none" ? !g.audience.length : g.audience.includes(audience as GuideAudience))) &&
        (!needle || `${g.title} ${g.standfirst}`.toLowerCase().includes(needle)),
    )
    .sort(COMPARE[sort]);
  const clear = () => {
    setQ("");
    setKind("all");
    setAudience("all");
  };

  return (
    <AdminShell title="Magazine">
      <AdminListHeader
        title="Guides and courses"
        action={
          <button type="button" className={btn.primary} onClick={() => setCreating((c) => !c)} aria-expanded={creating}>
            <Icon name="plus" className="size-4" /> New Magazine
          </button>
        }
      >
        Longer reads for a desk: a one-page guide, or a course of pages, each with its own teaching pattern (Decide, Do, Notice, Adapt). Edit each page as
        learners will see it; they keep reading the published edition until you publish your changes.
      </AdminListHeader>

      {creating && <NewGuide onCancel={() => setCreating(false)} />}
      {(error || problem) && (
        <div className="mt-4">
          <ErrorNote text={(problem ?? error)!} />
        </div>
      )}
      {!data ? (
        !error && <p className="mt-6 text-ink-muted">Loading guides and courses…</p>
      ) : (
        <>
          <AdminToolbar
            search={{ value: q, onChange: setQ, placeholder: "Title or a word in it" }}
            selects={[
              {
                label: "Kind",
                value: kind,
                onChange: setKind,
                options: [
                  { value: "all", label: "Guides and courses" },
                  { value: "guide", label: "Guides (one page)" },
                  { value: "course", label: "Courses (several pages)" },
                ],
              },
              {
                label: "Audience",
                value: audience,
                onChange: setAudience,
                options: [
                  { value: "all", label: "All audiences" },
                  ...GUIDE_AUDIENCES.map((a) => ({ value: a.value, label: a.label })),
                  { value: "none", label: "Everyone" },
                ],
              },
              {
                label: "Sort by",
                value: sort,
                onChange: (v) => setSort(v as Sort),
                options: (Object.keys(SORTS) as Sort[]).map((s) => ({ value: s, label: SORTS[s] })),
              },
            ]}
            count={
              shown.length === live.length
                ? `${live.length} ${live.length === 1 ? "guide or course" : "guides and courses"}`
                : `Showing ${shown.length} of ${live.length}`
            }
          />
          {shown.length ? (
            <AdminGrid columns={4}>
              {shown.map((g) => (
                <AdminCard
                  key={g.id}
                  cover={
                    g.cover ? (
                      // eslint-disable-next-line @next/next/no-img-element
                      <img src={g.cover} alt="" className="aspect-[4/3] w-full bg-muted object-cover" />
                    ) : (
                      <PlainCover icon="magazine" />
                    )
                  }
                  badges={
                    <>
                      {!g.publishedNumber && <Badge tone="warn">Draft, not published</Badge>}
                      {g.publishedNumber && g.changed && <Badge tone="info">Unpublished changes</Badge>}
                      {g.blocking > 0 && <Badge tone="bad">{g.blocking === 1 ? "1 check to resolve" : `${g.blocking} checks to resolve`}</Badge>}
                    </>
                  }
                  meta={[g.pages > 1 ? `Course · ${g.pages} pages` : "Guide", `${g.minutes} min`, COMPLETION_MODES[g.completion]].join(" · ")}
                  chips={g.audience.length ? g.audience.map((a) => AUDIENCE_LABEL[a]) : ["Everyone"]}
                  title={g.title || "Untitled guide"}
                  href={g.publishedNumber ? `/magazine/${g.slug}` : null}
                  editHref={`/admin/magazine/${g.id}`}
                  editLabel={g.pages > 1 ? "Edit course" : "Edit guide"}
                  secondary={
                    g.publishedNumber ? (
                      <Link href={`/magazine/${g.slug}`} className={cardLink}>
                        <Icon name="external" className="size-4" /> View live
                      </Link>
                    ) : undefined
                  }
                  onDelete={() => void lifecycle(g, "archive")}
                  deleteLabel={g.pages > 1 ? "Delete course" : "Delete guide"}
                  deleting={busy === g.id}
                  disabled={busy !== null}
                >
                  <p className="text-sm text-ink-muted">{g.publishedNumber ? `${g.started} started · ${g.completed} completed` : "Not published yet"}</p>
                </AdminCard>
              ))}
            </AdminGrid>
          ) : live.length ? (
            <AdminEmpty text="Nothing matches." onClear={clear} />
          ) : (
            <AdminEmpty text="No guides or courses yet. Start one with New Magazine." />
          )}
          <DeletedList
            title="Deleted guides and courses"
            note="Hidden from learners. Their progress and completions are kept. Restore one to put it back as it was."
            items={deleted.map((g) => ({
              id: g.id,
              title: g.title || "Untitled guide",
              detail: `${g.pages > 1 ? `Course · ${g.pages} pages` : "Guide"} · ${deletedOn(g.updatedAt)}`,
            }))}
            onRestore={(id) =>
              void lifecycle(
                deleted.find((g) => g.id === id)!,
                "restore",
              )
            }
            busyId={busy}
          />
        </>
      )}
    </AdminShell>
  );
}

/** Title, what learners will be able to do, guide or course, the first page's template, audience and completion. The rest is in the editor. */
function NewGuide({ onCancel }: { onCancel: () => void }) {
  const router = useRouter();
  const [title, setTitle] = useState("");
  const [standfirst, setStandfirst] = useState("");
  const [format, setFormat] = useState<"single" | "course">("single");
  const [template, setTemplate] = useState<TemplateChoice>("decide");
  // Write it with AI: a brief and a length for the AI, beside the documents. With either, the course is written by AI.
  const [aiBrief, setAiBrief] = useState("");
  const [aiMinutes, setAiMinutes] = useState(20);
  // The source documents, read here in the browser (only their words go up, however large the file) and added to the
  // new course's AI drafting once it exists. A SCORM package goes up as it is.
  const [docs, setDocs] = useState<DroppedDocument[]>([]);
  const [reading, setReading] = useState(0);
  const [audience, setAudience] = useState<GuideAudience[]>(["coordinator"]);
  const [completion, setCompletion] = useState<CompletionMode>("confirm");
  const [busy, setBusy] = useState(false);
  const [problem, setProblem] = useState<string | null>(null);
  const withAi = docs.length > 0 || aiBrief.trim().length >= 10;

  const create = async (ai: boolean) => {
    setBusy(true);
    setProblem(null);
    try {
      // Drafted from documents with no title yet: a working title, which the AI outline replaces with its own.
      const named = title.trim() || (ai ? UNTITLED_COURSE : title);
      const g = await api<{ id: string }>("/api/admin/magazine", { body: { title: named, standfirst, template, audience, completion } });
      // The documents go to its AI drafting before the editor opens on it, so the outline can be proposed straight away.
      if (ai && docs.length) {
        const failed: string[] = [];
        for (const d of docs) {
          const form = new FormData();
          form.append("file", d.read.kind === "scorm" ? d.read.file : wordsAsFile(d.read.doc));
          const res = await fetch(`/api/admin/magazine/${g.id}/ai/sources`, { method: "POST", body: form }).catch(() => null);
          if (!res?.ok) failed.push(d.name);
        }
        if (failed.length) window.alert(`The course was made, but these didn’t upload: ${failed.join(", ")}. Add them again in its AI drafting panel.`);
      }
      if (ai) await api(`/api/admin/magazine/${g.id}/ai`, { method: "PUT", body: { brief: aiBrief.trim(), minutes: aiMinutes, outline: null } });
      // A course opens on its outline, to plan the pages; a guide opens on its page.
      router.push(`/admin/magazine/${g.id}${ai ? "?ai=auto" : format === "course" ? "?view=outline" : ""}`);
    } catch (err) {
      setProblem(err instanceof Error ? err.message : "That didn’t work.");
      setBusy(false);
    }
  };

  return (
    <form
      onSubmit={(e) => {
        e.preventDefault();
        void create(withAi);
      }}
      className="mt-6 flex flex-col gap-5 rounded-3xl border border-line bg-surface p-5 sm:p-6"
    >
      <h2 className="font-serif text-2xl font-semibold">New Magazine</h2>
      {/* Write it with AI (the owner, Nov 2026): as on New story, drop documents and/or write a brief, and one button makes
          the course, proposes its outline (with its title and summary) and writes every page, for you to review. */}
      <AiWriterBox
        heading="h3"
        intro={
          <>
            Drop in the source documents, or write a brief, or both. AI proposes the title, what learners will be able to do and an outline, then writes every
            page. Nothing is published: you review it all in the editor.
          </>
        }
        drop={<DocumentsDrop value={docs} onChange={setDocs} onReadingChange={setReading} disabled={busy} />}
        brief={{
          value: aiBrief,
          onChange: setAiBrief,
          hasDocument: docs.length > 0,
          disabled: busy,
          placeholder:
            "For example: Teach new coordinators to inspect a supplier invoice and decide what to clarify before approval. Don’t invent rates or approval rules.",
        }}
        settings={
          <div role="group" aria-label="How long the whole course should take" className="flex flex-wrap items-center gap-2">
            <span className="text-sm font-semibold">Length</span>
            {[10, 20, 30, 45, 60].map((t) => (
              <button
                key={t}
                type="button"
                aria-pressed={aiMinutes === t}
                onClick={() => setAiMinutes(t)}
                className={cx(
                  "min-h-10 rounded-full px-4 text-sm font-semibold",
                  aiMinutes === t ? "bg-action text-on-action" : "border border-line-strong bg-surface hover:bg-muted",
                )}
              >
                {t} min
              </button>
            ))}
          </div>
        }
        action={{
          label: docs.length ? `Write the course from ${docs.length === 1 ? "this document" : "these documents"}` : "Write the course with AI",
          busyLabel: "Starting the course…",
          busy,
          disabled: reading > 0 || !withAi,
          onClick: () => void create(true),
        }}
        note={<span className="text-sm text-ink-muted">The editor opens and writes the outline, then every page.</span>}
      />
      <Field
        label="Title"
        hint={withAi ? "Optional when writing it with AI: it proposes one with the outline." : "A working title is fine; you can change it on the page."}
      >
        <input
          className={input}
          value={title}
          onChange={(e) => setTitle(e.target.value)}
          maxLength={140}
          required={!withAi}
          autoFocus
          placeholder="When an invoice doesn’t match the service"
        />
      </Field>
      <Field label="What learners will be able to do at the end" hint="Shown under the title. You can change it later.">
        <input
          className={input}
          value={standfirst}
          onChange={(e) => setStandfirst(e.target.value)}
          maxLength={400}
          placeholder="Inspect a supplier invoice and decide what to clarify before it’s approved."
        />
      </Field>
      <fieldset>
        <legend className="text-sm font-semibold">Start as</legend>
        <div className="mt-2 grid gap-3 sm:grid-cols-2">
          {(
            [
              ["single", "Single guide", "One page. Add more pages later and it becomes a course, keeping its address and records."],
              ["course", "Multi-page course", "Plan several pages, each with its own purpose and teaching pattern."],
            ] as const
          ).map(([v, label, hint]) => (
            <label
              key={v}
              className={cx(
                "flex cursor-pointer flex-col gap-1 rounded-2xl border p-4 has-[:focus-visible]:outline has-[:focus-visible]:outline-2 has-[:focus-visible]:outline-focus",
                format === v ? "border-action bg-tealtint" : "border-line hover:bg-muted",
              )}
            >
              <span className="flex items-center gap-2 font-semibold">
                <input type="radio" name="format" checked={format === v} onChange={() => setFormat(v)} className="size-4 accent-[var(--color-action)]" />
                {label}
              </span>
              <span className="text-sm text-ink-muted">{hint}</span>
            </label>
          ))}
        </div>
      </fieldset>
      <div hidden={withAi}>
        {format === "course" && <p className="mb-2 text-sm text-ink-muted">The first page; add the others from the course outline.</p>}
        <TemplatePicker value={template} onChange={setTemplate} name="new-template" />
      </div>
      <div className="grid gap-5 sm:grid-cols-2">
        <fieldset>
          <legend className="text-sm font-semibold">Who it’s for</legend>
          <div className="mt-2 flex flex-col gap-2">
            {GUIDE_AUDIENCES.map((a) => (
              <label key={a.value} className="flex items-center gap-2">
                <input
                  type="checkbox"
                  className="size-4 accent-[var(--color-action)]"
                  checked={audience.includes(a.value)}
                  onChange={(e) => setAudience((x) => (e.target.checked ? [...x, a.value] : x.filter((v) => v !== a.value)))}
                />
                {a.label}
              </label>
            ))}
            <span className="text-xs text-ink-muted">None ticked: everyone signed in can read it.</span>
          </div>
        </fieldset>
        <Field label="How it’s completed">
          <select className={input} value={completion} onChange={(e) => setCompletion(e.target.value as CompletionMode)}>
            {(Object.keys(COMPLETION_MODES) as CompletionMode[]).map((m) => (
              <option key={m} value={m}>
                {COMPLETION_MODES[m]}
              </option>
            ))}
          </select>
        </Field>
      </div>
      {problem && <ErrorNote text={problem} />}
      <div className="flex flex-wrap gap-2">
        <button type="submit" className={withAi ? btn.secondary : btn.primary} disabled={busy || reading > 0 || (title.trim().length < 2 && !withAi)}>
          {withAi ? <Icon name="spark" className="size-4" /> : null}
          {busy ? "Creating…" : withAi ? "Write the course with AI" : "Create and edit"}
        </button>
        <button type="button" className={btn.secondary} onClick={onCancel} disabled={busy}>
          Cancel
        </button>
      </div>
    </form>
  );
}
