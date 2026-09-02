-- Phase 2: 运行周期(bootId/seq/优雅退出)、UI 模式诊断、进度时间戳、Event/Incident 闭环

-- AlterTable CompanionDevice
ALTER TABLE "CompanionDevice" ADD COLUMN "bootId" TEXT;
ALTER TABLE "CompanionDevice" ADD COLUMN "bootSeq" INTEGER NOT NULL DEFAULT 0;
ALTER TABLE "CompanionDevice" ADD COLUMN "bootCount" INTEGER NOT NULL DEFAULT 0;
ALTER TABLE "CompanionDevice" ADD COLUMN "exitState" TEXT;
ALTER TABLE "CompanionDevice" ADD COLUMN "uiMode" TEXT NOT NULL DEFAULT '';
ALTER TABLE "CompanionDevice" ADD COLUMN "startupDiagnostic" JSONB;
ALTER TABLE "CompanionDevice" ADD COLUMN "lastProgressAt" TIMESTAMP(3);

-- AlterTable CompanionHeartbeat
ALTER TABLE "CompanionHeartbeat" ADD COLUMN "bootId" TEXT;
ALTER TABLE "CompanionHeartbeat" ADD COLUMN "seq" INTEGER;

-- CreateTable CompanionEvent
CREATE TABLE "CompanionEvent" (
    "id" TEXT NOT NULL,
    "deviceId" TEXT,
    "type" TEXT NOT NULL,
    "message" TEXT NOT NULL,
    "organizationId" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "CompanionEvent_pkey" PRIMARY KEY ("id")
);

-- CreateTable CompanionIncident
CREATE TABLE "CompanionIncident" (
    "id" TEXT NOT NULL,
    "deviceId" TEXT,
    "type" TEXT NOT NULL,
    "message" TEXT NOT NULL,
    "status" TEXT NOT NULL DEFAULT 'open',
    "occurrences" INTEGER NOT NULL DEFAULT 1,
    "firstOccurredAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "lastOccurredAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "recoveringSince" TIMESTAMP(3),
    "recoveredAt" TIMESTAMP(3),
    "resolvedAt" TIMESTAMP(3),
    "durationSeconds" INTEGER,
    "organizationId" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "CompanionIncident_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE INDEX "CompanionDevice_bootId_idx" ON "CompanionDevice"("bootId");

CREATE INDEX "CompanionEvent_deviceId_createdAt_idx" ON "CompanionEvent"("deviceId", "createdAt");
CREATE INDEX "CompanionEvent_type_createdAt_idx" ON "CompanionEvent"("type", "createdAt");
CREATE INDEX "CompanionEvent_organizationId_idx" ON "CompanionEvent"("organizationId");

CREATE INDEX "CompanionIncident_deviceId_type_status_idx" ON "CompanionIncident"("deviceId", "type", "status");
CREATE INDEX "CompanionIncident_status_idx" ON "CompanionIncident"("status");
CREATE INDEX "CompanionIncident_organizationId_idx" ON "CompanionIncident"("organizationId");

