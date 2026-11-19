"use client";

import Link from "next/link";
import { useParams, useRouter, useSearchParams } from "next/navigation";
import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { api, useApi } from "@/lib/api";
import { confirmAction } from "@/lib/confirm";
import { cx, formatDate, formatDateTime } from "@/lib/format";
import {
  BLOCK_LABELS,
  videoOf,
  type TextMediaBlock,
  type VideoBlock,
  REVEALS,
  type Reveal,
  CALLOUTS,
  COMPLETION_MODES,
  GUIDE_AUDIENCES,
  PAGE_TEMPLATES,
  pageBlocks,
  pageMinutes,
  templatePage,
  VERDICTS,
  EMBED_NAME,
  embedLink,
  parseEmbedLink,
  type VideoEmbed,
  audiencePhrase,
  readingMinutes,
  type Block,
  type BlockType,
  type CompletionMode,
  type GuideAudience,
  type GuideDoc,
  type Page,
  type PageTemplate,
  type Verdict,
} from "@/lib/magazine";
import { AdminShell, Badge, btn, ErrorNote, Field, input } from "./ui";
import { DescribeButton, ImageDropZone, PictureButtons } from "./ImagePicker";
import { ImageCropper } from "./ImageCropper";
import { RichEditable } from "./RichEditable";
import { statusBadge } from "./MagazineAdmin";
import { TemplatePicker, type TemplateChoice } from "./MagazineTemplates";
import { MagazineAi } from "./MagazineAi";
import { AudioGuidePanel, NarrationReview, PageNarrationStrip } from "./MagazineNarration";
import { canConvert, convertBlock, convertLoses, CONVERTIBLE, type ConvertibleType } from "@/lib/magazineConvert";
import { DEFAULT_AUDIO } from "@/lib/magazineNarration";
import { MagazineRevise, type RevisionChange } from "./MagazineRevise";
import { EmbedPlayer, column } from "../magazine/GuideBlocks";
import { Icon, type IconName } from "../Icon";
import { InlineText, MediaSlot, rid, VERDICT_TONE, type Update } from "./MagazineEditParts";
import { InteractiveEdit, InteractiveSettings } from "./MagazineInteractiveEdit";
import { RecordingStudio } from "./RecordingStudio";
import { MagazineApproval } from "./MagazineApproval";

/*
  The Magazine editor, like the Topics editor: each page drawn as learners see it and edited in place.
  The Pages bar moves between the course outline (pages, their purpose and teaching pattern, required or
  optional, add, duplicate, reorder, delete) and each page. On a page, click any text to change it (rich
  text shows its formatting bar), add a block from the + between blocks, and select a block to move,
  copy or remove it, or to set its details (picture description, width, sources, flags for reviewers) in
  the panel beside the page. A section can split the page in two there. Changes save as you go; learners
  keep reading the published edition until you publish. Undo and Redo cover every change.
*/

type Draft = { title: string; standfirst: string; cover: string | null; audience: GuideAudience[]; completion: CompletionMode; doc: GuideDoc };
type AuthorGuide = Draft & {
  id: string;
  slug: string;
  status: "draft" | "in_review" | "approved" | "published" | "archived";
  savedAt: string;
  publishedRevisionId: string | null;
  publishedNumber: number | null;
  changed: boolean;
  checks: { blocking: string[]; suggestions: string[]; unverified: { blockId: string; check: string }[] };
  reviewRequired: boolean;
  revisions: { id: string; number: number; summary: string; published_by: string; published_at: string }[];
  finishes: Record<string, number>;
  started: number;
};
type PathOption = { id: string; name: string };
type Selection = { kind: "guide" } | { kind: "section"; id: string } | { kind: "block"; id: string };
type Save = { state: "saved" | "waiting" | "saving" | "error" | "conflict"; error?: string; problems?: string[] };

const draftOf = (g: Draft): Draft => ({ title: g.title, standfirst: g.standfirst, cover: g.cover, audience: g.audience, completion: g.completion, doc: g.doc });
const storeKey = (id: string) => `hub-magazine-draft:${id}`;
const savedTime = (iso: string) => new Date(iso).toLocaleTimeString("en-AU", { hour: "numeric", minute: "2-digit" });

const BLOCK_ICONS: Record<BlockType, IconName> = {
  text: "doc",
  accordion: "accordion",
  image: "image",
  carousel: "carousel",
  video: "play",
  textMedia: "layers",
  callout: "info",
  decision: "target",
  quiz: "clipboard",
  checklist: "checklist",
  flashcards: "flashcards",
  tabs: "tabs",
  timeline: "timeline",
  process: "steps",
  branching: "branch",
  conversation: "chat",
  spot: "search",
  confidence: "gauge",
  reflection: "pen",
  budget: "money",
  wall: "people",
  poll: "sliders",
  hotspots: "pin",
  sorting: "sorting",
  sequencing: "sequencing",
  matching: "matching",
  fillblank: "blank",
};
const BLOCK_HINTS: Record<BlockType, string> = {
  text: "Paragraphs, lists and links, with an optional heading.",
  accordion: "Text in folds: titles readers open for the detail.",
  carousel: "Pictures to step through one at a time, each with a caption.",
  image: "A picture with a caption; wide pictures use the page’s full width.",
  video: "An uploaded video, or one on YouTube, Vimeo or Loom, with captions and a transcript.",
  textMedia: "Text beside a picture.",
  callout: "Important, Example or Tip, set apart from the text.",
  decision: "“What would you do?” with feedback on each answer.",
  quiz: "A learning path’s quiz, with its pass mark and retakes.",
  checklist: "A job aid to tick, copy or download.",
  flashcards: "Cards readers flip to reveal the answer.",
  tabs: "Content in sections, one at a time, to compare.",
  timeline: "Events in order, such as a client’s journey.",
  process: "A workflow to step through one step at a time.",
  branching: "Choices that change the story, with different endings.",
  conversation: "Practise a conversation: choose what to say, see how it lands.",
  spot: "Find the errors in a document or picture.",
  confidence: "Readers rate their confidence, and see it change.",
  reflection: "An open question, with feedback from Claude.",
  budget: "A made-up budget to plan services against.",
  wall: "A question everyone answers; the shared answers open once they post.",
  poll: "A quick vote, with everyone’s answers shown after.",
  hotspots: "Points on a picture to open, for exploring a screen, form or room.",
  sorting: "Sort items into groups, then check, with a reason for each.",
  sequencing: "Put steps in order, then check.",
  matching: "Match each item to its pair, then check.",
  fillblank: "Type the missing words, then check.",
};

/**
  What the palette offers: every block type, and Webcam recording, which adds a video block and opens the
  recording studio on it.
*/
type PaletteItem = BlockType | "webcam" | "ack";
const ITEM_LABELS: Record<PaletteItem, string> = { ...BLOCK_LABELS, webcam: "Webcam recording", ack: "Acknowledgement" };
const ITEM_ICONS: Record<PaletteItem, IconName> = { ...BLOCK_ICONS, webcam: "camera", ack: "circle-check" };
const ITEM_HINTS: Record<PaletteItem, string> = {
  ...BLOCK_HINTS,
  webcam: "Record yourself, or your screen with you in the corner, without leaving the page.",
  ack: "A statement readers tick to confirm, like a declaration. The tick is recorded, and the page can’t be finished without it.",
};
/** Video blocks that should open the recording studio when they first appear. */
const openStudioFor = new Set<string>();

/** The palette's categories, so the longer list stays easy to scan. Each block is in one. */
const BLOCK_CATEGORIES: { title: string; types: PaletteItem[] }[] = [
  { title: "Content", types: ["text", "image", "textMedia", "video", "webcam", "callout", "ack"] },
  { title: "Explore", types: ["accordion", "tabs", "carousel", "timeline", "process", "hotspots"] },
  { title: "Practise", types: ["flashcards", "sorting", "matching", "sequencing", "spot", "fillblank", "decision", "checklist", "quiz"] },
  { title: "Simulate", types: ["branching", "conversation", "budget"] },
  { title: "Reflect & share", types: ["reflection", "wall", "poll", "confidence"] },
];

/** A new, empty block of each kind. Ids are unique across the guide (choices included). */
function newBlock(item: PaletteItem): Block {
  if (item === "webcam") {
    const b = newBlock("video");
    openStudioFor.add(b.id);
    return b;
  }
  // An acknowledgement: an important callout readers tick to confirm.
  if (item === "ack")
    return { id: rid("callout"), type: "callout", style: "important", label: "Your acknowledgement", body: "", confirm: "I understand and agree" };
  const type = item;
  const id = rid(type.toLowerCase());
  switch (type) {
    case "text":
      return { id, type, body: "" };
    case "accordion":
      return { id, type, items: [{ id: rid("item"), title: "", body: "" }] };
    case "carousel":
      return {
        id,
        type,
        width: "column",
        slides: [
          { id: rid("slide"), media: { src: "", alt: "" } },
          { id: rid("slide"), media: { src: "", alt: "" } },
        ],
      };
    case "image":
      return { id, type, media: { src: "", alt: "" }, width: "column" };
    case "video":
      return { id, type, title: "", src: "", transcript: "" };
    case "textMedia":
      // The text flows around the picture unless the author turns it off.
      return { id, type, body: "", media: { src: "", alt: "" }, layout: "media-right" };
    case "callout":
      return { id, type, style: "tip", body: "" };
    case "decision":
      return {
        id,
        type,
        prompt: "",
        choices: [
          { id: rid("c"), text: "", verdict: "best", feedback: "" },
          { id: rid("c"), text: "", verdict: "risky", feedback: "" },
        ],
      };
    case "quiz":
      return { id, type, pathId: "" };
    case "checklist":
      return { id, type, title: "", items: [""] };
    case "flashcards":
      return {
        id,
        type,
        cards: [
          { id: rid("card"), front: "", back: "" },
          { id: rid("card"), front: "", back: "" },
          { id: rid("card"), front: "", back: "" },
        ],
      };
    case "tabs":
      return {
        id,
        type,
        tabs: [
          { id: rid("tab"), label: "", body: "" },
          { id: rid("tab"), label: "", body: "" },
        ],
      };
    case "timeline":
      return {
        id,
        type,
        events: [
          { id: rid("event"), when: "", title: "", body: "" },
          { id: rid("event"), when: "", title: "", body: "" },
          { id: rid("event"), when: "", title: "", body: "" },
        ],
      };
    case "process":
      return {
        id,
        type,
        steps: [
          { id: rid("step"), title: "", body: "" },
          { id: rid("step"), title: "", body: "" },
          { id: rid("step"), title: "", body: "" },
        ],
      };
    case "branching": {
      // A start with two choices, each leading to an ending: the smallest story that works.
      const [good, poor] = [rid("scene"), rid("scene")];
      return {
        id,
        type,
        title: "",
        scenes: [
          {
            id: rid("scene"),
            text: "",
            choices: [
              { id: rid("choice"), text: "", next: good },
              { id: rid("choice"), text: "", next: poor },
            ],
          },
          { id: good, text: "", choices: [], ending: { outcome: "good", summary: "" } },
          { id: poor, text: "", choices: [], ending: { outcome: "poor", summary: "" } },
        ],
      };
    }
    case "conversation":
      return {
        id,
        type,
        person: "",
        role: "",
        setting: "",
        turns: [
          {
            id: rid("turn"),
            line: "",
            responses: [
              { id: rid("resp"), text: "", verdict: "best", feedback: "", reply: "" },
              { id: rid("resp"), text: "", verdict: "risky", feedback: "", reply: "" },
            ],
          },
        ],
      };
    case "spot":
      return { id, type, prompt: "", media: { src: "", alt: "" }, mistakes: [] };
    case "confidence":
      return { id, type, statement: "", low: "Not confident", high: "Very confident" };
    case "reflection":
      return { id, type, prompt: "", guidance: "", minWords: 30 };
    case "wall":
      return { id, type, prompt: "" };
    case "hotspots":
      return { id, type, prompt: "", media: { src: "", alt: "" }, spots: [] };
    case "sorting": {
      const [a, z] = [rid("group"), rid("group")];
      return {
        id,
        type,
        prompt: "",
        groups: [
          { id: a, label: "" },
          { id: z, label: "" },
        ],
        items: [
          { id: rid("item"), text: "", group: a, feedback: "" },
          { id: rid("item"), text: "", group: z, feedback: "" },
          { id: rid("item"), text: "", group: a, feedback: "" },
        ],
      };
    }
    case "sequencing":
      return { id, type, prompt: "", feedback: "", steps: [0, 1, 2].map(() => ({ id: rid("step"), text: "" })) };
    case "matching":
      return { id, type, prompt: "", feedback: "", pairs: [0, 1, 2].map(() => ({ id: rid("pair"), left: "", right: "" })) };
    case "fillblank":
      return { id, type, prompt: "", text: "", feedback: "" };
    case "poll":
      return {
        id,
        type,
        question: "",
        options: [
          { id: rid("opt"), text: "" },
          { id: rid("opt"), text: "" },
          { id: rid("opt"), text: "" },
        ],
      };
    case "budget":
      return {
        id,
        type,
        title: "",
        budget: 6000,
        weeks: 13,
        services: [
          { id: rid("svc"), name: "Personal care", unit: "hour", cost: 75, perWeek: 3, max: 10 },
          { id: rid("svc"), name: "Domestic assistance", unit: "hour", cost: 70, perWeek: 2, max: 6 },
          { id: rid("svc"), name: "Meals", unit: "meal", cost: 12, perWeek: 5, max: 14 },
        ],
      };
  }
}

/** A copy with fresh ids, so it can sit beside the original. */
function copyBlock(b: Block): Block {
  const c = structuredClone(b);
  c.id = rid(b.type.toLowerCase());
  if (c.type === "decision") c.choices = c.choices.map((x) => ({ ...x, id: rid("c") }));
  if (c.type === "accordion") c.items = c.items.map((x) => ({ ...x, id: rid("item") }));
  if (c.type === "carousel") c.slides = c.slides.map((x) => ({ ...x, id: rid("slide") }));
  if (c.type === "flashcards") c.cards = c.cards.map((x) => ({ ...x, id: rid("card") }));
  if (c.type === "tabs") c.tabs = c.tabs.map((x) => ({ ...x, id: rid("tab") }));
  if (c.type === "timeline") c.events = c.events.map((x) => ({ ...x, id: rid("event") }));
  if (c.type === "process") c.steps = c.steps.map((x) => ({ ...x, id: rid("step") }));
  if (c.type === "spot") c.mistakes = c.mistakes.map((x) => ({ ...x, id: rid("mistake") }));
  if (c.type === "budget") c.services = c.services.map((x) => ({ ...x, id: rid("svc") }));
  if (c.type === "poll") c.options = c.options.map((x) => ({ ...x, id: rid("opt") }));
  if (c.type === "hotspots") c.spots = c.spots.map((x) => ({ ...x, id: rid("spot") }));
  if (c.type === "sequencing") c.steps = c.steps.map((x) => ({ ...x, id: rid("step") }));
  if (c.type === "matching") c.pairs = c.pairs.map((x) => ({ ...x, id: rid("pair") }));
  if (c.type === "sorting") {
    const ids = new Map(c.groups.map((g) => [g.id, rid("group")]));
    c.groups = c.groups.map((g) => ({ ...g, id: ids.get(g.id)! }));
    c.items = c.items.map((x) => ({ ...x, id: rid("item"), group: ids.get(x.group) ?? "" }));
  }
  if (c.type === "conversation") c.turns = c.turns.map((t) => ({ ...t, id: rid("turn"), responses: t.responses.map((r) => ({ ...r, id: rid("resp") })) }));
  if (c.type === "branching") {
    // New scene ids, with every choice pointed at the matching new scene.
    const ids = new Map(c.scenes.map((sc) => [sc.id, rid("scene")]));
    c.scenes = c.scenes.map((sc) => ({
      ...sc,
      id: ids.get(sc.id)!,
      choices: sc.choices.map((x) => ({ ...x, id: rid("choice"), next: ids.get(x.next) ?? "" })),
    }));
  }
  // A copied confidence check doesn't compare with anything until the author says so.
  if (c.type === "confidence") delete c.compareWith;
  return c;
}

function findBlock(doc: GuideDoc, id: string) {
  for (const page of doc.pages)
    for (const section of page.sections) {
      const index = section.blocks.findIndex((b) => b.id === id);
      if (index >= 0) return { page, section, index, block: section.blocks[index] };
    }
  return null;
}

function findSection(doc: GuideDoc, id: string) {
  for (const page of doc.pages) {
    const index = page.sections.findIndex((s) => s.id === id);
    if (index >= 0) return { page, index, section: page.sections[index] };
  }
  return null;
}

/** The untouched starting page of a new course: nothing written in it yet, so a drafted page can take its place. */
function isStarter(doc: GuideDoc) {
  if (doc.pages.length !== 1 || doc.pages[0].title || doc.pages[0].purpose) return false;
  return pageBlocks(doc.pages[0]).every(isBlank);
}

