-- ====================================================================
-- 统一 Tenant → Organization 模型
-- 将 Tenant 表的字段合并到 Organization，所有 tenantId 列重命名为 organizationId
-- ====================================================================

-- 1. 向 Organization 表添加来自 Tenant 的字段
ALTER TABLE "Organization" ADD COLUMN IF NOT EXISTS "maxAccounts" INTEGER NOT NULL DEFAULT 20;
ALTER TABLE "Organization" ADD COLUMN IF NOT EXISTS "maxUsers" INTEGER NOT NULL DEFAULT 10;
ALTER TABLE "Organization" ADD COLUMN IF NOT EXISTS "expiresAt" TIMESTAMP(3);

-- 2. 为每个 Tenant 创建对应的 Organization（如果尚不存在）
--    使用 ON CONFLICT 避免重复
INSERT INTO "Organization" ("id", "name", "plan", "status", "maxAccounts", "maxUsers", "expiresAt", "createdAt", "updatedAt")
SELECT
  t."id",
  t."name",
  'FREE',
  CASE WHEN t."status" = 'SUSPENDED' THEN 'DISABLED'::"AccountStatus" ELSE 'ACTIVE'::"AccountStatus" END,
  t."maxAccounts",
  t."maxUsers",
  t."expiresAt",
  t."createdAt",
  t."updatedAt"
FROM "Tenant" t
ON CONFLICT ("id") DO UPDATE SET
  "maxAccounts" = EXCLUDED."maxAccounts",
  "maxUsers" = EXCLUDED."maxUsers",
  "expiresAt" = EXCLUDED."expiresAt";

-- 3. 为所有含 tenantId 的表添加 organizationId 列
ALTER TABLE "User" ADD COLUMN IF NOT EXISTS "organizationId_new" TEXT;
ALTER TABLE "Account" ADD COLUMN IF NOT EXISTS "organizationId_new" TEXT;
ALTER TABLE "Post" ADD COLUMN IF NOT EXISTS "organizationId_new" TEXT;
ALTER TABLE "PostStats" ADD COLUMN IF NOT EXISTS "organizationId_new" TEXT;
ALTER TABLE "DailyStats" ADD COLUMN IF NOT EXISTS "organizationId_new" TEXT;
ALTER TABLE "Competitor" ADD COLUMN IF NOT EXISTS "organizationId_new" TEXT;
ALTER TABLE "CompetitorSnapshot" ADD COLUMN IF NOT EXISTS "organizationId_new" TEXT;
ALTER TABLE "AccountGroup" ADD COLUMN IF NOT EXISTS "organizationId_new" TEXT;
ALTER TABLE "Asset" ADD COLUMN IF NOT EXISTS "organizationId_new" TEXT;
ALTER TABLE "Notification" ADD COLUMN IF NOT EXISTS "organizationId_new" TEXT;
ALTER TABLE "WechatStore" ADD COLUMN IF NOT EXISTS "organizationId_new" TEXT;
ALTER TABLE "DoudianStore" ADD COLUMN IF NOT EXISTS "organizationId_new" TEXT;
ALTER TABLE "PixingVideoTask" ADD COLUMN IF NOT EXISTS "organizationId_new" TEXT;
ALTER TABLE "CalendarEvent" ADD COLUMN IF NOT EXISTS "organizationId_new" TEXT;

-- 4. 将 tenantId 的值复制到 organizationId_new
--    对于 User 表，优先使用已有的 organizationId，否则用 tenantId 映射
UPDATE "User" SET "organizationId_new" = COALESCE("organizationId", "tenantId") WHERE "tenantId" IS NOT NULL;
UPDATE "User" SET "organizationId_new" = "organizationId" WHERE "organizationId" IS NOT NULL AND "tenantId" IS NULL;

