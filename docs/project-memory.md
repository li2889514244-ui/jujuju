# Project Memory

This file records durable project context that future Codex/AI sessions should read before making product, deployment, or Pixingyun Mate decisions. It complements LATEST_DEPLOYMENT.md, docs/deployment-log.md, and docs/project-change-log.md.

## 2026-08-31 Pixingyun Mate 3.2.107 AI Editor Release

- 3.2.107 ships an AI editor test release. Public manifest version is `3.2.107`; portable ZIP `348241979` B sha256 `6101e9ca28672de00e715224c0750318f6153097024e695c11a9186c0ecd5047`; lite ZIP `157266112` B sha256 `08a208fdfaeaf22ce7ae3b7014ed5825e279ecbecc3a201cbffe2e109697acca`; installer `452050302` B sha256 `259c37ada4dc19a53460c9ed16573a5b29cbc112087c8d3b6637ffc6d36480b7`.
- In-app update download-speed fix: `latest.json` should default `url`/`sha256`/`size` to the lite ZIP when a lite artifact exists, while preserving full package metadata as `full_url`/`full_sha256`/`full_size`. This lets old companions that only read `url` download the smaller update package, and newer companions can still fallback to full metadata when needed.
- AI editor release gate: the PyInstaller specs must include `_internal/video_editor/*`. Without explicit `('video_editor', 'video_editor')` datas and `video_editor.*` hidden imports, source smoke tests can pass while packaged companions cannot start V2 edit tasks.
- Basic editing must export an MP4 even when no ASR model is available. Missing ASR should produce a warning (`MODEL_REQUIRED`) and a no-subtitle output, not a failed task. Cached local Whisper CLI models (`~/.cache/whisper/base.pt` or `tiny.pt`) are allowed as a no-download fallback.
- FFmpeg process execution must use `communicate(timeout=...)` polling, not `poll()` while stdout/stderr pipes are unread; otherwise short videos can deadlock when FFmpeg fills stderr.

## 2026-08-27 Pixingyun Mate 3.2.105 Process Mis-kill Follow-up

- Incident root cause: `pixing_worker.py` launched Playwright Chromium without a persistent `user_data_dir`, then called `register_new_browser_tree(None, ...)`. With `profile_path=None`, the before/after process diff could accidentally claim a user's own Chrome/Edge process opened at the same time. Later stale cleanup could treat that unrelated browser/software as managed and terminate it. This explains severe mis-kill reports on some machines such as Wang Tao's.
- 3.2.105 fix: browser-like process types (`browser`, `cdp_browser`, `scan_login_browser`, `collector_browser`, `doudian_browser`, `pixing_worker_browser`, `webview_fallback_browser`) MUST have `profile_path`. `register_process` and `register_new_browser_tree` reject missing-profile browser records. `_verify` refuses legacy no-profile browser records and `terminate_stale_records` prunes those dirty records without killing their PID.
- 3.2.105 fix: Pixing worker now uses its own persistent profile under `%LOCALAPPDATA%/MatrixFlow/browser-profiles/pixing-worker/<task>` and cleans only that registered profile. Startup cross-install cleanup is disabled by default unless `cleanup_other_installs_on_start === true`.
- New release gate: run `py -3 -m unittest tests.test_process_guardrails tests.test_process_safety tests.test_heartbeat -v` from `desktop-companion` before any companion release. `test_process_guardrails.py` statically blocks `register_new_browser_tree(None, ...)`, raw `taskkill` outside `process_registry.py`, arbitrary PowerShell `Stop-Process`, and CommandLine pattern process sweeps.
- Publish script lesson: `scripts/publish-companion-download.py` previously had a Python string/conditional precedence bug that caused installer stable alias updates to be skipped. After publishing an installer, always verify both versioned and stable URLs (`pixingyun-mate-setup-<version>.exe` and `pixingyun-mate-setup.exe`) have the same SHA256/size and EXE magic bytes `4D5A`.
- 3.2.106 delayed mis-kill hardening: updater rollback must not use PID-string `Stop-Process`; it should kill only the retained child `Process` object (`$Started.Kill()`). Collection cleanup must never call Playwright `browser.close()` directly; close the owned persistent context and then clean only registered/profile-matched browser records.
- 3.2.106 release: portable ZIP `348168878` B SHA256 `179680e9e369a7dedc36e960353bbd183bf53edf334315d733d29758d2f0e732`; lite ZIP `155921509` B SHA256 `ccd283bad404c7b3ac42b9d51f2a4b065bc965be6c2893973a304a87963effe1`; installer `451976876` B SHA256 `80c13085e0234a82be389ec532d07ffbe00b3a08e2a4a7c76b53a944e30536a4`. Public manifest and stable/versioned installer URLs verified with HEAD and Range magic (`EXE=4D5A`, `ZIP=504B0304`).
- Cloudflare Tunnel stability lesson: do not run cloudflared with `--dns-resolver-addrs 100.100.2.136:53/100.100.2.138:53`; it intermittently failed to resolve `localhost` for the remote-managed ingress (`http://localhost:80`) and returned public 530/502 despite the origin being healthy. Tunnel command is now `tunnel --region us --edge-ip-version 4 --protocol http2 run --token ${CF_TUNNEL_TOKEN}`.

## 2026-08-26 Pixingyun Mate 3.2.100 Process-Safety + Updater WSH Memory

