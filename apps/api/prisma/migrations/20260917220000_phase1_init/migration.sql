-- Phase 1 baseline migration.
-- Enables pgvector and creates the temporary Placeholder model used only
-- to verify the complete Prisma/PostgreSQL pipeline before Phase 2.

CREATE EXTENSION IF NOT EXISTS "vector";

CREATE TABLE "Placeholder" (
    "id" TEXT NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    CONSTRAINT "Placeholder_pkey" PRIMARY KEY ("id")
);
