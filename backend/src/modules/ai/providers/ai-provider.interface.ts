// AI Provider Strategy Pattern
// Supports pluggable AI backends: Mock, OpenAI, Azure, etc.

export interface AICompletionRequest {
  prompt: string;
  systemPrompt?: string;
  temperature?: number;
  maxTokens?: number;
}

export interface AICompletionResponse {
  content: string;
  usage?: {
    promptTokens: number;
    completionTokens: number;
    totalTokens: number;
  };
  model: string;
}

export interface AIProvider {
  readonly name: string;
  complete(request: AICompletionRequest): Promise<AICompletionResponse>;
  isAvailable(): Promise<boolean>;
}

// ===== Mock Provider =====
// Works without any external API. Returns sensible defaults.

export class MockAIProvider implements AIProvider {
  readonly name = 'mock';

  async complete(request: AICompletionRequest): Promise<AICompletionResponse> {
    // Simulate latency
    await new Promise((r) => setTimeout(r, 200));

    return {
      content: `[Mock AI] 已处理请求: "${request.prompt.slice(0, 50)}..."`,
      usage: { promptTokens: 0, completionTokens: 0, totalTokens: 0 },
      model: 'mock-v1',
    };
  }

  async isAvailable(): Promise<boolean> {
    return true;
  }
}

// ===== Provider Registry =====

const providers = new Map<string, AIProvider>();

export function registerProvider(provider: AIProvider): void {
  providers.set(provider.name, provider);
}

export function getProvider(name?: string): AIProvider {
  const key = name || process.env.AI_PROVIDER || 'mock';
  const provider = providers.get(key);
  if (!provider) {
    throw new Error(`AI provider "${key}" not found. Available: ${[...providers.keys()].join(', ')}`);
  }
  return provider;
}

export function listProviders(): string[] {
  return [...providers.keys()];
}

// Register mock by default
registerProvider(new MockAIProvider());
