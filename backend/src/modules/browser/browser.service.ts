import { Injectable, Logger, NotImplementedException } from '@nestjs/common';

export interface BrowserInstance {
  id: string;
  status: 'idle' | 'busy' | 'error';
  accountId?: string;
  startedAt: Date;
}

/**
 * 浏览器引擎服务 - 已禁用
 * 浏览器引擎（browser-engine）已从项目中移除。
 * 所有方法将抛出 NotImplementedException (501)。
 *
 * #10 注意: 如果未来重新启用浏览器引擎，浏览器实例状态应使用 Redis 持久化，
 * 而非内存 Map。当前内存方案在服务重启后会丢失所有实例信息，
 * 多实例部署时也无法共享状态。
 */
@Injectable()
export class BrowserService {
  private readonly logger = new Logger(BrowserService.name);

  getInstances(): BrowserInstance[] {
    throw new NotImplementedException('浏览器引擎功能已禁用');
  }

  async createInstance(_accountId: string): Promise<BrowserInstance> {
    throw new NotImplementedException('浏览器引擎功能已禁用');
  }

  async closeInstance(_instanceId: string): Promise<void> {
    throw new NotImplementedException('浏览器引擎功能已禁用');
  }

  async setCookies(_instanceId: string, _cookies: string): Promise<void> {
    throw new NotImplementedException('浏览器引擎功能已禁用');
  }

  async executePublish(
    _instanceId: string,
    _platform: string,
    _content: {
      title?: string;
      content?: string;
      mediaUrls?: string[];
    },
  ): Promise<{ success: boolean; platformUrl?: string; error?: string }> {
    throw new NotImplementedException('浏览器引擎功能已禁用');
  }

  async screenshot(_instanceId: string): Promise<string | null> {
    throw new NotImplementedException('浏览器引擎功能已禁用');
  }
}
