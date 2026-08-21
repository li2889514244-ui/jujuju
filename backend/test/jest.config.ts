import type { Config } from 'jest'

const config: Config = {
  testEnvironment: 'node',

  roots: ['<rootDir>'],

  testMatch: [
    '**/unit/**/*.spec.ts',
    '**/integration/**/*.spec.ts',
    '**/e2e/**/*.spec.ts',
    '**/e2e/**/*.e2e-spec.ts',
  ],

  moduleFileExtensions: ['js', 'json', 'ts'],

  transform: {
    '^.+\\.ts$': 'ts-jest',
  },

  setupFiles: ['<rootDir>/setup.ts'],

  moduleNameMapper: {
    '^@/(.*)$': '<rootDir>/../src/$1',
    '^@test/(.*)$': '<rootDir>/$1',
  },

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

  testTimeout: 30000,
  verbose: true,
  passWithNoTests: true,
}

export default config
