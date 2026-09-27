import { Module } from "@nestjs/common";
import { ConfigModule } from "@nestjs/config";
import { validateEnv } from "./config/env.validation";
import { HealthModule } from "./health/health.module";
import { PrismaModule } from "./prisma/prisma.module";
import { AuthModule } from "./auth/auth.module";
import { FamiliesModule } from "./families/families.module";
import { MemoriesModule } from "./memories/memories.module";
import { MediaModule } from "./media/media.module";
import { QueueModule } from "./queue/queue.module";
import { TranscriptionModule } from "./transcription/transcription.module";

@Module({
  imports: [
    ConfigModule.forRoot({ isGlobal: true, validate: validateEnv }),
    PrismaModule,
    HealthModule,
    AuthModule,
    FamiliesModule,
    MemoriesModule,
    QueueModule,
    MediaModule,
    TranscriptionModule,
  ],
})
export class AppModule {}
