import { Injectable, Logger, OnModuleInit } from '@nestjs/common';
import { Platform } from '../../../common/prisma-enums';
import {
  BaseUploader,
  PublishTask,
  PublishResult,
  StoredCookie,
  LoginStatus,
} from '../base-uploader';
import { BrowserPool } from '../browser-pool';
import { CookieManager } from '../cookie-manager';
import { UploaderService } from '../uploader.service';

/**
 * 鎶栭煶鍒涗綔鑰呮湇鍔″钩鍙?Uploader
 * 閫氳繃 Playwright 鑷姩鍖栨搷浣?https://creator.douyin.com 瀹屾垚瑙嗛鍙戝竷
 */
@Injectable()
export class DouyinUploader extends BaseUploader implements OnModuleInit {
  private readonly logger = new Logger(DouyinUploader.name);

  readonly platform = Platform.DOUYIN;
  readonly name = '';

  private readonly CREATOR_URL = 'https://creator.douyin.com';
  private readonly UPLOAD_URL = 'https://creator.douyin.com/creator-micro/content/upload';

  constructor(
    private browserPool: BrowserPool,
    private cookieManager: CookieManager,
    private uploaderService: UploaderService,
  ) {
    super();
  }

  onModuleInit() {
    this.uploaderService.registerUploader(this);
  }

  getCreatorUrl(): string {
    return this.CREATOR_URL;
  }

  /**
   * 妫€鏌?Cookie 鏄惁鏈夋晥
   * 璁块棶鍒涗綔鑰呬腑蹇冿紝鐪嬫槸鍚﹁閲嶅畾鍚戝埌鐧诲綍椤?
   */
  async checkLogin(cookies: StoredCookie[]): Promise<LoginStatus> {
    const context = await this.browserPool.createContext({ cookies });
    const page = await this.browserPool.createPage(context);

    try {
      await page.goto(this.CREATOR_URL, { waitUntil: 'domcontentloaded' });
      await page.waitForTimeout(2000);

      const url = page.url();
      // 濡傛灉琚噸瀹氬悜鍒扮櫥褰曢〉锛岃鏄?Cookie 杩囨湡
      if (url.includes('login') || url.includes('passport')) {
        return LoginStatus.EXPIRED;
      }

      // 妫€鏌ラ〉闈㈡槸鍚︽湁鐢ㄦ埛澶村儚/鏄电О鍏冪礌
      const hasUserInfo = await page.locator('.avatar, .user-info, .creator-avatar').first().isVisible().catch(() => false);
      return hasUserInfo ? LoginStatus.VALID : LoginStatus.UNKNOWN;
    } catch (e) {
      this.logger.warn('[garbled]', e);
      return LoginStatus.UNKNOWN;
    } finally {
      await context.close();
    }
  }

  /**
   * 鐧诲綍娴佺▼
   * 鎶栭煶闇€瑕佹壂鐮佺櫥褰曪紝杩欓噷鎵撳紑鐧诲綍椤电瓑寰呯敤鎴锋壂鐮?
   * 瀹為檯浣跨敤鏃堕渶瑕侀厤鍚堝墠绔睍绀轰簩缁寸爜
   */
  async login(accountId: string): Promise<StoredCookie[]> {
    const context = await this.browserPool.createContext();
    const page = await this.browserPool.createPage(context);

    try {
      await page.goto(`${this.CREATOR_URL}/login`, { waitUntil: 'networkidle' });

      // 绛夊緟鐢ㄦ埛鎵爜瀹屾垚锛堟渶澶氱瓑 120 绉掞級
      await page.waitForURL('**/creator-micro/**', { timeout: 120000 });

      // 鐧诲綍鎴愬姛锛屾彁鍙?Cookie
      const cookies = await context.cookies();
      const storedCookies: StoredCookie[] = cookies.map((c) => ({
        name: c.name,
        value: c.value,
        domain: c.domain,
        path: c.path,
        expires: c.expires,
        httpOnly: c.httpOnly,
        secure: c.secure,
        sameSite: c.sameSite as StoredCookie['sameSite'],
      }));

      // 淇濆瓨鍒版暟鎹簱
      await this.cookieManager.saveCookies(accountId, storedCookies);
      this.logger.log(`鎶栭煶鐧诲綍鎴愬姛: accountId=${accountId}`);

      return storedCookies;
    } finally {
      await context.close();
    }
  }

