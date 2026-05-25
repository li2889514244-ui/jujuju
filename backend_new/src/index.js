require('dotenv').config();
const express = require('express');
const cors = require('cors');
const helmet = require('helmet');
const bcrypt = require('bcryptjs');
const jwt = require('jsonwebtoken');
const { v4: uuid } = require('uuid');
const db = require('./db');
const { requireAuth } = require('./auth');
const crypto = require('crypto');

const app = express();
const PORT = process.env.PORT || 3000;
const JWT_SECRET = process.env.JWT_SECRET || '97c8b81752478a5567e8383274541183689a3baca2bc11947ba7a7ed9dc30117ef44002f6e0ce856ddf6da652110e3049210dad8f9f9f9a099831225b01a0fa9';
const COOKIE_KEY = (process.env.COOKIE_ENCRYPTION_KEY || 'mf-cookie-enc-key-2026-secure!!').padEnd(32).slice(0, 32);
const JWT_EXPIRES = process.env.JWT_ACCESS_EXPIRES || '7d';

app.use(helmet({ crossOriginResourcePolicy: false }));
app.use(cors({ origin: process.env.CORS_ORIGIN || '*', credentials: true }));
app.use(express.json({ limit: '160mb' }));
app.use(requireAuth);

function ok(data, status = 200) {
  return (_, res) => res.status(status).json({ code: 0, message: 'success', data });
}
function fail(res, status, message) {
  return res.status(status).json({ code: status, message, data: null });
}
function signToken(user) {
  return jwt.sign({ sub: user.id, email: user.email, role: user.role }, JWT_SECRET, { expiresIn: JWT_EXPIRES });
}
function encrypt(text) {
  const iv = crypto.randomBytes(16);
  const cipher = crypto.createCipheriv('aes-256-gcm', Buffer.from(COOKIE_KEY), iv);
  let enc = cipher.update(text, 'utf8', 'hex'); enc += cipher.final('hex');
  return iv.toString('hex') + ':' + cipher.getAuthTag().toString('hex') + ':' + enc;
}
function decrypt(text) {
  if (!text) return '';
  try {
    const p = text.split(':'); if (p.length !== 3) return text;
    const d = crypto.createDecipheriv('aes-256-gcm', Buffer.from(COOKIE_KEY), Buffer.from(p[0], 'hex'));
    d.setAuthTag(Buffer.from(p[1], 'hex'));
    return d.update(p[2], 'hex', 'utf8') + d.final('utf8');
  } catch { return text; }
}

// Health
app.get('/api/v1/health', (_, res) => ok({ status: 'ok', uptime: process.uptime() })(_, res));

// Auth
app.post('/api/v1/auth/register', (req, res) => {
  const { email, password, name } = req.body;
  if (!email || !password || !name) return fail(res, 400, '必填');
  if (db.users.byEmail(email)) return fail(res, 409, '已注册');
  const user = { id: uuid(), email, password: bcrypt.hashSync(password, 10), name, role: 'OWNER', created_at: new Date().toISOString() };
  db.users.insert(user);
  const token = signToken(user);
  res.status(201).json({ code: 0, message: 'success', data: { accessToken: token, refreshToken: token, user: { id: user.id, email, name, role: 'OWNER' } } });
});

app.post('/api/v1/auth/login', (req, res) => {
  const { email, password } = req.body;
  const user = db.users.byEmail(email);
  if (!user || !bcrypt.compareSync(password, user.password)) return fail(res, 401, '邮箱或密码错误');
  ok({ accessToken: signToken(user), refreshToken: signToken(user), user: { id: user.id, email: user.email, name: user.name, role: user.role } })(_, res);
});

app.post('/api/v1/auth/refresh', (req, res) => {
  try {
    const p = jwt.verify(req.body.refreshToken || '', JWT_SECRET);
    const u = db.users.get(p.sub);
    if (!u) return fail(res, 401, '无效');
    ok({ accessToken: signToken(u), refreshToken: signToken(u) })(_, res);
  } catch { fail(res, 401, '无效'); }
});

