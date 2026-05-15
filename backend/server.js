#!/usr/bin/env node
/**
 * MatrixFlow Express Server
 * Serves frontend + API, uses Prisma for database access
 */
const express = require('express');
const cors = require('cors');
const jwt = require('jsonwebtoken');
const bcrypt = require('bcryptjs');
const path = require('path');
const fs = require('fs');

// Load .env
const envPath = path.join(__dirname, '.env');
if (fs.existsSync(envPath)) {
    require('dotenv').config({ path: envPath });
}

const { PrismaClient } = require('@prisma/client');
const prisma = new PrismaClient();

const app = express();
const PORT = process.env.PORT || 3000;
const JWT_SECRET = process.env.JWT_SECRET || 'matrixflow-jwt-secret-key-2026-production';
const FRONTEND_DIR = process.env.FRONTEND_DIR || path.join(__dirname, 'public');

app.use(cors());
app.use(express.json({ limit: '10mb' }));

// ── Auth middleware ──────────────────────────────────────────
function authRequired(req, res, next) {
    const auth = req.headers.authorization;
    if (!auth || !auth.startsWith('Bearer ')) {
        return res.status(401).json({ code: 401, message: 'Unauthorized' });
    }
    try {
        const decoded = jwt.verify(auth.slice(7), JWT_SECRET);
        req.userId = decoded.sub;
        req.userEmail = decoded.email;
        next();
    } catch {
        return res.status(401).json({ code: 401, message: 'Token expired' });
    }
}

// ── Auth routes ──────────────────────────────────────────────
app.post('/api/v1/auth/register', async (req, res) => {
    try {
        const { email, password, name } = req.body;
        if (!email || !password) return res.status(400).json({ code: 400, message: 'Email and password required' });

        const existing = await prisma.user.findUnique({ where: { email } });
        if (existing) return res.status(400).json({ code: 400, message: 'Email already registered' });

        const hashed = await bcrypt.hash(password, 10);
        const user = await prisma.user.create({
            data: { email, password: hashed, name: name || email.split('@')[0] }
        });

        const token = jwt.sign({ sub: user.id, email: user.email }, JWT_SECRET, { expiresIn: '7d' });
        const refresh = jwt.sign({ sub: user.id, email: user.email }, JWT_SECRET, { expiresIn: '30d' });

        res.json({
            code: 0, message: 'success',
            data: {
                user: { id: user.id, email: user.email, name: user.name, role: user.role, status: user.status, createdAt: user.createdAt },
                accessToken: token, refreshToken: refresh
            }
        });
    } catch (e) {
        console.error('Register error:', e.message);
        res.status(500).json({ code: 500, message: e.message });
    }
});

app.post('/api/v1/auth/login', async (req, res) => {
    try {
        const { email, password } = req.body;
        const user = await prisma.user.findUnique({ where: { email } });
        if (!user) return res.status(401).json({ code: 401, message: 'Invalid credentials' });

        const valid = await bcrypt.compare(password, user.password);
        if (!valid) return res.status(401).json({ code: 401, message: 'Invalid credentials' });

        // Update lastLoginAt
        await prisma.user.update({ where: { id: user.id }, data: { lastLoginAt: new Date() } });

        const token = jwt.sign({ sub: user.id, email: user.email }, JWT_SECRET, { expiresIn: '7d' });
        const refresh = jwt.sign({ sub: user.id, email: user.email }, JWT_SECRET, { expiresIn: '30d' });

        res.json({
            code: 0, message: 'success',
            data: {
                user: { id: user.id, email: user.email, name: user.name, role: user.role, status: user.status, createdAt: user.createdAt },
                accessToken: token, refreshToken: refresh
            }
        });
    } catch (e) {
        console.error('Login error:', e.message);
        res.status(500).json({ code: 500, message: e.message });
    }
});

app.get('/api/v1/auth/me', authRequired, async (req, res) => {
    try {
        const user = await prisma.user.findUnique({ where: { id: req.userId } });
        if (!user) return res.status(404).json({ code: 404, message: 'User not found' });
        const { password, ...u } = user;
        res.json({ code: 0, message: 'success', data: u });
    } catch (e) {
        res.status(500).json({ code: 500, message: e.message });
    }
});

// ── Accounts ─────────────────────────────────────────────────
app.get('/api/v1/accounts', authRequired, async (req, res) => {
    try {
        const accounts = await prisma.account.findMany({
            where: { userId: req.userId },
            orderBy: { createdAt: 'desc' }
        });
        res.json({ code: 0, message: 'success', data: accounts });
    } catch (e) {
        res.status(500).json({ code: 500, message: e.message });
    }
});

