import { Body, Controller, Get, HttpCode, HttpStatus, Post, Query, Req, Res } from '@nestjs/common'
import { Request, Response } from 'express'
import { CurrentUser } from '../../common/decorators/current-user.decorator'
import { Public } from '../../common/decorators/public.decorator'
import { McpOAuthService } from './mcp-oauth.service'
import {
  McpOAuthAuthorizeQuery,
  McpOAuthRegisterRequest,
  McpOAuthTokenRequest,
} from './mcp-oauth.types'

@Controller()
export class McpOAuthController {
  constructor(private readonly oauthService: McpOAuthService) {}

  @Public()
  @Get('.well-known/oauth-protected-resource')
  protectedResource(@Req() req: Request, @Res() res: Response) {
    return res.status(HttpStatus.OK).json(this.oauthService.getProtectedResourceMetadata(req))
  }

  @Public()
  @Get('.well-known/oauth-authorization-server')
  authorizationServer(@Req() req: Request, @Res() res: Response) {
    return res.status(HttpStatus.OK).json(this.oauthService.getAuthorizationServerMetadata(req))
  }

  @Public()
  @Post('oauth/register')
  @HttpCode(HttpStatus.CREATED)
  async register(
    @Body() body: McpOAuthRegisterRequest,
    @Req() req: Request,
    @Res() res: Response,
  ) {
    return res.status(HttpStatus.CREATED).json(await this.oauthService.registerClient(body, req))
  }

  @Public()
  @Get('oauth/authorize')
  async authorize(
    @Query() query: McpOAuthAuthorizeQuery,
    @Req() req: Request,
    @Res() res: Response,
  ) {
    const result = await this.oauthService.createAuthorizationTransaction(query, req)
    return res.redirect(HttpStatus.FOUND, result.redirectTo)
  }

  @Get('mcp/oauth/authorization/:transactionId')
  async getAuthorization(
    @Req() req: Request,
    @Res() res: Response,
  ) {
    const transactionId = req.params.transactionId
    return res.status(HttpStatus.OK).json(await this.oauthService.getAuthorizationTransaction(transactionId))
  }

  @Post('mcp/oauth/authorization/:transactionId/approve')
  @HttpCode(HttpStatus.OK)
  async approveAuthorization(
    @CurrentUser() user: any,
    @Req() req: Request,
    @Res() res: Response,
  ) {
    const transactionId = req.params.transactionId
    return res.status(HttpStatus.OK).json(await this.oauthService.approveAuthorizationTransaction(transactionId, user))
  }

  @Post('mcp/oauth/authorization/:transactionId/deny')
  @HttpCode(HttpStatus.OK)
  async denyAuthorization(
    @Req() req: Request,
    @Res() res: Response,
  ) {
    const transactionId = req.params.transactionId
    return res.status(HttpStatus.OK).json(await this.oauthService.denyAuthorizationTransaction(transactionId))
  }

  @Public()
  @Post('oauth/token')
  @HttpCode(HttpStatus.OK)
  async token(@Body() body: McpOAuthTokenRequest, @Req() req: Request, @Res() res: Response) {
    return res.status(HttpStatus.OK).json(await this.oauthService.token(body, req))
  }
}
