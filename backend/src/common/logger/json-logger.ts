import { LoggerService, LogLevel } from '@nestjs/common'

/**
 * 轻量级 JSON 结构化日志服务
 *
 * 生产环境：每条日志输出为一行 JSON（stdout/stderr），便于 ELK / Loki 等日志系统采集解析。
 * 开发环境：保持彩色可读的控制台输出，与 NestJS 默认风格一致。
 *
 * 所有通过 `new Logger('Context')` 创建的实例都会自动路由到此服务，
 * 无需修改业务代码中已有的 50+ 处 Logger 调用。
 */
export class JsonLogger implements LoggerService {
  private readonly isProduction: boolean
  private readonly logLevels: LogLevel[]

  // ANSI 颜色（仅开发环境）
  private static readonly COLORS: Record<string, string> = {
    log: '\x1b[32m', // green
    error: '\x1b[31m', // red
    warn: '\x1b[33m', // yellow
    debug: '\x1b[36m', // cyan
    verbose: '\x1b[35m', // magenta
    reset: '\x1b[0m',
  }

  private static readonly LEVEL_PRIORITY: Record<string, string> = {
    error: 'ERROR',
    warn: 'WARN ',
    log: 'INFO ',
    debug: 'DEBUG',
    verbose: 'TRACE',
  }

  constructor(options?: { logLevels?: LogLevel[]; isProduction?: boolean }) {
    this.isProduction = options?.isProduction ?? process.env.NODE_ENV === 'production'
    this.logLevels = options?.logLevels ?? ['error', 'warn', 'log', 'debug', 'verbose']
  }

  // ── LoggerService 接口实现 ──────────────────────────────────────────

  log(message: any, ...optionalParams: any[]): void {
    this.write('log', message, optionalParams)
  }

  error(message: any, ...optionalParams: any[]): void {
    this.write('error', message, optionalParams)
  }

  warn(message: any, ...optionalParams: any[]): void {
    this.write('warn', message, optionalParams)
  }

  debug(message: any, ...optionalParams: any[]): void {
    this.write('debug', message, optionalParams)
  }

  verbose(message: any, ...optionalParams: any[]): void {
    this.write('verbose', message, optionalParams)
  }

  fatal(message: any, ...optionalParams: any[]): void {
    this.write('error', message, optionalParams)
  }

  // ── 核心写入逻辑 ─────────────────────────────────────────────────────

  /**
   * 解析 optionalParams，提取 context、stack 和额外元数据。
   *
   * NestJS Logger 传递参数的规则：
   * - `new Logger('Ctx').log('msg')` → log('msg', 'Ctx')
   * - `new Logger('Ctx').error('msg', 'stack')` → error('msg', 'stack', 'Ctx')
   * - 直接调用 log('msg', 'Ctx', { extra: true }) → log('msg', 'Ctx', { extra: true })
   */
  private parseParams(optionalParams: any[]): {
    context: string
    stack?: string
    meta: Record<string, any>
  } {
    let context = 'Application'
    let stack: string | undefined
    const meta: Record<string, any> = {}

    for (const param of optionalParams) {
      if (typeof param === 'string') {
        // 第一个字符串如果看起来像堆栈（包含 "at " 或 "\n"），当作 stack
        if (!stack && (param.includes('\n') || param.startsWith('at '))) {
          stack = param
        } else if (context === 'Application') {
          context = param
        }
      } else if (param && typeof param === 'object' && !Array.isArray(param)) {
        Object.assign(meta, param)
      }
    }

    return { context, stack, meta }
  }

  private write(level: string, message: any, optionalParams: any[]): void {
    if (!this.logLevels.includes(level as LogLevel)) return

    const { context, stack, meta } = this.parseParams(optionalParams)
    const timestamp = new Date().toISOString()

    // 如果 message 本身是对象，提取字段到 meta 中
    let msgStr: string
    if (message && typeof message === 'object' && !Array.isArray(message)) {
      const msgObj = message as Record<string, any>
      // 如果对象有 message 字段，用作日志消息
      if (msgObj.message) {
        msgStr = String(msgObj.message)
        // 其余字段合并到 meta
        for (const [k, v] of Object.entries(msgObj)) {
          if (k !== 'message') meta[k] = v
        }
      } else {
        msgStr = JSON.stringify(msgObj)
      }
    } else {
      msgStr = String(message)
    }

    if (stack) meta.stack = stack

    if (this.isProduction) {
      this.writeJson(level, timestamp, context, msgStr, meta)
    } else {
      this.writePretty(level, timestamp, context, msgStr, meta)
    }
  }

  // ── 生产环境：JSON 行 ────────────────────────────────────────────────

  private writeJson(
    level: string,
    timestamp: string,
    context: string,
    message: string,
    meta: Record<string, any>,
  ): void {
    const entry: Record<string, any> = {
      '@timestamp': timestamp,
      level: level === 'log' ? 'info' : level,
      context,
      message,
    }

    // 合并额外元数据
    for (const [k, v] of Object.entries(meta)) {
      if (!(k in entry)) entry[k] = v
    }

    const line = JSON.stringify(entry)

    if (level === 'error' || level === 'fatal') {
      process.stderr.write(line + '\n')
    } else {
      process.stdout.write(line + '\n')
    }
  }

  // ── 开发环境：彩色控制台 ─────────────────────────────────────────────

  private writePretty(
    level: string,
    timestamp: string,
    context: string,
    message: string,
    meta: Record<string, any>,
  ): void {
    const color = JsonLogger.COLORS[level] || ''
    const reset = JsonLogger.COLORS.reset
    const levelLabel = JsonLogger.LEVEL_PRIORITY[level] || level.toUpperCase()

    const metaKeys = Object.keys(meta)
    const metaStr =
      metaKeys.length > 0
        ? ' ' +
          metaKeys
            .map((k) => {
              const v = meta[k]
              const vStr = typeof v === 'object' ? JSON.stringify(v) : String(v)
              return `${color}${k}${reset}=${vStr}`
            })
            .join(' ')
        : ''

    const pid = process.pid
    const output = `${color}[Nest] ${pid}  - ${timestamp}\t${levelLabel} [${context}] ${message}${metaStr}${reset}`

    if (level === 'error' || level === 'fatal') {
      process.stderr.write(output + '\n')
    } else {
      process.stdout.write(output + '\n')
    }
  }
}
