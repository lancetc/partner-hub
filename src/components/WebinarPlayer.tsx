"use client";

/** Plays a webinar recording from YouTube, Synthesia or an upload. `onEnded` fires for uploads that play to the end. */
export function WebinarPlayer({
  video,
  title,
  poster,
  onEnded,
}: {
  video: { provider: "youtube" | "synthesia" | "upload"; id?: string; src?: string };
  title: string;
  poster?: string | null;
  onEnded?: () => void;
}) {
  return (
    <div className="relative aspect-video w-full overflow-hidden rounded-3xl bg-black">
      {video.provider === "upload" ? (
        <video src={video.src} poster={poster ?? undefined} controls playsInline preload="metadata" onEnded={onEnded} className="absolute inset-0 size-full object-contain" aria-label={title} />
      ) : (
        <iframe
          src={video.provider === "youtube" ? `https://www.youtube-nocookie.com/embed/${video.id}?rel=0&playsinline=1&modestbranding=1` : `https://share.synthesia.io/embeds/videos/${video.id}`}
          title={title}
          loading="lazy"
          allow="accelerometer; encrypted-media; gyroscope; picture-in-picture; fullscreen"
          referrerPolicy="strict-origin-when-cross-origin"
          allowFullScreen
          className="absolute inset-0 size-full border-0"
        />
      )}
    </div>
  );
}
