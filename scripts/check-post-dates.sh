#!/bin/bash
cd /opt/matrixflow

echo "--- updatedAt distribution ---"
docker exec matrixflow-db psql -U postgres -d matrixflow -c "
SELECT 
  MIN(\"updatedAt\") as earliest_updated,
  MAX(\"updatedAt\") as latest_updated,
  MIN(\"createdAt\") as earliest_created,
  MAX(\"createdAt\") as latest_created
FROM \"Post\"
WHERE status = 'PUBLISHED';
"

echo "--- Posts where updatedAt != createdAt ---"
docker exec matrixflow-db psql -U postgres -d matrixflow -c "
SELECT COUNT(*) as updated_different
FROM \"Post\"
WHERE status = 'PUBLISHED' AND \"updatedAt\" != \"createdAt\";
"

echo "--- Top posts order by updatedAt desc ---"
docker exec matrixflow-db psql -U postgres -d matrixflow -c "
SELECT LEFT(title, 30) as title, s.views, p.\"createdAt\"::date, p.\"updatedAt\"::date
FROM \"Post\" p
JOIN \"PostStats\" s ON s.\"postId\" = p.id
WHERE p.status = 'PUBLISHED'
ORDER BY p.\"updatedAt\" DESC
LIMIT 5;
"
