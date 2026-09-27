import { Module } from "@nestjs/common";
import { BullModule } from "@nestjs/bullmq";
import { ConfigModule } from "@nestjs/config";
import { PrismaModule } from "../prisma/prisma.module";
import { StorageModule } from "../media/storage/storage.module";
import { TRANSCRIPTION_PROVIDER } from "./transcription-provider";
import { OpenAiTranscriptionService } from "./openai-transcription.service";
import { TranscriptionProcessor } from "./transcription.processor";
import { TranscriptionService } from "./transcription.service";
import { TRANSCRIPTION_QUEUE } from "./queue.constants";

/**
 * Binds TRANSCRIPTION_PROVIDER to the OpenAI implementation. To switch
 * providers later, change only this binding — MediaService and
 * TranscriptionProcessor never know or care which vendor is behind it.
 */
@Module({
  imports: [ConfigModule, PrismaModule, StorageModule, BullModule.registerQueue({ name: TRANSCRIPTION_QUEUE })],
  providers: [
    { provide: TRANSCRIPTION_PROVIDER, useClass: OpenAiTranscriptionService },
    TranscriptionProcessor,
    TranscriptionService,
  ],
  exports: [TranscriptionService],
})
export class TranscriptionModule {}
