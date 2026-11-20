"use client";

import Link from "next/link";
import { useEffect, useState } from "react";
import { useApi } from "@/lib/api";
import { cx } from "@/lib/format";
import { CHARACTER_ROLES, PORTRAIT_STATUS, type Character, type CharacterRole } from "@/lib/characters";
import type { characterLibrary } from "@/server/characters";
import { AdminShell, Badge, btn, ErrorNote, Field, input } from "./ui";
import { ImageLibraryDialog } from "./ImagePicker";
import { Icon } from "../Icon";

/*
  The character photo library (docs/character-photos.md): the fictional people in training scenarios, each with one
  portrait. Scenarios find a portrait by the name they use, so nobody has to search for one. Portraits are made with
  OpenAI in the background, one at a time; this page checks back while any are being made.
*/

type Loaded = ReturnType<typeof characterLibrary>;
type Row = Loaded["characters"][number];
const tone = (s: Character["status"]) => (s === "ready" ? "good" : s === "generating" ? "info" : s === "failed" ? "bad" : "warn");
type Draft = { id?: string; name: string; aliases: string; role: CharacterRole; look: string; alt: string };
const draftOf = (c?: Row): Draft => ({
  id: c?.id,
  name: c?.name ?? "",
  aliases: c?.aliases.join(", ") ?? "",
  role: c?.role ?? "participant",
  look: c?.look ?? "",
  alt: c?.alt ?? "",
});

export function CharacterLibraryAdmin() {
  const lib = useApi<Loaded>("/api/admin/characters");
  const [editing, setEditing] = useState<Draft | null>(null);
  const [picking, setPicking] = useState<Row | null>(null);
  const [problem, setProblem] = useState("");
  const [busy, setBusy] = useState(false);
  const generating = lib.data?.characters.some((c) => c.status === "generating") ?? false;
  const { reload } = lib;
  // While portraits are being made, check back every few seconds.
  useEffect(() => {
    if (!generating) return;
    const t = setInterval(reload, 5000);
    return () => clearInterval(t);
  }, [generating, reload]);

  const post = async (body: Record<string, unknown>) => {
    setBusy(true);
    setProblem("");
    try {
      const r = await fetch("/api/admin/characters", { method: "POST", headers: { "content-type": "application/json" }, body: JSON.stringify(body) });
      const j = await r.json();
      if (!r.ok) throw new Error(j.error ?? "That didn’t work.");
      lib.reload();
      return true;
    } catch (e) {
      setProblem((e as Error).message);
      return false;
    } finally {
      setBusy(false);
    }
  };

  const shell = (children: React.ReactNode) => (
    <AdminShell title="Character photos" back={{ href: "/admin/images", label: "Image library" }}>
      {children}
    </AdminShell>
  );
  if (lib.error) return shell(<ErrorNote text={lib.error} />);
  if (!lib.data) return shell(<p className="text-ink-muted">Loading…</p>);
  const { characters, openai } = lib.data;
  const missing = characters.filter((c) => !c.hidden && !c.portrait && c.status !== "generating");
  const shown = [...characters].sort((a, b) => Number(a.hidden) - Number(b.hidden));

  return shell(
    <div className="flex flex-col gap-5">
      <p className="max-w-3xl text-ink-muted">
        The fictional people in training scenarios, each with one portrait. When a scenario names someone here (by name or another way of writing it), their
        portrait appears beside them automatically. When a course is published, anyone its scenarios name who isn’t here is added, and a portrait is made for
        anyone without one.
      </p>
      {!openai && (
        <p className="rounded-2xl bg-muted p-3">OpenAI isn’t connected, so portraits can’t be generated. You can still choose one from the image library.</p>
      )}
      <div className="flex flex-wrap items-center gap-2">
        <button type="button" className={btn.primary} disabled={busy || !openai || !missing.length} onClick={() => void post({ action: "generate-missing" })}>
          <Icon name="spark" className="size-4" /> Generate missing portraits ({missing.length})
        </button>
        <button type="button" className={btn.secondary} onClick={() => setEditing(draftOf())}>
          <Icon name="plus" className="size-4" /> Add a character
        </button>
        {generating && (
          <span role="status" className="text-sm font-semibold">
            Making portraits, one at a time. This page updates as each is done.
          </span>
        )}
      </div>
      {problem && <ErrorNote text={problem} />}
      {editing && !editing.id && <Editor draft={editing} busy={busy} onCancel={() => setEditing(null)} onSave={(d) => void save(d)} />}

      <ul className="grid gap-3 sm:grid-cols-2 xl:grid-cols-3">
        {shown.map((c) => (
          <li key={c.id} className={cx("flex flex-col gap-3 rounded-3xl border border-line bg-surface p-4", c.hidden && "opacity-60")}>
            <div className="flex items-start gap-3">
              {c.portrait ? (
                // eslint-disable-next-line @next/next/no-img-element -- library pictures are served as they are
                <img src={c.portrait} alt={c.alt} className="size-20 shrink-0 rounded-full bg-muted object-cover" />
              ) : (
                <span aria-hidden className="grid size-20 shrink-0 place-items-center rounded-full bg-muted font-serif text-2xl font-semibold text-ink-muted">
                  {c.name
                    .split(/\s+/)
                    .map((w) => w[0])
                    .join("")
                    .slice(0, 2)}
                </span>
              )}
              <div className="min-w-0 flex-1">
                <p className="font-serif text-lg font-semibold">{c.name}</p>
                {c.aliases.length > 0 && <p className="text-sm text-ink-muted">Also written: {c.aliases.join(", ")}</p>}
                <p className="text-sm text-ink-muted">{CHARACTER_ROLES[c.role]}</p>
                <div className="mt-1 flex flex-wrap gap-1">
                  <Badge tone={tone(c.status)}>{PORTRAIT_STATUS[c.status]}</Badge>
                  {c.hidden && <Badge>Hidden</Badge>}
                  {c.origin === "publish" && <Badge tone="info">Added on publish</Badge>}
                </div>
              </div>
            </div>
            {c.status === "failed" && c.error && <p className="text-sm text-[#b3261e]">{c.error}</p>}
            {c.usedIn.length > 0 ? (
              <p className="text-sm">
                In{" "}
                {c.usedIn.slice(0, 3).map((g, i) => (
                  <span key={g.id}>
                    {i > 0 && ", "}
                    <Link href={`/admin/magazine/${g.id}`} className="text-accent underline">
                      {g.title}
                    </Link>
                  </span>
                ))}
                {c.usedIn.length > 3 && ` and ${c.usedIn.length - 3} more`}
              </p>
            ) : (
              <p className="text-sm text-ink-muted">Not in a Magazine course yet.</p>
            )}
            {editing?.id === c.id ? (
              <Editor draft={editing} busy={busy} onCancel={() => setEditing(null)} onSave={(d) => void save(d)} />
            ) : (
              <div className="mt-auto flex flex-wrap gap-1">
                <button
                  type="button"
                  className={btn.quiet}
                  disabled={busy || !openai || c.status === "generating" || !c.look.trim()}
                  title={!c.look.trim() ? "Describe how they look first" : undefined}
                  onClick={() => void post({ action: "generate", ids: [c.id] })}
                >
                  <Icon name="spark" className="size-4" /> {c.portrait ? "Regenerate" : "Generate"}
                </button>
                <button type="button" className={btn.quiet} onClick={() => setPicking(c)}>
                  <Icon name="image" className="size-4" /> Choose from library
                </button>
                <button type="button" className={btn.quiet} onClick={() => setEditing(draftOf(c))}>
                  <Icon name="pen" className="size-4" /> Edit
                </button>
                <button type="button" className={btn.quiet} disabled={busy} onClick={() => void post({ action: "save", id: c.id, hidden: !c.hidden })}>
                  <Icon name={c.hidden ? "eye" : "minus"} className="size-4" /> {c.hidden ? "Show" : "Hide"}
                </button>
              </div>
            )}
          </li>
        ))}
      </ul>
      <ImageLibraryDialog
        open={Boolean(picking)}
        current={picking?.portrait}
        onClose={() => setPicking(null)}
        onPick={(p) => picking && void post({ action: "save", id: picking.id, portrait: p.src, alt: `Portrait of ${picking.name}, a fictional character` })}
      />
    </div>,
  );

  async function save(d: Draft) {
    const ok = await post({
      action: "save",
      id: d.id,
      name: d.name,
      aliases: d.aliases
        .split(",")
        .map((x) => x.trim())
        .filter(Boolean),
      role: d.role,
      look: d.look,
      alt: d.alt,
    });
    if (ok) setEditing(null);
  }
}