UPDATE "Account" SET "organizationId_new" = "tenantId" WHERE "tenantId" IS NOT NULL;
UPDATE "Post" SET "organizationId_new" = "tenantId" WHERE "tenantId" IS NOT NULL;
UPDATE "PostStats" SET "organizationId_new" = "tenantId" WHERE "tenantId" IS NOT NULL;
UPDATE "DailyStats" SET "organizationId_new" = "tenantId" WHERE "tenantId" IS NOT NULL;
UPDATE "Competitor" SET "organizationId_new" = "tenantId" WHERE "tenantId" IS NOT NULL;
UPDATE "CompetitorSnapshot" SET "organizationId_new" = "tenantId" WHERE "tenantId" IS NOT NULL;
UPDATE "AccountGroup" SET "organizationId_new" = "tenantId" WHERE "tenantId" IS NOT NULL;
UPDATE "Asset" SET "organizationId_new" = "tenantId" WHERE "tenantId" IS NOT NULL;
UPDATE "Notification" SET "organizationId_new" = "tenantId" WHERE "tenantId" IS NOT NULL;
UPDATE "WechatStore" SET "organizationId_new" = "tenantId" WHERE "tenantId" IS NOT NULL;
UPDATE "DoudianStore" SET "organizationId_new" = "tenantId" WHERE "tenantId" IS NOT NULL;
UPDATE "PixingVideoTask" SET "organizationId_new" = "tenantId" WHERE "tenantId" IS NOT NULL;
UPDATE "CalendarEvent" SET "organizationId_new" = "tenantId" WHERE "tenantId" IS NOT NULL;

-- 5. 删除旧的 tenantId 列和 User.organizationId 列（将被 organizationId_new 替代）
--    先删除 User 表上指向 Tenant 的外键约束
ALTER TABLE "User" DROP CONSTRAINT IF EXISTS "User_tenantId_fkey";
ALTER TABLE "User" DROP COLUMN IF EXISTS "tenantId";
ALTER TABLE "User" DROP COLUMN IF EXISTS "organizationId";

-- 重命名 organizationId_new → organizationId
ALTER TABLE "User" RENAME COLUMN "organizationId_new" TO "organizationId";
ALTER TABLE "Account" RENAME COLUMN "organizationId_new" TO "organizationId";
ALTER TABLE "Post" RENAME COLUMN "organizationId_new" TO "organizationId";
ALTER TABLE "PostStats" RENAME COLUMN "organizationId_new" TO "organizationId";
ALTER TABLE "DailyStats" RENAME COLUMN "organizationId_new" TO "organizationId";
ALTER TABLE "Competitor" RENAME COLUMN "organizationId_new" TO "organizationId";
ALTER TABLE "CompetitorSnapshot" RENAME COLUMN "organizationId_new" TO "organizationId";
ALTER TABLE "AccountGroup" RENAME COLUMN "organizationId_new" TO "organizationId";
ALTER TABLE "Asset" RENAME COLUMN "organizationId_new" TO "organizationId";
ALTER TABLE "Notification" RENAME COLUMN "organizationId_new" TO "organizationId";
ALTER TABLE "WechatStore" RENAME COLUMN "organizationId_new" TO "organizationId";
ALTER TABLE "DoudianStore" RENAME COLUMN "organizationId_new" TO "organizationId";
ALTER TABLE "PixingVideoTask" RENAME COLUMN "organizationId_new" TO "organizationId";
ALTER TABLE "CalendarEvent" RENAME COLUMN "organizationId_new" TO "organizationId";

-- 6. 删除旧的 tenantId 列（非 User 表）
ALTER TABLE "Account" DROP COLUMN IF EXISTS "tenantId";
ALTER TABLE "Post" DROP COLUMN IF EXISTS "tenantId";
ALTER TABLE "PostStats" DROP COLUMN IF EXISTS "tenantId";
ALTER TABLE "DailyStats" DROP COLUMN IF EXISTS "tenantId";
ALTER TABLE "Competitor" DROP COLUMN IF EXISTS "tenantId";
ALTER TABLE "CompetitorSnapshot" DROP COLUMN IF EXISTS "tenantId";
ALTER TABLE "AccountGroup" DROP COLUMN IF EXISTS "tenantId";
ALTER TABLE "Asset" DROP COLUMN IF EXISTS "tenantId";
ALTER TABLE "Notification" DROP COLUMN IF EXISTS "tenantId";
ALTER TABLE "WechatStore" DROP COLUMN IF EXISTS "tenantId";
ALTER TABLE "DoudianStore" DROP COLUMN IF EXISTS "tenantId";
ALTER TABLE "PixingVideoTask" DROP COLUMN IF EXISTS "tenantId";
ALTER TABLE "CalendarEvent" DROP COLUMN IF EXISTS "tenantId";

