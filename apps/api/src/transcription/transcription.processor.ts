import { Processor, WorkerHost } from "@nestjs/bullmq";
import { Inject, Logger } from "@nestjs/common";
import type { Job } from "bullmq";
import { PrismaService } from "../prisma/prisma.service";
import { STORAGE_PROVIDER, type StorageProvider } from "../media/storage/storage-provider";
import { TRANSCRIPTION_PROVIDER, type TranscriptionProvider } from "./transcription-provider";
import { TRANSCRIPTION_QUEUE } from "./queue.constants";
import { SegmentationService } from "../segmentation/segmentation.service";

export type TranscribeJobData = { memorySourceId: string };

/**
 * Stages 1–4 of the pipeline in docs/architecture/06-audio-pipeline-jobs-storage.md
 * (ingest, language detection, transcription, cleanup) collapsed into one
 * job. The original audio (MediaAsset) is never read/write-modified by this
 * job beyond generating a short-lived signed GET URL to fetch its bytes.
 */
@Processor(TRANSCRIPTION_QUEUE)
export class TranscriptionProcessor extends WorkerHost {
  private readonly logger = new Logger(TranscriptionProcessor.name);

  constructor(
    private readonly prisma: PrismaService,
    @Inject(STORAGE_PROVIDER) private readonly storage: StorageProvider,
    @Inject(TRANSCRIPTION_PROVIDER) private readonly transcription: TranscriptionProvider,
    private readonly segmentation: SegmentationService,
  ) {
    super();
  }

  async process(job: Job<TranscribeJobData>): Promise<void> {
    const { memorySourceId } = job.data;
    const source = await this.prisma.memorySource.findUnique({
      where: { id: memorySourceId },
      include: { mediaAsset: true },
    });
    if (!source) {
      this.logger.warn(`MemorySource ${memorySourceId} no longer exists — skipping job.`);
      return;
    }

    await this.prisma.memorySource.update({ where: { id: source.id }, data: { status: "PROCESSING" } });

    try {
      const audioUrl = await this.storage.createDownloadUrl({ key: source.mediaAsset.storageKey });
      const result = await this.transcription.transcribe({ audioUrl, mimeType: source.mediaAsset.mimeType });

      // Cleanup for this first slice is a light deterministic normalization
      // (collapse whitespace). Real disfluency-removal/punctuation-repair
      // cleanup (doc 06 stage 4 in full) is a later, separate slice — not
      // invented here to keep this pipeline stage reviewable on its own.
      const cleanedTranscript = result.rawTranscript.trim().replace(/\s+/g, " ");

      await this.prisma.memorySource.update({
        where: { id: source.id },
        data: {
          status: "TRANSCRIBED",
          detectedLanguage: result.language,
          rawTranscript: result.rawTranscript,
          cleanedTranscript,
          errorMessage: null,
        },
      });

      // Segmentation runs as its own retryable BullMQ stage (see
      // SegmentationProcessor), never inline here — a transient failure
      // there is retried by BullMQ independently and can never cause this
      // transcription work (already successful, and expensive to redo) to
      // be retried. Even enqueueing itself failing (e.g. Redis briefly
      // unavailable) is only logged, not re-thrown, for the same reason.
      try {
        await this.segmentation.enqueueForMemorySource(source.id);
      } catch (enqueueError) {
        this.logger.warn(`Failed to enqueue segmentation for MemorySource ${source.id}: ${String(enqueueError)}`);
      }
    } catch (error) {
      this.logger.error(`Transcription failed for MemorySource ${source.id}: ${String(error)}`);
      await this.prisma.memorySource.update({
        where: { id: source.id },
        data: { status: "FAILED", errorMessage: error instanceof Error ? error.message : "Unknown error" },
      });
      // Re-throw so BullMQ applies the configured retry/backoff policy
      // (see TranscriptionService.enqueueForMediaAsset) instead of silently
      // treating a failed attempt as a completed job.
      throw error;
    }
  }
}
