# Project Memory

This file records durable project context that future Codex/AI sessions should read before making product, deployment, or Pixingyun Mate decisions. It complements `LATEST_DEPLOYMENT.md`, `docs/deployment-log.md`, and `docs/project-change-log.md`.

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
