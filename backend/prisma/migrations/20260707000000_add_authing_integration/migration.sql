-- Add Authing integration fields to User table
-- Add authingUserId for Authing third-party login (WeChat/phone)
-- Make email and password optional to support users who register via Authing

ALTER TABLE "User" ALTER COLUMN "email" DROP NOT NULL;
ALTER TABLE "User" ALTER COLUMN "password" DROP NOT NULL;

-- Add authingUserId field
ALTER TABLE "User" ADD COLUMN "authingUserId" TEXT;

-- Create unique index for authingUserId
CREATE UNIQUE INDEX "User_authingUserId_key" ON "User"("authingUserId");
