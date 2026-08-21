"""
反自动化检测补丁 — 在每个页面加载前注入，消除 Playwright/CDP 自动化痕迹。

支持每账号独立指纹（v2）：通过 build_stealth_js(fingerprint) 生成
不同的 WebGL/UA/硬件参数，避免多账号共享同一设备指纹。

覆盖以下检测点：
  1. navigator.webdriver → undefined
  2. navigator.plugins / navigator.mimeTypes → 伪造真实插件列表
  3. navigator.languages → ['zh-CN', 'zh', 'en']
  4. window.chrome → 伪造 Chrome 运行时对象
  5. Permissions API → 覆盖 query 返回一致结果
  6. WebGL vendor/renderer → 每账号独立 GPU 指纹
  7. navigator.connection → 伪造网络信息
  8. navigator.hardwareConcurrency / deviceMemory → 每账号独立
  9. navigator.getBattery → 伪造电池信息
  10. Canvas 指纹噪声 → 每账号独立噪声偏移
  11. AudioContext 指纹噪声
"""

import json as _json


def build_stealth_js(fingerprint: dict | None = None) -> str:
    """构建反检测 JS 脚本，支持每账号独立指纹。

    Args:
        fingerprint: 指纹字典（来自 fingerprint.py）。None 则用默认值。

    Returns:
        注入到页面的 JS 字符串
    """
    fp = fingerprint or {}
    webgl_vendor = fp.get('webgl_vendor', 'Google Inc. (Intel)')
    webgl_renderer = fp.get('webgl_renderer',
        'ANGLE (Intel, Intel(R) UHD Graphics 630 Direct3D11 vs_5_0 ps_5_0, D3D11)')
    hw_conc = fp.get('hardware_concurrency', 8)
    dev_mem = fp.get('device_memory', 8)
    canvas_noise = fp.get('canvas_noise', 0)
    screen_w = fp.get('screen_width', 1920)
    screen_h = fp.get('screen_height', 1080)

    # 安全转义字符串值
    def esc(s):
        return _json.dumps(str(s))

    return f"""
(() => {{
  'use strict';

  // ── 0. Remove Playwright/CDP cdc_ variables ──
  try {{
    for (const key of Object.keys(window)) {{
      if (key.startsWith('cdc_') && key !== 'cdc_adoQpoasnfa76pfcZLmcfl_Array') {{
        try {{ delete window[key]; }} catch (e) {{
          try {{ window[key] = undefined; }} catch (e2) {{}}
        }}
      }}
    }}
  }} catch (e) {{}}

  // ── 1. navigator.webdriver ──
  try {{
    Object.defineProperty(navigator, 'webdriver', {{
      get: () => undefined,
      configurable: true,
    }});
  }} catch (e) {{}}
  // Also try delete (some detectors check property descriptor)
  try {{ delete navigator.webdriver; }} catch (e) {{}}

  // ── 2. navigator.plugins / mimeTypes ──
  try {{
    const fakePlugins = [
      {{ name: 'PDF Viewer', filename: 'internal-pdf-viewer', description: 'Portable Document Format', length: 1 }},
      {{ name: 'Chrome PDF Viewer', filename: 'internal-pdf-viewer', description: 'Portable Document Format', length: 1 }},
      {{ name: 'Chromium PDF Viewer', filename: 'internal-pdf-viewer', description: 'Portable Document Format', length: 1 }},
      {{ name: 'Microsoft Edge PDF Viewer', filename: 'internal-pdf-viewer', description: 'Portable Document Format', length: 1 }},
      {{ name: 'WebKit built-in PDF', filename: 'internal-pdf-viewer', description: 'Portable Document Format', length: 1 }},
    ];
    const fakePluginArray = [];
    for (const p of fakePlugins) {{
      const plugin = Object.create(Plugin.prototype);
      Object.defineProperties(plugin, {{
        name: {{ value: p.name }}, filename: {{ value: p.filename }},
        description: {{ value: p.description }}, length: {{ value: p.length }},
      }});
      fakePluginArray.push(plugin);
    }}
    Object.defineProperty(navigator, 'plugins', {{
      get: () => {{
        const arr = Object.create(PluginArray.prototype);
        for (let i = 0; i < fakePluginArray.length; i++) arr[i] = fakePluginArray[i];
        arr.length = fakePluginArray.length;
        return arr;
      }},
      configurable: true,
    }});
    Object.defineProperty(navigator, 'mimeTypes', {{
      get: () => {{
        const mt = Object.create(MimeTypeArray.prototype);
        const pdf = Object.create(MimeType.prototype);
        Object.defineProperties(pdf, {{
          type: {{ value: 'application/pdf' }}, suffixes: {{ value: 'pdf' }},
          description: {{ value: 'Portable Document Format' }},
        }});
        mt[0] = pdf; mt.length = 1;
        return mt;
      }},
      configurable: true,
    }});
  }} catch (e) {{}}

  // ── 3. navigator.languages ──
  try {{
    Object.defineProperty(navigator, 'languages', {{
      get: () => ['zh-CN', 'zh', 'en-US', 'en'],
      configurable: true,
    }});
  }} catch (e) {{}}

  // ── 4. window.chrome ──
  try {{
    if (!window.chrome) window.chrome = {{}};
    if (!window.chrome.runtime) {{
      window.chrome.runtime = {{ onConnect: undefined, onMessage: undefined, connect: undefined, sendMessage: undefined }};
    }}
    if (!window.chrome.app) {{
      window.chrome.app = {{
        isInstalled: false,
        InstallState: {{ DISABLED: 'disabled', INSTALLED: 'installed', NOT_INSTALLED: 'not_installed' }},
        RunningState: {{ CANNOT_RUN: 'cannot_run', READY_TO_RUN: 'ready_to_run', RUNNING: 'running' }},
      }};
    }}
    if (!window.chrome.csi) {{
      window.chrome.csi = () => ({{ startE: Date.now(), onloadT: Date.now(), pageT: 0, tran: 15 }});
    }}
    if (!window.chrome.loadTimes) {{
      window.chrome.loadTimes = () => ({{
        commitLoadTime: Date.now() / 1000 - 10, connectionInfo: 'h2',
        finishDocumentLoadTime: Date.now() / 1000 - 5, finishLoadTime: Date.now() / 1000 - 3,
        firstPaintAfterLoadTime: 0, firstPaintTime: Date.now() / 1000 - 8,
        navigationType: 'Other', npnNegotiatedProtocol: 'h2',
        requestTime: Date.now() / 1000 - 12, startLoadTime: Date.now() / 1000 - 12,
        wasAlternateProtocolAvailable: false, wasFetchedViaSpdy: true, wasNpnNegotiated: true,
      }});
    }}
  }} catch (e) {{}}

  // ── 5. Permissions API ──
  try {{
    const origQuery = navigator.permissions?.query;
    if (origQuery) {{
      navigator.permissions.query = (params) => {{
        if (params && params.name === 'notifications') {{
          return Promise.resolve({{ state: Notification.permission, onchange: null }});
        }}
        return origQuery.call(navigator.permissions, params);
      }};
    }}
  }} catch (e) {{}}

  // ── 6. WebGL 指纹（每账号独立）──
  try {{
    const webglVendor = {esc(webgl_vendor)};
    const webglRenderer = {esc(webgl_renderer)};
    const getParameter = WebGLRenderingContext.prototype.getParameter;
    WebGLRenderingContext.prototype.getParameter = function (parameter) {{
      if (parameter === 37445) return webglVendor;
      if (parameter === 37446) return webglRenderer;
      return getParameter.call(this, parameter);
    }};
    if (typeof WebGL2RenderingContext !== 'undefined') {{
      const getParameter2 = WebGL2RenderingContext.prototype.getParameter;
      WebGL2RenderingContext.prototype.getParameter = function (parameter) {{
        if (parameter === 37445) return webglVendor;
        if (parameter === 37446) return webglRenderer;
        return getParameter2.call(this, parameter);
      }};
    }}
  }} catch (e) {{}}

  // ── 7. navigator.connection ──
  try {{
    if (!navigator.connection) {{
      Object.defineProperty(navigator, 'connection', {{
        get: () => ({{ effectiveType: '4g', rtt: 50, downlink: 10, saveData: false }}),
        configurable: true,
      }});
    }}
  }} catch (e) {{}}

  // ── 8. navigator.hardwareConcurrency / deviceMemory（每账号独立）──
  try {{
    Object.defineProperty(navigator, 'hardwareConcurrency', {{
      get: () => {hw_conc},
      configurable: true,
    }});
    Object.defineProperty(navigator, 'deviceMemory', {{
      get: () => {dev_mem},
      configurable: true,
    }});
  }} catch (e) {{}}

  // ── 9. navigator.getBattery ──
  try {{
    if (!navigator.getBattery) {{
      navigator.getBattery = () => Promise.resolve({{
        charging: true, chargingTime: 0, dischargingTime: Infinity, level: 0.99,
        addEventListener: () => {{}}, removeEventListener: () => {{}},
      }});
    }}
  }} catch (e) {{}}

  // ── 10. outerHeight / outerWidth ──
  try {{
    if (window.outerHeight === 0) {{
      Object.defineProperty(window, 'outerHeight', {{ get: () => {screen_h}, configurable: true }});
    }}
    if (window.outerWidth === 0) {{
      Object.defineProperty(window, 'outerWidth', {{ get: () => {screen_w}, configurable: true }});
    }}
  }} catch (e) {{}}

  // ── 11. Canvas 指纹噪声（每账号独立偏移）──
  try {{
    const canvasNoise = {canvas_noise};
    const origToDataURL = HTMLCanvasElement.prototype.toDataURL;
    HTMLCanvasElement.prototype.toDataURL = function (...args) {{
      const ctx = this.getContext('2d');
      if (ctx && this.width > 0 && this.height > 0) {{
        try {{
          const imgData = ctx.getImageData(0, 0, Math.min(this.width, 16), Math.min(this.height, 16));
          for (let i = 0; i + 3 < imgData.data.length; i += 4) {{
            imgData.data[i] = Math.max(0, Math.min(255, imgData.data[i] + canvasNoise));
          }}
          ctx.putImageData(imgData, 0, 0);
        }} catch (e) {{}}
      }}
      return origToDataURL.apply(this, args);
    }};
  }} catch (e) {{}}

  // ── 12. AudioContext 指纹噪声 ──
  try {{
    const origCreateAnalyser = AudioContext.prototype.createAnalyser;
    AudioContext.prototype.createAnalyser = function () {{
      const analyser = origCreateAnalyser.call(this);
      const origGetFloatFrequencyData = analyser.getFloatFrequencyData.bind(analyser);
      analyser.getFloatFrequencyData = function (array) {{
        origGetFloatFrequencyData(array);
        for (let i = 0; i < array.length; i++) {{
          array[i] += (Math.random() - 0.5) * 0.001;
        }}
      }};
      return analyser;
    }};
  }} catch (e) {{}}

  // ── 13. window.screenX / screenY（隐藏离屏窗口位置）──
  // 当使用 headless=False + --window-position=-32000 时，
  // window.screenX 会返回负值暴露自动化特征
  try {{
    Object.defineProperty(window, 'screenX', {{
      get: () => 0,
      configurable: true,
    }});
    Object.defineProperty(window, 'screenY', {{
      get: () => 0,
      configurable: true,
    }});
  }} catch (e) {{}}

  // ── 14. Notification.permission 一致性 ──
  try {{
    if (typeof Notification !== 'undefined' && Notification.permission === 'default') {{
      Object.defineProperty(Notification, 'permission', {{
        get: () => 'denied',
        configurable: true,
      }});
    }}
  }} catch (e) {{}}

}})();
"""


