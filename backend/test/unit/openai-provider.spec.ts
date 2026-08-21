import { OpenAIProvider } from '../../src/modules/ai/providers/openai.provider'

describe('OpenAIProvider', () => {
  const originalEnv = {
    AI_API_KEY: process.env.AI_API_KEY,
    AI_BASE_URL: process.env.AI_BASE_URL,
    AI_MODEL: process.env.AI_MODEL,
  }
  const originalFetch = global.fetch

  const restoreEnv = () => {
    for (const [key, value] of Object.entries(originalEnv)) {
      if (value === undefined) {
        delete process.env[key]
      } else {
        process.env[key] = value
      }
    }
  }

  beforeEach(() => {
    process.env.AI_API_KEY = 'sk-test'
    process.env.AI_BASE_URL = 'https://api.example.test/v1'
    process.env.AI_MODEL = 'test-model'
  })

  afterEach(() => {
    ;(global as any).fetch = originalFetch
    restoreEnv()
  })

  it('parses successful chat completion JSON responses', async () => {
    ;(global as any).fetch = jest.fn().mockResolvedValue({
      ok: true,
      text: jest.fn().mockResolvedValue(
        JSON.stringify({
          choices: [{ message: { content: 'hello' } }],
          usage: { prompt_tokens: 3, completion_tokens: 2, total_tokens: 5 },
          model: 'remote-model',
        }),
      ),
    })

    const provider = new OpenAIProvider()

    await expect(provider.complete({ prompt: 'Hi' })).resolves.toEqual({
      content: 'hello',
      usage: {
        promptTokens: 3,
        completionTokens: 2,
        totalTokens: 5,
      },
      model: 'remote-model',
    })
  })

  it('adds context when a successful response body is not JSON', async () => {
    ;(global as any).fetch = jest.fn().mockResolvedValue({
      ok: true,
      text: jest.fn().mockResolvedValue('<html>bad gateway</html>'),
    })

    const provider = new OpenAIProvider()

    await expect(provider.complete({ prompt: 'Hi' })).rejects.toThrow(
      'OpenAI API returned invalid JSON: <html>bad gateway</html>',
    )
  })
})
