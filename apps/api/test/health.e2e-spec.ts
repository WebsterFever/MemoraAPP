import type { INestApplication } from "@nestjs/common";
import { Test, type TestingModule } from "@nestjs/testing";
import request from "supertest";
import { AppModule } from "../src/app.module";
import { PrismaService } from "../src/prisma/prisma.service";

describe("HealthController (e2e)", () => {
  let app: INestApplication;
  let prisma: { $queryRaw: jest.Mock; $connect: jest.Mock; $disconnect: jest.Mock };

  beforeAll(async () => {
    prisma = {
      $queryRaw: jest.fn().mockResolvedValue([{ "?column?": 1 }]),
      $connect: jest.fn().mockResolvedValue(undefined),
      $disconnect: jest.fn().mockResolvedValue(undefined),
    };

    const moduleFixture: TestingModule = await Test.createTestingModule({
      imports: [AppModule],
    })
      .overrideProvider(PrismaService)
      .useValue(prisma)
      .compile();

    app = moduleFixture.createNestApplication();
    await app.init();
  });

  afterAll(async () => {
    await app.close();
  });

  it("GET /health returns 200 and ok status when the database is reachable", async () => {
    const response = await request(app.getHttpServer()).get("/health").expect(200);

    expect(response.body).toMatchObject({ status: "ok", database: "up" });
  });

  it("GET /health returns 503 when the database is unreachable", async () => {
    prisma.$queryRaw.mockRejectedValueOnce(new Error("connection refused"));

    await request(app.getHttpServer()).get("/health").expect(503);
  });
});
