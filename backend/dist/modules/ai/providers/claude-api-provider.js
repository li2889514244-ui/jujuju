"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
exports.ClaudeAPIProvider = void 0;
const common_1 = require("@nestjs/common");
const sdk_1 = require("@anthropic-ai/sdk");
class ClaudeAPIProvider {
    constructor() {
        this.name = 'claude';
        this.logger = new common_1.Logger(ClaudeAPIProvider.name);
        const apiKey = process.env.ANTHROPIC_API_KEY;
        if (!apiKey) {
            this.logger.error('ANTHROPIC_API_KEY not set, falling back to mock');
            throw new Error('ANTHROPIC_API_KEY is required for Claude provider');
        }
        this.client = new sdk_1.default({ apiKey });
        this.logger.log('Claude API provider initialized');
    }
    async complete(request) {
        const model = process.env.CLAUDE_MODEL || 'claude-sonnet-4-6';
        const msg = await this.client.messages.create({
            model,
            max_tokens: request.maxTokens || 4096,
            temperature: request.temperature ?? 0.7,
            system: request.systemPrompt || undefined,
            messages: [{ role: 'user', content: request.prompt }],
        });
        const text = msg.content
            .filter((b) => b.type === 'text')
            .map((b) => b.text)
            .join('');
        return {
            content: text,
            usage: {
                promptTokens: msg.usage?.input_tokens || 0,
                completionTokens: msg.usage?.output_tokens || 0,
                totalTokens: (msg.usage?.input_tokens || 0) + (msg.usage?.output_tokens || 0),
            },
            model,
        };
    }
    async isAvailable() {
        try {
            const apiKey = process.env.ANTHROPIC_API_KEY;
            return !!apiKey;
        }
        catch {
            return false;
        }
    }
}
exports.ClaudeAPIProvider = ClaudeAPIProvider;
//# sourceMappingURL=claude-api-provider.js.map