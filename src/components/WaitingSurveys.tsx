"use client";

import { useState } from "react";
import { useApi } from "@/lib/api";
import { PendingSurvey, type PublicSurvey } from "./SurveyForm";
import { Icon } from "./Icon";

type Pending = { survey: PublicSurvey; target: { type: "path" | "lesson"; id: string; title: string } };
const key = (p: Pending) => `${p.survey.id}|${p.target.type}:${p.target.id}`;

/**
  Surveys waiting for this person, one at a time. After a lesson, `lesson` limits it to what that
  lesson triggered: its own survey, or the module survey if it finished a learning path.
*/
export function WaitingSurveys({ lesson, heading }: { lesson?: string; heading?: string }) {
  const { data } = useApi<{ pending: Pending[] }>(`/api/surveys${lesson ? `?lesson=${encodeURIComponent(lesson)}` : ""}`);
  const [handled, setHandled] = useState<Record<string, "submitted" | "skipped">>({});
  if (!data?.pending.length) return null;
  const open = data.pending.filter((p) => !handled[key(p)]);
  const thanked = Object.values(handled).includes("submitted");

  if (!open.length)
    return thanked ? (
      <p role="status" className="flex items-center gap-2 rounded-2xl bg-tealtint p-4 font-semibold">
        <Icon name="check" className="size-5 text-accent" /> Thanks. Your answers help us improve the training.
      </p>
    ) : null;

  const current = open[0];
  return (
    <section aria-label={heading ?? "Survey"} className="flex flex-col gap-3">
      {heading && (
        <h2 className="font-mulish text-sm font-extrabold uppercase tracking-[0.14em]">
          {heading} {open.length > 1 && <span className="text-ink-muted">· {open.length} waiting</span>}
        </h2>
      )}
      <PendingSurvey key={key(current)} item={current} onDone={(status) => setHandled((h) => ({ ...h, [key(current)]: status }))} />
    </section>
  );
}
