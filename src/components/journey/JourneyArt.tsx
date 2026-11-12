/*
  Flat illustrations for each stage of the client journey, drawn from the brand palette. Fixed
  colours, so they look the same in light and dark mode. Faces are left plain on purpose: anyone
  can see themselves in them.
*/

const C = {
  navy: "#102a43",
  blue: "#2d4875",
  teal: "#0e7c7b",
  bright: "#4cc3c9",
  tint: "#ddf2f3",
  sky: "#dde7f2",
  gold: "#ffc72c",
  orange: "#f26a36",
  terracotta: "#c4471b",
  cream: "#fff3d6",
  peach: "#fde6da",
  white: "#ffffff",
  grey: "#e3e6ea",
  skin1: "#f2c9a5",
  skin2: "#c98e64",
  skin3: "#8d5a3b",
  dark: "#3b2a20",
  brown: "#7a4a2a",
  silver: "#dfe3e8",
};

type PersonProps = { x: number; y: number; s?: number; skin: string; shirt: string; hair: string; style?: "short" | "bun" | "long" | "curly" };

/** A person from the head down to the waist: head at (x, y). */
function Person({ x, y, s = 1, skin, shirt, hair, style = "short" }: PersonProps) {
  return (
    <g transform={`translate(${x} ${y}) scale(${s})`}>
      {style === "long" && <path d="M-18 -4 Q-20 -22 0 -22 Q20 -22 18 -4 L20 30 L-20 30 Z" fill={hair} />}
      <path d="M-27 66 V42 Q-27 21 0 21 Q27 21 27 42 V66 Z" fill={shirt} />
      <rect x="-6" y="9" width="12" height="14" rx="4" fill={skin} />
      <circle r="16" fill={skin} />
      {style === "short" && <path d="M-16 -1 Q-17 -20 0 -20 Q17 -20 16 -1 Q9 -12 -16 -1 Z" fill={hair} />}
      {style === "bun" && (
        <>
          <circle cy="-19" r="7.5" fill={hair} />
          <path d="M-16 0 Q-17 -18 0 -18 Q17 -18 16 0 Q14 -9 0 -11 Q-14 -9 -16 0 Z" fill={hair} />
        </>
      )}
      {style === "long" && <path d="M-16 -1 Q-17 -20 0 -20 Q17 -20 16 -1 Q4 -14 -16 -1 Z" fill={hair} />}
      {style === "curly" && (
        <g fill={hair}>
          <circle cx="-11" cy="-10" r="8" />
          <circle cx="0" cy="-15" r="9" />
          <circle cx="11" cy="-10" r="8" />
          <circle cx="-15" cy="-1" r="5" />
          <circle cx="15" cy="-1" r="5" />
        </g>
      )}
    </g>
  );
}

/** An arm from the shoulder to a hand. */
const Arm = ({ d, colour, skin, hand }: { d: string; colour: string; skin: string; hand: [number, number] }) => (
  <>
    <path d={d} fill="none" stroke={colour} strokeWidth="11" strokeLinecap="round" strokeLinejoin="round" />
    <circle cx={hand[0]} cy={hand[1]} r="6" fill={skin} />
  </>
);

const Sparkle = ({ x, y, r = 7, fill = C.gold }: { x: number; y: number; r?: number; fill?: string }) => (
  <path d={`M${x} ${y - r} Q${x + 1.5} ${y - 1.5} ${x + r} ${y} Q${x + 1.5} ${y + 1.5} ${x} ${y + r} Q${x - 1.5} ${y + 1.5} ${x - r} ${y} Q${x - 1.5} ${y - 1.5} ${x} ${y - r} Z`} fill={fill} />
);

const Check = ({ x, y, s = 1, colour = C.teal, w = 4 }: { x: number; y: number; s?: number; colour?: string; w?: number }) => (
  <path
    d={`M${x - 6 * s} ${y} l${4.5 * s} ${4.5 * s} l${8 * s} ${-9 * s}`}
    fill="none"
    stroke={colour}
    strokeWidth={w}
    strokeLinecap="round"
    strokeLinejoin="round"
  />
);

