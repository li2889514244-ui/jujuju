-- Add missing tables
DO $$ BEGIN CREATE TYPE "NotificationType" AS ENUM ('ACCOUNT_EXPIRED','PUBLISH_FAILED','PUBLISH_SUCCESS','FOLLOWER_ALERT','SYSTEM'); EXCEPTION WHEN duplicate_object THEN null; END $$;
DO $$ BEGIN CREATE TYPE "AssetType" AS ENUM ('IMAGE','VIDEO','AUDIO','DOCUMENT'); EXCEPTION WHEN duplicate_object THEN null; END $$;

CREATE TABLE IF NOT EXISTS "Notification" ("id" TEXT NOT NULL PRIMARY KEY, "type" "NotificationType" NOT NULL, "title" TEXT NOT NULL, "content" TEXT, "read" BOOLEAN NOT NULL DEFAULT false, "metadata" JSONB, "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP, "userId" TEXT NOT NULL);
CREATE INDEX IF NOT EXISTS "Notification_userId_idx" ON "Notification"("userId");
CREATE INDEX IF NOT EXISTS "Notification_read_idx" ON "Notification"("read");
CREATE INDEX IF NOT EXISTS "Notification_createdAt_idx" ON "Notification"("createdAt");

CREATE TABLE IF NOT EXISTS "Competitor" ("id" TEXT NOT NULL PRIMARY KEY, "platform" "Platform" NOT NULL, "platformUserId" TEXT NOT NULL, "nickname" TEXT NOT NULL, "avatar" TEXT, "bio" TEXT, "followers" INTEGER NOT NULL DEFAULT 0, "following" INTEGER NOT NULL DEFAULT 0, "status" "AccountStatus" NOT NULL DEFAULT 'ACTIVE', "note" TEXT, "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP, "updatedAt" TIMESTAMP(3) NOT NULL, "userId" TEXT NOT NULL);
CREATE INDEX IF NOT EXISTS "Competitor_userId_idx" ON "Competitor"("userId");
CREATE INDEX IF NOT EXISTS "Competitor_platform_idx" ON "Competitor"("platform");
CREATE UNIQUE INDEX IF NOT EXISTS "Competitor_platform_platformUserId_userId_key" ON "Competitor"("platform","platformUserId","userId");

CREATE TABLE IF NOT EXISTS "CompetitorSnapshot" ("id" TEXT NOT NULL PRIMARY KEY, "date" DATE NOT NULL, "followers" INTEGER NOT NULL DEFAULT 0, "views" INTEGER NOT NULL DEFAULT 0, "likes" INTEGER NOT NULL DEFAULT 0, "comments" INTEGER NOT NULL DEFAULT 0, "posts" INTEGER NOT NULL DEFAULT 0, "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP, "competitorId" TEXT NOT NULL REFERENCES "Competitor"("id") ON DELETE CASCADE);
CREATE INDEX IF NOT EXISTS "CompetitorSnapshot_competitorId_idx" ON "CompetitorSnapshot"("competitorId");
CREATE INDEX IF NOT EXISTS "CompetitorSnapshot_date_idx" ON "CompetitorSnapshot"("date");
CREATE UNIQUE INDEX IF NOT EXISTS "CompetitorSnapshot_competitorId_date_key" ON "CompetitorSnapshot"("competitorId","date");

CREATE TABLE IF NOT EXISTS "AccountGroup" ("id" TEXT NOT NULL PRIMARY KEY, "name" TEXT NOT NULL, "color" TEXT NOT NULL DEFAULT '#409EFF', "sortOrder" INTEGER NOT NULL DEFAULT 0, "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP, "updatedAt" TIMESTAMP(3) NOT NULL, "userId" TEXT NOT NULL);
CREATE INDEX IF NOT EXISTS "AccountGroup_userId_idx" ON "AccountGroup"("userId");

CREATE TABLE IF NOT EXISTS "Asset" ("id" TEXT NOT NULL PRIMARY KEY, "name" TEXT NOT NULL, "type" "AssetType" NOT NULL, "url" TEXT NOT NULL, "size" INTEGER NOT NULL DEFAULT 0, "width" INTEGER, "height" INTEGER, "duration" INTEGER, "mimeType" TEXT, "tags" TEXT[], "folderId" TEXT, "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP, "updatedAt" TIMESTAMP(3) NOT NULL, "userId" TEXT NOT NULL);
CREATE INDEX IF NOT EXISTS "Asset_userId_idx" ON "Asset"("userId");
CREATE INDEX IF NOT EXISTS "Asset_type_idx" ON "Asset"("type");
CREATE INDEX IF NOT EXISTS "Asset_folderId_idx" ON "Asset"("folderId");
