import { EmbeddingService } from "./embedding.service";

function makeQueueStub() {
  return { add: jest.fn().mockResolvedValue(undefined) };
}

describe("EmbeddingService", () => {
  it("enqueues a job keyed by the chunk id, so a duplicate call can never create a second job for the same chunk", async () => {
    const queue = makeQueueStub();
    const service = new EmbeddingService(queue as never);

    await service.enqueueForChunk("chunk-1");

    expect(queue.add).toHaveBeenCalledWith(
      "embed",
      { chunkId: "chunk-1" },
      expect.objectContaining({ jobId: "chunk-1", attempts: 3 }),
    );
  });

  it("calling enqueueForChunk twice for the same chunk uses the same job id both times", async () => {
    const queue = makeQueueStub();
    const service = new EmbeddingService(queue as never);

    await service.enqueueForChunk("chunk-1");
    await service.enqueueForChunk("chunk-1");

    expect(queue.add).toHaveBeenCalledTimes(2);
    const [firstCall, secondCall] = queue.add.mock.calls;
    expect(firstCall[2].jobId).toBe(secondCall[2].jobId);
  });
});
