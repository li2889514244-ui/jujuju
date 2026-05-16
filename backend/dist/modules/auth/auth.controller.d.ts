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
            email: string;
            phone: string | null;
            id: string;
            role: import(".prisma/client").$Enums.Role;
            status: import(".prisma/client").$Enums.UserStatus;
            createdAt: Date;
        };
    }>;
    login(dto: LoginDto): Promise<{
        accessToken: string;
        refreshToken: string;
        user: {
            id: string;
            email: string;
            name: string;
            role: import(".prisma/client").$Enums.Role;
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
        email: string;
        phone: string | null;
        id: string;
        avatar: string | null;
        role: import(".prisma/client").$Enums.Role;
        status: import(".prisma/client").$Enums.UserStatus;
        lastLoginAt: Date | null;
        createdAt: Date;
    }>;
    updateProfile(userId: string, dto: {
        name?: string;
        avatar?: string;
        phone?: string;
    }): Promise<{
        name: string;
        email: string;
        phone: string | null;
        id: string;
        avatar: string | null;
        role: import(".prisma/client").$Enums.Role;
        status: import(".prisma/client").$Enums.UserStatus;
        lastLoginAt: Date | null;
        createdAt: Date;
    }>;
}