# ── 默认脚本（向后兼容，无指纹参数时使用）──
STEALTH_JS = build_stealth_js()


def get_stealth_script(fingerprint: dict | None = None) -> str:
    """返回反检测 JS 脚本字符串。可传入 fingerprint 生成每账号独立脚本。"""
    if fingerprint:
        return build_stealth_js(fingerprint)
    return STEALTH_JS


async def apply_stealth_to_context(context, fingerprint: dict | None = None):
    """将反检测脚本注入到 Playwright BrowserContext 的所有页面。

    Args:
        context: Playwright BrowserContext
        fingerprint: 每账号独立指纹（可选）
    """
    js = build_stealth_js(fingerprint) if fingerprint else STEALTH_JS
    await context.add_init_script(js)


def apply_stealth_to_page_sync(page, fingerprint: dict | None = None):
    """同步方式注入反检测脚本（适用于 sync_playwright）。"""
    js = build_stealth_js(fingerprint) if fingerprint else STEALTH_JS
    page.add_init_script(js)


# ── 推荐的启动参数 ──
# v3: 精简为仅保留用户级别的常见参数。
# 移除 --no-sandbox（自动化最强信号）、--disable-sync、
# --disable-component-update、--disable-background-networking
# 等自动化指纹——这些参数的组合是 bot 的铁证。
STEALTH_LAUNCH_ARGS = [
    '--disable-blink-features=AutomationControlled',
    '--lang=zh-CN',
    '--no-first-run',
    '--no-default-browser-check',
    '--disable-infobars',
]

# ── 默认 User-Agent（向后兼容）──
DEFAULT_USER_AGENT = (
    'Mozilla/5.0 (Windows NT 10.0; Win64; x64) '
    'AppleWebKit/537.36 (KHTML, like Gecko) '
    'Chrome/131.0.0.0 Safari/537.36'
)
