"use client";

import { useState } from "react";
import { api, useApi } from "@/lib/api";
import { formatDate } from "@/lib/format";
import { textHash } from "@/lib/magazineNarration";
import type { NarrationAudio } from "@/lib/magazine";
import { Icon } from "../Icon";
import { Badge, btn, ErrorNote, Field, input } from "./ui";
import { BriefingCuesEditor } from "./BriefingCuesEditor";
import type { BriefingCue } from "@/lib/briefingCues";

/*
  "This edition" on the News admin (server/newsEdition, the owner, Nov 2026): this week's Trilogy Briefing, drafted from
  the week's news by rules, edited, recorded in the Magazine Editorial Voice and approved before learners hear it; and
  the weekly question, with how people have answered so far. Setting a new question closes the last one.
*/

type Data = {
  briefing: {
    week: string;
    script: string;
    saved: boolean;
    status: "draft" | "approved";
    audio: NarrationAudio | null;
    matches: boolean;
    approvedBy: string | null;
    approvedAt: string | null;
    draft: { script: string; cues: BriefingCue[] };
    cues: BriefingCue[];
    cuesSuggested: boolean;
    problems: { id: string; problem: string }[];
    targets: { id: string; label: string }[];
  };
  question: {
    id: string;
    question: string;
    options: { id: string; text: string }[];
    results: { id: string; count: number }[];
    total: number;
    startsOn: string;
  } | null;
};

const textarea = "w-full rounded-xl border border-line-strong bg-surface px-3 py-2 text-base leading-relaxed";

