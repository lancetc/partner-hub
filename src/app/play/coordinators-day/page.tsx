import type { Metadata } from "next";
import Link from "next/link";
import { Icon } from "@/components/Icon";
import { CoordinatorsDay } from "@/components/coordinatorsDay/CoordinatorsDay";

export const metadata: Metadata = {
  title: "The Coordinator’s Day",
  description: "A solo board game: follow a care coordinator’s day from the first call to handover, where decisions move you forward and setbacks send you back.",
  robots: { index: false },
};

const CLIENTS = [
  { name: "Dot", src: "/images/coordinators-day/dot-avatar.webp", alt: "Dot, smiling, on the phone at home", note: "Your client on every level" },
  { name: "Mr Tan", src: "/images/coordinators-day/mr-tan-avatar.webp", alt: "Mr Tan, smiling, in his armchair at home", note: "Joins from Practising up" },
];

/* The Coordinator's Day: a solo board game, reached from Play. */
export default function CoordinatorsDayPage() {
  return (
    <div className="mx-auto max-w-7xl px-4 pb-10 pt-6 sm:px-6 lg:pt-8">
      <Link href="/play" className="inline-flex min-h-11 items-center gap-1.5 font-semibold text-accent hover:underline">
        <Icon name="arrow-left" className="size-4" /> Play
      </Link>
      <div className="flex flex-col-reverse gap-5 sm:flex-row sm:items-center sm:justify-between">
        <div>
          <p className="mt-1 font-mulish text-xs font-extrabold uppercase tracking-[0.14em] text-accent">Solo board game · about 15 minutes</p>
          <h1 className="mt-1 font-serif text-4xl font-semibold tracking-tight sm:text-5xl">The Coordinator’s Day</h1>
          <p className="mt-2 max-w-3xl text-lg text-ink-muted">
            From the first call of the morning to the end-of-day handover. Good decisions move you forward, setbacks send you back to replan, and opportunities
            handled well let you climb. What you learn early in the day can help you later.
          </p>
        </div>
        {/* The clients at the heart of the day: Dot on every level, Mr Tan from Practising up. */}
        <div className="flex shrink-0 gap-6 sm:gap-8">
          {CLIENTS.map((c) => (
            <figure key={c.name} className="flex flex-col items-center gap-2 text-center">
              {/* eslint-disable-next-line @next/next/no-img-element -- a small square portrait from public/images */}
              <img src={c.src} alt={c.alt} width={320} height={320} className="size-20 rounded-full object-cover shadow-md ring-4 ring-[#fab53d] sm:size-28" />
              <figcaption className="text-sm leading-snug">
                <span className="block font-serif text-lg font-semibold text-ink">Meet {c.name}</span>
                <span className="text-ink-muted">{c.note}</span>
              </figcaption>
            </figure>
          ))}
        </div>
      </div>
      <CoordinatorsDay />
    </div>
  );
}
