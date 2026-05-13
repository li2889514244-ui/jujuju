import { OAuthService } from './oauth.service';
export interface CallbackResult {
    success: boolean;
    platform: string;
    accountId?: string;
    message: string;
    errorCode?: string;
}
export interface CallbackPayload {
    code: string;
    state: string;
    platform: string;
    error?: string;
    errorDescription?: string;
}
export declare class OAuthCallbackHandler {
    private readonly oauthService;
    private readonly logger;
    constructor(oauthService: OAuthService);
    handle(payload: CallbackPayload): Promise<CallbackResult>;
    handleBatch(payloads: CallbackPayload[]): Promise<CallbackResult[]>;
}
