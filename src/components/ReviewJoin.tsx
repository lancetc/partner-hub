"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import { api } from "@/lib/api";
import { input } from "./admin/ui";

/**
  The first step on a review link: who you are, so the author knows whose comments they're reading.
  `path`: a whole learning path's link, joined once for every topic in it.
*/
export function ReviewJoin({ token, title, path = false }: { token: string; title: string; path?: boolean }) {
  const router = useRouter();
  const [name, setName] = useState("");
  const [email, setEmail] = useState("");
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  return (
    <main className="mx-auto max-w-md px-4 py-12">
      <p className="font-mulish text-xs font-extrabold uppercase tracking-[0.14em] text-accent">{path ? "Learning path review" : "Topic review"}</p>
      <h1 className="mt-1 font-serif text-3xl font-semibold leading-tight">{title}</h1>
      <p className="mt-3 text-ink-muted">
        {path
          ? "You’ve been asked to review this learning path. Work through its topics, and leave comments on any card. The author sees each comment with your name."
          : "You’ve been asked to review this topic before it goes to learners. Work through it, and leave comments on any card. The author sees each comment with your name."}
      </p>
      <form
        className="mt-6 flex flex-col gap-4"
        onSubmit={async (e) => {
          e.preventDefault();
          setBusy(true);
          setError(null);
          try {
            await api(`/api/review/${path ? "path/" : ""}${encodeURIComponent(token)}/join`, { body: { name, email } });
            router.refresh();
          } catch (err) {
            setError((err as Error).message);
            setBusy(false);
          }
        }}
      >
        <label className="flex flex-col gap-1.5 font-semibold">
          Your name
          <input className={input} value={name} onChange={(e) => setName(e.target.value)} autoComplete="name" required maxLength={80} />
        </label>
        <label className="flex flex-col gap-1.5 font-semibold">
          Your email
          <input className={input} type="email" value={email} onChange={(e) => setEmail(e.target.value)} autoComplete="email" required maxLength={160} />
          <span className="text-sm font-normal text-ink-muted">Only the authors see it, in case they want to follow up with you.</span>
        </label>
        {error && (
          <p role="alert" className="rounded-xl bg-orange/10 p-2.5 text-sm">
            {error}
          </p>
        )}
        <button
          type="submit"
          disabled={busy}
          className="inline-flex min-h-12 items-center justify-center rounded-full bg-action px-5 font-semibold text-on-action hover:bg-action-hover disabled:opacity-45"
        >
          {busy ? "Opening…" : "Start reviewing"}
        </button>
      </form>
    </main>
  );
}