/** Nothing written or added in a block yet. */
function isBlank(b: Block): boolean {
  switch (b.type) {
    case "text":
    case "callout":
      return !b.body;
    case "textMedia":
      return !b.body && !b.media.src && !b.video;
    case "decision":
      return !b.prompt && b.choices.every((c) => !c.text && !c.feedback);
    case "checklist":
      return !b.title && b.items.every((x) => !x);
    case "image":
      return !b.media.src;
    case "quiz":
      return !b.pathId;
    case "accordion":
      return !b.heading && b.items.every((x) => !x.title && !x.body);
    case "carousel":
      return b.slides.every((x) => !x.media.src);
    case "video":
      return !b.src && !b.embed;
    case "flashcards":
      return b.cards.every((c) => !c.front && !c.back && !c.media?.src);
    case "tabs":
      return b.tabs.every((t) => !t.label && !t.body);
    case "timeline":
      return b.events.every((e) => !e.when && !e.title && !e.body);
    case "process":
      return b.steps.every((st) => !st.title && !st.body);
    case "branching":
      return !b.title && b.scenes.every((sc) => !sc.text && sc.choices.every((c) => !c.text) && !sc.ending?.summary);
    case "conversation":
      return !b.person && !b.setting && b.turns.every((t) => !t.line && t.responses.every((r) => !r.text && !r.feedback));
    case "spot":
      return !b.prompt && !b.media.src && !b.mistakes.length;
    case "confidence":
      return !b.statement;
    case "reflection":
      return !b.prompt && !b.guidance;
    case "wall":
      return !b.prompt;
    case "poll":
      return !b.question && b.options.every((op) => !op.text);
    case "hotspots":
      return !b.media.src && !b.spots.length;
    case "sorting":
      return !b.prompt && b.items.every((it) => !it.text);
    case "sequencing":
      return !b.prompt && b.steps.every((st) => !st.text);
    case "matching":
      return !b.prompt && b.pairs.every((p) => !p.left && !p.right);
    case "fillblank":
      return !b.prompt && !b.text;
    case "budget":
      // It starts with example services, so only the title shows it's been worked on.
      return !b.title;
  }
}

/** A copy of a page with fresh ids throughout, so it can sit beside the original. */
function copyPage(p: Page): Page {
  return {
    ...structuredClone(p),
    id: rid("page"),
    title: p.title ? `${p.title} (copy)` : "",
    sections: p.sections.map((s) => ({ ...s, id: rid("s"), blocks: s.blocks.map(copyBlock) })),
  };
}

/** Uploads a video or a captions file to the Hub (images go through the image picker). */
async function uploadFile(file: File, kind: "video" | "captions" | "image") {
  let size = { width: 0, height: 0 };
  if (kind === "image") {
    if (!file.type.startsWith("image/")) throw new Error(`${file.name} isn’t a picture.`);
    try {
      const bmp = await createImageBitmap(file);
      size = { width: bmp.width, height: bmp.height };
      bmp.close();
    } catch {
      throw new Error(`This browser can’t read ${file.name}. Try a JPEG or PNG.`);
    }
  }
  if (kind === "video") {
    if (!file.type.startsWith("video/")) throw new Error("That file isn’t a video. Upload an MP4, WebM or MOV.");
    const url = URL.createObjectURL(file);
    try {
      size = await new Promise((resolve, reject) => {
        const v = document.createElement("video");
        v.preload = "metadata";
        v.onloadedmetadata = () => resolve({ width: v.videoWidth || 1280, height: v.videoHeight || 720 });
        v.onerror = () => reject(new Error("This browser can’t read that video. Try an MP4."));
        v.src = url;
      });
    } finally {
      URL.revokeObjectURL(url);
    }
  }
  const form = new FormData();
  form.append("file", file);
  form.append("width", String(size.width));
  form.append("height", String(size.height));
  const res = await fetch("/api/admin/uploads", { method: "POST", body: form });
  const data = await res.json().catch(() => ({}));
  if (!res.ok) throw new Error(data.error ?? "The upload didn’t work.");
  return data.src as string;
}

export function MagazineEditor({ id }: { id: string }) {
  const { data, error } = useApi<{ guide: AuthorGuide; paths: PathOption[] }>(`/api/admin/magazine/${id}`);
  const params = useSearchParams();
  const startView: View | null = params.get("view") === "outline" ? { kind: "outline" } : params.get("page") ? { kind: "page", id: params.get("page")! } : null;
  // ?ai=1: straight into Draft with AI (from New Magazine).
  const startAi = params.get("ai") === "1";
  if (error)
    return (
      <AdminShell title="Edit guide" back={{ href: "/admin/magazine", label: "Magazine" }}>
        <ErrorNote text={error} />
      </AdminShell>
    );
  if (!data)
    return (
      <AdminShell title="Edit guide" back={{ href: "/admin/magazine", label: "Magazine" }}>
        <p className="text-ink-muted">Loading…</p>
      </AdminShell>
    );
  return <Editor key={data.guide.id} initial={data.guide} paths={data.paths} startView={startAi ? { kind: "outline" } : startView} startAi={startAi} />;
}

type View = { kind: "outline" } | { kind: "page"; id: string };

