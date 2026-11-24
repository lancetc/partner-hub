import type { ObjectKind, RoomId } from "@/lib/hazardScan";

/*
  The Spot the Hazard rooms, drawn in code (docs/spot-the-hazard.md). Each room is a fixed template; each object is a
  small drawing placed at known coordinates, so a variant can move or swap objects without new images, and a reviewer
  can check exactly what's depicted where. Flat, calm, Australian-home illustration: timber floors, a hallway to the
  bathroom, a kitchen window onto the roses. Colours are CSS variables with a dark-mode set, so the same scene reads
  in both themes. No animation.

  The scene is 1200 × 800 units; an object's x and y are percentages of that, its drawing centred on (0, 0).
*/

export const SCENE_W = 1200;
export const SCENE_H = 800;

/** The palette, light and dark. Applied on the wrapper; the drawings only use the variables. */
export const SCENE_PALETTE = [
  "[--hz-wall:#efe4d3] dark:[--hz-wall:#5d564b]",
  "[--hz-wall2:#e2d3bd] dark:[--hz-wall2:#4f493f]",
  "[--hz-trim:#fbf8f2] dark:[--hz-trim:#77705f]",
  "[--hz-floor:#cfa778] dark:[--hz-floor:#76593f]",
  "[--hz-floor2:#b78d5e] dark:[--hz-floor2:#634a34]",
  "[--hz-tile:#ebe8e1] dark:[--hz-tile:#5c5a53]",
  "[--hz-tile2:#d3cfc5] dark:[--hz-tile2:#4a4842]",
  "[--hz-wood:#b07a44] dark:[--hz-wood:#94663a]",
  "[--hz-wood2:#7f5631] dark:[--hz-wood2:#644425]",
  "[--hz-fabric:#8db2c8] dark:[--hz-fabric:#6a8ea4]",
  "[--hz-fabric2:#e8b49c] dark:[--hz-fabric2:#b08571]",
  "[--hz-fabric3:#9cbf8a] dark:[--hz-fabric3:#77976a]",
  "[--hz-metal:#b8bec5] dark:[--hz-metal:#9aa1a8]",
  "[--hz-white:#ffffff] dark:[--hz-white:#e4e0d8]",
  "[--hz-sky:#cfe7f4] dark:[--hz-sky:#3d6378]",
  "[--hz-green:#6c9a55] dark:[--hz-green:#5d8748]",
  "[--hz-rose:#d8577a] dark:[--hz-rose:#c9506f]",
  "[--hz-card:#d9b27c] dark:[--hz-card:#b18c5a]",
  "[--hz-ink:#3a342d] dark:[--hz-ink:#16130f]",
  "[--hz-shade:rgb(20_24_40/0.42)] dark:[--hz-shade:rgb(0_0_0/0.5)]",
].join(" ");

const ink = { stroke: "var(--hz-ink)", strokeWidth: 3, strokeLinejoin: "round", strokeLinecap: "round" } as const;
const thin = { ...ink, strokeWidth: 2 } as const;
const shadow = (w: number, y = 0) => <ellipse cx={0} cy={y} rx={w / 2} ry={7} fill="var(--hz-ink)" opacity={0.15} />;

// ---------------------------------------------------------------------------------------------
// Rooms
// ---------------------------------------------------------------------------------------------

function Window({ x, y, w, h, garden = false }: { x: number; y: number; w: number; h: number; garden?: boolean }) {
  return (
    <g>
      <rect x={x - 10} y={y - 10} width={w + 20} height={h + 20} rx={4} fill="var(--hz-trim)" {...thin} />
      <rect x={x} y={y} width={w} height={h} fill="var(--hz-sky)" {...thin} />
      {garden ? (
        <g>
          <rect x={x} y={y + h * 0.62} width={w} height={h * 0.38} fill="var(--hz-green)" />
          {[0.12, 0.3, 0.5, 0.7, 0.88].map((f, i) => (
            <g key={i}>
              <circle cx={x + w * f} cy={y + h * 0.6} r={12} fill="var(--hz-green)" />
              <circle cx={x + w * f - 5} cy={y + h * 0.56} r={6} fill="var(--hz-rose)" />
              <circle cx={x + w * f + 6} cy={y + h * 0.62} r={5} fill="var(--hz-rose)" />
            </g>
          ))}
        </g>
      ) : (
        <path d={`M${x} ${y + h * 0.72} q${w * 0.25} -${h * 0.18} ${w * 0.5} 0 t${w * 0.5} 0 V${y + h} H${x} Z`} fill="var(--hz-green)" opacity={0.75} />
      )}
      <line x1={x + w / 2} y1={y} x2={x + w / 2} y2={y + h} {...thin} />
      <line x1={x} y1={y + h / 2} x2={x + w} y2={y + h / 2} {...thin} />
    </g>
  );
}

function Floor({ tiles = false, from = 520 }: { tiles?: boolean; from?: number }) {
  return (
    <g>
      <rect x={0} y={from} width={SCENE_W} height={SCENE_H - from} fill={tiles ? "var(--hz-tile)" : "var(--hz-floor)"} />
      {tiles
        ? [...Array(13)].map((_, i) => <line key={`v${i}`} x1={i * 100} y1={from} x2={i * 100 - 60} y2={SCENE_H} stroke="var(--hz-tile2)" strokeWidth={2} />)
        : [...Array(6)].map((_, i) => (
            <line key={`b${i}`} x1={0} y1={from + 22 + i * 48} x2={SCENE_W} y2={from + 22 + i * 48} stroke="var(--hz-floor2)" strokeWidth={2} />
          ))}
      {tiles &&
        [...Array(5)].map((_, i) => (
          <line key={`h${i}`} x1={0} y1={from + 40 + i * 60} x2={SCENE_W} y2={from + 40 + i * 60} stroke="var(--hz-tile2)" strokeWidth={2} />
        ))}
    </g>
  );
}

function Skirting({ x1 = 0, x2 = SCENE_W }: { x1?: number; x2?: number }) {
  return <rect x={x1} y={506} width={x2 - x1} height={16} fill="var(--hz-trim)" stroke="var(--hz-ink)" strokeWidth={2} />;
}

