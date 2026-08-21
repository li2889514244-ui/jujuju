# MatrixFlow ERP 运维手册

## 日常运维

### 每日检查清单

```bash
# 1. 运行健康检查
./scripts/health-check.sh matrixflow

# 2. 检查 Pod 状态
kubectl get pods -n matrixflow -o wide

# 3. 检查资源使用
kubectl top pods -n matrixflow
kubectl top nodes

# 4. 检查日志
kubectl logs -n matrixflow -l app.kubernetes.io/name=backend --tail=100 -f

# 5. 检查 HPA 状态
kubectl get hpa -n matrixflow
```

### 查看应用日志

```bash
# 后端日志
kubectl logs -f deployment/backend -n matrixflow --tail=200

# 前端日志 (Nginx)
kubectl logs -f deployment/frontend -n matrixflow --tail=200

# 浏览器引擎日志
kubectl logs -f deployment/browser-engine -n matrixflow --tail=200

# PostgreSQL 日志
kubectl logs -f statefulset/postgres -n matrixflow --tail=200

# Redis 日志
kubectl logs -f deployment/redis -n matrixflow --tail=200

# 多容器日志聚合
stern -n matrixflow backend
```

---

## 备份管理

### 自动备份

数据库备份通过 CronJob 自动执行：

```bash
# 查看备份 CronJob
kubectl get cronjob -n matrixflow

# 手动触发备份
kubectl create job --from=cronjob/postgres-backup postgres-backup-manual -n matrixflow
```

### 手动备份

```bash
# 执行备份
./scripts/backup.sh

# 带 S3 上传
S3_BUCKET=matrixflow-backups ./scripts/backup.sh
```

### 恢复数据库

```bash
# 列出可用备份
./scripts/restore.sh

# 恢复指定备份
./scripts/restore.sh matrixflow_20240101_120000.sql.gz
```

### 备份策略

| 类型 | 频率 | 保留时间 | 存储位置 |
|------|------|---------|---------|
| 全量备份 | 每日 02:00 | 30 天 | 本地 + S3 |
| WAL 归档 | 持续 | 7 天 | S3 |
| 手动备份 | 按需 | 永久 | S3 Glacier |

---

## 扩缩容

### 手动扩缩容

```bash
# 扩展后端实例
kubectl scale deployment/backend -n matrixflow --replicas=5

# 扩展前端实例
kubectl scale deployment/frontend -n matrixflow --replicas=3

# 扩展浏览器引擎
kubectl scale deployment/browser-engine -n matrixflow --replicas=4
```

### HPA 自动扩缩容

后端服务已配置 HPA，基于 CPU/内存/请求量自动扩缩：

```bash
# 查看 HPA 状态
kubectl get hpa backend-hpa -n matrixflow

# 修改 HPA 配置
kubectl edit hpa backend-hpa -n matrixflow
```

### 扩缩容策略

| 指标 | 扩容阈值 | 缩容阈值 | 冷却期 |
|------|---------|---------|--------|
| CPU | 70% | 30% | 5 分钟 |
| 内存 | 80% | 40% | 5 分钟 |
| 请求量 | 100 rps/pod | 30 rps/pod | 3 分钟 |

---

## 更新部署

### 滚动更新 (默认)

```bash
# 更新镜像
kubectl set image deployment/backend backend=ghcr.io/matrixflow/backend:v1.2.3 -n matrixflow

# 查看滚动更新状态
kubectl rollout status deployment/backend -n matrixflow

# 回滚到上一版本
kubectl rollout undo deployment/backend -n matrixflow

# 查看历史版本
kubectl rollout history deployment/backend -n matrixflow
```

### 蓝绿部署 (生产环境)

```bash
# 通过 CI/CD 触发
gh workflow run cd.yml -f environment=production -f image_tag=v1.2.3

# 或手动执行
./scripts/deploy.sh --tag v1.2.3 --namespace matrixflow
```

---

## 数据库管理

### 连接数据库

```bash
# 通过 kubectl 连接
kubectl exec -it postgres-0 -n matrixflow -- psql -U matrixflow -d matrixflow

# 端口转发
kubectl port-forward svc/postgres 5432:5432 -n matrixflow
# 然后使用 psql 或 DBeaver 连接 localhost:5432
```

### 性能优化

