import { Platform } from '../../common/prisma-enums';

/**
 * 鍙戝竷浠诲姟鐨勮緭鍏ュ弬鏁?
 */
export interface PublishTask {
  /** 鍐呭 ID锛圥ost.id锛?*/
  contentId: string;
  /** 鐩爣骞冲彴 */
  platform: Platform;
  /** 骞冲彴璐﹀彿 ID锛圓ccount.id锛?*/
  accountId: string;
  /** 鏍囬 */
  title: string;
  /** 姝ｆ枃/鎻忚堪 */
  content: string;
  /** 濯掍綋鏂囦欢 URL 鍒楄〃锛堣棰?鍥剧墖锛?*/
  mediaUrls: string[];
  /** 鏍囩 */
  tags: string[];
  /** 灏侀潰鍥?URL */
  coverUrl?: string;
}

/**
 * 鍙戝竷缁撴灉
 */
export interface PublishResult {
  success: boolean;
  /** 鍙戝竷鍚庣殑骞冲彴閾炬帴 */
  platformUrl?: string;
  /** 閿欒淇℃伅 */
  errorMsg?: string;
  /** 骞冲彴杩斿洖鐨勪綔鍝?ID */
  platformPostId?: string;
}

/**
 * Cookie 瀛樺偍缁撴瀯
 */
export interface StoredCookie {
  name: string;
  value: string;
  domain: string;
  path: string;
  expires?: number;
  httpOnly?: boolean;
  secure?: boolean;
  sameSite?: 'Strict' | 'Lax' | 'None';
}

/**
 * 鐧诲綍鐘舵€?
 */
export enum LoginStatus {
  VALID = 'VALID',
  EXPIRED = 'EXPIRED',
  UNKNOWN = 'UNKNOWN',
}

/**
 * 鎵€鏈夊钩鍙?Uploader 蹇呴』瀹炵幇鐨勬帴鍙?
 */
export abstract class BaseUploader {
  abstract readonly platform: Platform;
  abstract readonly name: string;

  /**
   * 妫€鏌ュ綋鍓?Cookie 鏄惁鏈夋晥锛堟槸鍚﹁繕澶勪簬鐧诲綍鎬侊級
   */
  abstract checkLogin(cookies: StoredCookie[]): Promise<LoginStatus>;

  /**
   * 鎵ц鐧诲綍娴佺▼锛堥渶瑕佷汉宸ユ壂鐮?杈撳叆楠岃瘉鐮佹椂鎶涘嚭 NeedManualLoginError锛?
   */
  abstract login(accountId: string): Promise<StoredCookie[]>;

  /**
   * 鎵ц鍙戝竷娴佺▼
   * @param task 鍙戝竷浠诲姟
   * @param cookies 褰撳墠鏈夋晥鐨?Cookie
   * @returns 鍙戝竷缁撴灉
   */
  abstract publish(task: PublishTask, cookies: StoredCookie[]): Promise<PublishResult>;

  /**
   * 鑾峰彇骞冲彴鍒涗綔鑰呬腑蹇?URL
   */
  abstract getCreatorUrl(): string;
}