function BedroomHall() {
  return (
    <g>
      <rect x={0} y={0} width={760} height={520} fill="var(--hz-wall)" />
      <rect x={760} y={0} width={440} height={520} fill="var(--hz-wall2)" />
      <Floor />
      {/* A runner down the hallway floor. */}
      <rect x={772} y={560} width={428} height={200} fill="var(--hz-floor2)" opacity={0.35} />
      <Skirting x1={0} x2={740} />
      <Skirting x1={780} x2={1200} />
      {/* The doorway between the bedroom and the hallway: a lintel and the open door. */}
      <rect x={740} y={0} width={40} height={150} fill="var(--hz-trim)" {...thin} />
      <rect x={734} y={150} width={52} height={14} fill="var(--hz-trim)" {...thin} />
      <path d="M786 164 L860 190 L860 540 L786 522 Z" fill="var(--hz-wood)" {...ink} />
      <circle cx={846} cy={360} r={6} fill="var(--hz-metal)" {...thin} />
      <Window x={300} y={90} w={230} h={220} />
      <path d="M280 70 C 300 180 290 260 268 330 L250 330 L250 70 Z" fill="var(--hz-fabric2)" {...thin} />
      <path d="M550 70 C 530 180 540 260 562 330 L580 330 L580 70 Z" fill="var(--hz-fabric2)" {...thin} />
      <line x1={240} y1={68} x2={590} y2={68} {...ink} />
      {/* Bedside table, then the bed with its head beside it, and a reading light on the wall. */}
      <rect x={16} y={470} width={94} height={124} rx={4} fill="var(--hz-wood)" {...ink} />
      <line x1={16} y1={530} x2={110} y2={530} {...thin} />
      <circle cx={63} cy={500} r={4} fill="var(--hz-ink)" />
      <circle cx={63} cy={560} r={4} fill="var(--hz-ink)" />
      <rect x={116} y={330} width={30} height={280} rx={6} fill="var(--hz-wood)" {...ink} />
      <rect x={146} y={445} width={284} height={60} rx={10} fill="var(--hz-white)" {...ink} />
      <path d="M210 440 H430 V520 Q 400 540 210 528 Z" fill="var(--hz-fabric)" {...ink} />
      <rect x={156} y={420} width={70} height={34} rx={14} fill="var(--hz-white)" {...ink} />
      <rect x={146} y={505} width={284} height={30} fill="var(--hz-wood2)" {...ink} />
      <line x1={162} y1={535} x2={162} y2={600} {...ink} strokeWidth={8} />
      <line x1={418} y1={535} x2={418} y2={600} {...ink} strokeWidth={8} />
      <path d="M176 300 V280 H200" fill="none" {...thin} />
      <path d="M196 270 L222 270 L230 296 L188 296 Z" fill="var(--hz-fabric2)" {...thin} />
      {/* Armchair under the window. */}
      <rect x={520} y={420} width={170} height={110} rx={24} fill="var(--hz-fabric3)" {...ink} />
      <rect x={540} y={478} width={130} height={56} rx={12} fill="var(--hz-fabric3)" {...ink} />
      <rect x={506} y={466} width={34} height={88} rx={14} fill="var(--hz-fabric3)" {...ink} />
      <rect x={670} y={466} width={34} height={88} rx={14} fill="var(--hz-fabric3)" {...ink} />
      <line x1={530} y1={554} x2={526} y2={590} {...ink} strokeWidth={7} />
      <line x1={680} y1={554} x2={684} y2={590} {...ink} strokeWidth={7} />
      {/* The hallway: a picture on the wall, and the bathroom at the end. */}
      <rect x={880} y={210} width={70} height={56} fill="var(--hz-trim)" {...thin} />
      <path d="M886 258 L906 232 L924 250 L944 226 L944 258 Z" fill="var(--hz-green)" />
      <rect x={990} y={160} width={160} height={360} fill="var(--hz-trim)" {...ink} />
      <rect x={1004} y={174} width={132} height={346} fill="var(--hz-white)" {...thin} />
      {[0, 1, 2, 3, 4].map((r) =>
        [0, 1, 2].map((c) => (
          <rect key={`${r}-${c}`} x={1006 + c * 44} y={176 + r * 52} width={42} height={50} fill="none" stroke="var(--hz-tile2)" strokeWidth={2} />
        )),
      )}
      <rect x={1040} y={240} width={70} height={8} rx={4} fill="var(--hz-metal)" {...thin} />
      <rect x={1048} y={248} width={54} height={70} fill="var(--hz-fabric)" {...thin} />
      <path d="M1150 160 L1186 140 L1186 540 L1150 520 Z" fill="var(--hz-wood)" {...ink} />
    </g>
  );
}

function BedroomCare() {
  return (
    <g>
      <rect x={0} y={0} width={SCENE_W} height={520} fill="var(--hz-wall)" />
      <Floor />
      <Skirting />
      <Window x={150} y={90} w={250} h={210} />
      <path d="M130 70 C 150 170 140 250 118 320 L100 320 L100 70 Z" fill="var(--hz-fabric)" {...thin} />
      <path d="M420 70 C 400 170 410 250 432 320 L450 320 L450 70 Z" fill="var(--hz-fabric)" {...thin} />
      <line x1={92} y1={68} x2={460} y2={68} {...ink} />
      {/* Bedside table, beside the head of the bed. */}
      <rect x={16} y={470} width={96} height={124} rx={4} fill="var(--hz-wood)" {...ink} />
      <line x1={16} y1={530} x2={112} y2={530} {...thin} />
      <circle cx={64} cy={500} r={4} fill="var(--hz-ink)" />
      {/* Wardrobe and the door. */}
      <rect x={760} y={150} width={170} height={420} rx={4} fill="var(--hz-wood)" {...ink} />
      <line x1={845} y1={150} x2={845} y2={570} {...thin} />
      <circle cx={835} cy={360} r={5} fill="var(--hz-metal)" {...thin} />
      <circle cx={855} cy={360} r={5} fill="var(--hz-metal)" {...thin} />
      <rect x={990} y={140} width={170} height={380} fill="var(--hz-trim)" {...ink} />
      <rect x={1004} y={154} width={142} height={366} fill="var(--hz-wood2)" {...thin} />
      <circle cx={1028} cy={350} r={7} fill="var(--hz-metal)" {...thin} />
      {/* A grab rail by the door, as fitted under his plan. */}
      <rect x={1172} y={300} width={12} height={130} rx={6} fill="var(--hz-metal)" {...thin} />
    </g>
  );
}