- Public release: manifest https://ddddkiii.com/companion-updates/latest.json version 3.2.100 kind=portable. portable ZIP 348074580 B sha256 71692168e9a21802ffa340c47405ea15aa48f20d38182bfd90ecd782076f9189; lite ZIP 155837280 B sha256 9f99980fc7c7033ec90f572841ee2023639905eb78451c0ebde41bc67a168325; installer 451954913 B sha256 d2e574d70cd438adc6b14ea226774d46b1659f64049170053ac8c549af833aa0. Local D:\Pixingyun still runs 3.2.99 (replacement requires stopping the live instance).
- Process-safety iron rules (do not regress): (1) the companion may ONLY close processes registered in process_registry.py (managed_processes, persisted %LOCALAPPDATA%/MatrixFlow/managed_processes.json); (2) every terminate/kill goes through terminate_managed's five-way verification (PID alive → registered → create_time matches to defeat PID reuse → executable matches → cmdline/profilePath matches), anything unconfirmed → SKIP_UNMANAGED_PROCESS guard log and no kill; (3) never scan all system processes and guess ownership from command lines (the old doudian PowerShell CommandLine -like + Stop-Process -Force killed unrelated software); (4) never connect_over_cdp and then Browser.close() — it closes the user's ENTIRE browser (old wechat collector bug); (5) new browser launches are registered via before/after snapshot diff (browser_snapshot → register_new_browser_tree) so pre-existing user processes are never claimed. Regression suite: desktop-companion/tests/test_process_safety.py (10 tests) must stay green before any release.
- Updater lesson: Windows Script Host does NOT accept a UTF-8 BOM in .vbs files — wscript reports 800A0408 无效字符 at line 1 char 1 (reproduced: EF BB BF 53 65 74 ... fails, ASCII succeeds). The companion no longer generates run_update.vbs at all; _launch_hidden_process launches powershell.exe directly with CREATE_NO_WINDOW + STARTF_USESHOWWINDOW/SW_HIDE, and _validate_generated_script checks encoding/non-empty/first-character before execution. Never reintroduce .vbs launchers; if one is ever needed, write it as pure ASCII without BOM.
- Packaging lesson: modules imported ONLY inside function bodies (e.g. process_registry) are invisible to PyInstaller static analysis — they MUST be listed in the spec datas (both pixingyun-mate.spec and pixingyun-mate-onedir.spec now carry process_registry.py). Adding a new locally-imported module without updating the specs silently ships a build where the safety registry is missing.
- 3.2.101 added: stale/dead records must be pruned from managed_processes.json on cleanup (terminate_managed already_gone → unregister; terminate_stale_records prunes dead PIDs) — regression test test_11 covers it; without this the registry file grows unboundedly across sessions.
- Release gates used for 3.2.100 (repeat every release): py_compile all source .py (exclude .venv/build-*/dist-release/release-*), run tests/test_process_safety.py, updater end-to-end (validation rejects bad scripts + hidden powershell launch works + no .vbs produced), verify process_registry.py exists in the built _internal, zip magic bytes 504B0304 / exe 4D5A5000, then publish installer first and portable+lite second, then curl latest.json + HEAD + Range magic bytes on the public URLs.

## 2026-08-24 Doudian Upload System-Proxy Hijack Memory

- Symptom: both Doudian stores show online login but sync reports upload failed / check network.
- Root cause: companion requests/urllib trust_env read the Windows system proxy (Clash Verge 127.0.0.1:7897); every upload chunk was routed through proxy nodes. On 2026-08-24 ~10:49-11:14 a node outage reset every request at TCP level (ConnectionResetError 10054, no HTTP status, no server-side error because zero requests reached nginx/pm2). Retries (1/2/4/8/16s x5) all failed; server-side logs confirmed zero upload requests in the window. 11:14 proxy recovery restored uploads (server 201s).
- Fixed in 3.2.85: all companion outbound HTTP now bypasses the system proxy - doudian_store_collector._new_http_session() (trust_env=False) used by upload/rebind/relink; companion_auth._no_proxy_session() for login/refresh; collector and login-worker sessions pinned no-proxy. Network errors classified via _classify_network_error() into CONNECTION_RESET/CONNECTION_REFUSED/DNS_FAILURE/TLS_ERROR/TIMEOUT/NETWORK_ERROR with friendly _friendly_doudian_error mappings; Doudian scheduler fast-retries 300s after a network-class failure (state._doudian_fast_retry).
- Verification: upload chunk latency dropped ~6.5s (proxy) to ~0.6s (direct); both stores synced OK (server 201). Local Clash Verge rule enhancement added for ddddkkiii.com DIRECT (profiles/r8aEXnh0nVOj.yaml prepend) - applies on next Clash reload.
- Pixingyun Mate public release is 3.2.86 (supersedes 3.2.85): manifest https://ddddkiii.com/companion-updates/latest.json; ZIP https://ddddkiii.com/downloads/pixingyun-mate-portable-3.2.86.zip size 261843481 SHA256 bb50cd45a1835a6488476b3bb73b06c225f25e251d50bc2cba597c7fdaca9bde; installer https://ddddkiii.com/downloads/pixingyun-mate-setup-3.2.86.exe size 396556744 SHA256 1b7670df648ba03ba648ad0d2e5308802894a9bc7b7921da0806a9446735bdaf. Local D:\\Pixingyun runs 3.2.86; backups: D:\\Pixingyun.bak-proxyfix-20260824-115803, D:\\Pixingyun.bak-3285-*, D:\\Pixingyun.bak-3286-*.
- 3.2.85/3.2.84 updater bug: _start_zip_update_process wrote the apply ps1 via Path.write_text(..., bom=True) which raises TypeError after download, so in-app updates failed on those versions. Fixed in 3.2.86 (all three script writers use companion_encoding.write_text_file). Companions on 3.2.84/3.2.85 must update manually once.
- Known follow-up (not yet fixed): the update-package download itself still uses urllib with the system proxy (observed ~200KB/s); consider a no-proxy opener in companion_updater. Also the update reminder only runs at startup (checkUpdateReminder in mounted()) - running companions need a restart or manual check on the about page to notice a new version.
- Server stability notes (read-only audit): ECS 2 vCPU / 1.6GB RAM; matrixflow Node heap ~95%; frontend container memory limit ~= whole host; PostgreSQL had not-properly-shut-down recovery events on 2026-08-14 (disk-full) and 2026-08-21. Recommend memory upgrade + alerting.

## 2026-08-21 Doudian Cloud Store Rebuild + Relink Fix Memory

