import { useQuery } from "@tanstack/react-query";
import { getHealth } from "./health";

export function useHealthQuery() {
  return useQuery({
    queryKey: ["health"],
    queryFn: getHealth,
    // The backend is unreachable in local dev until `docker compose up` and
    // `pnpm --filter @memora/api start:dev` are both running — retrying
    // aggressively would just spam the console during normal onboarding.
    retry: 1,
  });
}
