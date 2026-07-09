/**
 * 动态代理 IP 池管理器
 * 支持阿布云、快代理等服务商
 */

import { Logger } from '@nestjs/common';

export interface ProxyConfig {
  host: string;
  port: number;
  username?: string;
  password?: string;
  protocol?: 'http' | 'https' | 'socks5';
}

export interface ProxyProvider {
  name: string;
  getProxy(): Promise<ProxyConfig>;
  reportSuccess(proxy: ProxyConfig): void;
  reportFailure(proxy: ProxyConfig): void;
}

// 阿布云代理
export class AbuYunProvider implements ProxyProvider {
  private readonly logger = new Logger(AbuYunProvider.name);
  name = '阿布云';

  constructor(
    private readonly username: string,
    private readonly password: string,
  ) {}

  async getProxy(): Promise<ProxyConfig> {
    // 阿布云使用隧道代理，固定地址
    return {
      host: 'http-dyn.abuyun.com',
      port: 9020,
      username: this.username,
      password: this.password,
      protocol: 'http',
    };
  }

  reportSuccess(proxy: ProxyConfig): void {
    this.logger.debug(`代理成功: ${proxy.host}:${proxy.port}`);
  }

  reportFailure(proxy: ProxyConfig): void {
    this.logger.warn(`代理失败: ${proxy.host}:${proxy.port}`);
  }
}

// 快代理
export class KuaiDaiLiProvider implements ProxyProvider {
  private readonly logger = new Logger(KuaiDaiLiProvider.name);
  name = '快代理';
  private proxyList: ProxyConfig[] = [];
  private lastFetch = 0;

  constructor(
    private readonly apiKey: string,
    private readonly apiSecret: string,
  ) {}

  async getProxy(): Promise<ProxyConfig> {
    // 每5分钟刷新代理列表
    if (Date.now() - this.lastFetch > 5 * 60 * 1000 || this.proxyList.length === 0) {
      await this.fetchProxies();
    }

    // 随机选择一个代理
    const proxy = this.proxyList[Math.floor(Math.random() * this.proxyList.length)];
    return proxy;
  }

  private async fetchProxies(): Promise<void> {
    try {
      const response = await fetch(
        `https://dps.kdlapi.com/api/getdps/?orderid=${this.apiKey}&num=10&pt=1&format=json&sep=1`,
      );
      const data = await response.json();

      if (data.code === 0) {
        this.proxyList = data.data.proxy_list.map((proxy: string) => {
          const [host, port] = proxy.split(':');
          return {
            host,
            port: parseInt(port),
            username: this.apiKey,
            password: this.apiSecret,
            protocol: 'http',
          };
        });
        this.lastFetch = Date.now();
        this.logger.log(`获取到 ${this.proxyList.length} 个代理`);
      }
    } catch (error) {
      this.logger.error('获取代理列表失败', error);
    }
  }

  reportSuccess(proxy: ProxyConfig): void {
    this.logger.debug(`代理成功: ${proxy.host}:${proxy.port}`);
  }

  reportFailure(proxy: ProxyConfig): void {
    this.logger.warn(`代理失败: ${proxy.host}:${proxy.port}`);
    // 从列表中移除失败代理
    this.proxyList = this.proxyList.filter(
      (p) => p.host !== proxy.host || p.port !== proxy.port,
    );
  }
}

// 代理池管理器
export class ProxyRotator {
  private readonly logger = new Logger(ProxyRotator.name);
  private providers: ProxyProvider[] = [];
  private currentIndex = 0;

  addProvider(provider: ProxyProvider): void {
    this.providers.push(provider);
    this.logger.log(`添加代理提供商: ${provider.name}`);
  }

  async getProxy(): Promise<ProxyConfig | null> {
    if (this.providers.length === 0) {
      return null;
    }

    // 轮询选择提供商
    const provider = this.providers[this.currentIndex % this.providers.length];
    this.currentIndex++;

    try {
      const proxy = await provider.getProxy();
      return proxy;
    } catch (error) {
      this.logger.error(`获取代理失败: ${provider.name}`, error);
      return null;
    }
  }

  reportSuccess(proxy: ProxyConfig): void {
    const provider = this.providers.find((p) => p.name === this.getProviderName(proxy));
    if (provider) {
      provider.reportSuccess(proxy);
    }
  }

  reportFailure(proxy: ProxyConfig): void {
    const provider = this.providers.find((p) => p.name === this.getProviderName(proxy));
    if (provider) {
      provider.reportFailure(proxy);
    }
  }

  private getProviderName(proxy: ProxyConfig): string {
    if (proxy.host.includes('abuyun')) return '阿布云';
    if (proxy.host.includes('kdlapi')) return '快代理';
    return 'unknown';
  }
}

// 全局代理池实例
export const globalProxyRotator = new ProxyRotator();
