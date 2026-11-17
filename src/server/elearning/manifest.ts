import { XMLParser } from "fast-xml-parser";

/*
  Reads a SCORM package's imsmanifest.xml: which standard and edition it is, its title and identifier,
  and the resource to launch. The launch file comes from the manifest (the default organisation's first
  item that points at a resource), never assumed to be index.html or story.html. Pure, so it's tested
  without files.
*/

export type Standard = "scorm12" | "scorm2004";
export type ManifestItem = { identifier: string; title: string; href: string | null; scormType: string | null };
export type Manifest = {
  standard: Standard;
  /** "1.2", "2004 2nd Edition", "2004 3rd Edition", "2004 4th Edition", or "2004 (edition not stated)". */
  edition: string;
  identifier: string;
  version: string | null;
  title: string;
  /** Path of the launch file inside the package, with the resource's xml:base applied. */
  launchHref: string;
  /** Query string the manifest adds to the launch file (kept and passed on), without the "?". */
  launchQuery: string;
  items: ManifestItem[];
  warnings: string[];
};

export class ManifestError extends Error {}

const parser = new XMLParser({
  ignoreAttributes: false,
  attributeNamePrefix: "@",
  removeNSPrefix: true,
  // Elements that can repeat are always arrays, so one item and many items read the same way.
  isArray: (name) => ["organization", "item", "resource", "file", "dependency"].includes(name),
  trimValues: true,
});

const list = <T>(v: T | T[] | undefined): T[] => (v === undefined ? [] : Array.isArray(v) ? v : [v]);
const text = (v: unknown): string => {
  if (v === undefined || v === null) return "";
  if (typeof v === "string" || typeof v === "number") return String(v).trim();
  if (typeof v === "object" && "#text" in (v as Record<string, unknown>)) return String((v as Record<string, unknown>)["#text"]).trim();
  // A <title> holding <langstring> elements (SCORM 1.2 metadata style).
  if (typeof v === "object" && "langstring" in (v as Record<string, unknown>)) return text(list((v as Record<string, unknown>).langstring as unknown)[0]);
  return "";
};

/** Joins xml:base values and an href the way the manifest means them, and tidies the result. */
export function joinHref(...parts: string[]) {
  const joined = parts.filter(Boolean).join("/").replace(/\\/g, "/");
  const [path, query = ""] = joined.split("?");
  const out: string[] = [];
  for (const seg of path.split("/")) {
    if (!seg || seg === ".") continue;
    if (seg === "..") {
      if (!out.length) throw new ManifestError("The manifest points outside the package.");
      out.pop();
    } else out.push(seg);
  }
  return { path: out.join("/"), query };
}

function editionOf(schemaversion: string, raw: string): { standard: Standard; edition: string } | null {
  const v = schemaversion.toLowerCase();
  if (v === "1.2") return { standard: "scorm12", edition: "1.2" };
  if (v.includes("4th")) return { standard: "scorm2004", edition: "2004 4th Edition" };
  if (v.includes("3rd")) return { standard: "scorm2004", edition: "2004 3rd Edition" };
  if (v === "cam 1.3" || v.includes("2nd")) return { standard: "scorm2004", edition: "2004 2nd Edition" };
  if (v.startsWith("2004")) return { standard: "scorm2004", edition: "2004 (edition not stated)" };
  // No usable schemaversion: fall back on the namespaces the manifest declares.
  if (/adlcp_rootv1p2/i.test(raw)) return { standard: "scorm12", edition: "1.2" };
  if (/adlcp_v1p3/i.test(raw)) return { standard: "scorm2004", edition: "2004 (edition not stated)" };
  return null;
}

