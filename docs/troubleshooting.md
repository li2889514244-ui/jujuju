# MatrixFlow ERP 故障排查指南

## 常见问题速查

| 问题 | 快速定位 | 解决方案 |
|------|---------|---------|
| 502 Bad Gateway | 后端 Pod 未就绪 | 检查 Pod 状态和日志 |
| 503 Service Unavailable | 服务无端点 | 检查 Service selector 和 Pod labels |
| 数据库连接失败 | secrets/ConfigMap 错误 | 验证数据库凭据 |
| 浏览器会话超时 | 资源不足 | 增加 memory limits |
| 前端白屏 | Nginx 配置错误 | 检查 default.conf 和 SPA 路由 |
| 部署卡住 | 镜像拉取失败 | 检查镜像仓库凭据 |
| 高 CPU 使用 | 查询未优化 | 分析慢查询日志 |
| 内存泄漏 | 未释放资源 | 检查浏览器会话管理 |

---

## Pod 相关问题

### Pod 处于 Pending 状态

```bash
kubectl describe pod <pod-name> -n matrixflow
```

**常见原因及解决方案：**

1. **资源不足 (Insufficient CPU/Memory)**
   ```bash
   # 查看节点资源
   kubectl describe nodes | grep -A 5 "Allocated resources"
   
   # 解决：扩容节点或调整 resource requests
   kubectl patch deployment backend -n matrixflow -p \
     '{"spec":{"template":{"spec":{"containers":[{"name":"backend","resources":{"requests":{"cpu":"100m","memory":"256Mi"}}}]}}}}'
   ```

2. **PVC 未绑定**
   ```bash
   kubectl get pvc -n matrixflow
   # 检查 StorageClass 是否存在
   kubectl get storageclass
   ```

3. **节点选择器/亲和性不匹配**
   ```bash
   kubectl get pod <pod-name> -n matrixflow -o yaml | grep -A 10 nodeSelector
   ```

### Pod 处于 CrashLoopBackOff

```bash
# 查看当前日志
kubectl logs <pod-name> -n matrixflow --tail=50

# 查看上一次崩溃的日志
kubectl logs <pod-name> -n matrixflow --previous --tail=50

# 查看事件
kubectl get events -n matrixflow --field-selector involvedObject.name=<pod-name>
```

**常见原因：**

1. **启动探针失败 (应用启动慢)**
   ```bash
   # 增加启动探针的容忍度
   kubectl patch deployment backend -n matrixflow --type=json -p \
     '[{"op":"replace","path":"/spec/template/spec/containers/0/startupProbe/failureThreshold","value":60}]'
   ```

2. **数据库未就绪**
   ```bash
   # 检查 PostgreSQL 状态
   kubectl get pods -n matrixflow -l app.kubernetes.io/name=postgres
   kubectl logs postgres-0 -n matrixflow --tail=20
   ```

3. **环境变量缺失**
   ```bash
   # 检查 ConfigMap
   kubectl get configmap backend-config -n matrixflow -o yaml
   
   # 检查 Secret
   kubectl get secret backend-secrets -n matrixflow -o yaml
   ```

### Pod 被 OOMKilled

```bash
# 查看 Pod 最后的状态
kubectl get pod <pod-name> -n matrixflow -o jsonpath='{.status.containerStatuses[0].lastState}'

# 查看当前内存使用
kubectl top pod <pod-name> -n matrixflow
```

**解决方案：**

```bash
# 增加内存限制
kubectl set resources deployment/backend -n matrixflow \
  --limits=memory=2Gi --requests=memory=1Gi

# 对于浏览器引擎，内存需求更高
kubectl set resources deployment/browser-engine -n matrixflow \
  --limits=memory=4Gi --requests=memory=2Gi
```

---

## 网络问题

### 502 Bad Gateway

```bash
# 1. 检查后端 Pod 是否就绪
kubectl get pods -n matrixflow -l app.kubernetes.io/name=backend

# 2. 检查 Service 端点
kubectl get endpoints backend -n matrixflow

# 3. 检查 Ingress 配置
kubectl describe ingress matrixflow-ingress -n matrixflow

# 4. 测试内部连通性
kubectl run debug --rm -it --image=curlimages/curl -- \
  curl -v http://backend.matrixflow.svc.cluster.local:3000/api/health
```

### 503 Service Unavailable

```bash
# 检查 Service selector 是否匹配 Pod labels
kubectl get svc backend -n matrixflow -o yaml | grep -A 5 selector
kubectl get pods -n matrixflow -l app.kubernetes.io/name=backend --show-labels

# 检查 readiness probe 是否通过
kubectl describe pod <pod-name> -n matrixflow | grep -A 5 "Readiness"
```

