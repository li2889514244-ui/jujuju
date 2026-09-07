-- MCP OAuth clients and token lifecycle.
-- Stores only hashed authorization codes, access tokens, refresh tokens, and client secrets.

CREATE TABLE "McpOAuthClient" (
    "id" TEXT NOT NULL,
    "clientId" TEXT NOT NULL,
    "clientSecretHash" TEXT,
    "redirectUris" JSONB NOT NULL,
    "clientName" TEXT,
    "grantTypes" JSONB NOT NULL,
    "responseTypes" JSONB NOT NULL,
    "tokenEndpointAuthMethod" TEXT NOT NULL DEFAULT 'none',
    "revokedAt" TIMESTAMP(3),
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "McpOAuthClient_pkey" PRIMARY KEY ("id")
);

CREATE TABLE "McpOAuthAuthorizationCode" (
    "id" TEXT NOT NULL,
    "codeHash" TEXT NOT NULL,
    "clientId" TEXT NOT NULL,
    "userId" TEXT NOT NULL,
    "organizationId" TEXT NOT NULL,
    "redirectUri" TEXT NOT NULL,
    "scope" TEXT NOT NULL,
    "resource" TEXT NOT NULL,
    "codeChallenge" TEXT NOT NULL,
    "codeChallengeMethod" TEXT NOT NULL,
    "expiresAt" TIMESTAMP(3) NOT NULL,
    "consumedAt" TIMESTAMP(3),
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "McpOAuthAuthorizationCode_pkey" PRIMARY KEY ("id")
);

CREATE TABLE "McpOAuthToken" (
    "id" TEXT NOT NULL,
    "accessTokenHash" TEXT NOT NULL,
    "refreshTokenHash" TEXT NOT NULL,
    "clientId" TEXT NOT NULL,
    "userId" TEXT NOT NULL,
    "organizationId" TEXT NOT NULL,
    "scope" TEXT NOT NULL,
    "resource" TEXT NOT NULL,
    "accessExpiresAt" TIMESTAMP(3) NOT NULL,
    "refreshExpiresAt" TIMESTAMP(3) NOT NULL,
    "revokedAt" TIMESTAMP(3),
    "replacedById" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "McpOAuthToken_pkey" PRIMARY KEY ("id")
);

CREATE UNIQUE INDEX "McpOAuthClient_clientId_key" ON "McpOAuthClient"("clientId");
CREATE INDEX "McpOAuthClient_clientId_idx" ON "McpOAuthClient"("clientId");
CREATE INDEX "McpOAuthClient_revokedAt_idx" ON "McpOAuthClient"("revokedAt");

CREATE UNIQUE INDEX "McpOAuthAuthorizationCode_codeHash_key" ON "McpOAuthAuthorizationCode"("codeHash");
CREATE INDEX "McpOAuthAuthorizationCode_clientId_idx" ON "McpOAuthAuthorizationCode"("clientId");
CREATE INDEX "McpOAuthAuthorizationCode_userId_idx" ON "McpOAuthAuthorizationCode"("userId");
CREATE INDEX "McpOAuthAuthorizationCode_organizationId_idx" ON "McpOAuthAuthorizationCode"("organizationId");
CREATE INDEX "McpOAuthAuthorizationCode_expiresAt_idx" ON "McpOAuthAuthorizationCode"("expiresAt");

CREATE UNIQUE INDEX "McpOAuthToken_accessTokenHash_key" ON "McpOAuthToken"("accessTokenHash");
CREATE UNIQUE INDEX "McpOAuthToken_refreshTokenHash_key" ON "McpOAuthToken"("refreshTokenHash");
CREATE INDEX "McpOAuthToken_clientId_idx" ON "McpOAuthToken"("clientId");
CREATE INDEX "McpOAuthToken_userId_idx" ON "McpOAuthToken"("userId");
CREATE INDEX "McpOAuthToken_organizationId_idx" ON "McpOAuthToken"("organizationId");
CREATE INDEX "McpOAuthToken_accessExpiresAt_idx" ON "McpOAuthToken"("accessExpiresAt");
CREATE INDEX "McpOAuthToken_refreshExpiresAt_idx" ON "McpOAuthToken"("refreshExpiresAt");
CREATE INDEX "McpOAuthToken_revokedAt_idx" ON "McpOAuthToken"("revokedAt");