/* 0. Before it starts: an older woman at home thinking about support, her son or daughter beside her ready to call. */
function Before() {
  return (
    <>
      <rect width="400" height="260" fill={C.cream} />
      <rect y="214" width="400" height="46" fill={C.gold} opacity="0.3" />
      {/* Window with the sun outside. */}
      <rect x="262" y="26" width="108" height="92" rx="8" fill={C.white} />
      <rect x="270" y="34" width="92" height="76" rx="4" fill={C.sky} />
      <circle cx="338" cy="58" r="12" fill={C.gold} />
      <path d="M270 96 Q300 82 330 94 T362 90 V110 H270 Z" fill={C.bright} opacity="0.5" />
      <path d="M316 34 v76 M270 72 h92" stroke={C.white} strokeWidth="4" />
      {/* Armchair and the client, thinking. */}
      <rect x="36" y="142" width="124" height="88" rx="26" fill={C.blue} />
      <rect x="26" y="166" width="28" height="66" rx="14" fill={C.navy} opacity="0.85" />
      <rect x="142" y="166" width="28" height="66" rx="14" fill={C.navy} opacity="0.85" />
      <Person x={98} y={122} skin={C.skin1} shirt={C.orange} hair={C.silver} style="bun" />
      <Arm d="M120 158 Q134 146 116 134" colour={C.orange} skin={C.skin1} hand={[115, 133]} />
      {/* What she's thinking about: help at home. */}
      <circle cx="122" cy="92" r="4" fill={C.white} />
      <circle cx="134" cy="78" r="6.5" fill={C.white} />
      <g>
        <ellipse cx="190" cy="52" rx="48" ry="34" fill={C.white} />
        <circle cx="158" cy="62" r="18" fill={C.white} />
        <circle cx="222" cy="64" r="16" fill={C.white} />
        <path d="M170 60 L190 42 L210 60 V78 H170 Z" fill={C.tint} />
        <path d="M166 62 L190 39 L214 62" fill="none" stroke={C.teal} strokeWidth="4.5" strokeLinecap="round" strokeLinejoin="round" />
        <path d="M190 74 c-9 -6 -11 -11 -7 -14 c3 -2 6 0 7 2 c1 -2 4 -4 7 -2 c4 3 2 8 -7 14 Z" fill={C.orange} />
      </g>
      {/* A side table with tea. */}
      <rect x="176" y="186" width="48" height="8" rx="3" fill={C.terracotta} />
      <rect x="182" y="194" width="6" height="36" fill={C.terracotta} />
      <rect x="212" y="194" width="6" height="36" fill={C.terracotta} />
      <rect x="188" y="172" width="16" height="14" rx="3" fill={C.white} />
      <path d="M204 176 q6 0 6 5 q0 5 -6 5" fill="none" stroke={C.white} strokeWidth="2.5" />
      {/* Her son or daughter, phone in hand, ready to call. */}
      <rect x="244" y="198" width="70" height="34" rx="12" fill={C.teal} />
      <Person x={280} y={136} skin={C.skin2} shirt={C.teal} hair={C.dark} style="long" />
      <rect x="244" y="198" width="70" height="12" rx="6" fill="#0b6564" />
      <Arm d="M258 172 Q244 160 250 144" colour={C.teal} skin={C.skin2} hand={[250, 143]} />
      <rect x="241" y="122" width="15" height="26" rx="4" fill={C.navy} />
      <rect x="244" y="126" width="9" height="16" rx="2" fill={C.bright} />
      <path d="M232 120 q-8 8 0 16 M224 114 q-14 14 0 28" fill="none" stroke={C.teal} strokeWidth="3" strokeLinecap="round" />
      {/* A plant by the window. */}
      <path d="M346 232 h30 l-4 -24 h-22 Z" fill={C.terracotta} />
      <path d="M361 208 q-20 -14 -12 -36 q16 10 12 36 q4 -28 22 -34 q4 22 -22 34" fill={C.teal} />
      <Sparkle x={40} y={40} />
      <Sparkle x={240} y={96} r={5} fill={C.orange} />
    </>
  );
}

/* 1. Enquiry and sign-up: a first phone call between the client at home and a CSR. */
function Enquiry() {
  return (
    <>
      <rect width="400" height="260" fill={C.tint} />
      <circle cx="340" cy="40" r="90" fill={C.bright} opacity="0.3" />
      <path d="M0 225 Q120 200 220 222 T400 215 V260 H0 Z" fill={C.bright} opacity="0.35" />
      {/* Client in an armchair, on the phone. */}
      <rect x="38" y="135" width="120" height="95" rx="26" fill={C.orange} />
      <rect x="28" y="160" width="28" height="70" rx="14" fill={C.terracotta} />
      <rect x="140" y="160" width="28" height="70" rx="14" fill={C.terracotta} />
      <Person x={98} y={116} skin={C.skin1} shirt={C.blue} hair={C.silver} style="bun" />
      <Arm d="M118 150 Q132 128 117 112" colour={C.blue} skin={C.skin1} hand={[117, 110]} />
      <rect x="108" y="96" width="11" height="24" rx="4" fill={C.navy} transform="rotate(18 113 108)" />
      {/* The line between them. */}
      <path d="M132 92 C 170 40, 230 40, 262 88" fill="none" stroke={C.teal} strokeWidth="3.5" strokeDasharray="2 9" strokeLinecap="round" />
      <g>
        <rect x="150" y="26" width="52" height="36" rx="14" fill={C.white} />
        <path d="M164 60 l-6 12 l14 -10 Z" fill={C.white} />
        <text x="176" y="52" textAnchor="middle" fontSize="24" fontWeight="800" fill={C.navy} fontFamily="Arial, sans-serif">
          ?
        </text>
        <rect x="214" y="44" width="54" height="32" rx="14" fill={C.gold} />
        <path d="M252 74 l8 10 l-2 -12 Z" fill={C.gold} />
        <circle cx="229" cy="60" r="3.5" fill={C.navy} />
        <circle cx="241" cy="60" r="3.5" fill={C.navy} />
        <circle cx="253" cy="60" r="3.5" fill={C.navy} />
      </g>
      {/* CSR at a desk with a headset. */}
      <Person x={308} y={124} skin={C.skin2} shirt={C.teal} hair={C.dark} style="long" />
      <path d="M290 118 Q290 98 308 98 Q326 98 326 118" fill="none" stroke={C.navy} strokeWidth="4" />
      <rect x="286" y="114" width="8" height="13" rx="3" fill={C.navy} />
      <path d="M290 126 Q292 140 304 138" fill="none" stroke={C.navy} strokeWidth="3" strokeLinecap="round" />
      <rect x="236" y="186" width="148" height="10" rx="4" fill={C.navy} />
      <rect x="248" y="196" width="8" height="40" fill={C.navy} />
      <rect x="364" y="196" width="8" height="40" fill={C.navy} />
      <path d="M252 186 l10 -40 h52 l-6 40 Z" fill={C.blue} />
      <rect x="268" y="152" width="38" height="24" rx="3" fill={C.bright} opacity="0.7" transform="skewX(-10)" />
      <Sparkle x={60} y={50} />
      <Sparkle x={378} y={140} r={5} fill={C.white} />
    </>
  );
}

