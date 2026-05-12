-- Fix: Competitor table platform column uses TEXT but should use "Platform" enum
-- Also fix the unique index to include platform (matching schema @@unique([platform, platformUserId, userId]))

-- 1. Drop the incorrect unique index
DROP INDEX IF EXISTS "Competitor_platformUserId_userId_key";

-- 2. Recreate the column with correct enum type
ALTER TABLE "Competitor" 
  ALTER COLUMN "platform" TYPE "Platform" USING "platform"::"Platform";

-- 3. Add the correct unique index (includes platform)
CREATE UNIQUE INDEX IF NOT EXISTS "Competitor_platform_platformUserId_userId_key" 
  ON "Competitor"("platform", "platformUserId", "userId");

-- 4. Add platform index
CREATE INDEX IF NOT EXISTS "Competitor_platform_idx" ON "Competitor"("platform");

-- 5. Also fix the Notification type column
ALTER TABLE "Notification" 
  ALTER COLUMN "type" TYPE "NotificationType" USING "type"::"NotificationType";

-- 6. Also fix the Asset type column  
ALTER TABLE "Asset"
  ALTER COLUMN "type" TYPE "AssetType" USING "type"::"AssetType";
