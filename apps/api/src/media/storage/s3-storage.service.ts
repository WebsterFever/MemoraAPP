import { Injectable, Logger, ServiceUnavailableException } from "@nestjs/common";
import { ConfigService } from "@nestjs/config";
import {
  DeleteObjectCommand,
  GetObjectCommand,
  HeadObjectCommand,
  PutObjectCommand,
  S3Client,
} from "@aws-sdk/client-s3";
import { getSignedUrl } from "@aws-sdk/s3-request-presigner";
import type { StorageProvider } from "./storage-provider";

const DEFAULT_UPLOAD_EXPIRY_SECONDS = 5 * 60;
const DEFAULT_DOWNLOAD_EXPIRY_SECONDS = 15 * 60;

function isNotFoundError(error: unknown): boolean {
  return typeof error === "object" && error !== null && (error as { name?: unknown }).name === "NotFound";
}

/**
 * AWS S3 implementation of StorageProvider. Deliberately tolerant of
 * missing AWS_* env vars at boot — Phase 4 development must not require
 * real AWS credentials just to start the API (auth/families/memories keep
 * working); only media endpoints fail, with a clear error, until AWS is
 * configured.
 */
@Injectable()
export class S3StorageService implements StorageProvider {
  private readonly logger = new Logger(S3StorageService.name);
  private readonly bucket?: string;
  private readonly client?: S3Client;

  constructor(config: ConfigService) {
    const region = config.get<string>("AWS_REGION");
    const accessKeyId = config.get<string>("AWS_ACCESS_KEY_ID");
    const secretAccessKey = config.get<string>("AWS_SECRET_ACCESS_KEY");
    this.bucket = config.get<string>("AWS_S3_BUCKET");

    if (region && accessKeyId && secretAccessKey && this.bucket) {
      this.client = new S3Client({ region, credentials: { accessKeyId, secretAccessKey } });
    } else {
      this.logger.warn(
        "AWS S3 is not configured (AWS_REGION / AWS_ACCESS_KEY_ID / AWS_SECRET_ACCESS_KEY / AWS_S3_BUCKET) — media upload/playback endpoints will return 503 until these are set.",
      );
    }
  }

  private requireClient(): { client: S3Client; bucket: string } {
    if (!this.client || !this.bucket) {
      throw new ServiceUnavailableException(
        "Media storage is not configured yet. Set AWS_REGION, AWS_ACCESS_KEY_ID, AWS_SECRET_ACCESS_KEY, and AWS_S3_BUCKET.",
      );
    }
    return { client: this.client, bucket: this.bucket };
  }

  async createUploadUrl({
    key,
    contentType,
    expiresInSeconds = DEFAULT_UPLOAD_EXPIRY_SECONDS,
  }: {
    key: string;
    contentType: string;
    expiresInSeconds?: number;
  }): Promise<string> {
    const { client, bucket } = this.requireClient();
    const command = new PutObjectCommand({ Bucket: bucket, Key: key, ContentType: contentType });
    return getSignedUrl(client, command, { expiresIn: expiresInSeconds });
  }

  async createDownloadUrl({
    key,
    expiresInSeconds = DEFAULT_DOWNLOAD_EXPIRY_SECONDS,
  }: {
    key: string;
    expiresInSeconds?: number;
  }): Promise<string> {
    const { client, bucket } = this.requireClient();
    const command = new GetObjectCommand({ Bucket: bucket, Key: key });
    return getSignedUrl(client, command, { expiresIn: expiresInSeconds });
  }

  async headObject(key: string): Promise<{ sizeBytes: number; contentType?: string } | null> {
    const { client, bucket } = this.requireClient();
    try {
      const result = await client.send(new HeadObjectCommand({ Bucket: bucket, Key: key }));
      return { sizeBytes: result.ContentLength ?? 0, contentType: result.ContentType };
    } catch (error) {
      if (isNotFoundError(error)) return null;
      throw error;
    }
  }

  async deleteObject(key: string): Promise<void> {
    const { client, bucket } = this.requireClient();
    await client.send(new DeleteObjectCommand({ Bucket: bucket, Key: key }));
  }
}
