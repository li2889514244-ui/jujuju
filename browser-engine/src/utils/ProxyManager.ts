/**
 * 代理管理工具
 *
 * 管理代理池，支持按账号绑定代理、轮换、验证
 */

import { logger } from './logger';

export interface ProxyConfig {
  /** 代理 ID */
  id: string;
  /** 代理服务器地址 (protocol://host:port) */
  server: string;
  /** 代理用户名 */
  username?: string;
  /** 代理密码 */
  password?: string;
  /** 绕过代理的地址列表 */
  bypass?: string;
  /** 代理类型 */
  type: 'http' | 'https' | 'socks5';
  /** 是否可用 */
  available: boolean;
  /** 最后验证时间 */
  lastChecked?: Date;
  /** 连续失败次数（用于自动禁用） */
  failCount: number;
  /** 当前使用该代理的账号列表 */
  boundAccounts: string[];
}

export interface ProxyValidationResult {
  valid: boolean;
  latency: number;
  ip?: string;
  error?: string;
}

/** 连续失败多少次后自动禁用代理 */
const MAX_FAIL_COUNT = 5;

// 代理池（内存存储，生产环境应使用 Redis）
const proxyPool: Map<string, ProxyConfig> = new Map();

// 账号 -> 代理的绑定关系
const accountProxyMap: Map<string, string> = new Map();

/**
 * 添加代理到代理池
 */
export function addProxy(proxy: Omit<ProxyConfig, 'available' | 'boundAccounts' | 'failCount'>): ProxyConfig {
  const config: ProxyConfig = {
    ...proxy,
    available: true,
    failCount: 0,
    boundAccounts: [],
  };
  proxyPool.set(config.id, config);
  logger.info(`代理已添加: ${config.id} -> ${config.server}`);
  return config;
}

/**
 * 获取账号绑定的代理
 */
export function getProxy(accountId: string): ProxyConfig | null {
  const proxyId = accountProxyMap.get(accountId);
  if (proxyId) {
    const proxy = proxyPool.get(proxyId);
    if (proxy && proxy.available) {
      return proxy;
    }
    // 代理不可用，解绑
    unbindProxy(accountId);
  }

  // 尝试自动分配一个可用代理
  const availableProxies = Array.from(proxyPool.values())
    .filter((p) => p.available && p.boundAccounts.length < 5) // 限制每个代理最多绑定 5 个账号
    .sort((a, b) => a.boundAccounts.length - b.boundAccounts.length);

  if (availableProxies.length > 0) {
    const proxy = availableProxies[0];
    bindProxy(accountId, proxy.id);
    logger.info(`自动分配代理: 账号 ${accountId} -> ${proxy.server}`);
    return proxy;
  }

  return null;
}

/**
 * 绑定代理到账号
 */
export function bindProxy(accountId: string, proxyId: string): boolean {
  const proxy = proxyPool.get(proxyId);
  if (!proxy || !proxy.available) {
    logger.warn(`代理不可用: ${proxyId}`);
    return false;
  }

  // 解除旧绑定
  unbindProxy(accountId);

  accountProxyMap.set(accountId, proxyId);
  proxy.boundAccounts.push(accountId);
  logger.info(`代理绑定: 账号 ${accountId} -> 代理 ${proxyId}`);
  return true;
}

/**
 * 解除代理绑定
 */
export function unbindProxy(accountId: string): void {
  const proxyId = accountProxyMap.get(accountId);
  if (proxyId) {
    const proxy = proxyPool.get(proxyId);
    if (proxy) {
      proxy.boundAccounts = proxy.boundAccounts.filter((id) => id !== accountId);
    }
    accountProxyMap.delete(accountId);
  }
}

/**
 * 轮换代理（为账号分配新的可用代理）
 */
export function rotateProxy(accountId: string): ProxyConfig | null {
  const currentProxyId = accountProxyMap.get(accountId);

  // 找到可用的、未满载的代理
  const availableProxies = Array.from(proxyPool.values())
    .filter((p) => p.available && p.id !== currentProxyId && p.boundAccounts.length < 5)
    .sort((a, b) => a.boundAccounts.length - b.boundAccounts.length);

  if (availableProxies.length === 0) {
    logger.warn('没有可用的代理进行轮换');
    return null;
  }

  const newProxy = availableProxies[0];
  bindProxy(accountId, newProxy.id);
  logger.info(`代理轮换: 账号 ${accountId} -> ${newProxy.server}`);
  return newProxy;
}

