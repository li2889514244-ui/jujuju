import {
  ExceptionFilter,
  Catch,
  ArgumentsHost,
  HttpException,
  HttpStatus,
  Logger,
} from '@nestjs/common'
import { Request, Response } from 'express'

@Catch()
export class HttpExceptionFilter implements ExceptionFilter {
  private readonly logger = new Logger(HttpExceptionFilter.name)
  private readonly isProduction = process.env.NODE_ENV === 'production'

  catch(exception: unknown, host: ArgumentsHost) {
    const ctx = host.switchToHttp()
    const response = ctx.getResponse<Response>()
    const request = ctx.getRequest<Request>()

    let status = HttpStatus.INTERNAL_SERVER_ERROR
    let message = '服务器内部错误'
    let internalMessage = '' // 仅用于日志，不返回给客户端
    let errorName = 'UnknownError'

    if (exception instanceof HttpException) {
      status = exception.getStatus()
      errorName = exception.name
      const exceptionResponse = exception.getResponse()
      // HttpException 的 message 是开发者主动抛出的，可以安全返回
      message =
        typeof exceptionResponse === 'string'
          ? exceptionResponse
          : (exceptionResponse as any).message || exception.message
      internalMessage = exception.stack || ''
    } else if (exception instanceof Error) {
      errorName = exception.constructor.name

      // Prisma 已知错误 — 返回友好提示，不泄露 SQL 细节
      if (errorName === 'PrismaClientKnownRequestError') {
        const prismaCode = (exception as any).code
        switch (prismaCode) {
          case 'P2002':
            status = HttpStatus.CONFLICT
            message = '数据已存在（唯一约束冲突）'
            break
          case 'P2025':
            status = HttpStatus.NOT_FOUND
            message = '记录不存在'
            break
          default:
            status = HttpStatus.BAD_REQUEST
            message = `数据库操作失败: ${prismaCode}`
        }
        internalMessage = exception.message
      } else if (errorName === 'PrismaClientValidationError') {
        status = HttpStatus.BAD_REQUEST
        message = '数据验证失败'
        internalMessage = exception.message
      } else {
        // ── 关键安全修复 ──
        // 非 HttpException 的未知错误，生产环境不返回原始 message
        // 可能包含数据库连接串、文件路径、堆栈信息等敏感内容
        if (this.isProduction) {
          message = '服务器内部错误，请稍后重试'
        } else {
          message = exception.message
        }
        internalMessage = exception.stack || exception.message
      }
    }

    // 结构化错误日志
    const traceId = (request as any)['traceId'] || 'no-trace'
    const logMeta = {
      message: `${request.method} ${request.url} ${status}`,
      httpMethod: request.method,
      httpUrl: request.url,
      httpStatus: status,
      errorName,
      errorMessage: message,
      traceId,
      ...(internalMessage ? { stack: internalMessage.split('\n')[0] } : {}),
    }

    if (status >= 500 && internalMessage) {
      const stack = exception instanceof Error ? exception.stack : internalMessage
      this.logger.error(logMeta, stack)
    } else if (internalMessage) {
      this.logger.warn(logMeta)
    }

    // 数组消息取第一条
    if (Array.isArray(message)) {
      message = message[0]
    }

    response.status(status).json({
      code: status,
      message,
      data: null,
      timestamp: new Date().toISOString(),
      path: request.url,
    })
  }
}
