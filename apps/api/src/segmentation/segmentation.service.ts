import { Injectable, Logger, NotFoundException } from "@nestjs/common";
import { PrismaService } from "../prisma/prisma.service";
import { EmbeddingService } from "../embedding/embedding.service";
import { chunkTranscript } from "./chunk-transcript";

@Injectable()
export class SegmentationService {
  private readonly logger = new Logger(SegmentationService.name);

  constructor(
    private readonly prisma: PrismaService,
    private readonly embeddingService: EmbeddingService,
  ) {}

  /**
   * Splits a MemorySource's cleanedTranscript into MemoryChunk rows, then
   * enqueues an embedding job for every chunk still PENDING. Idempotent:
   * rerunning on the same transcript upserts by (memorySourceId,
   * chunkIndex) rather than inserting, and never touches `status`/
   * `embedding` on an update — a chunk a later pipeline stage has already
   * embedded is never silently reset to PENDING just because segmentation
   * reran, and re-enqueueing its (unchanged) PENDING siblings is safe
   * because EmbeddingService dedupes by BullMQ job id. Any chunk rows left
   * over from a previous, longer version of the transcript (indices beyond
   * the current chunk count) are deleted, so the stored chunk set always
   * exactly matches the current transcript rather than accumulating stale
   * fragments.
   */
  async segmentMemorySource(memorySourceId: string): Promise<void> {
    const source = await this.prisma.memorySource.findUnique({
      where: { id: memorySourceId },
      include: { memory: true },
    });
    if (!source) {
      throw new NotFoundException(`MemorySource ${memorySourceId} not found`);
    }
    if (!source.cleanedTranscript) {
      this.logger.warn(`MemorySource ${memorySourceId} has no cleanedTranscript yet — skipping segmentation.`);
      return;
    }

    const texts = chunkTranscript(source.cleanedTranscript);
    const memoryId = source.memoryId;
    const { familyId, profileId } = source.memory;

    await this.prisma.$transaction([
      ...texts.map((text, chunkIndex) =>
        this.prisma.memoryChunk.upsert({
          where: { memorySourceId_chunkIndex: { memorySourceId, chunkIndex } },
          create: {
            memorySourceId,
            memoryId,
            familyId,
            profileId,
            chunkIndex,
            text,
            status: "PENDING",
          },
          update: {
            text,
            memoryId,
            familyId,
            profileId,
          },
        }),
      ),
      this.prisma.memoryChunk.deleteMany({
        where: { memorySourceId, chunkIndex: { gte: texts.length } },
      }),
    ]);

    const pendingChunks = await this.prisma.memoryChunk.findMany({
      where: { memorySourceId, status: "PENDING" },
      select: { id: true },
    });
    for (const chunk of pendingChunks) {
      await this.embeddingService.enqueueForChunk(chunk.id);
    }
  }
}
