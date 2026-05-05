/**
 * 截图服务
 *
 * 管理页面截图和录屏功能
 */

import { Page } from 'playwright';
import fs from 'fs/promises';
import path from 'path';
import { logger } from '../utils/logger';

// 截图存储目录
const SCREENSHOT_DIR = path.join(__dirname, '..', '..', 'data', 'screenshots');
const RECORDING_DIR = path.join(__dirname, '..', '..', 'data', 'recordings');

// 录屏状态
let recordingPage: Page | null = null;
let recordingPath: string | null = null;

/**
 * 确保目录存在
 */
async function ensureDir(dir: string): Promise<void> {
  try {
    await fs.access(dir);
  } catch {
    await fs.mkdir(dir, { recursive: true });
  }
}

/**
 * 截图并保存
 */
export async function takeScreenshot(
  page: Page,
  name: string,
  options?: {
    fullPage?: boolean;
    clip?: { x: number; y: number; width: number; height: number };
    quality?: number;
    type?: 'png' | 'jpeg';
  }
): Promise<string> {
  await ensureDir(SCREENSHOT_DIR);

  const timestamp = Date.now();
  const ext = options?.type || 'png';
  const fileName = `${name}_${timestamp}.${ext}`;
  const filePath = path.join(SCREENSHOT_DIR, fileName);

  await page.screenshot({
    path: filePath,
    fullPage: options?.fullPage ?? false,
    clip: options?.clip,
    quality: options?.type === 'jpeg' ? (options?.quality || 80) : undefined,
    type: options?.type || 'png',
  });

  logger.info(`截图已保存: ${filePath}`);
  return filePath;
}

/**
 * 开始录屏
 *
 * 使用 Playwright 的 video 录制功能
 * 注意：需要在创建上下文时配置 video 选项
 */
export async function startRecording(page: Page, name?: string): Promise<string> {
  await ensureDir(RECORDING_DIR);

  const timestamp = Date.now();
  const fileName = name ? `${name}_${timestamp}` : `recording_${timestamp}`;
  const videoDir = path.join(RECORDING_DIR, fileName);

  await fs.mkdir(videoDir, { recursive: true });

  // 注意：Playwright 的 video 需要在创建上下文时配置
  // 这里通过获取当前视频路径来实现
  try {
    const video = page.video();
    if (video) {
      recordingPage = page;
      recordingPath = videoDir;
      logger.info(`录屏已开始: ${videoDir}`);
      return videoDir;
    }
  } catch (err) {
    logger.warn('录屏启动失败，当前上下文可能未配置 video:', err);
  }

  throw new Error('无法启动录屏。请确保创建浏览器上下文时配置了 video 选项。');
}

/**
 * 停止录屏并保存
 */
export async function stopRecording(): Promise<string | null> {
  if (!recordingPage || !recordingPath) {
    logger.warn('没有正在进行的录屏');
    return null;
  }

  try {
    const video = recordingPage.video();
    if (video) {
      const fileName = `video_${Date.now()}.webm`;
      const filePath = path.join(recordingPath, fileName);
      await video.saveAs(filePath);
      logger.info(`录屏已保存: ${filePath}`);

      recordingPage = null;
      recordingPath = null;
      return filePath;
    }
  } catch (err) {
    logger.error('停止录屏失败:', err);
  }

  recordingPage = null;
  recordingPath = null;
  return null;
}

/**
 * 获取截图列表
 */
export async function listScreenshots(): Promise<string[]> {
  await ensureDir(SCREENSHOT_DIR);
  try {
    const files = await fs.readdir(SCREENSHOT_DIR);
    return files.filter((f) => f.endsWith('.png') || f.endsWith('.jpeg') || f.endsWith('.jpg'));
  } catch {
    return [];
  }
}

/**
 * 删除截图
 */
export async function deleteScreenshot(fileName: string): Promise<boolean> {
  const filePath = path.join(SCREENSHOT_DIR, fileName);
  try {
    await fs.unlink(filePath);
    return true;
  } catch {
    return false;
  }
}

/**
 * 清理过期截图（保留最近 N 天）
 */
export async function cleanupScreenshots(maxAgeDays: number = 7): Promise<number> {
  await ensureDir(SCREENSHOT_DIR);

  const files = await fs.readdir(SCREENSHOT_DIR);
  const cutoff = Date.now() - maxAgeDays * 24 * 60 * 60 * 1000;
  let deletedCount = 0;

  for (const file of files) {
    const filePath = path.join(SCREENSHOT_DIR, file);
    try {
      const stat = await fs.stat(filePath);
      if (stat.mtimeMs < cutoff) {
        await fs.unlink(filePath);
        deletedCount++;
      }
    } catch {
      // 忽略无法访问的文件
    }
  }

  if (deletedCount > 0) {
    logger.info(`已清理 ${deletedCount} 张过期截图`);
  }

  return deletedCount;
}
