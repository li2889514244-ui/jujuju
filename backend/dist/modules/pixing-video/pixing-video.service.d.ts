import { PrismaService } from '../../prisma/prisma.service';
import { CreateTaskDto, UpdateTaskDto } from './dto/create-task.dto';
export declare class PixingVideoService {
    private prisma;
    private readonly logger;
    constructor(prisma: PrismaService);
    createTask(userId: string, dto: CreateTaskDto): Promise<{
        id: string;
        userId: string;
        teacher: string;
        text: string;
        status: string;
        videoUrl: string | null;
        srtContent: string | null;
        error: string | null;
        createdAt: Date;
        updatedAt: Date;
    }>;
    listTasks(userId: string, status?: string): Promise<{
        id: string;
        userId: string;
        teacher: string;
        text: string;
        status: string;
        videoUrl: string | null;
        srtContent: string | null;
        error: string | null;
        createdAt: Date;
        updatedAt: Date;
    }[]>;
    getTask(id: string, userId: string): Promise<{
        id: string;
        userId: string;
        teacher: string;
        text: string;
        status: string;
        videoUrl: string | null;
        srtContent: string | null;
        error: string | null;
        createdAt: Date;
        updatedAt: Date;
    }>;
    getNextPendingTask(): Promise<{
        id: string;
        userId: string;
        teacher: string;
        text: string;
        status: string;
        videoUrl: string | null;
        srtContent: string | null;
        error: string | null;
        createdAt: Date;
        updatedAt: Date;
    } | null>;
    updateTask(id: string, dto: UpdateTaskDto): Promise<{
        id: string;
        userId: string;
        teacher: string;
        text: string;
        status: string;
        videoUrl: string | null;
        srtContent: string | null;
        error: string | null;
        createdAt: Date;
        updatedAt: Date;
    }>;
}