-- 删除 store 子表上多余的 tenantId 列（这些表在 schema 中不需要此字段）
ALTER TABLE "WechatStoreOrder" DROP COLUMN IF EXISTS "tenantId";
ALTER TABLE "WechatStoreProduct" DROP COLUMN IF EXISTS "tenantId";
ALTER TABLE "WechatStoreAftersale" DROP COLUMN IF EXISTS "tenantId";
ALTER TABLE "DoudianStoreOrder" DROP COLUMN IF EXISTS "tenantId";
ALTER TABLE "DoudianStoreProduct" DROP COLUMN IF EXISTS "tenantId";
ALTER TABLE "DoudianStoreAftersale" DROP COLUMN IF EXISTS "tenantId";

-- 7. 删除旧索引（tenantId 相关）
DROP INDEX IF EXISTS "User_tenantId_idx";
DROP INDEX IF EXISTS "Account_tenantId_idx";
DROP INDEX IF EXISTS "Post_tenantId_idx";
DROP INDEX IF EXISTS "PostStats_tenantId_idx";
DROP INDEX IF EXISTS "DailyStats_tenantId_idx";
DROP INDEX IF EXISTS "Competitor_tenantId_idx";
DROP INDEX IF EXISTS "CompetitorSnapshot_tenantId_idx";
DROP INDEX IF EXISTS "AccountGroup_tenantId_idx";
DROP INDEX IF EXISTS "Asset_tenantId_idx";
DROP INDEX IF EXISTS "Notification_tenantId_idx";
DROP INDEX IF EXISTS "WechatStore_tenantId_idx";
DROP INDEX IF EXISTS "DoudianStore_tenantId_idx";
DROP INDEX IF EXISTS "PixingVideoTask_tenantId_idx";
DROP INDEX IF EXISTS "CalendarEvent_tenantId_idx";
DROP INDEX IF EXISTS "WechatStoreOrder_tenantId_idx";
DROP INDEX IF EXISTS "WechatStoreProduct_tenantId_idx";
DROP INDEX IF EXISTS "WechatStoreAftersale_tenantId_idx";
DROP INDEX IF EXISTS "DoudianStoreOrder_tenantId_idx";
DROP INDEX IF EXISTS "DoudianStoreProduct_tenantId_idx";
DROP INDEX IF EXISTS "DoudianStoreAftersale_tenantId_idx";
DROP INDEX IF EXISTS "Tenant_status_idx";

-- 8. 创建新索引（organizationId）
CREATE INDEX IF NOT EXISTS "User_organizationId_idx" ON "User"("organizationId");
CREATE INDEX IF NOT EXISTS "Account_organizationId_idx" ON "Account"("organizationId");
CREATE INDEX IF NOT EXISTS "Post_organizationId_idx" ON "Post"("organizationId");
CREATE INDEX IF NOT EXISTS "PostStats_organizationId_idx" ON "PostStats"("organizationId");
CREATE INDEX IF NOT EXISTS "DailyStats_organizationId_idx" ON "DailyStats"("organizationId");
CREATE INDEX IF NOT EXISTS "Competitor_organizationId_idx" ON "Competitor"("organizationId");
CREATE INDEX IF NOT EXISTS "CompetitorSnapshot_organizationId_idx" ON "CompetitorSnapshot"("organizationId");
CREATE INDEX IF NOT EXISTS "AccountGroup_organizationId_idx" ON "AccountGroup"("organizationId");
CREATE INDEX IF NOT EXISTS "Asset_organizationId_idx" ON "Asset"("organizationId");
CREATE INDEX IF NOT EXISTS "Notification_organizationId_idx" ON "Notification"("organizationId");
CREATE INDEX IF NOT EXISTS "WechatStore_organizationId_idx" ON "WechatStore"("organizationId");
CREATE INDEX IF NOT EXISTS "DoudianStore_organizationId_idx" ON "DoudianStore"("organizationId");
CREATE INDEX IF NOT EXISTS "PixingVideoTask_organizationId_idx" ON "PixingVideoTask"("organizationId");
CREATE INDEX IF NOT EXISTS "CalendarEvent_organizationId_idx" ON "CalendarEvent"("organizationId");

