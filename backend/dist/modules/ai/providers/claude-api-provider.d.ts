import { AIProvider, AICompletionRequest, AICompletionResponse } from './ai-provider.interface';
export declare class ClaudeAPIProvider implements AIProvider {
    readonly name = "claude";
    private readonly logger;
    private client;
    constructor();
    complete(request: AICompletionRequest): Promise<AICompletionResponse>;
    isAvailable(): Promise<boolean>;
}
