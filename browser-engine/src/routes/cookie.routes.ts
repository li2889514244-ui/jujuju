/**
 * Cookie 管理 API 路由
 *
 * 提供 Cookie 的保存、加载、验证、删除等接口
 */

import { Router, Request, Response } from 'express';
import * as CookieService from '../services/CookieService';
import { ICookieData } from '../models/CookieData';
import { logger } from '../utils/logger';

export const cookieRoutes = Router();

/**
 * 验证 accountId 格式
 */
function isValidAccountId(accountId: unknown): accountId is string {
  return typeof accountId === 'string' && accountId.length > 0 && accountId.length <= 128;
}

/**
 * 验证单个 Cookie 格式
 */
function validateCookie(cookie: unknown): { valid: boolean; error?: string } {
  if (!cookie || typeof cookie !== 'object') {
    return { valid: false, error: 'Cookie 必须是对象' };
  }
  const c = cookie as Record<string, unknown>;
  if (!c.name || typeof c.name !== 'string') {
    return { valid: false, error: 'Cookie 必须包含 name（字符串）' };
  }
  if (!c.domain || typeof c.domain !== 'string') {
    return { valid: false, error: 'Cookie 必须包含 domain（字符串）' };
  }
  if (c.value === undefined || c.value === null) {
    return { valid: false, error: 'Cookie 必须包含 value' };
  }
  return { valid: true };
}

/**
 * POST /api/cookies/:accountId
 * 保存 Cookie
 */
cookieRoutes.post('/:accountId', async (req: Request, res: Response) => {
  try {
    const { accountId } = req.params;
    const { cookies } = req.body;

    if (!isValidAccountId(accountId)) {
      res.status(400).json({ success: false, error: '无效的 accountId' });
      return;
    }

    if (!Array.isArray(cookies) || cookies.length === 0) {
      res.status(400).json({
        success: false,
        error: '请提供 Cookie 列表 cookies（非空数组）',
      });
      return;
    }

    // 验证每个 Cookie 格式
    for (let i = 0; i < cookies.length; i++) {
      const validation = validateCookie(cookies[i]);
      if (!validation.valid) {
        res.status(400).json({
          success: false,
          error: `Cookie ${i}: ${validation.error}`,
        });
        return;
      }
    }

    await CookieService.saveCookies(accountId, cookies as ICookieData[]);

    res.json({
      success: true,
      message: `Cookie 已保存: ${accountId} (${cookies.length} 条)`,
    });
  } catch (err) {
    logger.error('保存 Cookie 失败:', err);
    res.status(500).json({
      success: false,
      error: (err as Error).message,
    });
  }
});

/**
 * GET /api/cookies/:accountId
 * 加载 Cookie
 */
cookieRoutes.get('/:accountId', async (req: Request, res: Response) => {
  try {
    const { accountId } = req.params;

    if (!isValidAccountId(accountId)) {
      res.status(400).json({ success: false, error: '无效的 accountId' });
      return;
    }

    const cookies = await CookieService.loadCookies(accountId);

    res.json({
      success: true,
      data: cookies,
      total: cookies.length,
    });
  } catch (err) {
    logger.error('加载 Cookie 失败:', err);
    res.status(500).json({
      success: false,
      error: (err as Error).message,
    });
  }
});

/**
 * POST /api/cookies/:accountId/validate
 * 验证 Cookie 有效性
 */
cookieRoutes.post('/:accountId/validate', async (req: Request, res: Response) => {
  try {
    const { accountId } = req.params;

    if (!isValidAccountId(accountId)) {
      res.status(400).json({ success: false, error: '无效的 accountId' });
      return;
    }

    const result = await CookieService.validateCookies(accountId);

    res.json({
      success: true,
      data: result,
    });
  } catch (err) {
    logger.error('验证 Cookie 失败:', err);
    res.status(500).json({
      success: false,
      error: (err as Error).message,
    });
  }
});

/**
 * POST /api/cookies/:accountId/refresh
 * 刷新 Cookie（需要浏览器上下文已创建）
 */
cookieRoutes.post('/:accountId/refresh', async (req: Request, res: Response) => {
  try {
    const { accountId } = req.params;

    if (!isValidAccountId(accountId)) {
      res.status(400).json({ success: false, error: '无效的 accountId' });
      return;
    }

    // 获取页面
    const { BrowserService } = await import('../services/BrowserService');
    const browserService = BrowserService.getInstance();
    const page = await browserService.getPage(accountId);

    const cookies = await CookieService.refreshCookies(accountId, page);

    res.json({
      success: true,
      message: `Cookie 已刷新: ${cookies.length} 条`,
      data: cookies,
    });
  } catch (err) {
    logger.error('刷新 Cookie 失败:', err);
    res.status(500).json({
      success: false,
      error: (err as Error).message,
    });
  }
});

/**
 * DELETE /api/cookies/:accountId
 * 删除 Cookie
 */
cookieRoutes.delete('/:accountId', async (req: Request, res: Response) => {
  try {
    const { accountId } = req.params;

    if (!isValidAccountId(accountId)) {
      res.status(400).json({ success: false, error: '无效的 accountId' });
      return;
    }

    const deleted = await CookieService.deleteCookies(accountId);

    res.json({
      success: deleted,
      message: deleted ? `Cookie 已删除: ${accountId}` : `Cookie 不存在: ${accountId}`,
    });
  } catch (err) {
    logger.error('删除 Cookie 失败:', err);
    res.status(500).json({
      success: false,
      error: (err as Error).message,
    });
  }
});
