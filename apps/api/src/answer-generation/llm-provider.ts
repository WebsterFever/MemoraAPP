export type AnswerGenerationContextChunk = {
  chunkId: string;
  text: string;
};

export type AnswerGenerationRequest = {
  question: string;
  /** Resolved, human-readable display name (e.g. "Haitian Creole"), already
   * validated against the supported language set by the caller
   * (AnswerGenerationService via conversation-language.ts) — never a raw,
   * unvalidated identifier. */
  conversationLanguage: string;
  context: AnswerGenerationContextChunk[];
};

export type AnswerGenerationResult = {
  refused: boolean;
  refusalReason: string | null;
  answer: string | null;
  /** Chunk IDs the model claims to have relied on — unverified at this
   * layer. AnswerGenerationService is responsible for checking every one
   * of these against the chunks actually passed in before trusting it. */
  citedChunkIds: string[];
};

/**
 * Provider-agnostic grounded-answer generation abstraction, mirroring the
 * StorageProvider/TranscriptionProvider/EmbeddingProvider pattern.
 * AnswerGenerationService talks only to this interface — never to a vendor
 * SDK directly — so a future provider can be substituted by swapping the DI
 * binding in AnswerGenerationModule alone.
 */
export interface LlmProvider {
  generateGroundedAnswer(request: AnswerGenerationRequest): Promise<AnswerGenerationResult>;
}

/** DI token — inject with `@Inject(LLM_PROVIDER) private llm: LlmProvider`. */
export const LLM_PROVIDER = Symbol("LLM_PROVIDER");
