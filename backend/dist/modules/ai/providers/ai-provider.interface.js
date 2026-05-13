"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
exports.MockAIProvider = void 0;
exports.registerProvider = registerProvider;
exports.getProvider = getProvider;
exports.listProviders = listProviders;
class MockAIProvider {
    constructor() {
        this.name = 'mock';
    }
    async complete(request) {
        await new Promise((r) => setTimeout(r, 200));
        return {
            content: `[Mock AI] 已处理请求: "${request.prompt.slice(0, 50)}..."`,
            usage: { promptTokens: 0, completionTokens: 0, totalTokens: 0 },
            model: 'mock-v1',
        };
    }
    async isAvailable() {
        return true;
    }
}
exports.MockAIProvider = MockAIProvider;
const providers = new Map();
function registerProvider(provider) {
    providers.set(provider.name, provider);
}
function getProvider(name) {
    const key = name || process.env.AI_PROVIDER || 'mock';
    const provider = providers.get(key);
    if (!provider) {
        throw new Error(`AI provider "${key}" not found. Available: ${[...providers.keys()].join(', ')}`);
    }
    return provider;
}
function listProviders() {
    return [...providers.keys()];
}
registerProvider(new MockAIProvider());
//# sourceMappingURL=ai-provider.interface.js.map