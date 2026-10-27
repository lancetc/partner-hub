"use client";

import { useEffect } from "react";
import { useRouter } from "next/navigation";
import { api } from "@/lib/api";
import { languageName } from "@/lib/languages";
import { Icon } from "../Icon";

/*
  Shown on a lesson for someone reading in another language: that it's machine translated (with a
  way to see the English), or that the translation is on its way (and the page updates when it's ready).
*/
export type NoticeState = "ready" | "pending" | "failed" | "unavailable" | "original";

/** While a translation is on its way, checks every few seconds and refreshes the page when it's done. */
export function TranslationWatch({ slug, lang, state }: { slug: string; lang: string; state: NoticeState }) {
  const router = useRouter();
  useEffect(() => {
    if (state !== "pending") return;
    const t = window.setInterval(async () => {
      try {
        const r = await api<{ state: string }>(`/api/lessons/translation?slug=${encodeURIComponent(slug)}&lang=${encodeURIComponent(lang)}`);
        if (r.state !== "pending") router.refresh();
      } catch {
        // Keep the English lesson; try again on the next tick.
      }
    }, 4000);
    return () => window.clearInterval(t);
  }, [state, slug, lang, router]);
  return null;
}

export function TranslationNotice({ lang, state }: { lang: string; state: NoticeState }) {
  const name = languageName(lang);
  return (
    <p role="status" className="flex items-start gap-2 rounded-2xl bg-tealtint px-3 py-2 text-sm text-ink">
      <Icon
        name={state === "pending" ? "refresh" : "info"}
        className={state === "pending" ? "mt-0.5 size-4 shrink-0 animate-spin" : "mt-0.5 size-4 shrink-0"}
      />
      <span>
        {state === "ready" && (
          <>
            Translated into {name} by machine. The English version counts for policy and procedures.{" "}
            <a href="?original=1" className="font-semibold underline">
              Show in English
            </a>
          </>
        )}
        {state === "original" && (
          <>
            Showing the English lesson.{" "}
            <a href="?" className="font-semibold underline">
              Show in {name}
            </a>
          </>
        )}
        {state === "pending" && <>Translating this lesson into {name}. It switches over by itself in a moment; you can start in English.</>}
        {state === "failed" && <>This lesson couldn’t be translated into {name} just now, so it’s in English. We’ll try again next time you open it.</>}
        {state === "unavailable" && <>Lessons aren’t translated into {name} yet, so this one is in English.</>}
      </span>
    </p>
  );
}
