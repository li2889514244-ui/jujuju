/**
 * 测试环境全局设置
 * 在所有测试开始前执行，用于初始化测试环境
 */

export default async function globalSetup(): Promise<void> {
  // 设置测试环境变量
  process.env.NODE_ENV = 'test';
  process.env.JWT_SECRET = 'test-jwt-secret';
  process.env.JWT_REFRESH_SECRET = 'test-jwt-refresh-secret';
  process.env.JWT_ACCESS_EXPIRES = '15m';
  process.env.JWT_REFRESH_EXPIRES = '7d';
  process.env.COOKIE_ENCRYPTION_KEY = 'test-cookie-encryption-key-32bytes!';
  process.env.DATABASE_URL = 'postgresql://test:test@localhost:5432/matrixflow_test';
  process.env.REDIS_URL = 'redis://localhost:6379/1';

  console.log('\n🧪 测试环境已初始化');
}
