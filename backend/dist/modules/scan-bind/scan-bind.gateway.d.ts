import { OnGatewayDisconnect, OnGatewayConnection } from '@nestjs/websockets';
import { Server, Socket } from 'socket.io';
import { JwtService } from '@nestjs/jwt';
import { ScanBindService } from './scan-bind.service';
export declare class ScanBindGateway implements OnGatewayConnection, OnGatewayDisconnect {
    private scanBindService;
    private jwtService;
    server: Server;
    private readonly logger;
    constructor(scanBindService: ScanBindService, jwtService: JwtService);
    handleConnection(client: Socket): Promise<void>;
    handleDisconnect(client: Socket): void;
    handleStartScan(client: Socket, payload: {
        platform: string;
        userId?: string;
    }): Promise<void>;
    handleCancelScan(client: Socket): void;
}
