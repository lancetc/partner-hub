"use client";

import { useEffect, useState } from "react";
import { usePathname } from "next/navigation";
import { BACKGROUND_EVENT, backdropColour, backdropImage, backdropShownOn, type Background, type BackdropImage } from "@/lib/background";

/*
  The person's background, full screen behind the main pages (lib/background says which). Drawn once,
  from the layout. Its presence switches the glass styles on (globals.css), so pages without it keep
  their solid surfaces. Profile and settings sends BACKGROUND_EVENT to preview or apply a new choice.
*/
export function Backdrop({ initial }: { initial: Background | null }) {
  const pathname = usePathname();
  const [bg, setBg] = useState(initial);

  useEffect(() => {
    const change = (e: Event) => setBg((e as CustomEvent<Background>).detail);
    window.addEventListener(BACKGROUND_EVENT, change);
    return () => window.removeEventListener(BACKGROUND_EVENT, change);
  }, []);

  if (!bg || bg.kind === "none" || !backdropShownOn(pathname)) return null;
  const image = backdropImage(bg);
  return (
    <>
      <div aria-hidden className="hub-backdrop" style={{ background: backdropColour(bg) ?? image?.color ?? undefined }}>
        {image && <BackdropPhoto key={image.src} image={image} />}
        <div className="hub-backdrop-veil" />
      </div>
      {bg.kind === "pexels" && (
        // Pexels asks for the photographer to be credited: up the right-hand edge, beside the page, on screens wide enough to leave room.
        // Elsewhere the credit is in Profile and settings, where the photo is chosen.
        <p className="fixed bottom-4 right-2 z-20 hidden rotate-180 rounded-full bg-black/45 px-1 py-3 text-[0.7rem] leading-none text-white backdrop-blur-md [writing-mode:vertical-rl] min-[1440px]:block">
          Photo by{" "}
          <a href={bg.photographerUrl} className="font-semibold underline-offset-2 hover:underline">
            {bg.photographer}
          </a>{" "}
          on{" "}
          <a href={bg.pageUrl} className="font-semibold underline-offset-2 hover:underline">
            Pexels
          </a>
        </p>
      )}
    </>
  );
}

function BackdropPhoto({ image }: { image: BackdropImage }) {
  return (
    // eslint-disable-next-line @next/next/no-img-element -- sized by Pexels' own resizer or our two upload sizes, through srcSet
    <img
      src={image.src}
      srcSet={image.srcSet}
      sizes={image.sizes}
      alt=""
      decoding="async"
      fetchPriority="low"
      // Fades in once loaded (globals.css). A photo that finished before the page woke up is shown straight away.
      ref={(el) => {
        if (el?.complete && el.naturalWidth > 0) el.setAttribute("data-loaded", "");
      }}
      onLoad={(e) => e.currentTarget.setAttribute("data-loaded", "")}
    />
  );
}
