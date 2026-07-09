-- Create Tenant table
CREATE TABLE "Tenant" (
    "id" TEXT NOT NULL,
    "name" TEXT NOT NULL,
    "status" TEXT NOT NULL DEFAULT 'ACTIVE',
    "maxAccounts" INTEGER NOT NULL DEFAULT 20,
    "maxUsers" INTEGER NOT NULL DEFAULT 10,
    "expiresAt" TIMESTAMP(3),
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "Tenant_pkey" PRIMARY KEY ("id")
);

-- Create index on Tenant.status
CREATE INDEX "Tenant_status_idx" ON "Tenant"("status");

-- Add SUPER_ADMIN to UserRole enum
ALTER TYPE "UserRole" ADD VALUE IF NOT EXISTS 'SUPER_ADMIN';

-- Add tenantId to User
ALTER TABLE "User" ADD COLUMN "tenantId" TEXT;
CREATE INDEX "User_tenantId_idx" ON "User"("tenantId");
ALTER TABLE "User" ADD CONSTRAINT "User_tenantId_fkey" FOREIGN KEY ("tenantId") REFERENCES "Tenant"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- Add tenantId to Account
ALTER TABLE "Account" ADD COLUMN "tenantId" TEXT;
CREATE INDEX "Account_tenantId_idx" ON "Account"("tenantId");

-- Add tenantId to Post
ALTER TABLE "Post" ADD COLUMN "tenantId" TEXT;
CREATE INDEX "Post_tenantId_idx" ON "Post"("tenantId");

-- Add tenantId to DailyStats
ALTER TABLE "DailyStats" ADD COLUMN "tenantId" TEXT;
CREATE INDEX "DailyStats_tenantId_idx" ON "DailyStats"("tenantId");

-- Add tenantId to Competitor
ALTER TABLE "Competitor" ADD COLUMN "tenantId" TEXT;
CREATE INDEX "Competitor_tenantId_idx" ON "Competitor"("tenantId");

-- Add tenantId to AccountGroup
ALTER TABLE "AccountGroup" ADD COLUMN "tenantId" TEXT;
CREATE INDEX "AccountGroup_tenantId_idx" ON "AccountGroup"("tenantId");

-- Add tenantId to Asset
ALTER TABLE "Asset" ADD COLUMN "tenantId" TEXT;
CREATE INDEX "Asset_tenantId_idx" ON "Asset"("tenantId");

-- Add tenantId to Notification
ALTER TABLE "Notification" ADD COLUMN "tenantId" TEXT;
CREATE INDEX "Notification_tenantId_idx" ON "Notification"("tenantId");

-- Add tenantId to PixingVideoTask
ALTER TABLE "PixingVideoTask" ADD COLUMN "tenantId" TEXT;
CREATE INDEX "PixingVideoTask_tenantId_idx" ON "PixingVideoTask"("tenantId");

-- Add tenantId to CalendarEvent
ALTER TABLE "CalendarEvent" ADD COLUMN "tenantId" TEXT;
CREATE INDEX "CalendarEvent_tenantId_idx" ON "CalendarEvent"("tenantId");

-- Add tenantId to WechatStore
ALTER TABLE "WechatStore" ADD COLUMN "tenantId" TEXT;
CREATE INDEX "WechatStore_tenantId_idx" ON "WechatStore"("tenantId");

-- Add tenantId to DoudianStore
ALTER TABLE "DoudianStore" ADD COLUMN "tenantId" TEXT;
CREATE INDEX "DoudianStore_tenantId_idx" ON "DoudianStore"("tenantId");

-- Add tenantId to WechatStoreOrder
ALTER TABLE "WechatStoreOrder" ADD COLUMN "tenantId" TEXT;
CREATE INDEX "WechatStoreOrder_tenantId_idx" ON "WechatStoreOrder"("tenantId");

-- Add tenantId to WechatStoreProduct
ALTER TABLE "WechatStoreProduct" ADD COLUMN "tenantId" TEXT;
CREATE INDEX "WechatStoreProduct_tenantId_idx" ON "WechatStoreProduct"("tenantId");

-- Add tenantId to WechatStoreAftersale
ALTER TABLE "WechatStoreAftersale" ADD COLUMN "tenantId" TEXT;
CREATE INDEX "WechatStoreAftersale_tenantId_idx" ON "WechatStoreAftersale"("tenantId");

-- Add tenantId to DoudianStoreOrder
ALTER TABLE "DoudianStoreOrder" ADD COLUMN "tenantId" TEXT;
CREATE INDEX "DoudianStoreOrder_tenantId_idx" ON "DoudianStoreOrder"("tenantId");

-- Add tenantId to DoudianStoreProduct
ALTER TABLE "DoudianStoreProduct" ADD COLUMN "tenantId" TEXT;
CREATE INDEX "DoudianStoreProduct_tenantId_idx" ON "DoudianStoreProduct"("tenantId");

-- Add tenantId to DoudianStoreAftersale
ALTER TABLE "DoudianStoreAftersale" ADD COLUMN "tenantId" TEXT;
CREATE INDEX "DoudianStoreAftersale_tenantId_idx" ON "DoudianStoreAftersale"("tenantId");

-- Add tenantId to CompetitorSnapshot
ALTER TABLE "CompetitorSnapshot" ADD COLUMN "tenantId" TEXT;
CREATE INDEX "CompetitorSnapshot_tenantId_idx" ON "CompetitorSnapshot"("tenantId");

-- Add tenantId to PostStats
ALTER TABLE "PostStats" ADD COLUMN "tenantId" TEXT;
CREATE INDEX "PostStats_tenantId_idx" ON "PostStats"("tenantId");
