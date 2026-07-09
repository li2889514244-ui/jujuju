-- 创建默认租户
INSERT INTO "Tenant" ("id", "name", "status", "maxAccounts", "maxUsers", "createdAt", "updatedAt")
VALUES ('default-tenant', '默认租户', 'ACTIVE', 999, 999, NOW(), NOW())
ON CONFLICT DO NOTHING;

-- 将所有现有用户分配到默认租户（仅对 tenantId 为空的记录）
UPDATE "User" SET "tenantId" = 'default-tenant' WHERE "tenantId" IS NULL;

-- 将所有现有业务数据分配到默认租户
UPDATE "Account"              SET "tenantId" = 'default-tenant' WHERE "tenantId" IS NULL;
UPDATE "Post"                 SET "tenantId" = 'default-tenant' WHERE "tenantId" IS NULL;
UPDATE "PostStats"            SET "tenantId" = 'default-tenant' WHERE "tenantId" IS NULL;
UPDATE "DailyStats"           SET "tenantId" = 'default-tenant' WHERE "tenantId" IS NULL;
UPDATE "Competitor"           SET "tenantId" = 'default-tenant' WHERE "tenantId" IS NULL;
UPDATE "CompetitorSnapshot"   SET "tenantId" = 'default-tenant' WHERE "tenantId" IS NULL;
UPDATE "AccountGroup"         SET "tenantId" = 'default-tenant' WHERE "tenantId" IS NULL;
UPDATE "Asset"                SET "tenantId" = 'default-tenant' WHERE "tenantId" IS NULL;
UPDATE "Notification"         SET "tenantId" = 'default-tenant' WHERE "tenantId" IS NULL;
UPDATE "PixingVideoTask"      SET "tenantId" = 'default-tenant' WHERE "tenantId" IS NULL;
UPDATE "CalendarEvent"        SET "tenantId" = 'default-tenant' WHERE "tenantId" IS NULL;
UPDATE "WechatStore"          SET "tenantId" = 'default-tenant' WHERE "tenantId" IS NULL;
UPDATE "WechatStoreOrder"     SET "tenantId" = 'default-tenant' WHERE "tenantId" IS NULL;
UPDATE "WechatStoreProduct"   SET "tenantId" = 'default-tenant' WHERE "tenantId" IS NULL;
UPDATE "WechatStoreAftersale" SET "tenantId" = 'default-tenant' WHERE "tenantId" IS NULL;
UPDATE "DoudianStore"         SET "tenantId" = 'default-tenant' WHERE "tenantId" IS NULL;
UPDATE "DoudianStoreOrder"    SET "tenantId" = 'default-tenant' WHERE "tenantId" IS NULL;
UPDATE "DoudianStoreProduct"  SET "tenantId" = 'default-tenant' WHERE "tenantId" IS NULL;
UPDATE "DoudianStoreAftersale" SET "tenantId" = 'default-tenant' WHERE "tenantId" IS NULL;
