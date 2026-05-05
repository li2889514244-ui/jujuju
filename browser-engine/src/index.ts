/**
 * MatrixFlow Browser Engine - 服务入口
 *
 * 功能：
 * 1. 启动 Express HTTP 服务
 * 2. WebSocket 升级（实时通信）
 * 3. 健康检查端点
 * 4. 优雅关闭处理
 */

import http from 'http';
import { WebSocketServer, WebSocket } from 'ws';
import { app } from './app';
import { logger } from './utils/logger';
import { BrowserService } from './services/BrowserService';

const PORT = parseInt(process.env.PORT || '3001', 10);
const WS_PATH = process.env.WS_PATH || '/ws';

// 创建 HTTP 服务
const server = http.createServer(app);

// WebSocket 服务
const wss = new WebSocketServer({ noServer: true });

// 存储活跃的 WebSocket 连接
const wsClients = new Map<string, WebSocket>();

// 心跳检测间隔
const WS_HEARTBEAT_INTERVAL = 30000; // 30 秒
let heartbeatTimer: NodeJS.Timeout | null = null;

/**
 * 启动 WebSocket 心跳检测
 */
function startHeartbeat(): void {
  heartbeatTimer = setInterval(() => {
    wsClients.forEach((ws, id) => {
      if (ws.readyState === WebSocket.OPEN) {
        try {
          ws.ping();
        } catch (err) {
          logger.debug(`WebSocket ping 失败 (${id}):`, err);
          wsClients.delete(id);
        }
      } else if (ws.readyState === WebSocket.CLOSED || ws.readyState === WebSocket.CLOSING) {
        wsClients.delete(id);
      }
    });
  }, WS_HEARTBEAT_INTERVAL);

  // 防止定时器阻止进程退出
  if (heartbeatTimer.unref) {
    heartbeatTimer.unref();
  }
}

// 处理 WebSocket 升级请求
server.on('upgrade', (request, socket, head) => {
  const url = new URL(request.url || '', `http://${request.headers.host}`);

  if (url.pathname === WS_PATH) {
    wss.handleUpgrade(request, socket, head, (ws) => {
      wss.emit('connection', ws, request);
    });
  } else {
    socket.destroy();
  }
});

// WebSocket 连接处理
wss.on('connection', (ws: WebSocket, request) => {
  const clientId = `client_${Date.now()}_${Math.random().toString(36).slice(2, 9)}`;
  wsClients.set(clientId, ws);

  // 标记该连接是否存活（用于心跳检测）
  let isAlive = true;

  logger.info(`WebSocket 客户端已连接: ${clientId}`);

  // 发送欢迎消息
  ws.send(JSON.stringify({
    type: 'connected',
    clientId,
    timestamp: new Date().toISOString(),
  }));

  // 心跳响应
  ws.on('pong', () => {
    isAlive = true;
  });

  // 接收消息处理
  ws.on('message', (data: Buffer) => {
    try {
      const message = JSON.parse(data.toString());
      logger.debug(`收到 WebSocket 消息: ${JSON.stringify(message)}`);

      // 根据消息类型分发处理
      switch (message.type) {
        case 'ping':
          ws.send(JSON.stringify({ type: 'pong', timestamp: Date.now() }));
          break;
        case 'subscribe':
          // 订阅任务状态更新（未来扩展）
          ws.send(JSON.stringify({ type: 'subscribed', channel: message.channel || 'all' }));
          break;
        default:
          ws.send(JSON.stringify({
            type: 'error',
            message: `未知消息类型: ${message.type}`,
          }));
      }
    } catch (err) {
      logger.error('WebSocket 消息解析失败:', err);
      ws.send(JSON.stringify({ type: 'error', message: '消息格式错误' }));
    }
  });

  ws.on('close', (code, reason) => {
    wsClients.delete(clientId);
    logger.info(`WebSocket 客户端已断开: ${clientId}`, { code, reason: reason?.toString() });
  });

  ws.on('error', (err) => {
    logger.error(`WebSocket 错误 (${clientId}):`, err);
    wsClients.delete(clientId);
  });
});

// WebSocket 服务器错误处理
wss.on('error', (err) => {
  logger.error('WebSocket 服务器错误:', err);
});

/**
 * 广播消息给所有 WebSocket 客户端
 */
export function broadcastMessage(message: object): void {
  const payload = JSON.stringify(message);
  wsClients.forEach((ws, id) => {
    if (ws.readyState === WebSocket.OPEN) {
      try {
        ws.send(payload);
      } catch (err) {
        logger.error(`广播消息失败 (${id}):`, err);
        wsClients.delete(id);
      }
    }
  });
}

/**
 * 获取 WebSocket 连接数
 */
export function getWsClientCount(): number {
  return wsClients.size;
}

/**
 * 优雅关闭
 */
async function gracefulShutdown(signal: string): Promise<void> {
  logger.info(`收到 ${signal} 信号，开始优雅关闭...`);

  // 停止心跳检测
  if (heartbeatTimer) {
    clearInterval(heartbeatTimer);
    heartbeatTimer = null;
  }

  // 停止接受新连接
  server.close(async () => {
    logger.info('HTTP 服务已停止');

    // 关闭所有 WebSocket 连接
    wsClients.forEach((ws, id) => {
      try {
        ws.close(1001, '服务关闭');
      } catch (err) {
        logger.debug(`关闭 WebSocket 连接失败 (${id}):`, err);
      }
    });
    wsClients.clear();

    // 关闭 WebSocket 服务器
    wss.close(() => {
      logger.info('WebSocket 服务器已关闭');
    });

    // 关闭所有浏览器实例
    try {
      const browserService = BrowserService.getInstance();
      await browserService.closeAll();
      logger.info('所有浏览器实例已关闭');
    } catch (err) {
      logger.error('关闭浏览器实例失败:', err);
    }

    logger.info('优雅关闭完成');
    process.exit(0);
  });

  // 超时强制退出
  setTimeout(() => {
    logger.error('优雅关闭超时，强制退出');
    process.exit(1);
  }, 15000);
}

// 注册信号处理
process.on('SIGTERM', () => gracefulShutdown('SIGTERM'));
process.on('SIGINT', () => gracefulShutdown('SIGINT'));

// 未捕获异常处理
process.on('uncaughtException', (err) => {
  logger.error('未捕获的异常:', err);
  gracefulShutdown('uncaughtException');
});

process.on('unhandledRejection', (reason) => {
  logger.error('未处理的 Promise 拒绝:', reason);
});

// 启动心跳检测
startHeartbeat();

// 启动服务
server.listen(PORT, () => {
  logger.info(`🚀 Browser Engine 服务已启动`);
  logger.info(`   HTTP: http://0.0.0.0:${PORT}`);
  logger.info(`   WebSocket: ws://0.0.0.0:${PORT}${WS_PATH}`);
  logger.info(`   健康检查: http://0.0.0.0:${PORT}/health`);
});

export { server, wss };
