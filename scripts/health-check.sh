#!/usr/bin/env bash
# ============================================================
# MatrixFlow ERP - Health Check Script
# ============================================================
set -euo pipefail

NAMESPACE="${1:-matrixflow}"
TIMEOUT="${TIMEOUT:-10}"

# Colors
GREEN='\033[0;32m'
RED='\033[0;31m'
YELLOW='\033[1;33m'
NC='\033[0m'

PASS=0
FAIL=0
WARN=0

check_pass() { echo -e "  ${GREEN}✓${NC} $1"; ((PASS++)); }
check_fail() { echo -e "  ${RED}✗${NC} $1"; ((FAIL++)); }
check_warn() { echo -e "  ${YELLOW}⚠${NC} $1"; ((WARN++)); }

echo "=========================================="
echo "MatrixFlow ERP Health Check"
echo "Namespace: ${NAMESPACE}"
echo "Time: $(date '+%Y-%m-%d %H:%M:%S')"
echo "=========================================="
echo ""

# 1. Check pods
echo "📦 Pods:"
for deploy in frontend backend redis; do
    local_ready=$(kubectl get pods -n "$NAMESPACE" -l "app.kubernetes.io/name=${deploy}" \
        --field-selector=status.phase=Running -o name 2>/dev/null | wc -l)
    local_total=$(kubectl get pods -n "$NAMESPACE" -l "app.kubernetes.io/name=${deploy}" \
        -o name 2>/dev/null | wc -l)
    if [[ "$local_ready" -gt 0 && "$local_ready" == "$local_total" ]]; then
        check_pass "${deploy}: ${local_ready}/${local_total} pods running"
    elif [[ "$local_ready" -gt 0 ]]; then
        check_warn "${deploy}: ${local_ready}/${local_total} pods running (degraded)"
    else
        check_fail "${deploy}: 0 pods running"
    fi
done

# PostgreSQL (StatefulSet)
pg_ready=$(kubectl get pods -n "$NAMESPACE" -l "app.kubernetes.io/name=postgres" \
    --field-selector=status.phase=Running -o name 2>/dev/null | wc -l)
if [[ "$pg_ready" -gt 0 ]]; then
    check_pass "postgres: ${pg_ready} pod(s) running"
else
    check_fail "postgres: 0 pods running"
fi

echo ""

# 2. Check services
echo "🔌 Services:"
for svc in frontend backend postgres redis; do
    if kubectl get svc "$svc" -n "$NAMESPACE" &>/dev/null; then
        check_pass "${svc}: service exists"
    else
        check_fail "${svc}: service not found"
    fi
done

echo ""

# 3. Check endpoints
echo "🌐 Endpoints:"
for svc in frontend backend redis; do
    ep_count=$(kubectl get endpoints "$svc" -n "$NAMESPACE" -o jsonpath='{.subsets[0].addresses}' 2>/dev/null | jq length 2>/dev/null || echo "0")
    if [[ "$ep_count" -gt 0 ]]; then
        check_pass "${svc}: ${ep_count} endpoint(s)"
    else
        check_fail "${svc}: no endpoints"
    fi
done

echo ""

# 4. Check HPA
echo "📈 HPA:"
hpa_status=$(kubectl get hpa backend-hpa -n "$NAMESPACE" -o jsonpath='{.status.currentReplicas}' 2>/dev/null || echo "N/A")
hpa_target=$(kubectl get hpa backend-hpa -n "$NAMESPACE" -o jsonpath='{.spec.maxReplicas}' 2>/dev/null || echo "N/A")
if [[ "$hpa_status" != "N/A" ]]; then
    check_pass "backend-hpa: ${hpa_status} replicas (max: ${hpa_target})"
else
    check_warn "backend-hpa: not configured"
fi

echo ""

# 5. Check PVCs
echo "💾 Storage:"
for pvc in postgres-data postgres-backup-pvc; do
    pvc_status=$(kubectl get pvc "$pvc" -n "$NAMESPACE" -o jsonpath='{.status.phase}' 2>/dev/null || echo "NotFound")
    if [[ "$pvc_status" == "Bound" ]]; then
        check_pass "${pvc}: Bound"
    elif [[ "$pvc_status" == "NotFound" ]]; then
        check_warn "${pvc}: not found"
    else
        check_fail "${pvc}: ${pvc_status}"
    fi
done

echo ""

# 6. Check Ingress
echo "🌍 Ingress:"
ingress_exists=$(kubectl get ingress -n "$NAMESPACE" -o name 2>/dev/null | wc -l)
if [[ "$ingress_exists" -gt 0 ]]; then
    check_pass "Ingress configured"
    kubectl get ingress -n "$NAMESPACE" -o jsonpath='{range .items[*]}  Host: {.spec.rules[0].host}{"\n"}{end}' 2>/dev/null
else
    check_warn "No ingress found"
fi

echo ""

# 7. Application health endpoints
echo "❤️ Application Health:"
backend_health=$(kubectl exec -n "$NAMESPACE" deployment/backend -- \
    curl -sf http://localhost:3000/api/health 2>/dev/null || echo "FAIL")
if [[ "$backend_health" != "FAIL" ]]; then
    check_pass "Backend API: healthy"
else
    check_fail "Backend API: unhealthy"
fi

echo ""

# Summary
echo "=========================================="
echo "Results: ${GREEN}${PASS} passed${NC}, ${RED}${FAIL} failed${NC}, ${YELLOW}${WARN} warnings${NC}"
echo "=========================================="

if [[ "$FAIL" -gt 0 ]]; then
    exit 1
fi
