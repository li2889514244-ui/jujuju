/**
 * 操作日志审计和异常登录告警系统
 */

import { Logger } from '@nestjs/common';

export interface AuditLog {
  id: string;
  userId: string;
  userEmail: string;
  action: string;
  resource: string;
  resourceId?: string;
  details: Record<string, any>;
  ip: string;
  userAgent: string;
  timestamp: Date;
  success: boolean;
  errorMessage?: string;
}

export interface LoginAttempt {
  userId?: string;
  email: string;
  ip: string;
  userAgent: string;
  timestamp: Date;
  success: boolean;
  failureReason?: string;
}

export class AuditLogger {
  private readonly logger = new Logger(AuditLogger.name);
  private logs: AuditLog[] = [];
  private loginAttempts: LoginAttempt[] = [];
  private readonly MAX_LOGS = 10000; // 内存中保留的最大日志数

  // 异常检测配置
  private readonly SUSPICIOUS_CONFIG = {
    // 5分钟内最多5次失败登录
    maxFailedLogins: 5,
    timeWindow: 5 * 60 * 1000,
    // 异常时间段（凌晨 0-5 点）
    suspiciousHours: [0, 1, 2, 3, 4, 5],
  };

  /**
   * 记录操作日志
   */
  log(
    userId: string,
    userEmail: string,
    action: string,
    resource: string,
    details: Record<string, any>,
    req: { ip: string; headers: Record<string, string> },
    success: boolean = true,
    errorMessage?: string,
  ): void {
    const log: AuditLog = {
      id: this.generateId(),
      userId,
      userEmail,
      action,
      resource,
      details,
      ip: this.getClientIp(req),
      userAgent: req.headers['user-agent'] || 'unknown',
      timestamp: new Date(),
      success,
      errorMessage,
    };

    this.logs.push(log);

    // 限制日志数量
    if (this.logs.length > this.MAX_LOGS) {
      this.logs = this.logs.slice(-this.MAX_LOGS);
    }

    // 记录到系统日志
    const status = success ? '✅' : '❌';
    this.logger.log(
      `${status} [${action}] ${userEmail} - ${resource} - IP: ${log.ip}`,
    );
  }

  /**
   * 记录登录尝试
   */
  logLogin(
    email: string,
    ip: string,
    userAgent: string,
    success: boolean,
    userId?: string,
    failureReason?: string,
  ): { isSuspicious: boolean; alert?: string } {
    const attempt: LoginAttempt = {
      userId,
      email,
      ip,
      userAgent,
      timestamp: new Date(),
      success,
      failureReason,
    };

    this.loginAttempts.push(attempt);

    // 检查是否异常登录
    const result = this.detectSuspiciousLogin(attempt);

    if (result.isSuspicious) {
      this.logger.warn(
        `🚨 异常登录 detected: ${email} from ${ip} - ${result.alert}`,
      );
    }

    return result;
  }

  /**
   * 检测异常登录
   */
  private detectSuspiciousLogin(attempt: LoginAttempt): { isSuspicious: boolean; alert?: string } {
    const now = new Date();
    const hour = now.getHours();

    // 1. 检查异常时间段
    if (this.SUSPICIOUS_CONFIG.suspiciousHours.includes(hour)) {
      return {
        isSuspicious: true,
        alert: `异常时间段登录 (${hour}:00)`,
      };
    }

    // 2. 检查失败登录次数
    const recentAttempts = this.loginAttempts.filter(
      (a) =>
        a.email === attempt.email &&
        !a.success &&
        now.getTime() - a.timestamp.getTime() < this.SUSPICIOUS_CONFIG.timeWindow,
    );

    if (recentAttempts.length >= this.SUSPICIOUS_CONFIG.maxFailedLogins) {
      return {
        isSuspicious: true,
        alert: `5分钟内失败登录 ${recentAttempts.length} 次`,
      };
    }

    // 3. 检查异地登录（简化版，实际应该对比历史IP地理位置）
    const userAttempts = this.loginAttempts.filter(
      (a) => a.email === attempt.email && a.success,
    );

    if (userAttempts.length > 0) {
      const lastAttempt = userAttempts[userAttempts.length - 1];
      if (lastAttempt.ip !== attempt.ip) {
        return {
          isSuspicious: true,
          alert: `IP 地址变化: ${lastAttempt.ip} -> ${attempt.ip}`,
        };
      }
    }

    return { isSuspicious: false };
  }

  /**
   * 查询用户操作日志
   */
  queryLogs(
    filters: {
      userId?: string;
      action?: string;
      resource?: string;
      startTime?: Date;
      endTime?: Date;
      success?: boolean;
    },
    limit: number = 100,
  ): AuditLog[] {
    return this.logs
      .filter((log) => {
        if (filters.userId && log.userId !== filters.userId) return false;
        if (filters.action && log.action !== filters.action) return false;
        if (filters.resource && log.resource !== filters.resource) return false;
        if (filters.startTime && log.timestamp < filters.startTime) return false;
        if (filters.endTime && log.timestamp > filters.endTime) return false;
        if (filters.success !== undefined && log.success !== filters.success) return false;
        return true;
      })
      .slice(-limit);
  }

  /**
   * 获取登录统计
   */
  getLoginStats(email?: string): {
    total: number;
    successful: number;
    failed: number;
    suspicious: number;
  } {
    const attempts = email
      ? this.loginAttempts.filter((a) => a.email === email)
      : this.loginAttempts;

    const successful = attempts.filter((a) => a.success).length;
    const failed = attempts.filter((a) => !a.success).length;

    // 统计异常登录
    let suspicious = 0;
    for (const attempt of attempts) {
      const result = this.detectSuspiciousLogin(attempt);
      if (result.isSuspicious) suspicious++;
    }

    return {
      total: attempts.length,
      successful,
      failed,
      suspicious,
    };
  }

  /**
   * 导出日志（用于审计）
   */
  exportLogs(startTime: Date, endTime: Date): string {
    const logs = this.queryLogs({ startTime, endTime }, 10000);
    return JSON.stringify(logs, null, 2);
  }

  private generateId(): string {
    return `${Date.now()}-${Math.random().toString(36).substr(2, 9)}`;
  }

  private getClientIp(req: { ip: string; headers: Record<string, string> }): string {
    const forwarded = req.headers['x-forwarded-for'];
    if (forwarded) {
      return forwarded.split(',')[0].trim();
    }
    return req.ip;
  }
}

// 全局审计日志实例
export const globalAuditLogger = new AuditLogger();
