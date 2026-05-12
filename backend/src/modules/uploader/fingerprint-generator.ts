import * as crypto from 'crypto';

export interface BrowserFingerprint {
  userAgent: string;
  viewport: { width: number; height: number };
  screen: { width: number; height: number };
  locale: string;
  timezone: string;
  colorScheme: 'light' | 'dark';
  deviceScaleFactor: number;
  canvasNoise: number;
  webglVendor: string;
  webglRenderer: string;
}

/**
 * 浏览器指纹生成器
 * 为每个账号生成独立且稳定的浏览器指纹，防止平台检测多账号关联
 */
export class FingerprintGenerator {
  // 常见 User-Agent 池
  private readonly userAgents = [
    'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/124.0.0.0 Safari/537.36',
    'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/123.0.0.0 Safari/537.36',
    'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/122.0.0.0 Safari/537.36',
    'Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/124.0.0.0 Safari/537.36',
    'Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/123.0.0.0 Safari/537.36',
    'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/121.0.0.0 Safari/537.36',
    'Mozilla/5.0 (X11; Linux x86_64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/124.0.0.0 Safari/537.36',
    'Mozilla/5.0 (Windows NT 10.0; Win64; x64; rv:125.0) Gecko/20100101 Firefox/125.0',
    'Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/605.1.15 (KHTML, like Gecko) Version/17.4 Safari/605.1.15',
    'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36',
  ];

  // 常见屏幕分辨率
  private readonly resolutions = [
    { width: 1920, height: 1080 },
    { width: 1366, height: 768 },
    { width: 1440, height: 900 },
    { width: 1536, height: 864 },
    { width: 2560, height: 1440 },
    { width: 1680, height: 1050 },
    { width: 1280, height: 720 },
    { width: 1600, height: 900 },
  ];

  // WebGL 渲染器池
  private readonly webglRenderers = [
    { vendor: 'Google Inc. (NVIDIA)', renderer: 'ANGLE (NVIDIA, NVIDIA GeForce RTX 3060 Direct3D11 vs_5_0 ps_5_0, D3D11)' },
    { vendor: 'Google Inc. (NVIDIA)', renderer: 'ANGLE (NVIDIA, NVIDIA GeForce GTX 1660 SUPER Direct3D11 vs_5_0 ps_5_0, D3D11)' },
    { vendor: 'Google Inc. (AMD)', renderer: 'ANGLE (AMD, AMD Radeon RX 580 Direct3D11 vs_5_0 ps_5_0, D3D11)' },
    { vendor: 'Google Inc. (Intel)', renderer: 'ANGLE (Intel, Intel(R) UHD Graphics 630 Direct3D11 vs_5_0 ps_5_0, D3D11)' },
    { vendor: 'Google Inc. (Intel)', renderer: 'ANGLE (Intel, Intel(R) Iris(R) Xe Graphics Direct3D11 vs_5_0 ps_5_0, D3D11)' },
    { vendor: 'Google Inc. (NVIDIA)', renderer: 'ANGLE (NVIDIA, NVIDIA GeForce RTX 4070 Direct3D11 vs_5_0 ps_5_0, D3D11)' },
    { vendor: 'Google Inc. (AMD)', renderer: 'ANGLE (AMD, AMD Radeon RX 6700 XT Direct3D11 vs_5_0 ps_5_0, D3D11)' },
    { vendor: 'Google Inc. (NVIDIA)', renderer: 'ANGLE (NVIDIA, NVIDIA GeForce RTX 2060 Direct3D11 vs_5_0 ps_5_0, D3D11)' },
  ];

  private readonly timezones = [
    'Asia/Shanghai',
    'Asia/Shanghai',
    'Asia/Shanghai',
    'Asia/Chongqing',
    'Asia/Harbin',
  ];

  /**
   * 为指定 accountId 生成稳定指纹（同一 ID 每次返回相同结果）
   */
  getStableFingerprint(accountId: string): BrowserFingerprint {
    const hash = crypto.createHash('sha256').update(accountId).digest('hex');
    const seed = parseInt(hash.slice(0, 8), 16);

    return {
      userAgent: this.userAgents[seed % this.userAgents.length],
      viewport: this.getViewport(seed),
      screen: this.resolutions[Math.floor(seed / 7) % this.resolutions.length],
      locale: 'zh-CN',
      timezone: this.timezones[seed % this.timezones.length],
      colorScheme: seed % 5 === 0 ? 'dark' : 'light',
      deviceScaleFactor: [1, 1, 1.25, 1.5, 2][seed % 5],
      canvasNoise: (seed % 10) + 1,
      webglVendor: this.webglRenderers[seed % this.webglRenderers.length].vendor,
      webglRenderer: this.webglRenderers[seed % this.webglRenderers.length].renderer,
    };
  }

  /**
   * 生成随机指纹
   */
  generateRandom(): BrowserFingerprint {
    const randomId = crypto.randomBytes(16).toString('hex');
    return this.getStableFingerprint(randomId);
  }

  private getViewport(seed: number): { width: number; height: number } {
    const res = this.resolutions[seed % this.resolutions.length];
    // viewport 通常比 screen 小一点（减去任务栏/浏览器 chrome）
    return {
      width: res.width - (seed % 3 === 0 ? 0 : 20),
      height: res.height - (60 + (seed % 40)),
    };
  }
}
