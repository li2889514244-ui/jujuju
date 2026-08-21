export interface IntegerEnvOptions {
  min?: number
  max?: number
}

export function parseInteger(
  value: unknown,
  fallback: number,
  options: IntegerEnvOptions = {},
): number {
  if (value === undefined || value === null) return fallback

  const raw = String(value).trim()
  if (!raw) return fallback

  const parsed = Number(raw)
  if (!Number.isInteger(parsed)) return fallback
  if (options.min !== undefined && parsed < options.min) return fallback
  if (options.max !== undefined && parsed > options.max) return fallback
  return parsed
}

export function readIntegerEnv(
  name: string,
  fallback: number,
  options: IntegerEnvOptions = {},
): number {
  return parseInteger(process.env[name], fallback, options)
}
