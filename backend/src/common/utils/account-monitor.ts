/**
 * 账号异常检测和封禁预警系统
 */

import { Logger } from '@nestjs/common';

export interface AccountHealthCheck {
  accountId: string;
  platform: string;
  nickname: string;
  lastSyncAt: Date;
  errorCount: number;
  lastError?: string;
  lastErrorAt?: Date;
  status: 'healthy' | 'warning' | 'critical' | 'banned';
}

export interface BanWarning {
  accountId: string;
  platform: string;
  warningType: 'rate_limit' | 'login_required' | 'content_blocked' | 'suspicious_activity' | 'banned';
  message: string;
  severity: 'low' | 'medium' | 'high' | 'critical';
  timestamp: Date;
  recommendation: string;
}

export class AccountMonitor {
  private readonly logger = new Logger(AccountMonitor.name);
  private healthChecks: Map<string, AccountHealthCheck> = new Map();
  private errorCounts: Map<string, number> = new Map();
  private lastErrors: Map<string, { message: string; timestamp: Date }> = new Map();

  // 错误阈值配置
  private readonly ERROR_THRESHOLD = {
    warning: 3,   // 3次错误触发警告
    critical: 5,  // 5次错误触发严重警告
    banned: 10,   // 10次错误认为账号被封
  };

  /**
   * 记录 API 调用错误
   */
  recordError(
    accountId: string,
    platform: string,
    nickname: string,
    error: any,
  ): BanWarning | null {
    const key = `${platform}:${accountId}`;
    const now = new Date();

    // 增加错误计数
    const currentCount = (this.errorCounts.get(key) || 0) + 1;
    this.errorCounts.set(key, currentCount);

    // 记录错误信息
    const errorMessage = this.extractErrorMessage(error);
    this.lastErrors.set(key, { message: errorMessage, timestamp: now });

    // 分析错误类型
    const warning = this.analyzeError(
      accountId,
      platform,
      nickname,
      error,
      currentCount,
    );

    if (warning) {
      this.logger.warn(
        `账号异常 detected: ${platform} - ${nickname} [${warning.warningType}] ${warning.message}`,
      );
    }

    return warning;
  }

  /**
   * 记录成功的 API 调用
   */
  recordSuccess(accountId: string, platform: string): void {
    const key = `${platform}:${accountId}`;

    // 重置错误计数
    this.errorCounts.set(key, 0);

    // 更新健康状态
    this.healthChecks.set(key, {
      accountId,
      platform,
      nickname: '',
      lastSyncAt: new Date(),
      errorCount: 0,
      status: 'healthy',
    });
  }

  /**
   * 获取账号健康状态
   */
  getHealthStatus(accountId: string, platform: string): AccountHealthCheck {
    const key = `${platform}:${accountId}`;
    return (
      this.healthChecks.get(key) || {
        accountId,
        platform,
        nickname: '',
        lastSyncAt: new Date(),
        errorCount: 0,
        status: 'healthy',
      }
    );
  }

  /**
   * 获取所有异常账号
   */
  getUnhealthyAccounts(): AccountHealthCheck[] {
    return Array.from(this.healthChecks.values()).filter(
      (check) => check.status !== 'healthy',
    );
  }

  /**
   * 分析错误并生成警告
   */
  private analyzeError(
    accountId: string,
    platform: string,
    nickname: string,
    error: any,
    errorCount: number,
  ): BanWarning | null {
    const errorMessage = this.extractErrorMessage(error);
    const statusCode = error.response?.status;

    // 判断错误类型
    let warningType: BanWarning['warningType'] = 'suspicious_activity';
    let severity: BanWarning['severity'] = 'low';
    let recommendation = '';

    // 根据 HTTP 状态码判断
    if (statusCode === 429) {
      warningType = 'rate_limit';
      severity = 'medium';
      recommendation = '降低请求频率，增加延迟';
    } else if (statusCode === 401 || statusCode === 403) {
      warningType = 'login_required';
      severity = 'high';
      recommendation = '需要重新登录，Cookie 可能已过期';
    } else if (statusCode === 451) {
      warningType = 'content_blocked';
      severity = 'medium';
      recommendation = '内容被限制，检查内容合规性';
    }

    // 根据错误消息判断
    if (
      errorMessage.includes('封禁') ||
      errorMessage.includes('banned') ||
      errorMessage.includes('blocked') ||
      errorMessage.includes('suspended')
    ) {
      warningType = 'banned';
      severity = 'critical';
      recommendation = '账号可能已被封禁，请检查平台通知';
    } else if (
      errorMessage.includes('频繁') ||
      errorMessage.includes('rate limit') ||
      errorMessage.includes('too many requests')
    ) {
      warningType = 'rate_limit';
      severity = 'medium';
      recommendation = '请求过于频繁，暂停数据同步';
    }

    // 根据错误次数调整严重级别
    if (errorCount >= this.ERROR_THRESHOLD.banned) {
      severity = 'critical';
      recommendation = '错误次数过多，建议暂停该账号的数据同步';
    } else if (errorCount >= this.ERROR_THRESHOLD.critical) {
      severity = 'high';
      if (!recommendation) {
        recommendation = '错误次数较多，建议检查账号状态';
      }
    } else if (errorCount >= this.ERROR_THRESHOLD.warning) {
      severity = 'medium';
      if (!recommendation) {
        recommendation = '建议关注该账号状态';
      }
    } else {
      // 错误次数较少，不生成警告
      return null;
    }

    // 更新健康状态
    const key = `${platform}:${accountId}`;
    const lastError = this.lastErrors.get(key);
    this.healthChecks.set(key, {
      accountId,
      platform,
      nickname,
      lastSyncAt: new Date(),
      errorCount,
      lastError: lastError?.message,
      lastErrorAt: lastError?.timestamp,
      status: this.getStatusFromSeverity(severity),
    });

    return {
      accountId,
      platform,
      warningType,
      message: errorMessage,
      severity,
      timestamp: new Date(),
      recommendation,
    };
  }

  /**
   * 提取错误信息
   */
  private extractErrorMessage(error: any): string {
    if (typeof error === 'string') return error;
    if (error.message) return error.message;
    if (error.response?.data?.message) return error.response.data.message;
    if (error.response?.data?.error) return error.response.data.error;
    return JSON.stringify(error);
  }

  /**
   * 根据严重级别获取状态
   */
  private getStatusFromSeverity(severity: BanWarning['severity']): AccountHealthCheck['status'] {
    switch (severity) {
      case 'critical':
        return 'banned';
      case 'high':
        return 'critical';
      case 'medium':
        return 'warning';
      default:
        return 'healthy';
    }
  }
}

// 全局账号监控实例
export const globalAccountMonitor = new AccountMonitor();