function KitchenDining() {
  return (
    <g>
      <rect x={0} y={0} width={SCENE_W} height={520} fill="var(--hz-wall)" />
      <Floor tiles />
      <Skirting x1={780} x2={1200} />
      {/* Overhead cupboards. */}
      <rect x={0} y={40} width={200} height={170} fill="var(--hz-wood)" {...ink} />
      <rect x={460} y={40} width={180} height={170} fill="var(--hz-wood)" {...ink} />
      <line x1={100} y1={40} x2={100} y2={210} {...thin} />
      <line x1={550} y1={40} x2={550} y2={210} {...thin} />
      {/* Window over the sink, onto the roses. */}
      <Window x={235} y={190} w={200} h={180} garden />
      {/* Splashback, bench and base cupboards. */}
      <rect x={0} y={380} width={640} height={76} fill="var(--hz-tile)" />
      {[0, 1, 2, 3, 4, 5, 6, 7, 8, 9].map((i) => (
        <line key={i} x1={i * 64} y1={380} x2={i * 64} y2={456} stroke="var(--hz-tile2)" strokeWidth={2} />
      ))}
      <rect x={0} y={456} width={650} height={18} fill="var(--hz-trim)" {...ink} />
      <rect x={0} y={474} width={640} height={126} fill="var(--hz-wood)" {...ink} />
      {[160, 320, 480].map((x) => (
        <line key={x} x1={x} y1={474} x2={x} y2={600} {...thin} />
      ))}
      {[80, 240, 400, 560].map((x) => (
        <rect key={x} x={x - 14} y={492} width={28} height={6} rx={3} fill="var(--hz-metal)" />
      ))}
      <rect x={0} y={600} width={640} height={14} fill="var(--hz-wood2)" />
      <path d="M270 456 Q 335 470 400 456" fill="none" {...thin} />
      <path d="M330 456 V420 Q 330 404 346 404 H356" fill="none" stroke="var(--hz-metal)" strokeWidth={8} strokeLinecap="round" />
      <rect x={600} y={392} width={30} height={40} rx={4} fill="var(--hz-white)" {...thin} />
      {/* Fridge. */}
      <rect x={660} y={180} width={120} height={430} rx={10} fill="var(--hz-white)" {...ink} />
      <line x1={660} y1={330} x2={780} y2={330} {...thin} />
      <rect x={760} y={220} width={8} height={80} rx={4} fill="var(--hz-metal)" />
      <rect x={760} y={360} width={8} height={100} rx={4} fill="var(--hz-metal)" />
      <rect x={684} y={360} width={46} height={34} fill="var(--hz-fabric2)" {...thin} />
      {/* Back door, behind the table. */}
      <rect x={830} y={140} width={150} height={380} fill="var(--hz-trim)" {...ink} />
      <rect x={844} y={154} width={122} height={366} fill="var(--hz-fabric3)" {...thin} />
      <rect x={862} y={174} width={86} height={120} fill="var(--hz-sky)" {...thin} />
      <circle cx={952} cy={350} r={6} fill="var(--hz-metal)" {...thin} />
      {/* A calendar on the wall, Thursdays circled. */}
      <rect x={1040} y={150} width={90} height={110} fill="var(--hz-white)" {...thin} />
      <rect x={1040} y={150} width={90} height={24} fill="var(--hz-rose)" {...thin} />
      {[0, 1, 2, 3].map((r) =>
        [0, 1, 2, 3].map((c) => <rect key={`${r}${c}`} x={1048 + c * 20} y={182 + r * 18} width={14} height={12} fill="var(--hz-tile2)" />),
      )}
      {/* The dining table and chairs. */}
      <rect x={810} y={456} width={360} height={22} rx={4} fill="var(--hz-wood)" {...ink} />
      <line x1={836} y1={478} x2={836} y2={640} {...ink} strokeWidth={10} />
      <line x1={1144} y1={478} x2={1144} y2={640} {...ink} strokeWidth={10} />
      <path d="M1080 400 V650 M1080 540 H1180 V650 M1180 540 V380" fill="none" {...ink} strokeWidth={8} />
      <rect x={1074} y={530} width={112} height={16} rx={4} fill="var(--hz-wood)" {...ink} />
    </g>
  );
}

/** A small unit: a kitchenette on the left, an armchair and side table under the window, and the bed on the right. */
function UnitLiving() {
  return (
    <g>
      <rect x={0} y={0} width={SCENE_W} height={520} fill="var(--hz-wall)" />
      <Floor />
      <Skirting x1={300} x2={1200} />
      {/* Kitchenette. */}
      <rect x={0} y={50} width={280} height={150} fill="var(--hz-wood)" {...ink} />
      <line x1={140} y1={50} x2={140} y2={200} {...thin} />
      <rect x={0} y={380} width={300} height={76} fill="var(--hz-tile)" />
      {[0, 1, 2, 3, 4].map((i) => (
        <line key={i} x1={i * 64} y1={380} x2={i * 64} y2={456} stroke="var(--hz-tile2)" strokeWidth={2} />
      ))}
      <rect x={0} y={456} width={306} height={18} fill="var(--hz-trim)" {...ink} />
      <rect x={0} y={474} width={300} height={126} fill="var(--hz-wood)" {...ink} />
      <line x1={150} y1={474} x2={150} y2={600} {...thin} />
      {[75, 225].map((x) => (
        <rect key={x} x={x - 14} y={492} width={28} height={6} rx={3} fill="var(--hz-metal)" />
      ))}
      <rect x={0} y={600} width={300} height={14} fill="var(--hz-wood2)" />
      {/* Window with curtains. */}
      <Window x={480} y={90} w={220} h={200} />
      <path d="M460 70 C 480 170 470 250 448 320 L430 320 L430 70 Z" fill="var(--hz-fabric3)" {...thin} />
      <path d="M720 70 C 700 170 710 250 732 320 L750 320 L750 70 Z" fill="var(--hz-fabric3)" {...thin} />
      <line x1={422} y1={68} x2={760} y2={68} {...ink} />
      {/* Armchair under the window, and the side table beside it. */}
      <rect x={520} y={420} width={170} height={110} rx={24} fill="var(--hz-fabric)" {...ink} />
      <rect x={540} y={478} width={130} height={56} rx={12} fill="var(--hz-fabric)" {...ink} />
      <rect x={506} y={466} width={34} height={88} rx={14} fill="var(--hz-fabric)" {...ink} />
      <rect x={670} y={466} width={34} height={88} rx={14} fill="var(--hz-fabric)" {...ink} />
      <line x1={530} y1={554} x2={526} y2={590} {...ink} strokeWidth={7} />
      <line x1={680} y1={554} x2={684} y2={590} {...ink} strokeWidth={7} />
      <rect x={712} y={470} width={130} height={14} rx={3} fill="var(--hz-wood)" {...ink} />
      <line x1={726} y1={484} x2={726} y2={600} {...ink} strokeWidth={7} />
      <line x1={828} y1={484} x2={828} y2={600} {...ink} strokeWidth={7} />
      {/* A print on the wall above the bed. */}
      <rect x={980} y={170} width={110} height={80} fill="var(--hz-trim)" {...thin} />
      <path d="M988 242 L1012 210 L1034 232 L1058 200 L1082 242 Z" fill="var(--hz-fabric2)" />
    </g>
  );
}

export function RoomArt({ room }: { room: RoomId }) {
  if (room === "bedroom-care") return <BedroomCare />;
  if (room === "kitchen-dining") return <KitchenDining />;
  if (room === "unit-living") return <UnitLiving />;
  return <BedroomHall />;
}

/** The dim hallway, laid over its objects: the bedroom-hall room only. */
export function DimOverlay({ room }: { room: RoomId }) {
  if (room !== "bedroom-hall") return null;
  return <rect x={760} y={0} width={440} height={SCENE_H} fill="var(--hz-shade)" pointerEvents="none" />;
}

// ---------------------------------------------------------------------------------------------
// Objects
// ---------------------------------------------------------------------------------------------

function Heater({ look }: { look: string }) {
  const body = (
    <g>
      <rect x={-50} y={-70} width={74} height={92} rx={10} fill="var(--hz-white)" {...ink} />
      {[-38, -24, -10, 4].map((x) => (
        <line key={x} x1={x + 4} y1={-60} x2={x + 4} y2={12} {...thin} />
      ))}
      <circle cx={14} cy={-58} r={5} fill="var(--hz-rose)" />
      <line x1={-44} y1={22} x2={-44} y2={34} {...ink} />
      <line x1={18} y1={22} x2={18} y2={34} {...ink} />
    </g>
  );
  if (look === "cord-along-wall")
    return (
      <g transform="translate(-60 17)">
        {shadow(90, 36)}
        {body}
        <path d="M24 0 C 50 0 52 -20 80 -20 H150" fill="none" stroke="var(--hz-ink)" strokeWidth={5} strokeLinecap="round" />
        <rect x={146} y={-34} width={24} height={30} rx={4} fill="var(--hz-white)" {...thin} />
      </g>
    );
  // The cord runs from the heater down across the floor to a power board in front of it.
  return (
    <g transform="translate(-34 -69)">
      {shadow(90, 36)}
      {body}
      <path d="M24 4 C 70 10 20 70 60 110 S 40 170 70 190" fill="none" stroke="var(--hz-ink)" strokeWidth={5} strokeLinecap="round" />
      <rect x={48} y={186} width={70} height={22} rx={6} fill="var(--hz-white)" {...thin} />
      {[60, 76, 92].map((x) => (
        <circle key={x} cx={x} cy={197} r={4} fill="var(--hz-ink)" />
      ))}
    </g>
  );
}

