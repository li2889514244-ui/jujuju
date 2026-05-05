/**
 * 浏览器指纹管理工具
 *
 * 生成随机化的浏览器指纹，用于反检测
 * 包括 UserAgent、视口、WebGL、Canvas 等参数
 */

export interface FingerprintConfig {
  userAgent: string;
  viewport: { width: number; height: number };
  platform: string;
  language: string;
  webglVendor: string;
  webglRenderer: string;
  canvasNoise: number;
  audioNoise: number;
  screenResolution: { width: number; height: number };
  colorDepth: number;
  deviceMemory: number;
  hardwareConcurrency: number;
}

// 常用 UserAgent 列表（Chrome 最新版本）
const USER_AGENTS = [
  'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/124.0.0.0 Safari/537.36',
  'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/123.0.0.0 Safari/537.36',
  'Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/124.0.0.0 Safari/537.36',
  'Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/123.0.0.0 Safari/537.36',
  'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/122.0.0.0 Safari/537.36',
  'Mozilla/5.0 (X11; Linux x86_64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/124.0.0.0 Safari/537.36',
  'Mozilla/5.0 (X11; Linux x86_64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/123.0.0.0 Safari/537.36',
  'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/121.0.0.0 Safari/537.36',
];

// 常用视口尺寸
const VIEWPORTS = [
  { width: 1920, height: 1080 },
  { width: 1366, height: 768 },
  { width: 1536, height: 864 },
  { width: 1440, height: 900 },
  { width: 1280, height: 720 },
  { width: 1600, height: 900 },
  { width: 2560, height: 1440 },
  { width: 1920, height: 1200 },
];

// WebGL 厂商和渲染器
const WEBGL_VENDORS = [
  'Google Inc. (NVIDIA)',
  'Google Inc. (Intel)',
  'Google Inc. (AMD)',
  'Intel Inc.',
  'NVIDIA Corporation',
  'ATI Technologies Inc.',
];

const WEBGL_RENDERERS = [
  'ANGLE (NVIDIA, NVIDIA GeForce RTX 3060 Direct3D11 vs_5_0 ps_5_0)',
  'ANGLE (NVIDIA, NVIDIA GeForce GTX 1660 Ti Direct3D11 vs_5_0 ps_5_0)',
  'ANGLE (Intel, Intel(R) UHD Graphics 630 Direct3D11 vs_5_0 ps_5_0)',
  'ANGLE (Intel, Intel(R) Iris(R) Xe Graphics Direct3D11 vs_5_0 ps_5_0)',
  'ANGLE (AMD, AMD Radeon RX 580 Direct3D11 vs_5_0 ps_5_0)',
  'ANGLE (AMD, AMD Radeon RX 6700 XT Direct3D11 vs_5_0 ps_5_0)',
];

// 平台标识
const PLATFORMS = ['Win32', 'MacIntel', 'Linux x86_64'];

// 语言
const LANGUAGES = ['zh-CN', 'en-US', 'zh-TW', 'en-GB', 'ja-JP'];

/**
 * 随机选择数组中的一个元素
 */
function randomPick<T>(arr: T[]): T {
  return arr[Math.floor(Math.random() * arr.length)];
}

/**
 * 生成随机整数（包含 min 和 max）
 */
function randomInt(min: number, max: number): number {
  return Math.floor(Math.random() * (max - min + 1)) + min;
}

/**
 * 生成完整的随机浏览器指纹
 */
export function generateFingerprint(): FingerprintConfig {
  const viewport = getViewport();

  return {
    userAgent: getUserAgent(),
    viewport,
    platform: randomPick(PLATFORMS),
    language: randomPick(LANGUAGES),
    webglVendor: randomPick(WEBGL_VENDORS),
    webglRenderer: randomPick(WEBGL_RENDERERS),
    canvasNoise: Math.random() * 0.01,  // 0-0.01 的微小噪声
    audioNoise: Math.random() * 0.001,   // 0-0.001 的音频噪声
    screenResolution: {
      width: viewport.width + randomInt(0, 100),
      height: viewport.height + randomInt(40, 120), // 加上任务栏高度
    },
    colorDepth: randomPick([24, 32]),
    deviceMemory: randomPick([4, 8, 16, 32]),
    hardwareConcurrency: randomPick([4, 6, 8, 12, 16]),
  };
}

/**
 * 获取随机 UserAgent
 */
export function getUserAgent(): string {
  return randomPick(USER_AGENTS);
}

/**
 * 获取随机视口大小
 */
export function getViewport(): { width: number; height: number } {
  return { ...randomPick(VIEWPORTS) };
}

/**
 * 获取 WebGL 参数
 */
export function getWebGLParams(): { vendor: string; renderer: string } {
  return {
    vendor: randomPick(WEBGL_VENDORS),
    renderer: randomPick(WEBGL_RENDERERS),
  };
}

/**
 * 获取 Canvas 噪声参数
 */
export function getCanvasNoise(): number {
  return Math.random() * 0.01;
}

/**
 * 生成随机的 WebGL 哈希（用于 Canvas 指纹伪造）
 */
export function generateWebGLHash(): string {
  const chars = '0123456789abcdef';
  let hash = '';
  for (let i = 0; i < 32; i++) {
    hash += chars[Math.floor(Math.random() * chars.length)];
  }
  return hash;
}
