"use client";

import Link from "next/link";
import { whoPhotoFor } from "@/lib/pathPhoto";
import { useApi } from "@/lib/api";
import { cx, formatDuration } from "@/lib/format";
import { PathCard, type MyPath } from "./MyLearningPaths";
import { Icon, type IconName } from "./Icon";
import { btn } from "./admin/ui";
import type { QuizOffer } from "./PathQuiz";
import { minutesLabel } from "@/lib/pathQuizSettings";

type PathData = MyPath & { assigned: boolean; minutes: number; done: boolean; quiz: QuizOffer | null };

/* One learning path on its own page, opened from its QR code or link: what it is, how it works, and the topics. */
export function PathPage({ id, preview = false }: { id: string; preview?: boolean }) {
  const { data, error } = useApi<PathData>(`/api/paths/${encodeURIComponent(id)}`);
  return (
    <div className="mx-auto max-w-2xl px-4 pb-16 pt-8 sm:px-6">
      <Link
        href={preview ? `/admin/learning-paths/${encodeURIComponent(id)}` : "/learning"}
        className="inline-flex min-h-11 items-center gap-1.5 font-medium text-accent hover:underline"
      >
        <Icon name="arrow-left" className="size-4" /> {preview ? "Back to editing the path" : "All learning"}
      </Link>
      {error ? (
        <p className="mt-4 rounded-2xl border border-line p-4 text-ink-muted">This learning path isn’t available. It may have been removed.</p>
      ) : !data ? (
        <p className="mt-4 text-ink-muted">Loading…</p>
      ) : (
        <>
          {preview && (
            <p className="mt-3 rounded-2xl border-2 border-dashed border-gold px-3 py-2 text-sm">
              <strong>Path preview.</strong> Every topic opens, drafts included, so you can check the whole path. Nothing is recorded.
            </p>
          )}
          <Overview path={data} />
          {!preview && !data.assigned && <p className="mt-4 text-sm text-ink-muted">This path isn’t assigned to you, but you’re welcome to work through it.</p>}
          {data.quiz && <QuizPanel id={id} quiz={data.quiz} done={data.done} preview={preview} />}
          <ul className="mt-6">
            <PathCard path={data} preview={preview} intro={false} />
          </ul>
        </>
      )}
    </div>
  );
}

