import { Injectable } from "@nestjs/common";
import { InjectQueue } from "@nestjs/bullmq";
import type { Queue } from "bullmq";
import { EMBEDDING_QUEUE } from "./queue.constants";
import type { EmbedChunkJobData } from "./embedding.processor";

@Injectable()
export class EmbeddingService {
  constructor(@InjectQueue(EMBEDDING_QUEUE) private readonly queue: Queue<EmbedChunkJobData>) {}

  /**
   * Enqueues embedding work for a single PENDING chunk. Uses the chunk's
   * own id as the BullMQ job id, so calling this more than once for the
   * same chunk (e.g. segmentation rerunning) can never create a second
   * concurrent job for it — BullMQ treats a duplicate job id as a no-op
   * while the original job is still waiting/active/to-be-retried.
   */
  async enqueueForChunk(chunkId: string): Promise<void> {
    await this.queue.add(
      "embed",
      { chunkId },
      { jobId: chunkId, attempts: 3, backoff: { type: "exponential", delay: 10_000 } },
    );
  }
}
