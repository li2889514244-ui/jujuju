/**
 * 反检测工具
 *
 * 注入反检测脚本到浏览器页面，绕过自动化检测
 * 包括：移除 webdriver 标志、伪装 navigator、随机化操作时间
 */

import { Page } from 'playwright';
import { logger } from './logger';

/**
 * 生成反检测脚本字符串，支持动态指纹配置
 */
function buildStealthScripts(fingerprint?: {
  platform?: string;
  languages?: string[];
  hardwareConcurrency?: number;
  deviceMemory?: number;
  webglVendor?: string;
  webglRenderer?: string;
}): string {
  const platform = fingerprint?.platform || 'Win32';
  const languages = JSON.stringify(fingerprint?.languages || ['zh-CN', 'zh', 'en-US', 'en']);
  const hwConcurrency = fingerprint?.hardwareConcurrency || 8;
  const devMemory = fingerprint?.deviceMemory || 8;
  const webglVendor = fingerprint?.webglVendor || 'Google Inc. (Intel)';
  const webglRenderer = fingerprint?.webglRenderer || 'ANGLE (Intel, Intel(R) UHD Graphics 630 Direct3D11 vs_5_0 ps_5_0)';

  return `
  // ==================== 1. 移除 webdriver 标志 ====================
  Object.defineProperty(navigator, 'webdriver', {
    get: () => undefined,
  });
  // 兼容部分检测脚本
  if (Object.getOwnPropertyDescriptor(navigator, 'webdriver')) {
    Object.defineProperty(navigator, 'webdriver', {
      get: () => undefined,
    });
  }
  // 删除 CDP 注入的属性
  delete navigator.__proto__.webdriver;

  // ==================== 2. 伪装 navigator 属性 ====================
  Object.defineProperty(navigator, 'plugins', {
    get: () => {
      const plugins = [
        { name: 'Chrome PDF Plugin', description: 'Portable Document Format', filename: 'internal-pdf-viewer', length: 1 },
        { name: 'Chrome PDF Viewer', description: '', filename: 'mhjfbmdgcfjbbpaeojofohoefgiehjai', length: 1 },
        { name: 'Native Client', description: '', filename: 'internal-nacl-plugin', length: 2 },
      ];
      plugins.length = 3;
      return plugins;
    },
  });

  Object.defineProperty(navigator, 'languages', {
    get: () => ${languages},
  });

  Object.defineProperty(navigator, 'platform', {
    get: () => '${platform}',
  });

  Object.defineProperty(navigator, 'hardwareConcurrency', {
    get: () => ${hwConcurrency},
  });

  Object.defineProperty(navigator, 'deviceMemory', {
    get: () => ${devMemory},
  });

  // ==================== 3. 伪装 Permissions API ====================
  const originalQuery = window.navigator.permissions.query.bind(window.navigator.permissions);
  window.navigator.permissions.query = (parameters) => {
    if (parameters.name === 'notifications') {
      return Promise.resolve({ state: Notification.permission });
    }
    return originalQuery(parameters);
  };

  // ==================== 4. 伪装 Connection API ====================
  if (navigator.connection) {
    Object.defineProperty(navigator.connection, 'rtt', { get: () => 50 });
  }

  // ==================== 5. 伪装 Chrome Runtime ====================
  if (!window.chrome) {
    window.chrome = {};
  }
  if (!window.chrome.runtime) {
    window.chrome.runtime = {
      connect: () => {},
      sendMessage: () => {},
    };
  }

  // ==================== 6. Canvas 指纹噪声 ====================
  const originalToDataURL = HTMLCanvasElement.prototype.toDataURL;
  HTMLCanvasElement.prototype.toDataURL = function(type) {
    if (type === 'image/png' && this.width > 16 && this.height > 16) {
      const ctx = this.getContext('2d');
      if (ctx) {
        const imageData = ctx.getImageData(0, 0, this.width, this.height);
        for (let i = 0; i < imageData.data.length; i += 4) {
          imageData.data[i] = imageData.data[i] ^ (Math.random() < 0.01 ? 1 : 0);
        }
        ctx.putImageData(imageData, 0, 0);
      }
    }
    return originalToDataURL.apply(this, arguments);
  };

  // ==================== 7. WebGL 指纹伪装 ====================
  const getParameter = WebGLRenderingContext.prototype.getParameter;
  WebGLRenderingContext.prototype.getParameter = function(parameter) {
    if (parameter === 37445) return '${webglVendor}';
    if (parameter === 37446) return '${webglRenderer}';
    return getParameter.call(this, parameter);
  };

  // ==================== 8. 时区一致性 ====================
  Date.prototype.getTimezoneOffset = function() {
    return -480; // UTC+8 (中国标准时间)
  };

  // ==================== 9. 屏幕属性伪装 ====================
  Object.defineProperty(screen, 'availWidth', { get: () => 1920 });
  Object.defineProperty(screen, 'availHeight', { get: () => 1040 });
  Object.defineProperty(screen, 'colorDepth', { get: () => 24 });
  Object.defineProperty(screen, 'pixelDepth', { get: () => 24 });
  `;
}