  /**
   * 鍙戝竷瑙嗛鍒版姈闊?
   */
  async publish(task: PublishTask, cookies: StoredCookie[]): Promise<PublishResult> {
    const context = await this.browserPool.createContext({ cookies });
    const page = await this.browserPool.createPage(context);

    try {
      // 1. 杩涘叆鍙戝竷椤甸潰
      await page.goto(this.UPLOAD_URL, { waitUntil: 'domcontentloaded' });
      await page.waitForTimeout(3000);

      // 妫€鏌ユ槸鍚﹂渶瑕侀噸鏂扮櫥褰?
      if (page.url().includes('login') || page.url().includes('passport')) {
        return { success: false, errorMsg: '' };
      }

      // 2. 涓婁紶瑙嗛鏂囦欢
      if (!task.mediaUrls.length) {
        return { success: false, errorMsg: '' };
      }

      // 鎵惧埌鏂囦欢涓婁紶 input
      const fileInput = page.locator('input[type="file"]').first();
      await fileInput.waitFor({ timeout: 10000 });

      // 涓嬭浇瑙嗛鍒颁复鏃舵枃浠跺啀涓婁紶
      const videoUrl = task.mediaUrls[0];
      const tempPath = `/tmp/douyin_upload_${Date.now()}.mp4`;
      await this.downloadFile(videoUrl, tempPath);
      await fileInput.setInputFiles(tempPath);

      // 3. 绛夊緟涓婁紶瀹屾垚
      await this.waitForUploadComplete(page);

      // 4. 濉啓鏍囬/鎻忚堪
      const titleInput = page.locator('.title-input, [data-testid="title"], .ql-editor').first();
      await titleInput.waitFor({ timeout: 10000 });
      await titleInput.click();
      await titleInput.fill('');
      await page.keyboard.type(task.title || task.content.slice(0, 50));

      // 5. 濉啓鎻忚堪锛堝鏋滄湁鍗曠嫭鐨勬弿杩版锛?
      const descInput = page.locator('').first();
      if (await descInput.isVisible().catch(() => false)) {
        await descInput.click();
        await page.keyboard.type(task.content.slice(0, 500));
      }

      // 6. 娣诲姞璇濋鏍囩
      if (task.tags.length > 0) {
        for (const tag of task.tags.slice(0, 5)) {
          await page.keyboard.type(`#${tag} `);
          await page.waitForTimeout(500);
        }
      }

      // 7. 璁剧疆灏侀潰锛堝鏋滄湁锛?
      if (task.coverUrl) {
        // 灏濊瘯鎵惧埌灏侀潰璁剧疆鎸夐挳
        const coverBtn = page.locator('').first();
        if (await coverBtn.isVisible().catch(() => false)) {
          // 灏侀潰璁剧疆閫昏緫杈冨鏉傦紝鏆傛椂璺宠繃
          this.logger.log('[garbled]');
        }
      }

      // 8. 鐐瑰嚮鍙戝竷鎸夐挳
      await page.waitForTimeout(2000);
      const publishBtn = page.locator('').first();
      await publishBtn.waitFor({ timeout: 10000 });
      await publishBtn.click();

      // 9. 绛夊緟鍙戝竷瀹屾垚
      await page.waitForTimeout(5000);

      // 妫€鏌ユ槸鍚﹀彂甯冩垚鍔燂紙鐪嬫槸鍚﹁烦杞埌鍐呭绠＄悊椤垫垨鍑虹幇鎴愬姛鎻愮ず锛?
      const successIndicator = await page.locator('').first().isVisible().catch(() => false);
      const currentUrl = page.url();

      if (successIndicator || currentUrl.includes('content/manage')) {
        // 灏濊瘯鑾峰彇浣滃搧閾炬帴
        const platformUrl = await this.extractPostUrl(page);

        // 淇濆瓨鏈€鏂?Cookie
        const newCookies = await context.cookies();
        await this.cookieManager.saveCookies(task.accountId, newCookies.map((c) => ({
          name: c.name,
          value: c.value,
          domain: c.domain,
          path: c.path,
          expires: c.expires,
          httpOnly: c.httpOnly,
          secure: c.secure,
          sameSite: c.sameSite as StoredCookie['sameSite'],
        })));

        return {
          success: true,
          platformUrl: platformUrl || undefined,
        };
      }

      // 妫€鏌ユ槸鍚︽湁閿欒鎻愮ず
      const errorText = await page.locator('.error-msg, .toast-error, [class*="error"]').first().textContent().catch(() => null);
      return {
        success: false,
        errorMsg: errorText || '[garbled]',
      };
    } catch (error: any) {
      this.logger.error('', error.stack);
      return { success: false, errorMsg: error.message };
    } finally {
      // 娓呯悊涓存椂鏂囦欢
      await this.cleanup();
      await context.close();
    }
  }

  /**
   * 绛夊緟瑙嗛涓婁紶瀹屾垚
   */
  private async waitForUploadComplete(page: any): Promise<void> {
    // 绛夊緟杩涘害鏉℃秷澶辨垨鍑虹幇""鎻愮ず
    const maxWait = 300000; // 鏈€澶氱瓑 5 鍒嗛挓
    const startTime = Date.now();

    while (Date.now() - startTime < maxWait) {
      const progress = await page.locator('[class*="progress"], .upload-progress').first().isVisible().catch(() => false);
      const complete = await page.locator('').first().isVisible().catch(() => false);

      if (complete || !progress) {
        await page.waitForTimeout(2000);
        return;
      }
      await page.waitForTimeout(3000);
    }

    throw new Error('[garbled]');
  }

  /**
   * 鎻愬彇鍙戝竷鍚庣殑浣滃搧 URL
   */
  private async extractPostUrl(page: any): Promise<string | null> {
    try {
      // 灏濊瘯浠庨〉闈腑鎵惧埌浣滃搧閾炬帴
      const link = await page.locator('a[href*="douyin.com/video"]').first().getAttribute('href').catch(() => null);
      return link;
    } catch {
      return null;
    }
  }

  /**
   * 涓嬭浇鏂囦欢鍒版湰鍦颁复鏃剁洰褰?
   */
  private async downloadFile(url: string, destPath: string): Promise<void> {
    const { safeDownload } = require('../utils/safe-file-ops');
    await safeDownload(url, destPath);
  }

  /**
   * 娓呯悊涓存椂鏂囦欢
   */
  private async cleanup(): Promise<void> {
    const { safeCleanupTempFiles } = require('../utils/safe-file-ops');
    safeCleanupTempFiles('douyin_upload_');
  }
}