app.post('/api/v1/accounts', authRequired, async (req, res) => {
    try {
        const { platform, platformUserId, nickname, cookies, avatar, bio } = req.body;
        if (!platform) return res.status(400).json({ code: 400, message: 'Platform required' });

        const account = await prisma.account.create({
            data: {
                platform: platform || 'DOUYIN',
                platformUserId: platformUserId || `manual_${Date.now()}`,
                nickname: nickname || platform,
                cookies: cookies || '',
                avatar: avatar || null,
                bio: bio || null,
                userId: req.userId,
                status: 'ACTIVE'
            }
        });
        res.json({ code: 0, message: 'success', data: account });
    } catch (e) {
        console.error('Create account error:', e.message);
        res.status(500).json({ code: 500, message: e.message });
    }
});

app.get('/api/v1/accounts/:id', authRequired, async (req, res) => {
    try {
        const account = await prisma.account.findUnique({ where: { id: req.params.id } });
        if (!account || account.userId !== req.userId) return res.status(404).json({ code: 404, message: 'Not found' });
        res.json({ code: 0, message: 'success', data: account });
    } catch (e) {
        res.status(500).json({ code: 500, message: e.message });
    }
});

app.delete('/api/v1/accounts/:id', authRequired, async (req, res) => {
    try {
        const account = await prisma.account.findUnique({ where: { id: req.params.id } });
        if (!account || account.userId !== req.userId) return res.status(404).json({ code: 404, message: 'Not found' });
        await prisma.account.delete({ where: { id: req.params.id } });
        res.json({ code: 0, message: 'success' });
    } catch (e) {
        res.status(500).json({ code: 500, message: e.message });
    }
});

// ── Content ──────────────────────────────────────────────────
app.get('/api/v1/content', authRequired, async (req, res) => {
    try {
        const accounts = await prisma.account.findMany({ where: { userId: req.userId }, select: { id: true } });
        const ids = accounts.map(a => a.id);
        const posts = await prisma.post.findMany({
            where: { accountId: { in: ids } },
            include: { account: { select: { platform: true, nickname: true } }, stats: true },
            orderBy: { createdAt: 'desc' },
            take: 50
        });
        res.json({ code: 0, message: 'success', data: { posts } });
    } catch (e) {
        res.status(500).json({ code: 500, message: e.message });
    }
});

app.get('/api/v1/content/scheduled', authRequired, async (req, res) => {
    try {
        const accounts = await prisma.account.findMany({ where: { userId: req.userId }, select: { id: true } });
        const ids = accounts.map(a => a.id);
        const posts = await prisma.post.findMany({
            where: { accountId: { in: ids }, status: 'SCHEDULED' },
            include: { account: { select: { platform: true, nickname: true } } },
            orderBy: { publishAt: 'asc' }
        });
        res.json({ code: 0, message: 'success', data: posts });
    } catch (e) {
        res.status(500).json({ code: 500, message: e.message });
    }
});

// ── Analytics ────────────────────────────────────────────────
app.get('/api/v1/analytics/overview', authRequired, async (req, res) => {
    try {
        const accounts = await prisma.account.findMany({ where: { userId: req.userId }, select: { id: true, platform: true, followers: true, status: true } });
        const accountIds = accounts.map(a => a.id);
        const [totalPosts, publishedPosts] = await Promise.all([
            prisma.post.count({ where: { accountId: { in: accountIds } } }),
            prisma.post.count({ where: { accountId: { in: accountIds }, status: 'PUBLISHED' } }),
        ]);
        const statsAgg = await prisma.postStats.aggregate({ where: { post: { accountId: { in: accountIds } } }, _sum: { views: true, likes: true, comments: true, shares: true, saves: true } });
        const platformCounts = {};
        accounts.forEach(a => { platformCounts[a.platform] = (platformCounts[a.platform] || 0) + 1; });
        const totalFollowers = accounts.reduce((s, a) => s + a.followers, 0);
        res.json({
            code: 0, message: 'success',
            data: {
                accounts: { total: accounts.length, active: accounts.filter(a => a.status === 'ACTIVE').length, byPlatform: platformCounts, totalFollowers },
                posts: { total: totalPosts, published: publishedPosts },
                engagement: { totalViews: statsAgg._sum.views || 0, totalLikes: statsAgg._sum.likes || 0, totalComments: statsAgg._sum.comments || 0, totalShares: statsAgg._sum.shares || 0 }
            }
        });
    } catch (e) { res.status(500).json({ code: 500, message: e.message }); }
});

app.get('/api/v1/analytics/followers/trend', authRequired, async (req, res) => {
    try {
        const days = parseInt(req.query.days) || 7;
        const accounts = await prisma.account.findMany({ where: { userId: req.userId }, select: { id: true } });
        const ids = accounts.map(a => a.id);
        const stats = await prisma.dailyStats.findMany({
            where: { accountId: { in: ids }, date: { gte: new Date(Date.now() - days * 86400000) } },
            orderBy: { date: 'asc' }, select: { date: true, followers: true }
        });
        const byDate = {};
        stats.forEach(s => { const d = s.date.toISOString().slice(0, 10); if (!byDate[d]) byDate[d] = { date: d, value: 0 }; byDate[d].value += s.followers; });
        res.json({ code: 0, message: 'success', data: Object.values(byDate) });
    } catch (e) { res.status(500).json({ code: 500, message: e.message }); }
});

