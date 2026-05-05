#!/bin/bash
# ============================================================
# MatrixFlow ERP - 安全扫描脚本
# 
# 功能：
# - npm audit 依赖漏洞扫描
# - 依赖版本检查
# - 敏感信息检查
# - 安全配置验证
# 
# 用法: bash scripts/security-scan.sh
# ============================================================

set -e

# 颜色定义
RED='\033[0;31m'
GREEN='\033[0;32m'
YELLOW='\033[1;33m'
BLUE='\033[0;34m'
NC='\033[0m' # No Color

# 报告文件
REPORT_FILE="security-scan-report-$(date +%Y%m%d-%H%M%S).md"
PROJECT_ROOT="$(cd "$(dirname "$0")/.." && pwd)"

echo -e "${BLUE}╔══════════════════════════════════════════════════════════╗${NC}"
echo -e "${BLUE}║        MatrixFlow ERP - 安全扫描                        ║${NC}"
echo -e "${BLUE}╚══════════════════════════════════════════════════════════╝${NC}"
echo ""

# 初始化报告
cat > "$REPORT_FILE" << EOF
# MatrixFlow ERP - 安全扫描报告

**扫描时间**: $(date '+%Y-%m-%d %H:%M:%S')
**项目路径**: $PROJECT_ROOT

---

EOF

# 计数器
TOTAL_CHECKS=0
PASSED_CHECKS=0
FAILED_CHECKS=0
WARNING_CHECKS=0

check_result() {
    local status=$1
    local message=$2
    TOTAL_CHECKS=$((TOTAL_CHECKS + 1))
    
    case $status in
        "PASS")
            PASSED_CHECKS=$((PASSED_CHECKS + 1))
            echo -e "${GREEN}✅ PASS${NC}: $message"
            echo "- ✅ $message" >> "$REPORT_FILE"
            ;;
        "FAIL")
            FAILED_CHECKS=$((FAILED_CHECKS + 1))
            echo -e "${RED}❌ FAIL${NC}: $message"
            echo "- ❌ $message" >> "$REPORT_FILE"
            ;;
        "WARN")
            WARNING_CHECKS=$((WARNING_CHECKS + 1))
            echo -e "${YELLOW}⚠️  WARN${NC}: $message"
            echo "- ⚠️ $message" >> "$REPORT_FILE"
            ;;
    esac
}

# ============================================================
# 1. npm audit - 依赖漏洞扫描
# ============================================================
echo -e "\n${BLUE}━━━ 1. 依赖漏洞扫描 (npm audit) ━━━${NC}"
echo "## 1. 依赖漏洞扫描" >> "$REPORT_FILE"
echo "" >> "$REPORT_FILE"

# 根目录
echo "扫描根目录..."
cd "$PROJECT_ROOT"
if npm audit --production 2>/dev/null; then
    check_result "PASS" "根目录依赖无已知漏洞"
else
    AUDIT_RESULT=$(npm audit --production 2>&1 || true)
    VULN_COUNT=$(echo "$AUDIT_RESULT" | grep -c "found" || echo "0")
    if [ "$VULN_COUNT" -gt 0 ]; then
        check_result "FAIL" "根目录存在依赖漏洞"
        echo '```' >> "$REPORT_FILE"
        echo "$AUDIT_RESULT" >> "$REPORT_FILE"
        echo '```' >> "$REPORT_FILE"
    fi
fi

# Backend
echo "扫描backend目录..."
cd "$PROJECT_ROOT/backend"
if [ -f "package.json" ]; then
    if npm audit --production 2>/dev/null; then
        check_result "PASS" "Backend依赖无已知漏洞"
    else
        AUDIT_RESULT=$(npm audit --production 2>&1 || true)
        check_result "WARN" "Backend存在依赖漏洞（详见报告）"
        echo '```' >> "$REPORT_FILE"
        echo "$AUDIT_RESULT" >> "$REPORT_FILE"
        echo '```' >> "$REPORT_FILE"
    fi
fi

# Frontend
echo "扫描frontend目录..."
cd "$PROJECT_ROOT/frontend"
if [ -f "package.json" ]; then
    if npm audit --production 2>/dev/null; then
        check_result "PASS" "Frontend依赖无已知漏洞"
    else
        AUDIT_RESULT=$(npm audit --production 2>&1 || true)
        check_result "WARN" "Frontend存在依赖漏洞（详见报告）"
    fi
fi

