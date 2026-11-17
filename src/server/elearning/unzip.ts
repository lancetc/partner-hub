import yauzl from "yauzl";

/*
  Reads an uploaded SCORM ZIP safely. Packages are untrusted: every entry's path is checked (no absolute
  paths, drive letters, ".." or backslash tricks), links and encrypted entries are refused, file types
  that have no place in a course are refused, and sizes are capped (per file, in total, entry count, and
  compression ratio, so a "zip bomb" can't fill the disk). Directory structure is kept as it is.
*/

export type UnzipLimits = { maxFiles: number; maxFileBytes: number; maxTotalBytes: number; maxRatio: number };
export const DEFAULT_LIMITS: UnzipLimits = {
  maxFiles: 20_000,
  maxFileBytes: 300 * 1024 * 1024,
  maxTotalBytes: 1024 * 1024 * 1024,
  // A Rise or Storyline export compresses a little; 200 to 1 is far beyond any real course file.
  maxRatio: 200,
};

export class UnzipError extends Error {}

/** Executables and server scripts: never part of a SCORM course. */
const BLOCKED = /\.(exe|msi|bat|cmd|com|scr|ps1|psm1|vbs|vbe|wsf|jar|dll|so|dylib|sh|bash|php\d?|phtml|asp|aspx|jsp|cgi|pl|py|rb|htaccess|lnk|app|apk)$/i;

/** Checks and tidies one entry's path. Returns null for entries to skip (macOS resource forks). */
export function safePath(name: string): string | null {
  if (!name || name.length > 1024) throw new UnzipError("A file in the package has no name, or a name that’s far too long.");
  if (/[\u0000-\u001f]/.test(name)) throw new UnzipError("A file name in the package contains control characters.");
  if (name.includes("\\")) throw new UnzipError(`“${name}” uses backslashes in its path, which isn’t allowed in a ZIP.`);
  if (name.startsWith("/") || /^[a-zA-Z]:/.test(name)) throw new UnzipError(`“${name}” has an absolute path.`);
  const segs = name.split("/");
  if (segs.some((s) => s === "..")) throw new UnzipError(`“${name}” tries to reach outside the package.`);
  if (segs[0] === "__MACOSX" || segs.some((s) => s === ".DS_Store")) return null;
  return segs.filter((s) => s && s !== ".").join("/");
}

export type Entry = { path: string; bytes: number };

/**
  Reads every file and hands it to `write` (in ZIP order). Resolves with the list of files written.
  Nothing outside `write` touches the disk, so a refused package leaves nothing behind but what the
  caller chooses to clean up.
*/
export function unzip(zip: Buffer, write: (path: string, data: Buffer) => Promise<void>, limits: UnzipLimits = DEFAULT_LIMITS): Promise<Entry[]> {
  return new Promise((resolve, reject) => {
    yauzl.fromBuffer(zip, { lazyEntries: true, validateEntrySizes: true, strictFileNames: false, decodeStrings: true }, (err, file) => {
      if (err || !file) return reject(new UnzipError("That file isn’t a readable ZIP."));
      const written: Entry[] = [];
      const seen = new Set<string>();
      let total = 0;
      let done = false;
      const fail = (e: unknown) => {
        if (done) return;
        done = true;
        file.close();
        const msg = e instanceof Error ? e.message : "";
        // yauzl refuses unsafe names itself before our own checks see them; say so plainly.
        if (!(e instanceof UnzipError) && /invalid relative path|absolute path|invalid characters/i.test(msg))
          return reject(new UnzipError(`A file in the package tries to reach outside the package (${msg.split(": ").pop()}).`));
        reject(e instanceof UnzipError ? e : new UnzipError(msg ? `The ZIP couldn’t be read: ${msg}` : "The ZIP couldn’t be read."));
      };
      if (file.entryCount > limits.maxFiles) return fail(new UnzipError(`The package has ${file.entryCount} files; the limit is ${limits.maxFiles}.`));
      file.on("error", fail);
      file.on("end", () => {
        if (done) return;
        done = true;
        resolve(written);
      });
      file.on("entry", (entry: yauzl.Entry) => {
        if (done) return;
        try {
          if (entry.fileName.endsWith("/")) return file.readEntry();
          // Unix file type in the high bits of the external attributes: 0o120000 is a symbolic link.
          const mode = (entry.externalFileAttributes >>> 16) & 0o170000;
          if (mode === 0o120000) throw new UnzipError(`“${entry.fileName}” is a link, which isn’t allowed in a package.`);
          if (entry.generalPurposeBitFlag & 0x1) throw new UnzipError("The ZIP is password protected.");
          const path = safePath(entry.fileName);
          if (path === null) return file.readEntry();
          if (BLOCKED.test(path)) throw new UnzipError(`“${path}” is a kind of file that can’t be part of a course.`);
          const key = path.toLowerCase();
          if (seen.has(key)) throw new UnzipError(`“${path}” appears twice in the package.`);
          seen.add(key);
          if (entry.uncompressedSize > limits.maxFileBytes) throw new UnzipError(`“${path}” is larger than the ${Math.round(limits.maxFileBytes / 1048576)} MB limit for one file.`);
          total += entry.uncompressedSize;
          if (total > limits.maxTotalBytes) throw new UnzipError(`The package unpacks to more than ${Math.round(limits.maxTotalBytes / 1048576)} MB.`);
          if (entry.uncompressedSize > 1024 * 1024 && entry.compressedSize > 0 && entry.uncompressedSize / entry.compressedSize > limits.maxRatio)
            throw new UnzipError(`“${path}” is compressed suspiciously far, so the package was refused.`);
        } catch (e) {
          return fail(e);
        }
        file.openReadStream(entry, (e2, stream) => {
          if (e2 || !stream) return fail(new UnzipError(`“${entry.fileName}” couldn’t be read.`));
          const chunks: Buffer[] = [];
          let size = 0;
          stream.on("data", (c: Buffer) => {
            size += c.length;
            // Sizes are validated by yauzl too; this stops reading as soon as a file runs over.
            if (size > limits.maxFileBytes) stream.destroy(new UnzipError(`“${entry.fileName}” is larger than its stated size.`));
            else chunks.push(c);
          });
          stream.on("error", fail);
          stream.on("end", () => {
            const path = safePath(entry.fileName)!;
            write(path, Buffer.concat(chunks))
              .then(() => {
                written.push({ path, bytes: size });
                file.readEntry();
              })
              .catch(fail);
          });
        });
      });
      file.readEntry();
    });
  });
}