/* 2. Initial questionnaire: an online form, ticked and e-signed, and a GP health summary. */
function Questionnaire() {
  return (
    <>
      <rect width="400" height="260" fill={C.cream} />
      <circle cx="200" cy="135" r="112" fill={C.gold} opacity="0.35" />
      <circle cx="60" cy="60" r="34" fill={C.orange} opacity="0.18" />
      {/* Tablet with the questionnaire. */}
      <rect x="124" y="28" width="156" height="212" rx="18" fill={C.navy} />
      <rect x="135" y="42" width="134" height="184" rx="8" fill={C.white} />
      <rect x="147" y="54" width="80" height="9" rx="4.5" fill={C.teal} />
      {[78, 106, 134].map((y) => (
        <g key={y}>
          <rect x="147" y={y} width="16" height="16" rx="4" fill={C.tint} stroke={C.teal} strokeWidth="2" />
          <Check x={155} y={y + 8} s={0.7} w={3} />
          <rect x="171" y={y + 2} width="84" height="5" rx="2.5" fill={C.grey} />
          <rect x="171" y={y + 10} width="58" height="5" rx="2.5" fill={C.grey} />
        </g>
      ))}
      <rect x="147" y="162" width="16" height="16" rx="4" fill={C.white} stroke={C.grey} strokeWidth="2" />
      <rect x="171" y="164" width="70" height="5" rx="2.5" fill={C.grey} />
      <path d="M150 208 c8 -16 14 6 22 -6 s10 -10 14 2 s12 -4 18 -2" fill="none" stroke={C.blue} strokeWidth="2.5" strokeLinecap="round" />
      <rect x="147" y="214" width="110" height="2" fill={C.grey} />
      {/* Stylus. */}
      <g transform="rotate(35 300 190)">
        <rect x="294" y="128" width="12" height="80" rx="6" fill={C.orange} />
        <path d="M294 208 l6 16 l6 -16 Z" fill={C.navy} />
      </g>
      {/* Stethoscope for the GP health summary. */}
      <path d="M48 120 Q48 178 80 178 Q112 178 112 120" fill="none" stroke={C.terracotta} strokeWidth="6" strokeLinecap="round" />
      <path d="M80 178 Q80 214 104 214" fill="none" stroke={C.terracotta} strokeWidth="6" strokeLinecap="round" />
      <circle cx="112" cy="214" r="13" fill={C.navy} />
      <circle cx="112" cy="214" r="6" fill={C.bright} />
      <circle cx="48" cy="116" r="5" fill={C.navy} />
      <circle cx="112" cy="116" r="5" fill={C.navy} />
      {/* A small health summary page. */}
      <g transform="rotate(8 340 80)">
        <rect x="305" y="40" width="70" height="88" rx="8" fill={C.white} />
        <path d="M340 58 v18 M331 67 h18" stroke={C.terracotta} strokeWidth="6" strokeLinecap="round" />
        <rect x="316" y="92" width="48" height="5" rx="2.5" fill={C.grey} />
        <rect x="316" y="104" width="34" height="5" rx="2.5" fill={C.grey} />
      </g>
      <Sparkle x={300} y={235} />
    </>
  );
}

