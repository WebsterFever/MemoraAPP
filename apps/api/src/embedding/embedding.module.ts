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
 * which vendor is behind it. EmbeddingService is consumed by
 * SegmentationModule (enqueueing one job per newly segmented chunk);
 * EMBEDDING_PROVIDER is also exported directly for RetrievalModule, which
 * embeds a user's question text synchronously rather than enqueueing a
 * chunk job.
 */
@Module({
  imports: [ConfigModule, PrismaModule, BullModule.registerQueue({ name: EMBEDDING_QUEUE })],
  providers: [
    { provide: EMBEDDING_PROVIDER, useClass: OpenAiEmbeddingService },
    EmbeddingProcessor,
    EmbeddingService,
  ],
  exports: [EmbeddingService, EMBEDDING_PROVIDER],
})
export class EmbeddingModule {}