function Editor({ initial, paths, startView, startAi = false }: { initial: AuthorGuide; paths: PathOption[]; startView: View | null; startAi?: boolean }) {
  const id = initial.id;
  // What the server last told us about the guide: status, checks, editions.
  const [server, setServer] = useState(initial);
  // Changes kept in this browser that never reached the server (a closed tab, a lost connection).
  const [recovered, setRecovered] = useState<Draft | null>(() => {
    try {
      const raw = localStorage.getItem(storeKey(id));
      if (!raw) return null;
      const kept = JSON.parse(raw) as { draft: Draft; savedAt: string };
      return JSON.stringify(kept.draft) !== JSON.stringify(draftOf(initial)) && kept.savedAt >= initial.savedAt ? kept.draft : null;
    } catch {
      return null;
    }
  });
  const [hist, setHist] = useState<{ past: Draft[]; present: Draft; future: Draft[]; tag: string | null; at: number }>(() => ({
    past: [],
    present: draftOf(initial),
    future: [],
    tag: null,
    at: 0,
  }));
  const draft = hist.present;
  // Rich text areas own their text once drawn; undo and redo draw them again.
  const [round, setRound] = useState(0);
  const [selected, setSelected] = useState<Selection>({ kind: "guide" });
  const [save, setSave] = useState<Save>({ state: "saved" });
  const [previewing, setPreviewing] = useState(false);
  const [narrating, setNarrating] = useState(false);
  const [publishing, setPublishing] = useState(false);
  const [dragging, setDragging] = useState<string | null>(null);
  const [lastSaved, setLastSaved] = useState(() => JSON.stringify(draftOf(initial)));
  // The course outline, or one page. A one-page guide opens on its page; a course on its outline.
  const [view, setView] = useState<View>(() =>
    startView && (startView.kind === "outline" || initial.doc.pages.some((p) => p.id === startView.id))
      ? startView
      : initial.doc.pages.length > 1
        ? { kind: "outline" }
        : { kind: "page", id: initial.doc.pages[0]?.id ?? "" },
  );
  const router = useRouter();

  /** Every change to the page goes through here, so it can be undone. Typing in one field is one step. */
  const change = useCallback((fn: (d: Draft) => void, tag?: string) => {
    setHist((h) => {
      const next = structuredClone(h.present);
      fn(next);
      const now = Date.now();
      const coalesce = tag && h.tag === tag && now - h.at < 2000;
      return { past: coalesce ? h.past : [...h.past.slice(-99), h.present], present: next, future: [], tag: tag ?? null, at: now };
    });
  }, []);
  const undo = useCallback(() => {
    setHist((h) => (h.past.length ? { past: h.past.slice(0, -1), present: h.past[h.past.length - 1], future: [h.present, ...h.future], tag: null, at: 0 } : h));
    setRound((r) => r + 1);
  }, []);
  const redo = useCallback(() => {
    setHist((h) => (h.future.length ? { past: [...h.past, h.present], present: h.future[0], future: h.future.slice(1), tag: null, at: 0 } : h));
    setRound((r) => r + 1);
  }, []);

  const updateBlock = useCallback(
    <T extends Block>(blockId: string, fn: (b: T) => void, tag?: string) =>
      change((d) => {
        const f = findBlock(d.doc, blockId);
        if (f) fn(f.block as T);
      }, tag),
    [change],
  );
  const updatePage = (pid: string, fn: (p: Page) => void, tag?: string) =>
    change((d) => {
      const p = d.doc.pages.find((x) => x.id === pid);
      if (p) fn(p);
    }, tag);

  // Save a moment after the last change. Kept in this browser too until the server has it.
  const dirty = JSON.stringify(draft) !== lastSaved;
  // `force`: save this editor's version even though the course changed elsewhere (the author chose to).
  const flush = useCallback(
    async (force = false) => {
      const body = JSON.stringify(draft);
      if (body === lastSaved) return true;
      setSave({ state: "saving" });
      try {
        const out = await api<{ guide: AuthorGuide }>(`/api/admin/magazine/${id}`, {
          method: "PUT",
          // Saying which version this editor started from, so it can't save over newer changes from another tab.
          body: force ? draft : { ...draft, basedOn: server.savedAt },
        });
        setLastSaved(body);
        setServer(out.guide);
        setSave({ state: "saved" });
        try {
          localStorage.removeItem(storeKey(id));
        } catch {}
        return true;
      } catch (e) {
        const err = e as Error & { problems?: string[]; status?: number };
        setSave({ state: err.status === 409 ? "conflict" : "error", error: err.message });
        return false;
      }
    },
    [draft, id, lastSaved, server.savedAt],
  );
  useEffect(() => {
    if (!dirty || save.state === "conflict") return;
    try {
      localStorage.setItem(storeKey(id), JSON.stringify({ draft, savedAt: new Date().toISOString() }));
    } catch {}
    const t = setTimeout(() => void flush(), 1200);
    return () => clearTimeout(t);
  }, [draft, dirty, flush, id, save.state]);
  // Leaving with changes the server hasn't got: the browser asks first.
  useEffect(() => {
    if (!dirty) return;
    const warn = (e: BeforeUnloadEvent) => e.preventDefault();
    window.addEventListener("beforeunload", warn);
    return () => window.removeEventListener("beforeunload", warn);
  }, [dirty]);
  // The view lives in the address, so a reload or a shared link opens the same page.
  useEffect(() => {
    const q = view.kind === "outline" ? "?view=outline" : `?page=${encodeURIComponent(view.id)}`;
    window.history.replaceState(null, "", `${window.location.pathname}${q}`);
  }, [view]);

  // Undo and redo from the keyboard, except where the browser is already undoing typing.
  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      if (!(e.ctrlKey || e.metaKey)) return;
      const t = e.target as HTMLElement;
      if (t.isContentEditable || /^(INPUT|TEXTAREA|SELECT)$/.test(t.tagName)) return;
      const k = e.key.toLowerCase();
      if (k === "z" && !e.shiftKey) {
        e.preventDefault();
        undo();
      } else if ((k === "z" && e.shiftKey) || k === "y") {
        e.preventDefault();
        redo();
      }
    };
    document.addEventListener("keydown", onKey);
    return () => document.removeEventListener("keydown", onKey);
  }, [undo, redo]);

  const pages = draft.doc.pages;
  // A page removed by undo falls back to the outline.
  const page = view.kind === "page" ? (pages.find((p) => p.id === view.id) ?? null) : null;
  const open = (v: View) => {
    setView(v);
    setSelected({ kind: "guide" });
    window.scrollTo({ top: 0 });
  };

  // ---- Structure: sections and blocks (within a page) ---------------------------------------------
  const addBlock = (sectionId: string, index: number, type: PaletteItem) => {
    const b = newBlock(type);
    change((d) => findSection(d.doc, sectionId)?.section.blocks.splice(index, 0, b));
    setSelected({ kind: "block", id: b.id });
    // Bring the new block into view, wherever it went.
    requestAnimationFrame(() => document.getElementById(`block-${b.id}`)?.scrollIntoView({ behavior: "smooth", block: "center" }));
  };
  /** From the palette: after the selected block, at the end of the selected section, or at the end of the page. */
  const addBlockHere = (type: PaletteItem) => {
    if (!page) return;
    const inBlock = selected.kind === "block" ? findBlock(draft.doc, selected.id) : null;
    const inSection = selected.kind === "section" ? findSection(draft.doc, selected.id) : null;
    if (inBlock && inBlock.page.id === page.id) return addBlock(inBlock.section.id, inBlock.index + 1, type);
    if (inSection && inSection.page.id === page.id) return addBlock(inSection.section.id, inSection.section.blocks.length, type);
    const last = page.sections[page.sections.length - 1];
    if (last) return addBlock(last.id, last.blocks.length, type);
    // A page with no sections yet: one to hold it.
    const sid = rid("s");
    const b = newBlock(type);
    updatePage(page.id, (p) => void p.sections.push({ id: sid, title: "", blocks: [b] }));
    setSelected({ kind: "block", id: b.id });
  };
  /** What's being dragged: a block on the page (its id), or a new one from the palette ("new:text"). */
  const dropAt = (sectionId: string, index: number) => {
    if (!dragging) return;
    if (dragging.startsWith("new:")) addBlock(sectionId, index, dragging.slice(4) as PaletteItem);
    else moveBlockTo(dragging, sectionId, index);
    setDragging(null);
  };
  const moveBlockTo = (blockId: string, sectionId: string, index: number) =>
    change((d) => {
      const f = findBlock(d.doc, blockId);
      const to = findSection(d.doc, sectionId)?.section;
      if (!f || !to) return;
      f.section.blocks.splice(f.index, 1);
      const at = f.section === to && f.index < index ? index - 1 : index;
      to.blocks.splice(Math.max(0, Math.min(at, to.blocks.length)), 0, f.block);
    });
  /** Up or down one place; at the edge of a section it moves into the next one on the same page. */
  const nudge = (blockId: string, dir: -1 | 1) =>
    change((d) => {
      const f = findBlock(d.doc, blockId);
      if (!f) return;
      const si = f.page.sections.indexOf(f.section);
      const target = f.index + dir;
      if (target >= 0 && target < f.section.blocks.length) {
        f.section.blocks.splice(f.index, 1);
        f.section.blocks.splice(target, 0, f.block);
      } else {
        const other = f.page.sections[si + dir];
        if (!other) return;
        f.section.blocks.splice(f.index, 1);
        if (dir === -1) other.blocks.push(f.block);
        else other.blocks.unshift(f.block);
      }
    });
  const duplicateBlock = (blockId: string) => {
    const f = findBlock(draft.doc, blockId);
    if (!f) return;
    const c = copyBlock(f.block);
    change((d) => findBlock(d.doc, blockId)?.section.blocks.splice(f.index + 1, 0, c));
    setSelected({ kind: "block", id: c.id });
  };
  const removeBlock = (blockId: string) => {
    change((d) => {
      const f = findBlock(d.doc, blockId);
      if (f) f.section.blocks.splice(f.index, 1);
    });
    setSelected({ kind: "guide" });
  };
  const addSection = (pid: string, index: number) => {
    const sid = rid("s");
    updatePage(pid, (p) => void p.sections.splice(index, 0, { id: sid, title: "", blocks: [newBlock("text")] }));
    setSelected({ kind: "section", id: sid });
  };
  const moveSection = (sid: string, dir: -1 | 1) =>
    change((d) => {
      const f = findSection(d.doc, sid);
      if (!f) return;
      const j = f.index + dir;
      if (j < 0 || j >= f.page.sections.length) return;
      f.page.sections.splice(f.index, 1);
      f.page.sections.splice(j, 0, f.section);
    });
  const removeSection = (sid: string) => {
    change((d) => {
      const f = findSection(d.doc, sid);
      if (f) f.page.sections.splice(f.index, 1);
    });
    setSelected({ kind: "guide" });
  };

  // ---- Pages ---------------------------------------------------------------------------------------
  const addPage = (t: TemplateChoice, at = pages.length) => {
    const p = templatePage(t, rid);
    change((d) => void d.doc.pages.splice(at, 0, p));
    return p.id;
  };
  const duplicatePage = (pid: string) => {
    const i = pages.findIndex((p) => p.id === pid);
    if (i < 0) return;
    const c = copyPage(pages[i]);
    change((d) => void d.doc.pages.splice(i + 1, 0, c));
  };
  const removePage = (pid: string) => {
    if (pages.length <= 1) return;
    change((d) => {
      d.doc.pages = d.doc.pages.filter((p) => p.id !== pid);
    });
    if (view.kind === "page" && view.id === pid) open({ kind: "outline" });
  };
  const movePage = (pid: string, dir: -1 | 1) =>
    change((d) => {
      const i = d.doc.pages.findIndex((p) => p.id === pid);
      const j = i + dir;
      if (i < 0 || j < 0 || j >= d.doc.pages.length) return;
      const [p] = d.doc.pages.splice(i, 1);
      d.doc.pages.splice(j, 0, p);
    });
  /** Everything from this section on becomes a new page after this one; nothing is lost. */
  const splitPage = (sid: string) => {
    const f = findSection(draft.doc, sid);
    if (!f || f.index === 0) return;
    const nid = rid("page");
    change((d) => {
      const g = findSection(d.doc, sid);
      if (!g) return;
      const rest = g.page.sections.splice(g.index);
      d.doc.pages.splice(d.doc.pages.indexOf(g.page) + 1, 0, {
        id: nid,
        title: g.section.title,
        purpose: "",
        template: g.page.template,
        kind: g.page.kind,
        required: g.page.required,
        sections: rest,
      });
    });
    open({ kind: "page", id: nid });
  };

  /** A page Claude drafted: it takes the place of the untouched starting page, or goes at the end. One change, so Undo removes it. */
  const addDraftedPage = (p: Page) =>
    change((d) => {
      if (isStarter(d.doc)) d.doc.pages = [p];
      else d.doc.pages.push(p);
      // A page drafted with its Audio Guide script turns the Audio Guide on (it plays automatically once approved and recorded).
      if (p.narration && !d.doc.audio) d.doc.audio = structuredClone(DEFAULT_AUDIO);
    });

  /** Changes from Revise with AI, applied as one change so Undo reverses them together. */
  const applyRevision = (changes: RevisionChange[]) => {
    change((d) => {
      for (const c of changes) {
        if (c.kind === "edit") {
          const i = d.doc.pages.findIndex((p) => p.id === c.pageId);
          if (i >= 0) d.doc.pages[i] = structuredClone(c.page);
        } else if (c.kind === "remove") {
          if (d.doc.pages.length > 1) d.doc.pages = d.doc.pages.filter((p) => p.id !== c.pageId);
        } else if (!d.doc.pages.some((p) => p.id === c.page.id)) {
          const after = c.after ? d.doc.pages.findIndex((p) => p.id === c.after) : -1;
          d.doc.pages.splice(c.after ? (after < 0 ? d.doc.pages.length : after + 1) : 0, 0, structuredClone(c.page));
        }
      }
    });
    // The page's rich text is drawn again with the new words.
    setRound((r) => r + 1);
    if (view.kind === "page" && changes.some((c) => c.kind === "remove" && c.pageId === view.id)) open({ kind: "outline" });
  };
  const canRevise = !isStarter(draft.doc) && pages.some((p) => p.kind === "content" && p.sections.some((s) => s.blocks.length));

  const act = async (action: "archive" | "restore" | "duplicate") => {
    if (
      action === "archive" &&
      !(await confirmAction(
        "Learners won’t see it any more and it leaves the Magazine list. Their progress and completions are kept, and you can restore it from Deleted guides and courses.",
        { title: `Delete “${draft.title || "Untitled guide"}”?`, confirmLabel: pages.length > 1 ? "Delete course" : "Delete guide", danger: true },
      ))
    )
      return;
    await flush();
    const out = await api<{ guide: AuthorGuide }>(`/api/admin/magazine/${id}`, { body: { action } });
    // Deleted: back to the list, where it can be restored.
    if (action === "archive") router.push("/admin/magazine");
    else if (action === "duplicate") router.push(`/admin/magazine/${out.guide.id}`);
    else setServer(out.guide);
  };

  const status = { ...server, changed: dirty || server.changed };
  const blockSel = selected.kind === "block" ? findBlock(draft.doc, selected.id) : null;
  const sectionSel = selected.kind === "section" ? findSection(draft.doc, selected.id) : null;
  const pageIndex = page ? pages.indexOf(page) : -1;

  // Selecting a block or section brings its settings into view in the sidebar.
  const selectedKey = selected.kind === "guide" ? null : selected.id;
  useEffect(() => {
    if (selectedKey) requestAnimationFrame(() => document.getElementById("selection-settings")?.scrollIntoView({ block: "nearest", behavior: "smooth" }));
  }, [selectedKey]);

  /** Settings for what's selected on the page: a block or a section. */
  const selection = blockSel ? (
    <BlockSettings
      key={blockSel.block.id}
      block={blockSel.block}
      doc={draft.doc}
      update={updateBlock}
      onDone={() => setSelected({ kind: "guide" })}
      onDuplicate={() => duplicateBlock(blockSel.block.id)}
      onRemove={() => removeBlock(blockSel.block.id)}
    />
  ) : sectionSel ? (
    <Panel title="Section" onDone={() => setSelected({ kind: "guide" })}>
      <p className="text-sm text-ink-muted">Sections show in the page’s index. Click the title on the page to rename it.</p>
      <p className="text-sm">
        {sectionSel.section.blocks.length} {sectionSel.section.blocks.length === 1 ? "block" : "blocks"}
      </p>
      <button type="button" className={btn.secondary} onClick={() => addSection(sectionSel.page.id, sectionSel.index + 1)}>
        <Icon name="plus" className="size-4" /> Add a section after this
      </button>
      {sectionSel.index > 0 && (
        <button type="button" className={btn.secondary} onClick={() => splitPage(sectionSel.section.id)}>
          <Icon name="layers" className="size-4" /> Split the page here
        </button>
      )}
      <button type="button" className={btn.danger} onClick={() => removeSection(sectionSel.section.id)}>
        <Icon name="trash" className="size-4" /> Delete section
      </button>
    </Panel>
  ) : null;

  return (
    <AdminShell title={pages.length > 1 ? "Edit course" : "Edit guide"} back={{ href: "/admin/magazine", label: "Magazine" }}>
      {/* The bar: where it stands, undo and redo, preview and publish. */}
      <div className="sticky top-16 z-20 -mx-2 flex flex-wrap items-center gap-2 rounded-2xl bg-surface/95 px-2 py-2 shadow-sm ring-1 ring-line backdrop-blur">
        {statusBadge(status)}
        <span className="mr-auto" />
        <button type="button" className={btn.quiet} onClick={undo} disabled={!hist.past.length} title="Undo (Ctrl+Z)">
          <Icon name="refresh" className="size-4 -scale-x-100" /> Undo
        </button>
        <button type="button" className={btn.quiet} onClick={redo} disabled={!hist.future.length} title="Redo (Ctrl+Y)">
          <Icon name="refresh" className="size-4" /> Redo
        </button>
        <button
          type="button"
          className={btn.secondary}
          onClick={async () => {
            await flush();
            setPreviewing(true);
          }}
        >
          <Icon name="eye" className="size-4" /> Preview
        </button>
        {server.status !== "archived" && (
          <button type="button" className={btn.primary} onClick={() => setPublishing(true)} disabled={!status.changed || save.state === "saving"}>
            <Icon name="arrow-right" className="size-4" /> {status.changed ? "Review and publish" : "Published"}
          </button>
        )}
      </div>
      <p className="mt-2 flex flex-wrap items-center gap-x-3 text-sm text-ink-muted" role="status">
        <Icon name="info" className="inline size-4" />
        {save.state === "saving"
          ? "Saving…"
          : save.state === "error"
            ? `Not saved: ${save.error}`
            : dirty
              ? "Saving your changes…"
              : server.publishedNumber
                ? server.changed
                  ? `All changes saved at ${savedTime(server.savedAt)}. Learners still read edition ${server.publishedNumber} until you publish.`
                  : `All changes saved. Learners are reading edition ${server.publishedNumber}.`
                : `All changes saved at ${savedTime(server.savedAt)}. Learners won’t see this until it’s published.`}
        {save.state === "error" && (
          <button type="button" className="font-semibold text-accent hover:underline" onClick={() => void flush()}>
            Try again
          </button>
        )}
      </p>
      {save.state === "conflict" && (
        // Another tab (or person) saved since this editor opened the course: nothing is saved over it without asking.
        <div
          role="alert"
          className="mt-3 flex flex-wrap items-center gap-3 rounded-2xl border-2 border-danger bg-[#fdf1f0] px-4 py-3 text-sm dark:bg-[#3a1f1f]"
        >
          <Icon name="alert" className="size-5 shrink-0 text-danger" />
          <p className="min-w-0 flex-1">
            <strong>Not saved: this course was changed in another tab or by someone else.</strong> Load the latest to carry on from it (your unsaved changes
            here are dropped), or keep yours to replace it.
          </p>
          <button
            type="button"
            className={btn.primary}
            onClick={() => {
              try {
                localStorage.removeItem(storeKey(id));
              } catch {}
              window.location.reload();
            }}
          >
            Load the latest
          </button>
          <button
            type="button"
            className={btn.quiet}
            onClick={async () => {
              if (
                await confirmAction("The other changes are replaced by what’s in this tab. Undo here won’t bring them back.", {
                  title: "Keep this tab’s version?",
                  confirmLabel: "Keep mine",
                  danger: true,
                })
              )
                void flush(true);
            }}
          >
            Keep mine
          </button>
        </div>
      )}
      {recovered && (
        <div role="alert" className="mt-3 flex flex-wrap items-center gap-3 rounded-2xl border-2 border-gold bg-gold/15 px-4 py-3 text-sm">
          <Icon name="alert" className="size-5 shrink-0" />
          <p className="min-w-0 flex-1">
            <strong>Unsaved changes found.</strong> This browser kept changes to this guide that didn’t reach the Hub.
          </p>
          <button
            type="button"
            className={btn.primary}
            onClick={() => {
              const r = recovered;
              change((d) => Object.assign(d, structuredClone(r)));
              setRound((x) => x + 1);
              setRecovered(null);
            }}
          >
            Restore them
          </button>
          <button
            type="button"
            className={btn.secondary}
            onClick={() => {
              try {
                localStorage.removeItem(storeKey(id));
              } catch {}
              setRecovered(null);
            }}
          >
            Discard
          </button>
        </div>
      )}
      {publishing && (
        <MagazineApproval
          guideId={id}
          dirty={dirty}
          save={() => flush()}
          onPublished={(g) => setServer(g as AuthorGuide)}
          onClose={() => setPublishing(false)}
          onShowBlock={(pageId, blockId) => {
            open({ kind: "page", id: pageId });
            setSelected({ kind: "block", id: blockId });
            window.setTimeout(() => document.getElementById(`block-${blockId}`)?.scrollIntoView({ behavior: "smooth", block: "center" }), 150);
          }}
        />
      )}

      {/* Pages: the course outline, then each page. Always here, so you can move between pages. */}
      <nav aria-label="Pages" className="mt-4 flex gap-2 overflow-x-auto pb-1">
        <button
          type="button"
          aria-current={!page ? "page" : undefined}
          onClick={() => open({ kind: "outline" })}
          className={cx(
            "inline-flex min-h-10 shrink-0 items-center gap-1.5 rounded-full px-4 text-sm font-semibold",
            !page ? "bg-action text-on-action" : "border border-line-strong hover:bg-muted",
          )}
        >
          <Icon name="list" className="size-4" /> Course outline
        </button>
        {pages.map((p, i) => (
          <button
            key={p.id}
            type="button"
            aria-current={page?.id === p.id ? "page" : undefined}
            onClick={() => open({ kind: "page", id: p.id })}
            className={cx(
              "inline-flex min-h-10 max-w-64 shrink-0 items-center gap-1.5 rounded-full px-4 text-sm font-semibold",
              page?.id === p.id ? "bg-action text-on-action" : "border border-line-strong hover:bg-muted",
            )}
          >
            <span className="tabular-nums opacity-70">{i + 1}</span>
            <span className="truncate">{p.title || (pages.length === 1 ? draft.title || "The page" : "Untitled page")}</span>
          </button>
        ))}
        <button type="button" onClick={() => open({ kind: "outline" })} className={cx(btn.quiet, "shrink-0")} title="Add a page from the course outline">
          <Icon name="plus" className="size-4" /> Add page
        </button>
      </nav>

      <div
        className={cx("mt-4 grid gap-6", page ? "lg:grid-cols-[minmax(0,1fr)_17rem] xl:grid-cols-[minmax(0,1fr)_20rem]" : "lg:grid-cols-[minmax(0,1fr)_20rem]")}
      >
        {/* On a page, everything is in the sidebar on the right: blocks to add, what's selected, the page and the course. */}
        {page && (
          <div className="flex flex-col gap-4 lg:sticky lg:top-36 lg:order-last lg:max-h-[calc(100vh-10rem)] lg:self-start lg:overflow-y-auto lg:px-2 lg:py-2 lg:pr-4">
            <BlockPalette onAdd={addBlockHere} onDragStart={(t) => setDragging(`new:${t}`)} onDragEnd={() => setDragging(null)} />
            {selection && (
              <div id="selection-settings" className="scroll-mt-4">
                {selection}
              </div>
            )}
            <PageSettings page={page} pages={pages} updatePage={updatePage} onDuplicate={() => duplicatePage(page.id)} onRemove={() => removePage(page.id)} />
            <GuideSettings guide={server} draft={draft} change={change} onAct={act} />
            <AudioGuidePanel draft={draft} change={change} onOpenReview={() => setNarrating(true)} />
          </div>
        )}
        {!page ? (
          <Outline
            draft={draft}
            server={server}
            change={change}
            updatePage={updatePage}
            onOpen={(pid) => open({ kind: "page", id: pid })}
            onAdd={(t) => open({ kind: "page", id: addPage(t) })}
            onMove={movePage}
            onDuplicate={duplicatePage}
            onRemove={removePage}
            ai={
              <>
                <MagazineAi guideId={id} onAddPage={addDraftedPage} startOpen={startAi || isStarter(initial.doc)} />
                {canRevise && (
                  <MagazineRevise guideId={id} doc={draft.doc} scope="course" onApply={applyRevision} onShow={(pid) => open({ kind: "page", id: pid })} />
                )}
              </>
            }
          />
        ) : (
          <div className="flex min-w-0 flex-col gap-4">
            {page.kind === "content" && canRevise && (
              <MagazineRevise
                key={page.id}
                guideId={id}
                doc={draft.doc}
                scope={page.id}
                onApply={applyRevision}
                onShow={(pid) => open({ kind: "page", id: pid })}
              />
            )}
            {/* The page, as learners will see it. */}
            <div
              className="min-w-0 rounded-3xl bg-bg p-4 ring-1 ring-line sm:p-8"
              onMouseDown={(e) => e.target === e.currentTarget && setSelected({ kind: "guide" })}
            >
              {pages.length === 1 ? (
                <CourseHeader draft={draft} change={change} onSelect={() => setSelected({ kind: "guide" })} />
              ) : (
                <header className="grid items-end gap-6 xl:grid-cols-[minmax(0,1fr)_minmax(0,1fr)]" onFocusCapture={() => setSelected({ kind: "guide" })}>
                  <div>
                    <p className="font-mulish text-xs font-extrabold uppercase tracking-[0.14em] text-accent">
                      Page {pageIndex + 1} of {pages.length} · {page.kind === "assessment" ? "Assessment" : PAGE_TEMPLATES[page.template].label}
                      {!page.required && " · Optional"}
                    </p>
                    <InlineText
                      key={`${page.id}:title:${round}`}
                      value={page.title}
                      onChange={(v) => updatePage(page.id, (p) => void (p.title = v), `${page.id}:title`)}
                      placeholder="Page title"
                      className="mt-2 font-serif text-4xl font-semibold leading-[1.1] tracking-tight"
                    />
                    <InlineText
                      key={`${page.id}:purpose:${round}`}
                      value={page.purpose}
                      onChange={(v) => updatePage(page.id, (p) => void (p.purpose = v), `${page.id}:purpose`)}
                      placeholder="This page’s purpose: what the learner will do here"
                      multiline
                      className="mt-4 text-xl leading-relaxed text-ink-muted"
                    />
                    <p className="mt-4 flex items-center gap-1.5 text-sm text-ink-muted">
                      <Icon name="clock" className="size-4" /> About {pageMinutes(page)} min
                    </p>
                  </div>
                  <ImageDropZone
                    picture={page.hero?.src ? { src: page.hero.src, width: 1600, height: 900 } : undefined}
                    onChange={(p) => updatePage(page.id, (x) => void (x.hero = p ? { src: p.src, alt: "", decorative: true } : undefined))}
                    label="Drag a picture for the top of this page (optional)"
                    addLabel="Add page picture"
                    aspect="aspect-[16/9]"
                  />
                </header>
              )}

              {page.kind === "content" && draft.doc.audio?.levels.pages && (
                <div className="mt-8">
                  <PageNarrationStrip key={page.id} guideId={id} draft={draft} change={change} page={page} />
                </div>
              )}
              <div className="mt-10 flex flex-col gap-14">
                {page.sections.map((s, si) => (
                  <section key={s.id} id={`edit-${s.id}`} className="flex flex-col gap-2">
                    <div
                      className={cx(
                        "group/s relative rounded-2xl p-2",
                        selected.kind === "section" && selected.id === s.id ? "ring-2 ring-action" : "hover:ring-1 hover:ring-line-strong",
                      )}
                      onFocusCapture={() => setSelected({ kind: "section", id: s.id })}
                      onMouseDown={() => setSelected({ kind: "section", id: s.id })}
                    >
                      <div className={column}>
                        <p className="font-mulish text-xs font-extrabold uppercase tracking-[0.14em] text-ink-muted">{String(si + 1).padStart(2, "0")}</p>
                        <InlineText
                          value={s.title}
                          onChange={(v) => change((d) => void (findSection(d.doc, s.id)!.section.title = v), `section:${s.id}`)}
                          placeholder="Section title"
                          className="mt-1 font-serif text-3xl font-semibold tracking-tight"
                        />
                      </div>
                      {selected.kind === "section" && selected.id === s.id && (
                        <Toolbar label="Section">
                          <ToolButton icon="arrow-left" label="Move section up" rotate onClick={() => moveSection(s.id, -1)} disabled={si === 0} />
                          <ToolButton
                            icon="arrow-right"
                            label="Move section down"
                            rotate
                            onClick={() => moveSection(s.id, 1)}
                            disabled={si === page.sections.length - 1}
                          />
                          {si > 0 && (
                            <ToolButton
                              icon="layers"
                              label="Split the page here: this section and the ones after it become a new page"
                              onClick={() => splitPage(s.id)}
                            />
                          )}
                          <ToolButton icon="trash" label="Delete section" onClick={() => removeSection(s.id)} />
                        </Toolbar>
                      )}
                    </div>
                    <InsertPoint onAdd={(t) => addBlock(s.id, 0, t)} dragging={dragging} onDrop={() => dropAt(s.id, 0)} />
                    {s.blocks.map((b, bi) => (
                      <div key={b.id} className="flex flex-col gap-2">
                        <BlockFrame
                          block={b}
                          selected={selected.kind === "block" && selected.id === b.id}
                          onSelect={() => setSelected({ kind: "block", id: b.id })}
                          onUp={() => nudge(b.id, -1)}
                          onDown={() => nudge(b.id, 1)}
                          onDuplicate={() => duplicateBlock(b.id)}
                          onRemove={() => removeBlock(b.id)}
                          onConvert={(to) => convertInPlace(updateBlock, b.id, to)}
                          onCrop={(src) => updateBlock<Extract<Block, { type: "image" | "textMedia" }>>(b.id, (x) => void (x.media.src = src))}
                          onDragStart={() => setDragging(b.id)}
                          onDragEnd={() => setDragging(null)}
                        >
                          <BlockEdit key={`${b.id}:${round}`} block={b} update={updateBlock} paths={paths} />
                        </BlockFrame>
                        <InsertPoint onAdd={(t) => addBlock(s.id, bi + 1, t)} dragging={dragging} onDrop={() => dropAt(s.id, bi + 1)} />
                      </div>
                    ))}
                  </section>
                ))}
                <button type="button" className={cx(btn.secondary, "self-center")} onClick={() => addSection(page.id, page.sections.length)}>
                  <Icon name="plus" className="size-4" /> Add section
                </button>
                {pages.length > 1 && (
                  <div className="flex flex-wrap justify-between gap-2 border-t border-line pt-6">
                    {pageIndex > 0 ? (
                      <button type="button" className={btn.secondary} onClick={() => open({ kind: "page", id: pages[pageIndex - 1].id })}>
                        <Icon name="arrow-left" className="size-4" /> Previous page
                      </button>
                    ) : (
                      <span />
                    )}
                    {pageIndex < pages.length - 1 && (
                      <button type="button" className={btn.secondary} onClick={() => open({ kind: "page", id: pages[pageIndex + 1].id })}>
                        Next page <Icon name="arrow-right" className="size-4" />
                      </button>
                    )}
                  </div>
                )}
              </div>
            </div>
          </div>
        )}

        {/* On the course outline: the course's settings, or what's selected. */}
        {!page && (
          <aside
            aria-label="Settings"
            className="flex flex-col gap-4 lg:sticky lg:top-36 lg:max-h-[calc(100vh-10rem)] lg:self-start lg:overflow-y-auto lg:px-2 lg:py-2 lg:pr-4"
          >
            {selection ?? (
              <>
                <GuideSettings guide={server} draft={draft} change={change} onAct={act} />
                <AudioGuidePanel draft={draft} change={change} onOpenReview={() => setNarrating(true)} />
              </>
            )}
          </aside>
        )}
      </div>
      {narrating && <NarrationReview guideId={id} draft={draft} change={change} onClose={() => setNarrating(false)} />}
      {previewing && (
        <PreviewDialog id={id} pageId={page && pages.length > 1 ? page.id : undefined} savedAt={server.savedAt} onClose={() => setPreviewing(false)} />
      )}
    </AdminShell>
  );
}

