import { Icon } from "./Icon";

/**
  The yellow "Featured" tag over a card's picture: a Magazine course's or a Discovery Path's, when it's ticked
  "Featured tag" in its settings (server/magazineFeatured). Sits in the picture's top-left corner; the picture's
  wrapper must be `relative`.
*/
export function FeaturedTag() {
  return (
    <span className="absolute left-3 top-3 inline-flex items-center gap-1 rounded-full bg-[#fab53d] px-2.5 py-1 font-mulish text-xs font-extrabold uppercase tracking-[0.12em] text-[#102a43] shadow-sm">
      <Icon name="star" className="size-3.5" /> Featured
    </span>
  );
}
