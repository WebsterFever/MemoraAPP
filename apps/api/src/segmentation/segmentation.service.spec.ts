import { NotFoundException } from "@nestjs/common";
import { SegmentationService } from "./segmentation.service";

function makePrismaStub() {
  return {
    memorySource: { findUnique: jest.fn() },
    memoryChunk: {
      upsert: jest.fn().mockResolvedValue(undefined),
      deleteMany: jest.fn().mockResolvedValue({ count: 0 }),
    },
    $transaction: jest.fn((ops: Promise<unknown>[]) => Promise.all(ops)),
  };
}

const SOURCE_ID = "source-1";
const MEMORY_ID = "memory-1";
const FAMILY_ID = "family-1";
const PROFILE_ID = "profile-1";

function makeSource(cleanedTranscript: string | null, overrides: Partial<{ profileId: string | null }> = {}) {
  return {
    id: SOURCE_ID,
    memoryId: MEMORY_ID,
    cleanedTranscript,
    memory: {
      id: MEMORY_ID,
      familyId: FAMILY_ID,
      // `??` can't distinguish "explicitly passed null" from "key omitted"
      // — use `in` so a deliberate `{ profileId: null }` override isn't
      // silently replaced with the default.
      profileId: "profileId" in overrides ? (overrides.profileId as string | null) : PROFILE_ID,
    },
  };
}

describe("SegmentationService", () => {
  let prisma: ReturnType<typeof makePrismaStub>;
  let service: SegmentationService;

  beforeEach(() => {
    prisma = makePrismaStub();
    service = new SegmentationService(prisma as never);
  });

  it("throws NotFoundException when the MemorySource does not exist", async () => {
    prisma.memorySource.findUnique.mockResolvedValue(null);
    await expect(service.segmentMemorySource("missing")).rejects.toBeInstanceOf(NotFoundException);
    expect(prisma.$transaction).not.toHaveBeenCalled();
  });

  it("skips segmentation (no-op) when cleanedTranscript is not set yet", async () => {
    prisma.memorySource.findUnique.mockResolvedValue(makeSource(null));
    await service.segmentMemorySource(SOURCE_ID);
    expect(prisma.$transaction).not.toHaveBeenCalled();
  });

  it("creates chunks with correct memorySourceId/memoryId/familyId/profileId propagation", async () => {
    const text = "Mom told me how she makes lemon juice. She squeezes the lemons first.";
    prisma.memorySource.findUnique.mockResolvedValue(makeSource(text));

    await service.segmentMemorySource(SOURCE_ID);

    expect(prisma.memoryChunk.upsert).toHaveBeenCalledTimes(1);
    expect(prisma.memoryChunk.upsert).toHaveBeenCalledWith({
      where: { memorySourceId_chunkIndex: { memorySourceId: SOURCE_ID, chunkIndex: 0 } },
      create: {
        memorySourceId: SOURCE_ID,
        memoryId: MEMORY_ID,
        familyId: FAMILY_ID,
        profileId: PROFILE_ID,
        chunkIndex: 0,
        text,
        status: "PENDING",
      },
      update: {
        text,
        memoryId: MEMORY_ID,
        familyId: FAMILY_ID,
        profileId: PROFILE_ID,
      },
    });
  });

  it("propagates a null profileId (memory not linked to a person) onto every chunk", async () => {
    prisma.memorySource.findUnique.mockResolvedValue(makeSource("Short memory.", { profileId: null }));

    await service.segmentMemorySource(SOURCE_ID);

    expect(prisma.memoryChunk.upsert).toHaveBeenCalledWith(
      expect.objectContaining({
        create: expect.objectContaining({ profileId: null }),
      }),
    );
  });

  it("assigns stable, zero-based, sequential chunkIndex values in order", async () => {
    const sentence = "Mom told me a long story about her childhood home. ";
    const text = sentence.repeat(50).trim();
    prisma.memorySource.findUnique.mockResolvedValue(makeSource(text));

    await service.segmentMemorySource(SOURCE_ID);

    const indexes = prisma.memoryChunk.upsert.mock.calls.map(
      ([args]: [{ create: { chunkIndex: number } }]) => args.create.chunkIndex,
    );
    expect(indexes).toEqual(Array.from({ length: indexes.length }, (_, i) => i));
    expect(indexes.length).toBeGreaterThan(1);
  });

  it("deletes stale trailing chunks left over from a previously longer transcript", async () => {
    const text = "Short memory now.";
    prisma.memorySource.findUnique.mockResolvedValue(makeSource(text));

    await service.segmentMemorySource(SOURCE_ID);

    expect(prisma.memoryChunk.deleteMany).toHaveBeenCalledWith({
      where: { memorySourceId: SOURCE_ID, chunkIndex: { gte: 1 } },
    });
  });

  it("is idempotent — rerunning on the same transcript issues the exact same upsert calls, never a duplicate create", async () => {
    const sentence = "Mom told me a long story about her childhood home. ";
    const text = sentence.repeat(50).trim();
    prisma.memorySource.findUnique.mockResolvedValue(makeSource(text));

    await service.segmentMemorySource(SOURCE_ID);
    const firstRunCalls = JSON.parse(JSON.stringify(prisma.memoryChunk.upsert.mock.calls));

    prisma.memoryChunk.upsert.mockClear();
    prisma.memoryChunk.deleteMany.mockClear();
    prisma.memorySource.findUnique.mockResolvedValue(makeSource(text));

    await service.segmentMemorySource(SOURCE_ID);
    const secondRunCalls = JSON.parse(JSON.stringify(prisma.memoryChunk.upsert.mock.calls));

    expect(secondRunCalls).toEqual(firstRunCalls);
    // Every upsert `where` targets a distinct chunkIndex — no duplicate
    // (memorySourceId, chunkIndex) pair was ever written in either run.
    const indexesPerRun = (calls: typeof firstRunCalls) =>
      calls.map((call: [{ where: { memorySourceId_chunkIndex: { chunkIndex: number } } }]) => call[0].where.memorySourceId_chunkIndex.chunkIndex);
    const uniqueFirst = new Set(indexesPerRun(firstRunCalls));
    expect(uniqueFirst.size).toBe(firstRunCalls.length);
  });
});
