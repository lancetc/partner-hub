import { GUIDE_ROLES } from "@/lib/magazine";
import { Icon, type IconName } from "./Icon";

/*
  Tags on a tile's picture (the owner, Nov 2026), the same on Topics, Discovery Paths, the Magazine and the homepage:
  what it is and how long it takes bottom left, as small dark chips with their icons, and who it's for bottom right, as
  a light tag. When it's for a few roles the tag reads "Suppliers +1", and hovering the card (or focusing its link)
  slides the others up above it so the whole audience can be read. The parent is the picture's positioned wrapper,
  inside a `group` card.
*/

const TAG =
  "rounded-full bg-white/90 px-2.5 py-1 font-mulish text-xs font-extrabold uppercase tracking-[0.1em] text-[#102a43] shadow-sm backdrop-blur-sm";

/** The roles named, in the usual order; every role or none named means everyone, so an empty list. */
function namedRoles(roles: readonly string[]) {
  const known = GUIDE_ROLES.filter((r) => roles.includes(r.value));
  return known.length === GUIDE_ROLES.length ? [] : known.map((r) => r.label);
}

/** Who it's for, short enough for a tile: one role by name, a few as "Suppliers +1", every role (or none named) as "Everyone". */
export function roleTag(roles: readonly string[]): string {
  const named = namedRoles(roles);
  if (!named.length) return "Everyone";
  return named.length === 1 ? named[0] : `${named[0]} +${named.length - 1}`;
}

export function PictureTags({ items, roles }: { items: { icon: IconName; text: string }[]; roles?: readonly string[] | null }) {
  const named = roles ? namedRoles(roles) : null;
  return (
    <div className="pointer-events-none absolute inset-x-2.5 bottom-2.5 flex items-end justify-between gap-2">
      <span className="flex min-w-0 flex-wrap gap-1.5">
        {items.map((i) => (
          <span
            key={i.text}
            className="inline-flex items-center gap-1 whitespace-nowrap rounded-full bg-[#102a43]/70 px-2.5 py-1 text-xs font-semibold text-white shadow-sm backdrop-blur-sm"
          >
            <Icon name={i.icon} className="size-3.5" /> {i.text}
          </span>
        ))}
      </span>
      {named && (
        <span className="relative flex shrink-0 flex-col items-end">
          {named.length > 1 && (
            // The rest of the audience, waiting below the tag; it slides up into view on hover or focus.
            <span className="absolute bottom-full right-0 mb-1 flex flex-col items-end gap-1" aria-hidden>
              {named.slice(1).map((label, i) => (
                <span
                  key={label}
                  style={{ transitionDelay: `${i * 50}ms` }}
                  className={`${TAG} translate-y-2 whitespace-nowrap opacity-0 transition duration-200 ease-out group-focus-within:translate-y-0 group-focus-within:opacity-100 group-hover:translate-y-0 group-hover:opacity-100 motion-reduce:translate-y-0 motion-reduce:transition-none`}
                >
                  {label}
                </span>
              ))}
            </span>
          )}
          <span className={`${TAG} whitespace-nowrap`}>
            <span className="sr-only">For </span>
            {named[0] ?? "Everyone"}
            {named.length > 1 && (
              <>
                <span className="group-focus-within:hidden group-hover:hidden" aria-hidden>
                  {" "}
                  +{named.length - 1}
                </span>
                <span className="sr-only">, {named.slice(1).join(", ")}</span>
              </>
            )}
          </span>
        </span>
      )}
    </div>
  );
}
