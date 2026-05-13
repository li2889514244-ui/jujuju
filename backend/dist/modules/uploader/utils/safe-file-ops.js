"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
exports.safeDownload = safeDownload;
exports.safeCleanupTempFiles = safeCleanupTempFiles;
const fs = require("fs");
const path = require("path");
const https = require("https");
const http = require("http");
const url_1 = require("url");
function safeDownload(url, dest, timeoutMs = 300000) {
    return new Promise((resolve, reject) => {
        let parsedUrl;
        try {
            parsedUrl = new url_1.URL(url);
        }
        catch {
            return reject(new Error(`无效的 URL: ${url}`));
        }
        if (!['http:', 'https:'].includes(parsedUrl.protocol)) {
            return reject(new Error(`不支持的协议: ${parsedUrl.protocol}`));
        }
        const resolvedDest = path.resolve(dest);
        if (!resolvedDest.startsWith('/tmp/') && !resolvedDest.startsWith('C:\\') && !resolvedDest.startsWith('D:\\')) {
            return reject(new Error(`不安全的目标路径: ${resolvedDest}`));
        }
        const client = parsedUrl.protocol === 'https:' ? https : http;
        const timer = setTimeout(() => {
            reject(new Error('下载超时'));
        }, timeoutMs);
        const request = client.get(url, { timeout: timeoutMs }, (response) => {
            if (response.statusCode && response.statusCode >= 300 && response.statusCode < 400 && response.headers.location) {
                clearTimeout(timer);
                safeDownload(response.headers.location, dest, timeoutMs).then(resolve).catch(reject);
                return;
            }
            if (response.statusCode !== 200) {
                clearTimeout(timer);
                return reject(new Error(`下载失败，HTTP ${response.statusCode}`));
            }
            const file = fs.createWriteStream(resolvedDest);
            response.pipe(file);
            file.on('finish', () => {
                clearTimeout(timer);
                file.close();
                resolve();
            });
            file.on('error', (err) => {
                clearTimeout(timer);
                fs.unlink(resolvedDest, () => { });
                reject(err);
            });
        });
        request.on('error', (err) => {
            clearTimeout(timer);
            reject(err);
        });
    });
}
function safeCleanupTempFiles(prefix) {
    const tmpDir = '/tmp';
    try {
        const files = fs.readdirSync(tmpDir);
        for (const file of files) {
            if (file.startsWith(prefix)) {
                const fullPath = path.join(tmpDir, file);
                try {
                    fs.unlinkSync(fullPath);
                }
                catch { }
            }
        }
    }
    catch { }
}
//# sourceMappingURL=safe-file-ops.js.map