- Symptom: companion reports 云端抖店店铺不存在 while the local Doudian login is valid, and the website keeps showing the stale error with (当前展示历史缓存数据).
- Root cause chain: (1) on 2026-08-13 the two cloud `DoudianStore` records were deleted and re-created (no AuditLog rows — direct DB operation) with NEW ids and profilePaths bound to probe profiles (`273d7e231006` / `d5bc046c2ab7`); (2) the local companion kept the OLD `cloud_store_id` in `companion_config.json` → every upload hit the structured 404 `DOUDIAN_STORE_NOT_FOUND`; (3) the companion's by-name relink (`relink_companion_store`) parsed the wrapped `{code,message,data}` store-list response as a bare JSON array → zero matches → recovery always failed. The login-state probe is local-only, so 披星教育 looked "normal" while its syncs actually failed too.
- Fixed in 3.2.84: `relink_companion_store` now unwraps the response envelope (bare list, `data` list, and nested `stores/list/items`).
- Data repair pattern for this incident (no re-login needed, history preserved): `POST /doudian-browser/stores/{newId}/rebind` with `{localProfileId, storeName}` re-points the existing cloud store (storeId unchanged → orders/products/aftersales intact), then update the local `doudian_stores[].cloud_store_id` in `%LOCALAPPDATA%\MatrixFlow\companion_config.json` and clear the stale `last_error`. Website error formula: `cloudStore.syncError || localStore.last_error` plus 当前展示历史缓存数据 when cached data exists.
- Publish incident lesson: if `publish-companion-download.py` fails on the remote cleanup bash (exit 1), the manifest may already point at a not-yet-uploaded artifact — repair by SFTP-uploading the artifact and re-running the alias/cleanup steps manually before the next publish; do not leave the manifest pointing at a missing file.

## 2026-08-21 Pixingyun Mate 3.2.82 Chinese Encoding Memory

- Pixingyun Mate public release is `3.2.82`; it supersedes `3.2.81` for the encoding-governance changes.
- Public manifest: `https://ddddkiii.com/companion-updates/latest.json`, version `3.2.82`, kind `portable`.
- Portable update ZIP: `https://ddddkiii.com/downloads/pixingyun-mate-portable-3.2.82.zip`, size `348012126`, SHA256 `09858a7b863af8bb89a3c9de88d86c7f23f35561e2f82adb57a394efcef7dadd`.
- Full installer: `https://ddddkiii.com/downloads/pixingyun-mate-setup-3.2.82.exe`, size `451894387`, SHA256 `d746e17dcdb26820a2c14f1c2ccdf9abf8fee9f989bff917764c0e954996f459`.
- Encoding rules for future companion code: all text IO goes through `companion_encoding.py` (`read_text_file` / `write_text_file` / `json_dump_file` / `json_load_file` / `run_cmd` / `decode_bytes`). Never decode subprocess output with a hard-coded codec or `errors='ignore'`; the unified order is UTF-8 → gb18030 → UTF-8 replacement. PowerShell .ps1 launcher files must be written with `bom=True` (UTF-8-SIG) or PowerShell 5.1 misreads them as ANSI. NEVER write .vbs files with a UTF-8 BOM — wscript rejects the BOM with 800A0408 无效字符; as of 3.2.100 the updater no longer generates any .vbs launcher (direct hidden powershell.exe launch instead).
- `desktop-companion/encoding_regression_test.py` is the encoding regression gate (13 checks, fixed Chinese sample). Run it for every companion release.
- Durable observation: the 3.2.80/3.2.81/3.2.82 onedir builds all used the system `py -3` Python 3.13 toolchain (onedir with python313.dll) and all three verified locally and in public, so the current onedir chain works; the older "Python 3.13 onefile startup failure" lesson applied to the retired onefile portable-exe packaging, not the current onedir path. If startup failures ever reappear on other PCs, fall back to `.venv312-build` (Python 3.12.3, PyInstaller 6.21.0) which still exists for that purpose.
- Concurrent-build lesson: do not run `Compress-Archive` on the onedir tree while the Inno Setup build (ISCC) is still reading the same tree — a transient file lock produced a 0-byte ZIP; rerunning the compression alone succeeded.
- Local install smoke for `3.2.82`: old install backed up to `D:\Pixingyun-backup-3281`, `D:\Pixingyun` replaced with the full onedir, `/health` returns `3.2.82`, update check `available=false`, companion data in `%LOCALAPPDATA%\MatrixFlow` untouched.

## 2026-08-12 Pixingyun Mate 3.2.67 Win10/Win11 Compatibility Memory

- Pixingyun Mate public release is `3.2.67`; it supersedes `3.2.66`.
- Supported desktop scope for this build: Win10/Win11 x64. Do not promise Win7/Win8/32-bit compatibility without a separate legacy-build plan.
- Public manifest: `https://ddddkiii.com/companion-updates/latest.json`, version `3.2.67`.
- In-app update package: `https://ddddkiii.com/downloads/pixingyun-mate-portable-3.2.67.zip`, size `66366419`, SHA256 `d1f35b1d2292f46dd0bece4216ea830661ff90b43ae547aae2274451bc609f8a`.
- Full installer package: `https://ddddkiii.com/downloads/pixingyun-mate-setup-3.2.67.exe`, size `394604875`, SHA256 `9676e5a90947cd65ada849b0697eff0d69a18313491ca2c60f2666dd6a7660ae`.
- Compatibility gate rule: `scripts\check-companion-windows-compat.ps1` must check `desktop-companion\pixingyun-mate-onedir.spec`, not the older `pixingyun-mate.spec`.
- Packaging rule: `pixingyun-mate-onedir.spec` must explicitly package `webview.platforms.edgechromium`, `pythonnet`, `clr`, and `clr_loader`.
- UI fallback rule: if native pywebview/WebView2 is unavailable, fails to start, or renders blank, `webview_window.py` opens the local UI in a dedicated app-window browser using `%LOCALAPPDATA%\MatrixFlow\ui-browser-profile`. Prefer bundled Chromium, then local Chromium, then system Chrome/Edge; this must not use or modify a coworker's normal browser profile.
- Installer rule: full installer must include offline WebView2 runtime, bundled Playwright Chromium, Python 3.12 DLLs, VC runtime DLLs, and fixed `_internal\app_icon.ico`.
- Verification: Python compile passed; Win compatibility gate passed; full onedir contains bundled Chromium, WebView2 DLLs, Python/VC runtime DLLs, app icon, and UI fallback helper; public manifest and Range checks passed; remote hashes match local hashes; local `D:\Pixingyun` was updated to full `3.2.67`, `/health` returned `3.2.67`, and update check returned `available=false`.

