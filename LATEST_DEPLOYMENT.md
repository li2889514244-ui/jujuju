# Latest Deployment Marker

Current verified: 2026-09-01 12:00 Asia/Shanghai (系统健康中心 Phase 1 收尾上线：backend ×2 + frontend，无新迁移，恢复巡检/计数修复/并发去重修复已生效，production 实测通过)

## 系统健康中心 Phase 1 收尾 (2026-09-01 11:47~12:00)

- 后端首次部署 `deploy-backend-safe.py --execute --migrate`（backup `/opt/matrixflow/releases/backend/20260901114712`，21 migrations up to date，health 200）：上线恢复巡检 sweepIncidentRecovery（每分钟，COMPANION 排除）、严重度只升不降、overview 真实计数、总体状态基于当前未恢复故障、前端时间戳钳制、慢接口阈值对齐。
- 部署后实测发现并发竞态 bug（前端刷新时 overview+incidents 并行触发 syncCompanionIncidents → 重复 SystemIncident 行）；修复：进程内串行化 syncChain + 新增并发单测；第二次部署（backup `/opt/matrixflow/releases/backend/20260901115533`，health 200）后清理生产存量重复（7 组合并、删 8 行），75 秒观察 duplicate_keys=0。
- 前端 `deploy-frontend-fast.py --allow-dirty-source` 成功：public entry `assets/js/index-BepOSBOX.js`（三处 ref 一致；hash 未变系 __APP_VERSION__ 常量折叠等价）、健康中心 chunk `SystemHealthCenterView-CGAjyRPo.js` 公网 200、Cloudflare 已 purge。
- 生产实测（服务器端短时 super-admin JWT）：/system-health/overview 200（INCIDENT，p0=0，p1=3，六层卡片齐全）、incidents/events 200（真实事件带 requestId 已入库）、companion-monitor/overview 200（3 设备 1 在线、心跳重启后持续 201）、SystemEvent=11/SystemIncident=8、一条 FRONTEND 故障已被巡检置 RECOVERING（cron 生产生效）。

## 业绩天梯月份切换 (2026-09-01 11:35)

- 后端：`deploy-backend-safe.py --execute --skip-build --migrate` 成功（backup `/opt/matrixflow/releases/backend/20260901113533`，health 200，PM2 online）。应用了两个迁移：`202608310001_system_health_center`（修复 UTF-8 BOM 导致的一直失败问题）与 `202609010001_performance_ladder_month_snapshot`（新增月度目标/规则快照表）。`21 migrations` 与数据库完全一致（Database schema is up to date）。
- 前端：`deploy-frontend-fast.py --skip-typecheck --allow-dirty-source` 成功，public entry `assets/js/index-BepOSBOX.js`、ladder chunk `PerformanceLadderView-BDiJGTPX.js`（remote/origin/public ref 三处一致），Cloudflare HTML cache 已 purge，remote backup `/tmp/matrixflow-frontend-dist-backup-20260901113655`。
- 新端点 `GET /api/v1/performance-ladder/month-snapshot/:month` 生产实测（短时 admin JWT）：历史月首次读取创建快照（snapshotCreated=true）、二次读取复用（false）、当前月实时（isCurrentMonth=true）、未来月 400「不能查看未来月份」、非法格式 400。生产快照数据：卢慧 2026-08 目标 1260 已冻结。
- 部署中发现并修复的两个既有问题：(1) 迁移 `202608310001_system_health_center/migration.sql` 带 UTF-8 BOM，PostgreSQL 报 syntax error，该迁移从未成功应用（已在本次随修复一起应用）；(2) 生产数据库已应用但本地缺失的迁移目录 `20260707000000_add_authing_integration`（git 提交 423f57ef 时被误删）已从 git 历史（0ad9706e）恢复。
- 验证：后端 Jest 35 套 343 项、前端 vitest 71/71、`diagnose-production.py --remote` DIAGNOSE OK（21 migrations up to date、data sanity 全 0、api_consistency ok）。

## Pixingyun Mate 3.2.107 AI editor test release (2026-08-31 10:37)

- Public manifest: `https://ddddkiii.com/companion-updates/latest.json` -> version `3.2.107`.
- In-app update default package: lite ZIP (`157266112` bytes). Full ZIP metadata remains available as `full_url`/`full_sha256`/`full_size` for fallback-compatible clients.
- Portable ZIP: `https://ddddkiii.com/downloads/pixingyun-mate-portable-3.2.107.zip` (`348241979` bytes, SHA256 `6101e9ca28672de00e715224c0750318f6153097024e695c11a9186c0ecd5047`).
- Lite ZIP: `https://ddddkiii.com/downloads/pixingyun-mate-lite-3.2.107.zip` (`157266112` bytes, SHA256 `08a208fdfaeaf22ce7ae3b7014ed5825e279ecbecc3a201cbffe2e109697acca`).
- Installer: `https://ddddkiii.com/downloads/pixingyun-mate-setup-3.2.107.exe` and stable `https://ddddkiii.com/downloads/pixingyun-mate-setup.exe` (`452050302` bytes, SHA256 `259c37ada4dc19a53460c9ed16573a5b29cbc112087c8d3b6637ffc6d36480b7`).
- Fix scope: AI editor only. Packaged the V2 `video_editor` module, fixed FFmpeg pipe hangs, lowered the small-video disk-space floor, added cached Whisper CLI fallback, allowed MP4 export without ASR model, and clarified AI editor readiness/error UI. No account/store/collection/website business logic changed.
- Verification: Python compile passed; core video-editor tests passed; real MP4 export smoke passed with cached Whisper and with no ASR model; ZIP/EXE magic bytes pass (`ZIP=504B0304`, `EXE=4D5A5000`); public `/api/v1/health` returned `200`.

## Pixingyun Mate 3.2.106 process-safety release (2026-08-27 12:04)

- Public manifest: `https://ddddkiii.com/companion-updates/latest.json` -> version `3.2.106`.
- Portable ZIP: `https://ddddkiii.com/downloads/pixingyun-mate-portable-3.2.106.zip` (`348168878` bytes, SHA256 `179680e9e369a7dedc36e960353bbd183bf53edf334315d733d29758d2f0e732`).
- Lite ZIP: `https://ddddkiii.com/downloads/pixingyun-mate-lite-3.2.106.zip` (`155921509` bytes, SHA256 `ccd283bad404c7b3ac42b9d51f2a4b065bc965be6c2893973a304a87963effe1`).
- Installer: `https://ddddkiii.com/downloads/pixingyun-mate-setup-3.2.106.exe` and stable `https://ddddkiii.com/downloads/pixingyun-mate-setup.exe` (`451976876` bytes, SHA256 `80c13085e0234a82be389ec532d07ffbe00b3a08e2a4a7c76b53a944e30536a4`).
- Fix scope: no broad process killing; browser records require Pixingyun-owned `profile_path`; legacy no-profile records are pruned without killing; updater rollback uses `$Started.Kill()` instead of `Stop-Process -Id`; collection cleanup closes owned persistent contexts and never calls `browser.close()` directly.
- Infrastructure fix during verification: `/opt/matrixflow/docker-compose.yml` cloudflared command is now `tunnel --region us --edge-ip-version 4 --protocol http2 run --token ${CF_TUNNEL_TOKEN}` to avoid intermittent `localhost` DNS resolution failures.

