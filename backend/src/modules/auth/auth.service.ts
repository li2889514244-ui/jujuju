import {
  Injectable,
  UnauthorizedException,
  ConflictException,
  Logger,
  OnModuleInit,
} from '@nestjs/common';
import { JwtService } from '@nestjs/jwt';
import { ConfigService } from '@nestjs/config';
import * as bcrypt from 'bcryptjs';
import { PrismaService } from '../../prisma/prisma.service';
import { RegisterDto } from './dto/register.dto';
import { LoginDto } from './dto/login.dto';

@Injectable()
export class AuthService implements OnModuleInit {
  private readonly logger = new Logger(AuthService.name);
  private jwtSecret!: string;
  private jwtRefreshSecret!: string;
  private jwtAccessExpires!: string;
  private jwtRefreshExpires!: string;

  constructor(
    private prisma: PrismaService,
    private jwtService: JwtService,
    private configService: ConfigService,
  ) {}

  onModuleInit() {
    // Validate required secrets at startup
    this.jwtSecret = this.configService.get<string>('JWT_SECRET')!;
    this.jwtRefreshSecret = this.configService.get<string>('JWT_REFRESH_SECRET')!;
    this.jwtAccessExpires = this.configService.get<string>('JWT_ACCESS_EXPIRES', '15m');
    this.jwtRefreshExpires = this.configService.get<string>('JWT_REFRESH_EXPIRES', '7d');

    if (!this.jwtSecret || !this.jwtRefreshSecret) {
      throw new Error(
        'JWT_SECRET and JWT_REFRESH_SECRET must be configured. Check your .env file.',
      );
    }
  }

  /**
   * 用户注册
   */
  async register(dto: RegisterDto) {
    const existingUser = await this.prisma.user.findUnique({
      where: { email: dto.email },
    });

    if (existingUser) {
      throw new ConflictException('该邮箱已被注册');
    }

    // Enforce password policy
    this.validatePassword(dto.password);

    const hashedPassword = await bcrypt.hash(dto.password, 12);

    const user = await this.prisma.user.create({
      data: {
        email: dto.email,
        password: hashedPassword,
        name: dto.name,
        phone: dto.phone,
      },
      select: {
        id: true,
        email: true,
        name: true,
        phone: true,
        role: true,
        status: true,
        createdAt: true,
      },
    });

    this.logger.log(`用户注册成功: ${user.email}`);

    const tokens = await this.generateTokens(user.id, user.email);
    return { user, ...tokens };
  }

  /**
   * 用户登录
   */
  async login(dto: LoginDto) {
    const user = await this.validateUser(dto.email, dto.password);
    if (!user) {
      throw new UnauthorizedException('邮箱或密码错误');
    }

    // 更新最后登录时间
    await this.prisma.user.update({
      where: { id: user.id },
      data: { lastLoginAt: new Date() },
    });

    this.logger.log(`用户登录成功: ${user.email}`);

    const tokens = await this.generateTokens(user.id, user.email);
    return {
      user: {
        id: user.id,
        email: user.email,
        name: user.name,
        role: user.role,
      },
      ...tokens,
    };
  }

  /**
   * 验证用户凭证
   */
  async validateUser(email: string, password: string) {
    const user = await this.prisma.user.findUnique({
      where: { email },
    });

    if (!user) {
      return null;
    }

    if (user.status !== 'ACTIVE') {
      throw new UnauthorizedException('用户账号已被禁用');
    }

    const isPasswordValid = await bcrypt.compare(password, user.password);
    if (!isPasswordValid) {
      return null;
    }

    return user;
  }

  /**
   * 刷新令牌
   */
  async refreshTokens(refreshToken: string) {
    try {
      const payload = this.jwtService.verify(refreshToken, {
        secret: this.jwtRefreshSecret,
      });

      const user = await this.prisma.user.findUnique({
        where: { id: payload.sub },
      });

      if (!user || user.status !== 'ACTIVE') {
        throw new UnauthorizedException('无效的刷新令牌');
      }

      const tokens = await this.generateTokens(user.id, user.email);
      return tokens;
    } catch {
      throw new UnauthorizedException('刷新令牌已过期或无效');
    }
  }

  /**
   * 生成 Access Token 和 Refresh Token
   */
  private async generateTokens(userId: string, email: string) {
    const payload = { sub: userId, email };

    const [accessToken, refreshToken] = await Promise.all([
      this.jwtService.signAsync(payload, {
        secret: this.jwtSecret,
        expiresIn: this.jwtAccessExpires,
      }),
      this.jwtService.signAsync(payload, {
        secret: this.jwtRefreshSecret,
        expiresIn: this.jwtRefreshExpires,
      }),
    ]);

    return { accessToken, refreshToken };
  }

  /**
   * 密码策略校验
   * - 至少8个字符
   * - 包含大写字母
   * - 包含小写字母
   * - 包含数字
   */
  private validatePassword(password: string): void {
    const errors: string[] = [];

    if (password.length < 8) {
      errors.push('密码长度不能少于8个字符');
    }
    if (!/[A-Z]/.test(password)) {
      errors.push('密码必须包含至少一个大写字母');
    }
    if (!/[a-z]/.test(password)) {
      errors.push('密码必须包含至少一个小写字母');
    }
    if (!/[0-9]/.test(password)) {
      errors.push('密码必须包含至少一个数字');
    }

    if (errors.length > 0) {
      throw new ConflictException(errors.join('; '));
    }
  }
}
