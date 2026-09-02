-- CreateTable
CREATE TABLE "CompanionDevice" (
    "id" TEXT NOT NULL,
    "deviceId" TEXT NOT NULL,
    "deviceName" TEXT NOT NULL DEFAULT '',
    "ownerUserId" TEXT,
    "ownerName" TEXT,
    "organizationId" TEXT,
    "companionVersion" TEXT NOT NULL DEFAULT '',
    "startedAt" TIMESTAMP(3),
    "firstSeenAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "lastSeenAt" TIMESTAMP(3),
    "lastHeartbeatAt" TIMESTAMP(3),
    "healthStatus" TEXT NOT NULL DEFAULT 'unknown',
    "currentTask" TEXT,
    "currentTaskDetail" JSONB,
    "taskStartedAt" TIMESTAMP(3),
    "platformSummary" JSONB,
    "lastCollectionAt" TIMESTAMP(3),
    "lastCollectionSuccess" BOOLEAN,
    "lastCollectionAccountCount" INTEGER,
    "lastSyncAt" TIMESTAMP(3),
    "lastSyncSuccess" BOOLEAN,
    "lastSyncUploadCount" INTEGER,
    "lastSyncErrorCode" TEXT,
    "lastErrorCode" TEXT,
    "lastErrorMessage" TEXT,
    "lastErrorAt" TIMESTAMP(3),
    "updateStatus" JSONB,
    "cpuPercent" DOUBLE PRECISION,
    "memoryMb" DOUBLE PRECISION,
    "processUptimeSeconds" INTEGER,
    "consecutiveSyncFailures" INTEGER NOT NULL DEFAULT 0,
    "recentHttpErrors" JSONB,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "CompanionDevice_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "CompanionHeartbeat" (
    "id" TEXT NOT NULL,
    "deviceId" TEXT NOT NULL,
    "receivedAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "companionVersion" TEXT NOT NULL DEFAULT '',
    "taskStatus" TEXT,
    "taskDetail" JSONB,
    "platformSummary" JSONB,
    "lastCollection" JSONB,
    "lastSync" JSONB,
    "lastError" JSONB,
    "update" JSONB,
    "cpuPercent" DOUBLE PRECISION,
    "memoryMb" DOUBLE PRECISION,
    "processUptimeSeconds" INTEGER,
    "ownerName" TEXT,

    CONSTRAINT "CompanionHeartbeat_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "CompanionAlert" (
    "id" TEXT NOT NULL,
    "deviceId" TEXT,
    "type" TEXT NOT NULL,
    "message" TEXT NOT NULL,
    "status" TEXT NOT NULL DEFAULT 'open',
    "organizationId" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "CompanionAlert_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE UNIQUE INDEX "CompanionDevice_deviceId_key" ON "CompanionDevice"("deviceId");

-- CreateIndex
CREATE INDEX "CompanionDevice_organizationId_idx" ON "CompanionDevice"("organizationId");

-- CreateIndex
CREATE INDEX "CompanionDevice_healthStatus_idx" ON "CompanionDevice"("healthStatus");

-- CreateIndex
CREATE INDEX "CompanionDevice_lastHeartbeatAt_idx" ON "CompanionDevice"("lastHeartbeatAt");

-- CreateIndex
CREATE INDEX "CompanionHeartbeat_deviceId_receivedAt_idx" ON "CompanionHeartbeat"("deviceId", "receivedAt");

-- CreateIndex
CREATE INDEX "CompanionHeartbeat_receivedAt_idx" ON "CompanionHeartbeat"("receivedAt");

-- CreateIndex
CREATE INDEX "CompanionAlert_deviceId_idx" ON "CompanionAlert"("deviceId");

-- CreateIndex
CREATE INDEX "CompanionAlert_status_idx" ON "CompanionAlert"("status");

-- CreateIndex
CREATE INDEX "CompanionAlert_createdAt_idx" ON "CompanionAlert"("createdAt");

-- CreateIndex
CREATE INDEX "CompanionAlert_organizationId_idx" ON "CompanionAlert"("organizationId");

-- AddForeignKey
ALTER TABLE "CompanionHeartbeat" ADD CONSTRAINT "CompanionHeartbeat_deviceId_fkey" FOREIGN KEY ("deviceId") REFERENCES "CompanionDevice"("deviceId") ON DELETE CASCADE ON UPDATE CASCADE;
