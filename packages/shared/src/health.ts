/**
 * Shared shape for the API's liveness/readiness endpoint (GET /health), so
 * the backend and mobile client agree on this contract in one place instead
 * of the mobile app guessing at the response shape.
 */
export interface HealthStatus {
  status: "ok" | "degraded";
  database: "up" | "down";
  timestamp: string;
}
