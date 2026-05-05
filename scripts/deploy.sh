#!/usr/bin/env bash
# ============================================================
# MatrixFlow ERP - One-Click Deployment Script
# ============================================================
set -euo pipefail

# Colors
RED='\033[0;31m'
GREEN='\033[0;32m'
YELLOW='\033[1;33m'
BLUE='\033[0;34m'
NC='\033[0m'

# Configuration
SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
PROJECT_DIR="$(dirname "$SCRIPT_DIR")"
REGISTRY="${REGISTRY:-ghcr.io}"
IMAGE_PREFIX="${IMAGE_PREFIX:-matrixflow/matrixflow}"
NAMESPACE="${NAMESPACE:-matrixflow}"
IMAGE_TAG="${IMAGE_TAG:-latest}"
ENVIRONMENT="${ENVIRONMENT:-production}"

# Functions
log_info()    { echo -e "${BLUE}[INFO]${NC} $1"; }
log_success() { echo -e "${GREEN}[OK]${NC} $1"; }
log_warn()    { echo -e "${YELLOW}[WARN]${NC} $1"; }
log_error()   { echo -e "${RED}[ERROR]${NC} $1"; }

check_prerequisites() {
    log_info "Checking prerequisites..."

    local missing=()
    for cmd in kubectl docker helm; do
        if ! command -v "$cmd" &>/dev/null; then
            missing+=("$cmd")
        fi
    done

    if [[ ${#missing[@]} -gt 0 ]]; then
        log_error "Missing required tools: ${missing[*]}"
        exit 1
    fi

    # Check kubectl connection
    if ! kubectl cluster-info &>/dev/null; then
        log_error "Cannot connect to Kubernetes cluster"
        exit 1
    fi

    log_success "All prerequisites met"
}

create_namespace() {
    log_info "Ensuring namespace '${NAMESPACE}' exists..."
    kubectl apply -f "$PROJECT_DIR/k8s/namespace.yaml"
    log_success "Namespace ready"
}

deploy_configmaps() {
    log_info "Deploying ConfigMaps..."
    kubectl apply -f "$PROJECT_DIR/k8s/configmap.yaml" -n "$NAMESPACE"
    log_success "ConfigMaps deployed"
}

deploy_secrets() {
    log_info "Checking secrets..."
    if kubectl get secret backend-secrets -n "$NAMESPACE" &>/dev/null; then
        log_warn "Secrets already exist, skipping (use --force-secrets to override)"
    else
        log_warn "No secrets found! Please edit k8s/secrets.yaml and apply manually:"
        echo "  kubectl apply -f k8s/secrets.yaml -n $NAMESPACE"
        exit 1
    fi
}

deploy_services() {
    log_info "Deploying Services..."
    kubectl apply -f "$PROJECT_DIR/k8s/frontend/service.yaml" -n "$NAMESPACE"
    kubectl apply -f "$PROJECT_DIR/k8s/backend/service.yaml" -n "$NAMESPACE"
    kubectl apply -f "$PROJECT_DIR/k8s/browser-engine/service.yaml" -n "$NAMESPACE"
    kubectl apply -f "$PROJECT_DIR/k8s/postgres/service.yaml" -n "$NAMESPACE"
    kubectl apply -f "$PROJECT_DIR/k8s/redis/service.yaml" -n "$NAMESPACE"
    log_success "Services deployed"
}

deploy_statefulsets() {
    log_info "Deploying StatefulSets (PostgreSQL)..."
    kubectl apply -f "$PROJECT_DIR/k8s/postgres/pvc.yaml" -n "$NAMESPACE"
    kubectl apply -f "$PROJECT_DIR/k8s/postgres/statefulset.yaml" -n "$NAMESPACE"

    log_info "Waiting for PostgreSQL to be ready..."
    kubectl rollout status statefulset/postgres -n "$NAMESPACE" --timeout=300s
    log_success "PostgreSQL ready"
}

deploy_redis() {
    log_info "Deploying Redis..."
    kubectl apply -f "$PROJECT_DIR/k8s/redis/deployment.yaml" -n "$NAMESPACE"
    kubectl rollout status deployment/redis -n "$NAMESPACE" --timeout=120s
    log_success "Redis ready"
}

deploy_applications() {
    log_info "Deploying applications with tag: ${IMAGE_TAG}"

    # Set image tags
    export FRONTEND_IMAGE="${REGISTRY}/${IMAGE_PREFIX}/frontend:${IMAGE_TAG}"
    export BACKEND_IMAGE="${REGISTRY}/${IMAGE_PREFIX}/backend:${IMAGE_TAG}"
    export BROWSER_ENGINE_IMAGE="${REGISTRY}/${IMAGE_PREFIX}/browser-engine:${IMAGE_TAG}"

    kubectl apply -f "$PROJECT_DIR/k8s/frontend/deployment.yaml" -n "$NAMESPACE"
    kubectl apply -f "$PROJECT_DIR/k8s/backend/deployment.yaml" -n "$NAMESPACE"
    kubectl apply -f "$PROJECT_DIR/k8s/browser-engine/deployment.yaml" -n "$NAMESPACE"
    kubectl apply -f "$PROJECT_DIR/k8s/backend/hpa.yaml" -n "$NAMESPACE"

    log_info "Waiting for deployments..."
    kubectl rollout status deployment/frontend -n "$NAMESPACE" --timeout=300s
    kubectl rollout status deployment/backend -n "$NAMESPACE" --timeout=300s
    kubectl rollout status deployment/browser-engine -n "$NAMESPACE" --timeout=300s

    log_success "Applications deployed"
}

deploy_ingress() {
    log_info "Deploying Ingress..."
    kubectl apply -f "$PROJECT_DIR/k8s/ingress.yaml" -n "$NAMESPACE"
    log_success "Ingress deployed"
}

health_check() {
    log_info "Running health checks..."
    if [[ -f "$SCRIPT_DIR/health-check.sh" ]]; then
        bash "$SCRIPT_DIR/health-check.sh" "$NAMESPACE"
    else
        log_warn "Health check script not found, skipping"
    fi
}

print_summary() {
    echo ""
    echo "=========================================="
    echo "  MatrixFlow ERP Deployment Complete!"
    echo "=========================================="
    echo ""
    echo "  Environment:  $ENVIRONMENT"
    echo "  Namespace:    $NAMESPACE"
    echo "  Image Tag:    $IMAGE_TAG"
    echo ""
    echo "  Services:"
    kubectl get pods -n "$NAMESPACE" -o wide
    echo ""
    echo "  Ingress:"
    kubectl get ingress -n "$NAMESPACE"
    echo ""
}

# Main
main() {
    echo "=========================================="
    echo "  MatrixFlow ERP Deployment"
    echo "=========================================="
    echo ""

    check_prerequisites
    create_namespace
    deploy_configmaps
    deploy_secrets
    deploy_statefulsets
    deploy_redis
    deploy_services
    deploy_applications
    deploy_ingress
    health_check
    print_summary
}

# Parse arguments
while [[ $# -gt 0 ]]; do
    case $1 in
        --tag) IMAGE_TAG="$2"; shift 2 ;;
        --namespace) NAMESPACE="$2"; shift 2 ;;
        --env) ENVIRONMENT="$2"; shift 2 ;;
        --registry) REGISTRY="$2"; shift 2 ;;
        --force-secrets) FORCE_SECRETS=true; shift ;;
        -h|--help)
            echo "Usage: $0 [--tag TAG] [--namespace NS] [--env ENV] [--registry REG]"
            exit 0
            ;;
        *) log_error "Unknown option: $1"; exit 1 ;;
    esac
done

main
