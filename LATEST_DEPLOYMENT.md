# Latest Deployment Marker

Last verified: 2026-07-03 01:35 Asia/Shanghai

This file is the source of truth for the current usable MatrixFlow / Pixingyun deployment. If another AI agent works in this repo later, read this file before choosing which build, bundle, backend dist, or companion package is current.

For deployment history, failure patterns, safe deployment rules, and AI handoff guidance, also read:

- `docs/deployment-retrospective-ai-handoff.md`
- `docs/deployment-remediation-plan.md`
- `docs/project-workflow.md`
- `docs/deployment-log.md`
- `docs/project-change-log.md`
- `docs/legacy-deploy-index.md`

## Production Frontend

- Production URL: https://ddddkiii.com
- Current deployed entry bundle: `assets/js/index-DatxT-TX.js`
- Current Doudian page chunk: `assets/js/DoudianView-DkKp-eK0.js`
- Current WeChat store page chunk: `assets/js/MonetizationView-CnaQ65jI.js`
- Local build source: `C:\Users\EDY\jujuju\frontend\dist`

Older frontend refs were removed from the public server and now return `404`.
Do not use historical bundle names to decide what is current; verify the public
HTML entry bundle instead.

## Production Backend

- Backend process: PM2 app `matrixflow`
- Backend path on server: `/opt/matrixflow/backend`
- Latest backend deployment included:
  - `DoudianBrowserModule` in `dist/app.module.js`
  - `doudian-browser` module files
  - `prisma/schema.prisma` containing `DoudianStore`, `DoudianStoreOrder`, `DoudianStoreProduct`, and `DoudianStoreAftersale`
  - Prisma Client regeneration via `npx prisma generate`
  - PM2 restart
- Verified public endpoints:
  - `GET https://ddddkiii.com/api/v1/health` -> `200`
  - `GET https://ddddkiii.com/api/v1/doudian-browser/shop/orders?store_id=cmr0qai7f1188xz13dm8ywxvk` -> `200`
  - `GET https://ddddkiii.com/api/v1/doudian-browser/shop/products?store_id=cmr0qai7f1188xz13dm8ywxvk` -> `200`
  - `GET https://ddddkiii.com/api/v1/doudian-browser/shop/aftersale?store_id=cmr0qai7f1188xz13dm8ywxvk` -> `200`

Troubleshooting notes:

- If Doudian routes return `404`, the backend is running an older app module.
- If Doudian routes return `Cannot read properties of undefined (reading 'findMany')`, first verify `/opt/matrixflow/backend/prisma/schema.prisma` contains the Doudian models. The safe backend deploy script was fixed at 2026-07-03 01:33 Asia/Shanghai to replace the remote `prisma` directory before generating Prisma Client.
- If companion upload returns `530`, verify the backend module and Cloudflare/origin health before touching local login profiles.

## Desktop Companion

- Current runnable companion:
  `C:\Users\EDY\jujuju\desktop-companion\dist\pixingyun-mate\pixingyun-mate.exe`
- Latest marked companion backup:
  `C:\Users\EDY\jujuju\desktop-companion\backups\pixingyun-mate-latest-final-20260703-000134.zip`
- Backup size: `79987301` bytes
- Current exe timestamp: `2026-07-02 19:44:38`
- Current build marker:
  `C:\Users\EDY\jujuju\desktop-companion\dist\pixingyun-mate\CURRENT_VERSION.txt`

The latest companion includes:

- Doudian multi-account isolated profiles.
- Doudian delete-store support.
- Doudian scheduled collection: daytime every 30 minutes, nighttime every 2 hours.
- Doudian empty-payload guard for `NoneType is not iterable`.

Do not treat old June 2026 companion zip files as latest, even if their Chinese names look relevant or are mojibaked in terminal output. The latest backup is the exact `pixingyun-mate-latest-final-20260703-000134.zip` file above.

Do not treat old `dist_backup`, `dist_fixed`, `build_fixed`, or `release` folders as current.

## Doudian Stores

Current local stores:

- Local profile `85bc297a46e2`, UI name `唐商披星`, cloud store `cmr0qai7f1188xz13dm8ywxvk`
- Local profile `ca8d0b5d5919`, UI name `披星教育`, cloud store `cmr3fkxxc635cr5jhwi1q4rls`

Login state is not stored in old companion folders. It lives under:

`%LOCALAPPDATA%\MatrixFlow\browser-profiles\doudian`

Do not delete that profile directory unless the user explicitly asks to remove Doudian login state.