function Rug({ look }: { look: string }) {
  const flat = "M-130 -24 L120 -24 L140 24 L-150 24 Z";
  return (
    <g transform={look === "curled" ? "translate(5 20)" : "translate(5 0)"}>
      <path d={flat} fill="var(--hz-fabric2)" {...ink} />
      <path d="M-112 -12 L104 -12 L116 12 L-126 12 Z" fill="none" stroke="var(--hz-rose)" strokeWidth={4} />
      {look === "curled" && (
        <g>
          <path d="M100 -24 L120 -24 L140 24 L118 24 Q 98 -6 100 -24 Z" fill="var(--hz-floor)" stroke="none" />
          <path d="M100 -24 Q 96 -60 126 -64 Q 150 -40 140 24 L118 24 Q 98 -6 100 -24 Z" fill="var(--hz-fabric2)" {...ink} />
          <path d="M110 -30 Q 112 -50 128 -54" fill="none" stroke="var(--hz-rose)" strokeWidth={4} />
        </g>
      )}
    </g>
  );
}

function CeilingLight({ look }: { look: string }) {
  return (
    <g transform="translate(0 10)">
      <line x1={0} y1={-60} x2={0} y2={-14} {...thin} />
      {look === "on" && <circle cx={0} cy={18} r={44} fill="#ffe9a8" opacity={0.55} />}
      <path d="M-34 14 L-18 -14 L18 -14 L34 14 Z" fill="var(--hz-white)" {...ink} />
      {look === "on" ? (
        <circle cx={0} cy={22} r={11} fill="#ffd45c" {...thin} />
      ) : (
        <rect x={-6} y={14} width={12} height={10} fill="var(--hz-metal)" {...thin} />
      )}
    </g>
  );
}

function WalkingStick() {
  return (
    <g>
      <path d="M-24 -78 Q -26 -96 -8 -96 Q 8 -96 8 -82" fill="none" stroke="var(--hz-wood2)" strokeWidth={9} strokeLinecap="round" />
      <line x1={-24} y1={-78} x2={14} y2={78} stroke="var(--hz-wood2)" strokeWidth={9} strokeLinecap="round" />
      <rect x={8} y={74} width={14} height={12} rx={3} fill="var(--hz-ink)" transform="rotate(-14 15 80)" />
    </g>
  );
}

function Photos() {
  return (
    <g>
      <rect x={-56} y={-34} width={44} height={56} fill="var(--hz-wood)" {...thin} />
      <rect x={-50} y={-28} width={32} height={44} fill="var(--hz-sky)" />
      <circle cx={-34} cy={-12} r={8} fill="var(--hz-fabric2)" />
      <path d="M-46 16 Q -34 -2 -22 16 Z" fill="var(--hz-fabric)" />
      <rect x={-6} y={-22} width={58} height={44} fill="var(--hz-metal)" {...thin} />
      <rect x={0} y={-16} width={46} height={32} fill="var(--hz-sky)" />
      <circle cx={14} cy={-4} r={6} fill="var(--hz-fabric2)" />
      <circle cx={32} cy={-2} r={6} fill="var(--hz-fabric2)" />
      <path d="M4 16 Q 14 4 24 16 M22 16 Q 32 4 42 16" fill="var(--hz-fabric3)" />
    </g>
  );
}

function Boxes() {
  return (
    <g>
      {shadow(150, 62)}
      <rect x={-72} y={-4} width={144} height={66} fill="var(--hz-card)" {...ink} />
      <rect x={-60} y={-66} width={118} height={62} fill="var(--hz-card)" {...ink} />
      <line x1={-72} y1={14} x2={72} y2={14} stroke="var(--hz-wood2)" strokeWidth={4} />
      <line x1={-60} y1={-48} x2={58} y2={-48} stroke="var(--hz-wood2)" strokeWidth={4} />
      <rect x={-20} y={-36} width={40} height={20} fill="var(--hz-white)" {...thin} />
      <line x1={-12} y1={-26} x2={12} y2={-26} {...thin} />
    </g>
  );
}

function Slippers({ look }: { look: string }) {
  const worn = look === "backless-worn";
  const one = (dx: number) =>
    worn ? (
      <g transform={`translate(${dx} 0)`}>
        <path d="M-34 8 Q -36 -6 -10 -8 L22 -6 Q 36 -4 34 8 Z" fill="var(--hz-fabric)" {...thin} />
        <path d="M-10 -8 Q 6 -22 22 -6" fill="var(--hz-fabric)" {...thin} />
        <path d="M-30 4 l4 -4 m6 4 l4 -4" stroke="var(--hz-ink)" strokeWidth={2} />
      </g>
    ) : (
      <g transform={`translate(${dx} 0)`}>
        <path d="M-34 8 Q -38 -14 -26 -18 L-22 -4 L22 -6 Q 36 -4 34 8 Z" fill="var(--hz-fabric)" {...thin} />
        <path d="M-6 -6 Q 8 -24 24 -6" fill="var(--hz-fabric)" {...thin} />
        <rect x={-34} y={6} width={68} height={5} rx={2} fill="var(--hz-ink)" />
      </g>
    );
  return (
    <g>
      {one(-28)}
      {one(30)}
    </g>
  );
}

function BathMat({ look }: { look: string }) {
  if (look === "rucked")
    return (
      <g>
        <path d="M-80 14 Q -50 -18 -20 6 Q 0 -30 24 4 Q 50 -14 80 14 Z" fill="var(--hz-fabric3)" {...ink} />
        <path d="M-60 6 Q -50 -8 -36 4 M-6 -6 Q 4 -18 16 -2" fill="none" stroke="var(--hz-white)" strokeWidth={3} />
      </g>
    );
  return (
    <g>
      <path d="M-76 -12 L72 -12 L82 14 L-86 14 Z" fill="var(--hz-fabric3)" {...ink} />
      <path d="M-66 0 H70" stroke="var(--hz-white)" strokeWidth={3} strokeDasharray="6 6" />
    </g>
  );
}

function NightLight() {
  return (
    <g>
      <circle cx={0} cy={-6} r={28} fill="#ffe9a8" opacity={0.5} />
      <rect x={-14} y={-24} width={28} height={36} rx={8} fill="var(--hz-white)" {...thin} />
      <circle cx={0} cy={-6} r={8} fill="#ffd45c" />
    </g>
  );
}

