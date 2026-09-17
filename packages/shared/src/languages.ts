/**
 * Languages supported at MVP launch (see docs/architecture/05-multilingual-multimodal-voice.md).
 * A memory's original language is never restricted to this list at the
 * storage layer, but this is the set the UI and prompt library explicitly
 * support translations/interviews in.
 */
export const SUPPORTED_LANGUAGES = ["en", "fr", "ht", "es", "pt"] as const;

export type SupportedLanguage = (typeof SUPPORTED_LANGUAGES)[number];

export function isSupportedLanguage(value: string): value is SupportedLanguage {
  return (SUPPORTED_LANGUAGES as readonly string[]).includes(value);
}