## 2026-08-12 Pixingyun Mate 3.2.66 Shortcut Icon Memory

- Pixingyun Mate public release is `3.2.66`; it supersedes `3.2.65` for packaging/installer users.
- Public manifest: `https://ddddkiii.com/companion-updates/latest.json`, version `3.2.66`.
- In-app update package: `https://ddddkiii.com/downloads/pixingyun-mate-portable-3.2.66.zip`, size `66343759`, SHA256 `8910300781a5ed6cdc4306ade7a359ac42a0f5c56ebcf8c2b015d4a5430ad423`.
- Full installer package: `https://ddddkiii.com/downloads/pixingyun-mate-setup-3.2.66.exe`, size `394599436`, SHA256 `280a83129587fc4c2a468192cec0acd08a07e9bfdb22237647cddc047a4b0ea1`.
- Icon stability rule: shortcut icons must point to the fixed bundled file `_internal\app_icon.ico`, not to `pixingyun-mate.exe` and not to a versioned icon filename. Versioned icon paths can disappear after updates, and exe icon resources can be cached inconsistently by Windows.
- Packaging rule: `pixingyun-mate-onedir.spec` must include `('app_icon.ico', '.')` in `datas` so PyInstaller places the file at `_internal\app_icon.ico`.
- Installer rule: Inno `[Icons]` entries and `UninstallDisplayIcon` must use `{app}\_internal\app_icon.ico` with `IconIndex: 0`.
- Verification: Python compile passed; light ZIP contains `_internal\app_icon.ico` and no `_internal\ms-playwright`; full onedir contains `_internal\app_icon.ico` and bundled Chromium; Inno compile log compressed `_internal\app_icon.ico`; public manifest reports `3.2.66`; server hashes and public Range sizes match. This release intentionally does not change collection, Doudian, captcha, or browser lifecycle logic.

## 2026-08-12 Pixingyun Mate 3.2.65 Browser Lifecycle Memory

- Pixingyun Mate public release is `3.2.65`; it supersedes `3.2.64`.
- Public manifest: `https://ddddkiii.com/companion-updates/latest.json`, version `3.2.65`.
- In-app update package: `https://ddddkiii.com/downloads/pixingyun-mate-portable-3.2.65.zip`, size `66345959`, SHA256 `9dbf15deef0218100ca2065df1887506f6dfaf8af8217d3eb56b993219aab24e`.
- Full installer package: `https://ddddkiii.com/downloads/pixingyun-mate-setup-3.2.65.exe`, size `394598148`, SHA256 `73a29bfb354c1ba41466a0f67c757072b23acfbfbd03430032606a1d74ab429a`.
- Lifecycle rule: browser cleanup must only target processes whose command line contains the specific Pixingyun-owned profile path. Never kill arbitrary `chrome.exe`/`msedge.exe` processes, because coworkers may be using their own browser sessions.
- Compatibility rule: Doudian manual login should continue to prefer system Chrome/Edge over bundled Playwright Chromium to reduce captcha blank-screen risk. Browser discovery now uses the shared fixed-path, App Paths registry, and PATH lookup.
- Failure-recovery rule: if a persistent profile launch fails because the profile is locked or a previous browser process is half-alive, clean only that profile's browser processes and retry once.
- Verification: Python compile passed for browser manager, scan worker, Doudian collector, metrics collector, and state; behavior probe confirmed Doudian resolves Playwright Chromium input to system Chrome; light ZIP build does not include `_internal/ms-playwright`; full installer build includes Chromium; public Range checks returned `bytes 0-3/66345959` for ZIP and `bytes 0-3/394598148` for setup. Local `D:\Pixingyun` was replaced with the full `3.2.65` onedir, `/health` returned `3.2.65`, and `/api/browser-info` resolved both bundled Chromium and system Chrome/Edge fallbacks.
- Captcha caveat: no embedded browser can guarantee a third-party captcha never changes or blanks. The mitigation is platform-specific routing: Doudian visible human verification uses real system Chrome/Edge; bundled Chromium is mainly for QR-login reliability and for machines lacking a usable browser.

## 2026-08-11 Pixingyun Mate 3.2.64 Browser Packaging Memory

- Pixingyun Mate public release is `3.2.64`; it supersedes `3.2.63`.
- Public manifest: `https://ddddkiii.com/companion-updates/latest.json`, version `3.2.64`.
- In-app update package: `https://ddddkiii.com/downloads/pixingyun-mate-portable-3.2.64.zip`, size `66341573`, SHA256 `2e1bb2ecd3b08a2df64d6249a46cf111dfbaa02668553c9c6c4667e4687f258a`.
- Full installer package: `https://ddddkiii.com/downloads/pixingyun-mate-setup-3.2.64.exe`, size `394571414`, SHA256 `48a1fc74e1a5cc08464d67ff3d7199f838ab2312ee7f4b61aa1a080595b7cdd6`.
- Packaging rule: automatic updates must stay lightweight and point to the ZIP. The full installer should include the dedicated Playwright Chromium under `_internal/ms-playwright/chromium-1223` for QR login/collection users whose machines cannot launch Chrome/Edge. Do not point the manifest main `url` to the installer because older updaters may treat an exe as a portable replacement.
- Build rule: `pixingyun-mate-onedir.spec` only bundles Chromium when `BUNDLE_PLAYWRIGHT_CHROMIUM=1`. Use this env var for the full installer build; leave it unset for the in-app update ZIP build.
- Runtime rule remains: bundled Chromium first, then local MatrixFlow Chromium, then system Chrome/Edge discovered by fixed paths, Windows App Paths registry, and PATH; frozen builds must not attempt `pixingyun-mate.exe -m playwright install chromium`.
- Verification: Python compile passed; light ZIP build passed and did not include `_internal/ms-playwright`; full onedir build included Chromium; Inno setup build passed; public manifest points to the 66 MB ZIP and carries installer metadata for the 394 MB setup exe; public Range checks returned `bytes 0-3/66341573` for ZIP and `bytes 0-3/394571414` for setup. Local `D:\Pixingyun` was replaced with the full `3.2.64` onedir, `/health` returned `3.2.64`, and `/api/browser-info` resolved `D:\Pixingyun\_internal\ms-playwright\chromium-1223\chrome-win64\chrome.exe`.
- Release-note encoding lesson: avoid passing Chinese release notes through PowerShell CLI args to `publish-companion-download.py`; use ASCII notes or fix the script/input encoding first, otherwise the update page can show mojibake.

