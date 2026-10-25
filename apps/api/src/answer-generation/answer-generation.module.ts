import { Module } from "@nestjs/common";
import { ConfigModule } from "@nestjs/config";
import { RetrievalModule } from "../retrieval/retrieval.module";
import { AnswerGenerationService } from "./answer-generation.service";
import { LLM_PROVIDER } from "./llm-provider";
import { OpenAiLlmService } from "./openai-llm.service";

/**
 * Not yet imported anywhere: no controller/consumer exists until the mobile
 * chat integration checkpoint.
 */
@Module({
  imports: [ConfigModule, RetrievalModule],
  providers: [{ provide: LLM_PROVIDER, useClass: OpenAiLlmService }, AnswerGenerationService],
  exports: [AnswerGenerationService],
})
export class AnswerGenerationModule {}