/**
 * 向页面注入所有反检测脚本
 * @param page Playwright Page 实例
 * @param fingerprint 可选的指纹配置，用于动态生成脚本
 */
export async function applyStealthScripts(
  page: Page,
  fingerprint?: {
    platform?: string;
    languages?: string[];
    hardwareConcurrency?: number;
    deviceMemory?: number;
    webglVendor?: string;
    webglRenderer?: string;
  }
): Promise<void> {
  try {
    await page.addInitScript(buildStealthScripts(fingerprint));
    logger.debug('反检测脚本已注入');
  } catch (err) {
    logger.error('注入反检测脚本失败:', err);
    throw err;
  }
}

/**
 * 移除 webdriver 标志
 */
export async function removeWebDriverFlag(page: Page): Promise<void> {
  await page.addInitScript(() => {
    Object.defineProperty(navigator, 'webdriver', {
      get: () => undefined,
    });
    delete (navigator as unknown as Record<string, unknown>).webdriver;
  });
  logger.debug('已移除 webdriver 标志');
}

/**
 * 伪装 navigator 属性（带可选配置）
 */
export async function spoofNavigatorProperties(page: Page, config?: {
  platform?: string;
  languages?: string[];
  hardwareConcurrency?: number;
  deviceMemory?: number;
}): Promise<void> {
  const platform = config?.platform || 'Win32';
  const languages = config?.languages || ['zh-CN', 'zh', 'en-US', 'en'];
  const hwConcurrency = config?.hardwareConcurrency || 8;
  const devMemory = config?.deviceMemory || 8;

  await page.addInitScript(
    (params: { platform: string; languages: string[]; hwConcurrency: number; devMemory: number }) => {
      Object.defineProperty(navigator, 'platform', { get: () => params.platform });
      Object.defineProperty(navigator, 'languages', { get: () => params.languages });
      Object.defineProperty(navigator, 'hardwareConcurrency', { get: () => params.hwConcurrency });
      Object.defineProperty(navigator, 'deviceMemory', { get: () => params.devMemory });
    },
    { platform, languages, hwConcurrency, devMemory }
  );

  logger.debug('已伪装 navigator 属性');
}

/**
 * 随机化操作时间间隔
 * 返回一个随机延迟的 Promise，用于模拟人类操作
 */
export function randomizeTimings(minMs: number = 50, maxMs: number = 300): Promise<void> {
  const delay = Math.floor(Math.random() * (maxMs - minMs)) + minMs;
  return new Promise((resolve) => setTimeout(resolve, delay));
}

/**
 * 模拟人类类型的输入（逐字符输入，随机间隔）
 */
export async function humanType(page: Page, selector: string, text: string): Promise<void> {
  for (const char of text) {
    await page.type(selector, char, { delay: Math.random() * 150 + 30 });
    // 偶尔停顿一下，模拟思考
    if (Math.random() < 0.1) {
      await randomizeTimings(300, 1000);
    }
  }
}

/**
 * 模拟人类鼠标移动
 */
export async function humanMouseMove(
  page: Page,
  targetX: number,
  targetY: number,
  steps?: number
): Promise<void> {
  const actualSteps = steps || Math.floor(Math.random() * 10) + 5;
  const currentPosition = { x: 0, y: 0 };

  for (let i = 0; i <= actualSteps; i++) {
    const progress = i / actualSteps;
    const easeProgress = progress < 0.5
      ? 2 * progress * progress
      : -1 + (4 - 2 * progress) * progress;

    const x = Math.round(currentPosition.x + (targetX - currentPosition.x) * easeProgress);
    const y = Math.round(currentPosition.y + (targetY - currentPosition.y) * easeProgress);

    await page.mouse.move(x, y);
    await randomizeTimings(5, 20);
  }
}

/**
 * 打乱数组顺序（Fisher-Yates 算法）
 */
export function shuffleArray<T>(array: T[]): T[] {
  const result = [...array];
  for (let i = result.length - 1; i > 0; i--) {
    const j = Math.floor(Math.random() * (i + 1));
    [result[i], result[j]] = [result[j], result[i]];
  }
  return result;
}
