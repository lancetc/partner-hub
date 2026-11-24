"use client";

import Link from "next/link";
import { useState } from "react";
import { api, useApi } from "@/lib/api";
import { cx, formatDate } from "@/lib/format";
import { DEFAULT_GUIDE_INTRO, GUIDE_MODES, GUIDE_STATES, type GuideState } from "@/lib/magazineGuide";
import type { guideUses, identityForAuthors } from "@/server/learningGuide";
import { AdminShell, Badge, btn, ErrorNote, Field, input } from "./ui";
import { Icon } from "../Icon";
import { AvaVideosAdmin } from "./AvaVideosAdmin";

/*
  The AI Learning Guide (docs/ai-learning-guide.md): who the Hub's one guide is, and every place it's used.
  From here a recording can be withdrawn from learners at once, everywhere, when the guidance behind it
  changes: they get the script as text until a new recording is made and checked.
*/

type Data = ReturnType<typeof identityForAuthors> & ReturnType<typeof guideUses>;

export function LearningGuideAdmin() {
  const { data, error, setData } = useApi<Data>("/api/admin/learning-guide");
  const [problem, setProblem] = useState<string | null>(null);
  const [saved, setSaved] = useState(false);
  const [filter, setFilter] = useState("");
  if (error)
    return (
      <AdminShell title="AI Learning Guide">
        <ErrorNote text={error} />
      </AdminShell>
    );
  if (!data)
    return (
      <AdminShell title="AI Learning Guide">
        <p className="text-ink-muted">Loading…</p>
      </AdminShell>
    );
  const post = async (body: Record<string, unknown>) => {
    setProblem(null);
    try {
      const out = await api<Partial<Data>>("/api/admin/learning-guide", { body });
      setData({ ...data, ...out });
      return true;
    } catch (e) {
      setProblem(e instanceof Error ? e.message : "That didn’t save.");
      return false;
    }
  };
  const id = data.identity;
  const q = filter.trim().toLowerCase();
  const uses = data.uses.filter((u) => !q || [u.course, u.pageTitle, u.script, u.source, u.owner].join(" ").toLowerCase().includes(q));
  return (
    <AdminShell title="AI Learning Guide">
      <p className="max-w-3xl text-ink-muted">
        One recognisable guide across the Hub, always labelled <strong>AI Learning Guide · Recorded</strong>. Every appearance is a recorded, scripted lesson
        with an accountable owner: the guide presents approved learning, and never speaks for itself.
      </p>
      {problem && (
        <div className="mt-3">
          <ErrorNote text={problem} />
        </div>
      )}

      <section aria-labelledby="lg-identity" className="mt-5 rounded-3xl bg-surface p-5 ring-1 ring-line">
        <h2 id="lg-identity" className="font-serif text-xl font-semibold">
          Who the guide is
        </h2>
        <p className="mt-1 text-sm text-ink-muted">
          The same character and voice everywhere. Authors can’t choose a different person per course.{" "}
          {data.canEdit ? "" : "Only a Hub administrator can change this."}
        </p>
        <form
          className="mt-3 grid gap-3 sm:grid-cols-2"
          onSubmit={async (e) => {
            e.preventDefault();
            setSaved(false);
            if (await post({ action: "identity", ...Object.fromEntries(new FormData(e.currentTarget)) })) setSaved(true);
          }}
        >
          <fieldset disabled={!data.canEdit} className="contents">
            <Field label="Approved name" hint="Shown beside “AI Learning Guide”, never on its own as if a person. Leave empty for no name.">
              <input name="name" defaultValue={id.name} className={input} placeholder="Ava" />
            </Field>
            <Field
              label="Portrait (an image in the library)"
              hint="Ava in her transmission window: the poster before a recording plays, and the picture while a Topic or Discovery Path introduction is read."
            >
              <input name="portrait" defaultValue={id.portrait ?? ""} className={input} placeholder="/api/uploads/….webp" />
            </Field>
            <Field label="First-encounter introduction" hint="{name} is replaced with the name. It has to say the guide is AI." className="sm:col-span-2">
              <input name="intro" defaultValue={id.intro || DEFAULT_GUIDE_INTRO} className={input} />
            </Field>
            <Field label="Avatar (provider and reference)" hint="Ava 2.0 is the ElevenLabs Laura avatar; each transmission can use a different Laura style.">
              <input name="avatarRef" defaultValue={id.avatarRef} className={input} />
            </Field>
            <Field
              label="Voice"
              hint="The voice Ava reads Topic and Discovery Path introductions in: its name as it appears in ElevenLabs (Addison 2.0), its voice id, or openai:<voice>. A voice has to be added to the ElevenLabs account first; until then the Hub narrator speaks."
            >
              <input name="voiceRef" defaultValue={id.voiceRef} className={input} />
            </Field>
            <Field
              label="Rights and provenance"
              hint="Whose likeness and voice this is, and the permission to use it. A wholly synthetic, provider-approved identity is recommended."
              className="sm:col-span-2"
            >
              <textarea name="rights" defaultValue={id.rights} className={cx(input, "min-h-20 py-2")} />
            </Field>
            <Field label="Style version">
              <input name="styleVersion" defaultValue={id.styleVersion} className={input} />
            </Field>
            <div className="flex items-end gap-3">
              {data.canEdit && (
                <button type="submit" className={btn.primary}>
                  Save
                </button>
              )}
              {saved && (
                <p role="status" className="text-sm font-semibold text-[#0f5b3a] dark:text-[#8fe0b5]">
                  Saved
                </p>
              )}
              {id.updatedAt && (
                <p className="text-sm text-ink-muted">
                  Last changed by {id.updatedBy}, {formatDate(id.updatedAt)}
                </p>
              )}
            </div>
          </fieldset>
        </form>
      </section>

      <AvaVideosAdmin />

      <section aria-labelledby="lg-uses" className="mt-5 rounded-3xl bg-surface p-5 ring-1 ring-line">
        <div className="flex flex-wrap items-end gap-3">
          <div className="mr-auto">
            <h2 id="lg-uses" className="font-serif text-xl font-semibold">
              Everywhere the guide is used ({data.uses.length})
            </h2>
            <p className="mt-1 max-w-3xl text-sm text-ink-muted">
              Each guide segment in Magazine courses, live and in drafts. Withdraw a recording when the guidance behind it changes: learners get the script as
              text straight away, in every course that uses that recording. What was published isn’t rewritten.
            </p>
          </div>
          <label className="flex flex-col gap-1 text-xs font-semibold">
            Find by course, source, owner or words
            <input type="search" className={cx(input, "min-h-10")} value={filter} onChange={(e) => setFilter(e.target.value)} />
          </label>
        </div>
        {data.uses.length === 0 ? (
          <p className="mt-3 rounded-2xl bg-muted px-4 py-3 text-sm">
            The guide isn’t in any course yet. Add an AI Learning Guide block to a Magazine page (Add block, Content).
          </p>
        ) : uses.length === 0 ? (
          <p className="mt-3 text-sm">Nothing matches “{filter}”.</p>
        ) : (
          <ul className="mt-3 flex flex-col divide-y divide-line">
            {uses.map((u) => (
              <li key={u.key} className="flex flex-col gap-1 py-3 text-sm">
                <div className="flex flex-wrap items-center gap-2">
                  <Link href={`/admin/magazine/${u.guideId}?page=${u.pageId}`} className="font-semibold text-accent hover:underline">
                    {u.course}
                  </Link>
                  <span className="text-ink-muted">
                    {u.pageTitle} · {GUIDE_MODES[u.mode].label} · {u.purpose}
                  </span>
                  <Badge tone={u.where === "live" ? "good" : "neutral"}>{u.where === "live" ? `Live, edition ${u.edition}` : "In a draft"}</Badge>
                  <Badge tone={GUIDE_STATES[u.state as GuideState].tone}>{GUIDE_STATES[u.state as GuideState].label}</Badge>
                  {u.withdrawn ? (
                    <Badge tone="bad">Recording withdrawn</Badge>
                  ) : u.playing ? (
                    <Badge tone="info">Learners have the recording</Badge>
                  ) : u.where === "live" ? (
                    <Badge tone="warn">Learners see the script as text</Badge>
                  ) : null}
                </div>
                <p className="line-clamp-2 text-ink-muted">“{u.script}”</p>
                <p className="text-ink-muted">
                  Owner: {u.owner || "not named"} · Source: {u.source || "not linked"}
                  {u.reviewed ? ` · Reviewed by ${u.reviewed}` : ""} · about {Math.round(u.seconds)} sec
                </p>
                {u.withdrawn && (
                  <p>
                    Withdrawn by {u.withdrawn.by}, {formatDate(u.withdrawn.at)}: {u.withdrawn.note}
                  </p>
                )}
                {u.mediaSrc && (
                  <div>
                    {u.withdrawn ? (
                      <button type="button" className={btn.quiet} onClick={() => void post({ action: "restore", src: u.mediaSrc })}>
                        Put the recording back
                      </button>
                    ) : (
                      <button
                        type="button"
                        className={btn.secondary}
                        onClick={() => {
                          const note = window.prompt(
                            "Withdraw this recording from learners everywhere it’s used? They’ll see the script as text instead.\n\nWhy (kept on record):",
                          );
                          if (note) void post({ action: "withdraw", src: u.mediaSrc, note });
                        }}
                      >
                        <Icon name="alert" className="size-4" /> Withdraw the recording
                      </button>
                    )}
                  </div>
                )}
              </li>
            ))}
          </ul>
        )}
      </section>
    </AdminShell>
  );
}
