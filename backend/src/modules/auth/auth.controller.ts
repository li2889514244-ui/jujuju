import { Controller, Post, Get, Body, HttpCode, HttpStatus, UseGuards } from '@nestjs/common';
import { ApiTags, ApiOperation, ApiResponse, ApiBearerAuth } from '@nestjs/swagger';
import { Throttle } from '@nestjs/throttler';
import { Public } from '../../common/decorators/public.decorator';
import { AuthService } from './auth.service';
import { RegisterDto } from './dto/register.dto';
import { LoginDto } from './dto/login.dto';
import { RefreshTokenDto } from './dto/refresh-token.dto';
import { JwtAuthGuard } from './guards/jwt-auth.guard';
import { CurrentUser } from '../../common/decorators/current-user.decorator';

@ApiTags('auth')
@Controller('auth')
export class AuthController {
  constructor(private readonly authService: AuthService) {}

  @Post('register')
  @Public()
  @Throttle({ short: { ttl: 60000, limit: 3 } })
  @ApiOperation({ summary: '用户注册' })
  @ApiResponse({ status: 201, description: '注册成功' })
  @ApiResponse({ status: 409, description: '邮箱已被注册' })
  @ApiResponse({ status: 429, description: '请求过于频繁' })
  async register(@Body() dto: RegisterDto) {
    return this.authService.register(dto);
  }

  @Post('login')
  @Public()
  @HttpCode(HttpStatus.OK)
  @Throttle({ short: { ttl: 60000, limit: 5 } })
  @ApiOperation({ summary: '用户登录' })
  @ApiResponse({ status: 200, description: '登录成功' })
  @ApiResponse({ status: 401, description: '邮箱或密码错误' })
  @ApiResponse({ status: 429, description: '请求过于频繁' })
  async login(@Body() dto: LoginDto) {
    return this.authService.login(dto);
  }

  @Post('refresh')
  @Public()
  @HttpCode(HttpStatus.OK)
  @Throttle({ short: { ttl: 60000, limit: 10 } })
  @ApiOperation({ summary: '刷新令牌' })
  @ApiResponse({ status: 200, description: '刷新成功' })
  @ApiResponse({ status: 401, description: '刷新令牌无效' })
  @ApiResponse({ status: 429, description: '请求过于频繁' })
  async refresh(@Body() dto: RefreshTokenDto) {
    return this.authService.refreshTokens(dto.refreshToken);
  }

  @Post('logout')
  @Public()
  @HttpCode(HttpStatus.OK)
  @ApiOperation({ summary: '用户登出（吊销 refresh token）' })
  @ApiResponse({ status: 200, description: '登出成功' })
  async logout(@Body() dto: RefreshTokenDto) {
    return this.authService.logout(dto.refreshToken);
  }

  @Get('me')
  @UseGuards(JwtAuthGuard)
  @ApiBearerAuth('access-token')
  @ApiOperation({ summary: '获取当前用户信息' })
  @ApiResponse({ status: 200, description: '获取成功' })
  @ApiResponse({ status: 401, description: '未登录' })
  async getMe(@CurrentUser('id') userId: string) {
    return this.authService.getProfile(userId);
  }

  @Post('profile')
  @UseGuards(JwtAuthGuard)
  @ApiBearerAuth('access-token')
  @HttpCode(HttpStatus.OK)
  @ApiOperation({ summary: '更新用户资料' })
  @ApiResponse({ status: 200, description: '更新成功' })
  async updateProfile(
    @CurrentUser('id') userId: string,
    @Body() dto: { name?: string; avatar?: string; phone?: string },
  ) {
    return this.authService.updateProfile(userId, dto);
  }
}
