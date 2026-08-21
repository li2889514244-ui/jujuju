ALTER TABLE "User" ADD COLUMN IF NOT EXISTS "feishuOpenId" TEXT;
ALTER TABLE "User" ADD COLUMN IF NOT EXISTS "feishuUnionId" TEXT;
ALTER TABLE "User" ADD COLUMN IF NOT EXISTS "feishuTenantKey" TEXT;

CREATE UNIQUE INDEX IF NOT EXISTS "User_feishuOpenId_key" ON "User"("feishuOpenId");
CREATE UNIQUE INDEX IF NOT EXISTS "User_feishuUnionId_key" ON "User"("feishuUnionId");
CREATE INDEX IF NOT EXISTS "User_feishuTenantKey_idx" ON "User"("feishuTenantKey");
