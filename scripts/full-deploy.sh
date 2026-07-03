#!/bin/bash
set -e

echo "=== MatrixFlow Full Deployment ==="
cd /opt/matrixflow

# Pull latest code
echo "Pulling latest code..."
git pull origin master

# Install dependencies
echo "Installing dependencies..."
cd backend
npm install

# Build
echo "Building..."
npm run build

# Restart PM2
echo "Restarting PM2..."
pm2 restart matrixflow || pm2 start dist/main.js --name matrixflow

echo "=== Deployment Complete ==="
