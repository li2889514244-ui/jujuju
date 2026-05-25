#!/bin/bash
BACKUP_DIR="/opt/matrixflow/backups"
mkdir -p "$BACKUP_DIR"
TIMESTAMP=$(date +%Y%m%d_%H%M%S)
DB_PASSWORD="${DB_PASSWORD:-f72d30b15368c8ab71c795aa78b25f0e4ec19d791e3c86d9cd869d277a487639}"

# Dump PostgreSQL
docker exec matrixflow-db pg_dump -U postgres matrixflow > "$BACKUP_DIR/matrixflow_$TIMESTAMP.sql"

# Compress
gzip "$BACKUP_DIR/matrixflow_$TIMESTAMP.sql"

# Keep only last 7 backups
ls -t "$BACKUP_DIR"/matrixflow_*.sql.gz | tail -n +8 | xargs rm -f 2>/dev/null

echo "[$TIMESTAMP] Backup completed: matrixflow_$TIMESTAMP.sql.gz ($(wc -c < "$BACKUP_DIR/matrixflow_$TIMESTAMP.sql.gz") bytes)"