/** The course's title, summary and cover, edited in place (the top of a one-page guide, or of the outline). */
function CourseHeader({ draft, change, onSelect }: { draft: Draft; change: (fn: (d: Draft) => void, tag?: string) => void; onSelect?: () => void }) {
  const course = draft.doc.pages.length > 1;
  return (
    <header className="grid items-end gap-6 xl:grid-cols-[minmax(0,1fr)_minmax(0,1fr)]">
      <div onFocusCapture={onSelect}>
        <p className="font-mulish text-xs font-extrabold uppercase tracking-[0.14em] text-accent">
          {course ? `Course · ${draft.doc.pages.length} pages` : "Guide"}
          {draft.audience.length > 0 && <> · For {audiencePhrase(draft.audience)}</>}
        </p>
        <InlineText
          value={draft.title}
          onChange={(v) => change((d) => void (d.title = v), "title")}
          placeholder={course ? "Course title" : "Guide title"}
          className="mt-2 font-serif text-4xl font-semibold leading-[1.1] tracking-tight"
        />
        <InlineText
          value={draft.standfirst}
          onChange={(v) => change((d) => void (d.standfirst = v), "standfirst")}
          placeholder="What learners will be able to do at the end"
          multiline
          className="mt-4 text-xl leading-relaxed text-ink-muted"
        />
        <p className="mt-4 flex items-center gap-1.5 text-sm text-ink-muted">
          <Icon name="clock" className="size-4" /> About {readingMinutes(draft.doc)} min {course ? "in all" : "read"}
        </p>
      </div>
      <ImageDropZone
        picture={draft.cover ? { src: draft.cover, width: 1600, height: 900 } : undefined}
        onChange={(p) => change((d) => void (d.cover = p?.src ?? null))}
        label="Drag a cover picture here"
        addLabel="Add cover picture"
        aspect="aspect-[16/9]"
      />
    </header>
  );
}

/** The course outline: every page with its purpose, teaching pattern, time and whether it's required, and adding pages. */
function Outline({
  draft,
  server,
  change,
  updatePage,
  onOpen,
  onAdd,
  onMove,
  onDuplicate,
  onRemove,
  ai,
}: {
  draft: Draft;
  server: AuthorGuide;
  change: (fn: (d: Draft) => void, tag?: string) => void;
  updatePage: (pid: string, fn: (p: Page) => void, tag?: string) => void;
  onOpen: (pid: string) => void;
  onAdd: (t: TemplateChoice) => void;
  onMove: (pid: string, dir: -1 | 1) => void;
  onDuplicate: (pid: string) => void;
  onRemove: (pid: string) => void;
  /** Draft with AI. */
  ai: React.ReactNode;
}) {
  const [template, setTemplate] = useState<TemplateChoice>("do");
  const pages = draft.doc.pages;
  return (
    <div className="flex min-w-0 flex-col gap-8 rounded-3xl bg-bg p-4 ring-1 ring-line sm:p-8">
      <CourseHeader draft={draft} change={change} />
      {ai}
      <section aria-labelledby="outline-h">
        <h2 id="outline-h" className="font-serif text-2xl font-semibold">
          Course outline
        </h2>
        <p className="mt-1 text-sm text-ink-muted">
          Each page has its own purpose and teaching pattern. Learners can move between pages; optional pages don’t hold up completion. A one-page guide becomes
          a course when you add a page, keeping its address and records.
        </p>
        <ol className="mt-5 flex flex-col gap-3">
          {pages.map((p, i) => (
            <li key={p.id} className="flex flex-col gap-3 rounded-2xl border border-line bg-surface p-4 sm:flex-row sm:items-start">
              <span className="grid size-10 shrink-0 place-items-center rounded-full bg-tealtint font-mulish text-sm font-extrabold" aria-hidden>
                {i + 1}
              </span>
              <div className="flex min-w-0 flex-1 flex-col gap-2">
                <InlineText
                  value={p.title}
                  onChange={(v) => updatePage(p.id, (x) => void (x.title = v), `${p.id}:title`)}
                  placeholder={pages.length === 1 ? "Page title (optional for a one-page guide)" : "Page title"}
                  className="font-serif text-xl font-semibold"
                />
                <InlineText
                  value={p.purpose}
                  onChange={(v) => updatePage(p.id, (x) => void (x.purpose = v), `${p.id}:purpose`)}
                  placeholder="Its purpose: what the learner will do on this page"
                  multiline
                  className="text-ink-muted"
                />
                <div className="flex flex-wrap items-center gap-x-4 gap-y-2 text-sm">
                  {p.kind === "assessment" ? (
                    <Badge tone="info">Assessment: the Hub’s quiz</Badge>
                  ) : (
                    <label className="flex items-center gap-1.5">
                      <span className="text-ink-muted">Teaching pattern</span>
                      <select
                        className="min-h-9 rounded-lg border border-line-strong bg-surface px-2"
                        value={p.template}
                        onChange={(e) => updatePage(p.id, (x) => void (x.template = e.target.value as PageTemplate))}
                      >
                        {(Object.keys(PAGE_TEMPLATES) as PageTemplate[]).map((t) => (
                          <option key={t} value={t}>
                            {PAGE_TEMPLATES[t].label}: {PAGE_TEMPLATES[t].title}
                          </option>
                        ))}
                      </select>
                    </label>
                  )}
                  <label className="flex items-center gap-1.5">
                    <input
                      type="checkbox"
                      className="size-4 accent-[var(--color-action)]"
                      checked={p.required}
                      onChange={(e) => updatePage(p.id, (x) => void (x.required = e.target.checked))}
                    />
                    Required
                  </label>
                  <span className="text-ink-muted">
                    {pageMinutes(p)} min · {p.sections.length} {p.sections.length === 1 ? "section" : "sections"}
                  </span>
                  {server.publishedNumber && server.finishes[p.id] !== undefined && <span className="text-ink-muted">{server.finishes[p.id]} finished</span>}
                </div>
              </div>
              <div className="flex shrink-0 flex-wrap items-center gap-1">
                <button type="button" className={btn.secondary} onClick={() => onOpen(p.id)}>
                  <Icon name="pen" className="size-4" /> Edit page
                </button>
                <ToolButton icon="arrow-left" label="Move page up" rotate onClick={() => onMove(p.id, -1)} disabled={i === 0} />
                <ToolButton icon="arrow-right" label="Move page down" rotate onClick={() => onMove(p.id, 1)} disabled={i === pages.length - 1} />
                <ToolButton icon="copy" label="Duplicate page" onClick={() => onDuplicate(p.id)} />
                <ToolButton icon="trash" label="Delete page" onClick={() => onRemove(p.id)} disabled={pages.length <= 1} />
              </div>
            </li>
          ))}
        </ol>
        <p className="mt-2 text-xs text-ink-muted">Changing a page’s teaching pattern changes its label only; its content stays as it is.</p>
      </section>
      <section aria-labelledby="add-page-h" className="flex flex-col gap-4 rounded-2xl border border-dashed border-line-strong p-4 sm:p-5">
        <h2 id="add-page-h" className="font-serif text-xl font-semibold">
          Add a page
        </h2>
        <TemplatePicker value={template} onChange={setTemplate} assessment name="add-page-template" />
        <button type="button" className={cx(btn.primary, "self-start")} onClick={() => onAdd(template)}>
          <Icon name="plus" className="size-4" /> Add page
        </button>
      </section>
    </div>
  );
}

/** The page being edited: its teaching pattern, whether it's required, and duplicating or deleting it. */
function PageSettings({
  page,
  pages,
  updatePage,
  onDuplicate,
  onRemove,
}: {
  page: Page;
  pages: Page[];
  updatePage: (pid: string, fn: (p: Page) => void, tag?: string) => void;
  onDuplicate: () => void;
  onRemove: () => void;
}) {
  return (
    <Panel title={`Page ${pages.indexOf(page) + 1}`}>
      {page.kind === "assessment" ? (
        <p className="text-sm text-ink-muted">An assessment page: add the learning path whose quiz it uses. Learners finish it by passing the quiz.</p>
      ) : (
        <Field label="Teaching pattern" hint="What the learner should be able to do on this page. Changing it changes the label, not the content.">
          <select className={input} value={page.template} onChange={(e) => updatePage(page.id, (x) => void (x.template = e.target.value as PageTemplate))}>
            {(Object.keys(PAGE_TEMPLATES) as PageTemplate[]).map((t) => (
              <option key={t} value={t}>
                {PAGE_TEMPLATES[t].label}: {PAGE_TEMPLATES[t].title}
              </option>
            ))}
          </select>
        </Field>
      )}
      <label className="flex items-center gap-2 text-sm">
        <input
          type="checkbox"
          className="size-4 accent-[var(--color-action)]"
          checked={page.required}
          onChange={(e) => updatePage(page.id, (x) => void (x.required = e.target.checked))}
        />
        Required to complete the course
      </label>
      <label className="flex items-start gap-2 text-sm">
        <input
          type="checkbox"
          className="mt-0.5 size-4 accent-[var(--color-action)]"
          checked={page.allActivities !== false}
          onChange={(e) => updatePage(page.id, (x) => (e.target.checked ? void delete x.allActivities : void (x.allActivities = false)))}
        />
        <span>
          Readers work through every activity first
          <span className="block text-xs text-ink-muted">
            Finish this page and Next stay locked until they’ve done each activity: every card flipped, tab and fold opened, question answered, video watched.
          </span>
        </span>
      </label>
      <div className="flex flex-wrap gap-2">
        <button type="button" className={btn.secondary} onClick={onDuplicate}>
          <Icon name="copy" className="size-4" /> Duplicate page
        </button>
        {pages.length > 1 && (
          <button type="button" className={btn.danger} onClick={onRemove}>
            <Icon name="trash" className="size-4" /> Delete page
          </button>
        )}
      </div>
    </Panel>
  );
}

// ---------------------------------------------------------------------------------------------------
// Editing on the page
// ---------------------------------------------------------------------------------------------------

/** Plain text typed straight onto the page (titles, captions, answers). Enter finishes unless it's multiline. */
function Toolbar({ label, children }: { label: string; children: React.ReactNode }) {
  return (
    <div
      role="toolbar"
      aria-label={label}
      className="absolute -top-5 right-3 z-10 flex items-center gap-0.5 rounded-full bg-surface p-1 shadow-md ring-1 ring-line"
    >
      {children}
    </div>
  );
}

/** Changes a block into another kind in place (same id, so it stays put and stays selected); Undo reverses it. */
function convertInPlace(update: Update, id: string, to: ConvertibleType) {
  update<Block>(id, (x) => {
    if (!canConvert(x) || x.type === to) return;
    const next = convertBlock(x, to) as unknown as Record<string, unknown>;
    const target = x as unknown as Record<string, unknown>;
    for (const k of Object.keys(target)) delete target[k];
    Object.assign(target, next);
  });
}

/** The toolbar's Change block type menu: each kind it can become, and what it would leave behind. */
function ChangeTypeMenu({ block: b, onConvert }: { block: Block; onConvert: (to: ConvertibleType) => void }) {
  const [open, setOpen] = useState(false);
  if (!canConvert(b)) return null;
  return (
    <div
      className="relative"
      onBlur={(e) => !e.currentTarget.contains(e.relatedTarget as Node | null) && setOpen(false)}
      onKeyDown={(e) => e.key === "Escape" && setOpen(false)}
    >
      <button
        type="button"
        aria-label="Change block type"
        title="Change block type"
        aria-haspopup="menu"
        aria-expanded={open}
        onClick={() => setOpen((o) => !o)}
        className={cx("grid size-9 place-items-center rounded-full text-ink-muted hover:bg-muted hover:text-ink", open && "bg-muted text-ink")}
      >
        <Icon name="refresh" className="size-4" />
      </button>
      {open && (
        <div role="menu" aria-label="Change to" className="absolute right-0 top-11 z-30 w-72 rounded-2xl bg-surface p-1.5 shadow-xl ring-1 ring-line">
          <p className="px-2.5 pb-1 pt-1.5 text-xs font-semibold uppercase tracking-wide text-ink-muted">Change to</p>
          {CONVERTIBLE.filter((t) => t !== b.type).map((t) => {
            const lost = convertLoses(b, t);
            return (
              <button
                key={t}
                type="button"
                role="menuitem"
                onClick={() => {
                  onConvert(t);
                  setOpen(false);
                }}
                className="flex w-full items-start gap-2.5 rounded-xl px-2.5 py-2 text-left text-sm hover:bg-muted"
              >
                <Icon name={BLOCK_ICONS[t]} className="mt-0.5 size-4 shrink-0 text-accent" />
                <span>
                  <span className="font-semibold">{BLOCK_LABELS[t]}</span>
                  {lost.length > 0 && <span className="block text-xs text-ink-muted">Leaves {lost.join(", ")}</span>}
                </span>
              </button>
            );
          })}
          <p className="px-2.5 pb-1.5 pt-1 text-xs text-ink-muted">Your words come with it. Undo changes it back.</p>
        </div>
      )}
    </div>
  );
}

function ToolButton({ icon, label, onClick, disabled, rotate }: { icon: IconName; label: string; onClick: () => void; disabled?: boolean; rotate?: boolean }) {
  return (
    <button
      type="button"
      aria-label={label}
      title={label}
      onClick={onClick}
      disabled={disabled}
      className="grid size-9 place-items-center rounded-full text-ink-muted hover:bg-muted hover:text-ink disabled:opacity-30"
    >
      <Icon name={icon} className={cx("size-4", rotate && "rotate-90")} />
    </button>
  );
}

/** Around each block: an outline when selected, its toolbar, and what reviewers flagged on it. */
function BlockFrame({
  block: b,
  selected,
  onSelect,
  onUp,
  onDown,
  onDuplicate,
  onRemove,
  onConvert,
  onCrop,
  onDragStart,
  onDragEnd,
  children,
}: {
  block: Block;
  selected: boolean;
  onSelect: () => void;
  onUp: () => void;
  onDown: () => void;
  onDuplicate: () => void;
  onRemove: () => void;
  onConvert: (to: ConvertibleType) => void;
  /** Puts a cropped copy of the block's picture in its place. */
  onCrop: (src: string) => void;
  onDragStart: () => void;
  onDragEnd: () => void;
  children: React.ReactNode;
}) {
  // The picture the toolbar can crop: a picture block's, or text and media's when it shows a picture.
  const cropSrc = b.type === "image" || (b.type === "textMedia" && !b.video) ? b.media.src : "";
  const [cropping, setCropping] = useState(false);
  const marks = [
    b.flag?.kind === "verify" && { text: "Needs verification", tone: "bad" as const },
    b.flag?.kind === "illustrative" && { text: "Illustrative", tone: "warn" as const },
    b.evidence?.length && { text: `${b.evidence.length} ${b.evidence.length === 1 ? "source" : "sources"}`, tone: "info" as const },
    b.note && { text: "Note", tone: "neutral" as const },
  ].filter((x): x is { text: string; tone: "bad" | "warn" | "info" | "neutral" } => Boolean(x));
  return (
    <div
      id={`block-${b.id}`}
      className={cx("relative scroll-mt-40 rounded-2xl p-2 transition-shadow", selected ? "ring-2 ring-action" : "hover:ring-1 hover:ring-line-strong")}
      onFocusCapture={onSelect}
      onMouseDown={onSelect}
    >
      {marks.length > 0 && (
        <div className="mb-2 flex flex-wrap gap-1.5">
          {marks.map((m) => (
            <Badge key={m.text} tone={m.tone}>
              {m.text}
            </Badge>
          ))}
        </div>
      )}
      {selected && (
        <Toolbar label={BLOCK_LABELS[b.type]}>
          <span
            draggable
            onDragStart={(e) => {
              e.dataTransfer.effectAllowed = "move";
              e.dataTransfer.setData("text/plain", b.id);
              onDragStart();
            }}
            onDragEnd={onDragEnd}
            className="flex cursor-grab items-center gap-1 rounded-full px-2 font-mulish text-xs font-bold text-ink-muted active:cursor-grabbing"
            title="Drag to move"
          >
            <Icon name="grip" className="size-4" /> {BLOCK_LABELS[b.type]}
          </span>
          <ToolButton icon="arrow-left" label="Move up" rotate onClick={onUp} />
          <ToolButton icon="arrow-right" label="Move down" rotate onClick={onDown} />
          {cropSrc && <ToolButton icon="crop" label="Crop the picture" onClick={() => setCropping(true)} />}
          <ChangeTypeMenu block={b} onConvert={onConvert} />
          <ToolButton icon="copy" label="Duplicate" onClick={onDuplicate} />
          <ToolButton icon="trash" label="Delete" onClick={onRemove} />
        </Toolbar>
      )}
      {children}
      {cropping && cropSrc && (
        <ImageCropper
          picture={{ src: cropSrc, width: 0, height: 0 }}
          onClose={() => setCropping(false)}
          onDone={(p) => {
            onCrop(p.src);
            setCropping(false);
          }}
        />
      )}
    </div>
  );
}

