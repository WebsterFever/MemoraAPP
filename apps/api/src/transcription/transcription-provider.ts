export interface TranscriptionResult {
  /** BCP-47-ish language code/name as reported by the provider, if any. */
  language?: string;
  rawTranscript: string;
}

/**
 * Provider-agnostic speech-to-text abstraction, mirroring the StorageProvider
 * pattern in media/storage/storage-provider.ts. TranscriptionProcessor talks
 * only to this interface — never to a specific vendor SDK — so a future
 * provider can be substituted by swapping the DI binding in
 * TranscriptionModule alone.
 */
export interface TranscriptionProvider {
  transcribe(params: { audioUrl: string; mimeType: string }): Promise<TranscriptionResult>;
}

/** DI token — inject with `@Inject(TRANSCRIPTION_PROVIDER) private transcription: TranscriptionProvider`. */
export const TRANSCRIPTION_PROVIDER = Symbol("TRANSCRIPTION_PROVIDER");
