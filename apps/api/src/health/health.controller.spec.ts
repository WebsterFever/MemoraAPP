import { ServiceUnavailableException } from "@nestjs/common";
import { Test, type TestingModule } from "@nestjs/testing";
import { HealthController } from "./health.controller";
import { HealthService } from "./health.service";

describe("HealthController", () => {
  let controller: HealthController;
  let service: { check: jest.Mock };

  beforeEach(async () => {
    service = { check: jest.fn() };

    const module: TestingModule = await Test.createTestingModule({
      controllers: [HealthController],
      providers: [{ provide: HealthService, useValue: service }],
    }).compile();

    controller = module.get(HealthController);
  });

  it("returns the health payload when the database is up", async () => {
    service.check.mockResolvedValue({
      status: "ok",
      database: "up",
      timestamp: "2026-01-01T00:00:00.000Z",
    });

    await expect(controller.check()).resolves.toEqual({
      status: "ok",
      database: "up",
      timestamp: "2026-01-01T00:00:00.000Z",
    });
  });

  it("throws ServiceUnavailableException when the database is down", async () => {
    service.check.mockResolvedValue({
      status: "degraded",
      database: "down",
      timestamp: "2026-01-01T00:00:00.000Z",
    });

    await expect(controller.check()).rejects.toBeInstanceOf(ServiceUnavailableException);
  });
});
