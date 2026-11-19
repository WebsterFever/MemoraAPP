/**
 * Languages supported at MVP launch (see docs/architecture/05-multilingual-multimodal-voice.md
 * and docs/architecture/09-mobile-architecture.md §6 "Initial interface languages").
 * A memory's original language is never restricted to this list at the
 * storage layer, but this is the set the UI and prompt library explicitly
 * support translations/interviews in.
 */
export const SUPPORTED_LANGUAGES = ["en", "fr", "ht", "es", "pt", "it", "de"] as const;

export type SupportedLanguage = (typeof SUPPORTED_LANGUAGES)[number];

export function isSupportedLanguage(value: string): value is SupportedLanguage {
  return (SUPPORTED_LANGUAGES as readonly string[]).includes(value);
}

/** Display name for each supported language code, in its own language. */
export const LANGUAGE_DISPLAY_NAMES: Record<SupportedLanguage, string> = {
  en: "English",
  fr: "Français",
  ht: "Kreyòl Ayisyen",
  es: "Español",
  pt: "Português",
  it: "Italiano",
  de: "Deutsch",
};

export const DEFAULT_LANGUAGE: SupportedLanguage = "en";
