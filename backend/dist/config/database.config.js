"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
const config_1 = require("@nestjs/config");
exports.default = (0, config_1.registerAs)('database', () => {
    const url = process.env.DATABASE_URL;
    if (!url) {
        throw new Error('FATAL: DATABASE_URL environment variable is required. ' +
            'Set it in Railway service variables.');
    }
    return { url };
});
//# sourceMappingURL=database.config.js.map