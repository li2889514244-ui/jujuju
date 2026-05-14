const fs = require('fs');
const path = require('path');

const DB_PATH = process.env.DB_PATH || path.join(__dirname, '..', 'data', 'db.json');

function read() {
  try { return JSON.parse(fs.readFileSync(DB_PATH, 'utf8')); }
  catch { return { users: [], accounts: [], posts: [], groups: [], competitors: [], notifications: [] }; }
}

function write(data) {
  fs.mkdirSync(path.dirname(DB_PATH), { recursive: true });
  fs.writeFileSync(DB_PATH, JSON.stringify(data, null, 2));
}

let cache = read();

function save() { write(cache); }

// Prevent the module-level `read` from being re-read every time
// Direct exports
module.exports = {
  get cache() { return cache; },
  save,
  users: {
    all: () => [...cache.users],
    get: (id) => cache.users.find(u => u.id === id),
    byEmail: (email) => cache.users.find(u => u.email === email),
    insert: (user) => { cache.users.push(user); save(); return user; },
    update: (id, data) => { const u = cache.users.find(u => u.id === id); if (u) Object.assign(u, data); save(); return u; },
  },
  accounts: {
    all: (userId) => cache.accounts.filter(a => a.user_id === userId),
    get: (id, userId) => cache.accounts.find(a => a.id === id && a.user_id === userId),
    insert: (acct) => { cache.accounts.push(acct); save(); return acct; },
  },
  posts: {
    all: (userId) => {
      const ids = cache.accounts.filter(a => a.user_id === userId).map(a => a.id);
      return cache.posts.filter(p => ids.includes(p.account_id));
    },
    get: (id) => cache.posts.find(p => p.id === id),
    insert: (post) => { cache.posts.push(post); save(); return post; },
  },
  groups: {
    all: (userId) => cache.groups.filter(g => g.user_id === userId),
    insert: (g) => { cache.groups.push(g); save(); return g; },
  },
  competitors: {
    all: (userId) => cache.competitors.filter(c => c.user_id === userId),
    get: (id, userId) => cache.competitors.find(c => c.id === id && c.user_id === userId),
    insert: (c) => { cache.competitors.push(c); save(); return c; },
  },
  notifications: {
    all: (userId) => cache.notifications.filter(n => n.user_id === userId).slice(0, 50),
    insert: (n) => { cache.notifications.push(n); save(); return n; },
  },
  platforms: () => [
    { key: 'douyin', name: '抖音', color: '#000000', enabled: true },
    { key: 'kuaishou', name: '快手', color: '#FF4906', enabled: true },
    { key: 'xiaohongshu', name: '小红书', color: '#FF2442', enabled: true },
    { key: 'bilibili', name: 'B站', color: '#FB7299', enabled: true },
    { key: 'wechat_video', name: '视频号', color: '#07C160', enabled: true },
    { key: 'weibo', name: '微博', color: '#FF8200', enabled: true },
  ],
};
