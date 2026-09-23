import { BadRequestException, ForbiddenException, Inject, Injectable, Logger, NotFoundException } from "@nestjs/common";
import { randomUUID } from "crypto";
import { PrismaService } from "../prisma/prisma.service";
import { STORAGE_PROVIDER, type StorageProvider } from "./storage/storage-provider";
import { ALLOWED_AUDIO_MIME_TYPES, MAX_AUDIO_SIZE_BYTES, type CreateMediaUploadDto } from "./dto";

function extensionForMimeType(mimeType: string): string {
  switch (mimeType) {
    case "audio/m4a":
    case "audio/mp4":
    case "audio/x-m4a":
      return "m4a";
    case "audio/aac":
      return "aac";
    case "audio/wav":
    case "audio/wave":
    case "audio/x-wav":
      return "wav";
    default:
      return "bin";
  }
}

@Injectable()
export class MediaService {
  private readonly logger = new Logger(MediaService.name);

  constructor(
    private readonly prisma: PrismaService,
    @Inject(STORAGE_PROVIDER) private readonly storage: StorageProvider,
  ) {}

  /** Same membership/role check pattern used by FamiliesService/MemoriesService. */
  private async member(userId: string, familyId: string, write = false) {
    const membership = await this.prisma.familyMembership.findUnique({ where: { familyId_userId: { familyId, userId } } });
    if (!membership || membership.status !== "ACTIVE" || (write && membership.role === "VIEWER")) {
      throw new ForbiddenException();
    }
    return membership;
  }

  async createUpload(userId: string, memoryId: string, dto: CreateMediaUploadDto) {
    const memory = await this.prisma.memory.findUnique({ where: { id: memoryId } });
    if (!memory) throw new NotFoundException("Memory not found");
    await this.member(userId, memory.familyId, true);

    const storageKey = `families/${memory.familyId}/memories/${memory.id}/audio/${randomUUID()}.${extensionForMimeType(dto.mimeType)}`;

    const asset = await this.prisma.mediaAsset.create({
      data: {
        familyId: memory.familyId,
        memoryId: memory.id,
        uploadedByUserId: userId,
        type: "AUDIO",
        storageProvider: "S3",
        storageKey,
        mimeType: dto.mimeType,
        sizeBytes: dto.sizeBytes,
        durationMs: dto.durationMs,
        status: "PENDING",
      },
    });

    const uploadUrl = await this.storage.createUploadUrl({ key: storageKey, contentType: dto.mimeType });

    return { mediaAssetId: asset.id, uploadUrl, storageKey };
  }

  async completeUpload(userId: string, mediaAssetId: string) {
    const asset = await this.prisma.mediaAsset.findUnique({ where: { id: mediaAssetId } });
    if (!asset) throw new NotFoundException("Media asset not found");
    await this.member(userId, asset.familyId, true);

    const uploaded = await this.storage.headObject(asset.storageKey);
    if (!uploaded) {
      throw new BadRequestException("Upload not found in storage yet — finish the S3 upload before completing.");
    }

    const validMimeType = (ALLOWED_AUDIO_MIME_TYPES as readonly string[]).includes(uploaded.contentType ?? "");
    const withinSizeLimit = uploaded.sizeBytes > 0 && uploaded.sizeBytes <= MAX_AUDIO_SIZE_BYTES;

    if (!validMimeType || !withinSizeLimit) {
      this.logger.warn(
        `Rejecting media asset ${asset.id}: contentType=${uploaded.contentType} sizeBytes=${uploaded.sizeBytes}`,
      );
      await this.storage.deleteObject(asset.storageKey).catch(() => undefined);
      await this.prisma.mediaAsset.update({ where: { id: asset.id }, data: { status: "FAILED" } });
      throw new BadRequestException("Uploaded file failed validation (content type or size) and was rejected.");
    }

    // sizeBytes is overwritten with the value S3 actually reports — the
    // client's declared value at createUpload time was only ever a hint
    // for the pre-upload size cap, never trusted for the stored record.
    return this.prisma.mediaAsset.update({
      where: { id: asset.id },
      data: { status: "READY", sizeBytes: uploaded.sizeBytes },
    });
  }

  async getPlaybackUrl(userId: string, mediaAssetId: string) {
    const asset = await this.prisma.mediaAsset.findUnique({ where: { id: mediaAssetId } });
    if (!asset) throw new NotFoundException("Media asset not found");
    await this.member(userId, asset.familyId);
    if (asset.status !== "READY") throw new BadRequestException("Media is not ready for playback yet");

    const url = await this.storage.createDownloadUrl({ key: asset.storageKey });
    return { url };
  }

  async remove(userId: string, mediaAssetId: string) {
    const asset = await this.prisma.mediaAsset.findUnique({ where: { id: mediaAssetId } });
    if (!asset) throw new NotFoundException("Media asset not found");
    await this.member(userId, asset.familyId, true);

    await this.storage.deleteObject(asset.storageKey).catch((error: unknown) => {
      this.logger.warn(`Failed to delete S3 object for media asset ${asset.id}: ${String(error)}`);
    });
    await this.prisma.mediaAsset.delete({ where: { id: asset.id } });
    return { deleted: true };
  }
}
