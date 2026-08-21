# Latest Deployment Marker

Last verified: 2026-08-21 10:42 Asia/Shanghai

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
- Current deployed entry bundle: `assets/js/index-Bh3_d0rd.js`
- Current dashboard page chunk: `assets/js/MatrixDashboard-CBg4-QvC.js`
- Current Doudian page chunk: `assets/js/DoudianView-D77maavl.js`
- Current Doudian source-detail page chunk: `assets/js/DoudianSourceDetailView-DArwBQp8.js`
- Current WeChat store page chunk: `assets/js/MonetizationView-bsaYOSXC.js`
- Current WeChat source-detail page chunk: `assets/js/WechatSourceDetailView-IY-5-Rbi.js`
- Current performance ladder page chunk: `assets/js/PerformanceLadderView-C3oXgGHm.js`
- Current permission page chunk: `assets/js/PermissionView-D9V1C4m5.js`
- Current login page chunk: `assets/js/LoginView-CD6Xuz-H.js`
- Current MCP page chunk: `assets/js/MCPConnectionView-W59MLoKJ.js`
- Current admin page chunk: `assets/js/AdminView-BdRTFg9H.js`
- Local build source: `C:\Users\EDY\jujuju\frontend\dist`

Latest deployment note: at 2026-08-21 10:42 Asia/Shanghai, deployed a frontend-only dashboard cleanup. The matrix dashboard keeps the `登录态` and `最新采集` columns, removes the redundant top warning about accounts having no displayable yesterday data, and fixes the trend chart legend from `??` / `???` placeholders to `粉丝` / `播放量` / `互动率(%)`. Verification: `npm run typecheck --workspace=frontend`, `npm run build --workspace=frontend`, and `py -3 scripts\deploy-frontend-fast.py --skip-typecheck --allow-dirty-source` passed; public HTML references `assets/js/index-Bh3_d0rd.js`, public `/api/v1/health` returned `200`, and remote frontend backup is `/tmp/matrixflow-frontend-dist-backup-20260821103940`.

Latest deployment note: at 2026-08-21 10:24 Asia/Shanghai, deployed a frontend-only dashboard wording and freshness fix. In the multi-account table, the old `在线` column is now `登录态`, with helper text clarifying that it only reflects the desktop companion login/session check. A new `最新采集` column shows collection freshness such as `今日已采集`, `08-12 快照`, `7天未采集`, or `从未采集`; the drilldown drawer uses the same `最新采集` label. This separates historical metric snapshots from current login/session status so offline accounts can still correctly show cached historical data. Verification: `npm run typecheck --workspace=frontend`, `npm run build --workspace=frontend`, and `py -3 scripts\deploy-frontend-fast.py --allow-dirty-source` passed; public HTML references `assets/js/index-D3BlSlVJ.js`, and remote frontend backup is `/tmp/matrixflow-frontend-dist-backup-20260821102410`.

Latest deployment note: at 2026-08-20 19:46 Asia/Shanghai, deployed the account-operator data model and Doudian stale-store-id repair. Production database was backed up to `/opt/matrixflow/backups/matrixflow-pre-account-operators-20260820193941.sql.gz`; migration `202608200001_account_operators_and_store_child_tenant` created `AccountOperator`, seeded existing account owners as `PRIMARY`, added `organizationId` to WeChat/Doudian order/product/aftersale child tables, and backfilled those tenant columns from their stores. The first migration attempt failed before changing schema because the SQL file had a UTF-8 BOM; it was marked rolled back, the BOM was removed, and the migration then applied successfully. Backend deployed with `py -3 scripts\deploy-backend-safe.py --execute --migrate`, PM2 app `matrixflow` restarted, and public health returned `200`. Frontend deployed with `py -3 scripts\deploy-frontend-fast.py --skip-typecheck --allow-dirty-source`; public HTML references `assets/js/index-DBS4uENv.js`. Doudian page now treats a desktop companion `cloud_store_id` that no longer exists as stale and reconnects to the matching cloud store by shop name, so old cached cloud data remains visible instead of querying the deleted/expired id and showing `Doudian store not found`. Frontend backup is `/tmp/matrixflow-frontend-dist-backup-20260820194643`; backend backup is `/opt/matrixflow/releases/backend/20260820194118`.

