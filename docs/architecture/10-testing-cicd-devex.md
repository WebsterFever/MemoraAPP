# Testing, CI/CD, Scalability, and Developer Experience

## 1. Testing strategy

| Layer | Tooling | Focus |
|---|---|---|
| Backend unit | Jest | Domain/application services in isolation, mocked ports (repositories, providers) |
| Backend integration | Jest + Supertest + real Postgres (Docker) | Repository queries, RLS policies, module wiring |
| Backend e2e | Jest + Supertest | Full HTTP request → response flows including auth |
| AI structured-output validation | Jest | Zod schema edge cases, repair-retry logic, provider-error handling — run against recorded/mocked provider responses, not live API calls, for determinism and cost |
| Frontend component | React Native Testing Library | Chat screen, recording screen, interview screen |
| Frontend states | RNTL + mocked API client | Loading, error, empty, recording states |

### Mandatory test cases (mapped to where they're implemented)

| Test case | Where |
|---|---|
| User cannot access another family's memories | `PermissionsModule` integration test + e2e (two seeded families) |
| Vector retrieval respects family/profile authorization | `SearchModule` integration test against real pgvector with RLS enabled |
| Invalid AI JSON is rejected | `AIOrchestratorModule` unit test (malformed JSON, wrong schema, exhausted repair retries) |
| Low-confidence retrieval produces "not enough memory" | `RagModule` unit/integration test with a seeded low-similarity fixture |
| Citations reference real source IDs | `RagModule`/`EvaluationModule` test asserting citation-validation drops dangling references |
| Deleted memory cannot be retrieved | e2e: delete → immediately query RAG/search → assert absence, before running the cleanup worker |
| Revoked permission prevents access | e2e: grant → access succeeds → revoke → access denied on next request |
| Audio job failure is retryable | `AudioModule`/BullMQ test harness: force provider failure → assert retry attempts → assert `FAILED` + retry endpoint works after exhaustion |
| Refresh token rotation works | `AuthModule` e2e: rotate → old token reuse is detected and revokes the token family |

Additional Memora-specific cases worth calling out explicitly (not in the
brief's list but implied by the architecture):
- Cross-lingual retrieval returns the correct chunk for a same-fact query in
  a different language (regression fixture per supported language pair).
- Profile claim flow: unclaimed profile creator cannot grant voice/consent
  changes after the profile is claimed by another user.
- Step-up guard rejects a valid access token without a fresh step-up token
  on sensitive routes.
- Account deletion is blocked when the user is the sole owner of a family
  with dependent active profiles.

## 2. CI/CD (GitHub Actions)

```
.github/workflows/
  ci.yml
    jobs:
      lint        # eslint + prettier check, both apps + packages
      typecheck   # tsc --noEmit, both apps + packages
      test-api    # spins up Postgres+pgvector and Redis service containers, runs Jest
      test-mobile # RNTL component tests
      build-api   # nest build
      build-mobile-check  # expo prebuild/type-check (no app-store build in CI for MVP)
```

- All jobs run on PRs and on merge to main.
- Secrets (AI provider keys used only for a small set of live-call smoke
  tests, if any) come from GitHub Actions secrets, never committed; most
  AI-dependent tests use recorded fixtures/mocks specifically to keep CI
  fast, deterministic, and free of per-run API cost.
- `.env`, API keys, certificates, and production credentials are covered by
  `.gitignore` from the first commit; `.env.example` enumerates every
  required variable with placeholder values.

## 3. Scalability strategy (path to hundreds of thousands of users)

- **API is stateless** — horizontal scaling behind a load balancer is a pure
  infra decision, not an architecture change, because auth state lives in
  JWTs/Redis, not in-process memory.
- **Postgres is the first bottleneck to watch**, specifically pgvector query
  latency as chunk count grows. Mitigations staged by need, not built
  upfront: (1) HNSW index tuning, (2) read replicas for retrieval-heavy
  traffic, (3) partitioning `MemoryChunk` by family/profile if a single
  table becomes unwieldy, (4) migration path to a dedicated vector store
  (e.g., pgvector → a managed vector DB) is possible later because retrieval
  is already isolated behind `SearchModule` — nothing outside that module
  knows pgvector is the implementation.
- **BullMQ/Redis workers scale horizontally per queue** (doc 06 §2) — the
  slowest stage (transcription, rate-limited by the provider) gets
  dedicated worker capacity without over-provisioning cheaper stages.
- **Object storage is inherently horizontally scalable** (S3-class systems);
  the API never proxies bytes, so media throughput doesn't compete with API
  request capacity (doc 06 §3).
- **AI cost scales with usage, not storage** — the `AIExecution` ledger
  (doc 04 §9) is what lets per-plan quotas (Phase 15) cap this before it
  becomes a runaway cost as the user base grows.
- **Multi-tenancy isolation** (Family as the root, doc 03 §2) means sharding
  by family/tenant is architecturally possible later without a data-model
  rewrite, if a single Postgres instance ever becomes the limiting factor.

## 4. Local developer experience

```
docker-compose.yml   # postgres (pgvector image), redis
apps/api/.env.example
apps/mobile/.env.example
README.md            # local setup: install, docker compose up, prisma migrate, seed, run api, run mobile (expo start)
docs/architecture/    # this Phase 0 documentation set
docs/api/             # generated OpenAPI reference (Phase 1+)
docs/db/              # ERD export (Phase 1+, generated from Prisma schema)
```

A new developer should be able to: clone → `docker compose up -d` →
`pnpm install` → `pnpm --filter api prisma migrate dev` → `pnpm --filter api
start:dev` → `pnpm --filter mobile start`, with every required env var
documented in the relevant `.env.example`. This becomes concrete in Phase 1;
Phase 0 fixes the shape so Phase 1 isn't inventing structure mid-implementation.
