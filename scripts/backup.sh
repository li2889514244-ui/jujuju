#!/usr/bin/env bash
# ============================================================
# MatrixFlow ERP - Database Backup Script
# ============================================================
set -euo pipefail

# Configuration
NAMESPACE="${NAMESPACE:-matrixflow}"
BACKUP_DIR="${BACKUP_DIR:-/backups/postgres}"
RETENTION_DAYS="${RETENTION_DAYS:-30}"
TIMESTAMP=$(date +%Y%m%d_%H%M%S)
BACKUP_FILE="matrixflow_${TIMESTAMP}.sql.gz"
PG_POD="postgres-0"

# S3 upload (optional)
S3_BUCKET="${S3_BUCKET:-}"
S3_PREFIX="${S3_PREFIX:-backups/postgres}"

# Colors
GREEN='\033[0;32m'
YELLOW='\033[1;33m'
RED='\033[0;31m'
NC='\033[0m'

log_info()    { echo -e "[INFO] $(date '+%Y-%m-%d %H:%M:%S') $1"; }
log_success() { echo -e "${GREEN}[OK]${NC} $(date '+%Y-%m-%d %H:%M:%S') $1"; }
log_warn()    { echo -e "${YELLOW}[WARN]${NC} $(date '+%Y-%m-%d %H:%M:%S') $1"; }
log_error()   { echo -e "${RED}[ERROR]${NC} $(date '+%Y-%m-%d %H:%M:%S') $1"; }

# Ensure backup directory exists
mkdir -p "$BACKUP_DIR"

# Get database credentials from secret
get_db_info() {
    DB_NAME=$(kubectl get secret postgres-secrets -n "$NAMESPACE" -o jsonpath='{.data.POSTGRES_DB}' | base64 -d)
    DB_USER=$(kubectl get secret postgres-secrets -n "$NAMESPACE" -o jsonpath='{.data.POSTGRES_USER}' | base64 -d)
}

# Perform backup
perform_backup() {
    log_info "Starting backup of database '${DB_NAME}'..."

    # Check if PostgreSQL pod is running
    if ! kubectl get pod "$PG_POD" -n "$NAMESPACE" &>/dev/null; then
        log_error "PostgreSQL pod '$PG_POD' not found"
        exit 1
    fi

    # Execute pg_dump inside the pod
    kubectl exec "$PG_POD" -n "$NAMESPACE" -- \
        pg_dump -U "$DB_USER" -d "$DB_NAME" \
        --format=custom \
        --compress=9 \
        --verbose \
        2>/dev/null | gzip > "${BACKUP_DIR}/${BACKUP_FILE}"

    # Verify backup
    if [[ -s "${BACKUP_DIR}/${BACKUP_FILE}" ]]; then
        local size
        size=$(du -h "${BACKUP_DIR}/${BACKUP_FILE}" | cut -f1)
        log_success "Backup completed: ${BACKUP_FILE} (${size})"
    else
        log_error "Backup file is empty!"
        rm -f "${BACKUP_DIR}/${BACKUP_FILE}"
        exit 1
    fi
}

# Upload to S3 (if configured)
upload_to_s3() {
    if [[ -n "$S3_BUCKET" ]]; then
        log_info "Uploading backup to S3: s3://${S3_BUCKET}/${S3_PREFIX}/${BACKUP_FILE}"
        aws s3 cp "${BACKUP_DIR}/${BACKUP_FILE}" "s3://${S3_BUCKET}/${S3_PREFIX}/${BACKUP_FILE}" \
            --storage-class STANDARD_IA
        log_success "S3 upload complete"
    fi
}

# Cleanup old backups
cleanup_old_backups() {
    log_info "Cleaning up backups older than ${RETENTION_DAYS} days..."
    local count
    count=$(find "$BACKUP_DIR" -name "matrixflow_*.sql.gz" -mtime "+${RETENTION_DAYS}" -type f | wc -l)
    find "$BACKUP_DIR" -name "matrixflow_*.sql.gz" -mtime "+${RETENTION_DAYS}" -type f -delete
    log_success "Removed ${count} old backup(s)"

    # Cleanup S3 if configured
    if [[ -n "$S3_BUCKET" ]]; then
        local cutoff_date
        cutoff_date=$(date -d "-${RETENTION_DAYS} days" +%Y%m%d)
        aws s3 ls "s3://${S3_BUCKET}/${S3_PREFIX}/" | while read -r line; do
            local file_date
            file_date=$(echo "$line" | grep -oP 'matrixflow_\K\d{8}' || true)
            if [[ -n "$file_date" && "$file_date" < "$cutoff_date" ]]; then
                local file_name
                file_name=$(echo "$line" | awk '{print $4}')
                aws s3 rm "s3://${S3_BUCKET}/${S3_PREFIX}/${file_name}"
                log_info "Removed S3 backup: ${file_name}"
            fi
        done
    fi
}

# WAL archiving (for point-in-time recovery)
setup_wal_archiving() {
    log_info "Verifying WAL archiving status..."
    kubectl exec "$PG_POD" -n "$NAMESPACE" -- \
        psql -U "$DB_USER" -d "$DB_NAME" -c \
        "SELECT * FROM pg_stat_archiver;" 2>/dev/null || true
}

# Main
main() {
    log_info "=========================================="
    log_info "MatrixFlow ERP Database Backup"
    log_info "=========================================="

    get_db_info
    perform_backup
    upload_to_s3
    cleanup_old_backups
    setup_wal_archiving

    log_success "Backup process complete!"
}

main "$@"
