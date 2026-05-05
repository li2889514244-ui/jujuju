/**
 * 浏览器管理 API 路由
 *
 * 提供浏览器实例的启动、关闭、状态查询等接口
 */

import { Router, Request, Response } from 'express';
import { BrowserService } from '../services/BrowserService';
import { logger } from '../utils/logger';

export const browserRoutes = Router();
const browserService = BrowserService.getInstance();

/**
 * 验证 accountId 格式
 */
function isValidAccountId(accountId: unknown): accountId is string {
  return typeof accountId === 'string' && accountId.length > 0 && accountId.length <= 128;
}

/**
 * POST /api/browser/launch
 * 启动浏览器实例
 */
browserRoutes.post('/launch', async (_req: Request, res: Response) => {
  try {
    const browser = await browserService.launchBrowser();
    res.json({
      success: true,
      message: '浏览器已启动',
      connected: browser.isConnected(),
    });
  } catch (err) {
    logger.error('启动浏览器失败:', err);
    res.status(500).json({
      success: false,
      error: (err as Error).message,
    });
  }
});

/**
 * POST /api/browser/context
 * 创建浏览器上下文
 */
browserRoutes.post('/context', async (req: Request, res: Response) => {
  try {
    const { accountId, browserType } = req.body;

    if (!isValidAccountId(accountId)) {
      res.status(400).json({ success: false, error: '缺少或无效的 accountId' });
      return;
    }

    // 验证 browserType
    const validTypes = ['chromium', 'firefox', 'webkit'];
    if (browserType && !validTypes.includes(browserType)) {
      res.status(400).json({
        success: false,
        error: `无效的 browserType，支持: ${validTypes.join(', ')}`,
      });
      return;
    }

    const context = await browserService.createContext(accountId);
    res.json({
      success: true,
      message: '上下文已创建',
      accountId,
      browserType: browserType || 'chromium',
    });
  } catch (err) {
    logger.error('创建上下文失败:', err);
    res.status(500).json({
      success: false,
      error: (err as Error).message,
    });
  }
});

/**
 * POST /api/browser/page
 * 获取页面实例
 */
browserRoutes.post('/page', async (req: Request, res: Response) => {
  try {
    const { accountId } = req.body;

    if (!isValidAccountId(accountId)) {
      res.status(400).json({ success: false, error: '缺少或无效的 accountId' });
      return;
    }

    const page = await browserService.getPage(accountId);
    res.json({
      success: true,
      message: '页面已创建',
      url: page.url(),
    });
  } catch (err) {
    logger.error('获取页面失败:', err);
    res.status(500).json({
      success: false,
      error: (err as Error).message,
    });
  }
});

/**
 * DELETE /api/browser/context/:accountId
 * 关闭指定上下文
 */
browserRoutes.delete('/context/:accountId', async (req: Request, res: Response) => {
  try {
    const { accountId } = req.params;

    if (!isValidAccountId(accountId)) {
      res.status(400).json({ success: false, error: '无效的 accountId' });
      return;
    }

    await browserService.closeContext(accountId);
    res.json({
      success: true,
      message: `上下文已关闭: ${accountId}`,
    });
  } catch (err) {
    logger.error('关闭上下文失败:', err);
    res.status(500).json({
      success: false,
      error: (err as Error).message,
    });
  }
});

/**
 * POST /api/browser/close-all
 * 关闭所有实例
 */
browserRoutes.post('/close-all', async (_req: Request, res: Response) => {
  try {
    await browserService.closeAll();
    res.json({
      success: true,
      message: '所有浏览器实例已关闭',
    });
  } catch (err) {
    logger.error('关闭所有实例失败:', err);
    res.status(500).json({
      success: false,
      error: (err as Error).message,
    });
  }
});

/**
 * GET /api/browser/status
 * 获取浏览器服务状态
 */
browserRoutes.get('/status', (_req: Request, res: Response) => {
  try {
    const status = browserService.getStatus();
    res.json({
      success: true,
      data: status,
    });
  } catch (err) {
    res.status(500).json({
      success: false,
      error: (err as Error).message,
    });
  }
});

/**
 * GET /api/browser/sessions
 * 获取所有活跃会话
 */
browserRoutes.get('/sessions', (_req: Request, res: Response) => {
  try {
    const sessions = browserService.getSessions();
    res.json({
      success: true,
      data: sessions,
      total: sessions.length,
    });
  } catch (err) {
    res.status(500).json({
      success: false,
      error: (err as Error).message,
    });
  }
});

/**
 * GET /api/browser/sessions/:accountId
 * 获取指定会话
 */
browserRoutes.get('/sessions/:accountId', (req: Request, res: Response) => {
  try {
    const { accountId } = req.params;
    const session = browserService.getSession(accountId);

    if (!session) {
      res.status(404).json({
        success: false,
        error: `会话不存在: ${accountId}`,
      });
      return;
    }

    res.json({
      success: true,
      data: session,
    });
  } catch (err) {
    res.status(500).json({
      success: false,
      error: (err as Error).message,
    });
  }
});

/**
 * POST /api/browser/screenshot
 * 截图
 */
browserRoutes.post('/screenshot', async (req: Request, res: Response) => {
  try {
    const { accountId, fullPage, path } = req.body;

    if (!isValidAccountId(accountId)) {
      res.status(400).json({ success: false, error: '缺少或无效的 accountId' });
      return;
    }

    const buffer = await browserService.screenshot(accountId, { fullPage, path });

    if (path) {
      res.json({
        success: true,
        message: '截图已保存',
        path,
      });
    } else {
      res.set('Content-Type', 'image/png');
      res.send(buffer);
    }
  } catch (err) {
    logger.error('截图失败:', err);
    res.status(500).json({
      success: false,
      error: (err as Error).message,
    });
  }
});