app.get('/api/v1/analytics/likes/trend', authRequired, async (req, res) => {
    try {
        const days = parseInt(req.query.days) || 7;
        const accounts = await prisma.account.findMany({ where: { userId: req.userId }, select: { id: true } });
        const ids = accounts.map(a => a.id);
        const stats = await prisma.dailyStats.findMany({
            where: { accountId: { in: ids }, date: { gte: new Date(Date.now() - days * 86400000) } },
            orderBy: { date: 'asc' }, select: { date: true, likes: true }
        });
        const byDate = {};
        stats.forEach(s => { const d = s.date.toISOString().slice(0, 10); if (!byDate[d]) byDate[d] = { date: d, value: 0 }; byDate[d].value += s.likes; });
        res.json({ code: 0, message: 'success', data: Object.values(byDate) });
    } catch (e) { res.status(500).json({ code: 500, message: e.message }); }
});

app.get('/api/v1/analytics/platforms', authRequired, async (req, res) => {
    try {
        const accounts = await prisma.account.findMany({ where: { userId: req.userId }, select: { id: true, platform: true } });
        const platforms = [...new Set(accounts.map(a => a.platform))];
        const result = {};
        for (const p of platforms) {
            const pids = accounts.filter(a => a.platform === p).map(a => a.id);
            const [count, agg] = await Promise.all([
                prisma.post.count({ where: { accountId: { in: pids }, status: 'PUBLISHED' } }),
                prisma.postStats.aggregate({ where: { post: { accountId: { in: pids } } }, _sum: { views: true, likes: true, comments: true, shares: true } })
            ]);
            result[p] = { accounts: pids.length, publishes: count, followers: 0, likes: agg._sum.likes || 0, engagementRate: '0%' };
        }
        res.json({ code: 0, message: 'success', data: Object.entries(result).map(([k, v]) => ({ platform: k, ...v })) });
    } catch (e) { res.status(500).json({ code: 500, message: e.message }); }
});

app.get('/api/v1/analytics/views-ranking', authRequired, async (req, res) => {
    try {
        const accounts = await prisma.account.findMany({ where: { userId: req.userId }, select: { id: true } });
        const ids = accounts.map(a => a.id);
        const posts = await prisma.post.findMany({
            where: { accountId: { in: ids }, status: 'PUBLISHED', stats: { isNot: null } },
            include: { stats: true, account: { select: { nickname: true, platform: true, avatar: true } } },
            orderBy: { stats: { views: 'desc' } }, take: 50
        });
        res.json({
            code: 0, message: 'success',
            data: {
                ranking: posts.map((p, i) => ({ rank: i + 1, postId: p.id, title: p.title, platform: p.account.platform, accountName: p.account.nickname, accountAvatar: p.account.avatar, views: p.stats?.views || 0, likes: p.stats?.likes || 0, comments: p.stats?.comments || 0, shares: p.stats?.shares || 0, publishedAt: p.updatedAt })),
                total: posts.length, period: 'all'
            }
        });
    } catch (e) { res.status(500).json({ code: 500, message: e.message }); }
});

app.get('/api/v1/analytics/publish-effect', authRequired, async (req, res) => {
    try {
        const accounts = await prisma.account.findMany({ where: { userId: req.userId }, select: { id: true } });
        const ids = accounts.map(a => a.id);
        const posts = await prisma.post.findMany({
            where: { accountId: { in: ids } },
            include: { stats: true, account: { select: { nickname: true, platform: true } } },
            orderBy: { createdAt: 'desc' }, take: 50
        });
        res.json({
            code: 0, message: 'success',
            data: posts.map(p => ({ id: p.id, title: p.title, platform: p.account.platform, accountName: p.account.nickname, status: p.status, views: p.stats?.views || 0, likes: p.stats?.likes || 0, comments: p.stats?.comments || 0, shares: p.stats?.shares || 0, publishedAt: p.publishAt || p.createdAt }))
        });
    } catch (e) { res.status(500).json({ code: 500, message: e.message }); }
});

