import { handle } from "@/server/http";
import { HttpError, requireAuthor } from "@/server/auth";
import { adminCourses, importPackage, MAX_ZIP_BYTES } from "@/server/elearning/service";

/** Imported SCORM courses, with recent refused uploads and why. */
export async function GET() {
  return handle(({ db, user }) => adminCourses(db, user));
}

/** Upload a SCORM ZIP (form field "file"). It becomes a draft course to preview and publish. */
export async function POST(req: Request) {
  return handle(async ({ db, user, now }) => {
    requireAuthor(user);
    const size = Number(req.headers.get("content-length") ?? 0);
    if (size > MAX_ZIP_BYTES + 1024 * 1024) throw new HttpError(413, `That file is over ${MAX_ZIP_BYTES / 1048576} MB.`);
    let form: FormData;
    try {
      form = await req.formData();
    } catch {
      throw new HttpError(400, "Upload the SCORM ZIP as a file.");
    }
    const file = form.get("file");
    if (!(file instanceof File)) throw new HttpError(400, "Choose a SCORM ZIP to upload.");
    return importPackage(db, user, Buffer.from(await file.arrayBuffer()), file.name, now);
  });
}
