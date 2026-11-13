"use client";

import { useState } from "react";
import { api } from "@/lib/api";
import { clearOfflineData } from "@/lib/offlineLessons";
import { Logo } from "./Header";
import { Icon } from "./Icon";

/*
  Sign-in (prototype). Real sign-in will be handled by each person's organisation (single sign-on), so
  these buttons are placeholders: every one of them signs in as the demo author, Jordan Lee.
*/

const DEMO_ACCOUNT = "jordan";

const OPTIONS = [
  {
    id: "staff",
    label: "Continue with your Trilogy Care account",
    hint: "Trilogy Care staff and care coordinators",
    icon: "building",
    primary: true,
  },
  {
    id: "partner",
    label: "Continue with your organisation’s account",
    hint: "Care Partner and provider organisations",
    icon: "briefcase",
  },
  { id: "email", label: "Email me a sign-in link", hint: "If your organisation doesn’t use single sign-on", icon: "mail" },
] as const;

export function SignIn() {
  const [busy, setBusy] = useState<string | null>(null);
  const [problem, setProblem] = useState<string | null>(null);

  async function signIn(id: string) {
    setBusy(id);
    setProblem(null);
    try {
      // Nothing kept for offline use stays from whoever used this device before.
      await clearOfflineData().catch(() => {});
      await api("/api/demo/session", { body: { userId: DEMO_ACCOUNT } });
      // The homepage builds itself from the top down once (see buildScript in app/layout).
      try {
        sessionStorage.setItem("tc-build", "1");
      } catch {}
      // Back to the page they were sent here from (only a page on this site), else the homepage.
      // A full load so every part of the hub picks up who's signed in.
      const next = new URLSearchParams(window.location.search).get("next");
      window.location.assign(next && next.startsWith("/") && !next.startsWith("//") ? next : "/");
    } catch (e) {
      setProblem((e as Error).message);
      setBusy(null);
    }
  }

  return (
    <div className="grid min-h-dvh grid-cols-[minmax(0,1fr)] lg:grid-cols-[minmax(0,1.1fr)_minmax(0,1fr)]">
      {/* The welcome side: brand colours, what the hub is for. */}
      <section className="relative hidden overflow-hidden bg-[#008282] p-12 text-white lg:flex lg:flex-col lg:justify-between">
        <svg aria-hidden className="pointer-events-none absolute inset-0 h-full w-full" preserveAspectRatio="xMaxYMax slice" viewBox="0 0 600 800">
          <circle cx="560" cy="120" r="200" fill="#3cb8b9" opacity="0.35" />
          <circle cx="500" cy="760" r="150" fill="#fab53d" opacity="0.3" />
          <circle cx="60" cy="700" r="90" fill="#c7393e" opacity="0.3" />
        </svg>
        <p className="relative font-mulish text-sm font-extrabold uppercase tracking-[0.16em] text-[#bdeeee]">Partner Hub</p>
        <div className="relative max-w-lg">
          <h2 className="font-serif text-5xl font-semibold leading-tight">Learn, share and stay up to date.</h2>
          <p className="mt-4 text-xl text-white/90">News, practical learning and a community of Care Partners and coordinators, all in one place.</p>
          <ul className="mt-8 flex flex-col gap-3 text-lg">
            {["Short topics built around real visits", "Learning paths with certificates", "A community to learn from each other"].map((t) => (
              <li key={t} className="flex items-center gap-3">
                <span className="grid size-7 place-items-center rounded-full bg-white/20">
                  <Icon name="check" className="size-4" />
                </span>
                {t}
              </li>
            ))}
          </ul>
        </div>
        <p className="relative text-sm text-white/75">Empowering older Australians to live independently in the home they love, for longer.</p>
      </section>

      {/* Sign-in. */}
      <section className="flex items-center justify-center px-4 py-10 sm:px-8">
        <div className="w-full max-w-md">
          <Logo className="h-10 w-auto" />
          <h1 className="mt-8 font-serif text-4xl font-semibold tracking-tight">Sign in</h1>
          <p className="mt-2 text-lg text-ink-muted">Use the account your organisation gave you.</p>

          <ul className="mt-8 flex flex-col gap-3">
            {OPTIONS.map((o) => (
              <li key={o.id}>
                <button
                  type="button"
                  onClick={() => signIn(o.id)}
                  disabled={busy !== null}
                  className={
                    "primary" in o
                      ? "flex min-h-16 w-full items-center gap-4 rounded-2xl bg-[#008282] px-5 text-left text-white shadow-sm hover:bg-[#006b6b] disabled:opacity-70"
                      : "flex min-h-16 w-full items-center gap-4 rounded-2xl border border-line-strong bg-surface px-5 text-left hover:border-[#008282] hover:bg-muted disabled:opacity-70"
                  }
                >
                  <Icon name={o.icon} className="size-6 shrink-0" />
                  <span className="min-w-0 flex-1">
                    <span className="block font-semibold">{busy === o.id ? "Signing you in…" : o.label}</span>
                    <span className={"primary" in o ? "block text-sm text-white/85" : "block text-sm text-ink-muted"}>{o.hint}</span>
                  </span>
                  <Icon name="arrow-right" className="size-5 shrink-0" />
                </button>
              </li>
            ))}
          </ul>
          {problem && (
            <p role="alert" className="mt-3 text-sm font-semibold text-danger">
              {problem}
            </p>
          )}

          <p className="mt-6 text-sm text-ink-muted">
            Trouble signing in? Call the Trilogy Care team on <span className="font-semibold text-ink">1300 459 190</span>.
          </p>

          <div className="mt-8 flex gap-3 rounded-2xl bg-gold/15 px-4 py-3 text-sm">
            <Icon name="info" className="mt-0.5 size-4 shrink-0" />
            <p>
              <span className="font-semibold">Prototype.</span> Sign-in will be handled by your organisation. For now every button signs you in as{" "}
              <span className="font-semibold">Jordan Lee</span>, the demo learning author. You can switch demo accounts from the account menu.
            </p>
          </div>
        </div>
      </section>
    </div>
  );
}
