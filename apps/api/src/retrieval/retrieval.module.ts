import { Module } from "@nestjs/common";
import { PrismaModule } from "../prisma/prisma.module";
import { EmbeddingModule } from "../embedding/embedding.module";
import { RetrievalService } from "./retrieval.service";

/**
 * Not yet imported anywhere: no controller/consumer exists until the
 * grounded-answer-generation checkpoint.
 */
@Module({
  imports: [PrismaModule, EmbeddingModule],
  providers: [RetrievalService],
  exports: [RetrievalService],
})
export class RetrievalModule {}
