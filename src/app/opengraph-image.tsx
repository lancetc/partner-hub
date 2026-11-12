import { readFile } from "node:fs/promises";
import { join } from "node:path";
import { ImageResponse } from "next/og";

/* The picture shown when a link to the hub is shared, for pages without a picture of their own. */
export const alt = "Trilogy Care Partner Hub";
export const size = { width: 1200, height: 630 };
export const contentType = "image/png";

export default async function OpenGraphImage() {
  const logo = await readFile(join(process.cwd(), "public/brand/trilogy-logo-dark.svg"));
  return new ImageResponse(
    <div
      style={{
        width: "100%",
        height: "100%",
        display: "flex",
        flexDirection: "column",
        justifyContent: "space-between",
        padding: 80,
        background: "linear-gradient(160deg, #36537f 0%, #2d4875 100%)",
        color: "white",
        position: "relative",
      }}
    >
      {/* The brand's petals, top right. */}
      <div
        style={{ position: "absolute", right: 90, top: 70, width: 220, height: 110, borderRadius: 110, background: "#0e7c7b", transform: "rotate(-30deg)" }}
      />
      <div
        style={{
          position: "absolute",
          right: 40,
          top: 220,
          width: 190,
          height: 95,
          borderRadius: 95,
          background: "#ffc72c",
          opacity: 0.9,
          transform: "rotate(40deg)",
        }}
      />
      <div style={{ position: "absolute", right: 330, top: 60, width: 44, height: 44, borderRadius: 22, background: "#f26a36" }} />
      <img src={`data:image/svg+xml;base64,${logo.toString("base64")}`} alt="" width={372} height={120} />
      <div style={{ display: "flex", flexDirection: "column" }}>
        <div style={{ fontSize: 84, fontWeight: 700, letterSpacing: -2 }}>Partner Hub</div>
        <div style={{ fontSize: 36, marginTop: 12, opacity: 0.9 }}>News and practical learning for Care Partners and care coordinators</div>
      </div>
    </div>,
    size,
  );
}
