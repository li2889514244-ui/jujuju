"use strict";
var __decorate = (this && this.__decorate) || function (decorators, target, key, desc) {
    var c = arguments.length, r = c < 3 ? target : desc === null ? desc = Object.getOwnPropertyDescriptor(target, key) : desc, d;
    if (typeof Reflect === "object" && typeof Reflect.decorate === "function") r = Reflect.decorate(decorators, target, key, desc);
    else for (var i = decorators.length - 1; i >= 0; i--) if (d = decorators[i]) r = (c < 3 ? d(r) : c > 3 ? d(target, key, r) : d(target, key)) || r;
    return c > 3 && r && Object.defineProperty(target, key, r), r;
};
Object.defineProperty(exports, "__esModule", { value: true });
exports.LoggingInterceptor = void 0;
const common_1 = require("@nestjs/common");
const operators_1 = require("rxjs/operators");
const rxjs_1 = require("rxjs");
const SENSITIVE_QUERY_KEYS = ['token', 'code', 'state', 'password', 'secret', 'key', 'authorization'];
function sanitizeUrl(url) {
    try {
        const [path, queryString] = url.split('?');
        if (!queryString)
            return url;
        const params = new URLSearchParams(queryString);
        for (const key of params.keys()) {
            if (SENSITIVE_QUERY_KEYS.includes(key.toLowerCase())) {
                params.set(key, '***');
            }
        }
        return `${path}?${params.toString()}`;
    }
    catch {
        return url;
    }
}
let LoggingInterceptor = class LoggingInterceptor {
    constructor() {
        this.logger = new common_1.Logger('HTTP');
    }
    intercept(context, next) {
        const request = context.switchToHttp().getRequest();
        const { method, ip } = request;
        const url = sanitizeUrl(request.url);
        const userAgent = request.get('user-agent') || '';
        const userId = request.user?.id || 'anonymous';
        const traceId = request['traceId'] || 'no-trace';
        const now = Date.now();
        return next.handle().pipe((0, operators_1.tap)(() => {
            const response = context.switchToHttp().getResponse();
            const { statusCode } = response;
            const contentLength = response.get('content-length');
            this.logger.log(`[${traceId}] ${method} ${url} ${statusCode} ${contentLength || 0}B - ${Date.now() - now}ms - ${ip} - user:${userId} - ${userAgent}`);
        }), (0, operators_1.catchError)((error) => {
            const statusCode = error.getStatus?.() || 500;
            this.logger.warn(`[${traceId}] ${method} ${url} ${statusCode} ERROR - ${Date.now() - now}ms - ${ip} - user:${userId} - ${error.message}`);
            return (0, rxjs_1.throwError)(() => error);
        }));
    }
};
exports.LoggingInterceptor = LoggingInterceptor;
exports.LoggingInterceptor = LoggingInterceptor = __decorate([
    (0, common_1.Injectable)()
], LoggingInterceptor);
//# sourceMappingURL=logging.interceptor.js.map