ALTER TABLE "WechatStore"
ADD COLUMN "lastSyncedAt" TIMESTAMP(3),
ADD COLUMN "syncStatus" TEXT NOT NULL DEFAULT 'pending',
ADD COLUMN "syncError" TEXT;

CREATE TABLE "WechatStoreOrder" (
    "id" TEXT NOT NULL,
    "storeId" TEXT NOT NULL,
    "orderId" TEXT NOT NULL,
    "productId" TEXT,
    "skuId" TEXT,
    "status" INTEGER NOT NULL DEFAULT 0,
    "payAmount" INTEGER NOT NULL DEFAULT 0,
    "createTime" INTEGER NOT NULL DEFAULT 0,
    "settleTime" INTEGER NOT NULL DEFAULT 0,
    "productTitle" TEXT NOT NULL DEFAULT '',
    "productImg" TEXT NOT NULL DEFAULT '',
    "shipTime" INTEGER NOT NULL DEFAULT 0,
    "deliveryList" JSONB,
    "raw" JSONB NOT NULL,
    "syncedAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "WechatStoreOrder_pkey" PRIMARY KEY ("id")
);

CREATE TABLE "WechatStoreProduct" (
    "id" TEXT NOT NULL,
    "storeId" TEXT NOT NULL,
    "productId" TEXT NOT NULL,
    "title" TEXT NOT NULL DEFAULT '',
    "imgUrl" TEXT NOT NULL DEFAULT '',
    "sellingPrice" INTEGER NOT NULL DEFAULT 0,
    "sales" INTEGER NOT NULL DEFAULT 0,
    "stock" INTEGER NOT NULL DEFAULT 0,
    "status" INTEGER NOT NULL DEFAULT 0,
    "raw" JSONB NOT NULL,
    "syncedAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "WechatStoreProduct_pkey" PRIMARY KEY ("id")
);

CREATE TABLE "WechatStoreAftersale" (
    "id" TEXT NOT NULL,
    "storeId" TEXT NOT NULL,
    "afterSaleOrderId" TEXT NOT NULL,
    "type" TEXT NOT NULL DEFAULT '',
    "status" TEXT NOT NULL DEFAULT '',
    "amount" INTEGER NOT NULL DEFAULT 0,
    "reason" TEXT NOT NULL DEFAULT '',
    "product" TEXT NOT NULL DEFAULT '',
    "productId" TEXT,
    "completeTime" INTEGER NOT NULL DEFAULT 0,
    "createTime" INTEGER NOT NULL DEFAULT 0,
    "raw" JSONB NOT NULL,
    "syncedAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "WechatStoreAftersale_pkey" PRIMARY KEY ("id")
);

CREATE UNIQUE INDEX "WechatStoreOrder_storeId_orderId_key" ON "WechatStoreOrder"("storeId", "orderId");
CREATE INDEX "WechatStoreOrder_storeId_createTime_idx" ON "WechatStoreOrder"("storeId", "createTime");
CREATE INDEX "WechatStoreOrder_storeId_status_idx" ON "WechatStoreOrder"("storeId", "status");
CREATE INDEX "WechatStoreOrder_syncedAt_idx" ON "WechatStoreOrder"("syncedAt");

CREATE UNIQUE INDEX "WechatStoreProduct_storeId_productId_key" ON "WechatStoreProduct"("storeId", "productId");
CREATE INDEX "WechatStoreProduct_storeId_status_idx" ON "WechatStoreProduct"("storeId", "status");
CREATE INDEX "WechatStoreProduct_syncedAt_idx" ON "WechatStoreProduct"("syncedAt");

CREATE UNIQUE INDEX "WechatStoreAftersale_storeId_afterSaleOrderId_key" ON "WechatStoreAftersale"("storeId", "afterSaleOrderId");
CREATE INDEX "WechatStoreAftersale_storeId_createTime_idx" ON "WechatStoreAftersale"("storeId", "createTime");
CREATE INDEX "WechatStoreAftersale_storeId_status_idx" ON "WechatStoreAftersale"("storeId", "status");
CREATE INDEX "WechatStoreAftersale_syncedAt_idx" ON "WechatStoreAftersale"("syncedAt");

ALTER TABLE "WechatStoreOrder" ADD CONSTRAINT "WechatStoreOrder_storeId_fkey" FOREIGN KEY ("storeId") REFERENCES "WechatStore"("id") ON DELETE CASCADE ON UPDATE CASCADE;
ALTER TABLE "WechatStoreProduct" ADD CONSTRAINT "WechatStoreProduct_storeId_fkey" FOREIGN KEY ("storeId") REFERENCES "WechatStore"("id") ON DELETE CASCADE ON UPDATE CASCADE;
ALTER TABLE "WechatStoreAftersale" ADD CONSTRAINT "WechatStoreAftersale_storeId_fkey" FOREIGN KEY ("storeId") REFERENCES "WechatStore"("id") ON DELETE CASCADE ON UPDATE CASCADE;
