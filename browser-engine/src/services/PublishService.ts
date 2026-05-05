/**
 * 发布服务
 *
 * 编排跨平台内容发布流程
 * 支持单次发布、定时发布、批量发布
 * 使用内存队列管理任务（生产环境可替换为 BullMQ + Redis）
 */

import { Page } from 'playwright';
import { logger } from '../utils/logger';
import { BrowserService } from './BrowserService';
import * as CookieService from './CookieService';
import * as ScreenshotService from './ScreenshotService';
import { PublishTask, TaskStatus, Platform, IPublishContent } from '../models/PublishTask';
import { IPlatformAdapter, IPublishResult } from './adapters/IPlatformAdapter';
import { DouyinAdapter } from './adapters/DouyinAdapter';
import { KuaishouAdapter } from './adapters/KuaishouAdapter';
import { XiaohongshuAdapter } from './adapters/XiaohongshuAdapter';
import { ShipinhaoAdapter } from './adapters/ShipinhaoAdapter';
import { BilibiliAdapter } from './adapters/BilibiliAdapter';
import { WeiboAdapter } from './adapters/WeiboAdapter';

// 任务存储（内存，生产环境用 Redis）
const taskStore: Map<string, PublishTask> = new Map();
const scheduledTimers: Map<string, NodeJS.Timeout> = new Map();

// 并发控制
let runningTasks = 0;
const MAX_CONCURRENT_TASKS = parseInt(process.env.MAX_CONCURRENT_TASKS || '3', 10);
const taskQueue: PublishTask[] = [];

// 适配器缓存（避免每次创建新实例）
const adapterCache: Map<Platform, IPlatformAdapter> = new Map();

/**
 * 获取平台适配器（带缓存）
 */
function getAdapter(platform: Platform): IPlatformAdapter {
  const cached = adapterCache.get(platform);
  if (cached) return cached;

  const adapters: Partial<Record<Platform, IPlatformAdapter>> = {
    [Platform.DOUYIN]: new DouyinAdapter(),
    [Platform.KUAISHOU]: new KuaishouAdapter(),
    [Platform.XIAOHONGSHU]: new XiaohongshuAdapter(),
    [Platform.SHIPINHAO]: new ShipinhaoAdapter(),
    [Platform.BILIBILI]: new BilibiliAdapter(),
    [Platform.WEIBO]: new WeiboAdapter(),
  };

  const adapter = adapters[platform];
  if (!adapter) {
    throw new Error(`不支持的平台: ${platform}`);
  }

  adapterCache.set(platform, adapter);
  return adapter;
}

// 定期清理过期任务（每小时）
const CLEANUP_INTERVAL = 60 * 60 * 1000;
const cleanupTimer = setInterval(() => {
  cleanupTasks();
}, CLEANUP_INTERVAL);
// 防止定时器阻止进程退出
if (cleanupTimer.unref) {
  cleanupTimer.unref();
}

/**
 * 执行单个发布任务
 */
async function executeTask(task: PublishTask): Promise<void> {
  const browserService = BrowserService.getInstance();
  const adapter = getAdapter(task.platform);

  logger.info(`开始执行发布任务: ${task.id}`, {
    platform: task.platform,
    accountId: task.accountId,
  });

  task.markRunning();
  taskStore.set(task.id, task);

  try {
    // 1. 创建浏览器上下文
    await browserService.createContext(task.accountId);
    const page = await browserService.getPage(task.accountId);

    // 2. 加载 Cookie
    await CookieService.loadCookiesToContext(task.accountId, page);

    // 3. 检查登录状态
    const isLoggedIn = await adapter.checkLoginStatus(page);
    if (!isLoggedIn) {
      throw new Error(`${adapter.platformName} 未登录，请先导入有效的 Cookie`);
    }

    // 4. 执行发布
    const result: IPublishResult = await adapter.publish(page, task.content);

    if (!result.success) {
      throw new Error(result.error || '发布失败');
    }

    // 5. 截图验证
    try {
      const screenshotPath = await ScreenshotService.takeScreenshot(page, `${task.platform}_${task.id}`);
      task.screenshotPath = screenshotPath;
    } catch (err) {
      logger.warn('截图保存失败:', err);
    }

    // 6. 刷新 Cookie
    try {
      await CookieService.refreshCookies(task.accountId, page);
    } catch (err) {
      logger.warn('Cookie 刷新失败:', err);
    }

    // 7. 标记成功
    task.markSuccess(undefined, result.publishedUrl);
    logger.info(`发布成功: ${task.id}`, { publishedUrl: result.publishedUrl });

    // 8. 关闭上下文
    await browserService.closeContext(task.accountId);
  } catch (err) {
    const error = (err as Error).message;
    logger.error(`发布失败: ${task.id}`, { error });

    // 尝试重试
    if (task.canRetry()) {
      task.retry();
      logger.info(`任务重试: ${task.id} (第 ${task.retryCount} 次)`);
      taskQueue.push(task);
    } else {
      task.markFailed(error);
    }

    // 确保关闭上下文
    try {
      await browserService.closeContext(task.accountId);
    } catch {
      // 忽略关闭错误
    }
  } finally {
    runningTasks--;
    processQueue();
  }
}

/**
 * 处理任务队列
 */
function processQueue(): void {
  while (runningTasks < MAX_CONCURRENT_TASKS && taskQueue.length > 0) {
    const task = taskQueue.shift();
    if (task) {
      runningTasks++;
      executeTask(task).catch((err) => {
        logger.error(`任务执行异常: ${task.id}`, err);
      });
    }
  }
}

