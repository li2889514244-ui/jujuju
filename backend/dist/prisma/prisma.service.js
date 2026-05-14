"use strict";
var __decorate = (this && this.__decorate) || function (decorators, target, key, desc) {
    var c = arguments.length, r = c < 3 ? target : desc === null ? desc = Object.getOwnPropertyDescriptor(target, key) : desc, d;
    if (typeof Reflect === "object" && typeof Reflect.decorate === "function") r = Reflect.decorate(decorators, target, key, desc);
    else for (var i = decorators.length - 1; i >= 0; i--) if (d = decorators[i]) r = (c < 3 ? d(r) : c > 3 ? d(target, key, r) : d(target, key)) || r;
    return c > 3 && r && Object.defineProperty(target, key, r), r;
};
var __metadata = (this && this.__metadata) || function (k, v) {
    if (typeof Reflect === "object" && typeof Reflect.metadata === "function") return Reflect.metadata(k, v);
};
var PrismaService_1;
Object.defineProperty(exports, "__esModule", { value: true });
exports.PrismaService = void 0;
const common_1 = require("@nestjs/common");
const client_1 = require("@prisma/client");
const JSON_FIELDS_BY_MODEL = {
    Account: ['proxyConfig', 'metadata'],
    Post: ['mediaUrls', 'tags', 'metadata'],
    AuditLog: ['detail'],
    Asset: ['tags'],
    Notification: ['metadata'],
};
function serializeJsonFields(modelName, data) {
    if (!modelName || !data || typeof data !== 'object')
        return;
    const fields = JSON_FIELDS_BY_MODEL[modelName];
    if (!fields)
        return;
    for (const f of fields) {
        if (data[f] !== undefined && data[f] !== null && typeof data[f] !== 'string') {
            data[f] = JSON.stringify(data[f]);
        }
    }
}
function deserializeJsonFields(modelName, row) {
    if (!modelName || !row || typeof row !== 'object')
        return;
    const fields = JSON_FIELDS_BY_MODEL[modelName];
    if (!fields)
        return;
    for (const f of fields) {
        if (typeof row[f] === 'string' && row[f].length > 0) {
            try {
                row[f] = JSON.parse(row[f]);
            }
            catch {
            }
        }
    }
}
let PrismaService = PrismaService_1 = class PrismaService extends client_1.PrismaClient {
    constructor() {
        super({
            log: [
                { emit: 'event', level: 'query' },
                { emit: 'stdout', level: 'error' },
                { emit: 'stdout', level: 'warn' },
            ],
        });
        this.logger = new common_1.Logger(PrismaService_1.name);
        this.$use(async (params, next) => {
            if (['create', 'update', 'upsert'].includes(params.action)) {
                if (params.args?.data)
                    serializeJsonFields(params.model, params.args.data);
                if (params.args?.create)
                    serializeJsonFields(params.model, params.args.create);
                if (params.args?.update)
                    serializeJsonFields(params.model, params.args.update);
            }
            if (params.action === 'createMany' && params.args?.data) {
                const arr = Array.isArray(params.args.data) ? params.args.data : [params.args.data];
                arr.forEach((d) => serializeJsonFields(params.model, d));
            }
            const result = await next(params);
            if (Array.isArray(result)) {
                result.forEach((r) => deserializeJsonFields(params.model, r));
            }
            else {
                deserializeJsonFields(params.model, result);
            }
            return result;
        });
    }
    async onModuleInit() {
        try {
            await this.$connect();
            this.logger.log('Database connected successfully');
        }
        catch (error) {
            this.logger.error(`Failed to connect to database: ${error.message}`);
            throw error;
        }
    }
    async onModuleDestroy() {
        await this.$disconnect();
        this.logger.log('Database disconnected');
    }
    async cleanDatabase() {
        if (process.env.NODE_ENV === 'production') {
            throw new Error('Cannot clean database in production');
        }
        const modelNames = client_1.PrismaClient.prototype.constructor.name === 'PrismaClient'
            ? this._dmmf?.datamodel?.models?.map((m) => m.name) ?? []
            : [];
        const models = modelNames.length > 0
            ? modelNames
            : ['AuditLog', 'PostStats', 'DailyStats', 'Post', 'Account', 'Team', 'User', 'Organization'];
        for (const modelName of models) {
            const modelKey = modelName.charAt(0).toLowerCase() + modelName.slice(1);
            const model = this[modelKey];
            if (model?.deleteMany) {
                await model.deleteMany();
            }
        }
    }
};
exports.PrismaService = PrismaService;
exports.PrismaService = PrismaService = PrismaService_1 = __decorate([
    (0, common_1.Injectable)(),
    __metadata("design:paramtypes", [])
], PrismaService);
//# sourceMappingURL=prisma.service.js.map