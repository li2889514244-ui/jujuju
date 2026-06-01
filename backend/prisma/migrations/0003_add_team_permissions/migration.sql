-- CreateTable
CREATE TABLE "TeamPermission" (
    "id" TEXT NOT NULL,
    "teamId" TEXT NOT NULL,
    "roleType" TEXT NOT NULL,
    "permissionId" TEXT NOT NULL,
    "enabled" BOOLEAN NOT NULL DEFAULT true,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "TeamPermission_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE UNIQUE INDEX "TeamPermission_teamId_roleType_permissionId_key" ON "TeamPermission"("teamId", "roleType", "permissionId");

-- CreateIndex
CREATE INDEX "TeamPermission_teamId_idx" ON "TeamPermission"("teamId");

-- AddForeignKey
ALTER TABLE "TeamPermission" ADD CONSTRAINT "TeamPermission_teamId_fkey" FOREIGN KEY ("teamId") REFERENCES "Team"("id") ON DELETE CASCADE ON UPDATE CASCADE;