/* 3. Welcome meeting: a phone meeting with the Intake team, with family on the couch. */
function Welcome() {
  return (
    <>
      <rect width="400" height="260" fill={C.sky} />
      <circle cx="80" cy="60" r="70" fill={C.white} opacity="0.5" />
      <path d="M0 230 H400 V260 H0 Z" fill={C.blue} opacity="0.15" />
      {/* Couch with the client and a family member. */}
      <rect x="22" y="150" width="190" height="66" rx="24" fill={C.teal} />
      <rect x="14" y="176" width="34" height="56" rx="14" fill="#0b6564" />
      <rect x="186" y="176" width="34" height="56" rx="14" fill="#0b6564" />
      <Person x={78} y={118} skin={C.skin1} shirt={C.gold} hair={C.silver} style="short" />
      <Person x={150} y={124} s={0.95} skin={C.skin3} shirt={C.orange} hair={C.dark} style="curly" />
      <Arm d="M168 160 Q186 160 196 142" colour={C.orange} skin={C.skin3} hand={[197, 140]} />
      <rect x="212" y="164" width="34" height="56" rx="6" fill={C.blue} />
      <rect x="198" y="124" width="22" height="34" rx="5" fill={C.navy} transform="rotate(-12 209 141)" />
      {/* Speaker phone with the Intake team member. */}
      <rect x="250" y="34" width="112" height="196" rx="20" fill={C.navy} />
      <rect x="260" y="50" width="92" height="160" rx="10" fill={C.tint} />
      <circle cx="306" cy="104" r="34" fill={C.bright} opacity="0.4" />
      <Person x={306} y={100} s={0.85} skin={C.skin2} shirt={C.teal} hair={C.dark} style="short" />
      <rect x="272" y="176" width="68" height="20" rx="10" fill={C.terracotta} />
      <path d="M298 186 h16" stroke={C.white} strokeWidth="4" strokeLinecap="round" />
      {/* Sound, a heart and a globe for a translator. */}
      <path d="M232 92 q-10 12 0 24 M220 84 q-18 20 0 40" fill="none" stroke={C.blue} strokeWidth="3.5" strokeLinecap="round" />
      <g>
        <rect x="88" y="34" width="52" height="40" rx="15" fill={C.white} />
        <path d="M104 72 l-4 12 l14 -11 Z" fill={C.white} />
        <path d="M114 64 c-12 -8 -14 -14 -9 -18 c4 -3 8 0 9 3 c1 -3 5 -6 9 -3 c5 4 3 10 -9 18 Z" fill={C.orange} />
      </g>
      <g transform="translate(176 46)">
        <circle r="18" fill={C.white} />
        <circle r="13" fill="none" stroke={C.teal} strokeWidth="2.5" />
        <ellipse rx="6" ry="13" fill="none" stroke={C.teal} strokeWidth="2.5" />
        <path d="M-13 0 h26" stroke={C.teal} strokeWidth="2.5" />
      </g>
    </>
  );
}

/* 4. Care plan finalised: the plan itself, with goals, a budget and a seal of sign-off. */
function CarePlan() {
  return (
    <>
      <rect width="400" height="260" fill={C.tint} />
      <circle cx="200" cy="130" r="118" fill={C.white} opacity="0.55" />
      <rect x="132" y="30" width="150" height="206" rx="12" fill={C.navy} opacity="0.15" transform="translate(6 6)" />
      <rect x="132" y="30" width="150" height="206" rx="12" fill={C.white} />
      <rect x="132" y="30" width="150" height="40" rx="12" fill={C.teal} />
      <rect x="132" y="58" width="150" height="12" fill={C.teal} />
      <rect x="146" y="44" width="70" height="8" rx="4" fill={C.white} />
      {/* Goals. */}
      <circle cx="160" cy="98" r="15" fill={C.orange} />
      <circle cx="160" cy="98" r="9" fill={C.white} />
      <circle cx="160" cy="98" r="4" fill={C.orange} />
      <rect x="184" y="90" width="80" height="6" rx="3" fill={C.grey} />
      <rect x="184" y="102" width="56" height="6" rx="3" fill={C.grey} />
      {/* Budget. */}
      <g transform="translate(166 160)">
        <circle r="22" fill={C.blue} />
        <path d="M0 0 V-22 A22 22 0 0 1 21 7 Z" fill={C.gold} />
        <path d="M0 0 L21 7 A22 22 0 0 1 -6 21 Z" fill={C.bright} />
      </g>
      <rect x="198" y="146" width="66" height="6" rx="3" fill={C.grey} />
      <rect x="198" y="158" width="48" height="6" rx="3" fill={C.grey} />
      <rect x="198" y="170" width="58" height="6" rx="3" fill={C.grey} />
      <rect x="146" y="200" width="70" height="6" rx="3" fill={C.grey} />
      {/* Signed off. */}
      <g transform="translate(262 206)">
        <path d="M-12 14 l-8 26 l12 -7 l8 10 Z" fill={C.terracotta} />
        <path d="M12 14 l8 26 l-12 -7 l-8 10 Z" fill={C.orange} />
        <circle r="24" fill={C.gold} />
        <circle r="17" fill="none" stroke={C.white} strokeWidth="2.5" />
        <Check x={1} y={0} s={1} colour={C.navy} w={4.5} />
      </g>
      {/* Calendar: the plan arrives. */}
      <g transform="translate(36 118)">
        <rect width="74" height="74" rx="10" fill={C.white} />
        <rect width="74" height="20" rx="10" fill={C.terracotta} />
        <rect y="12" width="74" height="8" fill={C.terracotta} />
        {[0, 1, 2].map((r) =>
          [0, 1, 2, 3].map((c) => <rect key={`${r}${c}`} x={9 + c * 15} y={28 + r * 14} width="9" height="8" rx="2" fill={r === 1 && c === 2 ? C.teal : C.grey} />),
        )}
      </g>
      {/* Referral partners: a meal and a cab. */}
      <g transform="translate(330 78)">
        <circle r="26" fill={C.white} />
        <ellipse cy="6" rx="16" ry="6" fill={C.grey} />
        <path d="M-14 4 A14 14 0 0 1 14 4 Z" fill={C.orange} />
        <circle cx="-4" cy="-4" r="3" fill={C.gold} />
      </g>
      <g transform="translate(336 160)">
        <circle r="26" fill={C.white} />
        <path d="M-16 6 v-8 l6 -8 h20 l6 8 v8 Z" fill={C.gold} />
        <circle cx="-9" cy="7" r="4.5" fill={C.navy} />
        <circle cx="9" cy="7" r="4.5" fill={C.navy} />
      </g>
      <Sparkle x={106} y={58} />
    </>
  );
}

