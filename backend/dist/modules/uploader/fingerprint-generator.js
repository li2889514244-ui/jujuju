"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
exports.FingerprintGenerator = void 0;
const crypto = require("crypto");
class FingerprintGenerator {
    constructor() {
        this.userAgents = [
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
        this.resolutions = [
            { width: 1920, height: 1080 },
            { width: 1366, height: 768 },
            { width: 1440, height: 900 },
            { width: 1536, height: 864 },
            { width: 2560, height: 1440 },
            { width: 1680, height: 1050 },
            { width: 1280, height: 720 },
            { width: 1600, height: 900 },
        ];
        this.webglRenderers = [
            { vendor: 'Google Inc. (NVIDIA)', renderer: 'ANGLE (NVIDIA, NVIDIA GeForce RTX 3060 Direct3D11 vs_5_0 ps_5_0, D3D11)' },
            { vendor: 'Google Inc. (NVIDIA)', renderer: 'ANGLE (NVIDIA, NVIDIA GeForce GTX 1660 SUPER Direct3D11 vs_5_0 ps_5_0, D3D11)' },
            { vendor: 'Google Inc. (AMD)', renderer: 'ANGLE (AMD, AMD Radeon RX 580 Direct3D11 vs_5_0 ps_5_0, D3D11)' },
            { vendor: 'Google Inc. (Intel)', renderer: 'ANGLE (Intel, Intel(R) UHD Graphics 630 Direct3D11 vs_5_0 ps_5_0, D3D11)' },
            { vendor: 'Google Inc. (Intel)', renderer: 'ANGLE (Intel, Intel(R) Iris(R) Xe Graphics Direct3D11 vs_5_0 ps_5_0, D3D11)' },
            { vendor: 'Google Inc. (NVIDIA)', renderer: 'ANGLE (NVIDIA, NVIDIA GeForce RTX 4070 Direct3D11 vs_5_0 ps_5_0, D3D11)' },
            { vendor: 'Google Inc. (AMD)', renderer: 'ANGLE (AMD, AMD Radeon RX 6700 XT Direct3D11 vs_5_0 ps_5_0, D3D11)' },
            { vendor: 'Google Inc. (NVIDIA)', renderer: 'ANGLE (NVIDIA, NVIDIA GeForce RTX 2060 Direct3D11 vs_5_0 ps_5_0, D3D11)' },
        ];
        this.timezones = [
            'Asia/Shanghai',
            'Asia/Shanghai',
            'Asia/Shanghai',
            'Asia/Chongqing',
            'Asia/Harbin',
        ];
    }
    getStableFingerprint(accountId) {
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
    generateRandom() {
        const randomId = crypto.randomBytes(16).toString('hex');
        return this.getStableFingerprint(randomId);
    }
    getViewport(seed) {
        const res = this.resolutions[seed % this.resolutions.length];
        return {
            width: res.width - (seed % 3 === 0 ? 0 : 20),
            height: res.height - (60 + (seed % 40)),
        };
    }
}
exports.FingerprintGenerator = FingerprintGenerator;
//# sourceMappingURL=fingerprint-generator.js.map