-- Add account collection status fields and organization-scoped performance ladder configuration.

DO $$
BEGIN
  IF NOT EXISTS (SELECT 1 FROM pg_type WHERE typname = 'AccountCollectStatus') THEN
    CREATE TYPE "AccountCollectStatus" AS ENUM ('SUCCESS', 'FAILED', 'COLLECTING');
  END IF;
END
$$;

ALTER TABLE "Account" ADD COLUMN IF NOT EXISTS "lastSuccessfulCollectAt" TIMESTAMP(3);
ALTER TABLE "Account" ADD COLUMN IF NOT EXISTS "lastCollectAttemptAt" TIMESTAMP(3);
ALTER TABLE "Account" ADD COLUMN IF NOT EXISTS "lastCollectStatus" "AccountCollectStatus";
ALTER TABLE "Account" ADD COLUMN IF NOT EXISTS "lastCollectError" TEXT;

CREATE INDEX IF NOT EXISTS "Account_lastCollectStatus_idx" ON "Account"("lastCollectStatus");
CREATE INDEX IF NOT EXISTS "Account_lastSuccessfulCollectAt_idx" ON "Account"("lastSuccessfulCollectAt");

CREATE TABLE IF NOT EXISTS "PerformanceLadderConfig" (
  "id" TEXT NOT NULL,
  "organizationId" TEXT NOT NULL,
  "monthlyTarget" INTEGER NOT NULL DEFAULT 0,
  "refundMode" TEXT NOT NULL DEFAULT 'include',
  "sourceIgnoreMode" TEXT NOT NULL DEFAULT 'exclude',
  "hideUnmatched" BOOLEAN NOT NULL DEFAULT true,
  "sourceOperators" TEXT NOT NULL DEFAULT '{}',
  "sourceIgnoreList" TEXT NOT NULL DEFAULT '[]',
  "updatedByUserId" TEXT,
  "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "updatedAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  CONSTRAINT "PerformanceLadderConfig_pkey" PRIMARY KEY ("id")
);

CREATE UNIQUE INDEX IF NOT EXISTS "PerformanceLadderConfig_organizationId_key" ON "PerformanceLadderConfig"("organizationId");
CREATE INDEX IF NOT EXISTS "PerformanceLadderConfig_organizationId_idx" ON "PerformanceLadderConfig"("organizationId");
CREATE INDEX IF NOT EXISTS "PerformanceLadderConfig_updatedByUserId_idx" ON "PerformanceLadderConfig"("updatedByUserId");

ALTER TABLE "PerformanceLadderConfig" DROP CONSTRAINT IF EXISTS "PerformanceLadderConfig_organizationId_fkey";
ALTER TABLE "PerformanceLadderConfig" ADD CONSTRAINT "PerformanceLadderConfig_organizationId_fkey"
  FOREIGN KEY ("organizationId") REFERENCES "Organization"("id") ON DELETE CASCADE ON UPDATE CASCADE;
ALTER TABLE "PerformanceLadderConfig" DROP CONSTRAINT IF EXISTS "PerformanceLadderConfig_updatedByUserId_fkey";
ALTER TABLE "PerformanceLadderConfig" ADD CONSTRAINT "PerformanceLadderConfig_updatedByUserId_fkey"
  FOREIGN KEY ("updatedByUserId") REFERENCES "User"("id") ON DELETE SET NULL ON UPDATE CASCADE;

CREATE TABLE IF NOT EXISTS "PerformanceLadderTeacher" (
  "id" TEXT NOT NULL,
  "organizationId" TEXT NOT NULL,
  "name" TEXT NOT NULL,
  "aliases" TEXT NOT NULL DEFAULT '[]',
  "monthlyTarget" INTEGER NOT NULL DEFAULT 0,
  "enabled" BOOLEAN NOT NULL DEFAULT true,
  "sortOrder" INTEGER NOT NULL DEFAULT 0,
  "updatedByUserId" TEXT,
  "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "updatedAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  CONSTRAINT "PerformanceLadderTeacher_pkey" PRIMARY KEY ("id")
);

CREATE UNIQUE INDEX IF NOT EXISTS "PerformanceLadderTeacher_organizationId_name_key" ON "PerformanceLadderTeacher"("organizationId", "name");
CREATE INDEX IF NOT EXISTS "PerformanceLadderTeacher_organizationId_idx" ON "PerformanceLadderTeacher"("organizationId");
CREATE INDEX IF NOT EXISTS "PerformanceLadderTeacher_organizationId_enabled_sortOrder_idx" ON "PerformanceLadderTeacher"("organizationId", "enabled", "sortOrder");
CREATE INDEX IF NOT EXISTS "PerformanceLadderTeacher_updatedByUserId_idx" ON "PerformanceLadderTeacher"("updatedByUserId");

ALTER TABLE "PerformanceLadderTeacher" DROP CONSTRAINT IF EXISTS "PerformanceLadderTeacher_organizationId_fkey";
ALTER TABLE "PerformanceLadderTeacher" ADD CONSTRAINT "PerformanceLadderTeacher_organizationId_fkey"
  FOREIGN KEY ("organizationId") REFERENCES "Organization"("id") ON DELETE CASCADE ON UPDATE CASCADE;
ALTER TABLE "PerformanceLadderTeacher" DROP CONSTRAINT IF EXISTS "PerformanceLadderTeacher_updatedByUserId_fkey";
ALTER TABLE "PerformanceLadderTeacher" ADD CONSTRAINT "PerformanceLadderTeacher_updatedByUserId_fkey"
  FOREIGN KEY ("updatedByUserId") REFERENCES "User"("id") ON DELETE SET NULL ON UPDATE CASCADE;
