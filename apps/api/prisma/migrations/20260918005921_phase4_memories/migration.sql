-- CreateTable
CREATE TABLE "Memory" (
    "id" TEXT NOT NULL,
    "familyId" TEXT NOT NULL,
    "profileId" TEXT,
    "title" TEXT NOT NULL,
    "story" TEXT NOT NULL,
    "occurredAt" TIMESTAMP(3),
    "createdByUserId" TEXT NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "Memory_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE INDEX "Memory_familyId_occurredAt_idx" ON "Memory"("familyId", "occurredAt");

-- CreateIndex
CREATE INDEX "Memory_profileId_idx" ON "Memory"("profileId");

-- AddForeignKey
ALTER TABLE "Memory" ADD CONSTRAINT "Memory_familyId_fkey" FOREIGN KEY ("familyId") REFERENCES "Family"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "Memory" ADD CONSTRAINT "Memory_profileId_fkey" FOREIGN KEY ("profileId") REFERENCES "MemoryProfile"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "Memory" ADD CONSTRAINT "Memory_createdByUserId_fkey" FOREIGN KEY ("createdByUserId") REFERENCES "User"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
