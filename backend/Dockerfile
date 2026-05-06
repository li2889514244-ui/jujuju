FROM node:20-alpine AS builder

WORKDIR /build

# 安装构建依赖
RUN apk add --no-cache python3 make g++

# 复制根 package.json 和 pnpm 配置（monorepo）
COPY package.json pnpm-workspace.yaml pnpm-lock.yaml ./

# 复制 backend workspace 的 package.json 和 prisma
COPY backend/package.json ./backend/
COPY backend/prisma ./backend/prisma

# 安装 pnpm 并安装依赖（仅 backend workspace）
ENV HUSKY=0
RUN corepack enable && pnpm install --frozen-lockfile --filter matrixflow-backend

# 复制 backend 源码
COPY backend/ ./backend/

# 生成 Prisma Client 并构建
WORKDIR /build/backend
RUN npx prisma generate
RUN pnpm build

# 裁剪 devDependencies
RUN pnpm prune --prod

# ---- Production Stage ----
FROM node:20-alpine AS production

RUN apk add --no-cache curl tini && rm -rf /var/cache/apk/*

RUN addgroup -g 1001 -S matrixflow \
    && adduser -S matrixflow -u 1001 -G matrixflow

WORKDIR /app

# 从 builder 复制构建产物
COPY --from=builder --chown=matrixflow:matrixflow /build/backend/dist ./dist
COPY --from=builder --chown=matrixflow:matrixflow /build/backend/node_modules ./node_modules
COPY --from=builder --chown=matrixflow:matrixflow /build/backend/package.json ./
COPY --from=builder --chown=matrixflow:matrixflow /build/backend/prisma ./prisma

RUN mkdir -p /app/logs /app/uploads && chown -R matrixflow:matrixflow /app/logs /app/uploads

USER matrixflow

ENV NODE_ENV=production PORT=3000 HUSKY=0

EXPOSE 3000

HEALTHCHECK --interval=30s --timeout=10s --start-period=30s --retries=3 \
    CMD curl -f http://localhost:3000/api/health || exit 1

ENTRYPOINT ["/sbin/tini", "--"]
CMD ["sh", "-c", "npx prisma migrate deploy && node dist/main.js"]