Last verified: 2026-08-25 18:25 Asia/Shanghai (companion log upload live: backend stores per-device logs + devices.json registry; companion 3.2.92 published — logs uploaded every 30 min with tokens redacted; also deployed: 组长 GROUP_LEADER role + 商业转化 pages gated to 组长及以上, plus AppLayout boot-time role re-sync — current public entry `assets/js/index-D7VcOktl.js`; production `UserRole` enum includes GROUP_LEADER; earlier notes below still stand)

## 组长角色 + 商业转化查看权限 (2026-08-25 17:33)

New `GROUP_LEADER` (组长) user role (migration `20260824200000_add_group_leader_role`). 微信小店/抖店/业绩天梯 (plus their hidden source-detail sub-routes) now require `SUPER_ADMIN/OWNER/ADMIN/MANAGER/GROUP_LEADER` — sidebar hides them and the router guard redirects MEMBER/VIEWER to 仪表盘; no other section or permission changed. Public frontend entry is now `assets/js/index-CcKAkRK8.js` (ladder chunk `PerformanceLadderView-B1KEMAPN.js`); backend backup `/opt/matrixflow/releases/backend/20260825173232`. Details in `docs/deployment-log.md` 17:33 entry.

## 刷新中 overlay 200px resize (2026-08-24 19:06)

`GlobalLoadingOverlay.vue`: the spinning image is now `min(200px, 35vw)` square (50% radius, object-fit cover), 2.4s per rotation, 20px gap to the 刷新中... text; no refresh-logic changes. Public frontend entry is now `assets/js/index-BPo7jbfN.js` with overlay styles in `assets/css/AppLayout-BNdCrgcO.css`; Cloudflare cache purged. Details in `docs/deployment-log.md` 19:06 entry.

## 业绩天梯 triple fix (2026-08-24 15:07)

Fixed the double 'Teacher not found' toast (stale deleted-teacher reference + double toast from interceptor/component), the 有效订单 tile bound to the refund count, and the literal `?? + ??` placeholder under 总订单. Teacher error messages are now Chinese, teacher API calls are silent, deletes are optimistic, and stale teacher ids self-heal. Public frontend entry is now `assets/js/index-DwNm7xmO.js` with ladder chunk `assets/js/PerformanceLadderView-s1uXaUtr.js`; backend redeployed at `/opt/matrixflow/releases/backend/20260824150509`. Details in `docs/deployment-log.md` 15:07 entry.

## Companion 3.2.87 release (2026-08-24 16:05) — supersedes 3.2.86

Fixed the Doudian sync timeout that repeatedly showed "Page.wait_for_timeout: Connection closed while reading from the driver" on 唐商披星. Root cause: full order+aftersale pagination takes ~7.5-8 min, right at the 480s collect timeout, which cancels the browser mid-wait and surfaces as a driver disconnect. Fixes: per-page waits tightened (settle 1500→900ms, networkidle 2000→1200ms, source-capture retries 6→3 with 600ms backoff), collect timeout raised 480→660s, disconnect errors now map to the friendly 抖店采集超时 prompt. Also shipped the Doudian data reset (backup → wipe orders → re-collect → restore pre-window band from 08-20 dump): final state identical to pre-wipe.

- Public manifest: https://ddddkiii.com/companion-updates/latest.json -> version 3.2.87
- Update ZIP: https://ddddkiii.com/downloads/pixingyun-mate-portable-3.2.87.zip (348,082,956 bytes)
- Installer: https://ddddkiii.com/downloads/pixingyun-mate-setup-3.2.87.exe (451,906,532 bytes)
- Local D:\Pixingyun runs 3.2.87 (backup D:\Pixingyun.bak-3287); both stores re-synced successfully after the wipe (唐商 465s, 披星教育 ~3.5min).

## Companion 3.2.86 release (2026-08-24 12:53) — supersedes 3.2.85

Re-published as 3.2.86 because 3.2.85 (and 3.2.84) shipped a broken zip self-update apply path: companion_updater._start_zip_update_process wrote the apply script with Path.write_text(..., bom=True) which raises TypeError, so in-app updates failed after download. Fixed by using companion_encoding.write_text_file for all three script writers (vbs, exe-ps1, zip-ps1). IMPORTANT: companions on 3.2.84/3.2.85 cannot self-update (their updater is broken) — they must manually download the 3.2.86 ZIP (unzip over install dir) or run the 3.2.86 installer once; from 3.2.86 onward in-app updates work again.

- Public manifest: https://ddddkiii.com/companion-updates/latest.json -> version 3.2.86
- Update ZIP: https://ddddkiii.com/downloads/pixingyun-mate-portable-3.2.86.zip (261,843,481 bytes, SHA256 bb50cd45a1835a6488476b3bb73b06c225f25e251d50bc2cba597c7fdaca9bde)
- Installer: https://ddddkiii.com/downloads/pixingyun-mate-setup-3.2.86.exe (396,556,744 bytes, SHA256 1b7670df648ba03ba648ad0d2e5308802894a9bc7b7921da0806a9446735bdaf)
- Local D:\Pixingyun now runs 3.2.86 (/health 3.2.86, update check available=false); backups: D:\Pixingyun.bak-proxyfix-20260824-115803, D:\Pixingyun.bak-3285-*, D:\Pixingyun.bak-3286-*
- Local self-update end-to-end verification of 3.2.84 failed at apply stage with Path.write_text bom TypeError — that is how the 3.2.84/3.2.85 updater bug was discovered. The fix is source-verified (0 Path.write_text calls left in companion_updater.py; 3 write_text_file calls; BOM output verified) and shipped in 3.2.86.

## Companion 3.2.85 release (2026-08-24)

Published Pixingyun Mate 3.2.85 to fix the Doudian upload chain outage. Root cause: companion outbound HTTP read the Windows system proxy (Clash Verge 127.0.0.1:7897), so all Doudian uploads were routed through proxy nodes; a node outage on 2026-08-24 ~10:49-11:14 caused TCP RST (10054) on every chunk, failing both stores. Server was healthy and received zero requests in that window. Fix: all companion outbound HTTP (doudian upload/rebind/relink, auth login/refresh, collector uploads, login worker uploads) now uses no-proxy sessions (trust_env=False); network errors are classified (CONNECTION_RESET/TIMEOUT/DNS_FAILURE/TLS_ERROR/NETWORK_ERROR) with friendly per-code UI messages; Doudian scheduler fast-retries 5 minutes after a network-class failure instead of waiting 30 minutes. Verification: upload chunk latency dropped from ~6.5s (proxy) to ~0.6s (direct); manual sync of both stores succeeded (201 on server).