## 2026-08-11 Pixingyun Mate 3.2.63 Dedicated Browser Memory

- Pixingyun Mate public release is `3.2.63`.
- Public manifest: `https://ddddkiii.com/companion-updates/latest.json`, version `3.2.63`.
- In-app update package: `https://ddddkiii.com/downloads/pixingyun-mate-portable-3.2.63.zip`, size `258595611`, SHA256 `7124707b1d9b83f731f884f1d452efc952a131a421fd45622bf39135a07fd34e`.
- Full installer package: `https://ddddkiii.com/downloads/pixingyun-mate-setup-3.2.63.exe`, size `394581059`, SHA256 `cff0fb3c840fed700118fc30d0fae513a8b48aab50434510f805128927c09d52`.
- Stable website installer link `https://ddddkiii.com/downloads/pixingyun-mate-setup.exe` returns the same installer size and is marked `Cache-Control: no-store` by the active Cloudflare Worker. Stable in-app ZIP alias `https://ddddkiii.com/downloads/pixingyun-mate-portable.zip` returns size `258595611`.
- This release intentionally makes the full installer much larger because it bundles a dedicated Playwright Chromium under `_internal/ms-playwright/chromium-1223`. The bundled browser is only for Pixingyun Mate scan/login/collection use and avoids relying on each coworker's installed Chrome/Edge.
- Browser startup order: bundled Playwright Chromium, local MatrixFlow Chromium, system Chrome/Edge discovered by fixed paths, Windows App Paths registry, and PATH; final channel fallback tries Edge/Chrome. Frozen PyInstaller builds must not run `pixingyun-mate.exe -m playwright install chromium`.
- Scan-bind startup now uses explicit `starting -> browser/error` status. The UI polls startup state so a browser launch failure is visible instead of falsely telling the user the browser opened.
- Verification: Python compile passed; PyInstaller onedir build passed; packaged frozen-path simulation resolved `_internal\ms-playwright\chromium-1223\chrome-win64\chrome.exe` first; ZIP and Inno installer builds passed; public manifest points main update URL to the ZIP and carries installer metadata; stable ZIP/setup aliases report expected sizes; production diagnose passed after restarting an unhealthy `matrixflow-tunnel` container that briefly caused public 502/530 on download checks.
- Local running install on this machine was not forcibly stopped during release and still reported `D:\Pixingyun\pixingyun-mate.exe` version `3.2.62` immediately after publishing. Update/restart it before local manual QA of `3.2.63`.

## 2026-08-11 Pixingyun Mate 3.2.62 / Cloudflare Worker Memory

- Pixingyun Mate public release is `3.2.62`.
- Public manifest: `https://ddddkiii.com/companion-updates/latest.json`, version `3.2.62`, `Cache-Control: no-store`.
- In-app update package: `https://ddddkiii.com/downloads/pixingyun-mate-portable-3.2.62.zip`, size `66314931`, SHA256 `ff7edbaf2582b8602e96267e50d164eaf8de9620c430280ee5a198fc2da705a2`.
- Full installer package: `https://ddddkiii.com/downloads/pixingyun-mate-setup-3.2.62.exe`, size `258658550`, SHA256 `19b7f5b28e87417546d4446dcb3ae22a30e852c94e1a24949df5e8718efc1ba7`.
- Stable aliases now also return current `3.2.62` sizes: `pixingyun-mate-setup.exe` is `258658550`, `pixingyun-mate-portable.zip` is `66314931`.
- Local install: `D:\Pixingyun\pixingyun-mate.exe`, `/health` version `3.2.62`, `/api/update/check` returns `available=false`. This was verified by a real in-app update from `3.2.61` to `3.2.62`.
- Companion shell hardening in `3.2.62`: scan-bind token handoff uses POST JSON instead of GET query strings; local Werkzeug request logs redact token-like query parameters; `/api/cancel-scan` is idempotent so accidental or repeated cancel clicks do not surface false `404 session not found` errors.
- Cloudflare Worker `matrixflow-origin-proxy` version `3c4ce7fa-7f50-40ee-8671-4edc86501c89` is deployed. It marks mutable companion download aliases and `/companion-updates/*` as `no-store` and adds an internal origin cache-buster for those paths so stale edge objects cannot keep serving old packages.
- Cloudflare credential lesson: `.env.local` Cloudflare token can purge cache but lacks Workers scripts/routes permission. `secrets.env` token can read Workers resources but write calls are IP-restricted from the current network. For Worker deploys on this machine, use the existing Wrangler OAuth login in `C:\Users\EDY\.wrangler\config\default.toml`; do not print or copy any token values into docs or logs.
- Worker deployment command that succeeded: remove Cloudflare API token/account env vars from the shell, then run `npm exec -- wrangler deploy` from `C:\Users\EDY\jujuju\cloudflare\matrixflow-origin-proxy`.
- Verification after Worker deploy: public health has `x-matrixflow-entry: cloudflare-worker`; fixed aliases and manifest return `Cache-Control: no-store`; `py -3 scripts\diagnose-production.py` returns `DIAGNOSE OK`.

## 2026-08-10 Pixingyun Mate 3.2.55 AI Editing Memory

