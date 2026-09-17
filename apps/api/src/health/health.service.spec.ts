import { Test, type TestingModule } from "@nestjs/testing";
import { PrismaService } from "../prisma/prisma.service";
import { HealthService } from "./health.service";

describe("HealthService", () => {
  let service: HealthService;
  let prisma: { $queryRaw: jest.Mock };

  beforeEach(async () => {
    prisma = { $queryRaw: jest.fn() };

    const module: TestingModule = await Test.createTestingModule({
      providers: [HealthService, { provide: PrismaService, useValue: prisma }],
    }).compile();

    service = module.get(HealthService);
  });

  it("reports ok when the database query succeeds", async () => {
    prisma.$queryRaw.mockResolvedValue([{ "?column?": 1 }]);

    const result = await service.check();

    expect(result.status).toBe("ok");
    expect(result.database).toBe("up");
    expect(result.timestamp).toEqual(expect.any(String));
  });

  it("reports degraded when the database query throws", async () => {
    prisma.$queryRaw.mockRejectedValue(new Error("connection refused"));

    const result = await service.check();

    expect(result.status).toBe("degraded");
    expect(result.database).toBe("down");
  });
});
