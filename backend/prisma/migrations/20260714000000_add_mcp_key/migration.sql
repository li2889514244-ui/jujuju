-- Create McpKey table for database-managed MCP API keys
CREATE TABLE "McpKey" (
    "id"        TEXT   NOT NULL,
    "clientId"  TEXT   NOT NULL,
    "token"     TEXT   NOT NULL,
    "createdBy" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "McpKey_pkey" PRIMARY KEY ("id")
);

-- Create unique constraints
CREATE UNIQUE INDEX "McpKey_clientId_key" ON "McpKey"("clientId");
CREATE UNIQUE INDEX "McpKey_token_key" ON "McpKey"("token");

-- Create indexes for fast lookups
CREATE INDEX "McpKey_clientId_idx" ON "McpKey"("clientId");
CREATE INDEX "McpKey_token_idx" ON "McpKey"("token");
