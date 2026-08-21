import {
  Injectable,
  CanActivate,
  ExecutionContext,
  UnauthorizedException,
  Logger,
} from '@nestjs/common'
import { Reflector } from '@nestjs/core'
import { ConfigService } from '@nestjs/config'
import { SERVICE_AUTH_KEY } from '../../../common/decorators/service-auth.decorator'

/**
 * Guard that validates service-level tokens for companion/worker endpoints.
 *
 * Routes marked with @ServiceAuth() will be validated against the
 * SERVICE_TOKEN environment variable. The token can be provided via:
 *   - Header:  X-Service-Token: <token>
 *   - Query:   ?service_token=<token>
 *
 * This guard runs alongside JwtAuthGuard. JwtAuthGuard skips routes
 * marked with @ServiceAuth(), and this guard only activates on those routes.
 */
@Injectable()
export class ServiceTokenGuard implements CanActivate {
  private readonly logger = new Logger(ServiceTokenGuard.name)

  constructor(
    private reflector: Reflector,
    private configService: ConfigService,
  ) {}

  canActivate(context: ExecutionContext): boolean {
    const requiresServiceAuth = this.reflector.getAllAndOverride<boolean>(SERVICE_AUTH_KEY, [
      context.getHandler(),
      context.getClass(),
    ])

    // Only activate on routes marked with @ServiceAuth()
    if (!requiresServiceAuth) {
      return true
    }

    const request = context.switchToHttp().getRequest()
    const headerToken = request.headers['x-service-token'] as string
    const queryToken = (request.query?.service_token as string) || ''
    const providedToken = headerToken || queryToken

    const expectedToken = this.configService.get<string>('SERVICE_TOKEN')

    if (!expectedToken) {
      this.logger.error(
        'SERVICE_TOKEN environment variable is not set. ' +
          'Service-authenticated endpoints will refuse all requests. ' +
          'Set SERVICE_TOKEN in .env to allow companion/worker access.',
      )
      throw new UnauthorizedException('Service token not configured on server')
    }

    if (!providedToken || providedToken !== expectedToken) {
      this.logger.warn(
        `Rejected service token request from ${request.ip} — ` +
          `token ${providedToken ? 'mismatch' : 'missing'}`,
      )
      throw new UnauthorizedException('Invalid or missing service token')
    }

    return true
  }
}
