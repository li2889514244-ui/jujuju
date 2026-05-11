import * as fs from 'fs';
import * as path from 'path';
import * as https from 'https';
import * as http from 'http';
import { URL } from 'url';

/**
 * 安全下载文件（替代 execSync curl，防止命令注入）
 */
export function safeDownload(url: string, dest: string, timeoutMs = 300000): Promise<void> {
  return new Promise((resolve, reject) => {
    // 验证 URL 格式
    let parsedUrl: URL;
    try {
      parsedUrl = new URL(url);
    } catch {
      return reject(new Error(`无效的 URL: ${url}`));
    }

    if (!['http:', 'https:'].includes(parsedUrl.protocol)) {
      return reject(new Error(`不支持的协议: ${parsedUrl.protocol}`));
    }

    // 验证目标路径在 /tmp 下
    const resolvedDest = path.resolve(dest);
    if (!resolvedDest.startsWith('/tmp/') && !resolvedDest.startsWith('C:\\') && !resolvedDest.startsWith('D:\\')) {
      return reject(new Error(`不安全的目标路径: ${resolvedDest}`));
    }

    const client = parsedUrl.protocol === 'https:' ? https : http;
    const timer = setTimeout(() => {
      reject(new Error('下载超时'));
    }, timeoutMs);

    const request = client.get(url, { timeout: timeoutMs }, (response) => {
      // 处理重定向
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
        fs.unlink(resolvedDest, () => {});
        reject(err);
      });
    });

    request.on('error', (err) => {
      clearTimeout(timer);
      reject(err);
    });
  });
}

/**
 * 安全清理临时文件（替代 execSync rm，防止路径注入）
 */
export function safeCleanupTempFiles(prefix: string): void {
  // 只允许清理 /tmp 目录下的文件
  const tmpDir = '/tmp';
  try {
    const files = fs.readdirSync(tmpDir);
    for (const file of files) {
      if (file.startsWith(prefix)) {
        const fullPath = path.join(tmpDir, file);
        try {
          fs.unlinkSync(fullPath);
        } catch { /* ignore individual file errors */ }
      }
    }
  } catch { /* /tmp not readable, skip */ }
}