- Public manifest: https://ddddkiii.com/companion-updates/latest.json -> version 3.2.85
- Update ZIP: https://ddddkiii.com/downloads/pixingyun-mate-portable-3.2.85.zip (261,843,957 bytes, SHA256 1030a8534db701f166dbde7930cf96e4fd290a77692ec3130c27c856d4934c48)
- Installer: https://ddddkiii.com/downloads/pixingyun-mate-setup-3.2.85.exe (396,588,862 bytes, SHA256 90d720fcc23db57c80b109f05f1c5f2592764ab7773cd707366fb8fe202ade92)
- Local D:Pixingyun deployed with the same build; previous install backed up to D:Pixingyun.bak-proxyfix-20260824-115803
- Known follow-up: companion update package download still uses urllib with system proxy (slow ~200KB/s on this machine) — consider no-proxy downloader in a future release; Clash Verge rule enhancement for ddddkkiii.com added locally (profiles/r8aEXnh0nVOj.yaml prepend DOMAIN-SUFFIX DIRECT), takes effect after Clash reloads.
- Server stability findings: ECS is 2 vCPU / 1.6GB RAM; matrixflow Node heap at ~95% usage; PG had "not properly shut down / recovery" events on 2026-08-14 (disk-full event) and 2026-08-21; recommend upgrading ECS memory and adding PG/disk/memory alerting.

This file is the source of truth for the current usable MatrixFlow / Pixingyun deployment. If another AI agent works in this repo later, read this file before choosing which build, bundle, backend dist, or companion package is current.

For deployment history, failure patterns, safe deployment rules, and AI handoff guidance, also read:

- `docs/deployment-retrospective-ai-handoff.md`
- `docs/deployment-remediation-plan.md`
- `docs/project-memory.md`
- `docs/project-workflow.md`
- `docs/deployment-log.md`
- `docs/project-change-log.md`
- `docs/legacy-deploy-index.md`

## Production Frontend

- Production URL: https://ddddkiii.com
- Current deployed entry bundle: `assets/js/index-jdLuCj01.js`
- Current dashboard page chunk: `assets/js/MatrixDashboard-Bbh4Hp_g.js`
- Current Doudian page chunk: `assets/js/DoudianView-D-P4KmNt.js`
- Current Doudian source-detail page chunk: `assets/js/DoudianSourceDetailView-Ocp7qxV_.js`
- Current WeChat store page chunk: `assets/js/MonetizationView-CkRJaS13.js`
- Current WeChat source-detail page chunk: `assets/js/WechatSourceDetailView-BTCv9Gy0.js`
- Current performance ladder page chunk: `assets/js/PerformanceLadderView-BzP0SDy9.js`
- Current account list page chunk: `assets/js/AccountListView-zd10xbBk.js`
- Current permission page chunk: `assets/js/PermissionView-C0rG_K3G.js`
- Current login page chunk: `assets/js/LoginView-B1v1Lt4y.js`
- Current MCP page chunk: `assets/js/MCPConnectionView-DZbuDl0Z.js`
- Current admin page chunk: `assets/js/AdminView-3--CtRjq.js`
- Local build source: `C:\Users\EDY\jujuju\frontend\dist`

Latest deployment note: at 2026-08-24 14:58 Asia/Shanghai, shipped the daily Doudian reconciliation (每日自动对账). New backend scheduler `DailyReconciliationScheduler` runs at 09:10 Beijing and re-computes each Doudian store's previous day through two independent paths — the page caliber (`buildDoudianSummary`) and a pure-SQL recount — comparing six fields plus the 总订单=有效+退款 invariant. Mismatch → 🔴 Feishu anomaly push; match → ✅ pass summary (per-store 总/有效/退款/成交额/退款金额) so operators can eyeball against the Doudian platform. Manual trigger: `POST /api/v1/scheduler/trigger/reconciliation` or `py -3 scripts\trigger-reconciliation-once.py`. Also repaired four pre-existing failing backend test suites (test-only changes); the full backend suite is now green (33 suites / 303 tests). Backend deployed via `deploy-backend-safe.py --execute --skip-build` (backup `/opt/matrixflow/releases/backend/20260824145543`); live manual trigger at 06:58Z passed for both stores (一致) and pushed the ✅ Feishu message. WeChat counting logic untouched.

Latest deployment note: at 2026-08-24 14:25-14:33 Asia/Shanghai, fixed the user-reported Doudian order-count data errors and shipped a prevention layer. (1) Counting fix (backend + frontend): refunds are now attributed by ORDER create date (cross-day refunds归订单日) and 有效订单 = 营收订单 − 退款订单 with 总订单 = 有效 + 退款 — no more double counting. Verified against production API: 披星教育 8/21 总14/有效11/退款3; 唐商披星 8/22 总49/有效35/退款14; per-source 卢慧-高维破局 8/21 总13/有效10/退款3, 8/22 总26/有效17/退款9. (2) Prevention layer: `docs/订单口径规范.md` is now the single source of truth for all order/refund counting semantics; `scripts/diagnose-production.py --remote` now fails on duplicate order/aftersale rows, orphan rows, negative amounts, or zero createTime (Doudian + WeChat) and on any Doudian store whose 30-day summary violates total = valid + refunded; DoudianView shows 退款按订单日归集. WeChat counting logic untouched. Backend backup `/opt/matrixflow/releases/backend/20260824142053`, frontend entry `assets/js/index-Y-HPc1-x.js` (all four refs matched), remote frontend backup `/tmp/matrixflow-frontend-dist-backup-20260824143339`.

Latest deployment note: at 2026-08-21 17:25 Asia/Shanghai, deployed the post-audit defensive fix round (backend + frontend). Backend: `py -3 scripts\deploy-backend-safe.py --execute --skip-build` — replaced `/opt/matrixflow/backend` dist/prisma (backup `/opt/matrixflow/releases/backend/20260821172049`), Prisma generate + migrate status clean (`Database schema is up to date!`, 14 migrations), PM2 `matrixflow` restarted, local/public health `200`. Shipped: analytics median×20 outlier zeroing removed, WeChat Video period `net_fans` allowed negative (掉粉 -300 no longer clamped to 0), platforms delta fill allows negative followers increment. Frontend: `py -3 scripts\deploy-frontend-fast.py --skip-typecheck --allow-dirty-source` — public entry `assets/js/index-B2l8OQ1y.js` (remote backup `/tmp/matrixflow-frontend-dist-backup-20260821172134`), local/remote/origin/public refs all matched. Shipped: DoudianView latest-request-wins loadData guard + removed duplicate `@change` triggers + sync failure no longer hidden behind cached data; DoudianSourceDetailView same guard; AccountListView batch delete clears `selectedIds`; plus the earlier local-only frontend fixes (duplicate data-status tag removal, ladder operator unification). Store counting semantics (Doudian/WeChat) intentionally unchanged. Post-deploy `scripts/diagnose-production.py --remote`: DIAGNOSE OK (health 200, refs match, migrations up to date, PM2 online, data sanity 0 anomalies, api consistency ok).

Latest deployment note: at 2026-08-21 10:42 Asia/Shanghai, deployed a frontend-only dashboard cleanup. The matrix dashboard keeps the `登录态` and `最新采集` columns, removes the redundant top warning about accounts having no displayable yesterday data, and fixes the trend chart legend from `??` / `???` placeholders to `粉丝` / `播放量` / `互动率(%)`. Verification: `npm run typecheck --workspace=frontend`, `npm run build --workspace=frontend`, and `py -3 scripts\deploy-frontend-fast.py --skip-typecheck --allow-dirty-source` passed; public HTML references `assets/js/index-Bh3_d0rd.js`, public `/api/v1/health` returned `200`, and remote frontend backup is `/tmp/matrixflow-frontend-dist-backup-20260821103940`.

