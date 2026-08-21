function applyTestEnv(): void {
  process.env.NODE_ENV = 'test'
  process.env.JWT_SECRET = 'test-jwt-secret-32-characters-minimum'
  process.env.JWT_REFRESH_SECRET = 'test-jwt-refresh-secret-32-characters'
  process.env.JWT_ACCESS_EXPIRES = '15m'
  process.env.JWT_REFRESH_EXPIRES = '365d'
  process.env.COOKIE_ENCRYPTION_KEY = 'test-cookie-encryption-key-32bytes!'
  process.env.DATABASE_URL = 'postgresql://test:test@localhost:5432/matrixflow_test'
  process.env.REDIS_URL = 'redis://localhost:6379/1'
}

applyTestEnv()

export default async function globalSetup(): Promise<void> {
  applyTestEnv()
}
