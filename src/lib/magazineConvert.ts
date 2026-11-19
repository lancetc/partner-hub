import type { Block, BlockType, Media, VideoFields } from "./magazine";

/*
  Changing a block into another kind, keeping what fits: select a text block and make it text and
  media, a callout, folds, tabs or a checklist, and its words come with it. The block keeps its id (so
  it stays where it is, and readers' progress stays with it), its notes, sources, flag and entrance.
  Anything the new kind can't hold (a picture going into a callout, say) is named before the change, and
  the editor's Undo brings it back.
*/

/** The kinds of block that can be changed into one another. */
export const CONVERTIBLE = ["text", "textMedia", "callout", "accordion", "tabs", "checklist", "image", "video"] as const satisfies readonly BlockType[];
export type ConvertibleType = (typeof CONVERTIBLE)[number];
type Convertible = Extract<Block, { type: ConvertibleType }>;

export const canConvert = (b: Block): b is Convertible => (CONVERTIBLE as readonly string[]).includes(b.type);

/** What a block says, whatever its kind. */
type Essence = {
  heading?: string;
  body: string;
  /** Separate titled parts (folds, tabs). */
  parts?: { title: string; body: string }[];
  /** A list's items (a checklist). */
  list?: string[];
  media?: Media;
  video?: VideoFields;
  link?: boolean;
  foldPictures?: boolean;
  /** Readers could open the picture full size. */
  enlarge?: boolean;
};

const shortId = (prefix: string) => `${prefix}-${Math.random().toString(36).slice(2, 10)}`;
const plain = (s: string) =>
  s
    .replace(/\[([^\]]+)\]\([^)]*\)/g, "$1")
    .replace(/\*\*|__|[*_`]/g, "")
    .trim();
const joinParts = (parts: { title: string; body: string }[]) =>
  parts
    .filter((p) => p.title || p.body)
    .map((p) => (p.title ? `**${p.title}**\n\n${p.body}` : p.body).trim())
    .join("\n\n");
/** A list from text, nothing left out: each list line an item, and each other paragraph an item too. */
const LIST_LINE = /^([-*]|\d+\.)\s+/;
const listFrom = (body: string) =>
  body.split(/\n\s*\n/).flatMap((para) => {
    const lines = para.split("\n").map((l) => l.trim());
    return lines.some((l) => LIST_LINE.test(l)) ? lines.map((l) => plain(l.replace(LIST_LINE, ""))).filter(Boolean) : [plain(lines.join(" "))].filter(Boolean);
  });

function essence(b: Convertible): Essence {
  switch (b.type) {
    case "text":
      return { heading: b.heading, body: b.body };
    case "textMedia":
      return { heading: b.heading, body: b.body, media: b.video ? undefined : b.media.src ? b.media : undefined, video: b.video, enlarge: b.enlarge };
    case "callout":
      return { heading: b.label, body: b.body, link: Boolean(b.link) };
    case "accordion": {
      const parts = b.items.map((it) => ({ title: it.title, body: it.body }));
      return { heading: b.heading, body: joinParts(parts), parts, foldPictures: b.items.some((it) => it.media?.src) };
    }
    case "tabs": {
      const parts = b.tabs.map((t) => ({ title: t.label, body: t.body }));
      return { body: joinParts(parts), parts };
    }
    case "checklist":
      return { heading: b.title || undefined, body: b.items.map((i) => `- ${i}`).join("\n"), list: b.items, link: Boolean(b.resource) };
    case "image": {
      const { caption, ...media } = b.media;
      return { body: caption ?? "", media: media.src ? media : undefined, enlarge: b.enlarge };
    }
    case "video": {
      // The video's own settings, without the block's fields; its caption becomes the words.
      const video: Record<string, unknown> = { ...b };
      for (const k of ["id", "type", "note", "evidence", "flag", "reveal", "caption"]) delete video[k];
      return { heading: b.title || undefined, body: b.caption ?? "", video: video as VideoFields };
    }
  }
}

/** What would be left behind changing `b` into `to`, in words for the author ("the picture"). Empty when nothing is. */
export function convertLoses(b: Convertible, to: ConvertibleType): string[] {
  const e = essence(b);
  const lost: string[] = [];
  if (e.media && to !== "textMedia" && to !== "image") lost.push("the picture");
  if (e.video && to !== "textMedia" && to !== "video") lost.push("the video");
  if (e.heading && (to === "image" || (to === "video" && b.type !== "textMedia" && b.type !== "text"))) lost.push("the heading");
  if (e.body && (to === "image" || to === "video") && plain(e.body).length > 400) lost.push("most of the text (it becomes a short caption)");
  if (e.link && to !== b.type) lost.push("the link");
  if (e.foldPictures && to !== "accordion") lost.push("the pictures in the folds");
  if (b.type === "callout" && b.style !== "tip" && to !== "callout") lost.push("the callout’s style");
  if (b.type === "callout" && b.confirm && to !== "callout") lost.push("the tick box");
  return lost;
}

/** `b` as a block of kind `to`, keeping its id and everything that fits. */
export function convertBlock(b: Convertible, to: ConvertibleType): Block {
  const e = essence(b);
  const base = {
    id: b.id,
    ...(b.note !== undefined && { note: b.note }),
    ...(b.evidence && { evidence: b.evidence }),
    ...(b.flag && { flag: b.flag }),
    ...(b.reveal && { reveal: b.reveal }),
  };
  const heading = e.heading?.trim() || undefined;
  const caption = plain(e.body).replace(/\s+/g, " ").slice(0, 400) || undefined;
  switch (to) {
    case "text":
      return { ...base, type: "text", ...(heading && { heading, level: 2 as const }), body: e.body };
    case "textMedia":
      return {
        ...base,
        type: "textMedia",
        ...(heading && { heading }),
        body: e.body,
        media: e.media ?? { src: "", alt: "" },
        ...(!e.media && e.video && { video: e.video }),
        ...(e.media && e.enlarge && { enlarge: true }),
        layout: "media-right",
      };
    case "callout":
      return { ...base, type: "callout", style: "tip", ...(heading && { label: heading.slice(0, 60) }), body: e.body };
    case "accordion": {
      const parts = e.parts ?? [{ title: heading ?? "More detail", body: e.body }];
      return {
        ...base,
        type: "accordion",
        ...(e.parts && heading && { heading }),
        items: parts.map((p) => ({ id: shortId("item"), title: p.title, body: p.body })),
      };
    }
    case "tabs": {
      const parts = e.parts ?? [{ title: heading ?? "Overview", body: e.body }];
      return { ...base, type: "tabs", tabs: parts.map((p) => ({ id: shortId("tab"), label: p.title, body: p.body })) };
    }
    case "checklist":
      return {
        ...base,
        type: "checklist",
        title: heading ?? "",
        items: e.list ?? (e.parts ? e.parts.map((p) => p.title || plain(p.body)).filter(Boolean) : listFrom(e.body)),
      };
    case "image":
      return {
        ...base,
        type: "image",
        media: { ...(e.media ?? { src: "", alt: "" }), ...(caption && { caption }) },
        width: "column",
        ...(e.enlarge && { enlarge: true }),
      };
    case "video":
      return {
        ...base,
        type: "video",
        ...(e.video ?? { src: "", transcript: "" }),
        title: e.video?.title || heading || "",
        ...(caption && !e.video?.caption && { caption }),
      };
  }
}
