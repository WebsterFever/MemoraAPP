/**
 * Provider-agnostic text-embedding abstraction, mirroring the
 * StorageProvider (media/storage/storage-provider.ts) and
 * TranscriptionProvider (transcription/transcription-provider.ts) pattern.
 * Consumers talk only to this interface — never to a specific vendor SDK —
 * so a future provider can be substituted by swapping the DI binding in
 * EmbeddingModule alone.
 */
export interface EmbeddingProvider {
  /**
   * Returns a fixed-length embedding vector for the given text. Rejects on
   * empty/whitespace-only input, provider failure, or a malformed/wrong-
   * dimension response — callers can assume a resolved promise always
   * contains a validated, correctly-sized number[].
   */
  embed(text: string): Promise<number[]>;
}

/** DI token — inject with `@Inject(EMBEDDING_PROVIDER) private embedding: EmbeddingProvider`. */
export const EMBEDDING_PROVIDER = Symbol("EMBEDDING_PROVIDER");
