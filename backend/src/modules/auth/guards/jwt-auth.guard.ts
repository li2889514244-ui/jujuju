import { Injectable, ExecutionContext } from '@nestjs/common'
import { AuthGuard } from '@nestjs/passport'
import { Reflector } from '@nestjs/core'
import { IS_PUBLIC_KEY } from '../../../common/decorators/public.decorator'
import { SERVICE_AUTH_KEY } from '../../../common/decorators/service-auth.decorator'

@Injectable()
export class JwtAuthGuard extends AuthGuard('jwt') {
  constructor(private reflector: Reflector) {
    super()
  }

  canActivate(context: ExecutionContext) {
    const isPublic = this.reflector.getAllAndOverride<boolean>(IS_PUBLIC_KEY, [
      context.getHandler(),
      context.getClass(),
    ])
    if (isPublic) {
      return true
    }
    // Routes marked with @ServiceAuth() are handled by ServiceTokenGuard instead
    const isServiceAuth = this.reflector.getAllAndOverride<boolean>(SERVICE_AUTH_KEY, [
      context.getHandler(),
      context.getClass(),
    ])
    if (isServiceAuth) {
      return true
    }
    return super.canActivate(context)
  }
}
