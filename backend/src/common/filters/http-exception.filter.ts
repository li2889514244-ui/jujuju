import {
  ExceptionFilter,
  Catch,
  ArgumentsHost,
  HttpException,
  HttpStatus,
  Logger,
} from '@nestjs/common';
import { Request, Response } from 'express';

@Catch()
export class HttpExceptionFilter implements ExceptionFilter {
  private readonly logger = new Logger(HttpExceptionFilter.name);

  catch(exception: unknown, host: ArgumentsHost) {
    const ctx = host.switchToHttp();
    const response = ctx.getResponse<Response>();
    const request = ctx.getRequest<Request>();

    let status = HttpStatus.INTERNAL_SERVER_ERROR;
    let message = '服务器内部错误';

    if (exception instanceof HttpException) {
      status = exception.getStatus();
      const exceptionResponse = exception.getResponse();
      message =
        typeof exceptionResponse === 'string'
          ? exceptionResponse
          : (exceptionResponse as any).message || exception.message;
    } else if (exception instanceof Error) {
      // Handle Prisma known errors
      const errName = exception.constructor.name;
      if (errName === 'PrismaClientKnownRequestError') {
        const prismaCode = (exception as any).code;
        switch (prismaCode) {
          case 'P2002':
            status = HttpStatus.CONFLICT;
            message = '数据已存在（唯一约束冲突）';
            break;
          case 'P2025':
            status = HttpStatus.NOT_FOUND;
            message = '记录不存在';
            break;
          default:
            status = HttpStatus.BAD_REQUEST;
            message = `数据库操作失败: ${prismaCode}`;
        }
      } else if (errName === 'PrismaClientValidationError') {
        status = HttpStatus.BAD_REQUEST;
        message = '数据验证失败';
      } else {
        message = exception.message;
        this.logger.error(
          `未处理异常: ${exception.message}`,
          exception.stack,
        );
      }
    }

    // 数组消息取第一条
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
}
