import { Controller, Get, HttpCode, HttpStatus, ServiceUnavailableException } from "@nestjs/common";
import { ApiOperation, ApiResponse, ApiTags } from "@nestjs/swagger";
import type { HealthStatus } from "@memora/shared";
import { HealthService } from "./health.service";

@ApiTags("health")
@Controller("health")
export class HealthController {
  constructor(private readonly healthService: HealthService) {}

  @Get()
  @HttpCode(HttpStatus.OK)
  @ApiOperation({ summary: "Liveness/readiness check, including database connectivity" })
  @ApiResponse({ status: 200, description: "Service and database are healthy" })
  @ApiResponse({ status: 503, description: "Database is unreachable" })
  async check(): Promise<HealthStatus> {
    const result = await this.healthService.check();
    if (result.status === "degraded") {
      throw new ServiceUnavailableException(result);
    }
    return result;
  }
}