app.get('/api/v1/analytics/engagement', authRequired, async (req, res) => {
    try {
        const days = parseInt(req.query.days) || 7;
        const accounts = await prisma.account.findMany({ where: { userId: req.userId }, select: { id: true } });
        const ids = accounts.map(a => a.id);
        const stats = await prisma.dailyStats.findMany({
            where: { accountId: { in: ids }, date: { gte: new Date(Date.now() - days * 86400000) } },
            orderBy: { date: 'asc' }, select: { date: true, views: true, likes: true, comments: true, shares: true }
        });
        const byDate = {};
        stats.forEach(s => { const d = s.date.toISOString().slice(0, 10); if (!byDate[d]) byDate[d] = { date: d, views: 0, likes: 0, comments: 0, shares: 0 }; byDate[d].views += s.views; byDate[d].likes += s.likes; byDate[d].comments += s.comments; byDate[d].shares += s.shares; });
        res.json({
            code: 0, message: 'success',
            data: Object.values(byDate).map(d => ({ date: d.date, value: d.views > 0 ? Math.round(((d.likes + d.comments + d.shares) / d.views) * 10000) / 100 : 0 }))
        });
    } catch (e) { res.status(500).json({ code: 500, message: e.message }); }
});

app.get('/api/v1/analytics/report', authRequired, async (req, res) => {
    try { res.json({ code: 0, message: 'success', data: { period: { start: new Date(Date.now() - 30 * 86400000), end: new Date() }, overview: {}, accounts: [], topPosts: [], dailyTrend: [] } }); }
    catch (e) { res.status(500).json({ code: 500, message: e.message }); }
});

app.get('/api/v1/analytics/comparison', authRequired, async (req, res) => {
    try { res.json({ code: 0, message: 'success', data: { weekOverWeek: {}, monthOverMonth: {}, yearOverYear: {} } }); }
    catch (e) { res.status(500).json({ code: 500, message: e.message }); }
});

// ── Platforms / AI / Notifications ───────────────────────────
app.get('/api/v1/platforms', authRequired, async (req, res) => {
    res.json({ code: 0, message: 'success', data: [
        { id: 'DOUYIN', name: '抖音', icon: 'douyin' },
        { id: 'XIAOHONGSHU', name: '小红书', icon: 'xiaohongshu' },
        { id: 'KUAISHOU', name: '快手', icon: 'kuaishou' },
        { id: 'BILIBILI', name: 'B站', icon: 'bilibili' },
        { id: 'WEIBO', name: '微博', icon: 'weibo' },
        { id: 'WECHAT_VIDEO', name: '视频号', icon: 'wechat' },
    ]});
});

app.get('/api/v1/ai/capabilities', authRequired, (req, res) => {
    res.json({ code: 0, message: 'success', data: { models: ['gpt-4', 'claude-3'], features: ['content', 'title', 'tags'] } });
});

app.get('/api/v1/ai/providers', authRequired, (req, res) => {
    res.json({ code: 0, message: 'success', data: [{ id: 'openai', name: 'OpenAI', status: 'connected' }] });
});

app.get('/api/v1/notifications', authRequired, async (req, res) => {
    try {
        const notifs = await prisma.notification.findMany({ where: { userId: req.userId }, orderBy: { createdAt: 'desc' }, take: 20 });
        res.json({ code: 0, message: 'success', data: notifs });
    } catch (e) { res.json({ code: 0, message: 'success', data: [] }); }
});

app.get('/api/v1/competitors', authRequired, async (req, res) => {
    try {
        const comps = await prisma.competitor.findMany({ where: { userId: req.userId }, orderBy: { createdAt: 'desc' } });
        res.json({ code: 0, message: 'success', data: comps });
    } catch (e) { res.json({ code: 0, message: 'success', data: [] }); }
});

app.get('/api/v1/account-groups', authRequired, async (req, res) => {
    try {
        const groups = await prisma.accountGroup.findMany({ where: { userId: req.userId }, orderBy: { sortOrder: 'asc' } });
        res.json({ code: 0, message: 'success', data: groups });
    } catch (e) { res.json({ code: 0, message: 'success', data: [] }); }
});

app.post('/api/v1/content-review/quick-check', authRequired, (req, res) => {
    res.json({ code: 0, message: 'success', data: { passed: true, violations: [], score: 100 } });
});

// ── Health ────────────────────────────────────────────────────
app.get('/api/v1/health', (req, res) => {
    res.json({ code: 0, message: 'success', data: { status: 'ok', timestamp: new Date().toISOString(), uptime: process.uptime(), version: '0.2.0' } });
});

// ── Frontend static files ────────────────────────────────────
if (fs.existsSync(FRONTEND_DIR)) {
    app.use(express.static(FRONTEND_DIR));
    app.get('*', (req, res, next) => {
        if (req.path.startsWith('/api/')) return next();
        res.sendFile(path.join(FRONTEND_DIR, 'index.html'));
    });
    console.log('Frontend served from:', FRONTEND_DIR);
} else {
    console.log('Frontend dir not found:', FRONTEND_DIR);
}

// ── Start ────────────────────────────────────────────────────
app.listen(PORT, () => {
    console.log(`MatrixFlow Express server on http://localhost:${PORT}`);
});
