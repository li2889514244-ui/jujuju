-- 业绩天梯月度快照：冻结每个自然月当时生效的老师目标与归因规则。
-- 目标/规则主表只保存当前值；历史月份读取对应快照，避免当前配置变更重算历史成绩。
-- 只新增表，不影响现有数据。

CREATE TABLE IF NOT EXISTS "PerformanceLadderMonthSnapshot" (
    "id" TEXT NOT NULL,
    "organizationId" TEXT NOT NULL,
    "yearMonth" TEXT NOT NULL,
    "targets" TEXT NOT NULL DEFAULT '[]',
    "sourceOperators" TEXT NOT NULL DEFAULT '{}',
    "hideUnmatched" BOOLEAN NOT NULL DEFAULT true,
    "capturedAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "PerformanceLadderMonthSnapshot_pkey" PRIMARY KEY ("id")
);

CREATE UNIQUE INDEX IF NOT EXISTS "PerformanceLadderMonthSnapshot_organizationId_yearMonth_key"
    ON "PerformanceLadderMonthSnapshot"("organizationId", "yearMonth");

CREATE INDEX IF NOT EXISTS "PerformanceLadderMonthSnapshot_organizationId_idx"
    ON "PerformanceLadderMonthSnapshot"("organizationId");

CREATE INDEX IF NOT EXISTS "PerformanceLadderMonthSnapshot_yearMonth_idx"
    ON "PerformanceLadderMonthSnapshot"("yearMonth");

ALTER TABLE "PerformanceLadderMonthSnapshot"
    ADD CONSTRAINT "PerformanceLadderMonthSnapshot_organizationId_fkey"
    FOREIGN KEY ("organizationId") REFERENCES "Organization"("id")
    ON DELETE CASCADE ON UPDATE CASCADE;
