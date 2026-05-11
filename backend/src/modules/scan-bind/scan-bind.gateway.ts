import {
  WebSocketGateway,
  WebSocketServer,
  SubscribeMessage,
  ConnectedSocket,
  MessageBody,
  OnGatewayDisconnect,
  OnGatewayConnection,
} from '@nestjs/websockets';
import { Server, Socket } from 'socket.io';
import { Logger } from '@nestjs/common';
import { JwtService } from '@nestjs/jwt';
import { ScanBindService } from './scan-bind.service';

/**
 * 扫码绑定 WebSocket 网关
 * 前端连接后发起扫码请求，后端推送二维码截图和状态更新
 */
@WebSocketGateway({
  namespace: '/scan-bind',
  cors: {
    origin: process.env.CORS_ORIGINS?.split(',') || ['http://localhost:5173', 'http://localhost:3000'],
    credentials: true,
  },
})
export class ScanBindGateway implements OnGatewayConnection, OnGatewayDisconnect {
  @WebSocketServer()
  server: Server;

  private readonly logger = new Logger(ScanBindGateway.name);

  constructor(
    private scanBindService: ScanBindService,
    private jwtService: JwtService,
  ) {}

  /**
   * 连接时验证 token
   */
  async handleConnection(client: Socket) {
    try {
      const token = client.handshake.auth?.token;
      if (!token) {
        client.emit('scan-error', { error: '未提供认证信息' });
        client.disconnect();
        return;
      }
      const payload = this.jwtService.verify(token);
      // 将 userId 附加到 socket 上，后续使用
      (client as any).userId = payload.sub;
      this.logger.debug(`客户端连接: ${client.id}, userId: ${payload.sub}`);
    } catch {
      client.emit('scan-error', { error: '认证失败，请重新登录' });
      client.disconnect();
    }
  }

  handleDisconnect(client: Socket) {
    this.logger.debug(`客户端断开: ${client.id}`);
    this.scanBindService.cancelSession(client.id);
  }

  /**
   * 前端发起扫码绑定请求
   * payload: { platform: 'DOUYIN' | 'XIAOHONGSHU' | ... }
   */
  @SubscribeMessage('start-scan')
  async handleStartScan(
    @ConnectedSocket() client: Socket,
    @MessageBody() payload: { platform: string; userId?: string },
  ) {
    const userId = (client as any).userId || payload.userId;
    if (!userId) {
      client.emit('scan-error', { error: '无法识别用户身份' });
      return;
    }

    this.logger.log(`开始扫码绑定: ${payload.platform} (client: ${client.id}, user: ${userId})`);

    try {
      await this.scanBindService.startScanSession({
        clientId: client.id,
        platform: payload.platform,
        userId,
        onQrCode: (imageBase64: string) => {
          client.emit('qr-code', { image: imageBase64 });
        },
        onStatus: (status: string, message?: string) => {
          client.emit('scan-status', { status, message });
        },
        onSuccess: (accountData: any) => {
          client.emit('scan-success', accountData);
        },
        onError: (error: string) => {
          client.emit('scan-error', { error });
        },
      });
    } catch (error: any) {
      this.logger.error(`扫码绑定异常: ${error.message}`);
      client.emit('scan-error', { error: error.message });
    }
  }

  /**
   * 前端取消扫码
   */
  @SubscribeMessage('cancel-scan')
  handleCancelScan(@ConnectedSocket() client: Socket) {
    this.logger.log(`取消扫码: ${client.id}`);
    this.scanBindService.cancelSession(client.id);
  }
}