/* 5. Handover: the Intake team passes the client's story to a named Care Partner and their pod. */
function Handover() {
  return (
    <>
      <rect width="400" height="260" fill={C.peach} />
      <circle cx="200" cy="120" r="100" fill={C.white} opacity="0.5" />
      <path d="M0 232 H400 V260 H0 Z" fill={C.orange} opacity="0.2" />
      {/* The pod, behind. */}
      <g opacity="0.55">
        <Person x={334} y={92} s={0.7} skin={C.skin1} shirt={C.bright} hair={C.brown} style="long" />
        <Person x={372} y={100} s={0.66} skin={C.skin3} shirt={C.blue} hair={C.dark} style="short" />
      </g>
      <Person x={104} y={112} skin={C.skin1} shirt={C.blue} hair={C.brown} style="short" />
      <Person x={290} y={112} skin={C.skin2} shirt={C.teal} hair={C.dark} style="bun" />
      {/* Name badge. */}
      <rect x="296" y="148" width="22" height="14" rx="3" fill={C.gold} />
      <rect x="299" y="153" width="16" height="3" rx="1.5" fill={C.navy} />
      <Arm d="M126 150 Q160 170 186 160" colour={C.blue} skin={C.skin1} hand={[188, 159]} />
      <Arm d="M268 150 Q238 172 214 162" colour={C.teal} skin={C.skin2} hand={[212, 161]} />
      {/* The client's file changing hands. */}
      <g transform="rotate(-6 200 150)">
        <rect x="174" y="128" width="52" height="40" rx="5" fill={C.orange} />
        <rect x="174" y="124" width="22" height="8" rx="3" fill={C.orange} />
        <rect x="182" y="140" width="34" height="4" rx="2" fill={C.white} opacity="0.8" />
        <rect x="182" y="150" width="24" height="4" rx="2" fill={C.white} opacity="0.8" />
      </g>
      <path d="M200 74 c-16 -11 -19 -19 -12 -25 c5 -4 11 -1 12 4 c1 -5 7 -8 12 -4 c7 6 4 14 -12 25 Z" fill={C.terracotta} />
      <path d="M150 58 q10 -10 22 -4 M250 58 q-10 -10 -22 -4" fill="none" stroke={C.terracotta} strokeWidth="3" strokeLinecap="round" opacity="0.6" />
      <Sparkle x={40} y={44} />
    </>
  );
}

