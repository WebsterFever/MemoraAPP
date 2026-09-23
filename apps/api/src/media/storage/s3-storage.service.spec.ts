import { ServiceUnavailableException } from "@nestjs/common";
import { S3Client } from "@aws-sdk/client-s3";
import { S3StorageService } from "./s3-storage.service";

function configServiceStub(values: Record<string, string | undefined>) {
  return { get: (key: string) => values[key] } as unknown as import("@nestjs/config").ConfigService;
}

describe("S3StorageService", () => {
  describe("when AWS is not configured", () => {
    const service = new S3StorageService(configServiceStub({}));

    it("rejects createUploadUrl", async () => {
      await expect(service.createUploadUrl({ key: "k", contentType: "audio/mp4" })).rejects.toBeInstanceOf(
        ServiceUnavailableException,
      );
    });

    it("rejects createDownloadUrl", async () => {
      await expect(service.createDownloadUrl({ key: "k" })).rejects.toBeInstanceOf(ServiceUnavailableException);
    });

    it("rejects headObject", async () => {
      await expect(service.headObject("k")).rejects.toBeInstanceOf(ServiceUnavailableException);
    });

    it("rejects deleteObject", async () => {
      await expect(service.deleteObject("k")).rejects.toBeInstanceOf(ServiceUnavailableException);
    });
  });

  describe("when AWS is configured", () => {
    // Fake-but-well-formed credentials — SigV4 presigning is a pure local
    // computation (no network call), so this exercises the real signing
    // path without hitting AWS.
    const service = new S3StorageService(
      configServiceStub({
        AWS_REGION: "us-east-1",
        AWS_ACCESS_KEY_ID: "AKIAFAKEFAKEFAKEFAKE",
        AWS_SECRET_ACCESS_KEY: "fakefakefakefakefakefakefakefakefakefake",
        AWS_S3_BUCKET: "memora-test-bucket",
      }),
    );

    afterEach(() => {
      // jest.spyOn on the same prototype method reuses one underlying mock
      // across `it` blocks unless restored — without this, call counts
      // (e.g. in the deleteObject test) accumulate across earlier tests.
      jest.restoreAllMocks();
    });

    it("returns a presigned PUT URL scoped to the bucket and key", async () => {
      const url = await service.createUploadUrl({ key: "families/f1/memories/m1/audio/a1.m4a", contentType: "audio/mp4" });
      expect(url).toMatch(/^https:\/\/memora-test-bucket\.s3\.us-east-1\.amazonaws\.com\//);
      // SigV4 presigned URLs keep '/' literal in the path component — only
      // the query-string parameters are percent-encoded.
      expect(url).toContain("/families/f1/memories/m1/audio/a1.m4a?");
      expect(url).toContain("X-Amz-Signature");
    });

    it("returns a presigned GET URL scoped to the bucket and key", async () => {
      const url = await service.createDownloadUrl({ key: "families/f1/memories/m1/audio/a1.m4a" });
      expect(url).toMatch(/^https:\/\/memora-test-bucket\.s3\.us-east-1\.amazonaws\.com\//);
      expect(url).toContain("X-Amz-Signature");
    });

    it("headObject returns metadata when the object exists", async () => {
      jest.spyOn(S3Client.prototype, "send").mockResolvedValueOnce({ ContentLength: 12345, ContentType: "audio/mp4" } as never);
      const result = await service.headObject("families/f1/memories/m1/audio/a1.m4a");
      expect(result).toEqual({ sizeBytes: 12345, contentType: "audio/mp4" });
    });

    it("headObject returns null when the object does not exist", async () => {
      (jest.spyOn(S3Client.prototype, "send") as jest.Mock).mockRejectedValueOnce(
        Object.assign(new Error("not found"), { name: "NotFound" }),
      );
      const result = await service.headObject("missing-key");
      expect(result).toBeNull();
    });

    it("headObject rethrows unexpected errors", async () => {
      (jest.spyOn(S3Client.prototype, "send") as jest.Mock).mockRejectedValueOnce(new Error("network blip"));
      await expect(service.headObject("some-key")).rejects.toThrow("network blip");
    });

    it("deleteObject sends a DeleteObjectCommand", async () => {
      const sendSpy = jest.spyOn(S3Client.prototype, "send").mockResolvedValueOnce({} as never);
      await service.deleteObject("families/f1/memories/m1/audio/a1.m4a");
      expect(sendSpy).toHaveBeenCalledTimes(1);
    });
  });
});
