import { normalizeAccountText } from '../../src/modules/accounts/dto/create-account.dto'

describe('CreateAccountDto normalization', () => {
  it('keeps normal strings and trims whitespace', () => {
    expect(normalizeAccountText('  Pixingyun  ')).toBe('Pixingyun')
  })

  it('uses object display fields instead of [object Object]', () => {
    expect(normalizeAccountText({ name: 'Temp Nick Object' })).toBe('Temp Nick Object')
    expect(normalizeAccountText({ displayName: 'Display Nick' })).toBe('Display Nick')
    expect(normalizeAccountText({ username: 'user_001' })).toBe('user_001')
  })

  it('extracts avatar urls from common object shapes', () => {
    expect(normalizeAccountText({ avatarUrl: 'https://example.com/avatar.png' })).toBe(
      'https://example.com/avatar.png',
    )
    expect(normalizeAccountText({ url: 'https://example.com/head.webp' })).toBe('https://example.com/head.webp')
  })

  it('falls back for null, undefined, and object strings', () => {
    expect(normalizeAccountText(null, 'fallback_uid')).toBe('fallback_uid')
    expect(normalizeAccountText(undefined, 'fallback_uid')).toBe('fallback_uid')
    expect(normalizeAccountText('[object Object]', 'fallback_uid')).toBe('fallback_uid')
  })

  it('converts primitive values to strings', () => {
    expect(normalizeAccountText(12345)).toBe('12345')
    expect(normalizeAccountText(false)).toBe('false')
  })
})