/**
  Every kind of block, down the left of the page like the Topics editor's card palette: click one to add
  it after the selected block (or at the end of the page), or drag it to the gap where it belongs.
*/
function BlockPalette({ onAdd, onDragStart, onDragEnd }: { onAdd: (t: PaletteItem) => void; onDragStart: (t: PaletteItem) => void; onDragEnd: () => void }) {
  const [category, setCategory] = useState(BLOCK_CATEGORIES[0].title);
  const [query, setQuery] = useState("");
  const q = query.trim().toLowerCase();
  // A search looks through every category.
  const shown = q
    ? BLOCK_CATEGORIES.flatMap((c) => c.types).filter((t) => `${ITEM_LABELS[t]} ${ITEM_HINTS[t]}`.toLowerCase().includes(q))
    : (BLOCK_CATEGORIES.find((c) => c.title === category)?.types ?? []);
  return (
    <aside aria-label="Add a block">
      <div className="flex flex-col gap-3 rounded-3xl bg-gold p-3 text-[#102a43] shadow-sm ring-1 ring-[#e0a12e] dark:ring-[#e0a12e]">
        <h2 className="px-1 font-semibold">Add a block</h2>
        <label className="relative block">
          <span className="sr-only">Search blocks</span>
          <Icon name="search" className="pointer-events-none absolute left-3 top-1/2 size-4 -translate-y-1/2 text-ink-muted" />
          <input
            type="search"
            value={query}
            onChange={(e) => setQuery(e.target.value)}
            placeholder="Search blocks…"
            className="min-h-10 w-full rounded-full border border-line-strong bg-surface pl-9 pr-3 text-sm"
          />
        </label>
        <div role="group" aria-label="Block categories" className={cx("flex flex-wrap gap-1.5", q && "opacity-50")}>
          {BLOCK_CATEGORIES.map((c) => (
            <button
              key={c.title}
              type="button"
              aria-pressed={!q && category === c.title}
              onClick={() => {
                setCategory(c.title);
                setQuery("");
              }}
              className={cx(
                "min-h-8 rounded-full border px-3 text-xs font-semibold",
                !q && category === c.title ? "border-ink bg-ink text-surface" : "border-line-strong bg-surface text-ink-muted hover:text-ink",
              )}
            >
              {c.title}
            </button>
          ))}
        </div>
        {shown.length ? (
          <ul className="grid grid-cols-2 gap-2 sm:grid-cols-3 lg:grid-cols-1" aria-live="polite">
            {shown.map((t) => (
              <li key={t}>
                <button
                  type="button"
                  draggable
                  onDragStart={(e) => {
                    e.dataTransfer.effectAllowed = "copy";
                    e.dataTransfer.setData("text/plain", `new:${t}`);
                    onDragStart(t);
                  }}
                  onDragEnd={onDragEnd}
                  onClick={() => onAdd(t)}
                  title={`${ITEM_HINTS[t]} Click to add it after the selected block, or drag it into place.`}
                  className="flex min-h-12 w-full cursor-grab items-center gap-2.5 rounded-2xl border border-line-strong bg-surface px-3 py-2 text-left text-sm font-semibold hover:border-action hover:bg-tealtint active:cursor-grabbing"
                >
                  <Icon name={ITEM_ICONS[t]} className="size-4 shrink-0 text-accent" />
                  <span className="min-w-0 leading-snug">{ITEM_LABELS[t]}</span>
                </button>
              </li>
            ))}
          </ul>
        ) : (
          <p className="px-1 text-sm text-ink-muted">No blocks match “{query.trim()}”.</p>
        )}
        <p className="px-1 text-xs text-[#102a43]/80">Click to add after the selected block, or drag into place.</p>
      </div>
    </aside>
  );
}

/** Between blocks: + to add one, and where a dragged block lands. */
function InsertPoint({ onAdd, dragging, onDrop }: { onAdd: (t: PaletteItem) => void; dragging: string | null; onDrop: () => void }) {
  const [open, setOpen] = useState(false);
  const [over, setOver] = useState(false);
  if (dragging)
    return (
      <div
        onDragOver={(e) => {
          e.preventDefault();
          setOver(true);
        }}
        onDragLeave={() => setOver(false)}
        onDrop={(e) => {
          e.preventDefault();
          setOver(false);
          onDrop();
        }}
        className={cx("h-8 rounded-xl border-2 border-dashed transition-colors", over ? "border-action bg-tealtint" : "border-line")}
        aria-hidden
      />
    );
  return (
    <div className="relative flex justify-center">
      <div className="absolute inset-x-6 top-1/2 h-px bg-line" aria-hidden />
      <button
        type="button"
        onClick={() => setOpen((o) => !o)}
        aria-expanded={open}
        className="relative inline-flex min-h-8 items-center gap-1 rounded-full border border-line bg-surface px-3 text-xs font-semibold text-ink-muted opacity-60 hover:opacity-100 focus-visible:opacity-100 aria-expanded:opacity-100"
      >
        <Icon name="plus" className="size-3.5" /> Add block
      </button>
      {open && (
        <div
          role="menu"
          className="absolute top-10 z-30 grid max-h-[70vh] w-[min(40rem,90vw)] gap-1 overflow-y-auto rounded-2xl bg-surface p-2 shadow-xl ring-1 ring-line sm:grid-cols-2"
        >
          {BLOCK_CATEGORIES.flatMap((g) => g.types).map((t) => (
            <button
              key={t}
              type="button"
              role="menuitem"
              onClick={() => {
                setOpen(false);
                onAdd(t);
              }}
              className="flex items-start gap-3 rounded-xl p-3 text-left hover:bg-muted"
            >
              <Icon name={ITEM_ICONS[t]} className="mt-0.5 size-5 shrink-0 text-accent" />
              <span>
                <span className="block font-semibold">{ITEM_LABELS[t]}</span>
                <span className="block text-sm text-ink-muted">{ITEM_HINTS[t]}</span>
              </span>
            </button>
          ))}
        </div>
      )}
    </div>
  );
}

const textStyle = "text-[1.08rem] leading-relaxed";

/** Each block drawn as learners see it, with its words editable in place. */
function BlockEdit({ block: b, update, paths }: { block: Block; update: Update; paths: PathOption[] }) {
  switch (b.type) {
    case "text":
      return (
        <div className={column}>
          {b.heading !== undefined && (
            <InlineText
              value={b.heading}
              onChange={(v) => update<typeof b>(b.id, (x) => void (x.heading = v), `${b.id}:heading`)}
              placeholder="Heading"
              className={b.level === 3 ? "mb-2 text-lg font-bold" : "mb-3 font-serif text-2xl font-semibold"}
            />
          )}
          <RichEditable
            value={b.body}
            onChange={(v) => update<typeof b>(b.id, (x) => void (x.body = v), `${b.id}:body`)}
            placeholder="Write here…"
            className={textStyle}
          />
        </div>
      );
    case "accordion":
      return <AccordionEdit block={b} update={update} />;
    case "carousel":
      return <CarouselEdit block={b} update={update} />;
    case "image":
      return (
        <figure className={cx(b.width === "column" ? column : "w-full")}>
          <MediaSlot media={b.media} crop={false} onPick={(src) => update<typeof b>(b.id, (x) => void (x.media.src = src ?? ""))} />
          {b.media.src && (
            <InlineText
              value={b.media.caption ?? ""}
              onChange={(v) => update<typeof b>(b.id, (x) => void (x.media.caption = v), `${b.id}:caption`)}
              placeholder="Add a caption"
              className="mt-2 text-sm text-ink-muted"
            />
          )}
        </figure>
      );
    case "video":
      return <VideoEdit block={b} update={update} />;
    case "textMedia":
      if (b.wrap !== false)
        return (
          <div className={cx(column, "flow-root")}>
            <InlineText
              value={b.heading ?? ""}
              onChange={(v) => update<typeof b>(b.id, (x) => void (x.heading = v), `${b.id}:heading`)}
              placeholder="Heading (optional)"
              className="mb-3 font-serif text-2xl font-semibold"
            />
            <TextMediaSide
              block={b}
              update={update}
              className={cx("relative z-10 mb-4 md:mb-3 md:w-[45%]", b.layout === "media-left" ? "md:float-left md:mr-6" : "md:float-right md:ml-6")}
            />
            <RichEditable
              value={b.body}
              onChange={(v) => update<typeof b>(b.id, (x) => void (x.body = v), `${b.id}:body`)}
              placeholder="Write here…"
              className={textStyle}
            />
          </div>
        );
      return (
        <div className="grid items-center gap-6 md:grid-cols-2 md:gap-10">
          <div>
            <InlineText
              value={b.heading ?? ""}
              onChange={(v) => update<typeof b>(b.id, (x) => void (x.heading = v), `${b.id}:heading`)}
              placeholder="Heading (optional)"
              className="mb-3 font-serif text-2xl font-semibold"
            />
            <RichEditable
              value={b.body}
              onChange={(v) => update<typeof b>(b.id, (x) => void (x.body = v), `${b.id}:body`)}
              placeholder="Write here…"
              className={textStyle}
            />
          </div>
          <TextMediaSide block={b} update={update} className={cx("relative z-10", b.layout === "media-left" && "md:order-first")} />
        </div>
      );
    case "callout": {
      const look = {
        important: "border-[#c7393e] bg-[#fdf1f0] dark:bg-[#3a1f1f]",
        example: "border-[#fab53d] bg-[#fff6e4] dark:bg-[#3a2f17]",
        tip: "border-[#008282] bg-tealtint",
      }[b.style];
      return (
        <aside className={cx(column, "rounded-2xl border-l-4 p-5", look)}>
          <InlineText
            value={b.label ?? ""}
            onChange={(v) => update<typeof b>(b.id, (x) => void (x.label = v), `${b.id}:label`)}
            placeholder={CALLOUTS[b.style]}
            className="mb-2 font-mulish text-sm font-extrabold uppercase tracking-[0.1em]"
          />
          <RichEditable
            value={b.body}
            onChange={(v) => update<typeof b>(b.id, (x) => void (x.body = v), `${b.id}:body`)}
            placeholder="What should stand out"
            className="leading-relaxed"
          />
          {b.link?.label && <p className="mt-3 font-semibold text-accent">{b.link.label} →</p>}
          {b.confirm !== undefined && (
            <div className="mt-4 flex items-start gap-3 rounded-xl border-2 border-line-strong bg-surface p-3 font-semibold">
              <input type="checkbox" className="mt-1 size-5 shrink-0" disabled aria-label="Readers tick this" />
              <InlineText
                value={b.confirm}
                onChange={(v) => update<typeof b>(b.id, (x) => void (x.confirm = v), `${b.id}:confirm`)}
                placeholder="What readers confirm (I understand and agree)"
                className="flex-1"
              />
            </div>
          )}
        </aside>
      );
    }
    case "decision":
      return <DecisionEdit block={b} update={update} />;
    case "quiz":
      return (
        <div className={cx(column, "rounded-3xl border border-line-strong bg-surface p-5 sm:p-7")}>
          <p className="mb-2 flex items-center gap-2 font-mulish text-sm font-extrabold uppercase tracking-[0.12em] text-accent">
            <Icon name="clipboard" className="size-5" /> Quiz
          </p>
          <Field label="Learning path quiz" hint="Uses that path’s questions, pass mark and retakes. Results show in the usual reports.">
            <select className={input} value={b.pathId} onChange={(e) => update<typeof b>(b.id, (x) => void (x.pathId = e.target.value))}>
              <option value="">Choose a learning path…</option>
              {paths.map((p) => (
                <option key={p.id} value={p.id}>
                  {p.name}
                </option>
              ))}
            </select>
          </Field>
          {!paths.length && <p className="mt-2 text-sm text-ink-muted">No learning path has a quiz yet. Add one in Discovery Paths.</p>}
          <InlineText
            value={b.intro ?? ""}
            onChange={(v) => update<typeof b>(b.id, (x) => void (x.intro = v), `${b.id}:intro`)}
            placeholder="A line before the quiz (optional)"
            className="mt-3 text-ink-muted"
          />
        </div>
      );
    case "checklist":
      return (
        <section className={cx(column, "rounded-3xl bg-[#008282] p-5 text-white sm:p-7")}>
          <p className="mb-1 flex items-center gap-2 font-mulish text-sm font-extrabold uppercase tracking-[0.12em] text-white">
            <Icon name="checklist" className="size-5" /> Job aid
          </p>
          <InlineText
            value={b.title}
            onChange={(v) => update<typeof b>(b.id, (x) => void (x.title = v), `${b.id}:title`)}
            placeholder="Checklist title"
            className="font-serif text-2xl font-semibold empty:before:text-white/50 hover:bg-white/10"
          />
          <ul className="mt-4 flex flex-col gap-1">
            {b.items.map((item, i) => (
              <li key={i} className="flex items-start gap-3">
                <span className="mt-2 size-5 shrink-0 rounded border-2 border-white/60" aria-hidden />
                <InlineText
                  value={item}
                  onChange={(v) => update<typeof b>(b.id, (x) => void (x.items[i] = v), `${b.id}:item${i}`)}
                  placeholder="A step to check"
                  className="min-w-0 flex-1 p-1 empty:before:text-white/50 hover:bg-white/10"
                />
                <button
                  type="button"
                  aria-label={`Remove item ${i + 1}`}
                  onClick={() => update<typeof b>(b.id, (x) => void x.items.splice(i, 1))}
                  className="grid size-8 shrink-0 place-items-center rounded-full text-white/70 hover:bg-white/10 hover:text-white"
                >
                  <Icon name="close" className="size-4" />
                </button>
              </li>
            ))}
          </ul>
          <button
            type="button"
            onClick={() => update<typeof b>(b.id, (x) => void x.items.push(""))}
            className="mt-3 inline-flex min-h-10 items-center gap-1.5 rounded-full border border-white/50 px-4 text-sm font-semibold hover:bg-white/10"
          >
            <Icon name="plus" className="size-4" /> Add item
          </button>
        </section>
      );
    default:
      return <InteractiveEdit block={b} update={update} />;
  }
}

/** The folds, edited open: each title and its text, with add, remove and reorder. */
function AccordionEdit({ block: b, update }: { block: Extract<Block, { type: "accordion" }>; update: Update }) {
  const move = (i: number, dir: -1 | 1) =>
    update<typeof b>(b.id, (x) => {
      const j = i + dir;
      if (j < 0 || j >= x.items.length) return;
      [x.items[i], x.items[j]] = [x.items[j], x.items[i]];
    });
  return (
    <div className={column}>
      <InlineText
        value={b.heading ?? ""}
        onChange={(v) => update<typeof b>(b.id, (x) => void (x.heading = v), `${b.id}:heading`)}
        placeholder="Heading (optional)"
        className="mb-3 font-serif text-2xl font-semibold"
      />
      <ol className="divide-y divide-line overflow-hidden rounded-2xl border border-line bg-surface">
        {b.items.map((it, i) => (
          <li key={it.id} className="px-4 py-3">
            <div className="flex items-start gap-2">
              <Icon name="chevron-down" className="mt-1 size-5 shrink-0 text-accent" />
              <InlineText
                value={it.title}
                onChange={(v) => update<typeof b>(b.id, (x) => void (x.items[i].title = v), `${b.id}:${it.id}:title`)}
                placeholder={`Title ${i + 1}: what readers open`}
                className="min-w-0 flex-1 font-semibold"
              />
              <ToolButton icon="arrow-left" label={`Move item ${i + 1} up`} rotate onClick={() => move(i, -1)} disabled={i === 0} />
              <ToolButton icon="arrow-right" label={`Move item ${i + 1} down`} rotate onClick={() => move(i, 1)} disabled={i === b.items.length - 1} />
              <ToolButton
                icon="close"
                label={`Remove item ${i + 1}`}
                onClick={() => update<typeof b>(b.id, (x) => void x.items.splice(i, 1))}
                disabled={b.items.length <= 1}
              />
            </div>
            <div className="ml-7 mt-2">
              <RichEditable
                value={it.body}
                onChange={(v) => update<typeof b>(b.id, (x) => void (x.items[i].body = v), `${b.id}:${it.id}:body`)}
                placeholder="What they see when they open it"
                className="text-[1.05rem] leading-relaxed"
              />
              <FoldPicture item={it} index={i} onChange={(fn, tag) => update<typeof b>(b.id, (x) => fn(x.items[i]), tag && `${b.id}:${it.id}:${tag}`)} />
            </div>
          </li>
        ))}
      </ol>
      <button
        type="button"
        className={cx(btn.quiet, "mt-2")}
        onClick={() => update<typeof b>(b.id, (x) => void x.items.push({ id: rid("item"), title: "", body: "" }))}
        disabled={b.items.length >= 20}
      >
        <Icon name="plus" className="size-4" /> Add item
      </button>
    </div>
  );
}

