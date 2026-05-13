"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
exports.AppValidationPipe = void 0;
const common_1 = require("@nestjs/common");
exports.AppValidationPipe = new common_1.ValidationPipe({
    whitelist: true,
    forbidNonWhitelisted: true,
    transform: true,
    transformOptions: {
        enableImplicitConversion: true,
    },
    exceptionFactory: (errors) => {
        const messages = errors.map((err) => {
            return Object.values(err.constraints || {}).join('; ');
        });
        return new common_1.BadRequestException(messages.join('; '));
    },
});
//# sourceMappingURL=validation.pipe.js.map