# ============================================================
# 2. 敏感信息检查
# ============================================================
echo -e "\n${BLUE}━━━ 2. 敏感信息检查 ━━━${NC}"
echo "" >> "$REPORT_FILE"
echo "## 2. 敏感信息检查" >> "$REPORT_FILE"
echo "" >> "$REPORT_FILE"

cd "$PROJECT_ROOT"

# 检查硬编码密钥
echo "检查硬编码密钥..."
if grep -r --include="*.ts" --include="*.js" --include="*.json" \
    -E "(password|secret|api_key|apikey|token)\s*[:=]\s*['\"][^'\"]{8,}" \
    --exclude-dir=node_modules --exclude-dir=.git --exclude="*.spec.ts" \
    --exclude="*.test.ts" --exclude="package-lock.json" . 2>/dev/null | \
    grep -v "example\|test\|placeholder\|xxx\|your-"; then
    check_result "FAIL" "发现疑似硬编码密钥"
else
    check_result "PASS" "未发现硬编码密钥"
fi

# 检查.env文件
echo "检查.env文件..."
if [ -f ".env" ]; then
    if grep -q "CHANGE_ME\|your-\|xxx\|placeholder" .env 2>/dev/null; then
        check_result "WARN" ".env文件包含占位符值"
    else
        check_result "PASS" ".env文件配置正常"
    fi
else
    check_result "WARN" ".env文件不存在（可能使用环境变量）"
fi

# 检查.env是否在.gitignore
echo "检查.gitignore..."
if [ -f ".gitignore" ]; then
    if grep -q "\.env" .gitignore; then
        check_result "PASS" ".env已在.gitignore中"
    else
        check_result "FAIL" ".env未在.gitignore中"
    fi
fi

# ============================================================
# 3. 安全头配置检查
# ============================================================
echo -e "\n${BLUE}━━━ 3. 安全配置检查 ━━━${NC}"
echo "" >> "$REPORT_FILE"
echo "## 3. 安全配置检查" >> "$REPORT_FILE"
echo "" >> "$REPORT_FILE"

# 检查Helmet
echo "检查Helmet配置..."
if grep -r "helmet" "$PROJECT_ROOT/backend/src" --include="*.ts" 2>/dev/null; then
    check_result "PASS" "已配置Helmet安全头"
else
    check_result "WARN" "未发现Helmet配置（建议添加）"
fi

# 检查CORS配置
echo "检查CORS配置..."
if grep -r "enableCors\|@nestjs/platform-express" "$PROJECT_ROOT/backend/src" --include="*.ts" 2>/dev/null; then
    check_result "PASS" "已配置CORS"
else
    check_result "WARN" "未发现CORS配置"
fi

# 检查Rate Limiting
echo "检查限流配置..."
if grep -r "throttle\|rate.?limit\|@nestjs/throttler" "$PROJECT_ROOT/backend/src" --include="*.ts" 2>/dev/null; then
    check_result "PASS" "已配置限流"
else
    check_result "WARN" "未发现限流配置（建议添加）"
fi

# 检查JWT配置
echo "检查JWT配置..."
if grep -r "JWT_SECRET" "$PROJECT_ROOT/backend/src" --include="*.ts" 2>/dev/null | grep -q "matrixflow-jwt-secret-key"; then
    check_result "FAIL" "JWT使用默认密钥"
else
    check_result "PASS" "JWT密钥配置正常"
fi

# 检查密码哈希
echo "检查密码哈希..."
if grep -r "bcrypt\|argon2\|scrypt" "$PROJECT_ROOT/backend/src" --include="*.ts" 2>/dev/null; then
    check_result "PASS" "使用安全的密码哈希算法"
else
    check_result "FAIL" "未发现密码哈希配置"
fi

# ============================================================
# 4. Docker安全检查
# ============================================================
echo -e "\n${BLUE}━━━ 4. Docker安全检查 ━━━${NC}"
echo "" >> "$REPORT_FILE"
echo "## 4. Docker安全检查" >> "$REPORT_FILE"
echo "" >> "$REPORT_FILE"

# 检查Dockerfile
for dockerfile in $(find "$PROJECT_ROOT" -name "Dockerfile" -not -path "*/node_modules/*" 2>/dev/null); do
    echo "检查 $dockerfile..."
    
    # 检查是否使用root用户
    if grep -q "^USER" "$dockerfile"; then
        check_result "PASS" "$(basename $dockerfile): 使用非root用户"
    else
        check_result "WARN" "$(basename $dockerfile): 建议使用非root用户"
    fi
    
    # 检查是否使用latest标签
    if grep -q ":latest" "$dockerfile"; then
        check_result "WARN" "$(basename $dockerfile): 使用:latest标签（建议固定版本）"
    else
        check_result "PASS" "$(basename $dockerfile): 未使用:latest标签"
    fi
