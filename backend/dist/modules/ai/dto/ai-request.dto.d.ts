export declare enum ContentType {
    VIDEO_SCRIPT = "video_script",
    TITLE = "title",
    TAGS = "tags",
    CAPTION = "caption"
}
export declare class GenerateContentDto {
    type: ContentType;
    topic: string;
    platform?: string;
    audience?: string;
    style?: string;
    reference?: string;
    count?: number;
}
export declare class OptimizePublishDto {
    platform: string;
    contentType?: string;
    audience?: string;
    historicalData?: string;
}
export declare class PredictTrendDto {
    metric: string;
    platform?: string;
    days?: number;
    historicalData?: string;
}
export declare class DetectAnomalyDto {
    dataset?: string;
    metric?: string;
    platform?: string;
    sensitivity?: 'low' | 'medium' | 'high';
}
export declare class ReviewContentDto {
    content: string;
    contentType?: string;
    platform?: string;
    strictness?: 'lenient' | 'normal' | 'strict';
}
