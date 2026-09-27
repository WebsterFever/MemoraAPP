-- CreateEnum
CREATE TYPE "MemorySourceStatus" AS ENUM ('PENDING', 'PROCESSING', 'TRANSCRIBED', 'FAILED');

-- CreateTable
CREATE TABLE "MemorySource" (
    "id" TEXT NOT NULL,
    "mediaAssetId" TEXT NOT NULL,
    "memoryId" TEXT NOT NULL,
    "status" "MemorySourceStatus" NOT NULL DEFAULT 'PENDING',
    "detectedLanguage" TEXT,
    "rawTranscript" TEXT,
    "cleanedTranscript" TEXT,
    "errorMessage" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "MemorySource_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE UNIQUE INDEX "MemorySource_mediaAssetId_key" ON "MemorySource"("mediaAssetId");

-- CreateIndex
CREATE INDEX "MemorySource_memoryId_idx" ON "MemorySource"("memoryId");

-- AddForeignKey
ALTER TABLE "MemorySource" ADD CONSTRAINT "MemorySource_mediaAssetId_fkey" FOREIGN KEY ("mediaAssetId") REFERENCES "MediaAsset"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "MemorySource" ADD CONSTRAINT "MemorySource_memoryId_fkey" FOREIGN KEY ("memoryId") REFERENCES "Memory"("id") ON DELETE CASCADE ON UPDATE CASCADE;
