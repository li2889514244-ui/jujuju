import { registerAs } from '@nestjs/config';

export default registerAs('database', () => {
  const url = process.env.DATABASE_URL;
  if (!url) {
    throw new Error(
      'FATAL: DATABASE_URL environment variable is required. ' +
      'Set it in Railway service variables.',
    );
  }
  return { url };
});