function Plant() {
  return (
    <g transform="translate(0 17)">
      {shadow(70, 62)}
      <path d="M-30 14 L30 14 L22 62 L-22 62 Z" fill="var(--hz-rose)" {...ink} />
      {[
        [-26, -40, -40],
        [0, -62, 0],
        [24, -44, 40],
        [-12, -20, -20],
        [14, -18, 24],
      ].map(([x, y, r], i) => (
        <ellipse key={i} cx={x} cy={y} rx={14} ry={32} transform={`rotate(${r} ${x} ${y})`} fill="var(--hz-green)" {...thin} />
      ))}
    </g>
  );
}

function Castor({ x, up }: { x: number; up: boolean }) {
  return (
    <g transform={`translate(${x} 0)`}>
      <line x1={0} y1={56} x2={0} y2={82} {...ink} strokeWidth={6} />
      <circle cx={0} cy={94} r={14} fill="var(--hz-ink)" />
      <circle cx={0} cy={94} r={5} fill="var(--hz-metal)" />
      {/* The brake pedal: pressed down onto the wheel, or sticking up. */}
      {up ? (
        <rect x={6} y={58} width={36} height={10} rx={3} fill="var(--hz-rose)" {...thin} transform="rotate(-38 6 68)" />
      ) : (
        <rect x={8} y={80} width={34} height={10} rx={3} fill="var(--hz-rose)" {...thin} />
      )}
    </g>
  );
}

function CareBed({ look }: { look: string }) {
  const up = look === "brake-up";
  return (
    <g>
      {shadow(400, 110)}
      <rect x={-210} y={-120} width={26} height={176} rx={6} fill="var(--hz-wood)" {...ink} />
      <rect x={188} y={-60} width={24} height={116} rx={6} fill="var(--hz-wood)" {...ink} />
      <rect x={-184} y={-30} width={372} height={44} rx={10} fill="var(--hz-white)" {...ink} />
      <path d="M-120 -34 H188 V24 Q 120 36 -120 22 Z" fill="var(--hz-fabric)" {...ink} />
      <rect x={-176} y={-54} width={76} height={30} rx={13} fill="var(--hz-white)" {...ink} />
      {/* Half rail, lowered. */}
      <rect x={-140} y={8} width={150} height={10} rx={5} fill="var(--hz-metal)" {...thin} />
      <rect x={-184} y={14} width={372} height={22} fill="var(--hz-metal)" {...ink} />
      <path d="M-150 36 L-60 56 M150 36 L60 56 M-60 56 H60" fill="none" stroke="var(--hz-metal)" strokeWidth={8} />
      <line x1={-150} y1={36} x2={-150} y2={56} {...ink} strokeWidth={6} />
      <line x1={150} y1={36} x2={150} y2={56} {...ink} strokeWidth={6} />
      <Castor x={-150} up={false} />
      <Castor x={150} up={up} />
      {/* The handset, hooked on the rail. */}
      <rect x={20} y={0} width={16} height={34} rx={5} fill="var(--hz-white)" {...thin} />
    </g>
  );
}

function Commode({ look }: { look: string }) {
  return (
    <g>
      {shadow(130, 92)}
      <rect x={-48} y={-90} width={96} height={66} rx={8} fill="var(--hz-white)" {...ink} />
      <rect x={-56} y={-18} width={112} height={20} rx={8} fill="var(--hz-white)" {...ink} />
      <ellipse cx={0} cy={-8} rx={22} ry={6} fill="var(--hz-tile2)" />
      <path d="M-62 -40 H-44 V-8 M62 -40 H44 V-8" fill="none" stroke="var(--hz-white)" strokeWidth={10} strokeLinecap="round" />
      <path d="M-62 -40 H-44 V-8 M62 -40 H44 V-8" fill="none" stroke="var(--hz-ink)" strokeWidth={2} />
      <path d="M-46 2 L-50 70 M46 2 L50 70 M-48 40 H48" fill="none" stroke="var(--hz-metal)" strokeWidth={7} strokeLinecap="round" />
      {[-50, 50].map((x) => (
        <g key={x}>
          <circle cx={x} cy={80} r={11} fill="var(--hz-ink)" />
          <circle cx={x} cy={80} r={4} fill="var(--hz-metal)" />
        </g>
      ))}
      {look === "cracked" && (
        <g>
          {/* A split across the right armrest, with a piece broken away. */}
          <path d="M44 -44 L52 -36 L46 -28 L56 -20 L50 -10" fill="none" stroke="var(--hz-ink)" strokeWidth={3} />
          <path d="M56 -42 L66 -40 L64 -30 Z" fill="var(--hz-ink)" />
        </g>
      )}
    </g>
  );
}

function WalkingFrame({ look }: { look: string }) {
  const legs = [-54, -30, 30, 54];
  return (
    <g>
      {shadow(130, 74)}
      <path d="M-54 -66 H54" stroke="var(--hz-metal)" strokeWidth={10} strokeLinecap="round" />
      <rect x={-64} y={-74} width={26} height={14} rx={6} fill="var(--hz-ink)" />
      <rect x={38} y={-74} width={26} height={14} rx={6} fill="var(--hz-ink)" />
      {legs.map((x, i) => (
        <g key={x}>
          <line x1={x * 0.9} y1={-66} x2={x} y2={62} stroke="var(--hz-metal)" strokeWidth={8} strokeLinecap="round" />
          {look === "tip-missing" && i === 3 ? (
            <ellipse cx={x} cy={66} rx={4} ry={3} fill="none" {...thin} />
          ) : (
            <rect x={x - 7} y={58} width={14} height={14} rx={4} fill="var(--hz-ink)" />
          )}
        </g>
      ))}
      <line x1={-50} y1={0} x2={50} y2={0} stroke="var(--hz-metal)" strokeWidth={6} />
    </g>
  );
}

function GlassesBook() {
  return (
    <g>
      <rect x={-44} y={-6} width={70} height={16} rx={2} fill="var(--hz-rose)" {...thin} />
      <line x1={-40} y1={4} x2={22} y2={4} stroke="var(--hz-white)" strokeWidth={2} />
      <circle cx={8} cy={-16} r={10} fill="var(--hz-sky)" {...thin} />
      <circle cx={34} cy={-16} r={10} fill="var(--hz-sky)" {...thin} />
      <line x1={18} y1={-16} x2={24} y2={-16} {...thin} />
    </g>
  );
}

function Radio() {
  return (
    <g>
      <rect x={-40} y={-22} width={80} height={44} rx={8} fill="var(--hz-wood)" {...ink} />
      <rect x={-30} y={-12} width={30} height={24} rx={4} fill="var(--hz-white)" {...thin} />
      <circle cx={20} cy={0} r={10} fill="var(--hz-white)" {...thin} />
      <line x1={-30} y1={-22} x2={-44} y2={-48} {...thin} />
    </g>
  );
}

function ClothesChair() {
  return (
    <g>
      {shadow(110, 84)}
      <path d="M-44 -86 V84 M44 -86 V84 M-44 -10 H44" fill="none" stroke="var(--hz-wood2)" strokeWidth={9} strokeLinecap="round" />
      <rect x={-52} y={-6} width={104} height={14} rx={4} fill="var(--hz-wood)" {...ink} />
      <rect x={-44} y={-86} width={88} height={34} rx={6} fill="var(--hz-wood)" {...ink} />
      <rect x={-40} y={-26} width={80} height={20} rx={5} fill="var(--hz-fabric)" {...thin} />
      <rect x={-36} y={-42} width={72} height={16} rx={5} fill="var(--hz-white)" {...thin} />
    </g>
  );
}

