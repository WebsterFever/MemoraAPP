import { BadRequestException, ForbiddenException, NotFoundException } from "@nestjs/common";
import { MediaService } from "./media.service";
import type { StorageProvider } from "./storage/storage-provider";

function makePrismaStub() {
  return {
    familyMembership: { findUnique: jest.fn() },
    memory: { findUnique: jest.fn() },
    mediaAsset: { create: jest.fn(), findUnique: jest.fn(), update: jest.fn(), delete: jest.fn() },
  };
}

function makeStorageStub(): jest.Mocked<StorageProvider> {
  return {
    createUploadUrl: jest.fn().mockResolvedValue("https://example.invalid/unset-upload-url"),
    createDownloadUrl: jest.fn().mockResolvedValue("https://example.invalid/unset-download-url"),
    headObject: jest.fn().mockResolvedValue(null),
    // Defaults to resolving (not undefined) so `.catch()` in the service's
    // best-effort cleanup paths always has a real Promise to call.
    deleteObject: jest.fn().mockResolvedValue(undefined),
  };
}

const ACTIVE_CONTRIBUTOR = { status: "ACTIVE", role: "CONTRIBUTOR" };
const ACTIVE_VIEWER = { status: "ACTIVE", role: "VIEWER" };

describe("MediaService", () => {
  let prisma: ReturnType<typeof makePrismaStub>;
  let storage: jest.Mocked<StorageProvider>;
  let service: MediaService;

  beforeEach(() => {
    prisma = makePrismaStub();
    storage = makeStorageStub();
    service = new MediaService(prisma as never, storage);
  });

  describe("createUpload", () => {
    it("throws NotFoundException when the memory does not exist", async () => {
      prisma.memory.findUnique.mockResolvedValue(null);
      await expect(
        service.createUpload("user-1", "missing-memory", { mimeType: "audio/mp4", sizeBytes: 1000 }),
      ).rejects.toBeInstanceOf(NotFoundException);
    });

    it("throws ForbiddenException for a user outside the memory's family", async () => {
      prisma.memory.findUnique.mockResolvedValue({ id: "mem-1", familyId: "fam-1" });
      prisma.familyMembership.findUnique.mockResolvedValue(null);
      await expect(
        service.createUpload("intruder", "mem-1", { mimeType: "audio/mp4", sizeBytes: 1000 }),
      ).rejects.toBeInstanceOf(ForbiddenException);
    });

    it("throws ForbiddenException for a VIEWER (read-only) member", async () => {
      prisma.memory.findUnique.mockResolvedValue({ id: "mem-1", familyId: "fam-1" });
      prisma.familyMembership.findUnique.mockResolvedValue(ACTIVE_VIEWER);
      await expect(
        service.createUpload("viewer-user", "mem-1", { mimeType: "audio/mp4", sizeBytes: 1000 }),
      ).rejects.toBeInstanceOf(ForbiddenException);
    });

    it("creates a PENDING MediaAsset with a server-generated key and returns a presigned URL", async () => {
      prisma.memory.findUnique.mockResolvedValue({ id: "mem-1", familyId: "fam-1" });
      prisma.familyMembership.findUnique.mockResolvedValue(ACTIVE_CONTRIBUTOR);
      prisma.mediaAsset.create.mockResolvedValue({ id: "asset-1" });
      storage.createUploadUrl.mockResolvedValue("https://signed-put-url");

      const result = await service.createUpload("user-1", "mem-1", { mimeType: "audio/mp4", sizeBytes: 1000 });

      expect(prisma.mediaAsset.create).toHaveBeenCalledWith(
        expect.objectContaining({
          data: expect.objectContaining({
            familyId: "fam-1",
            memoryId: "mem-1",
            status: "PENDING",
            storageKey: expect.stringMatching(/^families\/fam-1\/memories\/mem-1\/audio\/.+\.m4a$/),
          }),
        }),
      );
      expect(result).toEqual({ mediaAssetId: "asset-1", uploadUrl: "https://signed-put-url", storageKey: expect.any(String) });
    });
  });

  describe("completeUpload", () => {
    it("throws BadRequestException when the object was never uploaded", async () => {
      prisma.mediaAsset.findUnique.mockResolvedValue({ id: "asset-1", familyId: "fam-1", storageKey: "k" });
      prisma.familyMembership.findUnique.mockResolvedValue(ACTIVE_CONTRIBUTOR);
      storage.headObject.mockResolvedValue(null);

      await expect(service.completeUpload("user-1", "asset-1")).rejects.toBeInstanceOf(BadRequestException);
      expect(prisma.mediaAsset.update).not.toHaveBeenCalled();
    });

    it("rejects and cleans up an oversized upload instead of marking it READY", async () => {
      prisma.mediaAsset.findUnique.mockResolvedValue({ id: "asset-1", familyId: "fam-1", storageKey: "k" });
      prisma.familyMembership.findUnique.mockResolvedValue(ACTIVE_CONTRIBUTOR);
      storage.headObject.mockResolvedValue({ sizeBytes: 999_999_999, contentType: "audio/mp4" });

      await expect(service.completeUpload("user-1", "asset-1")).rejects.toBeInstanceOf(BadRequestException);
      expect(storage.deleteObject).toHaveBeenCalledWith("k");
      expect(prisma.mediaAsset.update).toHaveBeenCalledWith({ where: { id: "asset-1" }, data: { status: "FAILED" } });
    });

    it("rejects and cleans up a disallowed content type even if it was somehow uploaded", async () => {
      prisma.mediaAsset.findUnique.mockResolvedValue({ id: "asset-1", familyId: "fam-1", storageKey: "k" });
      prisma.familyMembership.findUnique.mockResolvedValue(ACTIVE_CONTRIBUTOR);
      storage.headObject.mockResolvedValue({ sizeBytes: 1000, contentType: "application/x-msdownload" });

      await expect(service.completeUpload("user-1", "asset-1")).rejects.toBeInstanceOf(BadRequestException);
      expect(storage.deleteObject).toHaveBeenCalledWith("k");
    });

    it("marks READY using the S3-verified size, not the client-declared one", async () => {
      prisma.mediaAsset.findUnique.mockResolvedValue({ id: "asset-1", familyId: "fam-1", storageKey: "k" });
      prisma.familyMembership.findUnique.mockResolvedValue(ACTIVE_CONTRIBUTOR);
      storage.headObject.mockResolvedValue({ sizeBytes: 54321, contentType: "audio/mp4" });
      prisma.mediaAsset.update.mockResolvedValue({ id: "asset-1", status: "READY", sizeBytes: 54321 });

      const result = await service.completeUpload("user-1", "asset-1");

      expect(prisma.mediaAsset.update).toHaveBeenCalledWith({
        where: { id: "asset-1" },
        data: { status: "READY", sizeBytes: 54321 },
      });
      expect(result).toEqual({ id: "asset-1", status: "READY", sizeBytes: 54321 });
    });
  });

  describe("getPlaybackUrl", () => {
    it("allows a VIEWER to read (playback is not a write action)", async () => {
      prisma.mediaAsset.findUnique.mockResolvedValue({ id: "asset-1", familyId: "fam-1", storageKey: "k", status: "READY" });
      prisma.familyMembership.findUnique.mockResolvedValue(ACTIVE_VIEWER);
      storage.createDownloadUrl.mockResolvedValue("https://signed-get-url");

      await expect(service.getPlaybackUrl("viewer-user", "asset-1")).resolves.toEqual({ url: "https://signed-get-url" });
    });

    it("throws BadRequestException when the asset is not READY yet", async () => {
      prisma.mediaAsset.findUnique.mockResolvedValue({ id: "asset-1", familyId: "fam-1", storageKey: "k", status: "PENDING" });
      prisma.familyMembership.findUnique.mockResolvedValue(ACTIVE_CONTRIBUTOR);

      await expect(service.getPlaybackUrl("user-1", "asset-1")).rejects.toBeInstanceOf(BadRequestException);
      expect(storage.createDownloadUrl).not.toHaveBeenCalled();
    });

    it("throws ForbiddenException for a user outside the family", async () => {
      prisma.mediaAsset.findUnique.mockResolvedValue({ id: "asset-1", familyId: "fam-1", storageKey: "k", status: "READY" });
      prisma.familyMembership.findUnique.mockResolvedValue(null);

      await expect(service.getPlaybackUrl("intruder", "asset-1")).rejects.toBeInstanceOf(ForbiddenException);
    });
  });

  describe("remove", () => {
    it("deletes the S3 object and the database row", async () => {
      prisma.mediaAsset.findUnique.mockResolvedValue({ id: "asset-1", familyId: "fam-1", storageKey: "k" });
      prisma.familyMembership.findUnique.mockResolvedValue(ACTIVE_CONTRIBUTOR);

      const result = await service.remove("user-1", "asset-1");

      expect(storage.deleteObject).toHaveBeenCalledWith("k");
      expect(prisma.mediaAsset.delete).toHaveBeenCalledWith({ where: { id: "asset-1" } });
      expect(result).toEqual({ deleted: true });
    });

    it("still deletes the database row even if the S3 delete fails", async () => {
      prisma.mediaAsset.findUnique.mockResolvedValue({ id: "asset-1", familyId: "fam-1", storageKey: "k" });
      prisma.familyMembership.findUnique.mockResolvedValue(ACTIVE_CONTRIBUTOR);
      storage.deleteObject.mockRejectedValue(new Error("network blip"));

      await expect(service.remove("user-1", "asset-1")).resolves.toEqual({ deleted: true });
      expect(prisma.mediaAsset.delete).toHaveBeenCalledWith({ where: { id: "asset-1" } });
    });

    it("throws ForbiddenException for a VIEWER", async () => {
      prisma.mediaAsset.findUnique.mockResolvedValue({ id: "asset-1", familyId: "fam-1", storageKey: "k" });
      prisma.familyMembership.findUnique.mockResolvedValue(ACTIVE_VIEWER);

      await expect(service.remove("viewer-user", "asset-1")).rejects.toBeInstanceOf(ForbiddenException);
      expect(prisma.mediaAsset.delete).not.toHaveBeenCalled();
    });
  });
});
