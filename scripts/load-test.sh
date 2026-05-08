#!/bin/bash
# ============================================================
# MatrixFlow ERP - 负载测试执行脚本
# 
# 功能：
# - 自动获取JWT Token
# - 执行负载测试
# - 执行压力测试
# - 生成测试报告
# 
# 用法: bash scripts/load-test.sh [url] [email] [password]
# ============================================================

set -e

# 颜色定义
RED='\033[0;31m'
GREEN='\033[0;32m'
YELLOW='\033[1;33m'
BLUE='\033[0;34m'
CYAN='\033[0;36m'
NC='\033[0m'

# 默认配置
BASE_URL="${1:-http://localhost:3000}"
EMAIL="${2:-test@matrixflow.com}"
PASSWORD="${3:-Test123!}"
RESULTS_DIR="./test/performance/results"

echo -e "${BLUE}╔══════════════════════════════════════════════════════════╗${NC}"
echo -e "${BLUE}║        MatrixFlow ERP - 负载测试执行脚本                 ║${NC}"
echo -e "${BLUE}╚══════════════════════════════════════════════════════════╝${NC}"
echo ""
echo -e "${CYAN}目标地址:${NC} $BASE_URL"
echo -e "${CYAN}测试账号:${NC} $EMAIL"
echo ""

# 创建结果目录
mkdir -p "$RESULTS_DIR"

# ============================================================
# 1. 环境检查
# ============================================================
echo -e "${BLUE}━━━ 1. 环境检查 ━━━${NC}"

# 检查Node.js
if ! command -v node &> /dev/null; then
    echo -e "${RED}❌ Node.js 未安装${NC}"
    exit 1
fi
echo -e "${GREEN}✅ Node.js $(node -v)${NC}"

# 检查autocannon
if ! command -v npx autocannon &> /dev/null; then
    echo -e "${YELLOW}⚠️  autocannon 未安装，正在安装...${NC}"
    npm install -g autocannon 2>/dev/null || {
        echo -e "${RED}❌ 无法安装 autocannon${NC}"
        echo "请手动安装: npm install -g autocannon"
        exit 1
    }
fi
echo -e "${GREEN}✅ autocannon 已安装${NC}"

# 检查服务是否可达
echo -n "检查服务状态... "
if curl -s -o /dev/null -w "%{http_code}" "$BASE_URL/api/v1/auth/login" | grep -q "[0-9]"; then
    echo -e "${GREEN}✅ 服务可达${NC}"
else
    echo -e "${RED}❌ 服务不可达: $BASE_URL${NC}"
    echo "请确保服务已启动"
    exit 1
fi

# ============================================================
# 2. 获取JWT Token
# ============================================================
echo -e "\n${BLUE}━━━ 2. 获取认证Token ━━━${NC}"

TOKEN_RESPONSE=$(curl -s -X POST "$BASE_URL/api/v1/auth/login" \
    -H "Content-Type: application/json" \
    -d "{\"email\":\"$EMAIL\",\"password\":\"$PASSWORD\"}" 2>/dev/null)

TOKEN=$(echo "$TOKEN_RESPONSE" | grep -o '"accessToken":"[^"]*"' | cut -d'"' -f4)

if [ -z "$TOKEN" ]; then
    echo -e "${YELLOW}⚠️  无法获取Token，将使用无Token模式${NC}"
    echo -e "   响应: $TOKEN_RESPONSE"
    TOKEN=""
else
    echo -e "${GREEN}✅ Token获取成功${NC}"
fi

# 导出环境变量
export LOAD_TEST_URL="$BASE_URL"
export LOAD_TEST_TOKEN="$TOKEN"
export STRESS_TEST_URL="$BASE_URL"
export STRESS_TEST_TOKEN="$TOKEN"

# ============================================================
# 3. 响应时间测试
# ============================================================
echo -e "\n${BLUE}━━━ 3. 响应时间测试 ━━━${NC}"
echo "运行API响应时间测试..."

cd "$(dirname "$0")/.."