Latest deployment note: at 2026-08-21 10:24 Asia/Shanghai, deployed a frontend-only dashboard wording and freshness fix. In the multi-account table, the old `在线` column is now `登录态`, with helper text clarifying that it only reflects the desktop companion login/session check. A new `最新采集` column shows collection freshness such as `今日已采集`, `08-12 快照`, `7天未采集`, or `从未采集`; the drilldown drawer uses the same `最新采集` label. This separates historical metric snapshots from current login/session status so offline accounts can still correctly show cached historical data. Verification: `npm run typecheck --workspace=frontend`, `npm run build --workspace=frontend`, and `py -3 scripts\deploy-frontend-fast.py --allow-dirty-source` passed; public HTML references `assets/js/index-D3BlSlVJ.js`, and remote frontend backup is `/tmp/matrixflow-frontend-dist-backup-20260821102410`.

Latest deployment note: at 2026-08-20 19:46 Asia/Shanghai, deployed the account-operator data model and Doudian stale-store-id repair. Production database was backed up to `/opt/matrixflow/backups/matrixflow-pre-account-operators-20260820193941.sql.gz`; migration `202608200001_account_operators_and_store_child_tenant` created `AccountOperator`, seeded existing account owners as `PRIMARY`, added `organizationId` to WeChat/Doudian order/product/aftersale child tables, and backfilled those tenant columns from their stores. The first migration attempt failed before changing schema because the SQL file had a UTF-8 BOM; it was marked rolled back, the BOM was removed, and the migration then applied successfully. Backend deployed with `py -3 scripts\deploy-backend-safe.py --execute --migrate`, PM2 app `matrixflow` restarted, and public health returned `200`. Frontend deployed with `py -3 scripts\deploy-frontend-fast.py --skip-typecheck --allow-dirty-source`; public HTML references `assets/js/index-DBS4uENv.js`. Doudian page now treats a desktop companion `cloud_store_id` that no longer exists as stale and reconnects to the matching cloud store by shop name, so old cached cloud data remains visible instead of querying the deleted/expired id and showing `Doudian store not found`. Frontend backup is `/tmp/matrixflow-frontend-dist-backup-20260820194643`; backend backup is `/opt/matrixflow/releases/backend/20260820194118`.

Latest deployment note: at 2026-08-20 19:08 Asia/Shanghai, deployed a frontend-only Performance Ladder counting fix and removed the obsolete project `.npmrc` setting that caused npm's `Unknown project config "frozen-lockfile"` warning. The ladder now requests the current month through the end of the current day instead of freezing the end time at first module evaluation, so today's orders are included after refresh. Source, teacher, and store refund counters now include refunded orders separately from effective-order counting, so cards can show the all/effective order number and the `go refund` count together instead of collapsing to only the refund-deducted quantity. No WeChat Store or Doudian page counting logic was changed. Verification: `npm config list --location=project` produced no `frozen-lockfile` warning, `npm run typecheck --workspace=frontend` passed, `npm run build --workspace=frontend` passed, deploy succeeded with `py -3 scripts\deploy-frontend-fast.py --allow-dirty-source`, public HTML references `assets/js/index-YMYSWV9m.js`, public `/api/v1/health` returned `200`, and remote frontend backup is `/tmp/matrixflow-frontend-dist-backup-20260820190545`.

Latest deployment note: at 2026-08-18 16:08 Asia/Shanghai, deployed the dashboard usability fixes and backend avatar cache protection. Frontend changes keep the multi-account table readable at narrower widths by preserving horizontal scroll/no-wrap cells, change the shared Douyin platform badge color to the same green treatment as Video Account, and make the dashboard trend chart use a dynamic scaled y-axis with visible points so small day-to-day movement is no longer flattened by a zero baseline. Backend changes add a public cached avatar endpoint for collected account avatars and cache newly collected remote avatars under the production backend instead of storing short-lived Douyin signed avatar URLs directly. Production backend was hot-patched in compiled dist with backups `/opt/matrixflow/backend/dist/modules/platforms/platforms.service.js.bak-202608181530` and `/opt/matrixflow/backend/dist/modules/platforms/platforms.controller.js.bak-202608181530`, then PM2 `matrixflow` was restarted. Frontend deployed with `py -3 scripts\deploy-frontend-fast.py --allow-dirty-source`; the script completed upload/origin replacement but its first local public HTTPS verification timed out, then manual verification passed. Verification: backend `node --check` passed for both patched compiled files, public `/api/v1/health` returned `200`, public missing-avatar route returned `404`, public HTML references `assets/js/index-phpyqjAz.js`, and the remote backup is `/tmp/matrixflow-frontend-dist-backup-20260818160335`.

Latest production repair note: at 2026-08-18 15:10 Asia/Shanghai, repaired a WeChat Store/Video Shop order sync outage where page ranges after 2026-08-14 could appear as `0` orders. Root cause was a production disk-full event on 2026-08-14 (`No space left on device`) during WeChat order sync, leaving the in-process sync lock stuck so the 5-minute scheduler kept skipping with `sync already running`. Repair cleared the stuck lock with a PM2 backend restart, let startup sync backfill orders, and hot-patched the compiled production WeChat store service with 30s upstream fetch timeouts, a 4-minute per-store sync timeout, and failure-status marking when a store exceeds the timeout. Production hotfix backups: `/opt/matrixflow/backend/dist/modules/wechat-store/wechat-store.service.js.bak-202608181445` and `/opt/matrixflow/backend/dist/modules/wechat-store/wechat-store.service.js.bak-202608181505`. Verification: public health `200`; all 3 WeChat stores ended with `syncStatus=ok`; post-recovery counts were `Tangshang Pixing` today `11/9 effective`, yesterday `33/25 effective`; `Pixing Education` today `8/5 effective`, yesterday `19/15 effective`; `Pixing Culture` today `0/0 effective`, yesterday `9/7 effective`.

Latest release note: Frontend-only `业绩天梯` 有效订单 口径 alignment deployed. By default the ladder now follows the two store pages' 有效订单 counts instead of its earlier custom shipped/source-detail rule: 微信小店 excludes 待付款, 已取消, and order status `200` 已退款 without requiring `ship_time > 0`; 抖店 reuses the existing Doudian revenue/effective-order helpers. The `去退款` control is now an explicit extra deduction switch rather than the default counting mode, so the first-view total matches platform 有效订单 口径; chips show `微信小店：有效订单` and `抖店：有效订单`. Production frontend is deployed as `assets/js/index-0aA07nNK.js` with ladder chunk `assets/js/PerformanceLadderView-fDYB8eEx.js`. Verification: `npm run typecheck --workspace=frontend`, `npm run build --workspace=frontend`, and `py -3 scripts\deploy-frontend-fast.py --allow-dirty-source` passed remote ref, origin ref, and public ref checks; deployment backup is `/tmp/matrixflow-frontend-dist-backup-20260814190621`.

