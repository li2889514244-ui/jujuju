import { SetMetadata } from '@nestjs/common'

/**
 * Marks a route as requiring service-level token authentication
 * (instead of user JWT). Used for local companion / worker endpoints
 * that don't have a user session but need secure access.
 *
 * The token is validated against the SERVICE_TOKEN environment variable.
 */
export const SERVICE_AUTH_KEY = 'serviceAuth'
export const ServiceAuth = () => SetMetadata(SERVICE_AUTH_KEY, true)