function UsedPpe() {
  return (
    <g>
      <path d="M-46 8 Q -50 -10 -30 -14 L-22 -24 L-14 -12 L-4 -22 L2 -8 Q 10 6 -6 12 Z" fill="#6aa8e0" {...thin} />
      <path d="M-10 12 Q -8 -4 8 -8 L16 -18 L22 -4 L32 -12 L34 4 Q 34 16 18 16 Z" fill="#6aa8e0" {...thin} />
      <path d="M20 -2 Q 44 -14 56 4 Q 44 18 22 10 Z" fill="var(--hz-white)" {...thin} />
      <path d="M26 2 H50 M28 8 H46" stroke="var(--hz-tile2)" strokeWidth={2} />
    </g>
  );
}

function Sanitiser() {
  return (
    <g>
      <rect x={-16} y={-16} width={32} height={54} rx={8} fill="var(--hz-sky)" {...ink} />
      <rect x={-8} y={-30} width={16} height={14} fill="var(--hz-white)" {...thin} />
      <path d="M-4 -30 V-40 H18" fill="none" {...thin} />
      <rect x={-10} y={0} width={20} height={18} rx={2} fill="var(--hz-white)" />
    </g>
  );
}

function Spill() {
  return (
    <g>
      <path
        d="M-74 4 Q -80 -14 -40 -16 Q -20 -30 20 -18 Q 70 -22 76 0 Q 84 18 40 18 Q 0 26 -40 18 Q -78 20 -74 4 Z"
        fill="var(--hz-sky)"
        opacity={0.9}
        {...thin}
      />
      <path d="M-40 -4 Q -20 -10 0 -6 M26 -6 Q 40 -8 50 -2" fill="none" stroke="var(--hz-white)" strokeWidth={4} strokeLinecap="round" />
    </g>
  );
}

function ChoppingBoard({ look }: { look: string }) {
  return (
    <g>
      <rect x={-80} y={-10} width={160} height={22} rx={8} fill="var(--hz-wood)" {...ink} />
      <circle cx={-66} cy={0} r={4} fill="var(--hz-wood2)" />
      {look === "raw-and-ready" ? (
        <g>
          {/* Raw chicken on one half; cut salad on the other, on the same board. */}
          <path d="M-52 -10 Q -50 -32 -26 -30 Q -8 -28 -10 -10 Z" fill="#f2a7a0" {...thin} />
          <path d="M-30 -10 Q -26 -24 -12 -22 Q 0 -20 -2 -10 Z" fill="#ef9c95" {...thin} />
          <circle cx={22} cy={-18} r={9} fill="var(--hz-rose)" {...thin} />
          <path d="M38 -10 Q 44 -32 62 -26 Q 70 -14 60 -10 Z" fill="var(--hz-green)" {...thin} />
          <path d="M8 -10 Q 14 -24 30 -22" fill="none" stroke="var(--hz-green)" strokeWidth={5} strokeLinecap="round" />
        </g>
      ) : (
        <path d="M-30 -16 L40 -16 L50 -12 L-30 -12 Z" fill="var(--hz-metal)" {...thin} />
      )}
    </g>
  );
}

function GardenGloves() {
  return (
    <g>
      {[-22, 22].map((x, i) => (
        <g key={x} transform={`translate(${x} 0) rotate(${i ? 12 : -10})`}>
          <path
            d="M-18 22 V-4 Q -20 -24 -10 -24 L-8 -8 L-4 -28 L2 -28 L2 -8 L8 -26 L14 -24 L12 -4 L20 -12 L24 -6 L14 14 V22 Z"
            fill="var(--hz-fabric3)"
            {...thin}
          />
          <rect x={-18} y={14} width={32} height={10} fill="var(--hz-rose)" {...thin} />
        </g>
      ))}
    </g>
  );
}

function RosesVase() {
  return (
    <g transform="translate(-27 0)">
      <path d="M-20 20 Q -28 50 -14 66 H14 Q 28 50 20 20 Z" fill="var(--hz-sky)" {...ink} />
      {[
        [-16, -40],
        [4, -56],
        [20, -36],
        [-4, -22],
      ].map(([x, y], i) => (
        <g key={i}>
          <line x1={x * 0.4} y1={22} x2={x} y2={y} stroke="var(--hz-green)" strokeWidth={4} />
          <circle cx={x} cy={y} r={11} fill="var(--hz-rose)" {...thin} />
          <path d={`M${x - 5} ${y} q5 -6 10 0`} fill="none" stroke="var(--hz-white)" strokeWidth={2} />
        </g>
      ))}
      {/* Secateurs beside the vase. */}
      <path d="M34 62 L66 44 M34 54 L66 58" stroke="var(--hz-rose)" strokeWidth={7} strokeLinecap="round" />
      <path d="M66 44 L82 40 M66 58 L82 50" stroke="var(--hz-metal)" strokeWidth={5} strokeLinecap="round" />
    </g>
  );
}

function BowlsBag() {
  return (
    <g>
      {shadow(110, 44)}
      <rect x={-52} y={-18} width={104} height={62} rx={16} fill="var(--hz-fabric)" {...ink} />
      <path d="M-26 -18 Q 0 -52 26 -18" fill="none" {...ink} strokeWidth={6} />
      <line x1={-44} y1={2} x2={44} y2={2} stroke="var(--hz-white)" strokeWidth={3} strokeDasharray="5 5" />
      <circle cx={-30} cy={24} r={7} fill="var(--hz-white)" {...thin} />
    </g>
  );
}

function Bin() {
  return (
    <g>
      {shadow(70, 54)}
      <path d="M-30 -36 L30 -36 L26 52 L-26 52 Z" fill="var(--hz-metal)" {...ink} />
      <rect x={-34} y={-48} width={68} height={14} rx={6} fill="var(--hz-metal)" {...ink} />
      <rect x={-12} y={48} width={24} height={8} rx={3} fill="var(--hz-ink)" />
    </g>
  );
}

const textStyle = { fontFamily: "system-ui, sans-serif", fontWeight: 700, fill: "var(--hz-ink)" } as const;