Latest backend/companion release note: Backend guards prevent WeChat Video `sph...` platform IDs from being saved as account nicknames, and Pixingyun Mate `3.2.38` restores scan-bind nickname extraction from the WeChat Video page DOM. The affected production account `cmsfq2tvw11tz13kl7o8hh62e` now shows the real nickname `晶哥来了-`. Backend backup for the guard release: `/opt/matrixflow/releases/backend/20260805145148`.

Latest Doudian/companion update note: Pixingyun Mate `3.2.66` is the current public companion release. It supersedes `3.2.65` only for packaging/icon stability: automatic updates use the lightweight ZIP `pixingyun-mate-portable-3.2.66.zip` (66,343,759 bytes, SHA256 `8910300781a5ed6cdc4306ade7a359ac42a0f5c56ebcf8c2b015d4a5430ad423`), while the full website/manual installer `pixingyun-mate-setup-3.2.66.exe` (394,599,436 bytes, SHA256 `280a83129587fc4c2a468192cec0acd08a07e9bfdb22237647cddc047a4b0ea1`) includes the dedicated Playwright Chromium under `_internal/ms-playwright/chromium-1223`. `3.2.66` fixes Windows shortcut icon instability by bundling `_internal\app_icon.ico` and making installer-created desktop/start-menu shortcuts plus uninstall display icon point to that fixed file instead of `{app}\pixingyun-mate.exe` or old versioned icon filenames. The `3.2.65` browser lifecycle behavior remains: context shutdowns time out instead of hanging, cleanup targets only Chrome/Edge processes whose command line contains a Pixingyun-owned profile path, Doudian launch retries profile-lock failures after targeted cleanup, and Doudian manual login/sync prefer real system Chrome/Edge to reduce captcha blank-screen risk. Public manifest version is `3.2.66`, main update URL points to the ZIP, installer metadata points to the full setup exe, and Range checks confirm the ZIP size `66,343,759` and setup size `394,599,436`. This release does not change collection, Doudian, captcha, or browser lifecycle logic.

Latest edge performance note: Cloudflare Worker `matrixflow-origin-proxy` version `5834967d-dc1a-4128-a924-e031b297597e` is active (deployed via cached OAuth login, `--oauth` mode supported). Caching: `/assets/*` 30-day immutable; SPA HTML edge-cached 5 minutes (deploy purges it; origin serves `no-cache` + ETag so browsers revalidate with 304); `/uploads/*` 24h; `/downloads/*` 24h (mutable aliases bypass); `/api/*`, `/ws/*`, companion manifests uncached.

Older frontend refs were removed from the public server and now return `404`.
Do not use historical bundle names to decide what is current; verify the public
HTML entry bundle instead.

## Production Backend

- Backend process: PM2 app `matrixflow`
- Backend path on server: `/opt/matrixflow/backend`
- Latest production infrastructure repair:
  - PostgreSQL and Redis were backed up/recreated on 2026-07-22 so Docker now publishes them only on `127.0.0.1`.
  - Production database backup before the port-binding change: `/opt/matrixflow/backups/matrixflow-pre-portbind-20260722122520.sql.gz`.
  - Production `docker-compose.yml` now uses stable external volumes `pgdata` and `redisdata` to fail closed instead of creating an empty DB/Redis volume during future recreates.
  - Redis data was copied from the old anonymous Docker volume into the stable `redisdata` volume before recreation.
  - `matrixflow-tunnel` was recreated with the same token and host network, but without a shell-form Docker healthcheck because the `cloudflare/cloudflared` image has no `/bin/sh`.
  - Current production Docker status: `matrixflow-db` and `matrixflow-redis` healthy on localhost-only ports, `matrixflow-tunnel` running, `matrixflow-frontend` running.
  - Cloudflare Worker `matrixflow-origin-proxy` is active on `ddddkiii.com/*` and `www.ddddkiii.com/*`; public health responses include `x-matrixflow-entry: cloudflare-worker`.
  - Worker origin resolution uses `origin.ddddkiii.com`, a proxied CNAME to the existing Cloudflare Tunnel target. Do not change it to the ECS public IP path; direct IP HTTP requests return the cloud provider ICP filing block instead of the app.
  - 2026-08-27 repair note: public traffic returned intermittent Cloudflare `530/1033` and `502` while ECS origin health was `200`. The tunnel container is managed by `/opt/matrixflow/docker-compose.yml` and now uses `tunnel --region us --edge-ip-version 4 --protocol http2 run --token ${CF_TUNNEL_TOKEN}`. Do not restore the old custom `--dns-resolver-addrs 100.100.2.136:53/100.100.2.138:53` flags; they can make cloudflared fail to resolve the remote-managed ingress origin `localhost`.
  - The ECS host has `/etc/sysctl.d/99-cloudflared-quic.conf` with `net.core.rmem_max=7500000` and `net.core.wmem_max=7500000`; keep this for cloudflared QUIC stability.
  - The tunnel guard at `/etc/cron.d/matrixflow-tunnel-guard` runs every minute and now recreates the compose-managed tunnel using the same stable parameters after repeated public failures with healthy origin.
  - 2026-07-27 Worker repair note: a valid Cloudflare API token was provided, `matrixflow-origin-proxy` was redeployed, and Worker routes are active again. The Worker must use `ORIGIN_HOST=ddddkiii.com` with `ORIGIN_RESOLVE_HOST=origin.ddddkiii.com`; do not point the Worker directly at the ECS public IP because Cloudflare returns error `1003`.
  - Use `py -3 scripts\deploy-cloudflare-worker.py` to dry-run and verify the Worker marker header; use `--execute` only with a token that can edit both Workers scripts and Worker routes.
  - `py -3 scripts\diagnose-production.py --remote` now includes production data sanity counts, anomaly checks, and read-only API/DB consistency checks. Use `--require-worker-route` when Worker routing is mandatory for a release gate.
- Latest backend deployment included:
  - Auth login accepts `identifier` or legacy `email`, so users can log in with email/password or phone/password when `User.phone` is set
  - Super-admin user management returns, creates, searches, and edits user phone numbers
  - Super-admin organization user creation allows phone-only users when email is blank; `User.email` is nullable in production after migration `202607290001_allow_user_email_nullable`
  - WeChat Store creation validates required name/AppID/AppSecret and rejects duplicate AppIDs with a friendly error
  - `DoudianBrowserModule` in `dist/app.module.js`
  - `doudian-browser` module files
  - Doudian browser cache routes require authentication; anonymous store/product/summary requests return `401`
  - Doudian store list responses omit companion/server `profilePath`
  - Public registration is disabled by default in production unless `PUBLIC_REGISTRATION_ENABLED=true`; anonymous register attempts return `403`
  - Dashboard overview, platform stats, comparison, and account detail list all apply the selected platform filter to the backend query
  - MCP key and connection management requires `SUPER_ADMIN`, `OWNER`, or `ADMIN`; ordinary `MEMBER` requests to `/api/v1/mcp/keys` return `403`
  - MCP tokens are masked in the UI/config previews; copy buttons still copy the real value intentionally
  - Exposed MCP keys from the pre-fix screenshot were rotated after deployment: `1` DB key and `1` env key
  - `prisma/schema.prisma` containing `DoudianStore`, `DoudianStoreOrder`, `DoudianStoreProduct`, and `DoudianStoreAftersale`
  - Prisma Client regeneration via `npx prisma generate`
  - PM2 restart
