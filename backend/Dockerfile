FROM node:20-alpine AS builder

WORKDIR /app

# 安装构建依赖
RUN apk add --no-cache python3 make g++

# 先复制根目录的 package 文件（monorepo）
COPY package.json package-lock.json ./
COPY backend/package.json ./backend/

# 安装依赖（只装 backend workspace）
RUN npm install --workspace=backend

# 复制 backend 源码
COPY backend/ ./backend/

# 生成 Prisma Client 并构建
WORKDIR /app/backend
RUN npx prisma generate
RUN npm run build

# 裁剪 devDependencies
RUN npm prune --omit=dev

# ---- Production Stage ----
FROM node:20-alpine AS production

RUN apk add --no-cache curl tini && rm -rf /var/cache/apk/*

RUN addgroup -g 1001 -S matrixflow \
    && adduser -S matrixflow -u 1001 -G matrixflow

WORKDIR /app

COPY --from=builder --chown=matrixflow:matrixflow /app/backend/dist ./dist
COPY --from=builder --chown=matrixflow:matrixflow /app/backend/node_modules ./node_modules
COPY --from=builder --chown=matrixflow:matrixflow /app/backend/package.json ./
COPY --from=builder --chown=matrixflow:matrixflow /app/backend/prisma ./prisma

RUN mkdir -p /app/logs /app/uploads && chown -R matrixflow:matrixflow /app/logs /app/uploads

USER matrixflow

ENV NODE_ENV=production PORT=3000

EXPOSE 3000

HEALTHCHECK --interval=30s --timeout=10s --start-period=30s --retries=3 \
    CMD curl -f http://localhost:3000/api/v1/health || exit 1

ENTRYPOINT ["/sbin/tini", "--"]
CMD ["sh", "-c", "npx prisma migrate deploy && node dist/main.js"]
