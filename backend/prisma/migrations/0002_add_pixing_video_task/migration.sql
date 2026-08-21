-- CreateTable
CREATE TABLE "PixingVideoTask" (
    "id" TEXT NOT NULL,
    "userId" TEXT NOT NULL,
    "teacher" TEXT NOT NULL,
    "text" TEXT NOT NULL,
    "status" TEXT NOT NULL DEFAULT 'pending',
    "videoUrl" TEXT,
    "srtContent" TEXT,
    "error" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "PixingVideoTask_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE INDEX "PixingVideoTask_userId_idx" ON "PixingVideoTask"("userId");

-- CreateIndex
CREATE INDEX "PixingVideoTask_status_idx" ON "PixingVideoTask"("status");

-- CreateIndex
CREATE INDEX "PixingVideoTask_createdAt_idx" ON "PixingVideoTask"("createdAt");
