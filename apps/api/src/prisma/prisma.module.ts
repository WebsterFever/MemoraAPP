import { Global, Module } from "@nestjs/common";
import { PrismaService } from "./prisma.service";

/**
 * Global so every feature module can inject PrismaService without each one
 * re-importing PrismaModule — the database connection is an application-wide
 * concern, not a per-feature one.
 */
@Global()
@Module({
  providers: [PrismaService],
  exports: [PrismaService],
})
export class PrismaModule {}
