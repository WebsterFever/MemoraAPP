import type { Job } from "bullmq";
import { SegmentationProcessor, type SegmentJobData } from "./segmentation.processor";
import type { SegmentationService } from "./segmentation.service";

function makeSegmentationServiceStub(): jest.Mocked<Pick<SegmentationService, "segmentMemorySource">> {
  return { segmentMemorySource: jest.fn() };
}

function makeJob(memorySourceId: string): Job<SegmentJobData> {
  return { data: { memorySourceId } } as Job<SegmentJobData>;
}

describe("SegmentationProcessor", () => {
  it("delegates to SegmentationService.segmentMemorySource with the job's memorySourceId", async () => {
    const segmentation = makeSegmentationServiceStub();
    segmentation.segmentMemorySource.mockResolvedValue(undefined);
    const processor = new SegmentationProcessor(segmentation as never);

    await processor.process(makeJob("source-1"));

    expect(segmentation.segmentMemorySource).toHaveBeenCalledWith("source-1");
  });

  it("propagates a segmentation failure so BullMQ applies its retry/backoff policy", async () => {
    const segmentation = makeSegmentationServiceStub();
    segmentation.segmentMemorySource.mockRejectedValue(new Error("transient DB error"));
    const processor = new SegmentationProcessor(segmentation as never);

    await expect(processor.process(makeJob("source-1"))).rejects.toThrow("transient DB error");
  });
});
