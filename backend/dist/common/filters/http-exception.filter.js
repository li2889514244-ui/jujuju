"use strict";
var __decorate = (this && this.__decorate) || function (decorators, target, key, desc) {
    var c = arguments.length, r = c < 3 ? target : desc === null ? desc = Object.getOwnPropertyDescriptor(target, key) : desc, d;
    if (typeof Reflect === "object" && typeof Reflect.decorate === "function") r = Reflect.decorate(decorators, target, key, desc);
    else for (var i = decorators.length - 1; i >= 0; i--) if (d = decorators[i]) r = (c < 3 ? d(r) : c > 3 ? d(target, key, r) : d(target, key)) || r;
    return c > 3 && r && Object.defineProperty(target, key, r), r;
};
var HttpExceptionFilter_1;
Object.defineProperty(exports, "__esModule", { value: true });
exports.HttpExceptionFilter = void 0;
const common_1 = require("@nestjs/common");
let HttpExceptionFilter = HttpExceptionFilter_1 = class HttpExceptionFilter {
    constructor() {
        this.logger = new common_1.Logger(HttpExceptionFilter_1.name);
    }
    catch(exception, host) {
        const ctx = host.switchToHttp();
        const response = ctx.getResponse();
        const request = ctx.getRequest();
        let status = common_1.HttpStatus.INTERNAL_SERVER_ERROR;
        let message = '服务器内部错误';
        if (exception instanceof common_1.HttpException) {
            status = exception.getStatus();
            const exceptionResponse = exception.getResponse();
            message =
                typeof exceptionResponse === 'string'
                    ? exceptionResponse
                    : exceptionResponse.message || exception.message;
        }
        else if (exception instanceof Error) {
            const errName = exception.constructor.name;
            if (errName === 'PrismaClientKnownRequestError') {
                const prismaCode = exception.code;
                switch (prismaCode) {
                    case 'P2002':
                        status = common_1.HttpStatus.CONFLICT;
                        message = '数据已存在（唯一约束冲突）';
                        break;
                    case 'P2025':
                        status = common_1.HttpStatus.NOT_FOUND;
                        message = '记录不存在';
                        break;
                    default:
                        status = common_1.HttpStatus.BAD_REQUEST;
                        message = `数据库操作失败: ${prismaCode}`;
                }
            }
            else if (errName === 'PrismaClientValidationError') {
                status = common_1.HttpStatus.BAD_REQUEST;
                message = '数据验证失败';
            }
            else {
                message = exception.message;
                this.logger.error(`未处理异常: ${exception.message}`, exception.stack);
            }
        }
        if (Array.isArray(message)) {
            message = message[0];
        }
        response.status(status).json({
            code: status,
            message,
            data: null,
            timestamp: new Date().toISOString(),
            path: request.url,
        });
    }
};
exports.HttpExceptionFilter = HttpExceptionFilter;
exports.HttpExceptionFilter = HttpExceptionFilter = HttpExceptionFilter_1 = __decorate([
    (0, common_1.Catch)()
], HttpExceptionFilter);
//# sourceMappingURL=http-exception.filter.js.map