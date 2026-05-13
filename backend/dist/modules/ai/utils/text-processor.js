"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
exports.segmentText = segmentText;
exports.extractKeywords = extractKeywords;
exports.analyzeSentiment = analyzeSentiment;
exports.textSimilarity = textSimilarity;
exports.getTextStats = getTextStats;
const STOP_WORDS = new Set([
    '的', '了', '在', '是', '我', '有', '和', '就', '不', '人', '都', '一', '一个',
    '上', '也', '很', '到', '说', '要', '去', '你', '会', '着', '没有', '看', '好',
    '自己', '这', '他', '她', '它', '们', '那', '些', '所以', '因为', '但是', '如果',
    '这个', '那个', '什么', '怎么', '为什么', '可以', '可能', '已经', '还是', '虽然',
    '而且', '或者', '不是', '没有', '所有', '每个', '这样', '那样', '一样',
]);
function segmentText(text) {
    const cleaned = text.replace(/[，。！？、；：""''（）【】《》\s\.\,\!\?\;\:\'\"\(\)\[\]\{\}]/g, ' ');
    const tokens = [];
    for (const chunk of cleaned.split(/\s+/)) {
        if (!chunk)
            continue;
        const chineseChars = chunk.match(/[\u4e00-\u9fff]+/g);
        if (chineseChars) {
            for (const segment of chineseChars) {
                for (let len = 2; len <= Math.min(4, segment.length); len++) {
                    for (let i = 0; i <= segment.length - len; i++) {
                        const gram = segment.substring(i, i + len);
                        if (!STOP_WORDS.has(gram)) {
                            tokens.push(gram);
                        }
                    }
                }
                if (segment.length >= 2 && segment.length <= 6 && !STOP_WORDS.has(segment)) {
                    tokens.push(segment);
                }
            }
        }
        const englishWords = chunk.match(/[a-zA-Z]{2,}/g);
        if (englishWords) {
            tokens.push(...englishWords.map((w) => w.toLowerCase()));
        }
    }
    return tokens;
}
function extractKeywords(text, topK = 10) {
    const tokens = segmentText(text);
    const freq = new Map();
    for (const token of tokens) {
        freq.set(token, (freq.get(token) || 0) + 1);
    }
    const total = tokens.length || 1;
    const results = [];
    for (const [word, count] of freq) {
        const tf = count / total;
        const lengthBonus = Math.min(word.length / 4, 1.5);
        results.push({
            keyword: word,
            score: tf * lengthBonus,
            frequency: count,
        });
    }
    return results.sort((a, b) => b.score - a.score).slice(0, topK);
}
const POSITIVE_WORDS = new Set([
    '好', '棒', '优秀', '精彩', '喜欢', '赞', '美', '漂亮', '厉害', '牛',
    '开心', '快乐', '幸福', '感谢', '支持', '加油', '不错', '推荐', '满意',
    'amazing', 'great', 'good', 'awesome', 'love', 'wonderful', 'excellent', 'best',
    'perfect', 'nice', 'beautiful', 'happy', 'fantastic', 'brilliant', 'superb',
]);
const NEGATIVE_WORDS = new Set([
    '差', '烂', '垃圾', '恶心', '讨厌', '难看', '失望', '难吃', '糟糕', '讨厌',
    '恶心', '可怕', '恐怖', '愤怒', '生气', '悲伤', '难过', '痛苦', '后悔',
    'bad', 'terrible', 'awful', 'hate', 'ugly', 'worst', 'horrible', 'disgusting',
    'disappointed', 'angry', 'sad', 'annoying', 'boring', 'poor',
]);
function analyzeSentiment(text) {
    const lower = text.toLowerCase();
    const positiveFound = [];
    const negativeFound = [];
    for (const word of POSITIVE_WORDS) {
        if (lower.includes(word))
            positiveFound.push(word);
    }
    for (const word of NEGATIVE_WORDS) {
        if (lower.includes(word))
            negativeFound.push(word);
    }
    const total = positiveFound.length + negativeFound.length;
    let score = 0;
    if (total > 0) {
        score = (positiveFound.length - negativeFound.length) / total;
    }
    const label = score > 0.2 ? 'positive' : score < -0.2 ? 'negative' : 'neutral';
    const confidence = Math.min(total / 5, 1);
    return { score, label, confidence, positiveWords: positiveFound, negativeWords: negativeFound };
}
function textSimilarity(a, b) {
    const tokensA = new Set(segmentText(a));
    const tokensB = new Set(segmentText(b));
    if (tokensA.size === 0 && tokensB.size === 0)
        return 1;
    let intersection = 0;
    for (const token of tokensA) {
        if (tokensB.has(token))
            intersection++;
    }
    const union = new Set([...tokensA, ...tokensB]).size;
    return union === 0 ? 0 : intersection / union;
}
function getTextStats(text) {
    const chineseChars = (text.match(/[\u4e00-\u9fff]/g) || []).length;
    const englishWords = (text.match(/[a-zA-Z]+/g) || []).length;
    const emojis = (text.match(/[\u{1F600}-\u{1F64F}\u{1F300}-\u{1F5FF}\u{1F680}-\u{1F6FF}\u{1F900}-\u{1F9FF}\u{2600}-\u{26FF}\u{2700}-\u{27BF}]/gu) || []).length;
    const lines = text.split('\n').length;
    const tokens = segmentText(text);
    return {
        charCount: text.length,
        wordCount: tokens.length,
        lineCount: lines,
        avgWordLength: tokens.length > 0 ? tokens.reduce((s, t) => s + t.length, 0) / tokens.length : 0,
        chineseCharCount: chineseChars,
        englishWordCount: englishWords,
        emojiCount: emojis,
    };
}
//# sourceMappingURL=text-processor.js.map