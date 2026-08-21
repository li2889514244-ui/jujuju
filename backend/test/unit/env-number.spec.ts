import { parseInteger } from '../../src/config/env-number'

describe('parseInteger', () => {
  it('returns integer values inside the configured bounds', () => {
    expect(parseInteger('20', 10, { min: 1, max: 50 })).toBe(20)
    expect(parseInteger(0, 10, { min: 0 })).toBe(0)
  })

  it('falls back for empty or malformed values', () => {
    expect(parseInteger(undefined, 10)).toBe(10)
    expect(parseInteger('', 10)).toBe(10)
    expect(parseInteger('abc', 10)).toBe(10)
    expect(parseInteger('1.5', 10)).toBe(10)
  })

  it('falls back outside configured bounds', () => {
    expect(parseInteger('-1', 10, { min: 0 })).toBe(10)
    expect(parseInteger('101', 10, { max: 100 })).toBe(10)
  })
})
