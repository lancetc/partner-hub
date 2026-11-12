import type { Metadata } from "next";
import Link from "next/link";
import { badges, quests } from "@/content/explorer";
import { cards, themes } from "@/content/conversations";
import { Icon } from "@/components/Icon";

export const metadata: Metadata = {
  title: "Play",
  description: "Two ways to learn by playing: walk a pixel-art neighbourhood helping clients, or draw conversation cards and learn from each other.",
  alternates: { canonical: "/play" },
};

/*
  Play: the hub's games, introduced side by side. Neighbourhood Explorer is for practising decisions
  on your own; Care Conversations is for reflecting and talking it over with others.
*/
export default function PlayPage() {
  return (
    <div className="mx-auto max-w-7xl px-4 pb-16 pt-6 sm:px-6 lg:pt-8">
      <header className="max-w-3xl">
        <h1 className="font-serif text-4xl font-semibold tracking-tight sm:text-5xl">Play</h1>
        <p className="mt-2 text-lg text-ink-muted">
          Two games for learning by doing. One puts you on a street full of clients who need a hand; the other gets people talking about the moments
          that matter in care.
        </p>
      </header>

      <div className="mt-8 grid grid-cols-[minmax(0,1fr)] gap-6 lg:grid-cols-2">
        {/* Neighbourhood Explorer */}
        <article className="flex flex-col overflow-hidden rounded-3xl border border-line bg-surface">
          <div className="relative h-56 overflow-hidden bg-[#9fd8a0] sm:h-64">
            <PixelStreet />
            <span className="absolute left-4 top-4 rounded-full bg-white/90 px-3 py-1 font-mulish text-xs font-extrabold uppercase tracking-[0.12em] text-[#102a43]">
              Solo · about 15 minutes
            </span>
          </div>
          <div className="flex flex-1 flex-col gap-4 p-6 sm:p-7">
            <div>
              <p className="font-mulish text-xs font-extrabold uppercase tracking-[0.14em] text-accent">Practise decisions</p>
              <h2 className="mt-1 font-serif text-3xl font-semibold">Neighbourhood Explorer</h2>
              <p className="mt-2 text-ink-muted">
                Walk a pixel-art suburb and knock on doors. Each of the {quests.length} clients has a real situation to work through, from a ladder that should
                stay in the shed to something that just doesn’t feel right. Choose what you’d do, see what happens, and learn why.
              </p>
            </div>
            <ul className="grid gap-2 text-sm sm:grid-cols-2">
              <Feature icon="pin">{quests.length} houses, each a quest with several decisions</Feature>
              <Feature icon="star">Points, levels and {badges.length} badges to collect</Feature>
              <Feature icon="refresh">Clients remember you when you pop back in</Feature>
              <Feature icon="book">Every quest links to the topic behind it</Feature>
            </ul>
            <p className="text-sm text-ink-muted">
              <span className="font-semibold text-ink">How to play:</span> click or tap to walk, drag to look around, and knock on a door with a “!” above it.
            </p>
            <Link
              href="/explorer"
              className="mt-auto inline-flex min-h-12 items-center justify-center gap-2 self-start rounded-full bg-[#008282] px-6 font-semibold text-white hover:bg-[#006b6b]"
            >
              Play Neighbourhood Explorer <Icon name="arrow-right" className="size-4" />
            </Link>
          </div>
        </article>

        {/* Care Conversations */}
        <article className="flex flex-col overflow-hidden rounded-3xl border border-line bg-surface">
          <div className="relative h-56 overflow-hidden bg-[#1d2b4f] sm:h-64">
            <div aria-hidden className="absolute inset-x-0 bottom-[-3.5rem] mx-auto h-56 w-72">
              {themes.map((t, i) => (
                <span
                  key={t.id}
                  className="absolute bottom-0 left-1/2 flex h-48 w-32 origin-bottom flex-col justify-between rounded-2xl p-3 shadow-xl ring-1 ring-black/10"
                  style={{ background: t.colour, color: t.ink, transform: `translateX(-50%) rotate(${(i - 2.5) * 12}deg)` }}
                >
                  <span className="text-lg">{t.emoji}</span>
                </span>
              ))}
            </div>
            <span className="absolute left-4 top-4 rounded-full bg-white/90 px-3 py-1 font-mulish text-xs font-extrabold uppercase tracking-[0.12em] text-[#102a43]">
              Solo, team or community
            </span>
          </div>
          <div className="flex flex-1 flex-col gap-4 p-6 sm:p-7">
            <div>
              <p className="font-mulish text-xs font-extrabold uppercase tracking-[0.14em] text-accent">Learn from each other</p>
              <h2 className="mt-1 font-serif text-3xl font-semibold">Care Conversations</h2>
              <p className="mt-2 text-ink-muted">
                A conversation card game. Pick a card, consider the question, share your perspective, and discover how others approach the same situation.
                Not a quiz: there are no right answers and nothing is scored.
              </p>
            </div>
            <ul className="grid gap-2 text-sm sm:grid-cols-2">
              <Feature icon="layers">
                {cards.length} cards in {themes.length} themes, each with a deeper question on the back
              </Feature>
              <Feature icon="pen">Reflect privately, or share with the community</Feature>
              <Feature icon="people">Host a team session with a room code</Feature>
              <Feature icon="calendar">A card of the week for everyone</Feature>
            </ul>
            <p className="flex flex-wrap gap-1.5" aria-label="Themes">
              {themes.map((t) => (
                <span key={t.id} className="inline-flex items-center gap-1.5 rounded-full bg-muted px-2.5 py-1 text-xs font-semibold">
                  <span className="size-2 rounded-full" style={{ background: t.colour }} aria-hidden /> {t.name}
                </span>
              ))}
            </p>
            <div className="mt-auto flex flex-wrap gap-2">
              <Link
                href="/play/conversations"
                className="inline-flex min-h-12 items-center justify-center gap-2 rounded-full bg-[#008282] px-6 font-semibold text-white hover:bg-[#006b6b]"
              >
                Draw a card <Icon name="arrow-right" className="size-4" />
              </Link>
            </div>
          </div>
        </article>
      </div>

      <section className="mt-8 grid gap-4 rounded-3xl bg-muted p-6 sm:grid-cols-3 sm:p-7">
        <h2 className="font-serif text-2xl font-semibold sm:col-span-3">Why play?</h2>
        <p>
          <span className="block font-semibold">Practise safely</span>
          <span className="text-ink-muted">Try a decision, see where it leads, and try again. Nobody gets hurt in a pixel suburb.</span>
        </p>
        <p>
          <span className="block font-semibold">Learn from peers</span>
          <span className="text-ink-muted">The best advice often comes from someone who’s been in the same driveway.</span>
        </p>
        <p>
          <span className="block font-semibold">Short and flexible</span>
          <span className="text-ink-muted">A card takes two minutes; a quest about five. Play between visits or in a team meeting.</span>
        </p>
      </section>
    </div>
  );
}

