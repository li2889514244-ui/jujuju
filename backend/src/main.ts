import { NestFactory } from '@nestjs/core';
import { ValidationPipe, Logger } from '@nestjs/common';
import { SwaggerModule, DocumentBuilder } from '@nestjs/swagger';
import * as compression from 'compression';
import helmet from 'helmet';
import { AppModule } from './app.module';
import { TransformInterceptor } from './common/interceptors/transform.interceptor';
import { LoggingInterceptor } from './common/interceptors/logging.interceptor';
import { HttpExceptionFilter } from './common/filters/http-exception.filter';

function parseCorsOrigins(originStr: string): string[] | boolean {
  if (originStr === '*') return true;
  if (originStr === 'false') return false;
  return originStr.split(',').map((o) => o.trim()).filter(Boolean);
}

async function bootstrap() {
  const app = await NestFactory.create(AppModule, {
    logger: ['error', 'warn', 'log', 'debug', 'verbose'],
  });

  const logger = new Logger('Bootstrap');

  // 全局前缀
  app.setGlobalPrefix('api/v1');

  // CORS 配置 — 从环境变量读取，支持多域名
  const corsOrigin = process.env.CORS_ORIGIN || '';
  if (!corsOrigin) {
    logger.warn('CORS_ORIGIN not set, CORS allows no cross-origin requests');
  }
  app.enableCors({
    origin: corsOrigin ? parseCorsOrigins(corsOrigin) : false,
    credentials: true,
    methods: ['GET', 'POST', 'PUT', 'PATCH', 'DELETE', 'OPTIONS'],
    allowedHeaders: ['Content-Type', 'Authorization', 'X-Requested-With', 'X-API-Version'],
    maxAge: 86400, // 24h preflight cache
  });

  // 安全头
  app.use(helmet());

  // 响应压缩
  app.use(
    compression({
      threshold: 1024, // 只压缩大于1KB的响应
      level: 6,
    }),
  );

  // 全局验证管道
  app.useGlobalPipes(
    new ValidationPipe({
      whitelist: true,
      forbidNonWhitelisted: true,
      transform: true,
      transformOptions: {
        enableImplicitConversion: true,
      },
    }),
  );

  // 全局拦截器
  app.useGlobalInterceptors(new LoggingInterceptor(), new TransformInterceptor());

  // 全局异常过滤器
  app.useGlobalFilters(new HttpExceptionFilter());

  // API 版本头
  app.use((_req: any, res: any, next: any) => {
    res.setHeader('X-API-Version', '1.0');
    next();
  });

  // Swagger 文档配置（仅非生产环境启用）
  if (process.env.NODE_ENV !== 'production') {
    const swaggerConfig = new DocumentBuilder()
      .setTitle('MatrixFlow ERP API')
      .setDescription('矩阵账号管理平台 - 企业级SaaS ERP 后端API文档')
      .setVersion('1.0')
      .addBearerAuth(
        {
          type: 'http',
          scheme: 'bearer',
          bearerFormat: 'JWT',
          name: 'Authorization',
          description: '输入 Access Token',
          in: 'header',
        },
        'access-token',
      )
      .addTag('auth', '认证相关接口')
      .addTag('users', '用户管理接口')
      .addTag('teams', '团队管理接口')
      .addTag('accounts', '平台账号管理接口')
      .addTag('content', '内容管理接口')
      .addTag('browser', '浏览器服务接口')
      .addTag('analytics', '数据分析接口')
      .addTag('ai', 'AI智能服务接口')
      .addTag('platforms', '平台管理接口')
      .addTag('health', '健康检查接口')
      .build();

    const document = SwaggerModule.createDocument(app, swaggerConfig);
    SwaggerModule.setup('api/docs', app, document, {
      swaggerOptions: {
        persistAuthorization: true,
      },
    });
  }

  const port = process.env.PORT || 3000;
  await app.listen(port);

  logger.log(`🚀 MatrixFlow ERP 后端服务已启动: http://localhost:${port}`);
  if (process.env.NODE_ENV !== 'production') {
    logger.log(`📚 Swagger 文档地址: http://localhost:${port}/api/docs`);
  }
}

bootstrap();
