import type { Job } from "bullmq";
import { TranscriptionProcessor, type TranscribeJobData } from "./transcription.processor";
import type { StorageProvider } from "../media/storage/storage-provider";
import type { TranscriptionProvider } from "./transcription-provider";
import type { SegmentationService } from "../segmentation/segmentation.service";

function makePrismaStub() {
  return {
    memorySource: { findUnique: jest.fn(), update: jest.fn().mockResolvedValue(undefined) },
  };
}

function makeStorageStub(): jest.Mocked<StorageProvider> {
  return {
    createUploadUrl: jest.fn(),
    createDownloadUrl: jest.fn().mockResolvedValue("https://example.invalid/signed-get-url"),
    headObject: jest.fn(),
    deleteObject: jest.fn(),
  };
}

function makeTranscriptionProviderStub(): jest.Mocked<TranscriptionProvider> {
  return { transcribe: jest.fn() };
}

function makeSegmentationStub(): jest.Mocked<SegmentationService> {
  return { enqueueForMemorySource: jest.fn().mockResolvedValue(undefined) } as never;
}

function makeJob(memorySourceId: string): Job<TranscribeJobData> {
  return { data: { memorySourceId } } as Job<TranscribeJobData>;
}

describe("TranscriptionProcessor", () => {
  let prisma: ReturnType<typeof makePrismaStub>;
  let storage: jest.Mocked<StorageProvider>;
  let transcriptionProvider: jest.Mocked<TranscriptionProvider>;
  let segmentation: jest.Mocked<SegmentationService>;
  let processor: TranscriptionProcessor;

  beforeEach(() => {
    prisma = makePrismaStub();
    storage = makeStorageStub();
    transcriptionProvider = makeTranscriptionProviderStub();
    segmentation = makeSegmentationStub();
    processor = new TranscriptionProcessor(prisma as never, storage, transcriptionProvider, segmentation);
  });

  it("enqueues segmentation for the same MemorySource after a successful transcription", async () => {
    prisma.memorySource.findUnique.mockResolvedValue({
      id: "source-1",
      mediaAsset: { storageKey: "k", mimeType: "audio/mp4" },
    });
    transcriptionProvider.transcribe.mockResolvedValue({ rawTranscript: "Hello there.", language: "english" });

    await processor.process(makeJob("source-1"));

    expect(prisma.memorySource.update).toHaveBeenCalledWith({
      where: { id: "source-1" },
      data: expect.objectContaining({ status: "TRANSCRIBED" }),
    });
    expect(segmentation.enqueueForMemorySource).toHaveBeenCalledWith("source-1");
  });

  it("does not let a segmentation-enqueue failure fail the (already-successful) transcription job", async () => {
    prisma.memorySource.findUnique.mockResolvedValue({
      id: "source-1",
      mediaAsset: { storageKey: "k", mimeType: "audio/mp4" },
    });
    transcriptionProvider.transcribe.mockResolvedValue({ rawTranscript: "Hello there.", language: "english" });
    segmentation.enqueueForMemorySource.mockRejectedValue(new Error("redis unavailable"));

    await expect(processor.process(makeJob("source-1"))).resolves.toBeUndefined();

    // The MemorySource was still correctly marked TRANSCRIBED — that work
    // succeeded and must not be undone or retried just because enqueueing
    // the downstream segmentation stage failed.
    expect(prisma.memorySource.update).toHaveBeenCalledWith({
      where: { id: "source-1" },
      data: expect.objectContaining({ status: "TRANSCRIBED" }),
    });
  });

  it("does not call segmentation when transcription itself fails", async () => {
    prisma.memorySource.findUnique.mockResolvedValue({
      id: "source-1",
      mediaAsset: { storageKey: "k", mimeType: "audio/mp4" },
    });
    transcriptionProvider.transcribe.mockRejectedValue(new Error("provider down"));

    await expect(processor.process(makeJob("source-1"))).rejects.toThrow("provider down");

    expect(segmentation.enqueueForMemorySource).not.toHaveBeenCalled();
    expect(prisma.memorySource.update).toHaveBeenCalledWith({
      where: { id: "source-1" },
      data: { status: "FAILED", errorMessage: "provider down" },
    });
  });

  it("does nothing when the MemorySource no longer exists", async () => {
    prisma.memorySource.findUnique.mockResolvedValue(null);
    await processor.process(makeJob("missing"));
    expect(transcriptionProvider.transcribe).not.toHaveBeenCalled();
    expect(segmentation.enqueueForMemorySource).not.toHaveBeenCalled();
  });
});