function Feature({ icon, children }: { icon: Parameters<typeof Icon>[0]["name"]; children: React.ReactNode }) {
  return (
    <li className="flex items-start gap-2">
      <Icon name={icon} className="mt-0.5 size-4 shrink-0 text-[#008282] dark:text-[#3cb8b9]" />
      <span>{children}</span>
    </li>
  );
}

/** A little isometric-ish street in pixel blocks: houses, a road, trees. */
function PixelStreet() {
  const houses = [
    { x: 30, roof: "#c7393e", wall: "#f6e7c8", door: "#008282" },
    { x: 150, roof: "#2d4875", wall: "#fff6e3", door: "#fab53d" },
    { x: 270, roof: "#008282", wall: "#f3dfc1", door: "#c7393e" },
    { x: 390, roof: "#b8772a", wall: "#fff3dc", door: "#3cb8b9" },
  ];
  return (
    <svg aria-hidden viewBox="0 0 520 240" preserveAspectRatio="xMidYMid slice" className="absolute inset-0 h-full w-full" shapeRendering="crispEdges">
      <rect width="520" height="240" fill="#a8dcf0" />
      <rect y="120" width="520" height="120" fill="#8cc97a" />
      <rect y="190" width="520" height="34" fill="#6b6f76" />
      {Array.from({ length: 13 }, (_, i) => (
        <rect key={i} x={i * 42 + 6} y="205" width="22" height="4" fill="#f4f1e6" />
      ))}
      <rect y="180" width="520" height="10" fill="#d9d4c7" />
      {houses.map((h, i) => (
        <g key={i}>
          <rect x={h.x} y="110" width="90" height="70" fill={h.wall} />
          <polygon points={`${h.x - 8},112 ${h.x + 45},70 ${h.x + 98},112`} fill={h.roof} />
          <rect x={h.x + 36} y="138" width="18" height="42" fill={h.door} />
          <rect x={h.x + 10} y="126" width="18" height="16" fill="#cfeaf5" />
          <rect x={h.x + 62} y="126" width="18" height="16" fill="#cfeaf5" />
          <rect x={h.x + 10} y="142" width="18" height="5" fill="#c7393e" />
          {i === 1 && (
            <g>
              <rect x={h.x + 39} y="40" width="12" height="20" fill="#fab53d" />
              <rect x={h.x + 43} y="44" width="4" height="9" fill="#102a43" />
              <rect x={h.x + 43} y="55" width="4" height="3" fill="#102a43" />
            </g>
          )}
        </g>
      ))}
      {[120, 240, 360, 485].map((x) => (
        <g key={x}>
          <rect x={x + 6} y="150" width="6" height="30" fill="#7a5233" />
          <rect x={x - 6} y="122" width="30" height="30" fill="#3f8a4a" />
          <rect x={x} y="114" width="18" height="12" fill="#4fa35a" />
        </g>
      ))}
      {/* The player, waiting on the footpath. */}
      <rect x="205" y="168" width="10" height="12" fill="#008282" />
      <rect x="206" y="160" width="8" height="8" fill="#f1c7a0" />
    </svg>
  );
}
