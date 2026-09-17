import type { HealthStatus } from "@memora/shared";

const API_BASE_URL = process.env.EXPO_PUBLIC_API_URL ?? "http://localhost:3000";

/**
 * GET /health returns 200 when healthy and 503 when the database is
 * unreachable — but the response body is a valid HealthStatus payload
 * either way (see apps/api/src/health/health.controller.ts), so this reads
 * the body regardless of status code rather than treating 503 as a generic
 * request failure.
 */
export async function getHealth(): Promise<HealthStatus> {
  const response = await fetch(`${API_BASE_URL}/health`, {
    headers: { Accept: "application/json" },
  });

  const body = (await response.json()) as HealthStatus;
  return body;
}
