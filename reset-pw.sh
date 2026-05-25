#!/bin/bash
source "$(dirname "$0")/load-secrets.sh"
cd /opt/matrixflow/backend

HASH=$(node -e "const bcrypt=require('bcryptjs');console.log(bcrypt.hashSync('$ADMIN_PASSWORD',10))" 2>/dev/null)
if [ -z "$HASH" ]; then
  cd /opt/matrixflow && npm install bcryptjs --no-save 2>/dev/null
  cd /opt/matrixflow/backend
  HASH=$(node -e "const bcrypt=require('bcryptjs');console.log(bcrypt.hashSync('$ADMIN_PASSWORD',10))")
fi
echo "Hash: ${HASH:0:30}..."

docker exec matrixflow-db psql -U postgres -d matrixflow -c "UPDATE \"User\" SET password='$HASH' WHERE email='$ADMIN_EMAIL';" && echo "UPDATED" || echo "DB_FAIL"
