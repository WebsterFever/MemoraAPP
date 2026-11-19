import { randomUUID } from "crypto";
import { ForbiddenException, ValidationPipe, type INestApplication } from "@nestjs/common";
import { ConfigService } from "@nestjs/config";
import { JwtService } from "@nestjs/jwt";
import { Test, type TestingModule } from "@nestjs/testing";
import request from "supertest";
import { AppModule } from "../src/app.module";
import { PrismaService } from "../src/prisma/prisma.service";
import { AnswerGenerationService } from "../src/answer-generation/answer-generation.service";

function fakePrisma() {
  return {
    $connect: jest.fn().mockResolvedValue(undefined),
    $disconnect: jest.fn().mockResolvedValue(undefined),
    $queryRaw: jest.fn().mockResolvedValue([{ "?column?": 1 }]),
  };
}

function successResponse() {
  return {
    refused: false,
    refusalReason: null,
    answer: "She made lemon rice every Sunday.",
    citations: [{ chunkId: "chunk-1", memoryId: "memory-1", memorySourceId: "source-1", quotedText: "Lemon rice every Sunday." }],
    conversationLanguage: "en",
    isGenerated: true,
  };
}

async function signAccessToken(app: INestApplication, userId: string): Promise<string> {
  const jwtService = app.get(JwtService);
  const config = app.get(ConfigService);
  return jwtService.signAsync(
    { sub: userId, email: `${userId}@example.com` },
    { secret: config.getOrThrow<string>("JWT_ACCESS_SECRET"), expiresIn: "15m" },
  );
}

function askUrl() {
  return "/families/family-1/profiles/profile-1/ask";
}

describe("AnswersController (e2e)", () => {
  let app: INestApplication;
  let generateAnswer: jest.Mock;

  beforeAll(async () => {
    generateAnswer = jest.fn();
    const moduleFixture: TestingModule = await Test.createTestingModule({ imports: [AppModule] })
      .overrideProvider(PrismaService)
      .useValue(fakePrisma())
      .overrideProvider(AnswerGenerationService)
      .useValue({ generateAnswer })
      .compile();

    app = moduleFixture.createNestApplication();
    // main.ts applies this globally at real boot; createNestApplication()
    // in a test does not run main.ts, so it must be reapplied here for the
    // DTO validation assertions below to mean anything.
    app.useGlobalPipes(new ValidationPipe({ whitelist: true, forbidNonWhitelisted: true, transform: true }));
    await app.init();
  });

  afterAll(async () => {
    await app.close();
  });

  beforeEach(() => {
    generateAnswer.mockReset();
  });

  describe("authentication", () => {
    it("rejects a request with no Authorization header", async () => {
      await request(app.getHttpServer()).post(askUrl()).send({ question: "hi" }).expect(401);
      expect(generateAnswer).not.toHaveBeenCalled();
    });

    it("rejects a request with an invalid/garbage token", async () => {
      await request(app.getHttpServer())
        .post(askUrl())
        .set("Authorization", "Bearer not-a-real-token")
        .send({ question: "hi" })
        .expect(401);
      expect(generateAnswer).not.toHaveBeenCalled();
    });
  });

  describe("authorization (delegated to AnswerGenerationService, not duplicated in the controller)", () => {
    it("returns 403 when AnswerGenerationService rejects with ForbiddenException", async () => {
      generateAnswer.mockRejectedValue(new ForbiddenException());
      const token = await signAccessToken(app, randomUUID());

      await request(app.getHttpServer())
        .post(askUrl())
        .set("Authorization", `Bearer ${token}`)
        .send({ question: "What was her favorite recipe?" })
        .expect(403);
    });

    it("passes the authenticated userId (from the JWT, never the body) through to AnswerGenerationService", async () => {
      generateAnswer.mockResolvedValue(successResponse());
      const userId = randomUUID();
      const token = await signAccessToken(app, userId);

      await request(app.getHttpServer())
        .post(askUrl())
        .set("Authorization", `Bearer ${token}`)
        .send({ question: "What was her favorite recipe?", userId: "attacker-supplied-id" })
        .expect(201);

      expect(generateAnswer).toHaveBeenCalledWith(
        expect.objectContaining({ userId, familyId: "family-1", profileId: "profile-1" }),
      );
    });
  });

  describe("input validation", () => {
    it("rejects an empty question", async () => {
      const token = await signAccessToken(app, randomUUID());
      await request(app.getHttpServer())
        .post(askUrl())
        .set("Authorization", `Bearer ${token}`)
        .send({ question: "" })
        .expect(400);
      expect(generateAnswer).not.toHaveBeenCalled();
    });

    it("rejects a whitespace-only question", async () => {
      const token = await signAccessToken(app, randomUUID());
      await request(app.getHttpServer())
        .post(askUrl())
        .set("Authorization", `Bearer ${token}`)
        .send({ question: "   \n\t  " })
        .expect(400);
      expect(generateAnswer).not.toHaveBeenCalled();
    });

    it("rejects a question longer than 2000 characters", async () => {
      const token = await signAccessToken(app, randomUUID());
      await request(app.getHttpServer())
        .post(askUrl())
        .set("Authorization", `Bearer ${token}`)
        .send({ question: "a".repeat(2001) })
        .expect(400);
      expect(generateAnswer).not.toHaveBeenCalled();
    });

    it("accepts a request with no conversationLanguage", async () => {
      generateAnswer.mockResolvedValue(successResponse());
      const token = await signAccessToken(app, randomUUID());
      await request(app.getHttpServer())
        .post(askUrl())
        .set("Authorization", `Bearer ${token}`)
        .send({ question: "hello" })
        .expect(201);
    });
  });

  describe("successful answers and refusals", () => {
    it("returns the grounded answer with citations on success", async () => {
      generateAnswer.mockResolvedValue(successResponse());
      const token = await signAccessToken(app, randomUUID());

      const response = await request(app.getHttpServer())
        .post(askUrl())
        .set("Authorization", `Bearer ${token}`)
        .send({ question: "What was her favorite recipe?", conversationLanguage: "fr" })
        .expect(201);

      expect(response.body).toMatchObject(successResponse());
      expect(generateAnswer).toHaveBeenCalledWith(
        expect.objectContaining({ question: "What was her favorite recipe?", conversationLanguage: "fr" }),
      );
    });

    it("returns a refusal payload without leaking internal reason codes beyond the field itself", async () => {
      generateAnswer.mockResolvedValue({
        refused: true,
        refusalReason: "NO_RELEVANT_MEMORY",
        answer: null,
        citations: [],
        conversationLanguage: "en",
        isGenerated: true,
      });
      const token = await signAccessToken(app, randomUUID());

      const response = await request(app.getHttpServer())
        .post(askUrl())
        .set("Authorization", `Bearer ${token}`)
        .send({ question: "Something unrelated" })
        .expect(201);

      expect(response.body.refused).toBe(true);
      expect(response.body.answer).toBeNull();
    });

    it("does not leak internal error detail when the LLM provider fails unexpectedly", async () => {
      generateAnswer.mockRejectedValue(new Error("OpenAI rejected key sk-super-secret-leaked-value"));
      const token = await signAccessToken(app, randomUUID());

      const response = await request(app.getHttpServer())
        .post(askUrl())
        .set("Authorization", `Bearer ${token}`)
        .send({ question: "hello" })
        .expect(500);

      expect(JSON.stringify(response.body)).not.toContain("sk-super-secret-leaked-value");
    });
  });
});