const MAX_SLIDES = 20;

/**
  The last tile of a carousel: choose or drop several pictures at once (each becomes a card), or add an
  empty card to fill from the image library.
*/
function AddPictures({ room, onAdd, onEmpty }: { room: number; onAdd: (srcs: string[]) => void; onEmpty: () => void }) {
  const [over, setOver] = useState(false);
  const [busy, setBusy] = useState<string | null>(null);
  const [problem, setProblem] = useState<string | null>(null);
  const upload = async (files: FileList | File[] | null) => {
    const list = Array.from(files ?? []).filter((f) => f.type.startsWith("image/"));
    if (!list.length) return;
    setProblem(null);
    const srcs: string[] = [];
    try {
      for (const [n, file] of list.slice(0, room).entries()) {
        setBusy(`Uploading ${n + 1} of ${Math.min(list.length, room)}…`);
        srcs.push(await uploadFile(file, "image"));
      }
      if (list.length > room) setProblem(`A carousel holds up to ${MAX_SLIDES} pictures, so ${list.length - room} weren’t added.`);
    } catch (e) {
      setProblem((e as Error).message);
    } finally {
      if (srcs.length) onAdd(srcs);
      setBusy(null);
    }
  };
  return (
    <div className="flex h-full flex-col gap-2">
      <label
        onDragOver={(e) => {
          e.preventDefault();
          setOver(true);
        }}
        onDragLeave={() => setOver(false)}
        onDrop={(e) => {
          e.preventDefault();
          setOver(false);
          void upload(e.dataTransfer.files);
        }}
        className={cx(
          "flex min-h-48 flex-1 cursor-pointer flex-col items-center justify-center gap-2 rounded-2xl border-2 border-dashed p-4 text-center transition-colors",
          over ? "border-action bg-tealtint" : "border-line-strong hover:bg-muted",
        )}
      >
        <span className="grid size-11 place-items-center rounded-full bg-action text-on-action">
          <Icon name="plus" className="size-5" />
        </span>
        <span className="font-semibold">{busy ?? "Add more pictures"}</span>
        <span className="text-sm text-ink-muted">Choose several at once, or drop them here. Each becomes a card.</span>
        <input type="file" accept="image/*" multiple className="sr-only" disabled={Boolean(busy)} onChange={(e) => void upload(e.target.files)} />
      </label>
      <button type="button" className={cx(btn.quiet, "self-center")} onClick={onEmpty} disabled={Boolean(busy)}>
        <Icon name="image" className="size-4" /> Add an empty card (for the image library)
      </button>
      {problem && <ErrorNote text={problem} />}
    </div>
  );
}

/** A fold's picture: add one, then place it, describe it and caption it, or remove it. */
function FoldPicture({
  item: it,
  index: i,
  onChange,
}: {
  item: Extract<Block, { type: "accordion" }>["items"][number];
  index: number;
  onChange: (fn: (x: Extract<Block, { type: "accordion" }>["items"][number]) => void, tag?: string) => void;
}) {
  const [adding, setAdding] = useState(false);
  if (!it.media?.src)
    return adding ? (
      <div className="mt-3 flex flex-col gap-2 rounded-xl border border-line p-3">
        <ImageDropZone
          onChange={(p) => {
            if (!p) return;
            onChange((x) => {
              x.media = { src: p.src, alt: "" };
              x.placement = x.placement ?? "below";
            });
            setAdding(false);
          }}
          label="Drag a picture here"
          addLabel="Choose picture"
          aspect="aspect-[16/9]"
        />
        <button type="button" className={cx(btn.quiet, "self-start")} onClick={() => setAdding(false)}>
          Cancel
        </button>
      </div>
    ) : (
      <button type="button" className={cx(btn.quiet, "mt-2")} onClick={() => setAdding(true)}>
        <Icon name="image" className="size-4" /> Add a picture to this item
      </button>
    );
  const placement = it.placement ?? "below";
  return (
    <div className="mt-3 flex flex-col gap-2 rounded-xl border border-line p-3">
      <div className="flex flex-wrap items-center justify-between gap-2">
        <span className="text-sm font-semibold">Picture in item {i + 1}</span>
        <div role="group" aria-label="Where the picture sits" className="flex gap-1 rounded-xl border border-line-strong p-0.5">
          {(
            [
              ["above", "Above text"],
              ["below", "Below text"],
              ["right", "Right, text wraps"],
            ] as const
          ).map(([v, label]) => (
            <button
              key={v}
              type="button"
              aria-pressed={placement === v}
              onClick={() => onChange((x) => void (x.placement = v))}
              className={cx("min-h-8 rounded-lg px-2.5 text-xs font-semibold", placement === v ? "bg-action text-on-action" : "hover:bg-muted")}
            >
              {label}
            </button>
          ))}
        </div>
      </div>
      <div className="flex gap-3">
        {/* eslint-disable-next-line @next/next/no-img-element */}
        <img src={it.media.src} alt="" className="aspect-[4/3] w-32 shrink-0 rounded-lg bg-muted object-cover" />
        <div className="flex min-w-0 flex-1 flex-col gap-2">
          <label className="flex flex-col gap-1 text-xs font-semibold">
            Caption <span className="font-normal text-ink-muted">Optional; shown under the picture</span>
            <input
              className={cx(input, "text-sm font-normal")}
              placeholder="What this picture shows, for everyone"
              value={it.media.caption ?? ""}
              onChange={(e) => onChange((x) => void (x.media && (x.media.caption = e.target.value || undefined)), "caption")}
            />
          </label>
          <label className="flex flex-col gap-1 text-xs font-semibold">
            Description for screen readers <span className="font-normal text-ink-muted">Not shown; read aloud instead of the picture</span>
            <input
              className={cx(input, "text-sm font-normal")}
              placeholder="Describe the picture"
              value={it.media.alt}
              disabled={it.media.decorative}
              onChange={(e) => onChange((x) => void (x.media && (x.media.alt = e.target.value)), "alt")}
            />
          </label>
          <div className="flex flex-wrap items-center gap-3">
            <label className="flex items-center gap-2 text-xs text-ink-muted">
              <input
                type="checkbox"
                className="size-4 accent-[var(--color-action)]"
                checked={Boolean(it.media.decorative)}
                onChange={(e) => onChange((x) => void (x.media && (x.media.decorative = e.target.checked || undefined)))}
              />
              Decorative
            </label>
            <button
              type="button"
              className={btn.quiet}
              onClick={() =>
                onChange((x) => {
                  delete x.media;
                  delete x.placement;
                })
              }
            >
              <Icon name="trash" className="size-4" /> Remove picture
            </button>
          </div>
        </div>
      </div>
      {!it.media.decorative && !it.media.alt && (
        <p className="text-xs font-semibold text-danger">Describe the picture before publishing, or mark it decorative.</p>
      )}
    </div>
  );
}

/** The pictures side by side to edit: each with its picture, description and caption; add, remove and reorder. */
function CarouselEdit({ block: b, update }: { block: Extract<Block, { type: "carousel" }>; update: Update }) {
  const move = (i: number, dir: -1 | 1) =>
    update<typeof b>(b.id, (x) => {
      const j = i + dir;
      if (j < 0 || j >= x.slides.length) return;
      [x.slides[i], x.slides[j]] = [x.slides[j], x.slides[i]];
    });
  return (
    <div className={cx(b.width === "wide" ? "w-full" : column)}>
      <p className="mb-2 flex items-center gap-2 font-mulish text-xs font-extrabold uppercase tracking-[0.12em] text-accent">
        <Icon name="carousel" className="size-4" /> Carousel · {b.slides.length} {b.slides.length === 1 ? "picture" : "pictures"}
      </p>
      <ol className="grid gap-4 sm:grid-cols-2">
        {b.slides.map((sl, i) => (
          <li key={sl.id} className="flex flex-col gap-2 rounded-2xl border border-line bg-surface p-3">
            <div className="flex items-center justify-between gap-1">
              <span className="font-mulish text-xs font-extrabold text-ink-muted">{i + 1}</span>
              <span className="flex">
                <ToolButton icon="arrow-left" label={`Move picture ${i + 1} earlier`} onClick={() => move(i, -1)} disabled={i === 0} />
                <ToolButton icon="arrow-right" label={`Move picture ${i + 1} later`} onClick={() => move(i, 1)} disabled={i === b.slides.length - 1} />
                <ToolButton
                  icon="trash"
                  label={`Remove picture ${i + 1}`}
                  onClick={() => update<typeof b>(b.id, (x) => void x.slides.splice(i, 1))}
                  disabled={b.slides.length <= 1}
                />
              </span>
            </div>
            <ImageDropZone
              picture={sl.media.src ? { src: sl.media.src, width: 1600, height: 1000 } : undefined}
              onChange={(p) => update<typeof b>(b.id, (x) => void (x.slides[i].media.src = p?.src ?? ""))}
              label="Drag a picture here"
              addLabel="Choose picture"
              aspect="aspect-[16/10]"
            />
            {/* Two different things: the caption readers see, and the description screen readers read out. */}
            <label className="flex flex-col gap-1 text-xs font-semibold">
              Caption <span className="font-normal text-ink-muted">Shown under the picture</span>
              <input
                className={cx(input, "text-sm font-normal")}
                placeholder="What this picture shows, for everyone"
                value={sl.media.caption ?? ""}
                onChange={(e) => update<typeof b>(b.id, (x) => void (x.slides[i].media.caption = e.target.value || undefined), `${b.id}:${sl.id}:caption`)}
              />
            </label>
            <label className="flex flex-col gap-1 text-xs font-semibold">
              Description for screen readers <span className="font-normal text-ink-muted">Not shown; read aloud instead of the picture</span>
              <input
                className={cx(input, "text-sm font-normal")}
                placeholder="Describe the picture"
                value={sl.media.alt}
                disabled={sl.media.decorative}
                onChange={(e) => update<typeof b>(b.id, (x) => void (x.slides[i].media.alt = e.target.value), `${b.id}:${sl.id}:alt`)}
              />
            </label>
            <label className="flex items-center gap-2 text-xs text-ink-muted">
              <input
                type="checkbox"
                className="size-4 accent-[var(--color-action)]"
                checked={Boolean(sl.media.decorative)}
                onChange={(e) => update<typeof b>(b.id, (x) => void (x.slides[i].media.decorative = e.target.checked || undefined))}
              />
              Decorative
            </label>
          </li>
        ))}
        {b.slides.length < MAX_SLIDES && (
          <li>
            <AddPictures
              room={MAX_SLIDES - b.slides.length}
              onAdd={(srcs) =>
                update<typeof b>(b.id, (x) => {
                  // Fill the empty cards first, then add new ones.
                  const left = [...srcs];
                  for (const sl of x.slides) if (!sl.media.src && left.length) sl.media.src = left.shift()!;
                  for (const src of left) if (x.slides.length < MAX_SLIDES) x.slides.push({ id: rid("slide"), media: { src, alt: "" } });
                })
              }
              onEmpty={() => update<typeof b>(b.id, (x) => void x.slides.push({ id: rid("slide"), media: { src: "", alt: "" } }))}
            />
          </li>
        )}
      </ol>
    </div>
  );
}

/**
  The media side of a text-and-media block: a picture, or a video set up just as in a video block
  (record, upload, or a YouTube, Vimeo or Loom link). Switching keeps the words; Undo brings back what
  was switched away from.
*/
function TextMediaSide({ block: b, update, className }: { block: TextMediaBlock; update: Update; className: string }) {
  const vid = videoOf(b);
  return (
    <div className={className}>
      <div
        role="group"
        aria-label="Picture or video"
        className="mb-2 flex w-fit gap-1 rounded-full border border-line-strong bg-surface p-1 text-xs font-semibold"
      >
        {(
          [
            ["picture", "Picture", "image"],
            ["video", "Video", "play"],
          ] as const
        ).map(([v, label, icon]) => (
          <button
            key={v}
            type="button"
            aria-pressed={(vid ? "video" : "picture") === v}
            onClick={() =>
              update<TextMediaBlock>(b.id, (x) => {
                if (v === "video" && !x.video) x.video = { title: "", src: "", transcript: "" };
                if (v === "picture") delete x.video;
              })
            }
            className={cx(
              "inline-flex min-h-8 items-center gap-1.5 rounded-full px-3",
              (vid ? "video" : "picture") === v ? "bg-action text-on-action" : "hover:bg-muted",
            )}
          >
            <Icon name={icon} className="size-3.5" /> {label}
          </button>
        ))}
      </div>
      {vid ? (
        <VideoEdit block={vid} update={videoUpdate(b.id, update)} className="" compact />
      ) : (
        <figure>
          <MediaSlot media={b.media} crop={false} onPick={(src) => update<TextMediaBlock>(b.id, (x) => void (x.media.src = src ?? ""))} />
          {b.media.src && (
            <InlineText
              value={b.media.caption ?? ""}
              onChange={(v) => update<TextMediaBlock>(b.id, (x) => void (x.media.caption = v), `${b.id}:caption`)}
              placeholder="Add a caption"
              className="mt-2 text-sm text-ink-muted"
            />
          )}
        </figure>
      )}
    </div>
  );
}

/** Edits a text-and-media block's video through the video block's own editor: changes land on its `video`. */
function videoUpdate(blockId: string, update: Update): Update {
  return (_id, fn, tag) =>
    update<TextMediaBlock>(
      blockId,
      (x) => {
        const v = { ...(x.video ?? { title: "", src: "", transcript: "" }), id: x.id, type: "video" } as VideoBlock;
        fn(v as never);
        const rest: Record<string, unknown> = { ...v };
        delete rest.id;
        delete rest.type;
        x.video = rest as TextMediaBlock["video"];
      },
      tag,
    );
}

function VideoEdit({
  block: b,
  update,
  className = column,
  compact,
}: {
  block: Extract<Block, { type: "video" }>;
  update: Update;
  className?: string;
  compact?: boolean;
}) {
  const [busy, setBusy] = useState(false);
  const [problem, setProblem] = useState<string | null>(null);
  const { id: guideId } = useParams<{ id: string }>();
  // Added from the palette's Webcam recording: the studio opens straight away.
  const [studio, setStudio] = useState(() => openStudioFor.delete(b.id));
  const studioView = studio && (
    <RecordingStudio
      guideId={guideId}
      blockId={b.id}
      upload={uploadFile}
      onClose={() => setStudio(false)}
      onSaved={(r) => {
        update<typeof b>(b.id, (x) => {
          x.src = r.src;
          delete x.embed;
          delete x.captionsOnPlayer;
          x.poster = r.poster;
          x.captions = r.captions;
          x.transcript = r.transcript || x.transcript;
          x.trim = r.trim;
          x.recording = r.recording;
          if (!x.title) x.title = r.recording.mode === "screen" ? "Screen recording" : "A message from your trainer";
        });
        setStudio(false);
      }}
    />
  );
  const pick = async (file?: File) => {
    if (!file) return;
    setBusy(true);
    setProblem(null);
    try {
      const src = await uploadFile(file, "video");
      update<typeof b>(b.id, (x) => void (x.src = src));
    } catch (e) {
      setProblem((e as Error).message);
    } finally {
      setBusy(false);
    }
  };
  return (
    <figure className={className}>
      {b.embed ? (
        <EmbedPlayer embed={b.embed} title={b.title} />
      ) : b.src ? (
        <>
          <video
            controls
            preload="metadata"
            poster={b.poster}
            src={b.trim ? `${b.src}#t=${b.trim.start},${b.trim.end}` : b.src}
            className="w-full rounded-2xl bg-black"
          >
            {b.captions && <track kind="captions" src={b.captions} srcLang="en" label="English" default />}
          </video>
          {b.recording && (
            <div className="mt-2 flex flex-wrap items-center gap-2 text-sm text-ink-muted">
              <Icon name="camera" className="size-4 text-accent" />
              Recorded {formatDateTime(b.recording.at)}
              {b.trim && ` · trimmed to ${Math.round(b.trim.end - b.trim.start)} seconds`}
              <button type="button" className={cx(btn.quiet, "ml-auto")} onClick={() => setStudio(true)}>
                <Icon name="refresh" className="size-4" /> Record again
              </button>
            </div>
          )}
        </>
      ) : (
        // A recording made here, a file uploaded to the Hub, or a link to the video on YouTube, Vimeo or Loom.
        <div className={cx("grid rounded-2xl border-2 border-dashed border-line-strong bg-surface", compact ? "gap-1 p-2" : "gap-3 p-4 sm:grid-cols-3")}>
          <button
            type="button"
            onClick={() => setStudio(true)}
            className="flex flex-col items-center justify-center gap-2 rounded-xl p-4 text-center hover:bg-muted"
          >
            <Icon name="camera" className="size-6 text-accent" />
            <span className="font-semibold">Record with your webcam</span>
            <span className="text-sm text-ink-muted">You, or your screen with you in the corner</span>
          </button>
          <label className="flex cursor-pointer flex-col items-center justify-center gap-2 rounded-xl p-4 text-center hover:bg-muted">
            <Icon name="upload" className="size-6 text-accent" />
            <span className="font-semibold">{busy ? "Uploading…" : "Upload a video"}</span>
            <span className="text-sm text-ink-muted">MP4, WebM or MOV, up to 80 MB</span>
            <input
              type="file"
              accept="video/mp4,video/webm,video/quicktime"
              className="sr-only"
              disabled={busy}
              onChange={(e) => void pick(e.target.files?.[0])}
            />
          </label>
          <EmbedLinkField onEmbed={(embed) => update<typeof b>(b.id, (x) => void (x.embed = embed))} />
        </div>
      )}
      {problem && <ErrorNote text={problem} />}
      {studioView}
      <InlineText
        value={b.title}
        onChange={(v) => update<typeof b>(b.id, (x) => void (x.title = v), `${b.id}:title`)}
        placeholder="Video title"
        className="mt-2 text-sm font-semibold"
      />
      <details className="mt-3 rounded-2xl border border-line bg-surface p-4" open={!b.transcript}>
        <summary className="cursor-pointer font-semibold">Transcript</summary>
        <textarea
          className={cx(input, "mt-3 min-h-32 py-2")}
          value={b.transcript}
          placeholder="Everything that’s said, for people who can’t listen"
          onChange={(e) => update<typeof b>(b.id, (x) => void (x.transcript = e.target.value), `${b.id}:transcript`)}
        />
      </details>
    </figure>
  );
}

