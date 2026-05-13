import { Response } from 'express';
import { OAuthService } from './oauth.service';
export declare class OAuthController {
    private readonly oauthService;
    private readonly logger;
    constructor(oauthService: OAuthService);
    getAuthorizeUrl(platform: string, userId: string, teamId?: string): {
        url: Promise<string>;
    };
    handleCallback(code: string, state: string, platform: string, res: Response): Promise<void>;
}
