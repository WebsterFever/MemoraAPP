import type { Job } from "bullmq";
import { EMBEDDING_DIMENSIONS } from "./openai-embedding.service";
import { EmbeddingProcessor, sanitizeErrorMessage, type EmbedChunkJobData } from "./embedding.processor";
import type { EmbeddingProvider } from "./embedding-provider";

function makePrismaStub() {
  return {
    memoryChunk: {
      findUnique: jest.fn(),
      updateMany: jest.fn().mockResolvedValue({ count: 1 }),
    },
    $executeRaw: jest.fn().mockResolvedValue(1),
  };
}

/** Joins a mocked $executeRaw tagged-template call's SQL fragments, so tests
 * can assert on the literal query text (e.g. the concurrency guard clause)
 * without needing a real database. */
function sqlTextOf(call: unknown[]): string {
  return (call[0] as string[]).join("?");
}

function makeEmbeddingProviderStub(): jest.Mocked<EmbeddingProvider> {
  return { embed: jest.fn() };
}

function makeJob(chunkId: string): Job<EmbedChunkJobData> {
  return { data: { chunkId } } as Job<EmbedChunkJobData>;
}

function fakeVector(length = EMBEDDING_DIMENSIONS): number[] {
  return Array.from({ length }, (_, i) => i * 0.0001);
}

describe("sanitizeErrorMessage", () => {
  it("redacts an OpenAI-style API key embedded in an error message", () => {
    const error = new Error("Request failed with key sk-abcdefghij1234567890ABCDEFGHIJ");
    expect(sanitizeErrorMessage(error)).toBe("Request failed with key [redacted]");
  });

  it("redacts multiple keys if present", () => {
    const error = new Error("sk-aaaaaaaaaaaaaaaa and sk-bbbbbbbbbbbbbbbb both failed");
    expect(sanitizeErrorMessage(error)).toBe("[redacted] and [redacted] both failed");
  });

  it("leaves a message with no key-shaped substring untouched", () => {
    expect(sanitizeErrorMessage(new Error("rate limit exceeded"))).toBe("rate limit exceeded");
  });

  it("truncates an excessively long message", () => {
    const long = "x".repeat(1000);
    const result = sanitizeErrorMessage(new Error(long));
    expect(result.length).toBeLessThanOrEqual(501);
    expect(result.endsWith("…")).toBe(true);
  });

  it("stringifies a non-Error thrown value", () => {
    expect(sanitizeErrorMessage("plain string failure")).toBe("plain string failure");
  });
});

