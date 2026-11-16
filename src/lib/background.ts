/*
  The full-screen background behind the hub's main pages, chosen by each person in Profile and settings:
  their own uploaded photo, a Pexels stock photo, one of the brand colours or gradients, or none.
  Saved per person on the server (users.background, as JSON), so it follows them to other devices.
  Shared by the server (validating what's saved) and the browser (drawing it), so nothing here
  touches the database or the DOM.
*/

export type BrandColour = { id: string; label: string; css: string; /** Mostly dark, for the preview's tick. */ dark: boolean };

/** Solid and gradient brand backgrounds. No violet: the brand has none. */
export const BRAND_COLOURS: BrandColour[] = [
  {
    id: "petals",
    label: "Trilogy petals",
    css: "radial-gradient(at 12% 8%, #4cc3c9 0, transparent 46%), radial-gradient(at 88% 14%, #ffc72c 0, transparent 40%), radial-gradient(at 70% 92%, #0e7c7b 0, transparent 50%), radial-gradient(at 8% 90%, #2d4875 0, transparent 48%), #dde7f2",
    dark: false,
  },
  { id: "navy-teal", label: "Navy to teal", css: "linear-gradient(135deg, #102a43 0%, #1e3a5c 45%, #0e7c7b 100%)", dark: true },
  { id: "teal-mist", label: "Teal mist", css: "linear-gradient(160deg, #ddf2f3 0%, #4cc3c9 55%, #0e7c7b 100%)", dark: false },
  { id: "sunrise", label: "Sunrise", css: "linear-gradient(150deg, #fff3cf 0%, #ffc72c 45%, #f26a36 100%)", dark: false },
  { id: "sky", label: "Soft sky", css: "linear-gradient(180deg, #e8eef6 0%, #b7cbe4 55%, #7f9fc9 100%)", dark: false },
  { id: "navy", label: "Navy", css: "#102a43", dark: true },
  { id: "teal", label: "Teal", css: "#0e7c7b", dark: true },
  { id: "sand", label: "Sand", css: "#efe6d4", dark: false },
];

export type PexelsChoice = {
  kind: "pexels";
  id: number;
  /** The photo on images.pexels.com, without size parameters. */
  src: string;
  width: number;
  height: number;
  /** Pexels' average colour, shown while the photo loads. */
  color: string | null;
  alt: string;
  photographer: string;
  photographerUrl: string;
  pageUrl: string;
};

export type UploadChoice = { kind: "upload"; file: string; width: number; height: number; color: string | null };

export type Background = { kind: "none" } | { kind: "colour"; id: string } | PexelsChoice | UploadChoice;

/** What people see before they choose: the brand's soft gradient, so the glass has something to show. */
export const DEFAULT_BACKGROUND: Background = { kind: "colour", id: "petals" };

/** Uploaded backgrounds: one large and one phone-sized WebP per upload. */
export const UPLOAD_NAME = /^[\w-]+\.webp$/;
export const uploadSmallName = (file: string) => file.replace(/\.webp$/, "-sm.webp");
export const uploadUrl = (file: string) => `/api/backgrounds/${file}`;

const HEX = /^#[0-9a-f]{6}$/i;
const PEXELS_IMAGE = /^https:\/\/images\.pexels\.com\/photos\/(\d+)\/[\w.-]+\.(jpe?g|png)$/i;
const PEXELS_SITE = /^https:\/\/www\.pexels\.com\/[\w@%./-]*$/i;

const text = (v: unknown, max: number) => (typeof v === "string" ? v.replace(/\s+/g, " ").trim().slice(0, max) : "");
const size = (v: unknown) => {
  const n = Number(v);
  return Number.isInteger(n) && n > 0 && n <= 30000 ? n : null;
};

export type Checked = { ok: true; value: Background } | { ok: false; error: string };

/**
  Checks a background someone chose in the browser before it's saved. Uploads aren't accepted here:
  they're saved by the upload itself, so a person can only ever point at their own file.
*/
export function checkBackground(input: unknown): Checked {
  const x = (input ?? {}) as Record<string, unknown>;
  if (x.kind === "none") return { ok: true, value: { kind: "none" } };
  if (x.kind === "colour") {
    const colour = BRAND_COLOURS.find((c) => c.id === x.id);
    return colour ? { ok: true, value: { kind: "colour", id: colour.id } } : { ok: false, error: "Choose one of the colours shown." };
  }
  if (x.kind === "pexels") {
    const id = Number(x.id);
    if (!Number.isInteger(id) || id <= 0) return { ok: false, error: "Which photo?" };
    const src = text(x.src, 300);
    const match = PEXELS_IMAGE.exec(src);
    if (!match || Number(match[1]) !== id) return { ok: false, error: "That photo isn’t from Pexels." };
    const width = size(x.width);
    const height = size(x.height);
    if (!width || !height) return { ok: false, error: "Couldn’t read the size of that photo." };
    const photographerUrl = text(x.photographerUrl, 300);
    const pageUrl = text(x.pageUrl, 300);
    if (!PEXELS_SITE.test(photographerUrl) || !PEXELS_SITE.test(pageUrl)) return { ok: false, error: "That photo’s credit isn’t from Pexels." };
    const photographer = text(x.photographer, 120);
    if (!photographer) return { ok: false, error: "That photo needs its photographer’s name for the credit." };
    const color = typeof x.color === "string" && HEX.test(x.color) ? x.color : null;
    return { ok: true, value: { kind: "pexels", id, src, width, height, color, alt: text(x.alt, 300), photographer, photographerUrl, pageUrl } };
  }
  if (x.kind === "upload") return { ok: false, error: "Upload a photo to use your own picture." };
  return { ok: false, error: "Choose a photo, a colour or no background." };
}

