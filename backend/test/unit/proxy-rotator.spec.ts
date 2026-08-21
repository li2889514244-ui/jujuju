import { KuaiDaiLiProvider, ProxyRotator } from '../../src/common/utils/proxy-rotator';

describe('Proxy rotator', () => {
  afterEach(() => {
    jest.restoreAllMocks();
  });

  it('returns valid KuaiDaiLi proxies and filters malformed entries', async () => {
    jest.spyOn(globalThis, 'fetch').mockResolvedValue(
      new Response(
        JSON.stringify({
          code: 0,
          data: {
            proxy_list: ['127.0.0.1:8080', 'missing-port', '127.0.0.2:not-a-port'],
          },
        }),
      ) as any,
    );

    const provider = new KuaiDaiLiProvider('api-key', 'api-secret');

    await expect(provider.getProxy()).resolves.toMatchObject({
      host: '127.0.0.1',
      port: 8080,
      username: 'api-key',
      password: 'api-secret',
      protocol: 'http',
    });
  });

  it('returns null from the rotator when a provider response is not usable', async () => {
    jest.spyOn(globalThis, 'fetch').mockResolvedValue(
      new Response('<html>bad gateway</html>', { status: 502 }) as any,
    );

    const rotator = new ProxyRotator();
    rotator.addProvider(new KuaiDaiLiProvider('api-key', 'api-secret'));

    await expect(rotator.getProxy()).resolves.toBeNull();
  });
});