- Pixingyun Mate public release is `3.2.55`.
- This release supersedes `3.2.54` for AI editing because packaged custom mode revealed one more command-execution issue: DeepSeek can generate `info <draft-name> --jianying`, but `capcut-cli info` may not resolve JianYing draft names in that form.
- `companion_video_editor.py` now normalizes AI-generated project args for project-scoped commands. If the arg is `auto`, it uses the UI-selected project. If the arg is a known JianYing draft name, it converts it to the absolute draft path before running capcut-cli.
- Verified source and packaged local `3.2.55` with the previously failing DeepSeek custom command. Result: status `done`, command `info`, first arg is the absolute JianYing draft path, tracks `6`, segments `9`.
- Public manifest is no-BOM JSON at `https://ddddkiii.com/companion-updates/latest.json`, version `3.2.55`.
- Portable update package: `https://ddddkiii.com/downloads/pixingyun-mate-portable-3.2.55.exe`, size `84448498`, SHA256 `FF0AA73930AF0EE55A1D8F6D50C1C9D75DE889C10D0FDFD83A35041A52D41768`.
- Full installer package: `https://ddddkiii.com/downloads/pixingyun-mate-setup-3.2.55.exe`, size `294865354`, SHA256 `6B7A2DCA054A2AA7661283223CECAD8DA751A2FBD68AA00482C1C6D99B0F89F0`.
- Origin stable installer `pixingyun-mate-setup.exe` has the same `3.2.55` hash. Public no-query fixed aliases may still return an old cached `3.2.54` object from Worker/Cloudflare cache even after purge; fixed aliases with `?v=3.2.55` and versioned installer URLs return the correct package.
- Local install: `D:\Pixingyun\pixingyun-mate.exe`, `/health` version `3.2.55`. Desktop shortcut icon points to `D:\Pixingyun\pixingyun-mate-3.2.55.ico`.
- The local startup VBS was repaired: it no longer contains literal backtick `` `r`n`` text and runs `D:\Pixingyun\pixingyun-mate.exe` hidden via `WScript.Shell`.
- The Cloudflare token and DeepSeek key remain only in local ignored `.env.local`; never upload or print them.

## 2026-08-10 Pixingyun Mate 3.2.54 AI Editing Memory

- Pixingyun Mate public release is `3.2.54`.
- The Cloudflare token and DeepSeek key provided during this session are stored only in local ignored file `C:\Users\EDY\jujuju\.env.local`. Do not print them, commit them, upload them, or copy them into manifests/docs/logs. The Cloudflare token can purge cache but lacks Workers deploy permission.
- Public manifest is no-BOM JSON at `https://ddddkiii.com/companion-updates/latest.json`, version `3.2.54`.
- Portable update package: `https://ddddkiii.com/downloads/pixingyun-mate-portable-3.2.54.exe`, size `84447331`, SHA256 `AB46C671D1CF73A018B2C5D917E8F70C0AF29E2AB9EFFABD6AC173C50A9E39D1`.
- Full installer package: `https://ddddkiii.com/downloads/pixingyun-mate-setup-3.2.54.exe`, size `294863745`, SHA256 `B8A67B8F197FFCD3383534FB329CBD86F5872260DBAD011A9EFF08D251050F63`.
- Stable installer links `https://ddddkiii.com/downloads/pixingyun-mate-setup.exe` and `https://ddddkiii.com/downloads/pixingyun-mate-setup-latest.exe` were both verified public-new with `Content-Length: 294863745` after Cloudflare cache purge.
- Local install: `D:\Pixingyun\pixingyun-mate.exe`, `/health` version `3.2.54`, `/api/update/check` returns `available=false`.
- DeepSeek model test result: both `deepseek-v4-flash` and `deepseek-v4-pro` responded successfully to a local API test when using the local ignored key.
- Packaged AI editing chain test result: custom mode completed a safe `info` command; standard mode completed with FFmpeg/Whisper warnings, read 3 existing text items from a copied JianYing draft, and applied 2 effects plus 2 filters.
- Standard-chain root causes fixed in `companion_video_editor.py`: initialize `texts_result` before caption generation; when Whisper is unavailable, fall back to `capcut texts <project> --jianying`; increase capcut stdout capture so the full JianYing library is parsed; parse non-ASCII enum rows by resource id/name instead of invalid `(non-ascii)` slugs; reduce effect/filter candidate list size for DeepSeek V4; increase DeepSeek timeout/token budget and reject empty command responses with a clear error.
- FFmpeg/ffprobe and Whisper are still recommended dependencies. Without FFmpeg/ffprobe, breath/silence detection and preview rendering are skipped. Without Whisper, new automatic subtitle transcription is skipped. Standard AI matching can still continue if the JianYing draft already contains text/subtitles.

## 2026-08-10 Pixingyun Mate 3.2.53 AI Editing Memory

- Pixingyun Mate public release is `3.2.53`.
- This release fixes AI editing model selection. The UI exposes `DeepSeek V4 Flash` (`deepseek-v4-flash`) and `DeepSeek V4 Pro` (`deepseek-v4-pro`); `/api/video-editor/standard-edit` and `/api/video-editor/ai-edit` pass the selected `model`; `companion_video_editor.py` validates the model and no longer hardcodes `deepseek-chat`.
- Public manifest is no-BOM JSON at `https://ddddkiii.com/companion-updates/latest.json`, version `3.2.53`.
- Portable update package: `https://ddddkiii.com/downloads/pixingyun-mate-portable-3.2.53.exe`, size `84445355`, SHA256 `435346AFDAF0A36F2E13CB3DE2CF3268AC836D774FA1689D7E4AB4AD7A5A2EC6`.
- Full installer package: `https://ddddkiii.com/downloads/pixingyun-mate-setup-3.2.53.exe`, size `294862234`, SHA256 `793C22C43ED5A8C86AAA9C11511B9E5AEC33B30622662E7BEDDE3AC21DF2A872`.
- Stable origin installer: `https://ddddkiii.com/downloads/pixingyun-mate-setup.exe`, same size/hash as `pixingyun-mate-setup-3.2.53.exe` on the ECS origin. Public fixed URL may temporarily serve an old Cloudflare cached object; use manifest `installer_url`, the versioned installer URL, or `https://ddddkiii.com/downloads/pixingyun-mate-setup-latest.exe` for immediate manual installs.
- Local install: `D:\Pixingyun\pixingyun-mate.exe`, `/health` version `3.2.53`, `/api/update/check` returns `available=false`.
- AI editing chain audit result: `capcut-cli` is available and JianYing is installed; `/api/video-editor/env` reports model metadata correctly. FFmpeg/ffprobe and Whisper are not installed on the local machine, so caption generation and proxy rendering remain dependency warnings until those tools are installed.
- Packaging lesson: do not leave optional dev-only imports at top level in packaged feature modules. `companion_video_editor.py` now falls back to stdlib logging when `loguru` is missing, preventing packaged AI editing import failure.
- Permission lesson: AI/custom editing must not pass arbitrary user text directly into `capcut-cli` as an executable command. Keep `_CAPCUT_ALLOWED_COMMANDS` and validate command names before running capcut.
- CDN lesson: do not cache mutable companion download aliases such as `pixingyun-mate-setup.exe` for a day. A local Worker source patch exists to make mutable download aliases `no-store`, but the 2026-08-10 deploy attempt was blocked by an invalid/insufficient Cloudflare token. Restore a valid token and deploy before relying on fixed alias cache behavior.

