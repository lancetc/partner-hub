/*
  The documents a draft can be read from, checked in the browser before uploading so the author hears straight away
  (the server checks again). A SCORM package (.zip) is an existing eLearning course: its words are read out of it.
*/

export const MAX_DOC_BYTES = 15 * 1024 * 1024;
/** A SCORM package carries its media, so it may be far bigger than the words in it. */
export const MAX_SCORM_BYTES = 200 * 1024 * 1024;

/** The file picker's accept list for drafting a Topic, Challenge or Path. */
export const DRAFT_SOURCE_TYPES =
  ".pdf,.docx,.txt,.md,.zip,application/pdf,application/vnd.openxmlformats-officedocument.wordprocessingml.document,text/plain,application/zip";

/** Why a chosen file can't be a draft's source, or null when it can. */
export function draftSourceProblem(f: File): string | null {
  if (!/\.(pdf|docx|txt|md|zip)$/i.test(f.name)) return "Attach a PDF, Word (.docx), text file or SCORM package (.zip).";
  if (/\.zip$/i.test(f.name))
    return f.size > MAX_SCORM_BYTES ? "That SCORM package is over 200 MB. Export it without its video, or upload the script instead." : null;
  return f.size > MAX_DOC_BYTES ? "That file is over 15 MB." : null;
}