/** A fridge with its door open, as when putting the milk away: what's inside is what's drawn. */
function Fridge({ look }: { look: string }) {
  const empty = look === "near-empty";
  return (
    <g transform="translate(-20 0)">
      {shadow(150, 210)}
      <rect x={-60} y={-210} width={120} height={420} rx={10} fill="var(--hz-white)" {...ink} />
      <rect x={-50} y={-196} width={100} height={392} rx={6} fill="var(--hz-sky)" opacity={0.55} />
      {[-110, -20, 70].map((y) => (
        <line key={y} x1={-50} y1={y} x2={50} y2={y} stroke="var(--hz-metal)" strokeWidth={5} />
      ))}
      {/* The open door, swung towards you on the right. */}
      <path d="M60 -210 L104 -190 L104 196 L60 210 Z" fill="var(--hz-white)" {...ink} />
      <line x1={66} y1={-60} x2={98} y2={-54} stroke="var(--hz-metal)" strokeWidth={4} />
      <line x1={66} y1={60} x2={98} y2={62} stroke="var(--hz-metal)" strokeWidth={4} />
      {empty ? (
        <g>
          {/* A near-empty fridge: a little milk, and a container with spots of mould and an old date. */}
          <rect x={-40} y={-160} width={22} height={48} rx={3} fill="var(--hz-white)" {...thin} />
          <rect x={-40} y={-160} width={22} height={10} fill="var(--hz-sky)" />
          <rect x={-6} y={-48} width={46} height={26} rx={4} fill="var(--hz-white)" {...thin} />
          {[
            [4, -38],
            [16, -32],
            [28, -40],
          ].map(([x, y], i) => (
            <circle key={i} cx={x} cy={y} r={4} fill="var(--hz-green)" />
          ))}
          <rect x={-40} y={40} width={44} height={22} rx={3} fill="var(--hz-card)" {...thin} />
          <text x={-18} y={56} fontSize={11} textAnchor="middle" {...textStyle}>
            02/11
          </text>
        </g>
      ) : (
        <g>
          <rect x={-42} y={-168} width={22} height={56} rx={3} fill="var(--hz-white)" {...thin} />
          <rect x={-42} y={-168} width={22} height={12} fill="var(--hz-sky)" />
          <rect x={-12} y={-150} width={50} height={38} rx={4} fill="var(--hz-card)" {...thin} />
          {[-38, -22, -6].map((x) => (
            <ellipse key={x} cx={x} cy={-34} rx={7} ry={9} fill="var(--hz-white)" {...thin} />
          ))}
          <rect x={8} y={-60} width={40} height={36} rx={4} fill="var(--hz-white)" {...thin} />
          <path d="M-44 66 q12 -26 24 0 z M-16 66 q12 -30 26 0 z" fill="var(--hz-green)" {...thin} />
          <circle cx={28} cy={54} r={12} fill="var(--hz-rose)" {...thin} />
          <rect x={-40} y={140} width={80} height={40} rx={6} fill="var(--hz-fabric3)" {...thin} />
        </g>
      )}
    </g>
  );
}

/** A weekly blister pack propped on the table: seven days of morning and evening doses. */
function BlisterPack({ look }: { look: string }) {
  const untouched = look === "untouched";
  return (
    <g>
      <rect x={-40} y={-30} width={80} height={60} rx={4} fill="var(--hz-white)" {...ink} />
      <rect x={-40} y={-30} width={80} height={12} rx={4} fill="var(--hz-rose)" />
      {[0, 1, 2, 3, 4, 5, 6].map((c) =>
        [0, 1].map((r) => {
          const cx = -32 + c * 10.7;
          const cy = -6 + r * 18;
          // In use: the first days and this morning are popped; untouched: every day still sealed.
          const taken = !untouched && (c < 4 || (c === 4 && r === 0));
          return taken ? (
            <path key={`${c}-${r}`} d={`M${cx - 3} ${cy - 3} l6 6 m0 -6 l-6 6`} stroke="var(--hz-metal)" strokeWidth={2} />
          ) : (
            <circle key={`${c}-${r}`} cx={cx} cy={cy} r={4} fill="var(--hz-fabric)" stroke="var(--hz-ink)" strokeWidth={1.5} />
          );
        }),
      )}
    </g>
  );
}

/** A wall thermometer, with the panel heater (cold) or the wall fan (hot) beside it. */
function RoomClimate({ look }: { look: string }) {
  const cold = look === "cold";
  return (
    <g>
      <circle cx={-30} cy={-40} r={36} fill="var(--hz-white)" {...ink} />
      <path d="M-56 -24 A 30 30 0 1 1 -4 -24" fill="none" stroke={cold ? "#5b8fd6" : "#d8573f"} strokeWidth={6} />
      <text x={-30} y={-32} fontSize={20} textAnchor="middle" {...textStyle}>
        {cold ? "12°" : "35°"}
      </text>
      {cold ? (
        <g>
          {/* A snowflake mark on the dial, and a wall heater with its plug lying loose. */}
          <path d="M-30 -66 v12 M-36 -60 h12 M-34 -64 l8 8 M-26 -64 l-8 8" stroke="#5b8fd6" strokeWidth={2} />
          <rect x={-62} y={26} width={124} height={50} rx={6} fill="var(--hz-white)" {...ink} />
          {[-46, -30, -14, 2, 18, 34].map((x) => (
            <line key={x} x1={x} y1={34} x2={x} y2={68} stroke="var(--hz-metal)" strokeWidth={3} />
          ))}
          <path d="M62 60 C 80 70 70 96 52 100" fill="none" stroke="var(--hz-ink)" strokeWidth={4} />
          <rect x={40} y={96} width={18} height={12} rx={2} fill="var(--hz-white)" {...thin} />
        </g>
      ) : (
        <g>
          {/* A sun mark on the dial, and a wall fan with its plug out. */}
          <circle cx={-30} cy={-62} r={6} fill="#e8a33a" />
          <circle cx={40} cy={-6} r={32} fill="var(--hz-white)" {...ink} />
          {[0, 120, 240].map((a) => (
            <ellipse key={a} cx={40} cy={-22} rx={7} ry={14} transform={`rotate(${a} 40 -6)`} fill="var(--hz-sky)" {...thin} />
          ))}
          <line x1={40} y1={26} x2={40} y2={60} {...ink} strokeWidth={6} />
          <rect x={22} y={60} width={36} height={8} rx={3} fill="var(--hz-metal)" {...thin} />
          <path d="M58 64 C 76 70 74 92 56 96" fill="none" stroke="var(--hz-ink)" strokeWidth={4} />
          <rect x={44} y={92} width={18} height={12} rx={2} fill="var(--hz-white)" {...thin} />
        </g>
      )}
    </g>
  );
}

/** A personal alarm pendant: on its lanyard, or sitting in its charging dock with the light showing. */
function CallPendant({ look }: { look: string }) {
  if (look === "dock-red")
    return (
      <g>
        <rect x={-30} y={4} width={60} height={20} rx={6} fill="var(--hz-white)" {...ink} />
        <circle cx={0} cy={-10} r={18} fill="var(--hz-white)" {...ink} />
        <circle cx={0} cy={-10} r={8} fill="var(--hz-metal)" />
        <circle cx={20} cy={14} r={5} fill="#d8573f" stroke="var(--hz-ink)" strokeWidth={1.5} />
        <rect x={-24} y={10} width={16} height={8} rx={1} fill="none" stroke="var(--hz-ink)" strokeWidth={1.5} />
      </g>
    );
  return (
    <g>
      <path d="M-26 -24 Q 0 -40 26 -24 Q 30 0 10 6" fill="none" stroke="var(--hz-fabric)" strokeWidth={4} />
      <circle cx={0} cy={10} r={16} fill="var(--hz-white)" {...ink} />
      <circle cx={0} cy={10} r={7} fill="var(--hz-rose)" />
    </g>
  );
}

