# ---- Build Stage ----
FROM node:20-alpine AS builder

WORKDIR /build

# 安装构建依赖 + OpenSSL（Prisma Alpine 兼容性）
RUN apk add --no-cache python3 make g++ openssl libc6-compat

# 复制根 package.json 和 pnpm 配置（monorepo）
COPY package.json pnpm-workspace.yaml pnpm-lock.yaml ./

# 复制 backend workspace 的 package.json 和 prisma
COPY backend/package.json ./backend/
COPY backend/prisma ./backend/prisma

# 安装 pnpm（不依赖 corepack，更稳定）
ENV HUSKY=0
ENV CI=true
RUN npm install -g pnpm@9

# 安装全部依赖（--ignore-scripts 避免 husky 等钩子干扰）
RUN pnpm install --frozen-lockfile --filter matrixflow-backend --ignore-scripts

# 复制 backend 源码
COPY backend/ ./backend/

# 生成 Prisma Client 并构建
WORKDIR /build/backend
RUN ./node_modules/.bin/prisma generate
RUN ./node_modules/.bin/nest build

# ---- Production Stage ----
FROM node:20-alpine AS production

RUN apk add --no-cache curl tini openssl libc6-compat && rm -rf /var/cache/apk/*

RUN addgroup -g 1001 -S matrixflow \
    && adduser -S matrixflow -u 1001 -G matrixflow

WORKDIR /app

# 复制构建产物
COPY --from=builder --chown=matrixflow:matrixflow /build/backend/dist ./dist
COPY --from=builder --chown=matrixflow:matrixflow /build/backend/package.json ./
COPY --from=builder --chown=matrixflow:matrixflow /build/backend/prisma ./prisma

# 用 npm 安装生产依赖（npm 的扁平 node_modules 没有符号链接问题）
RUN npm install --omit=dev --ignore-scripts

RUN mkdir -p /app/logs /app/uploads && chown -R matrixflow:matrixflow /app/logs /app/uploads

USER matrixflow

ENV NODE_ENV=production PORT=3000 HUSKY=0

EXPOSE 3000

HEALTHCHECK --interval=30s --timeout=10s --start-period=30s --retries=3 \
    CMD curl -f http://localhost:${PORT:-3000}/api/v1/health || exit 1

ENTRYPOINT ["/sbin/tini", "--"]
CMD ["sh", "-c", "npx prisma migrate deploy && node dist/main.js"]
