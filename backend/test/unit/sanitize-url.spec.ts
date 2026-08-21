import { sanitizeUrl } from '../../src/common/utils/sanitize-url'

describe('sanitizeUrl', () => {
  it('redacts sensitive query parameters', () => {
    expect(
      sanitizeUrl('/api/v1/auth/callback?code=abc&state=xyz&next=%2Fdashboard'),
    ).toBe('/api/v1/auth/callback?code=***&state=***&next=%2Fdashboard')
  })

  it('leaves non-sensitive URLs unchanged', () => {
    expect(sanitizeUrl('/api/v1/accounts?page=1&limit=20')).toBe(
      '/api/v1/accounts?page=1&limit=20',
    )
  })
})
