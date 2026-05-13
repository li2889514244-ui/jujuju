import { Platform } from '@prisma/client';
export interface PublishTask {
    contentId: string;
    platform: Platform;
    accountId: string;
    title: string;
    content: string;
    mediaUrls: string[];
    tags: string[];
    coverUrl?: string;
}
export interface PublishResult {
    success: boolean;
    platformUrl?: string;
    errorMsg?: string;
    platformPostId?: string;
}
export interface StoredCookie {
    name: string;
    value: string;
    domain: string;
    path: string;
    expires?: number;
    httpOnly?: boolean;
    secure?: boolean;
    sameSite?: 'Strict' | 'Lax' | 'None';
}
export declare enum LoginStatus {
    VALID = "VALID",
    EXPIRED = "EXPIRED",
    UNKNOWN = "UNKNOWN"
}
export declare abstract class BaseUploader {
    abstract readonly platform: Platform;
    abstract readonly name: string;
    abstract checkLogin(cookies: StoredCookie[]): Promise<LoginStatus>;
    abstract login(accountId: string): Promise<StoredCookie[]>;
    abstract publish(task: PublishTask, cookies: StoredCookie[]): Promise<PublishResult>;
    abstract getCreatorUrl(): string;
}
