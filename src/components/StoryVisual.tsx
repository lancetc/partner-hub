import type { IconName, VisualVariant } from "@/content/stories";
import type { Tone } from "@/content/lessons";
import Image from "next/image";
import { Icon } from "./Icon";
import { cx } from "@/lib/format";

/*
  Placeholder editorial artwork drawn from the brand palette. Real stories need imagery that
  reflects the article and has permission for use (PRD section 5); these stand in for the pilot.
*/

const tones: Record<Tone, { bg: string; a: string; b: string; c: string; icon: string }> = {
  teal: { bg: "#00828a", a: "#4cc3c9", b: "#ddf2f3", c: "#0f2642", icon: "#FFFFFF" },
  navy: { bg: "#0f2642", a: "#4cc3c9", b: "#fdb813", c: "#d9381e", icon: "#FFFFFF" },
  warm: { bg: "#c4471b", a: "#fdb813", b: "#F7D9C9", c: "#0f2642", icon: "#FFFFFF" },
  gold: { bg: "#fdb813", a: "#FFFFFF", b: "#c4471b", c: "#0f2642", icon: "#0f2642" },
  sky: { bg: "#dde7f2", a: "#3d5068", b: "#4cc3c9", c: "#FFFFFF", icon: "#0f2642" },
};

function Pattern({ variant, t }: { variant: VisualVariant; t: (typeof tones)[Tone] }) {
  switch (variant) {
    case "petals":
      return (
        <g opacity="0.9">
          <ellipse cx="300" cy="70" rx="70" ry="38" fill={t.a} transform="rotate(-30 300 70)" />
          <ellipse cx="340" cy="150" rx="70" ry="38" fill={t.b} opacity="0.85" transform="rotate(40 340 150)" />
          <ellipse cx="80" cy="200" rx="90" ry="40" fill={t.c} opacity="0.7" transform="rotate(-15 80 200)" />
        </g>
      );
    case "rings":
      return (
        <g fill="none" strokeWidth="18">
          <circle cx="310" cy="120" r="150" stroke={t.a} opacity="0.35" />
          <circle cx="310" cy="120" r="100" stroke={t.b} opacity="0.45" />
          <circle cx="310" cy="120" r="50" stroke={t.c} opacity="0.5" />
        </g>
      );
    case "grid":
      return (
        <g>
          {Array.from({ length: 24 }, (_, i) => (
            <rect
              key={i}
              x={20 + (i % 8) * 50}
              y={20 + Math.floor(i / 8) * 75}
              width="38"
              height="60"
              rx="10"
              fill={[t.a, t.b, t.c][(i * 7) % 3]}
              opacity={0.25 + ((i * 13) % 5) * 0.12}
            />
          ))}
        </g>
      );
    case "wave":
      return (
        <g>
          <path d="M0 170 C 80 120, 160 220, 240 170 S 400 130, 400 130 V250 H0z" fill={t.a} opacity="0.55" />
          <path d="M0 205 C 90 165, 170 245, 260 200 S 400 180, 400 180 V250 H0z" fill={t.b} opacity="0.7" />
          <circle cx="320" cy="60" r="34" fill={t.c} opacity="0.5" />
        </g>
      );
    case "dots":
      return (
        <g>
          {Array.from({ length: 60 }, (_, i) => (
            <circle
              key={i}
              cx={20 + (i % 12) * 34}
              cy={22 + Math.floor(i / 12) * 48}
              r={4 + ((i * 5) % 7)}
              fill={[t.a, t.b, t.c][i % 3]}
              opacity="0.55"
            />
          ))}
        </g>
      );
    case "arc":
      return (
        <g fill="none" strokeWidth="26" strokeLinecap="round">
          <path d="M40 240 A 160 160 0 0 1 360 240" stroke={t.a} opacity="0.5" />
          <path d="M100 240 A 100 100 0 0 1 300 240" stroke={t.b} opacity="0.6" />
          <path d="M260 20 A 80 80 0 0 0 400 100" stroke={t.c} opacity="0.4" />
        </g>
      );
  }
}

export function StoryVisual({
  variant,
  tone,
  icon,
  alt,
  className,
  iconSize = "size-12",
  photo,
  priority = false,
  animated = false,
}: {
  variant: VisualVariant;
  tone: Tone;
  icon: IconName;
  alt: string;
  className?: string;
  iconSize?: string;
  /** `position` is a CSS object-position that keeps the subject in frame when cropped. */
  photo?: { src: string; width: number; height: number; position?: string };
  priority?: boolean;
  /** Gently animates the pattern and icon (used on lesson cards, not news tiles). */
  animated?: boolean;
}) {
  if (photo) {
    return (
      <div className={cx("relative overflow-hidden bg-muted", className)}>
        <Image src={photo.src} alt={alt} fill priority={priority} sizes="(min-width: 1024px) 50vw, 100vw" className="object-cover" style={{ objectPosition: photo.position ?? "center 75%" }} />
      </div>
    );
  }
  const t = tones[tone];
  return (
    <div className={cx("relative overflow-hidden", className)} style={{ background: t.bg }} role="img" aria-label={alt}>
      <svg viewBox="0 0 400 250" preserveAspectRatio="xMidYMid slice" className={cx("absolute inset-0 size-full", animated && "pattern-animate")} aria-hidden>
        <Pattern variant={variant} t={t} />
      </svg>
      <div className={cx("absolute bottom-4 left-4 rounded-2xl p-2.5", animated && "icon-bob")} style={{ color: t.icon, background: "rgb(0 0 0 / 0.12)" }}>
        <Icon name={icon} className={iconSize} />
      </div>
    </div>
  );
}

export const toneColours = tones;
