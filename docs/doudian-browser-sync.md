# Doudian Browser Sync

抖店采集走浏览器登录态，不依赖抖店开放平台 API。它适合当前没有 API 权限、主要目标是查询订单、商品、售后数据的场景。

当前生产方案是：桌面伴侣在本机保存抖店登录态并采集，`ddddkiii.com` 只负责接收、入库和展示。

## What It Collects

- 订单：抖店后台订单列表接口响应
- 商品：抖店后台商品列表接口响应
- 售后：抖店后台售后列表接口响应

同步时会打开 headless browser，复用每个店铺独立的本机浏览器 profile，访问抖店后台页面并捕获 JSON 响应。当前每个列表最多尝试翻 5 页，并按业务 ID 去重后上传到云端落库。

## Setup

后端必须配置 PostgreSQL：

```powershell
cd C:\Users\EDY\jujuju\backend
$env:DATABASE_URL="postgresql://USER:PASSWORD@HOST:5432/DB_NAME"
npx prisma migrate deploy
npm run dev
```

## Production Flow

1. 打开新版桌面伴侣，确认 `http://localhost:5409/health` 可访问。
2. 打开 `https://ddddkiii.com/doudian`。
3. 添加抖店店铺。
4. 点击“打开登录”，在本机浏览器窗口完成抖店登录。
5. 点击“同步”，本机伴侣静默采集并上传到云端。
6. 页面刷新后从云端缓存读取订单、商品、售后。

本机 profile 保存位置：

```text
%LOCALAPPDATA%\MatrixFlow\browser-profiles\doudian\<store-id>
```

## Multi Account Flow

多个店铺建议一个接一个同步。桌面伴侣按单店铺任务执行；批量调度时也应该串行：

1. 店铺 A 启动本机 headless browser
2. 采集订单、商品、售后
3. 关闭 browser
4. 等 30 秒
5. 再同步店铺 B

这样比并发多个账号更稳，也更接近人工低频查询行为。

## UI

前端入口：

```text
/doudian
```

页面支持：

- 添加店铺
- 打开登录窗口
- 检查登录态
- 通过本机伴侣手动同步
- 查询缓存订单、商品、售后

## API

后端全局前缀是 `/api/v1`。

```text
GET  /api/v1/doudian-browser/stores
POST /api/v1/doudian-browser/stores
POST /api/v1/doudian-browser/stores/companion
POST /api/v1/doudian-browser/stores/:id/login
GET  /api/v1/doudian-browser/stores/:id/session
POST /api/v1/doudian-browser/stores/:id/sync
POST /api/v1/doudian-browser/stores/:id/upload
POST /api/v1/doudian-browser/sync
GET  /api/v1/doudian-browser/shop/orders?store_id=<id>
GET  /api/v1/doudian-browser/shop/products?store_id=<id>
GET  /api/v1/doudian-browser/shop/aftersale?store_id=<id>
```

桌面伴侣本地 API：

```text
GET  http://localhost:5409/api/doudian/stores
POST http://localhost:5409/api/doudian/stores
POST http://localhost:5409/api/doudian/stores/:local_id/login
POST http://localhost:5409/api/doudian/stores/:local_id/sync
GET  http://localhost:5409/api/doudian/jobs/:job_id
```

## Safety Notes

- 不要高频同步。建议 30 分钟以上一次，多个账号串行。
- 不要把 `doudian_profiles/`、`doudian_probe_profile/` 或 `%LOCALAPPDATA%\MatrixFlow\browser-profiles\doudian` 提交到 Git。
- 这是后台登录态采集，不是官方 API；如果页面结构或接口变化，需要重新验证选择器和接口路径。
- 采集逻辑只读页面数据，不执行发货、改价、退款等写操作。