export function NewsEditionAdmin() {
  const { data, error, reload } = useApi<Data>("/api/admin/news/edition");
  const [script, setScript] = useState<string | null>(null);
  // The narration cues being edited; null until changed here.
  const [cues, setCues] = useState<BriefingCue[] | null>(null);
  const [busy, setBusy] = useState<string | null>(null);
  const [problem, setProblem] = useState<string | null>(null);
  const [question, setQuestion] = useState("");
  const [options, setOptions] = useState(["", "", "", ""]);

  if (error) return <ErrorNote text={error} />;
  if (!data) return null;
  const b = data.briefing;
  const text = script ?? b.script;
  const words = text.trim() ? text.trim().split(/\s+/).length : 0;
  const recordedNow = Boolean(b.audio && b.audio.scriptHash === textHash(text.trim()));
  const cueList = cues ?? b.cues;

  async function act(area: "briefing" | "question", body: Record<string, unknown>, key: string) {
    setBusy(key);
    setProblem(null);
    try {
      await api("/api/admin/news/edition", { body: { area, ...body } });
      if (area === "briefing") {
        setScript(null);
        setCues(null);
      }
      if (area === "question" && body.action === "set") {
        setQuestion("");
        setOptions(["", "", "", ""]);
      }
      reload();
    } catch (e) {
      setProblem((e as Error).message);
    } finally {
      setBusy(null);
    }
  }

  return (
    <section aria-labelledby="edition-h" className="mt-6 rounded-3xl border border-line bg-surface p-5 sm:p-6">
      <h2 id="edition-h" className="font-serif text-2xl font-semibold">
        This edition
      </h2>
      <p className="mt-1 max-w-3xl text-ink-muted">
        The homepage news changes for each person: what’s new since their last visit, a feature chosen for them, News in Brief from across the Hub and a story
        from the archive. These two you set by hand.
      </p>
      {problem && (
        <div className="mt-3">
          <ErrorNote text={problem} />
        </div>
      )}
      <div className="mt-5 grid gap-6 lg:grid-cols-2">
        <div className="flex flex-col gap-3">
          <h3 className="flex flex-wrap items-center gap-2 font-semibold">
            <Icon name="volume" className="size-4 text-accent" /> The Trilogy Briefing, week of {formatDate(b.week)}
            {b.status === "approved" && b.matches ? <Badge tone="good">Approved</Badge> : <Badge>Not showing yet</Badge>}
          </h3>
          <Field label="Script" hint={`Read in the Magazine Editorial Voice. About 90 seconds is 200 words${words ? `: this is ${words}` : ""}.`}>
            <textarea rows={7} className={textarea} value={text} onChange={(e) => setScript(e.target.value)} />
          </Field>
          <div className="flex flex-wrap gap-2">
            <button
              type="button"
              className={btn.quiet}
              onClick={() => {
                setScript(b.draft.script);
                setCues(b.draft.cues);
              }}
            >
              Draft from this week’s news
            </button>
            <button
              type="button"
              className={btn.secondary}
              disabled={busy !== null || !text.trim()}
              onClick={() => void act("briefing", { action: "save", script: text, cues: cueList }, "save")}
            >
              {busy === "save" ? "Saving…" : "Save script and cues"}
            </button>
            <button
              type="button"
              className={btn.secondary}
              disabled={busy !== null || !text.trim()}
              onClick={() => void act("briefing", { action: "record", script: text, cues: cueList }, "record")}
            >
              <Icon name="mic" className="size-4" /> {busy === "record" ? "Recording…" : b.audio ? "Record again" : "Record it"}
            </button>
          </div>
          {b.audio && (
            <>
              <audio controls src={b.audio.src} preload="none" className="w-full" />
              {recordedNow ? (
                b.status === "approved" ? (
                  <p className="text-sm text-ink-muted">
                    Approved by {b.approvedBy}. Learners see it under the news sections this week.{" "}
                    <button type="button" className="font-semibold text-accent" onClick={() => void act("briefing", { action: "unapprove" }, "unapprove")}>
                      Take it down
                    </button>
                  </p>
                ) : (
                  <button type="button" className={btn.primary} disabled={busy !== null} onClick={() => void act("briefing", { action: "approve" }, "approve")}>
                    Approve for learners
                  </button>
                )
              ) : (
                <p className="text-sm font-semibold text-[#7a4b00] dark:text-gold">
                  The script has changed since this was recorded. Record it again to approve it.
                </p>
              )}
            </>
          )}
          <BriefingCuesEditor
            script={text}
            audio={b.audio}
            cues={cueList}
            onChange={setCues}
            targets={b.targets}
            problems={cues ? [] : b.problems}
            suggested={b.cuesSuggested && !cues}
          />
          {cues && <p className="text-sm text-ink-muted">Cues changed: save to keep them. They don’t need a new recording.</p>}
        </div>

        <div className="flex flex-col gap-3">
          <h3 className="flex items-center gap-2 font-semibold">
            <Icon name="chat" className="size-4 text-accent" /> The weekly question
          </h3>
          {data.question ? (
            <div className="rounded-2xl bg-muted p-4">
              <p className="font-semibold">{data.question.question}</p>
              <ul className="mt-2 flex flex-col gap-1 text-sm">
                {data.question.options.map((o) => (
                  <li key={o.id} className="flex justify-between gap-3">
                    <span>{o.text}</span>
                    <span className="tabular-nums text-ink-muted">{data.question!.results.find((r) => r.id === o.id)?.count ?? 0}</span>
                  </li>
                ))}
              </ul>
              <p className="mt-2 text-sm text-ink-muted">
                {data.question.total} {data.question.total === 1 ? "answer" : "answers"} since {formatDate(data.question.startsOn)}.{" "}
                <button type="button" className="font-semibold text-accent" onClick={() => void act("question", { action: "close" }, "close")}>
                  Close it
                </button>
              </p>
            </div>
          ) : (
            <p className="text-sm text-ink-muted">No question is showing. Set one below.</p>
          )}
          <Field label="A new question" hint="It replaces the one showing now.">
            <input
              className={input}
              value={question}
              onChange={(e) => setQuestion(e.target.value)}
              placeholder="What’s your biggest challenge heading into Christmas?"
            />
          </Field>
          {options.map((o, i) => (
            <input
              key={i}
              className={input}
              value={o}
              aria-label={`Answer ${i + 1}`}
              placeholder={`Answer ${i + 1}${i >= 2 ? " (optional)" : ""}`}
              onChange={(e) => setOptions(options.map((x, j) => (j === i ? e.target.value : x)))}
            />
          ))}
          <button
            type="button"
            className={btn.primary}
            disabled={busy !== null || question.trim().length < 5 || options.filter((o) => o.trim()).length < 2}
            onClick={() => void act("question", { action: "set", question, options }, "set")}
          >
            {busy === "set" ? "Setting…" : "Set this week’s question"}
          </button>
        </div>
      </div>
    </section>
  );
}