-- 9. 添加外键约束（organizationId → Organization.id）
ALTER TABLE "User" ADD CONSTRAINT "User_organizationId_fkey"
  FOREIGN KEY ("organizationId") REFERENCES "Organization"("id") ON DELETE SET NULL ON UPDATE CASCADE;
ALTER TABLE "Account" ADD CONSTRAINT "Account_organizationId_fkey"
  FOREIGN KEY ("organizationId") REFERENCES "Organization"("id") ON DELETE SET NULL ON UPDATE CASCADE;
ALTER TABLE "Post" ADD CONSTRAINT "Post_organizationId_fkey"
  FOREIGN KEY ("organizationId") REFERENCES "Organization"("id") ON DELETE SET NULL ON UPDATE CASCADE;
ALTER TABLE "PostStats" ADD CONSTRAINT "PostStats_organizationId_fkey"
  FOREIGN KEY ("organizationId") REFERENCES "Organization"("id") ON DELETE SET NULL ON UPDATE CASCADE;
ALTER TABLE "DailyStats" ADD CONSTRAINT "DailyStats_organizationId_fkey"
  FOREIGN KEY ("organizationId") REFERENCES "Organization"("id") ON DELETE SET NULL ON UPDATE CASCADE;
ALTER TABLE "Competitor" ADD CONSTRAINT "Competitor_organizationId_fkey"
  FOREIGN KEY ("organizationId") REFERENCES "Organization"("id") ON DELETE SET NULL ON UPDATE CASCADE;
ALTER TABLE "CompetitorSnapshot" ADD CONSTRAINT "CompetitorSnapshot_organizationId_fkey"
  FOREIGN KEY ("organizationId") REFERENCES "Organization"("id") ON DELETE SET NULL ON UPDATE CASCADE;
ALTER TABLE "AccountGroup" ADD CONSTRAINT "AccountGroup_organizationId_fkey"
  FOREIGN KEY ("organizationId") REFERENCES "Organization"("id") ON DELETE SET NULL ON UPDATE CASCADE;
ALTER TABLE "Asset" ADD CONSTRAINT "Asset_organizationId_fkey"
  FOREIGN KEY ("organizationId") REFERENCES "Organization"("id") ON DELETE SET NULL ON UPDATE CASCADE;
ALTER TABLE "Notification" ADD CONSTRAINT "Notification_organizationId_fkey"
  FOREIGN KEY ("organizationId") REFERENCES "Organization"("id") ON DELETE SET NULL ON UPDATE CASCADE;
ALTER TABLE "WechatStore" ADD CONSTRAINT "WechatStore_organizationId_fkey"
  FOREIGN KEY ("organizationId") REFERENCES "Organization"("id") ON DELETE SET NULL ON UPDATE CASCADE;
ALTER TABLE "DoudianStore" ADD CONSTRAINT "DoudianStore_organizationId_fkey"
  FOREIGN KEY ("organizationId") REFERENCES "Organization"("id") ON DELETE SET NULL ON UPDATE CASCADE;
ALTER TABLE "PixingVideoTask" ADD CONSTRAINT "PixingVideoTask_organizationId_fkey"
  FOREIGN KEY ("organizationId") REFERENCES "Organization"("id") ON DELETE SET NULL ON UPDATE CASCADE;
ALTER TABLE "CalendarEvent" ADD CONSTRAINT "CalendarEvent_organizationId_fkey"
  FOREIGN KEY ("organizationId") REFERENCES "Organization"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- 10. 删除 Tenant 表
DROP TABLE IF EXISTS "Tenant";
