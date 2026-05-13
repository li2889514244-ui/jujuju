export interface PromptTemplate {
    id: string;
    name: string;
    template: string;
    variables: string[];
    category: 'content' | 'publish' | 'trend' | 'anomaly' | 'review';
}
export declare function renderTemplate(templateId: string, vars: Record<string, unknown>): string;
export declare function getTemplate(id: string): PromptTemplate | undefined;
export declare function getTemplatesByCategory(category: PromptTemplate['category']): PromptTemplate[];
