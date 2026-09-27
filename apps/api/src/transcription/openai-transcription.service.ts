import { Injectable, Logger, ServiceUnavailableException } from "@nestjs/common";
import { ConfigService } from "@nestjs/config";
import OpenAI, { toFile } from "openai";
import type { TranscriptionProvider, TranscriptionResult } from "./transcription-provider";

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
      return "m4a";
  }
}

/**
 * OpenAI Whisper implementation of TranscriptionProvider. Deliberately
 * tolerant of a missing OPENAI_API_KEY at boot — same pattern as
 * S3StorageService: the API must start and every non-transcription feature
 * must keep working; only transcription jobs fail (and retry via BullMQ)
 * until the key is configured.
 */
@Injectable()
export class OpenAiTranscriptionService implements TranscriptionProvider {
  private readonly logger = new Logger(OpenAiTranscriptionService.name);
  private readonly client?: OpenAI;

  constructor(config: ConfigService) {
    const apiKey = config.get<string>("OPENAI_API_KEY");
    if (apiKey) {
      this.client = new OpenAI({ apiKey });
    } else {
      this.logger.warn("OPENAI_API_KEY is not configured — transcription jobs will fail until it is set.");
    }
  }

  async transcribe({ audioUrl, mimeType }: { audioUrl: string; mimeType: string }): Promise<TranscriptionResult> {
    if (!this.client) {
      throw new ServiceUnavailableException("Transcription is not configured yet. Set OPENAI_API_KEY.");
    }

    const response = await fetch(audioUrl);
    if (!response.ok) {
      throw new Error(`Failed to download audio for transcription (HTTP ${response.status})`);
    }
    const bytes = Buffer.from(await response.arrayBuffer());
    const file = await toFile(bytes, `audio.${extensionForMimeType(mimeType)}`, { type: mimeType });

    const result = await this.client.audio.transcriptions.create({
      file,
      model: "whisper-1",
      response_format: "verbose_json",
    });

    return { rawTranscript: result.text, language: result.language };
  }
}
