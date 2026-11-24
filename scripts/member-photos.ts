/*
  Profile photos for the Community's demo members (content/community.ts): one portrait each, made with the Hub's
  image generator (OpenAI) in the same real-world style as the character portraits, then saved small to
  public/images/members/<id>.webp, which content/community.ts points at. All fictional people.
  Run with:  npx vite-node --config vitest.config.ts scripts/member-photos.ts [ids…]
*/
import fs from "node:fs";
import path from "node:path";
import sharp from "sharp";
import { openDb } from "@/server/db";
import { userById } from "@/server/auth";
import { startGeneration } from "@/server/imageGen";
import { portraitPrompt } from "@/lib/characters";

const LOOKS: Record<string, { name: string; look: string }> = {
  maya: {
    name: "Maya Thompson",
    look: "Community host in her forties, shoulder-length brown hair, warm open smile, teal cardigan over a white t-shirt. Background: a Brisbane café terrace with potted palms",
  },
  priya: {
    name: "Priya Raman",
    look: "Physiotherapist in her thirties of South Asian heritage, long dark hair tied back, plain navy polo shirt. Background: the garden of a community health clinic in Ballarat, with a bluestone building",
  },
  dan: {
    name: "Dan Kowalski",
    look: "Gardener and handyman in his fifties, short greying hair, stubble, plain hi-vis work shirt. Background: a suburban backyard in Newcastle, with a ute in the driveway",
  },
  grace: {
    name: "Grace Liu",
    look: "Registered nurse in her thirties of Chinese heritage, short bob haircut, navy scrub top under a grey cardigan. Background: a Hobart street of sandstone terraces with a mountain beyond",
  },
  tom: {
    name: "Tom Fraser",
    look: "Care coordinator in his forties, sandy hair, glasses, blue checked button-down shirt. Background: the Geelong waterfront, with the bay and a pier",
  },
  aroha: {
    name: "Aroha Wiremu",
    look: "Occupational therapist in her thirties of Māori heritage, long dark wavy hair, plain teal polo shirt. Background: a tropical Cairns street with palm trees and a timber house",
  },
  sam: {
    name: "Sam Okafor",
    look: "Cleaner in his late twenties of Nigerian heritage, short black hair, plain grey work polo shirt. Background: a Wollongong street near the beach, with the escarpment behind",
  },
  leanne: {
    name: "Leanne Brooks",
    look: "Care coordinator in her fifties, shoulder-length blonde hair, floral blouse, reading glasses pushed up on her head. Background: a coastal Western Australian street with peppermint trees",
  },
  nick: {
    name: "Nick Papadopoulos",
    look: "Podiatrist in his forties of Greek heritage, dark curly hair, short beard, pale blue clinic shirt. Background: an Adelaide street of stone villas and leafy trees",
  },
  jess: {
    name: "Jess Nguyen",
    look: "Support worker in her twenties of Vietnamese heritage, long black hair, casual navy polo shirt, lanyard. Background: a tropical Darwin garden with frangipani trees",
  },
  rob: {
    name: "Rob Campbell",
    look: "Gardener in his sixties, grey moustache, weathered smile, faded cap and a plaid flannel shirt. Background: a Toowoomba garden full of flowers, with a picket fence",
  },
  mei: {
    name: "Mei Chen",
    look: "Dietitian in her forties of Chinese heritage, glasses, neat ponytail, soft blazer over a plain top. Background: a Canberra lakeside path with autumn trees",
  },
};

const db = openDb(path.join(process.cwd(), "data", "hub.sqlite"));
const author = userById(db, "jordan")!;
const outDir = path.join(process.cwd(), "public", "images", "members");
fs.mkdirSync(outDir, { recursive: true });
const only = process.argv.slice(2).filter((a) => a in LOOKS);

for (const [id, m] of Object.entries(LOOKS).filter(([id]) => !only.length || only.includes(id))) {
  try {
    console.log(`… ${m.name}`);
    const out = await startGeneration(
      db,
      author,
      {
        model: "openai",
        prompt: portraitPrompt({ look: m.look, role: "worker" }),
        aspect: "1:1",
        quality: "medium",
        houseStyle: false,
        about: { title: `${m.name}, community member portrait`, alt: `Portrait of ${m.name}, a fictional community member` },
      },
      new Date(),
    );
    const src = "photo" in out ? out.photo.src : "";
    if (!src) throw new Error("No picture came back.");
    const file = path.join(process.cwd(), "data", "uploads", path.basename(src));
    await sharp(file)
      .resize(640, 640, { fit: "cover" })
      .webp({ quality: 82 })
      .toFile(path.join(outDir, `${id}.webp`));
    console.log(`✓ ${m.name}: /images/members/${id}.webp (library ${src})`);
  } catch (e) {
    console.log(`✗ ${m.name}: ${(e as Error).message}`);
  }
}
