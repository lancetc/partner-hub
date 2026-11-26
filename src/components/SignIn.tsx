"use client";

import Image from "next/image";
import { useState } from "react";
import { api } from "@/lib/api";
import { clearOfflineData } from "@/lib/offlineLessons";
import { Icon } from "./Icon";

/*
  Sign-in (prototype). Real sign-in will be handled by each person's organisation (single sign-on), so
  the button is a placeholder: it signs in as the demo author, Lance Elliott.

  The page stands alone on white: the logo, the scene, one line and one button. It stays white in the dark
  theme too, because the scene is painted onto white (globals.css hides the footer here).

  A few small touches, all in globals.css under "The sign-in page":
  - the page arrives: the scene rises into place, then the heading, then the button;
  - the lights come on at dusk, one after another, and keep a slow glow;
  - the button shimmers very slowly, and pulses when the pointer is on it;
  - signing in, the page falls away part by part (data-fall: the button first, the logo last), then the Hub's
    homepage falls into place from the top;
  - hidden hotspots in the scene show a pulsing dot and a note about the Hub when a pointer finds them.
  Anyone who has asked their device for less motion gets the page still, with the lights simply on.
*/

const DEMO_ACCOUNT = "jordan";
const INK = "text-[#102a43]";
const MUTED = "text-[#3d5068]";
/** How long the page takes to fall away before the Hub opens (the last part's delay plus its fall). */
const FALL_MS = 1250;
/** Each part's place in the fall, and its tilt as it drops. */
const fall = (n: number, tilt: number) => ({ "--fall": n, "--tilt": `${tilt}deg` }) as React.CSSProperties;

/**
  Where each light is in the scene, as a percentage of its width and height, how big its glow is (percent of the
  scene's width), and when it comes on (seconds after the page opens). Read off the picture: if the picture
  changes, these change with it.
*/
const LAMPS = [
  { x: 28.6, y: 33.2, size: 7, on: 0.9 }, // the verandah wall lamp
  { x: 37.2, y: 67.5, size: 5, on: 1.15 }, // the path bollard by the ramp
  { x: 14.2, y: 70, size: 6, on: 1.35 }, // the up-light under the frangipani
  { x: 73.2, y: 37, size: 6, on: 1.05 }, // the office's left wall light
  { x: 85.7, y: 32.6, size: 6, on: 1.25 }, // the office's right wall light
  { x: 80.7, y: 39.2, size: 4.5, on: 1.45 }, // the pendant inside
  { x: 89, y: 71, size: 6, on: 1.6 }, // the up-light by the office garden
];

/**
  Hidden hotspots over the scene (globals.css, .signin-hotspot). Nothing shows until a pointer finds one; then a
  soft pulsing dot appears with a short note on what the Hub does. Places are percentages of the scene, read off
  the picture; `tip` says which way the note opens so it stays on screen at the edges. They're for pointers only:
  screen readers get the same notes as a list below the scene, and keyboard users go straight to the button.
*/
const HOTSPOTS = [
  {
    x: 28.5,
    y: 49,
    tip: "start",
    title: "Learn from real visits",
    text: "Short topics built around the clients you see, to finish between visits.",
  }, // the older woman and her carer on the verandah
  {
    x: 53,
    y: 58,
    tip: "center",
    title: "A path for every role",
    text: "Discovery Paths take Care Partners, gardeners and cleaners step by step to a certificate.",
  }, // the team lined up on the path
  {
    x: 74,
    y: 61,
    tip: "end",
    title: "Learn from each other",
    text: "The Community connects Care Partners and coordinators across Australia.",
  }, // the coordinator welcoming them at the door
  {
    x: 84,
    y: 30,
    tip: "end",
    title: "Answers when you need them",
    text: "Ask Trilogy finds guides, templates and contacts in seconds.",
  }, // the lit office
] as const;

const reducedMotion = () => typeof window !== "undefined" && window.matchMedia("(prefers-reduced-motion: reduce)").matches;