Latest deployment note: at 2026-08-20 19:08 Asia/Shanghai, deployed a frontend-only Performance Ladder counting fix and removed the obsolete project `.npmrc` setting that caused npm's `Unknown project config "frozen-lockfile"` warning. The ladder now requests the current month through the end of the current day instead of freezing the end time at first module evaluation, so today's orders are included after refresh. Source, teacher, and store refund counters now include refunded orders separately from effective-order counting, so cards can show the all/effective order number and the `go refund` count together instead of collapsing to only the refund-deducted quantity. No WeChat Store or Doudian page counting logic was changed. Verification: `npm config list --location=project` produced no `frozen-lockfile` warning, `npm run typecheck --workspace=frontend` passed, `npm run build --workspace=frontend` passed, deploy succeeded with `py -3 scripts\deploy-frontend-fast.py --allow-dirty-source`, public HTML references `assets/js/index-YMYSWV9m.js`, public `/api/v1/health` returned `200`, and remote frontend backup is `/tmp/matrixflow-frontend-dist-backup-20260820190545`.

Latest deployment note: at 2026-08-18 16:08 Asia/Shanghai, deployed the dashboard usability fixes and backend avatar cache protection. Frontend changes keep the multi-account table readable at narrower widths by preserving horizontal scroll/no-wrap cells, change the shared Douyin platform badge color to the same green treatment as Video Account, and make the dashboard trend chart use a dynamic scaled y-axis with visible points so small day-to-day movement is no longer flattened by a zero baseline. Backend changes add a public cached avatar endpoint for collected account avatars and cache newly collected remote avatars under the production backend instead of storing short-lived Douyin signed avatar URLs directly. Production backend was hot-patched in compiled dist with backups `/opt/matrixflow/backend/dist/modules/platforms/platforms.service.js.bak-202608181530` and `/opt/matrixflow/backend/dist/modules/platforms/platforms.controller.js.bak-202608181530`, then PM2 `matrixflow` was restarted. Frontend deployed with `py -3 scripts\deploy-frontend-fast.py --allow-dirty-source`; the script completed upload/origin replacement but its first local public HTTPS verification timed out, then manual verification passed. Verification: backend `node --check` passed for both patched compiled files, public `/api/v1/health` returned `200`, public missing-avatar route returned `404`, public HTML references `assets/js/index-phpyqjAz.js`, and the remote backup is `/tmp/matrixflow-frontend-dist-backup-20260818160335`.

Latest production repair note: at 2026-08-18 15:10 Asia/Shanghai, repaired a WeChat Store/Video Shop order sync outage where page ranges after 2026-08-14 could appear as `0` orders. Root cause was a production disk-full event on 2026-08-14 (`No space left on device`) during WeChat order sync, leaving the in-process sync lock stuck so the 5-minute scheduler kept skipping with `sync already running`. Repair cleared the stuck lock with a PM2 backend restart, let startup sync backfill orders, and hot-patched the compiled production WeChat store service with 30s upstream fetch timeouts, a 4-minute per-store sync timeout, and failure-status marking when a store exceeds the timeout. Production hotfix backups: `/opt/matrixflow/backend/dist/modules/wechat-store/wechat-store.service.js.bak-202608181445` and `/opt/matrixflow/backend/dist/modules/wechat-store/wechat-store.service.js.bak-202608181505`. Verification: public health `200`; all 3 WeChat stores ended with `syncStatus=ok`; post-recovery counts were `Tangshang Pixing` today `11/9 effective`, yesterday `33/25 effective`; `Pixing Education` today `8/5 effective`, yesterday `19/15 effective`; `Pixing Culture` today `0/0 effective`, yesterday `9/7 effective`.

