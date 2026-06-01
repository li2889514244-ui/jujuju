import { AuthService } from './auth.service';
import { RegisterDto } from './dto/register.dto';
import { LoginDto } from './dto/login.dto';
import { RefreshTokenDto } from './dto/refresh-token.dto';
export declare class AuthController {
    private readonly authService;
    constructor(authService: AuthService);
    register(dto: RegisterDto): Promise<{
        accessToken: string;
        refreshToken: string;
        user: {
            name: string;
            id: string;
            createdAt: Date;
            status: import(".prisma/client").$Enums.AccountStatus;
            email: string;
            phone: string | null;
            role: import(".prisma/client").$Enums.UserRole;
        };
    }>;
    login(dto: LoginDto): Promise<{
        accessToken: string;
        refreshToken: string;
        user: {
            id: string;
            email: string;
            name: string;
            role: import(".prisma/client").$Enums.UserRole;
        };
    }>;
    refresh(dto: RefreshTokenDto): Promise<{
        accessToken: string;
        refreshToken: string;
    }>;
    logout(dto: RefreshTokenDto): Promise<{
        success: boolean;
        message: string;
    }>;
    getMe(userId: string): Promise<{
        name: string;
        id: string;
        createdAt: Date;
        avatar: string | null;
        status: import(".prisma/client").$Enums.AccountStatus;
        email: string;
        phone: string | null;
        role: import(".prisma/client").$Enums.UserRole;
        lastLoginAt: Date | null;
    }>;
    updateProfile(userId: string, dto: {
        name?: string;
        avatar?: string;
        phone?: string;
    }): Promise<{
        name: string;
        id: string;
        createdAt: Date;
        avatar: string | null;
        status: import(".prisma/client").$Enums.AccountStatus;
        email: string;
        phone: string | null;
        role: import(".prisma/client").$Enums.UserRole;
        lastLoginAt: Date | null;
    }>;
}
