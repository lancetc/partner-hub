import type { Lesson } from "@/content/lessons";

/*
  A learning path's thumbnail, chosen from its first topic: the topic's own cover photo, or else the
  first photo a learner would see on its cards, or else the topic's illustration. Ready for StoryVisual.
*/

export type Thumbnail = Lesson["visual"] & { alt: string; photo?: NonNullable<Lesson["visual"]["photo"]> & { animated?: { mp4: string } } };

/** Cards in the order a learner meets them: along the main route from the start, then any others. */
function inOrder(lesson: Lesson) {
  const seen = new Set<string>();
  const order: Lesson["nodes"][string][] = [];
  for (let id: string | undefined = lesson.start; id && !seen.has(id) && lesson.nodes[id];) {
    seen.add(id);
    const card: Lesson["nodes"][string] = lesson.nodes[id];
    order.push(card);
    id = card.type === "decision" ? card.options.find((o) => o.correct)?.next : "next" in card ? card.next : undefined;
  }
  return [...order, ...Object.values(lesson.nodes).filter((c) => !seen.has(c.id))];
}

/** The first photo on a card, if it has one. */
function cardPhoto(card: Lesson["nodes"][string]): Thumbnail["photo"] | null {
  const v = card.visual;
  if (v.kind === "illustration" && v.photo)
    return { src: v.photo.src, width: v.photo.width, height: v.photo.height, position: v.photo.position, animated: v.photo.animated };
  if (v.kind === "presenter" && v.photo) return { src: v.photo.src, width: v.photo.width, height: v.photo.height };
  return null;
}

export function thumbnailFor(lesson: Lesson): Thumbnail {
  const alt = lesson.visual.alt ?? lesson.title;
  if (lesson.visual.photo) return { ...lesson.visual, alt };
  for (const card of inOrder(lesson)) {
    const photo = cardPhoto(card);
    if (photo) return { ...lesson.visual, alt, photo };
  }
  return { ...lesson.visual, alt };
}
