#!/usr/bin/env bash
# ============================================================
# MatrixFlow ERP - Database Restore Script
# ============================================================
set -euo pipefail

# Configuration
NAMESPACE="${NAMESPACE:-matrixflow}"
BACKUP_DIR="${BACKUP_DIR:-/backups/postgres}"
PG_POD="postgres-0"

# Colors
GREEN='\033[0;32m'
YELLOW='\033[1;33m'
RED='\033[0;31m'
NC='\033[0m'

log_info()    { echo -e "[INFO] $(date '+%Y-%m-%d %H:%M:%S') $1"; }
log_success() { echo -e "${GREEN}[OK]${NC} $(date '+%Y-%m-%d %H:%M:%S') $1"; }
log_warn()    { echo -e "${YELLOW}[WARN]${NC} $(date '+%Y-%m-%d %H:%M:%S') $1"; }
log_error()   { echo -e "${RED}[ERROR]${NC} $(date '+%Y-%m-%d %H:%M:%S') $1"; }

# Get database credentials
get_db_info() {
    DB_NAME=$(kubectl get secret postgres-secrets -n "$NAMESPACE" -o jsonpath='{.data.POSTGRES_DB}' | base64 -d)
    DB_USER=$(kubectl get secret postgres-secrets -n "$NAMESPACE" -o jsonpath='{.data.POSTGRES_USER}' | base64 -d)
}

# List available backups
list_backups() {
    echo ""
    echo "Available backups:"
    echo "=================="
    if [[ -d "$BACKUP_DIR" ]]; then
        ls -lhtr "${BACKUP_DIR}"/matrixflow_*.sql.gz 2>/dev/null | awk '{print NR". "$NF" ("$5")"}'
    else
        log_warn "Backup directory not found: $BACKUP_DIR"
    fi
    echo ""
}

# Download from S3
download_from_s3() {
    local backup_file="$1"
    local s3_bucket="${S3_BUCKET:-}"
    local s3_prefix="${S3_PREFIX:-backups/postgres}"

    if [[ -n "$s3_bucket" ]]; then
        log_info "Downloading backup from S3..."
        aws s3 cp "s3://${s3_bucket}/${s3_prefix}/${backup_file}" "${BACKUP_DIR}/${backup_file}"
    fi
}

# Scale down applications
scale_down() {
    log_info "Scaling down applications to prevent writes..."
    kubectl scale deployment/backend -n "$NAMESPACE" --replicas=0
    log_success "Applications scaled down"
}

# Scale up applications
scale_up() {
    log_info "Scaling up applications..."
    kubectl scale deployment/backend -n "$NAMESPACE" --replicas=3
    log_success "Applications scaled up"
}

# Perform restore
perform_restore() {
    local backup_file="$1"
    local backup_path="${BACKUP_DIR}/${backup_file}"

    if [[ ! -f "$backup_path" ]]; then
        log_error "Backup file not found: $backup_path"
        exit 1
    fi

    log_info "Restoring database from: ${backup_file}"

    # Drop and recreate database
    log_info "Dropping existing database..."
    kubectl exec "$PG_POD" -n "$NAMESPACE" -- \
        psql -U "$DB_USER" -d postgres -c \
        "SELECT pg_terminate_backend(pid) FROM pg_stat_activity WHERE datname='${DB_NAME}' AND pid <> pg_backend_pid();" 2>/dev/null || true

    kubectl exec "$PG_POD" -n "$NAMESPACE" -- \
        psql -U "$DB_USER" -d postgres -c \
        "DROP DATABASE IF EXISTS ${DB_NAME};" 2>/dev/null || true

    kubectl exec "$PG_POD" -n "$NAMESPACE" -- \
        psql -U "$DB_USER" -d postgres -c \
        "CREATE DATABASE ${DB_NAME};" 2>/dev/null || true

    # Restore from backup
    log_info "Restoring data..."
    gunzip -c "$backup_path" | kubectl exec -i "$PG_POD" -n "$NAMESPACE" -- \
        pg_restore -U "$DB_USER" -d "$DB_NAME" \
        --no-owner \
        --no-privileges \
        --verbose \
        2>/dev/null || true

    log_success "Database restored from: ${backup_file}"
}

# Verify restore
verify_restore() {
    log_info "Verifying restore..."

    local table_count
    table_count=$(kubectl exec "$PG_POD" -n "$NAMESPACE" -- \
        psql -U "$DB_USER" -d "$DB_NAME" -t -c \
        "SELECT count(*) FROM information_schema.tables WHERE table_schema = 'public';" 2>/dev/null | tr -d ' ')

    log_info "Tables found: ${table_count}"

    if [[ "$table_count" -gt 0 ]]; then
        log_success "Restore verification passed"
    else
        log_error "Restore verification failed - no tables found!"
        exit 1
    fi
}

# Main
main() {
    echo "=========================================="
    echo "MatrixFlow ERP Database Restore"
    echo "=========================================="
    echo ""
    echo "⚠️  WARNING: This will replace the current database!"
    echo ""

    get_db_info

    # Get backup file
    if [[ -n "${1:-}" ]]; then
        BACKUP_FILE="$1"
    else
        list_backups
        read -rp "Enter backup filename: " BACKUP_FILE
    fi

    if [[ -z "$BACKUP_FILE" ]]; then
        log_error "No backup file specified"
        exit 1
    fi

    # Confirm
    echo ""
    echo "Database: ${DB_NAME}"
    echo "Backup:   ${BACKUP_FILE}"
    echo ""
    read -rp "Are you sure you want to restore? (type 'yes' to confirm): " confirm
    if [[ "$confirm" != "yes" ]]; then
        log_info "Restore cancelled"
        exit 0
    fi

    download_from_s3 "$BACKUP_FILE"
    scale_down
    perform_restore "$BACKUP_FILE"
    verify_restore
    scale_up

    log_success "Restore complete!"
}

main "$@"
