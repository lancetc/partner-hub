import { Fragment } from "react";
import { cx } from "@/lib/format";
import { parseInline, parseRich, type Inline } from "@/lib/richText";

/** Bold, italics, links, line breaks: built as elements, never as HTML. */
function Inlines({ c }: { c: Inline[] }) {
  return (
    <>
      {c.map((x, i) =>
        x.t === "text" ? (
          <Fragment key={i}>{x.v}</Fragment>
        ) : x.t === "br" ? (
          <br key={i} />
        ) : x.t === "b" ? (
          <strong key={i} className="font-bold">
            <Inlines c={x.c} />
          </strong>
        ) : x.t === "i" ? (
          <em key={i}>
            <Inlines c={x.c} />
          </em>
        ) : (
          // Same window, like documents: the lesson remembers the card for when they come back.
          <a key={i} href={x.href} className="font-semibold underline decoration-2 underline-offset-2 hover:decoration-[3px]">
            <Inlines c={x.c} />
          </a>
        ),
      )}
    </>
  );
}

/**
  A card's body text with its formatting (see lib/richText). Tables sit on white so they stay
  readable on any card colour or photo, and scroll sideways on a narrow phone rather than squash.
*/
export function RichText({ text, className }: { text: string; className?: string }) {
  const blocks = parseRich(text);
  return (
    <div className={cx("flex flex-col gap-3", className)}>
      {blocks.map((b, i) =>
        b.t === "p" ? (
          <p key={i}>
            <Inlines c={b.c} />
          </p>
        ) : b.t === "ul" || b.t === "ol" ? (
          (() => {
            const List = b.t;
            return (
              <List key={i} className={cx("flex flex-col gap-1 pl-6", b.t === "ul" ? "list-disc" : "list-decimal")}>
                {b.items.map((it, j) => (
                  <li key={j}>
                    <Inlines c={it} />
                  </li>
                ))}
              </List>
            );
          })()
        ) : (
          <div
            key={i}
            className="-mx-1 overflow-x-auto rounded-2xl bg-white text-[0.95rem] leading-snug text-[#102a43] shadow-sm ring-1 ring-[rgb(16_42_67/0.14)]"
          >
            <table className="w-full border-collapse text-left">
              {b.head && (
                <thead className="bg-[#e8eef6]">
                  <tr>
                    {b.head.map((c, j) => (
                      <th key={j} scope="col" className="px-3 py-2 align-bottom font-bold text-[#2d4875]">
                        <Inlines c={c} />
                      </th>
                    ))}
                  </tr>
                </thead>
              )}
              <tbody>
                {b.rows.map((r, j) => (
                  <tr key={j} className="border-t border-[rgb(16_42_67/0.1)] first:border-t-0">
                    {r.map((c, k) => (
                      <td key={k} className="px-3 py-2 align-top">
                        <Inlines c={c} />
                      </td>
                    ))}
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        ),
      )}
    </div>
  );
}

/** One line of text with bold, italics and links, for short items such as key point tiles. */
export function RichInline({ text }: { text: string }) {
  return <Inlines c={parseInline(text)} />;
}
