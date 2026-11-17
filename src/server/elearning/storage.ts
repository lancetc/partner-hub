import "server-only";
import fs from "node:fs";
import path from "node:path";

/*
  Where imported packages live: the original ZIP and its unpacked files, per immutable version. Private:
  outside public/, and only served through the content route after a launch is checked. On this
  computer it's a folder (data/elearning, or HUB_ELEARNING_DIR); the same calls can be backed by object
  storage (for example Netlify Blobs) when the Hub moves to hosting that keeps files.
*/

const root = () => process.env.HUB_ELEARNING_DIR ?? path.join(process.cwd(), "data", "elearning");
const versionDir = (versionId: string) => {
  if (!/^[a-z0-9-]{8,64}$/.test(versionId)) throw new Error("Bad version id.");
  return path.join(root(), versionId);
};

/** Resolves a path inside a version's files, refusing anything that would land outside them. */
function inside(versionId: string, rel: string) {
  const base = path.join(versionDir(versionId), "files");
  const full = path.resolve(base, rel);
  if (full !== base && !full.startsWith(base + path.sep)) return null;
  return full;
}

export const storage = {
  async saveZip(versionId: string, zip: Buffer) {
    fs.mkdirSync(versionDir(versionId), { recursive: true });
    fs.writeFileSync(path.join(versionDir(versionId), "package.zip"), zip);
  },
  async writeFile(versionId: string, rel: string, data: Buffer) {
    const full = inside(versionId, rel);
    if (!full) throw new Error("Path outside the package.");
    fs.mkdirSync(path.dirname(full), { recursive: true });
    fs.writeFileSync(full, data, { flag: "wx" });
  },
  /** A file from a version, or null if it isn't there. */
  readFile(versionId: string, rel: string): Buffer | null {
    const full = inside(versionId, rel);
    if (!full) return null;
    try {
      const stat = fs.statSync(full);
      return stat.isFile() ? fs.readFileSync(full) : null;
    } catch {
      return null;
    }
  },
  /** Removes a version's files (an import that failed part-way). */
  async remove(versionId: string) {
    fs.rmSync(versionDir(versionId), { recursive: true, force: true });
  },
};