/** Paste a YouTube, Vimeo or Loom link; it's checked as you type and used once it's a video we can play. */
function EmbedLinkField({ onEmbed }: { onEmbed: (e: VideoEmbed) => void }) {
  const [text, setText] = useState("");
  const parsed = parseEmbedLink(text);
  return (
    <div className="flex flex-col justify-center gap-2 rounded-xl p-4">
      <span className="flex items-center gap-2 font-semibold">
        <Icon name="play" className="size-5 text-accent" /> Or use a YouTube, Vimeo or Loom video
      </span>
      <input
        type="url"
        className={input}
        value={text}
        placeholder="A YouTube, Vimeo or Loom link"
        aria-label="YouTube, Vimeo or Loom link"
        onChange={(e) => setText(e.target.value)}
        onKeyDown={(e) => {
          if (e.key === "Enter" && parsed) {
            e.preventDefault();
            onEmbed(parsed);
          }
        }}
      />
      {text.trim() && !parsed && <span className="text-sm text-danger">That isn’t a YouTube, Vimeo or Loom video link.</span>}
      <button type="button" className={cx(btn.secondary, "self-start")} disabled={!parsed} onClick={() => parsed && onEmbed(parsed)}>
        {parsed ? `Use this ${EMBED_NAME[parsed.provider]} video` : "Use this video"}
      </button>
    </div>
  );
}

/** The question, its answers, and the feedback on each, all on the page. */
function DecisionEdit({ block: b, update }: { block: Extract<Block, { type: "decision" }>; update: Update }) {
  return (
    <div className={cx(column, "rounded-3xl border border-line-strong bg-surface p-5 shadow-sm sm:p-7")}>
      {/* An optional picture: in a circle beside the question, or across the top. */}
      {b.media ? (
        <div className="mb-5 flex flex-col gap-2 rounded-2xl bg-muted/50 p-3">
          {!b.media.src ? (
            <MediaSlot
              media={b.media}
              aspect="aspect-[16/9]"
              onPick={(src) => update<typeof b>(b.id, (x) => void (x.media = src ? { src, alt: "" } : undefined))}
            />
          ) : (
            <>
              <div
                role="group"
                aria-label="Picture shape"
                className="flex gap-1 self-start rounded-full border border-line-strong bg-surface p-1 text-xs font-semibold"
              >
                {(
                  [
                    ["circle", "Circle beside the question"],
                    ["wide", "Wide across the top"],
                  ] as const
                ).map(([v, label]) => (
                  <button
                    key={v}
                    type="button"
                    aria-pressed={(b.mediaStyle ?? "circle") === v}
                    onClick={() => update<typeof b>(b.id, (x) => void (x.mediaStyle = v === "wide" ? "wide" : undefined))}
                    className={cx("min-h-8 rounded-full px-3", (b.mediaStyle ?? "circle") === v ? "bg-action text-on-action" : "hover:bg-muted")}
                  >
                    {label}
                  </button>
                ))}
              </div>
              {/* Replace it (upload, the library or AI), crop it, or take it away. */}
              <PictureButtons
                picture={{ src: b.media.src, width: 0, height: 0 }}
                onChange={(p, how, alt) =>
                  update<typeof b>(b.id, (x) => {
                    if (!p) {
                      delete x.media;
                      delete x.mediaStyle;
                      return;
                    }
                    // A cropped copy keeps its description; a different picture needs a new one.
                    const cropped = how === "crop";
                    x.media = { src: p.src, alt: cropped ? (x.media?.alt ?? "") : (alt ?? ""), ...(x.media?.decorative && { decorative: true }) };
                  })
                }
              />
              <DescribeButton src={b.media.src} context={b.prompt} onAlt={(alt) => update<typeof b>(b.id, (x) => void (x.media!.alt = alt))} />
              <input
                className={cx(input, "min-h-10 text-sm", !b.media.alt && !b.media.decorative && "border-danger")}
                placeholder="Describe the picture"
                aria-label="Picture description"
                value={b.media.alt}
                disabled={b.media.decorative}
                onChange={(e) => update<typeof b>(b.id, (x) => void (x.media!.alt = e.target.value), `${b.id}:alt`)}
              />
              <label className="flex items-center gap-1.5 text-xs">
                <input
                  type="checkbox"
                  className="size-4 accent-[var(--color-action)]"
                  checked={Boolean(b.media.decorative)}
                  onChange={(e) => update<typeof b>(b.id, (x) => void (x.media!.decorative = e.target.checked || undefined))}
                />
                Decorative: it adds nothing the question doesn’t say
              </label>
            </>
          )}
          {!b.media.src && (
            <button
              type="button"
              className="self-start text-xs font-semibold text-accent hover:underline"
              onClick={() =>
                update<typeof b>(b.id, (x) => {
                  delete x.media;
                  delete x.mediaStyle;
                })
              }
            >
              Remove picture
            </button>
          )}
        </div>
      ) : (
        <button
          type="button"
          className="mb-3 inline-flex items-center gap-1.5 text-sm font-semibold text-accent hover:underline"
          onClick={() => update<typeof b>(b.id, (x) => void (x.media = { src: "", alt: "" }))}
        >
          <Icon name="image" className="size-4" /> Add a photo (a circle beside the question)
        </button>
      )}
      {b.media?.src && b.mediaStyle === "wide" && (
        // eslint-disable-next-line @next/next/no-img-element
        <img src={b.media.src} alt={b.media.alt} className="mb-5 aspect-[16/9] w-full rounded-2xl bg-muted object-cover" />
      )}
      <p className="mb-1 flex items-center gap-2 font-mulish text-sm font-extrabold uppercase tracking-[0.12em] text-accent">
        <Icon name="target" className="size-5" /> Your decision
      </p>
      <div className="flow-root">
        {b.media?.src && b.mediaStyle !== "wide" && (
          // eslint-disable-next-line @next/next/no-img-element
          <img
            src={b.media.src}
            alt={b.media.alt}
            className="float-right -mt-8 mb-2 ml-4 size-24 rounded-full bg-muted object-cover shadow-md ring-4 ring-surface sm:size-32"
          />
        )}
        <InlineText
          value={b.prompt}
          onChange={(v) => update<typeof b>(b.id, (x) => void (x.prompt = v), `${b.id}:prompt`)}
          placeholder="The question: what would you do?"
          className="font-serif text-2xl font-semibold leading-snug"
        />
        <InlineText
          value={b.context ?? ""}
          onChange={(v) => update<typeof b>(b.id, (x) => void (x.context = v), `${b.id}:context`)}
          placeholder="Anything else they need to know (optional)"
          multiline
          className="mt-2 text-ink-muted"
        />
      </div>
      <ol className="mt-5 flex flex-col gap-3">
        {b.choices.map((c, i) => (
          <li key={c.id} className="rounded-2xl border border-line p-4">
            <div className="flex items-start gap-3">
              <span className="mt-1 size-5 shrink-0 rounded-full border-2 border-line-strong" aria-hidden />
              <InlineText
                value={c.text}
                onChange={(v) => update<typeof b>(b.id, (x) => void (x.choices[i].text = v), `${b.id}:${c.id}:text`)}
                placeholder={`Answer ${i + 1}`}
                className="min-w-0 flex-1"
              />
              <select
                aria-label={`How good is answer ${i + 1}`}
                className="min-h-9 rounded-lg border border-line-strong bg-surface px-2 text-sm"
                value={c.verdict}
                onChange={(e) => update<typeof b>(b.id, (x) => void (x.choices[i].verdict = e.target.value as Verdict))}
              >
                {(Object.keys(VERDICTS) as Verdict[]).map((v) => (
                  <option key={v} value={v}>
                    {VERDICTS[v]}
                  </option>
                ))}
              </select>
              <button
                type="button"
                aria-label={`Remove answer ${i + 1}`}
                disabled={b.choices.length <= 2}
                onClick={() => update<typeof b>(b.id, (x) => void x.choices.splice(i, 1))}
                className="grid size-9 shrink-0 place-items-center rounded-full text-ink-muted hover:bg-muted disabled:opacity-30"
              >
                <Icon name="close" className="size-4" />
              </button>
            </div>
            <div className={cx("ml-8 mt-3 rounded-xl border-l-4 p-3", VERDICT_TONE[c.verdict])}>
              <p className="text-xs font-bold uppercase tracking-wide">Feedback: {VERDICTS[c.verdict]}</p>
              <InlineText
                value={c.feedback}
                onChange={(v) => update<typeof b>(b.id, (x) => void (x.choices[i].feedback = v), `${b.id}:${c.id}:feedback`)}
                placeholder="Why this works, or doesn’t"
                multiline
                className="mt-1"
              />
            </div>
          </li>
        ))}
      </ol>
      {b.choices.length < 6 && (
        <button
          type="button"
          className={cx(btn.quiet, "mt-3")}
          onClick={() => update<typeof b>(b.id, (x) => void x.choices.push({ id: rid("c"), text: "", verdict: "risky", feedback: "" }))}
        >
          <Icon name="plus" className="size-4" /> Add answer
        </button>
      )}
    </div>
  );
}

// ---------------------------------------------------------------------------------------------------
// The panel beside the page
// ---------------------------------------------------------------------------------------------------

function Panel({ title, onDone, children }: { title: string; onDone?: () => void; children: React.ReactNode }) {
  return (
    <section className="flex flex-col gap-4 rounded-3xl border border-line bg-surface p-5">
      <div className="flex items-center justify-between gap-2">
        <h2 className="font-serif text-xl font-semibold">{title}</h2>
        {onDone && (
          <button type="button" className={btn.quiet} onClick={onDone}>
            Done
          </button>
        )}
      </div>
      {children}
    </section>
  );
}

function Segmented<T extends string>({
  label,
  value,
  options,
  onChange,
}: {
  label: string;
  value: T;
  options: { value: T; label: string }[];
  onChange: (v: T) => void;
}) {
  return (
    <div className="flex flex-col gap-1">
      <span className="text-sm font-semibold">{label}</span>
      <div role="group" aria-label={label} className="flex flex-wrap gap-1 rounded-2xl border border-line-strong p-1">
        {options.map((o) => (
          <button
            key={o.value}
            type="button"
            aria-pressed={value === o.value}
            onClick={() => onChange(o.value)}
            className={cx("min-h-9 flex-1 rounded-xl px-3 text-sm font-semibold", value === o.value ? "bg-action text-on-action" : "hover:bg-muted")}
          >
            {o.label}
          </button>
        ))}
      </div>
    </div>
  );
}

/** A link's words and address, both optional; cleared when both are empty. */
function LinkFields({
  value,
  onChange,
  what,
}: {
  value?: { href: string; label: string };
  onChange: (v: { href: string; label: string } | undefined) => void;
  what: string;
}) {
  const set = (patch: Partial<{ href: string; label: string }>) => {
    const next = { href: value?.href ?? "", label: value?.label ?? "", ...patch };
    onChange(next.href || next.label ? next : undefined);
  };
  return (
    <fieldset className="flex flex-col gap-2">
      <legend className="text-sm font-semibold">{what}</legend>
      <input className={input} placeholder="Link text" value={value?.label ?? ""} onChange={(e) => set({ label: e.target.value })} />
      <input className={input} placeholder="/resources or https://…" value={value?.href ?? ""} onChange={(e) => set({ href: e.target.value })} />
    </fieldset>
  );
}