done

# ============================================================
# 5. 依赖版本检查
# ============================================================
echo -e "\n${BLUE}━━━ 5. 依赖版本检查 ━━━${NC}"
echo "" >> "$REPORT_FILE"
echo "## 5. 依赖版本检查" >> "$REPORT_FILE"
echo "" >> "$REPORT_FILE"

cd "$PROJECT_ROOT/backend"
if [ -f "package.json" ]; then
    # 检查是否有过时的依赖
    echo "检查过时依赖..."
    OUTDATED=$(npm outdated 2>/dev/null || true)
    if [ -n "$OUTDATED" ]; then
        OUTDATED_COUNT=$(echo "$OUTDATED" | wc -l)
        check_result "WARN" "发现 $OUTDATED_COUNT 个过时依赖"
        echo '```' >> "$REPORT_FILE"
        echo "$OUTDATED" >> "$REPORT_FILE"
        echo '```' >> "$REPORT_FILE"
    else
        check_result "PASS" "所有依赖都是最新版本"
    fi
fi

# ============================================================
# 6. 文件权限检查
# ============================================================
echo -e "\n${BLUE}━━━ 6. 文件权限检查 ━━━${NC}"
echo "" >> "$REPORT_FILE"
echo "## 6. 文件权限检查" >> "$REPORT_FILE"
echo "" >> "$REPORT_FILE"

# 检查敏感文件权限
for sensitive_file in ".env" ".env.production" "docker-compose.yml"; do
    if [ -f "$PROJECT_ROOT/$sensitive_file" ]; then
        PERMS=$(stat -c %a "$PROJECT_ROOT/$sensitive_file" 2>/dev/null || stat -f %Lp "$PROJECT_ROOT/$sensitive_file" 2>/dev/null)
        if [ "$PERMS" = "600" ] || [ "$PERMS" = "640" ]; then
            check_result "PASS" "$sensitive_file 权限安全 ($PERMS)"
        else
            check_result "WARN" "$sensitive_file 权限过宽 ($PERMS)，建议设置为 600"
        fi
    fi
done

# ============================================================
# 7. 测试覆盖检查
# ============================================================
echo -e "\n${BLUE}━━━ 7. 安全测试检查 ━━━${NC}"
echo "" >> "$REPORT_FILE"
echo "## 7. 安全测试检查" >> "$REPORT_FILE"
echo "" >> "$REPORT_FILE"

SECURITY_TESTS=(
    "sql-injection.spec.ts"
    "xss.spec.ts"
    "csrf.spec.ts"
    "auth-bypass.spec.ts"
    "authorization.spec.ts"
    "rate-limit.spec.ts"
    "data-encryption.spec.ts"
    "security-config.spec.ts"
)

for test_file in "${SECURITY_TESTS[@]}"; do
    if find "$PROJECT_ROOT" -name "$test_file" -not -path "*/node_modules/*" 2>/dev/null | grep -q .; then
        check_result "PASS" "安全测试文件存在: $test_file"
    else
        check_result "WARN" "安全测试文件缺失: $test_file"
    fi
done

# ============================================================
# 生成报告摘要
# ============================================================
echo -e "\n${BLUE}━━━ 扫描摘要 ━━━${NC}"

cat >> "$REPORT_FILE" << EOF

---

## 扫描摘要

| 类别 | 数量 |
|------|------|
| 总检查项 | $TOTAL_CHECKS |
| ✅ 通过 | $PASSED_CHECKS |
| ❌ 失败 | $FAILED_CHECKS |
| ⚠️ 警告 | $WARNING_CHECKS |

**扫描时间**: $(date '+%Y-%m-%d %H:%M:%S')
EOF

echo ""
echo -e "${GREEN}═══════════════════════════════════════════════════════════${NC}"
echo -e "  总检查项: ${BLUE}$TOTAL_CHECKS${NC}"
echo -e "  ✅ 通过:  ${GREEN}$PASSED_CHECKS${NC}"
echo -e "  ❌ 失败:  ${RED}$FAILED_CHECKS${NC}"
echo -e "  ⚠️  警告:  ${YELLOW}$WARNING_CHECKS${NC}"
echo -e "${GREEN}═══════════════════════════════════════════════════════════${NC}"
echo ""
echo -e "📄 报告已保存: ${BLUE}$REPORT_FILE${NC}"

# 如果有失败项，退出码为1
if [ "$FAILED_CHECKS" -gt 0 ]; then
    exit 1
fi
