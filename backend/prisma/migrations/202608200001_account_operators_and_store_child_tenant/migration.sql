-- Add account operator relation and tenant columns to store child tables.

DO $$
BEGIN
  IF NOT EXISTS (SELECT 1 FROM pg_type WHERE typname = 'AccountOperatorRole') THEN
    CREATE TYPE "AccountOperatorRole" AS ENUM ('PRIMARY', 'COLLABORATOR');
  END IF;
END
$$;

CREATE TABLE IF NOT EXISTS "AccountOperator" (
  "id" TEXT NOT NULL,
  "accountId" TEXT NOT NULL,
  "userId" TEXT NOT NULL,
  "role" "AccountOperatorRole" NOT NULL DEFAULT 'COLLABORATOR',
  "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "updatedAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  CONSTRAINT "AccountOperator_pkey" PRIMARY KEY ("id")
);

CREATE UNIQUE INDEX IF NOT EXISTS "AccountOperator_accountId_userId_key" ON "AccountOperator"("accountId", "userId");
CREATE INDEX IF NOT EXISTS "AccountOperator_accountId_idx" ON "AccountOperator"("accountId");
CREATE INDEX IF NOT EXISTS "AccountOperator_userId_idx" ON "AccountOperator"("userId");
CREATE INDEX IF NOT EXISTS "AccountOperator_accountId_role_idx" ON "AccountOperator"("accountId", "role");
CREATE UNIQUE INDEX IF NOT EXISTS "AccountOperator_one_primary_per_account_idx"
  ON "AccountOperator"("accountId") WHERE "role" = 'PRIMARY';

ALTER TABLE "AccountOperator" DROP CONSTRAINT IF EXISTS "AccountOperator_accountId_fkey";
ALTER TABLE "AccountOperator" ADD CONSTRAINT "AccountOperator_accountId_fkey"
  FOREIGN KEY ("accountId") REFERENCES "Account"("id") ON DELETE CASCADE ON UPDATE CASCADE;
ALTER TABLE "AccountOperator" DROP CONSTRAINT IF EXISTS "AccountOperator_userId_fkey";
ALTER TABLE "AccountOperator" ADD CONSTRAINT "AccountOperator_userId_fkey"
  FOREIGN KEY ("userId") REFERENCES "User"("id") ON DELETE CASCADE ON UPDATE CASCADE;

INSERT INTO "AccountOperator" ("id", "accountId", "userId", "role", "createdAt", "updatedAt")
SELECT
  'accop_' || md5(a."id" || ':' || a."userId"),
  a."id",
  a."userId",
  'PRIMARY'::"AccountOperatorRole",
  CURRENT_TIMESTAMP,
  CURRENT_TIMESTAMP
FROM "Account" a
WHERE a."userId" IS NOT NULL
ON CONFLICT ("accountId", "userId") DO NOTHING;

ALTER TABLE "WechatStoreOrder" ADD COLUMN IF NOT EXISTS "organizationId" TEXT;
ALTER TABLE "WechatStoreProduct" ADD COLUMN IF NOT EXISTS "organizationId" TEXT;
ALTER TABLE "WechatStoreAftersale" ADD COLUMN IF NOT EXISTS "organizationId" TEXT;
ALTER TABLE "DoudianStoreOrder" ADD COLUMN IF NOT EXISTS "organizationId" TEXT;
ALTER TABLE "DoudianStoreProduct" ADD COLUMN IF NOT EXISTS "organizationId" TEXT;
ALTER TABLE "DoudianStoreAftersale" ADD COLUMN IF NOT EXISTS "organizationId" TEXT;

UPDATE "WechatStoreOrder" child
SET "organizationId" = store."organizationId"
FROM "WechatStore" store
WHERE child."storeId" = store."id" AND child."organizationId" IS DISTINCT FROM store."organizationId";
UPDATE "WechatStoreProduct" child
SET "organizationId" = store."organizationId"
FROM "WechatStore" store
WHERE child."storeId" = store."id" AND child."organizationId" IS DISTINCT FROM store."organizationId";
UPDATE "WechatStoreAftersale" child
SET "organizationId" = store."organizationId"
FROM "WechatStore" store
WHERE child."storeId" = store."id" AND child."organizationId" IS DISTINCT FROM store."organizationId";
UPDATE "DoudianStoreOrder" child
SET "organizationId" = store."organizationId"
FROM "DoudianStore" store
WHERE child."storeId" = store."id" AND child."organizationId" IS DISTINCT FROM store."organizationId";
UPDATE "DoudianStoreProduct" child
SET "organizationId" = store."organizationId"
FROM "DoudianStore" store
WHERE child."storeId" = store."id" AND child."organizationId" IS DISTINCT FROM store."organizationId";
UPDATE "DoudianStoreAftersale" child
SET "organizationId" = store."organizationId"
FROM "DoudianStore" store
WHERE child."storeId" = store."id" AND child."organizationId" IS DISTINCT FROM store."organizationId";

