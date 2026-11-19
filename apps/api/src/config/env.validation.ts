import { z } from "zod";

export const envSchema = z.object({
  NODE_ENV: z.enum(["development", "test", "production"]).default("development"),
  PORT: z.coerce.number().int().positive().default(3000),
  DATABASE_URL: z.string().url(),
  REDIS_URL: z.string().url(),
  JWT_ACCESS_SECRET: z.string().min(32),
  JWT_REFRESH_SECRET: z.string().min(32),
  // Optional on purpose: the API must boot and every non-media feature must
  // keep working even before AWS is configured. S3StorageService checks
  // these itself and fails only the specific media request, not the whole
  // app, when they're missing (see media/storage/s3-storage.service.ts).
  AWS_REGION: z.string().optional(),
  AWS_ACCESS_KEY_ID: z.string().optional(),
  AWS_SECRET_ACCESS_KEY: z.string().optional(),
  AWS_S3_BUCKET: z.string().optional(),
  // Optional on purpose, same reasoning as the AWS_* block above: the API
  // must boot and every non-transcription feature must keep working before
  // an OpenAI key is configured. TranscriptionService checks this itself and
  // fails only the specific transcription job, not the whole app.
  OPENAI_API_KEY: z.string().optional(),
  // Phase 6: rate limiting for POST /families/:familyId/profiles/:profileId/ask
  // (the AI endpoint). Defaulted so the API boots without any extra config;
  // override per-environment to tune cost/abuse tradeoffs.
  ASK_RATE_LIMIT_MAX: z.coerce.number().int().positive().default(10),
  ASK_RATE_LIMIT_WINDOW_SECONDS: z.coerce.number().int().positive().default(60),
});

export type Env = z.infer<typeof envSchema>;

export function validateEnv(config: Record<string, unknown>): Env {
  const result = envSchema.safeParse(config);
  if (!result.success) {
    const issues = result.error.issues.map((i) => `  - ${i.path.join(".")}: ${i.message}`).join("\n");
    throw new Error(`Invalid environment configuration:\n${issues}`);
  }
  return result.data;
}
