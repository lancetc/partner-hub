"use client";

import { useMemo, useState } from "react";
import { activeCue, cueTimes, timedCues, CUE_TREATMENTS, type BriefingCue } from "@/lib/briefingCues";
import type { NarrationAudio } from "@/lib/magazine";
import { cx } from "@/lib/format";
import { Icon } from "../Icon";
import { Badge, btn, input } from "./ui";

/*
  The Trilogy Briefing's narration cues in the News admin (lib/briefingCues, the owner, Nov 2026): what the narrator
  points at, from which words, with which emphasis. Times come from the recording's word timings; where there are none
  (or to adjust one), an author sets the start by hand. A preview plays the recording and shows which cue is live.
*/

const fmt = (s: number | null) => (s === null ? "–" : `${Math.floor(s / 60)}:${(s % 60).toFixed(1).padStart(4, "0")}`);

export function BriefingCuesEditor({
  script,
  audio,
  cues,
  onChange,
  targets,
  problems,
  suggested,
}: {
  script: string;
  audio: NarrationAudio | null;
  cues: BriefingCue[];
  onChange: (cues: BriefingCue[]) => void;
  targets: { id: string; label: string }[];
  problems: { id: string; problem: string }[];
  suggested: boolean;
}) {
  const [at, setAt] = useState<number | null>(null);
  const times = useMemo(() => cueTimes(cues, script, audio), [cues, script, audio]);
  const live = at === null ? null : activeCue(timedCues(cues, script, audio), at);
  const set = (i: number, patch: Partial<BriefingCue>) => onChange(cues.map((c, j) => (j === i ? { ...c, ...patch } : c)));
  const untimed = times.filter((t) => t.start === null).length;

  return (
    <section aria-labelledby="cues-h" className="flex flex-col gap-3 border-t border-line pt-4">
      <h4 id="cues-h" className="flex flex-wrap items-center gap-2 font-semibold">
        <Icon name="spark" className="size-4 text-accent" /> Narration cues
        {problems.length > 0 && <Badge tone="warn">Needs review</Badge>}
        {suggested && cues.length > 0 && <Badge tone="info">Suggested: save to keep</Badge>}
      </h4>
      <p className="text-sm text-ink-muted">
        As the narrator reaches each passage, that part of the homepage newspaper is gently emphasised. Times come from the recording’s word timings
        {audio?.words?.length ? "" : " once it’s recorded"}; set one by hand to adjust it.
      </p>
      {problems.length > 0 && (
        <ul className="rounded-xl bg-[#fff1d6] px-3 py-2 text-sm text-[#6b4a12]">
          {problems.map((p) => (
            <li key={p.id}>
              Cue {cues.findIndex((c) => c.id === p.id) + 1}: {p.problem} It’s left out for learners until you fix or remove it.
            </li>
          ))}
        </ul>
      )}
      {untimed > 0 && audio && (
        <p className="text-sm font-semibold text-[#7a4b00] dark:text-gold">
          {untimed} {untimed === 1 ? "cue has" : "cues have"} no time yet: its passage isn’t in the script
          {audio.words?.length ? "" : ", or the recording has no word timings"}. Set a start by hand or change the passage.
        </p>
      )}
      <ol className="flex flex-col gap-2">
        {cues.map((c, i) => {
          const t = times[i];
          return (
            <li
              key={c.id}
              className={cx(
                "grid grid-cols-[4rem_minmax(0,1fr)_auto] items-center gap-2 rounded-xl border p-3",
                live?.id === c.id ? "border-[#007f7e] bg-[#e6f3f1] dark:bg-[#7fd6d2]/10" : "border-line",
                problems.some((p) => p.id === c.id) && "border-[#e0a030]",
              )}
            >
              <span
                className="text-sm tabular-nums text-ink-muted"
                title={t.how === "aligned" ? "From the recording's word timings" : t.how === "set" ? "Set by hand" : "No time yet"}
              >
                {fmt(t.start)}
                {t.how === "set" && <span className="sr-only"> (set by hand)</span>}
              </span>
              <input
                aria-label={`Cue ${i + 1}: the words it starts at`}
                className={cx(input, "min-h-10 text-sm", !t.found && "border-[#e0a030]")}
                value={c.excerpt}
                onChange={(e) => set(i, { excerpt: e.target.value })}
              />
              <button
                type="button"
                className={cx(btn.quiet, "min-h-9 px-2 hover:text-danger")}
                aria-label={`Remove cue ${i + 1}`}
                onClick={() => onChange(cues.filter((_, j) => j !== i))}
              >
                <Icon name="close" className="size-4" />
              </button>
              {/* What it points at, how, and a start set by hand: on their own line, under the words. */}
              <div className="col-span-3 grid gap-2 sm:grid-cols-[minmax(0,1fr)_minmax(0,11rem)_5.5rem]">
                <select
                  aria-label={`Cue ${i + 1}: what it points at`}
                  className={cx(input, "min-h-10 text-sm")}
                  value={c.target}
                  onChange={(e) =>
                    set(i, {
                      target: e.target.value,
                      targetTitle: e.target.value.startsWith("story:") ? targets.find((x) => x.id === e.target.value)?.label : undefined,
                    })
                  }
                >
                  {!targets.some((x) => x.id === c.target) && <option value={c.target}>{c.targetTitle ?? c.target} (not published)</option>}
                  <optgroup label="The newspaper">
                    {targets
                      .filter((x) => x.id.startsWith("section:"))
                      .map((x) => (
                        <option key={x.id} value={x.id}>
                          {x.label}
                        </option>
                      ))}
                  </optgroup>
                  <optgroup label="Stories">
                    {targets
                      .filter((x) => x.id.startsWith("story:"))
                      .map((x) => (
                        <option key={x.id} value={x.id}>
                          {x.label}
                        </option>
                      ))}
                  </optgroup>
                </select>
                <select
                  aria-label={`Cue ${i + 1}: emphasis`}
                  className={cx(input, "min-h-10 text-sm")}
                  value={c.treatment}
                  onChange={(e) => set(i, { treatment: e.target.value as BriefingCue["treatment"] })}
                >
                  {CUE_TREATMENTS.map((x) => (
                    <option key={x.id} value={x.id}>
                      {x.label}
                    </option>
                  ))}
                </select>
                <input
                  type="number"
                  min={0}
                  step={0.1}
                  aria-label={`Cue ${i + 1}: start, in seconds, set by hand`}
                  placeholder="Auto"
                  className={cx(input, "min-h-10 text-sm")}
                  value={c.start ?? ""}
                  onChange={(e) => set(i, { start: e.target.value === "" ? undefined : Number(e.target.value) })}
                />
              </div>
            </li>
          );
        })}
      </ol>
      <div className="flex flex-wrap items-center gap-3">
        <button
          type="button"
          className={btn.quiet}
          disabled={cues.length >= 20}
          onClick={() => onChange([...cues, { id: `c${Date.now().toString(36)}`, excerpt: "", target: "section:featured", treatment: "headline" }])}
        >
          <Icon name="plus" className="size-4" /> Add a cue
        </button>
      </div>
      {audio && (
        <div className="flex flex-col gap-1">
          <p className="text-sm font-semibold">Preview the timings</p>
          <audio
            controls
            src={audio.src}
            preload="none"
            className="w-full"
            onTimeUpdate={(e) => setAt(e.currentTarget.currentTime)}
            onSeeked={(e) => setAt(e.currentTarget.currentTime)}
            onEnded={() => setAt(null)}
          />
          <p className="text-sm text-ink-muted" aria-live="polite">
            {at === null
              ? "Play it: the cue that’s live is highlighted above."
              : live
                ? `Now: cue ${cues.findIndex((c) => c.id === live.id) + 1}, ${targets.find((x) => x.id === live.target)?.label ?? live.target}`
                : "No cue at this moment."}
          </p>
        </div>
      )}
    </section>
  );
}
