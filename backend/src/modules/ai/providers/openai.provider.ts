import { Injectable, Logger } from '@nestjs/common'
import {
  AIProvider,
  AICompletionRequest,
  AICompletionResponse,
  registerProvider,
} from './ai-provider.interface'

/**
 * OpenAI-compatible API Provider
 *
 * Works with any OpenAI-compatible endpoint (OpenAI, Azure, DeepSeek, etc.)
 * Configured via environment variables:
 *   AI_PROVIDER=openai
 *   AI_API_KEY=sk-xxx
 *   AI_BASE_URL=https://api.openai.com/v1  (optional, defaults to OpenAI)
 *   AI_MODEL=gpt-4o-mini  (optional, defaults to gpt-4o-mini)
 */
export class OpenAIProvider implements AIProvider {
  readonly name = 'openai'
  private readonly logger = new Logger('OpenAIProvider')

  private readonly apiKey: string
  private readonly baseUrl: string
  private readonly model: string

  constructor() {
    this.apiKey = process.env.AI_API_KEY || ''
    this.baseUrl = (process.env.AI_BASE_URL || 'https://api.openai.com/v1').replace(/\/$/, '')
    this.model = process.env.AI_MODEL || 'gpt-4o-mini'
  }

  async complete(request: AICompletionRequest): Promise<AICompletionResponse> {
    if (!this.apiKey) {
      throw new Error('AI_API_KEY is not configured')
    }

    const messages: Array<{ role: string; content: string }> = []
    if (request.systemPrompt) {
      messages.push({ role: 'system', content: request.systemPrompt })
    }
    messages.push({ role: 'user', content: request.prompt })

    const body: Record<string, unknown> = {
      model: this.model,
      messages,
      temperature: request.temperature ?? 0.8,
      max_tokens: request.maxTokens ?? 2000,
    }

    const url = `${this.baseUrl}/chat/completions`
    const controller = new AbortController()
    const timeout = setTimeout(() => controller.abort(), 30000)

    try {
      const res = await fetch(url, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          Authorization: `Bearer ${this.apiKey}`,
        },
        body: JSON.stringify(body),
        signal: controller.signal as any,
      })

      if (!res.ok) {
        const errText = await res.text().catch(() => res.statusText)
        throw new Error(`OpenAI API ${res.status}: ${errText.slice(0, 200)}`)
      }

      const data = await res.json()
      const content = data.choices?.[0]?.message?.content || ''
      const usage = data.usage

      return {
        content,
        usage: usage
          ? {
              promptTokens: usage.prompt_tokens || 0,
              completionTokens: usage.completion_tokens || 0,
              totalTokens: usage.total_tokens || 0,
            }
          : undefined,
        model: data.model || this.model,
      }
    } catch (error: any) {
      if (error.name === 'AbortError') {
        throw new Error('OpenAI API request timed out (30s)')
      }
      throw error
    } finally {
      clearTimeout(timeout)
    }
  }

  async isAvailable(): Promise<boolean> {
    return !!this.apiKey
  }
}

// Auto-register when API key is present
if (process.env.AI_API_KEY) {
  registerProvider(new OpenAIProvider())
  // eslint-disable-next-line no-console
  console.log('[AI] OpenAI provider registered')
}