if [ -f "test/performance/response-time.spec.ts" ]; then
    npx jest test/performance/response-time.spec.ts --no-cache --verbose 2>&1 | tee "$RESULTS_DIR/response-time-$(date +%Y%m%d-%H%M%S).log" || true
else
    echo -e "${YELLOW}⚠️  响应时间测试文件不存在${NC}"
fi

# ============================================================
# 4. 负载测试
# ============================================================
echo -e "\n${BLUE}━━━ 4. 负载测试 ━━━${NC}"
echo "运行负载测试..."

if [ -f "test/performance/load-test.ts" ]; then
    npx ts-node test/performance/load-test.ts 2>&1 | tee "$RESULTS_DIR/load-test-$(date +%Y%m%d-%H%M%S).log" || true
else
    echo -e "${YELLOW}⚠️  负载测试文件不存在${NC}"
fi

# ============================================================
# 5. 压力测试
# ============================================================
echo -e "\n${BLUE}━━━ 5. 压力测试 ━━━${NC}"
echo "运行压力测试..."

if [ -f "test/performance/stress-test.ts" ]; then
    npx ts-node test/performance/stress-test.ts 2>&1 | tee "$RESULTS_DIR/stress-test-$(date +%Y%m%d-%H%M%S).log" || true
else
    echo -e "${YELLOW}⚠️  压力测试文件不存在${NC}"
fi

# ============================================================
# 6. 并发测试
# ============================================================
echo -e "\n${BLUE}━━━ 6. 并发发布测试 ━━━${NC}"
echo "运行并发发布测试..."

if [ -f "test/performance/concurrent-publish.spec.ts" ]; then
    npx jest test/performance/concurrent-publish.spec.ts --no-cache --verbose 2>&1 | tee "$RESULTS_DIR/concurrent-$(date +%Y%m%d-%H%M%S).log" || true
else
    echo -e "${YELLOW}⚠️  并发测试文件不存在${NC}"
fi

# ============================================================
# 7. 生成汇总报告
# ============================================================
echo -e "\n${BLUE}━━━ 7. 生成汇总报告 ━━━${NC}"

SUMMARY_FILE="$RESULTS_DIR/summary-$(date +%Y%m%d-%H%M%S).md"

cat > "$SUMMARY_FILE" << EOF
# MatrixFlow ERP - 负载测试汇总

**测试时间**: $(date '+%Y-%m-%d %H:%M:%S')
**目标地址**: $BASE_URL
**测试账号**: $EMAIL

## 测试结果

### 响应时间测试
详见: response-time-*.log

### 负载测试
详见: load-test-*.log

### 压力测试
详见: stress-test-*.log

### 并发测试
详见: concurrent-*.log

## 性能基准

| 指标 | 目标 | 实际 | 状态 |
|------|------|------|------|
| API响应时间 | < 200ms | - | - |
| 并发用户 | > 1000 | - | - |
| 错误率 | < 0.1% | - | - |

## 建议

根据测试结果，建议：
1. 检查响应时间超过200ms的端点
2. 优化数据库查询
3. 添加Redis缓存
4. 配置PM2集群模式

---

*报告自动生成于 $(date '+%Y-%m-%d %H:%M:%S')*
EOF

echo -e "${GREEN}✅ 汇总报告已生成: $SUMMARY_FILE${NC}"

# ============================================================
# 完成
# ============================================================
echo ""
echo -e "${GREEN}╔══════════════════════════════════════════════════════════╗${NC}"
echo -e "${GREEN}║                    测试完成！                            ║${NC}"
echo -e "${GREEN}╚══════════════════════════════════════════════════════════╝${NC}"
echo ""
echo -e "📁 测试结果目录: ${BLUE}$RESULTS_DIR/${NC}"
echo -e "📄 汇总报告: ${BLUE}$SUMMARY_FILE${NC}"
echo ""
echo -e "查看结果:"
echo -e "  ${CYAN}ls -la $RESULTS_DIR/${NC}"
echo -e "  ${CYAN}cat $SUMMARY_FILE${NC}"
