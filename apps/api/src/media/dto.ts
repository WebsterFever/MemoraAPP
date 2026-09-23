import { IsIn, IsInt, IsOptional, Max, Min } from "class-validator";

/**
 * Phase 4 is audio-only. Values here are what expo-audio actually produces
 * on iOS/Android (m4a/aac container variants) plus wav as a fallback —
 * not an arbitrary open list.
 */
export const ALLOWED_AUDIO_MIME_TYPES = [
  "audio/m4a",
  "audio/mp4",
  "audio/x-m4a",
  "audio/aac",
  "audio/wav",
  "audio/wave",
  "audio/x-wav",
] as const;

export type AllowedAudioMimeType = (typeof ALLOWED_AUDIO_MIME_TYPES)[number];

// 50MB — generous for a long voice memo at a reasonable bitrate, small
// enough to keep abuse/cost bounded. This is the FIRST check (fast, before
// generating a presigned URL); the real enforcement is the server-side
// HeadObject verification in MediaService.completeUpload, which never
// trusts this client-declared value for the final stored size.
export const MAX_AUDIO_SIZE_BYTES = 50 * 1024 * 1024;

export class CreateMediaUploadDto {
  @IsIn(ALLOWED_AUDIO_MIME_TYPES)
  mimeType!: AllowedAudioMimeType;

  @IsInt()
  @Min(1)
  @Max(MAX_AUDIO_SIZE_BYTES)
  sizeBytes!: number;

  @IsOptional()
  @IsInt()
  @Min(0)
  durationMs?: number;
}
