import Link from "next/link";
import type { Metadata } from "next";
import { StoryVisual } from "@/components/StoryVisual";
import { Icon } from "@/components/Icon";
import type { IconName } from "@/components/Icon";

export const metadata: Metadata = { title: "Page not found" };

const PLACES: { href: string; label: string; note: string; icon: IconName }[] = [
  { href: "/learning", label: "Learning", note: "Topics and learning paths", icon: "book" },
  { href: "/news", label: "News", note: "What’s changing, and why", icon: "news" },
  { href: "/onboarding", label: "My onboarding", note: "Your next steps", icon: "checklist" },
  { href: "/resources", label: "Resources", note: "Guides, forms and contacts", icon: "folder" },
];

/* Shown for any address that doesn't exist, and for lessons, paths and pages that have moved or been removed. */
export default function NotFound() {
  return (
    <div className="mx-auto grid max-w-5xl items-center gap-10 px-4 pb-16 pt-10 sm:px-6 md:grid-cols-[1fr_minmax(0,24rem)] lg:pt-16">
      <div>
        <p className="font-mulish text-xs font-extrabold uppercase tracking-[0.14em] text-accent">Error 404</p>
        <h1 className="mt-2 font-serif text-4xl font-semibold tracking-tight sm:text-5xl">We can’t find that page</h1>
        <p className="mt-3 max-w-xl text-lg text-ink-muted">
          It may have moved, or the link may be out of date. Check the address, or pick up where you need to go below.
        </p>
        <div className="mt-6 flex flex-wrap gap-3">
          <Link href="/" className="inline-flex min-h-12 items-center gap-2 rounded-full bg-action px-6 font-semibold text-on-action hover:bg-action-hover">
            <Icon name="home" className="size-4" /> Go to the home page
          </Link>
          <Link href="/learning" className="inline-flex min-h-12 items-center gap-2 rounded-full border border-line-strong px-6 font-semibold hover:bg-muted">
            Browse learning <Icon name="arrow-right" className="size-4" />
          </Link>
        </div>
        <ul className="mt-10 grid gap-3 sm:grid-cols-2">
          {PLACES.map((p) => (
            <li key={p.href}>
              <Link href={p.href} className="group flex items-center gap-3 rounded-2xl border border-line bg-surface p-4 transition-colors hover:border-action">
                <span className="grid size-10 shrink-0 place-items-center rounded-xl bg-tealtint text-accent" aria-hidden>
                  <Icon name={p.icon} className="size-5" />
                </span>
                <span className="min-w-0">
                  <span className="block font-semibold group-hover:underline">{p.label}</span>
                  <span className="block text-sm text-ink-muted">{p.note}</span>
                </span>
              </Link>
            </li>
          ))}
        </ul>
        <p className="mt-8 text-sm text-ink-muted">
          Followed a link from an email or a QR code? It may point to a topic that’s been updated. Let your coordinator know so they can send a fresh one.
        </p>
      </div>
      <div className="relative order-first mx-auto w-full max-w-[15rem] md:order-none md:max-w-none">
        <StoryVisual variant="petals" tone="teal" icon="home" alt="" className="aspect-square rounded-[2rem]" iconSize="size-16" />
        <span
          aria-hidden
          className="absolute -right-2 -top-4 rounded-2xl bg-surface px-4 py-2 font-serif text-5xl font-semibold text-accent shadow-lg sm:text-6xl"
        >
          404
        </span>
      </div>
    </div>
  );
}
