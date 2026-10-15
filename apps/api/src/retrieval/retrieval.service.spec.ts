import { BadRequestException, ForbiddenException, NotFoundException } from "@nestjs/common";
import { RetrievalService } from "./retrieval.service";
import type { EmbeddingProvider } from "../embedding/embedding-provider";

const FAMILY_ID = "family-1";
const OTHER_FAMILY_ID = "family-2";
const PROFILE_ID = "profile-1";
const USER_ID = "user-1";

function makePrismaStub() {
  return {
    familyMembership: { findUnique: jest.fn() },
    memoryProfile: { findFirst: jest.fn() },
    memoryProfilePermission: { findUnique: jest.fn() },
    $queryRaw: jest.fn().mockResolvedValue([]),
  };
}

function makeEmbeddingProviderStub(): jest.Mocked<EmbeddingProvider> {
  return { embed: jest.fn() };
}

/** Joins a mocked $queryRaw tagged-template call's SQL fragments, so tests
 * can assert on the literal query text without a real database. */
function sqlTextOf(call: unknown[]): string {
  return (call[0] as string[]).join("?");
}

function activeMembership(role: string = "CONTRIBUTOR") {
  return { familyId: FAMILY_ID, userId: USER_ID, role, status: "ACTIVE" };
}

function activePermission(role: string = "VIEWER") {
  return { profileId: PROFILE_ID, userId: USER_ID, role, revokedAt: null };
}

function fakeVector(length = 1536): number[] {
  return Array.from({ length }, (_, i) => i * 0.0001);
}

