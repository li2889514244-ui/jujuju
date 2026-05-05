/**
 * MatrixFlow Browser Engine - Express 应用配置
 *
 * 功能：
 * 1. Express 中间件配置
 * 2. 路由注册
 * 3. 错误处理
 * 4. 健康检查端点
 */

import express, { Request, Response, NextFunction } from 'express';
import { logger } from './utils/logger';
import { BrowserService } from './services/BrowserService';
import { browserRoutes } from './routes/browser.routes';
import { publishRoutes } from './routes/publish.routes';
import { cookieRoutes } from './routes/cookie.routes';

export const app = express();

// ==================== 中间件 ====================

// 请求日志
app.use((req: Request, _res: Response, next: NextFunction) => {
  logger.debug(`${req.method} ${req.url}`, {
    ip: req.ip,
    userAgent: req.get('user-agent'),
  });
  next();
});

// 解析 JSON 请求体
app.use(express.json({ limit: '50mb' }));

// 解析 URL 编码的请求体
app.use(express.urlencoded({ extended: true, limit: '50mb' }));

// CORS 支持
app.use((_req: Request, res: Response, next: NextFunction) => {
  res.header('Access-Control-Allow-Origin', '*');
  res.header('Access-Control-Allow-Methods', 'GET, POST, PUT, DELETE, PATCH, OPTIONS');
  res.header('Access-Control-Allow-Headers', 'Content-Type, Authorization, X-Request-Id');

  if (_req.method === 'OPTIONS') {
    res.sendStatus(204);
    return;
  }
  next();
});

// 请求 ID 注入
app.use((req: Request, _res: Response, next: NextFunction) => {
  const requestId = req.get('X-Request-Id') || `req_${Date.now()}_${Math.random().toString(36).slice(2, 9)}`;
  req.headers['x-request-id'] = requestId;
  next();
});

// 请求体大小验证（超过 100MB 拒绝）
app.use((req: Request, res: Response, next: NextFunction) => {
  const contentLength = parseInt(req.get('content-length') || '0', 10);
  if (contentLength > 100 * 1024 * 1024) {
    res.status(413).json({
      success: false,
      error: '请求体过大',
    });
    return;
  }
  next();
});

// ==================== 健康检查 ====================

app.get('/health', (_req: Request, res: Response) => {
  try {
    const browserService = BrowserService.getInstance();
    const browserStatus = browserService.getStatus();

    res.json({
      status: 'ok',
      service: 'browser-engine',
      version: '0.1.0',
      uptime: process.uptime(),
      timestamp: new Date().toISOString(),
      memory: {
        rss: Math.round(process.memoryUsage().rss / 1024 / 1024),
        heapUsed: Math.round(process.memoryUsage().heapUsed / 1024 / 1024),
        heapTotal: Math.round(process.memoryUsage().heapTotal / 1024 / 1024),
        external: Math.round(process.memoryUsage().external / 1024 / 1024),
      },
      browser: {
        initialized: browserStatus.initialized,
        connected: browserStatus.connected,
        activeSessions: browserStatus.activeSessions,
        maxContexts: browserStatus.maxContexts,
      },
    });
  } catch {
    res.json({
      status: 'degraded',
      service: 'browser-engine',
      version: '0.1.0',
      uptime: process.uptime(),
      timestamp: new Date().toISOString(),
      memory: {
        rss: Math.round(process.memoryUsage().rss / 1024 / 1024),
        heapUsed: Math.round(process.memoryUsage().heapUsed / 1024 / 1024),
      },
    });
  }
});

// 就绪探针（K8s readiness probe）
app.get('/ready', (_req: Request, res: Response) => {
  res.json({ status: 'ready' });
});

// 存活探针（K8s liveness probe）
app.get('/live', (_req: Request, res: Response) => {
  res.json({ status: 'alive' });
});

// ==================== API 路由 ====================

app.use('/api/browser', browserRoutes);
app.use('/api/publish', publishRoutes);
app.use('/api/cookies', cookieRoutes);

// ==================== 404 处理 ====================

app.use((_req: Request, res: Response) => {
  res.status(404).json({
    success: false,
    error: '接口不存在',
    path: _req.originalUrl,
  });
});

// ==================== 全局错误处理 ====================

app.use((err: Error, req: Request, res: Response, _next: NextFunction) => {
  const requestId = req.get('x-request-id') || 'unknown';

  logger.error(`请求处理失败 [${requestId}]:`, {
    error: err.message,
    stack: err.stack,
    path: req.originalUrl,
    method: req.method,
  });

  // 区分错误类型
  const statusCode = (err as Error & { statusCode?: number }).statusCode || 500;

  res.status(statusCode).json({
    success: false,
    error: process.env.NODE_ENV === 'production' ? '服务器内部错误' : err.message,
    requestId,
  });
});
