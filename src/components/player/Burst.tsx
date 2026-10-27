import "./fx.css";

/* A small burst of brand-coloured confetti from the centre of its parent (which must be positioned). Decorative. */
const COLOURS = ["#ffc72c", "#0e7c7b", "#f26a36", "#2b6636", "#102a43", "#ffc72c", "#0e7c7b", "#d32f2f", "#ffc72c", "#0e7c7b"];

export function Burst({ distance = 34 }: { distance?: number }) {
  return (
    <span aria-hidden className="fx-burst pointer-events-none absolute left-1/2 top-1/2 size-0">
      {COLOURS.map((c, i) => (
        <span
          key={i}
          className={i % 3 === 0 ? "absolute -ml-[3px] -mt-[3px] size-1.5 rounded-full" : "absolute -ml-[2px] -mt-[4px] h-2 w-1 rounded-sm"}
          style={{ background: c, "--a": `${i * 36 + (i % 2) * 12}deg`, "--d": `-${distance + (i % 3) * 10}px` } as React.CSSProperties}
        />
      ))}
    </span>
  );
}