```sql
-- 查看慢查询
SELECT pid, now() - pg_stat_activity.query_start AS duration, query
FROM pg_stat_activity
WHERE (now() - pg_stat_activity.query_start) > interval '5 seconds';

-- 查看表大小
SELECT relname, pg_size_pretty(pg_total_relation_size(relid))
FROM pg_catalog.pg_statio_user_tables
ORDER BY pg_total_relation_size(relid) DESC;

-- 分析查询计划
EXPLAIN ANALYZE SELECT * FROM accounts WHERE status = 'active';

-- 重建索引
REINDEX DATABASE matrixflow;

-- 更新统计信息
ANALYZE;
```

### Redis 管理

```bash
# 连接 Redis
kubectl exec -it deployment/redis -n matrixflow -- redis-cli -a $REDIS_PASSWORD

# 查看内存使用
redis-cli info memory

# 查看慢日志
redis-cli slowlog get 10

# 清除特定 key 模式
redis-cli --scan --pattern "cache:*" | xargs redis-cli del
```

---

## 故障处理

### Pod CrashLoopBackOff

```bash
# 查看 Pod 事件
kubectl describe pod <pod-name> -n matrixflow

# 查看日志
kubectl logs <pod-name> -n matrixflow --previous

# 常见原因：
# 1. 数据库连接失败 → 检查 secrets 和 ConfigMap
# 2. 内存不足 → 调整 resources.limits
# 3. 启动探针失败 → 增加 startupProbe.failureThreshold
```

### OOMKilled

```bash
# 查看 Pod 内存使用
kubectl top pod <pod-name> -n matrixflow

# 增加内存限制
kubectl patch deployment backend -n matrixflow -p \
  '{"spec":{"template":{"spec":{"containers":[{"name":"backend","resources":{"limits":{"memory":"2Gi"}}}]}}}}'
```

### 证书过期

```bash
# 检查证书状态
kubectl get certificate -n matrixflow

# 强制续签
kubectl delete secret matrixflow-tls -n matrixflow
# cert-manager 会自动重新签发
```

---

## 安全运维

### 密钥轮换

```bash
# 1. 生成新密钥
NEW_JWT_SECRET=$(openssl rand -hex 32)
NEW_DB_PASSWORD=$(openssl rand -base64 24)

# 2. 更新 Secret
kubectl edit secret backend-secrets -n matrixflow

# 3. 重启 Pod 使新密钥生效
kubectl rollout restart deployment/backend -n matrixflow
```

### 网络策略

```bash
# 查看网络策略
kubectl get networkpolicy -n matrixflow

# 应用网络策略
kubectl apply -f k8s/network-policy.yaml -n matrixflow
```

### 审计日志

```bash
# 查看 Kubernetes 审计日志
# (需在 API Server 中启用审计)
kubectl get events -n matrixflow --sort-by='.lastTimestamp'
```

---

## 监控与告警

### Grafana Dashboard

访问 `https://grafana.matrixflow.io` 查看监控面板。

### Prometheus 查询

```promql
# 后端请求率
sum(rate(http_requests_total{app="backend"}[5m])) by (status)

# P99 延迟
histogram_quantile(0.99, sum(rate(http_request_duration_seconds_bucket{app="backend"}[5m])) by (le))

# 错误率
sum(rate(http_requests_total{app="backend",status=~"5.."}[5m])) / sum(rate(http_requests_total{app="backend"}[5m])) * 100

# 活跃浏览器会话
browser_engine_active_sessions{app="browser-engine"}

# PostgreSQL 连接数
pg_stat_activity_count{datname="matrixflow"}
```

### 告警规则

| 告警 | 条件 | 严重程度 |
|------|------|---------|
| 高错误率 | >5% 5xx 错误持续 5 分钟 | Critical |
| 高延迟 | P99 > 2s 持续 5 分钟 | Warning |
| Pod 重启 | 5 分钟内重启 >3 次 | Warning |
| 磁盘空间 | <20% 可用 | Warning |
| 证书过期 | <30 天 | Info |
| PostgreSQL 连接 | >80% 最大连接数 | Warning |

---

## 灾难恢复

### 恢复流程

1. **评估影响范围** — 确认故障组件
2. **通知团队** — 发送告警通知
3. **停止写入** — 缩容应用实例到 0
4. **恢复数据库** — 使用最近的备份
5. **验证数据** — 检查关键表数据完整性
6. **恢复服务** — 重新扩展应用实例
7. **监控恢复** — 密切监控 30 分钟
8. **事后复盘** — 记录事件和改进措施

### RTO/RPO 目标

| 指标 | 目标 |
|------|------|
| RTO (恢复时间目标) | < 1 小时 |
| RPO (恢复点目标) | < 24 小时 (日常备份) |
| RPO (WAL 归档) | < 5 分钟 |
