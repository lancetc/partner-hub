/*
  Languages people can read the hub in, through Google Translate. Chosen for the Australian aged
  care workforce. Codes are Google Translate's.
*/
export const LANGUAGES = [
  { code: "en", label: "English", native: "English" },
  { code: "vi", label: "Vietnamese", native: "Tiếng Việt" },
  { code: "zh-CN", label: "Chinese (Simplified)", native: "简体中文" },
  { code: "zh-TW", label: "Chinese (Traditional)", native: "繁體中文" },
  { code: "ar", label: "Arabic", native: "العربية" },
  { code: "el", label: "Greek", native: "Ελληνικά" },
  { code: "it", label: "Italian", native: "Italiano" },
  { code: "hi", label: "Hindi", native: "हिन्दी" },
  { code: "pa", label: "Punjabi", native: "ਪੰਜਾਬੀ" },
  { code: "ne", label: "Nepali", native: "नेपाली" },
  { code: "tl", label: "Filipino", native: "Filipino" },
  { code: "es", label: "Spanish", native: "Español" },
  { code: "ko", label: "Korean", native: "한국어" },
] as const;

export type LanguageCode = (typeof LANGUAGES)[number]["code"];
export const isLanguage = (code: unknown): code is LanguageCode => LANGUAGES.some((l) => l.code === code);
export const languageName = (code: string) => {
  const l = LANGUAGES.find((x) => x.code === code);
  return l ? (l.code === "en" ? l.label : `${l.native} (${l.label})`) : "English";
};
