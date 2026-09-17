import { Injectable, Logger, OnModuleDestroy, OnModuleInit } from "@nestjs/common";
import { PrismaClient } from "@prisma/client";

/**
 * Thin wrapper around PrismaClient so the rest of the app depends on a
 * NestJS-managed, injectable service rather than a module-level singleton —
 * this is what lets repository classes (introduced from Phase 2 onward) be
 * unit-tested against a mocked PrismaService instead of a real database.
 */
@Injectable()
export class PrismaService extends PrismaClient implements OnModuleInit, OnModuleDestroy {
  private readonly logger = new Logger(PrismaService.name);

  async onModuleInit(): Promise<void> {
    await this.$connect();
    this.logger.log("Connected to PostgreSQL via Prisma");
  }

  async onModuleDestroy(): Promise<void> {
    await this.$disconnect();
  }
}