- Latest production dependency repair:
  - Runtime reinstall completed with `npm ci --omit=dev --ignore-scripts --legacy-peer-deps`
  - `form-data` is `4.0.6`
  - `socket.io-adapter` is `2.5.8` and `ws` is `8.21.1`
  - Backend `playwright` is explicitly declared and installed as `1.61.1`
  - Remaining `npm audit --omit=dev` count is `15` (`4` high, `11` moderate), mostly Nest/ECharts major-upgrade chains plus Nest transitive `multer`
- Verified public endpoints:
  - `GET https://ddddkiii.com/api/v1/health` -> `200`
  - `GET https://ddddkiii.com/` -> `200`, serving `assets/js/index-C2Ibt1gL.js`
  - Anonymous `POST https://ddddkiii.com/api/v1/auth/register` -> `403`
  - Anonymous `GET https://ddddkiii.com/api/v1/doudian-browser/stores` -> `401`
  - Anonymous `POST https://ddddkiii.com/api/v1/doudian-browser/stores` -> `401`
  - Anonymous `POST https://ddddkiii.com/api/v1/doudian-browser/stores/probe/upload` -> `401`
  - Anonymous `GET https://ddddkiii.com/api/v1/doudian-browser/shop/products?store_id=probe` -> `401`
  - Anonymous `GET https://ddddkiii.com/api/v1/doudian-browser/shop/summary?store_id=probe&start=1&end=1&mode=today` -> `401`
  - Anonymous `POST https://ddddkiii.com/api/v1/accounts/probe/cookies` -> `401`
  - Authenticated `MEMBER` `GET https://ddddkiii.com/api/v1/mcp/keys` -> `403`
  - `GET https://ddddkiii.com/downloads/pixingyun-mate-portable-3.2.55.exe` with `HEAD` -> `200`, `Content-Length: 84448498`, `Content-Type: application/octet-stream`
  - `GET https://ddddkiii.com/downloads/pixingyun-mate-setup-3.2.55.exe` with `HEAD` -> `200`, `Content-Length: 294865354`, `Content-Type: application/octet-stream`
  - `GET https://ddddkiii.com/downloads/pixingyun-mate-setup.exe?v=3.2.55` with `HEAD` -> `200`, `Content-Length: 294865354`, `Content-Type: application/octet-stream`
  - `GET https://ddddkiii.com/downloads/pixingyun-mate-setup-latest.exe?v=3.2.55` with `HEAD` -> `200`, `Content-Length: 294865354`, `Content-Type: application/octet-stream`
  - Origin `pixingyun-mate-setup.exe` and versioned setup hash both match `3.2.55`; no-query public fixed aliases still show an old Worker/Cloudflare cached `3.2.54` response despite purge. Prefer manifest/versioned installer URLs.
  - `GET https://ddddkiii.com/companion-updates/latest.json` -> `200`, `application/json`, version `3.2.61`

## Pixingyun Mate

- Current public companion release: `3.2.61`
- In-app update ZIP: `https://ddddkiii.com/downloads/pixingyun-mate-portable-3.2.61.zip`
- Full installer EXE: `https://ddddkiii.com/downloads/pixingyun-mate-setup-3.2.61.exe`
- Stable website installer link on origin/public: `https://ddddkiii.com/downloads/pixingyun-mate-setup.exe`, verified at `258,658,824` bytes after Cloudflare purge.
- Local stable install: `D:\Pixingyun\pixingyun-mate.exe`, updated to `3.2.61` through real in-app update testing; update log confirmed `Update health check passed`.
- `3.2.61` replaces withdrawn `3.2.59`. The withdrawn build can start when run directly from the build directory, but an actual in-app update attempt produced `Failed to load Python DLL ... _MEI...\\python312.dll` on first restart. Do not republish `3.2.59`.
- `3.2.58` rebuilds the `3.2.57` WeChat Video collector fix with the stable Python 3.12 runtime to avoid `python313.dll` startup failures during update. Verified local packaged health returns `3.2.58`.
- `3.2.57` was superseded immediately because it was built with Python 3.13 and could fail at startup with `Failed to load Python DLL ... python313.dll`.
- `3.2.56` is the first fully verified AI standard editing release after FFmpeg/ffprobe/Whisper were installed locally. Verified: create fresh JianYing draft, detect breath/silence gaps, generate 3 Whisper subtitle items, select/apply 2 effects and 2 filters through DeepSeek/capcut, and render an 8-second preview. It also changes effect/filter write failures to surface as `warn` instead of `done`.
- `3.2.55` fixes the custom AI command path: AI-generated `auto` or JianYing draft-name project args are normalized to absolute draft paths before `capcut-cli` execution, so read-only commands such as `info`, `tracks`, and `texts` do not fail with "No draft found" when the UI selected a JianYing project.
- `3.2.54` fixes the standard AI clipping chain after real local packaged testing: missing FFmpeg/ffprobe and Whisper now produce warnings instead of crashing, existing JianYing draft text is reused when Whisper is unavailable, capcut enum output is no longer truncated, `(non-ascii)` enum slugs are normalized to usable resource IDs/names, and DeepSeek V4 calls have larger timeout/token budgets plus empty-response protection. Verified with `deepseek-v4-flash`: standard mode read 3 existing text items and applied JianYing effects/filters; custom mode completed an `info` command. FFmpeg/Whisper remain optional local dependencies: without them, auto speech-to-text, breath/silence detection, and preview rendering are skipped.
- `3.2.53` fixes AI video editing model selection: the companion UI now lets users choose `deepseek-v4-flash` or `deepseek-v4-pro`, API requests validate and pass the selected model, DeepSeek calls no longer hardcode `deepseek-chat`, packaged builds tolerate missing `loguru`, and `capcut-cli` calls are restricted to an allowed command set.
- `3.2.52` adds the AI video editing / JianYing integration path: standard mode uses built-in JianYing scene effects and filters, and DeepSeek can match subtitle content to those built-in materials through `capcut-cli`.
- `3.2.51` fixes WeChat Video Data Center compact `日` / `周` / `月` period switching so `近30天` collection actually clicks `月`; restores the packaged app icon; and repairs the local demo machine autostart shortcut to launch the installed exe directly.
- `3.2.50` fixes Douyin bot detection triggering captchas: removed `--no-sandbox` and 8 other automation flags, changed DOUYIN collection to headless=False with offscreen hidden window, stopped UA override for DOUYIN, added `_is_captcha_page()` detection and manual captcha solving with Windows API `ShowWindow`.
- `3.2.48` eliminates PowerShell window popup during updates by replacing CMD launcher with VBScript launcher (`wscript.exe`).
- `3.2.47` fixes Douyin scan-bind login path: added login auto-detection, dashboard page load wait, and auto-reload on missing dashboard.
- `3.2.40` fixes Doudian browser anti-bot detection: realistic UA override, removed suspicious `--disable-features` flag, system Chrome preference, `cdc_` variable cleanup, security block page detection, lenient store name matching.
- `3.2.39` improves Doudian safety UX: cross-store login/sync mismatches are still blocked, but now explain the exact expected vs logged-in shop and recovery action.
- `3.2.38` restores WeChat Video scan-bind nickname extraction by matching `视频号ID` through Unicode escapes, reading the nearby display name, and preserving existing safe cloud nicknames when a scan pass only has a placeholder.
- `3.2.37` blocks WeChat Video `sph...` platform IDs from being saved as nicknames.
- `3.2.36` fills missing WeChat Video period metrics such as `month_total` through scoped card dropdown parsing when API capture returns only partial periods.
- `3.2.35` hardens the updater after a local `3.2.33` half-download failure: package downloads retry and resume with Range requests, verify manifest size before SHA256, and report incomplete downloads clearly.
- `3.2.34` fixes WeChat Video avatar and period collection: home-card avatar extraction, separate `关注者数据` period collection, and scoped `视频数据` key-metric period dropdowns.
- `3.2.33` makes in-app updates observable with a background update job, package size, download progress, verify/restart/error states, and duplicate-update protection.
- Full installer bundles offline Microsoft Edge WebView2 Runtime for Win10/Win11 compatibility.
- If a pre-`3.2.33` companion appears stuck while updating, use the full installer once instead of waiting on the old no-progress updater.
- If the user's own desktop shortcut appears not updated, inspect the shortcut target and running process path. On 2026-08-05 the old shortcut pointed to `D:\Pixingyun Mate\pixingyun-mate.exe` while the current install was `D:\Pixingyun\pixingyun-mate.exe`.