app.post('/api/v1/auth/logout', (_, res) => ok({ success: true })(_, res));

app.get('/api/v1/auth/me', (req, res) => {
  const u = db.users.get(req.userId);
  u ? ok({ id: u.id, email: u.email, name: u.name, role: u.role, created_at: u.created_at })(_, res) : fail(res, 404, '不存在');
});

app.post('/api/v1/auth/profile', (req, res) => {
  db.users.update(req.userId, { name: req.body.name || undefined });
  const u = db.users.get(req.userId);
  ok({ id: u.id, email: u.email, name: u.name, role: u.role })(_, res);
});

// Accounts
app.get('/api/v1/accounts', (req, res) => {
  ok({ accounts: db.accounts.all(req.userId).map(a => ({ ...a, hasCookies: !!a.cookies, cookies: undefined })) })(_, res);
});

app.post('/api/v1/accounts', (req, res) => {
  const { platform, platformUserId, nickname, cookies } = req.body;
  const a = { id: uuid(), platform, platform_user_id: platformUserId, nickname: nickname || '', cookies: cookies ? encrypt(cookies) : null, user_id: req.userId, group_id: null, created_at: new Date().toISOString() };
  db.accounts.insert(a);
  res.status(201).json({ code: 0, message: 'success', data: { ...a, hasCookies: !!a.cookies, cookies: undefined } });
});

app.get('/api/v1/accounts/:id', (req, res) => {
  const a = db.accounts.get(req.params.id, req.userId);
  a ? ok({ ...a, hasCookies: !!a.cookies, cookies: undefined })(_, res) : fail(res, 404, '不存在');
});

app.get('/api/v1/accounts/:id/cookies', (req, res) => {
  const a = db.accounts.get(req.params.id, req.userId);
  a ? ok({ cookies: decrypt(a.cookies) })(_, res) : fail(res, 404, '不存在');
});

// Account Groups
app.get('/api/v1/account-groups', (req, res) => ok(db.groups.all(req.userId))(_, res));
app.post('/api/v1/account-groups', (req, res) => {
  const g = { id: uuid(), name: req.body.name, user_id: req.userId, created_at: new Date().toISOString() };
  db.groups.insert(g);
  res.status(201).json({ code: 0, message: 'success', data: g });
});

// Content
app.get('/api/v1/content', (req, res) => {
  const posts = db.posts.all(req.userId).map(p => {
    const a = db.accounts.get(p.account_id, req.userId);
    return { ...p, platform: a?.platform, account_nickname: a?.nickname };
  });
  ok({ posts })(_, res);
});

app.post('/api/v1/content', (req, res) => {
  const p = { id: uuid(), title: req.body.title || '', content: req.body.content || '', status: req.body.publishAt ? 'SCHEDULED' : 'DRAFT', account_id: req.body.accountId, publish_at: req.body.publishAt || null, platform_url: null, error_msg: null, created_at: new Date().toISOString() };
  db.posts.insert(p);
  res.status(201).json({ code: 0, message: 'success', data: p });
});

app.get('/api/v1/content/scheduled', (req, res) => {
  ok({ posts: db.posts.all(req.userId).filter(p => p.status === 'SCHEDULED') })(_, res);
});

app.post('/api/v1/content/batch-publish', (req, res) => {
  const { title, content, accountIds } = req.body;
  const posts = accountIds.map(aid => {
    const p = { id: uuid(), title: title || '', content: content || '', status: 'PUBLISHING', account_id: aid, publish_at: null, platform_url: null, error_msg: null, created_at: new Date().toISOString() };
    db.posts.insert(p);
    return p;
  });
  res.status(201).json({ code: 0, message: 'success', data: { success: true, count: posts.length, posts } });
});

// Analytics
app.get('/api/v1/analytics/overview', (req, res) => {
  const accs = db.accounts.all(req.userId);
  ok({ accounts: { total: accs.length, totalFollowers: 0, byPlatform: {} }, posts: { total: db.posts.all(req.userId).length }, engagement: { totalLikes: 0, totalComments: 0, totalShares: 0 } })(_, res);
});