/** The top of the page: name, time it takes, who it's for, what they'll be able to do, and how it works. */
function Overview({ path: p }: { path: PathData }) {
  const lengths = p.steps.map((s) => s.minutes).filter((m) => m > 0);
  const shortest = Math.min(...lengths);
  const longest = Math.max(...lengths);
  const chapters = p.chapters?.length ?? 0;
  const stages = new Set((p.chapters ?? []).map((c) => c.stage).filter(Boolean)).size;
  const soon = p.steps.filter((s) => s.draft).length;
  const facts: { icon: IconName; big: string; small: string }[] = [
    { icon: "clock", big: formatDuration(p.minutes), small: "in total, at your own pace" },
    {
      icon: "list",
      big: `${p.steps.length} short ${p.steps.length === 1 ? "topic" : "topics"}`,
      small: lengths.length ? (shortest === longest ? `${shortest} minutes each` : `${shortest}–${longest} minutes each`) : "",
    },
    ...(chapters
      ? [
          {
            icon: "route" as const,
            big: `${chapters} ${chapters === 1 ? "chapter" : "chapters"}`,
            small: stages > 1 ? `in ${stages} stages` : p.inOrder ? "taken in order" : "in any order",
          },
        ]
      : []),
  ];
  const how: { icon: IconName; text: React.ReactNode }[] = [
    { icon: "clock", text: "Go at your own pace: a topic or two between visits is plenty." },
    { icon: "refresh", text: "Stop any time. Your place is saved after every card, so you can pick up where you left off." },
    { icon: "volume", text: "Every topic can be listened to, and the words follow along as it's read." },
    { icon: "check", text: "Download the path to keep working when you're offline. Progress syncs when you're back online." },
    {
      icon: "home",
      text: p.assigned
        ? "Sign in on any device and you'll find this path on your Learning page, right where you left it."
        : "Sign in on any device and come back to this page: your progress comes with you.",
    },
    ...(p.inOrder ? [{ icon: "list" as const, text: "Topics open one at a time, each after the one before it." }] : []),
    ...(soon
      ? [
          {
            icon: "lock" as const,
            text: `${soon} ${soon === 1 ? "topic is" : "topics are"} still being written. They show as coming soon and don't count yet.`,
          },
        ]
      : []),
  ];

  return (
    <header className="mt-2">
      <p className="font-mulish text-xs font-extrabold uppercase tracking-[0.14em] text-accent">Learning path</p>
      <h1 className="mt-1 font-serif text-3xl font-semibold leading-tight sm:text-4xl">{p.name}</h1>
      {p.description && <p className="mt-3 text-lg text-ink-muted">{p.description}</p>}

      <ul className="mt-5 grid gap-2 sm:grid-cols-3">
        {facts.map((f) => (
          <li key={f.icon} className="flex items-start gap-3 rounded-2xl bg-muted p-3">
            <span className="grid size-9 shrink-0 place-items-center rounded-full bg-surface text-accent">
              <Icon name={f.icon} className="size-4" />
            </span>
            <span className="min-w-0">
              <span className="block font-semibold leading-snug">{f.big}</span>
              {f.small && <span className="block text-sm text-ink-muted">{f.small}</span>}
            </span>
          </li>
        ))}
      </ul>

      {(p.whoFor || p.reward) && (
        <div className="mt-5 grid gap-3 sm:grid-cols-2">
          {/* Fixed brand colours, so both panels look the same in light and dark mode. */}
          {p.whoFor && (
            <section className="relative isolate overflow-hidden rounded-3xl bg-[linear-gradient(160deg,#36537f_0%,#2d4875_100%)] p-5 text-white ring-1 ring-white/10">
              {/* The path's own picture behind the panel (or the default one), under a navy tint so the text stays readable. */}
              <>
                {/* Slightly enlarged, so a picture with a thin border or shadow at its edges still fills the panel cleanly. */}
                {/* eslint-disable-next-line @next/next/no-img-element */}
                <img src={whoPhotoFor(p.whoPhoto)} alt="" aria-hidden className="absolute inset-0 -z-20 size-full scale-[1.06] object-cover" />
                {/* Light at the top so the picture shows; deeper navy behind the words lower down. */}
                <div
                  aria-hidden
                  className="absolute inset-0 -z-10 bg-[linear-gradient(to_bottom,rgb(16_42_67/0.05)_0%,rgb(16_42_67/0.35)_45%,rgb(16_42_67/0.75)_100%)]"
                />
              </>
              <span className="grid size-11 place-items-center rounded-2xl bg-[#ffc72c] text-[#102a43] shadow-sm">
                <Icon name="people" className="size-5" />
              </span>
              <h2 className="mt-3 font-mulish text-xs font-extrabold uppercase tracking-[0.14em] text-[#ffc72c]">Who it’s for</h2>
              <p className="mt-1.5 leading-relaxed text-white/90">{p.whoFor}</p>
            </section>
          )}
          {p.reward && (
            <section className="relative isolate overflow-hidden rounded-3xl bg-[linear-gradient(160deg,#ffd968_0%,#ffc72c_100%)] p-5 text-[#102a43]">
              <CertificateArt className="absolute -bottom-3 -right-3 -z-10 w-32 rotate-[-8deg] drop-shadow-md" />
              <span className="grid size-11 place-items-center rounded-2xl bg-[#102a43] text-[#ffc72c] shadow-sm">
                <Icon name="star" className="size-5" />
              </span>
              <h2 className="mt-3 font-mulish text-xs font-extrabold uppercase tracking-[0.14em]">What you get at the end</h2>
              <p className="mt-1.5 pr-24 font-semibold leading-relaxed sm:pb-12 sm:pr-0">{p.reward}</p>
            </section>
          )}
        </div>
      )}

      {p.outcomes && p.outcomes.length > 0 && (
        <section className="mt-5">
          <h2 className="font-serif text-xl font-semibold">What you’ll be able to do</h2>
          <ul className="mt-2 grid gap-2 sm:grid-cols-2">
            {p.outcomes.map((o) => (
              <li key={o} className="flex items-start gap-2.5">
                <span className="mt-0.5 grid size-6 shrink-0 place-items-center rounded-full bg-tealtint text-accent">
                  <Icon name="check" className="size-3.5" />
                </span>
                <span className="leading-snug">{o}</span>
              </li>
            ))}
          </ul>
        </section>
      )}

      {/* Open for someone who hasn't started; folded away once they're under way. */}
      <details open={!p.steps.some((s) => s.completedAt)} className="group mt-5 rounded-2xl border border-line bg-surface">
        <summary className="flex min-h-12 cursor-pointer list-none items-center justify-between gap-3 px-4 font-semibold">
          <span className="flex items-center gap-2">
            <Icon name="info" className="size-4 text-accent" /> How this path works
          </span>
          <Icon name="chevron-down" className="size-5 text-ink-muted transition-transform group-open:rotate-180" />
        </summary>
        <ul className="flex flex-col gap-2.5 px-4 pb-4">
          {how.map((h, i) => (
            <li key={i} className="flex items-start gap-3 text-ink-muted">
              <Icon name={h.icon} className="mt-0.5 size-4 shrink-0 text-accent" />
              <span>{h.text}</span>
            </li>
          ))}
        </ul>
      </details>
    </header>
  );
}

