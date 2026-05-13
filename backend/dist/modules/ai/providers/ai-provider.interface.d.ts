export interface AICompletionRequest {
    prompt: string;
    systemPrompt?: string;
    temperature?: number;
    maxTokens?: number;
}
export interface AICompletionResponse {
    content: string;
    usage?: {
        promptTokens: number;
        completionTokens: number;
        totalTokens: number;
    };
    model: string;
}
export interface AIProvider {
    readonly name: string;
    complete(request: AICompletionRequest): Promise<AICompletionResponse>;
    isAvailable(): Promise<boolean>;
}
export declare class MockAIProvider implements AIProvider {
    readonly name = "mock";
    complete(request: AICompletionRequest): Promise<AICompletionResponse>;
    isAvailable(): Promise<boolean>;
}
export declare function registerProvider(provider: AIProvider): void;
export declare function getProvider(name?: string): AIProvider;
export declare function listProviders(): string[];
