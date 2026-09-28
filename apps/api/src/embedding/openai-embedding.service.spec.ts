import { ServiceUnavailableException } from "@nestjs/common";

// jest.mock is hoisted above imports; `mockCreate` is declared first (and
// referencing a `mock`-prefixed identifier is the one exception babel/ts-jest
// allow inside a hoisted factory) so the OpenAI client is fully mocked before
// OpenAiEmbeddingService (or the real `openai` package) is ever required —
// no network call, no API credits spent.
const mockCreate = jest.fn();
jest.mock("openai", () => jest.fn().mockImplementation(() => ({ embeddings: { create: mockCreate } })));

import { EMBEDDING_DIMENSIONS, EMBEDDING_MODEL, OpenAiEmbeddingService } from "./openai-embedding.service";

function configServiceStub(values: Record<string, string | undefined>) {
  return { get: (key: string) => values[key] } as unknown as import("@nestjs/config").ConfigService;
}

function fakeEmbedding(length = EMBEDDING_DIMENSIONS): number[] {
  return Array.from({ length }, (_, i) => i * 0.0001);
}

describe("OpenAiEmbeddingService", () => {
  beforeEach(() => {
    mockCreate.mockReset();
  });

  describe("when OPENAI_API_KEY is not configured", () => {
    const service = new OpenAiEmbeddingService(configServiceStub({}));

    it("rejects with ServiceUnavailableException without calling OpenAI", async () => {
      await expect(service.embed("hello")).rejects.toBeInstanceOf(ServiceUnavailableException);
      expect(mockCreate).not.toHaveBeenCalled();
    });
  });

  describe("when OPENAI_API_KEY is configured", () => {
    const service = new OpenAiEmbeddingService(configServiceStub({ OPENAI_API_KEY: "sk-fake" }));

    it("rejects empty input without calling OpenAI", async () => {
      await expect(service.embed("")).rejects.toThrow(/empty/i);
      expect(mockCreate).not.toHaveBeenCalled();
    });

    it("rejects whitespace-only input without calling OpenAI", async () => {
      await expect(service.embed("   \n\t  ")).rejects.toThrow(/empty/i);
      expect(mockCreate).not.toHaveBeenCalled();
    });

    it("returns a validated 1536-length embedding on success", async () => {
      const embedding = fakeEmbedding();
      mockCreate.mockResolvedValue({ data: [{ embedding, index: 0, object: "embedding" }] });

      const result = await service.embed("Mom's lemon juice recipe");

      expect(result).toEqual(embedding);
      expect(result).toHaveLength(EMBEDDING_DIMENSIONS);
      expect(mockCreate).toHaveBeenCalledWith({
        model: EMBEDDING_MODEL,
        input: "Mom's lemon juice recipe",
        dimensions: EMBEDDING_DIMENSIONS,
      });
    });

    it("trims surrounding whitespace before sending to OpenAI", async () => {
      mockCreate.mockResolvedValue({ data: [{ embedding: fakeEmbedding(), index: 0, object: "embedding" }] });

      await service.embed("  hello world  ");

      expect(mockCreate).toHaveBeenCalledWith(expect.objectContaining({ input: "hello world" }));
    });

    it("propagates OpenAI API failures", async () => {
      mockCreate.mockRejectedValue(new Error("rate limit exceeded"));
      await expect(service.embed("hello")).rejects.toThrow("rate limit exceeded");
    });

    it("throws on a malformed response with no data entries", async () => {
      mockCreate.mockResolvedValue({ data: [] });
      await expect(service.embed("hello")).rejects.toThrow(/did not include an embedding array/i);
    });

    it("throws on a malformed response where embedding is not an array", async () => {
      mockCreate.mockResolvedValue({ data: [{ embedding: "not-an-array", index: 0, object: "embedding" }] });
      await expect(service.embed("hello")).rejects.toThrow(/did not include an embedding array/i);
    });

    it("throws when the embedding has too few dimensions", async () => {
      mockCreate.mockResolvedValue({ data: [{ embedding: fakeEmbedding(1024), index: 0, object: "embedding" }] });
      await expect(service.embed("hello")).rejects.toThrow(
        `Expected a ${EMBEDDING_DIMENSIONS}-dimension embedding but received 1024.`,
      );
    });

    it("throws when the embedding has too many dimensions", async () => {
      mockCreate.mockResolvedValue({ data: [{ embedding: fakeEmbedding(3072), index: 0, object: "embedding" }] });
      await expect(service.embed("hello")).rejects.toThrow(
        `Expected a ${EMBEDDING_DIMENSIONS}-dimension embedding but received 3072.`,
      );
    });

    it("throws when the embedding contains non-numeric values", async () => {
      const bad: unknown[] = fakeEmbedding();
      bad[5] = "not-a-number";
      mockCreate.mockResolvedValue({ data: [{ embedding: bad, index: 0, object: "embedding" }] });
      await expect(service.embed("hello")).rejects.toThrow(/non-numeric/i);
    });

    it("throws when the embedding contains non-finite values", async () => {
      const bad = fakeEmbedding();
      bad[5] = Number.POSITIVE_INFINITY;
      mockCreate.mockResolvedValue({ data: [{ embedding: bad, index: 0, object: "embedding" }] });
      await expect(service.embed("hello")).rejects.toThrow(/non-numeric/i);
    });
  });
});