/**
  The upfront quiz: an offer for someone who thinks they know it already, or their latest result.
  Hidden once the path is done the usual way, unless they passed the quiz.
*/
function QuizPanel({ id, quiz: q, done, preview }: { id: string; quiz: QuizOffer; done: boolean; preview: boolean }) {
  const href = `/paths/${encodeURIComponent(id)}/quiz${preview ? "?preview=1" : ""}`;
  // In a preview, the offer as a learner first sees it, whatever the author's own results.
  if (preview) q = { ...q, available: true, inProgress: false, latest: null, passed: false, left: q.attempts };
  if (q.passed && q.latest)
    return (
      <p className="mt-5 flex items-start gap-3 rounded-2xl bg-[#DDE8D9] p-4 text-[#102a43]">
        <Icon name="circle-check" className="mt-0.5 size-5 shrink-0" />
        <span>
          <strong>You passed the upfront quiz</strong> with {q.latest.percent}%
          {done
            ? ", so every topic is complete. They’re still here whenever you want a refresher."
            : ". Some compliance topics still need to be worked through, or are waiting for the compliance team to approve your result."}
        </span>
      </p>
    );
  if (!q.available && !q.inProgress) {
    if (!q.latest || done) return null;
    return (
      <p className="mt-5 flex items-start gap-3 rounded-2xl border border-line bg-surface p-4">
        <Icon name="info" className="mt-0.5 size-5 shrink-0 text-accent" />
        <span>
          You scored {q.latest.percent}% on the upfront quiz ({q.latest.passMark}% needed). Work through the topics below to complete the path
          {q.latest.focus.length ? ", starting with the ones you missed questions on." : "."}
        </span>
      </p>
    );
  }
  return (
    <section className="mt-5 flex flex-col gap-3 rounded-3xl border-2 border-action/40 bg-surface p-5 sm:flex-row sm:items-center sm:justify-between">
      <div className="flex items-start gap-3">
        <span className="grid size-11 shrink-0 place-items-center rounded-2xl bg-tealtint text-accent">
          <Icon name="target" className="size-5" />
        </span>
        <div>
          <h2 className="font-serif text-xl font-semibold leading-snug">{q.inProgress ? "Finish your upfront quiz" : "Already know this?"}</h2>
          <p className="mt-1 text-ink-muted">
            {q.latest
              ? `You scored ${q.latest.percent}% last time. You have ${q.left} more ${q.left === 1 ? "try" : "tries"}: score ${q.passMark}% to complete the path.`
              : `Take the ${q.questions}-question quiz (about ${minutesLabel(q.minutes)}). Score ${q.passMark}% or more and the whole path is complete.`}
          </p>
        </div>
      </div>
      <Link href={href} className={cx(btn.primary, "shrink-0")}>
        {q.inProgress ? "Carry on" : "Take the quiz"} <Icon name="arrow-right" className="size-4" />
      </Link>
    </section>
  );
}

/** A small drawn certificate with a rosette, for the "What you get" panel. Decorative. */
function CertificateArt({ className }: { className?: string }) {
  return (
    <svg aria-hidden viewBox="0 0 140 110" className={className}>
      <rect x="4" y="4" width="124" height="90" rx="8" fill="#ffffff" />
      <rect x="11" y="11" width="110" height="76" rx="5" fill="none" stroke="#2d4875" strokeWidth="1.5" />
      <rect x="34" y="24" width="64" height="5" rx="2.5" fill="#2d4875" opacity="0.8" />
      <rect x="26" y="36" width="80" height="8" rx="4" fill="#102a43" />
      <rect x="40" y="50" width="52" height="4" rx="2" fill="#2d4875" opacity="0.45" />
      <rect x="44" y="59" width="44" height="4" rx="2" fill="#2d4875" opacity="0.3" />
      <path d="M100 82 l-6 22 8-5 6 8 2-24z" fill="#d32f2f" />
      <path d="M110 82 l6 22-8-5-6 8-2-24z" fill="#f26a36" />
      <circle cx="105" cy="78" r="13" fill="#0e7c7b" />
      <circle cx="105" cy="78" r="8.5" fill="none" stroke="#ffc72c" strokeWidth="2" />
      <path d="M101 78 l3 3 6-6" fill="none" stroke="#ffffff" strokeWidth="2.2" strokeLinecap="round" strokeLinejoin="round" />
    </svg>
  );
}
