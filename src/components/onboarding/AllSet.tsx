"use client";

import Link from "next/link";
import { useState } from "react";
import { useApi, type Me } from "@/lib/api";
import { setHub, useHub } from "@/lib/store";
import type { SampleTopicItem } from "@/lib/sampleTopic";
import { Icon, type IconName } from "../Icon";
import { UserAvatar } from "../UserAvatar";
import { LearnStep } from "./LearnStep";

/*
  After setup: a short "you're all set", their sample topic ready to open, and where to go next.
  They can make another sample topic, or go through the setup questions again.
*/

export function AllSet() {
  const me = useApi<Me>("/api/me").data;
  const samples = useApi<{ topics: SampleTopicItem[] }>("/api/me/sample-topics");
  const attempts = useHub((s) => s.lessons);
  const [another, setAnother] = useState(false);
  const topics = samples.data?.topics ?? [];
  const [latest, ...earlier] = topics;
  const first = me?.user.name.split(" ")[0];

  if (another)
    return (
      <div className="mx-auto max-w-xl px-4 pt-8 sm:px-6 lg:pt-12">
        <LearnStep
          heading="What else would you like to learn?"
          onBuilt={() => {
            samples.reload();
            setAnother(false);
          }}
          onSkip={() => setAnother(false)}
          skipLabel="Cancel"
        />
      </div>
    );

  return (
    <div className="mx-auto max-w-3xl px-4 pt-8 sm:px-6 lg:pt-10">
      <div className="flex items-center gap-4">
        {me && <UserAvatar name={me.user.name} src={me.user.avatar} className="size-16 shrink-0 text-xl" />}
        <div>
          <p className="font-mulish text-xs font-extrabold uppercase tracking-[0.14em] text-accent">My onboarding</p>
          <h1 className="font-serif text-4xl font-semibold tracking-tight">{first ? `You’re all set, ${first}` : "You’re all set"}</h1>
        </div>
      </div>
      <p className="mt-3 max-w-2xl text-lg text-ink-muted">Your profile is ready. Here’s where to start.</p>

      {latest ? (
        <section aria-labelledby="sample-topic" className="mt-8 rounded-3xl bg-hero p-6 text-on-hero sm:p-8">
          <p className="flex items-center gap-2 font-mulish text-xs font-extrabold uppercase tracking-[0.14em] opacity-80">
            <Icon name="spark" className="size-4" /> Your sample topic is ready
          </p>
          <h2 id="sample-topic" className="mt-2 font-serif text-3xl font-semibold">
            {latest.title}
          </h2>
          <p className="mt-2 max-w-2xl text-lg opacity-90">{latest.summary}</p>
          <p className="mt-1 text-sm opacity-80">
            {latest.minutes} min · {attempts[latest.slug]?.status === "completed" ? "Done" : attempts[latest.slug] ? "In progress" : "Not started"} · You asked about “
            {latest.interest}”
          </p>
          <div className="mt-5 flex flex-wrap items-center gap-3">
            <Link
              href={`/topics/mine/${latest.slug}`}
              className="inline-flex min-h-12 items-center gap-2 rounded-full bg-white px-6 text-lg font-semibold text-[#102a43] hover:bg-white/90"
            >
              {attempts[latest.slug] ? "Open topic" : "Start topic"} <Icon name="arrow-right" className="size-5" />
            </Link>
            <span className="text-sm opacity-80">It’s also waiting for you in My Training.</span>
          </div>
          {latest.madeBy === "template" && (
            <p className="mt-4 rounded-2xl bg-white/10 p-3 text-sm">
              This one was made from a starter template, because AI topic building isn’t switched on here yet. With it on, the topic is written about your
              subject.
            </p>
          )}
        </section>
      ) : (
        samples.data && (
          <section className="mt-8 rounded-3xl border border-line bg-surface p-6">
            <h2 className="font-serif text-2xl font-semibold">Try a sample topic</h2>
            <p className="mt-1 text-ink-muted">Tell us what you’d like to learn and we’ll build you a short topic to start with.</p>
          </section>
        )
      )}

      <div className="mt-5 flex flex-wrap gap-3">
        <button
          type="button"
          onClick={() => setAnother(true)}
          className="inline-flex min-h-11 items-center gap-2 rounded-full border border-line-strong px-5 font-semibold hover:bg-muted"
        >
          <Icon name="spark" className="size-4" /> {latest ? "Make another sample topic" : "Build a sample topic"}
        </button>
      </div>

      {earlier.length > 0 && (
        <section aria-labelledby="earlier-samples" className="mt-8">
          <h2 id="earlier-samples" className="font-mulish text-sm font-extrabold uppercase tracking-[0.14em]">
            Your other sample topics
          </h2>
          <ul className="mt-3 flex flex-col gap-2">
            {earlier.map((t) => (
              <li key={t.slug}>
                <Link href={`/topics/mine/${t.slug}`} className="flex min-h-12 items-center gap-3 rounded-2xl border border-line bg-surface px-4 py-2 hover:bg-muted">
                  <Icon name="spark" className="size-4 shrink-0 text-action" />
                  <span className="min-w-0 flex-1">
                    <span className="block font-semibold">{t.title}</span>
                    <span className="block text-sm text-ink-muted">
                      {t.minutes} min · {attempts[t.slug]?.status === "completed" ? "Done" : attempts[t.slug] ? "In progress" : "Not started"}
                    </span>
                  </span>
                  <Icon name="arrow-right" className="size-4 shrink-0 text-ink-muted" />
                </Link>
              </li>
            ))}
          </ul>
        </section>
      )}

      <section aria-labelledby="next-steps" className="mt-10">
        <h2 id="next-steps" className="font-mulish text-sm font-extrabold uppercase tracking-[0.14em]">
          What’s next
        </h2>
        <ul className="mt-3 grid gap-3 sm:grid-cols-3">
          {[
            { href: "/paths", icon: "route", title: "My Training", text: "Training programs to work through, and your learning so far." },
            { href: "/topics", icon: "book", title: "Browse topics", text: "Short, practical topics you can finish between visits." },
            { href: "/settings", icon: "user", title: "Profile and settings", text: "Your picture, language, emails and audio." },
          ].map((l) => (
            <li key={l.href}>
              <Link href={l.href} className="flex h-full flex-col gap-1 rounded-2xl border border-line bg-surface p-4 hover:bg-muted">
                <Icon name={l.icon as IconName} className="size-5 text-accent" />
                <span className="font-semibold">{l.title}</span>
                <span className="text-sm text-ink-muted">{l.text}</span>
              </Link>
            </li>
          ))}
        </ul>
      </section>

      <p className="mt-10 text-sm text-ink-muted">
        Want to change your answers?{" "}
        <button
          type="button"
          onClick={() => setHub((s) => ({ ...s, onboarding: { ...s.onboarding, welcomed: false } }))}
          className="min-h-11 font-semibold text-accent hover:underline"
        >
          Go through setup again
        </button>
      </p>
    </div>
  );
}
