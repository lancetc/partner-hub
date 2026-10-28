/*
  Web links in a lesson open in the same window. Just before the learner leaves, the card they're on
  is remembered for this tab, so coming back (Back button) reopens that card rather than the start.
*/

const KEY = "tc-lesson-return";
/** Long enough to read a page or two; after that, the lesson opens as usual. */
const KEEP_MS = 6 * 60 * 60 * 1000;

type Return = { path: string; card: string; at: number };

const here = () => window.location.pathname + window.location.search;

export function rememberCard(card: string) {
  try {
    sessionStorage.setItem(KEY, JSON.stringify({ path: here(), card, at: Date.now() } satisfies Return));
  } catch {
    // Storage blocked: coming back opens the lesson's start screen, with Resume.
  }
}

/** The card to reopen on this page, if the learner left from it recently. Read once. */
export function takeReturnCard(): string | null {
  try {
    const raw = sessionStorage.getItem(KEY);
    if (!raw) return null;
    const r = JSON.parse(raw) as Return;
    if (r.path !== here()) return null;
    sessionStorage.removeItem(KEY);
    return Date.now() - r.at < KEEP_MS ? r.card : null;
  } catch {
    return null;
  }
}

/** A link to another website (not a download, not one opening a new tab). */
export function leavesSite(a: HTMLAnchorElement) {
  if (a.target === "_blank" || a.hasAttribute("download")) return false;
  try {
    return new URL(a.href).origin !== window.location.origin;
  } catch {
    return false;
  }
}
