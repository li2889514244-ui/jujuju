/**
 * PrismaService Mock 对象
 * 模拟 Prisma ORM 的所有数据库操作
 */

export const mockPrismaService: any = {
  // 用户相关
  user: {
    findUnique: jest.fn(),
    findFirst: jest.fn(),
    findMany: jest.fn(),
    create: jest.fn(),
    upsert: jest.fn(),
    update: jest.fn(),
    updateMany: jest.fn(),
    delete: jest.fn(),
    deleteMany: jest.fn(),
    count: jest.fn(),
  },

  // 组织相关
  organization: {
    findUnique: jest.fn(),
    findMany: jest.fn(),
    create: jest.fn(),
    update: jest.fn(),
  },

  // 团队相关
  team: {
    findUnique: jest.fn(),
    findMany: jest.fn(),
    create: jest.fn(),
    update: jest.fn(),
    delete: jest.fn(),
  },

  teamMember: {
    deleteMany: jest.fn(),
  },

  teamPermission: {
    deleteMany: jest.fn(),
  },

  // 账号相关
  account: {
    findUnique: jest.fn(),
    findFirst: jest.fn(),
    findMany: jest.fn(),
    create: jest.fn(),
    upsert: jest.fn(),
    update: jest.fn(),
    updateMany: jest.fn(),
    delete: jest.fn(),
    deleteMany: jest.fn(),
    count: jest.fn(),
  },

  accountGroup: {
    findFirst: jest.fn(),
  },

  // 内容相关
  post: {
    findUnique: jest.fn(),
    findMany: jest.fn(),
    create: jest.fn(),
    update: jest.fn(),
    delete: jest.fn(),
    deleteMany: jest.fn(),
    count: jest.fn(),
  },

  // 统计相关
  postStats: {
    findMany: jest.fn(),
    create: jest.fn(),
    deleteMany: jest.fn(),
    aggregate: jest.fn(),
  },

  dailyStats: {
    findMany: jest.fn(),
    create: jest.fn(),
    deleteMany: jest.fn(),
    aggregate: jest.fn(),
    count: jest.fn(),
  },

  // 审计日志
  doudianStoreOrder: {
    findUnique: jest.fn(),
    upsert: jest.fn(),
    createMany: jest.fn(),
    deleteMany: jest.fn(),
  },

  auditLog: {
    create: jest.fn(),
    findMany: jest.fn(),
  },

  // Prisma 事务和连接
  $connect: jest.fn(),
  $disconnect: jest.fn(),
  $transaction: jest.fn((operation: Function | any[]) =>
    typeof operation === 'function' ? operation(mockPrismaService) : Promise.all(operation),
  ),
};

/**
 * 重置所有 Mock 调用记录
 */
export function resetPrismaMocks(): void {
  Object.values(mockPrismaService).forEach((model) => {
    if (typeof model === 'object' && model !== null) {
      Object.values(model).forEach((method) => {
        if (jest.isMockFunction(method)) {
          method.mockReset();
        }
      });
    }
  });
}
