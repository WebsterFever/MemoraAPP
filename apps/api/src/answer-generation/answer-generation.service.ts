import { Inject, Injectable } from "@nestjs/common";
import { RetrievalService } from "../retrieval/retrieval.service";
import { resolveConversationLanguage } from "./conversation-language";
import { LLM_PROVIDER, type LlmProvider } from "./llm-provider";

export type GenerateAnswerParams = {
  question: string;
  familyId: string;
  profileId: string;
  userId: string;
  /** ISO 639-1 code (e.g. "ht", "fr", "en"). Omit/empty for the default. */
  conversationLanguage?: string;
};

export type Citation = {
  chunkId: string;
  memoryId: string;
  memorySourceId: string;
  /** Original-language excerpt as stored — never translated or paraphrased. */
  quotedText: string;
};

export type AnswerGenerationResponse = {
  refused: boolean;
  refusalReason: string | null;
  answer: string | null;
  citations: Citation[];
  /** Resolved ISO 639-1 code actually used — the default if none was requested. */
  conversationLanguage: string;
  /** Always true. Marks this payload as model-generated text, distinct from
   * an original recorded memory, per the requirement that generated answers
   * must never be confused with original memory content. */
  isGenerated: true;
};

/** Internal, machine-checkable refusal reasons this service generates itself
 * (as opposed to free-text reasons the model supplies for its own domain
 * refusals). Exported so tests can assert against the same constants
 * instead of duplicating string literals. */
export const REFUSAL_REASON = {
  NO_RELEVANT_MEMORY: "NO_RELEVANT_MEMORY",
  MODEL_REFUSED: "MODEL_REFUSED",
  FABRICATED_CITATION: "FABRICATED_CITATION",
  NO_VALID_CITATIONS: "NO_VALID_CITATIONS",
  EMPTY_ANSWER_WITH_NO_REFUSAL: "EMPTY_ANSWER_WITH_NO_REFUSAL",
} as const;

/**
 * Orchestrates grounded answer generation: resolve + validate the requested
 * conversation language, retrieve authorized chunks via the existing
 * RetrievalService (unchanged), refuse before ever calling the LLM if there
 * is nothing to ground on, call the LlmProvider, then verify every claimed
 * citation against the chunks actually retrieved for this request before
 * trusting it.
 *
 * Citation validation only confirms a cited chunk ID was real and authorized
 * for this request — it does NOT verify that the chunk's content actually
 * supports the specific claim it was cited for. That stronger, claim-level
 * verification is not implemented in this checkpoint; it is a documented
 * limitation, not an oversight.
 *
 * If the model cites even one unknown/unauthorized chunk ID alongside
 * otherwise-valid ones, the entire answer is refused rather than silently
 * dropping the bad citation and keeping the rest — a model that fabricates
 * one citation has demonstrated it can't be trusted for this answer.
 */
@Injectable()
export class AnswerGenerationService {
  constructor(
    private readonly retrieval: RetrievalService,
    @Inject(LLM_PROVIDER) private readonly llm: LlmProvider,
  ) {}

  async generateAnswer(params: GenerateAnswerParams): Promise<AnswerGenerationResponse> {
    const language = resolveConversationLanguage(params.conversationLanguage);

    const chunks = await this.retrieval.retrieveRelevantChunks({
      question: params.question,
      familyId: params.familyId,
      profileId: params.profileId,
      userId: params.userId,
    });

    if (chunks.length === 0) {
      return this.refusal(REFUSAL_REASON.NO_RELEVANT_MEMORY, language.code);
    }

    const result = await this.llm.generateGroundedAnswer({
      question: params.question,
      conversationLanguage: language.name,
      context: chunks.map((chunk) => ({ chunkId: chunk.chunkId, text: chunk.text })),
    });

    if (result.refused) {
      return this.refusal(result.refusalReason ?? REFUSAL_REASON.MODEL_REFUSED, language.code);
    }

    // Trust nothing the model claims to have cited beyond what we actually
    // retrieved and passed in for this exact request. Any single fabricated
    // or unauthorized ID invalidates the whole answer — never quietly keep
    // the "good" citations and discard the bad one.
    const chunkById = new Map(chunks.map((chunk) => [chunk.chunkId, chunk]));
    const hasFabricatedCitation = result.citedChunkIds.some((id) => !chunkById.has(id));
    if (hasFabricatedCitation) {
      return this.refusal(REFUSAL_REASON.FABRICATED_CITATION, language.code);
    }

    const uniqueCitedIds = [...new Set(result.citedChunkIds)];
    const validCitations: Citation[] = uniqueCitedIds.map((id) => {
      const chunk = chunkById.get(id)!;
      return {
        chunkId: chunk.chunkId,
        memoryId: chunk.memoryId,
        memorySourceId: chunk.memorySourceId,
        quotedText: chunk.text,
      };
    });

    if (validCitations.length === 0) {
      return this.refusal(REFUSAL_REASON.NO_VALID_CITATIONS, language.code);
    }

    // Defensive contract guard: a non-refusal must carry real answer text.
    // The model's own schema can't structurally forbid refused=false with an
    // empty/blank answer, so this is handled conservatively here rather than
    // trusted — per the design doc's requirement that unsupported or
    // malformed model output never produces a broken response contract.
    if (!result.answer || result.answer.trim().length === 0) {
      return this.refusal(REFUSAL_REASON.EMPTY_ANSWER_WITH_NO_REFUSAL, language.code);
    }

    return {
      refused: false,
      refusalReason: null,
      answer: result.answer,
      citations: validCitations,
      conversationLanguage: language.code,
      isGenerated: true,
    };
  }

  private refusal(reason: string, conversationLanguage: string): AnswerGenerationResponse {
    return {
      refused: true,
      refusalReason: reason,
      answer: null,
      citations: [],
      conversationLanguage,
      isGenerated: true,
    };
  }
}
