#!/bin/bash
# load-secrets.sh — 从 secrets.env 加载密钥到环境变量
# 用法: 在 shell 脚本顶部 source ./load-secrets.sh
SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
if [ ! -f "$SCRIPT_DIR/secrets.env" ]; then
  echo "❌ secrets.env not found. Run: cp secrets.env.example secrets.env"
  exit 1
fi
set -a
source "$SCRIPT_DIR/secrets.env"
set +a
