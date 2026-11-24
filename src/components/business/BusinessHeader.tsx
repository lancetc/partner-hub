import Link from "next/link";
import { Icon } from "../Icon";

/** The Business Field Notes header: what the deck is, and what it isn't. No card content, so it's the same for everyone. */
export function BusinessHeader({ back }: { back?: { href: string; label: string } }) {
  return (
    <>
      <div className="flex flex-wrap gap-4">
        <Link href={back?.href ?? "/tools"} className="inline-flex min-h-11 items-center gap-1.5 font-semibold text-accent hover:underline">
          <Icon name="arrow-left" className="size-4" /> {back?.label ?? "Work Tools"}
        </Link>
        <Link href="/pocket-deck" className="inline-flex min-h-11 items-center gap-1.5 font-semibold text-accent hover:underline">
          <Icon name="bookmark" className="size-4" /> Pocket Deck
        </Link>
      </div>
      <header className="mt-2 rounded-3xl border-t-[10px] border-[#e0a63a] bg-gradient-to-br from-[#0f3f45] to-[#102a43] p-6 text-white sm:p-8">
        <p className="font-mulish text-xs font-extrabold uppercase tracking-[0.14em] text-[#9fe3e0]">
          Notes to a Younger Me · Business edition · Principals only
        </p>
        <h1 className="mt-1 font-serif text-3xl font-semibold tracking-tight sm:text-4xl">Business Field Notes</h1>
        <p className="mt-2 max-w-3xl text-lg text-white/90">
          Care Partner principals on one business decision each: what they believed, what they tried, what failed and what they’d tell a newer principal. Read
          the story, jot your own first thought, ask a question, then test it privately in a Work Tool.
        </p>
      </header>
    </>
  );
}