export function SignIn() {
  const [busy, setBusy] = useState(false);
  const [problem, setProblem] = useState<string | null>(null);

  async function signIn() {
    setBusy(true);
    setProblem(null);
    try {
      // Nothing kept for offline use stays from whoever used this device before.
      await clearOfflineData().catch(() => {});
      // The page falls away while the sign-in happens; whichever takes longer sets when the Hub opens.
      await Promise.all([api("/api/demo/session", { body: { userId: DEMO_ACCOUNT } }), new Promise((done) => setTimeout(done, reducedMotion() ? 0 : FALL_MS))]);
      // The homepage falls into place from the top once (see buildScript in app/layout).
      try {
        sessionStorage.setItem("tc-build", "1");
      } catch {}
      // Back to the page they were sent here from (only a page on this site), else the homepage.
      // A full load so every part of the hub picks up who's signed in.
      const next = new URLSearchParams(window.location.search).get("next");
      window.location.assign(next && next.startsWith("/") && !next.startsWith("//") ? next : "/");
    } catch (e) {
      setProblem((e as Error).message);
      setBusy(false);
    }
  }

  return (
    <div
      data-signin-page
      data-entering={busy ? "" : undefined}
      className={`flex min-h-dvh flex-col items-center overflow-hidden bg-white px-4 py-8 sm:px-8 sm:py-10 ${INK}`}
    >
      <Image
        src="/brand/trilogy-logo.svg"
        alt="Trilogy Care"
        width={1789}
        height={576}
        priority
        data-fall
        className="signin-rise signin-fade h-10 w-auto sm:h-12"
        style={{ "--delay": "0.05s", ...fall(4, 3) } as React.CSSProperties}
      />

      <div className="my-auto flex w-full max-w-5xl flex-col items-center py-6">
        {/*
          Edge to edge on a phone, where the page's side margin would otherwise shrink the scene further. Hovering it
          with a mouse zooms it in very slowly (globals.css, .signin-stage).
        */}
        <div
          data-fall
          className="signin-rise signin-stage -mx-4 w-[calc(100%+2rem)] sm:mx-0 sm:w-full"
          style={{ "--delay": "0.15s", ...fall(3, -1.5) } as React.CSSProperties}
        >
          <div className="signin-scene relative isolate">
            <Image
              src="/brand/login-scene.webp"
              alt="An older woman on the verandah of her Queenslander home, and a care team gathered on the garden path at dusk."
              width={1428}
              height={498}
              priority
              sizes="(min-width: 1088px) 1024px, 100vw"
              className="block h-auto w-full"
            />
            {LAMPS.map((l) => (
              <span
                key={`${l.x}-${l.y}`}
                aria-hidden
                className="signin-lamp"
                style={{ left: `${l.x}%`, top: `${l.y}%`, width: `${l.size}%`, "--on": `${l.on}s` } as React.CSSProperties}
              />
            ))}
            {/* The open office door: a soft glow at rest. */}
            <span aria-hidden className="signin-door" style={{ left: "79.6%", top: "55%", width: "9%", height: "42%" }} />
            {HOTSPOTS.map((h) => (
              <span key={h.title} aria-hidden data-tip={h.tip} className="signin-hotspot" style={{ left: `${h.x}%`, top: `${h.y}%` } as React.CSSProperties}>
                <span className="signin-hotspot-dot" />
                <span className="signin-hotspot-tip">
                  <strong className="block font-semibold text-[#102a43]">{h.title}</strong>
                  <span className="mt-0.5 block text-[#3d5068]">{h.text}</span>
                </span>
              </span>
            ))}
          </div>
        </div>
        <ul className="sr-only">
          {HOTSPOTS.map((h) => (
            <li key={h.title}>
              {h.title}: {h.text}
            </li>
          ))}
        </ul>
        <h1
          data-fall
          className="signin-rise signin-fade mt-4 text-center font-serif text-4xl font-semibold tracking-tight sm:text-5xl"
          style={{ "--delay": "0.45s", ...fall(2, 2) } as React.CSSProperties}
        >
          Partner Hub
        </h1>
        <p
          data-fall
          className={`signin-rise signin-fade mt-2 text-center text-lg ${MUTED}`}
          style={{ "--delay": "0.55s", ...fall(1, -2.5) } as React.CSSProperties}
        >
          Learn, share and stay up to date.
        </p>

        {/* The rise and the fall are on the wrapper so the button's own squish and pulse (globals.css, .signin-cta) don't fight them. */}
        <div data-fall className="signin-rise mt-8" style={{ "--delay": "0.7s", ...fall(0, 4) } as React.CSSProperties}>
          <button
            type="button"
            onClick={signIn}
            disabled={busy}
            className="signin-cta relative isolate inline-flex min-h-14 items-center gap-3 overflow-hidden rounded-full bg-[#0e7c7b] px-8 text-lg font-semibold text-white shadow-sm hover:bg-[#0a6463] focus-visible:outline-2 focus-visible:outline-offset-4 focus-visible:outline-[#0e7c7b] disabled:opacity-90"
          >
            {busy ? "Signing you in…" : "Sign in with Trilogy Care"}
            <Icon name="arrow-right" className="signin-cta-arrow size-5" />
          </button>
        </div>
        <p role="status" className="sr-only">
          {busy ? "Signing you in" : ""}
        </p>
        {problem && (
          <p role="alert" className="mt-3 text-center font-semibold text-[#d32f2f]">
            {problem}
          </p>
        )}
      </div>
    </div>
  );
}
