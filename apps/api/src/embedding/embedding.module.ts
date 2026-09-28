import { Module } from "@nestjs/common";
import { ConfigModule } from "@nestjs/config";
import { EMBEDDING_PROVIDER } from "./embedding-provider";
import { OpenAiEmbeddingService } from "./openai-embedding.service";

/**
 * Binds EMBEDDING_PROVIDER to the OpenAI implementation. To switch providers
 * later, change only this binding — consumers never know or care which
 * vendor is behind it. Not yet imported anywhere: no consumer exists until
 * the segmentation/pipeline wiring step.
 */
@Module({
  imports: [ConfigModule],
  providers: [{ provide: EMBEDDING_PROVIDER, useClass: OpenAiEmbeddingService }],
  exports: [EMBEDDING_PROVIDER],
})
export class EmbeddingModule {}
