"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
const config_1 = require("@nestjs/config");
exports.default = (0, config_1.registerAs)('jwt', () => {
    const secret = process.env.JWT_SECRET;
    const refreshSecret = process.env.JWT_REFRESH_SECRET;
    if (!secret) {
        throw new Error('FATAL: JWT_SECRET environment variable is required. ' +
            'The application cannot start without a secure JWT secret.');
    }
    if (!refreshSecret) {
        throw new Error('FATAL: JWT_REFRESH_SECRET environment variable is required. ' +
            'The application cannot start without a secure JWT refresh secret.');
    }
    if (secret.length < 32) {
        throw new Error('FATAL: JWT_SECRET must be at least 32 characters long for security.');
    }
    if (refreshSecret.length < 32) {
        throw new Error('FATAL: JWT_REFRESH_SECRET must be at least 32 characters long for security.');
    }
    if (secret === refreshSecret) {
        throw new Error('FATAL: JWT_SECRET and JWT_REFRESH_SECRET must be different.');
    }
    return {
        secret,
        accessExpiresIn: process.env.JWT_ACCESS_EXPIRES || '15m',
        refreshSecret,
        refreshExpiresIn: process.env.JWT_REFRESH_EXPIRES || '7d',
    };
});
//# sourceMappingURL=jwt.config.js.map