### DNS 解析问题

```bash
# 在 Pod 内测试 DNS
kubectl run debug --rm -it --image=busybox -- nslookup backend.matrixflow.svc.cluster.local

# 检查 CoreDNS
kubectl get pods -n kube-system -l k8s-app=kube-dns
kubectl logs -n kube-system -l k8s-app=kube-dns --tail=50
```

### TLS/证书问题

```bash
# 检查证书状态
kubectl get certificate -n matrixflow
kubectl describe certificate matrixflow-tls -n matrixflow

# 检查 cert-manager 日志
kubectl logs -n cert-manager -l app=cert-manager --tail=50

# 测试证书
curl -vI https://erp.matrixflow.io 2>&1 | grep -i "ssl\|certificate"
```

---

## 数据库问题

### 连接被拒绝

```bash
# 1. 检查 PostgreSQL Pod
kubectl get pods -n matrixflow -l app.kubernetes.io/name=postgres
kubectl logs postgres-0 -n matrixflow --tail=20

# 2. 测试连接
kubectl exec -it postgres-0 -n matrixflow -- \
  psql -U $POSTGRES_USER -d $POSTGRES_DB -c "SELECT 1;"

# 3. 检查 pg_hba.conf
kubectl exec -it postgres-0 -n matrixflow -- cat /var/lib/postgresql/data/pgdata/pg_hba.conf

# 4. 检查最大连接数
kubectl exec -it postgres-0 -n matrixflow -- \
  psql -U $POSTGRES_USER -c "SHOW max_connections;"
```

### 慢查询

```bash
# 查看当前活跃查询
kubectl exec -it postgres-0 -n matrixflow -- \
  psql -U $POSTGRES_USER -d $POSTGRES_DB -c \
  "SELECT pid, now() - pg_stat_activity.query_start AS duration, query, state
   FROM pg_stat_activity
   WHERE state != 'idle'
   ORDER BY duration DESC;"

# 查看锁等待
kubectl exec -it postgres-0 -n matrixflow -- \
  psql -U $POSTGRES_USER -d $POSTGRES_DB -c \
  "SELECT blocked_locks.pid AS blocked_pid,
          blocking_locks.pid AS blocking_pid,
          blocked_activity.query AS blocked_query
   FROM pg_catalog.pg_locks blocked_locks
   JOIN pg_catalog.pg_stat_activity blocked_activity ON blocked_activity.pid = blocked_locks.pid
   JOIN pg_catalog.pg_locks blocking_locks ON blocking_locks.locktype = blocked_locks.locktype
   JOIN pg_catalog.pg_stat_activity blocking_activity ON blocking_activity.pid = blocking_locks.pid
   WHERE NOT blocked_locks.granted;"

# 终止长时间运行的查询
kubectl exec -it postgres-0 -n matrixflow -- \
  psql -U $POSTGRES_USER -c "SELECT pg_terminate_backend(<pid>);"
```

### 磁盘空间不足

```bash
# 查看数据库大小
kubectl exec -it postgres-0 -n matrixflow -- \
  psql -U $POSTGRES_USER -d $POSTGRES_DB -c \
  "SELECT pg_size_pretty(pg_database_size('$POSTGRES_DB'));"

# 清理 WAL 文件
kubectl exec -it postgres-0 -n matrixflow -- \
  pg_archivecleanup /var/lib/postgresql/data/pgdata/pg_wal $(ls /var/lib/postgresql/data/pgdata/pg_wal/ | head -1)

# 清理过期数据
kubectl exec -it postgres-0 -n matrixflow -- \
  psql -U $POSTGRES_USER -d $POSTGRES_DB -c \
  "DELETE FROM audit_logs WHERE created_at < NOW() - INTERVAL '90 days';"
```

### Redis 问题

```bash
# 检查 Redis 状态
kubectl exec -it deployment/redis -n matrixflow -- redis-cli -a $REDIS_PASSWORD info

# 查看内存使用
kubectl exec -it deployment/redis -n matrixflow -- redis-cli -a $REDIS_PASSWORD info memory

# 查看慢日志
kubectl exec -it deployment/redis -n matrixflow -- redis-cli -a $REDIS_PASSWORD slowlog get 10

# 检查连接数
kubectl exec -it deployment/redis -n matrixflow -- redis-cli -a $REDIS_PASSWORD info clients
```

---

