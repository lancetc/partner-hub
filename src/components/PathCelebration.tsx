"use client";

import Link from "next/link";
import { useEffect, useState } from "react";
import { useApi } from "@/lib/api";
import { celebrated, markCelebrated } from "@/lib/celebrations";
import { Confetti } from "./Confetti";
import { Icon } from "./Icon";

type Path = { id: string; name: string; done: boolean; steps: { slug: string; draft?: boolean }[] };

/*
  On the lesson-complete screen: if finishing this lesson completed one of the learner's paths, rain
  confetti and say so. Each path is celebrated once on this device.
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
            You’ve finished every lesson in <strong>{path.name}</strong>.{" "}
            <Link href={`/paths/${path.id}`} className="font-semibold text-accent underline-offset-4 hover:underline">
              See your path
            </Link>
          </span>
        </span>
      </div>
    </>
  );
}
