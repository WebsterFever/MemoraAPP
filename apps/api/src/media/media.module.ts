import { Module } from "@nestjs/common";
import { AuthModule } from "../auth/auth.module";
import { StorageModule } from "./storage/storage.module";
import { TranscriptionModule } from "../transcription/transcription.module";
import { MediaController } from "./media.controller";
import { MediaService } from "./media.service";

@Module({
  imports: [AuthModule, StorageModule, TranscriptionModule],
  controllers: [MediaController],
  providers: [MediaService],
})
export class MediaModule {}
