/*
  The picture behind a learning path's "Who it's for" panel when the path hasn't chosen its own:
  the one from the Care Coordination path, kept with the site so every path has it.
*/
export const DEFAULT_WHO_PHOTO = "/images/path-who-default.webp";

export const whoPhotoFor = (own?: string | null) => own || DEFAULT_WHO_PHOTO;
