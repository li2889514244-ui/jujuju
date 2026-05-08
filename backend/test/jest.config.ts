import type { Config } from 'jest';

const config: Config = {
  // 测试环境
  testEnvironment: 'node',

  // 根目录
  roots: ['<rootDir>'],

  // 测试文件匹配模式
  testMatch: [
    '**/unit/**/*.spec.ts',
    '**/integration/**/*.spec.ts',
    '**/e2e/**/*.spec.ts',
  ],

  // 模块文件扩展名
  moduleFileExtensions: ['js', 'json', 'ts'],

  // TypeScript 转换
  transform: {
    '^.+\\.ts$': 'ts-jest',
  },

  // 模块路径映射
  moduleNameMapper: {
    '^@/(.*)$': '<rootDir>/../src/$1',
    '^@test/(.*)$': '<rootDir>/$1',
  },

  // 覆盖率配置
  collectCoverageFrom: [
    '../src/**/*.(t|j)s',
    '!../src/main.ts',
    '!../src/**/*.module.ts',
    '!../src/**/*.dto.ts',
    '!../src/**/*.entity.ts',
    '!../src/common/decorators/**',
  ],
  coverageDirectory: '../coverage',
  coverageReporters: ['text', 'text-summary', 'lcov', 'json-summary'],
  coverageThreshold: {
    global: {
      branches: 80,
      functions: 80,
      lines: 80,
      statements: 80,
    },
  },

  // 超时设置
  testTimeout: 30000,

  // 详细输出
  verbose: true,

  // 静默无测试时的警告
  passWithNoTests: true,
};

export default config;
