# ---- Build Stage ----
FROM node:20-alpine AS builder

WORKDIR /build

RUN apk add --no-cache python3 make g++ openssl libc6-compat

ENV HUSKY=0 CI=true

COPY package.json package-lock.json* ./
COPY prisma ./prisma

RUN npm install --ignore-scripts
RUN npx prisma generate

COPY . .
RUN npm run build

# ---- Production Stage ----
FROM node:20-alpine AS production

RUN apk add --no-cache curl tini openssl libc6-compat && rm -rf /var/cache/apk/*

RUN addgroup -g 1001 -S matrixflow \
    && adduser -S matrixflow -u 1001 -G matrixflow

WORKDIR /app

COPY --from=builder --chown=matrixflow:matrixflow /build/package.json ./
COPY --from=builder --chown=matrixflow:matrixflow /build/prisma ./prisma
COPY --from=builder --chown=matrixflow:matrixflow /build/dist ./dist

RUN npm install --omit=dev --ignore-scripts
RUN npx prisma generate

RUN mkdir -p /app/logs /app/uploads && chown -R matrixflow:matrixflow /app/logs /app/uploads

USER matrixflow

ENV NODE_ENV=production PORT=3000 HUSKY=0

EXPOSE 3000

ENTRYPOINT ["/sbin/tini", "--"]
CMD ["sh", "-c", "npx prisma migrate deploy && node dist/main.js"]
