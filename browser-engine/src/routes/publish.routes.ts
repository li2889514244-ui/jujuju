/**
 * 发布 API 路由
 *
 * 提供内容发布、定时发布、批量发布、任务管理等接口
 */

import { Router, Request, Response } from 'express';
import * as PublishService from '../services/PublishService';
import { Platform, TaskStatus } from '../models/PublishTask';
import { logger } from '../utils/logger';

export const publishRoutes = Router();

/**
 * 验证平台参数
 */
function isValidPlatform(platform: unknown): platform is Platform {
  return typeof platform === 'string' && Object.values(Platform).includes(platform as Platform);
}

/**
 * 验证发布内容
 */
function validateContent(content: unknown): { valid: boolean; error?: string } {
  if (!content || typeof content !== 'object') {
    return { valid: false, error: 'content 必须是对象' };
  }
  const c = content as Record<string, unknown>;
  if (!c.title && !c.description) {
    return { valid: false, error: '至少需要 title 或 description' };
  }
  if (c.title && typeof c.title !== 'string') {
    return { valid: false, error: 'title 必须是字符串' };
  }
  if (c.description && typeof c.description !== 'string') {
    return { valid: false, error: 'description 必须是字符串' };
  }
  if (c.videoPath && typeof c.videoPath !== 'string') {
    return { valid: false, error: 'videoPath 必须是字符串' };
  }
  if (c.imagePaths && !Array.isArray(c.imagePaths)) {
    return { valid: false, error: 'imagePaths 必须是数组' };
  }
  if (c.hashtags && !Array.isArray(c.hashtags)) {
    return { valid: false, error: 'hashtags 必须是数组' };
  }
  return { valid: true };
}

/**
 * POST /api/publish
 * 单次发布
 */
publishRoutes.post('/', async (req: Request, res: Response) => {
  try {
    const { accountId, platform, content } = req.body;

    if (!accountId || typeof accountId !== 'string') {
      res.status(400).json({ success: false, error: '缺少 accountId' });
      return;
    }

    if (!isValidPlatform(platform)) {
      res.status(400).json({
        success: false,
        error: `不支持的平台: ${platform}。支持: ${Object.values(Platform).join(', ')}`,
      });
      return;
    }

    const contentValidation = validateContent(content);
    if (!contentValidation.valid) {
      res.status(400).json({ success: false, error: contentValidation.error });
      return;
    }

    const task = await PublishService.publish(accountId, platform as Platform, content);

    res.json({
      success: true,
      data: task.toJSON(),
    });
  } catch (err) {
    logger.error('发布失败:', err);
    res.status(500).json({
      success: false,
      error: (err as Error).message,
    });
  }
});

/**
 * POST /api/publish/schedule
 * 定时发布
 */
publishRoutes.post('/schedule', async (req: Request, res: Response) => {
  try {
    const { accountId, platform, content, scheduledTime } = req.body;

    if (!accountId || typeof accountId !== 'string') {
      res.status(400).json({ success: false, error: '缺少 accountId' });
      return;
    }

    if (!isValidPlatform(platform)) {
      res.status(400).json({
        success: false,
        error: `不支持的平台: ${platform}。支持: ${Object.values(Platform).join(', ')}`,
      });
      return;
    }

    const contentValidation = validateContent(content);
    if (!contentValidation.valid) {
      res.status(400).json({ success: false, error: contentValidation.error });
      return;
    }

    if (!scheduledTime) {
      res.status(400).json({ success: false, error: '缺少 scheduledTime' });
      return;
    }

    const scheduledDate = new Date(scheduledTime);
    if (isNaN(scheduledDate.getTime())) {
      res.status(400).json({ success: false, error: '无效的时间格式' });
      return;
    }

    if (scheduledDate.getTime() < Date.now()) {
      res.status(400).json({ success: false, error: '定时时间不能早于当前时间' });
      return;
    }

    // 创建任务并设置定时（schedulePublish 内部处理队列逻辑）
    const task = await PublishService.publish(accountId, platform as Platform, content);
    await PublishService.schedulePublish(task.id, scheduledDate);

    res.json({
      success: true,
      data: task.toJSON(),
    });
  } catch (err) {
    logger.error('定时发布设置失败:', err);
    res.status(500).json({
      success: false,
      error: (err as Error).message,
    });
  }
});

/**
 * POST /api/publish/batch
 * 批量发布
 */
