import { Module } from "@nestjs/common";
import { BullModule } from "@nestjs/bullmq";
import { ConfigModule } from "@nestjs/config";
import { PrismaModule } from "../prisma/prisma.module";
import { EMBEDDING_PROVIDER } from "./embedding-provider";
import { OpenAiEmbeddingService } from "./openai-embedding.service";
import { EmbeddingProcessor } from "./embedding.processor";
import { EmbeddingService } from "./embedding.service";
import { EMBEDDING_QUEUE } from "./queue.constants";

/**
 * Binds EMBEDDING_PROVIDER to the OpenAI implementation. To switch providers
 * later, change only this binding — EmbeddingProcessor never knows or cares
 * which vendor is behind it. Imported by SegmentationModule, which is the
 * sole consumer of EmbeddingService (enqueueing one job per newly segmented
 * chunk).
 */
@Module({
  imports: [ConfigModule, PrismaModule, BullModule.registerQueue({ name: EMBEDDING_QUEUE })],
  providers: [
    { provide: EMBEDDING_PROVIDER, useClass: OpenAiEmbeddingService },
    EmbeddingProcessor,
    EmbeddingService,
  ],
  exports: [EmbeddingService],
})
export class EmbeddingModule {}
