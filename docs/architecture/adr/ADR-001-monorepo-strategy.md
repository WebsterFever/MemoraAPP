# ADR-001: Monorepo Structure and Tooling

## Status
Proposed (recommended default — confirm before Phase 1)

## Context
The product spans a NestJS API, a React Native/Expo app, and shared code
(validation schemas, AI structured-output schemas, shared config/types).
These need to build, lint, and type-check together without duplicating
dependency management, and CI needs to run only what changed as the repo
grows.

## Decision
Use a **pnpm workspaces + Turborepo** monorepo:

```
memora/
  apps/
    mobile/
    api/
  packages/
    shared/        # cross-cutting types/utils usable by both apps
    ai-schemas/     # Zod schemas for LLM structured outputs + shared DTO shapes
    config/         # shared eslint/tsconfig/prettier base configs
  docs/
  infrastructure/   # docker-compose, IaC placeholders
```

## Alternatives considered
- **Nx** — more powerful generators/graph tooling, but heavier
  configuration surface than this project needs at MVP size; Turborepo's
  simpler task pipeline (`lint`/`typecheck`/`test`/`build` with caching) is
  enough for two apps and three packages.
- **Separate repositories** (api, mobile, shared-as-npm-package) — rejected
  for MVP: it forces publishing/versioning overhead for `ai-schemas` (which
  will change frequently as prompts/schemas evolve) before there's any
  actual need for independent deployability of the repos.

## Consequences
- pnpm's strict node_modules isolation catches accidental cross-package
  dependency leaks early.
- Turborepo's remote caching can be added later (e.g., Vercel) without
  restructuring if CI times become a problem.
- `packages/ai-schemas` being shared means a backend structured-output
  schema change and any client-side type expectation change are visible in
  the same PR diff.
