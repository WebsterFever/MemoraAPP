import { Module } from "@nestjs/common";
import { ConfigModule, ConfigService } from "@nestjs/config";
import { ThrottlerModule, seconds } from "@nestjs/throttler";
import { ThrottlerStorageRedisService } from "@nest-lab/throttler-storage-redis";
import { AuthModule } from "../auth/auth.module";
import { AnswerGenerationModule } from "../answer-generation/answer-generation.module";
import { AnswersController } from "./answers.controller";
import { PerUserThrottlerGuard } from "./per-user-throttler.guard";

/**
 * Rate-limit storage is Redis-backed (reusing the same REDIS_URL as
 * BullMQ) rather than the package's in-memory default, so the limit holds
 * correctly across multiple backend instances — an in-memory counter would
 * let a user get a fresh quota on every instance behind a load balancer.
 *
 * `PerUserThrottlerGuard` is applied only via `@UseGuards` on
 * AnswersController, not as a global `APP_GUARD` — importing
 * `ThrottlerModule` here does not rate-limit any other endpoint in the app.
 */
@Module({
  imports: [
    AuthModule,
    AnswerGenerationModule,
    ThrottlerModule.forRootAsync({
      imports: [ConfigModule],
      inject: [ConfigService],
      useFactory: (config: ConfigService) => ({
        throttlers: [
          {
            limit: config.getOrThrow<number>("ASK_RATE_LIMIT_MAX"),
            ttl: seconds(config.getOrThrow<number>("ASK_RATE_LIMIT_WINDOW_SECONDS")),
          },
        ],
        storage: new ThrottlerStorageRedisService(config.getOrThrow<string>("REDIS_URL")),
      }),
    }),
  ],
  controllers: [AnswersController],
  providers: [PerUserThrottlerGuard],
})
export class AnswersModule {}
