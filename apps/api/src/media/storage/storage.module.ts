import { Module } from "@nestjs/common";
import { ConfigModule } from "@nestjs/config";
import { STORAGE_PROVIDER } from "./storage-provider";
import { S3StorageService } from "./s3-storage.service";

/**
 * Binds the STORAGE_PROVIDER token to the S3 implementation. To switch
 * providers later, change only this binding — nothing that injects
 * STORAGE_PROVIDER needs to know or care.
 */
@Module({
  imports: [ConfigModule],
  providers: [{ provide: STORAGE_PROVIDER, useClass: S3StorageService }],
  exports: [STORAGE_PROVIDER],
})
export class StorageModule {}
