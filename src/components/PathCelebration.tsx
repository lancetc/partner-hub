"use client";

import Link from "next/link";
import { useEffect, useState } from "react";
import { useApi } from "@/lib/api";
import { celebrated, markCelebrated } from "@/lib/celebrations";
import { Confetti } from "./Confetti";
import { Icon } from "./Icon";

type Path = { id: string; name: string; done: boolean; steps: { slug: string; draft?: boolean }[] };

/*
  On the topic-complete screen: if finishing this topic completed one of the learner's paths, rain
  confetti, say so, and offer the certificate. Each path is celebrated once on this device.
*/
export function PathCelebration({ lessonSlug }: { lessonSlug: string }) {
  const { data } = useApi<{ paths: Path[] }>("/api/learning-paths");
  const [path, setPath] = useState<Path | null>(null);
  useEffect(() => {
    // Only a whole path: done, and no lessons still coming soon.
    const finished = data?.paths.find((p) => p.done && p.steps.every((s) => !s.draft) && p.steps.some((s) => s.slug === lessonSlug) && !celebrated(p.id));
    if (!finished) return;
    // Marked only when it actually starts, so a re-run effect can't cancel it after marking.
    const t = window.setTimeout(() => {
      markCelebrated(finished.id);
      setPath(finished);
    }, 0);
    return () => window.clearTimeout(t);
  }, [data, lessonSlug]);
  if (!path) return null;
  return (
    <>
      <Confetti />
      <div role="status" className="fx-pop flex items-start gap-3 rounded-2xl bg-gold/20 p-4 ring-1 ring-gold">
        <span className="grid size-10 shrink-0 place-items-center rounded-full bg-gold text-ink">
          <Icon name="star" className="size-5" />
        </span>
        <span>
          <span className="block font-serif text-xl font-semibold">Learning path complete!</span>
          <span className="block">
            You’ve finished every topic in <strong>{path.name}</strong>. Your certificate is ready.
          </span>
          <span className="mt-3 flex flex-wrap items-center gap-x-4 gap-y-2">
            <Link
              href={`/paths/${encodeURIComponent(path.id)}/certificate`}
              className="inline-flex min-h-11 items-center gap-2 rounded-full bg-action px-5 font-semibold text-on-action hover:bg-action-hover"
            >
              <Icon name="star" className="size-4" /> Get your certificate
            </Link>
            <Link href={`/paths/${encodeURIComponent(path.id)}`} className="font-semibold text-accent underline-offset-4 hover:underline">
              See your path
            </Link>
          </span>
          <span className="mt-2 block text-sm text-ink-muted">It’s also kept in your profile, to print any time.</span>
        </span>
      </div>
    </>
  );
}
