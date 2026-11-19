import { Module } from "@nestjs/common";
import { ConfigModule } from "@nestjs/config";
import { RetrievalModule } from "../retrieval/retrieval.module";
import { AnswerGenerationService } from "./answer-generation.service";
import { LLM_PROVIDER } from "./llm-provider";
import { OpenAiLlmService } from "./openai-llm.service";

/** Consumed by AnswersModule (POST /families/:familyId/profiles/:profileId/ask). */
@Module({
  imports: [ConfigModule, RetrievalModule],
  providers: [{ provide: LLM_PROVIDER, useClass: OpenAiLlmService }, AnswerGenerationService],
  exports: [AnswerGenerationService],
})
export class AnswerGenerationModule {}
