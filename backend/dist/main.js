"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
const core_1 = require("@nestjs/core");
const common_1 = require("@nestjs/common");
const swagger_1 = require("@nestjs/swagger");
const compression = require("compression");
const express = require("express");
const helmet_1 = require("helmet");
const app_module_1 = require("./app.module");
const transform_interceptor_1 = require("./common/interceptors/transform.interceptor");
const logging_interceptor_1 = require("./common/interceptors/logging.interceptor");
const http_exception_filter_1 = require("./common/filters/http-exception.filter");

function parseCorsOrigins(originStr) {
    if (originStr === '*') return true;
    if (originStr === 'false') return false;
    return originStr.split(',').map((o) => o.trim()).filter(Boolean);
}

async function bootstrap() {
    const app = await core_1.NestFactory.create(app_module_1.AppModule, {
        logger: ['error', 'warn', 'log', 'debug', 'verbose'],
    });
    const logger = new common_1.Logger('Bootstrap');
    const isDev = process.env.NODE_ENV !== 'production';
    app.setGlobalPrefix('api/v1');

    const corsOrigin = process.env.CORS_ORIGIN || '';
    let origin;
    if (corsOrigin) {
        origin = parseCorsOrigins(corsOrigin);
    } else if (isDev) {
        origin = ['http://localhost:3000', 'http://localhost:3001', 'http://localhost:5173', 'http://localhost:8080'];
    } else {
        origin = ['https://ddddkiii.com', 'https://www.ddddkiii.com', /\.ddddkiii\.com$/];
    }

    app.enableCors({ origin, credentials: true, methods: ['GET', 'POST', 'PUT', 'PATCH', 'DELETE', 'OPTIONS'], allowedHeaders: ['Content-Type', 'Authorization', 'X-Requested-With', 'X-API-Version'], maxAge: 86400 });
    app.use((0, helmet_1.default)());
    app.use(compression({ threshold: 1024, level: 6 }));
    app.use(express.json({ limit: '10mb' }));
    app.use(express.urlencoded({ extended: true, limit: '10mb' }));
    app.useGlobalPipes(new common_1.ValidationPipe({ whitelist: true, forbidNonWhitelisted: true, transform: true, transformOptions: { enableImplicitConversion: true } }));
    app.useGlobalInterceptors(new logging_interceptor_1.LoggingInterceptor(), new transform_interceptor_1.TransformInterceptor());
    app.useGlobalFilters(new http_exception_filter_1.HttpExceptionFilter());
    app.use((_req, res, next) => { res.setHeader('X-API-Version', '1.0'); next(); });

    if (true) {
        const swaggerConfig = new swagger_1.DocumentBuilder()
            .setTitle('MatrixFlow ERP API')
            .setDescription('矩阵账号管理平台 API')
            .setVersion('1.0')
            .addBearerAuth({ type: 'http', scheme: 'bearer', bearerFormat: 'JWT', name: 'Authorization', description: 'Access Token', in: 'header' }, 'access-token')
            .build();
        const document = swagger_1.SwaggerModule.createDocument(app, swaggerConfig);
        swagger_1.SwaggerModule.setup('api/docs', app, document, { swaggerOptions: { persistAuthorization: true } });
    }

    // Serve static frontend
    const path = require('path');
    const publicDir = path.join(__dirname, '..', 'public');
    app.use(express.static(publicDir, { index: false }));
    app.use((req, res, next) => {
        if (req.path.startsWith('/api/')) return next();
        if (req.path.match(/\.[a-zA-Z]+$/)) return next();
        res.sendFile(path.join(publicDir, 'index.html'));
    });

    const port = process.env.PORT || 3000;
    await app.listen(port);
    logger.log('MatrixFlow ERP started on port ' + port);
}

bootstrap();
