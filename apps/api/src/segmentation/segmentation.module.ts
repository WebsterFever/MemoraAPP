import { Module } from "@nestjs/common";
import { BullModule } from "@nestjs/bullmq";
import { PrismaModule } from "../prisma/prisma.module";
import { EmbeddingModule } from "../embedding/embedding.module";
import { SegmentationService } from "./segmentation.service";
import { SegmentationProcessor } from "./segmentation.processor";
import { SEGMENTATION_QUEUE } from "./queue.constants";

@Module({
  imports: [PrismaModule, EmbeddingModule, BullModule.registerQueue({ name: SEGMENTATION_QUEUE })],
  providers: [SegmentationService, SegmentationProcessor],
  exports: [SegmentationService],
})
export class SegmentationModule {}
