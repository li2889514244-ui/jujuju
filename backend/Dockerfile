# ---- Build Stage ----
FROM node:20-slim AS builder

WORKDIR /build

RUN apt-get update && apt-get install -y python3 make g++ openssl && rm -rf /var/lib/apt/lists/*

ENV HUSKY=0 CI=true

COPY package.json package-lock.json* ./
COPY prisma ./prisma

RUN npm install --ignore-scripts
RUN npx prisma generate

COPY . .
RUN npm run build

# ---- Production Stage ----
FROM mcr.microsoft.com/playwright:v1.44.0-jammy AS production

# Playwright 镜像自带 Chromium + 所有系统依赖
# 基于 Ubuntu 22.04 (jammy)

RUN apt-get update && apt-get install -y curl tini && rm -rf /var/lib/apt/lists/*

RUN groupadd -g 1001 matrixflow \
    && useradd -u 1001 -g matrixflow -m matrixflow

WORKDIR /app

COPY --from=builder --chown=matrixflow:matrixflow /build/package.json ./
COPY --from=builder --chown=matrixflow:matrixflow /build/prisma ./prisma
COPY --from=builder --chown=matrixflow:matrixflow /build/dist ./dist

RUN npm install --omit=dev --ignore-scripts
RUN npx prisma generate

# 跳过 Playwright 浏览器下载（镜像已自带）
ENV PLAYWRIGHT_SKIP_BROWSER_DOWNLOAD=1

RUN mkdir -p /app/logs /app/uploads /tmp && chown -R matrixflow:matrixflow /app/logs /app/uploads /tmp

USER matrixflow

ENV NODE_ENV=production PORT=3000 HUSKY=0

EXPOSE 3000

ENTRYPOINT ["tini", "--"]
CMD ["sh", "-c", "npx prisma migrate deploy && node dist/main.js"]
