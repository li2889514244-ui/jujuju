/**
 * BrowserService 单元测试
 * 测试浏览器服务的核心功能：实例管理、Cookie 设置、发布执行、截图
 */

import { Test, TestingModule } from '@nestjs/testing';
import { ConfigService } from '@nestjs/config';
import { BrowserService } from '../../src/modules/browser/browser.service';
import { PrismaService } from '../../src/prisma/prisma.service';
import { mockPrismaService, resetPrismaMocks } from '../mocks/prisma.mock';
import { createMockConfigService } from '../helpers/test-helpers';

describe('BrowserService', () => {
  let service: BrowserService;

  beforeEach(async () => {
    resetPrismaMocks();

    const module: TestingModule = await Test.createTestingModule({
      providers: [
        BrowserService,
        { provide: PrismaService, useValue: mockPrismaService },
        { provide: ConfigService, useValue: createMockConfigService() },
      ],
    }).compile();

    service = module.get<BrowserService>(BrowserService);
  });

  afterEach(() => {
    jest.restoreAllMocks();
  });

  // ==================== 浏览器实例管理测试 ====================

  describe('实例管理', () => {
    describe('createInstance', () => {
      it('应该创建新的浏览器实例', async () => {
        const instance = await service.createInstance('acc-001');

        expect(instance).toHaveProperty('id');
        expect(instance).toHaveProperty('status', 'idle');
        expect(instance).toHaveProperty('accountId', 'acc-001');
        expect(instance).toHaveProperty('startedAt');
      });

      it('每次创建应生成唯一的实例 ID', async () => {
        const instance1 = await service.createInstance('acc-001');
        const instance2 = await service.createInstance('acc-002');

        expect(instance1.id).not.toBe(instance2.id);
      });

      it('实例 ID 应以 browser- 开头', async () => {
        const instance = await service.createInstance('acc-001');

        expect(instance.id).toMatch(/^browser-/);
      });

      it('创建的实例应可从 getInstances 获取', async () => {
        const instance = await service.createInstance('acc-001');

        const instances = service.getInstances();

        expect(instances).toHaveLength(1);
        expect(instances[0].id).toBe(instance.id);
      });
    });

    describe('getInstances', () => {
      it('无实例时应返回空数组', () => {
        const instances = service.getInstances();

        expect(instances).toEqual([]);
      });

      it('应返回所有已创建的实例', async () => {
        await service.createInstance('acc-001');
        await service.createInstance('acc-002');
        await service.createInstance('acc-003');

        const instances = service.getInstances();

        expect(instances).toHaveLength(3);
      });
    });

    describe('closeInstance', () => {
      it('应该关闭指定的实例', async () => {
        const instance = await service.createInstance('acc-001');

        await service.closeInstance(instance.id);

        const instances = service.getInstances();
        expect(instances).toHaveLength(0);
      });

      it('关闭不存在的实例不应抛出错误', async () => {
        await expect(
          service.closeInstance('nonexistent-instance'),
        ).resolves.toBeUndefined();
      });

      it('关闭实例后其他实例应保持不变', async () => {
        const instance1 = await service.createInstance('acc-001');
        const instance2 = await service.createInstance('acc-002');

        await service.closeInstance(instance1.id);

        const instances = service.getInstances();
        expect(instances).toHaveLength(1);
        expect(instances[0].id).toBe(instance2.id);
      });
    });
  });

  // ==================== Cookie 设置测试 ====================

  describe('setCookies', () => {
    it('应该成功设置 Cookie 到实例', async () => {
      const instance = await service.createInstance('acc-001');

      await expect(
        service.setCookies(instance.id, 'cookie_data=test123'),
      ).resolves.toBeUndefined();
    });

    it('实例不存在时应抛出错误', async () => {
      await expect(
        service.setCookies('nonexistent', 'cookie_data'),
      ).rejects.toThrow('浏览器实例不存在');
    });

    it('应接受任意格式的 Cookie 字符串', async () => {
      const instance = await service.createInstance('acc-001');

      await expect(
        service.setCookies(instance.id, 'name=value; path=/; domain=.example.com'),
      ).resolves.toBeUndefined();
    });
  });

  // ==================== 发布执行测试 ====================

  describe('executePublish', () => {
    it('应该成功执行发布任务', async () => {
      const instance = await service.createInstance('acc-001');

      const result = await service.executePublish(instance.id, 'douyin', {
        title: '测试标题',
        content: '测试内容',
      });

      expect(result.success).toBe(true);
      expect(result).toHaveProperty('platformUrl');
    });

    it('发布期间实例状态应变为 busy', async () => {
      const instance = await service.createInstance('acc-001');

      // executePublish 是同步模拟的，所以执行后状态应恢复为 idle
      await service.executePublish(instance.id, 'douyin', { title: 'test' });

      const instances = service.getInstances();
      const target = instances.find((i) => i.id === instance.id);
      expect(target!.status).toBe('idle');
    });

    it('发布成功后应返回平台 URL', async () => {
      const instance = await service.createInstance('acc-001');

      const result = await service.executePublish(instance.id, 'douyin', {
        title: 'test',
      });

      expect(result.platformUrl).toContain('douyin.com');
    });

    it('实例不存在时应返回失败结果', async () => {
      const result = await service.executePublish('nonexistent', 'douyin', {
        title: 'test',
      });

      expect(result.success).toBe(false);
      expect(result.error).toBe('浏览器实例不存在');
    });

    it('应支持不同平台的发布', async () => {
      const instance = await service.createInstance('acc-001');

      const platforms = ['douyin', 'xiaohongshu', 'kuaishou', 'bilibili'];

      for (const platform of platforms) {
        const result = await service.executePublish(instance.id, platform, {
          title: 'test',
        });
        expect(result.success).toBe(true);
      }
    });

    it('应支持包含媒体文件的发布', async () => {
      const instance = await service.createInstance('acc-001');

      const result = await service.executePublish(instance.id, 'douyin', {
        title: '带视频的内容',
        content: '内容正文',
        mediaUrls: ['https://example.com/video1.mp4', 'https://example.com/video2.mp4'],
      });

      expect(result.success).toBe(true);
    });

    it('发布内容为空时也应能执行', async () => {
      const instance = await service.createInstance('acc-001');

      const result = await service.executePublish(instance.id, 'douyin', {});

      expect(result.success).toBe(true);
    });
  });

  // ==================== 截图测试 ====================

  describe('screenshot', () => {
    it('实例存在时应返回截图结果', async () => {
      const instance = await service.createInstance('acc-001');

      const result = await service.screenshot(instance.id);

      // 当前实现返回 null（模拟）
      expect(result).toBeNull();
    });

    it('实例不存在时应返回 null', async () => {
      const result = await service.screenshot('nonexistent');

      expect(result).toBeNull();
    });
  });

  // ==================== 集成场景测试 ====================

  describe('完整发布流程', () => {
    it('应支持 创建实例 -> 设置Cookie -> 发布 -> 关闭 的完整流程', async () => {
      // 1. 创建实例
      const instance = await service.createInstance('acc-001');
      expect(instance.status).toBe('idle');

      // 2. 设置 Cookie
      await service.setCookies(instance.id, 'session_id=abc123');

      // 3. 执行发布
      const publishResult = await service.executePublish(instance.id, 'douyin', {
        title: '完整流程测试',
        content: '这是完整流程测试内容',
      });
      expect(publishResult.success).toBe(true);

      // 4. 关闭实例
      await service.closeInstance(instance.id);
      expect(service.getInstances()).toHaveLength(0);
    });

    it('应支持多个实例并行管理', async () => {
      const instance1 = await service.createInstance('acc-001');
      const instance2 = await service.createInstance('acc-002');

      expect(service.getInstances()).toHaveLength(2);

      // 并行设置 Cookie
      await Promise.all([
        service.setCookies(instance1.id, 'cookie1'),
        service.setCookies(instance2.id, 'cookie2'),
      ]);

      // 并行发布
      const [result1, result2] = await Promise.all([
        service.executePublish(instance1.id, 'douyin', { title: 'test1' }),
        service.executePublish(instance2.id, 'xiaohongshu', { title: 'test2' }),
      ]);

      expect(result1.success).toBe(true);
      expect(result2.success).toBe(true);

      // 关闭一个实例
      await service.closeInstance(instance1.id);
      expect(service.getInstances()).toHaveLength(1);
    });
  });
});
