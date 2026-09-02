import { Test, TestingModule } from '@nestjs/testing';
import { WechatStoreService } from '../../src/modules/wechat-store/wechat-store.service';
import { PrismaService } from '../../src/prisma/prisma.service';

describe('WechatStoreService', () => {
  let service: WechatStoreService;
  let prisma: any;

  beforeEach(async () => {
    prisma = {
      wechatStore: {
        findUnique: jest.fn(),
        findMany: jest.fn(),
        create: jest.fn(),
        update: jest.fn(),
      },
      wechatStoreOrder: {
        findMany: jest.fn(),
        upsert: jest.fn(),
      },
      wechatStoreProduct: {
        findMany: jest.fn(),
        upsert: jest.fn(),
      },
      wechatStoreAftersale: {
        upsert: jest.fn(),
      },
    };

    const module: TestingModule = await Test.createTestingModule({
      providers: [
        WechatStoreService,
        { provide: PrismaService, useValue: prisma },
      ],
    }).compile();

    service = module.get<WechatStoreService>(WechatStoreService);
  });

  afterEach(() => {
    jest.restoreAllMocks();
  });

  it('creates a store from manually entered credentials', async () => {
    const created = {
      id: 'store-1',
      name: '寰俊灏忓簵',
      appId: 'wx123',
      status: 'ACTIVE',
      lastSyncedAt: null,
      syncStatus: 'pending',
      syncError: null,
      createdAt: new Date(),
      updatedAt: new Date(),
    };
    prisma.wechatStore.findUnique.mockResolvedValue(null);
    prisma.wechatStore.create.mockResolvedValue(created);
    jest.spyOn(service, 'syncStore').mockResolvedValue(undefined);

    const result = await service.createStore(' 寰俊灏忓簵 ', ' wx123 ', ' secret ');

    expect(prisma.wechatStore.create).toHaveBeenCalledWith(
      expect.objectContaining({
        data: { name: '寰俊灏忓簵', appId: 'wx123', appSecret: 'secret', organizationId: null },
      }),
    );
    expect(result).toBe(created);
  });

  it('rejects duplicate WeChat store AppID', async () => {
    prisma.wechatStore.findUnique.mockResolvedValue({ id: 'existing-store' });

    await expect(service.createStore('寰俊灏忓簵', 'wx123', 'secret')).rejects.toThrow(
      '该 AppID 已添加过微信小店',
    );
    expect(prisma.wechatStore.create).not.toHaveBeenCalled();
  });

  it('reports invalid remote JSON with endpoint context', async () => {
    prisma.wechatStore.findUnique.mockResolvedValue({
      id: 'store-1',
      name: 'Test Store',
      appId: 'app-id',
      appSecret: 'app-secret',
    });
    jest.spyOn(globalThis, 'fetch').mockResolvedValue(
      new Response('<html>bad gateway</html>', { status: 502 }) as any,
    );

    await expect(service.getShopInfo('store-1')).rejects.toThrow(
      'WeChat token response returned invalid JSON',
    );
  });

  it('normalizes malformed order numbers before writing synced orders', async () => {
    prisma.wechatStore.findUnique.mockResolvedValue({ id: 'store-1', organizationId: null });
    jest.spyOn(service as any, 'collectOrderIds').mockResolvedValue(['order-1']);
    jest.spyOn(service as any, 'getOrderDetailRemote').mockResolvedValue({
      errcode: 0,
      order: {
        order_id: 'order-1',
        status: 'bad',
        create_time: '--',
        settle_time: 'bad',
        order_detail: {
          price_info: { order_price: 'bad' },
          product_infos: [{ product_id: 'product-1', sku_id: 'sku-1', title: 'Title' }],
          delivery_info: {
            ship_done_time: 'bad',
            delivery_product_info: [],
          },
        },
      },
    });

    await (service as any).syncOrders('store-1', new Date('2026-01-01T00:00:00.000Z'));

    expect(prisma.wechatStoreOrder.upsert).toHaveBeenCalledTimes(1);
    const update = prisma.wechatStoreOrder.upsert.mock.calls[0][0].update;
    expect(update).toMatchObject({
      status: 0,
      payAmount: 0,
      createTime: 0,
      settleTime: 0,
      shipTime: 0,
    });
    expect(
      ['status', 'payAmount', 'createTime', 'settleTime', 'shipTime'].every((field) =>
        Number.isFinite(update[field]),
      ),
    ).toBe(true);
  });

  it('returns WeChat order source infos from cached raw detail', async () => {
    prisma.wechatStore.findUnique.mockResolvedValue({ id: 'store-1', organizationId: null });
    prisma.wechatStoreOrder.findMany.mockResolvedValue([
      {
        orderId: 'order-1',
        productId: 'product-1',
        skuId: 'sku-1',
        status: 100,
        payAmount: 29900,
        createTime: 1785000000,
        settleTime: 0,
        productTitle: 'Course',
        productImg: '',
        shipTime: 0,
        deliveryList: [],
        raw: {
          order_detail: {
            source_infos: [
              {
                account_type: 5,
                account_id: 'finder-1',
                account_nickname: 'Source Account',
                sale_channel: 100,
              },
            ],
            price_info: { product_price: 29900 },
          },
        },
      },
    ]);

    const result = await service.getOrderListAggregated('store-1', {});

    expect(result.order_list[0].source_infos).toEqual([
      {
        account_type: '5',
        account_id: 'finder-1',
        account_nickname: 'Source Account',
        sale_channel: '100',
      },
    ]);
  });
});


