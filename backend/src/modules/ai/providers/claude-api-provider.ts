import { Logger } from '@nestjs/common';
import { AIProvider, AICompletionRequest, AICompletionResponse } from './ai-provider.interface';
import Anthropic from '@anthropic-ai/sdk';

export class ClaudeAPIProvider implements AIProvider {
  readonly name = 'claude';
  private readonly logger = new Logger(ClaudeAPIProvider.name);
  private client: Anthropic;

  constructor() {
    const apiKey = process.env.ANTHROPIC_API_KEY;
    if (!apiKey) {
      this.logger.error('ANTHROPIC_API_KEY not set, falling back to mock');
      throw new Error('ANTHROPIC_API_KEY is required for Claude provider');
    }
    this.client = new Anthropic({ apiKey });
    this.logger.log('Claude API provider initialized');
  }

  async complete(request: AICompletionRequest): Promise<AICompletionResponse> {
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
      .map((b) => (b as Anthropic.TextBlock).text)
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

  async isAvailable(): Promise<boolean> {
    try {
      const apiKey = process.env.ANTHROPIC_API_KEY;
      return !!apiKey;
    } catch {
      return false;
    }
  }
}
