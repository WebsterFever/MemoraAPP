import { Processor, WorkerHost } from "@nestjs/bullmq";
import { Inject, Logger } from "@nestjs/common";
import type { Job } from "bullmq";
import { PrismaService } from "../prisma/prisma.service";
import { EMBEDDING_PROVIDER, type EmbeddingProvider } from "./embedding-provider";
import { EMBEDDING_DIMENSIONS } from "./openai-embedding.service";
import { EMBEDDING_QUEUE } from "./queue.constants";

export type EmbedChunkJobData = { chunkId: string };

const API_KEY_PATTERN = /sk-[A-Za-z0-9_-]{10,}/g;
const MAX_ERROR_MESSAGE_LENGTH = 500;

/**
 * Strips anything that looks like an OpenAI API key and caps the length
 * before persisting an error to the database — MemoryChunk.errorMessage
 * must never carry a credential, even indirectly via a provider's raw
 * error text (defense in depth on top of OpenAI's own error messages,
 * which don't normally echo the key either).
 */
export function sanitizeErrorMessage(error: unknown): string {
  const raw = error instanceof Error ? error.message : String(error);
  const redacted = raw.replace(API_KEY_PATTERN, "[redacted]");
  return redacted.length > MAX_ERROR_MESSAGE_LENGTH ? `${redacted.slice(0, MAX_ERROR_MESSAGE_LENGTH)}…` : redacted;
}

/**
 * Consumes one job per MemoryChunk (job id = chunk id, see
 * EmbeddingService.enqueueForChunk). Embeds the chunk's text and writes the
 * vector via parameterized raw SQL — `embedding` is a Prisma `Unsupported`
 * column (no native vector scalar), so it can only be written/read with
 * $executeRaw/$queryRaw, never through generated Prisma Client CRUD methods.
 */
@Processor(EMBEDDING_QUEUE)
export class EmbeddingProcessor extends WorkerHost {
  private readonly logger = new Logger(EmbeddingProcessor.name);

  constructor(
    private readonly prisma: PrismaService,
    @Inject(EMBEDDING_PROVIDER) private readonly embeddingProvider: EmbeddingProvider,
  ) {
    super();
  }

  async process(job: Job<EmbedChunkJobData>): Promise<void> {
    const { chunkId } = job.data;
    const chunk = await this.prisma.memoryChunk.findUnique({ where: { id: chunkId } });
    if (!chunk) {
      this.logger.warn(`MemoryChunk ${chunkId} no longer exists — skipping job.`);
      return;
    }
    if (chunk.status === "EMBEDDED") {
      // Idempotent: a duplicate or retried job for an already-embedded
      // chunk must never re-embed (wasted API cost) or overwrite a
      // successfully stored vector.
      return;
    }

    try {
      const vector = await this.embeddingProvider.embed(chunk.text);
      if (vector.length !== EMBEDDING_DIMENSIONS) {
        // Defense in depth: OpenAiEmbeddingService already validates this
        // before returning, but the write boundary never trusts an upstream
        // guarantee for something this easy to re-check before it reaches
        // the database.
        throw new Error(
          `Refusing to store embedding with ${vector.length} dimensions (expected ${EMBEDDING_DIMENSIONS}).`,
        );
      }

      const vectorLiteral = `[${vector.join(",")}]`;
      // Guarded by status != EMBEDDED: if a concurrent duplicate job for
      // this same chunk already committed a successful embedding first,
      // this becomes a safe no-op instead of an unnecessary overwrite.
      await this.prisma.$executeRaw`
        UPDATE "MemoryChunk"
        SET "embedding" = ${vectorLiteral}::vector,
            "status" = 'EMBEDDED'::"MemoryChunkStatus",
            "errorMessage" = NULL,
            "updatedAt" = NOW()
        WHERE "id" = ${chunkId} AND "status" != 'EMBEDDED'::"MemoryChunkStatus"
      `;
    } catch (error) {
      const safeMessage = sanitizeErrorMessage(error);
      this.logger.error(`Embedding failed for MemoryChunk ${chunkId}: ${safeMessage}`);
      // Guarded the same way: a stale failure (e.g. this job's embed() call
      // lost a race against a concurrent duplicate that already succeeded)
      // must never downgrade an already-EMBEDDED chunk back to FAILED.
      // updateMany (not update) because the guard needs a non-unique
      // compound filter, not just the unique id.
      await this.prisma.memoryChunk.updateMany({
        where: { id: chunkId, status: { not: "EMBEDDED" } },
        data: { status: "FAILED", errorMessage: safeMessage },
      });
      // Re-throw so BullMQ applies the configured retry/backoff policy
      // (see EmbeddingService.enqueueForChunk) instead of silently treating
      // a failed attempt as a completed job.
      throw error;
    }
  }
}