## Demo QA Snapshot

- Authenticated production read-only QA used a short-lived token for an existing active super-admin user; no demo data was created or modified.
- Real API counts verified: `13` accounts, `2` Doudian stores, `75` daily stats, `685` Doudian orders, `11` Doudian products, `616` Doudian aftersales, `3` WeChat stores, `0` teams, and `659` notifications.
- Extended production route QA at `C:\Users\EDY\jujuju\artifacts\qa-20260719-production-extra` loaded dashboard, content insights, accounts, WeChat store, Doudian, team, permissions, platforms, MCP, Feishu notifications, calendar, profile, password, and admin. All returned `200`, did not redirect to login, had no page errors, and showed no Mock/demo/fake/example/sample-data markers.
- The refreshed `mcp.png` screenshot is safe to keep: production page text was checked against the active MCP tokens and `leakedTokenCount=0`.
- Latest verification passed: public rollback manifest reports `3.2.58`, public stable portable/setup links return expected content lengths, local `D:\Pixingyun` `/health` returns `3.2.58`, local update check returns `available=false`, and the withdrawn `3.2.59` build is no longer offered to users.
- Latest verified pages with Playwright screenshots under `C:\Users\EDY\jujuju\artifacts\qa-20260719-production`:
  - `dashboard.png`
  - `accounts.png`
  - `monetization.png`
  - `doudian.png`
  - `team.png`
  - `permissions.png`
  - `profile.png`
  - `admin.png`
  - `login-registration-disabled.png`
- Browser QA confirmed these routes did not redirect to login, produced no page errors, and did not show `Mock`, demo-mode, example-data, test-data, or fake-data text.
- Login QA confirmed the production login page does not expose the register tab.
- Authenticated platform filter QA confirmed `platform=DOUYIN` returns only `DOUYIN` data for overview, platform stats, comparison, and account detail list.
- Permission management now shows `鏆傛棤鐪熷疄鍥㈤槦鏁版嵁` when production has no teams instead of showing editable default permission rows as if they were real team data.
- AI assistant is not part of the July 19 demo path. Its anomaly auto-fill no longer derives sample values from total followers; it only fills from the real follower-trend API and otherwise clears the form.
- Account CSV export was clicked in production and downloaded `璐﹀彿鍒楄〃_2026-07-18.csv`.
- Production Docker now reports Postgres/Redis listening on `127.0.0.1:5432` and `127.0.0.1:6379`; public diagnostics no longer report sensitive DB/Redis bind findings.
- Post-recovery production DB counts stayed intact: `13` accounts, `75` daily stats, `2` Doudian stores, `685` Doudian orders, `11` Doudian products, `616` Doudian aftersales, `3` WeChat stores.
- Unknown Origin CORS probe returned no `Access-Control-Allow-Origin`.
- 2026-07-22 live smoke QA saved screenshots under `C:\Users\EDY\jujuju\artifacts\qa-20260722-live-smoke`; `/` and `/login` returned `200`, produced no page errors, and had no meaningful failed business-resource requests.
- 2026-07-22 Worker live smoke QA saved screenshots under `C:\Users\EDY\jujuju\artifacts\qa-20260722-worker-live-smoke`; desktop/mobile `/` and `/login` returned `200`, Vue app rendered, and there were no page errors, console errors, failed same-origin business requests, or same-origin 4xx/5xx resource responses.
- 2026-07-22 production data sanity checks returned: `13` accounts, `83` daily stats, `2` Doudian stores, `3` WeChat stores, `687` Doudian orders, `11` Doudian products, `616` Doudian aftersales; negative metric rows, orphan rows, future daily stats, and blank account nicknames were all `0`.
- 2026-07-22 production API/DB consistency checks passed: analytics overview account/post totals, followers, likes, accounts-list total, and Doudian store count matched DB aggregates, and Doudian store API responses did not expose `profilePath`.
- 2026-07-28 10:49 Asia/Shanghai public companion release `3.2.6` was rebuilt and uploaded to `/downloads/pixingyun-mate-portable.zip`; the live file has SHA256 `91301fd7ee864da17dfe8e83257e743e0f6fc5ef385891d4bfa48524fb48e6af`, size `81635049` bytes, and ZIP magic `504b0304`. The update manifest at `/companion-updates/latest.json` serves the same SHA. The release fixes Douyin collection helper parsing and displays saved Douyin post counts instead of `0` when profile totals are unavailable.
- 2026-07-28 11:29 Asia/Shanghai public companion release `3.2.7` was rebuilt, started locally, and uploaded to `/downloads/pixingyun-mate-portable.zip`; the live file has SHA256 `95fca2994881932087b20b516b16472baea966d0bb5a13805d4d0a4268d82800`, size `81639257` bytes, and ZIP magic `504b0304`. The update manifest at `/companion-updates/latest.json` serves version `3.2.7` and the same SHA. The release adds visible Doudian login-state badges and refresh-time login checks for store profiles.
- 2026-07-28 14:41 Asia/Shanghai public companion release `3.2.8` was rebuilt, started locally, and uploaded to `/downloads/pixingyun-mate-portable.zip`; the live file has SHA256 `67ad12b5f4e6d98590e0bba3463f17a9676e0e830286de3a2d4e4af01609eeef`, size `81620213` bytes, and ZIP magic `504b0304`. The update manifest at `/companion-updates/latest.json` serves version `3.2.8` and the same SHA. The release prevents WeChat Video collection from overwriting account names with legal entity names. Production account `cmqho4tiauh6t8zofg4edpmh0` was corrected from `娣卞湷甯傛姭鏄熸暀鑲叉枃鍖栨湁闄愬叕鍙竊 to `鍗㈡収楂樼淮鐮村眬`, and the backend `platforms.service.js` hotfix was deployed with backup `/opt/matrixflow/releases/backend-hotfix/20260728143731`.
- 2026-07-30 10:47 Asia/Shanghai public companion release `3.2.18` was rebuilt and uploaded to `/downloads/pixingyun-mate-portable.zip`; the live file has SHA256 `59314b0b9dbf3cc06aae341e5972abe9b2fd9f1376511b799f5fafab185e5737`, size `81646796` bytes, and ZIP magic `504b0304`. The update manifest at `/companion-updates/latest.json` serves version `3.2.18`. The release lets Pixingyun Mate login with either email or phone number by sending the cloud API `identifier + password` while preserving existing saved email credentials.
- 2026-07-30 11:00 Asia/Shanghai public companion release `3.2.19` was rebuilt and uploaded to `/downloads/pixingyun-mate-portable.zip`; the live file has SHA256 `63e98fe86e817ee0aedfc4b3e81238f811424fc69ef3d0da5838d675f3da15e8`, size `81630140` bytes, and ZIP magic `504b0304`. The update manifest at `/companion-updates/latest.json` serves version `3.2.19`. The release adds Pixingyun Mate Feishu login through the website OAuth callback and a validated localhost handoff.
- 2026-08-05 11:26 Asia/Shanghai public companion release `3.2.34` was rebuilt and uploaded to `/downloads/pixingyun-mate-portable.zip`; the live file has SHA256 `6369da1e18787949aa4680600e8bc74af4b965ad6d35cd0c1e818a762533c0e7`, size `59707771` bytes, and ZIP magic `504b0304`. The update manifest at `/companion-updates/latest.json` serves version `3.2.34` and includes installer SHA256 `a1d73e2352cdb0620631b3cea2d0e1ccee72f787a6d41dc9faaf375d1c2b2f63`, size `252925895`, magic `4d5a5000`. The release fixes WeChat Video avatar capture and the extra data-center clicks for follower/video period metrics.
- 2026-08-05 11:52 Asia/Shanghai public companion release `3.2.35` was rebuilt and uploaded to `/downloads/pixingyun-mate-portable.zip`; the live file has SHA256 `b49a0dbc092ba1f4b56558fb88e24571a6fb057edf43791d84574acf5c0d8a6c`, size `59691847` bytes, and ZIP magic `504b0304`. The update manifest at `/companion-updates/latest.json` serves version `3.2.35` and includes installer SHA256 `6cfbba531f093dccd46f856ddb6871987343b1049990ab20f8582b656bf250bb`, size `252925679`, magic `4d5a5000`. The release fixes interrupted companion update downloads by adding retry/resume and expected-size validation.

Troubleshooting notes:

- If Doudian routes return `404`, the backend is running an older app module.
- If Doudian routes return `Cannot read properties of undefined (reading 'findMany')`, first verify `/opt/matrixflow/backend/prisma/schema.prisma` contains the Doudian models. The safe backend deploy script was fixed at 2026-07-03 01:33 Asia/Shanghai to replace the remote `prisma` directory before generating Prisma Client.
- If companion upload returns `530`, verify the backend module and Cloudflare/origin health before touching local login profiles.
- Do not run dev-dependency installs on the 2G production ECS before demos. Use the safe deploy script's production-only dependency path or manually run `npm ci --omit=dev --ignore-scripts --legacy-peer-deps` during recovery.

## Desktop Companion

- Current release source:
  `C:\Users\EDY\jujuju\desktop-companion\release-dist-3252\pixingyun-mate.exe`
- Public download URL:
  `https://ddddkiii.com/downloads/pixingyun-mate-portable-3.2.52.exe`
