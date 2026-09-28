-- CreateEnum
CREATE TYPE "MemoryChunkStatus" AS ENUM ('PENDING', 'EMBEDDED', 'FAILED');

-- CreateTable
CREATE TABLE "MemoryChunk" (
    "id" TEXT NOT NULL,
    "memorySourceId" TEXT NOT NULL,
    "memoryId" TEXT NOT NULL,
    "familyId" TEXT NOT NULL,
    "profileId" TEXT,
    "chunkIndex" INTEGER NOT NULL,
    "text" TEXT NOT NULL,
    "status" "MemoryChunkStatus" NOT NULL DEFAULT 'PENDING',
    "errorMessage" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,
    "embedding" vector(1536),

    CONSTRAINT "MemoryChunk_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE INDEX "MemoryChunk_familyId_profileId_idx" ON "MemoryChunk"("familyId", "profileId");

-- CreateIndex
CREATE INDEX "MemoryChunk_memoryId_idx" ON "MemoryChunk"("memoryId");

-- CreateIndex
CREATE UNIQUE INDEX "MemoryChunk_memorySourceId_chunkIndex_key" ON "MemoryChunk"("memorySourceId", "chunkIndex");

-- AddForeignKey
ALTER TABLE "MemoryChunk" ADD CONSTRAINT "MemoryChunk_memorySourceId_fkey" FOREIGN KEY ("memorySourceId") REFERENCES "MemorySource"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "MemoryChunk" ADD CONSTRAINT "MemoryChunk_memoryId_fkey" FOREIGN KEY ("memoryId") REFERENCES "Memory"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "MemoryChunk" ADD CONSTRAINT "MemoryChunk_familyId_fkey" FOREIGN KEY ("familyId") REFERENCES "Family"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "MemoryChunk" ADD CONSTRAINT "MemoryChunk_profileId_fkey" FOREIGN KEY ("profileId") REFERENCES "MemoryProfile"("id") ON DELETE SET NULL ON UPDATE CASCADE;
