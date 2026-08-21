import { registerAs } from '@nestjs/config';
import { readIntegerEnv } from './env-number';

export default registerAs('redis', () => ({
  host: process.env.REDIS_HOST || 'localhost',
  port: readIntegerEnv('REDIS_PORT', 6379, { min: 1, max: 65535 }),
  password: process.env.REDIS_PASSWORD || '',
  db: readIntegerEnv('REDIS_DB', 0, { min: 0 }),
}));
