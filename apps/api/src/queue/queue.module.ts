import { Module } from "@nestjs/common";
import { BullModule } from "@nestjs/bullmq";
import { ConfigModule, ConfigService } from "@nestjs/config";
import Redis from "ioredis";

/**
 * Root BullMQ connection, shared by every queue in the app. Feature modules
 * register their own queues via `BullModule.registerQueue(...)` and never
 * construct a Redis connection themselves.
 */
@Module({
  imports: [
    BullModule.forRootAsync({
      imports: [ConfigModule],
      inject: [ConfigService],
      useFactory: (config: ConfigService) => ({
        // BullMQ requires `maxRetriesPerRequest: null` on the ioredis
        // connection it's given — without it, the blocking commands BullMQ
        // relies on for its workers throw instead of waiting.
        connection: new Redis(config.getOrThrow<string>("REDIS_URL"), { maxRetriesPerRequest: null }),
      }),
    }),
  ],
  exports: [BullModule],
})
export class QueueModule {}