/** A single bed against the right-hand wall: unmade with clean linen, or with soiled sheets and clothes. */
function SingleBed({ look }: { look: string }) {
  const soiled = look === "soiled";
  return (
    <g>
      {shadow(320, 96)}
      <rect x={140} y={-96} width={24} height={190} rx={6} fill="var(--hz-wood)" {...ink} />
      <rect x={-160} y={-20} width={300} height={44} rx={8} fill="var(--hz-white)" {...ink} />
      <rect x={66} y={-46} width={66} height={30} rx={12} fill="var(--hz-white)" {...ink} />
      <rect x={-160} y={24} width={300} height={26} fill="var(--hz-wood2)" {...ink} />
      <line x1={-148} y1={50} x2={-148} y2={94} {...ink} strokeWidth={8} />
      <line x1={128} y1={50} x2={128} y2={94} {...ink} strokeWidth={8} />
      {soiled ? (
        <g>
          {/* Stains on the bottom sheet, the quilt dragged half off, and soiled clothes on the floor. */}
          <path d="M-150 -18 Q -100 -40 -60 -16 L -60 30 L-150 30 Z" fill="var(--hz-fabric2)" {...thin} />
          <ellipse cx={0} cy={0} rx={30} ry={9} fill="#b08a3e" opacity={0.75} />
          <ellipse cx={46} cy={6} rx={16} ry={6} fill="#8c6a2c" opacity={0.7} />
          <path d="M-190 96 Q -170 70 -140 82 Q -120 70 -104 90 Z" fill="var(--hz-fabric)" {...thin} />
          <ellipse cx={-150} cy={86} rx={12} ry={5} fill="#8c6a2c" opacity={0.7} />
        </g>
      ) : (
        // Unmade: the quilt pushed back in folds, the linen clean.
        <path d="M-150 -22 Q -120 -44 -90 -24 Q -60 -46 -30 -24 Q 0 -40 30 -22 L 30 28 L -150 28 Z" fill="var(--hz-fabric2)" {...ink} />
      )}
    </g>
  );
}

function BooksPapers() {
  return (
    <g>
      {shadow(110, 58)}
      {[
        [-50, 30, 46, "var(--hz-rose)"],
        [-46, 14, 40, "var(--hz-fabric)"],
        [-52, -2, 48, "var(--hz-green)"],
        [-44, -18, 38, "var(--hz-card)"],
      ].map(([x, y, w, f], i) => (
        <rect key={i} x={x as number} y={y as number} width={w as number} height={16} rx={2} fill={f as string} {...thin} />
      ))}
      {[48, 40, 32, 24, 16, 8, 0, -8].map((y, i) => (
        <rect key={i} x={8 + (i % 2) * 3} y={y} width={52} height={8} fill="var(--hz-white)" {...thin} />
      ))}
    </g>
  );
}

function CatBasket() {
  return (
    <g>
      {shadow(150, 30)}
      <path d="M-60 0 Q -60 30 -20 32 L 20 32 Q 60 30 60 0 Z" fill="var(--hz-card)" {...ink} />
      <path d="M-48 2 Q -40 -30 0 -28 Q 34 -28 40 0 Z" fill="#8a8a8a" {...ink} />
      <path d="M22 -24 l6 -14 l6 12 M30 -26 l8 -12 l2 14" fill="#8a8a8a" {...thin} />
      <path d="M-40 -2 Q -10 6 30 -4" fill="none" stroke="var(--hz-ink)" strokeWidth={2} />
      <ellipse cx={84} cy={22} rx={16} ry={7} fill="var(--hz-white)" {...thin} />
      <ellipse cx={84} cy={19} rx={10} ry={3} fill="var(--hz-card)" />
      <ellipse cx={-84} cy={22} rx={16} ry={7} fill="var(--hz-white)" {...thin} />
      <ellipse cx={-84} cy={19} rx={10} ry={3} fill="var(--hz-sky)" />
    </g>
  );
}

function SimpleMeal() {
  return (
    <g>
      <ellipse cx={-10} cy={12} rx={38} ry={10} fill="var(--hz-white)" {...thin} />
      <rect x={-34} y={-6} width={22} height={18} rx={4} fill="var(--hz-card)" {...thin} />
      <rect x={-14} y={-8} width={22} height={18} rx={4} fill="var(--hz-card)" {...thin} />
      <path d="M28 -14 H52 L48 14 H32 Z" fill="var(--hz-white)" {...thin} />
      <path d="M52 -6 q10 2 0 12" fill="none" {...thin} />
      <path d="M36 -22 q-4 -6 0 -12 M44 -22 q-4 -6 0 -12" fill="none" stroke="var(--hz-metal)" strokeWidth={2} />
    </g>
  );
}

export function ObjectArt({ kind, look }: { kind: ObjectKind; look: string }) {
  switch (kind) {
    case "heater":
      return <Heater look={look} />;
    case "rug":
      return <Rug look={look} />;
    case "ceiling-light":
      return <CeilingLight look={look} />;
    case "walking-stick":
      return <WalkingStick />;
    case "photos":
      return <Photos />;
    case "boxes":
      return <Boxes />;
    case "slippers":
      return <Slippers look={look} />;
    case "bath-mat":
      return <BathMat look={look} />;
    case "night-light":
      return <NightLight />;
    case "plant":
      return <Plant />;
    case "care-bed":
      return <CareBed look={look} />;
    case "commode":
      return <Commode look={look} />;
    case "walking-frame":
      return <WalkingFrame look={look} />;
    case "glasses-book":
      return <GlassesBook />;
    case "radio":
      return <Radio />;
    case "clothes-chair":
      return <ClothesChair />;
    case "used-ppe":
      return <UsedPpe />;
    case "sanitiser":
      return <Sanitiser />;
    case "spill":
      return <Spill />;
    case "chopping-board":
      return <ChoppingBoard look={look} />;
    case "garden-gloves":
      return <GardenGloves />;
    case "roses-vase":
      return <RosesVase />;
    case "bowls-bag":
      return <BowlsBag />;
    case "bin":
      return <Bin />;
    case "fridge":
      return <Fridge look={look} />;
    case "blister-pack":
      return <BlisterPack look={look} />;
    case "room-climate":
      return <RoomClimate look={look} />;
    case "call-pendant":
      return <CallPendant look={look} />;
    case "single-bed":
      return <SingleBed look={look} />;
    case "books-papers":
      return <BooksPapers />;
    case "cat-basket":
      return <CatBasket />;
    case "simple-meal":
      return <SimpleMeal />;
  }
}

/** A whole room with its objects, as one SVG that scales to its box. `children` draws on top (markers, author regions). */
export function SceneArt({
  room,
  dim,
  objects,
  label,
  children,
}: {
  room: RoomId;
  dim: boolean;
  objects: { id: string; kind: ObjectKind; look: string; x: number; y: number; scale: number; area: string }[];
  label: string;
  children?: React.ReactNode;
}) {
  // Things in the hallway draw under the dim overlay; on the floor, nearer things draw over further ones.
  const sorted = [...objects].sort((a, b) => a.y - b.y);
  return (
    <svg viewBox={`0 0 ${SCENE_W} ${SCENE_H}`} role="img" aria-label={label} className="block size-full select-none" preserveAspectRatio="xMidYMid meet">
      <RoomArt room={room} />
      {sorted.map((o) => (
        <g key={o.id} data-object={o.id} transform={`translate(${(o.x / 100) * SCENE_W} ${(o.y / 100) * SCENE_H}) scale(${o.scale})`}>
          <ObjectArt kind={o.kind} look={o.look} />
        </g>
      ))}
      {dim && <DimOverlay room={room} />}
      {children}
    </svg>
  );
}
