import { NotFoundException } from "@nestjs/common";
import { SegmentationService } from "./segmentation.service";

function makePrismaStub() {
  return {
    memorySource: { findUnique: jest.fn() },
    memoryChunk: {
      upsert: jest.fn().mockResolvedValue(undefined),
      deleteMany: jest.fn().mockResolvedValue({ count: 0 }),
      // Defaults to no pending chunks so tests that don't care about the
      // embedding-enqueue step don't need to stub it explicitly.
      findMany: jest.fn().mockResolvedValue([]),
    },
    $transaction: jest.fn((ops: Promise<unknown>[]) => Promise.all(ops)),
  };
}

function makeEmbeddingServiceStub() {
  return { enqueueForChunk: jest.fn().mockResolvedValue(undefined) };
}

function makeQueueStub() {
  return { add: jest.fn().mockResolvedValue(undefined) };
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
  let embeddingService: ReturnType<typeof makeEmbeddingServiceStub>;
  let queue: ReturnType<typeof makeQueueStub>;
  let service: SegmentationService;

  beforeEach(() => {
    prisma = makePrismaStub();
    embeddingService = makeEmbeddingServiceStub();
    queue = makeQueueStub();
    service = new SegmentationService(prisma as never, embeddingService as never, queue as never);
  });

  describe("enqueueForMemorySource", () => {
    it("enqueues a job keyed by the MemorySource id, so a duplicate call can never create a second concurrent segmentation job", async () => {
      await service.enqueueForMemorySource("source-1");

      expect(queue.add).toHaveBeenCalledWith(
        "segment",
        { memorySourceId: "source-1" },
        expect.objectContaining({ jobId: "source-1", attempts: 3 }),
      );
    });
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

  it("enqueues an embedding job for every chunk still PENDING after segmentation", async () => {
    const text = "Short memory now.";
    prisma.memorySource.findUnique.mockResolvedValue(makeSource(text));
    prisma.memoryChunk.findMany.mockResolvedValue([{ id: "chunk-a" }, { id: "chunk-b" }]);

    await service.segmentMemorySource(SOURCE_ID);

    expect(prisma.memoryChunk.findMany).toHaveBeenCalledWith({
      where: { memorySourceId: SOURCE_ID, status: "PENDING" },
      select: { id: true },
    });
    expect(embeddingService.enqueueForChunk).toHaveBeenCalledTimes(2);
    expect(embeddingService.enqueueForChunk).toHaveBeenCalledWith("chunk-a");
    expect(embeddingService.enqueueForChunk).toHaveBeenCalledWith("chunk-b");
  });

  it("does not enqueue anything when there are no PENDING chunks (e.g. everything already EMBEDDED)", async () => {
    prisma.memorySource.findUnique.mockResolvedValue(makeSource("Short memory."));
    prisma.memoryChunk.findMany.mockResolvedValue([]);

    await service.segmentMemorySource(SOURCE_ID);

    expect(embeddingService.enqueueForChunk).not.toHaveBeenCalled();
  });

  it("deletes stale trailing chunks left over from a previously longer transcript", async () => {
    const text = "Short memory now.";
    prisma.memorySource.findUnique.mockResolvedValue(makeSource(text));

    await service.segmentMemorySource(SOURCE_ID);

    expect(prisma.memoryChunk.deleteMany).toHaveBeenCalledWith({
      where: { memorySourceId: SOURCE_ID, chunkIndex: { gte: 1 } },
    });
  });

  it("is idempotent — rerunning on the same transcript issues the exact same upsert calls, never a duplicate create, and re-enqueues embedding safely (dedup is EmbeddingService's job, see embedding.service.spec.ts)", async () => {
    const sentence = "Mom told me a long story about her childhood home. ";
    const text = sentence.repeat(50).trim();
    prisma.memorySource.findUnique.mockResolvedValue(makeSource(text));
    prisma.memoryChunk.findMany.mockResolvedValue([{ id: "chunk-a" }, { id: "chunk-b" }]);

    await service.segmentMemorySource(SOURCE_ID);
    const firstRunCalls = JSON.parse(JSON.stringify(prisma.memoryChunk.upsert.mock.calls));
    const firstRunEnqueueCount = embeddingService.enqueueForChunk.mock.calls.length;

    prisma.memoryChunk.upsert.mockClear();
    prisma.memoryChunk.deleteMany.mockClear();
    embeddingService.enqueueForChunk.mockClear();
    prisma.memorySource.findUnique.mockResolvedValue(makeSource(text));

    await service.segmentMemorySource(SOURCE_ID);
    const secondRunCalls = JSON.parse(JSON.stringify(prisma.memoryChunk.upsert.mock.calls));

    expect(secondRunCalls).toEqual(firstRunCalls);
    expect(embeddingService.enqueueForChunk.mock.calls.length).toBe(firstRunEnqueueCount);
    // Every upsert `where` targets a distinct chunkIndex — no duplicate
    // (memorySourceId, chunkIndex) pair was ever written in either run.
    const indexesPerRun = (calls: typeof firstRunCalls) =>
      calls.map((call: [{ where: { memorySourceId_chunkIndex: { chunkIndex: number } } }]) => call[0].where.memorySourceId_chunkIndex.chunkIndex);
    const uniqueFirst = new Set(indexesPerRun(firstRunCalls));
    expect(uniqueFirst.size).toBe(firstRunCalls.length);
  });

  it("propagates an enqueue failure instead of swallowing it, so a PENDING chunk is never permanently stranded", async () => {
    const text = "Short memory now.";
    prisma.memorySource.findUnique.mockResolvedValue(makeSource(text));
    prisma.memoryChunk.findMany.mockResolvedValue([{ id: "chunk-a" }]);
    embeddingService.enqueueForChunk.mockRejectedValueOnce(new Error("redis unavailable"));

    // segmentMemorySource must reject (not catch-and-log) so that when it
    // runs inside SegmentationProcessor, BullMQ sees the job fail and
    // retries it — re-querying PENDING chunks and re-attempting the
    // enqueue, rather than the chunk sitting PENDING forever.
    await expect(service.segmentMemorySource(SOURCE_ID)).rejects.toThrow("redis unavailable");

    // Simulate the BullMQ retry: same still-PENDING chunk is found again
    // and successfully enqueued this time.
    embeddingService.enqueueForChunk.mockResolvedValueOnce(undefined);
    await service.segmentMemorySource(SOURCE_ID);

    expect(embeddingService.enqueueForChunk).toHaveBeenCalledWith("chunk-a");
    expect(embeddingService.enqueueForChunk).toHaveBeenCalledTimes(2);
  });
});
