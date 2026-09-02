-- Add organization-scoped settings table (refresh loading image etc).

CREATE TABLE IF NOT EXISTS "OrganizationSetting" (
  "id" TEXT NOT NULL,
  "organizationId" TEXT NOT NULL,
  "key" TEXT NOT NULL,
  "value" TEXT NOT NULL,
  "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "updatedAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  CONSTRAINT "OrganizationSetting_pkey" PRIMARY KEY ("id")
);

CREATE UNIQUE INDEX IF NOT EXISTS "OrganizationSetting_organizationId_key_key" ON "OrganizationSetting"("organizationId", "key");
CREATE INDEX IF NOT EXISTS "OrganizationSetting_organizationId_idx" ON "OrganizationSetting"("organizationId");

ALTER TABLE "OrganizationSetting" DROP CONSTRAINT IF EXISTS "OrganizationSetting_organizationId_fkey";
ALTER TABLE "OrganizationSetting" ADD CONSTRAINT "OrganizationSetting_organizationId_fkey"
  FOREIGN KEY ("organizationId") REFERENCES "Organization"("id") ON DELETE CASCADE ON UPDATE CASCADE;
