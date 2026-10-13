import { Processor, WorkerHost } from "@nestjs/bullmq";
import type { Job } from "bullmq";
import type { SegmentationService } from "./segmentation.service";
import { SEGMENTATION_QUEUE } from "./queue.constants";

export type SegmentJobData = { memorySourceId: string };

/**
 * Consumes one job per MemorySource (job id = memorySourceId, see
 * SegmentationService.enqueueForMemorySource). Runs segmentation as its own
 * retryable BullMQ stage, decoupled from transcription — a failure here
 * (e.g. a transient DB error) is retried by BullMQ without ever re-calling
 * the paid transcription API, and because segmentMemorySource is idempotent
 * (upsert by chunkIndex, re-queries PENDING chunks before enqueueing
 * embedding jobs), a retry safely resumes rather than duplicating work.
 */
@Processor(SEGMENTATION_QUEUE)
export class SegmentationProcessor extends WorkerHost {
  constructor(private readonly segmentation: SegmentationService) {
    super();
  }

  async process(job: Job<SegmentJobData>): Promise<void> {
    await this.segmentation.segmentMemorySource(job.data.memorySourceId);
  }
}
