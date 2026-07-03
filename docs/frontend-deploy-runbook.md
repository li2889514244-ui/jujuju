# Frontend Deploy Runbook

这份记录对应当前生产环境 `https://ddddkiii.com` 的真实链路。以后前端热修上线按这里走，不要再用旧的 `/var/www/matrixflow` 路径判断是否生效。

## 这次复盘结论

- 公网入口不是宿主机 `/var/www/matrixflow`。
- Cloudflare Tunnel 配置是 `ddddkiii.com -> http://localhost:80`。
- `localhost:80` 是 Docker 容器 `matrixflow-frontend` 暴露出来的 nginx。
- 这个 nginx 的静态文件挂载源是 `/opt/matrixflow/frontend/dist -> /usr/share/nginx/html`。
- 所以前端上线必须覆盖 ECS 上的 `/opt/matrixflow/frontend/dist`。
- `/var/www/matrixflow` 目前不是公网入口，更新它不会让网站变化。

## 快速上线命令

在本机仓库根目录执行：

```powershell
python scripts/deploy-frontend-fast.py
```

这个脚本会做：

1. `npm run typecheck --workspace=frontend`
2. `npm run build --workspace=frontend`
3. 打包 `frontend/dist`
4. 通过 `secrets.env` 里的 `ECS_HOST`、`ECS_SSH_USER`、`ECS_SSH_PASSWORD` 上传到 ECS
5. 备份 `/opt/matrixflow/frontend/dist`
6. 覆盖新前端包
7. reload `matrixflow-frontend` nginx 容器
8. 验证公网入口文件已经变成新 hash

已经本地构建过，只想重发当前 `frontend/dist`：

```powershell
python scripts/deploy-frontend-fast.py --skip-typecheck --skip-build
```

## 手动排查命令

确认公网实际服务的是哪个入口文件：

```powershell
curl.exe -L -s "https://ddddkiii.com/?codex=$([DateTimeOffset]::UtcNow.ToUnixTimeSeconds())" |
  Select-String -Pattern "assets/js/index-[^`" ]+"
```

确认 ECS 上 Docker nginx 挂载关系：

```bash
docker ps --format 'table {{.ID}}\t{{.Image}}\t{{.Names}}\t{{.Ports}}'
docker inspect --format 'Name={{.Name}} Mounts={{range .Mounts}}{{.Source}}=>{{.Destination}};{{end}}' matrixflow-frontend
```

确认容器和公网读到同一个入口：

```bash
grep -o 'assets/js/index-[^" ]*' /opt/matrixflow/frontend/dist/index.html | head -1
docker exec matrixflow-frontend sh -c 'grep -o "assets/js/index-[^\" ]*" /usr/share/nginx/html/index.html | head -1'
curl -s -H 'Host: ddddkiii.com' http://127.0.0.1/ | grep -o 'assets/js/index-[^" ]*' | head -1
```

## 不要直接用的旧脚本

这些脚本可能会 `git reset --hard origin/master`，或者把文件发到旧目录；本地有未提交改动时尤其危险：

- `scripts/deploy-via-git.py`
- `deploy-frontend.js`
- `deploy-frontend.sh`
- `scripts/upload-deploy.py`

## 验证口径

前端上线后至少确认三件事：

1. 公网 HTML 引用的是新 `assets/js/index-*.js`。
2. 对应业务 chunk 可访问，例如 `MonetizationView-*.js` 返回 `200`。
3. 页面关键业务结果正确。

本次微信小店金额校准的验收样例：

- 店铺：披星文化
- 日期：2026-06-17
- 总单：6 笔，合计 `¥1994.00`
- 取消：1 笔，`¥299.00`
- 正确净销售额：`¥1695.00`
- 页面应显示：`5 笔有效 / 6 笔总单，已扣 ¥299.00`

