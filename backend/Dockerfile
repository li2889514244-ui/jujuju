FROM node:20-alpine AS builder

WORKDIR /build

# 安装构建依赖
RUN apk add --no-cache python3 make g++

# 复制整个项目（monorepo 需要根目录的 package-lock.json）
COPY . .

# 安装 backend workspace 的依赖
RUN npm install --workspace=backend

# 生成 Prisma Client 并构建
WORKDIR /build/backend
RUN npx prisma generate
RUN npm run build

# 裁剪 devDependencies
WORKDIR /build
RUN npm prune --omit=dev --workspace=backend

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

ENV NODE_ENV=production PORT=3000

EXPOSE 3000

HEALTHCHECK --interval=30s --timeout=10s --start-period=30s --retries=3 \
    CMD curl -f http://localhost:3000/api/v1/health || exit 1

ENTRYPOINT ["/sbin/tini", "--"]
CMD ["sh", "-c", "npx prisma migrate deploy && node dist/main.js"]