/**
  Parses a manifest. `exists` says whether a path is a file in the package, so a launch file that isn't
  there is caught at import rather than when a learner opens the course.
*/
export function parseManifest(xml: string, exists: (path: string) => boolean): Manifest {
  let doc: Record<string, unknown>;
  try {
    doc = parser.parse(xml);
  } catch {
    throw new ManifestError("imsmanifest.xml isn’t valid XML.");
  }
  const manifest = doc.manifest as Record<string, unknown> | undefined;
  if (!manifest) throw new ManifestError("imsmanifest.xml has no <manifest> element.");
  const warnings: string[] = [];

  const metadata = (manifest.metadata ?? {}) as Record<string, unknown>;
  const kind = editionOf(text(metadata.schemaversion), xml);
  if (!kind) throw new ManifestError("This isn’t a SCORM 1.2 or SCORM 2004 package (no SCORM schema version in the manifest).");
  if (text(metadata.schema) && !/adl scorm/i.test(text(metadata.schema))) warnings.push(`The manifest’s schema is “${text(metadata.schema)}”, not “ADL SCORM”.`);

  const resourcesNode = (manifest.resources ?? {}) as Record<string, unknown>;
  const resources = list(resourcesNode.resource as Record<string, unknown>[] | undefined);
  const resourceBase = String(resourcesNode["@base"] ?? "");
  const manifestBase = String(manifest["@base"] ?? "");
  const byId = new Map(resources.map((r) => [String(r["@identifier"] ?? ""), r]));

  const orgsNode = (manifest.organizations ?? {}) as Record<string, unknown>;
  const orgs = list(orgsNode.organization as Record<string, unknown>[] | undefined);
  const defaultId = String(orgsNode["@default"] ?? "");
  const org = orgs.find((o) => String(o["@identifier"]) === defaultId) ?? orgs[0];

  const items: ManifestItem[] = [];
  const walk = (nodes: Record<string, unknown>[]) => {
    for (const n of nodes) {
      const ref = n["@identifierref"] ? String(n["@identifierref"]) : null;
      const res = ref ? byId.get(ref) : undefined;
      if (ref && !res) warnings.push(`Item “${text(n.title) || String(n["@identifier"])}” points at a resource that isn’t in the manifest.`);
      let href: string | null = null;
      if (res && res["@href"]) {
        const { path, query } = joinHref(manifestBase, resourceBase, String(res["@base"] ?? ""), String(res["@href"]));
        const params = n["@parameters"] ? String(n["@parameters"]).replace(/^[?&]/, "") : "";
        href = [path, [query, params].filter(Boolean).join("&")].filter(Boolean).join("?");
      }
      items.push({
        identifier: String(n["@identifier"] ?? ""),
        title: text(n.title),
        href,
        scormType: res ? String(res["@scormtype"] ?? res["@scormType"] ?? "") || null : null,
      });
      walk(list(n.item as Record<string, unknown>[] | undefined));
    }
  };
  if (org) walk(list(org.item as Record<string, unknown>[] | undefined));

  let launch = items.find((i) => i.href && i.scormType?.toLowerCase() === "sco") ?? items.find((i) => i.href);
  // Some packages have no organisation at all: launch their only SCO resource.
  if (!launch) {
    const sco = resources.find((r) => String(r["@scormtype"] ?? r["@scormType"] ?? "").toLowerCase() === "sco" && r["@href"]) ?? resources.find((r) => r["@href"]);
    if (sco) {
      const { path, query } = joinHref(manifestBase, resourceBase, String(sco["@base"] ?? ""), String(sco["@href"]));
      launch = { identifier: String(sco["@identifier"] ?? ""), title: "", href: [path, query].filter(Boolean).join("?"), scormType: "sco" };
      warnings.push("The manifest has no organisation; the package’s SCO resource is launched directly.");
    }
  }
  if (!launch?.href) throw new ManifestError("The manifest doesn’t say which file to launch.");
  if (/^[a-z][a-z0-9+.-]*:/i.test(launch.href) || launch.href.startsWith("//")) throw new ManifestError("The launch file is on another website. Only self-contained packages can be imported.");
  const [launchPath, launchQuery = ""] = launch.href.split("?");
  if (!exists(launchPath)) throw new ManifestError(`The launch file “${launchPath}” named in the manifest isn’t in the package.`);

  const scos = items.filter((i) => i.href && i.scormType?.toLowerCase() === "sco");
  if (scos.length > 1) warnings.push(`This package has ${scos.length} SCOs. Only the first, “${scos[0].title || scos[0].identifier}”, is launched for now; multi-SCO packages come later.`);
  if (kind.standard === "scorm2004" && /<imsss:sequencing|<sequencing[\s>]/i.test(xml))
    warnings.push("The manifest includes SCORM 2004 sequencing rules. Sequencing isn’t applied yet; the first SCO is launched.");

  const title = text(org?.title) || launch.title || text((metadata.lom as Record<string, unknown> | undefined)?.general) || "Untitled course";
  return {
    standard: kind.standard,
    edition: kind.edition,
    identifier: String(manifest["@identifier"] ?? "") || "unknown",
    version: manifest["@version"] ? String(manifest["@version"]) : null,
    title: title.slice(0, 200),
    launchHref: launchPath,
    launchQuery,
    items,
    warnings,
  };
}
