import { BadRequestException } from "@nestjs/common";

/**
 * AI conversation language identifiers (ISO 639-1), matching the interface
 * language set defined in docs/architecture/09-mobile-architecture.md §6.
 * Per docs/architecture/05-multilingual-multimodal-voice.md §6, the AI
 * conversation language is independent of both the app interface language
 * and the original memory's language — it only controls what language the
 * generated answer is written in.
 */
export const SUPPORTED_CONVERSATION_LANGUAGES: Readonly<Record<string, string>> = {
  en: "English",
  fr: "French",
  ht: "Haitian Creole",
  es: "Spanish",
  pt: "Portuguese",
  it: "Italian",
  de: "German",
};

/** Matches doc 09 §6's interface-language fallback: English when unset. */
export const DEFAULT_CONVERSATION_LANGUAGE_CODE = "en";

export type ResolvedConversationLanguage = {
  /** Lowercased ISO 639-1 code, e.g. "ht". Safe to echo back in a response. */
  code: string;
  /** Human-readable name, e.g. "Haitian Creole". Used in the generation prompt. */
  name: string;
};

/**
 * Validates a caller-supplied conversation language code and maps it to the
 * display name the generation prompt instructs the model to answer in.
 *
 * An empty/missing code falls back to the documented default (English). An
 * unrecognized non-empty code is rejected outright rather than silently
 * defaulted, since that more likely indicates a caller bug (e.g. a typo or
 * an unsupported locale leaking through) than a deliberate language choice.
 */
export function resolveConversationLanguage(code: string | undefined | null): ResolvedConversationLanguage {
  const trimmed = (code ?? "").trim();
  if (!trimmed) {
    return {
      code: DEFAULT_CONVERSATION_LANGUAGE_CODE,
      name: SUPPORTED_CONVERSATION_LANGUAGES[DEFAULT_CONVERSATION_LANGUAGE_CODE] as string,
    };
  }

  const normalized = trimmed.toLowerCase();
  const name = SUPPORTED_CONVERSATION_LANGUAGES[normalized];
  if (!name) {
    throw new BadRequestException(`Unsupported conversation language: "${code}".`);
  }
  return { code: normalized, name };
}