/** A saved background, read back from the database. Anything unreadable shows the default. */
export function parseBackground(stored: string | null | undefined): Background {
  if (!stored) return DEFAULT_BACKGROUND;
  let value: unknown;
  try {
    value = JSON.parse(stored);
  } catch {
    return DEFAULT_BACKGROUND;
  }
  const x = value as Record<string, unknown> | null;
  if (x?.kind === "upload") {
    const file = String(x.file ?? "");
    const width = size(x.width);
    const height = size(x.height);
    if (!UPLOAD_NAME.test(file) || !width || !height) return DEFAULT_BACKGROUND;
    return { kind: "upload", file, width, height, color: typeof x.color === "string" && HEX.test(x.color) ? x.color : null };
  }
  const checked = checkBackground(value);
  return checked.ok ? checked.value : DEFAULT_BACKGROUND;
}

/** A Pexels photo at a given width (Pexels resizes on its own servers). */
export function pexelsSized(src: string, width: number, height?: number) {
  const params = new URLSearchParams({ auto: "compress", cs: "tinysrgb", w: String(width) });
  if (height) {
    params.set("h", String(height));
    params.set("fit", "crop");
  }
  return `${src}?${params}`;
}

export type BackdropImage = { src: string; srcSet: string; sizes: string; color: string | null; alt: string };

/**
  `sizes` for a photo that covers the screen: when the screen is narrower than the photo (a phone
  held upright), it's the height that's covered, so the photo needs to be that much wider.
*/
export function coverSizes(width: number, height: number) {
  const ratio = width / height;
  return `(max-aspect-ratio: ${width}/${height}) ${Math.ceil(ratio * 100)}vh, 100vw`;
}

/** The photo to draw, in a few sizes so phones don't download a desktop-sized one. Null for colours and none. */
export function backdropImage(bg: Background): BackdropImage | null {
  if (bg.kind === "pexels") {
    const widths = [1280, 1920, 2560];
    return {
      src: pexelsSized(bg.src, 1920),
      srcSet: widths.map((w) => `${pexelsSized(bg.src, w)} ${w}w`).join(", "),
      sizes: coverSizes(bg.width, bg.height),
      color: bg.color,
      alt: bg.alt,
    };
  }
  if (bg.kind === "upload") {
    // The phone-sized copy is at most 1280 pixels on its longest side.
    const small = Math.round(bg.width * Math.min(1, 1280 / Math.max(bg.width, bg.height)));
    return {
      src: uploadUrl(bg.file),
      srcSet: `${uploadUrl(uploadSmallName(bg.file))} ${small}w, ${uploadUrl(bg.file)} ${bg.width}w`,
      sizes: coverSizes(bg.width, bg.height),
      color: bg.color,
      alt: "",
    };
  }
  return null;
}

/** The CSS background for a colour choice; null for photos and none. */
export function backdropColour(bg: Background) {
  return bg.kind === "colour" ? (BRAND_COLOURS.find((c) => c.id === bg.id)?.css ?? null) : null;
}

/** Same choice? (For showing which option is selected, and whether there's anything to save.) */
export function sameBackground(a: Background, b: Background) {
  if (a.kind !== b.kind) return false;
  if (a.kind === "colour" && b.kind === "colour") return a.id === b.id;
  if (a.kind === "pexels" && b.kind === "pexels") return a.id === b.id;
  if (a.kind === "upload" && b.kind === "upload") return a.file === b.file;
  return true;
}

/*
  Where the background shows: the main pages. Not inside a topic (the lesson player has its own full
  screen design), on admin screens, certificates, the games' own screens, sign-in or public links.
*/
const SHOWN = [/^\/$/, /^\/news(\/|$)/, /^\/community$/, /^\/topics$/, /^\/topics\/follow-ups\//, /^\/paths$/, /^\/paths\/[^/]+$/, /^\/inbox$/];
const SHOWN_UNDER = ["/resources", "/webinars", "/journey", "/challenges", "/challenge/", "/saved", "/settings"];

export function backdropShownOn(pathname: string) {
  if (pathname === "/play" || pathname === "/play/conversations") return true;
  return SHOWN.some((r) => r.test(pathname)) || SHOWN_UNDER.some((p) => pathname === p || pathname.startsWith(p.endsWith("/") ? p : `${p}/`));
}

/** Sent on window when someone previews or saves a background, so the page behind updates straight away. */
export const BACKGROUND_EVENT = "hub-background";
