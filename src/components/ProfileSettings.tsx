"use client";

import { useState } from "react";
import { api, useApi, type Me } from "@/lib/api";
import { LANGUAGES, languageName } from "@/lib/languages";
import { setAutoplay, setFollowWords, useAutoplay, useFollowWords } from "@/lib/audioPrefs";
import { setTranslation } from "./SiteTranslator";
import { Icon } from "./Icon";
import { OfflineLessons } from "./OfflineLessons";

/* Your profile and settings: the language you read the hub in, and audio. */
export function ProfileSettings() {
  const me = useApi<Me>("/api/me").data;
  const autoplay = useAutoplay();
  const follow = useFollowWords();
  const [choice, setChoice] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const current = me?.user.language ?? "en";
  const language = choice ?? current;

  async function saveLanguage() {
    setBusy(true);
    setError(null);
    try {
      await api("/api/me/preferences", { body: { language } });
      setTranslation(language);
      location.reload();
    } catch (e) {
      setError((e as Error).message);
      setBusy(false);
    }
  }

  return (
    <div className="mx-auto max-w-3xl px-4 pt-8 sm:px-6 lg:pt-10">
      <h1 className="font-serif text-4xl font-semibold tracking-tight">Profile and settings</h1>

      <section className="mt-8 rounded-3xl border border-line bg-surface p-5">
        <h2 className="font-serif text-xl font-semibold">Your profile</h2>
        {me ? (
          <dl className="mt-3 grid gap-x-6 gap-y-2 text-[0.98rem] sm:grid-cols-[10rem_1fr]">
            <dt className="text-ink-muted">Name</dt>
            <dd translate="no">{me.user.name}</dd>
            <dt className="text-ink-muted">Organisation</dt>
            <dd translate="no">{me.org?.name}</dd>
            <dt className="text-ink-muted">Role</dt>
            <dd>
              {me.user.audience === "staff" ? "Trilogy Care staff" : me.user.audience === "coordinator" ? "Care coordinator" : "Service partner"}
              {me.user.role === "org_admin" ? " · organisation admin" : me.user.role === "author" ? " · learning author" : ""}
            </dd>
          </dl>
        ) : (
          <p className="mt-3 text-ink-muted">Loading…</p>
        )}
      </section>

      <section className="mt-5 rounded-3xl border border-line bg-surface p-5" aria-labelledby="language-heading">
        <h2 id="language-heading" className="flex items-center gap-2 font-serif text-xl font-semibold">
          <Icon name="chat" className="size-5 text-accent" /> Language
        </h2>
        <p className="mt-1 text-ink-muted">Read the Partner Hub in another language. Pages are translated as they load, using Google Translate.</p>
        <div className="mt-4 flex flex-wrap items-end gap-3">
          <label className="flex min-w-60 flex-1 flex-col gap-1">
            <span className="text-sm font-semibold">Show the hub in</span>
            <select
              value={language}
              onChange={(e) => setChoice(e.target.value)}
              disabled={!me || busy}
              className="min-h-11 rounded-xl border border-line-strong bg-surface px-3 text-[0.98rem]"
              translate="no"
            >
              {LANGUAGES.map((l) => (
                <option key={l.code} value={l.code}>
                  {l.code === "en" ? "English" : `${l.native} (${l.label})`}
                </option>
              ))}
            </select>
          </label>
          <button
            type="button"
            onClick={saveLanguage}
            disabled={!me || busy || language === current}
            className="inline-flex min-h-11 items-center gap-2 rounded-full bg-action px-5 font-semibold text-on-action hover:bg-action-hover disabled:opacity-45"
          >
            {busy ? "Saving…" : "Save"}
          </button>
        </div>
        {error && (
          <p role="alert" className="mt-3 rounded-xl bg-orange/10 p-3 text-sm">
            {error}
          </p>
        )}
        {me && (
          <p className="mt-3 text-sm" role="status">
            Currently: <strong translate="no">{languageName(current)}</strong>
          </p>
        )}
        <div className="mt-4 rounded-2xl bg-muted p-4 text-sm">
          <p className="font-semibold">Good to know</p>
          <ul className="mt-1.5 flex list-disc flex-col gap-1 pl-5">
            <li>Translations are automatic and may not be exact. The English version is the one that counts for policy, rates and procedures.</li>
            <li>When a language is chosen, page text is sent to Google to translate it. Nothing is sent while you read in English.</li>
            <li>
              Lessons are translated the first time someone opens them in your language, then saved for everyone. The first visit may start in English for a
              moment.
            </li>
            <li>Lesson audio is still read in English.</li>
            <li>Your choice is saved to your account, so it follows you to other devices.</li>
          </ul>
        </div>
      </section>

      <OfflineLessons />

      <section className="mt-5 rounded-3xl border border-line bg-surface p-5">
        <h2 className="flex items-center gap-2 font-serif text-xl font-semibold">
          <Icon name="volume" className="size-5 text-accent" /> Audio
        </h2>
        <label className="mt-3 flex cursor-pointer items-start gap-3">
          <input type="checkbox" className="mt-0.5 size-5 accent-[var(--action)]" checked={autoplay} onChange={(e) => setAutoplay(e.target.checked)} />
          <span>
            <span className="font-semibold">Play card audio automatically</span>
            <span className="block text-sm text-ink-muted">When off, press the play button on each card to listen. Saved on this device.</span>
          </span>
        </label>
        <label className="mt-3 flex cursor-pointer items-start gap-3">
          <input type="checkbox" className="mt-0.5 size-5 accent-[var(--action)]" checked={follow} onChange={(e) => setFollowWords(e.target.checked)} />
          <span>
            <span className="font-semibold">Highlight each word as it’s spoken</span>
            <span className="block text-sm text-ink-muted">Follow the captions and transcript word by word while the audio plays. Saved on this device.</span>
          </span>
        </label>
      </section>
    </div>
  );
}
