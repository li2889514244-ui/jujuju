-- CreateTable
CREATE TABLE "DoudianStore" (
    "id" TEXT NOT NULL,
    "name" TEXT NOT NULL,
    "profilePath" TEXT NOT NULL,
    "status" "AccountStatus" NOT NULL DEFAULT 'ACTIVE',
    "lastSyncedAt" TIMESTAMP(3),
    "syncStatus" TEXT NOT NULL DEFAULT 'pending',
    "syncError" TEXT,
    "sessionStatus" TEXT NOT NULL DEFAULT 'unknown',
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "DoudianStore_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "DoudianStoreOrder" (
    "id" TEXT NOT NULL,
    "storeId" TEXT NOT NULL,
    "orderId" TEXT NOT NULL,
    "status" INTEGER NOT NULL DEFAULT 0,
    "payAmount" INTEGER NOT NULL DEFAULT 0,
    "postAmount" INTEGER NOT NULL DEFAULT 0,
    "productCount" INTEGER NOT NULL DEFAULT 0,
    "createTime" INTEGER NOT NULL DEFAULT 0,
    "updateTime" INTEGER NOT NULL DEFAULT 0,
    "productTitle" TEXT NOT NULL DEFAULT '',
    "productImg" TEXT NOT NULL DEFAULT '',
    "raw" JSONB NOT NULL,
    "syncedAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "DoudianStoreOrder_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "DoudianStoreProduct" (
    "id" TEXT NOT NULL,
    "storeId" TEXT NOT NULL,
    "productId" TEXT NOT NULL,
    "title" TEXT NOT NULL DEFAULT '',
    "imgUrl" TEXT NOT NULL DEFAULT '',
    "minPrice" INTEGER NOT NULL DEFAULT 0,
    "maxPrice" INTEGER NOT NULL DEFAULT 0,
    "sales" INTEGER NOT NULL DEFAULT 0,
    "stock" INTEGER NOT NULL DEFAULT 0,
    "status" INTEGER NOT NULL DEFAULT 0,
    "raw" JSONB NOT NULL,
    "syncedAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "DoudianStoreProduct_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "DoudianStoreAftersale" (
    "id" TEXT NOT NULL,
    "storeId" TEXT NOT NULL,
    "afterSaleId" TEXT NOT NULL,
    "orderId" TEXT NOT NULL DEFAULT '',
    "type" INTEGER NOT NULL DEFAULT 0,
    "status" INTEGER NOT NULL DEFAULT 0,
    "amount" INTEGER NOT NULL DEFAULT 0,
    "product" TEXT NOT NULL DEFAULT '',
    "productId" TEXT,
    "createTime" INTEGER NOT NULL DEFAULT 0,
    "updateTime" INTEGER NOT NULL DEFAULT 0,
    "raw" JSONB NOT NULL,
    "syncedAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "DoudianStoreAftersale_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE UNIQUE INDEX "DoudianStore_profilePath_key" ON "DoudianStore"("profilePath");

-- CreateIndex
CREATE UNIQUE INDEX "DoudianStoreOrder_storeId_orderId_key" ON "DoudianStoreOrder"("storeId", "orderId");

-- CreateIndex
CREATE INDEX "DoudianStoreOrder_storeId_createTime_idx" ON "DoudianStoreOrder"("storeId", "createTime");

-- CreateIndex
CREATE INDEX "DoudianStoreOrder_storeId_status_idx" ON "DoudianStoreOrder"("storeId", "status");

-- CreateIndex
CREATE INDEX "DoudianStoreOrder_syncedAt_idx" ON "DoudianStoreOrder"("syncedAt");

-- CreateIndex
CREATE UNIQUE INDEX "DoudianStoreProduct_storeId_productId_key" ON "DoudianStoreProduct"("storeId", "productId");

-- CreateIndex
CREATE INDEX "DoudianStoreProduct_storeId_status_idx" ON "DoudianStoreProduct"("storeId", "status");

-- CreateIndex
CREATE INDEX "DoudianStoreProduct_syncedAt_idx" ON "DoudianStoreProduct"("syncedAt");

-- CreateIndex
CREATE UNIQUE INDEX "DoudianStoreAftersale_storeId_afterSaleId_key" ON "DoudianStoreAftersale"("storeId", "afterSaleId");

-- CreateIndex
CREATE INDEX "DoudianStoreAftersale_storeId_createTime_idx" ON "DoudianStoreAftersale"("storeId", "createTime");

-- CreateIndex
CREATE INDEX "DoudianStoreAftersale_storeId_status_idx" ON "DoudianStoreAftersale"("storeId", "status");

-- CreateIndex
CREATE INDEX "DoudianStoreAftersale_syncedAt_idx" ON "DoudianStoreAftersale"("syncedAt");

-- AddForeignKey
ALTER TABLE "DoudianStoreOrder" ADD CONSTRAINT "DoudianStoreOrder_storeId_fkey" FOREIGN KEY ("storeId") REFERENCES "DoudianStore"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "DoudianStoreProduct" ADD CONSTRAINT "DoudianStoreProduct_storeId_fkey" FOREIGN KEY ("storeId") REFERENCES "DoudianStore"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "DoudianStoreAftersale" ADD CONSTRAINT "DoudianStoreAftersale_storeId_fkey" FOREIGN KEY ("storeId") REFERENCES "DoudianStore"("id") ON DELETE CASCADE ON UPDATE CASCADE;
