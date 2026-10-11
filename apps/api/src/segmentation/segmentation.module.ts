import { Module } from "@nestjs/common";
import { PrismaModule } from "../prisma/prisma.module";
import { SegmentationService } from "./segmentation.service";

/**
 * Not yet imported anywhere: no consumer exists until the pipeline-wiring
 * step (triggering segmentation after a MemorySource becomes TRANSCRIBED).
 */
@Module({
  imports: [PrismaModule],
  providers: [SegmentationService],
  exports: [SegmentationService],
})
export class SegmentationModule {}
