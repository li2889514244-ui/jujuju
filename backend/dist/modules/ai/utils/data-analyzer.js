"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
exports.mean = mean;
exports.median = median;
exports.standardDeviation = standardDeviation;
exports.percentile = percentile;
exports.linearRegression = linearRegression;
exports.calculateTrend = calculateTrend;
exports.growthRate = growthRate;
exports.compoundGrowthRate = compoundGrowthRate;
exports.detectAnomalies = detectAnomalies;
exports.movingAverage = movingAverage;
exports.calculateEngagement = calculateEngagement;
exports.analyzeBestTimes = analyzeBestTimes;
function mean(values) {
    if (values.length === 0)
        return 0;
    return values.reduce((s, v) => s + v, 0) / values.length;
}
function median(values) {
    if (values.length === 0)
        return 0;
    const sorted = [...values].sort((a, b) => a - b);
    const mid = Math.floor(sorted.length / 2);
    return sorted.length % 2 !== 0 ? sorted[mid] : (sorted[mid - 1] + sorted[mid]) / 2;
}
function standardDeviation(values) {
    if (values.length < 2)
        return 0;
    const avg = mean(values);
    const squareDiffs = values.map((v) => (v - avg) ** 2);
    return Math.sqrt(mean(squareDiffs));
}
function percentile(values, p) {
    if (values.length === 0)
        return 0;
    const sorted = [...values].sort((a, b) => a - b);
    const index = (p / 100) * (sorted.length - 1);
    const lower = Math.floor(index);
    const upper = Math.ceil(index);
    if (lower === upper)
        return sorted[lower];
    return sorted[lower] + (sorted[upper] - sorted[lower]) * (index - lower);
}
function linearRegression(x, y) {
    const n = x.length;
    if (n < 2)
        return { slope: 0, intercept: y[0] || 0, r2: 0 };
    const sumX = x.reduce((s, v) => s + v, 0);
    const sumY = y.reduce((s, v) => s + v, 0);
    const sumXY = x.reduce((s, v, i) => s + v * y[i], 0);
    const sumX2 = x.reduce((s, v) => s + v * v, 0);
    const sumY2 = y.reduce((s, v) => s + v * v, 0);
    const denom = n * sumX2 - sumX * sumX;
    if (denom === 0)
        return { slope: 0, intercept: sumY / n, r2: 0 };
    const slope = (n * sumXY - sumX * sumY) / denom;
    const intercept = (sumY - slope * sumX) / n;
    const yMean = sumY / n;
    const ssRes = y.reduce((s, yi, i) => s + (yi - (slope * x[i] + intercept)) ** 2, 0);
    const ssTot = y.reduce((s, yi) => s + (yi - yMean) ** 2, 0);
    const r2 = ssTot === 0 ? 0 : 1 - ssRes / ssTot;
    return { slope, intercept, r2 };
}
function calculateTrend(values, forecastDays = 7) {
    if (values.length < 2) {
        return { direction: 'stable', slope: 0, r2: 0, predicted: values, forecast: [] };
    }
    const x = Array.from({ length: values.length }, (_, i) => i);
    const { slope, intercept, r2 } = linearRegression(x, values);
    const predicted = x.map((xi) => slope * xi + intercept);
    const forecast = Array.from({ length: forecastDays }, (_, i) => slope * (values.length + i) + intercept);
    const direction = Math.abs(slope) < 0.01 ? 'stable' : slope > 0 ? 'up' : 'down';
    return { direction, slope, r2: Math.max(0, r2), predicted, forecast };
}
function growthRate(current, previous) {
    if (previous === 0)
        return current > 0 ? 1 : 0;
    return (current - previous) / previous;
}
function compoundGrowthRate(values) {
    if (values.length < 2)
        return 0;
    const first = values[0];
    const last = values[values.length - 1];
    if (first <= 0)
        return 0;
    return Math.pow(last / first, 1 / (values.length - 1)) - 1;
}
function detectAnomalies(values, sensitivity = 'medium') {
    if (values.length < 3)
        return [];
    const thresholds = { low: 3.0, medium: 2.5, high: 2.0 };
    const threshold = thresholds[sensitivity];
    const avg = mean(values);
    const std = standardDeviation(values);
    if (std === 0)
        return [];
    const anomalies = [];
    for (let i = 0; i < values.length; i++) {
        const zScore = (values[i] - avg) / std;
        if (Math.abs(zScore) >= threshold) {
            anomalies.push({
                index: i,
                value: values[i],
                zScore,
                type: zScore > 0 ? 'spike' : 'drop',
            });
        }
    }
    return anomalies;
}
function movingAverage(values, window = 7) {
    if (values.length === 0)
        return [];
    const result = [];
    for (let i = 0; i < values.length; i++) {
        const start = Math.max(0, i - window + 1);
        const slice = values.slice(start, i + 1);
        result.push(mean(slice));
    }
    return result;
}
function calculateEngagement(likes, comments, shares, followers) {
    if (followers === 0)
        return 0;
    return (likes + comments * 2 + shares * 3) / followers;
}
function analyzeBestTimes(data) {
    const slotMap = new Map();
    for (const d of data) {
        const key = `${d.dayOfWeek}-${d.hour}`;
        const existing = slotMap.get(key) || { total: 0, count: 0 };
        existing.total += d.engagement;
        existing.count += 1;
        slotMap.set(key, existing);
    }
    const slots = [];
    for (const [key, { total, count }] of slotMap) {
        const [dayOfWeek, hour] = key.split('-').map(Number);
        slots.push({ hour, dayOfWeek, score: total / count });
    }
    return slots.sort((a, b) => b.score - a.score);
}
//# sourceMappingURL=data-analyzer.js.map