/* 6. Services start: a support worker arrives at the client's front door. */
function ServicesStart() {
  return (
    <>
      <rect width="400" height="260" fill={C.sky} />
      <circle cx="350" cy="52" r="28" fill={C.gold} />
      <circle cx="350" cy="52" r="42" fill={C.gold} opacity="0.25" />
      <path d="M0 200 Q100 170 200 192 T400 182 V260 H0 Z" fill={C.teal} opacity="0.35" />
      <path d="M0 226 Q140 206 260 224 T400 220 V260 H0 Z" fill={C.teal} opacity="0.55" />
      {/* House. */}
      <rect x="50" y="108" width="150" height="112" fill={C.cream} />
      <path d="M36 112 L125 46 L214 112 Z" fill={C.terracotta} />
      <rect x="66" y="128" width="34" height="30" rx="3" fill={C.bright} />
      <path d="M83 128 v30 M66 143 h34" stroke={C.cream} strokeWidth="3" />
      <rect x="128" y="140" width="44" height="80" fill={C.gold} opacity="0.8" />
      <path d="M128 140 l-18 8 v78 l18 -6 Z" fill={C.navy} />
      {/* Client at the door, waving. */}
      <Person x={150} y={162} s={0.72} skin={C.skin1} shirt={C.blue} hair={C.silver} style="bun" />
      <Arm d="M162 188 Q172 176 168 160" colour={C.blue} skin={C.skin1} hand={[168, 157]} />
      {/* Path to the door. */}
      <path d="M172 222 Q230 214 250 236 T330 260" fill="none" stroke={C.cream} strokeWidth="18" strokeLinecap="round" opacity="0.9" />
      {/* Support worker arriving with a bag. */}
      <rect x="262" y="186" width="17" height="50" rx="6" fill={C.navy} transform="rotate(8 270 186)" />
      <rect x="285" y="186" width="17" height="50" rx="6" fill={C.navy} transform="rotate(-6 293 186)" />
      <Person x={282} y={128} skin={C.skin3} shirt={C.teal} hair={C.dark} style="curly" />
      <Arm d="M306 162 Q318 186 312 206" colour={C.teal} skin={C.skin3} hand={[312, 208]} />
      <rect x="302" y="208" width="30" height="24" rx="5" fill={C.orange} />
      <path d="M310 208 v-6 h14 v6" fill="none" stroke={C.terracotta} strokeWidth="3" />
      {/* Flowers. */}
      {[30, 222, 380].map((x) => (
        <g key={x}>
          <path d={`M${x} 236 v-16`} stroke={C.teal} strokeWidth="3" />
          <circle cx={x} cy="218" r="6" fill={x === 222 ? C.gold : C.orange} />
        </g>
      ))}
    </>
  );
}

/* 7. Ongoing care: settled at home, with check-ins on the calendar and the Portal on a phone. */
function Ongoing() {
  return (
    <>
      <rect width="400" height="260" fill={C.tint} />
      <circle cx="120" cy="140" r="104" fill={C.white} opacity="0.55" />
      {/* Calendar of check-ins. */}
      <g transform="translate(236 30)">
        <rect width="136" height="118" rx="12" fill={C.white} />
        <rect width="136" height="24" rx="12" fill={C.blue} />
        <rect y="14" width="136" height="10" fill={C.blue} />
        {[0, 1, 2].map((r) =>
          [0, 1, 2, 3, 4].map((c) => {
            const on = (r * 5 + c) % 4 === 1;
            return (
              <g key={`${r}${c}`}>
                <rect x={10 + c * 24} y={34 + r * 26} width="18" height="18" rx="4" fill={on ? C.tint : C.grey} />
                {on && <Check x={19 + c * 24} y={43 + r * 26} s={0.6} w={2.5} />}
              </g>
            );
          }),
        )}
      </g>
      {/* Client in an armchair with a cuppa. */}
      <rect x="40" y="132" width="130" height="94" rx="28" fill={C.gold} />
      <rect x="30" y="156" width="28" height="74" rx="14" fill="#e3ab12" />
      <rect x="152" y="156" width="28" height="74" rx="14" fill="#e3ab12" />
      <Person x={104} y={112} skin={C.skin2} shirt={C.terracotta} hair={C.silver} style="short" />
      <Arm d="M124 150 Q140 160 134 140" colour={C.terracotta} skin={C.skin2} hand={[133, 140]} />
      <rect x="126" y="122" width="18" height="18" rx="4" fill={C.white} />
      <path d="M144 127 q7 0 7 6 q0 6 -7 6" fill="none" stroke={C.white} strokeWidth="3" />
      <path d="M131 114 q-3 -6 2 -10 M139 114 q-3 -6 2 -10" fill="none" stroke={C.blue} strokeWidth="2" strokeLinecap="round" opacity="0.6" />
      {/* Portal on a phone. */}
      <g transform="translate(262 156)">
        <rect width="72" height="96" rx="12" fill={C.navy} />
        <rect x="7" y="10" width="58" height="76" rx="6" fill={C.white} />
        <rect x="16" y="56" width="9" height="20" rx="2" fill={C.bright} />
        <rect x="31" y="44" width="9" height="32" rx="2" fill={C.teal} />
        <rect x="46" y="34" width="9" height="42" rx="2" fill={C.gold} />
        <rect x="16" y="20" width="34" height="5" rx="2.5" fill={C.grey} />
      </g>
      {/* Plant. */}
      <path d="M210 230 h28 l-4 -26 h-20 Z" fill={C.terracotta} />
      <path d="M224 204 q-18 -16 -10 -36 q14 10 10 36 q4 -26 20 -32 q4 20 -20 32" fill={C.teal} />
      <path d="M362 176 c-12 -8 -14 -14 -9 -18 c4 -3 8 0 9 3 c1 -3 5 -6 9 -3 c5 4 3 10 -9 18 Z" fill={C.orange} />
      <Sparkle x={210} y={40} />
    </>
  );
}

