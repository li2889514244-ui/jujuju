# ---- Build Stage (Node.js) ----
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

# Install Python + pip for Bridge service
RUN apt-get update && apt-get install -y curl tini python3 python3-pip python3-venv && rm -rf /var/lib/apt/lists/*

RUN groupadd -g 1001 matrixflow && useradd -u 1001 -g matrixflow -m matrixflow
WORKDIR /app

# Copy Node backend
COPY --from=builder --chown=matrixflow:matrixflow /build/package.json ./
COPY --from=builder --chown=matrixflow:matrixflow /build/prisma ./prisma
COPY --from=builder --chown=matrixflow:matrixflow /build/dist ./dist

# Copy Python bridge
COPY --chown=matrixflow:matrixflow bridge.py ./
COPY --chown=matrixflow:matrixflow requirements.txt ./

# Clone social-auto-upload (10k stars, battle-tested platform uploaders)
RUN git clone --depth 1 https://github.com/dreammis/social-auto-upload.git ./social-auto-upload

# Install Node deps
RUN npm install --omit=dev --ignore-scripts
RUN npx prisma generate
ENV PLAYWRIGHT_SKIP_BROWSER_DOWNLOAD=1

# Install Python deps
RUN pip3 install --no-cache-dir -r requirements.txt
RUN pip3 install --no-cache-dir -r social-auto-upload/requirements.txt 2>/dev/null || true
RUN cd social-auto-upload && pip3 install --no-cache-dir -r requirements.txt 2>/dev/null || true

RUN mkdir -p /app/logs /app/uploads /tmp && chown -R matrixflow:matrixflow /app/logs /app/uploads /tmp

USER matrixflow
ENV NODE_ENV=production PORT=3000 HUSKY=0

EXPOSE 3000 8000

ENTRYPOINT ["tini", "--"]
CMD ["sh", "-c", "npx prisma migrate deploy && python3 bridge.py & node dist/main.js"]
