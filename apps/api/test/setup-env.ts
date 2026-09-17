// Fallback env values so `pnpm test:e2e` works without a running Postgres/Redis
// (this test suite mocks PrismaService — see health.e2e-spec.ts). CI/local
// setups that export real DATABASE_URL/REDIS_URL values take precedence.
process.env.NODE_ENV ??= "test";
process.env.DATABASE_URL ??= "postgresql://memora:memora@localhost:5432/memora_test";
process.env.REDIS_URL ??= "redis://localhost:6379";