app.get('/api/v1/analytics/platforms', (req, res) => {
  const accs = db.accounts.all(req.userId);
  const map = {};
  accs.forEach(a => { if (!map[a.platform]) map[a.platform] = { platform: a.platform, accounts: 0, followers: 0, likes: 0, publishes: 0, engagementRate: 0 }; map[a.platform].accounts++; });
  ok(Object.values(map)) (_, res);
});

app.get('/api/v1/analytics/report', (_, res) => ok({ period: {}, data: [] })(_, res));
app.get('/api/v1/analytics/comparison', (_, res) => ok({})(_, res));
app.get('/api/v1/analytics/views-ranking', (_, res) => ok({ ranking: [] })(_, res));
app.get('/api/v1/analytics/daily', (_, res) => ok({ data: [] })(_, res));
app.get('/api/v1/analytics/posts', (_, res) => ok({ data: [] })(_, res));

// AI
app.get('/api/v1/ai/capabilities', (_, res) => ok({ content: ['video_script','title','tags','caption'], publish: ['best_time','frequency'], trend: ['followers','likes','views','engagement'], anomaly: ['data_anomaly','account_risk'], review: ['content_review','sensitive_words','sentiment'] })(_, res));
app.get('/api/v1/ai/providers', (_, res) => ok(['mock'])(_, res));
app.post('/api/v1/ai/content/generate', (req, res) => ok({ type: req.body.type || 'caption', content: `[Mock AI] Generated for "${req.body.topic || 'unknown'}"`, keywords: (req.body.topic || '').split(' ') })(_, res));
app.post('/api/v1/ai/content/titles', (req, res) => ok(Array.from({ length: Math.min(req.body.count || 5, 10) }, (_, i) => `${i + 1}. ${req.body.topic || '内容'}优化标题 #${i + 1}`))(_, res));
app.post('/api/v1/ai/content/tags', (req, res) => ok([req.body.topic || '内容', '创作', '运营', '技巧'])(_, res));
app.post('/api/v1/ai/publish/best-time', (_, res) => ok({ times: [{ time:'19:00-21:00', score:95 }], frequency:'每天1-2条' })(_, res));
app.post('/api/v1/ai/trend/predict', (req, res) => ok({ prediction: Array.from({ length: req.body.days || 7 }, (_, i) => ({ day: i + 1, value: 5000 })), current: 5000 })(_, res));
app.post('/api/v1/ai/anomaly/detect', (_, res) => ok({ anomalies: [], riskScore: 0 })(_, res));
app.post('/api/v1/ai/review', (_, res) => ok({ passed: true, issues: [] })(_, res));

// Platforms
app.get('/api/v1/platforms', (_, res) => ok(db.platforms())(_, res));

// Competitors
app.get('/api/v1/competitors', (req, res) => ok({ competitors: db.competitors.all(req.userId) })(_, res));
app.post('/api/v1/competitors', (req, res) => {
  const c = { id: uuid(), platform: req.body.platform, platform_user_id: req.body.platformUserId, nickname: req.body.nickname || '', note: req.body.note || '', user_id: req.userId, created_at: new Date().toISOString() };
  db.competitors.insert(c);
  res.status(201).json({ code: 0, message: 'success', data: c });
});
app.get('/api/v1/competitors/:id', (req, res) => {
  const c = db.competitors.get(req.params.id, req.userId);
  c ? ok(c)(_, res) : fail(res, 404, '不存在');
});

// Notifications
app.get('/api/v1/notifications', (req, res) => ok(db.notifications.all(req.userId))(_, res));

// Content Review
app.post('/api/v1/content-review/review', (_, res) => ok({ passed: true, issues: [], score: 100 })(_, res));
app.post('/api/v1/content-review/quick-check', (_, res) => ok({ safe: true, sensitiveWords: [] })(_, res));

// Start — listen on 0.0.0.0 so Docker/Tunnel can reach
app.listen(PORT, '0.0.0.0', () => console.log(`MatrixFlow running on port ${PORT}`));