export const PRODUCT_NAME = "PromoForge";
export const DEFAULT_MODEL_TEMPERATURE = 0.1;
export const DEFAULT_MODEL_MAX_TOKENS = 4096;

export const DEFAULT_GEMINI_MODEL =
  (typeof import.meta !== "undefined" && (import.meta as any).env?.VITE_GEMINI_MODEL) ||
  "gemini-3.1-flash-lite";

export const DEFAULT_GEMINI_BASE_URL =
  (typeof import.meta !== "undefined" && (import.meta as any).env?.VITE_GEMINI_BASE_URL) ||
  "";

export const DEMO_MODEL_OPTIONS = [
  {
    value: "fallback",
    label: "Rule-based scoring (lower quality, offline)",
    defaultModel: "rule-based",
    runnable: true,
    needsApiKey: false,
  },
  {
    value: "gemini",
    label: "Google Gemini (server-managed key)",
    defaultModel: DEFAULT_GEMINI_MODEL,
    runnable: true,
    needsApiKey: false,
  },
  {
    value: "no-api",
    label: "No-API prompt + JSON paste",
    defaultModel: "manual-paste",
    runnable: true,
    needsApiKey: false,
  },
] as const;

export type DemoModelValue = (typeof DEMO_MODEL_OPTIONS)[number]["value"];
