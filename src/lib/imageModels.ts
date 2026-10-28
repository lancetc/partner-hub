/*
  Image generators offered in the editor, run through ElevenLabs' Image & Video API. Each model
  takes different settings; ElevenLabs rejects settings a model doesn't take, so only these are
  sent. Resolutions stop at 2K so a picture fits the hub's 8 MB upload limit.
*/

export type ImageModel = {
  id: string;
  label: string;
  maker: "Google" | "OpenAI";
  note: string;
  aspects: string[];
  resolutions?: string[];
  qualities?: string[];
  defaultQuality?: string;
};

const WIDE = ["16:9", "3:2", "4:3", "1:1", "4:5", "3:4", "2:3", "9:16"];

export const IMAGE_MODELS: ImageModel[] = [
  {
    id: "gemini-3-pro-image",
    label: "Gemini 3 Pro Image",
    maker: "Google",
    note: "Google’s best. Realistic people and scenes, follows detailed prompts well.",
    aspects: WIDE,
    resolutions: ["1K", "2K"],
  },
  {
    id: "gemini-3.1-flash-image",
    label: "Gemini 3.1 Flash Image",
    maker: "Google",
    note: "Fast and good value. Try ideas here first.",
    aspects: WIDE,
    resolutions: ["1K", "2K"],
  },
  {
    id: "gemini-3.1-flash-lite-image",
    label: "Gemini 3.1 Flash Lite Image",
    maker: "Google",
    note: "The quickest and cheapest. Rough drafts.",
    aspects: WIDE,
  },
  {
    id: "gemini-2.5-flash-image",
    label: "Gemini 2.5 Flash Image",
    maker: "Google",
    note: "The earlier Gemini model.",
    aspects: WIDE,
  },
  {
    id: "gpt-image-2",
    label: "GPT Image 2",
    maker: "OpenAI",
    note: "OpenAI’s image model. Strong at illustration and clean compositions.",
    aspects: WIDE,
    resolutions: ["1K", "2K"],
    qualities: ["low", "medium", "high"],
    defaultQuality: "medium",
  },
  {
    id: "gpt-image-1.5",
    label: "GPT Image 1.5",
    maker: "OpenAI",
    note: "The earlier OpenAI model. Square or 3:2 only.",
    aspects: ["3:2", "1:1", "2:3"],
    qualities: ["low", "medium", "high"],
    defaultQuality: "medium",
  },
];

export const DEFAULT_IMAGE_MODEL = "gemini-3-pro-image";

/** Added to the prompt when "Trilogy Care photo style" is on, so posters look like one family. */
export const HOUSE_STYLE =
  "Warm, natural documentary-style photograph in an Australian home or community setting. Soft daylight, real-looking older people and care workers, respectful and dignified, genuine expressions. No text, words, logos or watermarks.";

export const imageModel = (id: string) => IMAGE_MODELS.find((m) => m.id === id);