publishRoutes.post('/batch', async (req: Request, res: Response) => {
  try {
    const { tasks } = req.body;

    if (!Array.isArray(tasks) || tasks.length === 0) {
      res.status(400).json({
        success: false,
        error: '请提供任务列表 tasks（数组）',
      });
      return;
    }

    // 验证每个任务
    for (let i = 0; i < tasks.length; i++) {
      const task = tasks[i];
      if (!task.accountId || typeof task.accountId !== 'string') {
        res.status(400).json({
          success: false,
          error: `任务 ${i}: 缺少或无效的 accountId`,
        });
        return;
      }
      if (!isValidPlatform(task.platform)) {
        res.status(400).json({
          success: false,
          error: `任务 ${i}: 不支持的平台 ${task.platform}`,
        });
        return;
      }
      const contentValidation = validateContent(task.content);
      if (!contentValidation.valid) {
        res.status(400).json({
          success: false,
          error: `任务 ${i}: ${contentValidation.error}`,
        });
        return;
      }
    }

    const results = await PublishService.batchPublish(tasks);

    res.json({
      success: true,
      data: results.map((t) => t.toJSON()),
      total: results.length,
    });
  } catch (err) {
    logger.error('批量发布失败:', err);
    res.status(500).json({
      success: false,
      error: (err as Error).message,
    });
  }
});

/**
 * GET /api/publish/tasks
 * 获取任务列表
 */
publishRoutes.get('/tasks', (req: Request, res: Response) => {
  try {
    const { status, platform, accountId, limit, offset } = req.query;

    // 验证 status 参数
    if (status && !Object.values(TaskStatus).includes(status as TaskStatus)) {
      res.status(400).json({
        success: false,
        error: `无效的 status，支持: ${Object.values(TaskStatus).join(', ')}`,
      });
      return;
    }

    // 验证 platform 参数
    if (platform && !isValidPlatform(platform)) {
      res.status(400).json({
        success: false,
        error: `无效的 platform，支持: ${Object.values(Platform).join(', ')}`,
      });
      return;
    }

    // 验证 limit/offset
    const parsedLimit = limit ? parseInt(limit as string, 10) : undefined;
    const parsedOffset = offset ? parseInt(offset as string, 10) : undefined;

    if (parsedLimit !== undefined && (isNaN(parsedLimit) || parsedLimit < 1 || parsedLimit > 100)) {
      res.status(400).json({ success: false, error: 'limit 必须在 1-100 之间' });
      return;
    }

    if (parsedOffset !== undefined && (isNaN(parsedOffset) || parsedOffset < 0)) {
      res.status(400).json({ success: false, error: 'offset 必须 >= 0' });
      return;
    }

    const result = PublishService.getAllTasks({
      status: status as TaskStatus | undefined,
      platform: platform as Platform | undefined,
      accountId: accountId as string | undefined,
      limit: parsedLimit,
      offset: parsedOffset,
    });

    res.json({
      success: true,
      data: result.tasks.map((t) => t.toJSON()),
      total: result.total,
    });
  } catch (err) {
    res.status(500).json({
      success: false,
      error: (err as Error).message,
    });
  }
});

/**
 * GET /api/publish/tasks/:taskId
 * 获取单个任务详情
 */
publishRoutes.get('/tasks/:taskId', (req: Request, res: Response) => {
  try {
    const { taskId } = req.params;

    if (!taskId || typeof taskId !== 'string') {
      res.status(400).json({ success: false, error: '缺少 taskId' });
      return;
    }

    const task = PublishService.getTask(taskId);

    if (!task) {
      res.status(404).json({
        success: false,
        error: `任务不存在: ${taskId}`,
      });
      return;
    }

    res.json({
      success: true,
      data: task.toJSON(),
    });
  } catch (err) {
    res.status(500).json({
      success: false,
      error: (err as Error).message,
    });
  }
});

/**
 * POST /api/publish/tasks/:taskId/cancel
 * 取消任务
 */
publishRoutes.post('/tasks/:taskId/cancel', (req: Request, res: Response) => {
  try {
    const { taskId } = req.params;
    const cancelled = PublishService.cancelTask(taskId);

    if (!cancelled) {
      res.status(400).json({
        success: false,
        error: '无法取消任务（可能正在执行中或不存在）',
      });
      return;
    }

    res.json({
      success: true,
      message: `任务已取消: ${taskId}`,
    });
  } catch (err) {
    res.status(500).json({
      success: false,
      error: (err as Error).message,
    });
  }
});

/**
 * POST /api/publish/tasks/:taskId/retry
 * 重试失败任务
 */
publishRoutes.post('/tasks/:taskId/retry', (req: Request, res: Response) => {
  try {
    const { taskId } = req.params;
    const retried = PublishService.retryTask(taskId);

    if (!retried) {
      res.status(400).json({
        success: false,
        error: '无法重试任务（可能不存在或状态不正确）',
      });
      return;
    }

    res.json({
      success: true,
      message: `任务已重新入队: ${taskId}`,
    });
  } catch (err) {
    res.status(500).json({
      success: false,
      error: (err as Error).message,
    });
  }
});

/**
 * GET /api/publish/queue
 * 获取队列状态
 */
publishRoutes.get('/queue', (_req: Request, res: Response) => {
  try {
    const status = PublishService.getQueueStatus();
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