## 浏览器引擎问题

### 会话创建失败

```bash
# 检查浏览器引擎日志
kubectl logs -f deployment/browser-engine -n matrixflow --tail=100

# 常见错误：
# "Browser crashed" → 内存不足，增加 limits
# "Navigation timeout" → 目标网站响应慢，增加超时
# "CAPTCHA detected" → 需要更换代理或策略
```

### Playwright 浏览器崩溃

```bash
# 检查是否有足够的共享内存
kubectl describe pod <browser-engine-pod> -n matrixflow | grep -A 5 "Limits"

# 增加 /dev/shm 大小
# 在 deployment.yaml 中添加：
# volumes:
#   - name: dshm
#     emptyDir:
#       medium: Memory
#       sizeLimit: 2Gi
# volumeMounts:
#   - name: dshm
#     mountPath: /dev/shm
```

### 代理连接问题

```bash
# 测试代理连通性
kubectl exec -it deployment/browser-engine -n matrixflow -- \
  curl -x http://proxy:8080 -U user:pass https://httpbin.org/ip

# 查看代理池状态
kubectl logs deployment/browser-engine -n matrixflow | grep -i "proxy"
```

---

## HPA 问题

### HPA 不扩缩容

```bash
# 查看 HPA 状态
kubectl describe hpa backend-hpa -n matrixflow

# 检查 metrics-server
kubectl get deployment metrics-server -n kube-system

# 手动测试 metrics
kubectl top pods -n matrixflow
```

### 扩缩容过于频繁

```bash
# 增加稳定窗口
kubectl patch hpa backend-hpa -n matrixflow --type=json -p \
  '[{"op":"replace","path":"/spec/behavior/scaleUp/stabilizationWindowSeconds","value":120}]'
```

---

## 性能优化

### 后端响应慢

1. **检查数据库查询**
   ```bash
   # 开启慢查询日志
   kubectl exec -it postgres-0 -n matrixflow -- \
     psql -U $POSTGRES_USER -c "ALTER SYSTEM SET log_min_duration_statement = 1000;"
   kubectl exec -it postgres-0 -n matrixflow -- \
     psql -U $POSTGRES_USER -c "SELECT pg_reload_conf();"
   ```

2. **检查连接池**
   ```bash
   # 查看连接池状态
   kubectl exec -it deployment/backend -n matrixflow -- \
     curl -s http://localhost:3000/api/metrics | grep pool
   ```

3. **检查缓存命中率**
   ```bash
   kubectl exec -it deployment/redis -n matrixflow -- \
     redis-cli -a $REDIS_PASSWORD info stats | grep keyspace
   ```

### 前端加载慢

```bash
# 检查 Nginx 缓存配置
kubectl exec -it deployment/frontend -n matrixflow -- \
  cat /etc/nginx/conf.d/default.conf | grep -A 10 "location.*\.(js|css)"

# 检查 gzip 是否生效
kubectl exec -it deployment/frontend -n matrixflow -- \
  curl -sI -H "Accept-Encoding: gzip" http://localhost/ | grep -i "content-encoding"
```

---

## 紧急操作

### 紧急回滚

```bash
# 回滚后端到上一版本
kubectl rollout undo deployment/backend -n matrixflow

# 回滚到指定版本
kubectl rollout undo deployment/backend -n matrixflow --to-revision=3

# 查看历史
kubectl rollout history deployment/backend -n matrixflow
```

### 紧急扩容

```bash
# 快速扩展后端
kubectl scale deployment/backend -n matrixflow --replicas=10

# 临时禁用 HPA
kubectl delete hpa backend-hpa -n matrixflow
```

### 紧急维护模式

```bash
# 创建维护页面
kubectl create configmap maintenance-page \
  --from-literal=index.html="<html><body><h1>系统维护中</h1></body></html>" \
  -n matrixflow

# 切换 Ingress 到维护页面
kubectl annotate ingress matrixflow-ingress -n matrixflow \
  nginx.ingress.kubernetes.io/default-backend=maintenance-page
```

### 紧急数据库操作

```bash
# 终止所有连接
kubectl exec -it postgres-0 -n matrixflow -- \
  psql -U $POSTGRES_USER -c \
  "SELECT pg_terminate_backend(pid) FROM pg_stat_activity WHERE datname='matrixflow' AND pid <> pg_backend_pid();"

# 进入单用户模式（极端情况）
kubectl exec -it postgres-0 -n matrixflow -- pg_ctl stop -D /var/lib/postgresql/data/pgdata -m immediate
```