## 2026-08-10 Pixingyun Mate 3.2.52 Current Release Memory

- Pixingyun Mate public release is `3.2.52`.
- This is an AI video editing update for JianYing / capcut-cli. Standard mode uses built-in JianYing scene effects and filters; DeepSeek matches subtitle content to those built-in materials. It does not rely on external Pixabay material search for the standard "场景素材" step.
- Public manifest is no-BOM JSON at `https://ddddkiii.com/companion-updates/latest.json`, version `3.2.52`.
- Portable update package: `https://ddddkiii.com/downloads/pixingyun-mate-portable-3.2.52.exe`, size `84439741`, SHA256 `06ef37b2183655cfa41a05362fd5523aa02ecf96db617fde7c837b068b4da702`.
- Full installer package: `https://ddddkiii.com/downloads/pixingyun-mate-setup-3.2.52.exe`, size `294854504`, SHA256 `B1C71139F8AB88CE893B2D4F04A2FE8AD5154DC80CCF87DAE072C7E959F9EB44`.
- Stable installer link: `https://ddddkiii.com/downloads/pixingyun-mate-setup.exe`, same size/hash as `pixingyun-mate-setup-3.2.52.exe`.
- Local install: `D:\Pixingyun\pixingyun-mate.exe`, `/health` version `3.2.52`, `/api/update/check` returns `available=false`.
- Release lesson reinforced: if someone says "披星云刚刚大更新", check whether both package paths were updated. On this release, portable was online first but setup was initially still `3.2.51`; it was corrected at `2026-08-10 14:49 Asia/Shanghai`.

## 2026-08-10 Pixingyun Mate 3.2.51 Incident Memory

### What Happened

- The user reported that WeChat Video collection did not click the `近30天` period. The live UI used compact tabs `日` / `周` / `月`, not the older full labels.
- The local desktop app had path/version confusion at first, and the desktop icon looked wrong.
- The local autostart entry launched `C:\Users\EDY\jujuju\desktop-companion\launcher.py` through a bundled Python path instead of launching the installed `D:\Pixingyun\pixingyun-mate.exe`.
- The first cloud publish only uploaded the portable update exe and manifest. The full installer package was initially missed until the user pointed out there should be two update/download packages.

### Root Causes

- `_select_wechat_metric_period()` treated a target label appearing inside a metric card as proof that the period was already selected. In the compact UI, all period labels are visible at once, so this was a false positive.
- The selector only understood labels such as `近30天`; the compact UI exposes the clickable label as `月`.
- `desktop-companion\pixingyun-mate.spec` did not carry `app_icon.ico` into the PyInstaller exe, so packaged builds could lose the intended icon.
- Windows Explorer can keep stale shortcut/icon cache even after the exe is replaced. The desktop shortcut may need a new icon file path or cache refresh.
- Companion releases have two public package paths: the in-app portable update exe and the full installer exe. Publishing only the manifest package is incomplete for website/manual install users.

### Durable Rules

- For WeChat Video Data Center period scraping, map period aliases before clicking: `昨日数据` -> `日`, `近7天` -> `周`, and `近30天` -> `月`.
- Never return success from period selection only because target period text appears in the card. Click the scoped visible control for the target metric card, then wait for parsed metrics to change or become available.
- When diagnosing "my local companion looks wrong", check all four paths before changing code: desktop shortcut target/icon, running process executable path, startup folder/registry autostart target, local `/health` and `/api/update/check`.
- Autostart on the demo machine should launch `D:\Pixingyun\pixingyun-mate.exe` directly. Do not leave it pointing at source `launcher.py`.
- Package icon verification is part of the release gate. PyInstaller `EXE(...)` must include `icon='app_icon.ico'`, and the generated exe should expose the expected icon via Windows associated-icon extraction.
- For every Pixingyun Mate public release, publish and verify both packages: `pixingyun-mate-portable-{version}.exe` for in-app update and `pixingyun-mate-setup-{version}.exe` plus `pixingyun-mate-setup.exe` for website/manual install.
- Verify both package lines after upload with public `HEAD` checks, expected `Content-Length`, and remote or downloaded SHA256. The manifest alone is not enough.

### 3.2.51 Verified State

- Public manifest: `https://ddddkiii.com/companion-updates/latest.json`, version `3.2.51`.
- Portable update package: `https://ddddkiii.com/downloads/pixingyun-mate-portable-3.2.51.exe`, size `84400683`, SHA256 `D3E438128E17E3DBEAB72E8A23B951A0CC1FFCCF9B06245E0DFD21BFAF00B03B`.
- Full installer package: `https://ddddkiii.com/downloads/pixingyun-mate-setup-3.2.51.exe`, size `294816137`, SHA256 `FD6C25945959670C4EDA2FB52C7BCDD76C52E0E4DFC65810FD6D9DE6153A82E6`.
- Stable installer link: `https://ddddkiii.com/downloads/pixingyun-mate-setup.exe`, same size/hash as `pixingyun-mate-setup-3.2.51.exe`.
- Local install: `D:\Pixingyun\pixingyun-mate.exe`, `/health` version `3.2.51`, `/api/update/check` returns `available=false`.

