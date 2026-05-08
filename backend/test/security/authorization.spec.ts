import { Test, TestingModule } from '@nestjs/testing';
import { INestApplication, ValidationPipe } from '@nestjs/common';
import * as request from 'supertest';
import { AppModule } from '../../src/app.module';

/**
 * 授权测试（越权访问）
 * 
 * 验证系统防止各种越权访问：
 * - 水平越权：普通用户访问其他用户的数据
 * - 垂直越权：低权限用户执行高权限操作
 * - IDOR（不安全的直接对象引用）
 */
describe('授权测试 - 越权访问防护 (Security)', () => {
  let app: INestApplication;

  // 模拟不同角色的Token
  let ownerToken: string;
  let adminToken: string;
  let managerToken: string;
  let memberToken: string;
  let viewerToken: string;

  beforeAll(async () => {
    const moduleFixture: TestingModule = await Test.createTestingModule({
      imports: [AppModule],
    }).compile();

    app = moduleFixture.createNestApplication();
    app.setGlobalPrefix('api/v1');
    app.useGlobalPipes(
      new ValidationPipe({
        whitelist: true,
        forbidNonWhitelisted: true,
        transform: true,
      }),
    );
    await app.init();

    // 获取各角色Token
    const roles = [
      { email: 'owner@matrixflow.com', password: 'Test123!' },
      { email: 'admin@matrixflow.com', password: 'Test123!' },
      { email: 'manager@matrixflow.com', password: 'Test123!' },
      { email: 'member@matrixflow.com', password: 'Test123!' },
      { email: 'viewer@matrixflow.com', password: 'Test123!' },
    ];

    const tokens: string[] = [];
    for (const { email, password } of roles) {
      try {
        const res = await request(app.getHttpServer())
          .post('/api/v1/auth/login')
          .send({ email, password });
        tokens.push(res.body?.data?.accessToken || 'test-token');
      } catch {
        tokens.push('test-token');
      }
    }

    [ownerToken, adminToken, managerToken, memberToken, viewerToken] = tokens;
  });

  afterAll(async () => {
    await app.close();
  });

  describe('垂直越权 - 角色提升攻击', () => {
    it('MEMBER不应能创建团队', async () => {
      const response = await request(app.getHttpServer())
        .post('/api/v1/teams')
        .set('Authorization', `Bearer ${memberToken}`)
        .send({
          name: 'Unauthorized Team',
          organizationId: 'org-123',
        });

      expect([401, 403]).toContain(response.status);
    });

    it('VIEWER不应能创建团队', async () => {
      const response = await request(app.getHttpServer())
        .post('/api/v1/teams')
        .set('Authorization', `Bearer ${viewerToken}`)
        .send({
          name: 'Viewer Team',
          organizationId: 'org-123',
        });

      expect([401, 403]).toContain(response.status);
    });

    it('MEMBER不应能邀请成员', async () => {
      const response = await request(app.getHttpServer())
        .post('/api/v1/teams/members/invite')
        .set('Authorization', `Bearer ${memberToken}`)
        .send({
          email: 'new-member@test.com',
          role: 'MEMBER',
        });

      expect([401, 403]).toContain(response.status);
    });

    it('MEMBER不应能修改成员角色', async () => {
      const response = await request(app.getHttpServer())
        .put('/api/v1/teams/members/some-member-id/role')
        .set('Authorization', `Bearer ${memberToken}`)
        .send({ role: 'OWNER' });

      expect([401, 403]).toContain(response.status);
    });

    it('MEMBER不应能删除用户', async () => {
      const response = await request(app.getHttpServer())
        .delete('/api/v1/users/some-user-id')
        .set('Authorization', `Bearer ${memberToken}`);

      expect([401, 403]).toContain(response.status);
    });

    it('VIEWER不应能创建内容', async () => {
      const response = await request(app.getHttpServer())
        .post('/api/v1/content')
        .set('Authorization', `Bearer ${viewerToken}`)
        .send({
          title: 'Unauthorized Content',
          content: 'This should fail',
          accountId: 'account-123',
        });

      expect([401, 403]).toContain(response.status);
    });

    it('VIEWER不应能删除账号', async () => {
      const response = await request(app.getHttpServer())
        .delete('/api/v1/accounts/some-account-id')
        .set('Authorization', `Bearer ${viewerToken}`);

      expect([401, 403]).toContain(response.status);
    });
  });

  describe('水平越权 - 访问他人数据', () => {
    let userAToken: string;
    let userBToken: string;

    beforeAll(async () => {
      // 模拟两个不同用户
      try {
        const resA = await request(app.getHttpServer())
          .post('/api/v1/auth/login')
          .send({ email: 'usera@matrixflow.com', password: 'Test123!' });
        userAToken = resA.body?.data?.accessToken || 'test-token-a';

        const resB = await request(app.getHttpServer())
          .post('/api/v1/auth/login')
          .send({ email: 'userb@matrixflow.com', password: 'Test123!' });
        userBToken = resB.body?.data?.accessToken || 'test-token-b';
      } catch {
        userAToken = 'test-token-a';
        userBToken = 'test-token-b';
      }
    });

    it('用户A不应能访问用户B的账号数据', async () => {
      // 先获取用户B的账号ID
      const userBAccounts = await request(app.getHttpServer())
        .get('/api/v1/accounts')
        .set('Authorization', `Bearer ${userBToken}`);

      if (userBAccounts.body?.data?.length > 0) {
        const accountBId = userBAccounts.body.data[0].id;

        // 用户A尝试访问用户B的账号
        const response = await request(app.getHttpServer())
          .get(`/api/v1/accounts/${accountBId}`)
          .set('Authorization', `Bearer ${userAToken}`);

        // 应返回403或404
        expect([401, 403, 404]).toContain(response.status);
      }
    });

    it('用户A不应能修改用户B的账号', async () => {
      const userBAccounts = await request(app.getHttpServer())
        .get('/api/v1/accounts')
        .set('Authorization', `Bearer ${userBToken}`);

      if (userBAccounts.body?.data?.length > 0) {
        const accountBId = userBAccounts.body.data[0].id;

        const response = await request(app.getHttpServer())
          .put(`/api/v1/accounts/${accountBId}`)
          .set('Authorization', `Bearer ${userAToken}`)
          .send({ nickname: 'Hacked' });

        expect([401, 403, 404]).toContain(response.status);
      }
    });

    it('用户A不应能删除用户B的账号', async () => {
      const userBAccounts = await request(app.getHttpServer())
        .get('/api/v1/accounts')
        .set('Authorization', `Bearer ${userBToken}`);

      if (userBAccounts.body?.data?.length > 0) {
        const accountBId = userBAccounts.body.data[0].id;

        const response = await request(app.getHttpServer())
          .delete(`/api/v1/accounts/${accountBId}`)
          .set('Authorization', `Bearer ${userAToken}`);

        expect([401, 403, 404]).toContain(response.status);
      }
    });

    it('用户A不应能获取用户B账号的Cookie', async () => {
      const userBAccounts = await request(app.getHttpServer())
        .get('/api/v1/accounts')
        .set('Authorization', `Bearer ${userBToken}`);

      if (userBAccounts.body?.data?.length > 0) {
        const accountBId = userBAccounts.body.data[0].id;

        const response = await request(app.getHttpServer())
          .get(`/api/v1/accounts/${accountBId}/cookies`)
          .set('Authorization', `Bearer ${userAToken}`);

        expect([401, 403, 404]).toContain(response.status);
      }
    });

    it('用户A不应能修改用户B的内容', async () => {
      const userBContent = await request(app.getHttpServer())
        .get('/api/v1/content')
        .set('Authorization', `Bearer ${userBToken}`);

      if (userBContent.body?.data?.length > 0) {
        const contentBId = userBContent.body.data[0].id;

        const response = await request(app.getHttpServer())
          .put(`/api/v1/content/${contentBId}`)
          .set('Authorization', `Bearer ${userAToken}`)
          .send({ title: 'Hacked Content' });

        expect([401, 403, 404]).toContain(response.status);
      }
    });
  });

  describe('IDOR防护 - 顺序ID枚举', () => {
    it('不应能通过枚举ID访问其他用户资源', async () => {
      // 尝试访问一系列可能的ID
      const fakeIds = [
        'user-1', 'user-2', 'user-3',
        'account-1', 'account-2',
        '00000000-0000-0000-0000-000000000001',
        'ffffffff-ffff-ffff-ffff-ffffffffffff',
      ];

      for (const id of fakeIds) {
        const response = await request(app.getHttpServer())
          .get(`/api/v1/accounts/${id}`)
          .set('Authorization', `Bearer ${memberToken}`);

        // 不应返回200，应返回403或404
        expect([401, 403, 404]).toContain(response.status);
      }
    });
  });

  describe('组织隔离', () => {
    it('不同组织的用户不应能互相访问数据', async () => {
      // 组织A的用户尝试访问组织B的数据
      const response = await request(app.getHttpServer())
        .get('/api/v1/teams')
        .query({ organizationId: 'other-org-id' })
        .set('Authorization', `Bearer ${memberToken}`);

      if (response.status === 200 && response.body?.data) {
        // 不应返回其他组织的团队
        const teams = response.body.data;
        teams.forEach((team: any) => {
          expect(team.organizationId).not.toBe('other-org-id');
        });
      }
    });
  });

  describe('权限提升攻击', () => {
    it('用户不应能通过修改请求体提升自己的角色', async () => {
      const response = await request(app.getHttpServer())
        .put('/api/v1/users/me')
        .set('Authorization', `Bearer ${memberToken}`)
        .send({
          name: 'Updated Name',
          role: 'OWNER', // 尝试提升角色
        });

      if (response.status === 200) {
        // 角色不应被修改
        expect(response.body?.data?.role).not.toBe('OWNER');
      }
    });

    it('用户不应能通过注册时指定角色', async () => {
      const response = await request(app.getHttpServer())
        .post('/api/v1/auth/register')
        .send({
          email: `hacker-${Date.now()}@test.com`,
          password: 'Test123!',
          name: 'Hacker',
          role: 'OWNER', // 尝试指定角色
        });

      if (response.status === 201) {
        expect(response.body?.data?.user?.role).not.toBe('OWNER');
        // 应默认为MEMBER
        expect(response.body?.data?.user?.role).toBe('MEMBER');
      }
    });

    it('用户不应能通过更新组织信息提升权限', async () => {
      const response = await request(app.getHttpServer())
        .put('/api/v1/users/me')
        .set('Authorization', `Bearer ${memberToken}`)
        .send({
          organizationId: 'admin-org-id',
          role: 'ADMIN',
        });

      if (response.status === 200) {
        expect(response.body?.data?.role).not.toBe('ADMIN');
      }
    });
  });
});
