import { Injectable, Logger } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { PrismaService } from '../../prisma/prisma.service';

export interface BrowserInstance {
  id: string;
  status: 'idle' | 'busy' | 'error';
  accountId?: string;
  startedAt: Date;
}

@Injectable()
export class BrowserService {
  private readonly logger = new Logger(BrowserService.name);
  private readonly browserEngineUrl: string;

  // 内存中的浏览器实例管理
  private instances: Map<string, BrowserInstance> = new Map();

  constructor(
    private prisma: PrismaService,
    private configService: ConfigService,
  ) {
    this.browserEngineUrl =
      this.configService.get<string>('BROWSER_ENGINE_URL') || 'http://localhost:3001';
  }

  /**
   * 获取浏览器实例列表
   */
  getInstances(): BrowserInstance[] {
    return Array.from(this.instances.values());
  }

  /**
   * 创建浏览器实例
   */
  async createInstance(accountId: string): Promise<BrowserInstance> {
    const instanceId = `browser-${Date.now()}-${Math.random().toString(36).slice(2, 8)}`;

    const instance: BrowserInstance = {
      id: instanceId,
      status: 'idle',
      accountId,
      startedAt: new Date(),
    };

    this.instances.set(instanceId, instance);
    this.logger.log(`浏览器实例创建: ${instanceId} -> 账号 ${accountId}`);

    return instance;
  }

  /**
   * 关闭浏览器实例
   */
  async closeInstance(instanceId: string): Promise<void> {
    const instance = this.instances.get(instanceId);
    if (!instance) {
      return;
    }

    this.instances.delete(instanceId);
    this.logger.log(`浏览器实例关闭: ${instanceId}`);
  }

  /**
   * 设置账号Cookie到浏览器
   */
  async setCookies(instanceId: string, cookies: string): Promise<void> {
    const instance = this.instances.get(instanceId);
    if (!instance) {
      throw new Error('浏览器实例不存在');
    }

    // 实际调用 browser-engine 微服务
    // await fetch(`${this.browserEngineUrl}/api/cookies`, {
    //   method: 'POST',
    //   body: JSON.stringify({ instanceId, cookies }),
    // });

    this.logger.log(`Cookie已设置到实例: ${instanceId}`);
  }

  /**
   * 执行发布任务
   */
  async executePublish(
    instanceId: string,
    platform: string,
    content: {
      title?: string;
      content?: string;
      mediaUrls?: string[];
    },
  ): Promise<{ success: boolean; platformUrl?: string; error?: string }> {
    const instance = this.instances.get(instanceId);
    if (!instance) {
      return { success: false, error: '浏览器实例不存在' };
    }

    instance.status = 'busy';

    try {
      // 实际调用 browser-engine 微服务执行发布
      // const response = await fetch(`${this.browserEngineUrl}/api/publish`, {
      //   method: 'POST',
      //   body: JSON.stringify({ instanceId, platform, content }),
      // });

      // 模拟发布成功
      this.logger.log(`发布任务执行: ${instanceId} -> ${platform}`);

      instance.status = 'idle';
      return {
        success: true,
        platformUrl: `https://${platform}.com/post/mock-id`,
      };
    } catch (error) {
      instance.status = 'error';
      this.logger.error(`发布失败: ${instanceId}`, error);
      return {
        success: false,
        error: error instanceof Error ? error.message : '发布失败',
      };
    }
  }

  /**
   * 截图（用于数据采集）
   */
  async screenshot(instanceId: string): Promise<string | null> {
    const instance = this.instances.get(instanceId);
    if (!instance) {
      return null;
    }

    // 调用 browser-engine 截图
    this.logger.log(`截图: ${instanceId}`);
    return null; // 返回截图URL
  }
}