/**
 * 发布内容
 */
export async function publish(
  accountId: string,
  platform: Platform,
  content: IPublishContent
): Promise<PublishTask> {
  const task = new PublishTask({ accountId, platform, content });
  taskStore.set(task.id, task);

  // 加入队列
  task.status = TaskStatus.QUEUED;
  taskQueue.push(task);
  processQueue();

  logger.info(`发布任务已创建: ${task.id}`, { platform, accountId });
  return task;
}

/**
 * 定时发布
 */
export async function schedulePublish(
  taskId: string,
  scheduledTime: Date
): Promise<PublishTask> {
  const task = taskStore.get(taskId);
  if (!task) {
    throw new Error(`任务不存在: ${taskId}`);
  }

  if (task.status !== TaskStatus.PENDING && task.status !== TaskStatus.QUEUED) {
    throw new Error(`任务状态不允许定时: ${task.status}`);
  }

  task.scheduledAt = scheduledTime;
  taskStore.set(taskId, task);

  const delay = scheduledTime.getTime() - Date.now();
  if (delay <= 0) {
    // 立即执行
    taskQueue.push(task);
    processQueue();
  } else {
    // 定时执行
    const timer = setTimeout(() => {
      scheduledTimers.delete(taskId);
      taskQueue.push(task);
      processQueue();
    }, delay);

    scheduledTimers.set(taskId, timer);
    logger.info(`定时任务已设置: ${taskId}`, { scheduledTime: scheduledTime.toISOString() });
  }

  return task;
}

/**
 * 批量发布
 */
export async function batchPublish(
  tasks: Array<{
    accountId: string;
    platform: Platform;
    content: IPublishContent;
    scheduledAt?: Date;
  }>
): Promise<PublishTask[]> {
  const results: PublishTask[] = [];

  for (const taskDef of tasks) {
    const task = new PublishTask({
      accountId: taskDef.accountId,
      platform: taskDef.platform,
      content: taskDef.content,
    });
    taskStore.set(task.id, task);

    if (taskDef.scheduledAt) {
      await schedulePublish(task.id, taskDef.scheduledAt);
    } else {
      task.status = TaskStatus.QUEUED;
      taskQueue.push(task);
    }

    results.push(task);
  }

  processQueue();

  logger.info(`批量发布任务已创建: ${results.length} 个`);
  return results;
}

/**
 * 获取任务状态
 */
export function getTask(taskId: string): PublishTask | null {
  return taskStore.get(taskId) || null;
}

/**
 * 获取所有任务
 */
export function getAllTasks(filters?: {
  status?: TaskStatus;
  platform?: Platform;
  accountId?: string;
  limit?: number;
  offset?: number;
}): { tasks: PublishTask[]; total: number } {
  let tasks = Array.from(taskStore.values());

  if (filters?.status) {
    tasks = tasks.filter((t) => t.status === filters.status);
  }
  if (filters?.platform) {
    tasks = tasks.filter((t) => t.platform === filters.platform);
  }
  if (filters?.accountId) {
    tasks = tasks.filter((t) => t.accountId === filters.accountId);
  }

  // 按创建时间倒序
  tasks.sort((a, b) => b.createdAt.getTime() - a.createdAt.getTime());

  const total = tasks.length;
  const offset = filters?.offset || 0;
  const limit = filters?.limit || 50;

  return {
    tasks: tasks.slice(offset, offset + limit),
    total,
  };
}

/**
 * 取消任务
 */
export function cancelTask(taskId: string): boolean {
  const task = taskStore.get(taskId);
  if (!task) return false;

  if (task.status === TaskStatus.RUNNING) {
    return false; // 运行中的任务不能取消
  }

  // 取消定时器
  const timer = scheduledTimers.get(taskId);
  if (timer) {
    clearTimeout(timer);
    scheduledTimers.delete(taskId);
  }

  // 从队列中移除
  const queueIndex = taskQueue.findIndex((t) => t.id === taskId);
  if (queueIndex >= 0) {
    taskQueue.splice(queueIndex, 1);
  }

  task.markCancelled();
  taskStore.set(taskId, task);

  logger.info(`任务已取消: ${taskId}`);
  return true;
}

/**
 * 重试失败任务
 */
export function retryTask(taskId: string): boolean {
  const task = taskStore.get(taskId);
  if (!task || task.status !== TaskStatus.FAILED) return false;

  task.retry();
  taskQueue.push(task);
  processQueue();

  logger.info(`任务已重新入队: ${taskId}`);
  return true;
}

/**
 * 获取队列状态
 */
export function getQueueStatus(): {
  running: number;
  queued: number;
  maxConcurrent: number;
} {
  return {
    running: runningTasks,
    queued: taskQueue.length,
    maxConcurrent: MAX_CONCURRENT_TASKS,
  };
}

/**
 * 清理已完成的任务（保留最近 N 个）
 */
export function cleanupTasks(maxAge: number = 7 * 24 * 60 * 60 * 1000): number {
  const cutoff = Date.now() - maxAge;
  let cleaned = 0;

  for (const [id, task] of taskStore.entries()) {
    if (
      (task.status === TaskStatus.SUCCESS || task.status === TaskStatus.FAILED || task.status === TaskStatus.CANCELLED) &&
      task.completedAt &&
      task.completedAt.getTime() < cutoff
    ) {
      taskStore.delete(id);
      cleaned++;
    }
  }

  if (cleaned > 0) {
    logger.info(`已清理 ${cleaned} 个过期任务`);
  }

  return cleaned;
}
