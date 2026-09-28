import { Injectable, Logger, ServiceUnavailableException } from "@nestjs/common";
import { ConfigService } from "@nestjs/config";
import OpenAI from "openai";
import type { EmbeddingProvider } from "./embedding-provider";

export const EMBEDDING_MODEL = "text-embedding-3-large";
export const EMBEDDING_DIMENSIONS = 1536;

/**
 * OpenAI implementation of EmbeddingProvider, using the same `openai`
 * package/client as OpenAiTranscriptionService (Phase 5) — no second,
 * competing OpenAI integration. Deliberately tolerant of a missing
 * OPENAI_API_KEY at boot, same pattern as S3StorageService and
 * OpenAiTranscriptionService: the API must start and every other feature
 * must keep working; only embedding requests fail until the key is set.
 */
@Injectable()
export class OpenAiEmbeddingService implements EmbeddingProvider {
  private readonly logger = new Logger(OpenAiEmbeddingService.name);
  private readonly client?: OpenAI;

  constructor(config: ConfigService) {
    const apiKey = config.get<string>("OPENAI_API_KEY");
    if (apiKey) {
      this.client = new OpenAI({ apiKey });
    } else {
      this.logger.warn("OPENAI_API_KEY is not configured — embedding requests will fail until it is set.");
    }
  }

  async embed(text: string): Promise<number[]> {
    const trimmed = text.trim();
    if (!trimmed) {
      throw new Error("Cannot embed empty text.");
    }
    if (!this.client) {
      throw new ServiceUnavailableException("Embedding is not configured yet. Set OPENAI_API_KEY.");
    }

    const response = await this.client.embeddings.create({
      model: EMBEDDING_MODEL,
      input: trimmed,
      dimensions: EMBEDDING_DIMENSIONS,
    });

    const embedding = response.data?.[0]?.embedding;
    if (!Array.isArray(embedding)) {
      throw new Error("OpenAI embedding response did not include an embedding array.");
    }
    if (embedding.length !== EMBEDDING_DIMENSIONS) {
      throw new Error(`Expected a ${EMBEDDING_DIMENSIONS}-dimension embedding but received ${embedding.length}.`);
    }
    if (!embedding.every((value) => typeof value === "number" && Number.isFinite(value))) {
      throw new Error("OpenAI embedding response contained non-numeric values.");
    }

    return embedding;
  }
}
