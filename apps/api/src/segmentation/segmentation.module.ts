import { Module } from "@nestjs/common";
import { PrismaModule } from "../prisma/prisma.module";
import { EmbeddingModule } from "../embedding/embedding.module";
import { SegmentationService } from "./segmentation.service";

@Module({
  imports: [PrismaModule, EmbeddingModule],
  providers: [SegmentationService],
  exports: [SegmentationService],
})
export class SegmentationModule {}
