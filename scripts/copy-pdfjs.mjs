/*
  Copies PDF.js's worker and its support files (fonts, character maps, image decoders) into
  public/pdfjs, where the in-lesson PDF reader loads them. Run after changing the pdfjs-dist
  version: npm run pdfjs:copy
*/
import fs from "node:fs";
import path from "node:path";

const from = path.join("node_modules", "pdfjs-dist");
const to = path.join("public", "pdfjs");
fs.rmSync(to, { recursive: true, force: true });
fs.mkdirSync(to, { recursive: true });
fs.copyFileSync(path.join(from, "build", "pdf.worker.min.mjs"), path.join(to, "pdf.worker.min.mjs"));
for (const dir of ["standard_fonts", "cmaps", "wasm"]) fs.cpSync(path.join(from, dir), path.join(to, dir), { recursive: true });
const { version } = JSON.parse(fs.readFileSync(path.join(from, "package.json"), "utf8"));
fs.writeFileSync(path.join(to, "VERSION"), `${version}\n`);
console.log(`Copied PDF.js ${version} to ${to}`);
