import { PixingVideoService } from './pixing-video.service';
import { CreateTaskDto, UpdateTaskDto } from './dto/create-task.dto';
export declare class PixingVideoController {
    private readonly service;
    constructor(service: PixingVideoService);
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
    getNextTask(): Promise<{
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
