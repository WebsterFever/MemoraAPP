import { Injectable } from "@nestjs/common";
import { InjectQueue } from "@nestjs/bullmq";
import type { Queue } from "bullmq";
import { PrismaService } from "../prisma/prisma.service";
import { TRANSCRIPTION_QUEUE } from "./queue.constants";
import type { TranscribeJobData } from "./transcription.processor";

@Injectable()
export class TranscriptionService {
  constructor(
    private readonly prisma: PrismaService,
    @InjectQueue(TRANSCRIPTION_QUEUE) private readonly queue: Queue<TranscribeJobData>,
  ) {}

  /**
   * Called after MediaService verifies a MediaAsset is READY. Creates the
   * MemorySource row and enqueues the transcription job — this never blocks
   * the caller on the actual transcription work (upload completion must not
   * wait on the AI pipeline). Upsert-keyed by mediaAssetId so a retried
   * completeUpload call (or a retried caller) doesn't create duplicate rows.
   */
  async enqueueForMediaAsset(mediaAssetId: string, memoryId: string): Promise<void> {
    const source = await this.prisma.memorySource.upsert({
      where: { mediaAssetId },
      update: {},
      create: { mediaAssetId, memoryId, status: "PENDING" },
    });

    await this.queue.add(
      "transcribe",
      { memorySourceId: source.id },
      // Matches docs/architecture/06-audio-pipeline-jobs-storage.md §2's
      // retry policy in spirit (a few bounded attempts with backoff before
      // moving to a terminal FAILED state); exact 10s/60s/5min steps from
      // the doc are approximated by BullMQ's standard exponential backoff
      // rather than a hand-rolled schedule, to avoid over-building this
      // first slice.
      { attempts: 3, backoff: { type: "exponential", delay: 10_000 } },
    );
  }
}
