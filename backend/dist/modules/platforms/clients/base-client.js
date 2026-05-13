"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
exports.BasePlatformClient = exports.PlatformApiError = void 0;
const common_1 = require("@nestjs/common");
const axios_1 = require("axios");
class PlatformApiError extends Error {
    constructor(message, code, platform, requestId, retryable = false) {
        super(message);
        this.code = code;
        this.platform = platform;
        this.requestId = requestId;
        this.retryable = retryable;
        this.name = 'PlatformApiError';
    }
}
exports.PlatformApiError = PlatformApiError;
class BasePlatformClient {
    constructor(platformKey, config) {
        this.token = null;
        this.tokenRefreshPromise = null;
        this.platformKey = platformKey;
        this.config = config;
        this.logger = new common_1.Logger(`${platformKey}Client`);
        this.rateLimitBucket = {
            tokens: config.rateLimit.maxRequests,
            lastRefill: Date.now(),
        };
        this.http = axios_1.default.create({
            baseURL: config.baseUrl,
            timeout: config.timeout,
            headers: {
                'Content-Type': 'application/json',
                'User-Agent': 'MatrixFlow-ERP/1.0',
            },
        });
        this.http.interceptors.request.use((cfg) => {
            if (this.token?.accessToken) {
                cfg.headers.Authorization = `Bearer ${this.token.accessToken}`;
            }
            return cfg;
        });
        this.http.interceptors.response.use((response) => response, async (error) => {
            if (error.response?.status === 401 && this.token?.refreshToken) {
                try {
                    await this.refreshToken();
                    return this.http.request(error.config);
                }
                catch (refreshError) {
                    this.logger.error('Token刷新失败', refreshError);
                }
            }
            return Promise.reject(error);
        });
    }
    setToken(token) {
        this.token = token;
    }
    getToken() {
        return this.token;
    }
    isTokenExpired() {
        if (!this.token)
            return true;
        return Date.now() >= this.token.expiresAt - 5 * 60 * 1000;
    }
    async ensureToken() {
        if (!this.token) {
            throw new PlatformApiError('未设置Token，请先完成OAuth授权', 401, this.platformKey);
        }
        if (this.isTokenExpired()) {
            if (this.tokenRefreshPromise) {
                return this.tokenRefreshPromise;
            }
            this.tokenRefreshPromise = this.refreshToken();
            try {
                const newToken = await this.tokenRefreshPromise;
                return newToken;
            }
            finally {
                this.tokenRefreshPromise = null;
            }
        }
        return this.token;
    }
    async checkRateLimit() {
        const now = Date.now();
        const elapsed = now - this.rateLimitBucket.lastRefill;
        const refillRate = this.config.rateLimit.maxRequests / this.config.rateLimit.windowMs;
        this.rateLimitBucket.tokens = Math.min(this.config.rateLimit.maxRequests, this.rateLimitBucket.tokens + elapsed * refillRate);
        this.rateLimitBucket.lastRefill = now;
        if (this.rateLimitBucket.tokens < 1) {
            const waitTime = (1 - this.rateLimitBucket.tokens) / refillRate;
            this.logger.debug(`限流等待: ${Math.ceil(waitTime)}ms`);
            await this.sleep(waitTime);
            this.rateLimitBucket.tokens = 1;
        }
        this.rateLimitBucket.tokens -= 1;
    }
    isRetryable(error) {
        if (error instanceof PlatformApiError) {
            return error.retryable;
        }
        if (axios_1.default.isAxiosError(error)) {
            if (!error.response)
                return true;
            const status = error.response.status;
            return status === 429 || status >= 500;
        }
        return false;
    }
    async executeWithRetry(fn, maxRetries) {
        const retries = maxRetries ?? this.config.retry.maxRetries;
        let lastError = null;
        for (let attempt = 0; attempt <= retries; attempt++) {
            try {
                await this.checkRateLimit();
                await this.ensureToken();
                return await fn();
            }
            catch (error) {
                lastError = error;
                if (attempt === retries || !this.isRetryable(error)) {
                    break;
                }
                const delay = Math.min(this.config.retry.baseDelay * Math.pow(2, attempt), this.config.retry.maxDelay);
                const jitter = delay * 0.2 * Math.random();
                this.logger.warn(`请求失败，${attempt + 1}/${retries} 次重试，等待 ${Math.ceil(delay + jitter)}ms`);
                await this.sleep(delay + jitter);
            }
        }
        throw lastError || new PlatformApiError('请求失败', 500, this.platformKey);
    }
    async get(path, params) {
        return this.executeWithRetry(async () => {
            const response = await this.http.get(path, { params });
            return this.extractData(response);
        });
    }
    async post(path, data) {
        return this.executeWithRetry(async () => {
            const response = await this.http.post(path, data);
            return this.extractData(response);
        });
    }
    extractData(response) {
        return response.data;
    }
    sleep(ms) {
        return new Promise((resolve) => setTimeout(resolve, ms));
    }
}
exports.BasePlatformClient = BasePlatformClient;
//# sourceMappingURL=base-client.js.map