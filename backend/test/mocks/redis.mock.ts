/**
 * Redis Mock 对象
 * 模拟 ioredis 的常用方法
 */

export const mockRedisService = {
  get: jest.fn(),
  set: jest.fn(),
  del: jest.fn(),
  exists: jest.fn(),
  expire: jest.fn(),
  ttl: jest.fn(),
  keys: jest.fn(),
  mget: jest.fn(),
  mset: jest.fn(),
  incr: jest.fn(),
  decr: jest.fn(),
  hget: jest.fn(),
  hset: jest.fn(),
  hdel: jest.fn(),
  hgetall: jest.fn(),
  lpush: jest.fn(),
  rpush: jest.fn(),
  lpop: jest.fn(),
  rpop: jest.fn(),
  lrange: jest.fn(),
  llen: jest.fn(),
  publish: jest.fn(),
  subscribe: jest.fn(),
  unsubscribe: jest.fn(),
  connect: jest.fn(),
  disconnect: jest.fn(),
  quit: jest.fn(),
  on: jest.fn(),
  off: jest.fn(),
  status: 'ready',
};

/**
 * 重置所有 Redis Mock 调用记录
 */
export function resetRedisMocks(): void {
  Object.values(mockRedisService).forEach((method) => {
    if (jest.isMockFunction(method)) {
      method.mockReset();
    }
  });
}