/** The selected block's details, then what reviewers need: flags, sources and a note. */
function BlockSettings({
  block: b,
  doc,
  update,
  onDone,
  onDuplicate,
  onRemove,
}: {
  block: Block;
  doc: GuideDoc;
  update: Update;
  onDone: () => void;
  onDuplicate: () => void;
  onRemove: () => void;
}) {
  const media = b.type === "image" || (b.type === "textMedia" && !b.video) ? b.media : null;
  const tmVideo = b.type === "textMedia" ? videoOf(b) : null;
  return (
    <Panel title={BLOCK_LABELS[b.type]} onDone={onDone}>
      {canConvert(b) && (
        <label className="flex flex-col gap-1 text-sm font-semibold">
          Change to another kind of block
          <select
            className={cx(input, "font-normal")}
            value=""
            onChange={(e) => e.target.value && convertInPlace(update, b.id, e.target.value as ConvertibleType)}
          >
            <option value="">Keep it as {BLOCK_LABELS[b.type].toLowerCase()}</option>
            {CONVERTIBLE.filter((t) => t !== b.type).map((t) => {
              const lost = convertLoses(b, t);
              return (
                <option key={t} value={t}>
                  {BLOCK_LABELS[t]}
                  {lost.length ? ` (leaves ${lost.join(", ")})` : ""}
                </option>
              );
            })}
          </select>
          <span className="text-xs font-normal text-ink-muted">Your words come with it. Undo changes it back.</span>
        </label>
      )}
      {b.type === "text" && (
        <Segmented
          label="Heading"
          value={b.heading === undefined ? "none" : b.level === 3 ? "small" : "large"}
          options={[
            { value: "none", label: "None" },
            { value: "large", label: "Heading" },
            { value: "small", label: "Subheading" },
          ]}
          onChange={(v) =>
            update<typeof b>(b.id, (x) => {
              if (v === "none") {
                delete x.heading;
                delete x.level;
              } else {
                x.heading = x.heading ?? "";
                x.level = v === "small" ? 3 : 2;
              }
            })
          }
        />
      )}
      {b.type === "image" && (
        <Segmented
          label="Width"
          value={b.width}
          options={[
            { value: "column", label: "Text width" },
            { value: "wide", label: "Wide" },
            { value: "full", label: "Full" },
          ]}
          onChange={(v) => update<typeof b>(b.id, (x) => void (x.width = v))}
        />
      )}
      {(b.type === "image" || (b.type === "textMedia" && !b.video)) && (
        <label className="flex items-center gap-2 text-sm">
          <input
            type="checkbox"
            className="size-4 accent-[var(--color-action)]"
            checked={Boolean(b.enlarge)}
            onChange={(e) => update<Extract<Block, { type: "image" | "textMedia" }>>(b.id, (x) => void (x.enlarge = e.target.checked || undefined))}
          />
          Let readers enlarge it (for detail like a document)
        </label>
      )}
      {b.type === "carousel" && (
        <Segmented
          label="Width"
          value={b.width}
          options={[
            { value: "column", label: "Text width" },
            { value: "wide", label: "Wide" },
          ]}
          onChange={(v) => update<typeof b>(b.id, (x) => void (x.width = v))}
        />
      )}
      {b.type === "carousel" && (
        <p className="text-sm text-ink-muted">Readers step through it with Previous and Next, the arrow keys or the dots. It never moves by itself.</p>
      )}
      {b.type === "accordion" && (
        <p className="text-sm text-ink-muted">Readers open each item to see its text. Use it for detail some readers need and others can skip.</p>
      )}
      {b.type === "textMedia" && (
        <label className="flex items-start gap-2 text-sm">
          <input
            type="checkbox"
            className="mt-0.5 size-4 accent-[var(--color-action)]"
            checked={b.wrap !== false}
            onChange={(e) => update<typeof b>(b.id, (x) => void (x.wrap = e.target.checked ? undefined : false))}
          />
          <span>
            <span className="font-semibold">Text flows around the {b.video ? "video" : "picture"}</span>
            <span className="block text-ink-muted">
              The picture sits on its side and the text wraps around and below it. On a phone it sits above the text.
            </span>
          </span>
        </label>
      )}
      {b.type === "textMedia" && (
        <Segmented
          label={`${b.video ? "Video" : "Picture"} on a wide screen`}
          value={b.layout}
          options={[
            { value: "media-left", label: "Left" },
            { value: "media-right", label: "Right" },
          ]}
          onChange={(v) => update<typeof b>(b.id, (x) => void (x.layout = v))}
        />
      )}
      {media && (
        <>
          <ImageDropZone
            picture={media.src ? { src: media.src, width: 1600, height: 1000 } : undefined}
            onChange={(p, _how, alt) =>
              update<Extract<Block, { type: "image" | "textMedia" }>>(b.id, (x) => {
                x.media.src = p?.src ?? "";
                // A Pexels photo comes with a description to start from.
                if (alt && !x.media.alt) x.media.alt = alt;
              })
            }
            label="Drag a picture here"
            addLabel="Add picture"
          />
          <DescribeButton
            src={media.src}
            context={[b.type === "textMedia" ? b.heading : "", b.type === "textMedia" ? b.body : media.caption].filter(Boolean).join(" ").slice(0, 300)}
            onAlt={(alt) => update<Extract<Block, { type: "image" | "textMedia" }>>(b.id, (x) => void (x.media.alt = alt))}
          />
          <Field label="Description for screen readers" hint="What the picture shows that matters here. Required unless it’s decorative.">
            <textarea
              className={cx(input, "min-h-20 py-2")}
              value={media.alt}
              disabled={media.decorative}
              onChange={(e) => update<Extract<Block, { type: "image" | "textMedia" }>>(b.id, (x) => void (x.media.alt = e.target.value), `${b.id}:alt`)}
            />
          </Field>
          <label className="flex items-center gap-2 text-sm">
            <input
              type="checkbox"
              className="size-4 accent-[var(--color-action)]"
              checked={Boolean(media.decorative)}
              onChange={(e) => update<Extract<Block, { type: "image" | "textMedia" }>>(b.id, (x) => void (x.media.decorative = e.target.checked || undefined))}
            />
            Decorative: it adds nothing the text doesn’t say
          </label>
        </>
      )}
      {b.type === "video" && <VideoSettings block={b} update={update} />}
      {tmVideo && <VideoSettings block={tmVideo} update={videoUpdate(b.id, update)} />}
      {b.type === "callout" && (
        <>
          <Segmented
            label="Kind"
            value={b.style}
            options={(Object.keys(CALLOUTS) as (keyof typeof CALLOUTS)[]).map((k) => ({ value: k, label: CALLOUTS[k] }))}
            onChange={(v) => update<typeof b>(b.id, (x) => void (x.style = v))}
          />
          <LinkFields what="Link (optional)" value={b.link} onChange={(l) => update<typeof b>(b.id, (x) => void (x.link = l), `${b.id}:link`)} />
          <label className="flex items-start gap-2 text-sm">
            <input
              type="checkbox"
              className="mt-0.5 size-4 accent-[var(--color-action)]"
              checked={b.confirm !== undefined}
              onChange={(e) => update<typeof b>(b.id, (x) => void (x.confirm = e.target.checked ? (x.confirm ?? "I understand and agree") : undefined))}
            />
            <span>
              <span className="font-semibold">Readers tick to confirm</span>
              <span className="block text-ink-muted">
                For an acknowledgement or declaration. The page can’t be finished until it’s ticked, and the tick is recorded. Edit the words on the tick box on
                the page.
              </span>
            </span>
          </label>
        </>
      )}
      {b.type === "decision" && (
        <LinkFields
          what="Source shown with the feedback"
          value={b.source && { href: b.source.href ?? "", label: b.source.label }}
          onChange={(l) => update<typeof b>(b.id, (x) => void (x.source = l && { label: l.label, ...(l.href && { href: l.href }) }), `${b.id}:source`)}
        />
      )}
      {b.type === "checklist" && (
        <LinkFields
          what="Resource link (optional)"
          value={b.resource}
          onChange={(l) => update<typeof b>(b.id, (x) => void (x.resource = l), `${b.id}:resource`)}
        />
      )}
      <InteractiveSettings block={b} update={update} doc={doc} />

      <Segmented
        label="Entrance"
        value={b.reveal ?? "rise"}
        options={(Object.keys(REVEALS) as Reveal[]).map((r) => ({ value: r, label: REVEALS[r] }))}
        onChange={(v) => update<Block>(b.id, (x) => void (x.reveal = v === "rise" ? undefined : v))}
      />
      <p className="-mt-2 text-xs text-ink-muted">How it comes into view as readers scroll to it. Readers who ask for less motion don’t see it.</p>

      <div className="border-t border-line pt-4">
        <h3 className="font-semibold">For reviewers</h3>
        <p className="text-sm text-ink-muted">Learners don’t see these.</p>
      </div>
      <Segmented
        label="Flag"
        value={b.flag?.kind ?? "none"}
        options={[
          { value: "none", label: "None" },
          { value: "verify", label: "Needs verification" },
          { value: "illustrative", label: "Illustrative" },
        ]}
        onChange={(v) => update<Block>(b.id, (x) => void (x.flag = v === "none" ? undefined : { kind: v, note: x.flag?.note ?? "" }))}
      />
      {b.flag && (
        <Field
          label={b.flag.kind === "verify" ? "What needs checking" : "What’s made up"}
          hint={b.flag.kind === "verify" ? "Publishing waits until this flag is cleared." : undefined}
        >
          <textarea
            className={cx(input, "min-h-16 py-2")}
            value={b.flag.note}
            onChange={(e) => update<Block>(b.id, (x) => void (x.flag && (x.flag.note = e.target.value)), `${b.id}:flagnote`)}
          />
        </Field>
      )}
      <div className="flex flex-col gap-2">
        <span className="text-sm font-semibold">Sources</span>
        {(b.evidence ?? []).map((ev, i) => (
          <div key={i} className="flex flex-col gap-1.5 rounded-2xl border border-line p-3">
            <input
              className={input}
              placeholder="Document or page"
              value={ev.source}
              onChange={(e) => update<Block>(b.id, (x) => void (x.evidence![i].source = e.target.value), `${b.id}:ev${i}`)}
            />
            <input
              className={input}
              placeholder="Page, slide or section (optional)"
              value={ev.ref ?? ""}
              onChange={(e) => update<Block>(b.id, (x) => void (x.evidence![i].ref = e.target.value), `${b.id}:evref${i}`)}
            />
            <textarea
              className={cx(input, "min-h-16 py-2")}
              placeholder="The passage it relies on (optional)"
              value={ev.quote ?? ""}
              onChange={(e) => update<Block>(b.id, (x) => void (x.evidence![i].quote = e.target.value), `${b.id}:evq${i}`)}
            />
            <button type="button" className={cx(btn.quiet, "self-start")} onClick={() => update<Block>(b.id, (x) => void x.evidence!.splice(i, 1))}>
              <Icon name="trash" className="size-4" /> Remove source
            </button>
          </div>
        ))}
        <button
          type="button"
          className={cx(btn.secondary, "self-start")}
          onClick={() => update<Block>(b.id, (x) => void (x.evidence = [...(x.evidence ?? []), { source: "" }]))}
        >
          <Icon name="plus" className="size-4" /> Add source
        </button>
      </div>
      <Field label="Note for reviewers">
        <textarea
          className={cx(input, "min-h-16 py-2")}
          value={b.note ?? ""}
          onChange={(e) => update<Block>(b.id, (x) => void (x.note = e.target.value), `${b.id}:note`)}
        />
      </Field>
      <div className="flex flex-wrap gap-2 border-t border-line pt-4">
        <button type="button" className={btn.secondary} onClick={onDuplicate}>
          <Icon name="copy" className="size-4" /> Duplicate
        </button>
        <button type="button" className={btn.danger} onClick={onRemove}>
          <Icon name="trash" className="size-4" /> Delete
        </button>
      </div>
    </Panel>
  );
}

function VideoSettings({ block: b, update }: { block: Extract<Block, { type: "video" }>; update: Update }) {
  const [busy, setBusy] = useState(false);
  const [problem, setProblem] = useState<string | null>(null);
  const captions = async (file?: File) => {
    if (!file) return;
    setBusy(true);
    setProblem(null);
    try {
      const src = await uploadFile(file, "captions");
      update<typeof b>(b.id, (x) => void (x.captions = src));
    } catch (e) {
      setProblem((e as Error).message);
    } finally {
      setBusy(false);
    }
  };
  if (b.embed) {
    const site = EMBED_NAME[b.embed.provider];
    return (
      <>
        <p className="text-sm">
          On {site}:{" "}
          <a href={embedLink(b.embed)} target="_blank" rel="noreferrer" className="break-all font-semibold text-accent underline underline-offset-2">
            {embedLink(b.embed)}
          </a>
        </p>
        <label className="flex items-start gap-2 text-sm">
          <input
            type="checkbox"
            className="mt-0.5 size-4 accent-[var(--color-action)]"
            checked={Boolean(b.captionsOnPlayer)}
            onChange={(e) => update<typeof b>(b.id, (x) => void (x.captionsOnPlayer = e.target.checked || undefined))}
          />
          <span>
            <span className="font-semibold">It has captions on {site}</span>
            <span className="block text-ink-muted">Turned on by default in the player. Required to publish, with the transcript.</span>
          </span>
        </label>
        {b.embed.provider === "vimeo" && !b.embed.hash && (
          <p className="text-xs text-ink-muted">If the video is unlisted on Vimeo, paste its full share link (with the private part) so it plays here.</p>
        )}
        <button
          type="button"
          className={cx(btn.quiet, "self-start")}
          onClick={() =>
            update<typeof b>(b.id, (x) => {
              delete x.embed;
              delete x.captionsOnPlayer;
            })
          }
        >
          <Icon name="refresh" className="size-4" /> Replace the video
        </button>
      </>
    );
  }
  return (
    <>
      <div className="flex flex-col gap-1">
        <span className="text-sm font-semibold">Captions</span>
        <p className="text-sm text-ink-muted">{b.captions ? "Captions added." : "A WebVTT (.vtt) file. Required to publish."}</p>
        <label className={cx(btn.secondary, "cursor-pointer self-start", busy && "pointer-events-none opacity-60")}>
          <Icon name="upload" className="size-4" /> {busy ? "Uploading…" : b.captions ? "Replace captions" : "Upload captions"}
          <input type="file" accept=".vtt,text/vtt" className="sr-only" onChange={(e) => void captions(e.target.files?.[0])} />
        </label>
        {problem && <ErrorNote text={problem} />}
      </div>
      <div className="flex flex-col gap-1">
        <span className="text-sm font-semibold">Poster</span>
        <ImageDropZone
          picture={b.poster ? { src: b.poster, width: 1600, height: 900 } : undefined}
          onChange={(p) => update<typeof b>(b.id, (x) => void (x.poster = p?.src))}
          label="The picture before it plays"
          aspect="aspect-video"
        />
      </div>
      {b.src && (
        <button type="button" className={cx(btn.quiet, "self-start")} onClick={() => update<typeof b>(b.id, (x) => void (x.src = ""))}>
          <Icon name="refresh" className="size-4" /> Replace the video
        </button>
      )}
    </>
  );
}

/** With nothing selected: who it's for, how it's completed, what stands in the way of publishing, and its editions. */
function GuideSettings({
  guide,
  draft,
  change,
  onAct,
}: {
  guide: AuthorGuide;
  draft: Draft;
  change: (fn: (d: Draft) => void, tag?: string) => void;
  onAct: (a: "archive" | "restore" | "duplicate") => Promise<void>;
}) {
  // Verification flags are held apart: they only stop publishing when review is required.
  const toVerify = guide.checks.unverified.map((u) => u.check);
  const mustFix = guide.checks.blocking.filter((c) => !toVerify.includes(c));
  const [problem, setProblem] = useState<string | null>(null);
  const run = (a: "archive" | "restore" | "duplicate") => onAct(a).catch((e: Error) => setProblem(e.message));
  return (
    <Panel title="Guide settings">
      <fieldset>
        <legend className="text-sm font-semibold">Who it’s for</legend>
        <div className="mt-2 flex flex-col gap-2">
          {GUIDE_AUDIENCES.map((a) => (
            <label key={a.value} className="flex items-center gap-2">
              <input
                type="checkbox"
                className="size-4 accent-[var(--color-action)]"
                checked={draft.audience.includes(a.value)}
                onChange={(e) => change((d) => void (d.audience = e.target.checked ? [...d.audience, a.value] : d.audience.filter((v) => v !== a.value)))}
              />
              {a.label}
            </label>
          ))}
          <span className="text-xs text-ink-muted">None ticked: everyone signed in can read it. Changes apply straight away, without publishing.</span>
        </div>
      </fieldset>
      <Field label="How it’s completed" hint="Opening or scrolling never completes a guide.">
        <select className={input} value={draft.completion} onChange={(e) => change((d) => void (d.completion = e.target.value as CompletionMode))}>
          {(Object.keys(COMPLETION_MODES) as CompletionMode[]).map((m) => (
            <option key={m} value={m}>
              {COMPLETION_MODES[m]}
            </option>
          ))}
        </select>
      </Field>

      <div className="border-t border-line pt-4">
        <h3 className="font-semibold">Before publishing</h3>
        {mustFix.length ? (
          <ul className="mt-2 flex flex-col gap-1.5 text-sm">
            {mustFix.map((c) => (
              <li key={c} className="flex gap-2">
                <Icon name="alert" className="mt-0.5 size-4 shrink-0 text-danger" /> {c}
              </li>
            ))}
          </ul>
        ) : (
          <p className="mt-2 flex items-center gap-2 text-sm">
            <Icon name="circle-check" className="size-4 text-success" /> Everything required is done.
          </p>
        )}
        {toVerify.length > 0 && (
          <details className="mt-3 rounded-xl bg-gold/10 p-3 text-sm">
            <summary className="cursor-pointer font-semibold">
              {toVerify.length} {toVerify.length === 1 ? "item" : "items"} still to verify
            </summary>
            <p className="mt-1 text-ink-muted">
              {guide.reviewRequired
                ? "A reviewer signs each one off before the course can be published."
                : "These don’t stop you publishing while review is optional: Publish anyway records them. A reviewer can sign them off in Review and publish."}
            </p>
            <ul className="mt-2 flex flex-col gap-1.5">
              {toVerify.map((c) => (
                <li key={c} className="flex gap-2">
                  <Icon name="flag" className="mt-0.5 size-4 shrink-0 text-warm" /> {c}
                </li>
              ))}
            </ul>
          </details>
        )}
        {guide.checks.suggestions.length > 0 && (
          <ul className="mt-3 flex flex-col gap-1.5 text-sm text-ink-muted">
            {guide.checks.suggestions.map((c) => (
              <li key={c} className="flex gap-2">
                <Icon name="bulb" className="mt-0.5 size-4 shrink-0" /> {c}
              </li>
            ))}
          </ul>
        )}
      </div>

      <div className="border-t border-line pt-4">
        <h3 className="font-semibold">Editions</h3>
        {guide.revisions.length ? (
          <ol className="mt-2 flex flex-col gap-2 text-sm">
            {guide.revisions.map((r) => (
              <li key={r.id}>
                <span className="font-semibold">Edition {r.number}</span> · {formatDate(r.published_at)}
                {r.summary && <span className="block text-ink-muted">{r.summary}</span>}
              </li>
            ))}
          </ol>
        ) : (
          <p className="mt-2 text-sm text-ink-muted">Not published yet.</p>
        )}
        {guide.publishedNumber && guide.status !== "archived" && (
          <Link href={`/magazine/${guide.slug}`} className="mt-3 inline-flex items-center gap-1 text-sm font-semibold text-accent hover:underline">
            Open the live guide <Icon name="external" className="size-4" />
          </Link>
        )}
      </div>

      <div className="flex flex-wrap gap-2 border-t border-line pt-4">
        <button type="button" className={btn.secondary} onClick={() => void run("duplicate")}>
          <Icon name="copy" className="size-4" /> Duplicate guide
        </button>
        {guide.status === "archived" ? (
          <button type="button" className={btn.secondary} onClick={() => void run("restore")}>
            <Icon name="refresh" className="size-4" /> Restore
          </button>
        ) : (
          <button type="button" className={btn.danger} onClick={() => void run("archive")}>
            <Icon name="trash" className="size-4" /> Delete
          </button>
        )}
      </div>
      {guide.status !== "archived" && (
        <p className="text-xs text-ink-muted">Deleting takes it out of Magazine. Learners’ records are kept, and you can restore it from the Magazine list.</p>
      )}
      {problem && <ErrorNote text={problem} />}
      <p className="text-xs text-ink-muted">Saved {formatDateTime(guide.savedAt)}</p>
    </Panel>
  );
}

/** What's about to be published, with a line on what changed for the edition history. */
/** The saved draft in the real reader, at desktop or phone width, over the editor. */
function PreviewDialog({ id, pageId, savedAt, onClose }: { id: string; pageId?: string; savedAt: string; onClose: () => void }) {
  const [size, setSize] = useState<"desktop" | "phone">("desktop");
  const closeBtn = useRef<HTMLButtonElement>(null);
  useEffect(() => {
    closeBtn.current?.focus();
    const onKey = (e: KeyboardEvent) => e.key === "Escape" && onClose();
    document.addEventListener("keydown", onKey);
    const scroll = document.body.style.overflow;
    document.body.style.overflow = "hidden";
    return () => {
      document.removeEventListener("keydown", onKey);
      document.body.style.overflow = scroll;
    };
  }, [onClose]);
  const src = useMemo(
    () => `/magazine/draft/${encodeURIComponent(id)}${pageId ? `/${encodeURIComponent(pageId)}` : ""}?v=${encodeURIComponent(savedAt)}`,
    [id, pageId, savedAt],
  );
  const choice = (on: boolean) =>
    cx("min-h-9 rounded-full px-3 text-sm font-semibold", on ? "bg-surface text-ink shadow-sm" : "text-white/80 hover:text-white");
  return (
    <div
      role="dialog"
      aria-modal="true"
      aria-label="Guide preview"
      className="fixed inset-0 z-[60] flex flex-col items-center gap-3 bg-[rgb(10_26_46)] p-3 sm:p-5"
      onClick={onClose}
    >
      <div className="flex w-full max-w-7xl flex-wrap items-center gap-2" onClick={(e) => e.stopPropagation()}>
        <div className="inline-flex rounded-full bg-white/15 p-1" role="group" aria-label="Screen size">
          <button type="button" aria-pressed={size === "desktop"} className={choice(size === "desktop")} onClick={() => setSize("desktop")}>
            <Icon name="monitor" className="mr-1 inline size-4" /> Desktop
          </button>
          <button type="button" aria-pressed={size === "phone"} className={choice(size === "phone")} onClick={() => setSize("phone")}>
            <Icon name="mobile" className="mr-1 inline size-4" /> Phone
          </button>
        </div>
        <span className="mr-auto text-sm text-white/80">The saved draft, as learners will see it.</span>
        <button
          ref={closeBtn}
          type="button"
          onClick={onClose}
          className="inline-flex min-h-10 items-center gap-1.5 rounded-full bg-white px-4 font-semibold text-ink"
        >
          <Icon name="close" className="size-4" /> Close
        </button>
      </div>
      <iframe
        title="Guide preview"
        src={src}
        onClick={(e) => e.stopPropagation()}
        className={cx("min-h-0 flex-1 rounded-2xl bg-bg shadow-2xl", size === "phone" ? "w-[390px] max-w-full" : "w-full max-w-7xl")}
      />
    </div>
  );
}