Latest release note: Frontend-only `业绩天梯` 有效订单 口径 alignment deployed. By default the ladder now follows the two store pages' 有效订单 counts instead of its earlier custom shipped/source-detail rule: 微信小店 excludes 待付款, 已取消, and order status `200` 已退款 without requiring `ship_time > 0`; 抖店 reuses the existing Doudian revenue/effective-order helpers. The `去退款` control is now an explicit extra deduction switch rather than the default counting mode, so the first-view total matches platform 有效订单 口径; chips show `微信小店：有效订单` and `抖店：有效订单`. Production frontend is deployed as `assets/js/index-0aA07nNK.js` with ladder chunk `assets/js/PerformanceLadderView-fDYB8eEx.js`. Verification: `npm run typecheck --workspace=frontend`, `npm run build --workspace=frontend`, and `py -3 scripts\deploy-frontend-fast.py --allow-dirty-source` passed remote ref, origin ref, and public ref checks; deployment backup is `/tmp/matrixflow-frontend-dist-backup-20260814190621`.

Latest backend/companion release note: Backend guards prevent WeChat Video `sph...` platform IDs from being saved as account nicknames, and Pixingyun Mate `3.2.38` restores scan-bind nickname extraction from the WeChat Video page DOM. The affected production account `cmsfq2tvw11tz13kl7o8hh62e` now shows the real nickname `晶哥来了-`. Backend backup for the guard release: `/opt/matrixflow/releases/backend/20260805145148`.

Latest Doudian/companion update note: Pixingyun Mate `3.2.66` is the current public companion release. It supersedes `3.2.65` only for packaging/icon stability: automatic updates use the lightweight ZIP `pixingyun-mate-portable-3.2.66.zip` (66,343,759 bytes, SHA256 `8910300781a5ed6cdc4306ade7a359ac42a0f5c56ebcf8c2b015d4a5430ad423`), while the full website/manual installer `pixingyun-mate-setup-3.2.66.exe` (394,599,436 bytes, SHA256 `280a83129587fc4c2a468192cec0acd08a07e9bfdb22237647cddc047a4b0ea1`) includes the dedicated Playwright Chromium under `_internal/ms-playwright/chromium-1223`. `3.2.66` fixes Windows shortcut icon instability by bundling `_internal\app_icon.ico` and making installer-created desktop/start-menu shortcuts plus uninstall display icon point to that fixed file instead of `{app}\pixingyun-mate.exe` or old versioned icon filenames. The `3.2.65` browser lifecycle behavior remains: context shutdowns time out instead of hanging, cleanup targets only Chrome/Edge processes whose command line contains a Pixingyun-owned profile path, Doudian launch retries profile-lock failures after targeted cleanup, and Doudian manual login/sync prefer real system Chrome/Edge to reduce captcha blank-screen risk. Public manifest version is `3.2.66`, main update URL points to the ZIP, installer metadata points to the full setup exe, and Range checks confirm the ZIP size `66,343,759` and setup size `394,599,436`. This release does not change collection, Doudian, captcha, or browser lifecycle logic.

Latest edge performance note: Cloudflare Worker `matrixflow-origin-proxy` version `3c4ce7fa-7f50-40ee-8671-4edc86501c89` is active with conservative static-asset caching. `/assets/*` receives a 30-day immutable cache policy; `/api/*`, `/ws/*`, HTML, companion update manifests, and mutable companion download aliases are not cached as static content. The pre-change Worker source backup is `C:\Users\EDY\jujuju\backups\worker-cache-20260729-122830`.

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
  - 2026-07-27 repair note: public traffic returned Cloudflare `530/1033` because the tunnel edge transport was unstable while ECS origin health was `200`. The current stable tunnel container is managed by `/opt/matrixflow/docker-compose.yml` and uses `tunnel --region us --edge-ip-version 4 --protocol quic run --dns-resolver-addrs 100.100.2.136:53 --dns-resolver-addrs 100.100.2.138:53 --token ${CF_TUNNEL_TOKEN}`.
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
