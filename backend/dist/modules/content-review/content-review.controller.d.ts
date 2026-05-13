import { ContentReviewService } from './content-review.service';
declare class ReviewDto {
    content: string;
    title?: string;
}
declare class QuickCheckDto {
    text: string;
}
export declare class ContentReviewController {
    private reviewService;
    constructor(reviewService: ContentReviewService);
    review(dto: ReviewDto): Promise<import("./content-review.service").ReviewResult>;
    quickCheck(dto: QuickCheckDto): Promise<{
        passed: boolean;
        highlights: {
            word: string;
            severity: string;
        }[];
    }>;
}
export {};
