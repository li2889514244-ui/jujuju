#!/bin/bash
docker exec matrixflow-db psql -U postgres -d matrixflow -c "SELECT a.nickname, d.views, d.likes, d.comments FROM \"DailyStats\" d JOIN \"Account\" a ON d.\"accountId\"=a.id WHERE a.nickname LIKE '%恒德%' OR a.nickname LIKE '%心理学%' ORDER BY d.date DESC;"
