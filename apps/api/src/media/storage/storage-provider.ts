/**
 * Provider-agnostic object storage abstraction. MediaService talks only to
 * this interface — never to S3/AWS SDK types directly — so a future
 * provider (R2, Supabase Storage, etc.) can be substituted by writing a new
 * implementation of this interface and swapping the DI binding below,
 * without touching MediaModule/MediaService at all.
 */
export interface StorageProvider {
  /** Short-lived presigned URL the client PUTs the raw file bytes to directly. */
  createUploadUrl(params: { key: string; contentType: string; expiresInSeconds?: number }): Promise<string>;

  /** Short-lived presigned URL the client GETs to stream/play the file. */
  createDownloadUrl(params: { key: string; expiresInSeconds?: number }): Promise<string>;

  /**
   * Server-side inspection of the actual uploaded object — used to verify
   * an upload before trusting client-declared size/content-type. Returns
   * null if no object exists at that key.
   */
  headObject(key: string): Promise<{ sizeBytes: number; contentType?: string } | null>;

  /** Permanently removes the object (used on failed-verification cleanup and on delete). */
  deleteObject(key: string): Promise<void>;
}

/** DI token — inject with `@Inject(STORAGE_PROVIDER) private storage: StorageProvider`. */
export const STORAGE_PROVIDER = Symbol("STORAGE_PROVIDER");
