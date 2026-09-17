# Memora

A private, multi-tenant family-memory platform: preserve a person's voice,
stories, recipes, and history, then let authorized family members explore
those memories conversationally through a grounded, citation-backed RAG
system that never invents biographical facts.

**Status: Phase 1 — monorepo, NestJS API, and Expo mobile app scaffolded.**
No product features exist yet (no auth, no memories, no AI) — this phase
only proves the repository is runnable end-to-end. See
[`docs/architecture/00-executive-summary.md`](docs/architecture/00-executive-summary.md)
for the full roadmap and architecture.

## Repository layout

```
apps/
  api/        NestJS backend (see apps/api/README.md)
  mobile/     Expo / React Native app (see apps/mobile/README.md)
packages/
  shared/     Cross-cutting types used by both apps (e.g. HealthStatus)
  ai-schemas/ Zod schemas for LLM structured outputs — empty until Phase 6+
  config/     Shared tsconfig/ESLint/Prettier base config
docs/
  architecture/  Phase 0 architecture docs, diagrams, and ADRs
infrastructure/  Reserved for future IaC (empty in Phase 1)
docker-compose.yml   Local Postgres (pgvector) + Redis
```

## Prerequisites

- Node.js 20+ (see `.nvmrc`)
- [pnpm](https://pnpm.io) (`corepack enable` or `npm install -g pnpm`)
- [Docker](https://www.docker.com/) (for local Postgres + Redis)

## Local setup

```bash
# 1. Install dependencies
pnpm install

# 2. Start local infrastructure (Postgres with pgvector, Redis)
docker compose up -d

# 3. Configure environment
cp apps/api/.env.example apps/api/.env
cp apps/mobile/.env.example apps/mobile/.env

# 4. Generate the Prisma client, then create the first migration
#    (only needed once — later schema changes use `pnpm --filter @memora/api
#    prisma:migrate` again with a descriptive --name)
pnpm --filter @memora/api prisma:generate
pnpm --filter @memora/api prisma:migrate --name init

# 5. Run the backend
pnpm dev:api
# API listening on http://localhost:3000, Swagger docs at /docs

# 6. In another terminal, run the mobile app
pnpm dev:mobile
# Press w for web, or scan the QR code with Expo Go
```

Once both are running, the mobile app's home screen shows a live
"Backend connected" badge — this is Phase 1's end-to-end proof that the
mobile app, the API, and Postgres are wired together correctly.

## Common commands

```bash
pnpm lint         # lint all apps/packages (Turborepo)
pnpm typecheck    # typecheck all apps/packages
pnpm test         # run all test suites
pnpm build        # build all apps/packages
```

> **Windows + OneDrive note:** if this repository lives inside a
> OneDrive-synced folder, Turborepo's native binary can fail to spawn
> (`spawn UNKNOWN`) due to OneDrive's handling of symlinks. If `pnpm lint` /
> `typecheck` / `test` / `build` fail this way, run the same checks
> per-package instead, e.g. `pnpm --filter @memora/api lint`, or move the
> repo outside OneDrive. This does not affect CI (GitHub Actions runners
> aren't affected).

## Testing the stack is wired correctly

- API health check: `curl http://localhost:3000/health` → `{"status":"ok","database":"up",...}`
- API docs: http://localhost:3000/docs
- Mobile: home screen shows "Backend connected" once the API is reachable

## Documentation

👉 [`docs/architecture/00-executive-summary.md`](docs/architecture/00-executive-summary.md)
— MVP scope, roadmap, risks, cost drivers, and open questions.

Full architecture documentation (diagrams, domain model, AI/RAG pipeline,
security, etc.): [`docs/architecture/`](docs/architecture/).