describe("RetrievalService", () => {
  let prisma: ReturnType<typeof makePrismaStub>;
  let embeddingProvider: jest.Mocked<EmbeddingProvider>;
  let service: RetrievalService;

  beforeEach(() => {
    prisma = makePrismaStub();
    embeddingProvider = makeEmbeddingProviderStub();
    service = new RetrievalService(prisma as never, embeddingProvider);
  });

  describe("authorization", () => {
    it("allows an authorized family member with profile permission", async () => {
      prisma.familyMembership.findUnique.mockResolvedValue(activeMembership());
      prisma.memoryProfile.findFirst.mockResolvedValue({ id: PROFILE_ID, familyId: FAMILY_ID });
      prisma.memoryProfilePermission.findUnique.mockResolvedValue(activePermission());
      embeddingProvider.embed.mockResolvedValue(fakeVector());

      const result = await service.retrieveRelevantChunks({
        question: "How did Mom make lemon juice?",
        familyId: FAMILY_ID,
        profileId: PROFILE_ID,
        userId: USER_ID,
      });

      expect(result).toEqual([]);
      expect(embeddingProvider.embed).toHaveBeenCalledWith("How did Mom make lemon juice?");
    });

    it("rejects a user who is not a member of the family (unauthorized family access)", async () => {
      prisma.familyMembership.findUnique.mockResolvedValue(null);

      await expect(
        service.retrieveRelevantChunks({ question: "hi", familyId: FAMILY_ID, profileId: PROFILE_ID, userId: USER_ID }),
      ).rejects.toBeInstanceOf(ForbiddenException);
      expect(embeddingProvider.embed).not.toHaveBeenCalled();
      expect(prisma.$queryRaw).not.toHaveBeenCalled();
    });

    it("rejects a membership that is not ACTIVE (e.g. removed member)", async () => {
      prisma.familyMembership.findUnique.mockResolvedValue({ ...activeMembership(), status: "REMOVED" });

      await expect(
        service.retrieveRelevantChunks({ question: "hi", familyId: FAMILY_ID, profileId: PROFILE_ID, userId: USER_ID }),
      ).rejects.toBeInstanceOf(ForbiddenException);
      expect(embeddingProvider.embed).not.toHaveBeenCalled();
    });

    it("rejects when the profile has no granted MemoryProfilePermission for this user (profile access restriction)", async () => {
      prisma.familyMembership.findUnique.mockResolvedValue(activeMembership());
      prisma.memoryProfile.findFirst.mockResolvedValue({ id: PROFILE_ID, familyId: FAMILY_ID });
      prisma.memoryProfilePermission.findUnique.mockResolvedValue(null);

      await expect(
        service.retrieveRelevantChunks({ question: "hi", familyId: FAMILY_ID, profileId: PROFILE_ID, userId: USER_ID }),
      ).rejects.toBeInstanceOf(ForbiddenException);
      expect(embeddingProvider.embed).not.toHaveBeenCalled();
    });

    it("rejects a revoked MemoryProfilePermission (profile access restriction)", async () => {
      prisma.familyMembership.findUnique.mockResolvedValue(activeMembership());
      prisma.memoryProfile.findFirst.mockResolvedValue({ id: PROFILE_ID, familyId: FAMILY_ID });
      prisma.memoryProfilePermission.findUnique.mockResolvedValue({ ...activePermission(), revokedAt: new Date() });

      await expect(
        service.retrieveRelevantChunks({ question: "hi", familyId: FAMILY_ID, profileId: PROFILE_ID, userId: USER_ID }),
      ).rejects.toBeInstanceOf(ForbiddenException);
      expect(embeddingProvider.embed).not.toHaveBeenCalled();
    });

    it("rejects a profileId that belongs to a different family, even if the user is a member of the requested familyId (cross-family isolation)", async () => {
      prisma.familyMembership.findUnique.mockResolvedValue(activeMembership());
      // The real query scopes findFirst by { id: profileId, familyId }, so a
      // profile belonging to another family never matches — simulating that.
      prisma.memoryProfile.findFirst.mockResolvedValue(null);

      await expect(
        service.retrieveRelevantChunks({ question: "hi", familyId: FAMILY_ID, profileId: "profile-from-other-family", userId: USER_ID }),
      ).rejects.toBeInstanceOf(NotFoundException);
      expect(prisma.memoryProfile.findFirst).toHaveBeenCalledWith({
        where: { id: "profile-from-other-family", familyId: FAMILY_ID },
      });
      expect(embeddingProvider.embed).not.toHaveBeenCalled();
    });

    it("throws NotFoundException for a missing profile", async () => {
      prisma.familyMembership.findUnique.mockResolvedValue(activeMembership());
      prisma.memoryProfile.findFirst.mockResolvedValue(null);

      await expect(
        service.retrieveRelevantChunks({ question: "hi", familyId: FAMILY_ID, profileId: "does-not-exist", userId: USER_ID }),
      ).rejects.toBeInstanceOf(NotFoundException);
    });

    it("checks authorization before ever calling the embedding provider, regardless of question content", async () => {
      prisma.familyMembership.findUnique.mockResolvedValue(null);
      await expect(
        service.retrieveRelevantChunks({ question: "a perfectly fine question", familyId: OTHER_FAMILY_ID, profileId: PROFILE_ID, userId: USER_ID }),
      ).rejects.toBeInstanceOf(ForbiddenException);
      expect(embeddingProvider.embed).not.toHaveBeenCalled();
    });
  });

  describe("input validation", () => {
    beforeEach(() => {
      prisma.familyMembership.findUnique.mockResolvedValue(activeMembership());
      prisma.memoryProfile.findFirst.mockResolvedValue({ id: PROFILE_ID, familyId: FAMILY_ID });
      prisma.memoryProfilePermission.findUnique.mockResolvedValue(activePermission());
    });

    it("rejects an empty question", async () => {
      await expect(
        service.retrieveRelevantChunks({ question: "", familyId: FAMILY_ID, profileId: PROFILE_ID, userId: USER_ID }),
      ).rejects.toBeInstanceOf(BadRequestException);
      expect(embeddingProvider.embed).not.toHaveBeenCalled();
    });

    it("rejects a whitespace-only question", async () => {
      await expect(
        service.retrieveRelevantChunks({ question: "   \n\t  ", familyId: FAMILY_ID, profileId: PROFILE_ID, userId: USER_ID }),
      ).rejects.toBeInstanceOf(BadRequestException);
      expect(embeddingProvider.embed).not.toHaveBeenCalled();
    });

    it("bounds an excessive topK down to the maximum", async () => {
      embeddingProvider.embed.mockResolvedValue(fakeVector());
      await service.retrieveRelevantChunks({ question: "hi", familyId: FAMILY_ID, profileId: PROFILE_ID, userId: USER_ID, topK: 10_000 });
      const call = prisma.$queryRaw.mock.calls[0];
      expect(call[call.length - 1]).toBe(20);
    });

    it("bounds a zero/negative topK up to at least 1", async () => {
      embeddingProvider.embed.mockResolvedValue(fakeVector());
      await service.retrieveRelevantChunks({ question: "hi", familyId: FAMILY_ID, profileId: PROFILE_ID, userId: USER_ID, topK: -5 });
      const call = prisma.$queryRaw.mock.calls[0];
      expect(call[call.length - 1]).toBe(1);
    });

    it("falls back to the default topK when not a finite number", async () => {
      embeddingProvider.embed.mockResolvedValue(fakeVector());
      await service.retrieveRelevantChunks({ question: "hi", familyId: FAMILY_ID, profileId: PROFILE_ID, userId: USER_ID, topK: NaN });
      const call = prisma.$queryRaw.mock.calls[0];
      expect(call[call.length - 1]).toBe(5);
    });

    it("rejects a non-finite minSimilarity", async () => {
      await expect(
        service.retrieveRelevantChunks({ question: "hi", familyId: FAMILY_ID, profileId: PROFILE_ID, userId: USER_ID, minSimilarity: NaN }),
      ).rejects.toBeInstanceOf(BadRequestException);
      expect(embeddingProvider.embed).not.toHaveBeenCalled();
    });

    it("rejects a minSimilarity above the valid cosine similarity range (> 1)", async () => {
      await expect(
        service.retrieveRelevantChunks({ question: "hi", familyId: FAMILY_ID, profileId: PROFILE_ID, userId: USER_ID, minSimilarity: 1.5 }),
      ).rejects.toBeInstanceOf(BadRequestException);
      expect(embeddingProvider.embed).not.toHaveBeenCalled();
    });

    it("rejects a minSimilarity below the valid cosine similarity range (< -1)", async () => {
      await expect(
        service.retrieveRelevantChunks({ question: "hi", familyId: FAMILY_ID, profileId: PROFILE_ID, userId: USER_ID, minSimilarity: -1.1 }),
      ).rejects.toBeInstanceOf(BadRequestException);
      expect(embeddingProvider.embed).not.toHaveBeenCalled();
    });

    it("accepts the exact boundary values -1 and 1", async () => {
      embeddingProvider.embed.mockResolvedValue(fakeVector());
      await expect(
        service.retrieveRelevantChunks({ question: "hi", familyId: FAMILY_ID, profileId: PROFILE_ID, userId: USER_ID, minSimilarity: -1 }),
      ).resolves.toEqual([]);
      await expect(
        service.retrieveRelevantChunks({ question: "hi", familyId: FAMILY_ID, profileId: PROFILE_ID, userId: USER_ID, minSimilarity: 1 }),
      ).resolves.toEqual([]);
    });
  });

  describe("retrieval query", () => {
    beforeEach(() => {
      prisma.familyMembership.findUnique.mockResolvedValue(activeMembership());
      prisma.memoryProfile.findFirst.mockResolvedValue({ id: PROFILE_ID, familyId: FAMILY_ID });
      prisma.memoryProfilePermission.findUnique.mockResolvedValue(activePermission());
    });

    it("propagates an embedding-provider failure (OpenAI unavailable) instead of silently returning nothing", async () => {
      embeddingProvider.embed.mockRejectedValue(new Error("OpenAI rate limited"));

      await expect(
        service.retrieveRelevantChunks({ question: "hi", familyId: FAMILY_ID, profileId: PROFILE_ID, userId: USER_ID }),
      ).rejects.toThrow("OpenAI rate limited");
      expect(prisma.$queryRaw).not.toHaveBeenCalled();
    });

    it("scopes the query to only EMBEDDED, non-null-vector chunks for the exact family+profile, via SQL predicates (safe parameterization)", async () => {
      embeddingProvider.embed.mockResolvedValue(fakeVector());

      await service.retrieveRelevantChunks({ question: "Mom's recipe", familyId: FAMILY_ID, profileId: PROFILE_ID, userId: USER_ID });

      expect(prisma.$queryRaw).toHaveBeenCalledTimes(1);
      const call = prisma.$queryRaw.mock.calls[0];
      const sql = sqlTextOf(call);

      // The SQL text itself contains only placeholders/fixed clauses — no
      // interpolated user input appears as literal text in the query string.
      expect(sql).not.toContain(FAMILY_ID);
      expect(sql).not.toContain(PROFILE_ID);
      expect(sql).not.toContain("Mom's recipe");
      expect(sql).toContain(`status = 'EMBEDDED'`);
      expect(sql).toContain(`embedding IS NOT NULL`);
      expect(sql).toContain(`"familyId" =`);
      expect(sql).toContain(`"profileId" =`);

      // The actual values are passed as separate bound parameters, not baked
      // into the SQL text — confirms real parameterization, not string
      // concatenation.
      expect(call).toContain(FAMILY_ID);
      expect(call).toContain(PROFILE_ID);
    });

    it("returns rows ordered by similarity as given by the database (no re-sorting that could violate the SQL ORDER BY)", async () => {
      embeddingProvider.embed.mockResolvedValue(fakeVector());
      prisma.$queryRaw.mockResolvedValue([
        { id: "chunk-a", memoryId: "mem-1", memorySourceId: "src-1", text: "most similar", similarity: 0.95 },
        { id: "chunk-b", memoryId: "mem-1", memorySourceId: "src-1", text: "less similar", similarity: 0.8 },
        { id: "chunk-c", memoryId: "mem-2", memorySourceId: "src-2", text: "least similar", similarity: 0.5 },
      ]);

      const result = await service.retrieveRelevantChunks({ question: "hi", familyId: FAMILY_ID, profileId: PROFILE_ID, userId: USER_ID });

      expect(result.map((r) => r.chunkId)).toEqual(["chunk-a", "chunk-b", "chunk-c"]);
      expect(result).toHaveLength(3);
      const similarities = result.map((r) => r.similarity);
      expect(similarities).toEqual([0.95, 0.8, 0.5]);
    });

    it("returns an empty array when no relevant (or no embedded) chunks exist", async () => {
      embeddingProvider.embed.mockResolvedValue(fakeVector());
      prisma.$queryRaw.mockResolvedValue([]);

      const result = await service.retrieveRelevantChunks({ question: "something never recorded", familyId: FAMILY_ID, profileId: PROFILE_ID, userId: USER_ID });

      expect(result).toEqual([]);
    });

    it("maps raw rows to the public RetrievedChunk shape", async () => {
      embeddingProvider.embed.mockResolvedValue(fakeVector());
      prisma.$queryRaw.mockResolvedValue([
        { id: "chunk-a", memoryId: "mem-1", memorySourceId: "src-1", text: "Mom's lemon juice recipe", similarity: 0.91 },
      ]);

      const result = await service.retrieveRelevantChunks({ question: "hi", familyId: FAMILY_ID, profileId: PROFILE_ID, userId: USER_ID });

      expect(result).toEqual([
        { chunkId: "chunk-a", memoryId: "mem-1", memorySourceId: "src-1", text: "Mom's lemon juice recipe", similarity: 0.91 },
      ]);
    });

    it("does not filter anything by default — the nearest chunk is still returned even with a low similarity score (not automatically treated as relevant, just not discarded)", async () => {
      embeddingProvider.embed.mockResolvedValue(fakeVector());
      prisma.$queryRaw.mockResolvedValue([
        { id: "chunk-a", memoryId: "mem-1", memorySourceId: "src-1", text: "weakly related", similarity: 0.06 },
      ]);

      const result = await service.retrieveRelevantChunks({ question: "hi", familyId: FAMILY_ID, profileId: PROFILE_ID, userId: USER_ID });

      expect(result).toHaveLength(1);
    });

    it("excludes rows below an explicitly supplied minSimilarity", async () => {
      embeddingProvider.embed.mockResolvedValue(fakeVector());
      prisma.$queryRaw.mockResolvedValue([
        { id: "chunk-high", memoryId: "mem-1", memorySourceId: "src-1", text: "strong match", similarity: 0.4 },
        { id: "chunk-low", memoryId: "mem-1", memorySourceId: "src-1", text: "weak match", similarity: 0.06 },
      ]);

      const result = await service.retrieveRelevantChunks({
        question: "hi",
        familyId: FAMILY_ID,
        profileId: PROFILE_ID,
        userId: USER_ID,
        minSimilarity: 0.2,
      });

      expect(result.map((r) => r.chunkId)).toEqual(["chunk-high"]);
    });

    it("includes a row exactly equal to minSimilarity (inclusive boundary)", async () => {
      embeddingProvider.embed.mockResolvedValue(fakeVector());
      prisma.$queryRaw.mockResolvedValue([
        { id: "chunk-a", memoryId: "mem-1", memorySourceId: "src-1", text: "borderline", similarity: 0.2 },
      ]);

      const result = await service.retrieveRelevantChunks({
        question: "hi",
        familyId: FAMILY_ID,
        profileId: PROFILE_ID,
        userId: USER_ID,
        minSimilarity: 0.2,
      });

      expect(result).toHaveLength(1);
    });

    it("can filter out every result, returning an empty array, when nothing meets the threshold", async () => {
      embeddingProvider.embed.mockResolvedValue(fakeVector());
      prisma.$queryRaw.mockResolvedValue([
        { id: "chunk-a", memoryId: "mem-1", memorySourceId: "src-1", text: "weak match", similarity: 0.06 },
      ]);

      const result = await service.retrieveRelevantChunks({
        question: "hi",
        familyId: FAMILY_ID,
        profileId: PROFILE_ID,
        userId: USER_ID,
        minSimilarity: 0.5,
      });

      expect(result).toEqual([]);
    });
  });
});
