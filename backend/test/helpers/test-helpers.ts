/**
 * 测试工具函数
 * 提供创建测试用户、获取Token、构建请求等通用辅助方法
 */

import { Test, TestingModule } from '@nestjs/testing';
import { JwtService } from '@nestjs/jwt';
import { ConfigService } from '@nestjs/config';
import * as bcrypt from 'bcryptjs';
import { mockPrismaService } from '../mocks/prisma.mock';
import { mockUsers, mockJwtPayload } from '../fixtures';

/**
 * 创建测试模块
 * 快速构建带有 Mock 依赖的 NestJS 测试模块
 */
export async function createTestingModule(
  providers: any[],
  imports: any[] = [],
): Promise<TestingModule> {
  return Test.createTestingModule({
    imports,
    providers: [
      ...providers,
      {
        provide: 'PRISMA_SERVICE',
        useValue: mockPrismaService,
      },
    ],
  }).compile();
}

/**
 * 创建真实的 JwtService 实例（用于 Token 测试）
 */
export function createJwtService(): JwtService {
  return new JwtService({
    secret: 'test-jwt-secret',
    signOptions: { expiresIn: '15m' },
  });
}

/**
 * 创建 ConfigService Mock
 */
export function createMockConfigService(overrides: Record<string, string> = {}): ConfigService {
  const defaults: Record<string, string> = {
    JWT_SECRET: 'test-jwt-secret',
    JWT_REFRESH_SECRET: 'test-jwt-refresh-secret',
    JWT_ACCESS_EXPIRES: '15m',
    JWT_REFRESH_EXPIRES: '7d',
    COOKIE_ENCRYPTION_KEY: 'test-cookie-encryption-key-32bytes!',
    BROWSER_ENGINE_URL: 'http://localhost:3001',
    DATABASE_URL: 'postgresql://test:test@localhost:5432/matrixflow_test',
    REDIS_URL: 'redis://localhost:6379/1',
  };

  const config = { ...defaults, ...overrides };
  return {
    get: jest.fn((key: string) => config[key]),
  } as any;
}

/**
 * 生成测试用的 Bcrypt 密码哈希
 */
export async function hashTestPassword(password: string = 'Test123456'): Promise<string> {
  return bcrypt.hash(password, 10);
}

/**
 * 生成测试用的 JWT Token
 */
export async function generateTestToken(
  jwtService: JwtService,
  user: { id: string; email: string } = mockUsers.regular,
): Promise<string> {
  return jwtService.signAsync({
    sub: user.id,
    email: user.email,
  });
}

/**
 * 生成测试用的 Refresh Token
 */
export async function generateTestRefreshToken(
  jwtService: JwtService,
  user: { id: string; email: string } = mockUsers.regular,
): Promise<string> {
  return jwtService.signAsync(
    { sub: user.id, email: user.email },
    { secret: 'test-jwt-refresh-secret', expiresIn: '7d' },
  );
}

/**
 * 创建带认证头的请求对象
 */
export function createAuthenticatedRequest(userId: string = 'user-001') {
  return {
    user: {
      id: userId,
      email: mockUsers.regular.email,
      role: mockUsers.regular.role,
    },
  };
}

/**
 * 断言 Prisma 方法被正确调用
 */
export function expectPrismaCalled(
  model: keyof typeof mockPrismaService,
  method: string,
  args?: any,
) {
  const service = mockPrismaService[model] as any;
  expect(service[method]).toHaveBeenCalled();
  if (args) {
    expect(service[method]).toHaveBeenCalledWith(args);
  }
}

/**
 * 设置 Prisma Mock 返回值
 */
export function mockPrismaReturn(
  model: keyof typeof mockPrismaService,
  method: string,
  returnValue: any,
) {
  (mockPrismaService[model] as any)[method].mockResolvedValue(returnValue);
}

/**
 * 生成随机字符串（用于测试）
 */
export function randomString(length: number = 10): string {
  return Math.random()
    .toString(36)
    .substring(2, 2 + length);
}

/**
 * 生成随机邮箱
 */
export function randomEmail(): string {
  return `test-${randomString(8)}@example.com`;
}

/**
 * 等待异步操作
 */
export function sleep(ms: number): Promise<void> {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

/**
 * 期望抛出特定异常
 */
export async function expectThrows(
  fn: () => Promise<any>,
  errorClass: new (...args: any[]) => Error,
  message?: string,
) {
  await expect(fn()).rejects.toThrow(errorClass);
  if (message) {
    await expect(fn()).rejects.toThrow(message);
  }
}

/**
 * Mock Date.now() 用于时间相关测试
 */
export function mockDateNow(timestamp: number): jest.SpyInstance {
  return jest.spyOn(Date, 'now').mockReturnValue(timestamp);
}

/**
 * 恢复 Date.now()
 */
export function restoreDateNow(spy: jest.SpyInstance): void {
  spy.mockRestore();
}
