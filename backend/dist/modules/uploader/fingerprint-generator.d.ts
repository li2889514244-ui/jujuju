export interface BrowserFingerprint {
    userAgent: string;
    viewport: {
        width: number;
        height: number;
    };
    screen: {
        width: number;
        height: number;
    };
    locale: string;
    timezone: string;
    colorScheme: 'light' | 'dark';
    deviceScaleFactor: number;
    canvasNoise: number;
    webglVendor: string;
    webglRenderer: string;
}
export declare class FingerprintGenerator {
    private readonly userAgents;
    private readonly resolutions;
    private readonly webglRenderers;
    private readonly timezones;
    getStableFingerprint(accountId: string): BrowserFingerprint;
    generateRandom(): BrowserFingerprint;
    private getViewport;
}