/* 8. Review and change: the plan comes round again, looked at closely, and adjusted. */
function Review() {
  return (
    <>
      <rect width="400" height="260" fill={C.cream} />
      <circle cx="200" cy="132" r="104" fill={C.white} opacity="0.6" />
      {/* Round again: the cycle of review. */}
      <path d="M96 132 A104 104 0 0 1 280 64" fill="none" stroke={C.teal} strokeWidth="10" strokeLinecap="round" />
      <path d="M268 50 l22 10 l-16 18 Z" fill={C.teal} />
      <path d="M304 132 A104 104 0 0 1 120 200" fill="none" stroke={C.orange} strokeWidth="10" strokeLinecap="round" />
      <path d="M132 214 l-22 -10 l16 -18 Z" fill={C.orange} />
      {/* Clipboard with the plan. */}
      <rect x="152" y="56" width="96" height="152" rx="10" fill={C.blue} />
      <rect x="161" y="70" width="78" height="130" rx="5" fill={C.white} />
      <rect x="180" y="48" width="40" height="18" rx="6" fill={C.gold} />
      {[88, 112, 136].map((y) => (
        <g key={y}>
          <Check x={174} y={y} s={0.65} w={3} />
          <rect x="184" y={y - 3} width="44" height="6" rx="3" fill={C.grey} />
        </g>
      ))}
      <rect x="170" y="160" width="58" height="6" rx="3" fill={C.grey} />
      <rect x="170" y="172" width="40" height="6" rx="3" fill={C.grey} />
      {/* Magnifying glass. */}
      <g transform="translate(250 168)">
        <circle r="26" fill={C.tint} opacity="0.7" stroke={C.navy} strokeWidth="8" />
        <path d="M19 19 l26 26" stroke={C.navy} strokeWidth="11" strokeLinecap="round" />
      </g>
      {/* Adjusting the plan. */}
      <g transform="translate(34 96)">
        <rect width="60" height="78" rx="12" fill={C.white} />
        {[18, 39, 60].map((y, i) => (
          <g key={y}>
            <path d={`M12 ${y} h36`} stroke={C.grey} strokeWidth="4" strokeLinecap="round" />
            <circle cx={[34, 20, 40][i]} cy={y} r="6" fill={[C.teal, C.orange, C.blue][i]} />
          </g>
        ))}
      </g>
      {/* An upgrade. */}
      <g transform="translate(340 66)">
        <circle r="24" fill={C.teal} />
        <path d="M0 12 v-22 M-9 -2 l9 -10 l9 10" fill="none" stroke={C.white} strokeWidth="4" strokeLinecap="round" strokeLinejoin="round" />
      </g>
      <Sparkle x={330} y={210} />
      <Sparkle x={56} y={42} r={5} fill={C.orange} />
    </>
  );
}

/* 9. Feedback and complaints: a compliment, a concern, being heard, and an advocate alongside. */
function Feedback() {
  return (
    <>
      <rect width="400" height="260" fill={C.peach} />
      <circle cx="200" cy="130" r="108" fill={C.white} opacity="0.45" />
      {/* A compliment. */}
      <g>
        <rect x="46" y="34" width="132" height="86" rx="26" fill={C.white} />
        <path d="M84 118 l-10 26 l30 -26 Z" fill={C.white} />
        <path
          d="M112 50 l8.2 16.6 l18.3 2.7 l-13.3 12.9 l3.1 18.2 l-16.3 -8.6 l-16.3 8.6 l3.1 -18.2 l-13.3 -12.9 l18.3 -2.7 Z"
          fill={C.gold}
        />
      </g>
      {/* A concern. */}
      <g>
        <rect x="218" y="62" width="128" height="82" rx="26" fill={C.orange} />
        <path d="M312 142 l12 24 l-30 -24 Z" fill={C.orange} />
        <rect x="276" y="76" width="12" height="36" rx="6" fill={C.white} />
        <circle cx="282" cy="124" r="7" fill={C.white} />
      </g>
      {/* Being heard. */}
      <g transform="translate(64 196) rotate(-14)">
        <path d="M0 -14 h18 l40 -22 v72 l-40 -22 h-18 Z" fill={C.navy} />
        <rect x="-12" y="-14" width="14" height="28" rx="5" fill={C.blue} />
        <path d="M8 14 l6 22 h12 l-4 -22" fill={C.navy} />
        <path d="M68 -18 q14 18 0 36 M80 -28 q24 28 0 56" fill="none" stroke={C.terracotta} strokeWidth="4" strokeLinecap="round" />
      </g>
      {/* An advocate, such as OPAN. */}
      <g transform="translate(300 196)">
        <path d="M0 -40 l32 13 v22 c0 21 -14 39 -32 46 c-18 -7 -32 -25 -32 -46 v-22 Z" fill={C.teal} />
        <path d="M0 12 c-14 -9 -17 -16 -11 -21 c4 -3 9 -1 11 3 c2 -4 7 -6 11 -3 c6 5 3 12 -11 21 Z" fill={C.white} />
      </g>
      <g fill={C.blue} opacity="0.5">
        <circle cx="180" cy="200" r="6" />
        <circle cx="200" cy="200" r="6" />
        <circle cx="220" cy="200" r="6" />
      </g>
    </>
  );
}

