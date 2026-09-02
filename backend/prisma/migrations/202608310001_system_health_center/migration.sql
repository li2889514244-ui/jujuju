-- Phase 1: 统一系统健康中心
-- 只新增表和可空字段，避免已有生产数据迁移失败。

ALTER TABLE "CompanionAlert" ADD COLUMN IF NOT EXISTS "acknowledgedAt" TIMESTAMP(3);
ALTER TABLE "CompanionAlert" ADD COLUMN IF NOT EXISTS "acknowledgedBy" TEXT;

CREATE TABLE IF NOT EXISTS "SystemEvent" (
    "id" TEXT NOT NULL,
    "sourceType" TEXT NOT NULL,
    "sourceId" TEXT,
    "organizationId" TEXT,
    "userId" TEXT,
    "deviceId" TEXT,
    "bootId" TEXT,
    "requestId" TEXT,
    "taskId" TEXT,
    "accountId" TEXT,
    "storeId" TEXT,
    "platform" TEXT,
    "frontendVersion" TEXT,
    "backendVersion" TEXT,
    "companionVersion" TEXT,
    "eventType" TEXT NOT NULL,
    "severity" TEXT NOT NULL DEFAULT 'INFO',
    "errorCode" TEXT,
    "message" TEXT NOT NULL,
    "occurredAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "metadata" JSONB,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "SystemEvent_pkey" PRIMARY KEY ("id")
);

CREATE TABLE IF NOT EXISTS "SystemIncident" (
    "id" TEXT NOT NULL,
    "sourceType" TEXT NOT NULL,
    "scope" TEXT NOT NULL DEFAULT 'global',
    "organizationId" TEXT,
    "errorCode" TEXT,
    "severity" TEXT NOT NULL DEFAULT 'ERROR',
    "status" TEXT NOT NULL DEFAULT 'OPEN',
    "firstOccurredAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "lastOccurredAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "recoveryStartedAt" TIMESTAMP(3),
    "resolvedAt" TIMESTAMP(3),
    "occurrenceCount" INTEGER NOT NULL DEFAULT 1,
    "affectedUsers" INTEGER NOT NULL DEFAULT 0,
    "affectedDevices" INTEGER NOT NULL DEFAULT 0,
    "affectedAccounts" INTEGER NOT NULL DEFAULT 0,
    "affectedStores" INTEGER NOT NULL DEFAULT 0,
    "affectedVersions" JSONB,
    "title" TEXT NOT NULL,
    "summary" TEXT NOT NULL,
    "rootCause" TEXT,
    "resolution" TEXT,
    "acknowledgedAt" TIMESTAMP(3),
    "acknowledgedBy" TEXT,
    "dedupeKey" TEXT NOT NULL,
    "metadata" JSONB,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "SystemIncident_pkey" PRIMARY KEY ("id")
);

CREATE INDEX IF NOT EXISTS "SystemEvent_sourceType_occurredAt_idx" ON "SystemEvent"("sourceType", "occurredAt");
CREATE INDEX IF NOT EXISTS "SystemEvent_eventType_occurredAt_idx" ON "SystemEvent"("eventType", "occurredAt");
CREATE INDEX IF NOT EXISTS "SystemEvent_severity_occurredAt_idx" ON "SystemEvent"("severity", "occurredAt");
CREATE INDEX IF NOT EXISTS "SystemEvent_errorCode_occurredAt_idx" ON "SystemEvent"("errorCode", "occurredAt");
CREATE INDEX IF NOT EXISTS "SystemEvent_organizationId_occurredAt_idx" ON "SystemEvent"("organizationId", "occurredAt");
CREATE INDEX IF NOT EXISTS "SystemEvent_requestId_idx" ON "SystemEvent"("requestId");
CREATE INDEX IF NOT EXISTS "SystemEvent_deviceId_occurredAt_idx" ON "SystemEvent"("deviceId", "occurredAt");
CREATE INDEX IF NOT EXISTS "SystemEvent_accountId_occurredAt_idx" ON "SystemEvent"("accountId", "occurredAt");
CREATE INDEX IF NOT EXISTS "SystemEvent_storeId_occurredAt_idx" ON "SystemEvent"("storeId", "occurredAt");

CREATE INDEX IF NOT EXISTS "SystemIncident_sourceType_status_idx" ON "SystemIncident"("sourceType", "status");
CREATE INDEX IF NOT EXISTS "SystemIncident_status_severity_idx" ON "SystemIncident"("status", "severity");
CREATE INDEX IF NOT EXISTS "SystemIncident_dedupeKey_status_idx" ON "SystemIncident"("dedupeKey", "status");
CREATE INDEX IF NOT EXISTS "SystemIncident_organizationId_status_idx" ON "SystemIncident"("organizationId", "status");
CREATE INDEX IF NOT EXISTS "SystemIncident_lastOccurredAt_idx" ON "SystemIncident"("lastOccurredAt");
