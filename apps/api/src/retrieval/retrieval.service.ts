import { BadRequestException, ForbiddenException, Inject, Injectable, NotFoundException } from "@nestjs/common";
import { PrismaService } from "../prisma/prisma.service";
import { EMBEDDING_PROVIDER, type EmbeddingProvider } from "../embedding/embedding-provider";

export type RetrievedChunk = {
  chunkId: string;
  memoryId: string;
  memorySourceId: string;
  text: string;
  similarity: number;
};

export type RetrieveRelevantChunksParams = {
  question: string;
  familyId: string;
  profileId: string;
  userId: string;
  topK?: number;
  /**
   * Optional floor on cosine similarity [-1, 1] — a chunk is only returned
   * if `similarity >= minSimilarity`. Defaults to -1 (the true floor of the
   * range), which excludes nothing and preserves the service's original
   * unfiltered behavior exactly.
   *
   * This value is **uncalibrated**. It is a mechanical floor the caller can
   * opt into, not a proven "this chunk is actually relevant" signal — the
   * live multilingual evaluation (see conversation history) showed a
   * genuinely unrelated English question scoring only 0.009 below a
   * genuinely relevant one on a single short memory, so no fixed number
   * here can honestly claim to separate "relevant" from "not relevant."
   * Deciding whether retrieved evidence is strong enough to answer from is
   * the grounded-response layer's job (a later, separate checkpoint), not
   * this service's.
   */
  minSimilarity?: number;
};

const DEFAULT_TOP_K = 5;
const MAX_TOP_K = 20;
const MIN_SIMILARITY_FLOOR = -1;
const MIN_SIMILARITY_CEILING = 1;
const DEFAULT_MIN_SIMILARITY = MIN_SIMILARITY_FLOOR;

/**
 * Retrieval only — no answer generation, no relevance judgment. Returns raw
 * chunk references plus their similarity scores for a later grounded-
 * response stage (a separate, later checkpoint) to consume. The nearest
 * chunk is never automatically treated as "relevant" — this service always
 * reports what it found and how close it scored; deciding whether that's
 * good enough to answer from is explicitly not this service's job (see
 * `minSimilarity` below for why a fixed number here can't make that call
 * either).
 *
 * Authorization is two layers, matching docs/architecture/03 exactly rather
 * than the family-membership-only shortcut older endpoints (MemoriesService,
 * MediaService) currently use:
 *   1. FamilyMembership (ACTIVE) — baseline tenant isolation, same as every
 *      other endpoint.
 *   2. MemoryProfilePermission (any non-revoked role) — doc 03's permission
 *      table explicitly lists "Ask questions (RAG)" as profile-permission
 *      gated. Every profile already gets a MEMORY_OWNER row for its creator
 *      at creation time (FamiliesService.createProfile), so this does not
 *      break existing data — it is stricter than some older read endpoints
 *      today, a deliberate correction for this new feature, not a
 *      regression to reconcile silently.
 *
 * Both checks run, and the question is only embedded (spending a real
 * OpenAI call), after both pass — an unauthorized request never reaches
 * OpenAI.
 */
@Injectable()
export class RetrievalService {
  constructor(
    private readonly prisma: PrismaService,
    @Inject(EMBEDDING_PROVIDER) private readonly embeddingProvider: EmbeddingProvider,
  ) {}

  async retrieveRelevantChunks(params: RetrieveRelevantChunksParams): Promise<RetrievedChunk[]> {
    const { familyId, profileId, userId } = params;
    const question = params.question.trim();
    if (!question) {
      throw new BadRequestException("Question must not be empty.");
    }

    const topK = this.boundTopK(params.topK);
    const minSimilarity = this.validateMinSimilarity(params.minSimilarity);

    const membership = await this.prisma.familyMembership.findUnique({
      where: { familyId_userId: { familyId, userId } },
    });
    if (!membership || membership.status !== "ACTIVE") {
      throw new ForbiddenException();
    }

    const profile = await this.prisma.memoryProfile.findFirst({ where: { id: profileId, familyId } });
    if (!profile) {
      throw new NotFoundException("Profile not found");
    }

    const permission = await this.prisma.memoryProfilePermission.findUnique({
      where: { profileId_userId: { profileId, userId } },
    });
    if (!permission || permission.revokedAt) {
      throw new ForbiddenException();
    }

    const vector = await this.embeddingProvider.embed(question);
    const vectorLiteral = `[${vector.join(",")}]`;

    const rows = await this.prisma.$queryRaw<
      Array<{ id: string; memoryId: string; memorySourceId: string; text: string; similarity: number }>
    >`
      SELECT id, "memoryId", "memorySourceId", text,
             1 - (embedding <=> ${vectorLiteral}::vector) AS similarity
      FROM "MemoryChunk"
      WHERE "familyId" = ${familyId}
        AND "profileId" = ${profileId}
        AND status = 'EMBEDDED'::"MemoryChunkStatus"
        AND embedding IS NOT NULL
      ORDER BY embedding <=> ${vectorLiteral}::vector
      LIMIT ${topK}
    `;

    // Filtered in application code, not SQL, so the query stays a plain,
    // easy-to-audit similarity search and the (uncalibrated, opt-in) floor
    // logic stays visible and independently testable here. At this result
    // size (bounded by topK <= 20) there's no performance reason to push
    // this into the WHERE clause.
    return rows
      .filter((row) => row.similarity >= minSimilarity)
      .map((row) => ({
        chunkId: row.id,
        memoryId: row.memoryId,
        memorySourceId: row.memorySourceId,
        text: row.text,
        similarity: row.similarity,
      }));
  }

  private boundTopK(requested: number | undefined): number {
    if (!Number.isFinite(requested)) {
      return DEFAULT_TOP_K;
    }
    return Math.min(Math.max(Math.trunc(requested as number), 1), MAX_TOP_K);
  }

  private validateMinSimilarity(requested: number | undefined): number {
    if (requested === undefined) {
      return DEFAULT_MIN_SIMILARITY;
    }
    if (!Number.isFinite(requested)) {
      throw new BadRequestException("minSimilarity must be a finite number.");
    }
    if (requested < MIN_SIMILARITY_FLOOR || requested > MIN_SIMILARITY_CEILING) {
      throw new BadRequestException(
        `minSimilarity must be between ${MIN_SIMILARITY_FLOOR} and ${MIN_SIMILARITY_CEILING} (the valid cosine similarity range).`,
      );
    }
    return requested;
  }
}