/* 10. Exit: a door left open onto an evening path. Gentle, for every reason someone leaves. */
function Exit() {
  return (
    <>
      <defs>
        <linearGradient id="journey-dusk" x1="0" y1="0" x2="0" y2="1">
          <stop offset="0" stopColor="#c6d3e8" />
          <stop offset="0.55" stopColor="#f7d8c4" />
          <stop offset="1" stopColor="#ffd98a" />
        </linearGradient>
      </defs>
      <rect width="400" height="260" fill="url(#journey-dusk)" />
      <circle cx="292" cy="168" r="44" fill={C.gold} />
      <circle cx="292" cy="168" r="64" fill={C.white} opacity="0.25" />
      <path d="M0 170 Q90 140 180 162 T400 150 V260 H0 Z" fill={C.blue} opacity="0.55" />
      <path d="M0 200 Q120 176 230 196 T400 190 V260 H0 Z" fill={C.blue} />
      <path d="M150 260 Q190 222 250 214 T296 190" fill="none" stroke={C.cream} strokeWidth="16" strokeLinecap="round" opacity="0.85" />
      {/* Door left open. */}
      <rect x="36" y="56" width="104" height="204" fill={C.navy} />
      <rect x="50" y="70" width="76" height="190" fill={C.gold} opacity="0.85" />
      <path d="M50 70 l40 12 v190 l-40 -12 Z" fill={C.terracotta} />
      <circle cx="82" cy="170" r="3.5" fill={C.gold} />
      {/* Two figures walking together. */}
      <g transform="translate(212 178) scale(0.5)">
        <Person x={0} y={0} skin={C.skin1} shirt={C.navy} hair={C.silver} style="bun" />
        <Person x={46} y={-4} skin={C.skin2} shirt={C.teal} hair={C.dark} style="short" />
      </g>
      {/* Birds. */}
      <path d="M200 60 q8 -8 16 0 q8 -8 16 0 M262 40 q6 -6 12 0 q6 -6 12 0 M330 74 q5 -5 10 0 q5 -5 10 0" fill="none" stroke={C.navy} strokeWidth="3" strokeLinecap="round" />
      {/* Leaves. */}
      <path d="M372 236 q-26 -10 -24 -40 q26 8 24 40 Z" fill={C.teal} />
      <path d="M352 244 q-24 4 -36 -18 q26 -4 36 18 Z" fill={C.teal} opacity="0.75" />
    </>
  );
}

const scenes: Record<number, { draw: () => React.ReactNode; alt: string }> = {
  0: {
    draw: Before,
    alt: "An older woman in an armchair at home thinking about help at home, while her son or daughter sits beside her with a phone, ready to call",
  },
  1: { draw: Enquiry, alt: "An older client in an armchair on the phone with a customer service representative wearing a headset" },
  2: { draw: Questionnaire, alt: "A tablet showing a ticked and signed questionnaire, a stylus, and a stethoscope for the GP health summary" },
  3: { draw: Welcome, alt: "A client and a family member on a couch, on a speaker phone call with the Intake team" },
  4: { draw: CarePlan, alt: "A care plan with goals, a budget chart and a signed-off seal, beside a calendar and meal and cab referrals" },
  5: { draw: Handover, alt: "One team member handing the client’s file to their named Care Partner, with the Care Pod behind" },
  6: { draw: ServicesStart, alt: "A support worker with a bag arriving at a house while the client waves from the front door" },
  7: { draw: Ongoing, alt: "A client settled in an armchair with a cup of tea, beside a calendar of check-ins and the Portal on a phone" },
  8: { draw: Review, alt: "A care plan on a clipboard circled by review arrows, with a magnifying glass, adjustment sliders and an upgrade arrow" },
  9: { draw: Feedback, alt: "A speech bubble with a star, a speech bubble with an exclamation mark, a megaphone and an advocate’s shield" },
  10: { draw: Exit, alt: "A door left open onto an evening path, with two people walking together towards the setting sun" },
};

/** The illustration for one stage of the journey. */
export function StageArt({ n, className }: { n: number; className?: string }) {
  const scene = scenes[n];
  if (!scene) return null;
  return (
    <svg viewBox="0 0 400 260" className={className} role="img" aria-label={scene.alt} preserveAspectRatio="xMidYMid slice">
      {scene.draw()}
    </svg>
  );
}