function Editor({ draft, busy, onSave, onCancel }: { draft: Draft; busy: boolean; onSave: (d: Draft) => void; onCancel: () => void }) {
  const [d, setD] = useState(draft);
  return (
    <div className="flex flex-col gap-3 rounded-2xl bg-muted p-3">
      <Field label="Name, as scenarios write it">
        <input className={input} value={d.name} maxLength={80} onChange={(e) => setD({ ...d, name: e.target.value })} />
      </Field>
      <Field label="Other ways it’s written" hint="Separate with commas, like “Mrs Alder”.">
        <input className={input} value={d.aliases} maxLength={300} onChange={(e) => setD({ ...d, aliases: e.target.value })} />
      </Field>
      <Field label="Role">
        <select className={input} value={d.role} onChange={(e) => setD({ ...d, role: e.target.value as CharacterRole })}>
          {(Object.keys(CHARACTER_ROLES) as CharacterRole[]).map((r) => (
            <option key={r} value={r}>
              {CHARACTER_ROLES[r]}
            </option>
          ))}
        </select>
      </Field>
      <Field label="How they look" hint="Age, hair, clothes, expression. Used for the portrait; keep it respectful and fictional.">
        <textarea className={cx(input, "min-h-24 py-2")} value={d.look} maxLength={600} onChange={(e) => setD({ ...d, look: e.target.value })} />
      </Field>
      {draft.id && (
        <Field label="Portrait description (alt text)">
          <input className={input} value={d.alt} maxLength={200} onChange={(e) => setD({ ...d, alt: e.target.value })} />
        </Field>
      )}
      <div className="flex flex-wrap gap-2">
        <button type="button" className={btn.primary} disabled={busy || d.name.trim().length < 2} onClick={() => onSave(d)}>
          Save
        </button>
        <button type="button" className={btn.secondary} onClick={onCancel}>
          Cancel
        </button>
      </div>
    </div>
  );
}