describe("AnswersController rate limiting (e2e)", () => {
  let app: INestApplication;
  let generateAnswer: jest.Mock;
  const previousMax = process.env.ASK_RATE_LIMIT_MAX;
  const previousWindow = process.env.ASK_RATE_LIMIT_WINDOW_SECONDS;

  beforeAll(async () => {
    // A small, fast-to-exhaust limit just for this suite — exercises the
    // real @nest-lab/throttler-storage-redis-backed guard against the real
    // Redis instance (REDIS_URL), not a mock, since the 429 behavior is the
    // thing under test.
    process.env.ASK_RATE_LIMIT_MAX = "3";
    process.env.ASK_RATE_LIMIT_WINDOW_SECONDS = "60";

    generateAnswer = jest.fn().mockResolvedValue(successResponse());
    const moduleFixture: TestingModule = await Test.createTestingModule({ imports: [AppModule] })
      .overrideProvider(PrismaService)
      .useValue(fakePrisma())
      .overrideProvider(AnswerGenerationService)
      .useValue({ generateAnswer })
      .compile();

    app = moduleFixture.createNestApplication();
    app.useGlobalPipes(new ValidationPipe({ whitelist: true, forbidNonWhitelisted: true, transform: true }));
    await app.init();
  });

  afterAll(async () => {
    await app.close();
    if (previousMax === undefined) delete process.env.ASK_RATE_LIMIT_MAX;
    else process.env.ASK_RATE_LIMIT_MAX = previousMax;
    if (previousWindow === undefined) delete process.env.ASK_RATE_LIMIT_WINDOW_SECONDS;
    else process.env.ASK_RATE_LIMIT_WINDOW_SECONDS = previousWindow;
  });

  it("allows up to the configured limit, then returns 429 for the authenticated user who exceeded it", async () => {
    const token = await signAccessToken(app, randomUUID());

    for (let i = 0; i < 3; i++) {
      await request(app.getHttpServer())
        .post(askUrl())
        .set("Authorization", `Bearer ${token}`)
        .send({ question: `question ${i}` })
        .expect(201);
    }

    await request(app.getHttpServer())
      .post(askUrl())
      .set("Authorization", `Bearer ${token}`)
      .send({ question: "one too many" })
      .expect(429);
  });

  it("rate-limits per authenticated user, not per IP — a different user from the same client is unaffected", async () => {
    const exhaustedUser = await signAccessToken(app, randomUUID());
    const freshUser = await signAccessToken(app, randomUUID());

    for (let i = 0; i < 3; i++) {
      await request(app.getHttpServer())
        .post(askUrl())
        .set("Authorization", `Bearer ${exhaustedUser}`)
        .send({ question: `question ${i}` })
        .expect(201);
    }
    await request(app.getHttpServer())
      .post(askUrl())
      .set("Authorization", `Bearer ${exhaustedUser}`)
      .send({ question: "one too many" })
      .expect(429);

    // A completely different authenticated user, from the same supertest
    // client (same effective source IP), must still get through.
    await request(app.getHttpServer())
      .post(askUrl())
      .set("Authorization", `Bearer ${freshUser}`)
      .send({ question: "first question from a different user" })
      .expect(201);
  });
});