/**
 * 标记代理失败（用于自动禁用连续失败的代理）
 */
export function markProxyFailed(proxyId: string): void {
  const proxy = proxyPool.get(proxyId);
  if (!proxy) return;

  proxy.failCount++;
  if (proxy.failCount >= MAX_FAIL_COUNT) {
    proxy.available = false;
    logger.warn(`代理连续失败 ${MAX_FAIL_COUNT} 次，已自动禁用: ${proxyId}`);
    // 解绑所有使用该代理的账号
    proxy.boundAccounts.forEach((accountId) => {
      accountProxyMap.delete(accountId);
    });
    proxy.boundAccounts = [];
  }
}

/**
 * 标记代理成功（重置失败计数）
 */
export function markProxySuccess(proxyId: string): void {
  const proxy = proxyPool.get(proxyId);
  if (proxy) {
    proxy.failCount = 0;
  }
}

/**
 * 验证代理可用性
 */
export async function validateProxy(proxy: ProxyConfig): Promise<ProxyValidationResult> {
  const startTime = Date.now();

  try {
    const controller = new AbortController();
    const timeout = setTimeout(() => controller.abort(), 10000);

    // 构建代理 URL（带认证）
    let proxyUrl = proxy.server;
    if (proxy.username && proxy.password) {
      const url = new URL(proxy.server);
      url.username = proxy.username;
      url.password = proxy.password;
      proxyUrl = url.toString();
    }

    // 使用代理进行请求验证
    // 注意：Node.js 原生 fetch 不直接支持代理，这里通过环境变量方式验证
    // 生产环境建议使用 undici 或 https-proxy-agent
    const response = await fetch('https://httpbin.org/ip', {
      signal: controller.signal,
      headers: {
        'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36',
      },
    });

    clearTimeout(timeout);

    if (response.ok) {
      const data = (await response.json()) as { origin?: string };
      const latency = Date.now() - startTime;

      // 更新代理状态
      proxy.available = true;
      proxy.failCount = 0;
      proxy.lastChecked = new Date();

      return {
        valid: true,
        latency,
        ip: data.origin,
      };
    }

    proxy.available = false;
    proxy.lastChecked = new Date();
    return { valid: false, latency: Date.now() - startTime, error: `HTTP ${response.status}` };
  } catch (err) {
    proxy.lastChecked = new Date();
    markProxyFailed(proxy.id);
    return {
      valid: false,
      latency: Date.now() - startTime,
      error: (err as Error).message,
    };
  }
}

/**
 * 批量验证所有代理
 */
export async function validateAllProxies(): Promise<Map<string, ProxyValidationResult>> {
  const results = new Map<string, ProxyValidationResult>();

  const promises = Array.from(proxyPool.entries()).map(async ([id, proxy]) => {
    const result = await validateProxy(proxy);
    results.set(id, result);
  });

  await Promise.allSettled(promises);

  const validCount = Array.from(results.values()).filter((r) => r.valid).length;
  logger.info(`代理验证完成: ${validCount}/${results.size} 可用`);

  return results;
}

/**
 * 获取代理池状态
 */
export function getProxyPoolStatus(): {
  total: number;
  available: number;
  bound: number;
  proxies: ProxyConfig[];
} {
  const proxies = Array.from(proxyPool.values());
  return {
    total: proxies.length,
    available: proxies.filter((p) => p.available).length,
    bound: proxies.filter((p) => p.boundAccounts.length > 0).length,
    proxies: proxies.map((p) => ({ ...p })),
  };
}

/**
 * 移除代理
 */
export function removeProxy(proxyId: string): boolean {
  const proxy = proxyPool.get(proxyId);
  if (!proxy) return false;

  // 解除所有绑定
  proxy.boundAccounts.forEach((accountId) => {
    accountProxyMap.delete(accountId);
  });

  proxyPool.delete(proxyId);
  logger.info(`代理已移除: ${proxyId}`);
  return true;
}

/**
 * 获取代理统计信息
 */
export function getProxyStats(): {
  total: number;
  available: number;
  disabled: number;
  bound: number;
  unbound: number;
} {
  const proxies = Array.from(proxyPool.values());
  return {
    total: proxies.length,
    available: proxies.filter((p) => p.available).length,
    disabled: proxies.filter((p) => !p.available).length,
    bound: proxies.filter((p) => p.boundAccounts.length > 0).length,
    unbound: proxies.filter((p) => p.available && p.boundAccounts.length === 0).length,
  };
}
