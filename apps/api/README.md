# @memora/api

Memora's NestJS backend. See the repo-root `README.md` for full local setup
and `docs/architecture/08-backend-architecture.md` for the module map and
layering conventions this app follows.

## Scripts

```bash
pnpm --filter @memora/api start:dev     # watch mode
pnpm --filter @memora/api lint
pnpm --filter @memora/api typecheck
pnpm --filter @memora/api test          # unit tests
pnpm --filter @memora/api test:e2e      # e2e tests
pnpm --filter @memora/api prisma:migrate
```

API docs (Swagger) are served at `/docs` in non-production environments once
the server is running.