## 2026-08-05 Website And Pixingyun Mate Readiness Review

### Current Production State

- Public site: `https://ddddkiii.com`.
- Pixingyun Mate public release: `3.2.33`.
- App update manifest: `https://ddddkiii.com/companion-updates/latest.json`.
- In-app update package: `https://ddddkiii.com/downloads/pixingyun-mate-portable-3.2.33.zip`.
- Full installer: `https://ddddkiii.com/downloads/pixingyun-mate-setup-3.2.33.exe`.
- Stable website installer link: `https://ddddkiii.com/downloads/pixingyun-mate-setup.exe`.
- Local full installer artifact: `C:\Users\EDY\jujuju\desktop-companion\update-release\pixingyun-mate-setup-3.2.33.exe`.

### Feishu Login Lessons

- Website Feishu login and Pixingyun Mate Feishu login were implemented through the website OAuth callback plus a validated local companion handoff.
- Feishu OAuth redirects must match the configured URL exactly. The website callback remains the canonical Feishu redirect; localhost is reached through the website handoff, not by registering a separate Feishu localhost redirect.
- Feishu app permissions matter. If users see authorization/permission errors after scanning, check the Feishu app permissions and published app configuration before changing code.
- Feishu OAuth may show a user authorization page. That is normal for OAuth permission grant flows; do not treat it as a code failure unless the callback or local handoff fails.

### Account Binding, Collection, And Deletion Lessons

- Manual deletion should be treated as a real cleanup action. Do not keep deleted short-video accounts in local/cloud active lists where future new accounts can collide or inherit stale data.
- Cloud account creation must tolerate messy captured identity data. Backend DTOs normalize `platformUserId`, `nickname`, `avatar`, `bio`, and `cookies`; frontend/companion payloads must send strings for nickname-like fields.
- The production bug `nickname must be a string` happened because companion/cloud account payloads could send non-string nickname data. Keep string normalization in both companion and backend.
- Do not trust default platform page names as account names. Platform assistant, platform home, content-management, and data-center page titles are suspicious and should not overwrite a real account nickname.
- Avatar capture must be optional and guarded. A missing avatar should not fail account creation, and unsafe/default avatar values should not overwrite a good existing avatar.
- Douyin identity extraction should prefer stable IDs and profile API/storage/window globals where possible; do not fake cloud sync success when no stable identity was obtained.

### Pixingyun Mate Compatibility Lessons

- The product goal is a normal installer that works on most Win10/Win11 systems, not a permanent "browser mode" workaround.
- The full installer bundles the offline Microsoft Edge WebView2 Runtime. The installer checks whether WebView2 is already present; if present, it should not reinstall it.
- Some machines showed white screens because WebView2/runtime initialization can fail or be missing. Keep the fallback behavior, but the primary supported path is the installer with offline WebView2.
- Use `scripts\check-companion-windows-compat.ps1` before release. It must confirm the offline WebView2 installer exists and is large enough, not the old small online bootstrapper.

### Download And Update Lessons

- In-app updates use the portable ZIP, currently about 81 MB. Website downloads should use the full installer, currently about 268 MB because it bundles offline WebView2.
- The old updater looked stuck because `/api/update/apply` downloaded and verified the whole package inside one long request. Users only saw the updating button text without progress.
- Pixingyun Mate `3.2.33` fixed update observability:
  - `/api/update/apply` queues a background update job.
  - `/api/update/status` exposes phase, percent, downloaded bytes, total bytes, errors, and restart state.
  - `/api/update/check` exposes package size and filename.
  - The UI shows download progress, verify/start/restart phases, and clear failure text.
  - Repeated clicks do not start multiple concurrent update jobs.
- Users already stuck in a pre-`3.2.33` no-progress updater should use the full installer once. After they are on `3.2.33`, future in-app updates are visible and diagnosable.
- Always verify public downloads with Range requests and magic bytes:
  - ZIP should return `206` and first bytes `504b0304`.
  - EXE should return `206` and first bytes `4d5a5000`.

### Local Machine Path Lesson

- On 2026-08-05, the user's desktop shortcut pointed to `D:\Pixingyun Mate\pixingyun-mate.exe`, which was still `3.2.32`.
- The installed `3.2.33` copy was at `D:\Pixingyun\pixingyun-mate.exe`.
- The desktop shortcut was updated to point to `D:\Pixingyun\pixingyun-mate.exe`, and local health/update checks returned:
  - `HealthVersion = 3.2.33`
  - `LatestVersion = 3.2.33`
  - `UpdateAvailable = false`
- Future "my computer did not update" checks should first inspect the actual shortcut target and running process path, not only the public manifest.

### Release Gate Used For 3.2.33

- Python compile checks passed for touched companion/update files.
- PyInstaller package smoke passed: local `/health`, `/api/config`, and `/api/update/status` returned `3.2.33`.
- Full installer smoke passed: silent install to a temporary directory, start installed app, verify `/health` and update status, then uninstall/cleanup.
- ZIP inspection confirmed no local logs, account DB, browser profiles, chrome profile, or cookie DB files were packaged.
- Public manifest and stable links were verified after upload.
- `py -3 scripts\diagnose-production.py --remote --require-worker-route` passed after release.

### Future Operating Rules

- Do not rely on memory for current versions. Check `LATEST_DEPLOYMENT.md`, this file, the public manifest, and actual local process paths.
- Do not treat a successful installer exit code as enough. Verify the target file changed and the launched app reports the expected version.
- Do not publish a companion package without checking that local user data is excluded from ZIP/install artifacts.
- Do not overwrite account nicknames with platform default page titles.
- Do not let a cloud account creation failure look like a successful bind or collection.