- Public installer URL:
  `https://ddddkiii.com/downloads/pixingyun-mate-setup-3.2.52.exe`
- Public update manifest:
  `https://ddddkiii.com/companion-updates/latest.json`
- Release size: `84439741` bytes
- Release SHA256: `06ef37b2183655cfa41a05362fd5523aa02ecf96db617fde7c837b068b4da702`
- Installer size: `294854504` bytes
- Installer SHA256: `B1C71139F8AB88CE893B2D4F04A2FE8AD5154DC80CCF87DAE072C7E959F9EB44`
- Current local install: `D:\Pixingyun\pixingyun-mate.exe`, health version `3.2.52` at `2026-08-10 14:49 Asia/Shanghai`

The latest companion includes:

- Doudian multi-account isolated profiles.
- Doudian delete-store support.
- Doudian scheduled collection: daytime every 30 minutes, nighttime every 2 hours.
- Doudian empty-payload guard for `NoneType is not iterable`.
- Version `3.2.35` update checks through `/companion-updates/latest.json`.
- Update downloads now retry/resume interrupted ZIP or installer transfers and verify the expected byte size before SHA256.
- Native-window startup failure now falls back to the system browser instead of crashing when pywebview/pythonnet cannot initialize on another user's PC.
- Update apply logic preserves local config, database files, browser profiles, and login state.
- `/health` includes local diagnostics for easier support.
- Account binding includes dedicated `瑙嗛鍙烽噰闆哷 and `鎶栭煶閲囬泦` controls.
- Account list auto-refresh is silent and keeps toolbar button widths stable.
- Douyin collection no longer runs a fragile page-title regex in the helper parser, and account lists display saved post counts when older runs left `video_count` at `0`.
- WeChat Video nickname writes now reject likely legal entity names such as `鏈夐檺鍏徃`, so collection cannot overwrite `鍗㈡収楂樼淮鐮村眬` with the certified company subject.
- WeChat Video collection now reads the visible home-card avatar, enters `关注者数据` for follower periods, and scopes `视频数据` period clicks to the `关键指标` card.
- WeChat Video compact period tabs now map `近30天` to `月`, `近7天` to `周`, and `昨日数据` to `日`, then click the scoped card control before parsing metrics.
- Doudian store management shows `宸茬櫥褰昤, `鐧诲綍澶辨晥`, or `鏈‘璁 status badges and the refresh button can probe each store profile without disturbing an active sync/login job.
- Login accepts either an email address or a phone number and sends the same `identifier` field used by the website login API.
- Feishu login opens the website OAuth flow and receives the authenticated session through a validated `127.0.0.1:5409` callback.

Local companion source now pins Chrome CDP to `127.0.0.1` with `--remote-debugging-address=127.0.0.1`; current public version `3.2.52` retains that source hardening. The demo machine was checked with `5409` and `9222` listening only on `127.0.0.1`.

Do not treat old June 2026, July 22, `3.2.4`–`3.2.51` companion zip/exe files as latest, even if their Chinese names look relevant or are mojibaked in terminal output. The latest release package is `pixingyun-mate-portable-3.2.52.exe` above.

Do not treat old `dist_backup`, `dist_fixed`, `build_fixed`, or `release` folders as current.

## Doudian Stores

Current local stores:

- Local profile `85bc297a46e2`, UI name `鍞愬晢鎶槦`, cloud store `cmr0qai7f1188xz13dm8ywxvk`
- Local profile `ca8d0b5d5919`, UI name `鎶槦鏁欒偛`, cloud store `cmr3fkxxc635cr5jhwi1q4rls`

Login state is not stored in old companion folders. It lives under:

`%LOCALAPPDATA%\MatrixFlow\browser-profiles\doudian`

Do not delete that profile directory unless the user explicitly asks to remove Doudian login state.
