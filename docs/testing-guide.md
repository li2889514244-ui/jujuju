# MatrixFlow ERP 测试套件文档

## 目录结构

```
backend/test/
├── jest.config.ts          # Jest 配置文件
├── setup.ts                # 测试环境全局设置
├── helpers/
│   └── test-helpers.ts     # 测试工具函数
├── mocks/
│   ├── prisma.mock.ts      # PrismaService Mock
│   └── redis.mock.ts       # Redis Mock
├── fixtures/
│   └── index.ts            # 测试数据 Fixtures
├── unit/                   # 单元测试
│   ├── auth.service.spec.ts
│   ├── accounts.service.spec.ts
│   ├── teams.service.spec.ts
│   ├── content.service.spec.ts
│   ├── analytics.service.spec.ts
│   └── browser.service.spec.ts
├── integration/            # 集成测试
│   ├── auth.integration.spec.ts
│   ├── accounts.integration.spec.ts
│   ├── teams.integration.spec.ts
│   └── content.integration.spec.ts
└── e2e/                    # 端到端测试
    ├── app.e2e-spec.ts
    ├── auth-flow.e2e-spec.ts
    └── publish-flow.e2e-spec.ts
```

## 运行测试

### 安装依赖

```bash
cd backend
npm install
```

### 运行所有测试

```bash
npm test
```

### 运行特定类型的测试

```bash
# 仅运行单元测试
npx jest --config test/jest.config.ts --testPathPattern=test/unit

# 仅运行集成测试
npx jest --config test/jest.config.ts --testPathPattern=test/integration

# 仅运行 E2E 测试
npx jest --config test/jest.config.ts --testPathPattern=test/e2e
```

### 运行单个测试文件

```bash
npx jest --config test/jest.config.ts test/unit/auth.service.spec.ts
```

### 生成覆盖率报告

```bash
npx jest --config test/jest.config.ts --coverage
```

覆盖率报告将生成在 `backend/coverage/` 目录下。

### 监听模式（开发时使用）

```bash
npx jest --config test/jest.config.ts --watch
```

## 测试脚本配置

在 `backend/package.json` 中添加以下脚本：

```json
{
  "scripts": {
    "test": "jest --config test/jest.config.ts",
    "test:unit": "jest --config test/jest.config.ts --testPathPattern=test/unit",
    "test:integration": "jest --config test/jest.config.ts --testPathPattern=test/integration",
    "test:e2e": "jest --config test/jest.config.ts --testPathPattern=test/e2e",
    "test:cov": "jest --config test/jest.config.ts --coverage",
    "test:watch": "jest --config test/jest.config.ts --watch"
  }
}
```

## 测试架构说明

### Mock 策略

- **PrismaService**: 完整模拟所有 Prisma 模型方法（findUnique, findMany, create, update, delete, count 等）
- **Redis**: 模拟 ioredis 的常用方法
- **bcrypt**: 使用 jest.spyOn 模拟密码哈希
- **JWT**: 使用真实的 JwtService（配合测试密钥）

### 测试数据工厂

`fixtures/index.ts` 提供标准化的测试数据：

- `mockUsers` - 用户数据（普通用户、管理员、所有者、被禁用用户、无组织用户）
- `mockOrganizations` - 组织数据
- `mockTeams` - 团队数据
- `mockAccounts` - 账号数据（抖音、小红书、被封禁）
- `mockPosts` - 内容数据（草稿、定时、已发布、失败、发布中）
- `mockStats` - 统计数据
- `mockJwtPayload` - JWT Payload

### 测试工具函数

`helpers/test-helpers.ts` 提供：

- `createTestingModule()` - 快速创建测试模块
- `createJwtService()` - 创建真实的 JwtService
- `createMockConfigService()` - 创建 ConfigService Mock
- `hashTestPassword()` - 生成测试密码哈希
- `generateTestToken()` - 生成测试 JWT Token
- `expectThrows()` - 断言异常抛出
- `randomString()` / `randomEmail()` - 随机测试数据

## 覆盖率目标

| 类型 | 目标 |
|------|------|
| 单元测试 | 80%+ 覆盖率 |
| 集成测试 | 核心 API 100% 覆盖 |
| E2E 测试 | 核心业务流程 100% 覆盖 |

## 测试用例命名规范

- 使用中文描述测试意图
- 格式：`应该 + 预期行为`
- 示例：`应该成功注册新用户`、`密码错误时应抛出 UnauthorizedException`

## 注意事项

1. 所有测试使用 Mock 数据库，不会操作真实数据库
2. E2E 测试会启动真实的 NestJS 应用（使用 Mock 的 PrismaService）
3. 测试环境变量在 `setup.ts` 中设置
4. 每个测试前会重置所有 Mock 调用记录