CREATE INDEX IF NOT EXISTS "WechatStoreOrder_organizationId_idx" ON "WechatStoreOrder"("organizationId");
CREATE INDEX IF NOT EXISTS "WechatStoreOrder_organizationId_storeId_createTime_idx" ON "WechatStoreOrder"("organizationId", "storeId", "createTime");
CREATE INDEX IF NOT EXISTS "WechatStoreProduct_organizationId_idx" ON "WechatStoreProduct"("organizationId");
CREATE INDEX IF NOT EXISTS "WechatStoreProduct_organizationId_storeId_idx" ON "WechatStoreProduct"("organizationId", "storeId");
CREATE INDEX IF NOT EXISTS "WechatStoreAftersale_organizationId_idx" ON "WechatStoreAftersale"("organizationId");
CREATE INDEX IF NOT EXISTS "WechatStoreAftersale_organizationId_storeId_createTime_idx" ON "WechatStoreAftersale"("organizationId", "storeId", "createTime");
CREATE INDEX IF NOT EXISTS "DoudianStoreOrder_organizationId_idx" ON "DoudianStoreOrder"("organizationId");
CREATE INDEX IF NOT EXISTS "DoudianStoreOrder_organizationId_storeId_createTime_idx" ON "DoudianStoreOrder"("organizationId", "storeId", "createTime");
CREATE INDEX IF NOT EXISTS "DoudianStoreProduct_organizationId_idx" ON "DoudianStoreProduct"("organizationId");
CREATE INDEX IF NOT EXISTS "DoudianStoreProduct_organizationId_storeId_idx" ON "DoudianStoreProduct"("organizationId", "storeId");
CREATE INDEX IF NOT EXISTS "DoudianStoreAftersale_organizationId_idx" ON "DoudianStoreAftersale"("organizationId");
CREATE INDEX IF NOT EXISTS "DoudianStoreAftersale_organizationId_storeId_createTime_idx" ON "DoudianStoreAftersale"("organizationId", "storeId", "createTime");

ALTER TABLE "WechatStoreOrder" DROP CONSTRAINT IF EXISTS "WechatStoreOrder_organizationId_fkey";
ALTER TABLE "WechatStoreOrder" ADD CONSTRAINT "WechatStoreOrder_organizationId_fkey"
  FOREIGN KEY ("organizationId") REFERENCES "Organization"("id") ON DELETE SET NULL ON UPDATE CASCADE;
ALTER TABLE "WechatStoreProduct" DROP CONSTRAINT IF EXISTS "WechatStoreProduct_organizationId_fkey";
ALTER TABLE "WechatStoreProduct" ADD CONSTRAINT "WechatStoreProduct_organizationId_fkey"
  FOREIGN KEY ("organizationId") REFERENCES "Organization"("id") ON DELETE SET NULL ON UPDATE CASCADE;
ALTER TABLE "WechatStoreAftersale" DROP CONSTRAINT IF EXISTS "WechatStoreAftersale_organizationId_fkey";
ALTER TABLE "WechatStoreAftersale" ADD CONSTRAINT "WechatStoreAftersale_organizationId_fkey"
  FOREIGN KEY ("organizationId") REFERENCES "Organization"("id") ON DELETE SET NULL ON UPDATE CASCADE;
ALTER TABLE "DoudianStoreOrder" DROP CONSTRAINT IF EXISTS "DoudianStoreOrder_organizationId_fkey";
ALTER TABLE "DoudianStoreOrder" ADD CONSTRAINT "DoudianStoreOrder_organizationId_fkey"
  FOREIGN KEY ("organizationId") REFERENCES "Organization"("id") ON DELETE SET NULL ON UPDATE CASCADE;
ALTER TABLE "DoudianStoreProduct" DROP CONSTRAINT IF EXISTS "DoudianStoreProduct_organizationId_fkey";
ALTER TABLE "DoudianStoreProduct" ADD CONSTRAINT "DoudianStoreProduct_organizationId_fkey"
  FOREIGN KEY ("organizationId") REFERENCES "Organization"("id") ON DELETE SET NULL ON UPDATE CASCADE;
ALTER TABLE "DoudianStoreAftersale" DROP CONSTRAINT IF EXISTS "DoudianStoreAftersale_organizationId_fkey";
ALTER TABLE "DoudianStoreAftersale" ADD CONSTRAINT "DoudianStoreAftersale_organizationId_fkey"
  FOREIGN KEY ("organizationId") REFERENCES "Organization"("id") ON DELETE SET NULL ON UPDATE CASCADE;