describe("EmbeddingProcessor", () => {
  let prisma: ReturnType<typeof makePrismaStub>;
  let embeddingProvider: jest.Mocked<EmbeddingProvider>;
  let processor: EmbeddingProcessor;

  beforeEach(() => {
    prisma = makePrismaStub();
    embeddingProvider = makeEmbeddingProviderStub();
    processor = new EmbeddingProcessor(prisma as never, embeddingProvider);
  });

  it("does nothing when the chunk no longer exists", async () => {
    prisma.memoryChunk.findUnique.mockResolvedValue(null);
    await processor.process(makeJob("missing-chunk"));
    expect(embeddingProvider.embed).not.toHaveBeenCalled();
    expect(prisma.$executeRaw).not.toHaveBeenCalled();
  });

  it("skips an already-EMBEDDED chunk without calling the provider (idempotent retry/duplicate job)", async () => {
    prisma.memoryChunk.findUnique.mockResolvedValue({ id: "chunk-1", text: "hello", status: "EMBEDDED" });
    await processor.process(makeJob("chunk-1"));
    expect(embeddingProvider.embed).not.toHaveBeenCalled();
    expect(prisma.$executeRaw).not.toHaveBeenCalled();
    expect(prisma.memoryChunk.updateMany).not.toHaveBeenCalled();
  });

  it("re-attempts a FAILED chunk (not a terminal state) and succeeds, storing the vector and marking EMBEDDED", async () => {
    prisma.memoryChunk.findUnique.mockResolvedValue({ id: "chunk-1", text: "hello", status: "FAILED" });
    const vector = fakeVector();
    embeddingProvider.embed.mockResolvedValue(vector);

    await processor.process(makeJob("chunk-1"));

    expect(embeddingProvider.embed).toHaveBeenCalledWith("hello");
    expect(prisma.$executeRaw).toHaveBeenCalledTimes(1);
    const call = prisma.$executeRaw.mock.calls[0];
    // Tagged-template call: (stringsArray, vectorLiteral, chunkId)
    expect(call[1]).toBe(`[${vector.join(",")}]`);
    expect(call[2]).toBe("chunk-1");
    expect(prisma.memoryChunk.updateMany).not.toHaveBeenCalled();
  });

  it("processes a PENDING chunk successfully, guarding the write so a concurrent duplicate can't clobber it", async () => {
    prisma.memoryChunk.findUnique.mockResolvedValue({ id: "chunk-2", text: "Mom's recipe", status: "PENDING" });
    const vector = fakeVector();
    embeddingProvider.embed.mockResolvedValue(vector);

    await processor.process(makeJob("chunk-2"));

    expect(prisma.$executeRaw).toHaveBeenCalledTimes(1);
    const sql = sqlTextOf(prisma.$executeRaw.mock.calls[0]);
    expect(sql).toContain(`"status" != 'EMBEDDED'`);
    expect(sql).toContain(`"errorMessage" = NULL`);
  });

  it("marks the chunk FAILED with a sanitized message and rethrows when the provider fails", async () => {
    prisma.memoryChunk.findUnique.mockResolvedValue({ id: "chunk-3", text: "hello", status: "PENDING" });
    embeddingProvider.embed.mockRejectedValue(new Error("OpenAI rejected key sk-abcdefghij1234567890ABCDEFGHIJ"));

    await expect(processor.process(makeJob("chunk-3"))).rejects.toThrow();

    expect(prisma.$executeRaw).not.toHaveBeenCalled();
    expect(prisma.memoryChunk.updateMany).toHaveBeenCalledWith({
      where: { id: "chunk-3", status: { not: "EMBEDDED" } },
      data: { status: "FAILED", errorMessage: "OpenAI rejected key [redacted]" },
    });
  });

  it("rejects and marks FAILED instead of storing a wrong-dimension vector", async () => {
    prisma.memoryChunk.findUnique.mockResolvedValue({ id: "chunk-4", text: "hello", status: "PENDING" });
    embeddingProvider.embed.mockResolvedValue(fakeVector(512));

    await expect(processor.process(makeJob("chunk-4"))).rejects.toThrow(
      `Refusing to store embedding with 512 dimensions (expected ${EMBEDDING_DIMENSIONS}).`,
    );

    expect(prisma.$executeRaw).not.toHaveBeenCalled();
    expect(prisma.memoryChunk.updateMany).toHaveBeenCalledWith({
      where: { id: "chunk-4", status: { not: "EMBEDDED" } },
      data: {
        status: "FAILED",
        errorMessage: `Refusing to store embedding with 512 dimensions (expected ${EMBEDDING_DIMENSIONS}).`,
      },
    });
  });

  it("running the same job twice after a successful embed is a safe no-op the second time (end-to-end idempotency)", async () => {
    prisma.memoryChunk.findUnique.mockResolvedValueOnce({ id: "chunk-5", text: "hello", status: "PENDING" });
    embeddingProvider.embed.mockResolvedValue(fakeVector());
    await processor.process(makeJob("chunk-5"));
    expect(prisma.$executeRaw).toHaveBeenCalledTimes(1);

    // Simulate the chunk now being EMBEDDED in the database for a second,
    // duplicate delivery of the same job id.
    prisma.memoryChunk.findUnique.mockResolvedValueOnce({ id: "chunk-5", text: "hello", status: "EMBEDDED" });
    await processor.process(makeJob("chunk-5"));

    expect(embeddingProvider.embed).toHaveBeenCalledTimes(1);
    expect(prisma.$executeRaw).toHaveBeenCalledTimes(1);
  });

  it("a full failure-then-retry-success cycle clears errorMessage and sets EMBEDDED", async () => {
    // Attempt 1: fails.
    prisma.memoryChunk.findUnique.mockResolvedValueOnce({ id: "chunk-6", text: "hello", status: "PENDING" });
    embeddingProvider.embed.mockRejectedValueOnce(new Error("temporary network error"));
    await expect(processor.process(makeJob("chunk-6"))).rejects.toThrow("temporary network error");
    expect(prisma.memoryChunk.updateMany).toHaveBeenCalledWith({
      where: { id: "chunk-6", status: { not: "EMBEDDED" } },
      data: { status: "FAILED", errorMessage: "temporary network error" },
    });

    // BullMQ retry: the chunk is now FAILED (not terminal), so the retried
    // job re-attempts and this time succeeds.
    prisma.memoryChunk.findUnique.mockResolvedValueOnce({ id: "chunk-6", text: "hello", status: "FAILED" });
    const vector = fakeVector();
    embeddingProvider.embed.mockResolvedValueOnce(vector);
    await processor.process(makeJob("chunk-6"));

    expect(prisma.$executeRaw).toHaveBeenCalledTimes(1);
    const sql = sqlTextOf(prisma.$executeRaw.mock.calls[0]);
    // The success-path query unconditionally sets errorMessage = NULL and
    // status = EMBEDDED — confirms a successful retry clears the prior
    // failure rather than leaving stale FAILED state alongside a vector.
    expect(sql).toContain(`"status" = 'EMBEDDED'`);
    expect(sql).toContain(`"errorMessage" = NULL`);
  });

  it("a stale failure cannot overwrite a chunk another worker already marked EMBEDDED (concurrency guard)", async () => {
    // Two workers both read the chunk as PENDING before either writes.
    prisma.memoryChunk.findUnique.mockResolvedValue({ id: "chunk-7", text: "hello", status: "PENDING" });
    // Worker A's embed() call fails *after* worker B's already succeeded —
    // from this worker's point of view it still attempts the FAILED write,
    // but the updateMany's own WHERE guard (status != EMBEDDED) is what
    // actually protects the row in the real database; here we confirm the
    // guard clause is present on every failure-path write, unconditionally.
    embeddingProvider.embed.mockRejectedValue(new Error("lost the race"));

    await expect(processor.process(makeJob("chunk-7"))).rejects.toThrow("lost the race");

    expect(prisma.memoryChunk.updateMany).toHaveBeenCalledWith(
      expect.objectContaining({ where: { id: "chunk-7", status: { not: "EMBEDDED" } } }),
    );
  });
});
